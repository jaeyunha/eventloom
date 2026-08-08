import type {
  AgendaCatalog,
  AgendaConflict,
  AgendaCustomRule,
  AgendaEntry,
  AgendaValidationReport,
  AgendaWarning,
} from "./types";

export interface ConflictDetectionInput extends AgendaCatalog {
  entries: readonly AgendaEntry[];
  minimumTravelMinutes: number;
  customRules?: readonly AgendaCustomRule[];
}

export function detectAgendaConflicts(input: ConflictDetectionInput): AgendaValidationReport {
  const conflicts: AgendaConflict[] = [];
  const warnings: AgendaWarning[] = [];
  const sessions = new Map(input.sessions.map((session) => [session.id, session]));
  const rooms = new Map(input.rooms.map((room) => [room.id, room]));

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

      if (isOverlap && left.roomId === right.roomId) {
        conflicts.push({
          id: conflictId("room", entryIds, left.roomId),
          kind: "room",
          entryIds,
          message: `Entries ${left.id} and ${right.id} overlap in the same room`,
        });
      }
      if (isOverlap && sharedParticipants.length > 0) {
        conflicts.push({
          id: conflictId("participant", entryIds, sharedParticipants.join("-")),
          kind: "participant",
          entryIds,
          message: `Participants ${sharedParticipants.join(", ")} are scheduled in overlapping sessions`,
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
        warnings.push({
          id: conflictId("track", entryIds, sharedTracks.join("-")),
          kind: "track",
          entryIds,
          message: `Tracks ${sharedTracks.join(", ")} contain overlapping sessions`,
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
          warnings.push({
            id: conflictId("travel", entryIds, sharedParticipants.join("-")),
            kind: "travel",
            entryIds,
            message: `Participants ${sharedParticipants.join(", ")} have ${gapMinutes} minutes to change rooms; ${input.minimumTravelMinutes} required`,
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

function overlaps(left: AgendaEntry, right: AgendaEntry): boolean {
  return Date.parse(left.startsAt) < Date.parse(right.endsAt) && Date.parse(right.startsAt) < Date.parse(left.endsAt);
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
