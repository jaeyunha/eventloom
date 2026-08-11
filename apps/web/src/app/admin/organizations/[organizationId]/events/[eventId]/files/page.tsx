import type { Metadata } from "next";
import { DeliverablesWorkspace } from "@/features/deliverables/deliverables-workspace";

export const metadata: Metadata = {
  title: "Files library",
  description:
    "Review the event-scoped aggregate of latest speaker asset versions, authorized downloads, and comments.",
};

interface EventFilesPageProps {
  params: Promise<{ organizationId: string; eventId: string }>;
}

export default async function EventFilesPage({ params }: EventFilesPageProps) {
  const { organizationId, eventId } = await params;
  const encodedOrganizationId = encodeURIComponent(organizationId);
  const encodedEventId = encodeURIComponent(eventId);
  return (
    <div data-files-route>
      <header
        style={{
          width: "min(100%, 86rem)",
          margin: "1rem auto",
          padding: "1rem 1.25rem",
          border: "1px solid var(--color-border, #dfe2e8)",
          borderRadius: "0.875rem",
          background: "var(--color-surface, #fff)",
        }}
      >
        <p style={{ margin: 0, color: "var(--color-muted, #697181)" }}>Organizer event files</p>
        <h1 style={{ margin: "0.25rem 0" }}>Files library</h1>
        <p style={{ margin: 0, color: "var(--color-muted, #697181)" }}>
          Asset-centric view of the latest authorized version for every speaker file family. Select
          latest files or whole sessions to call the server-generated ZIP export.
        </p>
        <p style={{ margin: "0.75rem 0 0" }}>
          <a
            href={`/admin/organizations/${encodedOrganizationId}/events/${encodedEventId}/deliverables`}
          >
            Open task-centric Deliverables
          </a>
        </p>
      </header>
      <DeliverablesWorkspace organizationId={organizationId} eventId={eventId} mode="files" />
    </div>
  );
}
