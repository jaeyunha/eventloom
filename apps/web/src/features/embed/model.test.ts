import { describe, expect, it } from "vitest";
import {
  embedTheme,
  escapeXmlValue,
  filterAgendaEntries,
  filterAgendaEntriesByTrackIds,
  filterSpeakers,
  filterSpeakersByTrackIds,
  formatPublishedDateTimeRange,
  parseEmbedQuery,
  publicAgendaDays,
  publicPhotoUrl,
  publishedEntryPresenters,
  serializeEmbedQuery,
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
    trackIds: ["track_build"],
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
    trackIds: ["track_main"],
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
  it("filters configured speakers through stable agenda track IDs", () => {
    const renamedEntries = entries.map((entry) =>
      entry.id === "entry_evening"
        ? { ...entry, trackNames: ["Renamed track"], trackIds: ["track_build"] }
        : entry,
    );
    expect(
      filterAgendaEntriesByTrackIds(renamedEntries, ["track_build"]).map((entry) => entry.id),
    ).toEqual(["entry_evening"]);
    expect(
      filterSpeakersByTrackIds(speakers, renamedEntries, ["track_build"]).map(
        (speaker) => speaker.id,
      ),
    ).toEqual(["speaker_morgan"]);
    expect(filterSpeakersByTrackIds(speakers, renamedEntries, ["missing"])).toEqual([]);
  });

  it("fails closed when stable agenda track IDs are absent", () => {
    const withoutTrackIds = entries.map((entry) =>
      entry.id === "entry_evening" ? { ...entry, trackIds: [] } : entry,
    );
    expect(filterAgendaEntriesByTrackIds(withoutTrackIds, ["track_build"])).toEqual([]);
    expect(filterSpeakersByTrackIds(speakers, withoutTrackIds, ["track_build"])).toEqual([]);
  });

  it("sorts surnames deterministically without confusing suffixes or comma notation", () => {
    const firstSpeaker = speakers[0];
    if (!firstSpeaker) {
      throw new Error("Expected the first speaker fixture.");
    }
    const variants: readonly PublishedSpeaker[] = [
      { ...firstSpeaker, id: "speaker_2", displayName: "Alex Rivera Jr." },
      { ...firstSpeaker, id: "speaker_1", displayName: "Rivera, Alex" },
      { ...firstSpeaker, id: "speaker_3", displayName: "Ana de la Cruz" },
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
    const entry = entries[0];
    if (!entry) {
      throw new Error("Expected the first agenda entry fixture.");
    }
    const firstSpeaker = speakers[0];
    if (!firstSpeaker) {
      throw new Error("Expected the first speaker fixture.");
    }
    const sameNameSpeaker: PublishedSpeaker = {
      ...firstSpeaker,
      id: "speaker_morgan_2",
      jobTitle: "Principal Engineer",
    };

    expect(publishedEntryPresenters(entry, [firstSpeaker, sameNameSpeaker])).toMatchObject([
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
  it("keeps unmatched published names alongside linked canonical speakers", () => {
    const entry = entries[0];
    if (!entry) {
      throw new Error("Expected the first agenda entry fixture.");
    }
    const firstSpeaker = speakers[0];
    if (!firstSpeaker) {
      throw new Error("Expected the first speaker fixture.");
    }
    const panelEntry: PublishedAgendaEntry = {
      ...entry,
      speakerNames: ["  MORGAN   LEE  ", "Morgan Lee", "Guest Expert"],
    };

    expect(publishedEntryPresenters(panelEntry, [firstSpeaker])).toEqual([
      {
        key: "speaker:speaker_morgan",
        displayName: "Morgan Lee",
        speaker: firstSpeaker,
      },
      {
        key: "published-name:entry_evening:1",
        displayName: "Morgan Lee",
        speaker: null,
      },
      {
        key: "published-name:entry_evening:2",
        displayName: "Guest Expert",
        speaker: null,
      },
    ]);
  });

  it("shows the end day for a published range that crosses midnight", () => {
    expect(
      formatPublishedDateTimeRange("2026-09-18T23:30:00.000Z", "2026-09-19T00:30:00.000Z", "UTC"),
    ).toBe("Friday, September 18, 2026: 11:30 PM – Saturday, September 19, 2026: 12:30 AM");
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

  it("allows same-origin /api/public/... relative published headshot URLs", () => {
    expect(publicPhotoUrl("/api/public/events/open-systems/speakers/speaker_morgan/headshot")).toBe(
      "/api/public/events/open-systems/speakers/speaker_morgan/headshot",
    );
  });

  it("rejects same-origin URLs with query strings, credentials, fragments, or private paths", () => {
    expect(publicPhotoUrl("/api/private/events/open-systems/raw-uploads/headshot")).toBeNull();
    expect(publicPhotoUrl("/api/public/events/open-systems/headshot?token=secret")).toBeNull();
    expect(publicPhotoUrl("/api/public/events/open-systems/headshot#main")).toBeNull();
    expect(publicPhotoUrl("//attacker.test/api/public/events/open-systems/headshot")).toBeNull();
    expect(
      publicPhotoUrl("https://sessionboard.test/api/public/events/open-systems/headshot"),
    ).toBeNull();
  });
});

describe("embed query parser", () => {
  it("returns defaults when no query is provided", () => {
    expect(parseEmbedQuery({})).toEqual({
      theme: "auto",
      layout: null,
      displayFields: null,
      tracks: [],
      accent: null,
      backgroundColor: null,
      textColor: null,
    });
  });

  it("parses theme, layout, color tokens, and stable track IDs from a Next.js-style query", () => {
    expect(
      parseEmbedQuery({
        theme: "dark",
        layout: "timeline",
        accent: "#4f46e5",
        backgroundColor: "#ffffff",
        textColor: "#20232b",
        trackIds: ["track_main", "track_build"],
      }),
    ).toEqual({
      theme: "dark",
      layout: "timeline",
      displayFields: null,
      tracks: ["track_main", "track_build"],
      accent: "#4f46e5",
      backgroundColor: "#ffffff",
      textColor: "#20232b",
    });
  });

  it("parses stable track IDs through URLSearchParams", () => {
    const params = new URLSearchParams();
    params.set("theme", "light");
    params.set("layout", "grid");
    params.set("accent", "#4f5ee8");
    params.set("trackIds", "track_main,track_build");
    expect(parseEmbedQuery(params)).toEqual({
      theme: "light",
      layout: "grid",
      displayFields: null,
      tracks: ["track_main", "track_build"],
      accent: "#4f5ee8",
      backgroundColor: null,
      textColor: null,
    });
  });

  it("uses allowlists for theme, layout, color, and display fields", () => {
    expect(parseEmbedQuery({ theme: "nope-such-theme" }).theme).toBe("auto");
    expect(parseEmbedQuery({ layout: "nope" }).layout).toBeNull();
    expect(
      parseEmbedQuery({
        accent: "red",
        backgroundColor: "#abc",
        textColor: "#000000000000",
      }).accent,
    ).toBeNull();
    expect(parseEmbedQuery({ accent: "#4F46E5" }).accent).toBe("#4f46e5");
    expect(
      parseEmbedQuery({ displayFields: "title,date-time,company,unknown-field" }).displayFields,
    ).toEqual(["title", "date-time", "company"]);
  });

  it("keeps required display fields even when omitted from the query", () => {
    expect(parseEmbedQuery({ displayFields: "company" }).displayFields).toEqual([
      "company",
      "title",
      "date-time",
    ]);
  });

  it("defaults display fields to null (show all) when the query omits them", () => {
    expect(parseEmbedQuery({ theme: "dark" }).displayFields).toBeNull();
    expect(parseEmbedQuery({ theme: "dark", displayFields: "" }).displayFields).toEqual([
      "title",
      "date-time",
    ]);
  });

  it("trims, dedupes, and rejects empty stable track ID tokens", () => {
    expect(parseEmbedQuery({ trackIds: "track_build,, ,track_build" }).tracks).toEqual([
      "track_build",
    ]);
    expect(parseEmbedQuery({ trackIds: ["track_build"] }).tracks).toEqual(["track_build"]);
    expect(parseEmbedQuery({ tracks: "legacy-name" }).tracks).toEqual([]);
  });

  it("drops unsupported internal workflow status filters", () => {
    expect(parseEmbedQuery({ statuses: "Approved,Pending" }).tracks).toEqual([]);
    const serialized = serializeEmbedQuery(parseEmbedQuery({ statuses: ["Approved"] }));
    expect(serialized).toBe("");
    expect(serialized).not.toContain("statuses");
  });

  it("does not preserve private, legacy, or unsupported keys when serializing", () => {
    const parsed = parseEmbedQuery({
      theme: "dark",
      layout: "timeline",
      trackIds: ["track_main"],
      tracks: ["legacy-name"],
      statuses: ["Approved"],
      customCss: "body { color: red; }",
      navigation: "top",
      view: "agenda",
    });
    const serialized = serializeEmbedQuery(parsed);
    expect(serialized).toContain("theme=dark");
    expect(serialized).toContain("layout=timeline");
    expect(serialized).toContain("trackIds=track_main");
    expect(serialized).not.toContain("tracks=");
    expect(serialized).not.toContain("statuses");
    expect(serialized).not.toContain("customCss");
    expect(serialized).not.toContain("navigation");
    expect(serialized).not.toContain("view=");
  });

  it("omits the auto theme and null defaults when serializing", () => {
    expect(serializeEmbedQuery(parseEmbedQuery({}))).toBe("");
    expect(serializeEmbedQuery(parseEmbedQuery({ theme: "auto" }))).toBe("");
    expect(serializeEmbedQuery(parseEmbedQuery({ theme: "light" }))).toBe("?theme=light");
  });

  it("serializes display fields when explicitly provided", () => {
    const parsed = parseEmbedQuery({ displayFields: "title,date-time,room" });
    expect(serializeEmbedQuery(parsed)).toContain("displayFields=title%2Cdate-time%2Croom");
  });
});

describe("XML escape for embed attributes", () => {
  it("escapes ampersands, brackets, and quotes in attribute values", () => {
    expect(escapeXmlValue("a&b")).toBe("a&amp;b");
    expect(escapeXmlValue('"a"')).toBe("&quot;a&quot;");
    expect(escapeXmlValue("<a>")).toBe("&lt;a&gt;");
  });

  it("escapes a full query-string URL so it stays well-formed in an attribute", () => {
    const escaped = escapeXmlValue(
      "https://sessionboard.example/embed/summit/agenda?theme=dark&layout=timeline&trackIds=track_main",
    );
    expect(escaped).toContain("theme=dark&amp;layout=timeline&amp;trackIds=");
    expect(escaped).not.toContain("&layout");
  });
});
