import { authDisplayName } from "./display-name";
import {
  AuthAccessError,
  type AuthClock,
  type AuthPrincipal,
  type BetterAuthGateway,
  type D1ApiKeyGateway,
} from "./types";

const systemClock: AuthClock = {
  now: () => new Date(),
};

export interface RequestAuthenticatorOptions {
  sessionCookieName?: string;
  clock?: AuthClock;
}

function readCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1 || part.slice(0, separator).trim() !== name) {
      continue;
    }

    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value) || null;
    } catch {
      throw new AuthAccessError("UNAUTHENTICATED", "The session credential is invalid.");
    }
  }
  return null;
}
function sessionTokenValue(cookieValue: string): string {
  const segments = cookieValue.split(".");
  if (segments.length > 2 || !segments[0]) {
    throw new AuthAccessError("UNAUTHENTICATED", "The session credential is invalid.");
  }
  return segments[0];
}

function readBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return null;
  }

  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  if (!match?.[1]) {
    throw new AuthAccessError("UNAUTHENTICATED", "The authorization credential is invalid.");
  }
  return match[1];
}

export class RequestAuthenticator {
  readonly #betterAuth: BetterAuthGateway;
  readonly #apiKeys: D1ApiKeyGateway;
  readonly #sessionCookieName: string;
  readonly #clock: AuthClock;

  constructor(
    betterAuth: BetterAuthGateway,
    apiKeys: D1ApiKeyGateway,
    options: RequestAuthenticatorOptions = {},
  ) {
    this.#betterAuth = betterAuth;
    this.#apiKeys = apiKeys;
    this.#sessionCookieName = options.sessionCookieName ?? "better-auth.session_token";
    this.#clock = options.clock ?? systemClock;
  }

  async authenticate(request: Request): Promise<AuthPrincipal | null> {
    const sessionToken = readCookie(request, this.#sessionCookieName);
    const apiKeyToken = readBearerToken(request);

    if (sessionToken && apiKeyToken) {
      throw new AuthAccessError(
        "UNAUTHENTICATED",
        "Use exactly one authentication credential per request.",
      );
    }

    if (sessionToken) {
      return this.#authenticateSession(sessionTokenValue(sessionToken));
    }
    if (apiKeyToken) {
      return this.#authenticateApiKey(apiKeyToken);
    }
    return null;
  }

  async #authenticateSession(sessionToken: string): Promise<AuthPrincipal> {
    const session = await this.#betterAuth.resolveSession(sessionToken);
    const now = this.#clock.now();
    if (session?.emailVerified !== true || session.expiresAt.getTime() <= now.getTime()) {
      throw new AuthAccessError("UNAUTHENTICATED", "The session is invalid or expired.");
    }
    const displayName = authDisplayName(session.displayName);

    return {
      kind: "user",
      sessionId: session.sessionId,
      userId: session.userId,
      ...(displayName === undefined ? {} : { displayName }),
      email: session.email,
      memberships: session.memberships,
      reviewerGrants: session.reviewerGrants,
      speakerGrants: session.speakerGrants,
    };
  }

  async #authenticateApiKey(presentedKey: string): Promise<AuthPrincipal> {
    const apiKey = await this.#apiKeys.findByPresentedKey(presentedKey);
    const now = this.#clock.now();
    if (
      !apiKey ||
      apiKey.revokedAt !== null ||
      (apiKey.expiresAt !== null && apiKey.expiresAt.getTime() <= now.getTime())
    ) {
      throw new AuthAccessError("UNAUTHENTICATED", "The API key is invalid or expired.");
    }

    await this.#apiKeys.recordSuccessfulUse(apiKey.id, now);
    return {
      kind: "apiKey",
      apiKeyId: apiKey.id,
      organizationId: apiKey.organizationId,
      scopes: apiKey.scopes,
    };
  }
}

export function requireAuthenticated(principal: AuthPrincipal | null | undefined): AuthPrincipal {
  if (!principal) {
    throw new AuthAccessError("UNAUTHENTICATED", "Authentication is required.");
  }
  return principal;
}
