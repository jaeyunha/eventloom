import { describe, expect, it } from "vitest";
import {
  DEFAULT_AGENDA_PLACEMENT_FILTERS,
  filterAgendaPlacementSessions,
} from "./agenda-placement-queue-model";
import type { AgendaSession } from "./types";

const sessions: readonly AgendaSession[] = [
  {
    id: "session-keynote",
    title: "Opening keynote",
    format: "Keynote",
    durationMinutes: 45,
    speakerNames: ["Morgan Lee"],
    capacityRequired: 400,
    trackIds: ["track-main"],
    trackNames: ["Main stage"],
  },
  {
    id: "session-workshop",
    title: "Designing reliable review systems",
    format: "Workshop",
    durationMinutes: 90,
    speakerNames: ["Sam Rivera"],
    capacityRequired: 80,
    trackIds: ["track-practice"],
    trackNames: ["In practice"],
  },
  {
    id: "session-lightning",
    title: "Fast feedback loops",
    format: "Lightning talk",
    durationMinutes: 30,
    speakerNames: ["Priya Shah"],
    capacityRequired: 120,
    trackIds: ["track-practice"],
    trackNames: ["In practice"],
  },
];

describe("placement queue filtering", () => {
  it("searches session, speaker, format, and track metadata", () => {
    const matches = filterAgendaPlacementSessions(sessions, {
      ...DEFAULT_AGENDA_PLACEMENT_FILTERS,
      query: "priya",
    });

    expect(matches.map((session) => session.id)).toEqual(["session-lightning"]);
  });

  it("combines filters and duration sorting deterministically", () => {
    const matches = filterAgendaPlacementSessions(sessions, {
      ...DEFAULT_AGENDA_PLACEMENT_FILTERS,
      track: "In practice",
      duration: "over-60",
      sort: "longest",
    });

    expect(matches.map((session) => session.id)).toEqual(["session-workshop"]);
  });
});
