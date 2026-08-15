"use client";
import { Button } from "../../../components/ui/button";
import styles from "../review-workspace.module.css";
import type { ApiPlan } from "./api-api-plan";
import { dateTimeLocalValue } from "./model-date-time-local-value";
import { isoDateTimeValue } from "./model-iso-date-time-value";
import type { OrganizerAuthoringController } from "./organizer-authoring-controller";
import { OrganizerCriterionEditor } from "./organizer-authoring-criterion-editor";
import { OrganizerRoundTargeting } from "./organizer-authoring-round-targeting";
export function OrganizerRoundEditor({
  controller,
  round,
  roundIndex,
}: Readonly<{
  controller: OrganizerAuthoringController;
  round: ApiPlan["rounds"][number];
  roundIndex: number;
}>) {
  const { busy, status, updateRound, addCriterion } = controller;
  return (
    <fieldset
      className={`${styles.scoreCard} ${styles.authoringRoundCard}`}
      data-authoring-round=""
      key={round.id}
    >
      <legend>
        <span>Round {roundIndex + 1}</span>
        <strong>{round.name}</strong>
      </legend>
      <div className={styles.formField}>
        <label htmlFor={`${round.id}-name`}>Round name</label>
        <input
          id={`${round.id}-name`}
          value={round.name}
          onChange={(event) => {
            const nextName = event.currentTarget.value;
            updateRound(roundIndex, (current) => ({
              ...current,
              name: nextName,
            }));
          }}
        />
      </div>
      <div className={styles.formField}>
        <label htmlFor={`${round.id}-rubric`}>Rubric name</label>
        <input
          id={`${round.id}-rubric`}
          value={round.rubric.name}
          onChange={(event) => {
            const nextRubricName = event.currentTarget.value;
            updateRound(roundIndex, (current) => ({
              ...current,
              rubric: {
                ...current.rubric,
                name: nextRubricName,
              },
            }));
          }}
        />
      </div>
      <div className={styles.formField}>
        <label htmlFor={`${round.id}-closes-at`}>Round closes</label>
        <input
          id={`${round.id}-closes-at`}
          type="datetime-local"
          value={dateTimeLocalValue(round.closesAt)}
          onChange={(event) => {
            const nextClosesAt = isoDateTimeValue(event.currentTarget.value);
            updateRound(roundIndex, (current) => ({
              ...current,
              closesAt: nextClosesAt,
            }));
          }}
        />
      </div>
      <div className={styles.authoringScheduleGrid}>
        <div className={styles.formField}>
          <label htmlFor={`${round.id}-opens-at`}>Round opens</label>
          <input
            id={`${round.id}-opens-at`}
            type="datetime-local"
            value={dateTimeLocalValue(round.opensAt)}
            onChange={(event) => {
              const nextOpensAt = isoDateTimeValue(event.currentTarget.value);
              updateRound(roundIndex, (current) => ({
                ...current,
                opensAt: nextOpensAt,
              }));
            }}
          />
        </div>
        <div className={styles.formField}>
          <label htmlFor={`${round.id}-anonymization`}>Anonymization / blind review</label>
          <select
            id={`${round.id}-anonymization`}
            value={round.anonymization ?? (round.blindReview ? "double" : "none")}
            onChange={(event) => {
              const nextAnonymization = event.currentTarget.value as "none" | "single" | "double";
              updateRound(roundIndex, (current) => ({
                ...current,
                anonymization: nextAnonymization,
                blindReview: nextAnonymization !== "none",
              }));
            }}
          >
            <option value="none">No anonymization</option>
            <option value="single">Single-blind</option>
            <option value="double">Double-blind</option>
          </select>
        </div>
      </div>
      <OrganizerRoundTargeting controller={controller} round={round} roundIndex={roundIndex} />
      <section className={styles.criteriaList} aria-label={`${round.name} criteria authoring`}>
        {round.rubric.criteria.map((criterion, criterionIndex) => (
          <OrganizerCriterionEditor
            key={criterion.id}
            controller={controller}
            round={round}
            roundIndex={roundIndex}
            criterion={criterion}
            criterionIndex={criterionIndex}
          />
        ))}
      </section>
      <Button
        type="button"
        variant="outline"
        onClick={() => addCriterion(roundIndex)}
        disabled={busy || status !== "draft"}
      >
        Add criterion
      </Button>
    </fieldset>
  );
}
