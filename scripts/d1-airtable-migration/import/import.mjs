#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { createDomainImportPlan } from "./domain-transform.mjs";
import {
  createImportPlan,
  createWranglerD1Adapter,
  D1ImportError,
  ENTITY_PRIMARY_KEYS,
  executeImportPlan,
  SUPPORTED_ENTITY_TYPES,
  validateImportPlan,
} from "./import-lib.mjs";

export const HELP_TEXT = `Usage: node scripts/d1-airtable-migration/import/import.mjs [options]

Create or execute a validated Airtable-to-D1 import plan. Dry-run is the default.
Apply refuses plans containing invalid or quarantined rows and uses idempotent atomic D1 batches.

Plan input (choose one):
  --plan <path>              Read an existing open-sessionboard.d1-import-plan JSON file
  --manifest <path>          Read an Airtable inventory manifest using domain transformation
  --mapping <path>           Optional legacy flat mapping from source table to D1 entity

Execution options:
  --database <name|binding>  D1 database name or binding (required with --apply)
  --local                    Use local D1 persistence (default)
  --remote                   Use the remote D1 database
  --dry-run                  Validate and print the plan without D1 writes (default)
  --apply                    Apply the plan through Wrangler D1 execute
  --allow-quarantine         Apply supported operations and report quarantined source records
  --checkpoint <path>        Resume checkpoint (default: <plan|manifest>.checkpoint.json)
  --batch-size <count>       Operations per atomic D1 batch (default: 100)
  --cwd <path>               Wrangler working directory
  --config <path>            Wrangler configuration path
  --env <name>               Wrangler environment
  --persist-to <path>        Local Wrangler persistence directory
  --wrangler <path>          Wrangler executable (default: wrangler)
  -h, --help                 Show this help

Supported D1 entities:
  ${SUPPORTED_ENTITY_TYPES.join(", ")}
`;

function fail(code, message) {
  throw new D1ImportError(code, message);
}

export function parseImportArguments(arguments_) {
  const options = {
    help: false,
    mode: "dry-run",
    target: "local",
    batchSize: 100,
    wrangler: "wrangler",
  };
  let explicitMode;
  let explicitTarget;
  const takeValue = (argument, index) => {
    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith("--")) {
      fail("ARGUMENT_ERROR", `${argument} requires a value.`);
    }
    return value;
  };

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--allow-quarantine") options.allowQuarantine = true;
    else if (argument === "--dry-run" || argument === "--apply") {
      const mode = argument.slice(2);
      if (explicitMode !== undefined && explicitMode !== mode) {
        fail("ARGUMENT_ERROR", "Choose either --dry-run or --apply, not both.");
      }
      explicitMode = mode;
      options.mode = mode;
    } else if (argument === "--local" || argument === "--remote") {
      const target = argument.slice(2);
      if (explicitTarget !== undefined && explicitTarget !== target) {
        fail("ARGUMENT_ERROR", "Choose either --local or --remote, not both.");
      }
      explicitTarget = target;
      options.target = target;
    } else if (
      [
        "--plan",
        "--manifest",
        "--mapping",
        "--database",
        "--checkpoint",
        "--batch-size",
        "--cwd",
        "--config",
        "--env",
        "--persist-to",
        "--wrangler",
      ].includes(argument)
    ) {
      const value = takeValue(argument, index);
      index += 1;
      const key = {
        "--batch-size": "batchSize",
        "--persist-to": "persistTo",
        "--env": "environment",
      }[argument];
      options[key ?? argument.slice(2)] = argument === "--batch-size" ? Number(value) : value;
    } else fail("ARGUMENT_ERROR", `Unknown argument: ${argument}`);
  }

  if (options.help) return options;
  if (
    options.plan !== undefined &&
    (options.manifest !== undefined || options.mapping !== undefined)
  ) {
    fail("ARGUMENT_ERROR", "Choose --plan or --manifest, not both.");
  }
  if (options.plan === undefined && options.manifest === undefined) {
    fail("ARGUMENT_ERROR", "Provide --plan or --manifest.");
  }
  if (options.mapping !== undefined && options.manifest === undefined) {
    fail("ARGUMENT_ERROR", "--mapping requires --manifest.");
  }
  if (!Number.isInteger(options.batchSize) || options.batchSize <= 0) {
    fail("ARGUMENT_ERROR", "--batch-size must be a positive integer.");
  }
  if (options.mode === "apply" && options.database === undefined) {
    fail("ARGUMENT_ERROR", "--database is required with --apply.");
  }
  if (options.target === "remote" && options.persistTo !== undefined) {
    fail("ARGUMENT_ERROR", "--persist-to is only valid with --local.");
  }
  return options;
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (cause) {
    throw new D1ImportError("INPUT_ERROR", `Unable to read valid JSON from ${path}.`, { cause });
  }
}

async function loadPlan(options) {
  if (options.plan !== undefined) {
    const plan = await readJson(options.plan);
    return options.allowQuarantine
      ? validateImportPlan({ ...plan, quarantine: [] }) && plan
      : validateImportPlan(plan);
  }
  const manifest = await readJson(options.manifest);
  if (options.mapping === undefined) {
    const plan = createDomainImportPlan(manifest);
    return options.allowQuarantine
      ? validateImportPlan({ ...plan, quarantine: [] }) && plan
      : validateImportPlan(plan);
  }
  const definition = await readJson(options.mapping);
  if (definition === null || typeof definition !== "object" || Array.isArray(definition)) {
    fail("INPUT_ERROR", "Mapping must be a JSON object.");
  }
  const mapping = Object.fromEntries(
    Object.entries(definition).map(([source, target]) => {
      if (
        target === null ||
        typeof target !== "object" ||
        Array.isArray(target) ||
        typeof target.table !== "string"
      ) {
        fail("INPUT_ERROR", `Mapping ${source} requires a target table.`);
      }
      return [
        source,
        {
          table: target.table,
          mapRecord: (record) => ({
            [ENTITY_PRIMARY_KEYS[target.table]?.[0] ?? "id"]: record.applicationId,
            ...record.raw.fields,
          }),
        },
      ];
    }),
  );
  return validateImportPlan(createImportPlan(manifest, mapping));
}

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
    child.once("close", (exitCode) => resolve({ exitCode: exitCode ?? 1, stdout, stderr }));
  });
}

export async function runImportCli({
  arguments: arguments_ = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr,
  execute = executeWrangler,
} = {}) {
  try {
    const options = parseImportArguments(arguments_);
    if (options.help) {
      stdout.write(HELP_TEXT);
      return 0;
    }
    const plan = await loadPlan(options);
    if (options.mode === "dry-run") {
      stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
      return 0;
    }
    const checkpointPath =
      options.checkpoint ?? `${options.plan ?? options.manifest}.checkpoint.json`;
    const result = await executeImportPlan({
      adapter: createWranglerD1Adapter(options, { execute }),
      checkpointPath,
      plan,
      batchSize: options.batchSize,
      allowQuarantine: options.allowQuarantine === true,
    });
    stdout.write(
      `${JSON.stringify({ target: options.target, database: options.database, ...result }, null, 2)}\n`,
    );
    return 0;
  } catch (error) {
    const code = error instanceof D1ImportError ? error.code : "IMPORT_ERROR";
    const message = error instanceof Error ? error.message : "Unexpected import failure.";
    stderr.write(`${code}: ${message}\n`);
    return 1;
  }
}

const entryPoint = process.argv[1] === fileURLToPath(import.meta.url);
if (entryPoint) process.exitCode = await runImportCli();
