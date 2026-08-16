import assert from "node:assert/strict";
import test from "node:test";
import { buildApiDeploymentCommands } from "./deploy.mjs";
import { buildOpenNextDeploymentArguments, buildWebDryRunArguments } from "./deploy-web.mjs";

const apiConfig = "/repo/apps/api/wrangler.generated.toml";
const webConfig = "/repo/apps/web/wrangler.generated.jsonc";

test("API validation, migration, and deployment all use the generated config", () => {
  const commands = buildApiDeploymentCommands("production", apiConfig, "/repo/validate.mjs");

  assert.deepEqual(commands.validation.args, [
    "/repo/validate.mjs",
    "--environment",
    "production",
    "--deployment",
    "--config",
    apiConfig,
  ]);
  for (const command of [commands.migrations, commands.deployment]) {
    assert.deepEqual(command.args.slice(-2), ["--config", apiConfig]);
  }
});

test("web dry runs use the generated Wrangler config", () => {
  const args = buildWebDryRunArguments("production", "/tmp/output", webConfig, []);
  assert.deepEqual(args.slice(0, 10), [
    "x",
    "--no-install",
    "wrangler",
    "deploy",
    "--dry-run",
    "--outdir",
    "/tmp/output",
    "--env",
    "production",
    "--config",
  ]);
  assert.equal(args[10], webConfig);
});

test("OpenNext production deployment uses the generated Wrangler config", () => {
  assert.deepEqual(buildOpenNextDeploymentArguments("production", webConfig, []), [
    "x",
    "--no-install",
    "opennextjs-cloudflare",
    "deploy",
    "--env",
    "production",
    "--config",
    webConfig,
  ]);
});
