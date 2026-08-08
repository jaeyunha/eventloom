import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const apiDirectory = join(repositoryRoot, "apps/api");
const validator = join(scriptDirectory, "validate-config.mjs");
const environment = process.argv[2];
const confirmation = process.argv[3];

if (!new Set(["staging", "production"]).has(environment)) {
  process.stderr.write(
    "Usage: node scripts/cloudflare/deploy.mjs <staging|production> open-sessionboard:<environment>\n",
  );
  process.exit(1);
}

if (confirmation !== `open-sessionboard:${environment}`) {
  process.stderr.write("Deployment confirmation token does not match the selected environment.\n");
  process.exit(1);
}

if (!process.env.CLOUDFLARE_API_TOKEN) {
  process.stderr.write("CLOUDFLARE_API_TOKEN must be supplied by the deployment environment.\n");
  process.exit(1);
}

const validation = spawnSync(
  process.execPath,
  [validator, "--environment", environment, "--deployment"],
  { cwd: repositoryRoot, stdio: "inherit" },
);
if (validation.status !== 0) {
  process.exit(validation.status ?? 1);
}

const migrations = spawnSync(
  "bunx",
  ["wrangler", "d1", "migrations", "apply", "DB", "--remote", "--env", environment],
  { cwd: apiDirectory, env: process.env, stdio: "inherit" },
);
if (migrations.status !== 0) {
  process.exit(migrations.status ?? 1);
}

const deployment = spawnSync("bunx", ["wrangler", "deploy", "--env", environment], {
  cwd: apiDirectory,
  env: process.env,
  stdio: "inherit",
});
process.exit(deployment.status ?? 1);
