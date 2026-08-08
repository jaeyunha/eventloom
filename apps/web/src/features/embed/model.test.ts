import { describe, expect, it } from "vitest";
import {
  embedTheme,
  filterAgendaEntries,
  filterSpeakers,
  publicAgendaDays,
  speakerInitials,
} from "./model";
import type { PublishedAgendaEntry, PublishedSpeaker } from "./types";

const entries: readonly PublishedAgendaEntry[] = [
  {
    id: "entry_evening",
    title: "Evening systems lab",
    summary: "Hands-on collaboration.",
    format: "Workshop",
    speakerNames: ["Morgan Lee"],
    roomName: "Lab",
    trackNames: ["Build"],
    startsAt: "2026-09-19T01:30:00.000Z",
    endsAt: "2026-09-19T02:30:00.000Z",
  },
  {
    id: "entry_morning",
    title: "Opening keynote",
    summary: "A practical opening.",
    format: "Keynote",
    speakerNames: ["Sam Rivera"],
    roomName: "Main hall",
    trackNames: ["Main stage"],
    startsAt: "2026-09-18T16:00:00.000Z",
    endsAt: "2026-09-18T16:45:00.000Z",
  },
];

const speakers: readonly PublishedSpeaker[] = [
  {
    id: "speaker_morgan",
    displayName: "Morgan Lee",
    pronouns: "they/them",
    jobTitle: "Staff Engineer",
    organization: "Open Works",
    biography: "Morgan builds understandable review systems.",
    photoUrl: null,
    sessionIds: ["session_lab"],
    sessionTitles: ["Evening systems lab"],
    trackNames: ["Build"],
  },
  {
    id: "speaker_sam",
    displayName: "Sam Rivera",
    pronouns: null,
    jobTitle: null,
    organization: null,
    biography: "Sam leads communities.",
    photoUrl: null,
    sessionIds: ["session_keynote"],
    sessionTitles: ["Opening keynote"],
    trackNames: ["Main stage"],
  },
];

describe("published embed model", () => {
  it("uses an allowlist for public themes", () => {
    expect(embedTheme("dark")).toBe("dark");
    expect(embedTheme("custom-css")).toBe("auto");
    expect(embedTheme(["light", "dark"])).toBe("light");
  });

  it("groups UTC instants by the event timezone", () => {
    const days = publicAgendaDays(entries, "America/Los_Angeles");

    expect(days).toHaveLength(1);
    expect(days[0]?.date).toBe("2026-09-18");
    expect(days[0]?.entries.map((entry) => entry.id)).toEqual([
      "entry_morning",
      "entry_evening",
    ]);
    expect(filterAgendaEntries(entries, "2026-09-18", "Build", "America/Los_Angeles"))
      .toHaveLength(1);
  });

  it("filters published speaker fields without relying on private records", () => {
    expect(filterSpeakers(speakers, "review", "").map((speaker) => speaker.id)).toEqual([
      "speaker_morgan",
    ]);
    expect(filterSpeakers(speakers, "", "Main stage").map((speaker) => speaker.id)).toEqual([
      "speaker_sam",
    ]);
    expect(speakerInitials("Morgan Lee")).toBe("ML");
  });
});
