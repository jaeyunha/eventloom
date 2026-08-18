import type { EvaluatorAssignment } from "./assignment-evaluator-assignment";

type ReviewerAssignmentAction = { kind: "conflict" } | { kind: "review" } | { kind: "submit" };

function assignmentActionPath(action: ReviewerAssignmentAction): string {
  switch (action.kind) {
    case "conflict":
      return "/conflict";
    case "review":
      return "/review";
    case "submit":
      return "/review/submit";
  }
}

export function reviewerAssignmentRequestPath(
  assignment: Pick<EvaluatorAssignment, "eventId" | "id" | "organizationId">,
  action: ReviewerAssignmentAction,
): string {
  const searchParams = new URLSearchParams();
  if (assignment.organizationId !== undefined) {
    searchParams.set("organizationId", assignment.organizationId);
  }
  searchParams.set("eventId", assignment.eventId);
  return `/assignments/${encodeURIComponent(assignment.id)}${assignmentActionPath(
    action,
  )}?${searchParams.toString()}`;
}
