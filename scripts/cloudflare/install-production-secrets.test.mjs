import assert from "node:assert/strict";
import test from "node:test";
import {
  confirmationToken as productionConfirmationToken,
  environment as productionEnvironment,
} from "./install-production-secrets.mjs";
import {
  confirmationToken as stagingConfirmationToken,
  environment as stagingEnvironment,
} from "./install-staging-secrets.mjs";
import {
  API_SECRET_NAMES,
  buildSecretSyncPlan,
  fingerprintSecret,
  runWorkerSecretSync,
  secretStatePath,
  WEB_SECRET_NAMES,
} from "./worker-secret-sync.mjs";

const configuration = {
  CLOUDFLARE_ACCOUNT_ID: "account-id",
  CLOUDFLARE_API_TOKEN: "cloudflare-token",
  BETTER_AUTH_SECRET: "better-auth-secret",
  OPENSEND_API_KEY: "opensend-secret",
  OPENAI_API_KEY: "openai-secret",
  AIRTABLE_OAUTH_CLIENT_SECRET: "airtable-oauth-secret",
  AIRTABLE_CREDENTIAL_ENCRYPTION_KEY: "airtable-encryption-secret",
  CACHE_INVALIDATION_TOKEN: "cache-invalidation-secret",
  ORGANIZATION_PROVISIONING_TOKEN: "organization-provisioning-secret",
  ORGANIZATION_BOOTSTRAP_TOKEN: "organization-bootstrap-secret",
};

test("defines separate fixed staging and production entrypoints", () => {
  assert.equal(stagingEnvironment, "staging");
  assert.equal(stagingConfirmationToken, "open-sessionboard:staging");
  assert.equal(productionEnvironment, "production");
  assert.equal(productionConfirmationToken, "open-sessionboard:production");
});

test("targets every application Worker secret without deployment credentials", () => {
  assert.deepEqual(API_SECRET_NAMES, [
    "BETTER_AUTH_SECRET",
    "OPENSEND_API_KEY",
    "OPENAI_API_KEY",
    "AIRTABLE_OAUTH_CLIENT_SECRET",
    "AIRTABLE_CREDENTIAL_ENCRYPTION_KEY",
    "CACHE_INVALIDATION_TOKEN",
    "ORGANIZATION_PROVISIONING_TOKEN",
    "ORGANIZATION_BOOTSTRAP_TOKEN",
  ]);
  assert.deepEqual(WEB_SECRET_NAMES, ["CACHE_INVALIDATION_TOKEN"]);

  const plan = buildSecretSyncPlan("staging", configuration, {});
  assert.deepEqual(
    plan.map(({ worker, secret }) => ({ worker, secret })),
    [
      ...API_SECRET_NAMES.map((secret) => ({
        worker: "open-sessionboard-api-staging",
        secret,
      })),
      {
        worker: "open-sessionboard-web-staging",
        secret: "CACHE_INVALIDATION_TOKEN",
      },
    ],
  );

  for (const forbidden of [
    "CLOUDFLARE_API_TOKEN",
    "AIRTABLE_ACCESS_TOKEN",
    "AIRTABLE_BASE_ID",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
  ]) {
    assert.equal(
      plan.some(({ secret }) => secret === forbidden),
      false,
    );
  }
});

test("skips unchanged fingerprints and force refreshes every target", () => {
  const firstPlan = buildSecretSyncPlan("production", configuration, {});
  assert.equal(
    firstPlan.every(({ action }) => action === "update"),
    true,
  );

  const state = Object.fromEntries(firstPlan.map(({ key, fingerprint }) => [key, fingerprint]));
  const unchanged = buildSecretSyncPlan("production", configuration, state);
  assert.equal(
    unchanged.every(({ action }) => action === "skip"),
    true,
  );

  const forced = buildSecretSyncPlan("production", configuration, state, {
    force: true,
  });
  assert.equal(
    forced.every(({ action }) => action === "update"),
    true,
  );
});

test("uses environment-specific ignored fingerprint ledgers", () => {
  assert.match(secretStatePath("staging"), /\.cloudflare-secret-fingerprints-staging\.json$/);
  assert.match(secretStatePath("production"), /\.cloudflare-secret-fingerprints-production\.json$/);
});

