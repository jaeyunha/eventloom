"use client";
import styles from "../review-workspace.module.css";
import type { EvaluatorController } from "./evaluator-controller";

export function EvaluatorPrivacyNotice({
  controller,
}: Readonly<{ controller: EvaluatorController }>) {
  const { identityRedacted } = controller;
  return (
    <section className={styles.privacyNotice} role="note" aria-labelledby="blind-review-heading">
      <span className={styles.noticeIcon} aria-hidden="true">
        ◌
      </span>
      <div>
        <h2 id="blind-review-heading">
          {identityRedacted ? "Blind review is on" : "Blind review is off"}
        </h2>
        <p>
          {identityRedacted
            ? "Author identity is hidden from reviewers. Names, email addresses, and biographies are not shown in this workspace; evaluate the content only."
            : "This round permits organizer-configured identity fields; reviewer access remains limited to the assigned submission."}
        </p>
      </div>
    </section>
  );
}
