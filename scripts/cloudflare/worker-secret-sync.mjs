import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflareEnvironmentPath, readCloudflareEnvironmentFile } from "./config.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(scriptDirectory, "../..");

export const API_SECRET_NAMES = Object.freeze([
  "BETTER_AUTH_SECRET",
  "OPENSEND_API_KEY",
  "OPENAI_API_KEY",
  "AIRTABLE_OAUTH_CLIENT_SECRET",
  "AIRTABLE_CREDENTIAL_ENCRYPTION_KEY",
  "CACHE_INVALIDATION_TOKEN",
]);

export const WEB_SECRET_NAMES = Object.freeze(["CACHE_INVALIDATION_TOKEN"]);

const requiredConfigurationNames = Object.freeze([
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  ...API_SECRET_NAMES,
]);

function isNonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function nonEmpty(configuration, name, environment) {
  const value = configuration[name];
  if (!isNonEmpty(value)) {
    throw new Error(`${name} is missing from .env.cloudflare-${environment}`);
  }
  return value;
}

function parseArguments(confirmationToken, argv) {
  const options = {
    dryRun: false,
    force: false,
    help: false,
  };
  const positional = [];

  for (const argument of argv) {
    if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--force") options.force = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument.startsWith("-")) throw new Error(`Unknown option: ${argument}`);
    else positional.push(argument);
  }

  if (positional.length > 1) {
    throw new Error(`Unexpected arguments: ${positional.slice(1).join(" ")}`);
  }
  if (!options.dryRun && !options.help && positional[0] !== confirmationToken) {
    throw new Error(`Confirmation required: ${confirmationToken}`);
  }

  return options;
}

function targetsFor(environment) {
  const apiWorker = `open-sessionboard-api-${environment}`;
  const webWorker = `open-sessionboard-web-${environment}`;
  return [
    ...API_SECRET_NAMES.map((secret) => ({ worker: apiWorker, secret })),
    ...WEB_SECRET_NAMES.map((secret) => ({ worker: webWorker, secret })),
  ];
}

export function fingerprintSecret(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function secretStatePath(environment, rootPath = repositoryRoot) {
  return join(rootPath, `.cloudflare-secret-fingerprints-${environment}.json`);
}

export function buildSecretSyncPlan(
  environment,
  configuration,
  fingerprints,
  { allowMissing = false, force = false } = {},
) {
  return targetsFor(environment).map(({ worker, secret }) => {
    const value = configuration[secret];
    const key = `${worker}:${secret}`;
    if (allowMissing && !isNonEmpty(value)) {
      return {
        action: "missing",
        fingerprint: null,
        key,
        secret,
        worker,
      };
    }
    const fingerprint = fingerprintSecret(value);
    return {
      action: force || fingerprints[key] !== fingerprint ? "update" : "skip",
      fingerprint,
      key,
      secret,
      worker,
    };
  });
}

function readSecretState(environment, path = secretStatePath(environment)) {
  if (!existsSync(path)) return {};
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (
    parsed?.schemaVersion !== 1 ||
    parsed.environment !== environment ||
    !parsed.fingerprints ||
    typeof parsed.fingerprints !== "object" ||
    Array.isArray(parsed.fingerprints)
  ) {
    throw new Error(`Invalid secret fingerprint state: ${path}`);
  }
  return parsed.fingerprints;
}

function writeSecretState(environment, fingerprints, path = secretStatePath(environment)) {
  const temporaryPath = `${path}.${process.pid}.tmp`;
  writeFileSync(
    temporaryPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        environment,
        fingerprints,
      },
      null,
      2,
    )}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  renameSync(temporaryPath, path);
  chmodSync(path, 0o600);
}

function runWranglerSecretPut({ accountId, apiToken, args, value }) {
  const result = spawnSync("bunx", ["wrangler", ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      CLOUDFLARE_ACCOUNT_ID: accountId,
      CLOUDFLARE_API_TOKEN: apiToken,
    },
    input: value,
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`wrangler ${args.join(" ")} failed with status ${result.status}`);
  }
}

function usage(environment, confirmationToken) {
  const script = `cloudflare:secrets:${environment}`;
  return [
    `Usage: bun run ${script} -- --dry-run [--force]`,
    `       bun run ${script} -- ${confirmationToken} [--force]`,
    "",
    `Source: ${cloudflareEnvironmentPath(environment)}`,
    `State:  ${secretStatePath(environment)}`,
    "",
    "--force uploads every target and refreshes the local fingerprint ledger.",
  ].join("\n");
}

export function runWorkerSecretSync({
  environment,
  confirmationToken,
  argv = process.argv.slice(2),
  readEnvironment = readCloudflareEnvironmentFile,
  readState = () => readSecretState(environment),
  runSecretPut = runWranglerSecretPut,
  writeState = (fingerprints) => writeSecretState(environment, fingerprints),
  output = console.log,
}) {
  const options = parseArguments(confirmationToken, argv);
  if (options.help) {
    output(usage(environment, confirmationToken));
    return { pending: 0, skipped: 0, updated: 0 };
  }

  const configuration = readEnvironment(environment);
  const missingNames = requiredConfigurationNames.filter(
    (name) => !isNonEmpty(configuration[name]),
  );
  if (!options.dryRun && missingNames.length > 0) {
    nonEmpty(configuration, missingNames[0], environment);
  }

  const fingerprints = readState();
  const plan = buildSecretSyncPlan(environment, configuration, fingerprints, {
    ...options,
    allowMissing: options.dryRun,
  });
  output(`Worker secret sync: ${environment}`);
  for (const item of plan) {
    output(`[${item.action}] ${item.worker} ${item.secret}`);
  }

  const pending = plan.filter(({ action }) => action === "update").length;
  const missing = plan.filter(({ action }) => action === "missing").length;
  const skipped = plan.length - pending - missing;
  if (options.dryRun) {
    output(`Dry run complete: ${pending} update(s), ${skipped} unchanged, ${missing} missing.`);
    if (missingNames.length > 0) {
      throw new Error(
        `Required values are missing from .env.cloudflare-${environment}: ${missingNames.join(", ")}`,
      );
    }
    return { pending, skipped, updated: 0 };
  }

  const accountId = configuration.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = configuration.CLOUDFLARE_API_TOKEN;
  let updated = 0;
  const nextFingerprints = { ...fingerprints };

  for (const item of plan) {
    if (item.action === "skip") continue;
    const args = ["secret", "put", item.secret, "--name", item.worker];
    runSecretPut({
      accountId,
      apiToken,
      args,
      value: configuration[item.secret],
    });
    nextFingerprints[item.key] = item.fingerprint;
    writeState(nextFingerprints);
    updated += 1;
    output(`[updated] ${item.worker} ${item.secret}`);
  }

  output(`Secret sync complete: ${updated} updated, ${skipped} unchanged.`);
  return { pending: 0, skipped, updated };
}
