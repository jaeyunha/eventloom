import type { RequestAuthenticator } from "../../../../features/auth/authenticator";
import { requireOrganizationRole } from "../../../../features/auth/authorization";
import { AuthAccessError, type AuthPrincipal } from "../../../../features/auth/types";
import type { AirtableD1Database, AirtableSecretCipher } from "../../d1/adapters";
import {
  D1AirtableOAuthAttemptStore,
  D1AirtableOAuthConnectionStore,
  EncryptedReferenceAirtableOAuthSecretStore,
  EncryptedReferenceAirtableSecretStore,
} from "../../d1/adapters";
import { AirtableHttpProvider } from "../../provider/http";
import {
  type AirtableOAuthAttemptStore,
  type AirtableOAuthCrypto,
  AirtableOAuthError,
  AirtableOAuthService,
  type AirtableOAuthServiceDependencies,
  type BeginAirtableAuthorizationResult,
  type HandleAirtableCallbackResult,
} from "../service";
import {
  type AirtableBaseSelectionResult,
  AirtableBaseSelectionService,
  D1AirtableBaseSelectionStore,
} from "./base-selection";
import {
  AuthModeAwareAirtableCredentialResolver,
  type ResolveAirtableCredentialInput,
  type ResolvedAirtableCredential,
} from "./credentials";

const MAX_OAUTH_PARAMETER_LENGTH = 2_000;

export const DEFAULT_AIRTABLE_OAUTH_SCOPES = [
  "data.records:read",
  "data.records:write",
  "schema.bases:read",
  "webhook:manage",
] as const;

type OAuthOperations = Pick<AirtableOAuthService, "beginAuthorization" | "handleCallback">;
type BaseSelectionOperations = Pick<AirtableBaseSelectionService, "selectBase">;
type CredentialOperations = Pick<AuthModeAwareAirtableCredentialResolver, "resolve">;

export interface AirtableOAuthRuntimeDependencies {
  readonly authenticator: Pick<RequestAuthenticator, "authenticate">;
  readonly oauth: OAuthOperations;
  readonly attempts: Pick<AirtableOAuthAttemptStore, "findByStateHash">;
  readonly crypto: Pick<AirtableOAuthCrypto, "sha256Base64Url">;
  readonly credentials: CredentialOperations;
  readonly baseSelections: BaseSelectionOperations;
}

export class AirtableOAuthRuntime {
  constructor(private readonly dependencies: AirtableOAuthRuntimeDependencies) {}

  async startAuthenticated(input: {
    readonly request: Request;
    readonly organizationId: string;
    readonly returnPath: string;
  }): Promise<BeginAirtableAuthorizationResult> {
    const principal = await this.dependencies.authenticator.authenticate(input.request);
    if (principal === null) {
      throw new AuthAccessError("UNAUTHENTICATED", "Authentication is required.");
    }
    return this.startForPrincipal({
      principal,
      organizationId: input.organizationId,
      returnPath: input.returnPath,
    });
  }

  async startForPrincipal(input: {
    readonly principal: AuthPrincipal;
    readonly organizationId: string;
    readonly returnPath: string;
  }): Promise<BeginAirtableAuthorizationResult> {
    const principal = requireOrganizationRole(input.principal, input.organizationId, [
      "owner",
      "admin",
    ]);
    return this.dependencies.oauth.beginAuthorization({
      organizationId: input.organizationId,
      initiatingUserId: principal.userId,
      returnPath: input.returnPath,
    });
  }

  async startForUserId(input: {
    readonly userId: string;
    readonly organizationId: string;
    readonly returnPath: string;
  }): Promise<BeginAirtableAuthorizationResult> {
    return this.dependencies.oauth.beginAuthorization({
      organizationId: input.organizationId,
      initiatingUserId: input.userId,
      returnPath: input.returnPath,
    });
  }

  async handlePublicCallback(input: {
    readonly state: string;
    readonly code: string;
  }): Promise<HandleAirtableCallbackResult> {
    const state = callbackParameter(input.state, "state", "invalid_state");
    const code = callbackParameter(input.code, "code", "invalid_request");
    const stateHash = await this.dependencies.crypto.sha256Base64Url(state);
    const attempt = await this.dependencies.attempts.findByStateHash(stateHash);
    if (attempt === null) {
      throw new AirtableOAuthError("invalid_state", "The OAuth state is invalid.");
    }

    return this.dependencies.oauth.handleCallback({
      organizationId: attempt.organizationId,
      userId: attempt.initiatingUserId,
      state,
      code,
    });
  }

  resolveCredential(input: ResolveAirtableCredentialInput): Promise<ResolvedAirtableCredential> {
    return this.dependencies.credentials.resolve(input);
  }

