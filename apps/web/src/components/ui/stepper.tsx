import type { ReactNode } from "react";
import styles from "../../styles/design-system.module.css";
import { cx } from "./class-names";

export interface StepperStep {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  href?: string;
}

export interface StepperProps {
  steps: readonly StepperStep[];
  currentStep: string | number;
  label?: string;
  className?: string;
}

export type StepState = "complete" | "current" | "upcoming";

export function getStepState(index: number, currentIndex: number): StepState {
  if (index < currentIndex) {
    return "complete";
  }
  if (index === currentIndex) {
    return "current";
  }
  return "upcoming";
}

function CompleteIcon() {
  return (
    <svg aria-hidden="true" height="14" viewBox="0 0 16 16" width="14">
      <path
        d="m3 8.2 3.1 3.1L13 4.7"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function Stepper({ steps, currentStep, label = "Progress", className }: StepperProps) {
  const requestedIndex =
    typeof currentStep === "number"
      ? currentStep
      : steps.findIndex((step) => step.id === currentStep);
  const currentIndex = Math.max(0, Math.min(requestedIndex, Math.max(steps.length - 1, 0)));

  return (
    <nav aria-label={label} className={cx(styles.stepper, className)}>
      <ol className={styles.stepList}>
        {steps.map((step, index) => {
          const state = getStepState(index, currentIndex);
          const content = (
            <>
              <span aria-hidden="true" className={styles.stepMarker}>
                {state === "complete" ? <CompleteIcon /> : index + 1}
              </span>
              <span className={styles.stepLabel}>
                <span>{step.label}</span>
                {step.description ? (
                  <span className={styles.stepDescription}>{step.description}</span>
                ) : null}
              </span>
              {state === "complete" ? <span className={styles.srOnly}>Complete</span> : null}
            </>
          );

          return (
            <li
              className={cx(
                styles.step,
                state === "current" && styles.stepCurrent,
                state === "complete" && styles.stepComplete,
              )}
              key={step.id}
            >
              {step.href ? (
                <a
                  aria-current={state === "current" ? "step" : undefined}
                  className={styles.stepLink}
                  href={step.href}
                >
                  {content}
                </a>
              ) : (
                <div
                  aria-current={state === "current" ? "step" : undefined}
                  className={styles.stepLink}
                >
                  {content}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
