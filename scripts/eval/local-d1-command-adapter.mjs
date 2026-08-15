import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCommandInputNormalizer } from "./local-d1-command-input.mjs";
import {
  configuredProcessExecutor,
  isProcessResult,
  ProcessOutputError,
  parseWranglerRows,
} from "./local-d1-command-process.mjs";
import { createSqlBuilders } from "./local-d1-command-sql.mjs";
import { createSqliteExecutor } from "./local-d1-command-sqlite.mjs";

export const LOCAL_D1_DATABASE_ENV = "EVAL_D1_DATABASE";
export const LOCAL_D1_PERSIST_TO_ENV = "EVAL_D1_PERSIST_TO";
export const LOCAL_D1_SQLITE_PATH_ENV = "EVAL_D1_SQLITE_PATH";

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(MODULE_DIRECTORY, "../..");
const API_DIRECTORY = resolve(REPOSITORY_ROOT, "apps/api");
const LOCAL_ENVIRONMENT = "local";
const DATABASE_NAME = /^[A-Za-z][A-Za-z0-9_-]*$/u;

export class LocalD1CommandAdapterError extends Error {
  constructor(code, message, options = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "LocalD1CommandAdapterError";
    this.code = code;
  }
}

function fail(code, message, options) {
  throw new LocalD1CommandAdapterError(code, message, options);
}

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail("COMMAND_INVALID", `${label} is required.`);
  }
  return value.trim();
}

function configurationValue(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail("CONFIGURATION_REQUIRED", `${label} is required.`);
  }
  return value.trim();
}

function localEnvironment(value) {
  const environment = configurationValue(value, "An explicit evaluation environment").toLowerCase();
  if (environment !== LOCAL_ENVIRONMENT) {
    fail("LOCAL_ONLY", "This D1 command adapter can only target the local environment.");
  }
}

function databaseBinding(value) {
  const database = configurationValue(value, `An explicit D1 database (${LOCAL_D1_DATABASE_ENV})`);
  if (!DATABASE_NAME.test(database)) {
    fail("CONFIGURATION_REQUIRED", "The D1 database must be a Wrangler binding or database name.");
  }
  return database;
}

function persistToPath(value) {
  if (value === undefined) return undefined;
  const path = configurationValue(
    value,
    `A local D1 persistence path (${LOCAL_D1_PERSIST_TO_ENV})`,
  );
  if (path.includes("\0")) {
    fail("CONFIGURATION_REQUIRED", "The local D1 persistence path is invalid.");
  }
  return isAbsolute(path) ? path : resolve(REPOSITORY_ROOT, path);
}

function sqlitePath(value) {
  if (value === undefined) return undefined;
  const path = configurationValue(value, `An explicit SQLite path (${LOCAL_D1_SQLITE_PATH_ENV})`);
  if (!isAbsolute(path) || path.includes("\0")) {
    fail("CONFIGURATION_REQUIRED", "The local D1 SQLite path must be absolute and valid.");
  }
  return path;
}

const inputs = createCommandInputNormalizer({ fail, requiredString });
const sql = createSqlBuilders({ fail, requiredString });

function parseRows(stdout) {
  try {
    return parseWranglerRows(stdout);
  } catch (error) {
    if (error instanceof ProcessOutputError) fail("D1_OUTPUT_INVALID", error.message);
    throw error;
  }
}

function processResult(value) {
  if (!isProcessResult(value)) {
    fail("COMMAND_FAILED", "The local D1 process returned an invalid result.");
  }
  return value;
}

function sqliteOperation(operation) {
  try {
    return operation();
  } catch (error) {
    if (error instanceof LocalD1CommandAdapterError) throw error;
    fail("COMMAND_FAILED", "The local SQLite D1 command failed.", { cause: error });
  }
}

