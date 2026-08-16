"use client";
import type { EvaluatorSuggestionController } from "./evaluator-suggestion-actions";
import { criterionNumericValue } from "./model-criterion-numeric-value";
import { criterionType } from "./model-criterion-type";
import type { RubricCriterion } from "./scorecard-rubric-criterion";
export function useEvaluatorScoreActions(scope: EvaluatorSuggestionController) {
  const {
    assignment,
    scoreValues,
    setScoreValues,
    responseValues,
    setResponseValues,
    humanConfirmed,
    setHumanConfirmed,
    comment,
    showValidation,
    setAutosaveState,
    setConflictDialogOpen,
    suggestions,
    reportDraft,
    suggestionForCriterion,
    enqueueAutosave,
    resolveSuggestion,
  } = scope;
  function changeScore(criterionId: string, value: string): void {
    const criterion = assignment.round.rubric.criteria.find(
      (candidate) => candidate.id === criterionId,
    );
    if (criterion === undefined || criterionType(criterion) === "free_text") return;
    const nextScores = { ...scoreValues, [criterionId]: value };
    const nextConfirmed = new Set(humanConfirmed).add(criterionId);
    const numericValue = criterionNumericValue(criterion, value);
    setScoreValues(nextScores);
    reportDraft(nextScores, responseValues, nextConfirmed, comment);
    setHumanConfirmed(nextConfirmed);
    const generated = suggestionForCriterion(criterionId);
    if (generated !== null && Number.isFinite(numericValue)) {
      setAutosaveState("Unsaved changes");
      void resolveSuggestion(generated.suggestion, "edit", criterionId, numericValue);
      return;
    }
    setAutosaveState("Unsaved changes");
    enqueueAutosave(nextScores, comment, nextConfirmed, responseValues);
  }

  function changeResponse(criterionId: string, value: string): void {
    const nextResponses = { ...responseValues, [criterionId]: value };
    setResponseValues(nextResponses);
    reportDraft(scoreValues, nextResponses, humanConfirmed, comment);
    setAutosaveState("Unsaved changes");
    enqueueAutosave(scoreValues, comment, humanConfirmed, nextResponses);
  }

  function confirmAiSuggestion(criterion: RubricCriterion): void {
    const generated = suggestionForCriterion(criterion.id);
    if (generated !== null) {
      void resolveSuggestion(generated.suggestion, "accept");
      return;
    }
    if (suggestions.some((candidate) => candidate.candidates[criterion.id]?.length !== undefined)) {
      return;
    }
    const suggestion = assignment.aiSuggestions[criterion.id];
    if (!suggestion) return;
    const nextScores = {
      ...scoreValues,
      [criterion.id]: String(suggestion.value),
    };
    const nextConfirmed = new Set(humanConfirmed).add(criterion.id);
    setScoreValues(nextScores);
    reportDraft(nextScores, responseValues, nextConfirmed, comment);
    setHumanConfirmed(nextConfirmed);
    setAutosaveState("Unsaved changes");
    enqueueAutosave(nextScores, comment, nextConfirmed, responseValues);
  }

  function countedScore(): number {
    return assignment.round.rubric.criteria.reduce((total, criterion) => {
      if (criterionType(criterion) === "free_text") return total;
      const value = criterionNumericValue(criterion, scoreValues[criterion.id] ?? "");
      if (
        !humanConfirmed.has(criterion.id) ||
        !Number.isFinite(value) ||
        value < criterion.minimum ||
        value > criterion.maximum
      ) {
        return total;
      }
      return total + value * criterion.weight;
    }, 0);
  }

  function possibleScore(): number {
    return assignment.round.rubric.criteria.reduce(
      (total, criterion) =>
        criterionType(criterion) === "free_text"
          ? total
          : total + criterion.maximum * criterion.weight,
      0,
    );
  }

  function criterionComplete(criterion: RubricCriterion): boolean {
    if (criterionType(criterion) === "free_text") {
      return (responseValues[criterion.id] ?? "").trim().length > 0;
    }
    const value = criterionNumericValue(criterion, scoreValues[criterion.id] ?? "");
    return (
      humanConfirmed.has(criterion.id) &&
      Number.isFinite(value) &&
      value >= criterion.minimum &&
      value <= criterion.maximum
    );
  }
  function criterionValidationMessage(criterion: RubricCriterion): string | null {
    if (!showValidation || !criterion.required || criterionComplete(criterion)) return null;
    return criterionType(criterion) === "free_text"
      ? "Required response is incomplete."
      : `Choose and confirm a score from ${criterion.minimum} through ${criterion.maximum}.`;
  }

  function openConflictDisclosure(): void {
    setConflictDialogOpen(true);
  }

  return {
    ...scope,
    changeScore,
    changeResponse,
    confirmAiSuggestion,
    countedScore,
    possibleScore,
    criterionComplete,
    criterionValidationMessage,
    openConflictDisclosure,
  };
}
export type EvaluatorScoreController = ReturnType<typeof useEvaluatorScoreActions>;
