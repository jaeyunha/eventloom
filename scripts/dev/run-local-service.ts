import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type LocalRuntimeMode = "api-dev" | "api-migrate" | "web-dev" | "web-playwright" | "web-start";
type Environment = Readonly<Record<string, string | undefined>>;

export interface LocalRuntimeCommand {
  readonly command: "bunx" | "node";
  readonly args: readonly string[];
  readonly cwd: string;
}

export class LocalRuntimeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalRuntimeConfigurationError";
  }
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const apiDirectory = resolve(repositoryRoot, "apps/api");
const webDirectory = resolve(repositoryRoot, "apps/web");
const rootEnvironmentPath = resolve(repositoryRoot, ".env");
const nextCliPath = resolve(webDirectory, "node_modules/next/dist/bin/next");

function environmentPort(environment: Environment, key: string, fallback: number): string {
  const configured = environment[key]?.trim();
  if (configured === undefined || configured.length === 0) return String(fallback);
  if (!/^\d{1,5}$/u.test(configured)) {
    throw new LocalRuntimeConfigurationError(`${key} must be a valid TCP port.`);
  }
  const port = Number(configured);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new LocalRuntimeConfigurationError(`${key} must be a valid TCP port.`);
  }
  return configured;
}

function environmentPath(environment: Environment, key: string, fallback: string): string {
  const configured = environment[key]?.trim();
  return configured === undefined || configured.length === 0 ? fallback : configured;
}

function assertNever(value: never): never {
  throw new LocalRuntimeConfigurationError(`Unsupported local runtime mode: ${String(value)}`);
}

export function localRuntimeCommand(
  mode: LocalRuntimeMode,
  environment: Environment = process.env,
): LocalRuntimeCommand {
  switch (mode) {
    case "api-dev":
      return {
        command: "bunx",
        cwd: apiDirectory,
        args: [
          "wrangler",
          "dev",
          "--env-file",
          rootEnvironmentPath,
          "--ip",
          "127.0.0.1",
          "--port",
          environmentPort(environment, "API_PORT", 8787),
          "--inspector-port",
          environmentPort(environment, "API_INSPECTOR_PORT", 9230),
          "--persist-to",
          environmentPath(environment, "WRANGLER_PERSIST_TO", ".wrangler/state"),
        ],
      };
    case "api-migrate":
      return {
        command: "bunx",
        cwd: apiDirectory,
        args: [
          "wrangler",
          "d1",
          "migrations",
          "apply",
          "DB",
          "--local",
          "--persist-to",
          environmentPath(environment, "WRANGLER_PERSIST_TO", ".wrangler/state"),
        ],
      };
    case "web-dev":
      return {
        command: "node",
        cwd: webDirectory,
        args: [
          nextCliPath,
          "dev",
          "--hostname",
          "127.0.0.1",
          "--port",
          environmentPort(environment, "WEB_PORT", 3015),
        ],
      };
    case "web-playwright":
      return {
        command: "node",
        cwd: webDirectory,
        args: [
          nextCliPath,
          "dev",
          "--hostname",
          "127.0.0.1",
          "--port",
          environmentPort(environment, "PLAYWRIGHT_WEB_PORT", 3015),
        ],
      };
    case "web-start":
      return {
        command: "node",
        cwd: webDirectory,
        args: [
          nextCliPath,
          "start",
          "--hostname",
          "127.0.0.1",
          "--port",
          environmentPort(environment, "WEB_PORT", 3015),
        ],
      };
    default:
      return assertNever(mode);
  }
}

function runtimeMode(value: string | undefined): LocalRuntimeMode {
  switch (value) {
    case "api-dev":
    case "api-migrate":
    case "web-dev":
    case "web-playwright":
    case "web-start":
      return value;
    default:
      throw new LocalRuntimeConfigurationError(
        "Expected one of api-dev, api-migrate, web-dev, web-playwright, or web-start.",
      );
  }
}

if (import.meta.main) {
  const command = localRuntimeCommand(runtimeMode(process.argv[2]));
  const child = spawn(command.command, [...command.args], {
    cwd: command.cwd,
    env: process.env,
    stdio: "inherit",
  });
  child.once("error", (error) => {
    process.stderr.write(`Failed to start the local service: ${error.message}\n`);
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
