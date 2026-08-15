import { readFileSync } from "node:fs";
import { fileURLToPath, URL as NodeUrl } from "node:url";
import type { D1Database } from "@cloudflare/workers-types";
import { describe, expect, it } from "vitest";
import { SqliteD1 } from "../../test-support/sqlite-d1";
import { createBetterAuthRuntimeConfiguration } from "./configuration";
import { createBetterAuthRuntime, createD1AuthAdapter } from "./runtime";

const configuration = createBetterAuthRuntimeConfiguration({
  secret: "a-secret-long-enough-for-better-auth-tests",
  baseUrl: "https://api.example.com",
  trustedOrigins: ["https://web.example.com"],
});

function recordingDatabase() {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const row = {
    id: "account-1",
    user_id: "user-1",
    provider_id: "credential",
    provider_account_id: "user-1",
    password_hash: "$scrypt$stored-password-hash",
    created_at: "2026-08-09T12:00:00.000Z",
    updated_at: "2026-08-09T12:00:00.000Z",
  };
  const database = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          statements.push({ sql, values });
          return {
            first: async <T>() => row as T,
            all: async <T>() => ({ results: [row as T] }),
            run: async () => ({ success: true, meta: { changes: 1 } }),
          };
        },
      };
    },
  } as unknown as D1Database;
  return { database, statements };
}

describe("Better Auth D1 runtime", () => {
  it("persists credential hashes through the account column mapping", async () => {
    const { database, statements } = recordingDatabase();
    const adapter = createD1AuthAdapter(database);

    const account = await adapter.create({
      model: "account",
      data: {
        id: "account-1",
        userId: "user-1",
        providerId: "credential",
        accountId: "user-1",
        password: "$scrypt$stored-password-hash",
        createdAt: new Date("2026-08-09T12:00:00.000Z"),
        updatedAt: new Date("2026-08-09T12:00:00.000Z"),
      },
    });

    expect(statements[0]?.sql).toContain("password_hash");
    expect(statements[0]?.values).toContain("$scrypt$stored-password-hash");
    expect(account).toMatchObject({
      providerId: "credential",
      password: "$scrypt$stored-password-hash",
    });
  });
  it("generates an ID when the adapter create payload omits one", async () => {
    const { database, statements } = recordingDatabase();
    const adapter = createD1AuthAdapter(database);

    await adapter.create({
      model: "account",
      data: {
        userId: "user-1",
        providerId: "credential",
        accountId: "user-1",
        password: "$scrypt$stored-password-hash",
        createdAt: new Date("2026-08-09T12:00:00.000Z"),
        updatedAt: new Date("2026-08-09T12:00:00.000Z"),
      },
    });

    const generatedId = statements[0]?.values.find(
      (value): value is string =>
        typeof value === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value),
    );
    expect(generatedId).toBeDefined();
  });

  it("keeps email/password signup enabled with the minimum server-side password length", async () => {
    const { database } = recordingDatabase();
    const runtime = createBetterAuthRuntime({
      database,
      configuration,
      environment: "staging",
      sendMagicLink: async () => undefined,
    });

    const response = await runtime.handler(
      new Request("https://api.example.com/api/auth/sign-up/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://web.example.com",
        },
        body: JSON.stringify({
          name: "Test Speaker",
          email: "speaker@example.com",
          password: "short",
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "PASSWORD_TOO_SHORT" });
  });
  it("enforces the CFP password character requirements at the API boundary", async () => {
    const { database } = recordingDatabase();
    const runtime = createBetterAuthRuntime({
      database,
      configuration,
      environment: "staging",
      sendMagicLink: async () => undefined,
    });

    const response = await runtime.handler(
      new Request("https://api.example.com/api/auth/sign-up/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://web.example.com",
        },
        body: JSON.stringify({
          name: "Test Speaker",
          email: "speaker@example.com",
          password: "weakpass",
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_PASSWORD" });
  });
  it("builds magic links on the browser origin used by the same-origin gateway", async () => {
    const { database } = recordingDatabase();
    const links: string[] = [];
    const runtime = createBetterAuthRuntime({
      database,
      configuration: createBetterAuthRuntimeConfiguration({
        secret: "a-secret-long-enough-for-better-auth-tests",
        baseUrl: "https://web.example.com",
        trustedOrigins: ["https://web.example.com", "https://api.example.com"],
      }),
      environment: "staging",
      sendMagicLink: async ({ url }) => {
        links.push(url);
      },
    });

    const response = await runtime.handler(
      new Request("https://api.example.com/api/auth/sign-in/magic-link", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://web.example.com",
        },
        body: JSON.stringify({
          email: "speaker@example.com",
          callbackURL: "https://web.example.com/admin",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatch(/^https:\/\/web\.example\.com\/api\/auth\/magic-link\/verify\?/u);
  });
  it("creates a verified session before redirecting an email verification callback", async () => {
    const database = new SqliteD1(
      "eventloom-auth-verification-",
      [
        readFileSync(
          fileURLToPath(
            new NodeUrl("../../../migrations/0001_identity_and_access.sql", import.meta.url),
          ),
          "utf8",
        ),
        readFileSync(
          fileURLToPath(new NodeUrl("../../../migrations/0003_auth_password.sql", import.meta.url)),
          "utf8",
        ),
      ].join("\n"),
    );
    try {
      const links: string[] = [];
      const runtime = createBetterAuthRuntime({
        database: database as unknown as D1Database,
        configuration: createBetterAuthRuntimeConfiguration({
          secret: "a-secret-long-enough-for-better-auth-tests",
          baseUrl: "https://web.example.com",
          trustedOrigins: ["https://web.example.com"],
        }),
        environment: "staging",
        sendMagicLink: async ({ url }) => {
          links.push(url);
        },
      });
      const callbackUrl =
        "https://web.example.com/cfp/organizations/example/events/example/account?cfpVerification=complete";

      const signUp = await runtime.handler(
        new Request("https://web.example.com/api/auth/sign-up/email", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "https://web.example.com",
          },
          body: JSON.stringify({
            name: "Verified Speaker",
            email: "verified-speaker@example.com",
            password: "StrongPass1!",
            callbackURL: callbackUrl,
          }),
        }),
      );

      expect(signUp.status).toBe(200);
      expect(links).toHaveLength(1);
      const verification = await runtime.handler(new Request(links[0] ?? ""));
      expect(verification.status).toBe(302);
      expect(verification.headers.get("location")).toBe(callbackUrl);
      const cookie = verification.headers.get("set-cookie")?.split(";")[0] ?? "";
      expect(cookie).toContain("better-auth.session_token=");

      const session = await runtime.handler(
        new Request("https://web.example.com/api/auth/get-session", {
          headers: { cookie },
        }),
      );
      expect(session.status).toBe(200);
      await expect(session.json()).resolves.toMatchObject({
        user: {
          email: "verified-speaker@example.com",
          emailVerified: true,
        },
      });
    } finally {
      database.dispose();
    }
  });
});
