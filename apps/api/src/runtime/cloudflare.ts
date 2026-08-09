import type { ApiBindings, ApiDependencies } from "../app";
import { RequestAuthenticator } from "../features/auth/authenticator";
import {
  AuthConfigurationError,
  createBetterAuthRuntimeConfiguration,
} from "../features/auth/configuration";
import { createBetterAuthRuntime, createOpenSendMagicLinkMessage } from "../features/auth/runtime";
import type {
  ApiKeyScope,
  AuthSession,
  BetterAuthGateway,
  D1ApiKeyGateway,
  OrganizationMembership,
  SpeakerGrant,
  StoredApiKey,
} from "../features/auth/types";
import { apiKeyScopes, organizationRoles } from "../features/auth/types";
import type { AirtableTransport } from "../infrastructure/airtable";
import { FetchAirtableTransport, RetryingAirtableTransport } from "../infrastructure/airtable";
import {
  type CloudflareBindings,
  inspectCloudflareBindings,
} from "../infrastructure/cloudflare/bindings";
import { OpenSendClient } from "../integrations/opensend/client";
import { createAirtableDependencies } from "./airtable";

export type RuntimeBindings = ApiBindings &
  Partial<Omit<CloudflareBindings, keyof ApiBindings>> & {
    readonly API_ORIGIN?: string;
    readonly AIRTABLE_ACCESS_TOKEN?: string;
    readonly AIRTABLE_BASE_ID?: string;
    readonly BETTER_AUTH_SECRET?: string;
    readonly GOOGLE_CLIENT_ID?: string;
    readonly GOOGLE_CLIENT_SECRET?: string;
    readonly OPENSEND_API_KEY?: string;
    readonly OPENSEND_SENDING_API_KEY?: string;
    readonly OPENSEND_API_URL?: string;
    readonly AUTH_FROM_EMAIL?: string;
    readonly AIRTABLE_API_ORIGIN?: string;
    readonly AIRTABLE_TRANSPORT?: AirtableTransport;
  };

export interface RuntimeConfigurationInspection {
  readonly success: boolean;
  readonly issues: readonly string[];
}

interface SessionRow {
  readonly session_id: string;
  readonly user_id: string;
  readonly email: string;
  readonly email_verified: number;
  readonly expires_at: string;
}

interface MembershipRow {
  readonly organization_id: string;
  readonly role: string;
}

interface SpeakerGrantRow {
  readonly organization_id: string;
  readonly speaker_profile_id: string;
}

interface ApiKeyRow {
  readonly id: string;
  readonly organization_id: string;
  readonly label: string;
  readonly scopes_json: string;
  readonly expires_at: string | null;
  readonly revoked_at: string | null;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function membershipsFrom(rows: readonly MembershipRow[]): OrganizationMembership[] {
  const roles = new Set<string>(organizationRoles);
  return rows.flatMap((row) =>
    nonEmpty(row.organization_id) && roles.has(row.role)
      ? [
          {
            organizationId: row.organization_id,
            role: row.role as OrganizationMembership["role"],
          },
        ]
      : [],
  );
}

function speakerGrantsFrom(rows: readonly SpeakerGrantRow[]): SpeakerGrant[] {
  return rows.flatMap((row) =>
    nonEmpty(row.organization_id) && nonEmpty(row.speaker_profile_id)
      ? [
          {
            organizationId: row.organization_id,
            speakerProfileId: row.speaker_profile_id,
          },
        ]
      : [],
  );
}

type MagicLinkOperations = Pick<BetterAuthGateway, "requestMagicLink" | "consumeMagicLink">;

const unavailableMagicLinks: MagicLinkOperations = {
  async requestMagicLink() {
    throw new AuthConfigurationError("OpenSend magic-link delivery is not configured.");
  },
  async consumeMagicLink() {
    return null;
  },
};

export class D1BetterAuthGateway implements BetterAuthGateway {
  readonly #magicLinks: MagicLinkOperations;

