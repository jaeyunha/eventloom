import { type AgendaApi, AgendaApiError } from "../api";
import type {
  AgendaConflict,
  AgendaEntry,
  AgendaEntryInput,
  AgendaPreview,
  AgendaRevision,
  AgendaSession,
  AgendaWarning,
  AgendaWorkspaceData,
} from "../types";

const INITIAL_TIMESTAMP = "2026-08-08T12:00:00.000Z";

const rooms = [
  { id: "room_main", name: "Main hall", capacity: 500 },
  { id: "room_studio", name: "Workshop studio", capacity: 80 },
] as const;

const tracks = [
  { id: "track_main", name: "Main stage", color: "#4f5ee8" },
  { id: "track_practice", name: "In practice", color: "#d45c36" },
] as const;

const sessions = [
  {
    id: "session_keynote",
    title: "Systems that stay understandable",
    format: "Keynote",
    durationMinutes: 45,
    speakerNames: ["Morgan Lee"],
    capacityRequired: 300,
  },
  {
    id: "session_operations",
    title: "Designing reliable CFP operations",
    format: "Talk",
    durationMinutes: 45,
    speakerNames: ["Avery Kim"],
    capacityRequired: 70,
  },
  {
    id: "session_review",
    title: "Practical review systems",
    format: "Workshop",
    durationMinutes: 60,
    speakerNames: ["Sam Rivera"],
    capacityRequired: 120,
  },
] as const satisfies readonly AgendaSession[];

const initialEntries: readonly AgendaEntry[] = [
  {
    id: "entry_keynote",
    sessionId: "session_keynote",
    title: "Systems that stay understandable",
    format: "Keynote",
    speakerNames: ["Morgan Lee"],
    roomId: "room_main",
    roomName: "Main hall",
    trackIds: ["track_main"],
    trackNames: ["Main stage"],
    startsAtLocal: "2026-09-18T09:00",
    endsAtLocal: "2026-09-18T09:45",
  },
  {
    id: "entry_operations",
    sessionId: "session_operations",
    title: "Designing reliable CFP operations",
    format: "Talk",
    speakerNames: ["Avery Kim"],
    roomId: "room_studio",
    roomName: "Workshop studio",
    trackIds: ["track_practice"],
    trackNames: ["In practice"],
    startsAtLocal: "2026-09-18T10:00",
    endsAtLocal: "2026-09-18T10:45",
  },
];

function clone<T>(value: T): T {
  return structuredClone(value);
}

function overlaps(left: AgendaEntry, right: AgendaEntry): boolean {
  return left.startsAtLocal < right.endsAtLocal && right.startsAtLocal < left.endsAtLocal;
}

function conflictsFor(entries: readonly AgendaEntry[]): readonly AgendaConflict[] {
  const conflicts: AgendaConflict[] = [];
  for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
    const left = entries[leftIndex];
    if (!left) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
      const right = entries[rightIndex];
      if (!right || !overlaps(left, right)) continue;
      const entryIds = [left.id, right.id];
      if (left.roomId === right.roomId) {
        conflicts.push({
          id: `conflict_room_${left.id}_${right.id}`,
          kind: "room",
          entryIds,
          message: `${left.roomName} already has a session at this time.`,
        });
      }
      const sharedSpeakers = left.speakerNames.filter((speaker) => right.speakerNames.includes(speaker));
      if (sharedSpeakers.length > 0) {
        conflicts.push({
          id: `conflict_participant_${left.id}_${right.id}`,
          kind: "participant",
          entryIds,
          message: `${sharedSpeakers.join(", ")} cannot present two sessions at the same time.`,
        });
      }
    }
  }
  return conflicts;
}

function warningsFor(
  entries: readonly AgendaEntry[],
  overrides: ReadonlyMap<string, string>,
): readonly AgendaWarning[] {
  return entries.flatMap((entry) => {
    const session = sessions.find((candidate) => candidate.id === entry.sessionId);
    const room = rooms.find((candidate) => candidate.id === entry.roomId);
    if (!session || !room || session.capacityRequired <= room.capacity) {
      return [];
    }
    const id = `warning_capacity_${entry.id}`;
    const overrideReason = overrides.get(id);
    return [
      {
        id,
        kind: "capacity" as const,
        entryIds: [entry.id],
        message: `${entry.title} expects ${session.capacityRequired} attendees, but ${room.name} seats ${room.capacity}.`,
        overridden: overrideReason !== undefined,
        ...(overrideReason === undefined ? {} : { overrideReason }),
      },
    ];
  });
}

