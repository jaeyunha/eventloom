import { SubmissionDetailWorkspace } from "../../../../../../features/admin/submission-workspace";

interface SubmissionDetailPageProps {
  params: Promise<{ eventId: string; submissionId: string }>;
}

export default async function OrganizerSubmissionDetailPage({ params }: SubmissionDetailPageProps) {
  const { eventId, submissionId } = await params;
  return <SubmissionDetailWorkspace eventId={eventId} submissionId={submissionId} />;
}
