"use client";

import { type SyntheticEvent, useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui";
import { WorkspaceActionBar, WorkspaceFormSection } from "../../components/workspace";
import { usePortal } from "./portal-provider";
import styles from "./portal-task-form.module.css";
import { PortalTaskResponseField } from "./portal-task-response-field";
import type {
  PortalFormAnswer,
  PortalFormField,
  PortalTask,
  PortalTaskForm,
  PortalTaskResponse,
  PortalTaskResponseEnvelope,
} from "./types";

export type ResponseFieldErrors = Readonly<Record<string, string>>;

function missing(field: PortalFormField, answer: PortalFormAnswer | undefined): boolean {
  if (!field.required) return false;
  if (answer == null) return true;
  if (typeof answer === "string") return answer.trim() === "";
  if (Array.isArray(answer)) return answer.length === 0;
  return (field.type === "checkbox" || field.type === "boolean") && answer !== true;
}

export function responseFieldErrors(
  fields: readonly PortalFormField[],
  answers: Readonly<Record<string, PortalFormAnswer>>,
): ResponseFieldErrors {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const answer = answers[field.id];
    if (missing(field, answer)) {
      errors[field.id] = `${field.label} is required.`;
    } else if (
      field.type === "email" &&
      typeof answer === "string" &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answer)
    ) {
      errors[field.id] = "Enter a valid email address.";
    } else if (field.type === "url" && typeof answer === "string" && answer.trim()) {
      try {
        const url = new URL(answer);
        if (!["http:", "https:"].includes(url.protocol)) throw new Error("protocol");
      } catch {
        errors[field.id] = "Enter a valid HTTP or HTTPS URL.";
      }
    } else if (field.type === "number" && typeof answer === "number" && !Number.isFinite(answer)) {
      errors[field.id] = "Enter a valid number.";
    }
  }
  return errors;
}

export function firstInvalidFieldId(
  fields: readonly PortalFormField[],
  errors: ResponseFieldErrors,
): string | null {
  return fields.find((field) => errors[field.id] !== undefined)?.id ?? null;
}

export function returnedOrganizerFeedback(
  response: PortalTaskResponse | null | undefined,
): string | null {
  return response?.organizerFeedback && ["needs_changes", "reopened"].includes(response.status)
    ? response.organizerFeedback
    : null;
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
