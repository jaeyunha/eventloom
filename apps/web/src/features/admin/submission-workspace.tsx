"use client";

import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";
import styles from "./submission-workspace.module.css";

export type SubmissionStatus =
  | "submitted"
  | "under_review"
  | "accepted"
  | "waitlisted"
  | "declined"
  | "withdrawn";

export interface SubmissionParticipant {
  id: string;
  name: string;
  email: string;
  role: string;
  organization: string;
}

export interface SubmissionAnswer {
  question: string;
  answer: string;
}

export interface SubmissionTimelineEntry {
  label: string;
  at: string;
  detail: string;
}

export interface ReviewAssignment {
  reviewer: string;
  status: "complete" | "in_progress" | "not_started" | "abstained";
  score?: number;
  conflict?: string;
}

export interface SubmissionRecord {
  eventId: string;
  id: string;
  title: string;
  status: SubmissionStatus;
  track: string;
  format: string;
  version: number;
  submittedAt: string;
  updatedAt: string;
  participants: SubmissionParticipant[];
  participantProgress: { completed: number; total: number };
  abstract: string;
  answers: SubmissionAnswer[];
  timeline: SubmissionTimelineEntry[];
  reviewSummary: {
    completed: number;
    total: number;
    averageScore: number | null;
    maxScore: number;
    recommendation: string;
  };
  reviewAssignments: ReviewAssignment[];
  organizerNotes: string;
  reopenAudit: { at: string; organizer: string; reason: string }[];
}

