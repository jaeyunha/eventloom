import { SubmissionListWorkspace } from "../../../../../features/admin/submission-workspace";

interface SubmissionsPageProps {
  params: Promise<{ eventId: string }>;
}

export default async function OrganizerSubmissionsPage({ params }: SubmissionsPageProps) {
  const { eventId } = await params;
  return <SubmissionListWorkspace eventId={eventId} />;
}
