import type * as React from "react";

import { cn } from "@/lib/utils";
import { TemporalPicker } from "./temporal-picker";

type InputProps = React.ComponentProps<"input">;

function dateInputLabel(id: string, ariaLabel: InputProps["aria-label"]): string {
  if (typeof ariaLabel === "string" && ariaLabel.trim().length > 0) return ariaLabel;
  const words = id.replaceAll(/[-_]+/gu, " ").trim();
  return words.length === 0 ? "Date" : `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

function StyledDateInput({
  id,
  name,
  value,
  defaultValue,
  onChange,
  disabled,
  readOnly,
  required,
  min,
  "aria-label": ariaLabel,
}: InputProps) {
  const fieldId = id ?? name ?? "date-input";
  const currentValue =
    typeof value === "string" ? value : typeof defaultValue === "string" ? defaultValue : "";
  return (
    <TemporalPicker
      id={fieldId}
      mode="single"
      precision="date"
      value={currentValue}
      label={dateInputLabel(fieldId, ariaLabel)}
      clearable={!required}
      disabled={Boolean(disabled || readOnly)}
      {...(name === undefined ? {} : { name })}
      {...(typeof min === "string" ? { minimumDateTime: min } : {})}
      onChange={(nextValue) => {
        const target = {
          id: fieldId,
          name: name ?? "",
          type: "date",
          value: nextValue,
        } as HTMLInputElement;
        onChange?.({
          target,
          currentTarget: target,
        } as React.ChangeEvent<HTMLInputElement>);
      }}
    />
  );
}

function Input({ className, type, ...props }: InputProps) {
  if (type === "date") {
    return <StyledDateInput {...props} />;
  }
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
