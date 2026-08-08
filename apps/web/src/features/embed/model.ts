import type {
  EmbedTheme,
  PublishedAgendaEntry,
  PublishedSpeaker,
} from "./types";

export interface PublicAgendaDay {
  date: string;
  label: string;
  entries: readonly PublishedAgendaEntry[];
}

export function embedTheme(value: string | string[] | undefined): EmbedTheme {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === "dark" || candidate === "light" ? candidate : "auto";
}

export function speakerInitials(displayName: string): string {
  return displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase() ?? "")
    .join("");
}

export function filterSpeakers(
  speakers: readonly PublishedSpeaker[],
  query: string,
  track: string,
): readonly PublishedSpeaker[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return speakers.filter((speaker) => {
    const matchesTrack = !track || speaker.trackNames.includes(track);
    if (!matchesTrack) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    return [
      speaker.displayName,
      speaker.jobTitle,
      speaker.organization,
      speaker.biography,
      ...speaker.sessionTitles,
    ]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
  });
}

function eventDateKey(value: string, timeZone: string): string {
  const instant = new Date(value);
  if (Number.isNaN(instant.valueOf())) {
    return "";
  }
  const parts = new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(instant);
  const valueFor = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${valueFor("year")}-${valueFor("month")}-${valueFor("day")}`;
}

export function filterAgendaEntries(
  entries: readonly PublishedAgendaEntry[],
  day: string,
  track: string,
  timeZone: string,
): readonly PublishedAgendaEntry[] {
  return entries.filter(
    (entry) =>
      (!day || eventDateKey(entry.startsAt, timeZone) === day) &&
      (!track || entry.trackNames.includes(track)),
  );
}

export function publicAgendaDays(
  entries: readonly PublishedAgendaEntry[],
  timeZone: string,
): readonly PublicAgendaDay[] {
  const dateFormatter = new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone,
  });
  const byDate = new Map<string, PublishedAgendaEntry[]>();
  for (const entry of [...entries].sort((left, right) => left.startsAt.localeCompare(right.startsAt))) {
    const instant = new Date(entry.startsAt);
    if (Number.isNaN(instant.valueOf())) {
      continue;
    }
    const date = eventDateKey(entry.startsAt, timeZone);
    const dayEntries = byDate.get(date) ?? [];
    dayEntries.push(entry);
    byDate.set(date, dayEntries);
  }
  return [...byDate].map(([date, dayEntries]) => ({
    date,
    label: dateFormatter.format(new Date(dayEntries[0]?.startsAt ?? date)),
    entries: dayEntries,
  }));
}

export function formatPublishedTime(value: string, timeZone: string): string {
  const instant = new Date(value);
  if (Number.isNaN(instant.valueOf())) {
    return value;
  }
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(instant);
}

export function uniqueSorted(values: readonly (readonly string[])[]): readonly string[] {
  return [...new Set(values.flat())].sort((left, right) => left.localeCompare(right));
}
