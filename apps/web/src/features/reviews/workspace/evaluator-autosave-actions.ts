"use client";
import type { ApiReviewContext } from "./api-api-review-context";
import type { EvaluatorState } from "./evaluator-state";
import { criterionNumericValue } from "./model-criterion-numeric-value";
import { criterionOptionValue } from "./model-criterion-option-value";
import { criterionType } from "./model-criterion-type";
import { evaluationRequest } from "./model-evaluation-request";
import { reviewerAssignmentRequestPath } from "./model-reviewer-assignment-request-path";
import { isHumanConfirmedReviewScore } from "./scorecard-is-human-confirmed-review-score";
import { parseScorecardResponses } from "./scorecard-parse-scorecard-responses";
import { withScorecardResponses } from "./scorecard-with-scorecard-responses";
export function useEvaluatorAutosaveActions(scope: EvaluatorState) {
  const {
    assignment,
    baseUrl,
    onDraftChange,
    scoreValues,
    setScoreValues,
    responseValues,
    setResponseValues,
    humanConfirmed,
    setHumanConfirmed,
    comment,
    setComment,
    setReviewVersion,
    reviewVersionRef,
    autosaveQueue,
    setAutosaveState,
    setSubmitError,
  } = scope;
  function reportDraft(
    nextScores: Readonly<Record<string, string>> = scoreValues,
    nextResponses: Readonly<Record<string, string>> = responseValues,
    nextConfirmed: ReadonlySet<string> = humanConfirmed,
    nextComment: string = comment,
    nextVersion: number | undefined = reviewVersionRef.current,
  ): void {
    onDraftChange?.({
      scoreValues: nextScores,
      responseValues: nextResponses,
      humanConfirmed: [...nextConfirmed],
      comment: nextComment,
      reviewVersion: nextVersion,
    });
  }
  function applyAuthoritativeReview(review: NonNullable<ApiReviewContext["review"]>): void {
    setReviewVersion(review.version);
    reviewVersionRef.current = review.version;
    const nextScores: Record<string, string> = {};
    const nextResponses: Record<string, string> = {};
    const nextConfirmed = new Set<string>();
    const criteria = assignment.round.rubric.criteria;
    const criteriaById = new Map<string, (typeof criteria)[number]>();
    for (const criterion of criteria) {
      if (!criteriaById.has(criterion.id)) criteriaById.set(criterion.id, criterion);
    }
    for (const [criterionId, score] of Object.entries(review.scores)) {
      const criterion = criteriaById.get(criterionId);
      if (criterion === undefined) continue;
      if (criterionType(criterion) === "free_text") {
        if (typeof score.value === "string") nextResponses[criterionId] = score.value;
        else if (score.evidence?.[0] !== undefined) nextResponses[criterionId] = score.evidence[0];
      } else if (typeof score.value === "number") {
        nextScores[criterionId] =
          criterionType(criterion) === "dropdown"
            ? criterionOptionValue(criterion, score.value)
            : String(score.value);
      } else if (criterionType(criterion) === "dropdown" && typeof score.value === "string") {
        nextScores[criterionId] = score.value;
      }
      if (isHumanConfirmedReviewScore(score)) nextConfirmed.add(criterionId);
    }
    const parsedComment = parseScorecardResponses(review.comment ?? "");
    setScoreValues(nextScores);
    setResponseValues({ ...parsedComment.responses, ...nextResponses });
    setHumanConfirmed(nextConfirmed);
    setComment(parsedComment.comment);
    reportDraft(
      nextScores,
      { ...parsedComment.responses, ...nextResponses },
      nextConfirmed,
      parsedComment.comment,
      review.version,
    );
  }

  async function persistReview(
    nextScores: Readonly<Record<string, string>> = scoreValues,
    nextComment: string = comment,
    nextConfirmed: ReadonlySet<string> = humanConfirmed,
    nextResponses: Readonly<Record<string, string>> = responseValues,
  ): Promise<NonNullable<ApiReviewContext["review"]>> {
    const scores: Array<{
      criterionId: string;
      value: number | string;
      origin: "human" | "ai";
      evidence?: readonly string[];
    }> = [];
    for (const criterion of assignment.round.rubric.criteria) {
      if (criterionType(criterion) === "free_text") {
        const value = nextResponses[criterion.id]?.trim() ?? "";
        if (value.length > 0) {
          scores.push({ criterionId: criterion.id, value, origin: "human" });
        }
        continue;
      }
      const confirmed = nextConfirmed.has(criterion.id);
      if (!confirmed) continue;
      const rawValue =
        criterionType(criterion) === "dropdown"
          ? (nextScores[criterion.id] ?? "")
          : (nextScores[criterion.id] ?? "");
      const numericValue =
        criterionType(criterion) === "dropdown"
          ? criterionNumericValue(criterion, rawValue)
          : Number(rawValue);
      if (!Number.isFinite(numericValue)) continue;
      scores.push({
        criterionId: criterion.id,
        value: numericValue,
        origin: "human",
      });
    }
    const review = await evaluationRequest<NonNullable<ApiReviewContext["review"]>>(
      baseUrl,
      reviewerAssignmentRequestPath(assignment, { kind: "review" }),
      {
        method: "PUT",
        body: JSON.stringify({
          scores,
          comment: withScorecardResponses(nextComment, nextResponses),
          ...(reviewVersionRef.current === undefined
            ? {}
            : { expectedVersion: reviewVersionRef.current }),
        }),
      },
    );
    applyAuthoritativeReview(review);
    setSubmitError(null);
    setAutosaveState("Saved on server");
    return review;
  }

  function enqueueAutosave(
    nextScores: Readonly<Record<string, string>>,
    nextComment: string,
    nextConfirmed: ReadonlySet<string>,
    nextResponses: Readonly<Record<string, string>>,
  ): void {
    void autosaveQueue.enqueue(async () => {
      setAutosaveState("Saving draft…");
      try {
        await persistReview(nextScores, nextComment, nextConfirmed, nextResponses);
      } catch (reason: unknown) {
        setAutosaveState("Save failed");
        setSubmitError(
          reason instanceof Error ? reason.message : "The review draft could not be saved.",
        );
      }
    });
  }

  return {
    ...scope,
    reportDraft,
    applyAuthoritativeReview,
    persistReview,
    enqueueAutosave,
  };
}
export type EvaluatorAutosaveController = ReturnType<typeof useEvaluatorAutosaveActions>;
