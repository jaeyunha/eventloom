import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  generatedApiWranglerPath,
  loadCloudflareEnvironment,
  writeApiWrangler,
} from "./config.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const apiDirectory = join(repositoryRoot, "apps/api");
const validator = join(scriptDirectory, "validate-config.mjs");

export function buildApiDeploymentCommands(environment, configPath, validatorPath) {
  return {
    validation: {
      command: process.execPath,
      args: [validatorPath, "--environment", environment, "--deployment", "--config", configPath],
      cwd: repositoryRoot,
    },
    migrations: {
      command: "bunx",
      args: [
        "wrangler",
        "d1",
        "migrations",
        "apply",
        "DB",
        "--remote",
        "--env",
        environment,
        "--config",
        configPath,
      ],
      cwd: apiDirectory,
    },
    deployment: {
      command: "bunx",
      args: ["wrangler", "deploy", "--env", environment, "--config", configPath],
      cwd: apiDirectory,
    },
  };
}

function run(command) {
  const result = spawnSync(command.command, command.args, {
    cwd: command.cwd,
    env: process.env,
    stdio: "inherit",
  });
  return result.status ?? 1;
}

export function main(argv = process.argv.slice(2)) {
  const [environment, confirmation] = argv;
  if (!new Set(["staging", "production"]).has(environment)) {
    process.stderr.write(
      "Usage: node scripts/cloudflare/deploy.mjs <staging|production> open-sessionboard:<environment>\n",
    );
    return 1;
  }

  if (confirmation !== `open-sessionboard:${environment}`) {
    process.stderr.write(
      "Deployment confirmation token does not match the selected environment.\n",
    );
    return 1;
  }

  loadCloudflareEnvironment(environment);
  if (!process.env.CLOUDFLARE_API_TOKEN) {
    process.stderr.write("CLOUDFLARE_API_TOKEN must be supplied by the deployment environment.\n");
    return 1;
  }

  writeApiWrangler(environment, process.env);
  const commands = buildApiDeploymentCommands(environment, generatedApiWranglerPath, validator);
  for (const command of [commands.validation, commands.migrations, commands.deployment]) {
    const status = run(command);
    if (status !== 0) return status;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
