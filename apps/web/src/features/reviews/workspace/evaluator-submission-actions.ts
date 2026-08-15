"use client";
import type { ApiReviewContext } from "./api-api-review-context";
import type { EvaluatorScoreController } from "./evaluator-score-actions";
import { evaluationRequest } from "./model-evaluation-request";
export function useEvaluatorSubmissionActions(scope: EvaluatorScoreController) {
  const {
    assignment,
    baseUrl,
    onAbstain,
    onSubmitted,
    criterionRefs,
    setShowValidation,
    autosaveQueue,
    setAutosaveState,
    setSubmitted,
    reviewLocked,
    setSubmitError,
    submitBusy,
    setSubmitBusy,
    submitBusyRef,
    abstentionReason,
    setAbstentionReason,
    setAbstentionError,
    setAbstained,
    setAbstentionBusy,
    setConflictDialogOpen,
    applyAuthoritativeReview,
    persistReview,
    criterionComplete,
  } = scope;
  async function submitReview(): Promise<void> {
    if (submitBusy || submitBusyRef.current) return;
    if (reviewLocked) {
      setSubmitError("This review round is no longer accepting changes.");
      return;
    }
    setShowValidation(true);
    const missing = assignment.round.rubric.criteria.find(
      (criterion) => criterion.required && !criterionComplete(criterion),
    );
    if (missing) {
      setSubmitError(`Confirm or edit the required “${missing.label}” score before submitting.`);
      criterionRefs.current[missing.id]?.focus();
      return;
    }
    setSubmitError(null);
    setSubmitBusy(true);
    submitBusyRef.current = true;
    try {
      await autosaveQueue.whenIdle();
      const review = await persistReview();
      const submittedReview = await evaluationRequest<NonNullable<ApiReviewContext["review"]>>(
        baseUrl,
        `/assignments/${encodeURIComponent(assignment.id)}/review/submit`,
        {
          method: "POST",
          body: JSON.stringify({ expectedVersion: review.version }),
        },
      );
      applyAuthoritativeReview(submittedReview);
      setSubmitted(submittedReview.submittedAt !== null);
      if (submittedReview.submittedAt !== null) onSubmitted?.(submittedReview);
      setAutosaveState("Review submitted");
      setShowValidation(false);
    } catch (reason: unknown) {
      setAutosaveState("Save failed");
      setSubmitError(
        reason instanceof Error ? reason.message : "The review could not be submitted.",
      );
    } finally {
      setSubmitBusy(false);
      submitBusyRef.current = false;
    }
  }

  async function declareAbstention(): Promise<void> {
    if (abstentionReason.trim().length === 0) {
      setAbstentionError("A written conflict-of-interest reason is required.");
      return;
    }
    setAbstentionError(null);
    setAbstentionBusy(true);
    try {
      const declaration = await evaluationRequest<{
        id: string;
        reason: string;
        declaredAt: string;
      }>(baseUrl, `/assignments/${encodeURIComponent(assignment.id)}/conflict`, {
        method: "POST",
        body: JSON.stringify({ reason: abstentionReason.trim() }),
      });
      setAbstentionReason(declaration.reason);
      setAbstained(true);
      setConflictDialogOpen(false);
      onAbstain?.();
    } catch (reason: unknown) {
      setAbstentionError(
        reason instanceof Error ? reason.message : "The conflict could not be recorded.",
      );
    } finally {
      setAbstentionBusy(false);
    }
  }

  return { ...scope, submitReview, declareAbstention };
}
export type EvaluatorController = ReturnType<typeof useEvaluatorSubmissionActions>;
