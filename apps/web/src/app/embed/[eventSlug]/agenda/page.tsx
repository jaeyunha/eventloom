import type { Metadata } from "next";
import { getPublishedProgram } from "@/features/embed/api";
import { EmbedFrame, EmbedUnavailable } from "@/features/embed/embed-frame";
import { parseEmbedQuery } from "@/features/embed/model";
import { PublicAgendaView } from "@/features/embed/public-agenda";

export const metadata: Metadata = {
  title: "Published agenda",
  description: "Browse the event agenda and build an itinerary.",
  robots: { index: true, follow: true },
};

interface PublicAgendaPageProps {
  params: Promise<{ eventSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PublicAgendaPage({ params, searchParams }: PublicAgendaPageProps) {
  const [{ eventSlug }, query] = await Promise.all([params, searchParams]);
  const apiBaseUrl = process.env.API_UPSTREAM_ORIGIN?.trim();
  if (!apiBaseUrl) {
    return <EmbedUnavailable message="The public program endpoint is not configured." />;
  }

  const embedQuery = parseEmbedQuery(query);
  try {
    const program = await getPublishedProgram(apiBaseUrl, eventSlug, fetch, process.env.APP_ENV);
    return (
      <EmbedFrame
        event={program.agenda.event}
        eventSlug={eventSlug}
        theme={embedQuery.theme}
        view="agenda"
        layout={embedQuery.layout}
        accent={embedQuery.accent}
        backgroundColor={embedQuery.backgroundColor}
        textColor={embedQuery.textColor}
        tracks={embedQuery.tracks}
        displayFields={embedQuery.displayFields}
      >
        <PublicAgendaView
          program={program}
          tracks={embedQuery.tracks}
          layout={embedQuery.layout}
          displayFields={embedQuery.displayFields}
        />
      </EmbedFrame>
    );
  } catch {
    return (
      <EmbedUnavailable message="This event has not published an agenda yet. Check back after the organizer publishes the program." />
    );
  }
}
