/**
 * Read-only organizer-overview latency probe against the configured Airtable base.
 *
 * Measures the current split repository shape:
 * - core: one organization-scoped Events read;
 * - activity: scoped event discovery followed by parallel scoped secondary reads.
 *
 * Usage: node scripts/eval/measure-overview-latency.mjs
 * Reads AIRTABLE_ACCESS_TOKEN / AIRTABLE_BASE_ID / NEXT_PUBLIC_ORGANIZATION_ID
 * from the repository root .env and never prints credential values.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const env = Object.fromEntries(
  readFileSync(resolve(root, ".env"), "utf8")
    .split("\n")
    .map((line) => line.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map(([, key, value]) => [key, value.replace(/^"|"$/g, "")]),
);

const token = env.AIRTABLE_ACCESS_TOKEN;
const baseId = env.AIRTABLE_BASE_ID;
const organizationId = env.NEXT_PUBLIC_ORGANIZATION_ID ?? "ai-engineer";
if (!token || !baseId) {
  console.error("AIRTABLE_ACCESS_TOKEN and AIRTABLE_BASE_ID must be set in .env");
  process.exit(1);
}

const eventsTable = { name: "Events", jsonField: "Settings JSON" };
const activityTables = [
  { name: "Submissions", jsonField: "Answers JSON" },
  { name: "Review Plans", jsonField: "Rounds JSON" },
  { name: "Evaluations", jsonField: "Scores JSON" },
  { name: "Speaker Tasks", jsonField: "Owner JSON" },
  { name: "Sessions", jsonField: "Metadata JSON" },
];
const agendaTable = { name: "Agenda Versions", jsonField: "Conflicts JSON" };

async function listAll(table, { filterByFormula, onRecord } = {}) {
  const started = performance.now();
  let offset;
  let pages = 0;
  let records = 0;
  let bytes = 0;
  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table.name)}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    if (filterByFormula) url.searchParams.set("filterByFormula", filterByFormula);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`${table.name} list failed: HTTP ${response.status} ${body.slice(0, 200)}`);
    }
    const text = await response.text();
    bytes += text.length;
    const payload = JSON.parse(text);
    const pageRecords = payload.records ?? [];
    for (const record of pageRecords) onRecord?.(record);
    records += pageRecords.length;
    pages += 1;
    offset = payload.offset;
  } while (offset);
  return {
    table: table.name,
    ms: Math.round(performance.now() - started),
    pages,
    records,
    kb: Math.round(bytes / 1024),
  };
}

function report(label, results, wallMs) {
  console.log(`\n== ${label} ==`);
  for (const result of results) {
    console.log(
      `  ${result.table.padEnd(16)} ${String(result.ms).padStart(6)} ms  ${String(result.pages).padStart(2)} pages  ${String(result.records).padStart(4)} records  ${String(result.kb).padStart(5)} KB`,
    );
  }
  const serial = results.reduce((sum, result) => sum + result.ms, 0);
  console.log(`  wall: ${Math.round(wallMs)} ms | serial sum: ${serial} ms`);
}

function resolvedOrganizationId(record) {
  const organization = typeof record.organizationId === "string" ? record.organizationId : null;
  const tenant = typeof record.tenantId === "string" ? record.tenantId : null;
  if (organization && tenant && organization !== tenant) return null;
  return organization ?? tenant;
}

function collectEventId(record, values) {
  try {
    const event = JSON.parse(record.fields?.[eventsTable.jsonField] ?? "{}");
    if (resolvedOrganizationId(event) === organizationId && typeof event.id === "string") {
      values.push(event.id);
    }
  } catch {
    // The production repository also rejects malformed rows after Airtable decoding.
  }
}

const organizationFormula = `FIND(${JSON.stringify(organizationId)},{${eventsTable.jsonField}})>0`;

const coreEventIds = [];
const coreStart = performance.now();
const coreEvents = await listAll(eventsTable, {
  filterByFormula: organizationFormula,
  onRecord: (record) => collectEventId(record, coreEventIds),
});
report("CURRENT CORE: organization-scoped events", [coreEvents], performance.now() - coreStart);

const activityStart = performance.now();
const activityEventIds = [];
const activityEvents = await listAll(eventsTable, {
  filterByFormula: organizationFormula,
  onRecord: (record) => collectEventId(record, activityEventIds),
});
const needles = [organizationId, ...activityEventIds];
const scopedFormulaFor = (jsonField) =>
  needles.length === 1
    ? `FIND(${JSON.stringify(needles[0])},{${jsonField}})>0`
    : `OR(${needles.map((id) => `FIND(${JSON.stringify(id)},{${jsonField}})>0`).join(",")})`;
const agendaFormula =
  activityEventIds.length === 0
    ? "FALSE()"
    : activityEventIds.length === 1
      ? `{Application ID}=${JSON.stringify(activityEventIds[0])}`
      : `OR(${activityEventIds.map((id) => `{Application ID}=${JSON.stringify(id)}`).join(",")})`;
const secondary = await Promise.all([
  ...activityTables.map((table) =>
    listAll(table, { filterByFormula: scopedFormulaFor(table.jsonField) }),
  ),
  listAll(agendaTable, { filterByFormula: agendaFormula }),
]);
report(
  "CURRENT ACTIVITY: event discovery plus parallel scoped sources",
  [activityEvents, ...secondary],
  performance.now() - activityStart,
);
console.log(`\nScoped events discovered: ${activityEventIds.length}`);
