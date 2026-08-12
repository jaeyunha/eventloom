import type { Metadata } from "next";
import { DeliverablesWorkspace } from "@/features/deliverables/deliverables-workspace";

export const metadata: Metadata = {
  title: "Files",
  description:
    "Organizer-side authorized uploaded-asset library with server-authoritative eligibility and history.",
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
