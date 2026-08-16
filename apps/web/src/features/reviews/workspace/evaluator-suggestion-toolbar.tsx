"use client";
import styles from "../review-workspace.module.css";
import type { EvaluatorController } from "./evaluator-controller";

export function EvaluatorSuggestionToolbar({
  controller,
}: Readonly<{ controller: EvaluatorController }>) {
  const {
    abstentionBusy,
    reviewLocked,
    openConflictDisclosure,
    suggestionBusy,
    generateSuggestions,
    suggestionUnavailable,
    suggestionConflict,
    suggestions,
  } = controller;
  return (
    <>
      <div className={styles.confirmationActions}>
        <button
          className={styles.dangerButton}
          type="button"
          onClick={openConflictDisclosure}
          disabled={abstentionBusy || reviewLocked}
        >
          Declare conflict
        </button>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={() => void generateSuggestions()}
          disabled={suggestionBusy || reviewLocked}
        >
          {suggestionBusy ? "Generating…" : "Generate AI suggestions"}
        </button>
        <span className={styles.fieldHint}>
          Pending suggestions include exact revisions, evidence, and provider provenance.
        </span>
        {suggestionUnavailable ? (
          <p className={styles.fieldHint} role="status">
            AI provider unavailable locally: {suggestionUnavailable} Manual scoring, autosave, and
            submit evaluation remain usable.
          </p>
        ) : null}
        {suggestionConflict ? (
          <p className={styles.formError} role="alert">
            {suggestionConflict}{" "}
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => void generateSuggestions()}
              disabled={suggestionBusy || reviewLocked}
            >
              Regenerate suggestions
            </button>
          </p>
        ) : null}
        {suggestions.length > 0 ? (
          <details className={styles.disclosure}>
            <summary>AI suggestion status and provenance</summary>
            <ul>
              {suggestions.map((suggestion) => (
                <li key={suggestion.id}>
                  <strong>{suggestion.status}</strong> · suggestion {suggestion.id} · rubric
                  revision {suggestion.rubricRevision} · submission revision{" "}
                  {suggestion.submissionRevision} · provider {suggestion.provenance.provider} ·
                  model {suggestion.provenance.model}
                  {suggestion.provenance.generatedAt
                    ? ` · generated ${suggestion.provenance.generatedAt}`
                    : ""}
                  {suggestion.provenance.promptVersion
                    ? ` · prompt ${suggestion.provenance.promptVersion}`
                    : ""}
                  {suggestion.provenance.traceId ? ` · trace ${suggestion.provenance.traceId}` : ""}
                  {suggestion.provenance.sourceReferences.length > 0
                    ? ` · sources ${suggestion.provenance.sourceReferences.join(", ")}`
                    : " · sources unavailable"}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
      {suggestions.flatMap((suggestion) => {
        if (suggestion.status !== "stale") return [];
        return [
          <p className={styles.formError} role="alert" key={suggestion.id}>
            AI suggestion is stale for rubric revision {suggestion.rubricRevision} and submission
            revision {suggestion.submissionRevision}; generate a new suggestion.
          </p>,
        ];
      })}
    </>
  );
}
