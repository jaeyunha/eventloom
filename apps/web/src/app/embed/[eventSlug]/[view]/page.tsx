import type { Metadata } from "next";
import { getPublishedProgram, publishedProgramFromProjections } from "@/features/embed/api";
import {
  getPublishedAgendaOrLocalDemo,
  getPublishedSpeakersOrLocalDemo,
} from "@/features/embed/demo/projections";
import { EmbedFrame, EmbedUnavailable } from "@/features/embed/embed-frame";
import { embedTheme } from "@/features/embed/model";
import { PublicItineraryView } from "@/features/embed/public-itinerary";
import { PublicSessionsView } from "@/features/embed/public-sessions";
import { PublicSpeakersListView } from "@/features/embed/public-speakers-list";
import type { PublishedProgram } from "@/features/embed/types";

export const metadata: Metadata = {
  title: "Published event program",
  description: "Browse published sessions and build a personal event itinerary.",
  robots: { index: true, follow: true },
};

interface PublicWidgetPageProps {
  params: Promise<{ eventSlug: string; view: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function loadProgram(
  apiBaseUrl: string,
  eventSlug: string,
  appEnv: string | undefined,
): Promise<PublishedProgram> {
  try {
    return await getPublishedProgram(apiBaseUrl, eventSlug);
  } catch {
    const [agenda, speakers] = await Promise.all([
      getPublishedAgendaOrLocalDemo(apiBaseUrl, eventSlug, appEnv),
      getPublishedSpeakersOrLocalDemo(apiBaseUrl, eventSlug, appEnv),
    ]);
    return publishedProgramFromProjections(agenda, speakers);
  }
}

export default async function PublicWidgetPage({ params, searchParams }: PublicWidgetPageProps) {
  const [{ eventSlug, view }, query] = await Promise.all([params, searchParams]);
  if (view !== "sessions" && view !== "speakers-list" && view !== "itinerary") {
    return <EmbedUnavailable message="This published program view does not exist." />;
  }

  const apiBaseUrl = process.env.API_UPSTREAM_ORIGIN?.trim();
  if (!apiBaseUrl) {
    return <EmbedUnavailable message="The public program endpoint is not configured." />;
  }

  try {
    const program = await loadProgram(apiBaseUrl, eventSlug, process.env.APP_ENV);
    const theme = embedTheme(query.theme);
    return (
      <EmbedFrame event={program.agenda.event} eventSlug={eventSlug} theme={theme} view={view}>
        {view === "sessions" ? (
          <PublicSessionsView program={program} />
        ) : view === "speakers-list" ? (
          <PublicSpeakersListView program={program} />
        ) : (
          <PublicItineraryView program={program} />
        )}
      </EmbedFrame>
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "public_program_load_failed",
        eventSlug,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : "Unknown public program error",
      }),
    );
    return (
      <EmbedUnavailable message="This event has not published a program yet. Check back after the organizer publishes the agenda and speaker profiles." />
    );
  }
}
