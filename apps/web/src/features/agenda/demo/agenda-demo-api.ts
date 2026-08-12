import {
  type AgendaApi,
  AgendaApiError,
  type AgendaSuggestionChange,
  type AgendaSuggestionRule,
  type AgendaSuggestionRun,
} from "../api";
import type {
  AgendaCalendarDeliveryState,
  AgendaConflict,
  AgendaEntry,
  AgendaEntryInput,
  AgendaPreview,
  AgendaRevision,
  AgendaRoom,
  AgendaSession,
  AgendaTrack,
  AgendaWarning,
  AgendaWorkspaceData,
} from "../types";

const INITIAL_TIMESTAMP = "2026-08-08T12:00:00.000Z";

const initialRooms = [
  { id: "room_main", name: "Main hall", capacity: 500 },
  { id: "room_studio", name: "Workshop studio", capacity: 80 },
] as const;

const initialTracks = [
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
      const sharedSpeakers = left.speakerNames.filter((speaker) =>
        right.speakerNames.includes(speaker),
      );
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
  rooms: readonly AgendaRoom[],
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

interface SuggestionCriteria {
  readonly dates: readonly string[];
  readonly eligibleStatuses: readonly string[];
  readonly roomIds: readonly string[];
  readonly dayWindows: readonly {
    readonly date: string;
    readonly startLocal: string;
    readonly endLocal: string;
  }[];
  readonly orderedRules: readonly AgendaSuggestionRule[];
  readonly ignoreExistingTimes: boolean;
  readonly ignoreExistingRooms: boolean;
}

interface StoredSuggestionChange extends AgendaSuggestionChange {
  readonly before: AgendaEntry | null;
  readonly after: AgendaEntry | null;
}

interface StoredSuggestionRun {
  readonly run: AgendaSuggestionRun;
  readonly criteria: SuggestionCriteria;
  readonly changes: readonly StoredSuggestionChange[];
}

function localClockMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match?.[1] || !match[2]) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
}

function localDateTime(date: string, minutes: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(minutes)) return null;
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  if (Number.isNaN(timestamp)) return null;
  return new Date(timestamp + minutes * 60_000).toISOString().slice(0, 16);
}

function suggestionCriteria(input: {
  readonly dates: readonly string[];
  readonly eligibleStatuses: readonly string[];
  readonly roomIds: readonly string[];
  readonly dayWindows: readonly {
    readonly date: string;
    readonly startLocal: string;
    readonly endLocal: string;
  }[];
  readonly orderedRules: readonly AgendaSuggestionRule[];
  readonly ignoreExistingTimes: boolean;
  readonly ignoreExistingRooms: boolean;
}): SuggestionCriteria {
  return {
    dates: [...input.dates],
    eligibleStatuses: [...input.eligibleStatuses],
    roomIds: [...input.roomIds],
    dayWindows: input.dayWindows.map((window) => ({ ...window })),
    orderedRules: clone(input.orderedRules),
    ignoreExistingTimes: input.ignoreExistingTimes,
    ignoreExistingRooms: input.ignoreExistingRooms,
  };
}

function suggestionEntry(
  session: AgendaSession,
  room: AgendaRoom,
  track: AgendaTrack,
  date: string,
  startMinutes: number,
): AgendaEntry | null {
  const startsAtLocal = localDateTime(date, startMinutes);
  const endsAtLocal = localDateTime(date, startMinutes + session.durationMinutes);
  if (!startsAtLocal || !endsAtLocal) return null;
  return {
    id: `entry_${session.id}`,
    sessionId: session.id,
    title: session.title,
    format: session.format,
    speakerNames: [...session.speakerNames],
    roomId: room.id,
    roomName: room.name,
    trackIds: [track.id],
    trackNames: [track.name],
    startsAtLocal,
    endsAtLocal,
  };
}

