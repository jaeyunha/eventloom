export const organizationRoles = ["owner", "admin", "reviewer"] as const;

export type OrganizationRole = (typeof organizationRoles)[number];

export const apiKeyScopes = [
  "events:read",
  "events:write",
  "submissions:read",
  "submissions:write",
  "agenda:read",
  "agenda:write",
  "webhooks:read",
  "webhooks:write",
] as const;

export type ApiKeyScope = (typeof apiKeyScopes)[number];

export interface OrganizationMembership {
  organizationId: string;
  role: OrganizationRole;
}

export interface SpeakerGrant {
  organizationId: string;
  speakerProfileId: string;
}

export interface ReviewerGrant {
  organizationId: string;
  eventId: string;
}

export interface AuthSession {
  sessionId: string;
  userId: string;
  email: string;
  emailVerified: boolean;
  expiresAt: Date;
  memberships: readonly OrganizationMembership[];
  reviewerGrants: readonly ReviewerGrant[];
  speakerGrants: readonly SpeakerGrant[];
}

export interface StoredApiKey {
  id: string;
  organizationId: string;
  label: string;
  scopes: readonly ApiKeyScope[];
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export interface UserPrincipal {
  kind: "user";
  sessionId: string;
  userId: string;
  email: string;
  memberships: readonly OrganizationMembership[];
  reviewerGrants: readonly ReviewerGrant[];
  speakerGrants: readonly SpeakerGrant[];
}

export interface ApiKeyPrincipal {
  kind: "apiKey";
  apiKeyId: string;
  organizationId: string;
  scopes: readonly ApiKeyScope[];
}

export type AuthPrincipal = UserPrincipal | ApiKeyPrincipal;

export interface BetterAuthGateway {
  resolveSession(sessionToken: string): Promise<AuthSession | null>;
  requestMagicLink(input: { email: string; callbackUrl: string }): Promise<void>;
  consumeMagicLink(token: string): Promise<AuthSession | null>;
}

/**
 * D1 owns API-key records. Implementations must compare a one-way digest of the
 * presented value and must never persist or log the presented key.
 */
export interface D1ApiKeyGateway {
  findByPresentedKey(presentedKey: string): Promise<StoredApiKey | null>;
  recordSuccessfulUse(apiKeyId: string, usedAt: Date): Promise<void>;
}

export interface AuthClock {
  now(): Date;
}

export type AuthAccessErrorCode = "UNAUTHENTICATED" | "FORBIDDEN";

export class AuthAccessError extends Error {
  readonly code: AuthAccessErrorCode;
  readonly status: 401 | 403;

  constructor(code: AuthAccessErrorCode, message: string) {
    super(message);
    this.name = "AuthAccessError";
    this.code = code;
    this.status = code === "UNAUTHENTICATED" ? 401 : 403;
  }
}
