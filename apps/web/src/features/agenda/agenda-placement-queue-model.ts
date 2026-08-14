import type { AgendaSession } from "./types";

export const AGENDA_PLACEMENT_TRAY_LIMIT = 6;

export type AgendaPlacementDurationFilter = "all" | "up-to-30" | "31-to-60" | "over-60";
export type AgendaPlacementSort = "title" | "shortest" | "longest";

export interface AgendaPlacementQueueFilters {
  query: string;
  track: string;
  format: string;
  duration: AgendaPlacementDurationFilter;
  sort: AgendaPlacementSort;
}

export const DEFAULT_AGENDA_PLACEMENT_FILTERS: AgendaPlacementQueueFilters = {
  query: "",
  track: "all",
  format: "all",
  duration: "all",
  sort: "title",
};

export function agendaPlacementQueueOptions(sessions: readonly AgendaSession[]): {
  tracks: readonly string[];
  formats: readonly string[];
} {
  return {
    tracks: [...new Set(sessions.flatMap((session) => session.trackNames))].sort((left, right) =>
      left.localeCompare(right),
    ),
    formats: [...new Set(sessions.map((session) => session.format))].sort((left, right) =>
      left.localeCompare(right),
    ),
  };
}

function matchesDuration(durationMinutes: number, filter: AgendaPlacementDurationFilter): boolean {
  if (filter === "up-to-30") {
    return durationMinutes <= 30;
  }
  if (filter === "31-to-60") {
    return durationMinutes > 30 && durationMinutes <= 60;
  }
  if (filter === "over-60") {
    return durationMinutes > 60;
  }
  return true;
}

function compareSessions(
  left: AgendaSession,
  right: AgendaSession,
  sort: AgendaPlacementSort,
): number {
  if (sort === "shortest" || sort === "longest") {
    const direction = sort === "shortest" ? 1 : -1;
    const durationDifference = (left.durationMinutes - right.durationMinutes) * direction;
    if (durationDifference !== 0) {
      return durationDifference;
    }
  }

  return left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
}

export function filterAgendaPlacementSessions(
  sessions: readonly AgendaSession[],
  filters: AgendaPlacementQueueFilters,
): readonly AgendaSession[] {
  const query = filters.query.trim().toLocaleLowerCase();

  return sessions
    .filter((session) => {
      const matchesQuery =
        query.length === 0 ||
        [
          session.title,
          session.format,
          session.speakerNames.join(" "),
          session.trackNames.join(" "),
          String(session.durationMinutes),
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query);
      const matchesTrack = filters.track === "all" || session.trackNames.includes(filters.track);
      const matchesFormat = filters.format === "all" || session.format === filters.format;

      return (
        matchesQuery &&
        matchesTrack &&
        matchesFormat &&
        matchesDuration(session.durationMinutes, filters.duration)
      );
    })
    .sort((left, right) => compareSessions(left, right, filters.sort));
}