function findSuggestionPlacement(
  session: AgendaSession,
  scheduledEntries: readonly AgendaEntry[],
  criteria: SuggestionCriteria,
  rooms: readonly AgendaRoom[],
  tracks: readonly AgendaTrack[],
): AgendaEntry | null {
  const track = tracks.find((candidate) => candidate.id === "track_practice") ?? tracks[0];
  if (!track) return null;
  for (const window of criteria.dayWindows) {
    if (!criteria.dates.includes(window.date)) continue;
    const windowStart = localClockMinutes(window.startLocal);
    const windowEnd = localClockMinutes(window.endLocal);
    if (windowStart === null || windowEnd === null || windowEnd <= windowStart) continue;
    for (
      let startMinutes = windowStart;
      startMinutes + session.durationMinutes <= windowEnd;
      startMinutes += 15
    ) {
      for (const roomId of criteria.roomIds) {
        const room = rooms.find((candidate) => candidate.id === roomId);
        if (!room) continue;
        const candidate = suggestionEntry(session, room, track, window.date, startMinutes);
        if (!candidate || conflictsFor([...scheduledEntries, candidate]).length > 0) continue;
        return candidate;
      }
    }
  }
  return null;
}

function buildSuggestion(
  id: string,
  version: number,
  baseDraftVersion: number,
  entries: readonly AgendaEntry[],
  criteria: SuggestionCriteria,
  rooms: readonly AgendaRoom[],
  tracks: readonly AgendaTrack[],
): StoredSuggestionRun {
  const scheduledSessionIds = new Set(entries.map((entry) => entry.sessionId));
  const proposedEntries = [...entries];
  const changes: StoredSuggestionChange[] = [];
  for (const session of sessions) {
    if (scheduledSessionIds.has(session.id)) continue;
    const placement = findSuggestionPlacement(session, proposedEntries, criteria, rooms, tracks);
    if (!placement) continue;
    proposedEntries.push(placement);
    scheduledSessionIds.add(session.id);
    changes.push({
      id: `change_${version}_${changes.length + 1}`,
      kind: "add",
      entryId: placement.id,
      sessionId: placement.sessionId,
      summary: `Add ${placement.title} to ${placement.roomName} at ${placement.startsAtLocal}.`,
      before: null,
      after: placement,
    });
  }
  const publicChanges: readonly AgendaSuggestionChange[] = changes.map(
    ({ before: _before, after: _after, ...change }) => change,
  );
  const candidateDiagnostics = {
    conflicts: conflictsFor(proposedEntries),
    warnings: warningsFor(proposedEntries, new Map(), rooms),
  };
  return {
    run: {
      id,
      version,
      status: "pending",
      baseDraftVersion,
      diff: {
        summary:
          publicChanges.length === 0
            ? "No deterministic placements are available for the selected criteria."
            : `${publicChanges.length} deterministic placement${publicChanges.length === 1 ? "" : "s"} are ready for human review.`,
        changes: publicChanges,
      },
      candidateDiagnostics,
      acceptedChangeIds: [],
    },
    criteria,
    changes,
  };
}

