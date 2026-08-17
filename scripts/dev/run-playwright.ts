import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface PlaywrightCommand {
  readonly command: "node";
  readonly args: readonly string[];
  readonly cwd: string;
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const playwrightCliPath = resolve(repositoryRoot, "node_modules/@playwright/test/cli.js");

export function playwrightCommand(arguments_: readonly string[]): PlaywrightCommand {
  return {
    command: "node",
    args: [playwrightCliPath, "test", ...arguments_],
    cwd: repositoryRoot,
  };
}

if (import.meta.main) {
  const command = playwrightCommand(process.argv.slice(2));
  const child = spawn(command.command, [...command.args], {
    cwd: command.cwd,
    env: process.env,
    stdio: "inherit",
  });
  child.once("error", (error) => {
    process.stderr.write(`Failed to start Playwright: ${error.message}\n`);
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    if (signal !== null) {
      process.kill(process.pid, signal);
      return;
    }
    process.exitCode = code ?? 1;
  });
}
