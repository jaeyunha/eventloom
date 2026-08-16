import { spawn } from "node:child_process";

export class ProcessOutputError extends Error {}

function invalidOutput(message) {
  throw new ProcessOutputError(message);
}

export function parseWranglerRows(stdout) {
  let payload;
  try {
    payload = JSON.parse(stdout);
  } catch {
    invalidOutput("Wrangler returned invalid JSON for the local D1 query.");
  }
  const executions = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.result)
      ? payload.result
      : [payload];
  const rows = [];
  for (const execution of executions) {
    if (execution === null || typeof execution !== "object" || execution.success === false) {
      invalidOutput("Wrangler returned an unsuccessful local D1 query result.");
    }
    if (!Array.isArray(execution.results)) {
      invalidOutput("Wrangler returned an invalid local D1 query result.");
    }
    rows.push(...execution.results);
  }
  return rows;
}

export function isProcessResult(value) {
  return value !== null && typeof value === "object" && Number.isInteger(value.exitCode);
}

export function createProcessExecutor(spawnImplementation = spawn) {
  return function executeProcess(command, args, options) {
    return new Promise((resolveResult, rejectResult) => {
      const child = spawnImplementation(command, args, {
        cwd: options.cwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.once("error", rejectResult);
      child.once("close", (exitCode) => {
        resolveResult({ exitCode: exitCode ?? 1, stdout, stderr });
      });
    });
  };
}

export const defaultProcessExecutor = createProcessExecutor();

export function configuredProcessExecutor(value) {
  if (value === undefined) return defaultProcessExecutor;
  return typeof value === "function" ? value : undefined;
}
