export const BACKFILL_FORMAT = "open-sessionboard.d1-missing-agenda-backfill";
export const BACKFILL_VERSION = 1;

const MODE_VALUES = new Set(["dry-run", "apply"]);
const TARGET_VALUES = new Set(["local", "remote"]);

export class AgendaBackfillError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = "AgendaBackfillError";
    this.code = code;
  }
}

function fail(code, message, options) {
  throw new AgendaBackfillError(code, message, options);
}

function requiredText(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail("INVALID_BACKFILL_DATA", `${name} must be a non-empty string.`);
  }
  return value.trim();
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeEvent(row, index) {
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    fail("INVALID_BACKFILL_DATA", `events[${index}] must be an object.`);
  }
  return {
    organizationId: requiredText(
      row.organizationId ?? row.organization_id,
      `events[${index}].organizationId`,
    ),
    eventId: requiredText(row.eventId ?? row.event_id ?? row.id, `events[${index}].eventId`),
    timeZone: requiredText(row.timeZone ?? row.time_zone, `events[${index}].timeZone`),
    createdAt: requiredText(row.createdAt ?? row.created_at, `events[${index}].createdAt`),
    createdBy: requiredText(row.createdBy ?? row.created_by, `events[${index}].createdBy`),
  };
}

export function createBackfillPlan(rows) {
  if (!Array.isArray(rows))
    fail("INVALID_BACKFILL_DATA", "Missing-agenda events must be an array.");
  const events = rows.map(normalizeEvent).sort((left, right) => {
    const organizationOrder = compareText(left.organizationId, right.organizationId);
    return organizationOrder === 0 ? compareText(left.eventId, right.eventId) : organizationOrder;
  });
  for (let index = 1; index < events.length; index += 1) {
    const previous = events[index - 1];
    const current = events[index];
    if (
      previous.organizationId === current.organizationId &&
      previous.eventId === current.eventId
    ) {
      fail(
        "INVALID_BACKFILL_DATA",
        `Duplicate event scope: ${current.organizationId}/${current.eventId}.`,
      );
    }
  }
  return {
    format: BACKFILL_FORMAT,
    version: BACKFILL_VERSION,
    operation: "insert-missing-empty-agendas",
    eventCount: events.length,
    events: events.map((event) => ({
      organizationId: event.organizationId,
      eventId: event.eventId,
      state: {
        stateVersion: 1,
        timeZone: event.timeZone,
        minimumTravelMinutes: 0,
        currentPublishedRevisionId: null,
        createdAt: event.createdAt,
        updatedAt: event.createdAt,
      },
      draft: {
        version: 1,
        timeZone: event.timeZone,
        updatedAt: event.createdAt,
        updatedBy: event.createdBy,
      },
    })),
  };
}

export async function runAgendaBackfill({ adapter, mode = "dry-run" }) {
  if (!MODE_VALUES.has(mode)) fail("INVALID_ARGUMENT", `Unsupported mode: ${mode}.`);
  if (adapter === null || typeof adapter !== "object") {
    fail("INVALID_ADAPTER", "A D1 adapter is required.");
  }
  if (typeof adapter.listMissingAgendaEvents !== "function") {
    fail("INVALID_ADAPTER", "The D1 adapter must implement listMissingAgendaEvents().");
  }
  const plan = createBackfillPlan(await adapter.listMissingAgendaEvents());
  if (mode === "dry-run" || plan.eventCount === 0) {
    return { mode, appliedEventCount: 0, plan };
  }
  if (typeof adapter.applyBackfillPlan !== "function") {
    fail("INVALID_ADAPTER", "The D1 adapter must implement applyBackfillPlan().");
  }
  const result = await adapter.applyBackfillPlan(plan);
  const appliedEventCount = result?.appliedEventCount;
  if (
    !Number.isInteger(appliedEventCount) ||
    appliedEventCount < 0 ||
    appliedEventCount > plan.eventCount
  ) {
    fail("INVALID_ADAPTER_RESULT", "The D1 adapter returned an invalid appliedEventCount.");
  }
  return { mode, appliedEventCount, plan };
}

