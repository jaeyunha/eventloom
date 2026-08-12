import { forwardRef, type ReactNode, type SelectHTMLAttributes, useId } from "react";
import {
  Field as FieldRoot,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface FieldControlProps {
  id: string;
  "aria-describedby"?: string | undefined;
  "aria-invalid"?: true | undefined;
  "aria-required"?: true | undefined;
}

export interface FieldProps {
  label: ReactNode;
  children: ReactNode | ((controlProps: FieldControlProps) => ReactNode);
  name?: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
}

export function Field({
  label,
  children,
  name,
  hint,
  error,
  required = false,
  className,
}: FieldProps) {
  const generatedId = useId();
  const controlId = name || `field-${generatedId}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const controlProps: FieldControlProps = {
    id: controlId,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : undefined,
    "aria-required": required ? true : undefined,
  };

  return (
    <FieldRoot className={className} data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={controlId}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </FieldLabel>
      {typeof children === "function" ? children(controlProps) : children}
      {hint ? <FieldDescription id={hintId}>{hint}</FieldDescription> : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </FieldRoot>
  );
}

export { Input, Textarea };

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...props }, ref) {
    return (
      <select
        className={cn(
          "border-input bg-background text-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 h-9 w-full min-w-0 rounded-md border px-3 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);

export interface CharacterCountProps {
  current: number;
  maximum: number;
  className?: string;
}

export function CharacterCount({ current, maximum, className }: CharacterCountProps) {
  return (
    <span aria-live="polite" className={cn("text-muted-foreground text-xs", className)}>
      <span className="sr-only">Character count: </span>
      {current}/{maximum}
    </span>
  );
}
