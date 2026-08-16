import assert from "node:assert/strict";
import { isAbsolute } from "node:path";
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

function successfulExecutor(calls, stdout = "[]") {
  return async (command, args, options) => {
    calls.push({ command, args, options });
    return { exitCode: 0, stdout, stderr: "" };
  };
}

test("requires explicit local environment and D1 database inputs", async () => {
  assert.throws(
    () => createLocalD1CommandAdapter({ database: "DB" }),
    (error) =>
      error instanceof LocalD1CommandAdapterError && error.code === "CONFIGURATION_REQUIRED",
  );
  assert.throws(
    () => createLocalD1CommandAdapter({ environment: "local" }),
    (error) =>
      error instanceof LocalD1CommandAdapterError && error.code === "CONFIGURATION_REQUIRED",
  );
  assert.throws(
    () =>
      createLocalD1CommandAdapter({
        environment: "local",
        database: "DB",
        persistTo: "\0",
      }),
    (error) =>
      error instanceof LocalD1CommandAdapterError && error.code === "CONFIGURATION_REQUIRED",
  );

  for (const environment of ["staging", "production"]) {
    assert.throws(
      () =>
        createLocalD1CommandAdapter({
          environment,
          database: "DB",
          executeProcess: async () => ({ exitCode: 0, stdout: "[]", stderr: "" }),
        }),
      (error) => error instanceof LocalD1CommandAdapterError && error.code === "LOCAL_ONLY",
    );
  }

  const calls = [];
  const adapter = createLocalD1CommandAdapter({
    environment: "local",
    database: "DB",
    executeProcess: successfulExecutor(calls),
  });
  await assert.rejects(
    adapter.execute({ type: "membership", environment: "production", ...SCOPE, role: "admin" }),
    (error) => error instanceof LocalD1CommandAdapterError && error.code === "LOCAL_ONLY",
  );
  assert.equal(calls.length, 0);
});

test("executes generated D1 commands with explicit local Wrangler arguments", async () => {
  const calls = [];
  const adapter = createLocalD1CommandAdapter({
    environment: "local",
    database: "DB",
    persistTo: "/tmp/eventloom-ui-qa-wrangler",
    executeProcess: successfulExecutor(calls),
  });

  await adapter.execute({
    type: "membership",
    operation: "ensure",
    ...SCOPE,
    role: "admin",
  });
  await adapter.run({
    type: "speaker-grant",
    operation: "ensure",
    ...SCOPE,
    speakerProfileId: "speaker-profile:devflow-conf-2027:participant-evaluator",
  });
  await adapter.ensureVerified({
    type: "account-verification",
    operation: "ensure",
    ...SCOPE,
  });

  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.equal(call.command, "bunx");
    assert.equal(call.args.slice(0, 4).join(" "), "wrangler d1 execute DB");
    assert.equal(call.args.includes("--local"), true);
    assert.equal(call.args.includes("--remote"), false);
    assert.equal(call.args.includes("--env"), false);
    assert.equal(call.args.includes("--json"), true);
    assert.equal(call.args[call.args.indexOf("--persist-to") + 1], "/tmp/eventloom-ui-qa-wrangler");
    assert.equal(call.options.shell, false);
    assert.match(call.args[call.args.indexOf("--cwd") + 1], /apps\/api$/u);
  }
  assert.match(calls[0].args[calls[0].args.indexOf("--command") + 1], /organization_memberships/u);
  assert.match(calls[1].args[calls[1].args.indexOf("--command") + 1], /speaker_grants/u);
  assert.match(calls[2].args[calls[2].args.indexOf("--command") + 1], /auth_users/u);
});

test("omits local persistence when no explicit path is configured", async () => {
  const calls = [];
  const adapter = createLocalD1CommandAdapter({
    environment: "local",
    database: "DB",
    executeProcess: successfulExecutor(calls),
  });

  await adapter.execute({ type: "membership", operation: "ensure", ...SCOPE, role: "admin" });

  assert.equal(calls[0].args.includes("--persist-to"), false);
});

test("resolves relative local persistence from the repository root", async () => {
  const calls = [];
  const adapter = createLocalD1CommandAdapter({
    environment: "local",
    database: "DB",
    persistTo: "tmp/eventloom-ui-qa-wrangler",
    executeProcess: successfulExecutor(calls),
  });

  await adapter.execute({ type: "membership", operation: "ensure", ...SCOPE, role: "admin" });

  const persistTo = calls[0].args[calls[0].args.indexOf("--persist-to") + 1];
  assert.equal(isAbsolute(persistTo), true);
  assert.match(persistTo, /tmp\/eventloom-ui-qa-wrangler$/u);
});

test("passes untrusted command values as SQL literals and never through a shell", async () => {
  const calls = [];
  const adapter = createLocalD1CommandAdapter({
    environment: "local",
    database: "DB",
    executeProcess: successfulExecutor(calls),
  });

  await adapter.execute({
    type: "membership",
    organizationId: "ai-engineer'; DROP TABLE auth_users; --",
    eventId: SCOPE.eventId,
    userId: SCOPE.userId,
    email: SCOPE.email,
    role: "admin",
  });

  const sql = calls[0].args[calls[0].args.indexOf("--command") + 1];
  assert.equal(sql.includes("'ai-engineer'; DROP TABLE"), false);
  assert.equal(sql.includes("'ai-engineer''; DROP TABLE auth_users; --'"), true);
  assert.equal(calls[0].command, "bunx");
  assert.equal(calls[0].options.shell, false);
});

test("resolves Better Auth user IDs through the local D1 adapter", async () => {
  const calls = [];
  const adapter = createLocalD1CommandAdapter({
    environment: "local",
    database: "DB",
    executeProcess: successfulExecutor(
      calls,
      JSON.stringify([{ success: true, results: [{ id: "user-from-local-d1" }] }]),
    ),
  });

  const result = await adapter.resolveUserId(SCOPE);

  assert.deepEqual(result, { userId: "user-from-local-d1" });
  const sql = calls[0].args[calls[0].args.indexOf("--command") + 1];
  assert.match(sql, /FROM auth_users/u);
  assert.match(sql, /LIMIT 2/u);
});

test("surfaces Wrangler command failures", async () => {
  const failure = new Error("wrangler process failed");
  const adapter = createLocalD1CommandAdapter({
    environment: "local",
    database: "DB",
    executeProcess: async () => {
      throw failure;
    },
  });

  await assert.rejects(
    adapter.execute({ type: "membership", operation: "ensure", ...SCOPE, role: "reviewer" }),
    (error) => {
      assert.equal(error instanceof LocalD1CommandAdapterError, true);
      assert.equal(error.code, "COMMAND_FAILED");
      assert.equal(error.cause, failure);
      return true;
    },
  );
});
