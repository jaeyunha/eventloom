import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmbedFrame } from "./embed-frame";
import {
  filterSpeakers,
  formatPublishedDateTimeRange,
  publishedSpeakerSessions,
  sortSpeakersBySurname,
} from "./model";
import { PublicAgendaSessionDetail, PublicAgendaView } from "./public-agenda";
import { PublicItineraryView } from "./public-itinerary";
import { PublicSessionsView } from "./public-sessions";
import { PublicSpeakersListView } from "./public-speakers-list";
import { SpeakerGallery, SpeakerProfileDetail } from "./speaker-gallery";
import type {
  PublishedAgenda,
  PublishedProgram,
  PublishedSpeaker,
  PublishedSpeakerGallery,
} from "./types";
const sessionsRouteSource = readFileSync(
  new URL("../../app/events/[eventSlug]/page.tsx", import.meta.url),
  "utf8",
);
const agendaRouteSource = readFileSync(
  new URL("../../app/events/[eventSlug]/agenda/page.tsx", import.meta.url),
  "utf8",
);

const event = {
  slug: "open-systems",
  name: "Open Systems Summit",
  timeZone: "America/Los_Angeles",
  startsOn: "2026-09-18",
  endsOn: "2026-09-19",
  venueName: "Pier 27",
} as const;

const agenda: PublishedAgenda = {
  event,
  revision: {
    id: "revision_3",
    number: 3,
    publishedAt: "2026-08-08T12:00:00.000Z",
  },
  entries: [
    {
      id: "entry_keynote",
      sessionId: "session_keynote",
      title: "Systems that stay understandable",
      summary: "Build operations that teams can reason about.",
      format: "Keynote",
      speakerNames: ["Morgan Lee"],
      roomName: "Main hall",
      trackNames: ["Main stage"],
      startsAt: "2026-09-18T16:00:00.000Z",
      endsAt: "2026-09-18T16:45:00.000Z",
    },
  ],
};

const gallery: PublishedSpeakerGallery = {
  event,
  revision: agenda.revision,
  speakers: [
    {
      id: "speaker_morgan",
      displayName: "Morgan Lee",
      pronouns: "they/them",
      jobTitle: "Staff Engineer",
      organization: "Open Works",
      biography: "Morgan builds understandable review and scheduling systems.",
      photoUrl: null,
      sessionIds: ["session_keynote"],
      sessionTitles: ["Systems that stay understandable"],
      trackNames: ["Main stage"],
    },
  ],
};

const priyaSpeaker: PublishedSpeaker = {
  id: "speaker_priya",
  displayName: "Priya Shah",
  pronouns: "she/her",
  jobTitle: "Principal Engineer",
  organization: "Open Works",
  biography: "Priya builds reliable event systems.",
  photoUrl: null,
  sessionIds: ["session_priya"],
  sessionTitles: ["Reliable systems for event teams"],
  trackNames: ["Main stage"],
};

const priyaAgendaEntries: PublishedAgenda["entries"] = [
  {
    id: "entry_priya",
    sessionId: "session_priya",
    title: "Reliable systems for event teams",
    summary: "A published session.",
    format: "Talk",
    speakerNames: ["A different speaker"],
    roomName: "Room 201",
    trackNames: ["Main stage"],
    startsAt: "2026-09-18T18:00:00.000Z",
    endsAt: "2026-09-18T19:00:00.000Z",
  },
  {
    id: "entry_priya_name_fallback",
    sessionId: "session_not_priya",
    title: "Reliable systems for event teams, panel",
    summary: "A second published session.",
    format: "Panel",
    speakerNames: ["  PRIYA   SHAH "],
    roomName: "Room 202",
    trackNames: ["Main stage"],
    startsAt: "2026-09-18T20:00:00.000Z",
    endsAt: "2026-09-18T21:00:00.000Z",
  },
];

type SpeakerSessionDetail = {
  readonly id: string;
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly roomName: string;
  readonly email?: string;
};

type SpeakerWithSessionDetails = PublishedSpeaker & {
  readonly sessions?: readonly SpeakerSessionDetail[];
};

