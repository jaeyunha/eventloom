import { spawnSync as run } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const apiDirectory = join(repositoryRoot, "apps/api");
const validator = join(scriptDirectory, "validate-config.mjs");
const allowedEnvironments = new Set(["local", "staging", "production"]);
const environment = process.argv[2] ?? "local";

if (!allowedEnvironments.has(environment)) {
  process.stderr.write("Usage: node scripts/cloudflare/dry-run.mjs [local|staging|production]\n");
  process.exit(1);
}

const validation = run(process.execPath, [validator, "--environment", environment], {
  cwd: repositoryRoot,
  stdio: "inherit",
});
if (validation.status !== 0) {
  process.exit(validation.status ?? 1);
}

const outputDirectory = mkdtempSync(join(tmpdir(), "open-sessionboard-wrangler-"));
const wranglerArguments = ["wrangler", "deploy", "--dry-run", "--outdir", outputDirectory];
if (environment !== "local") {
  wranglerArguments.push("--env", environment);
}

try {
  const result = run("bunx", wranglerArguments, {
    cwd: apiDirectory,
    env: { ...process.env, CLOUDFLARE_API_TOKEN: "" },
    stdio: "inherit",
  });
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(outputDirectory, { force: true, recursive: true });
}