export function parseBackfillArguments(arguments_) {
  const options = {
    help: false,
    mode: "dry-run",
    target: "local",
    database: undefined,
    cwd: undefined,
    config: undefined,
    environment: undefined,
    persistTo: undefined,
    wrangler: "wrangler",
  };
  let explicitMode;
  let explicitTarget;
  const takeValue = (argument, index) => {
    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith("--")) {
      fail("INVALID_ARGUMENT", `${argument} requires a value.`);
    }
    return value;
  };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--dry-run" || argument === "--apply") {
      const mode = argument.slice(2);
      if (explicitMode !== undefined && explicitMode !== mode) {
        fail("INVALID_ARGUMENT", "Choose either --dry-run or --apply, not both.");
      }
      explicitMode = mode;
      options.mode = mode;
    } else if (argument === "--local" || argument === "--remote") {
      const target = argument.slice(2);
      if (explicitTarget !== undefined && explicitTarget !== target) {
        fail("INVALID_ARGUMENT", "Choose either --local or --remote, not both.");
      }
      explicitTarget = target;
      options.target = target;
    } else if (
      ["--database", "--cwd", "--config", "--env", "--persist-to", "--wrangler"].includes(argument)
    ) {
      const value = takeValue(argument, index);
      index += 1;
      if (argument === "--database") options.database = value;
      else if (argument === "--cwd") options.cwd = value;
      else if (argument === "--config") options.config = value;
      else if (argument === "--env") options.environment = value;
      else if (argument === "--persist-to") options.persistTo = value;
      else options.wrangler = value;
    } else {
      fail("INVALID_ARGUMENT", `Unknown argument: ${argument}`);
    }
  }
  if (!TARGET_VALUES.has(options.target)) fail("INVALID_ARGUMENT", "Invalid D1 target.");
  if (!options.help) requiredText(options.database, "--database");
  if (options.target === "remote" && options.persistTo !== undefined) {
    fail("INVALID_ARGUMENT", "--persist-to is only valid with --local.");
  }
  return options;
}

export const HELP_TEXT = `Usage: node scripts/d1-airtable-migration/backfill-agendas/backfill.mjs [options]

Plan or apply an additive backfill for every nondeleted D1 event without an agenda_states row.
Dry-run is the default. Apply inserts only the exact empty state and draft version 1.

Options:
  --database <name|binding>  D1 database name or binding (required)
  --local                    Use local D1 persistence (default)
  --remote                   Use the remote D1 database
  --dry-run                  Read and print the deterministic plan (default)
  --apply                    Apply the additive, idempotent plan
  --cwd <path>               Wrangler working directory
  --config <path>            Wrangler configuration path
  --env <name>               Wrangler environment
  --persist-to <path>        Local Wrangler persistence directory
  --wrangler <path>          Wrangler executable (default: wrangler)
  -h, --help                 Show this help
`;

export const EVENT_COLUMNS_SQL = "PRAGMA table_info(events)";

