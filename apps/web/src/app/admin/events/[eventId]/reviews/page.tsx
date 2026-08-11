import { ReviewWorkspace } from "@/features/reviews/review-workspace";

export default async function EventReviewsPage({
  params,
}: Readonly<{ params: Promise<{ eventId: string }> }>) {
  const { eventId } = await params;
  return <ReviewWorkspace eventId={eventId} mode="organizer" />;
}
