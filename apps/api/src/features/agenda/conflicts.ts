import type {
  AgendaCatalog,
  AgendaConflict,
  AgendaCustomRule,
  AgendaEntry,
  AgendaSession,
  AgendaValidationReport,
  AgendaWarning,
} from "./types";

export interface ConflictDetectionInput extends AgendaCatalog {
  entries: readonly AgendaEntry[];
  minimumTravelMinutes: number;
  customRules?: readonly AgendaCustomRule[];
}
export interface ReleasedSpeakerCommitmentDetectionInput {
  entries: readonly AgendaEntry[];
  releasedEntries: readonly AgendaEntry[];
  sessions: readonly AgendaSession[];
}

export function detectAgendaConflicts(input: ConflictDetectionInput): AgendaValidationReport {
  const conflicts: AgendaConflict[] = [];
  const warnings: AgendaWarning[] = [];
  const sessions = new Map(input.sessions.map((session) => [session.id, session]));
  const rooms = new Map(input.rooms.map((room) => [room.id, room]));
  const tracks = new Map(input.tracks.map((track) => [track.id, track]));

  for (const entry of input.entries) {
    const session = sessions.get(entry.sessionId);
    const room = rooms.get(entry.roomId);
    if (session === undefined || room === undefined) {
      continue;
    }
    if (session.capacityRequired > room.capacity) {
      warnings.push({
        id: conflictId("capacity", [entry.id], `${session.capacityRequired}-${room.capacity}`),
        kind: "capacity",
        entryIds: [entry.id],
        message: `${session.title} requires ${session.capacityRequired} seats, but ${room.name} has ${room.capacity}`,
      });
    }
  }

  for (let leftIndex = 0; leftIndex < input.entries.length; leftIndex += 1) {
    const left = input.entries[leftIndex];
    if (left === undefined) {
      continue;
    }
    const leftSession = sessions.get(left.sessionId);
    if (leftSession === undefined) {
      continue;
    }

    for (let rightIndex = leftIndex + 1; rightIndex < input.entries.length; rightIndex += 1) {
      const right = input.entries[rightIndex];
      if (right === undefined) {
        continue;
      }
      const rightSession = sessions.get(right.sessionId);
      if (rightSession === undefined) {
        continue;
      }

      const entryIds = [left.id, right.id] as const;
      const isOverlap = overlaps(left, right);
      const sharedParticipants = intersection(
        leftSession.participantIds,
        rightSession.participantIds,
      );
      const participantNames = sharedParticipants.map((participantId) =>
        participantName(participantId, leftSession, rightSession),
      );

      if (isOverlap && left.roomId === right.roomId) {
        const roomName = rooms.get(left.roomId)?.name ?? left.roomId;
        conflicts.push({
          id: conflictId("room", entryIds, left.roomId),
          kind: "room",
          entryIds,
          message: `Sessions "${leftSession.title}" and "${rightSession.title}" overlap in room "${roomName}"`,
        });
      }
      if (isOverlap && sharedParticipants.length > 0) {
        const participantList = participantNames.map((name) => `"${name}"`).join(", ");
        const participantLabel = participantNames.length === 1 ? "Speaker" : "Speakers";
        const participantVerb = participantNames.length === 1 ? "is" : "are";
        const sessionList = `"${leftSession.title}" and "${rightSession.title}"`;
        conflicts.push({
          id: conflictId("participant", entryIds, sharedParticipants.join("-")),
          kind: "participant",
          entryIds,
          message: `${participantLabel} ${participantList} ${participantVerb} scheduled in overlapping sessions ${sessionList}`,
        });
      }

      const sharedResources = intersection(leftSession.resourceIds, rightSession.resourceIds);
      if (isOverlap && sharedResources.length > 0) {
        conflicts.push({
          id: conflictId("resource", entryIds, sharedResources.join("-")),
          kind: "resource",
          entryIds,
          message: `Resources ${sharedResources.join(", ")} are assigned to overlapping sessions`,
        });
      }

      const sharedTracks = intersection(left.trackIds, right.trackIds);
      if (isOverlap && sharedTracks.length > 0) {
        const trackNames = sharedTracks.map((trackId) => tracks.get(trackId)?.name ?? trackId);
        const trackLabel = trackNames.length === 1 ? "Track" : "Tracks";
        const trackVerb = trackNames.length === 1 ? "contains" : "contain";
        warnings.push({
          id: conflictId("track", entryIds, sharedTracks.join("-")),
          kind: "track",
          entryIds,
          message: `${trackLabel} ${trackNames.map((name) => `"${name}"`).join(", ")} ${trackVerb} overlapping sessions`,
        });
      }

      if (
        !isOverlap &&
        input.minimumTravelMinutes > 0 &&
        left.roomId !== right.roomId &&
        sharedParticipants.length > 0
      ) {
        const gapMinutes = gapBetween(left, right) / (60 * 1000);
        if (gapMinutes < input.minimumTravelMinutes) {
          const participantList = participantNames.map((name) => `"${name}"`).join(", ");
          const participantLabel = participantNames.length === 1 ? "Speaker" : "Speakers";
          const participantVerb = participantNames.length === 1 ? "has" : "have";
          warnings.push({
            id: conflictId("travel", entryIds, sharedParticipants.join("-")),
            kind: "travel",
            entryIds,
            message: `${participantLabel} ${participantList} ${participantVerb} ${gapMinutes} minutes to change rooms; ${input.minimumTravelMinutes} required`,
          });
        }
      }
    }
  }

  for (const rule of input.customRules ?? []) {
    for (const warning of rule({
      entries: input.entries,
      rooms: input.rooms,
      sessions: input.sessions,
      tracks: input.tracks,
    })) {
      warnings.push(warning);
    }
  }

  return {
    conflicts: uniqueById(conflicts).sort(compareById),
    warnings: uniqueById(warnings).sort(compareById),
  };
}
export function detectReleasedSpeakerCommitmentConflicts(
  input: ReleasedSpeakerCommitmentDetectionInput,
): AgendaValidationReport {
  const conflicts: AgendaConflict[] = [];
  const sessions = new Map(input.sessions.map((session) => [session.id, session]));

  for (const entry of input.entries) {
    const session = sessions.get(entry.sessionId);
    if (session === undefined) continue;

    for (const releasedEntry of input.releasedEntries) {
      if (releasedEntry.sessionId === entry.sessionId || !overlaps(entry, releasedEntry)) {
        continue;
      }
      const releasedSession = sessions.get(releasedEntry.sessionId);
      if (releasedSession === undefined) continue;
      const sharedParticipants = intersection(
        session.participantIds,
        releasedSession.participantIds,
      );
      if (sharedParticipants.length === 0) continue;

      const participantNames = sharedParticipants.map((participantId) =>
        participantName(participantId, session, releasedSession),
      );
      const participantLabel = participantNames.length === 1 ? "Speaker" : "Speakers";
      const participantVerb = participantNames.length === 1 ? "has" : "have";
      conflicts.push({
        id: conflictId(
          "released-participant",
          [entry.id, releasedEntry.id],
          sharedParticipants.join("-"),
        ),
        kind: "participant",
        entryIds: [entry.id, releasedEntry.id],
        message: `${participantLabel} ${participantNames
          .map((name) => `"${name}"`)
          .join(", ")} ${participantVerb} an active released commitment for "${releasedSession.title}" that overlaps "${session.title}"`,
      });
    }
  }

  return {
    conflicts: uniqueById(conflicts).sort(compareById),
    warnings: [],
  };
}

