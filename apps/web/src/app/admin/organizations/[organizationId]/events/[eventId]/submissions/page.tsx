import { SubmissionListWorkspace } from "@/features/admin/submission-workspace";

interface SubmissionsPageProps {
  readonly params: Promise<{ organizationId: string; eventId: string }>;
}

export default async function OrganizerSubmissionsPage({ params }: SubmissionsPageProps) {
  const { organizationId, eventId } = await params;
  return <SubmissionListWorkspace organizationId={organizationId} eventId={eventId} />;
}
