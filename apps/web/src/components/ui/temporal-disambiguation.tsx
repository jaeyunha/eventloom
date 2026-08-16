"use client";

import { analyzeLocalDateTime, type TimeDisambiguation } from "@eventloom/contracts";
import { Button } from "@/components/ui/button";
import styles from "./temporal-disambiguation.module.css";

interface TemporalDisambiguationProps {
  readonly id: string;
  readonly label: string;
  readonly localDateTime: string;
  readonly timeZone: string;
  readonly value?: TimeDisambiguation | undefined;
  readonly disabled?: boolean | undefined;
  readonly onChange: (value: TimeDisambiguation) => void;
}

export function TemporalDisambiguation({
  id,
  label,
  localDateTime,
  timeZone,
  value,
  disabled = false,
  onChange,
}: TemporalDisambiguationProps) {
  if (localDateTime === "") return null;
  const analysis = analyzeLocalDateTime(localDateTime, timeZone);
  if (analysis.state === "resolved" || analysis.state === "invalid") return null;
  if (analysis.state === "nonexistent") {
    return (
      <p
        className={styles.error}
        data-temporal-state="nonexistent"
        id={`${id}-time-error`}
        role="alert"
      >
        This local time does not exist in {timeZone}. Choose another time.
      </p>
    );
  }
  return (
    <fieldset className={styles.choice} data-temporal-state="ambiguous" id={`${id}-time-choice`}>
      <legend>{label} occurs twice</legend>
      <p>Choose which occurrence in {timeZone} you mean.</p>
      <div className={styles.actions}>
        <Button
          aria-pressed={value === "earlier"}
          disabled={disabled}
          type="button"
          value="earlier"
          variant={value === "earlier" ? "secondary" : "outline"}
          onClick={() => onChange("earlier")}
        >
          First occurrence
        </Button>
        <Button
          aria-pressed={value === "later"}
          disabled={disabled}
          type="button"
          value="later"
          variant={value === "later" ? "secondary" : "outline"}
          onClick={() => onChange("later")}
        >
          Second occurrence
        </Button>
      </div>
    </fieldset>
  );
}