type GalleryWithSessionDetails = Omit<PublishedSpeakerGallery, "speakers"> & {
  readonly speakers: readonly SpeakerWithSessionDetails[];
};

const galleryWithDetails: GalleryWithSessionDetails = {
  ...gallery,
  speakers: [
    {
      id: "speaker_zoe",
      displayName: "Zoe Adams",
      pronouns: null,
      jobTitle: "Principal Scientist",
      organization: "Open Works",
      biography: "Zoe publishes reliable systems for scientific teams.",
      photoUrl: null,
      sessionIds: ["session_zoe"],
      sessionTitles: ["Reliable systems for scientific teams"],
      trackNames: ["Main stage"],
      sessions: [
        {
          id: "session_zoe",
          title: "Reliable systems for scientific teams",
          startsAt: "2026-09-18T18:00:00.000Z",
          endsAt: "2026-09-18T19:00:00.000Z",
          roomName: "Room 306",
          email: "private@example.test",
        },
      ],
    },
    {
      id: "speaker_anna",
      displayName: "Anna Brown",
      pronouns: null,
      jobTitle: null,
      organization: null,
      biography: "Anna helps teams make useful programs.",
      photoUrl: null,
      sessionIds: ["session_anna"],
      sessionTitles: ["Programs people can use"],
      trackNames: ["Operations"],
      sessions: [
        {
          id: "session_anna",
          title: "Programs people can use",
          startsAt: "2026-09-19T17:00:00.000Z",
          endsAt: "2026-09-19T18:15:00.000Z",
          roomName: "Room 307",
        },
      ],
    },
    ...gallery.speakers,
  ],
};

const multiDayAgenda: PublishedAgenda = {
  ...agenda,
  entries: [
    ...agenda.entries,
    {
      id: "entry_second_day",
      sessionId: "session_zoe",
      title: "Reliable systems in practice",
      summary: "A second-day session for testing day navigation.",
      format: "Workshop",
      speakerNames: ["Zoe Adams"],
      roomName: "Room 306",
      trackNames: ["Operations"],
      startsAt: "2026-09-19T17:00:00.000Z",
      endsAt: "2026-09-19T18:15:00.000Z",
    },
  ],
};
const listProgram: PublishedProgram = {
  agenda: multiDayAgenda,
  speakers: {
    ...galleryWithDetails,
    speakers: [...galleryWithDetails.speakers].reverse(),
  },
};
const emptyFinalDayAgenda: PublishedAgenda = {
  ...multiDayAgenda,
  event: {
    ...event,
    startsOn: "2026-05-12",
    endsOn: "2026-05-14",
  },
  entries: multiDayAgenda.entries.map((entry, index) => ({
    ...entry,
    startsAt: index === 0 ? "2026-05-12T16:00:00.000Z" : "2026-05-13T17:00:00.000Z",
    endsAt: index === 0 ? "2026-05-12T16:45:00.000Z" : "2026-05-13T18:15:00.000Z",
  })),
};

