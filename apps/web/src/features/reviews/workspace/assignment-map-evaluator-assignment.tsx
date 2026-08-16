"use client";

import type { ApiReviewContext } from "./api-api-review-context";
import type { ApiReviewerWorkspacePlan } from "./api-api-reviewer-workspace-plan";
import type { EvaluatorAssignment } from "./assignment-evaluator-assignment";
import { criterionOptionValue } from "./model-criterion-option-value";
import { criterionType } from "./model-criterion-type";
import { dateLabel } from "./model-date-label";
import { submissionFields } from "./model-submission-fields";
import { submissionTrack } from "./model-submission-track";
import type { ReviewRound } from "./organizer-review-round";
import { isHumanConfirmedReviewScore } from "./scorecard-is-human-confirmed-review-score";
import { parseScorecardResponses } from "./scorecard-parse-scorecard-responses";

export function mapEvaluatorAssignment(
  plan: ApiReviewerWorkspacePlan,
  context: ApiReviewContext,
): EvaluatorAssignment {
  const round: ReviewRound = {
    sequence: context.round.sequence,
    id: context.round.id,
    name: context.round.name,
    status:
      plan.status !== "open"
        ? "scheduled"
        : context.round.closesAt !== null && Date.parse(context.round.closesAt) <= Date.now()
          ? "closed"
          : context.round.opensAt !== null &&
              context.round.opensAt !== undefined &&
              Date.parse(context.round.opensAt) > Date.now()
            ? "scheduled"
            : "open",
    opensAt: dateLabel(context.round.opensAt ?? plan.createdAt),
    closesAt: dateLabel(context.round.closesAt ?? plan.closesAt),
    completionPercent: 0,
    roundRevision: context.round.revision,
    rubricRevision: context.round.rubricRevision ?? context.rubricRevision,
    blindReview:
      context.round.blindReview === true ||
      (context.round.anonymization !== undefined && context.round.anonymization !== "none") ||
      plan.blindReview,
    anonymization: context.round.anonymization,
    reviewerPool: context.round.reviewerPool,
    trackFilter: context.round.trackFilter ?? null,
    rubric: {
      name: context.round.rubric.name,
      criteria: context.round.rubric.criteria,
    },
  };
  const scores = context.review?.scores ?? {};
  const suggestions = context.suggestions ?? [];
  const parsedComment = parseScorecardResponses(context.review?.comment ?? "");
  const initialResponses: Record<string, string> = {
    ...parsedComment.responses,
  };
  const initialScores = Object.fromEntries(
    Object.entries(scores).flatMap(([criterionId, score]) => {
      const criterion = round.rubric.criteria.find((candidate) => candidate.id === criterionId);
      if (criterion === undefined) return [];
      if (criterionType(criterion) === "free_text") {
        if (typeof score.value === "string") initialResponses[criterionId] = score.value;
        else if (score.evidence[0] !== undefined) initialResponses[criterionId] = score.evidence[0];
        return [];
      }
      return [
        [
          criterionId,
          criterionType(criterion) === "dropdown"
            ? criterionOptionValue(criterion, score.value)
            : String(score.value),
        ],
      ];
    }),
  );
  const aiSuggestions = Object.fromEntries([
    ...Object.entries(scores)
      .filter(([criterionId, score]) => {
        const criterion = round.rubric.criteria.find((candidate) => candidate.id === criterionId);
        return (
          score.origin === "ai" &&
          criterion !== undefined &&
          criterionType(criterion) === "numeric" &&
          typeof score.value === "number"
        );
      })
      .map(([criterionId, score]) => [
        criterionId,
        { value: Number(score.value), evidence: score.evidence },
      ]),
    ...suggestions
      .filter((suggestion) => suggestion.status === "pending")
      .flatMap((suggestion) =>
        Object.entries(suggestion.candidates).flatMap(([criterionId, candidates]) => {
          const criterion = round.rubric.criteria.find((candidate) => candidate.id === criterionId);
          const candidate = candidates[0];
          return criterion !== undefined &&
            criterionType(criterion) === "numeric" &&
            candidate !== undefined
            ? [[criterionId, { value: candidate.value, evidence: candidate.evidence }]]
            : [];
        }),
      ),
  ]);
  const resolvedEventId = context.assignment.eventId || plan.eventId;
  return {
    organizationId: plan.organizationId ?? resolvedEventId,
    organizationName: plan.organizationName ?? "Organization",
    eventId: resolvedEventId,
    eventName: plan.eventName ?? "Assigned event",
    dueAt: round.closesAt ?? plan.closesAt,
    planId: context.assignment.planId || plan.id,
    planName: plan.name,
    reviewVersion: context.review?.version,
    initialScores,
    initialResponses,
    initialConfirmed: Object.entries(scores)
      .filter(([criterionId, score]) => {
        const criterion = round.rubric.criteria.find((candidate) => candidate.id === criterionId);
        return (
          isHumanConfirmedReviewScore(score) &&
          criterion !== undefined &&
          criterionType(criterion) !== "free_text"
        );
      })
      .map(([criterionId]) => criterionId),
    initialComment: parsedComment.comment,
    submittedAt:
      context.review?.submittedAt ??
      (context.assignment.status === "submitted" ? (context.assignment.updatedAt ?? null) : null),
    id: context.assignment.id,
    reference: context.assignment.submissionId,
    title: context.submission.title,
    abstract: context.submission.abstract,
    assignmentStatus: context.assignment.status,
    predecessorAssignmentId: context.assignment.predecessorAssignmentId,
    successorAssignmentId: context.assignment.successorAssignmentId,
    supersededReason: context.assignment.supersededReason,
    lineage: context.assignment.lineage,
    roundRevision: context.round.revision,
    rubricRevision: context.round.rubricRevision ?? context.rubricRevision,
    submissionRevision: context.submissionRevision,
    track: submissionTrack(round, context.submission.answers),
    participants: context.submission.participants ?? [],
    identityRedacted: context.submission.identityRedacted === true,
    submissionFields: submissionFields(
      context.submission.answers,
      round.blindReview === true || context.submission.identityRedacted === true,
    ),
    round,
    aiSuggestions,
    suggestions,
  };
}
