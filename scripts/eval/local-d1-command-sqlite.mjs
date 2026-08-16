import { statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

export const SQLITE_BUSY_TIMEOUT_MS = 5_000;

function assertDatabaseFile(path) {
  let stats;
  try {
    stats = statSync(path);
  } catch {
    throw new TypeError("The explicit local D1 SQLite path must name an existing file.");
  }
  if (!stats.isFile()) {
    throw new TypeError("The explicit local D1 SQLite path must name an existing file.");
  }
}

function defaultDatabaseFactory(path, options) {
  return new DatabaseSync(path, options);
}

function transaction(database, plan) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = database.prepare(plan.statement).run(...plan.parameters);
    database.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      // Preserve the write failure; the rollback is only cleanup.
    }
    throw error;
  }
}

/** Execute typed D1 command plans directly against an explicitly selected SQLite file. */
export function createSqliteExecutor({ path, databaseFactory = defaultDatabaseFactory } = {}) {
  assertDatabaseFile(path);
  if (typeof databaseFactory !== "function") {
    throw new TypeError("A SQLite database factory is required.");
  }

  function withDatabase(operation) {
    const database = databaseFactory(path, {
      enableForeignKeyConstraints: true,
      timeout: SQLITE_BUSY_TIMEOUT_MS,
    });
    try {
      database.exec(`PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);
      database.exec("PRAGMA journal_mode = WAL");
      return operation(database);
    } finally {
      database.close();
    }
  }

  return Object.freeze({
    execute: (plan) => withDatabase((database) => transaction(database, plan)),
    lookup: (plan) =>
      withDatabase((database) =>
        database
          .prepare(plan.statement)
          .all(...plan.parameters)
          .map((row) => ({ ...row })),
      ),
  });
}
