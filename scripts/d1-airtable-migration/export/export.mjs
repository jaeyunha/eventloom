#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AirtableExportError,
  exportAirtableInventory,
  HELP_TEXT,
  parseExportArguments,
  readExportConfiguration,
  readJsonConfiguration,
} from "./export-lib.mjs";

export async function runExportCli({
  arguments: arguments_ = process.argv.slice(2),
  environment = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
  fetchImplementation = globalThis.fetch,
} = {}) {
  try {
    const argumentsResult = parseExportArguments(arguments_);
    if (argumentsResult.help) {
      stdout.write(HELP_TEXT);
      return 0;
    }
    const fileConfiguration = argumentsResult.config
      ? await readJsonConfiguration(resolve(argumentsResult.config))
      : {};
    const mergedConfiguration = {
      ...fileConfiguration,
      ...(argumentsResult.baseId === undefined ? {} : { baseId: argumentsResult.baseId }),
      ...(argumentsResult.tables.length === 0 ? {} : { tables: argumentsResult.tables }),
    };
    const configuration = readExportConfiguration(environment, mergedConfiguration);
    const outputPath = resolve(argumentsResult.output);
    const quarantineReportPath =
      argumentsResult.quarantineReport === undefined
        ? undefined
        : resolve(argumentsResult.quarantineReport);
    if (quarantineReportPath === outputPath) {
      throw new AirtableExportError(
        "ARGUMENT_ERROR",
        "The quarantine report path must differ from the manifest path.",
      );
    }
    if (argumentsResult.dryRun) {
      stdout.write(
        `${JSON.stringify(
          {
            mode: "dry-run",
            baseId: configuration.baseId,
            tables:
              configuration.tables?.map((table) => table.selector ?? table.id ?? table.name) ??
              "all",
            outputPath,
            resume: argumentsResult.resume,
            quarantineReportPath: quarantineReportPath ?? null,
            invalidApplicationIds: quarantineReportPath === undefined ? "reject" : "quarantine",
            airtableAccess: "read-only",
          },
          null,
          2,
        )}\n`,
      );
      return 0;
    }
    const result = await exportAirtableInventory({
      ...configuration,
      outputPath,
      apiOrigin: argumentsResult.apiOrigin,
      resume: argumentsResult.resume,
      quarantineReportPath,
      fetchImplementation,
    });
    stdout.write(
      `Exported ${result.manifest.recordCount} records from ${result.manifest.tableCount} tables to ${result.outputPath}.\n`,
    );
    if (result.quarantineReportPath !== undefined) {
      stdout.write(
        `Quarantined ${result.manifest.quarantineCount} records and wrote the redacted report to ${result.quarantineReportPath}.\n`,
      );
    }
    return 0;
  } catch (error) {
    const code = error instanceof AirtableExportError ? error.code : "UNEXPECTED_ERROR";
    const message = error instanceof Error ? error.message : "Unexpected export failure.";
    stderr.write(`${code}: ${message}\n`);
    return 1;
  }
}

const entryPoint = process.argv[1] === fileURLToPath(import.meta.url);
if (entryPoint) process.exitCode = await runExportCli();
