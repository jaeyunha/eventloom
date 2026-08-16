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

function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    Number.isNaN(date.valueOf()) ||
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return null;
  }
  return date;
}

export function eventDates(startsOn: string, endsOn: string): readonly string[] {
  const start = parseDateOnly(startsOn);
  const end = parseDateOnly(endsOn);
  if (start === null || end === null || start.valueOf() > end.valueOf()) return [];

  const dates: string[] = [];
  for (let current = start.valueOf(); current <= end.valueOf(); current += 86_400_000) {
    dates.push(new Date(current).toISOString().slice(0, 10));
  }
  return dates;
}

export function eventScheduleDates(
  event: Pick<AgendaWorkspaceData["event"], "startsOn" | "endsOn" | "scheduleDates">,
): readonly string[] {
  return event.scheduleDates?.length
    ? [...event.scheduleDates]
    : eventDates(event.startsOn, event.endsOn);
}

export function resolveAgendaPlacementDate(selectedDay: string, eventStart: string): string {
  return selectedDay === "" ? eventStart : selectedDay;
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

export function agendaDays(
  entries: readonly AgendaEntry[],
  event?: Pick<AgendaWorkspaceData["event"], "startsOn" | "endsOn" | "scheduleDates">,
): readonly AgendaDay[] {
  const dates = event
    ? event.scheduleDates?.length
      ? event.scheduleDates
      : eventDates(event.startsOn, event.endsOn)
    : null;
  const eventDateSet = dates === null ? null : new Set(dates);
  const byDate = new Map<string, AgendaEntry[]>();
  for (const entry of [...entries].sort((left, right) => {
    const timeOrder = left.startsAtLocal.localeCompare(right.startsAtLocal);
    return timeOrder === 0 ? left.roomName.localeCompare(right.roomName) : timeOrder;
  })) {
    const date = entry.startsAtLocal.slice(0, 10);
    if (eventDateSet !== null && !eventDateSet.has(date)) continue;
    const dayEntries = byDate.get(date) ?? [];
    dayEntries.push(entry);
    byDate.set(date, dayEntries);
  }

  const dayDates = dates ?? [...byDate.keys()];
  return dayDates.map((date) => ({
    date,
    label: formatLocalDate(`${date}T12:00`),
    entries: byDate.get(date) ?? [],
  }));
}

export function acceptedSessionCount(
  data: Pick<AgendaWorkspaceData, "acceptedSessionIds">,
): number {
  return new Set(data.acceptedSessionIds).size;
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
      reasons.push(
        `Resolve ${preview.conflicts.length} hard conflict${preview.conflicts.length === 1 ? "" : "s"}.`,
      );
    }
    if (preview.releaseConflicts.length > 0) {
      reasons.push(
        `Resolve ${preview.releaseConflicts.length} released commitment conflict${preview.releaseConflicts.length === 1 ? "" : "s"}.`,
      );
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
    return "recently";
  }
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
