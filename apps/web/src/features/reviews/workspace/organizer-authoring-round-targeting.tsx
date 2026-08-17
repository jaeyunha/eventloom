"use client";
import styles from "../review-workspace.module.css";
import type { ApiPlan } from "./api-api-plan";
import { assignmentControlFieldStyle } from "./model-assignment-control-field-style";
import { assignmentControlGridStyle } from "./model-assignment-control-grid-style";
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
  const { updateRound } = controller;
  return (
    <details className={styles.reviewerTargeting}>
      <summary>
        <span>
          <strong>Bulk assignment targeting</strong>
          <small>Optionally limit automatic distribution to one proposal track.</small>
        </span>
        <span>{round.trackFilter?.trim().length ? round.trackFilter : "All tracks"}</span>
      </summary>
      <div className={styles.reviewerTargetingGrid} style={assignmentControlGridStyle}>
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
