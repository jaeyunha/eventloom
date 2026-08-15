"use client";

import { useState } from "react";
import { filterSubmissions, portalSubmissionIdsMatch } from "./model";
import styles from "./portal.module.css";
import { usePortal } from "./portal-provider";
import { PortalSubmissionCard } from "./portal-submission-card";
import { EmptyState, PageHeading, PortalContentState } from "./portal-ui";

export {
  canonicalPortalSubmissionId,
  type PortalSubmissionActionTargets,
  portalSubmissionActionTargets,
  portalSubmissionDisplayTitle,
} from "./portal-submission-model";

export function PortalSubmissions() {
  return (
    <PortalContentState>
      <PortalSubmissionsContent />
    </PortalContentState>
  );
}

function PortalSubmissionsContent() {
  const { eventQuery, view, context, can } = usePortal();
  const [search, setSearch] = useState("");
  if (!view) return null;
  const submissions = filterSubmissions(view.submissions, search).filter(
    (candidate, index, all) =>
      all.findIndex((other) => portalSubmissionIdsMatch(other.id, candidate.id)) === index,
  );

  return (
    <div className={styles.submissionsPage}>
      <PageHeading
        eyebrow={context?.name ?? "Selected event"}
        title="Submissions"
        description="Follow each proposal from its persisted submission state through the event decision."
      />
      <section className={styles.panel} aria-labelledby="submissions-heading">
        <div className={styles.listToolbar}>
          <div>
            <h2 id="submissions-heading">Submission statuses</h2>
            <p className={styles.toolbarDescription}>
              {view.submissions.length} {view.submissions.length === 1 ? "proposal" : "proposals"}
            </p>
          </div>
          <label className={styles.searchField}>
            <span className={styles.srOnly}>Search submissions</span>
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={search}
              placeholder="Search by title"
              onChange={(event) => setSearch(event.currentTarget.value)}
            />
          </label>
        </div>
        {view.submissions.length === 0 ? (
          <EmptyState
            title="No submissions yet"
            description="A proposal appears here after it is persisted for this event."
          />
        ) : submissions.length === 0 ? (
          <EmptyState
            title="No matching submissions"
            description="Try a different title or clear your search."
            action={
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => setSearch("")}
              >
                Clear search
              </button>
            }
          />
        ) : (
          <div className={styles.submissionGrid}>
            {submissions.map((submission) => (
              <PortalSubmissionCard
                key={submission.id}
                canEdit={can("submission-edit")}
                context={context}
                eventQuery={eventQuery}
                equivalents={view.submissions}
                submission={submission}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
