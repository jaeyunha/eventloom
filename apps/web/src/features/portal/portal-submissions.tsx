"use client";

import Link from "next/link";
import { useState } from "react";
import { filterSubmissions, submissionStatusPresentation } from "./model";
import { usePortal } from "./portal-provider";
import {
  EmptyState,
  PageHeading,
  PortalContentState,
  SubmissionStatusBadge,
  formatPortalDate,
} from "./portal-ui";
import styles from "./portal.module.css";

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
  const submissions = filterSubmissions(view.submissions, search);

  return (
    <>
      <PageHeading
        eyebrow="Your proposals"
        title="Submissions"
        description="Follow each proposal from submission through the final program decision."
      />
      <section className={styles.panel} aria-labelledby="submissions-heading">
        <div className={styles.listToolbar}>
          <div>
            <h2 id="submissions-heading">All submissions</h2>
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
            description="When you submit a proposal, its status will appear here."
          />
        ) : submissions.length === 0 ? (
          <EmptyState
            title="No matching submissions"
            description="Try a different title or clear your search."
            action={
              <button className={styles.secondaryButton} type="button" onClick={() => setSearch("")}>
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
                    <p className={styles.submissionId}>Submission {submission.id}</p>
                    <h3>{submission.title}</h3>
                    <p>{presentation.description}</p>
                  </div>
                  <footer>
                    <span>Updated {formatPortalDate(submission.updatedAt) ?? "recently"}</span>
                    <Link
                      href={`/portal/submissions/${encodeURIComponent(submission.id)}${eventQuery}`}
                      aria-label={`View status for ${submission.title}`}
                    >
                      View status <span aria-hidden="true">→</span>
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
