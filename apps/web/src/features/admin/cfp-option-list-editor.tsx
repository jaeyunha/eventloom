import Link from "next/link";
import { type ClipboardEvent, type KeyboardEvent, useState } from "react";
import styles from "./cfp-option-list-editor.module.css";

interface CfpOptionListEditorProps {
  readonly description: string;
  readonly id: string;
  readonly label: string;
  readonly onChange: (values: string[]) => void;
  readonly required?: boolean;
  readonly values: readonly string[];
  readonly availableValues?: readonly string[] | undefined;
  readonly manageHref?: string | undefined;
}

function normalizedOptions(input: string): string[] {
  return input
    .split(/[,\n]/u)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function CfpOptionListEditor({
  description,
  id,
  label,
  onChange,
  required = false,
  values,
  availableValues,
  manageHref,
}: CfpOptionListEditorProps) {
  const [draft, setDraft] = useState("");
  const selectedKeys = new Set(values.map((value) => value.toLocaleLowerCase()));
  const canonicalOptions = availableValues?.filter(
    (value, index, options) =>
      options.findIndex(
        (candidate) => candidate.toLocaleLowerCase() === value.toLocaleLowerCase(),
      ) === index && !selectedKeys.has(value.toLocaleLowerCase()),
  );
  const usesCanonicalOptions = canonicalOptions !== undefined && canonicalOptions.length > 0;

  function addOptions(input: string): void {
    const next = [...values];
    const existing = new Set(values.map((value) => value.toLocaleLowerCase()));

    for (const option of normalizedOptions(input)) {
      const key = option.toLocaleLowerCase();
      if (existing.has(key)) continue;
      existing.add(key);
      next.push(option);
    }

    if (next.length !== values.length) onChange(next);
    setDraft("");
  }

  function removeOption(index: number): void {
    onChange(values.filter((_, candidateIndex) => candidateIndex !== index));
  }

  function toggleCanonicalOption(option: string): void {
    onChange([...values, option]);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== "Enter" && event.key !== ",") return;
    event.preventDefault();
    addOptions(draft);
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>): void {
    const pasted = event.clipboardData.getData("text");
    if (!/[,\n]/u.test(pasted)) return;
    event.preventDefault();
    addOptions(pasted);
  }

  return (
    <div className={styles.editor}>
      <div className={styles.labelRow}>
        {usesCanonicalOptions ? <span>{label}</span> : <label htmlFor={id}>{label}</label>}
        <span>
          {values.length} option{values.length === 1 ? "" : "s"}
        </span>
      </div>
      <p id={`${id}-description`} className={styles.description}>
        {description}
      </p>
      {canonicalOptions !== undefined && availableValues !== undefined ? (
        <p className={styles.description}>
          Using the Program settings classification library.
          {manageHref ? (
            <>
              {" "}
              <Link href={manageHref}>Manage classifications</Link>
            </>
          ) : null}
        </p>
      ) : null}
      <div className={styles.composer}>
        <div className={styles.options}>
          {values.map((value, index) => (
            <span className={styles.option} key={value}>
              {value}
              <button
                type="button"
                aria-label={`Remove ${value}`}
                onClick={() => removeOption(index)}
              >
                ×
              </button>
            </span>
          ))}
          {canonicalOptions?.map((option) => (
            <button
              className={styles.option}
              key={option}
              type="button"
              onClick={() => toggleCanonicalOption(option)}
            >
              Add {option}
            </button>
          ))}
          {canonicalOptions === undefined || canonicalOptions.length === 0 ? (
            <input
              id={id}
              value={draft}
              required={required && values.length === 0}
              aria-describedby={`${id}-description`}
              placeholder={values.length === 0 ? "Type an option and press Enter" : "Add option"}
              onBlur={() => {
                if (draft.trim()) addOptions(draft);
              }}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
