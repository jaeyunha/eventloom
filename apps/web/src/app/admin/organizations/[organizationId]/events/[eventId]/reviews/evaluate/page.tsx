import { ReviewWorkspace } from "@/features/reviews/review-workspace";

interface EvaluateReviewPageProps {
  readonly params: Promise<{ organizationId: string; eventId: string }>;
}

export default async function EvaluateReviewPage({ params }: EvaluateReviewPageProps) {
  const { organizationId, eventId } = await params;
  return <ReviewWorkspace organizationId={organizationId} eventId={eventId} mode="evaluator" />;
}
