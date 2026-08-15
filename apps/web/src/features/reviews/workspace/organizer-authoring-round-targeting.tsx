"use client";
import styles from "../review-workspace.module.css";
import type { ApiPlan } from "./api-api-plan";
import { assignmentControlFieldStyle } from "./model-assignment-control-field-style";
import { assignmentControlGridStyle } from "./model-assignment-control-grid-style";
import { assignmentControlSelectStyle } from "./model-assignment-control-select-style";
import type { OrganizerAuthoringController } from "./organizer-authoring-controller";

export function OrganizerRoundTargeting({
  controller,
  round,
  roundIndex,
}: Readonly<{
  controller: OrganizerAuthoringController;
  round: ApiPlan["rounds"][number];
  roundIndex: number;
}>) {
  const {
    reviewerMembers,
    reviewerIdSet,
    busy,
    reviewerMembersLoading,
    reviewerMembersError,
    updateRound,
  } = controller;
  return (
    <details className={styles.reviewerTargeting}>
      <summary>
        <span>
          <strong>Reviewer eligibility</strong>
          <small>Choose who can receive assignments in this round.</small>
        </span>
        <span>
          {round.reviewerPool?.reviewerIds.length ?? reviewerMembers.length} reviewers ·{" "}
          {round.trackFilter?.trim().length ? round.trackFilter : "all tracks"}
        </span>
      </summary>
      <div className={styles.reviewerTargetingGrid} style={assignmentControlGridStyle}>
        <fieldset className={styles.formField} style={assignmentControlFieldStyle}>
          <legend className={styles.cardLabel}>Eligible reviewers</legend>
          <label htmlFor={`${round.id}-reviewer-pool`}>
            Organization reviewers eligible for this round
          </label>
          <select
            id={`${round.id}-reviewer-pool`}
            style={assignmentControlSelectStyle}
            multiple
            size={Math.max(3, Math.min(8, reviewerMembers.length || 3))}
            value={(round.reviewerPool?.reviewerIds ?? []).filter((reviewerId) =>
              reviewerIdSet.has(reviewerId),
            )}
            disabled={busy || reviewerMembersLoading || reviewerMembersError !== null}
            onChange={(event) => {
              const nextReviewerIds = [...event.currentTarget.selectedOptions].map(
                (option) => option.value,
              );
              updateRound(roundIndex, (current) => ({
                ...current,
                reviewerPool: {
                  ...(current.reviewerPool ?? {}),
                  reviewerIds: nextReviewerIds,
                },
              }));
            }}
            aria-describedby={`${round.id}-pool-help`}
          >
            {reviewerMembers.map((member) => (
              <option value={member.userId} key={member.userId}>
                {member.name ?? member.email} · {member.email}
              </option>
            ))}
          </select>
          <span className={styles.fieldHint} id={`${round.id}-pool-help`}>
            {reviewerMembersLoading
              ? "Loading active, verified organization reviewers…"
              : (reviewerMembersError ??
                `Eligibility applies only to ${round.name}; configure every round independently.`)}
          </span>
        </fieldset>
        <fieldset className={styles.formField} style={assignmentControlFieldStyle}>
          <legend className={styles.cardLabel}>Bulk assignment filter</legend>
          <label htmlFor={`${round.id}-track-filter`}>Track filter for bulk assignment</label>
          <input
            id={`${round.id}-track-filter`}
            value={round.trackFilter ?? ""}
            onChange={(event) => {
              const nextTrackFilter = event.currentTarget.value.trim() || null;
              updateRound(roundIndex, (current) => ({
                ...current,
                trackFilter: nextTrackFilter,
              }));
            }}
            placeholder="Platform & Infra"
          />
        </fieldset>
      </div>
    </details>
  );
}
