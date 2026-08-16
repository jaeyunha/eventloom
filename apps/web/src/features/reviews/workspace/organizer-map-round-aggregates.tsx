import type { ApiAggregate } from "./api-api-aggregate";
import type { ApiSubmission } from "./api-api-submission";
import type { ReviewPlanAssignment } from "./assignment-review-plan-assignment";
import type { AggregateRow } from "./organizer-aggregate-row";

export function mapRoundAggregates(
  submissions: readonly ApiSubmission[],
  assignments: readonly ReviewPlanAssignment[],
  aggregates: readonly ApiAggregate[],
  roundId: string,
): readonly AggregateRow[] {
  const aggregateBySubmissionId = aggregates.reduce((bySubmissionId, aggregate) => {
    if (aggregate.roundId === roundId) {
      bySubmissionId.set(aggregate.submissionId, aggregate);
    }
    return bySubmissionId;
  }, new Map<string, ApiAggregate>());
  return submissions.map((submission) => {
    const aggregate = aggregateBySubmissionId.get(submission.id);
    const submissionAssignments = assignments.filter(
      (assignment) =>
        assignment.submissionId === submission.id &&
        assignment.roundId === roundId &&
        assignment.status !== "superseded",
    );
    return {
      id: submission.id,
      reference: submission.id,
      title: submission.title,
      countedScore: aggregate?.averageWeightedTotal?.toFixed(1) ?? "—",
      possibleScore: aggregate?.possibleWeightedTotal?.toFixed(1) ?? "—",
      countedReviews: aggregate?.submittedReviewCount ?? 0,
      expectedReviews:
        aggregate?.expectedReviewCount ??
        submissionAssignments.filter((assignment) => assignment.status !== "abstained").length,
      conflicts: submissionAssignments.filter((assignment) => assignment.status === "abstained")
        .length,
      abstentions: submissionAssignments.filter((assignment) => assignment.status === "abstained")
        .length,
      participants: submission.participants ?? [],
      roundId,
      ...(aggregate?.roundRevision === undefined ? {} : { roundRevision: aggregate.roundRevision }),
      ...(aggregate?.rubricRevision === undefined
        ? {}
        : { rubricRevision: aggregate.rubricRevision }),
    };
  });
}
