import { Check } from "lucide-react";
import styles from "./cfp-progress.module.css";
import { CFP_STEPS, type CfpStep } from "./types";

const STEP_LABELS: Record<CfpStep, string> = {
  welcome: "Get started",
  account: "Account",
  submission: "Proposal",
  participants: "Speakers",
  review: "Review",
};

interface CfpProgressProps {
  readonly mobile?: boolean;
  readonly step: CfpStep;
}

export function CfpProgress({ step, mobile = false }: CfpProgressProps) {
  const currentIndex = Math.max(CFP_STEPS.indexOf(step), 0);

  if (mobile) {
    return (
      <nav aria-label="Submission progress" className={styles.mobileProgress}>
        <div className={styles.mobileHeader}>
          <span>
            Step {currentIndex + 1} of {CFP_STEPS.length}
          </span>
          <strong>{STEP_LABELS[step]}</strong>
        </div>
        <ol className={styles.mobileSegments}>
          {CFP_STEPS.map((wizardStep, index) => (
            <li
              aria-current={index === currentIndex ? "step" : undefined}
              className={
                index === currentIndex
                  ? styles.mobileCurrent
                  : index < currentIndex
                    ? styles.mobileComplete
                    : undefined
              }
              key={wizardStep}
            >
              <span aria-hidden="true" />
              <span className="sr-only">
                {STEP_LABELS[wizardStep]}
                {index < currentIndex ? " complete" : ""}
              </span>
            </li>
          ))}
        </ol>
      </nav>
    );
  }

  return (
    <nav aria-label="Submission progress" className={styles.progress}>
      <p className={styles.progressLabel}>Your progress</p>
      <ol>
        {CFP_STEPS.map((wizardStep, index) => {
          const state =
            index === currentIndex ? "current" : index < currentIndex ? "complete" : "upcoming";
          return (
            <li
              aria-current={state === "current" ? "step" : undefined}
              data-state={state}
              key={wizardStep}
            >
              <span className={styles.indicator} aria-hidden="true">
                {state === "complete" ? <Check size={12} strokeWidth={2.5} /> : index + 1}
              </span>
              <span className={styles.label}>{STEP_LABELS[wizardStep]}</span>
              <span className="sr-only">
                {state === "complete" ? "Complete" : state === "current" ? "Current step" : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
