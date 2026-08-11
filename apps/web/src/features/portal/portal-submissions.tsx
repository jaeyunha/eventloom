"use client";

import Link from "next/link";
import { useState } from "react";
import { filterSubmissions, submissionStatusPresentation } from "./model";
import styles from "./portal.module.css";
import { usePortal } from "./portal-provider";
import {
  EmptyState,
  formatPortalDate,
  PageHeading,
  PortalContentState,
  SubmissionStatusBadge,
} from "./portal-ui";

export function portalSubmissionIdsMatch(left: string, right: string): boolean {
  const normalizedLeft = left.trim();
  const normalizedRight = right.trim();
  if (normalizedLeft.length === 0 || normalizedRight.length === 0) return false;
  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft === `speaker-submission:${normalizedRight}` ||
    normalizedRight === `speaker-submission:${normalizedLeft}`
  );
}

export function PortalSubmissions() {
  return (
    <PortalContentState>
      <PortalSubmissionsContent />
    </PortalContentState>
  );
}

function PortalSubmissionsContent() {
  const { eventQuery, view } = usePortal();
  const [search, setSearch] = useState("");
  if (!view) {
    return null;
  }
  const submissions = filterSubmissions(view.submissions, search).filter(
    (candidate, index, all) =>
      all.findIndex((other) => portalSubmissionIdsMatch(other.id, candidate.id)) === index,
  );

  return (
    <>
      <PageHeading
        eyebrow="Your sessions"
        title="Sessions"
        description="Follow each proposal as it becomes a session or reaches a final program decision."
      />
      <section className={styles.panel} aria-labelledby="sessions-heading">
        <div className={styles.listToolbar}>
          <div>
            <h2 id="sessions-heading">All sessions</h2>
            <p className={styles.toolbarDescription}>
              {view.submissions.length} {view.submissions.length === 1 ? "proposal" : "proposals"}
            </p>
          </div>
          <label className={styles.searchField}>
            <span className={styles.srOnly}>Search sessions</span>
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
            title="No sessions yet"
            description="When you submit a proposal, its session status will appear here."
          />
        ) : submissions.length === 0 ? (
          <EmptyState
            title="No matching sessions"
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
            {submissions.map((submission) => {
              const presentation = submissionStatusPresentation(submission.status);
              return (
                <article key={submission.id} className={styles.submissionTile}>
                  <div className={styles.submissionTileTop}>
                    <span className={styles.documentIcon} aria-hidden="true">
                      ▤
                    </span>
                    <SubmissionStatusBadge status={submission.status} />
                  </div>
                  <div>
                    <p className={styles.submissionId}>Session {submission.id}</p>
                    <h3>{submission.title}</h3>
                    <p>{presentation.description}</p>
                  </div>
                  <footer>
                    <span>Updated {formatPortalDate(submission.updatedAt) ?? "recently"}</span>
                    <Link
                      href={`/portal/submissions/${encodeURIComponent(submission.id)}${eventQuery}`}
                      aria-label={`View session status for ${submission.title}`}
                    >
                      View session status <span aria-hidden="true">→</span>
                    </Link>
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
