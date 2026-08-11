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
import type { PortalSubmission } from "./types";

export function portalSubmissionIdsMatch(left: string, right: string): boolean {
  const normalizedLeft = canonicalPortalSubmissionId(left);
  const normalizedRight = canonicalPortalSubmissionId(right);
  if (normalizedLeft.length === 0 || normalizedRight.length === 0) return false;
  return normalizedLeft === normalizedRight;
}
const speakerSubmissionPrefix = "speaker-submission:";
const submissionTitleAcronyms = new Set(["ai", "api", "cfp", "ci", "llm", "qa", "ui", "ux"]);
const submissionTitleMinorWords = new Set([
  "a",
  "an",
  "and",
  "at",
  "by",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

export function canonicalPortalSubmissionId(id: string): string {
  const normalized = id.trim();
  return normalized.toLocaleLowerCase().startsWith(speakerSubmissionPrefix)
    ? normalized.slice(speakerSubmissionPrefix.length).trim()
    : normalized;
}

function humanizeCanonicalSubmissionReference(reference: string): string {
  const marker = /(?:^|[-_/:])submission[-_/:]/iu.exec(reference);
  const titleReference =
    marker === null || marker.index === undefined
      ? reference
      : reference.slice(marker.index + marker[0].length);
  const words = titleReference
    .replace(/[-_]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (words.length === 0) return "Untitled submission";
  return words
    .map((word, index) => {
      const normalized = word.toLocaleLowerCase();
      if (submissionTitleAcronyms.has(normalized)) return normalized.toLocaleUpperCase();
      if (index > 0 && submissionTitleMinorWords.has(normalized)) return normalized;
      return `${normalized[0]?.toLocaleUpperCase() ?? ""}${normalized.slice(1)}`;
    })
    .join(" ");
}

function isMachineSubmissionTitle(
  title: string,
  submission: Pick<PortalSubmission, "id" | "title">,
): boolean {
  const normalizedTitle = title.trim().toLocaleLowerCase();
  if (normalizedTitle.length === 0) return true;
  const references = [submission.id, canonicalPortalSubmissionId(submission.id)].map((reference) =>
    reference.toLocaleLowerCase(),
  );
  return (
    references.includes(normalizedTitle) || normalizedTitle.startsWith(speakerSubmissionPrefix)
  );
}

export function portalSubmissionDisplayTitle(
  submission: Pick<PortalSubmission, "id" | "title">,
  equivalents: readonly Pick<PortalSubmission, "id" | "title">[] = [],
): string {
  const equivalent = equivalents.find(
    (candidate) =>
      portalSubmissionIdsMatch(candidate.id, submission.id) &&
      !isMachineSubmissionTitle(candidate.title, candidate),
  );
  if (equivalent !== undefined && equivalent.title.trim().length > 0) {
    return equivalent.title.trim();
  }
  if (
    !isMachineSubmissionTitle(submission.title, submission) &&
    submission.title.trim().length > 0
  ) {
    return submission.title.trim();
  }
  return humanizeCanonicalSubmissionReference(canonicalPortalSubmissionId(submission.id));
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
                    <h3>{portalSubmissionDisplayTitle(submission, view.submissions)}</h3>
                    <p>{presentation.description}</p>
                  </div>
                  <footer>
                    <span>Updated {formatPortalDate(submission.updatedAt) ?? "recently"}</span>
                    <Link
                      href={`/portal/submissions/${encodeURIComponent(submission.id)}${eventQuery}`}
                      aria-label={`View session status for ${portalSubmissionDisplayTitle(submission, view.submissions)}`}
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
