import type { Metadata } from "next";
import { ReviewWorkspace } from "@/features/reviews/review-workspace";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reviewer queue",
  description: "Review only the submissions assigned to you.",
};

interface ReviewerPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function identifier(value: string | string[] | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export default async function ReviewerPage({ searchParams }: ReviewerPageProps = {}) {
  const query = searchParams === undefined ? {} : await searchParams;
  const eventId = identifier(query.eventId);
  const organizationId = identifier(query.organizationId);

  return (
    <ReviewWorkspace
      mode="evaluator"
      {...(eventId === undefined ? {} : { eventId })}
      {...(organizationId === undefined ? {} : { organizationId })}
    />
  );
}
