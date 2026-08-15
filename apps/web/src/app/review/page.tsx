import type { Metadata } from "next";
import { ReviewWorkspace } from "@/features/reviews/review-workspace";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reviewer queue",
  description: "Review only the submissions assigned to you.",
};

export default function ReviewerPage() {
  return <ReviewWorkspace mode="evaluator" />;
}
