import type { Metadata } from "next";
import { publishedProgramFromProjections } from "@/features/embed/api";
import {
  getPublishedAgendaOrLocalDemo,
  getPublishedSpeakersOrLocalDemo,
} from "@/features/embed/demo/projections";
import { EmbedFrame, EmbedUnavailable } from "@/features/embed/embed-frame";
import { embedTheme } from "@/features/embed/model";
import { SpeakerGallery } from "@/features/embed/speaker-gallery";

export const metadata: Metadata = {
  title: "Published speakers",
  description: "Meet the speakers in the published event program.",
  robots: { index: true, follow: true },
};

interface SpeakerGalleryPageProps {
  params: Promise<{ eventSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SpeakerGalleryPage({
  params,
  searchParams,
}: SpeakerGalleryPageProps) {
  const [{ eventSlug }, query] = await Promise.all([params, searchParams]);
  const apiBaseUrl =
    process.env.API_UPSTREAM_ORIGIN?.trim() ?? process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!apiBaseUrl) {
    return <EmbedUnavailable message="The public program endpoint is not configured." />;
  }

  const theme = embedTheme(query.theme);
  try {
    const [gallery, agenda] = await Promise.all([
      getPublishedSpeakersOrLocalDemo(apiBaseUrl, eventSlug, process.env.APP_ENV),
      getPublishedAgendaOrLocalDemo(apiBaseUrl, eventSlug, process.env.APP_ENV),
    ]);
    const program = publishedProgramFromProjections(agenda, gallery);
    return (
      <EmbedFrame event={program.agenda.event} eventSlug={eventSlug} theme={theme} view="speakers">
        <SpeakerGallery gallery={program.speakers} agenda={{ entries: program.agenda.entries }} />
      </EmbedFrame>
    );
  } catch {
    return (
      <EmbedUnavailable message="This event has not published its speaker gallery yet. Check back after the organizer publishes the program." />
    );
  }
}
