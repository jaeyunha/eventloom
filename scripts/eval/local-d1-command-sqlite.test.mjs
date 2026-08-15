import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createSqliteExecutor, SQLITE_BUSY_TIMEOUT_MS } from "./local-d1-command-sqlite.mjs";

function temporaryDatabase() {
  const directory = mkdtempSync(join(tmpdir(), "eventloom-local-d1-"));
  return { directory, path: join(directory, "local-d1.sqlite") };
}

test("runs prepared statements and transactions against an explicit SQLite file", () => {
  const temporary = temporaryDatabase();
  try {
    const database = new DatabaseSync(temporary.path);
    database.exec("CREATE TABLE auth_users (id TEXT PRIMARY KEY, email TEXT NOT NULL);");
    database.close();

    const executor = createSqliteExecutor({ path: temporary.path });
    executor.execute({
      statement: "INSERT INTO auth_users (id, email) VALUES (?, ?)",
      parameters: ["user-1", "evaluator@example.test"],
    });
    const rows = executor.lookup({
      statement: "SELECT id, email FROM auth_users WHERE id = ?",
      parameters: ["user-1"],
    });

    assert.deepEqual(rows, [{ id: "user-1", email: "evaluator@example.test" }]);
  } finally {
    rmSync(temporary.directory, { recursive: true, force: true });
  }
});

test("surfaces prepared statement failures after rollback", () => {
  const temporary = temporaryDatabase();
  try {
    writeFileSync(temporary.path, "");
    const calls = [];
    const failure = new Error("database is locked");
    const executor = createSqliteExecutor({
      path: temporary.path,
      databaseFactory: () => ({
        exec(statement) {
          calls.push(statement);
        },
        prepare() {
          return {
            run: () => {
              throw failure;
            },
          };
        },
        close() {
          calls.push("close");
        },
      }),
    });

    assert.throws(
      () =>
        executor.execute({ statement: "UPDATE auth_users SET email = ?", parameters: ["next"] }),
      (error) => error === failure,
    );
    assert.equal(calls.includes("ROLLBACK"), true);
    assert.equal(calls.at(-1), "close");
  } finally {
    rmSync(temporary.directory, { recursive: true, force: true });
  }
});

test("configures a bounded WAL-safe connection through an injected database factory", () => {
  const temporary = temporaryDatabase();
  try {
    writeFileSync(temporary.path, "");
    const calls = [];
    const executor = createSqliteExecutor({
      path: temporary.path,
      databaseFactory(path, options) {
        calls.push({ kind: "open", path, options });
        return {
          exec(statement) {
            calls.push({ kind: "exec", statement });
          },
          prepare(statement) {
            calls.push({ kind: "prepare", statement });
            return {
              run(...parameters) {
                calls.push({ kind: "run", parameters });
              },
              all(...parameters) {
                calls.push({ kind: "all", parameters });
                return [];
              },
            };
          },
          close() {
            calls.push({ kind: "close" });
          },
        };
      },
    });

    executor.execute({ statement: "UPDATE auth_users SET email = ?", parameters: ["next"] });

    assert.deepEqual(calls[0], {
      kind: "open",
      path: temporary.path,
      options: { enableForeignKeyConstraints: true, timeout: SQLITE_BUSY_TIMEOUT_MS },
    });
    assert.deepEqual(
      calls.filter((call) => call.kind === "exec").map((call) => call.statement),
      [
        `PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`,
        "PRAGMA journal_mode = WAL",
        "BEGIN IMMEDIATE",
        "COMMIT",
      ],
    );
    assert.deepEqual(calls.find((call) => call.kind === "run").parameters, ["next"]);
    assert.equal(calls.at(-1).kind, "close");
  } finally {
    rmSync(temporary.directory, { recursive: true, force: true });
  }
});