const seededSubmissions: SubmissionRecord[] = [
  {
    eventId: "summit-2026",
    id: "sub-001",
    title: "Designing for Trust in AI-Assisted Teams",
    status: "under_review",
    track: "Product & Design",
    format: "Talk",
    version: 3,
    submittedAt: "2026-03-12T14:30:00Z",
    updatedAt: "2026-04-02T09:15:00Z",
    participants: [
      {
        id: "person-001",
        name: "Maya Chen",
        email: "maya.chen@example.test",
        role: "Lead speaker",
        organization: "Northstar Labs",
      },
      {
        id: "person-002",
        name: "Jordan Williams",
        email: "jordan.williams@example.test",
        role: "Co-speaker",
        organization: "Northstar Labs",
      },
    ],
    participantProgress: { completed: 2, total: 2 },
    abstract:
      "Teams are adopting AI assistants faster than they are updating the habits that keep decisions accountable. This talk shares a practical trust framework for making human ownership visible without slowing down delivery.",
    answers: [
      {
        question: "Who is this session for?",
        answer: "Product, design, and engineering leads building AI-assisted workflows.",
      },
      {
        question: "What will attendees take away?",
        answer:
          "A lightweight decision log, review checklist, and a set of prompts for surfacing uncertainty.",
      },
      { question: "Content level", answer: "Intermediate" },
    ],
    timeline: [
      { label: "Submitted", at: "2026-03-12T14:30:00Z", detail: "Maya Chen submitted version 1." },
      {
        label: "Edited",
        at: "2026-03-20T10:05:00Z",
        detail: "The abstract and audience answer were updated.",
      },
      {
        label: "Edited",
        at: "2026-03-28T16:40:00Z",
        detail: "Jordan Williams was added as a co-speaker.",
      },
      {
        label: "Review started",
        at: "2026-04-01T08:00:00Z",
        detail: "The Product & Design review round was opened.",
      },
    ],
    reviewSummary: {
      completed: 2,
      total: 3,
      averageScore: 4.5,
      maxScore: 5,
      recommendation: "Strong accept",
    },
    reviewAssignments: [
      { reviewer: "Avery Patel", status: "complete", score: 5 },
      { reviewer: "Sam Rivera", status: "complete", score: 4 },
      { reviewer: "Lee Okafor", status: "in_progress" },
    ],
    organizerNotes:
      "The committee asked for a clearer note about measurement. Confirm the revised example before final programming.",
    reopenAudit: [],
  },
  {
    eventId: "summit-2026",
    id: "sub-002",
    title: "A Field Guide to Humane Observability",
    status: "submitted",
    track: "Engineering",
    format: "Workshop",
    version: 1,
    submittedAt: "2026-03-16T11:20:00Z",
    updatedAt: "2026-03-16T11:20:00Z",
    participants: [
      {
        id: "person-003",
        name: "Ravi Shah",
        email: "ravi.shah@example.test",
        role: "Lead speaker",
        organization: "Cedar Systems",
      },
    ],
    participantProgress: { completed: 1, total: 1 },
    abstract:
      "Observability can help teams learn from production without turning every metric into a performance score. This hands-on workshop maps humane practices to the tools teams already use.",
    answers: [
      {
        question: "Who is this session for?",
        answer: "Engineers and technical program leaders responsible for reliable services.",
      },
      {
        question: "What should attendees bring?",
        answer: "A recent incident retrospective and one dashboard they want to improve.",
      },
      { question: "Content level", answer: "Intermediate" },
    ],
    timeline: [
      { label: "Submitted", at: "2026-03-16T11:20:00Z", detail: "Ravi Shah submitted version 1." },
    ],
    reviewSummary: {
      completed: 0,
      total: 3,
      averageScore: null,
      maxScore: 5,
      recommendation: "Awaiting review",
    },
    reviewAssignments: [
      { reviewer: "Nia Brooks", status: "not_started" },
      { reviewer: "Theo Martin", status: "not_started" },
      { reviewer: "Casey Nguyen", status: "not_started" },
    ],
    organizerNotes:
      "The workshop needs a room with movable tables and a reliable Wi-Fi connection.",
    reopenAudit: [],
  },
  {
    eventId: "summit-2026",
    id: "sub-003",
    title: "Building Resilient Teams Through Small Experiments",
    status: "accepted",
    track: "People & Culture",
    format: "Talk",
    version: 2,
    submittedAt: "2026-02-27T17:00:00Z",
    updatedAt: "2026-03-30T13:25:00Z",
    participants: [
      {
        id: "person-004",
        name: "Elena Garcia",
        email: "elena.garcia@example.test",
        role: "Lead speaker",
        organization: "Common Thread",
      },
      {
        id: "person-005",
        name: "Noah Kim",
        email: "noah.kim@example.test",
        role: "Co-speaker",
        organization: "Common Thread",
      },
    ],
    participantProgress: { completed: 1, total: 2 },
    abstract:
      "Resilience is a practice, not a trait. Elena and Noah share small, repeatable experiments that make team capacity and care visible during periods of change.",
    answers: [
      {
        question: "Who is this session for?",
        answer: "People managers and team leads supporting teams through change.",
      },
      {
        question: "What will attendees take away?",
        answer: "Three experiments that can be run in one week with a small team.",
      },
      { question: "Content level", answer: "Introductory" },
    ],
    timeline: [
      {
        label: "Submitted",
        at: "2026-02-27T17:00:00Z",
        detail: "Elena Garcia submitted version 1.",
      },
      {
        label: "Accepted",
        at: "2026-03-22T12:00:00Z",
        detail: "An organizer recorded the final program decision.",
      },
      { label: "Edited", at: "2026-03-30T13:25:00Z", detail: "The speaker bio was updated." },
    ],
    reviewSummary: {
      completed: 3,
      total: 3,
      averageScore: 4.7,
      maxScore: 5,
      recommendation: "Accept",
    },
    reviewAssignments: [
      { reviewer: "Avery Patel", status: "complete", score: 5 },
      { reviewer: "Nia Brooks", status: "complete", score: 4 },
      { reviewer: "Casey Nguyen", status: "complete", score: 5 },
    ],
    organizerNotes: "Accepted. Speaker onboarding is waiting for the second participant's profile.",
    reopenAudit: [],
  },
  {
    eventId: "summit-2026",
    id: "sub-004",
    title: "Community-Led Design Systems",
    status: "waitlisted",
    track: "Product & Design",
    format: "Panel",
    version: 1,
    submittedAt: "2026-03-05T08:45:00Z",
    updatedAt: "2026-03-24T15:10:00Z",
    participants: [
      {
        id: "person-006",
        name: "Tessa Morgan",
        email: "tessa.morgan@example.test",
        role: "Lead speaker",
        organization: "Harbor Studio",
      },
    ],
    participantProgress: { completed: 1, total: 1 },
    abstract:
      "A panel about the maintenance habits that let design systems grow with the communities that depend on them, from contribution paths to respectful deprecation.",
    answers: [
      {
        question: "Who is this session for?",
        answer: "Design system maintainers, product designers, and frontend engineers.",
      },
      { question: "Preferred format", answer: "Panel with moderated audience questions." },
      { question: "Content level", answer: "Intermediate" },
    ],
    timeline: [
      {
        label: "Submitted",
        at: "2026-03-05T08:45:00Z",
        detail: "Tessa Morgan submitted version 1.",
      },
      {
        label: "Waitlisted",
        at: "2026-03-24T15:10:00Z",
        detail: "An organizer moved the proposal to the waitlist.",
      },
    ],
    reviewSummary: {
      completed: 3,
      total: 3,
      averageScore: 3.8,
      maxScore: 5,
      recommendation: "Hold for capacity",
    },
    reviewAssignments: [
      { reviewer: "Sam Rivera", status: "complete", score: 4 },
      { reviewer: "Lee Okafor", status: "complete", score: 4 },
      { reviewer: "Theo Martin", status: "complete", score: 3 },
    ],
    organizerNotes: "Strong fit for the design track; hold until the room capacity is confirmed.",
    reopenAudit: [],
  },
  {
    eventId: "forge-2025",
    id: "sub-101",
    title: "Public Infrastructure, Private Responsibility",
    status: "declined",
    track: "Civic Technology",
    format: "Talk",
    version: 1,
    submittedAt: "2025-09-06T12:15:00Z",
    updatedAt: "2025-09-21T10:00:00Z",
    participants: [
      {
        id: "person-101",
        name: "Morgan Lee",
        email: "morgan.lee@example.test",
        role: "Lead speaker",
        organization: "Civic Works",
      },
    ],
    participantProgress: { completed: 1, total: 1 },
    abstract:
      "A case study in making public-interest infrastructure legible, maintainable, and accountable across organizational boundaries.",
    answers: [
      {
        question: "Who is this session for?",
        answer: "People building and maintaining civic technology.",
      },
      { question: "Content level", answer: "Intermediate" },
    ],
    timeline: [
      { label: "Submitted", at: "2025-09-06T12:15:00Z", detail: "Morgan Lee submitted version 1." },
      {
        label: "Declined",
        at: "2025-09-21T10:00:00Z",
        detail: "An organizer recorded the final decision.",
      },
    ],
    reviewSummary: {
      completed: 2,
      total: 2,
      averageScore: 3.2,
      maxScore: 5,
      recommendation: "Do not select",
    },
    reviewAssignments: [
      { reviewer: "Robin Ellis", status: "complete", score: 3 },
      {
        reviewer: "Drew Park",
        status: "complete",
        score: 3,
        conflict: "Reviewer disclosed a prior collaboration and abstained from the decision.",
      },
    ],
    organizerNotes: "Historical seed for event-isolation checks; not part of Summit 2026.",
    reopenAudit: [],
  },
];

