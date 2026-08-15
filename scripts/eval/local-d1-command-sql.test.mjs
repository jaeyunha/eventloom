import assert from "node:assert/strict";
import test from "node:test";
import { createSqlBuilders } from "./local-d1-command-sql.mjs";

function builders() {
  return createSqlBuilders({
    requiredString(value, label) {
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new TypeError(`${label} is required.`);
      }
      return value.trim();
    },
    fail(code, message) {
      const error = new Error(message);
      error.code = code;
      throw error;
    },
  });
}

test("membership SQL escapes values and preserves the supported role boundary", () => {
  const sql = builders().sqlForCommand({
    type: "membership",
    organizationId: "ai-engineer'; DROP TABLE auth_users; --",
    eventId: "devflow-conf-2027",
    userId: "user-evaluator",
    email: "evaluator@example.test",
    role: "admin",
  });

  assert.equal(sql.includes("'ai-engineer'; DROP TABLE"), false);
  assert.equal(sql.includes("'ai-engineer''; DROP TABLE auth_users; --'"), true);
  assert.match(sql, /ON CONFLICT \(organization_id, user_id\)/u);
  const plan = builders().sqliteCommandPlan({
    type: "membership",
    idempotencyKey: "eval-persona:ai-engineer:membership:user-evaluator",
    organizationId: "ai-engineer",
    eventId: "devflow-conf-2027",
    userId: "user-evaluator",
    email: "evaluator@example.test",
    role: "admin",
  });
  assert.deepEqual(
    { ...plan, statement: undefined },
    {
      commandType: "membership",
      idempotencyKey: "eval-persona:ai-engineer:membership:user-evaluator",
      parameters: ["ai-engineer", "user-evaluator", "admin"],
      statement: undefined,
    },
  );
  assert.match(plan.statement, /ON CONFLICT \(organization_id, user_id\)/u);
  assert.throws(
    () =>
      builders().sqlForCommand({
        type: "membership",
        organizationId: "ai-engineer",
        eventId: "devflow-conf-2027",
        userId: "user-evaluator",
        email: "evaluator@example.test",
        role: "owner'; DELETE FROM auth_users; --",
      }),
    (error) => error.code === "COMMAND_INVALID",
  );
});

test("builds account-verification and user-ID lookup queries", () => {
  const sql = builders();
  assert.match(
    sql.accountVerificationSql({
      organizationId: "ai-engineer",
      eventId: "devflow-conf-2027",
      userId: "user-evaluator",
      email: "evaluator@example.test",
    }),
    /UPDATE auth_users/u,
  );
  assert.match(sql.userIdLookupSql("evaluator@example.test"), /LIMIT 2/u);
  assert.deepEqual(sql.sqliteUserIdLookupPlan("evaluator@example.test"), {
    parameters: ["evaluator@example.test"],
    statement: "SELECT id FROM auth_users WHERE email = ? COLLATE NOCASE LIMIT 2",
  });
});
