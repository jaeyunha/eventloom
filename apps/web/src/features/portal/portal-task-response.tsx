"use client";

import { type SyntheticEvent, useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui";
import { WorkspaceActionBar, WorkspaceFormSection } from "../../components/workspace";
import { usePortal } from "./portal-provider";
import styles from "./portal-task-form.module.css";
import { PortalTaskResponseField } from "./portal-task-response-field";
import {
  firstInvalidFieldId,
  initialAnswers,
  responseFieldErrors,
  returnedOrganizerFeedback,
} from "./portal-task-response-model";
import type { ResponseFieldErrors } from "./portal-task-response-model";
import type { PortalFormAnswer, PortalTask } from "./types";

export function PortalTaskResponseEditor({ task }: Readonly<{ task: PortalTask }>) {
  const {
    busyTaskIds,
    clearMutationError,
    loadTaskForm,
    loadTaskResponse,
    saveTaskResponse,
    transitionTask,
    workspace,
  } = usePortal();
  const form = workspace.taskForms[task.id];
  const response = workspace.taskResponses[task.id];
  const history = workspace.taskResponseHistories[task.id] ?? [];
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Readonly<Record<string, PortalFormAnswer>>>({});
  const [errors, setErrors] = useState<ResponseFieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const busy = busyTaskIds.has(task.id);

  useEffect(() => {
    let active = true;
    void Promise.all([loadTaskForm(task.id), loadTaskResponse(task.id)]).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [loadTaskForm, loadTaskResponse, task.id]);

  useEffect(() => {
    if (form) setAnswers(initialAnswers(form, response));
  }, [form, response]);

  async function persist(submit: boolean) {
    clearMutationError();
    setNotice(null);
    if (!form) return;
    if (submit) {
      const nextErrors = responseFieldErrors(form.fields, answers);
      setErrors(nextErrors);
      const first = firstInvalidFieldId(form.fields, nextErrors);
      if (first) {
        refs.current[first]?.focus();
        return;
      }
    }
    const saved = await saveTaskResponse({
      taskId: task.id,
      definitionVersion: form.definitionVersion,
      answers,
      expectedVersion: history.length,
    });
    if (!saved) return;
    if (!submit) {
      setNotice("Draft saved. It has not been submitted to organizers.");
      return;
    }
    const submitted = await transitionTask(task, "submitted");
    if (submitted) setNotice("Response submitted to organizers.");
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    void persist(true);
  }

  if (loading || form === undefined)
    return (
      <p className={styles.loading} role="status">
        Loading response…
      </p>
    );
  if (form === null)
    return <p className={styles.unavailable}>This form is not available in the active context.</p>;

  const latest = response?.latestResponse ?? form.latestResponse;
  const feedback = returnedOrganizerFeedback(latest);
  return (
    <WorkspaceFormSection
      title={form.title}
      description={form.description || "Save a private draft, then submit the completed response."}
    >
      {feedback ? (
        <aside className={styles.feedback} aria-label="Organizer feedback">
          <strong>Returned by organizer</strong>
          <p>{feedback}</p>
        </aside>
      ) : null}
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {form.fields.map((field) => (
          <PortalTaskResponseField
            key={field.id}
            field={field}
            answer={answers[field.id]}
            busy={busy}
            {...(errors[field.id] === undefined ? {} : { error: errors[field.id] })}
            controlRef={(node) => {
              refs.current[field.id] = node;
            }}
            onChange={(answer) => {
              setNotice(null);
              setErrors((current) => {
                const next = { ...current };
                delete next[field.id];
                return next;
              });
              setAnswers((current) => ({ ...current, [field.id]: answer }));
            }}
          />
        ))}
        <WorkspaceActionBar
          summary={notice ?? "Draft changes stay private until you submit."}
          actions={
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void persist(false)}
              >
                {busy ? "Saving…" : "Save draft"}
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Submitting…" : "Submit response"}
              </Button>
            </>
          }
        />
      </form>
      {history.length > 0 ? (
        <details className={styles.history}>
          <summary>Response history</summary>
          <ol>
            {history.map((entry, index) => (
              <li key={entry.responseId}>
                Version {index + 1} · {entry.status.replace("_", " ")}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </WorkspaceFormSection>
  );
}
