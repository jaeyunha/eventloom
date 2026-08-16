#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  AgendaBackfillError,
  createWranglerD1Adapter,
  HELP_TEXT,
  parseBackfillArguments,
  runAgendaBackfill,
} from "./backfill-lib.mjs";

function executeWrangler(command, arguments_) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, { stdio: ["ignore", "pipe", "pipe"] });
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
    child.once("error", reject);
    child.once("close", (exitCode) => {
      resolve({ exitCode: exitCode ?? 1, stdout, stderr });
    });
  });
}

export async function runBackfillCli({
  arguments: arguments_ = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr,
  adapter,
  execute = executeWrangler,
} = {}) {
  try {
    const options = parseBackfillArguments(arguments_);
    if (options.help) {
      stdout.write(HELP_TEXT);
      return 0;
    }
    const d1Adapter = adapter ?? createWranglerD1Adapter(options, { execute });
    const result = await runAgendaBackfill({ adapter: d1Adapter, mode: options.mode });
    stdout.write(
      `${JSON.stringify({ target: options.target, database: options.database, ...result }, null, 2)}\n`,
    );
    return 0;
  } catch (error) {
    const code = error instanceof AgendaBackfillError ? error.code : "UNEXPECTED_BACKFILL_FAILURE";
    const message = error instanceof Error ? error.message : "Unexpected agenda backfill failure.";
    stderr.write(`${code}: ${message}\n`);
    return 1;
  }
}

const entryPoint = process.argv[1] === fileURLToPath(import.meta.url);
if (entryPoint) process.exitCode = await runBackfillCli();
