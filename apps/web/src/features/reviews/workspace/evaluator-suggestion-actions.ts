"use client";
import type { ApiReviewContext } from "./api-api-review-context";
import type { ApiSuggestion } from "./api-api-suggestion";
import { EvaluationRequestError } from "./api-evaluation-request-error";
import type { EvaluatorAutosaveController } from "./evaluator-autosave-actions";
import { evaluationRequest } from "./model-evaluation-request";
import { reviewerAssignmentRequestPath } from "./model-reviewer-assignment-request-path";
import { validateSuggestionEditValue } from "./model-validate-suggestion-edit-value";
export function useEvaluatorSuggestionActions(scope: EvaluatorAutosaveController) {
  const {
    assignment,
    baseUrl,
    setAutosaveState,
    setSubmitError,
    setSuggestions,
    setSuggestionBusy,
    setSuggestionUnavailable,
    setSuggestionConflict,
    applyAuthoritativeReview,
  } = scope;
  async function generateSuggestions(): Promise<void> {
    setSuggestionBusy(true);
    setSubmitError(null);
    setSuggestionUnavailable(null);
    setSuggestionConflict(null);
    try {
      const suggestion = await evaluationRequest<ApiSuggestion>(
        baseUrl,
        reviewerAssignmentRequestPath(assignment, { kind: "generateSuggestions" }),
        { method: "POST", body: JSON.stringify({}) },
      );
      setSuggestions((current) => [...current, suggestion]);
      setAutosaveState("AI suggestion is pending human resolution");
    } catch (reason: unknown) {
      const message = reason instanceof Error ? reason.message : "AI suggestions are unavailable.";
      if (reason instanceof EvaluationRequestError && reason.status === 503) {
        setSuggestionUnavailable(message);
        setAutosaveState("AI unavailable; manual scoring and save remain available");
        return;
      }
      setSubmitError(message);
    } finally {
      setSuggestionBusy(false);
    }
  }

  async function resolveSuggestion(
    suggestion: ApiSuggestion,
    action: "accept" | "edit" | "reject",
    criterionId?: string,
    value?: number,
  ): Promise<void> {
    if (action === "edit") {
      const criterion = assignment.round.rubric.criteria.find(
        (candidate) => candidate.id === criterionId,
      );
      if (criterion === undefined || value === undefined) {
        setSubmitError("Choose a rubric criterion and valid edit value before saving.");
        return;
      }
      const validationError = validateSuggestionEditValue(criterion, value);
      if (validationError !== null) {
        setSubmitError(validationError);
        return;
      }
    }
    setSuggestionBusy(true);
    setSubmitError(null);
    setSuggestionConflict(null);
    try {
      const response = await evaluationRequest<{
        suggestion: ApiSuggestion;
        review: NonNullable<ApiReviewContext["review"]> | null;
      }>(
        baseUrl,
        reviewerAssignmentRequestPath(assignment, {
          kind: "resolveSuggestion",
          suggestionId: suggestion.id,
        }),
        {
          method: "POST",
          body: JSON.stringify({
            action,
            expectedVersion: suggestion.version,
            ...(action === "edit" && criterionId !== undefined && value !== undefined
              ? {
                  scores: { [criterionId]: value },
                  reason: "Edited by the assigned human evaluator.",
                }
              : {}),
            ...(action === "reject" ? { reason: "Rejected by the assigned human evaluator." } : {}),
          }),
        },
      );
      setSuggestions((current) =>
        current.map((candidate) =>
          candidate.id === response.suggestion.id ? response.suggestion : candidate,
        ),
      );
      setSuggestionUnavailable(null);
      if (response.review !== null) {
        applyAuthoritativeReview(response.review);
      }
      setAutosaveState(
        action === "accept"
          ? "Suggestion accepted by a human"
          : action === "edit"
            ? "Suggestion edited by a human"
            : "Suggestion rejected by a human",
      );
    } catch (reason: unknown) {
      const message =
        reason instanceof Error ? reason.message : "The suggestion could not be resolved.";
      if (
        reason instanceof EvaluationRequestError &&
        (reason.status === 409 || reason.status === 412)
      ) {
        setSuggestions((current) =>
          current.map((candidate) =>
            candidate.id === suggestion.id ? { ...candidate, status: "stale" as const } : candidate,
          ),
        );
        setSuggestionConflict(
          `${message} This suggestion is stale; regenerate it before resolving. Manual scoring, autosave, and submit remain available.`,
        );
        setAutosaveState("AI suggestion stale; manual scoring remains available");
      } else {
        setSubmitError(message);
      }
    } finally {
      setSuggestionBusy(false);
    }
  }

  return { ...scope, generateSuggestions, resolveSuggestion };
}
export type EvaluatorSuggestionController = ReturnType<typeof useEvaluatorSuggestionActions>;
