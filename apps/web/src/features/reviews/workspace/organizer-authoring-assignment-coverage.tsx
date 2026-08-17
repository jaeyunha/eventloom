"use client";
import { useEffect, useMemo } from "react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Checkbox } from "../../../components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldLabel } from "../../../components/ui/field";
import { Input } from "../../../components/ui/input";
import styles from "../review-workspace.module.css";
import { submissionSelectOption } from "./model-submission-select-option";
import { OrganizerAssignmentPreview } from "./organizer-authoring-assignment-preview";
import type { OrganizerAuthoringController } from "./organizer-authoring-controller";
import { OrganizerReviewerPoolView } from "./organizer-reviewer-pool-panel";

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
    reviewerMembersLoading,
    reviewerMembersError,
    reviewerMembers,
    matchingAssignmentReviewerMembers,
    reviewerDirectoryReady,
    assignmentPreview,
    previewAssignments,
    assignReviewers,
    reviewerPool,
    organizationId,
  } = controller;
  const selectedRound = rounds.find((round) => round.id === assignmentRoundId);
  const selectedAssignmentReviewerIds = new Set(assignmentReviewerIds);
  const poolReviewerIds = useMemo(
    () => new Set(reviewerPool.pool?.reviewerIds ?? []),
    [reviewerPool.pool?.reviewerIds],
  );
  const poolGrants = new Map(
    reviewerPool.pool?.grants.map((grant) => [grant.reviewerId, grant]) ?? [],
  );
  const matchingPoolReviewers = matchingAssignmentReviewerMembers.filter((member) =>
    poolReviewerIds.has(member.userId),
  );
  const visiblePoolReviewers = matchingPoolReviewers.slice(0, 8);
  const assignmentReviewerSelectionLabel =
    assignmentReviewerIds.length === 1
      ? "1 assignment reviewer selected"
      : `${assignmentReviewerIds.length} assignment reviewers selected`;
  const reviewTeamReady =
    !reviewerPool.loading && reviewerPool.error === null && reviewerPool.pool !== null;
  const invitationHref = organizationId
    ? `/admin/organizations/${encodeURIComponent(organizationId)}/members?tab=invite`
    : "/admin/events";
  const submissionOptions = useMemo(
    () => seed.aggregates.map(submissionSelectOption),
    [seed.aggregates],
  );

  useEffect(() => {
    if (!reviewTeamReady) return;
    setAssignmentReviewerIds((current) =>
      current.filter((reviewerId) => poolReviewerIds.has(reviewerId)),
    );
  }, [poolReviewerIds, reviewTeamReady, setAssignmentReviewerIds]);

  return (
    <section className={styles.assignmentCoverageTask} aria-labelledby="assignment-task-heading">
      <div className={styles.assignmentTaskHeader}>
        <div>
          <p className={styles.sectionEyebrow}>Assignment task</p>
          <h3 id="assignment-task-heading">Create assignments</h3>
        </div>
        <Badge variant="secondary" aria-live="polite">
          {assignmentReviewerSelectionLabel}
        </Badge>
      </div>
      <div className={styles.assignmentContextGrid}>
        <fieldset className={styles.assignmentContextField}>
          <label htmlFor="assignment-round-id">Round</label>
          <select
            className={styles.assignmentRoundSelect}
            id="assignment-round-id"
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
        <div className={styles.assignmentPolicy}>
          <p className={styles.mutedLabel}>Assignment limit</p>
          <p>
            The plan allows up to {maxAssignmentsPerReviewer} assignments per reviewer. Select
            eligible reviewers for this proposal. Existing assignments remain unchanged.
          </p>
        </div>
      </div>
      <OrganizerReviewerPoolView
        roundName={selectedRound?.name ?? "Selected round"}
        reviewers={reviewerMembers}
        pool={reviewerPool.pool}
        draft={reviewerPool.draft}
        loading={reviewerPool.loading}
        saving={reviewerPool.saving}
        error={reviewerPool.error}
        message={reviewerPool.message}
        invitationHref={invitationHref}
        onReviewerChange={reviewerPool.changeReviewer}
        onMaxAssignmentsChange={reviewerPool.changeMaxAssignments}
        onSave={() => void reviewerPool.save()}
        onReload={reviewerPool.reload}
      />
      <div className={styles.assignmentCoverageGrid}>
        <fieldset className={styles.formField}>
          <label htmlFor="assignment-submission-id">Proposal</label>
          <select
            className={styles.assignmentSubmissionSelect ?? ""}
            aria-describedby="assignment-submission-help"
            disabled={busy || status !== "open" || seed.aggregates.length === 0}
            id="assignment-submission-id"
            onChange={(event) => setAssignmentSubmissionId(event.currentTarget.value)}
            value={assignmentSubmissionId}
          >
            <option value="">Choose a proposal</option>
            {submissionOptions.map((option) => (
              <option value={option.value} key={option.value}>
                {option.description ? `${option.label} · ${option.description}` : option.label}
              </option>
            ))}
          </select>
          <span className={styles.fieldHint} id="assignment-submission-help">
            {seed.aggregates.length === 0
              ? "No submitted proposals are available."
              : "Choose a proposal for this round. Existing assignments remain unchanged."}
          </span>
        </fieldset>
        <fieldset
          className={`${styles.formField} ${styles.assignmentReviewerCandidates}`}
          aria-describedby="assignment-reviewer-help"
        >
          <legend className={styles.cardLabel}>Eligible reviewers</legend>
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
            aria-label="Eligible reviewers"
          >
            {visiblePoolReviewers.map((member) => {
              const inputId = `assignment-reviewer-${member.userId}`;
              const checked = selectedAssignmentReviewerIds.has(member.userId);
              const grant = poolGrants.get(member.userId);
              const capacityReached =
                grant !== undefined && grant.assignedCount >= grant.maxAssignments && !checked;
              return (
                <li key={member.userId}>
                  <Field orientation="horizontal" className={styles.assignmentCandidate}>
                    <Checkbox
                      id={inputId}
                      checked={checked}
                      disabled={assignmentReviewerSelectionDisabled || capacityReached}
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
                      <FieldDescription>
                        {member.email}
                        {grant
                          ? ` · ${grant.assignedCount} of ${grant.maxAssignments} assigned${capacityReached ? " · capacity reached" : ""}`
                          : ""}
                      </FieldDescription>
                    </FieldContent>
                  </Field>
                </li>
              );
            })}
          </ul>
          <span className={styles.fieldHint} id="assignment-reviewer-help">
            {reviewerMembersLoading || reviewerPool.loading
              ? "Loading the round review team…"
              : (reviewerMembersError ??
                reviewerPool.error ??
                (reviewerMembers.length === 0
                  ? "No active, verified organization reviewers are available."
                  : reviewerPool.pool === null
                    ? "Save a review team for this round before creating assignments."
                    : matchingPoolReviewers.length === 0
                      ? "No review-team members match that search."
                      : `${visiblePoolReviewers.length} of ${matchingPoolReviewers.length} matching round reviewers shown.`))}
          </span>
        </fieldset>
      </div>
      <OrganizerAssignmentPreview preview={assignmentPreview} />
      <div className={styles.assignmentActions}>
        <Button
          type="button"
          variant="outline"
          onClick={previewAssignments}
          disabled={busy || status !== "open" || !reviewerDirectoryReady || !reviewTeamReady}
        >
          Preview assignments
        </Button>
        <Button
          type="button"
          onClick={assignReviewers}
          disabled={
            busy ||
            status !== "open" ||
            !reviewerDirectoryReady ||
            !reviewTeamReady ||
            assignmentPreview === null
          }
        >
          Apply assignments
        </Button>
      </div>
    </section>
  );
}
