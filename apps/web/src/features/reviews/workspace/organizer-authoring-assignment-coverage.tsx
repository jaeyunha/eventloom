"use client";
import { Button } from "../../../components/ui/button";
import { Checkbox } from "../../../components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldLabel } from "../../../components/ui/field";
import { Input } from "../../../components/ui/input";
import styles from "../review-workspace.module.css";
import { assignmentControlFieldStyle } from "./model-assignment-control-field-style";
import { assignmentControlGridStyle } from "./model-assignment-control-grid-style";
import { assignmentControlSelectStyle } from "./model-assignment-control-select-style";
import { OrganizerAssignmentPreview } from "./organizer-authoring-assignment-preview";
import type { OrganizerAuthoringController } from "./organizer-authoring-controller";

export function OrganizerAssignmentCoverage({
  controller,
}: Readonly<{ controller: OrganizerAuthoringController }>) {
  const {
    seed,
    rounds,
    busy,
    status,
    maxAssignmentsPerReviewer,
    assignmentRoundId,
    setAssignmentRoundId,
    assignmentSubmissionId,
    setAssignmentSubmissionId,
    assignmentReviewerQuery,
    setAssignmentReviewerQuery,
    assignmentReviewerIds,
    setAssignmentReviewerIds,
    assignmentReviewerSelectionDisabled,
    visibleAssignmentReviewerMembers,
    reviewerMembersLoading,
    reviewerMembersError,
    reviewerMembers,
    matchingAssignmentReviewerMembers,
    reviewerDirectoryReady,
    assignmentPreview,
    previewAssignments,
    assignReviewers,
  } = controller;
  return (
    <section className={styles.assignmentCoverageTask} aria-labelledby="assignment-task-heading">
      <div className={styles.assignmentTaskHeader}>
        <div>
          <p className={styles.sectionEyebrow}>Assignment task</p>
          <h3 id="assignment-task-heading">Fill missing reviewer slots</h3>
        </div>
        <span className={styles.assignmentSelectionCount} aria-live="polite">
          {assignmentReviewerIds.length} selected
        </span>
      </div>
      <div className={styles.summaryGrid} style={assignmentControlGridStyle}>
        <fieldset className={styles.formField} style={assignmentControlFieldStyle}>
          <label htmlFor="assignment-round-id">Round</label>
          <select
            id="assignment-round-id"
            style={assignmentControlSelectStyle}
            value={assignmentRoundId}
            disabled={busy || status !== "open"}
            onChange={(event) => setAssignmentRoundId(event.currentTarget.value)}
          >
            {rounds.map((round) => (
              <option value={round.id} key={round.id}>
                {round.name}
              </option>
            ))}
          </select>
        </fieldset>
        <fieldset className={styles.formField} style={assignmentControlFieldStyle}>
          <legend className={styles.cardLabel}>Coverage guidance</legend>
          <span className={styles.fieldHint}>
            The plan cap is {maxAssignmentsPerReviewer} assignments per reviewer. Select reviewer
            candidates to fill missing reviewer slots. Existing assignments remain unchanged.
          </span>
        </fieldset>
      </div>
      <div className={styles.summaryGrid} style={assignmentControlGridStyle}>
        <fieldset className={styles.formField} style={assignmentControlFieldStyle}>
          <label htmlFor="assignment-submission-id">Submission needing coverage</label>
          <select
            id="assignment-submission-id"
            style={assignmentControlSelectStyle}
            value={assignmentSubmissionId}
            onChange={(event) => setAssignmentSubmissionId(event.currentTarget.value)}
            disabled={busy || status !== "open" || seed.aggregates.length === 0}
            required
            aria-describedby="assignment-submission-help"
          >
            <option value="">Choose a submission</option>
            {seed.aggregates.map((aggregate) => (
              <option value={aggregate.id} key={aggregate.id}>
                {aggregate.reference} · {aggregate.title}
              </option>
            ))}
          </select>
          <span className={styles.fieldHint} id="assignment-submission-help">
            {seed.aggregates.length === 0
              ? "No submissions are available for coverage."
              : "Choose a submission from the authoritative event material. Existing assignments remain unchanged."}
          </span>
        </fieldset>
        <fieldset
          className={`${styles.formField} ${styles.assignmentReviewerCandidates}`}
          style={assignmentControlFieldStyle}
          aria-describedby="assignment-reviewer-help"
        >
          <legend className={styles.cardLabel}>Reviewer candidates</legend>
          <div className={styles.assignmentCandidateToolbar}>
            <label htmlFor="assignment-reviewer-search">Search reviewers</label>
            <Input
              id="assignment-reviewer-search"
              type="search"
              value={assignmentReviewerQuery}
              onChange={(event) => setAssignmentReviewerQuery(event.currentTarget.value)}
              placeholder="Name or email"
              disabled={assignmentReviewerSelectionDisabled}
              aria-controls="assignment-reviewer-candidates"
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() => setAssignmentReviewerIds([])}
              disabled={assignmentReviewerSelectionDisabled || assignmentReviewerIds.length === 0}
            >
              Clear selection
            </Button>
          </div>
          <ul
            id="assignment-reviewer-candidates"
            className={styles.assignmentCandidateList}
            aria-label="Verified organization reviewers"
          >
            {visibleAssignmentReviewerMembers.map((member) => {
              const inputId = `assignment-reviewer-${member.userId}`;
              const checked = assignmentReviewerIds.includes(member.userId);
              return (
                <li key={member.userId}>
                  <Field orientation="horizontal" className={styles.assignmentCandidate}>
                    <Checkbox
                      id={inputId}
                      checked={checked}
                      disabled={assignmentReviewerSelectionDisabled}
                      onCheckedChange={(nextChecked) =>
                        setAssignmentReviewerIds((current) =>
                          nextChecked === true
                            ? [...new Set([...current, member.userId])]
                            : current.filter((reviewerId) => reviewerId !== member.userId),
                        )
                      }
                    />
                    <FieldContent>
                      <FieldLabel htmlFor={inputId}>{member.name ?? member.email}</FieldLabel>
                      <FieldDescription>{member.email}</FieldDescription>
                    </FieldContent>
                  </Field>
                </li>
              );
            })}
          </ul>
          <span className={styles.fieldHint} id="assignment-reviewer-help">
            {reviewerMembersLoading
              ? "Loading active, verified organization reviewers…"
              : (reviewerMembersError ??
                (reviewerMembers.length === 0
                  ? "No active, verified organization reviewers are available."
                  : matchingAssignmentReviewerMembers.length === 0
                    ? "No reviewers match that search."
                    : `${visibleAssignmentReviewerMembers.length} of ${matchingAssignmentReviewerMembers.length} matching reviewers shown. Names and email addresses are display-only; assignments submit each member user ID.`))}
          </span>
        </fieldset>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={previewAssignments}
        disabled={busy || status !== "open" || !reviewerDirectoryReady}
      >
        Preview coverage
      </Button>
      <OrganizerAssignmentPreview preview={assignmentPreview} />
      <Button
        type="button"
        variant="outline"
        onClick={assignReviewers}
        disabled={
          busy || status !== "open" || !reviewerDirectoryReady || assignmentPreview === null
        }
      >
        Apply coverage
      </Button>
    </section>
  );
}
