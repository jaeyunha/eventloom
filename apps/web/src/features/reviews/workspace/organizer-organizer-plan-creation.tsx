"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { Button } from "../../../components/ui/button";
import { Checkbox } from "../../../components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldLabel } from "../../../components/ui/field";
import styles from ".././review-workspace.module.css";
import type { ApiPlan } from "./api-api-plan";
import { ReviewNavigation } from "./evaluator-queue-review-navigation";
import { parseNumericAuthoringValue } from "./model-parse-numeric-authoring-value";
import { createEvaluationPlan } from "./organizer-create-evaluation-plan";
import { validateCreateEvaluationPlanForm } from "./organizer-validate-create-evaluation-plan-form";

export function OrganizerPlanCreation({
  eventId,
  baseUrl,
  organizationId,
  onCreated,
}: Readonly<{
  eventId: string;
  organizationId?: string | undefined;
  baseUrl: string;
  onCreated: (plan: ApiPlan) => void;
}>) {
  const [name, setName] = useState("");
  const [roundCount, setRoundCount] = useState(1);
  const [firstRoundTitle, setFirstRoundTitle] = useState("Initial review");
  const [firstRubricTitle, setFirstRubricTitle] = useState("Evaluation rubric");
  const [firstCriterionTitle, setFirstCriterionTitle] = useState("Overall quality");
  const [blindReview, setBlindReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const input = {
      eventId,
      name,
      roundCount,
      firstRoundTitle,
      firstRubricTitle,
      firstCriterionTitle,
      blindReview,
    };
    const validationMessage = validateCreateEvaluationPlanForm(input);
    if (validationMessage !== null) {
      setMessage(validationMessage);
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const plan = await createEvaluationPlan(baseUrl, input);
      onCreated(plan);
    } catch (reason: unknown) {
      setMessage(
        reason instanceof Error ? reason.message : "The evaluation plan could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.workspace} id="review-workspace">
      <a className={styles.skipLink} href="#review-content">
        Skip to review workspace content
      </a>
      <header className={styles.workspaceHeader}>
        <div>
          <p className={styles.eyebrow}>{eventId} · organizer</p>
          <h1>Create evaluation plan</h1>
        </div>
        <ReviewNavigation eventId={eventId} mode="organizer" organizationId={organizationId} />
      </header>
      <section id="review-content" className={styles.section} aria-labelledby="create-plan-heading">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.sectionEyebrow}>Organizer setup</p>
            <h2 id="create-plan-heading">Create the first evaluation plan</h2>
          </div>
        </div>
        <p className={styles.sectionIntro}>
          Start with one or more rounds and a first rubric. You can add rounds, reviewer pools, and
          criteria after the plan is created.
        </p>
        <form onSubmit={(event) => void submit(event)} aria-describedby="create-plan-help">
          <div className={styles.summaryGrid}>
            <div className={styles.formField}>
              <label htmlFor="create-plan-name">Plan name</label>
              <input
                id="create-plan-name"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                autoComplete="off"
                required
              />
            </div>
            <div className={styles.formField}>
              <label htmlFor="create-plan-event-id">Event ID</label>
              <input id="create-plan-event-id" value={eventId} readOnly />
            </div>
            <div className={styles.formField}>
              <label htmlFor="create-plan-rounds">Rounds</label>
              <input
                id="create-plan-rounds"
                type="number"
                min={1}
                max={10}
                step={1}
                value={roundCount}
                onChange={(event) =>
                  setRoundCount(parseNumericAuthoringValue(roundCount, event.currentTarget.value))
                }
                required
              />
            </div>
            <Field orientation="horizontal" className={styles.checkboxField}>
              <Checkbox
                id="create-plan-blind-review"
                checked={blindReview}
                onCheckedChange={(checked) => setBlindReview(checked === true)}
              />
              <FieldContent>
                <FieldLabel htmlFor="create-plan-blind-review">Blind review</FieldLabel>
                <FieldDescription>Hide submitter identity from reviewers.</FieldDescription>
              </FieldContent>
            </Field>
          </div>
          <div className={styles.summaryGrid}>
            <div className={styles.formField}>
              <label htmlFor="create-plan-first-round">First round title</label>
              <input
                id="create-plan-first-round"
                value={firstRoundTitle}
                onChange={(event) => setFirstRoundTitle(event.currentTarget.value)}
                required
              />
            </div>
            <div className={styles.formField}>
              <label htmlFor="create-plan-first-rubric">First rubric title</label>
              <input
                id="create-plan-first-rubric"
                value={firstRubricTitle}
                onChange={(event) => setFirstRubricTitle(event.currentTarget.value)}
                required
              />
            </div>
            <div className={styles.formField}>
              <label htmlFor="create-plan-first-criterion">First criterion title</label>
              <input
                id="create-plan-first-criterion"
                value={firstCriterionTitle}
                onChange={(event) => setFirstCriterionTitle(event.currentTarget.value)}
                required
              />
            </div>
          </div>
          <p className={styles.fieldHint} id="create-plan-help">
            Event access comes from the organizer route. The first draft is ready for authoring
            after creation.
          </p>
          {message ? (
            <p className={styles.formError} role="alert">
              {message}
            </p>
          ) : null}
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create evaluation plan"}
          </Button>
        </form>
      </section>
    </div>
  );
}
