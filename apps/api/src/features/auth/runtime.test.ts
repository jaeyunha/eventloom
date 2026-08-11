import type { D1Database } from "@cloudflare/workers-types";
import { describe, expect, it } from "vitest";
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
});
