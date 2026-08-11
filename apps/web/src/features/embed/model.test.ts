import { describe, expect, it } from "vitest";
import {
  embedTheme,
  filterAgendaEntries,
  filterSpeakers,
  formatPublishedDateTimeRange,
  publicAgendaDays,
  publicPhotoUrl,
  publishedEntryPresenters,
  sortSpeakersBySurname,
  speakerInitials,
  speakerSurname,
} from "./model";
import type { PublishedAgendaEntry, PublishedSpeaker } from "./types";

const entries: readonly PublishedAgendaEntry[] = [
  {
    id: "entry_evening",
    sessionId: "session_lab",
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
    sessionId: "session_keynote",
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
    expect(days[0]?.entries.map((entry) => entry.id)).toEqual(["entry_morning", "entry_evening"]);
    expect(filterAgendaEntries(entries, "2026-09-18", "Build", "America/Los_Angeles")).toHaveLength(
      1,
    );
  });
  it("uses inclusive authoritative event boundaries for empty days", () => {
    const days = publicAgendaDays(entries, "America/Los_Angeles", {
      startsOn: "2026-09-18",
      endsOn: "2026-09-20",
    });

    expect(days.map((day) => day.date)).toEqual(["2026-09-18", "2026-09-19", "2026-09-20"]);
    expect(days[0]?.entries.map((entry) => entry.id)).toEqual(["entry_morning", "entry_evening"]);
    expect(days[2]?.entries).toEqual([]);
  });

  it("keeps a single-day authoritative event range to one day", () => {
    const days = publicAgendaDays(entries, "America/Los_Angeles", {
      startsOn: "2026-09-18",
      endsOn: "2026-09-18",
    });

    expect(days.map((day) => day.date)).toEqual(["2026-09-18"]);
    expect(days[0]?.entries).toHaveLength(2);
  });

  it("falls back to entry-derived days for invalid or reversed boundaries", () => {
    const invalidDays = publicAgendaDays(entries, "America/Los_Angeles", {
      startsOn: "not-a-date",
      endsOn: "2026-09-20",
    });
    const reversedDays = publicAgendaDays(entries, "America/Los_Angeles", {
      startsOn: "2026-09-20",
      endsOn: "2026-09-18",
    });

    expect(invalidDays.map((day) => day.date)).toEqual(["2026-09-18"]);
    expect(reversedDays.map((day) => day.date)).toEqual(["2026-09-18"]);
  });

  it("keeps event days when filters produce no matching entries", () => {
    const filteredEntries = filterAgendaEntries(
      entries,
      "",
      "Missing track",
      "America/Los_Angeles",
    );
    const days = publicAgendaDays(filteredEntries, "America/Los_Angeles", {
      startsOn: "2026-09-18",
      endsOn: "2026-09-20",
    });

    expect(filteredEntries).toEqual([]);
    expect(days.map((day) => day.date)).toEqual(["2026-09-18", "2026-09-19", "2026-09-20"]);
    expect(days.every((day) => day.entries.length === 0)).toBe(true);
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

  it("sorts surnames deterministically without confusing suffixes or comma notation", () => {
    const variants: readonly PublishedSpeaker[] = [
      { ...speakers[0]!, id: "speaker_2", displayName: "Alex Rivera Jr." },
      { ...speakers[0]!, id: "speaker_1", displayName: "Rivera, Alex" },
      { ...speakers[0]!, id: "speaker_3", displayName: "Ana de la Cruz" },
    ];

    expect(speakerSurname("Alex Rivera Jr.")).toBe("Rivera");
    expect(speakerSurname("Rivera, Alex")).toBe("Rivera");
    expect(speakerSurname("Ana de la Cruz")).toBe("de la Cruz");
    expect(speakerSurname("Alex Rivera PhD")).toBe("Rivera");
    expect(sortSpeakersBySurname(variants).map((speaker) => speaker.id)).toEqual([
      "speaker_3",
      "speaker_2",
      "speaker_1",
    ]);
  });

  it("preserves canonical speakers that share a display name", () => {
    const entry = entries[0]!;
    const sameNameSpeaker: PublishedSpeaker = {
      ...speakers[0]!,
      id: "speaker_morgan_2",
      jobTitle: "Principal Engineer",
    };

    expect(publishedEntryPresenters(entry, [speakers[0]!, sameNameSpeaker])).toMatchObject([
      {
        key: "speaker:speaker_morgan",
        displayName: "Morgan Lee",
        speaker: { id: "speaker_morgan", jobTitle: "Staff Engineer" },
      },
      {
        key: "speaker:speaker_morgan_2",
        displayName: "Morgan Lee",
        speaker: { id: "speaker_morgan_2", jobTitle: "Principal Engineer" },
      },
    ]);
  });

  it("shows the end day for a published range that crosses midnight", () => {
    expect(
      formatPublishedDateTimeRange(
        "2026-09-18T23:30:00.000Z",
        "2026-09-19T00:30:00.000Z",
        "UTC",
      ),
    ).toBe(
      "Friday, September 18, 2026: 11:30 PM – Saturday, September 19, 2026: 12:30 AM",
    );
  });

  it("accepts only stable public HTTPS headshot URLs", () => {
    expect(publicPhotoUrl("https://assets.example.test/public/speaker.webp")).toBe(
      "https://assets.example.test/public/speaker.webp",
    );
    expect(
      publicPhotoUrl("https://assets.example.test/private/speaker.webp?signature=secret"),
    ).toBeNull();
    expect(publicPhotoUrl("http://assets.example.test/public/speaker.webp")).toBeNull();
  });
});
