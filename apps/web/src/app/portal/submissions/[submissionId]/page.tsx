import type { Metadata } from "next";
import { SubmissionDetail } from "../../../../features/portal/submission-detail";

export const metadata: Metadata = {
  title: "Submission status",
};

export default async function SpeakerSubmissionDetailPage({
  params,
}: Readonly<{ params: Promise<{ submissionId: string }> }>) {
  const { submissionId } = await params;
  return <SubmissionDetail submissionId={submissionId} />;
}
