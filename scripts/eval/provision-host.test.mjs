import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { HostProvisionError, PRODUCTION_CONFIRMATION, provisionHost } from "./provision-host.mjs";

const PASSWORD = "HostPassword!2027";
const EMAIL = "swyx@ai.engineer";

function inputFor(overrides = {}) {
  return {
    environment: "staging",
    webOrigin: "https://web.staging.example.test",
    apiOrigin: "https://api.staging.example.test",
    organizationId: "ai-engineer",
    eventId: "open-sessionboard-conf",
    hostEmail: EMAIL,
    hostName: "Swyx",
    hostPassword: PASSWORD,
    role: "admin",
    ...overrides,
  };
}

function fakeAuthFetch() {
  const requests = [];
  let created = false;
  return {
    requests,
    fetchImplementation: async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ url, options, body });
      if (created) {
        return new Response(JSON.stringify({ code: "USER_ALREADY_EXISTS" }), {
          status: 409,
          headers: { "content-type": "application/json" },
        });
      }
      created = true;
      return new Response(JSON.stringify({ user: { id: "user-swyx", email: body.email } }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    },
  };
}

function fakeAdapter() {
  const resolutions = [];
  const verifications = [];
  const commands = [];
  let lookupCount = 0;
  return {
    resolutions,
    verifications,
    commands,
    async resolveUserId(input) {
      resolutions.push(input);
      lookupCount += 1;
      return lookupCount >= 3 ? { userId: "user-swyx" } : undefined;
    },
    async verifyIdentity(input) {
      verifications.push(input);
    },
    async execute(command) {
      commands.push(command);
    },
  };
}

async function runFixture(overrides = {}) {
  const auth = fakeAuthFetch();
  const adapter = fakeAdapter();
  const logs = [];
  const summary = await provisionHost({
    input: inputFor(overrides),
    fetchImplementation: auth.fetchImplementation,
    commandAdapter: adapter,
    logger: (entry) => logs.push(entry),
  });
  return { auth, adapter, logs, summary };
}

test("blocks production without the exact shared confirmation", async () => {
  const auth = fakeAuthFetch();
  const adapter = fakeAdapter();
  await assert.rejects(
    provisionHost({
      input: inputFor({ environment: "production" }),
      fetchImplementation: auth.fetchImplementation,
      commandAdapter: adapter,
    }),
    (error) =>
      error instanceof HostProvisionError && error.code === "PRODUCTION_CONFIRMATION_REQUIRED",
  );
  assert.equal(auth.requests.length, 0);
  assert.equal(adapter.resolutions.length, 0);
});

test("creates exactly one host account and skips sign-up for an existing identity", async () => {
  const auth = fakeAuthFetch();
  const adapter = fakeAdapter();
  const first = await provisionHost({
    input: inputFor(),
    fetchImplementation: auth.fetchImplementation,
    commandAdapter: adapter,
  });
  const second = await provisionHost({
    input: inputFor(),
    fetchImplementation: auth.fetchImplementation,
    commandAdapter: adapter,
  });
  assert.equal(auth.requests.length, 1);
  assert.equal(first.accountState, "created");
  assert.equal(second.accountState, "existing");
  assert.equal(adapter.commands.length, 2);
  assert.equal(adapter.resolutions.length, 4);
});

test("verifies with credential-backed identity and ensures the requested owner role", async () => {
  const { adapter, summary } = await runFixture({ role: "owner" });
  assert.equal(summary.role, "owner");
  assert.deepEqual(adapter.commands, [
    {
      type: "membership",
      operation: "ensure",
      organizationId: "ai-engineer",
      eventId: "open-sessionboard-conf",
      userId: "user-swyx",
      email: EMAIL,
      role: "owner",
      idempotencyKey: "eval-host:ai-engineer:membership:user-swyx",
    },
  ]);
  assert.equal(adapter.verifications.length, 1);
  assert.equal(adapter.verifications[0].credentialBacked, true);
  assert.equal("password" in adapter.verifications[0], false);
});

test("writes optional credentials only to a private 0600 absolute path", async () => {
  const directory = await mkdtemp(join(tmpdir(), "provision-host-test-"));
  const credentialsPath = join(directory, "nested", "host.json");
  try {
    const { summary } = await runFixture({ credentialsPath });
    const file = await stat(credentialsPath);
    const credentials = JSON.parse(await readFile(credentialsPath, "utf8"));
    assert.equal(file.mode & 0o777, 0o600);
    assert.deepEqual(credentials, { email: EMAIL, name: "Swyx", password: PASSWORD });
    assert.equal(summary.credentialsPath, credentialsPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("does not replace credentials or send sign-up mail for an existing identity", async () => {
  const directory = await mkdtemp(join(tmpdir(), "provision-host-existing-test-"));
  const credentialsPath = join(directory, "host.json");
  const existingContents = '{"existing":true}\n';
  const auth = fakeAuthFetch();
  const adapter = fakeAdapter();
  await adapter.resolveUserId({});
  await adapter.resolveUserId({});
  try {
    await writeFile(credentialsPath, existingContents, { mode: 0o600 });
    const summary = await provisionHost({
      input: inputFor({ credentialsPath }),
      fetchImplementation: auth.fetchImplementation,
      commandAdapter: adapter,
    });
    assert.equal(summary.accountState, "existing");
    assert.equal(summary.credentialsPath, undefined);
    assert.equal(auth.requests.length, 0);
    assert.equal(await readFile(credentialsPath, "utf8"), existingContents);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("keeps credentials, confirmation, and adapter errors out of logs and errors", async () => {
  const logs = [];
  const auth = fakeAuthFetch();
  const adapter = fakeAdapter();
  const summary = await provisionHost({
    input: inputFor({ productionConfirmation: PRODUCTION_CONFIRMATION }),
    fetchImplementation: auth.fetchImplementation,
    commandAdapter: adapter,
    logger: (entry) => logs.push(entry),
  });
  const serializedLogs = JSON.stringify(logs);
  assert.equal(serializedLogs.includes(PASSWORD), false);
  assert.equal(serializedLogs.includes(PRODUCTION_CONFIRMATION), false);

  const failingAdapter = {
    ...fakeAdapter(),
    async verifyIdentity() {
      throw new Error(`adapter leaked ${PASSWORD} ${PRODUCTION_CONFIRMATION}`);
    },
  };
  await assert.rejects(
    provisionHost({
      input: inputFor(),
      fetchImplementation: auth.fetchImplementation,
      commandAdapter: failingAdapter,
    }),
    (error) =>
      error instanceof HostProvisionError &&
      !error.message.includes(PASSWORD) &&
      !error.message.includes(PRODUCTION_CONFIRMATION),
  );
  assert.equal("password" in summary, false);
});
