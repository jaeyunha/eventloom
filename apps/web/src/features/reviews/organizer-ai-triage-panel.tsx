"use client";

import { useState } from "react";
import { Bot, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  OrganizerAiTriageCandidate,
  OrganizerAiTriageSuggestion,
  OrganizerAiTriageView,
} from "./organizer-ai-triage";
import styles from "./organizer-review-overview.module.css";

interface TriageCriterion {
  readonly criterionId: string;
  readonly candidate: OrganizerAiTriageCandidate;
}

function criteriaFor(suggestion: OrganizerAiTriageSuggestion): readonly TriageCriterion[] {
  return Object.entries(suggestion.candidates).flatMap(([criterionId, candidates]) => {
    const candidate = candidates[0];
    return candidate === undefined ? [] : [{ criterionId, candidate }];
  });
}

function initialValues(
  suggestion: OrganizerAiTriageSuggestion,
  criteria: readonly TriageCriterion[],
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    criteria.map(({ criterionId, candidate }) => [
      criterionId,
      String(suggestion.override?.valueByCriterion[criterionId] ?? candidate.value),
    ]),
  );
}

export function OrganizerAiTriagePanel({
  submissionId,
  aiTriage,
}: Readonly<{
  submissionId: string;
  aiTriage: OrganizerAiTriageView;
}>) {
  const suggestion = aiTriage.suggestions[submissionId];
  const criteria = suggestion === undefined ? [] : criteriaFor(suggestion);
  const [values, setValues] = useState<Readonly<Record<string, string>>>(() =>
    suggestion === undefined ? {} : initialValues(suggestion, criteria),
  );
  const [reason, setReason] = useState(suggestion?.override?.reason ?? "");
  if (!aiTriage.enabled) return null;
  const busy = aiTriage.busySubmissionId === submissionId;

  if (suggestion === undefined) {
    return (
      <div className={styles.aiTriage}>
        <div>
          <strong>AI triage</strong>
          <span>Not generated</span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void aiTriage.onGenerate(submissionId, false)}
        >
          <Bot data-icon="inline-start" aria-hidden="true" />
          Generate
        </Button>
      </div>
    );
  }

  return (
    <section className={styles.aiTriage} data-ai-triage-status={suggestion.status}>
      <div className={styles.aiTriageHeading}>
        <div>
          <strong>AI triage</strong>
          <span>{suggestion.status}</span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void aiTriage.onGenerate(submissionId, true)}
        >
          <RefreshCw data-icon="inline-start" aria-hidden="true" />
          Regenerate
        </Button>
      </div>
      <details className={styles.aiTriageDetails}>
        <summary>Rationale and provenance</summary>
        <dl>
          {criteria.map(({ criterionId, candidate }) => (
            <div key={criterionId}>
              <dt>{aiTriage.criterionLabels[criterionId] ?? criterionId}</dt>
              <dd>{candidate.evidence.join(" ")}</dd>
            </div>
          ))}
        </dl>
        <p>
          {suggestion.provenance.provider} · {suggestion.provenance.model} ·{" "}
          {new Date(suggestion.provenance.generatedAt).toLocaleString()}
        </p>
      </details>
      <form
        className={styles.aiTriageOverride}
        onSubmit={(event) => {
          event.preventDefault();
          void aiTriage.onOverride(
            suggestion.id,
            suggestion.version,
            Object.fromEntries(
              criteria.map(({ criterionId }) => [criterionId, Number(values[criterionId])]),
            ),
            reason,
          );
        }}
      >
        {criteria.map(({ criterionId, candidate }) => (
          <label htmlFor={`${suggestion.id}-${criterionId}-override`} key={criterionId}>
            <span>{aiTriage.criterionLabels[criterionId] ?? criterionId}</span>
            <Input
              id={`${suggestion.id}-${criterionId}-override`}
              type="number"
              required
              value={values[criterionId] ?? String(candidate.value)}
              onChange={(event) =>
                setValues((current) => ({ ...current, [criterionId]: event.currentTarget.value }))
              }
              aria-label={`Override ${aiTriage.criterionLabels[criterionId] ?? criterionId}`}
            />
          </label>
        ))}
        <label htmlFor={`${suggestion.id}-override-reason`}>
          <span>Override reason (optional)</span>
          <Input
            id={`${suggestion.id}-override-reason`}
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
          />
        </label>
        <Button type="submit" size="sm" disabled={busy}>
          Save override
        </Button>
      </form>
      {aiTriage.error === null ? null : <p className={styles.aiTriageError}>{aiTriage.error}</p>}
      <Badge variant="outline">
        {suggestion.override === null || suggestion.override === undefined
          ? "AI proposal"
          : "Override saved"}
      </Badge>
    </section>
  );
}
