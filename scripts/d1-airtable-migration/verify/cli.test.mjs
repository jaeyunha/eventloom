import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { HELP, runCli } from "./cli.mjs";

const cliPath = fileURLToPath(new URL("./cli.mjs", import.meta.url));

function invoke(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("CLI help documents comparison, cutover states, rollback boundary, and adapter safety", async () => {
  const output = [];
  assert.equal(await runCli(["--help"], { stdout: (line) => output.push(line) }), 0);
  assert.equal(output[0], HELP.trimEnd());
  assert.match(output[0], /shadow -> read-d1 -> write-d1/);
  assert.match(output[0], /write-d1 rollback is deliberately blocked/);
  assert.match(output[0], /no remote writes without this explicit injected module/);

  const processResult = await invoke(["--help"]);
  assert.equal(processResult.code, 0);
  assert.equal(processResult.stderr, "");
  assert.match(processResult.stdout, /^D1\/Airtable shadow verification/);
});

test("CLI rejects bad input with non-zero status and no stack trace", async () => {
  const unknown = await invoke(["unknown"]);
  assert.equal(unknown.code, 1);
  assert.equal(unknown.stdout, "");
  assert.match(unknown.stderr, /Unknown command: unknown/);
  assert.doesNotMatch(unknown.stderr, /\n\s+at /);

  const missing = await invoke(["compare", "--source", "missing.json"]);
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /Missing required --target option/);

  const invalidState = await invoke([
    "transition",
    "--tenant",
    "tenant-1",
    "--to",
    "shadow",
    "--reason",
    "bad",
    "--adapter",
    "missing.mjs",
  ]);
  assert.equal(invalidState.code, 1);
  assert.match(invalidState.stderr, /--to must be read-d1 or write-d1/);
});

test("CLI comparison returns zero for zero drift and two for unexplained drift", async () => {
  const source = fileURLToPath(new URL("./fixtures/zero-drift-source.json", import.meta.url));
  const target = fileURLToPath(new URL("./fixtures/zero-drift-target.json", import.meta.url));
  const drifted = fileURLToPath(new URL("./fixtures/explained-drift-target.json", import.meta.url));
  const explanations = fileURLToPath(new URL("./fixtures/explanations.json", import.meta.url));

  const clean = await invoke(["compare", "--source", source, "--target", target, "--json"]);
  assert.equal(clean.code, 0);
  assert.equal(JSON.parse(clean.stdout).status, "match");

  const unexplained = await invoke(["compare", "--source", source, "--target", drifted]);
  assert.equal(unexplained.code, 2);
  assert.match(unexplained.stdout, /UNEXPLAINED/);

  const explained = await invoke([
    "compare",
    "--source",
    source,
    "--target",
    drifted,
    "--explanations",
    explanations,
  ]);
  assert.equal(explained.code, 0);
  assert.match(explained.stdout, /explained: Approved title normalization/);
});
