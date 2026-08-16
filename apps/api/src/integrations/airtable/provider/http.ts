import type { AirtableProvider, AirtableProviderIdentity } from "../control/service";
import type {
  AirtableWebhookFieldChange,
  AirtableWebhookPayloadPage,
  AirtableWebhookPayloadProvider,
} from "../inbound/cursor-worker";
import type { AirtableOAuthProvider, AirtableOAuthTokenResponse } from "../oauth/service";

export interface AirtableHttpProviderOptions {
  clientId: string;
  clientSecret?: string;
  fetch?: typeof fetch;
  apiOrigin?: string;
  oauthOrigin?: string;
}

export class AirtableHttpProvider
  implements AirtableOAuthProvider, AirtableProvider, AirtableWebhookPayloadProvider
{
  private readonly fetcher: typeof fetch;
  private readonly apiOrigin: string;
  private readonly oauthOrigin: string;

  constructor(private readonly options: AirtableHttpProviderOptions) {
    this.fetcher = options.fetch ?? fetch;
    this.apiOrigin = (options.apiOrigin ?? "https://api.airtable.com").replace(/\/$/, "");
    this.oauthOrigin = (options.oauthOrigin ?? "https://airtable.com").replace(/\/$/, "");
  }

  authorizationUrl(input: {
    redirectUri: string;
    state: string;
    codeChallenge: string;
    codeChallengeMethod: "S256";
    scopes: readonly string[];
  }): string {
    const url = new URL("/oauth2/v1/authorize", this.oauthOrigin);
    url.searchParams.set("client_id", this.options.clientId);
    url.searchParams.set("redirect_uri", input.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", input.state);
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("code_challenge_method", input.codeChallengeMethod);
    url.searchParams.set("scope", input.scopes.join(" "));
    return url.toString();
  }

  exchangeAuthorizationCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<AirtableOAuthTokenResponse> {
    return this.tokenRequest({
      grant_type: "authorization_code",
      code: input.code,
      code_verifier: input.codeVerifier,
      redirect_uri: input.redirectUri,
    });
  }

  refreshAccessToken(input: { refreshToken: string }): Promise<AirtableOAuthTokenResponse> {
    return this.tokenRequest({
      grant_type: "refresh_token",
      refresh_token: input.refreshToken,
    });
  }

  async inspectCredential(input: {
    authMode: "oauth" | "pat";
    credential: string;
  }): Promise<AirtableProviderIdentity> {
    const response = await this.request("/v0/meta/whoami", input.credential);
    const body = (await response.json()) as {
      id?: string;
      userId?: string;
      scopes?: string[];
    };
    return {
      userId: body.userId ?? body.id ?? null,
      accountId: body.id ?? null,
      scopes: body.scopes ?? [],
    };
  }

  async fetchPage(input: {
    baseId?: string;
    credentialReference?: string;
    authMode?: "oauth" | "pat";
    providerWebhookId: string;
    cursor: string;
  }): Promise<AirtableWebhookPayloadPage> {
    if (input.baseId === undefined || input.credentialReference === undefined) {
      throw new Error("Airtable webhook payload requests require base and credential context.");
    }
    const path = `/v0/bases/${encodeURIComponent(input.baseId)}/webhooks/${encodeURIComponent(input.providerWebhookId)}/payloads?cursor=${encodeURIComponent(input.cursor)}`;
    const response = await this.request(path, input.credentialReference);
    const body = (await response.json()) as {
      cursor?: number | string;
      mightHaveMore?: boolean;
      payloads?: Array<{
        baseTransactionNumber?: number;
        changedTablesById?: Record<
          string,
          {
            changedRecordsById?: Record<
              string,
              { current?: { cellValuesByFieldId?: Record<string, unknown> } }
            >;
          }
        >;
      }>;
    };
    const changes: AirtableWebhookFieldChange[] = [];
    for (const payload of body.payloads ?? []) {
      for (const [tableId, table] of Object.entries(payload.changedTablesById ?? {})) {
        for (const [recordId, record] of Object.entries(table.changedRecordsById ?? {})) {
          for (const [fieldId, value] of Object.entries(
            record.current?.cellValuesByFieldId ?? {},
          )) {
            const sourceValueJson = JSON.stringify(value);
            changes.push({
              baseTransactionNumber: payload.baseTransactionNumber ?? 0,
              tableId,
              recordId,
              fieldId,
              entityType: null,
              applicationId: null,
              sourceValueJson,
              sourceHash: sourceValueJson,
            });
          }
        }
      }
    }
    return {
      kind: "page",
      nextCursor: String(body.cursor ?? input.cursor),
      mightHaveMore: body.mightHaveMore === true,
      changes,
    };
  }

  async getBaseSchema(input: { authMode: "oauth" | "pat"; credential: string; baseId: string }) {
    const [baseResponse, schemaResponse] = await Promise.all([
      this.request("/v0/meta/bases", input.credential),
      this.request(`/v0/meta/bases/${encodeURIComponent(input.baseId)}/tables`, input.credential),
    ]);
    const bases = (await baseResponse.json()) as { bases?: Array<{ id: string; name: string }> };
    const schema = (await schemaResponse.json()) as {
      tables?: Array<{
        id: string;
        name: string;
        fields?: Array<{ id: string; name: string; type: string }>;
      }>;
    };
    return {
      id: input.baseId,
      name: bases.bases?.find((base) => base.id === input.baseId)?.name ?? input.baseId,
      tables: (schema.tables ?? []).map((table) => ({
        id: table.id,
        name: table.name,
        fields: table.fields ?? [],
      })),
    };
  }

  async revokeCredential(input: { authMode: "oauth" | "pat"; credential: string }): Promise<void> {
    if (input.authMode === "pat") return;
    const response = await this.fetcher(new URL("/oauth2/v1/revoke", this.oauthOrigin), {
      method: "POST",
      headers: this.oauthHeaders(),
      body: new URLSearchParams({ token: input.credential }),
    });
    if (!response.ok)
      throw new Error(`Airtable credential revocation failed (${response.status}).`);
  }

  private async tokenRequest(fields: Record<string, string>): Promise<AirtableOAuthTokenResponse> {
    const response = await this.fetcher(new URL("/oauth2/v1/token", this.oauthOrigin), {
      method: "POST",
      headers: this.oauthHeaders(),
      body: new URLSearchParams(fields),
    });
    if (!response.ok) throw new Error(`Airtable OAuth token request failed (${response.status}).`);
    const body = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      refresh_expires_in?: number;
      token_type?: string;
      scope?: string;
    };
    return {
      accessToken: body.access_token,
      ...(body.refresh_token === undefined ? {} : { refreshToken: body.refresh_token }),
      accessTokenExpiresInSeconds: body.expires_in,
      ...(body.refresh_expires_in === undefined
        ? {}
        : { refreshTokenExpiresInSeconds: body.refresh_expires_in }),
      grantedScopes: body.scope?.split(" ").filter(Boolean) ?? [],
    };
  }

  private oauthHeaders(): Headers {
    const headers = new Headers({ "content-type": "application/x-www-form-urlencoded" });
    if (this.options.clientSecret !== undefined) {
      headers.set(
        "authorization",
        `Basic ${btoa(`${this.options.clientId}:${this.options.clientSecret}`)}`,
      );
    }
    return headers;
  }

  private async request(path: string, credential: string): Promise<Response> {
    const response = await this.fetcher(`${this.apiOrigin}${path}`, {
      headers: { authorization: `Bearer ${credential}` },
    });
    if (!response.ok) throw new Error(`Airtable API request failed (${response.status}).`);
    return response;
  }
}
