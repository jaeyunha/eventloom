"use client";
import styles from "../review-workspace.module.css";
import { EvaluatorCommentField } from "./evaluator-comment-field";
import type { EvaluatorController } from "./evaluator-controller";
import { EvaluatorCriterionCard } from "./evaluator-criterion-card";
import { EvaluatorSuggestionToolbar } from "./evaluator-suggestion-toolbar";
export function EvaluatorScorecardView({
  controller,
}: Readonly<{ controller: EvaluatorController }>) {
  const { assignment, autosaveState, countedScore, possibleScore } = controller;
  return (
    <section className={styles.section} aria-labelledby="score-heading">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.sectionEyebrow}>Human rubric</p>
          <h2 id="score-heading">Score this submission</h2>
        </div>
        <p className={styles.autosaveStatus} aria-live="polite">
          {autosaveState}
        </p>
      </div>
      <p className={styles.sectionIntro}>
        Numeric criteria are bounded by their configured scale; dropdown and free-text criteria use
        their configured options and response fields. AI prefills are advisory and uncounted until a
        human confirms or edits a numeric score.
      </p>
      <EvaluatorSuggestionToolbar controller={controller} />
      <div className={styles.scoreList}>
        {assignment.round.rubric.criteria.map((criterion) => (
          <EvaluatorCriterionCard
            key={criterion.id}
            controller={controller}
            criterion={criterion}
          />
        ))}
      </div>
      <p className={styles.countedTotal}>
        Counted human score:{" "}
        <strong>
          {countedScore().toFixed(1)} / {possibleScore().toFixed(1)} weighted points
        </strong>
        <span> · AI suggestions never count until you confirm or edit them.</span>
      </p>
      <EvaluatorCommentField controller={controller} />
    </section>
  );
}