test("fails before writes when the selected environment file is incomplete", () => {
  let runCount = 0;

  assert.throws(
    () =>
      runWorkerSecretSync({
        environment: "staging",
        confirmationToken: "open-sessionboard:staging",
        argv: ["open-sessionboard:staging"],
        readEnvironment: () => ({
          CLOUDFLARE_ACCOUNT_ID: "account-id",
          CLOUDFLARE_API_TOKEN: "cloudflare-token",
          BETTER_AUTH_SECRET: "configured",
        }),
        readState: () => ({}),
        runSecretPut: () => {
          runCount += 1;
        },
        writeState: () => {},
        output: () => {},
      }),
    /OPENSEND_API_KEY is missing from \.env\.cloudflare-staging/,
  );
  assert.equal(runCount, 0);
});

test("uploads only changed secrets and records each successful fingerprint", () => {
  const initialPlan = buildSecretSyncPlan("staging", configuration, {});
  const unchanged = initialPlan[0];
  const state = { [unchanged.key]: unchanged.fingerprint };
  const calls = [];
  const writtenStates = [];
  const output = [];

  const result = runWorkerSecretSync({
    environment: "staging",
    confirmationToken: "open-sessionboard:staging",
    argv: ["open-sessionboard:staging"],
    readEnvironment: () => ({ ...configuration }),
    readState: () => ({ ...state }),
    runSecretPut: (input) => {
      calls.push(input);
    },
    writeState: (nextState) => {
      writtenStates.push({ ...nextState });
    },
    output: (line) => {
      output.push(line);
    },
  });

  assert.equal(result.updated, initialPlan.length - 1);
  assert.equal(result.skipped, 1);
  assert.equal(calls.length, initialPlan.length - 1);
  assert.equal(
    calls.every(
      ({ accountId, apiToken }) =>
        accountId === configuration.CLOUDFLARE_ACCOUNT_ID &&
        apiToken === configuration.CLOUDFLARE_API_TOKEN,
    ),
    true,
  );
  assert.equal(
    calls.every(({ value, args }) => value.length > 0 && !args.includes(value)),
    true,
  );
  assert.equal(writtenStates.length, calls.length);
  assert.equal(output.join("\n").includes(configuration.BETTER_AUTH_SECRET), false);
});

test("dry-run reports changed targets without uploading or writing state", () => {
  let runCount = 0;
  let writeCount = 0;
  const output = [];

  const result = runWorkerSecretSync({
    environment: "production",
    confirmationToken: "open-sessionboard:production",
    argv: ["--dry-run"],
    readEnvironment: () => ({ ...configuration }),
    readState: () => ({}),
    runSecretPut: () => {
      runCount += 1;
    },
    writeState: () => {
      writeCount += 1;
    },
    output: (line) => {
      output.push(line);
    },
  });

  assert.equal(result.updated, 0);
  assert.equal(result.pending, API_SECRET_NAMES.length + WEB_SECRET_NAMES.length);
  assert.equal(runCount, 0);
  assert.equal(writeCount, 0);
  for (const value of Object.values(configuration)) {
    assert.equal(output.join("\n").includes(value), false);
  }
});

test("dry-run lists every missing target without writing anything", () => {
  let runCount = 0;
  let writeCount = 0;
  const output = [];

  assert.throws(
    () =>
      runWorkerSecretSync({
        environment: "staging",
        confirmationToken: "open-sessionboard:staging",
        argv: ["--dry-run"],
        readEnvironment: () => ({
          CLOUDFLARE_ACCOUNT_ID: "account-id",
          CLOUDFLARE_API_TOKEN: "cloudflare-token",
          BETTER_AUTH_SECRET: "configured",
        }),
        readState: () => ({}),
        runSecretPut: () => {
          runCount += 1;
        },
        writeState: () => {
          writeCount += 1;
        },
        output: (line) => {
          output.push(line);
        },
      }),
    /Required values are missing from \.env\.cloudflare-staging/,
  );

  assert.equal(runCount, 0);
  assert.equal(writeCount, 0);
  assert.equal(
    output.filter((line) => line.startsWith("[missing]")).length,
    API_SECRET_NAMES.length - 1 + WEB_SECRET_NAMES.length,
  );
});

test("live synchronization requires the environment confirmation token", () => {
  assert.throws(
    () =>
      runWorkerSecretSync({
        environment: "production",
        confirmationToken: "open-sessionboard:production",
        argv: [],
        readEnvironment: () => ({ ...configuration }),
        readState: () => ({}),
        runSecretPut: () => {},
        writeState: () => {},
        output: () => {},
      }),
    /Confirmation required: open-sessionboard:production/,
  );
});

test("fingerprints are deterministic and do not contain the secret", () => {
  const value = "a-secret-value-that-must-not-be-persisted";
  const fingerprint = fingerprintSecret(value);

  assert.equal(fingerprint, fingerprintSecret(value));
  assert.match(fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(fingerprint.includes(value), false);
});
