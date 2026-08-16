"use client";
import styles from "../review-workspace.module.css";
import type { EvaluatorController } from "./evaluator-controller";

export function EvaluatorCommentField({
  controller,
}: Readonly<{ controller: EvaluatorController }>) {
  const {
    comment,
    reviewLocked,
    setComment,
    reportDraft,
    scoreValues,
    responseValues,
    humanConfirmed,
    setAutosaveState,
    enqueueAutosave,
  } = controller;
  return (
    <section className={styles.commentRow} aria-labelledby="comment-heading">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.sectionEyebrow}>Reviewer notes</p>
          <h2 id="comment-heading">Comments</h2>
        </div>
      </div>
      <div className={styles.formField}>
        <label htmlFor="review-comment">Comments for the organizing committee</label>
        <textarea
          id="review-comment"
          value={comment}
          disabled={reviewLocked}
          onChange={(event) => {
            const nextComment = event.currentTarget.value;
            setComment(nextComment);
            reportDraft(scoreValues, responseValues, humanConfirmed, nextComment);
            setAutosaveState("Unsaved changes");
            enqueueAutosave(scoreValues, nextComment, humanConfirmed, responseValues);
          }}
          rows={5}
          placeholder="Share evidence for your scores and any practical considerations."
        />
      </div>
    </section>
  );
}
