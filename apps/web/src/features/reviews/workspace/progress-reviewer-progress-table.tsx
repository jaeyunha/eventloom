"use client";

import { Checkbox } from "../../../components/ui/checkbox";
import { Field, FieldLabel } from "../../../components/ui/field";
import styles from "../review-workspace.module.css";
import { normalizeCompletionPercent } from "./model-normalize-completion-percent";
import type { ReviewerProgressController } from "./progress-reviewer-progress-controller";

export function ReviewerProgressTable({
  controller,
}: Readonly<{ controller: ReviewerProgressController }>) {
  const { seed, selected, visibleReviewers, reviewerLabel, keyFor, toggle } = controller;
  return (
    <div className={styles.tableWrap}>
      <table className={`${styles.dataTable} ${styles.reviewerProgressTable}`}>
        <caption>Reviewer completion by round</caption>
        <thead>
          <tr>
            <th scope="col">Select</th>
            <th scope="col">Reviewer</th>
            <th scope="col">Round</th>
            <th scope="col">Assigned</th>
            <th scope="col">Complete</th>
            <th scope="col">Outstanding</th>
            <th scope="col">Completion</th>
          </tr>
        </thead>
        <tbody>
          {visibleReviewers.map((reviewer) => {
            const key = keyFor(reviewer);
            const round = seed.rounds.find((candidate) => candidate.id === reviewer.roundId);
            const inputId = `reminder-${key.replaceAll("\u0000", "-")}`;
            return (
              <tr key={key}>
                <td data-label="Select">
                  <Field orientation="horizontal" className={styles.tableCheckboxField}>
                    <Checkbox
                      id={inputId}
                      aria-label={`Select ${reviewerLabel(reviewer.reviewerId)} reminder`}
                      checked={selected.has(key)}
                      disabled={reviewer.outstanding === 0}
                      onCheckedChange={() => toggle(reviewer)}
                    />
                    <FieldLabel htmlFor={inputId} className={styles.srOnly}>
                      Select {reviewerLabel(reviewer.reviewerId)} reminder
                    </FieldLabel>
                  </Field>
                </td>
                <th scope="row" data-label="Reviewer">
                  {reviewerLabel(reviewer.reviewerId)}
                </th>
                <td data-label="Round">{round?.name ?? "Round unavailable"}</td>
                <td data-label="Assigned">{reviewer.assigned}</td>
                <td data-label="Complete">{reviewer.submitted}</td>
                <td data-label="Outstanding">{reviewer.outstanding}</td>
                <td data-label="Completion">
                  {normalizeCompletionPercent(reviewer.completionPercent)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