export { seededSubmissions };

const statusLabels: Record<SubmissionStatus, string> = {
  submitted: "Submitted",
  under_review: "Under review",
  accepted: "Accepted",
  waitlisted: "Waitlisted",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

const statusTone: Record<SubmissionStatus, string> = {
  submitted: styles.toneInfo ?? "",
  under_review: styles.toneWarning ?? "",
  accepted: styles.toneSuccess ?? "",
  waitlisted: styles.toneNeutral ?? "",
  declined: styles.toneDanger ?? "",
  withdrawn: styles.toneNeutral ?? "",
};

const reviewStatusLabels: Record<ReviewAssignment["status"], string> = {
  complete: "Complete",
  in_progress: "In progress",
  not_started: "Not started",
  abstained: "Abstained",
};

type SortKey = "title" | "status" | "updatedAt";
type SortDirection = "asc" | "desc";

const sortLabels: Record<SortKey, string> = {
  title: "Title",
  status: "Status",
  updatedAt: "Last updated",
};

export function getSeededSubmissionsForEvent(eventId: string): SubmissionRecord[] {
  return seededSubmissions.filter((submission) => submission.eventId === eventId);
}

export function getSeededSubmission(
  eventId: string,
  submissionId: string,
): SubmissionRecord | undefined {
  return seededSubmissions.find(
    (submission) => submission.eventId === eventId && submission.id === submissionId,
  );
}

function eventTitle(eventId: string): string {
  if (eventId === "summit-2026") {
    return "Open Sessionboard Summit 2026";
  }
  if (eventId === "forge-2025") {
    return "Forge Community Day 2025";
  }
  return eventId
    .split(/[-_]/u)
    .filter(Boolean)
    .map((part) => part[0]?.toLocaleUpperCase() + part.slice(1))
    .join(" ");
}

function submissionHref(eventId: string, submissionId: string): string {
  return `/admin/events/${encodeURIComponent(eventId)}/submissions/${encodeURIComponent(submissionId)}`;
}

function submissionListHref(eventId: string): string {
  return `/admin/events/${encodeURIComponent(eventId)}/submissions`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}

function initials(name: string): string {
  return name
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toLocaleUpperCase();
}

function StatusBadge({ status }: Readonly<{ status: SubmissionStatus }>) {
  return (
    <span className={`${styles.statusBadge} ${statusTone[status]}`}>
      <span className={styles.statusDot} aria-hidden="true" />
      {statusLabels[status]}
    </span>
  );
}

function ProgressMeter({
  completed,
  total,
  label,
}: Readonly<{ completed: number; total: number; label: string }>) {
  const value = total === 0 ? 0 : Math.round((completed / total) * 100);
  return (
    <span className={styles.progressCell}>
      <span className={styles.progressText}>
        {completed}/{total}
      </span>
      <span
        className={styles.progressTrack}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={completed}
      >
        <span className={styles.progressFill} style={{ width: `${value}%` }} />
      </span>
    </span>
  );
}

export function SubmissionListWorkspace({ eventId }: Readonly<{ eventId: string }>) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<SubmissionStatus | "all">("all");
  const [track, setTrack] = useState("all");
  const [format, setFormat] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const submissions = useMemo(() => getSeededSubmissionsForEvent(eventId), [eventId]);
  const tracks = useMemo(
    () => [...new Set(submissions.map((submission) => submission.track))].sort(),
    [submissions],
  );
  const formats = useMemo(
    () => [...new Set(submissions.map((submission) => submission.format))].sort(),
    [submissions],
  );
  const filteredSubmissions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return submissions
      .filter((submission) => {
        if (status !== "all" && submission.status !== status) return false;
        if (track !== "all" && submission.track !== track) return false;
        if (format !== "all" && submission.format !== format) return false;
        if (!query) return true;
        return [
          submission.title,
          submission.track,
          submission.format,
          ...submission.participants.map((participant) => participant.name),
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query);
      })
      .sort((left, right) => {
        const leftValue = sortKey === "status" ? statusLabels[left.status] : left[sortKey];
        const rightValue = sortKey === "status" ? statusLabels[right.status] : right[sortKey];
        const result = String(leftValue).localeCompare(String(rightValue));
        return sortDirection === "asc" ? result : -result;
      });
  }, [format, search, sortDirection, sortKey, status, submissions, track]);

  const selectedVisibleCount = filteredSubmissions.filter((submission) =>
    selected.has(submission.id),
  ).length;
  const allVisibleSelected =
    filteredSubmissions.length > 0 && selectedVisibleCount === filteredSubmissions.length;

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === "updatedAt" ? "desc" : "asc");
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        filteredSubmissions.forEach((submission) => {
          next.delete(submission.id);
        });
      } else {
        filteredSubmissions.forEach((submission) => {
          next.add(submission.id);
        });
      }
      return next;
    });
  }

  const eventName = eventTitle(eventId);

  return (
    <div className={styles.workspaceRoot}>
      <a className={styles.skipLink} href="#submission-list-content">
        Skip to submissions
      </a>
      <header className={styles.workspaceHeader}>
        <div>
          <p className={styles.eyebrow}>Organizer workspace</p>
          <h1>Submissions</h1>
          <p className={styles.pageDescription}>
            Review and manage proposals for <strong>{eventName}</strong>.
          </p>
        </div>
        <Link className={styles.backLink} href="/admin/events">
          Back to events
        </Link>
      </header>

      <div id="submission-list-content" className={styles.workspaceMain} tabIndex={-1}>
        <section className={styles.summaryBar} aria-label="Submission summary">
          <div>
            <strong>{submissions.length}</strong>
            <span>total submissions</span>
          </div>
          <div>
            <strong>
              {submissions.filter((submission) => submission.status === "under_review").length}
            </strong>
            <span>in review</span>
          </div>
          <div>
            <strong>
              {submissions.filter((submission) => submission.status === "accepted").length}
            </strong>
            <span>accepted</span>
          </div>
          <div className={styles.summaryNote}>
            <span>Seeded organizer view</span>
            <small>No live credentials or API data are used.</small>
          </div>
        </section>

        <section className={styles.listPanel} aria-labelledby="submission-table-heading">
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Event intake</p>
              <h2 id="submission-table-heading">All submissions</h2>
              <p className={styles.mutedText}>
                {filteredSubmissions.length} of {submissions.length} shown
                {selectedVisibleCount > 0 ? ` · ${selectedVisibleCount} selected` : ""}
              </p>
            </div>
            <label className={styles.searchField} htmlFor="submission-search">
              <span>Search submissions</span>
              <input
                id="submission-search"
                type="search"
                value={search}
                placeholder="Title, track, format, or participant"
                onChange={(event) => setSearch(event.currentTarget.value)}
              />
            </label>
          </div>

          <fieldset className={styles.filters} aria-label="Submission filters">
            <div className={styles.filterField}>
              <label htmlFor="submission-status">Status</label>
              <select
                id="submission-status"
                value={status}
                onChange={(event) =>
                  setStatus(event.currentTarget.value as SubmissionStatus | "all")
                }
              >
                <option value="all">All statuses</option>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.filterField}>
              <label htmlFor="submission-track">Track</label>
              <select
                id="submission-track"
                value={track}
                onChange={(event) => setTrack(event.currentTarget.value)}
              >
                <option value="all">All tracks</option>
                {tracks.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.filterField}>
              <label htmlFor="submission-format">Format</label>
              <select
                id="submission-format"
                value={format}
                onChange={(event) => setFormat(event.currentTarget.value)}
              >
                <option value="all">All formats</option>
                {formats.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <button
              className={styles.clearButton}
              type="button"
              onClick={() => {
                setSearch("");
                setStatus("all");
                setTrack("all");
                setFormat("all");
              }}
            >
              Clear filters
            </button>
          </fieldset>

          {filteredSubmissions.length === 0 ? (
            <div className={styles.emptyState} role="status">
              <h3>No matching submissions</h3>
              <p>
                Try a different search or clear the filters to see this event&apos;s seeded
                submissions.
              </p>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.submissionTable}>
                <caption className={styles.srOnly}>Submissions for {eventName}</caption>
                <thead>
                  <tr>
                    <th className={styles.checkboxColumn} scope="col">
                      <label className={styles.checkboxLabel}>
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={toggleAllVisible}
                          aria-label="Select all visible submissions"
                        />
                        <span className={styles.srOnly}>Select all visible submissions</span>
                      </label>
                    </th>
                    <SortableHeader
                      sortKey="title"
                      activeKey={sortKey}
                      direction={sortDirection}
                      onSort={toggleSort}
                    >
                      Submission
                    </SortableHeader>
                    <SortableHeader
                      sortKey="status"
                      activeKey={sortKey}
                      direction={sortDirection}
                      onSort={toggleSort}
                    >
                      Status
                    </SortableHeader>
                    <th scope="col">Participants</th>
                    <th scope="col">Review progress</th>
                    <th scope="col">Track / format</th>
                    <SortableHeader
                      sortKey="updatedAt"
                      activeKey={sortKey}
                      direction={sortDirection}
                      onSort={toggleSort}
                    >
                      Updated
                    </SortableHeader>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubmissions.map((submission) => (
                    <tr key={submission.id}>
                      <td className={styles.checkboxColumn}>
                        <label className={styles.checkboxLabel}>
                          <input
                            type="checkbox"
                            checked={selected.has(submission.id)}
                            onChange={() => toggleSelected(submission.id)}
                            aria-label={`Select ${submission.title}`}
                          />
                          <span className={styles.srOnly}>Select {submission.title}</span>
                        </label>
                      </td>
                      <th scope="row" className={styles.titleCell}>
                        <Link
                          className={styles.submissionLink}
                          href={submissionHref(eventId, submission.id)}
                        >
                          {submission.title}
                        </Link>
                        <span className={styles.submissionMeta}>
                          {submission.id} · v{submission.version}
                        </span>
                      </th>
                      <td>
                        <StatusBadge status={submission.status} />
                      </td>
                      <td>
                        <ProgressMeter
                          completed={submission.participantProgress.completed}
                          total={submission.participantProgress.total}
                          label={`${submission.title} participant profile progress`}
                        />
                      </td>
                      <td>
                        <ProgressMeter
                          completed={submission.reviewSummary.completed}
                          total={submission.reviewSummary.total}
                          label={`${submission.title} review progress`}
                        />
                      </td>
                      <td>
                        <span className={styles.trackValue}>{submission.track}</span>
                        <span className={styles.submissionMeta}>{submission.format}</span>
                      </td>
                      <td>
                        <time dateTime={submission.updatedAt}>
                          {formatDate(submission.updatedAt)}
                        </time>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SortableHeader({
  sortKey,
  activeKey,
  direction,
  onSort,
  children,
}: Readonly<{
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  onSort: (sortKey: SortKey) => void;
  children: string;
}>) {
  const active = activeKey === sortKey;
  return (
    <th
      scope="col"
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        className={styles.sortButton}
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`Sort by ${sortLabels[sortKey]}`}
      >
        {children}
        <span aria-hidden="true">{active ? (direction === "asc" ? "↑" : "↓") : "↕"}</span>
      </button>
    </th>
  );
}

export function SubmissionDetailWorkspace({
  eventId,
  submissionId,
}: Readonly<{ eventId: string; submissionId: string }>) {
  const submission = getSeededSubmission(eventId, submissionId);
  if (!submission) {
    return (
      <div className={styles.workspaceRoot}>
        <div className={styles.notFound}>
          <p className={styles.eyebrow}>Organizer workspace</p>
          <h1>Submission not found</h1>
          <p>This submission is not part of the selected event.</p>
          <Link className={styles.primaryLink} href={submissionListHref(eventId)}>
            Back to submissions
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.workspaceRoot}>
      <a className={styles.skipLink} href="#submission-detail-content">
        Skip to submission details
      </a>
      <header className={styles.workspaceHeader}>
        <div>
          <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
            <Link href="/admin/events">{eventTitle(eventId)}</Link>
            <span aria-hidden="true">/</span>
            <Link href={submissionListHref(eventId)}>Submissions</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{submission.id}</span>
          </nav>
          <p className={styles.eyebrow}>Organizer submission detail</p>
          <div className={styles.detailTitleRow}>
            <h1>{submission.title}</h1>
            <StatusBadge status={submission.status} />
          </div>
          <p className={styles.pageDescription}>
            {submission.id} · version {submission.version} · last updated{" "}
            <time dateTime={submission.updatedAt}>{formatDate(submission.updatedAt)}</time>
          </p>
        </div>
        <Link className={styles.backLink} href={submissionListHref(eventId)}>
          Back to submissions
        </Link>
      </header>

      <div id="submission-detail-content" className={styles.workspaceMain} tabIndex={-1}>
        <div className={styles.detailGrid}>
          <div className={styles.detailPrimary}>
            <section className={styles.detailPanel} aria-labelledby="abstract-heading">
              <div className={styles.panelHeading}>
                <div>
                  <p className={styles.eyebrow}>Submission content</p>
                  <h2 id="abstract-heading">Abstract</h2>
                </div>
                <span className={styles.versionBadge}>Version {submission.version}</span>
              </div>
              <p className={styles.abstract}>{submission.abstract}</p>
            </section>

            <section className={styles.detailPanel} aria-labelledby="answers-heading">
              <p className={styles.eyebrow}>Form responses</p>
              <h2 id="answers-heading">Structured answers</h2>
              <dl className={styles.answerList}>
                {submission.answers.map((answer) => (
                  <div key={answer.question}>
                    <dt>{answer.question}</dt>
                    <dd>{answer.answer}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className={styles.detailPanel} aria-labelledby="timeline-heading">
              <p className={styles.eyebrow}>Audit history</p>
              <h2 id="timeline-heading">Lifecycle timeline</h2>
              <ol className={styles.timeline}>
                {submission.timeline.map((entry) => (
                  <li key={`${entry.label}-${entry.at}`}>
                    <span className={styles.timelineMarker} aria-hidden="true" />
                    <div>
                      <h3>{entry.label}</h3>
                      <time dateTime={entry.at}>{formatDateTime(entry.at)}</time>
                      <p>{entry.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <ReopenControl submission={submission} />
          </div>

          <aside className={styles.detailAside} aria-label="Organizer-only submission information">
            <section className={styles.detailPanel} aria-labelledby="participants-heading">
              <p className={styles.eyebrow}>Private organizer view</p>
              <h2 id="participants-heading">Participants</h2>
              <ul className={styles.participantList}>
                {submission.participants.map((participant) => (
                  <li key={participant.id}>
                    <span className={styles.avatar} aria-hidden="true">
                      {initials(participant.name)}
                    </span>
                    <div>
                      <strong>{participant.name}</strong>
                      <span>
                        {participant.role} · {participant.organization}
                      </span>
                      <a href={`mailto:${participant.email}`}>{participant.email}</a>
                    </div>
                  </li>
                ))}
              </ul>
              <ProgressMeter
                completed={submission.participantProgress.completed}
                total={submission.participantProgress.total}
                label="Participant profile completion"
              />
            </section>

            <section className={styles.detailPanel} aria-labelledby="review-heading">
              <p className={styles.eyebrow}>Committee activity</p>
              <h2 id="review-heading">Review score summary</h2>
              <div className={styles.scoreSummary}>
                <strong>
                  {submission.reviewSummary.averageScore === null
                    ? "—"
                    : `${submission.reviewSummary.averageScore}/${submission.reviewSummary.maxScore}`}
                </strong>
                <span>{submission.reviewSummary.recommendation}</span>
              </div>
              <ProgressMeter
                completed={submission.reviewSummary.completed}
                total={submission.reviewSummary.total}
                label="Completed reviews"
              />
              <ul className={styles.assignmentList}>
                {submission.reviewAssignments.map((assignment) => (
                  <li key={assignment.reviewer}>
                    <div>
                      <strong>{assignment.reviewer}</strong>
                      <span>
                        {reviewStatusLabels[assignment.status]}
                        {assignment.score === undefined
                          ? ""
                          : ` · ${assignment.score}/${submission.reviewSummary.maxScore}`}
                      </span>
                    </div>
                    {assignment.conflict ? (
                      <p className={styles.conflictNotice}>Conflict: {assignment.conflict}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>

            <section className={styles.detailPanel} aria-labelledby="assignment-heading">
              <p className={styles.eyebrow}>Access controls</p>
              <h2 id="assignment-heading">Assignment &amp; conflicts</h2>
              <p className={styles.mutedText}>
                Assignments are event-scoped. A declared conflict removes reviewer access and keeps
                the submission out of that reviewer&apos;s queue.
              </p>
              <ul className={styles.conflictList}>
                {submission.reviewAssignments
                  .filter((assignment) => assignment.conflict)
                  .map((assignment) => (
                    <li key={assignment.reviewer}>
                      <strong>{assignment.reviewer}</strong> — {assignment.conflict}
                    </li>
                  ))}
              </ul>
              {submission.reviewAssignments.every((assignment) => !assignment.conflict) ? (
                <p className={styles.noConflict}>No conflicts recorded for this submission.</p>
              ) : null}
            </section>

            <section className={styles.detailPanel} aria-labelledby="notes-heading">
              <p className={styles.eyebrow}>Private organizer note</p>
              <h2 id="notes-heading">Organizer notes</h2>
              <p className={styles.mutedText}>{submission.organizerNotes}</p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function ReopenControl({ submission }: Readonly<{ submission: SubmissionRecord }>) {
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saved, setSaved] = useState(false);
  const canSubmit = reason.trim().length >= 10 && confirmed;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setSaved(true);
  }

  return (
    <section
      className={`${styles.detailPanel} ${styles.reopenPanel}`}
      aria-labelledby="reopen-heading"
    >
      <p className={styles.eyebrow}>Restricted action</p>
      <h2 id="reopen-heading">Reopen submission</h2>
      <p>
        Organizer-only control for a post-close edit. A human organizer must provide the reason and
        confirm the action; automated tools cannot reopen a submission or make a final decision.
      </p>
      <p className={styles.auditCallout} role="note">
        Every reopen is recorded in the audit log with the organizer identity, timestamp, and
        reason.
        {submission.reopenAudit.length > 0
          ? ` ${submission.reopenAudit.length} prior reopen event${submission.reopenAudit.length === 1 ? "" : "s"} recorded.`
          : " No prior reopen events are recorded."}
      </p>
      <form onSubmit={handleSubmit}>
        <label className={styles.textareaLabel} htmlFor="reopen-reason">
          Human-authored reason
        </label>
        <textarea
          id="reopen-reason"
          name="reopenReason"
          value={reason}
          minLength={10}
          required
          rows={4}
          placeholder="Explain why this submission needs to be reopened."
          aria-describedby="reopen-reason-help"
          onChange={(event) => {
            setReason(event.currentTarget.value);
            setSaved(false);
          }}
        />
        <p className={styles.fieldHelp} id="reopen-reason-help">
          Use at least 10 characters. This text becomes part of the immutable audit record.
        </p>
        <label className={styles.confirmLabel}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => {
              setConfirmed(event.currentTarget.checked);
              setSaved(false);
            }}
          />
          <span>I confirm that reopening is necessary and authorized for this event.</span>
        </label>
        <button className={styles.dangerButton} type="submit" disabled={!canSubmit}>
          Reopen and write audit event
        </button>
        {saved ? (
          <p className={styles.successMessage} role="status">
            Reopen request recorded for organizer review. The audit event includes your reason.
          </p>
        ) : null}
      </form>
    </section>
  );
}

export const AdminSubmissionList = SubmissionListWorkspace;
export const AdminSubmissionDetail = SubmissionDetailWorkspace;
