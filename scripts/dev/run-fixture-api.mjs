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
const fixtureLine = "RUNTIME_PROFILE=fixture";
const fixtureEnvironment = /^RUNTIME_PROFILE=.*$/m.test(sourceEnvironment)
  ? sourceEnvironment.replace(/^RUNTIME_PROFILE=.*$/m, fixtureLine)
  : `${sourceEnvironment.replace(/\s*$/u, "")}\n${fixtureLine}\n`;
const port = process.env.API_PORT?.trim() || "8787";
if (!/^\d{2,5}$/u.test(port)) throw new Error("API_PORT must be a valid TCP port.");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "eventloom-fixture-"));
const environmentPath = join(temporaryDirectory, "runtime.env");
writeFileSync(environmentPath, fixtureEnvironment, { mode: 0o600 });

const child = spawn(
  "bunx",
  ["wrangler", "dev", "--env-file", environmentPath, "--ip", "127.0.0.1", "--port", port],
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
