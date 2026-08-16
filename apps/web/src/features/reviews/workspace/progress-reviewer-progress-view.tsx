"use client";

import styles from "../review-workspace.module.css";
import type { ReviewerProgressController } from "./progress-reviewer-progress-controller";
import { ReviewerProgressTable } from "./progress-reviewer-progress-table";

export function ReviewerProgressView({
  controller,
}: Readonly<{ controller: ReviewerProgressController }>) {
  const {
    seed,
    reviewerQuery,
    setReviewerQuery,
    reviewerRowLimit,
    setReviewerRowLimit,
    message,
    messageTone,
    deliveryFacts,
    busy,
    requestPresentation,
    outstanding,
    filteredReviewers,
    visibleReviewers,
    visibleOutstanding,
    reviewerLabel,
    selectedOutstanding,
    selectedVisibleOutstanding,
    keyFor,
    setSelected,
    sendReminders,
  } = controller;
  return (
    <section
      className={styles.section}
      aria-labelledby="reviewer-progress-heading"
      aria-busy={requestPresentation.ariaBusy}
    >
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.sectionEyebrow}>Per-reviewer monitoring</p>
          <h2 id="reviewer-progress-heading">Reviewer progress dashboard</h2>
        </div>
        <span className={styles.mutedLabel}>{outstanding.length} with outstanding reviews</span>
      </div>
      <div className={styles.collectionToolbar}>
        <div className={styles.formField}>
          <label htmlFor="reviewer-progress-search">Find a reviewer</label>
          <input
            id="reviewer-progress-search"
            type="search"
            value={reviewerQuery}
            onChange={(event) => setReviewerQuery(event.currentTarget.value)}
            placeholder="Search reviewer or round"
          />
        </div>
        <div className={styles.formField}>
          <label htmlFor="reviewer-progress-limit">Rows shown</label>
          <select
            id="reviewer-progress-limit"
            value={reviewerRowLimit}
            onChange={(event) => setReviewerRowLimit(Number(event.currentTarget.value))}
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={25}>25</option>
          </select>
        </div>
        <p className={styles.toolbarMeta} role="status">
          Showing {visibleReviewers.length} of {filteredReviewers.length} matching reviewers
        </p>
      </div>
      <ReviewerProgressTable controller={controller} />
      {seed.progress.reviewers.length === 0 ? (
        <p className={styles.fieldHint}>No reviewer assignments have been persisted yet.</p>
      ) : null}
      {deliveryFacts.length > 0 ? (
        <section aria-label="Reviewer reminder delivery status">
          <p className={styles.fieldHint}>Durable reminder delivery status</p>
          <ul>
            {deliveryFacts.map((fact) => (
              <li
                key={fact.outboxId ?? `${fact.reviewerId ?? "reviewer"}:${fact.roundId ?? "all"}`}
              >
                {reviewerLabel(fact.reviewerId ?? "Unknown reviewer")}: {fact.status ?? "unknown"}
                {(fact.completedAt ?? fact.updatedAt ?? fact.createdAt)
                  ? ` at ${fact.completedAt ?? fact.updatedAt ?? fact.createdAt}`
                  : ""}
                {fact.lastErrorCode ? ` (${fact.lastErrorCode})` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className={styles.confirmationActions}>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={() =>
            setSelected(
              new Set(
                selectedVisibleOutstanding.length === visibleOutstanding.length
                  ? []
                  : visibleOutstanding.map(keyFor),
              ),
            )
          }
          disabled={busy || visibleOutstanding.length === 0}
        >
          {selectedVisibleOutstanding.length === visibleOutstanding.length
            ? "Clear reminder selection"
            : "Select shown outstanding"}
        </button>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={() => void sendReminders()}
          disabled={busy || selectedOutstanding.length === 0}
        >
          {requestPresentation.action === "pending"
            ? "Sending reminder…"
            : "Send reminder to selected reviewers"}
        </button>
      </div>
      {message ? (
        <p
          className={messageTone === "error" ? styles.formError : styles.submittedMessage}
          role={messageTone === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}