function diffFrom(
  entries: readonly AgendaEntry[],
  publishedEntries: readonly AgendaEntry[],
): AgendaPreview["diff"] {
  const current = new Map(entries.map((entry) => [entry.id, entry]));
  const published = new Map(publishedEntries.map((entry) => [entry.id, entry]));
  let added = 0;
  let changed = 0;
  for (const [id, entry] of current) {
    const previous = published.get(id);
    if (!previous) {
      added += 1;
    } else if (JSON.stringify(entry) !== JSON.stringify(previous)) {
      changed += 1;
    }
  }
  let removed = 0;
  for (const id of published.keys()) {
    if (!current.has(id)) removed += 1;
  }
  return { added, changed, removed };
}

function demoError(code: string, message: string, status: number): AgendaApiError {
  return new AgendaApiError(code, message, status);
}

export function createAgendaDemoApi(eventId: string): AgendaApi {
  let version = 3;
  let mutationCount = 0;
  let entries: readonly AgendaEntry[] = clone(initialEntries);
  let publishedEntries: readonly AgendaEntry[] = clone(initialEntries.slice(0, 1));
  let overrides = new Map<string, string>();
  let revisions: AgendaRevision[] = [
    {
      id: "revision_1",
      number: 1,
      publishedAt: "2026-08-07T12:00:00.000Z",
      publishedBy: "Demo organizer",
      sessionCount: publishedEntries.length,
      current: true,
    },
  ];

  function timestamp(): string {
    return new Date(Date.parse(INITIAL_TIMESTAMP) + mutationCount * 60_000).toISOString();
  }

  function assertEvent(requestedEventId: string): void {
    if (requestedEventId !== eventId) {
      throw demoError("AGENDA_NOT_FOUND", "The local demo agenda was not found.", 404);
    }
  }

  function assertVersion(expectedVersion: number): void {
    if (expectedVersion !== version) {
      throw demoError(
        "AGENDA_VERSION_CONFLICT",
        `Draft v${version} has changed. Reload before saving again.`,
        409,
      );
    }
  }

  function touch(): void {
    mutationCount += 1;
    version += 1;
  }

  function workspace(): AgendaWorkspaceData {
    const currentPublishedRevision = revisions.find((revision) => revision.current) ?? null;
    const scheduledSessionIds = new Set(entries.map((entry) => entry.sessionId));
    return clone({
      event: {
        id: eventId,
        name: "Open Systems Summit 2026",
        timeZone: "America/Los_Angeles",
        startsOn: "2026-09-18",
        endsOn: "2026-09-19",
      },
      draft: {
        version,
        updatedAt: timestamp(),
        updatedBy: "Demo organizer",
        entries,
      },
      rooms,
      tracks,
      unscheduledSessions: sessions.filter((session) => !scheduledSessionIds.has(session.id)),
      revisions,
      currentPublishedRevision,
    });
  }

  function preview(): AgendaPreview {
    return clone({
      draftVersion: version,
      conflicts: conflictsFor(entries),
      warnings: warningsFor(entries, overrides),
      diff: diffFrom(entries, publishedEntries),
      validatedAt: timestamp(),
    });
  }

  function entryFrom(input: AgendaEntryInput): AgendaEntry {
    const session = sessions.find((candidate) => candidate.id === input.sessionId);
    const room = rooms.find((candidate) => candidate.id === input.roomId);
    const selectedTracks = input.trackIds.map((trackId) =>
      tracks.find((candidate) => candidate.id === trackId),
    );
    if (!session || !room || selectedTracks.some((track) => !track)) {
      throw demoError("AGENDA_ENTRY_INVALID", "Choose a valid session, room, and track.", 400);
    }
    if (input.trackIds.length === 0 || input.endsAtLocal <= input.startsAtLocal) {
      throw demoError("AGENDA_ENTRY_INVALID", "The agenda entry has invalid tracks or times.", 400);
    }
    const existingForSession = entries.find(
      (entry) => entry.sessionId === session.id && entry.id !== input.id,
    );
    if (existingForSession) {
      throw demoError("SESSION_ALREADY_SCHEDULED", "This session is already in the draft agenda.", 409);
    }
    return {
      id: input.id ?? `entry_${session.id}`,
      sessionId: session.id,
      title: session.title,
      format: session.format,
      speakerNames: session.speakerNames,
      roomId: room.id,
      roomName: room.name,
      trackIds: [...input.trackIds],
      trackNames: selectedTracks.map((track) => track?.name ?? ""),
      startsAtLocal: input.startsAtLocal,
      endsAtLocal: input.endsAtLocal,
    };
  }

  return {
    async getWorkspace(requestedEventId, signal) {
      if (signal?.aborted) throw new DOMException("The request was aborted.", "AbortError");
      assertEvent(requestedEventId);
      return workspace();
    },
    async saveEntry(input) {
      assertEvent(input.eventId);
      assertVersion(input.expectedVersion);
      const nextEntry = entryFrom(input.entry);
      const existingIndex = entries.findIndex((entry) => entry.id === nextEntry.id);
      if (input.entry.id && existingIndex < 0) {
        throw demoError("AGENDA_ENTRY_NOT_FOUND", "The agenda entry was not found.", 404);
      }
      entries =
        existingIndex < 0
          ? [...entries, nextEntry]
          : entries.map((entry, index) => (index === existingIndex ? nextEntry : entry));
      overrides = new Map();
      touch();
      return workspace();
    },
    async removeEntry(input) {
      assertEvent(input.eventId);
      assertVersion(input.expectedVersion);
      if (!entries.some((entry) => entry.id === input.entryId)) {
        throw demoError("AGENDA_ENTRY_NOT_FOUND", "The agenda entry was not found.", 404);
      }
      entries = entries.filter((entry) => entry.id !== input.entryId);
      overrides = new Map();
      touch();
      return workspace();
    },
    async preview(requestedEventId) {
      assertEvent(requestedEventId);
      return preview();
    },
    async overrideWarning(input) {
      assertEvent(input.eventId);
      assertVersion(input.expectedVersion);
      const warning = warningsFor(entries, overrides).find(
        (candidate) => candidate.id === input.warningId,
      );
      if (!warning) {
        throw demoError("AGENDA_WARNING_NOT_FOUND", "The agenda warning was not found.", 404);
      }
      if (input.reason.trim().length < 3) {
        throw demoError("AGENDA_OVERRIDE_INVALID", "Provide a reason for the warning override.", 400);
      }
      overrides.set(input.warningId, input.reason.trim());
      touch();
      return workspace();
    },
    async publish(input) {
      assertEvent(input.eventId);
      assertVersion(input.expectedVersion);
      const validation = preview();
      const unoverriddenWarnings = validation.warnings.filter((warning) => !warning.overridden);
      if (validation.conflicts.length > 0 || unoverriddenWarnings.length > 0) {
        throw new AgendaApiError(
          "PUBLICATION_BLOCKED",
          "Resolve hard conflicts and warnings before publishing.",
          409,
          undefined,
          { conflicts: validation.conflicts, warnings: validation.warnings },
        );
      }
      publishedEntries = clone(entries);
      revisions = revisions.map((revision) => ({ ...revision, current: false }));
      const nextNumber = Math.max(0, ...revisions.map((revision) => revision.number)) + 1;
      touch();
      revisions = [
        {
          id: `revision_${nextNumber}`,
          number: nextNumber,
          publishedAt: timestamp(),
          publishedBy: "Demo organizer",
          sessionCount: publishedEntries.length,
          current: true,
        },
        ...revisions,
      ];
      return workspace();
    },
  };
}

