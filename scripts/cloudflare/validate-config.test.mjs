import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { validateMigrationSql } from "./validate-config.mjs";

const migrationsDirectory = new URL("../../apps/api/migrations/", import.meta.url);
const migration0020 = readFileSync(
  new URL(
    "../../apps/api/migrations/0020_self_hostable_communication_senders.sql",
    import.meta.url,
  ),
  "utf8",
);

const safeDependencyRebuild = `
CREATE TABLE _0099_parents AS SELECT * FROM parents;
CREATE TABLE _0099_children AS SELECT * FROM children;
DROP TABLE children;
DROP TABLE parents;
CREATE TABLE parents (
  id text PRIMARY KEY NOT NULL
) STRICT;
CREATE TABLE children (
  id text PRIMARY KEY NOT NULL,
  parent_id text NOT NULL,
  FOREIGN KEY (parent_id) REFERENCES parents(id)
) STRICT;
INSERT INTO parents SELECT * FROM _0099_parents;
INSERT INTO children SELECT * FROM _0099_children;
DROP TABLE _0099_children;
DROP TABLE _0099_parents;
`;

function assertDestructive(sql) {
  assert.throws(
    () => validateMigrationSql("0099_test.sql", sql),
    /0099_test\.sql contains a destructive migration operation/,
  );
}

test("accepts the reviewed 0020 full dependency-graph rebuild", () => {
  assert.doesNotThrow(() =>
    validateMigrationSql("0020_self_hostable_communication_senders.sql", migration0020),
  );
});

test("accepts every checked-in ordered D1 migration", () => {
  const migrations = readdirSync(migrationsDirectory)
    .filter((entry) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(entry))
    .sort();

  assert.notEqual(migrations.length, 0);
  for (const migration of migrations) {
    const sql = readFileSync(new URL(migration, migrationsDirectory), "utf8");
    assert.doesNotThrow(() => validateMigrationSql(migration, sql), migration);
  }
});

test("accepts a migration-scoped snapshot rebuild in dependency-safe phase order", () => {
  assert.doesNotThrow(() => validateMigrationSql("0099_test.sql", safeDependencyRebuild));
});

test("rejects incomplete or lossy snapshot rebuilds", () => {
  assertDestructive(
    safeDependencyRebuild.replace("CREATE TABLE _0099_children AS SELECT * FROM children;\n", ""),
  );
  assertDestructive(
    safeDependencyRebuild.replace(
      "INSERT INTO children SELECT * FROM _0099_children;\n",
      "INSERT INTO children (id) SELECT id FROM _0099_children;\n",
    ),
  );
  assertDestructive(safeDependencyRebuild.replace("DROP TABLE _0099_children;\n", ""));
  assertDestructive(`PRAGMA foreign_keys = OFF;\n${safeDependencyRebuild}`);
  assertDestructive(`PRAGMA foreign_keys(0);\n${safeDependencyRebuild}`);
});

test("rejects dependency-unsafe drop, recreate, and restore order", () => {
  assertDestructive(
    safeDependencyRebuild.replace(
      "DROP TABLE children;\nDROP TABLE parents;",
      "DROP TABLE parents;\nDROP TABLE children;",
    ),
  );
  assertDestructive(
    safeDependencyRebuild.replace(
      /CREATE TABLE parents \(([\s\S]*?)\) STRICT;\nCREATE TABLE children \(([\s\S]*?)\) STRICT;/,
      "CREATE TABLE children ($2) STRICT;\nCREATE TABLE parents ($1) STRICT;",
    ),
  );
  assertDestructive(
    safeDependencyRebuild.replace(
      "INSERT INTO parents SELECT * FROM _0099_parents;\nINSERT INTO children SELECT * FROM _0099_children;",
      "INSERT INTO children SELECT * FROM _0099_children;\nINSERT INTO parents SELECT * FROM _0099_parents;",
    ),
  );
});

test("rejects arbitrary destructive migration operations", () => {
  for (const destructiveSql of [
    "DROP TABLE widgets;",
    "DROP TABLE IF EXISTS widgets;",
    "ALTER TABLE widgets DROP COLUMN name;",
    "TRUNCATE TABLE widgets;",
    "DELETE FROM widgets;",
  ]) {
    assertDestructive(`${destructiveSql}\nPRAGMA foreign_keys = ON;`);
  }
});

test("rejects additional destructive SQL beside an otherwise safe rebuild", () => {
  assertDestructive(`${safeDependencyRebuild}\nDROP TABLE audit_log;`);
  assertDestructive(`${safeDependencyRebuild}\nDROP TABLE IF EXISTS audit_log;`);
  assertDestructive(`${safeDependencyRebuild}\nDELETE FROM parents;`);
});
