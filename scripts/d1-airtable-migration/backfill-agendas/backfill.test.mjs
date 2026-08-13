import assert from "node:assert/strict";
import test from "node:test";

import { runBackfillCli } from "./backfill.mjs";
import {
  buildApplySql,
  createBackfillPlan,
  createWranglerD1Adapter,
  EVENT_COLUMNS_SQL,
  missingAgendasSql,
  parseBackfillArguments,
  runAgendaBackfill,
} from "./backfill-lib.mjs";

const events = [
  {
    organizationId: "org-z",
    eventId: "event-2",
    timeZone: "Europe/Paris",
    createdAt: "2026-02-03T04:05:06.000Z",
    createdBy: "organizer-z",
  },
  {
    organization_id: "org-a",
    id: "event-1",
    time_zone: "America/Los_Angeles",
    created_at: "2025-01-02T03:04:05.000Z",
    created_by: "organizer-a",
  },
];

function capture() {
  let value = "";
  return {
    write(chunk) {
      value += chunk;
    },
    value() {
      return value;
    },
  };
}

function wranglerResult(results, changes = 0) {
  return {
    exitCode: 0,
    stdout: JSON.stringify([{ success: true, results, meta: { changes } }]),
    stderr: "",
  };
}

test("plans exact empty agenda state and draft version 1 in deterministic event order", () => {
  const first = createBackfillPlan(events);
  const second = createBackfillPlan([...events].reverse());

  assert.deepEqual(first, second);
  assert.equal(first.eventCount, 2);
  assert.deepEqual(first.events[0], {
    organizationId: "org-a",
    eventId: "event-1",
    state: {
      stateVersion: 1,
      timeZone: "America/Los_Angeles",
      minimumTravelMinutes: 0,
      currentPublishedRevisionId: null,
      createdAt: "2025-01-02T03:04:05.000Z",
      updatedAt: "2025-01-02T03:04:05.000Z",
    },
    draft: {
      version: 1,
      timeZone: "America/Los_Angeles",
      updatedAt: "2025-01-02T03:04:05.000Z",
      updatedBy: "organizer-a",
    },
  });
  assert.equal(JSON.stringify(first).includes(new Date().toISOString()), false);
});

test("rejects malformed or duplicate event scopes instead of inventing defaults", () => {
  assert.throws(() => createBackfillPlan([{ id: "event-1" }]), /organizationId/u);
  assert.throws(() => createBackfillPlan([events[0], events[0]]), /Duplicate event scope/u);
});

test("dry-run reads once and never calls the mutation adapter", async () => {
  let reads = 0;
  let writes = 0;
  const result = await runAgendaBackfill({
    mode: "dry-run",
    adapter: {
      async listMissingAgendaEvents() {
        reads += 1;
        return events;
      },
      async applyBackfillPlan() {
        writes += 1;
        throw new Error("must not write");
      },
    },
  });

  assert.equal(reads, 1);
  assert.equal(writes, 0);
  assert.equal(result.mode, "dry-run");
  assert.equal(result.appliedEventCount, 0);
  assert.equal(result.plan.eventCount, 2);
});

test("apply delegates the immutable plan and an empty plan performs no write", async () => {
  let receivedPlan;
  const applied = await runAgendaBackfill({
    mode: "apply",
    adapter: {
      async listMissingAgendaEvents() {
        return events;
      },
      async applyBackfillPlan(plan) {
        receivedPlan = plan;
        return { appliedEventCount: 2 };
      },
    },
  });
  assert.deepEqual(receivedPlan, applied.plan);
  assert.equal(applied.appliedEventCount, 2);

  let writes = 0;
  const empty = await runAgendaBackfill({
    mode: "apply",
    adapter: {
      async listMissingAgendaEvents() {
        return [];
      },
      async applyBackfillPlan() {
        writes += 1;
      },
    },
  });
  assert.equal(empty.plan.eventCount, 0);
  assert.equal(writes, 0);
});

test("generated apply SQL is additive, escaped, and creates only state and draft rows", () => {
  const plan = createBackfillPlan([
    {
      organizationId: "org-'quoted",
      eventId: "event-1",
      timeZone: "America/Los_Angeles",
      createdAt: "2025-01-02T03:04:05.000Z",
      createdBy: "organizer-'quoted",
    },
  ]);
  const sql = buildApplySql(plan);

  assert.match(sql, /INSERT INTO agenda_states/u);
  assert.match(sql, /INSERT INTO agenda_drafts/u);
  assert.match(sql, /ON CONFLICT \(organization_id, event_id\) DO NOTHING/u);
  assert.match(sql, /'org-''quoted'/u);
  assert.doesNotMatch(sql, /\b(?:DELETE|UPDATE|DROP|ALTER|REPLACE)\b/iu);
  assert.doesNotMatch(sql, /agenda_entries|agenda_revisions|audit_events/iu);
  assert.equal(buildApplySql(createBackfillPlan([])), "");
});

