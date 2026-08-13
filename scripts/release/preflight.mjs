#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderApiWrangler } from "../cloudflare/config.mjs";
import {
  ENVIRONMENTS,
  inspectOrganizationIdMigrationReadiness,
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
    "  [--require-providers accelevents] [--migration-report <path|->] [--offline]",
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
    migrationReportSource: "",
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
    } else if (argument === "--migration-report") {
      const source = argv[index + 1] ?? "";
      index += 1;
      if (!source) {
        throw new PreflightError(
          "INVALID_ARGUMENT",
          "--migration-report must name a JSON file or '-'",
        );
      }
      if (options.migrationReportSource) {
        throw new PreflightError("INVALID_ARGUMENT", "Duplicate --migration-report");
      }
      options.migrationReportSource = source;
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
function loadMigrationReport(source) {
  if (!source) return undefined;
  let serialized;
  try {
    serialized = source === "-" ? readFileSync(0, "utf8") : readFileSync(resolve(source), "utf8");
  } catch {
    throw new PreflightError(
      "MIGRATION_REPORT_UNREADABLE",
      "Could not read the organization ID migration report",
    );
  }
  if (Buffer.byteLength(serialized, "utf8") > 256 * 1024) {
    throw new PreflightError(
      "INVALID_MIGRATION_REPORT",
      "Migration report exceeds the bounded evidence limit",
    );
  }
  try {
    return JSON.parse(serialized);
  } catch {
    throw new PreflightError("INVALID_MIGRATION_REPORT", "Migration report must be valid JSON");
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
  const migrationReport = loadMigrationReport(options.migrationReportSource);
  const wranglerTemplate = readFileSync(wranglerPath, "utf8");
  const renderedWrangler = renderApiWrangler(
    renderApiWrangler(wranglerTemplate, "staging", configurations.staging),
    "production",
    configurations.production,
  );
  const wranglerInventory = parseWranglerInventory(renderedWrangler);
  const validation = validateReleaseConfiguration({
    configurations,
    targetEnvironment: options.environment,
    requiredProviders: options.requiredProviders,
    wranglerInventory,
  });
  const migrationReadiness = inspectOrganizationIdMigrationReadiness({
    configurations,
    wranglerInventory,
    migrationReport,
  });

  const checks = [
    { name: "provider-configuration", status: "passed" },
    { name: "environment-isolation", status: "passed" },
    { name: "wrangler-resources", status: "passed" },
    { name: "organization-id-migration-readiness", status: migrationReadiness.status },
  ];

  if (options.offline) {
    checks.push(
      { name: "cloudflare-token-and-resources", status: "skipped" },
      { name: "forge-repository", status: "skipped" },
    );
    return {
      ready: false,
      configurationValid: true,
      environment: options.environment,
      online: false,
      providerStates: validation.providerStates[options.environment],
      migrationReadiness,
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
  checks.push({ name: "forge-repository", status: "passed" });

  return {
    ready: migrationReadiness.ready,
    configurationValid: true,
    environment: options.environment,
    online: true,
    providerStates: validation.providerStates[options.environment],
    migrationReadiness,
    checks,
  };
}

try {
  const result = await run();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ready && result.online) process.exitCode = 1;
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
