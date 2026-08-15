"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { Button } from "../../../components/ui/button";
import { useOrganizerEventWorkspace } from "../../admin/organizer-event-workspace";
import styles from ".././review-workspace.module.css";
import type { ApiPlan } from "./api-api-plan";
import { createEvaluationPlan } from "./organizer-create-evaluation-plan";
import { validateCreateEvaluationPlanForm } from "./organizer-validate-create-evaluation-plan-form";

export function OrganizerPlanCreation({
  eventId,
  baseUrl,
  onCreated,
}: Readonly<{
  eventId: string;
  baseUrl: string;
  onCreated: (plan: ApiPlan) => void;
}>) {
  const event = useOrganizerEventWorkspace();
  const eventName = event?.name ?? "Current event";
  const eventSlug = event?.slug;
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const input = {
      eventId,
      name,
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
      <header className={`${styles.workspaceHeader} ${styles.planCreationHeader}`}>
        <div>
          <p className={styles.eyebrow}>{eventName} · organizer</p>
          <h1>Create evaluation plan</h1>
        </div>
      </header>
      <section
        id="review-content"
        className={`${styles.section} ${styles.planCreationSection}`}
        aria-labelledby="create-plan-heading"
      >
        <div className={styles.planCreationContent}>
          <div className={styles.planCreationHeading}>
            <p className={styles.sectionEyebrow}>Organizer setup</p>
            <h2 id="create-plan-heading">Create the first evaluation plan</h2>
            <p className={styles.sectionIntro}>
              The draft starts with one editable round and a starter scorecard. Configure rounds,
              dates, blind review, and scorecard criteria in Setup. Review teams and assignments
              follow after the plan opens.
            </p>
          </div>

          <form
            className={styles.planCreationForm}
            onSubmit={(event) => void submit(event)}
            aria-describedby="create-plan-help"
          >
            <div className={styles.planCreationGroup}>
              <div className={styles.planCreationGroupHeading}>
                <h3>Plan basics</h3>
                <p>Name the plan and confirm its event.</p>
              </div>
              <div className={styles.planSettingRows}>
                <div className={styles.planSettingRow}>
                  <div className={styles.planSettingCopy}>
                    <label htmlFor="create-plan-name">Plan name</label>
                    <p id="create-plan-name-description">
                      A short internal name organizers will recognize.
                    </p>
                  </div>
                  <div className={styles.planSettingControl}>
                    <input
                      id="create-plan-name"
                      value={name}
                      onChange={(event) => setName(event.currentTarget.value)}
                      aria-describedby="create-plan-name-description"
                      autoComplete="off"
                      required
                    />
                  </div>
                </div>

                <div className={styles.planSettingRow}>
                  <div className={styles.planSettingCopy}>
                    <span className={styles.planSettingLabel}>Event</span>
                    <p>This plan applies only to this event workspace.</p>
                  </div>
                  <fieldset className={styles.planEventValue}>
                    <legend className="sr-only">Event</legend>
                    <strong>{eventName}</strong>
                    {eventSlug === undefined ? null : <span>/{eventSlug}</span>}
                  </fieldset>
                </div>
              </div>
            </div>

            <div className={styles.planCreationFooter}>
              <div>
                <p
                  className={`${styles.fieldHint} ${styles.planCreationHint}`}
                  id="create-plan-help"
                >
                  One editable round is created now. Complete its setup before opening the plan.
                </p>
                {message ? (
                  <p className={styles.formError} role="alert">
                    {message}
                  </p>
                ) : null}
              </div>
              <div className={styles.planCreationActions}>
                <Button type="submit" disabled={busy}>
                  {busy ? "Creating…" : "Create draft plan"}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
