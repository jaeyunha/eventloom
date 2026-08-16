"use client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TemporalPicker } from "@/components/ui/temporal-picker";
import { Button } from "../../../components/ui/button";
import styles from "../review-workspace.module.css";
import { parseNumericAuthoringValue } from "./model-parse-numeric-authoring-value";
import type { OrganizerAuthoringController } from "./organizer-authoring-controller";
import { OrganizerRoundEditor } from "./organizer-authoring-round-editor";
import {
  reviewExtendsPastEventStart,
  reviewLocalValue,
  reviewPlanClosesAtField,
  reviewTemporalConstraints,
} from "./review-temporal-policy";
export function OrganizerDraftPlan({
  controller,
}: Readonly<{ controller: OrganizerAuthoringController }>) {
  const {
    name,
    setName,
    planClosesAt,
    setPlanClosesAt,
    setTemporalFieldValidity,
    reviewsPerSubmission,
    setReviewsPerSubmission,
    maxAssignmentsPerReviewer,
    setMaxAssignmentsPerReviewer,
    rounds,
    addRound,
    busy,
    status,
  } = controller;
  const { eventTimeZone, eventStartsAt, eventEndsAt } = controller.seed;
  const constraints =
    eventTimeZone === undefined || eventStartsAt === undefined || eventEndsAt === undefined
      ? undefined
      : reviewTemporalConstraints({
          timeZone: eventTimeZone,
          startsAt: eventStartsAt,
          endsAt: eventEndsAt,
        });
  const extendsPastEventStart =
    eventStartsAt !== undefined &&
    reviewExtendsPastEventStart(
      [planClosesAt, ...rounds.flatMap((round) => [round.opensAt, round.closesAt])],
      eventStartsAt,
    );
  return (
    <>
      <section className={styles.authoringPanel} aria-labelledby="plan-basics-heading">
        <div className={styles.authoringPanelHeader}>
          <div>
            <p className={styles.sectionEyebrow}>Plan</p>
            <h3 id="plan-basics-heading">Plan basics</h3>
          </div>
          <span className={styles.authoringPanelMeta}>Editable draft</span>
        </div>
        {extendsPastEventStart ? (
          <Alert data-review-after-event-start="">
            <AlertTitle>Review continues after the event begins</AlertTitle>
            <AlertDescription>
              This is allowed for recurring and multi-week events. All review dates must still
              finish before the event ends.
            </AlertDescription>
          </Alert>
        ) : null}
        <div className={styles.authoringBasicsGrid}>
          <div className={styles.formField}>
            <label htmlFor="evaluation-plan-name">Plan name</label>
            <input
              id="evaluation-plan-name"
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
            />
          </div>
          <div className={styles.authoringDatePicker}>
            <TemporalPicker
              id="evaluation-plan-closes-at"
              mode="single"
              precision="date-time"
              value={planClosesAt}
              valueTimeZone={eventTimeZone}
              label="Overall review deadline"
              eyebrow="Plan schedule"
              description="Choose the final deadline reviewers should work toward."
              minimumDateTime={constraints?.minimum}
              maximumDateTime={constraints?.maximum}
              unchangedValues={
                eventTimeZone === undefined || controller.seed.closesAt === ""
                  ? undefined
                  : [reviewLocalValue(controller.seed.closesAt, eventTimeZone)]
              }
              clearable
              onChange={setPlanClosesAt}
              onValidityChange={(isValid) =>
                setTemporalFieldValidity(reviewPlanClosesAtField, isValid)
              }
            />
          </div>
          <div className={styles.formField}>
            <label htmlFor="evaluation-plan-reviews-per-submission">Reviews per submission</label>
            <input
              id="evaluation-plan-reviews-per-submission"
              type="number"
              min={1}
              step={1}
              value={reviewsPerSubmission}
              onChange={(event) =>
                setReviewsPerSubmission(
                  parseNumericAuthoringValue(reviewsPerSubmission, event.currentTarget.value),
                )
              }
            />
          </div>
          <div className={styles.formField}>
            <label htmlFor="evaluation-plan-max-assignments-per-reviewer">
              Maximum assignments per reviewer
            </label>
            <input
              id="evaluation-plan-max-assignments-per-reviewer"
              type="number"
              min={1}
              step={1}
              value={maxAssignmentsPerReviewer}
              onChange={(event) =>
                setMaxAssignmentsPerReviewer(
                  parseNumericAuthoringValue(maxAssignmentsPerReviewer, event.currentTarget.value),
                )
              }
            />
          </div>
        </div>
      </section>
      <section className={styles.authoringRounds} aria-labelledby="review-rounds-heading">
        <div className={styles.authoringPanelHeader}>
          <div>
            <p className={styles.sectionEyebrow}>Workflow</p>
            <h3 id="review-rounds-heading">Review rounds</h3>
            <p className={styles.authoringPanelDescription}>
              Set the schedule and grading model for each stage of review.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={addRound}
            disabled={busy || status !== "draft"}
          >
            Add round
          </Button>
        </div>
        <div className={styles.scoreList}>
          {rounds.map((round, roundIndex) => (
            <OrganizerRoundEditor
              key={round.id}
              controller={controller}
              round={round}
              roundIndex={roundIndex}
            />
          ))}
        </div>
      </section>
    </>
  );
}
