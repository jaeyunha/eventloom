"use client";
import { useEvaluatorAutosaveActions } from "./evaluator-autosave-actions";
import { useEvaluatorScoreActions } from "./evaluator-score-actions";
import type { EvaluatorWorkspaceProps } from "./evaluator-state";
import { useEvaluatorState } from "./evaluator-state";
import { useEvaluatorSubmissionActions } from "./evaluator-submission-actions";
import { useEvaluatorSuggestionActions } from "./evaluator-suggestion-actions";
import { isAccountIdentityField } from "./model-is-account-identity-field";
export function useEvaluatorController(props: EvaluatorWorkspaceProps) {
  const state = useEvaluatorState(props);
  const autosave = useEvaluatorAutosaveActions(state);
  const suggestions = useEvaluatorSuggestionActions(autosave);
  const scores = useEvaluatorScoreActions(suggestions);
  const controller = useEvaluatorSubmissionActions(scores);
  const rubricCriteria = controller.assignment.round.rubric.criteria;
  const identityRedacted =
    controller.assignment.round.blindReview || controller.assignment.identityRedacted === true;
  const visibleSubmissionFields =
    controller.assignment.submissionFields?.filter(
      (field) =>
        !identityRedacted ||
        ![field.id, field.label].some(
          (candidate) => candidate !== undefined && isAccountIdentityField(candidate),
        ),
    ) ?? [];
  const completedCriteria = rubricCriteria.filter(controller.criterionComplete).length;
  return {
    ...controller,
    rubricCriteria,
    identityRedacted,
    visibleSubmissionFields,
    completedCriteria,
  };
}
export type EvaluatorController = ReturnType<typeof useEvaluatorController>;
