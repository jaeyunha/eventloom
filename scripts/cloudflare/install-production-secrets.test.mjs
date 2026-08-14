import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  API_SECRET_NAMES,
  API_WORKER,
  buildProductionSecretCommands,
  FORBIDDEN_SECRET_NAMES,
  formatCommand,
  main,
  runCli,
  WEB_SECRET_NAMES,
  WEB_WORKER,
} from "./install-production-secrets.mjs";

const expectedInstallations = [
  [API_WORKER, "BETTER_AUTH_SECRET"],
  [API_WORKER, "OPENSEND_API_KEY"],
  [API_WORKER, "OPENAI_API_KEY"],
  [API_WORKER, "AIRTABLE_OAUTH_CLIENT_SECRET"],
  [API_WORKER, "AIRTABLE_CREDENTIAL_ENCRYPTION_KEY"],
  [API_WORKER, "CACHE_INVALIDATION_TOKEN"],
  [WEB_WORKER, "CACHE_INVALIDATION_TOKEN"],
];

const expectedCommands = expectedInstallations.map(
  ([worker, secret]) => `bunx wrangler secret put ${secret} --name ${worker}`,
);

test("builds the complete production installation plan in API-then-web order", () => {
  assert.deepEqual(API_SECRET_NAMES, [
    "BETTER_AUTH_SECRET",
    "OPENSEND_API_KEY",
    "OPENAI_API_KEY",
    "AIRTABLE_OAUTH_CLIENT_SECRET",
    "AIRTABLE_CREDENTIAL_ENCRYPTION_KEY",
    "CACHE_INVALIDATION_TOKEN",
  ]);
  assert.deepEqual(WEB_SECRET_NAMES, ["CACHE_INVALIDATION_TOKEN"]);

  const commands = buildProductionSecretCommands();
  assert.deepEqual(
    commands.map(({ worker, secret }) => [worker, secret]),
    expectedInstallations,
  );
  assert.deepEqual(commands.map(formatCommand), expectedCommands);
  for (const command of commands) {
    assert.equal(command.command, "bunx");
    assert.deepEqual(command.args.slice(0, 4), ["wrangler", "secret", "put", command.secret]);
    assert.deepEqual(command.args.slice(4), ["--name", command.worker]);
  }
});

test("excludes Cloudflare credentials, Airtable access tokens, and R2 credentials", () => {
  const installedSecrets = new Set(buildProductionSecretCommands().map(({ secret }) => secret));

  assert.deepEqual(FORBIDDEN_SECRET_NAMES, [
    "CLOUDFLARE_API_TOKEN",
    "AIRTABLE_ACCESS_TOKEN",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
  ]);
  for (const secret of FORBIDDEN_SECRET_NAMES) assert.equal(installedSecrets.has(secret), false);
});

test("direct CLI dry run does not read live environment values or invoke Wrangler", () => {
  let output = "";
  let invocations = 0;
  const environment = new Proxy(
    {},
    {
      get: () => assert.fail("dry run must not read live environment values"),
    },
  );
  const status = runCli(["--dry-run"], {
    environment,
    run: () => {
      invocations += 1;
      return { status: 0 };
    },
    write: (message) => {
      output += message;
    },
    writeError: () => assert.fail("dry run must not write an error"),
  });

  assert.equal(status, 0);
  assert.equal(invocations, 0);
  assert.deepEqual(
    output.split("\n").filter((line) => line.startsWith("bunx wrangler secret put ")),
    expectedCommands,
  );
});

test("direct CLI help does not read live environment values", () => {
  let invocations = 0;
  const environment = new Proxy(
    {},
    {
      get: () => assert.fail("help must not read live environment values"),
    },
  );
  const status = runCli(["--help"], {
    environment,
    run: () => {
      invocations += 1;
      return { status: 0 };
    },
    write: () => {},
    writeError: () => assert.fail("help must not write an error"),
  });

  assert.equal(status, 0);
  assert.equal(invocations, 0);
});

test("direct CLI live installation uses explicit Cloudflare account and token values", () => {
  const invocations = [];
  const status = runCli([], {
    environment: {
      CLOUDFLARE_ACCOUNT_ID: "test-account",
      CLOUDFLARE_API_TOKEN: "test-token",
    },
    run: (command) => {
      invocations.push(command);
      return { status: 0 };
    },
    write: () => {},
    writeError: () => {},
  });

  assert.equal(status, 0);
  assert.deepEqual(invocations.map(formatCommand), expectedCommands);
});

test("requires the production Cloudflare account before it invokes Wrangler", () => {
  let invocations = 0;
  const status = main([], {
    environment: { CLOUDFLARE_API_TOKEN: "test-token" },
    run: () => {
      invocations += 1;
      return { status: 0 };
    },
    write: () => {},
    writeError: () => {},
  });

  assert.equal(status, 1);
  assert.equal(invocations, 0);
});

test("requires the CLI token before it invokes Wrangler", () => {
  let invocations = 0;
  const status = main([], {
    environment: { CLOUDFLARE_ACCOUNT_ID: "test-account" },
    run: () => {
      invocations += 1;
      return { status: 0 };
    },
    write: () => {},
    writeError: () => {},
  });

  assert.equal(status, 1);
  assert.equal(invocations, 0);
});

test("runs each prompt-backed installation sequentially without passing secret values", () => {
  const invocations = [];
  const status = main([], {
    environment: {
      CLOUDFLARE_ACCOUNT_ID: "test-account",
      CLOUDFLARE_API_TOKEN: "cloudflare-cli-token",
      BETTER_AUTH_SECRET: "must-not-be-passed",
      OPENSEND_API_KEY: "must-not-be-passed",
      OPENAI_API_KEY: "must-not-be-passed",
      AIRTABLE_OAUTH_CLIENT_SECRET: "must-not-be-passed",
      AIRTABLE_CREDENTIAL_ENCRYPTION_KEY: "must-not-be-passed",
      CACHE_INVALIDATION_TOKEN: "must-not-be-passed",
    },
    run: (command) => {
      invocations.push(command);
      return { status: 0 };
    },
    write: () => {},
    writeError: () => {},
  });

  assert.equal(status, 0);
  assert.deepEqual(invocations.map(formatCommand), expectedCommands);
  for (const command of invocations) {
    assert.equal(command.args.includes("must-not-be-passed"), false);
  }
});

test("uses Wrangler's inherited prompt and never reads or writes environment files", () => {
  const source = readFileSync(new URL("./install-production-secrets.mjs", import.meta.url), "utf8");

  assert.match(source, /spawnSync\(command\.command, command\.args, \{ stdio: "inherit" \}\)/);
  assert.doesNotMatch(
    source,
    /(?:loadCloudflareEnvironment|\.env\.cloudflare-production|readFileSync|writeFileSync|appendFileSync|createWriteStream|process\.stdin)/,
  );
});
