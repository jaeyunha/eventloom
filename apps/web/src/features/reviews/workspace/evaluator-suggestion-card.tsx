"use client";
import styles from "../review-workspace.module.css";
import type { ApiSuggestion } from "./api-api-suggestion";
import type { EvaluatorController } from "./evaluator-controller";
import type { RubricCriterion } from "./scorecard-rubric-criterion";

export function EvaluatorSuggestionCard({
  controller,
  criterion,
  suggestion,
  suggestionRecord,
}: Readonly<{
  controller: EvaluatorController;
  criterion: RubricCriterion;
  suggestion: { value: number; evidence: readonly string[] };
  suggestionRecord: ApiSuggestion | undefined;
}>) {
  const { suggestionBusy, reviewLocked, confirmAiSuggestion, resolveSuggestion, scoreValues } =
    controller;
  return (
    <aside className={styles.aiSuggestion} aria-label={`AI suggestion for ${criterion.label}`}>
      <div>
        <span className={styles.aiLabel}>
          AI suggestion · {suggestionRecord?.status ?? "uncounted"}
        </span>
        <strong>
          {suggestion.value} / {criterion.maximum}
        </strong>
      </div>
      <p className={styles.fieldHint}>Cited evidence</p>
      <ul>
        {suggestion.evidence.map((evidence) => (
          <li key={evidence}>{evidence}</li>
        ))}
      </ul>
      {suggestionRecord ? (
        <div className={styles.fieldHint}>
          <p>
            Provider: {suggestionRecord.provenance.provider} · model{" "}
            {suggestionRecord.provenance.model}
            {suggestionRecord.provenance.generatedAt
              ? ` · generated ${suggestionRecord.provenance.generatedAt}`
              : ""}
          </p>
          <p>
            Rubric revision {suggestionRecord.rubricRevision} · submission revision{" "}
            {suggestionRecord.submissionRevision}
          </p>
          {suggestionRecord.provenance.promptVersion ? (
            <p>Prompt version: {suggestionRecord.provenance.promptVersion}</p>
          ) : null}
          {suggestionRecord.provenance.traceId ? (
            <p>Trace ID: {suggestionRecord.provenance.traceId}</p>
          ) : null}
          <p>
            Source references:{" "}
            {suggestionRecord.provenance.sourceReferences.join(", ") || "none returned"}
          </p>
        </div>
      ) : null}
      <div className={styles.confirmationActions}>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={() => confirmAiSuggestion(criterion)}
          disabled={suggestionBusy || reviewLocked}
        >
          Accept suggestion — Confirm or edit this suggestion
        </button>
        {suggestionRecord ? (
          <>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() =>
                void resolveSuggestion(
                  suggestionRecord,
                  "edit",
                  criterion.id,
                  Number(scoreValues[criterion.id]),
                )
              }
              disabled={suggestionBusy || reviewLocked}
            >
              Edit suggestion — save human edit
            </button>
            <button
              className={styles.dangerButton}
              type="button"
              onClick={() => void resolveSuggestion(suggestionRecord, "reject")}
              disabled={suggestionBusy || reviewLocked}
            >
              Reject suggestion
            </button>
          </>
        ) : null}
      </div>
    </aside>
  );
}
