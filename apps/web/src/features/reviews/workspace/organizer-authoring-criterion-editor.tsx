"use client";
import { Button } from "../../../components/ui/button";
import { Checkbox } from "../../../components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldLabel } from "../../../components/ui/field";
import styles from "../review-workspace.module.css";
import type { ApiPlan } from "./api-api-plan";
import { criterionType } from "./model-criterion-type";
import { parseNumericAuthoringValue } from "./model-parse-numeric-authoring-value";
import type { OrganizerAuthoringController } from "./organizer-authoring-controller";
import type { CriterionInputType } from "./scorecard-criterion-input-type";
import type { RubricCriterion } from "./scorecard-rubric-criterion";

export function OrganizerCriterionEditor({
  controller,
  round,
  roundIndex,
  criterion,
  criterionIndex,
}: Readonly<{
  controller: OrganizerAuthoringController;
  round: ApiPlan["rounds"][number];
  roundIndex: number;
  criterion: RubricCriterion;
  criterionIndex: number;
}>) {
  const { busy, status, updateCriterion, removeCriterion } = controller;
  return (
    <fieldset className={styles.criterionEditor} key={criterion.id}>
      <legend>
        Criterion {criterionIndex + 1}: {criterion.label || "Untitled criterion"}
      </legend>
      <div className={styles.criterionEditorGrid}>
        <div className={styles.formField}>
          <label htmlFor={`${round.id}-criterion-${criterionIndex}-label`}>Label</label>
          <input
            id={`${round.id}-criterion-${criterionIndex}-label`}
            aria-label={`${round.name} criterion ${criterionIndex + 1} label`}
            value={criterion.label}
            onChange={(event) => {
              const nextLabel = event.currentTarget.value;
              updateCriterion(roundIndex, criterionIndex, (current) => ({
                ...current,
                label: nextLabel,
              }));
            }}
          />
        </div>
        <div className={styles.formField}>
          <label htmlFor={`${round.id}-criterion-${criterionIndex}-type`}>Input type</label>
          <select
            id={`${round.id}-criterion-${criterionIndex}-type`}
            aria-label={`${criterion.label} input type`}
            value={criterionType(criterion)}
            onChange={(event) => {
              const nextType = event.currentTarget.value as CriterionInputType;
              updateCriterion(roundIndex, criterionIndex, (current) => ({
                ...current,
                inputType: nextType,
                ...(nextType === "dropdown" ? {} : { options: undefined }),
              }));
            }}
          >
            <option value="numeric">Numeric rating</option>
            <option value="dropdown">Dropdown</option>
            <option value="free_text">Free text</option>
          </select>
        </div>
        {criterionType(criterion) === "dropdown" ? (
          <div className={styles.formField}>
            <label htmlFor={`${round.id}-criterion-${criterionIndex}-options`}>
              Dropdown options
            </label>
            <input
              id={`${round.id}-criterion-${criterionIndex}-options`}
              aria-label={`${criterion.label} dropdown options`}
              value={(criterion.options ?? []).map((option) => option.label).join(", ")}
              onChange={(event) => {
                const nextOptionLabels = event.currentTarget.value
                  .split(",")
                  .map((value) => value.trim())
                  .filter((value) => value.length > 0);
                updateCriterion(roundIndex, criterionIndex, (current) => ({
                  ...current,
                  options: nextOptionLabels.map((value, index) => ({
                    id: `${current.id}-option-${index + 1}`,
                    label: value,
                    value,
                  })),
                }));
              }}
              placeholder="Accept, Maybe, Reject"
            />
          </div>
        ) : null}
        <div className={styles.formField}>
          <label htmlFor={`${round.id}-criterion-${criterionIndex}-description`}>Description</label>
          <textarea
            id={`${round.id}-criterion-${criterionIndex}-description`}
            aria-label={`${criterion.label} description`}
            value={criterion.description}
            onChange={(event) => {
              const nextDescription = event.currentTarget.value;
              updateCriterion(roundIndex, criterionIndex, (current) => ({
                ...current,
                description: nextDescription,
              }));
            }}
            rows={3}
          />
        </div>
        <div className={styles.criterionBounds}>
          <div className={styles.formField}>
            <label htmlFor={`${round.id}-criterion-${criterionIndex}-minimum`}>Minimum</label>
            <input
              id={`${round.id}-criterion-${criterionIndex}-minimum`}
              aria-label={`${criterion.label} minimum`}
              type="number"
              value={criterion.minimum}
              onChange={(event) => {
                const nextMinimum = event.currentTarget.value;
                updateCriterion(roundIndex, criterionIndex, (current) => ({
                  ...current,
                  minimum: parseNumericAuthoringValue(current.minimum, nextMinimum),
                }));
              }}
            />
          </div>
          <div className={styles.formField}>
            <label htmlFor={`${round.id}-criterion-${criterionIndex}-maximum`}>Maximum</label>
            <input
              id={`${round.id}-criterion-${criterionIndex}-maximum`}
              aria-label={`${criterion.label} maximum`}
              type="number"
              value={criterion.maximum}
              onChange={(event) => {
                const nextMaximum = event.currentTarget.value;
                updateCriterion(roundIndex, criterionIndex, (current) => ({
                  ...current,
                  maximum: parseNumericAuthoringValue(current.maximum, nextMaximum),
                }));
              }}
            />
          </div>
          <div className={styles.formField}>
            <label htmlFor={`${round.id}-criterion-${criterionIndex}-weight`}>Weight</label>
            <input
              id={`${round.id}-criterion-${criterionIndex}-weight`}
              aria-label={`${criterion.label} weight`}
              type="number"
              min={0.01}
              step={0.01}
              value={criterion.weight}
              onChange={(event) => {
                const nextWeight = event.currentTarget.value;
                updateCriterion(roundIndex, criterionIndex, (current) => ({
                  ...current,
                  weight: parseNumericAuthoringValue(current.weight, nextWeight),
                }));
              }}
            />
          </div>
        </div>
        <Field orientation="horizontal" className={styles.checkboxField}>
          <Checkbox
            id={`${round.id}-criterion-${criterionIndex}-required`}
            aria-label={`${criterion.label} required`}
            checked={criterion.required}
            onCheckedChange={(checked) => {
              const nextRequired = checked === true;
              updateCriterion(roundIndex, criterionIndex, (current) => ({
                ...current,
                required: nextRequired,
              }));
            }}
          />
          <FieldContent>
            <FieldLabel htmlFor={`${round.id}-criterion-${criterionIndex}-required`}>
              Required criterion
            </FieldLabel>
            <FieldDescription>Reviewers must complete this criterion.</FieldDescription>
          </FieldContent>
        </Field>
      </div>
      {round.rubric.criteria.length > 1 ? (
        <Button
          type="button"
          variant="destructive"
          onClick={() => removeCriterion(roundIndex, criterionIndex)}
          disabled={busy || status !== "draft"}
        >
          Remove criterion
        </Button>
      ) : null}
    </fieldset>
  );
}
