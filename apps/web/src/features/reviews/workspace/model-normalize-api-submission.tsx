import type { ApiSubmission } from "./api-api-submission";

export function normalizeApiSubmission(submission: ApiSubmission): ApiSubmission | null {
  if (typeof submission.id !== "string" || submission.id.trim().length === 0) return null;
  return {
    ...submission,
    id: submission.id.trim(),
    title:
      typeof submission.title === "string" && submission.title.trim().length > 0
        ? submission.title.trim()
        : submission.id.trim(),
    abstract: typeof submission.abstract === "string" ? submission.abstract : "",
    participants: Array.isArray(submission.participants) ? submission.participants : [],
  };
}
