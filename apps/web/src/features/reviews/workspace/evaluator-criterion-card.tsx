"use client";
import styles from "../review-workspace.module.css";
import type { EvaluatorController } from "./evaluator-controller";
import { EvaluatorSuggestionCard } from "./evaluator-suggestion-card";
import { criterionType } from "./model-criterion-type";
import type { RubricCriterion } from "./scorecard-rubric-criterion";
export function EvaluatorCriterionCard({
  controller,
  criterion,
}: Readonly<{ controller: EvaluatorController; criterion: RubricCriterion }>) {
  const {
    assignment,
    suggestions,
    scoreValues,
    responseValues,
    humanConfirmed,
    reviewLocked,
    criterionRefs,
    changeScore,
    changeResponse,
    criterionValidationMessage,
    suggestionForCriterion,
  } = controller;
  const generatedSuggestion = suggestionForCriterion(criterion.id);
  const hasSuggestionRecord = suggestions.some(
    (candidate) => candidate.candidates[criterion.id]?.length !== undefined,
  );
  const suggestion =
    generatedSuggestion?.candidate ??
    (hasSuggestionRecord ? undefined : assignment.aiSuggestions[criterion.id]);
  const suggestionRecord = generatedSuggestion?.suggestion;
  const isConfirmed =
    criterionType(criterion) === "free_text"
      ? (responseValues[criterion.id] ?? "").trim().length > 0
      : humanConfirmed.has(criterion.id);
  const validationMessage = criterionValidationMessage(criterion);
  const compactNumericScale =
    criterionType(criterion) === "numeric" && criterion.maximum - criterion.minimum <= 6;
  return (
    <fieldset
      className={`${styles.scoreCard} ${validationMessage ? styles.invalidCriterion : ""}`}
      key={criterion.id}
      aria-describedby={`${criterion.id}-description`}
      data-score-anchor={criterion.id}
    >
      <legend className={styles.scoreCardLegend}>{criterion.label}</legend>
      <div className={styles.scoreCardHeader}>
        <div>
          <h3>{criterion.label}</h3>
          <p id={`${criterion.id}-description`}>{criterion.description}</p>
        </div>
        <span className={isConfirmed ? styles.confirmedPill : styles.uncountedPill}>
          {isConfirmed
            ? criterionType(criterion) === "free_text"
              ? "Human response · saved"
              : "Human confirmed · counted"
            : suggestion
              ? "AI prefill · uncounted"
              : "Awaiting human response"}
        </span>
      </div>
      <div className={styles.scoreControls}>
        <div className={styles.formField}>
          <label
            htmlFor={
              compactNumericScale
                ? `${criterion.id}-score-${criterion.minimum}`
                : `${criterion.id}-score`
            }
          >
            {criterionType(criterion) === "free_text" ? "Human response" : "Human score"}{" "}
            {criterionType(criterion) !== "free_text" ? (
              <span>
                ({criterion.minimum}–{criterion.maximum})
              </span>
            ) : null}
          </label>
          {criterionType(criterion) === "numeric" ? (
            compactNumericScale ? (
              <div
                className={styles.ratingChoices}
                role="radiogroup"
                aria-label={`${criterion.label} rating choices`}
              >
                {Array.from(
                  { length: criterion.maximum - criterion.minimum + 1 },
                  (_, index) => criterion.minimum + index,
                ).map((value) => (
                  <label className={styles.ratingChoice} key={value}>
                    <input
                      id={`${criterion.id}-score-${value}`}
                      ref={
                        value === criterion.minimum
                          ? (element) => {
                              criterionRefs.current[criterion.id] = element;
                            }
                          : undefined
                      }
                      type="radio"
                      name={`${criterion.id}-rating-choice`}
                      value={value}
                      checked={scoreValues[criterion.id] === String(value)}
                      disabled={reviewLocked}
                      onChange={() => changeScore(criterion.id, String(value))}
                      aria-invalid={validationMessage !== null}
                      aria-describedby={`${criterion.id}-description ${criterion.id}-score-help${validationMessage ? ` ${criterion.id}-error` : ""}`}
                    />
                    <span>{value}</span>
                  </label>
                ))}
              </div>
            ) : (
              <input
                id={`${criterion.id}-score`}
                ref={(element) => {
                  criterionRefs.current[criterion.id] = element;
                }}
                name={criterion.id}
                type="number"
                min={criterion.minimum}
                max={criterion.maximum}
                step={1}
                value={scoreValues[criterion.id] ?? ""}
                disabled={reviewLocked}
                onChange={(event) => changeScore(criterion.id, event.currentTarget.value)}
                required={criterion.required}
                aria-invalid={validationMessage !== null}
                aria-describedby={`${criterion.id}-description ${criterion.id}-score-help${validationMessage ? ` ${criterion.id}-error` : ""}`}
              />
            )
          ) : criterionType(criterion) === "dropdown" ? (
            <select
              id={`${criterion.id}-score`}
              ref={(element) => {
                criterionRefs.current[criterion.id] = element;
              }}
              name={criterion.id}
              value={scoreValues[criterion.id] ?? ""}
              disabled={reviewLocked}
              onChange={(event) => changeScore(criterion.id, event.currentTarget.value)}
              required={criterion.required}
              aria-invalid={validationMessage !== null}
              aria-describedby={`${criterion.id}-description ${criterion.id}-score-help${validationMessage ? ` ${criterion.id}-error` : ""}`}
            >
              <option value="">Choose an option</option>
              {(criterion.options ?? []).map((option) => (
                <option value={option.value} key={option.id ?? option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <textarea
              id={`${criterion.id}-score`}
              ref={(element) => {
                criterionRefs.current[criterion.id] = element;
              }}
              name={criterion.id}
              value={responseValues[criterion.id] ?? ""}
              disabled={reviewLocked}
              onChange={(event) => changeResponse(criterion.id, event.currentTarget.value)}
              required={criterion.required}
              rows={4}
              aria-invalid={validationMessage !== null}
              aria-describedby={`${criterion.id}-description ${criterion.id}-score-help${validationMessage ? ` ${criterion.id}-error` : ""}`}
            />
          )}
          <p className={styles.fieldHint} id={`${criterion.id}-score-help`}>
            {criterionType(criterion) === "free_text"
              ? "Written responses are stored with this scorecard criterion."
              : criterionType(criterion) === "dropdown"
                ? "Choose one of the configured scorecard options."
                : compactNumericScale
                  ? `Choose one score from ${criterion.minimum} through ${criterion.maximum}.`
                  : `Enter a whole number from ${criterion.minimum} through ${criterion.maximum}.`}
          </p>
          {validationMessage ? (
            <p className={styles.formError} id={`${criterion.id}-error`} role="alert">
              {validationMessage}
            </p>
          ) : null}
        </div>
        {suggestion ? (
          <EvaluatorSuggestionCard
            controller={controller}
            criterion={criterion}
            suggestion={suggestion}
            suggestionRecord={suggestionRecord}
          />
        ) : null}
      </div>
    </fieldset>
  );
}
