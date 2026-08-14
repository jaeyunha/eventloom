/// <reference types="node" />

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function expand(query: string, values: readonly unknown[]): string {
  let index = 0;
  const expanded = query.replaceAll("?", () => {
    const value = values[index];
    index += 1;
    return sqlLiteral(value);
  });
  if (index !== values.length) throw new Error("D1 test statement binding mismatch.");
  return expanded;
}

export class SqliteD1Statement {
  readonly #values: readonly unknown[];

  constructor(
    private readonly database: SqliteD1,
    readonly query: string,
    values: readonly unknown[] = [],
  ) {
    this.#values = values;
  }

  bind(...values: unknown[]): SqliteD1Statement {
    return new SqliteD1Statement(this.database, this.query, values);
  }

  async first<T>(): Promise<T | null> {
    return (await this.all<T>()).results[0] ?? null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.database.query<T>(expand(this.query, this.#values)) };
  }

  async run(): Promise<{ meta: { changes: number } }> {
    return { meta: { changes: this.database.run(expand(this.query, this.#values)) } };
  }

  expanded(): string {
    return expand(this.query, this.#values);
  }
}

export class SqliteD1 {
  readonly path: string;
  readonly #directory: string;

  constructor(prefix: string, setupSql = "") {
    this.#directory = mkdtempSync(join(tmpdir(), prefix));
    this.path = join(this.#directory, "database.sqlite");
    if (setupSql.trim().length > 0) this.executeScript(setupSql);
  }

  prepare(query: string): SqliteD1Statement {
    return new SqliteD1Statement(this, query);
  }

  async batch(statements: readonly SqliteD1Statement[]) {
    const script = [
      "PRAGMA foreign_keys = ON; BEGIN IMMEDIATE;",
      ...statements.flatMap((statement) => [
        `${statement.expanded()};`,
        "SELECT changes() AS changes;",
      ]),
      "COMMIT;",
    ].join("\n");
    const output = this.executeScript(script);
    return output
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => ({ meta: { changes: Number(JSON.parse(line)[0]?.changes ?? 0) } }));
  }

  query<T>(query: string): T[] {
    const output = this.executeScript(`PRAGMA foreign_keys = ON; ${query}`);
    return output.trim().length === 0 ? [] : (JSON.parse(output) as T[]);
  }

  run(query: string): number {
    const output = this.executeScript(
      `PRAGMA foreign_keys = ON; BEGIN IMMEDIATE; ${query}; SELECT changes() AS changes; COMMIT;`,
    );
    return Number(JSON.parse(output)[0]?.changes ?? 0);
  }

  executeScript(sql: string): string {
    return execFileSync("sqlite3", ["-json", this.path], {
      input: sql,
      encoding: "utf8",
    }).trim();
  }

  dispose(): void {
    rmSync(this.#directory, { recursive: true, force: true });
  }
}
