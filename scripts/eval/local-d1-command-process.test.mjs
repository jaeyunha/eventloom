import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  createProcessExecutor,
  ProcessOutputError,
  parseWranglerRows,
} from "./local-d1-command-process.mjs";

function stream() {
  const value = new EventEmitter();
  value.setEncoding = () => {};
  return value;
}

test("process executor uses an argument vector and captures Wrangler output", async () => {
  let invocation;
  const executeProcess = createProcessExecutor((command, args, options) => {
    invocation = { command, args, options };
    const child = new EventEmitter();
    child.stdout = stream();
    child.stderr = stream();
    queueMicrotask(() => {
      child.stdout.emit("data", "stdout");
      child.stderr.emit("data", "stderr");
      child.emit("close", 0);
    });
    return child;
  });

  const result = await executeProcess("bunx", ["wrangler", "d1", "execute", "DB"], {
    cwd: "/repository",
    shell: false,
  });

  assert.deepEqual(invocation, {
    command: "bunx",
    args: ["wrangler", "d1", "execute", "DB"],
    options: {
      cwd: "/repository",
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    },
  });
  assert.deepEqual(result, { exitCode: 0, stdout: "stdout", stderr: "stderr" });
});

test("Wrangler JSON parser accepts results and rejects malformed output", () => {
  assert.deepEqual(parseWranglerRows(JSON.stringify([{ success: true, results: [] }])), []);
  assert.throws(
    () => parseWranglerRows("not JSON"),
    (error) => error instanceof ProcessOutputError,
  );
});