  async selectBaseAuthenticated(input: {
    readonly request: Request;
    readonly organizationId: string;
    readonly connectionId: string;
    readonly baseId: string;
  }): Promise<AirtableBaseSelectionResult> {
    const principal = await this.dependencies.authenticator.authenticate(input.request);
    if (principal === null) {
      throw new AuthAccessError("UNAUTHENTICATED", "Authentication is required.");
    }
    requireOrganizationRole(principal, input.organizationId, ["owner", "admin"]);
    return this.dependencies.baseSelections.selectBase({
      organizationId: input.organizationId,
      connectionId: input.connectionId,
      baseId: input.baseId,
    });
  }

  selectBase(input: {
    readonly organizationId: string;
    readonly connectionId: string;
    readonly baseId: string;
  }): Promise<AirtableBaseSelectionResult> {
    return this.dependencies.baseSelections.selectBase(input);
  }
}

export interface CreateAirtableOAuthRuntimeInput {
  readonly database: AirtableD1Database;
  readonly authenticator: Pick<RequestAuthenticator, "authenticate">;
  readonly clientId: string;
  readonly clientSecret?: string;
  readonly cipher: AirtableSecretCipher;
  readonly redirectUri: string;
  readonly scopes?: readonly string[];
  readonly workerId?: string;
  readonly fetch?: typeof fetch;
  readonly apiOrigin?: string;
  readonly oauthOrigin?: string;
  readonly crypto?: AirtableOAuthCrypto;
  readonly now?: () => Date;
  readonly attemptTtlMs?: number;
  readonly exchangeLeaseMs?: number;
  readonly refreshLeaseMs?: number;
}

export function createAirtableOAuthRuntime(
  input: CreateAirtableOAuthRuntimeInput,
): AirtableOAuthRuntime {
  const attempts = new D1AirtableOAuthAttemptStore(input.database);
  const oauthSecrets = new EncryptedReferenceAirtableOAuthSecretStore(input.cipher);
  const patSecrets = new EncryptedReferenceAirtableSecretStore(input.cipher);
  const provider = new AirtableHttpProvider({
    clientId: input.clientId,
    ...(input.clientSecret === undefined ? {} : { clientSecret: input.clientSecret }),
    ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
    ...(input.apiOrigin === undefined ? {} : { apiOrigin: input.apiOrigin }),
    ...(input.oauthOrigin === undefined ? {} : { oauthOrigin: input.oauthOrigin }),
  });
  const oauthCrypto = input.crypto ?? createWebAirtableOAuthCrypto(input.cipher);
  const scopes = input.scopes ?? DEFAULT_AIRTABLE_OAUTH_SCOPES;
  const oauthDependencies: AirtableOAuthServiceDependencies = {
    attempts,
    connections: new D1AirtableOAuthConnectionStore(input.database),
    secrets: oauthSecrets,
    provider,
    crypto: oauthCrypto,
    redirectUri: input.redirectUri,
    scopes,
    workerId: input.workerId ?? `airtable_oauth_worker_${crypto.randomUUID()}`,
    ...(input.now === undefined ? {} : { now: input.now }),
    ...(input.attemptTtlMs === undefined ? {} : { attemptTtlMs: input.attemptTtlMs }),
    ...(input.exchangeLeaseMs === undefined ? {} : { exchangeLeaseMs: input.exchangeLeaseMs }),
    ...(input.refreshLeaseMs === undefined ? {} : { refreshLeaseMs: input.refreshLeaseMs }),
  };
  const credentials = new AuthModeAwareAirtableCredentialResolver({
    patSecrets,
    oauthSecrets,
  });
  const baseSelections = new AirtableBaseSelectionService({
    store: new D1AirtableBaseSelectionStore(input.database),
    credentials,
    provider,
    requiredScopes: scopes,
    ...(input.now === undefined ? {} : { now: input.now }),
  });

  return new AirtableOAuthRuntime({
    authenticator: input.authenticator,
    oauth: new AirtableOAuthService(oauthDependencies),
    attempts,
    crypto: oauthCrypto,
    credentials,
    baseSelections,
  });
}

export function createWebAirtableOAuthCrypto(cipher: AirtableSecretCipher): AirtableOAuthCrypto {
  return {
    randomId: (prefix) => `${prefix}_${crypto.randomUUID()}`,
    randomUrlSafe: (byteLength) => {
      const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
      return encodeBase64Url(bytes);
    },
    sha256Base64Url: async (value) => {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
      return encodeBase64Url(new Uint8Array(digest));
    },
    encrypt: (value) => cipher.encrypt(value),
    decrypt: (value) => cipher.decrypt(value),
  };
}

function callbackParameter(
  value: string,
  label: "state" | "code",
  errorCode: "invalid_state" | "invalid_request",
): string {
  if (value.length === 0 || value.length > MAX_OAUTH_PARAMETER_LENGTH) {
    throw new AirtableOAuthError(errorCode, `The OAuth ${label} is invalid.`);
  }
  return value;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
