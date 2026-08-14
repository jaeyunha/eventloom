import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  generatedWebWranglerPath,
  loadCloudflareEnvironment,
  resolveWebDeployment,
  writeWebWrangler,
} from "./config.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const webDirectory = join(repositoryRoot, "apps/web");
const environments = new Set(["local", "staging", "production"]);

function usage() {
  return [
    "Usage:",
    "  node scripts/cloudflare/deploy-web.mjs <staging|production> open-sessionboard-web:<environment>",
    "  node scripts/cloudflare/deploy-web.mjs <local|staging|production> --dry-run",
    "",
    "Required deployment variables:",
    "  NEXT_PUBLIC_APP_URL   The deployed HTTPS web origin for staging/production.",
    "  API_UPSTREAM_ORIGIN   The exact HTTPS origin of the separate API Worker.",
    "  WEB_HOSTNAME          The production web custom-domain hostname.",
    "  WEB_ZONE_NAME         The operator-owned Cloudflare zone containing WEB_HOSTNAME.",
  ].join("\n");
}

function parseArguments(argv) {
  let environment;
  let confirmation;
  let dryRun = false;

  for (const argument of argv) {
    if (argument === "--help" || argument === "-h") return { help: true };
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (argument.startsWith("--")) throw new Error(`Unknown option: ${argument}\n\n${usage()}`);
    if (!environment) environment = argument;
    else if (!confirmation) confirmation = argument;
    else throw new Error(`Unexpected argument: ${argument}\n\n${usage()}`);
  }

  if (!environment || !environments.has(environment)) {
    throw new Error(`Environment must be one of: local, staging, production\n\n${usage()}`);
  }
  if (!dryRun && environment === "local") {
    throw new Error("The local environment is available only for dry runs.");
  }
  return { confirmation, dryRun, environment, help: false };
}

function parseOrigin(value, label, { local = false } = {}) {
  if (!value) throw new Error(`${label} must be supplied without printing its value.`);
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
  if (parsed.protocol !== "https:")
    throw new Error(`${label} must use HTTPS outside local dry runs.`);
  return parsed.origin;
}

function resolveOrigins(environment) {
  const deployment = resolveWebDeployment(environment, process.env);
  if (environment !== "local") return deployment;
  return {
    ...deployment,
    appOrigin: parseOrigin(
      process.env.NEXT_PUBLIC_APP_URL ?? deployment.appOrigin,
      "NEXT_PUBLIC_APP_URL",
      { local: true },
    ),
    apiOrigin: parseOrigin(
      process.env.API_UPSTREAM_ORIGIN ?? deployment.apiOrigin,
      "API_UPSTREAM_ORIGIN",
      { local: true },
    ),
  };
}

function run(command, args, options) {
  const result = spawnSync(command, args, { ...options, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args[0] ?? "command"} failed with exit code ${result.status ?? 1}.`,
    );
  }
}

function containsWorkerArtifact(directory) {
  if (!existsSync(directory)) return false;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isFile() && /^(?:worker|index)\.(?:js|mjs)$/.test(entry.name)) return true;
    if (entry.isDirectory() && containsWorkerArtifact(join(directory, entry.name))) return true;
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

function localWranglerVariables(environment, origins) {
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

export function buildWebDryRunArguments(environment, outputDirectory, configPath, variables) {
  return [
    "x",
    "wrangler",
    "deploy",
    "--dry-run",
    "--outdir",
    outputDirectory,
    ...(environment === "local" ? [] : ["--env", environment, "--config", configPath]),
    ...variables,
  ];
}

export function buildOpenNextDeploymentArguments(environment, configPath, variables) {
  return [
    "x",
    "--no-install",
    "opennextjs-cloudflare",
    "deploy",
    "--env",
    environment,
    "--config",
    configPath,
    ...variables,
  ];
}

export function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArguments(argv);
    if (options.help) {
      process.stdout.write(`${usage()}\n`);
      return 0;
    }
    const { confirmation, dryRun, environment } = options;
    loadCloudflareEnvironment(environment);
    const origins = resolveOrigins(environment);
    if (origins.appOrigin === origins.apiOrigin) {
      throw new Error(
        "NEXT_PUBLIC_APP_URL and API_UPSTREAM_ORIGIN must identify separate services.",
      );
    }
    if (!dryRun) {
      if (confirmation !== `open-sessionboard-web:${environment}`) {
        throw new Error("Deployment confirmation token does not match the selected environment.");
      }
      if (!process.env.CLOUDFLARE_API_TOKEN) {
        throw new Error("CLOUDFLARE_API_TOKEN must be supplied by the deployment environment.");
      }
    }

    const configPath =
      environment === "local"
        ? undefined
        : writeWebWrangler(environment, process.env, generatedWebWranglerPath);
    const env = deploymentEnvironment(environment, origins);
    run("bun", ["run", "cloudflare:build"], { cwd: webDirectory, env });
    const generatedOutput = join(webDirectory, ".open-next");
    if (!existsSync(generatedOutput)) throw new Error("OpenNext build output was not created.");

    const variables = environment === "local" ? localWranglerVariables(environment, origins) : [];
    const deployment = resolveWebDeployment(environment, process.env);
    if (dryRun) {
      const outputDirectory = mkdtempSync(join(tmpdir(), "open-sessionboard-web-wrangler-"));
      try {
        run("bun", buildWebDryRunArguments(environment, outputDirectory, configPath, variables), {
          cwd: webDirectory,
          env: { ...env, CI: "1", CLOUDFLARE_API_TOKEN: "" },
        });
        if (!containsWorkerArtifact(outputDirectory)) {
          throw new Error("Wrangler dry run did not produce a Worker artifact.");
        }
        process.stdout.write(
          `${JSON.stringify({
            dryRun: true,
            environment,
            worker: deployment.workerName,
            contract: "open-next-worker-and-static-assets",
          })}\n`,
        );
      } finally {
        rmSync(outputDirectory, { force: true, recursive: true });
        rmSync(generatedOutput, { force: true, recursive: true });
      }
      return 0;
    }

    try {
      run("bun", buildOpenNextDeploymentArguments(environment, configPath, variables), {
        cwd: webDirectory,
        env,
      });
    } finally {
      rmSync(generatedOutput, { force: true, recursive: true });
    }
    process.stdout.write(
      `${JSON.stringify({ deployed: true, environment, worker: deployment.workerName })}\n`,
    );
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown deployment failure.";
    process.stderr.write(`${message}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
