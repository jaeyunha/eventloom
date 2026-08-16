import type { Metadata } from "next";
import { ReviewWorkspace } from "@/features/reviews/review-workspace";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Review submission",
  description: "Review one assigned submission in a focused full-page workspace.",
};

interface ReviewerAssignmentPageProps {
  params: Promise<{ assignmentId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function identifier(value: string | string[] | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export default async function ReviewerAssignmentPage({
  params,
  searchParams,
}: ReviewerAssignmentPageProps) {
  const route = await params;
  const query = searchParams === undefined ? {} : await searchParams;
  const assignmentId = decodeURIComponent(route.assignmentId).trim();
  const eventId = identifier(query.eventId);
  const organizationId = identifier(query.organizationId);

  return (
    <ReviewWorkspace
      mode="evaluator"
      assignmentId={assignmentId}
      {...(eventId === undefined ? {} : { eventId })}
      {...(organizationId === undefined ? {} : { organizationId })}
    />
  );
}
