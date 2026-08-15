import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  createLocalD1CommandAdapter,
  LocalD1CommandAdapterError,
} from "./local-d1-command-adapter.mjs";

const SCOPE = {
  organizationId: "ai-engineer",
  eventId: "devflow-conf-2027",
  userId: "user-evaluator",
  email: "evaluator@example.test",
};

function temporaryDatabase() {
  const directory = mkdtempSync(join(tmpdir(), "eventloom-local-d1-adapter-"));
  const path = join(directory, "local-d1.sqlite");
  const database = new DatabaseSync(path);
  database.exec(`
    CREATE TABLE auth_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE organization_memberships (
      organization_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (organization_id, user_id)
    );
    CREATE TABLE speaker_grants (
      organization_id TEXT NOT NULL,
      speaker_profile_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      revoked_at TEXT,
      PRIMARY KEY (organization_id, speaker_profile_id, user_id)
    );
  `);
  database
    .prepare("INSERT INTO auth_users (id, email, created_at, updated_at) VALUES (?, ?, ?, ?)")
    .run(SCOPE.userId, SCOPE.email, "2027-01-01T00:00:00.000Z", "2027-01-01T00:00:00.000Z");
  database.close();
  return { directory, path };
}

test("SQLite mode provisions typed local D1 commands against only the explicit file", async () => {
  const temporary = temporaryDatabase();
  try {
    const adapter = createLocalD1CommandAdapter({
      environment: "local",
      sqlitePath: temporary.path,
    });

    await adapter.execute({
      type: "membership",
      idempotencyKey: "eval-persona:ai-engineer:membership:user-evaluator",
      ...SCOPE,
      role: "admin",
    });
    await adapter.run({
      type: "speaker-grant",
      idempotencyKey: "eval-persona:ai-engineer:speaker-grant:user-evaluator",
      ...SCOPE,
      speakerProfileId: "speaker-profile:devflow-conf-2027:participant-evaluator",
    });
    await adapter.ensureVerified({
      type: "account-verification",
      idempotencyKey: "eval-persona:ai-engineer:verification:user-evaluator",
      ...SCOPE,
    });

    assert.deepEqual(await adapter.resolveUserId(SCOPE), { userId: SCOPE.userId });
    const database = new DatabaseSync(temporary.path);
    assert.deepEqual(
      { ...database.prepare("SELECT role FROM organization_memberships").get() },
      {
        role: "admin",
      },
    );
    assert.deepEqual(
      { ...database.prepare("SELECT email_verified FROM auth_users").get() },
      {
        email_verified: 1,
      },
    );
    assert.deepEqual(
      { ...database.prepare("SELECT revoked_at FROM speaker_grants").get() },
      {
        revoked_at: null,
      },
    );
    database.close();
  } finally {
    rmSync(temporary.directory, { recursive: true, force: true });
  }
});

test("SQLite mode surfaces database failures through the adapter", async () => {
  const temporary = temporaryDatabase();
  try {
    const failure = new Error("database is locked");
    const adapter = createLocalD1CommandAdapter({
      environment: "local",
      sqlitePath: temporary.path,
      sqliteDatabaseFactory: () => ({
        exec() {},
        prepare: () => ({
          run() {
            throw failure;
          },
        }),
        close() {},
      }),
    });

    await assert.rejects(
      adapter.execute({
        type: "membership",
        idempotencyKey: "eval-persona:ai-engineer:membership:user-evaluator",
        ...SCOPE,
        role: "admin",
      }),
      (error) => {
        assert.equal(error instanceof LocalD1CommandAdapterError, true);
        assert.equal(error.code, "COMMAND_FAILED");
        assert.equal(error.cause, failure);
        return true;
      },
    );
  } finally {
    rmSync(temporary.directory, { recursive: true, force: true });
  }
});

test("normalizes method-specific provisioner input without type or idempotency fields", async () => {
  const temporary = temporaryDatabase();
  try {
    const adapter = createLocalD1CommandAdapter({
      environment: "local",
      sqlitePath: temporary.path,
    });
    const methodInput = { ...SCOPE, persona: "speaker" };

    await adapter.ensureMembership({ ...methodInput, role: "admin" });
    await adapter.ensureSpeakerGrant({
      ...methodInput,
      speakerProfileId: "speaker-profile:devflow-conf-2027:participant-evaluator",
    });
    await adapter.ensureVerified(methodInput);
    await adapter.verifyAccount(methodInput);
    await adapter.markEmailVerified(methodInput);

    assert.deepEqual(await adapter.resolveUserId(methodInput), { userId: SCOPE.userId });
    const database = new DatabaseSync(temporary.path);
    assert.deepEqual(
      { ...database.prepare("SELECT role FROM organization_memberships").get() },
      { role: "admin" },
    );
    database.close();
  } finally {
    rmSync(temporary.directory, { recursive: true, force: true });
  }
});

test("SQLite mode requires an explicit absolute local database file", () => {
  assert.throws(
    () =>
      createLocalD1CommandAdapter({
        environment: "local",
        sqlitePath: "relative/local-d1.sqlite",
      }),
    (error) =>
      error instanceof LocalD1CommandAdapterError && error.code === "CONFIGURATION_REQUIRED",
  );
  assert.throws(
    () =>
      createLocalD1CommandAdapter({
        environment: "staging",
        sqlitePath: "/tmp/local-d1.sqlite",
      }),
    (error) => error instanceof LocalD1CommandAdapterError && error.code === "LOCAL_ONLY",
  );
});