  constructor(
    private readonly database: D1Database,
    magicLinks: MagicLinkOperations = unavailableMagicLinks,
  ) {
    this.#magicLinks = magicLinks;
  }

  async resolveSession(sessionToken: string): Promise<AuthSession | null> {
    const tokenDigest = await sha256(sessionToken);
    const row = await this.database
      .prepare(
        `SELECT sessions.id AS session_id,
                sessions.user_id AS user_id,
                users.email AS email,
                users.email_verified AS email_verified,
                sessions.expires_at AS expires_at
           FROM auth_sessions AS sessions
           JOIN auth_users AS users ON users.id = sessions.user_id
          WHERE sessions.token_digest = ?
          LIMIT 1`,
      )
      .bind(tokenDigest)
      .first<SessionRow>();
    if (row === null) return null;
    const expiresAt = validDate(row.expires_at);
    if (expiresAt === null || !nonEmpty(row.session_id) || !nonEmpty(row.user_id)) return null;

    const [membershipResult, speakerGrantResult] = await Promise.all([
      this.database
        .prepare(
          `SELECT organization_id, role
             FROM organization_memberships
            WHERE user_id = ?
            ORDER BY organization_id`,
        )
        .bind(row.user_id)
        .all<MembershipRow>(),
      this.database
        .prepare(
          `SELECT organization_id, speaker_profile_id
             FROM speaker_grants
            WHERE user_id = ? AND revoked_at IS NULL
            ORDER BY organization_id, speaker_profile_id`,
        )
        .bind(row.user_id)
        .all<SpeakerGrantRow>(),
    ]);

    return {
      sessionId: row.session_id,
      userId: row.user_id,
      email: row.email,
      emailVerified: row.email_verified === 1,
      expiresAt,
      memberships: membershipsFrom(membershipResult.results),
      speakerGrants: speakerGrantsFrom(speakerGrantResult.results),
    };
  }

  async requestMagicLink(input: { email: string; callbackUrl: string }): Promise<void> {
    await this.#magicLinks.requestMagicLink(input);
  }

  async consumeMagicLink(token: string): Promise<AuthSession | null> {
    return this.#magicLinks.consumeMagicLink(token);
  }
}

function scopesFrom(value: string): ApiKeyScope[] | null {
  let candidate: unknown;
  try {
    candidate = JSON.parse(value);
  } catch {
    return null;
  }
  if (!Array.isArray(candidate)) return null;
  const validScopes = new Set<string>(apiKeyScopes);
  if (!candidate.every((scope) => typeof scope === "string" && validScopes.has(scope))) return null;
  return [...new Set(candidate)] as ApiKeyScope[];
}

export class D1ApiKeyAuthenticatorGateway implements D1ApiKeyGateway {
  constructor(private readonly database: D1Database) {}

  async findByPresentedKey(presentedKey: string): Promise<StoredApiKey | null> {
    const digest = await sha256(presentedKey);
    const row = await this.database
      .prepare(
        `SELECT id, organization_id, label, scopes_json, expires_at, revoked_at
           FROM api_keys
          WHERE key_digest = ?
          LIMIT 1`,
      )
      .bind(digest)
      .first<ApiKeyRow>();
    if (row === null) return null;
    const scopes = scopesFrom(row.scopes_json);
    if (scopes === null || !nonEmpty(row.id) || !nonEmpty(row.organization_id)) return null;
    const expiresAt = row.expires_at === null ? null : validDate(row.expires_at);
    const revokedAt = row.revoked_at === null ? null : validDate(row.revoked_at);
    if (
      (row.expires_at !== null && expiresAt === null) ||
      (row.revoked_at !== null && revokedAt === null)
    ) {
      return null;
    }
    return {
      id: row.id,
      organizationId: row.organization_id,
      label: row.label,
      scopes,
      expiresAt,
      revokedAt,
    };
  }

