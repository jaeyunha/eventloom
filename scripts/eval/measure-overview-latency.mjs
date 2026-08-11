/**
 * Phase 0 measurement: organizer-overview latency against the real Airtable base.
 *
 * Read-only (GET requests only). Times the current unfiltered full-table scans
 * used by AirtableOrganizerOverviewRepository.getOverview, then times a
 * server-side-filtered variant to project the improvement.
 *
 * Usage: node scripts/eval/measure-overview-latency.mjs
 * Reads AIRTABLE_ACCESS_TOKEN / AIRTABLE_BASE_ID / NEXT_PUBLIC_ORGANIZATION_ID
 * from the repository root .env.
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

const TABLES = [
  { name: "Events", jsonField: "Settings JSON" },
  { name: "Submissions", jsonField: "Answers JSON" },
  { name: "Review Plans", jsonField: "Rounds JSON" },
  { name: "Evaluations", jsonField: "Scores JSON" },
  { name: "Speaker Tasks", jsonField: "Owner JSON" },
  { name: "Sessions", jsonField: "Metadata JSON" },
];

async function listAll(table, { filterByFormula } = {}) {
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
    records += payload.records?.length ?? 0;
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
  for (const r of results) {
    console.log(
      `  ${r.table.padEnd(16)} ${String(r.ms).padStart(6)} ms  ${String(r.pages).padStart(2)} pages  ${String(r.records).padStart(4)} records  ${String(r.kb).padStart(5)} KB`,
    );
  }
  const serial = results.reduce((sum, r) => sum + r.ms, 0);
  console.log(`  wall (Promise.all): ${Math.round(wallMs)} ms | serial sum: ${serial} ms`);
}

// 1. Current behavior: six unfiltered full-table scans in parallel.
const wallStart = performance.now();
const unfiltered = await Promise.all(TABLES.map((table) => listAll(table)));
report(
  "CURRENT: unfiltered full-table scans (getOverview today)",
  unfiltered,
  performance.now() - wallStart,
);

// 2. Server-side filtering: events by org, then each table by event ids.
const orgFormula = `FIND(${JSON.stringify(`"organizationId":"${organizationId}"`)},{Settings JSON})>0`;
const filteredEvents = await listAll(TABLES[0], { filterByFormula: orgFormula });

const eventsRaw = await (async () => {
  // Re-fetch ids from the filtered events page(s) to build the event-id formula.
  const ids = [];
  let offset;
  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent("Events")}`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("filterByFormula", orgFormula);
    if (offset) url.searchParams.set("offset", offset);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const payload = await response.json();
    for (const record of payload.records ?? []) {
      try {
        const settings = JSON.parse(record.fields["Settings JSON"] ?? "{}");
        if (typeof settings.id === "string") ids.push(settings.id);
      } catch {
        // skip malformed rows
      }
    }
    offset = payload.offset;
  } while (offset);
  return ids;
})();

console.log(`\nEvents for org "${organizationId}": ${eventsRaw.length} (${eventsRaw.join(", ")})`);

const eventFormulaFor = (jsonField) =>
  eventsRaw.length === 1
    ? `FIND(${JSON.stringify(eventsRaw[0])},{${jsonField}})>0`
    : `OR(${eventsRaw.map((id) => `FIND(${JSON.stringify(id)},{${jsonField}})>0`).join(",")})`;

const filteredStart = performance.now();
const filtered = await Promise.all(
  TABLES.slice(1).map((table) =>
    listAll(table, { filterByFormula: eventFormulaFor(table.jsonField) }),
  ),
);
report(
  "PROPOSED: server-side filtered scans (events by org, rest by event ids)",
  [filteredEvents, ...filtered],
  performance.now() - filteredStart + filteredEvents.ms,
);