test("missing-event query handles schemas with and without event tombstones", () => {
  const tombstoned = missingAgendasSql({ hasDeletedAt: true });
  const current = missingAgendasSql({ hasDeletedAt: false });
  assert.match(tombstoned, /e\.deleted_at IS NULL/u);
  assert.doesNotMatch(current, /deleted_at/u);
  for (const sql of [tombstoned, current]) {
    assert.match(sql, /LEFT JOIN agenda_states/u);
    assert.match(sql, /state\.event_id IS NULL/u);
    assert.match(sql, /ORDER BY e\.organization_id COLLATE BINARY, e\.id COLLATE BINARY/u);
  }
});

test("Wrangler adapter injects local and remote targets without hardcoded database configuration", async () => {
  for (const target of ["local", "remote"]) {
    const calls = [];
    const adapter = createWranglerD1Adapter(
      {
        target,
        database: "operator-db",
        wrangler: "operator-wrangler",
        cwd: "apps/api",
        config: "custom.toml",
        environment: "staging",
        persistTo: target === "local" ? ".d1-test" : undefined,
      },
      {
        execute: async (command, arguments_) => {
          calls.push({ command, arguments_ });
          if (calls.length === 1) {
            return wranglerResult([
              { name: "id" },
              { name: "organization_id" },
              { name: "time_zone" },
              { name: "created_at" },
              { name: "created_by" },
              { name: "deleted_at" },
            ]);
          }
          return wranglerResult(events);
        },
      },
    );
    assert.deepEqual(await adapter.listMissingAgendaEvents(), events);
    assert.equal(calls[0].command, "operator-wrangler");
    assert.deepEqual(calls[0].arguments_.slice(0, 3), ["d1", "execute", "operator-db"]);
    assert.ok(calls[0].arguments_.includes(`--${target}`));
    assert.ok(calls[0].arguments_.includes("--json"));
    assert.ok(calls[0].arguments_.includes("--yes"));
    assert.ok(calls[0].arguments_.includes("--cwd"));
    assert.equal(calls[0].arguments_.includes("open-sessionboard-local"), false);
    assert.equal(calls[0].arguments_[4], EVENT_COLUMNS_SQL);
    assert.match(calls[1].arguments_[4], /e\.deleted_at IS NULL/u);
  }
});

test("Wrangler apply is idempotent when another actor already filled an event", async () => {
  const plan = createBackfillPlan(events);
  let sql;
  const adapter = createWranglerD1Adapter(
    { target: "remote", database: "operator-db", wrangler: "wrangler" },
    {
      execute: async (_command, arguments_) => {
        sql = arguments_[4];
        return wranglerResult([], 0);
      },
    },
  );
  assert.deepEqual(await adapter.applyBackfillPlan(plan), { appliedEventCount: 0 });
  assert.match(sql, /ON CONFLICT/u);
});

test("argument parsing defaults safely and rejects ambiguous or destructive-looking input", () => {
  assert.deepEqual(parseBackfillArguments(["--database", "DB"]), {
    help: false,
    mode: "dry-run",
    target: "local",
    database: "DB",
    cwd: undefined,
    config: undefined,
    environment: undefined,
    persistTo: undefined,
    wrangler: "wrangler",
  });
  assert.equal(
    parseBackfillArguments(["--database", "named-db", "--remote", "--apply"]).mode,
    "apply",
  );
  assert.throws(() => parseBackfillArguments([]), /--database/u);
  assert.throws(
    () => parseBackfillArguments(["--database", "DB", "--apply", "--dry-run"]),
    /either/u,
  );
  assert.throws(
    () => parseBackfillArguments(["--database", "DB", "--local", "--remote"]),
    /either/u,
  );
  assert.throws(
    () => parseBackfillArguments(["--database", "DB", "--remote", "--persist-to", "x"]),
    /only valid/u,
  );
  assert.throws(() => parseBackfillArguments(["--database", "DB", "--delete"]), /Unknown/u);
});

test("CLI supports injected adapters, reports plans, and never executes Wrangler for help", async () => {
  const stdout = capture();
  const stderr = capture();
  let executes = 0;
  assert.equal(
    await runBackfillCli({
      arguments: ["--help"],
      stdout,
      stderr,
      execute: async () => {
        executes += 1;
      },
    }),
    0,
  );
  assert.match(stdout.value(), /Usage:/u);
  assert.equal(executes, 0);
  assert.equal(stderr.value(), "");

  const planOutput = capture();
  let writes = 0;
  assert.equal(
    await runBackfillCli({
      arguments: ["--database", "injected-db", "--remote", "--dry-run"],
      stdout: planOutput,
      stderr,
      adapter: {
        async listMissingAgendaEvents() {
          return events;
        },
        async applyBackfillPlan() {
          writes += 1;
          return { appliedEventCount: 0 };
        },
      },
    }),
    0,
  );
  const output = JSON.parse(planOutput.value());
  assert.equal(output.target, "remote");
  assert.equal(output.database, "injected-db");
  assert.equal(output.plan.eventCount, 2);
  assert.equal(writes, 0);
});
