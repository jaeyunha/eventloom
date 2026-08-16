import type { EmbedTheme, PublishedAgendaEntry, PublishedEvent, PublishedSpeaker } from "./types";
export function literalSearchPattern(value: string): RegExp | null {
  if (value.length === 0) return null;
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u");
}

export interface PublishedSpeakerSession {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  roomName: string;
  trackNames: readonly string[];
}

export function publishedSpeakerSessions(
  speaker: PublishedSpeaker,
  entries: readonly PublishedAgendaEntry[],
): readonly PublishedSpeakerSession[] {
  const sessionIds = new Set(speaker.sessionIds);
  const sessions: PublishedSpeakerSession[] = [];
  for (const entry of entries) {
    if (!sessionIds.has(entry.sessionId)) continue;
    sessions.push({
      id: entry.sessionId,
      title: entry.title,
      startsAt: entry.startsAt,
      endsAt: entry.endsAt,
      roomName: entry.roomName,
      trackNames: entry.trackNames,
    });
  }
  return sessions.sort((left, right) => {
    const startComparison = left.startsAt.localeCompare(right.startsAt);
    return startComparison !== 0 ? startComparison : left.id.localeCompare(right.id);
  });
}

export function publishedEntrySpeakers(
  entry: PublishedAgendaEntry,
  speakers: readonly PublishedSpeaker[],
): readonly PublishedSpeaker[] {
  return speakers.filter((speaker) => speaker.sessionIds.includes(entry.sessionId));
}
export function publishedSpeakerSearchTermsBySessionId(
  speakers: readonly PublishedSpeaker[],
): ReadonlyMap<string, readonly string[]> {
  const searchTermsBySessionId = new Map<string, string[]>();
  for (const speaker of speakers) {
    const searchTerms = [
      speaker.displayName,
      speaker.jobTitle,
      speaker.organization,
      speaker.biography,
    ].filter((value): value is string => Boolean(value));
    for (const sessionId of new Set(speaker.sessionIds)) {
      const existing = searchTermsBySessionId.get(sessionId);
      if (existing === undefined) {
        searchTermsBySessionId.set(sessionId, [...searchTerms]);
      } else {
        existing.push(...searchTerms);
      }
    }
  }
  return searchTermsBySessionId;
}

function speakerMatchesTrackId(
  speaker: PublishedSpeaker,
  trackIdsBySessionId: ReadonlyMap<string, ReadonlySet<string>>,
  trackId: string,
): boolean {
  for (const sessionId of speaker.sessionIds) {
    if (trackIdsBySessionId.get(sessionId)?.has(trackId)) return true;
  }
  return false;
}

/**
 * Filters configured speakers by stable published track IDs. Display-name facets
 * continue to use filterSpeakers, which intentionally operates on track labels.
 */
export function filterSpeakersByTrackIds(
  speakers: readonly PublishedSpeaker[],
  entries: readonly PublishedAgendaEntry[],
  trackIds: readonly string[],
): readonly PublishedSpeaker[] {
  const configuredTrackIds = trackIds.filter((trackId) => trackId.trim().length > 0);
  if (configuredTrackIds.length === 0) return speakers;

  const trackIdsBySessionId = new Map<string, Set<string>>();
  for (const entry of entries) {
    const entryTrackIds = trackIdsBySessionId.get(entry.sessionId) ?? new Set<string>();
    for (const trackId of entry.trackIds ?? []) {
      entryTrackIds.add(trackId);
    }
    trackIdsBySessionId.set(entry.sessionId, entryTrackIds);
  }

  return speakers.filter((speaker) =>
    configuredTrackIds.some((trackId) =>
      speakerMatchesTrackId(speaker, trackIdsBySessionId, trackId),
    ),
  );
}

export interface PublishedEntryPresenter {
  readonly key: string;
  readonly displayName: string;
  readonly speaker: PublishedSpeaker | null;
}

