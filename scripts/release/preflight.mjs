#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ENVIRONMENTS,
  PreflightError,
  parseDotEnv,
  parseWranglerInventory,
  validateReleaseConfiguration,
  verifyCloudflare,
  verifyForgePrivacy,
} from "./preflight-lib.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const wranglerPath = join(repositoryRoot, "apps/api/wrangler.toml");

function usage() {
  return [
    "Usage: node scripts/release/preflight.mjs --environment <local|staging|production>",
    "  --env local=<path|-> --env staging=<path|-> --env production=<path|->",
    "  [--require-providers google,microsoft,accelevents] [--offline]",
    "",
    'Use "-" for exactly one environment to read that environment from the current process.',
  ].join("\n");
}

function parseArguments(argv) {
  const options = {
    environment: "",
    environmentSources: {},
    offline: false,
    requiredProviders: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--environment") {
      options.environment = argv[index + 1] ?? "";
      index += 1;
    } else if (argument === "--env") {
      const assignment = argv[index + 1] ?? "";
      index += 1;
      const separator = assignment.indexOf("=");
      if (separator < 1)
        throw new PreflightError("INVALID_ARGUMENT", "--env must be environment=path");
      const environment = assignment.slice(0, separator);
      const path = assignment.slice(separator + 1);
      if (!ENVIRONMENTS.includes(environment) || !path) {
        throw new PreflightError(
          "INVALID_ARGUMENT",
          "--env must name local, staging, or production",
        );
      }
      if (options.environmentSources[environment]) {
        throw new PreflightError("INVALID_ARGUMENT", `Duplicate --env for ${environment}`);
      }
      options.environmentSources[environment] = path;
    } else if (argument === "--require-providers") {
      options.requiredProviders = (argv[index + 1] ?? "")
        .split(",")
        .map((provider) => provider.trim())
        .filter(Boolean);
      index += 1;
    } else if (argument === "--offline") {
      options.offline = true;
    } else if (argument === "--help" || argument === "-h") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    } else {
      throw new PreflightError("INVALID_ARGUMENT", "Unknown preflight argument");
    }
  }

  if (!ENVIRONMENTS.includes(options.environment)) {
    throw new PreflightError("INVALID_ARGUMENT", "--environment is required");
  }
  for (const environment of ENVIRONMENTS) {
    if (!options.environmentSources[environment]) {
      throw new PreflightError("INVALID_ARGUMENT", `--env ${environment}=<path|-> is required`);
    }
  }
  if (Object.values(options.environmentSources).filter((source) => source === "-").length > 1) {
    throw new PreflightError("INVALID_ARGUMENT", 'Only one --env may use "-"');
  }
  return options;
}

function loadConfiguration(environment, source) {
  if (source === "-") return { ...process.env };
  try {
    return parseDotEnv(readFileSync(resolve(source), "utf8"));
  } catch (error) {
    if (error instanceof PreflightError) throw error;
    throw new PreflightError(
      "ENV_FILE_UNREADABLE",
      `Could not read the ${environment} environment file`,
    );
  }
}

function addRuntimeCredentials(configuration) {
  const merged = { ...configuration };
  for (const key of [
    "CLOUDFLARE_API_AUDIT_TOKEN",
    "FORGE_API_TOKEN",
    "FORGE_API_URL",
    "FORGE_REPOSITORY",
  ]) {
    if (typeof process.env[key] === "string" && process.env[key].trim())
      merged[key] = process.env[key];
  }
  return merged;
}

async function run() {
  const options = parseArguments(process.argv.slice(2));
  const configurations = Object.fromEntries(
    ENVIRONMENTS.map((environment) => [
      environment,
      loadConfiguration(environment, options.environmentSources[environment]),
    ]),
  );
  const wranglerInventory = parseWranglerInventory(readFileSync(wranglerPath, "utf8"));
  const validation = validateReleaseConfiguration({
    configurations,
    targetEnvironment: options.environment,
    requiredProviders: options.requiredProviders,
    wranglerInventory,
  });

  const checks = [
    { name: "provider-configuration", status: "passed" },
    { name: "environment-isolation", status: "passed" },
    { name: "wrangler-resources", status: "passed" },
  ];

  if (options.offline) {
    checks.push(
      { name: "cloudflare-token-and-resources", status: "skipped" },
      { name: "forge-privacy", status: "skipped" },
    );
    return {
      ready: false,
      configurationValid: true,
      environment: options.environment,
      online: false,
      providerStates: validation.providerStates[options.environment],
      checks,
    };
  }

  const targetConfiguration = addRuntimeCredentials(configurations[options.environment]);
  await verifyCloudflare({
    configuration: targetConfiguration,
    wrangler: wranglerInventory[options.environment],
  });
  checks.push({ name: "cloudflare-token-and-resources", status: "passed" });
  await verifyForgePrivacy({ configuration: targetConfiguration });
  checks.push({ name: "forge-privacy", status: "passed" });

  return {
    ready: true,
    configurationValid: true,
    environment: options.environment,
    online: true,
    providerStates: validation.providerStates[options.environment],
    checks,
  };
}

try {
  const result = await run();
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const knownError = error instanceof PreflightError;
  process.stderr.write(
    `${JSON.stringify({
      ready: false,
      error: {
        code: knownError ? error.code : "UNEXPECTED_PREFLIGHT_FAILURE",
        message: knownError ? error.message : "Unexpected preflight failure",
      },
    })}\n`,
  );
  process.exitCode = 1;
}
