import type { Metadata } from "next";
import { getPublishedProgram } from "@/features/embed/api";
import { EmbedFrame, EmbedUnavailable } from "@/features/embed/embed-frame";
import { parseEmbedQuery } from "@/features/embed/model";
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
        view="speakers"
        layout={embedQuery.layout}
        accent={embedQuery.accent}
        backgroundColor={embedQuery.backgroundColor}
        textColor={embedQuery.textColor}
        tracks={embedQuery.tracks}
        displayFields={embedQuery.displayFields}
      >
        <SpeakerGallery
          gallery={program.speakers}
          agenda={{ entries: program.agenda.entries }}
          tracks={embedQuery.tracks}
          layout={embedQuery.layout}
          displayFields={embedQuery.displayFields}
        />
      </EmbedFrame>
    );
  } catch {
    return (
      <EmbedUnavailable message="This event has not published its speaker gallery yet. Check back after the organizer publishes the program." />
    );
  }
}
