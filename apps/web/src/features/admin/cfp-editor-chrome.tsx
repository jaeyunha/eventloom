import type { ReactNode } from "react";
import styles from "./cfp-editor-chrome.module.css";

export interface CfpEditorSection {
  readonly id: string;
  readonly label: string;
}

interface CfpEditorMastheadProps {
  readonly actions: ReactNode;
  readonly error?: string | null;
  readonly metadata: readonly string[];
  readonly status: "Draft" | "Published" | "Closed";
}

export function CfpEditorMasthead({ actions, error, metadata, status }: CfpEditorMastheadProps) {
  return (
    <header className={styles.masthead}>
      <div className={styles.titleBlock}>
        <p className={styles.eyebrow}>Organizer workspace</p>
        <h1>Configure your call for proposals</h1>
        <p className={styles.description}>
          Build the applicant experience, review the form, and publish when every section is ready.
        </p>
        <div className={styles.metadata} role="status" aria-label="CFP status">
          <span className={styles.statusBadge} data-status={status.toLowerCase()}>
            {status}
          </span>
          {metadata.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>
      <div className={styles.actionColumn}>
        <div className={styles.actions}>{actions}</div>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </header>
  );
}

interface CfpSectionNavigationProps {
  readonly activeSection: string;
  readonly onChange: (sectionId: string) => void;
  readonly sections: readonly CfpEditorSection[];
}

export function CfpSectionNavigation({
  activeSection,
  onChange,
  sections,
}: CfpSectionNavigationProps) {
  return (
    <nav className={styles.sectionNavigation} aria-label="CFP configuration sections">
      <ol className={styles.sectionList}>
        {sections.map((section, index) => (
          <li key={section.id}>
            <button
              type="button"
              aria-controls={section.id}
              aria-current={activeSection === section.id ? "step" : undefined}
              className={activeSection === section.id ? styles.activeSection : undefined}
              onClick={() => onChange(section.id)}
            >
              <span className={styles.sectionNumber}>{String(index + 1).padStart(2, "0")}</span>
              <span>{section.label}</span>
            </button>
          </li>
        ))}
      </ol>
      <label className={styles.mobileSectionSelect}>
        <span>Configuration section</span>
        <select value={activeSection} onChange={(event) => onChange(event.target.value)}>
          {sections.map((section, index) => (
            <option key={section.id} value={section.id}>
              {index + 1}. {section.label}
            </option>
          ))}
        </select>
      </label>
    </nav>
  );
}

interface CfpStepActionsProps {
  readonly activeSection: string;
  readonly busy?: boolean;
  readonly onBack: () => void;
  readonly onFinish: () => void;
  readonly onNext: () => void;
  readonly saveStatus: string;
  readonly sections: readonly CfpEditorSection[];
}

export function CfpStepActions({
  activeSection,
  busy = false,
  onBack,
  onFinish,
  onNext,
  saveStatus,
  sections,
}: CfpStepActionsProps) {
  const activeIndex = sections.findIndex((section) => section.id === activeSection);
  const isFirst = activeIndex === 0;
  const isLast = activeIndex === sections.length - 1;

  return (
    <footer className={styles.stepActions}>
      <div className={styles.stepSummary}>
        <span>
          Section {activeIndex + 1} of {sections.length}
        </span>
        <strong>{sections[activeIndex]?.label}</strong>
        <span className={styles.saveStatus} role="status" aria-live="polite">
          {saveStatus}
        </span>
      </div>
      <div className={styles.stepButtons}>
        <button type="button" disabled={isFirst} onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className={styles.continueButton}
          disabled={busy}
          onClick={isLast ? onFinish : onNext}
        >
          {isLast ? "Publish form" : "Continue"}
        </button>
      </div>
    </footer>
  );
}
