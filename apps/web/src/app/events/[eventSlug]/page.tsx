import type { Metadata } from "next";
import { getPublishedProgramOrLocalDemo } from "@/features/embed/demo/projections";
import { EmbedFrame, EmbedUnavailable } from "@/features/embed/embed-frame";
import { parseEmbedQuery } from "@/features/embed/model";
import { PublicSessionsView } from "@/features/embed/public-sessions";

export const metadata: Metadata = {
  title: "Published event program",
  description: "Browse published sessions and build a personal event itinerary.",
  robots: { index: true, follow: true },
};

interface PublicEventPageProps {
  params: Promise<{ eventSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PublicEventPage({ params, searchParams }: PublicEventPageProps) {
  const [{ eventSlug }, query] = await Promise.all([params, searchParams]);
  const apiBaseUrl = process.env.API_UPSTREAM_ORIGIN?.trim();
  if (!apiBaseUrl) {
    return <EmbedUnavailable message="The public program endpoint is not configured." />;
  }

  try {
    const program = await getPublishedProgramOrLocalDemo(
      apiBaseUrl,
      eventSlug,
      process.env.APP_ENV,
    );
    const embedQuery = parseEmbedQuery(query);
    return (
      <EmbedFrame
        event={program.agenda.event}
        eventSlug={eventSlug}
        theme={embedQuery.theme}
        view="sessions"
        layout={embedQuery.layout}
        accent={embedQuery.accent}
        backgroundColor={embedQuery.backgroundColor}
        textColor={embedQuery.textColor}
        tracks={embedQuery.tracks}
        displayFields={embedQuery.displayFields}
      >
        <PublicSessionsView
          program={program}
          layout={embedQuery.layout}
          tracks={embedQuery.tracks}
          displayFields={embedQuery.displayFields}
        />
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
