import type { Metadata } from "next";
import { publishedProgramFromProjections } from "@/features/embed/api";
import {
  getPublishedAgendaOrLocalDemo,
  getPublishedSpeakersOrLocalDemo,
} from "@/features/embed/demo/projections";
import { EmbedFrame, EmbedUnavailable } from "@/features/embed/embed-frame";
import { embedTheme } from "@/features/embed/model";
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
  const apiBaseUrl =
    process.env.API_UPSTREAM_ORIGIN?.trim() ?? process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!apiBaseUrl) {
    return <EmbedUnavailable message="The public program endpoint is not configured." />;
  }

  const theme = embedTheme(query.theme);
  try {
    const [agenda, speakers] = await Promise.all([
      getPublishedAgendaOrLocalDemo(apiBaseUrl, eventSlug, process.env.APP_ENV),
      getPublishedSpeakersOrLocalDemo(apiBaseUrl, eventSlug, process.env.APP_ENV),
    ]);
    const program = publishedProgramFromProjections(agenda, speakers);
    return (
      <EmbedFrame event={program.agenda.event} eventSlug={eventSlug} theme={theme} view="agenda">
        <PublicAgendaView program={program} />
      </EmbedFrame>
    );
  } catch {
    return (
      <EmbedUnavailable message="This event has not published an agenda yet. Check back after the organizer publishes the program." />
    );
  }
}
