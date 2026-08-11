import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  DEFAULT_EVAL_CONFIG_PATH,
  PERSONA_ORDER,
  PersonaProvisionError,
  PRODUCTION_CONFIRMATION,
  parseProvisioningEnvironment,
  provisionPersonas,
} from "./provision-personas.mjs";

const IDS = {
  organizer: "user-organizer",
  reviewer: "user-reviewer",
  speaker: "user-speaker",
  submitter: "user-submitter",
};

function inputFor(overrides = {}) {
  return {
    environment: "staging",
    webOrigin: "https://web.staging.example.test",
    apiOrigin: "https://api.staging.example.test",
    organizationId: "ai-engineer",
    eventId: "open-sessionboard-conf",
    configPath: "/tmp/eval-test/evalconfig.json",
    personas: {
      organizer: {
        email: "organizer+eval@example.test",
        password: "OrgPassword!2027",
        name: "Organizer",
      },
      reviewer: {
        email: "reviewer+eval@example.test",
        password: "ReviewerPassword!2027",
        name: "Reviewer",
      },
      speaker: {
        email: "speaker+eval@example.test",
        password: "SpeakerPassword!2027",
        name: "Speaker",
      },
      submitter: {
        email: "submitter+eval@example.test",
        password: "SubmitterPassword!2027",
        name: "Submitter",
      },
    },
    ...overrides,
  };
}

function fakeAuthFetch() {
  const users = new Map();
  const requests = [];
  return {
    users,
    requests,
    fetchImplementation: async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ url, method: options.method, origin: options.headers.Origin, body });
      const existing = users.get(body.email);
      if (existing !== undefined) {
        return new Response(JSON.stringify({ code: "USER_ALREADY_EXISTS" }), {
          status: 409,
          headers: { "content-type": "application/json" },
        });
      }
      const userId = IDS[body.name.toLowerCase()] ?? `user-${users.size + 1}`;
      users.set(body.email, userId);
      return new Response(JSON.stringify({ user: { id: userId, email: body.email } }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    },
  };
}

function fakeCommandAdapter() {
  const calls = [];
  const records = new Map();
  return {
    calls,
    records,
    async execute(command) {
      calls.push(command);
      if (!records.has(command.idempotencyKey)) records.set(command.idempotencyKey, command);
    },
  };
}

async function runFixture(overrides = {}) {
  const auth = fakeAuthFetch();
  const adapter = fakeCommandAdapter();
  let written;
  const result = await provisionPersonas({
    input: inputFor(overrides),
    fetchImplementation: auth.fetchImplementation,
    commandAdapter: adapter,
    writeConfig: async (path, config) => {
      written = { path, config };
      return path;
    },
  });
  return { auth, adapter, result, written };
}

test("provisions all accounts through Better Auth and is idempotent", async () => {
  const first = await runFixture();
  const requestsAfterFirstRun = first.auth.requests.length;
  const commandsAfterFirstRun = first.adapter.calls.length;
  const second = await provisionPersonas({
    input: inputFor(),
    fetchImplementation: first.auth.fetchImplementation,
    commandAdapter: first.adapter,
    writeConfig: async (path) => path,
  });

  assert.deepEqual(first.result.accountStates, {
    organizer: "created",
    reviewer: "created",
    speaker: "created",
    submitter: "created",
  });
  assert.deepEqual(second.accountStates, {
    organizer: "existing",
    reviewer: "existing",
    speaker: "existing",
    submitter: "existing",
  });
  assert.equal(requestsAfterFirstRun, 4);
  assert.equal(first.adapter.records.size, 3);
  assert.equal(commandsAfterFirstRun, 3);
  // The second run repeats only idempotent commands; no duplicate D1 rows are created.
  assert.equal(first.auth.requests.length, 8);
  assert.equal(first.adapter.calls.length, 6);
  assert.equal(first.adapter.records.size, 3);
  assert.equal(second.configPath, "/tmp/eval-test/evalconfig.json");
});

test("keeps organizer, reviewer, speaker, and submitter access separated", async () => {
  const { adapter } = await runFixture();
  const memberships = adapter.calls.filter((command) => command.type === "membership");
  const grants = adapter.calls.filter((command) => command.type === "speaker-grant");

  assert.deepEqual(
    memberships.map((command) => [command.persona, command.role]),
    [
      ["organizer", "admin"],
      ["reviewer", "reviewer"],
    ],
  );
  assert.deepEqual(
    grants.map((command) => command.persona),
    ["speaker"],
  );
  assert.equal(
    adapter.calls.some((command) => command.persona === "submitter"),
    false,
  );
  for (const command of adapter.calls) {
    assert.equal(command.organizationId, "ai-engineer");
    assert.equal(command.eventId, "open-sessionboard-conf");
    assert.equal(typeof command.password, "undefined");
  }
});

