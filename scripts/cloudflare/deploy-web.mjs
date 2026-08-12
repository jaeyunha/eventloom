import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const webDirectory = join(repositoryRoot, "apps/web");

const environments = {
  local: {
    workerName: "open-sessionboard-web-local",
    appOrigin: "http://localhost:3015",
    apiOrigin: "http://localhost:8787",
  },
  staging: {
    workerName: "open-sessionboard-web-staging",
    appOrigin: "https://open-sessionboard-web-staging.ashleyha0317.workers.dev",
    apiOrigin: "https://open-sessionboard-api-staging.ashleyha0317.workers.dev",
  },
  production: {
    workerName: "open-sessionboard-web-production",
    appOrigin: "https://open-sessionboard-web-production.ashleyha0317.workers.dev",
    apiOrigin: "https://open-sessionboard-api-production.ashleyha0317.workers.dev",
  },
};

function usage() {
  return [
    "Usage:",
    "  node scripts/cloudflare/deploy-web.mjs <staging|production> open-sessionboard-web:<environment>",
    "  node scripts/cloudflare/deploy-web.mjs <local|staging|production> --dry-run",
    "",
    "Required deployment variables:",
    "  NEXT_PUBLIC_APP_URL   The exact HTTPS workers.dev origin for staging/production.",
    "  API_UPSTREAM_ORIGIN   The exact HTTPS origin of the separate API Worker.",
  ].join("\n");
}

function parseArguments(argv) {
  let environment;
  let confirmation;
  let dryRun = false;

  for (const argument of argv) {
    if (argument === "--help" || argument === "-h") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    }
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (argument.startsWith("--")) {
      throw new Error(`Unknown option: ${argument}\n\n${usage()}`);
    }
    if (!environment) {
      environment = argument;
      continue;
    }
    if (!confirmation) {
      confirmation = argument;
      continue;
    }
    throw new Error(`Unexpected argument: ${argument}\n\n${usage()}`);
  }

  if (!environment || !Object.hasOwn(environments, environment)) {
    throw new Error(`Environment must be one of: local, staging, production\n\n${usage()}`);
  }
  if (!dryRun && environment === "local") {
    throw new Error("The local environment is available only for dry runs.");
  }

  return { confirmation, dryRun, environment };
}

function parseOrigin(value, label, { cloudflareWorker = false, local = false, workerName } = {}) {
  if (!value) {
    throw new Error(`${label} must be supplied without printing its value.`);
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }

  if (
    parsed.origin !== value ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== "/" && parsed.pathname !== "")
  ) {
    throw new Error(`${label} must contain only an origin with no path, query, or credentials.`);
  }

  if (local) {
    if (
      !["localhost", "127.0.0.1"].includes(parsed.hostname) ||
      !["http:", "https:"].includes(parsed.protocol)
    ) {
      throw new Error(`${label} must use localhost or 127.0.0.1 for local dry runs.`);
    }
    return parsed.origin;
  }

  if (parsed.protocol !== "https:") {
    throw new Error(`${label} must use HTTPS outside local dry runs.`);
  }

  if (cloudflareWorker) {
    const hostname = parsed.hostname.toLowerCase();
    const labels = hostname.split(".");
    if (
      !hostname.endsWith(".workers.dev") ||
      labels.length < 3 ||
      (workerName && labels[0] !== workerName)
    ) {
      throw new Error(`${label} must be the deployed ${workerName ?? ""} workers.dev hostname.`);
    }
  }

  return parsed.origin;
}

function resolveOrigins(environment) {
  const defaults = environments[environment];
  if (environment === "local") {
    return {
      appOrigin: parseOrigin(
        process.env.NEXT_PUBLIC_APP_URL ?? defaults.appOrigin,
        "NEXT_PUBLIC_APP_URL",
        { local: true },
      ),
      apiOrigin: parseOrigin(
        process.env.API_UPSTREAM_ORIGIN ?? defaults.apiOrigin,
        "API_UPSTREAM_ORIGIN",
        { local: true },
      ),
    };
  }

  const appOrigin = parseOrigin(process.env.NEXT_PUBLIC_APP_URL, "NEXT_PUBLIC_APP_URL");
  const apiOrigin = parseOrigin(process.env.API_UPSTREAM_ORIGIN, "API_UPSTREAM_ORIGIN");
  if (appOrigin !== defaults.appOrigin || apiOrigin !== defaults.apiOrigin) {
    throw new Error(
      "NEXT_PUBLIC_APP_URL and API_UPSTREAM_ORIGIN must match the pinned web/API origins for this environment.",
    );
  }
  return { appOrigin, apiOrigin };
}

