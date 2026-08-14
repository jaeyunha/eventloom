"use client";

import styles from "./portal.module.css";
import type { PortalFormAnswer, PortalFormField } from "./types";

function fieldInputType(field: PortalFormField): "date" | "email" | "number" | "text" | "url" {
  if (field.type === "date") return "date";
  if (field.type === "email") return "email";
  if (field.type === "number") return "number";
  if (field.type === "url") return "url";
  return "text";
}

interface PortalTaskResponseFieldProps {
  readonly field: PortalFormField;
  readonly answer: PortalFormAnswer | undefined;
  readonly busy: boolean;
  readonly onChange: (answer: PortalFormAnswer) => void;
}

export function PortalTaskResponseField({
  field,
  answer,
  busy,
  onChange,
}: PortalTaskResponseFieldProps) {
  const label = `${field.label}${field.required ? " *" : ""}`;

  if (field.type === "textarea" || field.type === "rich_text") {
    return (
      <label className={styles.responseField}>
        <span>{label}</span>
        <textarea
          rows={5}
          required={field.required}
          disabled={busy}
          value={typeof answer === "string" ? answer : ""}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <label className={styles.responseField}>
        <span>{label}</span>
        <select
          required={field.required}
          disabled={busy}
          value={typeof answer === "string" ? answer : ""}
          onChange={(event) => onChange(event.currentTarget.value)}
        >
          <option value="">Select an option</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "multiselect") {
    const selected = Array.isArray(answer) ? [...answer] : [];
    return (
      <label className={styles.responseField}>
        <span>{label}</span>
        <select
          multiple
          required={field.required}
          disabled={busy}
          value={selected}
          onChange={(event) =>
            onChange(Array.from(event.currentTarget.selectedOptions, (option) => option.value))
          }
        >
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "checkbox" || field.type === "boolean") {
    return (
      <label className={styles.responseCheckbox}>
        <input
          type="checkbox"
          required={field.required}
          disabled={busy}
          checked={answer === true}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
        <span>{label}</span>
      </label>
    );
  }

  if (field.type === "file_request") {
    return (
      <div className={styles.responseField}>
        <strong>{label}</strong>
        <p className={styles.toolbarDescription}>
          Complete this answer through the matching uploaded-file request.
        </p>
      </div>
    );
  }

  return (
    <label className={styles.responseField}>
      <span>{label}</span>
      <input
        type={fieldInputType(field)}
        required={field.required}
        disabled={busy}
        value={typeof answer === "number" || typeof answer === "string" ? answer : ""}
        onChange={(event) =>
          onChange(
            field.type === "number" && event.currentTarget.value.length > 0
              ? event.currentTarget.valueAsNumber
              : event.currentTarget.value,
          )
        }
      />
    </label>
  );
}
