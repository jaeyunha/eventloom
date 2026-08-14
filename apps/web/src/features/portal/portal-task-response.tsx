"use client";

import { type SyntheticEvent, useEffect, useMemo, useState } from "react";
import styles from "./portal.module.css";
import { usePortal } from "./portal-provider";
import { PortalTaskResponseField } from "./portal-task-response-field";
import type {
  PortalFormAnswer,
  PortalFormField,
  PortalTask,
  PortalTaskForm,
  PortalTaskResponseEnvelope,
} from "./types";

function answerIsMissing(field: PortalFormField, answer: PortalFormAnswer | undefined): boolean {
  if (!field.required) return false;
  if (answer === null || answer === undefined) return true;
  if (typeof answer === "string") return answer.trim().length === 0;
  if (Array.isArray(answer)) return answer.length === 0;
  if (field.type === "checkbox" || field.type === "boolean") return answer !== true;
  return false;
}

function initialAnswers(
  form: PortalTaskForm,
  response: PortalTaskResponseEnvelope | null | undefined,
): Readonly<Record<string, PortalFormAnswer>> {
  const latest = response?.latestResponse ?? form.latestResponse;
  return Object.fromEntries(
    form.fields.map((field) => [field.id, latest?.answers[field.id] ?? null]),
  );
}

export function PortalTaskResponseEditor({ task }: Readonly<{ task: PortalTask }>) {
  const {
    busyTaskIds,
    clearMutationError,
    loadTaskForm,
    loadTaskResponse,
    saveTaskResponse,
    workspace,
  } = usePortal();
  const form = workspace.taskForms[task.id];
  const response = workspace.taskResponses[task.id];
  const history = workspace.taskResponseHistories[task.id] ?? [];
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Readonly<Record<string, PortalFormAnswer>>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
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
    if (form === undefined || form === null) return;
    setAnswers(initialAnswers(form, response));
  }, [form, response]);

  const requiredError = useMemo(() => {
    if (form === undefined || form === null) return null;
    const missing = form.fields.find((field) => answerIsMissing(field, answers[field.id]));
    return missing === undefined ? null : `${missing.label} is required.`;
  }, [answers, form]);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMutationError();
    setSaved(false);
    if (form === undefined || form === null) return;
    if (requiredError !== null) {
      setError(requiredError);
      return;
    }
    setError(null);
    const succeeded = await saveTaskResponse({
      taskId: task.id,
      definitionVersion: form.definitionVersion,
      answers,
      expectedVersion: history.length,
    });
    setSaved(succeeded);
  }

  if (loading || form === undefined) {
    return (
      <p className={styles.toolbarDescription} role="status">
        Loading response…
      </p>
    );
  }

  if (form === null) {
    return (
      <p className={styles.blockedNotice}>This form is not available in the active context.</p>
    );
  }

  return (
    <section className={styles.responseSection} aria-label={`${form.title} response`}>
      <form className={styles.responseForm} onSubmit={(event) => void submit(event)} noValidate>
        {form.fields.map((field) => (
          <PortalTaskResponseField
            key={field.id}
            field={field}
            answer={answers[field.id]}
            busy={busy}
            onChange={(answer) => {
              setError(null);
              setSaved(false);
              setAnswers((current) => ({ ...current, [field.id]: answer }));
            }}
          />
        ))}
        {error !== null ? (
          <p className={styles.fieldError} role="alert">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p className={styles.saveConfirmation} role="status">
            Your response was saved.
          </p>
        ) : null}
        <button className={styles.primaryButton} type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save response"}
        </button>
      </form>
      <details className={styles.responseHistory}>
        <summary>Response history</summary>
        <ol>
          {history.map((entry, index) => (
            <li key={entry.responseId}>
              Version {index + 1} - {entry.status.replace("_", " ")}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