export function missingAgendasSql({ hasDeletedAt }) {
  return `SELECT
  e.organization_id AS organizationId,
  e.id AS eventId,
  e.time_zone AS timeZone,
  e.created_at AS createdAt,
  e.created_by AS createdBy
FROM events AS e
LEFT JOIN agenda_states AS state
  ON state.organization_id = e.organization_id
  AND state.event_id = e.id
WHERE ${hasDeletedAt ? "e.deleted_at IS NULL\n  AND " : ""}state.event_id IS NULL
ORDER BY e.organization_id COLLATE BINARY, e.id COLLATE BINARY`;
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function buildApplySql(plan) {
  if (plan?.format !== BACKFILL_FORMAT || plan.version !== BACKFILL_VERSION) {
    fail("INVALID_BACKFILL_PLAN", "Unsupported backfill plan.");
  }
  if (!Array.isArray(plan.events) || plan.events.length === 0) return "";
  const stateValues = plan.events.map((event) => {
    const { state } = event;
    return `(${[
      event.organizationId,
      event.eventId,
      state.stateVersion,
      state.timeZone,
      state.minimumTravelMinutes,
      state.currentPublishedRevisionId,
      state.createdAt,
      state.updatedAt,
    ]
      .map((value) =>
        value === null ? "NULL" : typeof value === "number" ? String(value) : sqlText(value),
      )
      .join(", ")})`;
  });
  const draftSelects = plan.events.map((event) => {
    const { state, draft } = event;
    return `SELECT ${[
      event.organizationId,
      event.eventId,
      draft.version,
      draft.timeZone,
      draft.updatedAt,
      draft.updatedBy,
    ]
      .map((value) => (typeof value === "number" ? String(value) : sqlText(value)))
      .join(", ")}
WHERE EXISTS (
  SELECT 1 FROM agenda_states
  WHERE organization_id = ${sqlText(event.organizationId)}
    AND event_id = ${sqlText(event.eventId)}
    AND state_version = ${state.stateVersion}
    AND time_zone = ${sqlText(state.timeZone)}
    AND minimum_travel_minutes = ${state.minimumTravelMinutes}
    AND current_published_revision_id IS NULL
    AND created_at = ${sqlText(state.createdAt)}
    AND updated_at = ${sqlText(state.updatedAt)}
)`;
  });
  return `INSERT INTO agenda_states (
  organization_id, event_id, state_version, time_zone, minimum_travel_minutes,
  current_published_revision_id, created_at, updated_at
) VALUES
  ${stateValues.join(",\n  ")}
ON CONFLICT (organization_id, event_id) DO NOTHING;

INSERT INTO agenda_drafts (
  organization_id, event_id, version, time_zone, updated_at, updated_by
)
${draftSelects.join("\nUNION ALL\n")}
ON CONFLICT (organization_id, event_id) DO NOTHING;`;
}

function wranglerArguments(options, sql) {
  const arguments_ = ["d1", "execute", options.database, "--command", sql, "--json", "--yes"];
  arguments_.push(options.target === "remote" ? "--remote" : "--local");
  if (options.cwd !== undefined) arguments_.push("--cwd", options.cwd);
  if (options.config !== undefined) arguments_.push("--config", options.config);
  if (options.environment !== undefined) arguments_.push("--env", options.environment);
  if (options.persistTo !== undefined) arguments_.push("--persist-to", options.persistTo);
  return arguments_;
}

function queryRows(payload) {
  if (!Array.isArray(payload)) fail("D1_RESPONSE_INVALID", "Wrangler returned invalid D1 JSON.");
  const rows = [];
  for (const result of payload) {
    if (result?.success === false)
      fail("D1_EXECUTION_FAILED", "D1 reported an unsuccessful query.");
    if (Array.isArray(result?.results)) rows.push(...result.results);
  }
  return rows;
}

function changedRows(payload) {
  if (!Array.isArray(payload)) fail("D1_RESPONSE_INVALID", "Wrangler returned invalid D1 JSON.");
  return payload.reduce((total, result) => {
    if (result?.success === false)
      fail("D1_EXECUTION_FAILED", "D1 reported an unsuccessful query.");
    const changes = result?.meta?.changes;
    return total + (Number.isInteger(changes) && changes > 0 ? changes : 0);
  }, 0);
}

export function createWranglerD1Adapter(options, { execute } = {}) {
  if (typeof execute !== "function") fail("INVALID_ADAPTER", "A Wrangler executor is required.");
  const run = async (sql) => {
    const result = await execute(options.wrangler, wranglerArguments(options, sql));
    if (result === null || typeof result !== "object" || result.exitCode !== 0) {
      fail("D1_EXECUTION_FAILED", "Wrangler D1 execution failed.");
    }
    try {
      return JSON.parse(result.stdout);
    } catch (cause) {
      fail("D1_RESPONSE_INVALID", "Wrangler returned invalid D1 JSON.", { cause });
    }
  };
  return {
    async listMissingAgendaEvents() {
      const columns = queryRows(await run(EVENT_COLUMNS_SQL));
      const names = new Set(columns.map((column) => column?.name));
      for (const requiredColumn of [
        "id",
        "organization_id",
        "time_zone",
        "created_at",
        "created_by",
      ]) {
        if (!names.has(requiredColumn)) {
          fail("D1_SCHEMA_UNSUPPORTED", `events.${requiredColumn} is required.`);
        }
      }
      return queryRows(await run(missingAgendasSql({ hasDeletedAt: names.has("deleted_at") })));
    },
    async applyBackfillPlan(plan) {
      const sql = buildApplySql(plan);
      if (sql.length === 0) return { appliedEventCount: 0 };
      const changes = changedRows(await run(sql));
      return { appliedEventCount: Math.min(plan.eventCount, changes) };
    },
  };
}
