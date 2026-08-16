import { Check } from "lucide-react";
import styles from "./cfp-progress.module.css";
import { CFP_STEP_LABELS, CFP_STEPS, type CfpStep } from "./types";

type CfpProgressProps = {
  readonly mobile?: boolean;
} & (
  | {
      readonly complete: true;
      readonly step?: never;
    }
  | {
      readonly complete?: false;
      readonly step: CfpStep;
    }
);

export function CfpProgress(props: CfpProgressProps) {
  const mobile = props.mobile ?? false;
  const complete = props.complete === true;
  const currentIndex = complete ? CFP_STEPS.length : Math.max(CFP_STEPS.indexOf(props.step), 0);
  const currentLabel = complete ? "Submission complete" : CFP_STEP_LABELS[props.step];

  if (mobile) {
    return (
      <nav aria-label="Submission progress" className={styles.mobileProgress}>
        <div className={styles.mobileHeader}>
          <span>
            {complete
              ? `${CFP_STEPS.length} of ${CFP_STEPS.length} steps complete`
              : `Step ${currentIndex + 1} of ${CFP_STEPS.length}`}
          </span>
          <strong>{currentLabel}</strong>
        </div>
        <ol className={styles.mobileSegments}>
          {CFP_STEPS.map((wizardStep, index) => (
            <li
              aria-current={!complete && index === currentIndex ? "step" : undefined}
              className={
                !complete && index === currentIndex
                  ? styles.mobileCurrent
                  : index < currentIndex
                    ? styles.mobileComplete
                    : undefined
              }
              key={wizardStep}
            >
              <span aria-hidden="true" />
              <span className="sr-only">
                {CFP_STEP_LABELS[wizardStep]}
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
      <p className={styles.progressLabel}>{complete ? "Submission complete" : "Your progress"}</p>
      <ol>
        {CFP_STEPS.map((wizardStep, index) => {
          const state =
            complete || index < currentIndex
              ? "complete"
              : index === currentIndex
                ? "current"
                : "upcoming";
          return (
            <li
              aria-current={state === "current" ? "step" : undefined}
              data-state={state}
              key={wizardStep}
            >
              <span className={styles.indicator} aria-hidden="true">
                {state === "complete" ? <Check size={12} strokeWidth={2.5} /> : index + 1}
              </span>
              <span className={styles.label}>{CFP_STEP_LABELS[wizardStep]}</span>
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