export function createAgendaDemoApi(eventId: string): AgendaApi {
  let version = 3;
  let rooms: AgendaRoom[] = initialRooms.map((room) => ({ ...room }));
  let tracks: AgendaTrack[] = initialTracks.map((track) => ({ ...track }));
  let calendarDelivery: AgendaCalendarDeliveryState = {
    state: "degraded",
    sentLast24Hours: 7,
    failedLast24Hours: 1,
    lastInvitationAt: INITIAL_TIMESTAMP,
    lastFailure: {
      deliveryId: `calendar-demo-failure-${eventId}`,
      summary: "One invitation needs a retry after its recipient address was corrected.",
      occurredAt: INITIAL_TIMESTAMP,
      retryable: true,
    },
  };
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
  let suggestionSequence = 0;
  const suggestionRuns = new Map<string, StoredSuggestionRun>();

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
      releaseConflicts: [],
      warnings: warningsFor(entries, overrides, rooms),
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
      throw demoError(
        "SESSION_ALREADY_SCHEDULED",
        "This session is already in the draft agenda.",
        409,
      );
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
  function requireSuggestion(runId: string): StoredSuggestionRun {
    const stored = suggestionRuns.get(runId);
    if (!stored) {
      throw demoError("SUGGESTION_NOT_FOUND", "The local agenda suggestion was not found.", 404);
    }
    return stored;
  }

  function validateSuggestionInput(input: {
    readonly dates: readonly string[];
    readonly eligibleStatuses: readonly string[];
    readonly roomIds: readonly string[];
    readonly dayWindows: readonly {
      readonly date: string;
      readonly startLocal: string;
      readonly endLocal: string;
    }[];
    readonly orderedRules: readonly AgendaSuggestionRule[];
    readonly ignoreExistingTimes: boolean;
    readonly ignoreExistingRooms: boolean;
  }): SuggestionCriteria {
    if (
      input.dates.length === 0 ||
      input.eligibleStatuses.length === 0 ||
      input.roomIds.length === 0 ||
      input.dayWindows.length === 0
    ) {
      throw demoError(
        "SUGGESTION_INVALID",
        "Provide dates, eligible statuses, rooms, and day windows for the suggestion.",
        400,
      );
    }
    if (new Set(input.dates).size !== input.dates.length) {
      throw demoError("SUGGESTION_INVALID", "Suggestion dates must be unique.", 400);
    }
    if (new Set(input.roomIds).size !== input.roomIds.length) {
      throw demoError("SUGGESTION_INVALID", "Suggestion rooms must be unique.", 400);
    }
    if (input.roomIds.some((roomId) => !rooms.some((room) => room.id === roomId))) {
      throw demoError("SUGGESTION_INVALID", "Choose valid rooms for the suggestion.", 400);
    }
    if (
      input.dates.some((date) => !/^\d{4}-\d{2}-\d{2}$/.test(date)) ||
      input.dayWindows.some(
        (window) =>
          !input.dates.includes(window.date) ||
          localClockMinutes(window.startLocal) === null ||
          localClockMinutes(window.endLocal) === null,
      )
    ) {
      throw demoError("SUGGESTION_INVALID", "Suggestion dates and windows are invalid.", 400);
    }
    return suggestionCriteria(input);
  }

  function nextSuggestionId(): string {
    suggestionSequence += 1;
    return `suggestion_${suggestionSequence}`;
  }

  function pendingSuggestion(stored: StoredSuggestionRun): void {
    if (stored.run.status !== "pending") {
      throw demoError(
        "SUGGESTION_STATE_INVALID",
        `The local agenda suggestion is already ${stored.run.status}.`,
        409,
      );
    }
  }
  function applySuggestionChanges(
    stored: StoredSuggestionRun,
    acceptedChangeIds: readonly string[],
  ): readonly AgendaEntry[] {
    if (acceptedChangeIds.length === 0) {
      throw demoError("SUGGESTION_INVALID", "Choose at least one suggestion change to apply.", 400);
    }
    if (new Set(acceptedChangeIds).size !== acceptedChangeIds.length) {
      throw demoError("SUGGESTION_INVALID", "A suggestion change cannot be selected twice.", 400);
    }
    const selected = acceptedChangeIds.map((changeId) => {
      const change = stored.changes.find((candidate) => candidate.id === changeId);
      if (!change) {
        throw demoError("SUGGESTION_INVALID", `Suggestion change not found: ${changeId}.`, 400);
      }
      return change;
    });
    let nextEntries = [...entries];
    for (const change of selected) {
      const index = nextEntries.findIndex((entry) => entry.id === change.entryId);
      if (change.kind === "add") {
        if (change.after === null || index >= 0) {
          throw demoError(
            "SUGGESTION_CONFLICT",
            "The selected suggestion no longer matches the private draft.",
            409,
          );
        }
        nextEntries.push(clone(change.after));
      } else if (change.kind === "remove") {
        if (index < 0) {
          throw demoError(
            "SUGGESTION_CONFLICT",
            "The selected suggestion no longer matches the private draft.",
            409,
          );
        }
        nextEntries = nextEntries.filter((entry) => entry.id !== change.entryId);
      } else {
        const after = change.after;
        if (after === null || index < 0) {
          throw demoError(
            "SUGGESTION_CONFLICT",
            "The selected suggestion no longer matches the private draft.",
            409,
          );
        }
        nextEntries = nextEntries.map((entry) =>
          entry.id === change.entryId ? clone(after) : entry,
        );
      }
    }
    const conflicts = conflictsFor(nextEntries);
    const candidateDiagnostics = {
      conflicts,
      warnings: warningsFor(nextEntries, new Map(), rooms),
    };
    if (conflicts.length > 0) {
      throw new AgendaApiError(
        "SUGGESTION_CONFLICT",
        "The selected suggestion introduces hard agenda conflicts.",
        409,
        undefined,
        { conflicts },
        {
          evaluated: true,
          report: candidateDiagnostics,
          authoritativeSavedPreview: preview(),
        },
      );
    }
    return nextEntries;
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
    async createRoom(input) {
      assertEvent(input.eventId);
      const name = input.name.trim();
      if (
        name.length === 0 ||
        !Number.isInteger(input.capacity) ||
        input.capacity < 0
      ) {
        throw demoError("AGENDA_ROOM_INVALID", "Provide a room name and non-negative capacity.", 400);
      }
      const resource: AgendaRoom = {
        id: `room_demo_${rooms.length + 1}`,
        name,
        capacity: input.capacity,
      };
      rooms = [...rooms, resource];
      touch();
      const authoritativeWorkspace = workspace();
      const authoritativeResource = authoritativeWorkspace.rooms.find(
        (room) => room.id === resource.id,
      );
      if (!authoritativeResource) {
        throw new Error("The created room was not present in the authoritative demo workspace.");
      }
      return { resource: authoritativeResource, workspace: authoritativeWorkspace };
    },
    async createTrack(input) {
      assertEvent(input.eventId);
      const name = input.name.trim();
      if (name.length === 0) {
        throw demoError("AGENDA_TRACK_INVALID", "Provide a track name.", 400);
      }
      const resource: AgendaTrack = {
        id: `track_demo_${tracks.length + 1}`,
        name,
        color: ["#4f5ee8", "#d45c36", "#2d9cdb", "#8e44ad"][tracks.length % 4] ?? "#4f5ee8",
      };
      tracks = [...tracks, resource];
      touch();
      const authoritativeWorkspace = workspace();
      const authoritativeResource = authoritativeWorkspace.tracks.find(
        (track) => track.id === resource.id,
      );
      if (!authoritativeResource) {
        throw new Error("The created track was not present in the authoritative demo workspace.");
      }
      return { resource: authoritativeResource, workspace: authoritativeWorkspace };
    },
    async preview(requestedEventId) {
      assertEvent(requestedEventId);
      return preview();
    },
    async getCalendarDelivery(requestedEventId, signal) {
      if (signal?.aborted) throw new DOMException("The request was aborted.", "AbortError");
      assertEvent(requestedEventId);
      return clone(calendarDelivery);
    },
    async retryCalendarDelivery(input) {
      assertEvent(input.eventId);
      const failure = calendarDelivery.lastFailure;
      if (
        failure === null ||
        failure.deliveryId !== input.deliveryId ||
        !failure.retryable
      ) {
        throw demoError("CALENDAR_DELIVERY_NOT_FOUND", "The calendar delivery was not found.", 404);
      }
      calendarDelivery = {
        ...calendarDelivery,
        state: "connected",
        sentLast24Hours: calendarDelivery.sentLast24Hours + 1,
        lastFailure: null,
      };
      return clone(calendarDelivery);
    },
    async overrideWarning(input) {
      assertEvent(input.eventId);
      assertVersion(input.expectedVersion);
      const warning = warningsFor(entries, overrides, rooms).find(
        (candidate) => candidate.id === input.warningId,
      );
      if (!warning) {
        throw demoError("AGENDA_WARNING_NOT_FOUND", "The agenda warning was not found.", 404);
      }
      if (input.reason.trim().length < 3) {
        throw demoError(
          "AGENDA_OVERRIDE_INVALID",
          "Provide a reason for the warning override.",
          400,
        );
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
      if (
        validation.conflicts.length > 0 ||
        validation.releaseConflicts.length > 0 ||
        unoverriddenWarnings.length > 0
      ) {
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
    async generateSuggestion(input) {
      assertEvent(input.eventId);
      assertVersion(input.baseDraftVersion);
      const criteria = validateSuggestionInput(input);
      const stored = buildSuggestion(
        nextSuggestionId(),
        1,
        input.baseDraftVersion,
        entries,
        criteria,
        rooms,
        tracks,
      );
      suggestionRuns.set(stored.run.id, stored);
      return clone(stored.run);
    },
    async regenerateSuggestion(input) {
      assertEvent(input.eventId);
      const previous = requireSuggestion(input.runId);
      if (previous.run.status === "applied" || previous.run.status === "superseded") {
        throw demoError(
          "SUGGESTION_STATE_INVALID",
          `The local agenda suggestion is already ${previous.run.status}.`,
          409,
        );
      }
      assertVersion(input.baseDraftVersion);
      if (previous.run.status === "pending") {
        suggestionRuns.set(previous.run.id, {
          ...previous,
          run: { ...previous.run, status: "superseded" },
        });
      }
      const stored = buildSuggestion(
        nextSuggestionId(),
        previous.run.version + 1,
        input.baseDraftVersion,
        entries,
        previous.criteria,
        rooms,
        tracks,
      );
      suggestionRuns.set(stored.run.id, stored);
      return clone(stored.run);
    },
    async rejectSuggestion(input) {
      assertEvent(input.eventId);
      const stored = requireSuggestion(input.runId);
      pendingSuggestion(stored);
      const rejected: StoredSuggestionRun = {
        ...stored,
        run: { ...stored.run, status: "rejected" },
      };
      suggestionRuns.set(input.runId, rejected);
      return clone(rejected.run);
    },
    async applySuggestion(input) {
      assertEvent(input.eventId);
      const stored = requireSuggestion(input.runId);
      pendingSuggestion(stored);
      if (stored.run.baseDraftVersion !== version) {
        throw new AgendaApiError(
          "AGENDA_VERSION_CONFLICT",
          `Draft v${version} has changed. Reload before saving again.`,
          412,
          undefined,
          undefined,
          {
            evaluated: false,
            report: null,
            authoritativeSavedPreview: preview(),
          },
        );
      }
      const nextEntries = applySuggestionChanges(stored, input.acceptedChangeIds);
      entries = nextEntries;
      overrides = new Map();
      touch();
      const applied: StoredSuggestionRun = {
        ...stored,
        run: {
          ...stored.run,
          status: "applied",
          acceptedChangeIds: [...input.acceptedChangeIds],
        },
      };
      suggestionRuns.set(input.runId, applied);
      return workspace();
    },
    async getSuggestion(input) {
      assertEvent(input.eventId);
      return clone(requireSuggestion(input.runId).run);
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
type LocalDemoApiSource = AgendaApi | null | ((signal?: AbortSignal) => Promise<AgendaApi | null>);

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

export function isAgendaUnavailable(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof AgendaApiError &&
      (error.status === 404 ||
        error.status === 502 ||
        error.status === 503 ||
        error.status === 504))
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