export function createLocalD1CommandAdapter(options = {}) {
  localEnvironment(options.environment);
  const persistTo = persistToPath(options.persistTo);
  const selectedSqlitePath = sqlitePath(options.sqlitePath);
  if (selectedSqlitePath !== undefined && persistTo !== undefined) {
    fail("CONFIGURATION_REQUIRED", "Use either EVAL_D1_SQLITE_PATH or EVAL_D1_PERSIST_TO.");
  }
  let sqliteExecutor;
  if (selectedSqlitePath !== undefined) {
    try {
      sqliteExecutor = createSqliteExecutor({
        databaseFactory: options.sqliteDatabaseFactory,
        path: selectedSqlitePath,
      });
    } catch (error) {
      fail("CONFIGURATION_REQUIRED", "The explicit local D1 SQLite path is unusable.", {
        cause: error,
      });
    }
  }
  const database = sqliteExecutor === undefined ? databaseBinding(options.database) : undefined;
  const executeProcess =
    sqliteExecutor === undefined ? configuredProcessExecutor(options.executeProcess) : undefined;
  if (sqliteExecutor === undefined && executeProcess === undefined) {
    fail("CONFIGURATION_REQUIRED", "A process executor must be a function.");
  }

  async function executeSql(statement) {
    let result;
    try {
      result = processResult(
        await executeProcess(
          "bunx",
          [
            "wrangler",
            "d1",
            "execute",
            database,
            "--cwd",
            API_DIRECTORY,
            "--local",
            ...(persistTo === undefined ? [] : ["--persist-to", persistTo]),
            "--command",
            statement,
            "--json",
          ],
          { cwd: REPOSITORY_ROOT, shell: false },
        ),
      );
    } catch (error) {
      if (error instanceof LocalD1CommandAdapterError) throw error;
      fail("COMMAND_FAILED", "The local Wrangler D1 command could not be started.", {
        cause: error,
      });
    }
    if (result.exitCode !== 0) {
      fail("COMMAND_FAILED", `The local Wrangler D1 command exited with code ${result.exitCode}.`, {
        cause: new Error(typeof result.stderr === "string" ? result.stderr : "Wrangler failed."),
      });
    }
    return result;
  }

  async function executeCommand(command) {
    return sqliteExecutor === undefined
      ? executeSql(sql.sqlForCommand(command))
      : sqliteOperation(() => sqliteExecutor.execute(sql.sqliteCommandPlan(command)));
  }

  async function execute(command) {
    return executeCommand(inputs.command(command));
  }

  async function executeMethod(command, type) {
    return executeCommand(inputs.provisioningCommand(command, type));
  }

  async function resolveUserId(input) {
    const command = inputs.methodCommand(input, "identity-lookup");
    let rows;
    if (sqliteExecutor === undefined) {
      const result = await executeSql(sql.userIdLookupSql(command.email));
      rows = parseRows(typeof result.stdout === "string" ? result.stdout : "");
    } else {
      rows = sqliteOperation(() =>
        sqliteExecutor.lookup(sql.sqliteUserIdLookupPlan(command.email)),
      );
    }
    if (rows.length === 0) return undefined;
    if (rows.length !== 1 || rows[0] === null || typeof rows[0].id !== "string") {
      fail("D1_OUTPUT_INVALID", "The local D1 identity lookup did not return one user ID.");
    }
    const userId = rows[0].id.trim();
    if (userId.length === 0) {
      fail("D1_OUTPUT_INVALID", "The local D1 identity lookup returned an invalid user ID.");
    }
    return { userId };
  }

  async function ensureMembership(command) {
    return executeMethod(command, "membership");
  }

  async function ensureSpeakerGrant(command) {
    return executeMethod(command, "speaker-grant");
  }

  async function ensureVerified(command) {
    return executeMethod(command, "account-verification");
  }

  return Object.freeze({
    execute,
    run: execute,
    resolveUserId,
    ensureMembership,
    ensureSpeakerGrant,
    ensureVerified,
    verifyAccount: ensureVerified,
    markEmailVerified: ensureVerified,
  });
}

export function createCommandAdapter(options = {}) {
  return createLocalD1CommandAdapter({
    ...options,
    environment: options.environment ?? process.env.EVAL_ENVIRONMENT,
    database: options.database ?? process.env[LOCAL_D1_DATABASE_ENV],
    persistTo: options.persistTo ?? process.env[LOCAL_D1_PERSIST_TO_ENV],
    sqlitePath: options.sqlitePath ?? process.env[LOCAL_D1_SQLITE_PATH_ENV],
  });
}
