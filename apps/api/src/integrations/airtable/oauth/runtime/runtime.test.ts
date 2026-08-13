import { describe, expect, it, vi } from "vitest";
import type { UserPrincipal } from "../../../../features/auth/types";
import type { AirtableOAuthAttempt } from "../service";
import {
  AirtableBaseSelectionService,
  AirtableOAuthRuntime,
  type AirtableOAuthRuntimeError,
  AuthModeAwareAirtableCredentialResolver,
} from "./index";

const principal: UserPrincipal = {
  kind: "user",
  sessionId: "session-1",
  userId: "user-1",
  email: "owner@example.test",
  memberships: [{ organizationId: "organization-1", role: "owner" }],
  speakerGrants: [],
};

function attempt(): AirtableOAuthAttempt {
  return {
    id: "attempt-1",
    organizationId: "organization-1",
    initiatingUserId: "user-1",
    connectionId: "connection-1",
    stateHash: "state-hash",
    pkceVerifierCiphertext: "ciphertext",
    returnPath: "/admin/integrations/airtable",
    callbackCodeHash: null,
    status: "pending",
    exchangeOwner: null,
    exchangeToken: null,
    exchangeLeaseExpiresAt: null,
    attemptVersion: 1,
    expiresAt: "2026-08-13T13:20:00.000Z",
    consumedAt: null,
    resultRedirect: null,
    errorCode: null,
    createdAt: "2026-08-13T13:10:00.000Z",
    updatedAt: "2026-08-13T13:10:00.000Z",
  };
}

function runtimeDependencies() {
  return {
    authenticator: {
      authenticate: vi.fn(async () => principal),
    },
    oauth: {
      beginAuthorization: vi.fn(async () => ({
        attemptId: "attempt-1",
        connectionId: "connection-1",
        authorizationUrl: "https://airtable.test/oauth",
        expiresAt: "2026-08-13T13:20:00.000Z",
      })),
      handleCallback: vi.fn(async () => ({
        connectionId: "connection-1",
        connectionVersion: 2,
        redirectTo: "/admin/integrations/airtable",
      })),
    },
    attempts: {
      findByStateHash: vi.fn(async () => attempt()),
    },
    crypto: {
      sha256Base64Url: vi.fn(async () => "state-hash"),
    },
    credentials: {
      resolve: vi.fn(async () => ({ authMode: "oauth" as const, credential: "access-token" })),
    },
    baseSelections: {
      selectBase: vi.fn(async () => ({
        organizationId: "organization-1",
        connectionId: "connection-1",
        baseId: "app-base",
        baseName: "Program",
        connectionVersion: 3,
        selectedAt: "2026-08-13T13:10:00.000Z",
      })),
    },
  };
}

describe("AirtableOAuthRuntime", () => {
  it("starts authorization with the authenticated owner's real user ID", async () => {
    const dependencies = runtimeDependencies();
    const runtime = new AirtableOAuthRuntime(dependencies);

    await runtime.startAuthenticated({
      request: new Request("https://api.example.test/oauth/start"),
      organizationId: "organization-1",
      returnPath: "/admin/integrations/airtable",
    });

    expect(dependencies.oauth.beginAuthorization).toHaveBeenCalledWith({
      organizationId: "organization-1",
      initiatingUserId: "user-1",
      returnPath: "/admin/integrations/airtable",
    });
  });

  it("recovers organization and initiating user from hashed public state", async () => {
    const dependencies = runtimeDependencies();
    const runtime = new AirtableOAuthRuntime(dependencies);

    await runtime.handlePublicCallback({ state: "opaque-state", code: "authorization-code" });

    expect(dependencies.crypto.sha256Base64Url).toHaveBeenCalledWith("opaque-state");
    expect(dependencies.attempts.findByStateHash).toHaveBeenCalledWith("state-hash");
    expect(dependencies.oauth.handleCallback).toHaveBeenCalledWith({
      organizationId: "organization-1",
      userId: "user-1",
      state: "opaque-state",
      code: "authorization-code",
    });
  });
});

describe("AuthModeAwareAirtableCredentialResolver", () => {
  it("resolves PAT and OAuth references through their matching stores", async () => {
    const resolver = new AuthModeAwareAirtableCredentialResolver({
      patSecrets: { get: vi.fn(async () => "pat-token") },
      oauthSecrets: {
        get: vi.fn(async () => ({ accessToken: "oauth-access", refreshToken: "oauth-refresh" })),
      },
    });

    await expect(
      resolver.resolve({
        authMode: "pat",
        credentialReference: "airtable-secret:v1:1234:ciphertext",
      }),
    ).resolves.toEqual({ authMode: "pat", credential: "pat-token" });
    await expect(
      resolver.resolve({
        authMode: "oauth",
        credentialReference: "airtable-oauth:v1:ciphertext",
      }),
    ).resolves.toEqual({ authMode: "oauth", credential: "oauth-access" });
  });

  it("rejects references whose format does not match the connection auth mode", async () => {
    const resolver = new AuthModeAwareAirtableCredentialResolver({
      patSecrets: { get: vi.fn() },
      oauthSecrets: { get: vi.fn() },
    });

    await expect(
      resolver.resolve({
        authMode: "oauth",
        credentialReference: "airtable-secret:v1:1234:ciphertext",
      }),
    ).rejects.toMatchObject({
      code: "credential_mode_mismatch",
    } satisfies Partial<AirtableOAuthRuntimeError>);
  });
});

describe("AirtableBaseSelectionService", () => {
  it("validates credential scopes and the selected base before a versioned store update", async () => {
    const store = {
      findConnection: vi.fn(async () => ({
        id: "connection-1",
        organizationId: "organization-1",
        status: "connected" as const,
        authMode: "oauth" as const,
        credentialReference: "airtable-oauth:v1:ciphertext",
        connectionVersion: 4,
      })),
      saveValidatedSelection: vi.fn(async (input) => ({
        organizationId: input.organizationId,
        connectionId: input.connectionId,
        baseId: input.base.id,
        baseName: input.base.name,
        connectionVersion: 5,
        selectedAt: input.selectedAt,
      })),
    };
    const service = new AirtableBaseSelectionService({
      store,
      credentials: {
        resolve: vi.fn(async () => ({
          authMode: "oauth" as const,
          credential: "access-token",
        })),
      },
      provider: {
        inspectCredential: vi.fn(async () => ({
          userId: "airtable-user",
          accountId: "airtable-account",
          scopes: ["schema.bases:read"],
        })),
        getBaseSchema: vi.fn(async () => ({
          id: "app-base",
          name: "Program",
          tables: [],
        })),
      },
      requiredScopes: ["schema.bases:read"],
      now: () => new Date("2026-08-13T13:10:00.000Z"),
    });

    await expect(
      service.selectBase({
        organizationId: "organization-1",
        connectionId: "connection-1",
        baseId: "app-base",
      }),
    ).resolves.toEqual({
      organizationId: "organization-1",
      connectionId: "connection-1",
      baseId: "app-base",
      baseName: "Program",
      connectionVersion: 5,
      selectedAt: "2026-08-13T13:10:00.000Z",
    });
    expect(store.saveValidatedSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedConnectionVersion: 4,
        expectedAuthMode: "oauth",
        expectedCredentialReference: "airtable-oauth:v1:ciphertext",
      }),
    );
  });
});
