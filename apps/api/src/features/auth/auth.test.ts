import { describe, expect, it } from "vitest";
import { RequestAuthenticator } from "./authenticator";
import {
  requireApiKeyScope,
  requireOrganizationRole,
  requireSpeakerOwnership,
  requireTenantScope,
} from "./authorization";
import { createBetterAuthRuntimeConfiguration } from "./configuration";
import type {
  AuthSession,
  BetterAuthGateway,
  D1ApiKeyGateway,
  StoredApiKey,
  UserPrincipal,
} from "./types";

const now = new Date("2026-08-08T12:00:00.000Z");

class FakeBetterAuthGateway implements BetterAuthGateway {
  readonly sessions = new Map<string, AuthSession>();
  readonly magicLinkRequests: Array<{ email: string; callbackUrl: string }> = [];

  async resolveSession(sessionToken: string): Promise<AuthSession | null> {
    return this.sessions.get(sessionToken) ?? null;
  }

  async requestMagicLink(input: { email: string; callbackUrl: string }): Promise<void> {
    this.magicLinkRequests.push(input);
  }

  async consumeMagicLink(token: string): Promise<AuthSession | null> {
    const session = this.sessions.get(token) ?? null;
    if (session !== null) this.sessions.delete(token);
    return session;
  }
}

class FakeD1ApiKeyGateway implements D1ApiKeyGateway {
  readonly keys = new Map<string, StoredApiKey>();
  readonly successfulUses: Array<{ apiKeyId: string; usedAt: Date }> = [];

  async findByPresentedKey(presentedKey: string): Promise<StoredApiKey | null> {
    return this.keys.get(presentedKey) ?? null;
  }

  async recordSuccessfulUse(apiKeyId: string, usedAt: Date): Promise<void> {
    this.successfulUses.push({ apiKeyId, usedAt });
  }
}

function session(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    sessionId: "session-1",
    userId: "user-1",
    email: "speaker@example.com",
    emailVerified: true,
    expiresAt: new Date("2026-08-08T13:00:00.000Z"),
    memberships: [{ organizationId: "organization-1", role: "admin" }],
    speakerGrants: [{ organizationId: "organization-1", speakerProfileId: "speaker-profile-1" }],
    reviewerGrants: [],
    ...overrides,
  };
}

function userPrincipal(overrides: Partial<UserPrincipal> = {}): UserPrincipal {
  return {
    kind: "user",
    sessionId: "session-1",
    userId: "user-1",
    email: "speaker@example.com",
    memberships: [{ organizationId: "organization-1", role: "reviewer" }],
    speakerGrants: [{ organizationId: "organization-1", speakerProfileId: "speaker-profile-1" }],
    reviewerGrants: [],
    ...overrides,
  };
}

function setupAuthenticator() {
  const betterAuth = new FakeBetterAuthGateway();
  const apiKeys = new FakeD1ApiKeyGateway();
  const authenticator = new RequestAuthenticator(betterAuth, apiKeys, {
    clock: { now: () => now },
  });
  return { betterAuth, apiKeys, authenticator };
}

describe("Better Auth runtime configuration", () => {
  it("normalizes origins and enables email/password and magic-link authentication", () => {
    const configuration = createBetterAuthRuntimeConfiguration({
      secret: "test-secret",
      baseUrl: "https://api.example.com/auth/callback",
      trustedOrigins: ["https://app.example.com/login"],
    });

    expect(configuration).toEqual({
      secret: "test-secret",
      baseUrl: "https://api.example.com",
      trustedOrigins: ["https://app.example.com", "https://api.example.com"],
      emailVerification: { required: true },
      magicLink: { enabled: true, expiresInSeconds: 900 },
    });
  });

  it("does not require or expose OAuth provider configuration", () => {
    const configuration = createBetterAuthRuntimeConfiguration({
      secret: "test-secret",
      baseUrl: "https://api.example.com",
      trustedOrigins: [],
    });

    expect(configuration).not.toHaveProperty("googleCallbackUrl");
    expect(configuration).not.toHaveProperty("oauthProviders");
    expect(configuration).not.toHaveProperty("socialProviders");
  });
});