export function createLocalAgendaDemoApi(
  appEnvironment: string | undefined,
  eventId: string,
): AgendaApi | null {
  return appEnvironment?.trim() === "local" ? createAgendaDemoApi(eventId) : null;
}
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type LocalDemoApiSource =
  | AgendaApi
  | null
  | ((signal?: AbortSignal) => Promise<AgendaApi | null>);

export async function resolveAgendaAppEnvironment(
  configuredEnvironment: string | undefined,
  signal?: AbortSignal,
  fetcher: Fetcher = fetch,
): Promise<string | undefined> {
  const configured = configuredEnvironment?.trim();
  if (configured) return configured;

  try {
    const response = await fetcher("/health", {
      cache: "no-store",
      headers: { accept: "application/json" },
      ...(signal === undefined ? {} : { signal }),
    });
    if (!response.ok) return undefined;
    const body = (await response.json()) as { environment?: unknown };
    return typeof body.environment === "string" ? body.environment : undefined;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return undefined;
  }
}

export function isAgendaUnavailable(error: unknown): error is AgendaApiError {
  return (
    error instanceof AgendaApiError &&
    (error.status === 404 || error.status === 502 || error.status === 503 || error.status === 504)
  );
}

export async function loadAgendaWorkspace(
  primaryApi: AgendaApi,
  localDemoApi: LocalDemoApiSource,
  eventId: string,
  signal?: AbortSignal,
): Promise<{ api: AgendaApi; data: AgendaWorkspaceData; usingLocalDemo: boolean }> {
  try {
    return {
      api: primaryApi,
      data: await primaryApi.getWorkspace(eventId, signal),
      usingLocalDemo: false,
    };
  } catch (error) {
    if (!isAgendaUnavailable(error)) throw error;
    const resolvedLocalDemoApi =
      typeof localDemoApi === "function" ? await localDemoApi(signal) : localDemoApi;
    if (!resolvedLocalDemoApi) throw error;
    return {
      api: resolvedLocalDemoApi,
      data: await resolvedLocalDemoApi.getWorkspace(eventId, signal),
      usingLocalDemo: true,
    };
  }
}
