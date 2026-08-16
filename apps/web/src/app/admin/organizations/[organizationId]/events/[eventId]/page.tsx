import { EventOverviewWorkspace } from "@/features/events/event-overview-workspace";

interface EventWorkspacePageProps {
  readonly params: Promise<{ organizationId: string; eventId: string }>;
}

export default async function EventWorkspacePage({ params }: EventWorkspacePageProps) {
  const { organizationId, eventId } = await params;
  return <EventOverviewWorkspace eventId={eventId} organizationId={organizationId} />;
}
