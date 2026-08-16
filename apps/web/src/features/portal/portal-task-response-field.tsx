"use client";

import type { Ref } from "react";
import { Field, FieldDescription, FieldError, FieldLabel } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import styles from "./portal-task-form.module.css";
import type { PortalFormAnswer, PortalFormField } from "./types";

function inputType(field: PortalFormField): "date" | "email" | "number" | "text" | "url" {
  return ["date", "email", "number", "url"].includes(field.type)
    ? (field.type as "date" | "email" | "number" | "url")
    : "text";
}

interface Props {
  readonly field: PortalFormField;
  readonly answer: PortalFormAnswer | undefined;
  readonly busy: boolean;
  readonly error?: string;
  readonly controlRef?: Ref<HTMLElement>;
  readonly onChange: (answer: PortalFormAnswer) => void;
}

export function PortalTaskResponseField({
  field,
  answer,
  busy,
  error,
  controlRef,
  onChange,
}: Props) {
  const id = `task-field-${field.id}`;
  const errorId = `${id}-error`;
  const invalid = error !== undefined;
  const aria = {
    "aria-invalid": invalid || undefined,
    "aria-describedby": invalid ? errorId : undefined,
  } as const;
  const label = (
    <>
      {field.label}
      {field.required ? <span className={styles.required}>Required</span> : null}
    </>
  );

  if (field.type === "file_request") {
    return (
      <Field>
        <FieldLabel>{label}</FieldLabel>
        <FieldDescription>
          Complete this answer through the matching uploaded-file request.
        </FieldDescription>
      </Field>
    );
  }

  if (field.type === "checkbox" || field.type === "boolean") {
    return (
      <Field data-invalid={invalid}>
        <label className={styles.checkbox} htmlFor={id}>
          <input
            {...aria}
            id={id}
            ref={controlRef as Ref<HTMLInputElement>}
            type="checkbox"
            disabled={busy}
            checked={answer === true}
            onChange={(event) => onChange(event.currentTarget.checked)}
          />
          <span>{label}</span>
        </label>
        <FieldError id={errorId}>{error}</FieldError>
      </Field>
    );
  }

  if (field.type === "textarea" || field.type === "rich_text") {
    return (
      <Field data-invalid={invalid}>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Textarea
          {...aria}
          id={id}
          ref={controlRef as Ref<HTMLTextAreaElement>}
          rows={5}
          disabled={busy}
          value={typeof answer === "string" ? answer : ""}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        <FieldError id={errorId}>{error}</FieldError>
      </Field>
    );
  }

  if (field.type === "select" || field.type === "multiselect") {
    const multiple = field.type === "multiselect";
    const value = multiple
      ? Array.isArray(answer)
        ? [...answer]
        : []
      : typeof answer === "string"
        ? answer
        : "";
    return (
      <Field data-invalid={invalid}>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <select
          {...aria}
          className={styles.select}
          id={id}
          ref={controlRef as Ref<HTMLSelectElement>}
          multiple={multiple}
          disabled={busy}
          value={value}
          onChange={(event) =>
            onChange(
              multiple
                ? Array.from(event.currentTarget.selectedOptions, (option) => option.value)
                : event.currentTarget.value,
            )
          }
        >
          {!multiple ? <option value="">Select an option</option> : null}
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <FieldError id={errorId}>{error}</FieldError>
      </Field>
    );
  }

  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        {...aria}
        id={id}
        ref={controlRef as Ref<HTMLInputElement>}
        type={inputType(field)}
        disabled={busy}
        value={typeof answer === "number" || typeof answer === "string" ? answer : ""}
        onChange={(event) =>
          onChange(
            field.type === "number" && event.currentTarget.value !== ""
              ? event.currentTarget.valueAsNumber
              : event.currentTarget.value,
          )
        }
      />
      <FieldError id={errorId}>{error}</FieldError>
    </Field>
  );
}
