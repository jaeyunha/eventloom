import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const API_WORKER = "open-sessionboard-api-production";
export const WEB_WORKER = "open-sessionboard-web-production";

export const API_SECRET_NAMES = [
  "BETTER_AUTH_SECRET",
  "OPENSEND_API_KEY",
  "OPENAI_API_KEY",
  "AIRTABLE_OAUTH_CLIENT_SECRET",
  "AIRTABLE_CREDENTIAL_ENCRYPTION_KEY",
  "CACHE_INVALIDATION_TOKEN",
];
export const WEB_SECRET_NAMES = ["CACHE_INVALIDATION_TOKEN"];

// These authenticate deployment tooling or belong to other systems; never put them on a Worker.
export const FORBIDDEN_SECRET_NAMES = [
  "CLOUDFLARE_API_TOKEN",
  "AIRTABLE_ACCESS_TOKEN",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
];

function usage() {
  return [
    "Usage: bun run cloudflare:secrets:production [--dry-run]",
    "",
    "Before a live run, export both Cloudflare CLI values (neither is installed as a Worker secret):",
    "  export CLOUDFLARE_ACCOUNT_ID='<Cloudflare account ID>'",
    "  export CLOUDFLARE_API_TOKEN='<Cloudflare API token>'",
    "",
    "Wrangler opens its own hidden prompt for each Worker secret. Enter secret values only at those",
    "prompts; this script never reads, writes, or prints secret values. CACHE_INVALIDATION_TOKEN is",
    "prompted for twice: enter the identical value first for the API Worker, then for the web Worker.",
  ].join("\n");
}

function parseArguments(argv) {
  let dryRun = false;
  for (const argument of argv) {
    if (argument === "--help" || argument === "-h") return { dryRun: false, help: true };
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    throw new Error(`Unknown option: ${argument}`);
  }
  return { dryRun, help: false };
}

export function buildProductionSecretCommands() {
  return [
    ...API_SECRET_NAMES.map((secret) => ({ worker: API_WORKER, secret })),
    ...WEB_SECRET_NAMES.map((secret) => ({ worker: WEB_WORKER, secret })),
  ].map(({ worker, secret }) => ({
    command: "bunx",
    args: ["wrangler", "secret", "put", secret, "--name", worker],
    worker,
    secret,
  }));
}

export function formatCommand({ command, args }) {
  return [command, ...args].join(" ");
}

function runWrangler(command) {
  return spawnSync(command.command, command.args, { stdio: "inherit" });
}

function commandExitCode(result) {
  if (result?.error) throw result.error;
  return result?.status ?? 1;
}

export function main(
  argv = process.argv.slice(2),
  {
    environment,
    run = runWrangler,
    write = (message) => process.stdout.write(message),
    writeError = (message) => process.stderr.write(message),
  } = {},
) {
  let options;
  try {
    options = parseArguments(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid arguments.";
    writeError(`${message}\n\n${usage()}\n`);
    return 1;
  }

  if (options.help) {
    write(`${usage()}\n`);
    return 0;
  }

  const commands = buildProductionSecretCommands();
  if (options.dryRun) {
    write(`${usage()}\n\nDry run only: no Cloudflare command will be run.\n`);
    for (const command of commands) write(`${formatCommand(command)}\n`);
    return 0;
  }

  const liveEnvironment = environment ?? process.env;
  if (!liveEnvironment.CLOUDFLARE_ACCOUNT_ID?.trim()) {
    writeError("CLOUDFLARE_ACCOUNT_ID must be set for the production Cloudflare account.\n");
    return 1;
  }

  if (!liveEnvironment.CLOUDFLARE_API_TOKEN?.trim()) {
    writeError(
      `CLOUDFLARE_API_TOKEN must be exported for Wrangler authentication; it is not a Worker secret.\n\n${usage()}\n`,
    );
    return 1;
  }

  let activeWorker;
  for (const command of commands) {
    if (command.worker !== activeWorker) {
      const label = command.worker === API_WORKER ? "API" : "web";
      write(
        `Installing production ${label} Worker secrets. Wrangler will display a hidden prompt for each value.\n`,
      );
      activeWorker = command.worker;
    }
    const status = commandExitCode(run(command));
    if (status !== 0) return status;
  }
  write("Production Worker secret installation completed.\n");
  return 0;
}

export function runCli(argv = process.argv.slice(2), options = {}) {
  return main(argv, options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runCli();
}