function overlaps(left: AgendaEntry, right: AgendaEntry): boolean {
  return (
    Date.parse(left.startsAt) < Date.parse(right.endsAt) &&
    Date.parse(right.startsAt) < Date.parse(left.endsAt)
  );
}

function gapBetween(left: AgendaEntry, right: AgendaEntry): number {
  const leftEnd = Date.parse(left.endsAt);
  const rightEnd = Date.parse(right.endsAt);
  const leftStart = Date.parse(left.startsAt);
  const rightStart = Date.parse(right.startsAt);
  return leftStart <= rightStart ? rightStart - leftEnd : leftStart - rightEnd;
}

function intersection(left: readonly string[], right: readonly string[]): string[] {
  const rightValues = new Set(right);
  return [...new Set(left.filter((value) => rightValues.has(value)))].sort();
}

function participantName(
  participantId: string,
  leftSession: AgendaSession,
  rightSession: AgendaSession,
): string {
  return (
    participantNameForSession(participantId, leftSession) ??
    participantNameForSession(participantId, rightSession) ??
    participantId
  );
}

function participantNameForSession(
  participantId: string,
  session: AgendaSession,
): string | undefined {
  const participantIndex = session.participantIds.indexOf(participantId);
  if (participantIndex < 0) {
    return undefined;
  }
  const name = session.speakerNames?.[participantIndex]?.trim();
  return name === undefined || name.length === 0 ? undefined : name;
}

function conflictId(kind: string, entryIds: readonly string[], discriminator: string): string {
  const parts = [...entryIds].sort().map(encodeURIComponent);
  return `${kind}:${parts.join(":")}:${encodeURIComponent(discriminator)}`;
}

function uniqueById<T extends { id: string }>(values: readonly T[]): T[] {
  return [...new Map(values.map((value) => [value.id, value])).values()];
}

function compareById(left: { id: string }, right: { id: string }): number {
  return left.id.localeCompare(right.id);
}
