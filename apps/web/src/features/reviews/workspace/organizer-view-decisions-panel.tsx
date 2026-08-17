"use client";
import { Button } from "../../../components/ui/button";
import styles from "../review-workspace.module.css";
import { DecisionEditor } from "./organizer-decision-editor";
import type { DecisionStatus } from "./organizer-decision-status";
import type { OrganizerWorkspaceViewController } from "./organizer-view-controller";
import { OrganizerDecisionTable } from "./organizer-view-decision-table";
import { OrganizerSubmittedReviews } from "./organizer-view-submitted-reviews";
export function OrganizerDecisionsPanel({
  controller,
}: Readonly<{ controller: OrganizerWorkspaceViewController }>) {
  const {
    seed,
    baseUrl,
    selectedRoundId,
    setSelectedRoundId,
    selectedRound,
    aggregateLoading,
    aggregateError,
    aggregateSort,
    setAggregateSort,
    exportMessage,
    decisionQuery,
    setDecisionQuery,
    decisionFilter,
    setDecisionFilter,
    decisionRowLimit,
    setDecisionRowLimit,
    filteredDecisionRows,
    visibleDecisionRows,
    selectedAggregate,
    setSelectedDecisionId,
    decisionEditorRef,
    exportResults,
    setView,
    reviewerMembers,
  } = controller;
  if (seed.status === "draft") {
    return (
      <section className={styles.section} aria-labelledby="aggregate-heading">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.sectionEyebrow}>Results</p>
            <h2 id="aggregate-heading">Results are not available yet</h2>
          </div>
        </div>
        <p className={styles.sectionIntro}>
          Finish the scorecard and reviewer setup, then open the plan. Scores and decisions will
          appear here after reviewers submit their work.
        </p>
        <Button type="button" onClick={() => setView("setup")}>
          Finish plan setup
        </Button>
      </section>
    );
  }
  return (
    <section className={styles.section} aria-labelledby="aggregate-heading">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.sectionEyebrow}>Results</p>
          <h2 id="aggregate-heading">Scores and decisions</h2>
        </div>
        <div className={styles.viewToolbar}>
          <Button
            size="sm"
            type="button"
            variant="outline"
            onClick={() =>
              setAggregateSort((current) => (current === "descending" ? "ascending" : "descending"))
            }
            aria-label={`Sort score ${aggregateSort === "descending" ? "ascending" : "descending"}`}
          >
            Sort score {aggregateSort === "descending" ? "ascending" : "descending"}
          </Button>
          <Button size="sm" type="button" variant="outline" onClick={() => void exportResults()}>
            Export CSV
          </Button>
        </div>
      </div>
      <div className={styles.formField}>
        <label htmlFor="organizer-aggregate-round">Review round</label>
        <select
          id="organizer-aggregate-round"
          value={selectedRoundId}
          onChange={(event) => {
            setSelectedRoundId(event.currentTarget.value);
            setSelectedDecisionId(null);
          }}
          disabled={aggregateLoading}
        >
          {seed.rounds.map((round) => (
            <option value={round.id} key={round.id}>
              {round.name}
            </option>
          ))}
        </select>
        <span className={styles.fieldHint}>
          Scores and decisions use the saved scorecard for this round.
        </span>
      </div>
      {aggregateLoading ? (
        <p className={styles.fieldHint} role="status">
          Loading aggregates for {selectedRound?.name ?? selectedRoundId}…
        </p>
      ) : null}
      {aggregateError ? (
        <p className={styles.formError} role="alert">
          {aggregateError} Existing organizer data remains available.
        </p>
      ) : null}
      <p className={styles.fieldHint}>
        Showing scores and decisions for {selectedRound?.name ?? selectedRoundId}.
      </p>
      <div className={styles.collectionToolbar}>
        <div className={styles.formField}>
          <label htmlFor="decision-search">Find a submission</label>
          <input
            id="decision-search"
            type="search"
            placeholder="Search title, reference, or speaker"
            value={decisionQuery}
            onChange={(event) => setDecisionQuery(event.currentTarget.value)}
          />
        </div>
        <div className={styles.formField}>
          <label htmlFor="decision-status-filter">Decision status</label>
          <select
            id="decision-status-filter"
            value={decisionFilter}
            onChange={(event) =>
              setDecisionFilter(event.currentTarget.value as "all" | "undecided" | DecisionStatus)
            }
          >
            <option value="undecided">Undecided</option>
            <option value="all">All submissions</option>
            <option value="accepted">Accepted</option>
            <option value="waitlisted">Waitlisted</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div className={styles.formField}>
          <label htmlFor="decision-row-limit">Rows shown</label>
          <select
            id="decision-row-limit"
            value={decisionRowLimit}
            onChange={(event) => setDecisionRowLimit(Number(event.currentTarget.value))}
          >
            {[5, 10, 25, 50, 100, 300].map((value) => (
              <option value={value} key={value}>
                {value === 300 ? "All 300" : value}
              </option>
            ))}
          </select>
        </div>
        <p className={styles.toolbarMeta} role="status">
          Showing {visibleDecisionRows.length} of {filteredDecisionRows.length} matching submissions
        </p>
      </div>
      {exportMessage ? (
        <p className={styles.fieldHint} role="status">
          {exportMessage}
        </p>
      ) : null}
      <OrganizerDecisionTable controller={controller} />
      {selectedAggregate ? (
        <div
          ref={decisionEditorRef}
          id={`decision-editor-${selectedAggregate.id}`}
          className={styles.selectedDecisionEditor}
          tabIndex={-1}
        >
          <OrganizerSubmittedReviews
            reviews={seed.submittedReviews.filter(
              (review) =>
                review.submissionId === selectedAggregate.id && review.roundId === selectedRoundId,
            )}
            reviewerMembers={reviewerMembers}
          />
          <DecisionEditor
            key={`${selectedAggregate.id}:${seed.decisionBySubmission[selectedAggregate.id]?.version ?? 0}`}
            aggregate={selectedAggregate}
            baseUrl={baseUrl}
            planId={seed.planId}
            decision={seed.decisionBySubmission[selectedAggregate.id]}
            onSaved={(decision) => controller.recordDecision(selectedAggregate.id, decision)}
          />
        </div>
      ) : (
        <p className={styles.fieldHint}>Choose Review in the table to open one decision editor.</p>
      )}
    </section>
  );
}
