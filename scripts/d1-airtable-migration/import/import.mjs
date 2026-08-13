#!/usr/bin/env node
import { readFile } from "node:fs/promises";

import { createImportPlan, D1ImportError } from "./import-lib.mjs";

const HELP = `Usage:
  node scripts/d1-airtable-migration/import/import.mjs --manifest FILE --mapping FILE

The command validates an Airtable inventory and prints a deterministic D1 import plan.
It never writes to D1. Runtime execution requires an injected adapter.`;

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    if (argument === "--manifest" || argument === "--mapping") {
      values[argument.slice(2)] = argv[index + 1];
      index += 1;
      continue;
    }
    throw new D1ImportError("ARGUMENT_ERROR", `Unknown argument: ${argument}`);
  }
  if (!values.manifest || !values.mapping) {
    throw new D1ImportError("ARGUMENT_ERROR", "--manifest and --mapping are required.");
  }
  return values;
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(HELP);
  } else {
    const manifest = JSON.parse(await readFile(options.manifest, "utf8"));
    const mappingDefinition = JSON.parse(await readFile(options.mapping, "utf8"));
    const mapping = Object.fromEntries(
      Object.entries(mappingDefinition).map(([source, target]) => [
        source,
        {
          table: target.table,
          mapRecord: (record) => ({ id: record.applicationId, ...record.raw.fields }),
        },
      ]),
    );
    console.log(JSON.stringify(createImportPlan(manifest, mapping), null, 2));
  }
} catch (error) {
  const code = error instanceof D1ImportError ? error.code : "IMPORT_ERROR";
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${code}: ${message}`);
  process.exitCode = 1;
}
