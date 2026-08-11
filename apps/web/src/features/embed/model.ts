import type { EmbedTheme, PublishedAgendaEntry, PublishedEvent, PublishedSpeaker } from "./types";

export interface PublishedSpeakerSession {
  id: string;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  roomName: string | null;
}

type SpeakerSessionMetadata = {
  readonly sessions?: readonly unknown[];
  readonly sessionDetails?: readonly unknown[];
};

type GallerySessionMetadata = {
  readonly sessions?: readonly unknown[];
  readonly sessionDetails?: readonly unknown[];
  readonly entries?: readonly unknown[];
  readonly agenda?: {
    readonly entries?: readonly unknown[];
  };
};

function speakerSessionMetadata(value: PublishedSpeaker): SpeakerSessionMetadata {
  return value as PublishedSpeaker & SpeakerSessionMetadata;
}

function gallerySessionMetadata(value: unknown): GallerySessionMetadata {
  if (typeof value !== "object" || value === null) {
    return {};
  }
  return value as GallerySessionMetadata;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function normalizeSpeakerSession(
  value: unknown,
  fallbackId: string,
): PublishedSpeakerSession | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const title = readString(record.title) ?? readString(record.name);
  if (!title) {
    return null;
  }
  const date = readString(record.date) ?? readString(record.day);
  const startsAt =
    readString(record.startsAt) ??
    readString(record.startAt) ??
    readString(record.startDateTime) ??
    readString(record.startsOn) ??
    readString(record.dateTime) ??
    (date && readString(record.startTime) ? `${date} ${readString(record.startTime)}` : null);
  const endsAt =
    readString(record.endsAt) ??
    readString(record.endAt) ??
    readString(record.endDateTime) ??
    readString(record.endsOn) ??
    (date && readString(record.endTime) ? `${date} ${readString(record.endTime)}` : null);
  return {
    id: readString(record.id) ?? fallbackId,
    title,
    startsAt,
    endsAt,
    roomName: readString(record.roomName) ?? readString(record.room) ?? readString(record.location),
  };
}

export function publishedSpeakerSessions(
  speaker: PublishedSpeaker,
  gallery?: unknown,
): readonly PublishedSpeakerSession[] {
  const speakerMetadata = speakerSessionMetadata(speaker);
  const ownValues = speakerMetadata.sessions ?? speakerMetadata.sessionDetails ?? [];
  const galleryMetadata = gallerySessionMetadata(gallery);
  const galleryValues =
    galleryMetadata.sessions ??
    galleryMetadata.sessionDetails ??
    galleryMetadata.entries ??
    galleryMetadata.agenda?.entries ??
    [];
  const sourceValues = ownValues.length > 0 ? ownValues : galleryValues;
  const speakerIds = new Set(speaker.sessionIds);
  const speakerTitles = new Set(
    speaker.sessionTitles.map((title) => title.trim().toLocaleLowerCase()),
  );
  const sessions: PublishedSpeakerSession[] = [];

  for (const [index, value] of sourceValues.entries()) {
    const session = normalizeSpeakerSession(value, speaker.sessionIds[index] ?? `session-${index}`);
    if (!session) {
      continue;
    }
    const record = value as Record<string, unknown>;
    const speakerNames = Array.isArray(record.speakerNames)
      ? record.speakerNames.filter((name): name is string => typeof name === "string")
      : [];
    const normalizedDisplayName = speaker.displayName.trim().toLocaleLowerCase();
    const belongsToSpeaker =
      sourceValues === ownValues ||
      speakerIds.has(session.id) ||
      speakerTitles.has(session.title.trim().toLocaleLowerCase()) ||
      speakerIds.has(readString(record.sessionId) ?? "") ||
      speakerNames.some((name) => name.trim().toLocaleLowerCase() === normalizedDisplayName);
    if (belongsToSpeaker) {
      sessions.push(session);
    }
  }

  for (const [index, title] of speaker.sessionTitles.entries()) {
    if (!sessions.some((session) => session.title === title)) {
      sessions.push({
        id: speaker.sessionIds[index] ?? `session-${index}`,
        title,
        startsAt: null,
        endsAt: null,
        roomName: null,
      });
    }
  }

  return sessions.sort((left, right) => {
    if (left.startsAt && right.startsAt) {
      const startComparison = left.startsAt.localeCompare(right.startsAt);
      if (startComparison !== 0) {
        return startComparison;
      }
    } else if (left.startsAt) {
      return -1;
    } else if (right.startsAt) {
      return 1;
    }
    return left.title.localeCompare(right.title);
  });
}

