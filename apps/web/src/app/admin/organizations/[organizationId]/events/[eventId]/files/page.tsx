import type { Metadata } from "next";
import { DeliverablesWorkspace } from "@/features/deliverables/deliverables-workspace";

export const metadata: Metadata = {
  title: "Uploaded files",
  description: "Review, approve, and download files submitted by speakers for this event.",
};

interface EventFilesPageProps {
  params: Promise<{ organizationId: string; eventId: string }>;
}

export default async function EventFilesPage({ params }: EventFilesPageProps) {
  const { organizationId, eventId } = await params;
  return (
    <div data-files-route>
      <DeliverablesWorkspace organizationId={organizationId} eventId={eventId} mode="files" />
    </div>
  );
}
