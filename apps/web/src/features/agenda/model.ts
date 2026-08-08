import type {
  AgendaConflict,
  AgendaEntry,
  AgendaPreview,
  AgendaWarning,
  AgendaWorkspaceData,
} from "./types";

export interface AgendaDay {
  date: string;
  label: string;
  entries: readonly AgendaEntry[];
}

function parseLocalDateTime(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) {
    return null;
  }
  const [, year, month, day, hour, minute] = match;
  const date = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)),
  );
  return Number.isNaN(date.valueOf()) ? null : date;
}

export function formatLocalDate(value: string): string {
  const date = parseLocalDateTime(value);
  if (!date) {
    return value;
  }
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatLocalTime(value: string): string {
  const date = parseLocalDateTime(value);
  if (!date) {
    return value;
  }
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

export function agendaDays(entries: readonly AgendaEntry[]): readonly AgendaDay[] {
  const byDate = new Map<string, AgendaEntry[]>();
  for (const entry of [...entries].sort((left, right) => {
    const timeOrder = left.startsAtLocal.localeCompare(right.startsAtLocal);
    return timeOrder === 0 ? left.roomName.localeCompare(right.roomName) : timeOrder;
  })) {
    const date = entry.startsAtLocal.slice(0, 10);
    const dayEntries = byDate.get(date) ?? [];
    dayEntries.push(entry);
    byDate.set(date, dayEntries);
  }

  return [...byDate].map(([date, dayEntries]) => ({
    date,
    label: formatLocalDate(dayEntries[0]?.startsAtLocal ?? date),
    entries: dayEntries,
  }));
}

export function conflictsForEntry(
  entryId: string,
  conflicts: readonly AgendaConflict[],
): readonly AgendaConflict[] {
  return conflicts.filter((conflict) => conflict.entryIds.includes(entryId));
}

export function warningsForEntry(
  entryId: string,
  warnings: readonly AgendaWarning[],
): readonly AgendaWarning[] {
  return warnings.filter((warning) => warning.entryIds.includes(entryId));
}

export interface PublicationReadiness {
  ready: boolean;
  reasons: readonly string[];
}

export function publicationReadiness(
  data: AgendaWorkspaceData,
  preview: AgendaPreview | null,
): PublicationReadiness {
  const reasons: string[] = [];
  if (data.draft.entries.length === 0) {
    reasons.push("Schedule at least one accepted session.");
  }
  if (!preview || preview.draftVersion !== data.draft.version) {
    reasons.push("Validate the current draft before publishing.");
  } else {
    if (preview.conflicts.length > 0) {
      reasons.push(`Resolve ${preview.conflicts.length} hard conflict${preview.conflicts.length === 1 ? "" : "s"}.`);
    }
    const unoverriddenWarnings = preview.warnings.filter((warning) => !warning.overridden);
    if (unoverriddenWarnings.length > 0) {
      reasons.push(
        `Resolve or override ${unoverriddenWarnings.length} warning${unoverriddenWarnings.length === 1 ? "" : "s"}.`,
      );
    }
  }
  return { ready: reasons.length === 0, reasons };
}

export function formatRevisionTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
