import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const apiDirectory = join(repositoryRoot, "apps/api");
let sourceEnvironment;
try {
  sourceEnvironment = readFileSync(join(repositoryRoot, ".env"), "utf8");
} catch (error) {
  if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
  sourceEnvironment = readFileSync(join(repositoryRoot, ".env.example"), "utf8");
}
const port = process.env.API_PORT?.trim() || "8787";
if (!/^\d{2,5}$/u.test(port)) throw new Error("API_PORT must be a valid TCP port.");
const inspectorPort = process.env.API_INSPECTOR_PORT?.trim() || "9232";
if (!/^\d{2,5}$/u.test(inspectorPort)) {
  throw new Error("API_INSPECTOR_PORT must be a valid TCP port.");
}
const apiOrigin = process.env.FIXTURE_API_ORIGIN?.trim() || `http://127.0.0.1:${port}`;
const webOrigin = process.env.FIXTURE_WEB_ORIGIN?.trim() || "http://127.0.0.1:3015";

function withEnvironmentValue(environment, key, value) {
  const line = `${key}=${value}`;
  const matcher = new RegExp(`^${key}=.*$`, "mu");
  return matcher.test(environment)
    ? environment.replace(matcher, line)
    : `${environment.replace(/\s*$/u, "")}\n${line}\n`;
}

const fixtureEnvironment = [
  ["RUNTIME_PROFILE", "fixture"],
  ["BETTER_AUTH_URL", apiOrigin],
  ["API_ORIGIN", apiOrigin],
  ["WEB_ORIGIN", webOrigin],
].reduce(
  (environment, [key, value]) => withEnvironmentValue(environment, key, value),
  sourceEnvironment,
);
const temporaryDirectory = mkdtempSync(join(tmpdir(), "eventloom-fixture-"));
const environmentPath = join(temporaryDirectory, "runtime.env");
writeFileSync(environmentPath, fixtureEnvironment, { mode: 0o600 });

const child = spawn(
  "bunx",
  [
    "wrangler",
    "dev",
    "--env-file",
    environmentPath,
    "--ip",
    "127.0.0.1",
    "--port",
    port,
    "--inspector-port",
    inspectorPort,
    "--persist-to",
    join(temporaryDirectory, "wrangler-state"),
  ],
  { cwd: apiDirectory, env: process.env, stdio: "inherit" },
);

let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("error", () => {
  cleanup();
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  cleanup();
  if (signal !== null) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