function presenterNameKey(displayName: string): string {
  return displayName.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en");
}

export function publishedEntryPresenters(
  entry: PublishedAgendaEntry,
  speakers: readonly PublishedSpeaker[],
): readonly PublishedEntryPresenter[] {
  const linkedSpeakers = publishedEntrySpeakers(entry, speakers);
  const linkedNameCounts = new Map<string, number>();
  for (const speaker of linkedSpeakers) {
    const nameKey = presenterNameKey(speaker.displayName);
    linkedNameCounts.set(nameKey, (linkedNameCounts.get(nameKey) ?? 0) + 1);
  }

  const publishedNamePresenters = entry.speakerNames.flatMap((displayName, index) => {
    const trimmedDisplayName = displayName.trim();
    if (trimmedDisplayName.length === 0) return [];

    const nameKey = presenterNameKey(trimmedDisplayName);
    const linkedNameCount = linkedNameCounts.get(nameKey) ?? 0;
    if (linkedNameCount > 0) {
      linkedNameCounts.set(nameKey, linkedNameCount - 1);
      return [];
    }
    return [
      {
        key: `published-name:${entry.id}:${index}`,
        displayName: trimmedDisplayName,
        speaker: null,
      },
    ];
  });

  return [
    ...linkedSpeakers.map((speaker) => ({
      key: `speaker:${speaker.id}`,
      displayName: speaker.displayName,
      speaker,
    })),
    ...publishedNamePresenters,
  ];
}

const surnameSuffixes = new Set([
  "jr",
  "sr",
  "ii",
  "iii",
  "iv",
  "v",
  "esq",
  "jd",
  "mba",
  "md",
  "pe",
  "phd",
  "rn",
]);
const surnamePrefixes = new Set(["da", "de", "del", "den", "der", "di", "dos", "la", "van", "von"]);

function surnameToken(value: string): string {
  return value.toLocaleLowerCase("en").replace(/[.,]+$/gu, "");
}

export function speakerSurname(displayName: string): string {
  const normalized = displayName.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (!normalized) return "";
  const commaIndex = normalized.indexOf(",");
  if (commaIndex > 0) return normalized.slice(0, commaIndex).trim();

  const parts = normalized.split(" ");
  while (parts.length > 1 && surnameSuffixes.has(surnameToken(parts.at(-1) ?? ""))) {
    parts.pop();
  }
  let surnameStart = parts.length - 1;
  while (surnameStart > 0 && surnamePrefixes.has(surnameToken(parts[surnameStart - 1] ?? ""))) {
    surnameStart -= 1;
  }
  return parts.slice(surnameStart).join(" ");
}

const baseNameCollator = new Intl.Collator("en", { sensitivity: "base" });
const exactNameCollator = new Intl.Collator("en", { sensitivity: "variant" });

const EMBED_EVENT_DATE_KEY_OPTIONS = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
} as const;
const EMBED_DAY_LABEL_OPTIONS = {
  weekday: "long",
  month: "long",
  day: "numeric",
} as const;
const EMBED_TIME_LABEL_OPTIONS = {
  hour: "numeric",
  minute: "2-digit",
} as const;
const EMBED_SESSION_DATE_OPTIONS = {
  weekday: "short",
  month: "short",
  day: "numeric",
} as const;
const EMBED_SESSION_DATE_TIME_OPTIONS = {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
} as const;
const EMBED_DATE_TIME_RANGE_OPTIONS = {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
} as const;
const EMBED_EVENT_DATE_KEY_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();
const EMBED_DAY_LABEL_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();
const EMBED_TIME_LABEL_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();
const EMBED_SESSION_DATE_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();
const EMBED_SESSION_DATE_TIME_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();
const EMBED_DATE_TIME_RANGE_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();
const EMBED_UTC_DAY_LABEL_FORMATTER = new Intl.DateTimeFormat("en", {
  ...EMBED_DAY_LABEL_OPTIONS,
  timeZone: "UTC",
});

function embedEventDateKeyFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = EMBED_EVENT_DATE_KEY_FORMATTER_CACHE.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en", {
    ...EMBED_EVENT_DATE_KEY_OPTIONS,
    timeZone,
  });
  EMBED_EVENT_DATE_KEY_FORMATTER_CACHE.set(timeZone, formatter);
  return formatter;
}

function embedDayLabelFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = EMBED_DAY_LABEL_FORMATTER_CACHE.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en", {
    ...EMBED_DAY_LABEL_OPTIONS,
    timeZone,
  });
  EMBED_DAY_LABEL_FORMATTER_CACHE.set(timeZone, formatter);
  return formatter;
}

function embedTimeLabelFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = EMBED_TIME_LABEL_FORMATTER_CACHE.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en", {
    ...EMBED_TIME_LABEL_OPTIONS,
    timeZone,
  });
  EMBED_TIME_LABEL_FORMATTER_CACHE.set(timeZone, formatter);
  return formatter;
}

function embedSessionDateFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = EMBED_SESSION_DATE_FORMATTER_CACHE.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-US", {
    ...EMBED_SESSION_DATE_OPTIONS,
    timeZone,
  });
  EMBED_SESSION_DATE_FORMATTER_CACHE.set(timeZone, formatter);
  return formatter;
}

function embedSessionDateTimeFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = EMBED_SESSION_DATE_TIME_FORMATTER_CACHE.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-US", {
    ...EMBED_SESSION_DATE_TIME_OPTIONS,
    timeZone,
  });
  EMBED_SESSION_DATE_TIME_FORMATTER_CACHE.set(timeZone, formatter);
  return formatter;
}

function embedDateTimeRangeFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = EMBED_DATE_TIME_RANGE_FORMATTER_CACHE.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-US", {
    ...EMBED_DATE_TIME_RANGE_OPTIONS,
    timeZone,
  });
  EMBED_DATE_TIME_RANGE_FORMATTER_CACHE.set(timeZone, formatter);
  return formatter;
}