test("runs the injected verification hook without sending mail endpoints", async () => {
  const auth = fakeAuthFetch();
  const adapter = fakeCommandAdapter();
  const verified = [];
  await provisionPersonas({
    input: inputFor(),
    fetchImplementation: auth.fetchImplementation,
    commandAdapter: adapter,
    verifyImplementation: async (command) => verified.push(command),
    writeConfig: async (path) => path,
  });
  assert.deepEqual(
    verified.map((command) => command.persona),
    ["organizer", "reviewer", "speaker", "submitter"],
  );
  assert.equal(
    auth.requests.every((request) => request.url.endsWith("/api/auth/sign-up/email")),
    true,
  );
});
test("passes the exact canonical tenant and event instead of hardcoding them", async () => {
  const { adapter } = await runFixture({
    organizationId: "ai-engineer",
    eventId: "canonical-event-from-env",
  });
  assert.equal(
    adapter.calls.every((command) => command.organizationId === "ai-engineer"),
    true,
  );
  assert.equal(
    adapter.calls.every((command) => command.eventId === "canonical-event-from-env"),
    true,
  );
});
test("rejects the legacy source organization ID before provisioning", async () => {
  const auth = fakeAuthFetch();
  const adapter = fakeCommandAdapter();
  await assert.rejects(
    provisionPersonas({
      input: inputFor({ organizationId: "foreverbrowsing" }),
      fetchImplementation: auth.fetchImplementation,
      commandAdapter: adapter,
      writeConfig: async (path) => path,
    }),
    (error) => error instanceof PersonaProvisionError && error.code === "SCOPE_MISMATCH",
  );
  assert.equal(auth.requests.length, 0);
  assert.equal(adapter.calls.length, 0);
});

test("requires explicit persona variables and never falls back to host account values", () => {
  assert.throws(
    () =>
      parseProvisioningEnvironment({ EVAL_ENVIRONMENT: "local", HOST_EMAIL: "host@example.com" }),
    (error) => error instanceof PersonaProvisionError && error.code === "MISSING_ENVIRONMENT",
  );
  assert.throws(
    () =>
      parseProvisioningEnvironment({
        EVAL_ENVIRONMENT: "local",
        EVAL_WEB_ORIGIN: "http://127.0.0.1:3015",
        EVAL_API_ORIGIN: "http://127.0.0.1:8787",
        EVAL_ORGANIZATION_ID: "tenant-from-env",
        EVAL_EVENT_ID: "event-from-env",
        ORGANIZER_EMAIL: "host@example.com",
      }),
    (error) => error instanceof PersonaProvisionError && error.code === "MISSING_ENVIRONMENT",
  );
});

test("does not expose a secret when an auth request fails", async () => {
  const secret = "Never-print-this-password!2027";
  const logs = [];
  await assert.rejects(
    provisionPersonas({
      input: inputFor(),
      fetchImplementation: async () => {
        throw new Error(`upstream diagnostic ${secret}`);
      },
      commandAdapter: fakeCommandAdapter(),
      logger: (entry) => logs.push(entry),
      writeConfig: async (path) => path,
    }),
    (error) => {
      assert.equal(error instanceof PersonaProvisionError, true);
      assert.equal(error.message.includes(secret), false);
      return true;
    },
  );
  assert.equal(JSON.stringify(logs).includes(secret), false);
});

test("blocks production before any network, D1, or config write without the exact confirmation", async () => {
  const auth = fakeAuthFetch();
  const adapter = fakeCommandAdapter();
  let writes = 0;
  const production = inputFor({
    environment: "production",
    webOrigin: "https://web.production.example.test",
    apiOrigin: "https://api.production.example.test",
  });
  await assert.rejects(
    provisionPersonas({
      input: production,
      fetchImplementation: auth.fetchImplementation,
      commandAdapter: adapter,
      writeConfig: async (path) => {
        writes += 1;
        return path;
      },
    }),
    (error) =>
      error instanceof PersonaProvisionError && error.code === "PRODUCTION_CONFIRMATION_REQUIRED",
  );
  assert.equal(auth.requests.length, 0);
  assert.equal(adapter.calls.length, 0);
  assert.equal(writes, 0);

  await assert.rejects(
    provisionPersonas({
      input: { ...production, productionConfirmation: "yes" },
      fetchImplementation: auth.fetchImplementation,
      commandAdapter: adapter,
      writeConfig: async (path) => path,
    }),
    (error) =>
      error instanceof PersonaProvisionError && error.code === "PRODUCTION_CONFIRMATION_REQUIRED",
  );
  assert.equal(auth.requests.length, 0);

  const allowed = await runFixture({
    environment: "production",
    webOrigin: "https://web.production.example.test",
    apiOrigin: "https://api.production.example.test",
    productionConfirmation: PRODUCTION_CONFIRMATION,
  });
  assert.equal(Object.keys(allowed.result.accountStates).length, 4);
});

test("emits a config compatible with the official evaluator shape without printing credentials", async () => {
  const { written } = await runFixture();
  assert.ok(written);
  const config = written.config;
  assert.equal(config.url, "https://web.staging.example.test");
  assert.deepEqual(config.areas, []);
  assert.equal(config.includeOptional, false);
  assert.equal(config.headless, true);
  for (const persona of PERSONA_ORDER) {
    assert.equal(config.personaEmails[persona], inputFor().personas[persona].email);
    assert.equal(config.credentials[persona].email, inputFor().personas[persona].email);
    assert.equal(config.credentials[persona].password, inputFor().personas[persona].password);
  }
  if (existsSync("/tmp/killmysaas-evals/evalconfig.example.json")) {
    const official = JSON.parse(
      readFileSync("/tmp/killmysaas-evals/evalconfig.example.json", "utf8"),
    );
    for (const key of [
      "url",
      "areas",
      "includeOptional",
      "personaEmails",
      "credentials",
      "headless",
      "submissionNotes",
    ]) {
      assert.equal(Object.hasOwn(config, key), Object.hasOwn(official, key));
    }
  }
  assert.notEqual(DEFAULT_EVAL_CONFIG_PATH, "evalconfig.json");
});