export function speakerSurname(displayName: string): string {
  const normalized = displayName.trim().replace(/\s+/gu, " ");
  if (!normalized) {
    return "";
  }
  const commaIndex = normalized.indexOf(",");
  if (commaIndex > 0) {
    return normalized.slice(0, commaIndex).trim();
  }
  return normalized.split(" ").at(-1) ?? normalized;
}

export function sortSpeakersBySurname(
  speakers: readonly PublishedSpeaker[],
): readonly PublishedSpeaker[] {
  return [...speakers].sort((left, right) => {
    const surnameComparison = speakerSurname(left.displayName).localeCompare(
      speakerSurname(right.displayName),
      undefined,
      { sensitivity: "base" },
    );
    if (surnameComparison !== 0) {
      return surnameComparison;
    }
    const nameComparison = left.displayName.localeCompare(right.displayName, undefined, {
      sensitivity: "base",
    });
    return nameComparison !== 0 ? nameComparison : left.id.localeCompare(right.id);
  });
}

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
  return sortSpeakersBySurname(
    speakers.filter((speaker) => {
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
    }),
  );
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

function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value.trim());
  if (!match) return null;
  const [, yearValue, monthValue, dayValue] = match;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(date.valueOf()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function authoritativeEventDates(
  event: Pick<PublishedEvent, "startsOn" | "endsOn"> | undefined,
): readonly string[] | null {
  if (!event) return null;
  const start = parseDateOnly(event.startsOn);
  const end = parseDateOnly(event.endsOn);
  if (start === null || end === null || start.valueOf() > end.valueOf()) {
    return null;
  }
  const dates: string[] = [];
  for (let timestamp = start.valueOf(); timestamp <= end.valueOf(); timestamp += 86_400_000) {
    dates.push(new Date(timestamp).toISOString().slice(0, 10));
  }
  return dates;
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
  event?: Pick<PublishedEvent, "startsOn" | "endsOn">,
): readonly PublicAgendaDay[] {
  const dateFormatter = new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone,
  });
  const emptyDateFormatter = new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  const eventDates = authoritativeEventDates(event);
  const eventDateSet = eventDates === null ? null : new Set(eventDates);
  const byDate = new Map<string, PublishedAgendaEntry[]>();
  for (const entry of [...entries].sort((left, right) =>
    left.startsAt.localeCompare(right.startsAt),
  )) {
    const instant = new Date(entry.startsAt);
    if (Number.isNaN(instant.valueOf())) {
      continue;
    }
    const date = eventDateKey(entry.startsAt, timeZone);
    if (eventDateSet !== null && !eventDateSet.has(date)) {
      continue;
    }
    const dayEntries = byDate.get(date) ?? [];
    dayEntries.push(entry);
    byDate.set(date, dayEntries);
  }
  const dayDates =
    eventDates ?? [...byDate.keys()].sort((left, right) => left.localeCompare(right));
  return dayDates.map((date) => {
    const dayEntries = byDate.get(date) ?? [];
    return {
      date,
      label: dayEntries[0]
        ? dateFormatter.format(new Date(dayEntries[0].startsAt))
        : emptyDateFormatter.format(new Date(`${date}T12:00:00.000Z`)),
      entries: dayEntries,
    };
  });
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

export function formatPublishedDateTimeRange(
  startsAt: string,
  endsAt: string,
  timeZone: string,
): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) {
    return `${startsAt} – ${endsAt}`;
  }
  const date = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(start);
  return `${date}: ${formatPublishedTime(startsAt, timeZone)} – ${formatPublishedTime(
    endsAt,
    timeZone,
  )}`;
}

export function uniqueSorted(values: readonly (readonly string[])[]): readonly string[] {
  return [...new Set(values.flat())].sort((left, right) => left.localeCompare(right));
}
