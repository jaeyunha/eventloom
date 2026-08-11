import { SubmissionDetailWorkspace } from "@/features/admin/submission-workspace";

interface SubmissionDetailPageProps {
  readonly params: Promise<{
    organizationId: string;
    eventId: string;
    submissionId: string;
  }>;
}

export default async function OrganizerSubmissionDetailPage({ params }: SubmissionDetailPageProps) {
  const { organizationId, eventId, submissionId } = await params;
  return (
    <SubmissionDetailWorkspace
      organizationId={organizationId}
      eventId={eventId}
      submissionId={submissionId}
    />
  );
}
