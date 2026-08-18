"use client";

import type { ApiDecision } from "./api-api-decision";
import type { ApiPlan } from "./api-api-plan";
import type { ApiProgress } from "./api-api-progress";
import type { ReviewPlanAssignment } from "./assignment-review-plan-assignment";
import { assignmentCompletionPercent } from "./model-assignment-completion-percent";
import { dateLabel } from "./model-date-label";
import { effectiveReviewClosesAt } from "./model-effective-review-closes-at";
import type { AggregateRow } from "./organizer-aggregate-row";
import type { ReviewPlanSeed } from "./organizer-review-plan-seed";
import { normalizeReviewerProgress } from "./progress-normalize-reviewer-progress";

export function mapPlan(
  plan: ApiPlan,
  eventId: string,
  aggregates: readonly AggregateRow[],
  progress: ApiProgress,
  decisions: Readonly<Record<string, ApiDecision | null>>,
  assignments: readonly ReviewPlanAssignment[] = [],
): ReviewPlanSeed {
  const reviewerProgress = progress.reviewers?.map(normalizeReviewerProgress);
  const activeAssignments = assignments.filter(
    (assignment) => assignment.status !== "abstained" && assignment.status !== "superseded",
  );
  const submittedAssignments = activeAssignments.filter(
    (assignment) => assignment.status === "submitted",
  ).length;
  const abstainedAssignments = assignments.filter(
    (assignment) => assignment.status === "abstained",
  ).length;
  const now = Date.now();
  return {
    planId: plan.id,
    version: plan.version,
    decisionBySubmission: Object.fromEntries(
      Object.entries(decisions).flatMap(([submissionId, decision]) => {
        if (decision === null) return [];
        const reason = decision.history.at(-1)?.reason ?? "";
        return [[submissionId, { status: decision.status, reason, version: decision.version }]];
      }),
    ),
    eventId,
    eventName: eventId,
    planName: plan.name,
    status: plan.status,
    opensAt: dateLabel(plan.rounds[0]?.opensAt ?? null),
    closesAt: dateLabel(effectiveReviewClosesAt(plan)),
    blindReview: plan.blindReview,
    assignmentRule: plan.assignmentRule,
    ...(plan.reviewerProjection === undefined
      ? {}
      : {
          reviewerProjection: {
            fieldIds: Array.isArray(plan.reviewerProjection.fieldIds)
              ? plan.reviewerProjection.fieldIds
              : [],
            fileIds: Array.isArray(plan.reviewerProjection.fileIds)
              ? plan.reviewerProjection.fileIds
              : [],
          },
        }),
    sourceRounds: plan.rounds,
    sourceClosesAt: plan.closesAt,
    rounds: plan.rounds.map((round) => ({
      id: round.id,
      sequence: round.sequence,
      revision: round.revision,
      rubricRevision: round.rubricRevision,
      name: round.name,
      status:
        plan.status === "closed" || (round.closesAt !== null && Date.parse(round.closesAt) <= now)
          ? "closed"
          : plan.status !== "open" ||
              (round.opensAt !== null &&
                round.opensAt !== undefined &&
                Date.parse(round.opensAt) > now)
            ? "scheduled"
            : "open",
      opensAt: dateLabel(round.opensAt ?? plan.createdAt),
      closesAt: dateLabel(round.closesAt),
      aiTriageEnabled: round.aiTriageEnabled === true,
      completionPercent: assignmentCompletionPercent(assignments, round.id),
      blindReview: round.blindReview === true || plan.blindReview,
      anonymization: round.anonymization,
      reviewerPool: round.reviewerPool,
      trackFilter: round.trackFilter ?? null,
      rubric: { name: round.rubric.name, criteria: round.rubric.criteria },
    })),
    aggregates,
    submittedReviews: [],
    assignments,
    progress: {
      totalAssignments: assignments.length,
      assigned: activeAssignments.length,
      inProgress: activeAssignments.filter((assignment) => assignment.status === "in_progress")
        .length,
      submitted: submittedAssignments,
      abstained: abstainedAssignments,
      conflicts: abstainedAssignments,
      completionPercent: assignmentCompletionPercent(assignments),
      reviewers: reviewerProgress ?? [],
    },
  };
}