describe("public embeds", () => {
  it("keeps anonymous event entry routes dynamic and projection-backed", () => {
    for (const [source, view, component] of [
      [sessionsRouteSource, "sessions", "PublicSessionsView"],
      [agendaRouteSource, "agenda", "PublicAgendaView"],
    ] as const) {
      expect(source).toContain("params: Promise<{ eventSlug: string }>");
      expect(source).toContain(
        "searchParams: Promise<Record<string, string | string[] | undefined>>",
      );
      expect(source).toContain("getPublishedProgramOrLocalDemo");
      expect(source).toContain("parseEmbedQuery(query)");
      expect(source).toContain(`view="${view}"`);
      expect(source).toContain(`<${component}`);
      expect(source).toContain("EmbedUnavailable");
      expect(source).not.toContain("devflow-conf-2027");
      expect(source).not.toContain("/admin/");
      expect(source).not.toContain("redirect(");
    }
  });
  it("renders accessible agenda navigation, filters, times, and feeds", () => {
    const markup = renderToStaticMarkup(
      createElement(
        EmbedFrame,
        {
          event,
          eventSlug: event.slug,
          theme: "light",
          view: "agenda",
        },
        createElement(PublicAgendaView, {
          program: { agenda, speakers: gallery },
        }),
      ),
    );

    expect(markup).toContain('href="#embed-content"');
    expect(markup).toContain('aria-label="Published event views"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain("Show in my local time");
    expect(markup).toContain('dateTime="2026-09-18T16:00:00.000Z"');
    expect(markup).toContain("agenda.json");
    expect(markup).toContain("agenda.ics");
    expect(markup).toContain('href="/api/public/events/open-systems/agenda.json"');
    expect(markup).toContain('href="/api/public/events/open-systems/agenda.ics"');
  });
  it("does not enrich an agenda with speakers from another revision", () => {
    const staleGallery: PublishedSpeakerGallery = {
      ...gallery,
      revision: { ...gallery.revision, id: "revision_2", number: 2 },
    };
    const markup = renderToStaticMarkup(
      createElement(PublicAgendaView, {
        program: { agenda, speakers: staleGallery },
      }),
    );

    expect(markup).toContain("Morgan Lee");
    expect(markup).not.toContain("Staff Engineer");
    expect(markup).not.toContain("Open Works");
  });
  it("hides feed links that the published projection marks unavailable", () => {
    const unavailableAgenda = {
      ...agenda,
      feeds: { json: false, ics: false },
    } as PublishedAgenda & { readonly feeds: { json: boolean; ics: boolean } };
    const markup = renderToStaticMarkup(
      createElement(PublicAgendaView, {
        program: { agenda: unavailableAgenda, speakers: gallery },
      }),
    );

    expect(markup).not.toContain("/agenda.json");
    expect(markup).not.toContain("/agenda.ics");
  });

  it("exposes canonical browse routes and marks the active view", () => {
    const markup = renderToStaticMarkup(
      createElement(EmbedFrame, {
        event,
        eventSlug: event.slug,
        theme: "auto",
        view: "itinerary",
      }),
    );
    const navigationStart = markup.indexOf('<nav aria-label="Published event views">');
    const navigationEnd = markup.indexOf("</nav>", navigationStart);
    const navigation = markup.slice(navigationStart, navigationEnd);

    expect(navigation.match(/<a\b/gu) ?? []).toHaveLength(5);
    expect(navigation).toContain('href="/embed/open-systems/sessions"');
    expect(navigation).toContain('href="/embed/open-systems/itinerary"');
    expect(navigation).toContain('href="/embed/open-systems/agenda"');
    expect(navigation).toContain('href="/embed/open-systems/speakers-list"');
    expect(navigation).toContain('href="/embed/open-systems/speakers"');
    expect(navigation).toContain("Speakers List");
    expect(navigation).toContain("Speaker Gallery");
    expect(navigation.match(/aria-current="page"/gu) ?? []).toHaveLength(1);
    expect(navigation).toMatch(
      /<a[^>]*aria-current="page"[^>]*href="\/embed\/open-systems\/itinerary"/u,
    );
    expect(navigation).not.toContain("?view=");
    expect(navigation).not.toContain("?navigation=");
  });

  it("renders speaker information with text alternatives to photos and color", () => {
    const markup = renderToStaticMarkup(
      createElement(SpeakerGallery, { gallery, agenda: { entries: agenda.entries } }),
    );

    expect(markup).toContain("<search>");
    expect(markup).toContain("Search speakers or sessions");
    expect(markup).toContain("Morgan Lee");
    expect(markup).toContain("ML");
    expect(markup).toContain("Systems that stay understandable");
    expect(markup).toContain('aria-live="polite"');
  });
  it("renders the distinct speakers list with name search, session details, and fallbacks", () => {
    const markup = renderToStaticMarkup(
      createElement(
        EmbedFrame,
        {
          event,
          eventSlug: event.slug,
          theme: "light",
          view: "speakers-list",
        },
        createElement(PublicSpeakersListView, { program: listProgram }),
      ),
    );

    expect(markup).toContain("Speakers 1 - 3 of 3");
    expect(markup).toContain("Search speakers by name");
    expect(markup).toContain('placeholder="Search speakers and sessions"');
    expect(markup).toContain("Roles: speaker");
    expect(markup).toContain("Friday, September 18, 2026");
    expect(markup).toContain("Room: Main hall");
    expect(markup).toContain("<strong>Company:</strong> Open Works");
    expect(markup).toContain("Title not published");
    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="Morgan Lee headshot"');
    expect(markup).toContain('id="speaker-list-trigger-speaker_morgan"');
    expect(markup).not.toContain("private@example.test");
    expect(markup).toContain('href="/embed/open-systems/speakers-list?theme=light"');
    expect(markup).toContain('href="/embed/open-systems/speakers?theme=light"');
    const firstAdams = markup.indexOf("Zoe Adams");
    const firstBrown = markup.indexOf("Anna Brown");
    const firstLee = markup.indexOf("Morgan Lee");
    expect(firstAdams).toBeGreaterThanOrEqual(0);
    expect(firstBrown).toBeGreaterThan(firstAdams);
    expect(firstLee).toBeGreaterThan(firstBrown);
  });
  it("connects long biographies to an accessible expansion control", () => {
    const firstSpeaker = gallery.speakers[0];
    if (!firstSpeaker) {
      throw new Error("Expected the first published speaker fixture.");
    }
    const longBiography = "Published biography details. ".repeat(20);
    const longBiographyProgram: PublishedProgram = {
      agenda,
      speakers: {
        ...gallery,
        speakers: [{ ...firstSpeaker, biography: longBiography }],
      },
    };

    const markup = renderToStaticMarkup(
      createElement(PublicSpeakersListView, { program: longBiographyProgram }),
    );

    expect(markup).toContain('id="speaker-list-biography-speaker_morgan"');
    expect(markup).toContain('aria-controls="speaker-list-biography-speaker_morgan"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("Show more");
  });
  it("renders distinct canonical speakers that share a display name", () => {
    const firstSpeaker = gallery.speakers[0];
    if (!firstSpeaker) {
      throw new Error("Expected the first published speaker fixture.");
    }
    const duplicateNameProgram: PublishedProgram = {
      agenda,
      speakers: {
        ...gallery,
        speakers: [
          firstSpeaker,
          {
            ...firstSpeaker,
            id: "speaker_morgan_2",
            jobTitle: "Principal Engineer",
          },
        ],
      },
    };

    const markup = renderToStaticMarkup(
      createElement(PublicSessionsView, { program: duplicateNameProgram }),
    );

    expect(markup).toContain("Staff Engineer");
    expect(markup).toContain("Principal Engineer");
    expect(markup.match(/Morgan Lee/gu)).toHaveLength(2);
  });
  it("sorts speakers by surname, narrows search, and keeps detail controls keyboard accessible", () => {
    const orderedNames = sortSpeakersBySurname(galleryWithDetails.speakers).map(
      (speaker) => speaker.displayName,
    );
    expect(orderedNames).toEqual(["Zoe Adams", "Anna Brown", "Morgan Lee"]);
    expect(filterSpeakers(galleryWithDetails.speakers, "Brown", "")).toHaveLength(1);

    const markup = renderToStaticMarkup(
      createElement(SpeakerGallery, { gallery: galleryWithDetails }),
    );
    expect(
      markup.match(/<button\b[^>]*type="button"[^>]*aria-haspopup="dialog"/gu) ?? [],
    ).toHaveLength(3);
    expect(markup).not.toContain('role="button"');
    expect(markup).not.toContain('tabindex="0"');
    expect(markup).not.toContain("private@example.test");

    const speaker = galleryWithDetails.speakers[0];
    if (!speaker) {
      throw new Error("Expected a speaker with session details");
    }
    expect(
      publishedSpeakerSessions(speaker, [
        {
          id: "entry_zoe",
          sessionId: "session_zoe",
          title: "Reliable systems for scientific teams",
          summary: "A published session.",
          format: "Talk",
          speakerNames: ["A different speaker"],
          roomName: "Room 306",
          trackNames: ["Main stage"],
          startsAt: "2026-09-18T18:00:00.000Z",
          endsAt: "2026-09-18T19:00:00.000Z",
        },
      ]),
    ).toMatchObject([
      {
        id: "session_zoe",
        title: "Reliable systems for scientific teams",
        startsAt: "2026-09-18T18:00:00.000Z",
        endsAt: "2026-09-18T19:00:00.000Z",
        roomName: "Room 306",
        trackNames: ["Main stage"],
      },
    ]);

    const detailMarkup = renderToStaticMarkup(
      createElement(SpeakerProfileDetail, {
        speaker,
        gallery: {
          ...galleryWithDetails,
          agenda: {
            entries: [
              {
                id: "entry_zoe",
                sessionId: "session_zoe",
                title: "Reliable systems for scientific teams",
                summary: "A published session.",
                format: "Talk",
                speakerNames: ["Zoe Adams"],
                roomName: "Room 306",
                trackNames: ["Main stage"],
                startsAt: "2026-09-18T18:00:00.000Z",
                endsAt: "2026-09-18T19:00:00.000Z",
              },
            ],
          },
        },
        onBack: () => undefined,
      }),
    );
    expect(detailMarkup).toContain("Back to speakers");
    expect(detailMarkup).toContain("Sessions (1)");
    expect(detailMarkup).toContain("Friday, September 18, 2026");
    expect(detailMarkup).toContain("Room: Room 306");
    expect(detailMarkup).not.toContain("private@example.test");
  });
  it("renders Priya sessions from the published agenda on first render", () => {
    const detailMarkup = renderToStaticMarkup(
      createElement(SpeakerProfileDetail, {
        speaker: priyaSpeaker,
        gallery: {
          ...gallery,
          speakers: [priyaSpeaker],
          agenda: { entries: priyaAgendaEntries },
        },
        onBack: () => undefined,
      }),
    );

    expect(detailMarkup).toContain("Priya Shah");
    expect(detailMarkup).toContain("Sessions (1)");
    expect(detailMarkup).toContain("Friday, September 18, 2026");
    expect(detailMarkup).toContain("11:00 AM");
    expect(detailMarkup).toContain("Room: Room 201");
    expect(detailMarkup).not.toContain("Room: Room 202");
    expect(detailMarkup).not.toContain("Date and time not published");
    expect(detailMarkup).not.toContain("Room not published");
  });

  it("does not fabricate session time or room when the companion agenda is absent", () => {
    const speaker = galleryWithDetails.speakers[0];
    if (!speaker) {
      throw new Error("Expected a published speaker");
    }
    const detailMarkup = renderToStaticMarkup(
      createElement(SpeakerProfileDetail, {
        speaker,
        gallery: galleryWithDetails,
        onBack: () => undefined,
      }),
    );

    expect(detailMarkup).toContain("Sessions (0)");
    expect(detailMarkup).not.toContain("Date and time not published");
    expect(detailMarkup).not.toContain("Room: Room 306");
    expect(detailMarkup).not.toContain("private@example.test");
  });

  it("opens agenda blocks with complete details and exposes a back control", () => {
    const markup = renderToStaticMarkup(
      createElement(PublicAgendaView, {
        program: { agenda: multiDayAgenda, speakers: gallery },
      }),
    );
    expect(
      markup.match(/<button\b[^>]*type="button"[^>]*aria-haspopup="dialog"/gu) ?? [],
    ).toHaveLength(2);
    expect(markup).not.toContain('role="button"');
    expect(markup).not.toContain('tabindex="0"');
    expect(markup).toContain("Reliable systems in practice");
    expect(markup).toContain("Show in my local time");

    const entry = multiDayAgenda.entries[0];
    if (!entry) {
      throw new Error("Expected a multi-day agenda entry");
    }
    expect(formatPublishedDateTimeRange(entry.startsAt, entry.endsAt, event.timeZone)).toContain(
      "Friday, September 18, 2026",
    );
    const detailMarkup = renderToStaticMarkup(
      createElement(PublicAgendaSessionDetail, {
        entry,
        displayTimeZone: event.timeZone,
        onBack: () => undefined,
      }),
    );
    expect(detailMarkup).toContain("Back to agenda");
    expect(detailMarkup).toContain("Format: Keynote");
    expect(detailMarkup).toContain("Track: Main stage");
    expect(detailMarkup).toContain("Main hall");
    expect(detailMarkup).toContain("Build operations that teams can reason about.");
    expect(detailMarkup).not.toContain("Subsessions (0)");
  });
  it("renders sessions and itinerary projection controls without private fields", () => {
    const longAgenda: PublishedAgenda = {
      ...multiDayAgenda,
      entries: multiDayAgenda.entries.map((entry, index) =>
        index === 0
          ? {
              ...entry,
              summary: "Published session guidance. ".repeat(20),
            }
          : entry,
      ),
    };
    const program = { agenda: longAgenda, speakers: gallery };
    const sessionsMarkup = renderToStaticMarkup(createElement(PublicSessionsView, { program }));

    expect(sessionsMarkup).toContain("Search sessions or speakers");
    expect(sessionsMarkup).toContain("Sessions 1 - 2 of 2");
    expect(sessionsMarkup).toContain("Show more");
    expect(sessionsMarkup).toContain("Format: Keynote");
    expect(sessionsMarkup).toContain("Track: Main stage");
    expect(sessionsMarkup).toContain("Staff Engineer");
    expect(sessionsMarkup).toContain("Open Works");
    expect(sessionsMarkup).not.toContain("private@example.test");

    const itineraryMarkup = renderToStaticMarkup(createElement(PublicItineraryView, { program }));
    expect(itineraryMarkup.match(/role="tab"/gu) ?? []).toHaveLength(2);
    expect(itineraryMarkup).toContain("Download calendar (.ics)");
    expect(itineraryMarkup).toContain("My schedule (0)");
    expect(itineraryMarkup).toContain("Add to my schedule");
    expect(itineraryMarkup).toContain("View Details");
    expect(itineraryMarkup).toContain("Main hall");
    expect(itineraryMarkup).toContain("Staff Engineer");
    const emptyFinalDayMarkup = renderToStaticMarkup(
      createElement(PublicItineraryView, {
        program: { agenda: emptyFinalDayAgenda, speakers: gallery },
      }),
    );
    expect(emptyFinalDayMarkup.match(/role="tab"/gu) ?? []).toHaveLength(3);
    expect(emptyFinalDayMarkup).toContain("Thursday, May 14");
  });
});

describe("published program shell", () => {
  it("renders a single document heading equal to the event name", () => {
    const markup = renderToStaticMarkup(
      createElement(EmbedFrame, {
        event,
        eventSlug: event.slug,
        theme: "light",
        view: "sessions",
      }),
    );

    expect(markup.match(/<h1\b/gu) ?? []).toHaveLength(1);
    expect(markup).toContain(`>${event.name}<`);
  });

  it("propagates the requested theme onto the root data-theme attribute", () => {
    for (const theme of ["auto", "light", "dark"] as const) {
      const markup = renderToStaticMarkup(
        createElement(EmbedFrame, {
          event,
          eventSlug: event.slug,
          theme,
          view: "sessions",
        }),
      );
      expect(markup).toContain(`data-theme="${theme}"`);
    }
  });

  it("exposes itinerary days as a tablist with exactly one selected tab", () => {
    const markup = renderToStaticMarkup(
      createElement(PublicItineraryView, {
        program: { agenda: multiDayAgenda, speakers: gallery },
      }),
    );

    expect(markup).toContain('role="tablist"');
    expect(markup.match(/role="tab"/gu) ?? []).toHaveLength(2);
    expect(markup.match(/aria-selected="true"/gu) ?? []).toHaveLength(1);
    expect(markup).toContain('aria-controls="itinerary-panel-2026-09-18"');
  });
});
