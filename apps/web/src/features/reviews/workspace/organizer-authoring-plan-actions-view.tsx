"use client";
import { TemporalPicker } from "@/components/ui/temporal-picker";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import styles from "../review-workspace.module.css";
import { authoringDateLabel } from "./model-authoring-date-label";
import { dateTimeLocalValue } from "./model-date-time-local-value";
import { isoDateTimeValue } from "./model-iso-date-time-value";
import type { OrganizerAuthoringController } from "./organizer-authoring-controller";

export function OrganizerPlanActionsView({
  controller,
}: Readonly<{ controller: OrganizerAuthoringController }>) {
  const {
    name,
    status,
    planStatusLabel,
    version,
    rounds,
    criterionCount,
    planClosesAt,
    setPlanClosesAt,
    busy,
    isDraft,
    saveSchedule,
    saveDraft,
    transition,
    reviseToDraft,
  } = controller;
  return (
    <aside className={styles.authoringAside} aria-label="Plan authoring summary">
      <div className={styles.authoringAsideInner}>
        <div>
          <p className={styles.sectionEyebrow}>Plan status</p>
          <h3>{name}</h3>
        </div>
        <div className={styles.authoringAsideStatus}>
          <Badge variant={status === "open" ? "default" : "outline"}>{planStatusLabel}</Badge>
          <span className={styles.authoringVersion}>Version {version}</span>
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
            <dd>{authoringDateLabel(planClosesAt)}</dd>
          </div>
        </dl>
        {status === "open" ? (
          <div className={styles.authoringDeadlineEditor}>
            <TemporalPicker
              id="evaluation-plan-closes-at"
              mode="single"
              precision="date-time"
              value={dateTimeLocalValue(planClosesAt)}
              label="Overall review deadline"
              eyebrow="Plan schedule"
              description="Update the deadline without exposing browser-native date controls."
              clearable
              disabled={busy}
              onChange={(value) => setPlanClosesAt(isoDateTimeValue(value) ?? "")}
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