  async recordSuccessfulUse(apiKeyId: string, usedAt: Date): Promise<void> {
    await this.database
      .prepare("UPDATE api_keys SET last_used_at = ?, updated_at = ? WHERE id = ?")
      .bind(usedAt.toISOString(), usedAt.toISOString(), apiKeyId)
      .run();
  }
}

const fixedOrigins = {
  staging: {
    web: "https://open-sessionboard-web-staging.ashleyha0317.workers.dev",
    api: "https://open-sessionboard-api-staging.ashleyha0317.workers.dev",
  },
  production: {
    web: "https://open-sessionboard-web-production.ashleyha0317.workers.dev",
    api: "https://open-sessionboard-api-production.ashleyha0317.workers.dev",
  },
} as const;

function authEnvironment(value: string): keyof typeof fixedOrigins | null {
  return value === "staging" || value === "production" ? value : null;
}

function configuredApiOrigin(bindings: RuntimeBindings): string | null {
  const environment = authEnvironment(bindings.APP_ENV);
  if (environment === null) return null;
  const expected = fixedOrigins[environment].api;
  return bindings.API_ORIGIN === undefined ? expected : bindings.API_ORIGIN;
}

export function inspectProductionRuntime(
  bindings: RuntimeBindings,
): RuntimeConfigurationInspection {
  const issues: string[] = [];
  const cloudflare = inspectCloudflareBindings(bindings);
  if (!cloudflare.success) issues.push(...cloudflare.issues);

  const environment = authEnvironment(bindings.APP_ENV);
  if (environment !== null) {
    const origins = fixedOrigins[environment];
    if (bindings.WEB_ORIGIN !== origins.web) {
      issues.push("WEB_ORIGIN does not match the fixed deployment origin.");
    }
    if (bindings.API_ORIGIN !== undefined && bindings.API_ORIGIN !== origins.api) {
      issues.push("API_ORIGIN does not match the fixed deployment origin.");
    }
  }

  if (!nonEmpty(bindings.AIRTABLE_ACCESS_TOKEN)) {
    issues.push("AIRTABLE_ACCESS_TOKEN is required outside local development");
  }
  if (!nonEmpty(bindings.AIRTABLE_BASE_ID)) {
    issues.push("AIRTABLE_BASE_ID is required outside local development");
  }
  if (!nonEmpty(bindings.BETTER_AUTH_SECRET) || bindings.BETTER_AUTH_SECRET.trim().length < 32) {
    issues.push("BETTER_AUTH_SECRET must contain at least 32 characters outside local development");
  }

  const googleId = bindings.GOOGLE_CLIENT_ID?.trim();
  const googleSecret = bindings.GOOGLE_CLIENT_SECRET?.trim();
  if (!googleId || !googleSecret) {
    issues.push("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required outside local development");
  }

  const openSendKey = (bindings.OPENSEND_API_KEY ?? bindings.OPENSEND_SENDING_API_KEY)?.trim();
  if (!openSendKey || !nonEmpty(bindings.OPENSEND_API_URL)) {
    issues.push("OPENSEND_API_URL and OPENSEND_API_KEY are required outside local development");
  }

  const apiOrigin = configuredApiOrigin(bindings);
  if (apiOrigin === null || !nonEmpty(bindings.WEB_ORIGIN)) {
    issues.push("Better Auth web and API origins are required outside local development");
  } else {
    try {
      createBetterAuthRuntimeConfiguration({
        secret: bindings.BETTER_AUTH_SECRET ?? "",
        baseUrl: apiOrigin,
        trustedOrigins: [bindings.WEB_ORIGIN],
        google: { clientId: googleId ?? "", clientSecret: googleSecret ?? "" },
      });
    } catch (error) {
      if (error instanceof AuthConfigurationError) {
        issues.push("Better Auth configuration is invalid.");
      } else {
        issues.push("Better Auth configuration could not be initialized.");
      }
    }
  }
  return { success: issues.length === 0, issues };
}

export function createCloudflareDependencies(bindings: RuntimeBindings): ApiDependencies {
  const inspection = inspectProductionRuntime(bindings);
  if (!inspection.success) {
    throw new TypeError("The production runtime is not configured.");
  }
  if (bindings.DB === undefined) {
    throw new TypeError("The D1 binding is required for Cloudflare authentication.");
  }
  if (bindings.AGENDA_COORDINATOR === undefined) {
    throw new TypeError("The agenda coordinator binding is required outside local development.");
  }
  if (bindings.PRIVATE_FILES === undefined) {
    throw new TypeError("The private files binding is required outside local development.");
  }
  if (bindings.OUTBOX_QUEUE === undefined) {
    throw new TypeError("The outbox queue binding is required outside local development.");
  }

  const authEnvironmentValue = authEnvironment(bindings.APP_ENV);
  const apiOrigin = configuredApiOrigin(bindings);
  const googleId = bindings.GOOGLE_CLIENT_ID?.trim();
  const googleSecret = bindings.GOOGLE_CLIENT_SECRET?.trim();
  const openSendKey = (bindings.OPENSEND_API_KEY ?? bindings.OPENSEND_SENDING_API_KEY)?.trim();
  if (
    authEnvironmentValue === null ||
    apiOrigin === null ||
    !nonEmpty(googleId) ||
    !nonEmpty(googleSecret) ||
    !nonEmpty(openSendKey) ||
    !nonEmpty(bindings.OPENSEND_API_URL)
  ) {
    throw new TypeError("The production authentication runtime is not configured.");
  }

  const authConfiguration = createBetterAuthRuntimeConfiguration({
    secret: bindings.BETTER_AUTH_SECRET ?? "",
    baseUrl: apiOrigin,
    trustedOrigins: [bindings.WEB_ORIGIN],
    google: { clientId: googleId, clientSecret: googleSecret },
  });
  const openSend = new OpenSendClient({
    sendingApiKey: openSendKey,
    baseUrl: bindings.OPENSEND_API_URL,
    ...(nonEmpty(bindings.AUTH_FROM_EMAIL)
      ? { senderAddresses: { auth: bindings.AUTH_FROM_EMAIL } }
      : {}),
  });
  const betterAuthRuntime = createBetterAuthRuntime({
    database: bindings.DB,
    configuration: authConfiguration,
    environment: authEnvironmentValue,
    sendMagicLink: async (input) => {
      await openSend.send(
        createOpenSendMagicLinkMessage({
          email: input.email,
          url: input.url,
          sender: openSend.senderFor("auth"),
        }),
      );
    },
  });

  const authenticator = new RequestAuthenticator(
    new D1BetterAuthGateway(bindings.DB, betterAuthRuntime),
    new D1ApiKeyAuthenticatorGateway(bindings.DB),
    { sessionCookieName: "__Secure-better-auth.session_token" },
  );
  const transport =
    bindings.AIRTABLE_TRANSPORT ??
    new RetryingAirtableTransport(
      new FetchAirtableTransport({
        token: bindings.AIRTABLE_ACCESS_TOKEN ?? "",
        ...(bindings.AIRTABLE_API_ORIGIN === undefined
          ? {}
          : { apiOrigin: bindings.AIRTABLE_API_ORIGIN }),
      }),
    );
  const dependencies = createAirtableDependencies({
    authenticator,
    baseId: bindings.AIRTABLE_BASE_ID ?? "",
    transport,
    database: bindings.DB,
    agendaCoordinator: bindings.AGENDA_COORDINATOR,
    privateFiles: bindings.PRIVATE_FILES,
    outboxQueue: bindings.OUTBOX_QUEUE,
    webOrigin: bindings.WEB_ORIGIN,
  });
  return { ...dependencies, auth: betterAuthRuntime };
}
