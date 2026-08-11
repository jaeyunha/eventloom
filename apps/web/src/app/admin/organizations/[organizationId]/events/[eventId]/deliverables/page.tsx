import type { Metadata } from "next";
import { DeliverablesWorkspace } from "@/features/deliverables/deliverables-workspace";

export const metadata: Metadata = {
  title: "Deliverables",
  description:
    "Track event-scoped speaker tasks, due dates, completion state, and task-linked asset versions.",
};

interface DeliverablesPageProps {
  params: Promise<{ organizationId: string; eventId: string }>;
}

export default async function DeliverablesPage({ params }: DeliverablesPageProps) {
  const { organizationId, eventId } = await params;
  const encodedOrganizationId = encodeURIComponent(organizationId);
  const encodedEventId = encodeURIComponent(eventId);
  return (
    <div data-deliverables-route>
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
        <p style={{ margin: 0, color: "var(--color-muted, #697181)" }}>Organizer event workflow</p>
        <h1 style={{ margin: "0.25rem 0" }}>Deliverables</h1>
        <p style={{ margin: 0, color: "var(--color-muted, #697181)" }}>
          Task-centric view for assigning speaker requests, filtering status, and tracking
          completion. Asset history and the aggregate library live in Files.
        </p>
        <p style={{ margin: "0.75rem 0 0" }}>
          <a href={`/admin/organizations/${encodedOrganizationId}/events/${encodedEventId}/files`}>
            Open Files library
          </a>
        </p>
      </header>
      <DeliverablesWorkspace
        organizationId={organizationId}
        eventId={eventId}
        mode="deliverables"
      />
    </div>
  );
}
