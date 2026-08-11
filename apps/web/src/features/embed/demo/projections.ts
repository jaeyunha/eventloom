import { getPublishedAgenda, getPublishedSpeakers, PublicEmbedApiError } from "../api";
import type { PublishedAgenda, PublishedEvent, PublishedSpeakerGallery } from "../types";

type PublicFetcher = NonNullable<Parameters<typeof getPublishedAgenda>[2]>;

const DEMO_REVISION = {
  id: "revision_demo_3",
  number: 3,
  publishedAt: "2026-08-08T12:00:00.000Z",
} as const;

function demoEvent(eventSlug: string): PublishedEvent {
  return {
    slug: eventSlug,
    name: "Open Systems Summit",
    timeZone: "America/Los_Angeles",
    startsOn: "2026-09-18",
    endsOn: "2026-09-19",
    venueName: "Pier 27",
  };
}

export function createLocalDemoAgenda(eventSlug: string): PublishedAgenda {
  return {
    event: demoEvent(eventSlug),
    revision: DEMO_REVISION,
    entries: [
      {
        id: "entry_keynote",
        sessionId: "session_keynote",
        title: "Systems that stay understandable",
        summary: "Build program operations that teams can reason about as they grow.",
        format: "Keynote",
        speakerNames: ["Morgan Lee"],
        roomName: "Main hall",
        trackNames: ["Main stage"],
        startsAt: "2026-09-18T16:00:00.000Z",
        endsAt: "2026-09-18T16:45:00.000Z",
      },
      {
        id: "entry_workshop",
        sessionId: "session_workshop",
        title: "Designing conflict-safe schedules",
        summary: "Practice the constraints and review habits behind a resilient event agenda.",
        format: "Workshop",
        speakerNames: ["Avery Kim"],
        roomName: "Workshop studio",
        trackNames: ["Program craft"],
        startsAt: "2026-09-18T18:00:00.000Z",
        endsAt: "2026-09-18T19:15:00.000Z",
      },
      {
        id: "entry_panel",
        sessionId: "session_panel",
        title: "Human decisions, dependable delivery",
        summary:
          "Program leaders share how they keep review, communication, and publication accountable.",
        format: "Panel",
        speakerNames: ["Morgan Lee", "Sam Rivera"],
        roomName: "Main hall",
        trackNames: ["Main stage", "Operations"],
        startsAt: "2026-09-18T20:00:00.000Z",
        endsAt: "2026-09-18T20:50:00.000Z",
      },
      {
        id: "entry_clinic",
        sessionId: "session_clinic",
        title: "Accessible speaker operations clinic",
        summary: "Turn common portal and publishing friction into clear, inclusive workflows.",
        format: "Clinic",
        speakerNames: ["Sam Rivera"],
        roomName: "Workshop studio",
        trackNames: ["Operations"],
        startsAt: "2026-09-19T17:00:00.000Z",
        endsAt: "2026-09-19T18:00:00.000Z",
      },
    ],
  };
}

export function createLocalDemoSpeakerGallery(eventSlug: string): PublishedSpeakerGallery {
  return {
    event: demoEvent(eventSlug),
    revision: DEMO_REVISION,
    speakers: [
      {
        id: "speaker_morgan",
        displayName: "Morgan Lee",
        pronouns: "they/them",
        jobTitle: "Staff Engineer",
        organization: "Open Works",
        biography: "Morgan builds understandable review, scheduling, and publication systems.",
        photoUrl: null,
        sessionIds: ["session_keynote", "session_panel"],
        sessionTitles: ["Systems that stay understandable", "Human decisions, dependable delivery"],
        trackNames: ["Main stage", "Operations"],
      },
      {
        id: "speaker_avery",
        displayName: "Avery Kim",
        pronouns: "she/her",
        jobTitle: "Program Director",
        organization: "Common Thread Events",
        biography:
          "Avery helps program teams turn complex scheduling constraints into calm attendee experiences.",
        photoUrl: null,
        sessionIds: ["session_workshop"],
        sessionTitles: ["Designing conflict-safe schedules"],
        trackNames: ["Program craft"],
      },
      {
        id: "speaker_sam",
        displayName: "Sam Rivera",
        pronouns: "he/him",
        jobTitle: "Accessibility Lead",
        organization: "Civic Stage",
        biography:
          "Sam works with speakers and organizers to make event participation clear and inclusive.",
        photoUrl: null,
        sessionIds: ["session_panel", "session_clinic"],
        sessionTitles: [
          "Human decisions, dependable delivery",
          "Accessible speaker operations clinic",
        ],
        trackNames: ["Main stage", "Operations"],
      },
    ],
  };
}

export function isLocalEmbedDemoEnvironment(appEnv: string | undefined): boolean {
  return appEnv === "local";
}

export function shouldUseLocalEmbedDemoForError(
  appEnv: string | undefined,
  error: unknown,
): boolean {
  return (
    isLocalEmbedDemoEnvironment(appEnv) &&
    error instanceof PublicEmbedApiError &&
    (error.status === 404 || error.status === 503)
  );
}

export async function getPublishedAgendaOrLocalDemo(
  baseUrl: string,
  eventSlug: string,
  appEnv: string | undefined,
  fetcher: PublicFetcher = fetch,
): Promise<PublishedAgenda> {
  try {
    return await getPublishedAgenda(baseUrl, eventSlug, fetcher, appEnv);
  } catch (error) {
    if (shouldUseLocalEmbedDemoForError(appEnv, error)) {
      return createLocalDemoAgenda(eventSlug);
    }
    throw error;
  }
}

export async function getPublishedSpeakersOrLocalDemo(
  baseUrl: string,
  eventSlug: string,
  appEnv: string | undefined,
  fetcher: PublicFetcher = fetch,
): Promise<PublishedSpeakerGallery> {
  try {
    return await getPublishedSpeakers(baseUrl, eventSlug, fetcher, appEnv);
  } catch (error) {
    if (shouldUseLocalEmbedDemoForError(appEnv, error)) {
      return createLocalDemoSpeakerGallery(eventSlug);
    }
    throw error;
  }
}
