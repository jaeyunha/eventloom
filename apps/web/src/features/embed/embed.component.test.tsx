import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmbedFrame } from "./embed-frame";
import { PublicAgendaView } from "./public-agenda";
import { SpeakerGallery } from "./speaker-gallery";
import type { PublishedAgenda, PublishedSpeakerGallery } from "./types";

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

describe("public embeds", () => {
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
          agenda,
          apiBaseUrl: "https://api.example.com",
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
  });

  it("renders speaker information with text alternatives to photos and color", () => {
    const markup = renderToStaticMarkup(createElement(SpeakerGallery, { gallery }));

    expect(markup).toContain("<search>");
    expect(markup).toContain("Search speakers or sessions");
    expect(markup).toContain("Morgan Lee");
    expect(markup).toContain("ML");
    expect(markup).toContain("Systems that stay understandable");
    expect(markup).toContain('aria-live="polite"');
  });
});
