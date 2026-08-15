#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compareSnapshots, renderMismatchReport } from "./compare.mjs";
import { rollbackReadCutover, transitionTenant } from "./cutover.mjs";

const HELP = `D1/Airtable shadow verification and tenant cutover tooling

Usage:
  node scripts/d1-airtable-migration/verify/cli.mjs compare --source FILE --target FILE [--explanations FILE] [--tenant ID] [--environment NAME] [--json]
  node scripts/d1-airtable-migration/verify/cli.mjs transition --tenant ID --to read-d1|write-d1 --reason TEXT --adapter FILE [--report FILE] [--environment NAME]

  node scripts/d1-airtable-migration/verify/cli.mjs rollback --tenant ID --reason TEXT --adapter FILE

Commands:
  compare     Compare JSON domain snapshots using canonical per-domain counts and hashes.
  transition  Advance one tenant shadow -> read-d1 -> write-d1 through injected adapters.
  rollback    Roll back read-d1 -> shadow. write-d1 rollback is deliberately blocked.

Snapshot shape:
  { "domain-name": [{ "id": "stable-record-id", "...": "..." }] }

Adapter module:
  Export markerAdapter and, for write-d1, fenceAdapter; or export createAdapters().
  The CLI performs no remote writes without this explicit injected module.
`;

export class CliError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CliError";
    this.code = code;
  }
}

function parseOptions(tokens) {
  const options = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--"))
      throw new CliError("ARGUMENT_INVALID", `Unexpected argument: ${token}`);
    const name = token.slice(2);
    if (name === "json") {
      if (options.json !== undefined)
        throw new CliError("ARGUMENT_INVALID", "Duplicate --json option.");
      options.json = true;
      continue;
    }
    const value = tokens[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new CliError("ARGUMENT_INVALID", `Option --${name} requires a value.`);
    }
    if (options[name] !== undefined)
      throw new CliError("ARGUMENT_INVALID", `Duplicate --${name} option.`);
    options[name] = value;
    index += 1;
  }
  return options;
}

function requireOption(options, name) {
  const value = options[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new CliError("ARGUMENT_REQUIRED", `Missing required --${name} option.`);
  }
  return value;
}

function rejectUnknown(options, allowed) {
  for (const option of Object.keys(options)) {
    if (!allowed.includes(option))
      throw new CliError("ARGUMENT_INVALID", `Unknown option --${option}.`);
  }
}

async function readJson(path, label) {
  let contents;
  try {
    contents = await readFile(path, "utf8");
  } catch {
    throw new CliError("FILE_READ_FAILED", `Could not read ${label}: ${path}`);
  }
  try {
    return JSON.parse(contents);
  } catch {
    throw new CliError("JSON_INVALID", `${label} is not valid JSON: ${path}`);
  }
}

async function loadAdapters(spec) {
  const moduleUrl = pathToFileURL(isAbsolute(spec) ? spec : resolve(spec)).href;
  let loaded;
  try {
    loaded = await import(moduleUrl);
  } catch {
    throw new CliError("ADAPTER_LOAD_FAILED", `Could not load adapter module: ${spec}`);
  }
  const adapters =
    typeof loaded.createAdapters === "function"
      ? await loaded.createAdapters()
      : (loaded.default ?? loaded);
  if (adapters === null || typeof adapters !== "object") {
    throw new CliError("ADAPTER_LOAD_FAILED", "Adapter module did not export adapters.");
  }
  return adapters;
}

export async function runCli(argv, io = {}) {
  const stdout = io.stdout ?? ((value) => console.log(value));
  const command = argv[0];
  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    stdout(HELP.trimEnd());
    return 0;
  }
  const options = parseOptions(argv.slice(1));

  if (command === "compare") {
    rejectUnknown(options, ["source", "target", "explanations", "tenant", "environment", "json"]);

    const sourcePath = requireOption(options, "source");
    const targetPath = requireOption(options, "target");
    const source = await readJson(sourcePath, "source snapshot");
    const target = await readJson(targetPath, "target snapshot");
    const explanations =
      options.explanations === undefined
        ? []
        : await readJson(options.explanations, "drift explanations");
    const report = compareSnapshots({
      source,
      target,
      explanations,
      ...(options.tenant === undefined ? {} : { tenantId: options.tenant }),
      ...(options.environment === undefined ? {} : { environment: options.environment }),
    });

    stdout(options.json ? JSON.stringify(report, null, 2) : renderMismatchReport(report));
    return report.safeForReadCutover ? 0 : 2;
  }

  if (command === "transition") {
    rejectUnknown(options, ["tenant", "to", "reason", "adapter", "report", "environment"]);

    const to = requireOption(options, "to");
    if (to !== "read-d1" && to !== "write-d1") {
      throw new CliError("ARGUMENT_INVALID", "--to must be read-d1 or write-d1.");
    }
    const adapters = await loadAdapters(requireOption(options, "adapter"));
    const verificationReport =
      options.report === undefined
        ? undefined
        : await readJson(options.report, "verification report");
    const marker = await transitionTenant({
      tenantId: requireOption(options, "tenant"),
      to,
      reason: requireOption(options, "reason"),
      markerAdapter: adapters.markerAdapter,
      fenceAdapter: adapters.fenceAdapter,
      verificationReport,
      ...(options.environment === undefined ? {} : { environment: options.environment }),
    });

    stdout(JSON.stringify(marker, null, 2));
    return 0;
  }

  if (command === "rollback") {
    rejectUnknown(options, ["tenant", "reason", "adapter"]);
    const adapters = await loadAdapters(requireOption(options, "adapter"));
    const marker = await rollbackReadCutover({
      tenantId: requireOption(options, "tenant"),
      reason: requireOption(options, "reason"),
      markerAdapter: adapters.markerAdapter,
    });
    stdout(JSON.stringify(marker, null, 2));
    return 0;
  }

  throw new CliError("COMMAND_INVALID", `Unknown command: ${command}`);
}

export async function main(argv = process.argv.slice(2)) {
  try {
    process.exitCode = await runCli(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Verification command failed.";
    console.error(message);
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (entryPath !== undefined && entryPath === fileURLToPath(import.meta.url)) await main();

export { HELP };
