"use client";
import { Button } from "../../../components/ui/button";
import styles from "../review-workspace.module.css";
import { submissionDisplayTitle } from "./model-submission-display-title";
import { DecisionStatusBadge } from "./organizer-decision-status-badge";
import type { OrganizerWorkspaceViewController } from "./organizer-view-controller";
export function OrganizerDecisionTable({
  controller,
}: Readonly<{ controller: OrganizerWorkspaceViewController }>) {
  const {
    seed,
    aggregateSort,
    visibleDecisionRows,
    selectedDecisionId,
    setSelectedDecisionId,
    selectedRound,
  } = controller;
  return (
    <>
      <div className={styles.tableWrap}>
        <table className={`${styles.dataTable} ${styles.decisionTable}`}>
          <caption>Proposal aggregates for {selectedRound?.name ?? "Selected round"}</caption>
          <thead>
            <tr>
              <th scope="col">Proposal</th>
              <th
                scope="col"
                aria-sort={aggregateSort === "descending" ? "descending" : "ascending"}
              >
                Counted score
              </th>
              <th scope="col">Reviews counted</th>
              <th scope="col">Safety signals</th>
              <th scope="col">Decision</th>
            </tr>
          </thead>
          <tbody>
            {visibleDecisionRows.map((aggregate) => {
              const decision = seed.decisionBySubmission[aggregate.id];
              return (
                <tr key={aggregate.id}>
                  <th scope="row" data-label="Proposal">
                    <strong>{submissionDisplayTitle(aggregate)}</strong>
                    {aggregate.participants?.length ? (
                      <span>
                        {aggregate.participants
                          .map((participant) =>
                            participant.role
                              ? `${participant.displayName} (${participant.role})`
                              : participant.displayName,
                          )
                          .join(" · ")}
                      </span>
                    ) : null}
                  </th>
                  <td data-label="Counted score">
                    <strong>{aggregate.countedScore}</strong> / {aggregate.possibleScore}
                  </td>
                  <td data-label="Reviews counted">
                    {aggregate.countedReviews} / {aggregate.expectedReviews}
                  </td>
                  <td data-label="Safety signals">
                    {aggregate.conflicts > 0
                      ? `${aggregate.conflicts} conflict${aggregate.conflicts === 1 ? "" : "s"}`
                      : "No conflicts"}
                    {aggregate.abstentions > 0 ? ` · ${aggregate.abstentions} abstention` : ""}
                  </td>
                  <td data-label="Decision">
                    <div className={styles.tableAction}>
                      {decision === undefined ? (
                        <span className={styles.mutedLabel}>Not decided</span>
                      ) : (
                        <DecisionStatusBadge status={decision.status} />
                      )}
                      <Button
                        className={styles.tableActionButton}
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setSelectedDecisionId((current) =>
                            current === aggregate.id ? null : aggregate.id,
                          )
                        }
                      >
                        {selectedDecisionId === aggregate.id ? "Hide editor" : "Review"}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={styles.tableNote}>Scores count only after a reviewer confirms or edits them.</p>
      {visibleDecisionRows.length === 0 ? (
        <p className={styles.emptyText}>No proposals match these decision filters.</p>
      ) : null}
    </>
  );
}
