import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
} from "react";
import styles from "../../styles/design-system.module.css";
import { cx } from "./class-names";

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
    <div className={cx(styles.field, className)}>
      <label className={styles.fieldLabel} htmlFor={controlId}>
        {label} {required ? <span className={styles.required}>*</span> : null}
      </label>
      {typeof children === "function" ? children(controlProps) : children}
      {hint ? (
        <p className={styles.fieldHint} id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className={styles.fieldError} id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input className={cx(styles.input, className)} ref={ref} {...props} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea className={cx(styles.textarea, className)} ref={ref} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...props }, ref) {
    return <select className={cx(styles.select, className)} ref={ref} {...props} />;
  },
);

export interface CharacterCountProps {
  current: number;
  maximum: number;
  className?: string;
}

export function CharacterCount({ current, maximum, className }: CharacterCountProps) {
  return (
    <span aria-live="polite" className={cx(styles.characterCount, className)}>
      <span className={styles.srOnly}>Character count: </span>
      {current}/{maximum}
    </span>
  );
}