function run(command, args, options) {
  const result = spawnSync(command, args, {
    ...options,
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args[0] ?? "command"} failed with exit code ${result.status ?? 1}.`,
    );
  }
}

function containsWorkerArtifact(directory) {
  if (!existsSync(directory)) {
    return false;
  }
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isFile() && /^(?:worker|index)\.(?:js|mjs)$/.test(entry.name)) {
      return true;
    }
    if (entry.isDirectory() && containsWorkerArtifact(join(directory, entry.name))) {
      return true;
    }
  }
  return false;
}

function deploymentEnvironment(environment, origins) {
  return {
    ...process.env,
    APP_ENV: environment,
    API_UPSTREAM_ORIGIN: origins.apiOrigin,
    NEXT_PUBLIC_APP_ENV: environment,
    NEXT_PUBLIC_APP_URL: origins.appOrigin,
  };
}

function wranglerVariables(environment, origins) {
  return [
    "--var",
    `APP_ENV:${environment}`,
    "--var",
    `API_UPSTREAM_ORIGIN:${origins.apiOrigin}`,
    "--var",
    `NEXT_PUBLIC_APP_ENV:${environment}`,
    "--var",
    `NEXT_PUBLIC_APP_URL:${origins.appOrigin}`,
  ];
}

function main() {
  const { confirmation, dryRun, environment } = parseArguments(process.argv.slice(2));
  const origins = resolveOrigins(environment);
  if (origins.appOrigin === origins.apiOrigin) {
    throw new Error("NEXT_PUBLIC_APP_URL and API_UPSTREAM_ORIGIN must identify separate services.");
  }

  if (!dryRun) {
    const expectedConfirmation = `open-sessionboard-web:${environment}`;
    if (confirmation !== expectedConfirmation) {
      throw new Error("Deployment confirmation token does not match the selected environment.");
    }
    if (!process.env.CLOUDFLARE_API_TOKEN) {
      throw new Error("CLOUDFLARE_API_TOKEN must be supplied by the deployment environment.");
    }
  }

  const env = deploymentEnvironment(environment, origins);
  run("bun", ["run", "cloudflare:build"], {
    cwd: webDirectory,
    env,
  });

  const vars = wranglerVariables(environment, origins);
  if (dryRun) {
    const outputDirectory = mkdtempSync(join(tmpdir(), "open-sessionboard-web-wrangler-"));
    try {
      const wranglerArgs = [
        "x",
        "wrangler",
        "deploy",
        "--dry-run",
        "--outdir",
        outputDirectory,
        ...(environment === "local" ? [] : ["--env", environment]),
        ...vars,
      ];
      run("bun", wranglerArgs, {
        cwd: webDirectory,
        env: { ...env, CLOUDFLARE_API_TOKEN: "" },
      });
      if (!containsWorkerArtifact(outputDirectory)) {
        throw new Error("Wrangler dry run did not produce a Worker artifact.");
      }
      process.stdout.write(
        `${JSON.stringify({
          dryRun: true,
          environment,
          worker: environments[environment].workerName,
          contract: "open-next-worker-and-static-assets",
        })}\n`,
      );
    } finally {
      rmSync(outputDirectory, { force: true, recursive: true });
    }
    return;
  }

  const deployArgs = [
    "x",
    "--no-install",
    "opennextjs-cloudflare",
    "deploy",
    "--env",
    environment,
    ...vars,
  ];
  run("bun", deployArgs, { cwd: webDirectory, env });
  process.stdout.write(
    `${JSON.stringify({
      deployed: true,
      environment,
      worker: environments[environment].workerName,
    })}\n`,
  );
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown deployment failure.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