describe("request authentication", () => {
  it("resolves a verified Better Auth session without requiring live credentials", async () => {
    const { betterAuth, authenticator } = setupAuthenticator();
    betterAuth.sessions.set("valid-session", session());

    const principal = await authenticator.authenticate(
      new Request("https://api.example.com/private", {
        headers: { cookie: "better-auth.session_token=valid-session" },
      }),
    );

    expect(principal).toMatchObject({ kind: "user", userId: "user-1" });
  });
  it("propagates validated display names without synthesizing one from email", async () => {
    const { betterAuth, authenticator } = setupAuthenticator();
    betterAuth.sessions.set(
      "named-session",
      session({ displayName: "  Olivia Organizer  ", email: "private@example.com" }),
    );
    betterAuth.sessions.set("unnamed-session", session({ email: "private@example.com" }));

    const named = await authenticator.authenticate(
      new Request("https://api.example.com/private", {
        headers: { cookie: "better-auth.session_token=named-session" },
      }),
    );
    const unnamed = await authenticator.authenticate(
      new Request("https://api.example.com/private", {
        headers: { cookie: "better-auth.session_token=unnamed-session" },
      }),
    );

    expect(named).toMatchObject({ displayName: "Olivia Organizer" });
    expect(unnamed).not.toHaveProperty("displayName");
  });
  it("resolves the raw session token from a Better Auth signed cookie", async () => {
    const { betterAuth, apiKeys } = setupAuthenticator();
    betterAuth.sessions.set("valid-session", session());
    const authenticator = new RequestAuthenticator(betterAuth, apiKeys, {
      sessionCookieName: "__Secure-better-auth.session_token",
      clock: { now: () => now },
    });

    const principal = await authenticator.authenticate(
      new Request("https://api.example.com/private", {
        headers: {
          cookie:
            "__Secure-better-auth.session_token=valid-session.abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH",
        },
      }),
    );

    expect(principal).toMatchObject({ kind: "user", userId: "user-1" });
  });

  it("rejects unverified sessions and ambiguous credentials", async () => {
    const { betterAuth, authenticator } = setupAuthenticator();
    betterAuth.sessions.set("unverified", session({ emailVerified: false }));

    await expect(
      authenticator.authenticate(
        new Request("https://api.example.com/private", {
          headers: { cookie: "better-auth.session_token=unverified" },
        }),
      ),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401 });

    await expect(
      authenticator.authenticate(
        new Request("https://api.example.com/private", {
          headers: {
            authorization: "Bearer api-key",
            cookie: "better-auth.session_token=valid-session",
          },
        }),
      ),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
  });
  it("rejects expired sessions and replays of a consumed magic link", async () => {
    const { betterAuth, authenticator } = setupAuthenticator();
    betterAuth.sessions.set(
      "expired-session",
      session({ expiresAt: new Date("2026-08-08T11:59:59.999Z") }),
    );

    await expect(
      authenticator.authenticate(
        new Request("https://api.example.com/private", {
          headers: { cookie: "better-auth.session_token=expired-session" },
        }),
      ),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401 });

    betterAuth.sessions.set("one-time-link", session());
    await expect(betterAuth.consumeMagicLink("one-time-link")).resolves.toMatchObject({
      sessionId: "session-1",
    });
    await expect(betterAuth.consumeMagicLink("one-time-link")).resolves.toBeNull();
  });

  it("authenticates an active scoped API key and records successful use", async () => {
    const { apiKeys, authenticator } = setupAuthenticator();
    apiKeys.keys.set("presented-key", {
      id: "api-key-1",
      organizationId: "organization-1",
      label: "Integration",
      scopes: ["events:read"],
      expiresAt: null,
      revokedAt: null,
    });

    const principal = await authenticator.authenticate(
      new Request("https://api.example.com/private", {
        headers: { authorization: "Bearer presented-key" },
      }),
    );

    expect(principal).toEqual({
      kind: "apiKey",
      apiKeyId: "api-key-1",
      organizationId: "organization-1",
      scopes: ["events:read"],
    });
    expect(apiKeys.successfulUses).toEqual([{ apiKeyId: "api-key-1", usedAt: now }]);
  });

  it("rejects revoked API keys before recording use", async () => {
    const { apiKeys, authenticator } = setupAuthenticator();
    apiKeys.keys.set("revoked-key", {
      id: "api-key-1",
      organizationId: "organization-1",
      label: "Integration",
      scopes: ["events:read"],
      expiresAt: null,
      revokedAt: new Date("2026-08-08T11:00:00.000Z"),
    });

    await expect(
      authenticator.authenticate(
        new Request("https://api.example.com/private", {
          headers: { authorization: "Bearer revoked-key" },
        }),
      ),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(apiKeys.successfulUses).toEqual([]);
  });
});

describe("tenant authorization", () => {
  it("denies cross-tenant organizer access and enforces explicit roles", () => {
    const principal = userPrincipal();

    expect(() => requireTenantScope(principal, "organization-2")).toThrowError(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
    expect(() =>
      requireOrganizationRole(principal, "organization-1", ["owner", "admin"]),
    ).toThrowError(expect.objectContaining({ code: "FORBIDDEN" }));
    expect(requireOrganizationRole(principal, "organization-1", ["reviewer"])).toBe(principal);
  });

  it("allows exact speaker ownership but denies another profile in the same tenant", () => {
    const principal = userPrincipal();

    expect(
      requireSpeakerOwnership(principal, {
        organizationId: "organization-1",
        speakerProfileId: "speaker-profile-1",
        ownerUserId: "user-1",
      }),
    ).toBe(principal);
    expect(() =>
      requireSpeakerOwnership(principal, {
        organizationId: "organization-1",
        speakerProfileId: "speaker-profile-2",
        ownerUserId: "user-1",
      }),
    ).toThrowError(expect.objectContaining({ code: "FORBIDDEN" }));
  });

  it("enforces both API-key tenant and scope", () => {
    const principal = {
      kind: "apiKey" as const,
      apiKeyId: "api-key-1",
      organizationId: "organization-1",
      scopes: ["events:read" as const],
    };

    expect(requireApiKeyScope(principal, "organization-1", "events:read")).toBe(principal);
    expect(() => requireApiKeyScope(principal, "organization-2", "events:read")).toThrowError(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
    expect(() => requireApiKeyScope(principal, "organization-1", "events:write")).toThrowError(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
  });
});
