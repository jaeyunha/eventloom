"use client";

import { useRef, useState } from "react";
import { Checkbox } from "../../../components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldLabel } from "../../../components/ui/field";
import styles from ".././review-workspace.module.css";
import { evaluationRequest } from "./model-evaluation-request";
import { participantDisplayLabel } from "./model-participant-display-label";
import type { AggregateRow } from "./organizer-aggregate-row";
import type { DecisionStatus } from "./organizer-decision-status";

export function DecisionEditor({
  aggregate,
  baseUrl,
  planId,
  decision,
}: Readonly<{
  aggregate: AggregateRow;
  baseUrl: string;
  planId: string;
  decision:
    | {
        readonly status: DecisionStatus;
        readonly reason: string;
        readonly version: number;
      }
    | undefined;
}>) {
  const [status, setStatus] = useState<DecisionStatus | "">(decision?.status ?? "");
  const [reason, setReason] = useState(decision?.reason ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(decision !== undefined);
  const [busy, setBusy] = useState(false);

  const decisionVersionRef = useRef<number | undefined>(decision?.version);
  const participantNames = participantDisplayLabel(aggregate.participants);
  async function saveDecision(): Promise<void> {
    if (!status) {
      setError("Choose accept, waitlist, or reject before confirming.");
      return;
    }
    if (reason.trim().length === 0) {
      setError("Write a reason before confirming this decision.");
      return;
    }
    if (!confirmed) {
      setError("Confirm that a human organizer reviewed this outcome.");
      return;
    }
    setError(null);
    setBusy(true);
    const decisionKey = `web-${crypto.randomUUID()}`;
    try {
      const savedDecision = await evaluationRequest<{ version: number }>(
        baseUrl,
        `/plans/${encodeURIComponent(planId)}/submissions/${encodeURIComponent(aggregate.id)}/decision`,
        {
          method: "PUT",
          headers: { "idempotency-key": decisionKey },
          body: JSON.stringify({
            status,
            reason: reason.trim(),
            idempotencyKey: decisionKey,
            ...(decisionVersionRef.current === undefined
              ? {}
              : { expectedVersion: decisionVersionRef.current }),
          }),
        },
      );
      decisionVersionRef.current = savedDecision.version;
      setSaved(true);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "The decision could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={styles.decisionCard}>
      <div className={styles.decisionSummary}>
        <div>
          {participantNames ? <span className={styles.cardLabel}>{participantNames}</span> : null}
          <h3>{aggregate.title}</h3>
        </div>
        <span className={styles.scorePill}>
          {aggregate.countedScore} / {aggregate.possibleScore}
        </span>
      </div>
      <div className={styles.decisionForm}>
        <div className={styles.formField}>
          <label htmlFor={`${aggregate.id}-decision`}>Decision</label>
          <select
            id={`${aggregate.id}-decision`}
            value={status}
            onChange={(event) => {
              setStatus(event.currentTarget.value as DecisionStatus | "");
              setSaved(false);
            }}
            required
          >
            <option value="">Choose an outcome</option>
            <option value="accepted">Accept</option>
            <option value="waitlisted">Waitlist</option>
            <option value="rejected">Reject</option>
          </select>
        </div>
        <div className={styles.formField}>
          <label htmlFor={`${aggregate.id}-reason`}>
            Written reason <span>(required)</span>
          </label>
          <textarea
            id={`${aggregate.id}-reason`}
            value={reason}
            onChange={(event) => {
              setReason(event.currentTarget.value);
              setSaved(false);
            }}
            rows={3}
            required
            placeholder="Explain the human committee rationale."
          />
        </div>
        <Field orientation="horizontal" className={styles.checkboxField}>
          <Checkbox
            id={`${aggregate.id}-confirm`}
            checked={confirmed}
            onCheckedChange={(checked) => setConfirmed(checked === true)}
            required
          />
          <FieldContent>
            <FieldLabel htmlFor={`${aggregate.id}-confirm`}>
              I confirm this is a human organizer decision, not an AI decision.
            </FieldLabel>
            <FieldDescription>This confirmation is required before saving.</FieldDescription>
          </FieldContent>
        </Field>
        {error ? (
          <p className={styles.formError} role="alert">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p className={styles.submittedMessage} role="status">
            Decision saved. Submitter notification queued.
          </p>
        ) : null}
        <button
          className={styles.primaryButton}
          type="button"
          onClick={() => void saveDecision()}
          disabled={busy}
        >
          {busy ? "Saving…" : "Confirm human decision"}
        </button>
      </div>
    </article>
  );
}
