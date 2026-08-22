"use client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TemporalPicker } from "@/components/ui/temporal-picker";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import styles from "../review-workspace.module.css";
import { authoringDateLabel } from "./model-authoring-date-label";
import type { OrganizerAuthoringController } from "./organizer-authoring-controller";
import {
  reviewExtendsPastEventStart,
  reviewLocalValue,
  reviewPlanClosesAtField,
  reviewTemporalConstraints,
} from "./review-temporal-policy";

export function OrganizerPlanActionsView({
  controller,
}: Readonly<{ controller: OrganizerAuthoringController }>) {
  const {
    name,
    status,
    planStatusLabel,
    rounds,
    criterionCount,
    planClosesAt,
    setPlanClosesAt,
    setTemporalFieldValidity,
    busy,
    isDraft,
    saveSchedule,
    saveDraft,
    transition,
    reviseToDraft,
  } = controller;
  const { eventTimeZone, eventStartsAt, eventEndsAt, sourceClosesAt } = controller.seed;
  const unchangedPlanClosesAt =
    eventTimeZone === undefined || typeof sourceClosesAt !== "string" || sourceClosesAt === ""
      ? undefined
      : [reviewLocalValue(sourceClosesAt, eventTimeZone)];
  const constraints =
    eventTimeZone === undefined || eventStartsAt === undefined || eventEndsAt === undefined
      ? undefined
      : reviewTemporalConstraints({
          timeZone: eventTimeZone,
          startsAt: eventStartsAt,
          endsAt: eventEndsAt,
        });
  return (
    <aside className={styles.authoringAside} aria-label="Plan authoring summary">
      <div className={styles.authoringAsideInner}>
        <div>
          <p className={styles.sectionEyebrow}>Plan status</p>
          <h3>{name}</h3>
        </div>
        <div className={styles.authoringAsideStatus}>
          <Badge variant={status === "open" ? "default" : "outline"}>{planStatusLabel}</Badge>
        </div>
        <dl className={styles.authoringAsideMetrics}>
          <div>
            <dt>Rounds</dt>
            <dd>{rounds.length}</dd>
          </div>
          <div>
            <dt>Criteria</dt>
            <dd>{criterionCount}</dd>
          </div>
          <div>
            <dt>Review deadline</dt>
            <dd>{authoringDateLabel(planClosesAt, eventTimeZone)}</dd>
          </div>
        </dl>
        {status === "open" ? (
          <div className={styles.authoringDeadlineEditor}>
            {eventStartsAt !== undefined &&
            reviewExtendsPastEventStart([planClosesAt], eventStartsAt) ? (
              <Alert data-review-after-event-start="">
                <AlertTitle>Review continues after the event begins</AlertTitle>
                <AlertDescription>
                  This is allowed, but the deadline cannot exceed the event end.
                </AlertDescription>
              </Alert>
            ) : null}
            <TemporalPicker
              id="evaluation-plan-closes-at"
              mode="single"
              precision="date-time"
              value={planClosesAt}
              valueTimeZone={eventTimeZone}
              label="Overall review deadline"
              eyebrow="Plan schedule"
              description="Update the deadline without exposing browser-native date controls."
              minimumDateTime={constraints?.minimum}
              maximumDateTime={constraints?.maximum}
              unchangedValues={unchangedPlanClosesAt}
              clearable
              disabled={busy}
              onChange={setPlanClosesAt}
              onValidityChange={(isValid) =>
                setTemporalFieldValidity(reviewPlanClosesAtField, isValid)
              }
            />
            <Button type="button" onClick={() => void saveSchedule()} disabled={busy}>
              {busy ? "Saving…" : "Update review deadline"}
            </Button>
          </div>
        ) : null}
        <fieldset className={styles.authoringAsideActions}>
          <legend className={styles.srOnly}>Plan lifecycle actions</legend>
          {isDraft ? (
            <>
              <Button type="button" onClick={() => void saveDraft()} disabled={busy}>
                {busy ? "Saving…" : "Save authoring draft"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void transition("open")}
                disabled={busy}
              >
                Open plan for review
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant={status === "open" ? "outline" : "default"}
              onClick={() => void reviseToDraft()}
              disabled={busy}
            >
              Create editable draft revision
            </Button>
          )}
          {status === "open" ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => void transition("close")}
              disabled={busy}
            >
              Close plan
            </Button>
          ) : null}
          {status === "closed" ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void transition("open")}
              disabled={busy}
            >
              Reopen plan
            </Button>
          ) : null}
        </fieldset>
        <p className={styles.authoringAsideHint}>
          {isDraft
            ? "Save the draft before opening it for reviewers."
            : "Create a revision to change rounds, reviewer eligibility, or rubric criteria without rewriting review history."}
        </p>
      </div>
    </aside>
  );
}
