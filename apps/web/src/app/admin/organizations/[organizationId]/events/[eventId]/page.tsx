import { redirect } from "next/navigation";

interface EventWorkspacePageProps {
  readonly params: Promise<{ organizationId: string; eventId: string }>;
}

export default async function EventWorkspacePage({ params }: EventWorkspacePageProps) {
  const { organizationId, eventId } = await params;
  redirect(
    `/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventId)}/settings`,
  );
}
