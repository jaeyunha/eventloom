import { ReviewWorkspace } from "@/features/reviews/review-workspace";

interface ReviewsPageProps {
  readonly params: Promise<{ organizationId: string; eventId: string }>;
}

export default async function EventReviewsPage({ params }: ReviewsPageProps) {
  const { organizationId, eventId } = await params;
  return <ReviewWorkspace organizationId={organizationId} eventId={eventId} mode="organizer" />;
}
