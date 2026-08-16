import type { EventSettingsAuditEntry } from "./api";

export interface EventSettingsAuditFieldChange {
  readonly field: string;
  readonly before: string;
  readonly after: string;
}

export interface EventSettingsAuditPresentation {
  readonly changeKind: "created" | "updated" | "deleted";
  readonly domain: string;
  readonly entityLabel: string;
  readonly summary: string;
  readonly versionLabel: string;
}

const ignoredSnapshotKeys = new Set([
  "id",
  "tenantId",
  "eventId",
  "version",
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
  "history",
]);

const fieldLabels: Readonly<Record<string, string>> = {
  agendaEligibleStatuses: "Private agenda statuses",
  capacity: "Capacity",
  description: "Description",
  name: "Name",
  resources: "Resources",
  statuses: "Session statuses",
};

function recordSnapshot(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Readonly<Record<string, unknown>>;
}

function displayValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "Not set";
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ") || "None";
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function comparableValue(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value);
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function eventSettingsAuditDiff(
  entry: EventSettingsAuditEntry,
): readonly EventSettingsAuditFieldChange[] {
  const before = recordSnapshot(entry.before);
  const after = recordSnapshot(entry.after);
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (key) => !ignoredSnapshotKeys.has(key),
  );

  return keys.flatMap((key) => {
    if (comparableValue(before[key]) === comparableValue(after[key])) return [];
    return [
      {
        field: fieldLabels[key] ?? key,
        before: displayValue(before[key]),
        after: displayValue(after[key]),
      },
    ];
  });
}

function auditDomain(entry: EventSettingsAuditEntry): string {
  if (entry.entityType === "settings") return "Session workflow";
  if (entry.entityType === "room") return "Rooms and venues";
  if (entry.entityType === "track") return "Tracks";
  if (entry.entityType === "format") return "Formats";
  if (entry.entityType === "level") return "Levels";
  if (entry.entityType === "tag") return "Tags";
  return "Sessions";
}

function auditEntityLabel(entry: EventSettingsAuditEntry): string {
  const after = recordSnapshot(entry.after);
  const before = recordSnapshot(entry.before);
  const label = after.name ?? after.title ?? before.name ?? before.title;
  if (typeof label === "string" && label.trim()) return label.trim();
  if (entry.entityType === "settings") return "Session statuses";
  return entry.entityId;
}

function auditChangeKind(
  action: EventSettingsAuditEntry["action"],
): EventSettingsAuditPresentation["changeKind"] {
  if (action === "created" || action === "deleted") return action;
  return "updated";
}

function auditSummary(
  entry: EventSettingsAuditEntry,
  changeKind: EventSettingsAuditPresentation["changeKind"],
): string {
  if (changeKind === "created") return "Created";
  if (changeKind === "deleted") return "Deleted";
  const changes = eventSettingsAuditDiff(entry);
  if (changes.length === 0) return "Updated";
  const fields = changes.map(({ field }) => field.toLowerCase());
  if (fields.length === 1) return `Changed ${fields[0]}`;
  if (fields.length === 2) return `Changed ${fields[0]} and ${fields[1]}`;
  return `Changed ${fields.slice(0, -1).join(", ")}, and ${fields.at(-1)}`;
}

export function eventSettingsAuditPresentation(
  entry: EventSettingsAuditEntry,
): EventSettingsAuditPresentation {
  const changeKind = auditChangeKind(entry.action);
  const previousVersion = Math.max(0, entry.version - 1);
  return {
    changeKind,
    domain: auditDomain(entry),
    entityLabel: auditEntityLabel(entry),
    summary: auditSummary(entry, changeKind),
    versionLabel:
      changeKind === "created" ? `v${entry.version}` : `v${previousVersion} → v${entry.version}`,
  };
}

export function settingsOnlyAuditEntries(
  entries: readonly EventSettingsAuditEntry[],
): readonly EventSettingsAuditEntry[] {
  return [...entries]
    .filter(({ entityType }) => entityType !== "session")
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
}