export function sortSpeakersBySurname(
  speakers: readonly PublishedSpeaker[],
): readonly PublishedSpeaker[] {
  return [...speakers].sort((left, right) => {
    const leftSurname = speakerSurname(left.displayName);
    const rightSurname = speakerSurname(right.displayName);
    return (
      baseNameCollator.compare(leftSurname, rightSurname) ||
      exactNameCollator.compare(leftSurname, rightSurname) ||
      baseNameCollator.compare(left.displayName, right.displayName) ||
      exactNameCollator.compare(left.displayName, right.displayName) ||
      left.id.localeCompare(right.id)
    );
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

export function publicPhotoUrl(value: string | null): string | null {
  if (!value) return null;
  if (value.includes("?") || value.includes("#")) return null;
  if (value.startsWith("/api/public/")) {
    // Same-origin published-projection headshots must stay relative, traversal-free, and credential-free.
    if (value.includes("://") || value.includes("..") || value.includes("\\")) {
      return null;
    }
    return value;
  }
  if (value.startsWith("//")) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      url.search.length > 0 ||
      url.hash.length > 0 ||
      url.pathname.startsWith("/api/public/")
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export type EmbedLayout = "comfortable" | "compact" | "list" | "grid" | "timeline";

export type EmbedDisplayField =
  | "title"
  | "date-time"
  | "room"
  | "speakers"
  | "format"
  | "track"
  | "summary"
  | "company"
  | "bio";

export const EMBED_LAYOUTS: readonly EmbedLayout[] = [
  "comfortable",
  "compact",
  "list",
  "grid",
  "timeline",
];

export const EMBED_DISPLAY_FIELDS: readonly EmbedDisplayField[] = [
  "title",
  "date-time",
  "room",
  "speakers",
  "format",
  "track",
  "summary",
  "company",
  "bio",
];

const REQUIRED_EMBED_DISPLAY_FIELDS: readonly EmbedDisplayField[] = ["title", "date-time"];

export interface EmbedQuery {
  readonly theme: EmbedTheme;
  readonly layout: EmbedLayout | null;
  readonly displayFields: readonly EmbedDisplayField[] | null;
  /** Stable published track IDs; display-name facets are separate interactive state. */
  readonly tracks: readonly string[];
  readonly accent: string | null;
  readonly backgroundColor: string | null;
  readonly textColor: string | null;
}

type EmbedQuerySource = Readonly<Record<string, string | string[] | undefined>> | URLSearchParams;

function embedQueryHas(source: EmbedQuerySource, key: string): boolean {
  if (source instanceof URLSearchParams) return source.has(key);
  const value = source[key];
  return value !== undefined;
}

function embedQueryFirst(source: EmbedQuerySource, key: string): string | null {
  if (source instanceof URLSearchParams) return source.get(key);
  const value = source[key];
  if (value === undefined) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function embedQueryCsv(source: EmbedQuerySource, key: string): string | null {
  if (source instanceof URLSearchParams) return source.get(key);
  const value = source[key];
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.length === 0 ? null : value.join(",");
  return value;
}

function isEmbedLayout(value: string): value is EmbedLayout {
  return (EMBED_LAYOUTS as readonly string[]).includes(value);
}

function isEmbedDisplayField(value: string): value is EmbedDisplayField {
  return (EMBED_DISPLAY_FIELDS as readonly string[]).includes(value);
}

function normalizeEmbedHexColor(value: string | null): string | null {
  if (value === null) return null;
  const candidate = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/u.test(candidate) ? candidate : null;
}

function normalizeEmbedCsvTracks(value: string | null): readonly string[] {
  if (value === null) return [];
  const seen = new Set<string>();
  const tracks: string[] = [];
  for (const raw of value.split(",")) {
    const trimmed = raw.trim();
    if (trimmed.length > 0 && !seen.has(trimmed)) {
      seen.add(trimmed);
      tracks.push(trimmed);
    }
  }
  return tracks;
}

function normalizeEmbedDisplayFields(value: string | null): readonly EmbedDisplayField[] {
  const ordered: EmbedDisplayField[] = [];
  const seen = new Set<EmbedDisplayField>();
  if (value !== null) {
    for (const raw of value.split(",")) {
      const trimmed = raw.trim();
      if (isEmbedDisplayField(trimmed) && !seen.has(trimmed)) {
        seen.add(trimmed);
        ordered.push(trimmed);
      }
    }
  }
  for (const required of REQUIRED_EMBED_DISPLAY_FIELDS) {
    if (!seen.has(required)) {
      seen.add(required);
      ordered.push(required);
    }
  }
  return ordered;
}

export function parseEmbedQuery(source: EmbedQuerySource): EmbedQuery {
  const theme = embedTheme(embedQueryFirst(source, "theme") ?? undefined);
  const layoutValue = embedQueryFirst(source, "layout");
  const layout = layoutValue !== null && isEmbedLayout(layoutValue) ? layoutValue : null;
  const displayFieldsValue = embedQueryCsv(source, "displayFields");
  const displayFields = embedQueryHas(source, "displayFields")
    ? normalizeEmbedDisplayFields(displayFieldsValue)
    : null;
  return {
    theme,
    layout,
    displayFields,
    tracks: normalizeEmbedCsvTracks(embedQueryCsv(source, "trackIds")),
    accent: normalizeEmbedHexColor(embedQueryFirst(source, "accent")),
    backgroundColor: normalizeEmbedHexColor(embedQueryFirst(source, "backgroundColor")),
    textColor: normalizeEmbedHexColor(embedQueryFirst(source, "textColor")),
  };
}

export function serializeEmbedQuery(query: EmbedQuery): string {
  const params = new URLSearchParams();
  if (query.theme !== "auto") params.set("theme", query.theme);
  if (query.layout) params.set("layout", query.layout);
  if (query.displayFields) {
    params.set("displayFields", query.displayFields.join(","));
  }
  if (query.tracks.length > 0) params.set("trackIds", query.tracks.join(","));
  if (query.accent) params.set("accent", query.accent);
  if (query.backgroundColor) params.set("backgroundColor", query.backgroundColor);
  if (query.textColor) params.set("textColor", query.textColor);
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

export function escapeXmlValue(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
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
  const parts = embedEventDateKeyFormatter(timeZone).formatToParts(instant);
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
/**
 * Applies configured embed filtering using immutable agenda track IDs.
 * Missing track IDs therefore fail closed instead of falling back to labels.
 */
export function filterAgendaEntriesByTrackIds(
  entries: readonly PublishedAgendaEntry[],
  trackIds: readonly string[],
): readonly PublishedAgendaEntry[] {
  const configuredTrackIds = trackIds.filter((trackId) => trackId.trim().length > 0);
  if (configuredTrackIds.length === 0) return entries;
  const configuredTrackIdSet = new Set(configuredTrackIds);
  return entries.filter((entry) =>
    (entry.trackIds ?? []).some((trackId) => configuredTrackIdSet.has(trackId)),
  );
}

export function publicAgendaDays(
  entries: readonly PublishedAgendaEntry[],
  timeZone: string,
  event?: Pick<PublishedEvent, "startsOn" | "endsOn">,
): readonly PublicAgendaDay[] {
  const dateFormatter = embedDayLabelFormatter(timeZone);
  const emptyDateFormatter = EMBED_UTC_DAY_LABEL_FORMATTER;
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
  return embedTimeLabelFormatter(timeZone).format(instant);
}

export interface PublishedSessionSchedule {
  readonly dateLabel: string;
  readonly endTimeLabel: string;
  readonly startTimeLabel: string;
  readonly timeLabel: string;
}

export function formatPublishedSessionSchedule(
  startsAt: string,
  endsAt: string,
  timeZone: string,
): PublishedSessionSchedule {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) {
    return {
      dateLabel: startsAt,
      endTimeLabel: endsAt,
      startTimeLabel: startsAt,
      timeLabel: endsAt,
    };
  }
  const dateLabel = embedSessionDateFormatter(timeZone).format(start);
  const startTime = formatPublishedTime(startsAt, timeZone);
  const endTime = formatPublishedTime(endsAt, timeZone);
  const [startClock, startPeriod] = startTime.split(" ");
  const [, endPeriod] = endTime.split(" ");
  const compactStart = startPeriod === endPeriod ? startClock : startTime;
  if (eventDateKey(startsAt, timeZone) === eventDateKey(endsAt, timeZone)) {
    return {
      dateLabel,
      endTimeLabel: endTime,
      startTimeLabel: startTime,
      timeLabel: `${compactStart} – ${endTime}`,
    };
  }
  const endDateTime = embedSessionDateTimeFormatter(timeZone).format(end);
  return {
    dateLabel,
    endTimeLabel: endDateTime,
    startTimeLabel: startTime,
    timeLabel: `${startTime} – ${endDateTime}`,
  };
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
  const dateFormatter = embedDateTimeRangeFormatter(timeZone);
  const startDate = dateFormatter.format(start);
  const startTime = formatPublishedTime(startsAt, timeZone);
  const endTime = formatPublishedTime(endsAt, timeZone);
  if (eventDateKey(startsAt, timeZone) === eventDateKey(endsAt, timeZone)) {
    return `${startDate}: ${startTime} – ${endTime}`;
  }
  return `${startDate}: ${startTime} – ${dateFormatter.format(end)}: ${endTime}`;
}

export function uniqueSorted(values: readonly (readonly string[])[]): readonly string[] {
  return [...new Set(values.flat())].sort((left, right) => left.localeCompare(right));
}
