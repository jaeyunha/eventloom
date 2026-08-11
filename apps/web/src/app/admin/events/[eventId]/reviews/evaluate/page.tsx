import { ReviewWorkspace } from "@/features/reviews/review-workspace";

export default async function EvaluateReviewPage({
  params,
}: Readonly<{ params: Promise<{ eventId: string }> }>) {
  const { eventId } = await params;
  return <ReviewWorkspace eventId={eventId} mode="evaluator" />;
}
