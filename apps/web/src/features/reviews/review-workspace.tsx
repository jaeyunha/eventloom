"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import styles from "./review-workspace.module.css";

export type ReviewWorkspaceMode = "organizer" | "evaluator";

export interface ReviewWorkspaceProps {
  eventId: string;
  mode?: ReviewWorkspaceMode;
}

type PlanStatus = "draft" | "open" | "closed";
type RoundStatus = "open" | "scheduled" | "closed";
type DecisionStatus = "accepted" | "waitlisted" | "rejected";

interface RubricCriterion {
  id: string;
  label: string;
  description: string;
  minimum: number;
  maximum: number;
  weight: number;
  required: boolean;
}

interface ReviewRound {
  id: string;
  name: string;
  status: RoundStatus;
  opensAt: string;
  closesAt: string;
  completionPercent: number;
  rubric: {
    name: string;
    criteria: readonly RubricCriterion[];
  };
}

interface AggregateRow {
  id: string;
  reference: string;
  title: string;
  countedScore: string;
  possibleScore: string;
  countedReviews: number;
  expectedReviews: number;
  conflicts: number;
  abstentions: number;
}

interface ReviewPlanSeed {
  eventId: string;
  eventName: string;
  planName: string;
  status: PlanStatus;
  opensAt: string;
  closesAt: string;
  blindReview: boolean;
  assignmentRule: {
    reviewsPerSubmission: number;
    maxAssignmentsPerReviewer: number;
  };
  rounds: readonly ReviewRound[];
  aggregates: readonly AggregateRow[];
  progress: {
    totalAssignments: number;
    assigned: number;
    inProgress: number;
    submitted: number;
    abstained: number;
    conflicts: number;
    completionPercent: number;
  };
}

interface EvaluatorAssignment {
  id: string;
  reference: string;
  title: string;
  abstract: string;
  round: ReviewRound;
  aiSuggestions: Readonly<Record<string, { value: number; evidence: readonly string[] }>>;
}

const SEEDED_CRITERIA: readonly RubricCriterion[] = [
  {
    id: "audience-impact",
    label: "Audience impact",
    description: "A clear, useful outcome for the Summit 2026 audience.",
    minimum: 1,
    maximum: 5,
    weight: 35,
    required: true,
  },
  {
    id: "clarity",
    label: "Clarity and structure",
    description: "A focused proposal with an understandable, practical arc.",
    minimum: 1,
    maximum: 5,
    weight: 25,
    required: true,
  },
  {
    id: "originality",
    label: "Originality",
    description: "A distinctive point of view, example, or approach.",
    minimum: 1,
    maximum: 5,
    weight: 20,
    required: true,
  },
  {
    id: "feasibility",
    label: "Delivery feasibility",
    description: "The scope and format can be delivered in the available session.",
    minimum: 1,
    maximum: 5,
    weight: 20,
    required: true,
  },
];

function createSeed(eventId: string): ReviewPlanSeed {
  const resolvedEventId = eventId.trim() || "summit-2026";
  const roundOne: ReviewRound = {
    id: "round-initial",
    name: "Initial committee review",
    status: "open",
    opensAt: "Aug 10, 2026",
    closesAt: "Aug 18, 2026",
    completionPercent: 67,
    rubric: { name: "Summit proposal rubric", criteria: SEEDED_CRITERIA },
  };
  const roundTwo: ReviewRound = {
    id: "round-calibration",
    name: "Calibration and final review",
    status: "scheduled",
    opensAt: "Aug 19, 2026",
    closesAt: "Aug 24, 2026",
    completionPercent: 0,
    rubric: { name: "Summit proposal rubric", criteria: SEEDED_CRITERIA },
  };

  return {
    eventId: resolvedEventId,
    eventName: "Summit 2026",
    planName: "Summit 2026 program committee",
    status: "open",
    opensAt: "Aug 10, 2026",
    closesAt: "Aug 24, 2026",
    blindReview: true,
    assignmentRule: { reviewsPerSubmission: 3, maxAssignmentsPerReviewer: 8 },
    rounds: [roundOne, roundTwo],
    aggregates: [
      {
        id: "submission-042",
        reference: "SUB-042",
        title: "Designing resilient public services",
        countedScore: "87.4",
        possibleScore: "100",
        countedReviews: 3,
        expectedReviews: 3,
        conflicts: 0,
        abstentions: 0,
      },
      {
        id: "submission-017",
        reference: "SUB-017",
        title: "A practical guide to calm incident response",
        countedScore: "81.2",
        possibleScore: "100",
        countedReviews: 2,
        expectedReviews: 3,
        conflicts: 1,
        abstentions: 1,
      },
      {
        id: "submission-031",
        reference: "SUB-031",
        title: "Making technical learning more inclusive",
        countedScore: "76.8",
        possibleScore: "100",
        countedReviews: 3,
        expectedReviews: 3,
        conflicts: 1,
        abstentions: 0,
      },
    ],
    progress: {
      totalAssignments: 18,
      assigned: 18,
      inProgress: 4,
      submitted: 12,
      abstained: 1,
      conflicts: 2,
      completionPercent: 67,
    },
  };
}

function createEvaluatorAssignment(seed: ReviewPlanSeed): EvaluatorAssignment {
  const round = seed.rounds[0] ?? {
    id: "round-initial",
    name: "Initial committee review",
    status: "open" as const,
    opensAt: seed.opensAt,
    closesAt: seed.closesAt,
    completionPercent: 0,
    rubric: { name: "Summit proposal rubric", criteria: SEEDED_CRITERIA },
  };

  return {
    id: "assignment-reviewer-07-submission-042",
    reference: "SUB-042",
    title: "Designing resilient public services",
    abstract:
      "This session gives practitioners a repeatable way to design services that remain useful when demand, staffing, or infrastructure changes. It combines a short planning model with examples participants can adapt to their own teams.",
    round,
    aiSuggestions: {
      "audience-impact": {
        value: 4,
        evidence: [
          "The abstract names a repeatable planning model.",
          "The proposed outcome is relevant to public-service teams.",
        ],
      },
      clarity: {
        value: 4,
        evidence: ["The proposal states a method and the intended participant outcome."],
      },
      originality: {
        value: 3,
        evidence: ["The approach combines service design and resilience examples."],
      },
      feasibility: {
        value: 5,
        evidence: ["The scope describes a practical model that fits a workshop-length session."],
      },
    },
  };
}

function formatPlanStatus(status: PlanStatus): string {
  return status === "open" ? "Open for review" : status[0].toUpperCase() + status.slice(1);
}

function formatRoundStatus(status: RoundStatus): string {
  if (status === "open") return "Open now";
  if (status === "scheduled") return "Scheduled";
  return "Closed";
}

function ProgressBar({ label, value }: Readonly<{ label: string; value: number }>) {
  return (
    <div className={styles.progressBlock}>
      <div className={styles.progressLabel}>
        <span>{label}</span>
        <strong>{value}%</strong>
      </div>
      <div
        className={styles.progressTrack}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
      >
        <span style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function AuthorityNotice() {
  return (
    <aside className={styles.authorityNotice} role="note" aria-labelledby="human-authority-title">
      <span className={styles.noticeIcon} aria-hidden="true">
        ✓
      </span>
      <div>
        <h2 id="human-authority-title">Human authority is required</h2>
        <p>
          AI suggestions never count toward an aggregate score and never decide an outcome. A human
          reviewer must confirm or edit every score, and a human organizer must confirm each final
          decision.
        </p>
      </div>
    </aside>
  );
}

function ReviewNavigation({ eventId, mode }: Readonly<{ eventId: string; mode: ReviewWorkspaceMode }>) {
  return (
    <nav className={styles.reviewNavigation} aria-label="Review workspace">
      <Link
        className={mode === "organizer" ? styles.navCurrent : styles.navLink}
        href={`/admin/events/${eventId}/reviews`}
        aria-current={mode === "organizer" ? "page" : undefined}
      >
        Review plan
      </Link>
      <Link
        className={mode === "evaluator" ? styles.navCurrent : styles.navLink}
        href={`/admin/events/${eventId}/reviews/evaluate`}
        aria-current={mode === "evaluator" ? "page" : undefined}
      >
        Assigned review
      </Link>
    </nav>
  );
}

export function ReviewWorkspace({ eventId, mode = "organizer" }: ReviewWorkspaceProps) {
  const seed = useMemo(() => createSeed(eventId), [eventId]);
  if (mode === "evaluator") {
    return <EvaluatorWorkspace eventId={seed.eventId} seed={seed} />;
  }
  return <OrganizerWorkspace seed={seed} />;
}

function OrganizerWorkspace({ seed }: Readonly<{ seed: ReviewPlanSeed }>) {
  const firstRound = seed.rounds[0];
  const criteria = firstRound?.rubric.criteria ?? SEEDED_CRITERIA;

  return (
    <main className={styles.workspace} id="review-workspace">
      <a className={styles.skipLink} href="#review-content">
        Skip to review workspace content
      </a>
      <header className={styles.workspaceHeader}>
        <div>
          <p className={styles.eyebrow}>
            {seed.eventName} · organizer review
          </p>
          <h1>Evaluation plan</h1>
          <p className={styles.headerDescription}>
            Configure rounds, monitor reviewer coverage, and record the committee&apos;s human-approved
            decisions for <strong>{seed.planName}</strong>.
          </p>
        </div>
        <div className={styles.headerSide}>
          <ReviewNavigation eventId={seed.eventId} mode="organizer" />
          <span className={`${styles.statusBadge} ${styles.statusOpen}`}>
            <span aria-hidden="true" />
            {formatPlanStatus(seed.status)}
          </span>
        </div>
      </header>

      <div id="review-content">
        <AuthorityNotice />

        <section className={styles.section} aria-labelledby="plan-status-heading">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionEyebrow}>Plan controls</p>
              <h2 id="plan-status-heading">Evaluation plan status</h2>
            </div>
            <span className={styles.versionLabel}>Version 3 · seeded preview</span>
          </div>
          <div className={styles.summaryGrid}>
            <article className={styles.summaryCard}>
              <span className={styles.cardLabel}>Status</span>
              <strong className={styles.cardValue}>{formatPlanStatus(seed.status)}</strong>
              <p>Reviewers can work in the active round until its close date.</p>
            </article>
            <article className={styles.summaryCard}>
              <span className={styles.cardLabel}>Plan dates</span>
              <dl className={styles.compactDefinitionList}>
                <div>
                  <dt>Opens</dt>
                  <dd>{seed.opensAt}</dd>
                </div>
                <div>
                  <dt>Closes</dt>
                  <dd>{seed.closesAt}</dd>
                </div>
              </dl>
            </article>
            <article className={styles.summaryCard}>
              <span className={styles.cardLabel}>Blind review</span>
              <strong className={styles.cardValue}>{seed.blindReview ? "On" : "Off"}</strong>
              <p>
                {seed.blindReview
                  ? "Reviewer views hide participant identity fields."
                  : "Reviewer views include participant identity fields."}
              </p>
            </article>
            <article className={styles.summaryCard}>
              <span className={styles.cardLabel}>Assignment rule</span>
              <strong className={styles.cardValue}>{seed.assignmentRule.reviewsPerSubmission} reviews</strong>
              <p>per submission · {seed.assignmentRule.maxAssignmentsPerReviewer} maximum per reviewer</p>
            </article>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="rounds-heading">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionEyebrow}>Sequenced review</p>
              <h2 id="rounds-heading">Rounds</h2>
            </div>
            <span className={styles.mutedLabel}>{seed.rounds.length} rounds configured</span>
          </div>
          <div className={styles.roundGrid}>
            {seed.rounds.map((round) => (
              <article className={styles.roundCard} key={round.id}>
                <div className={styles.roundCardHeader}>
                  <div>
                    <span className={styles.roundNumber}>Round {round.id === "round-initial" ? "1" : "2"}</span>
                    <h3>{round.name}</h3>
                  </div>
                  <span className={`${styles.statusBadge} ${round.status === "open" ? styles.statusOpen : styles.statusScheduled}`}>
                    <span aria-hidden="true" />
                    {formatRoundStatus(round.status)}
                  </span>
                </div>
                <dl className={styles.dateList}>
                  <div>
                    <dt>Opens</dt>
                    <dd>{round.opensAt}</dd>
                  </div>
                  <div>
                    <dt>Closes</dt>
                    <dd>{round.closesAt}</dd>
                  </div>
                </dl>
                <p className={styles.roundRubric}>{round.rubric.name} · {round.rubric.criteria.length} criteria</p>
                <ProgressBar label={`${round.name} completion`} value={round.completionPercent} />
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section} aria-labelledby="rubric-heading">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionEyebrow}>Round 1 rubric</p>
              <h2 id="rubric-heading">Criteria and weights</h2>
            </div>
            <span className={styles.mutedLabel}>Scale 1–5 · weighted total</span>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.dataTable}>
              <caption>Rubric criteria and their contribution to the counted score</caption>
              <thead>
                <tr>
                  <th scope="col">Criterion</th>
                  <th scope="col">Bounds</th>
                  <th scope="col">Weight</th>
                  <th scope="col">Required</th>
                </tr>
              </thead>
              <tbody>
                {criteria.map((criterion) => (
                  <tr key={criterion.id}>
                    <th scope="row">
                      <strong>{criterion.label}</strong>
                      <span>{criterion.description}</span>
                    </th>
                    <td>{criterion.minimum}–{criterion.maximum}</td>
                    <td>{criterion.weight}%</td>
                    <td>{criterion.required ? "Required" : "Optional"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.tableNote}>
            Weighted aggregate scores include only scores that a human reviewer has confirmed or edited;
            AI-prefilled values remain uncounted until then.
          </p>
        </section>

        <section className={styles.section} aria-labelledby="assignment-heading">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionEyebrow}>Coverage and safety</p>
              <h2 id="assignment-heading">Reviewer assignment progress</h2>
            </div>
            <span className={styles.mutedLabel}>{seed.progress.assigned} assigned</span>
          </div>
          <div className={styles.progressLayout}>
            <div className={styles.progressPanel}>
              <ProgressBar label="Submitted reviews" value={seed.progress.completionPercent} />
              <p className={styles.progressMeta}>
                {seed.progress.submitted} of {seed.progress.totalAssignments} assigned reviews submitted · {seed.progress.inProgress} in progress
              </p>
            </div>
            <ul className={styles.indicatorList}>
              <li>
                <span className={`${styles.indicatorDot} ${styles.dotSuccess}`} aria-hidden="true" />
                <strong>{seed.progress.assigned} assigned</strong>
                <span>within reviewer load limits</span>
              </li>
              <li>
                <span className={`${styles.indicatorDot} ${styles.dotWarning}`} aria-hidden="true" />
                <strong>{seed.progress.abstained} abstention</strong>
                <span>requires a replacement assignment</span>
              </li>
              <li>
                <span className={`${styles.indicatorDot} ${styles.dotDanger}`} aria-hidden="true" />
                <strong>{seed.progress.conflicts} conflicts declared</strong>
                <span>conflicted reviewers have no submission access</span>
              </li>
            </ul>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="aggregate-heading">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionEyebrow}>Decision input</p>
              <h2 id="aggregate-heading">Counted aggregate scores</h2>
            </div>
            <span className={styles.mutedLabel}>Human-confirmed scores only</span>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.dataTable}>
              <caption>Submission aggregates available to organizers</caption>
              <thead>
                <tr>
                  <th scope="col">Submission</th>
                  <th scope="col">Counted score</th>
                  <th scope="col">Reviews counted</th>
                  <th scope="col">Safety signals</th>
                </tr>
              </thead>
              <tbody>
                {seed.aggregates.map((aggregate) => (
                  <tr key={aggregate.id}>
                    <th scope="row">
                      <strong>{aggregate.reference}</strong>
                      <span>{aggregate.title}</span>
                    </th>
                    <td><strong>{aggregate.countedScore}</strong> / {aggregate.possibleScore}</td>
                    <td>{aggregate.countedReviews} / {aggregate.expectedReviews}</td>
                    <td>
                      {aggregate.conflicts > 0 ? `${aggregate.conflicts} conflict${aggregate.conflicts === 1 ? "" : "s"}` : "No conflicts"}
                      {aggregate.abstentions > 0 ? ` · ${aggregate.abstentions} abstention` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="decisions-heading">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionEyebrow}>Organizer-only action</p>
              <h2 id="decisions-heading">Human decisions</h2>
            </div>
            <span className={styles.mutedLabel}>Accept · waitlist · reject</span>
          </div>
          <p className={styles.sectionIntro}>
            Only an authorized human organizer can record an outcome. Choose a status, write the reason,
            and confirm; AI suggestions cannot accept, waitlist, reject, or publish a decision.
          </p>
          <div className={styles.decisionList}>
            {seed.aggregates.map((aggregate) => (
              <DecisionEditor aggregate={aggregate} key={aggregate.id} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function DecisionEditor({ aggregate }: Readonly<{ aggregate: AggregateRow }>) {
  const [status, setStatus] = useState<DecisionStatus | "">("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function saveDecision(): void {
    if (!status) {
      setError("Choose accept, waitlist, or reject before confirming.");
      return;
    }
    if (reason.trim().length === 0) {
      setError("Write a reason before confirming this decision.");
      return;
    }
    if (!confirmed) {
      setError("Confirm that a human organizer reviewed this outcome.");
      return;
    }
    setError(null);
  }

  return (
    <article className={styles.decisionCard}>
      <div className={styles.decisionSummary}>
        <div>
          <span className={styles.cardLabel}>{aggregate.reference}</span>
          <h3>{aggregate.title}</h3>
        </div>
        <span className={styles.scorePill}>{aggregate.countedScore} / {aggregate.possibleScore}</span>
      </div>
      <div className={styles.decisionForm}>
        <div className={styles.formField}>
          <label htmlFor={`${aggregate.id}-decision`}>Decision</label>
          <select
            id={`${aggregate.id}-decision`}
            value={status}
            onChange={(event) => setStatus(event.currentTarget.value as DecisionStatus | "")}
            required
          >
            <option value="">Choose an outcome</option>
            <option value="accepted">Accept</option>
            <option value="waitlisted">Waitlist</option>
            <option value="rejected">Reject</option>
          </select>
        </div>
        <div className={styles.formField}>
          <label htmlFor={`${aggregate.id}-reason`}>Written reason <span>(required)</span></label>
          <textarea
            id={`${aggregate.id}-reason`}
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
            rows={3}
            required
            placeholder="Explain the human committee rationale."
          />
        </div>
        <label className={styles.checkboxLabel} htmlFor={`${aggregate.id}-confirm`}>
          <input
            id={`${aggregate.id}-confirm`}
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.currentTarget.checked)}
            required
          />
          I confirm this is a human organizer decision, not an AI decision.
        </label>
        {error ? <p className={styles.formError} role="alert">{error}</p> : null}
        <button className={styles.primaryButton} type="button" onClick={saveDecision}>
          Confirm human decision
        </button>
      </div>
    </article>
  );
}

function EvaluatorWorkspace({
  eventId,
  seed,
}: Readonly<{ eventId: string; seed: ReviewPlanSeed }>) {
  const assignment = useMemo(() => createEvaluatorAssignment(seed), [seed]);
  const [scoreValues, setScoreValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      assignment.round.rubric.criteria.map((criterion, index) => [criterion.id, String(3 + (index % 3))]),
    ),
  );
  const [humanConfirmed, setHumanConfirmed] = useState<Set<string>>(() => new Set());
  const [comment, setComment] = useState("");
  const [autosaveState, setAutosaveState] = useState("Autosave ready");
  const [submitConfirmation, setSubmitConfirmation] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [abstentionReason, setAbstentionReason] = useState("");
  const [abstentionError, setAbstentionError] = useState<string | null>(null);
  const [abstained, setAbstained] = useState(false);

  function markChanged(): void {
    setAutosaveState("Saving locally…");
    if (typeof window !== "undefined") {
      window.setTimeout(() => setAutosaveState("Autosaved just now"), 250);
    }
  }

  function changeScore(criterionId: string, value: string): void {
    setScoreValues((current) => ({ ...current, [criterionId]: value }));
    setHumanConfirmed((current) => new Set(current).add(criterionId));
    markChanged();
  }

  function confirmAiSuggestion(criterion: RubricCriterion): void {
    const suggestion = assignment.aiSuggestions[criterion.id];
    if (!suggestion) return;
    setScoreValues((current) => ({ ...current, [criterion.id]: String(suggestion.value) }));
    setHumanConfirmed((current) => new Set(current).add(criterion.id));
    markChanged();
  }

  function countedScore(): number {
    return assignment.round.rubric.criteria.reduce((total, criterion) => {
      const value = Number(scoreValues[criterion.id]);
      if (
        !humanConfirmed.has(criterion.id) ||
        !Number.isFinite(value) ||
        value < criterion.minimum ||
        value > criterion.maximum
      ) {
        return total;
      }
      return total + ((value - criterion.minimum) / (criterion.maximum - criterion.minimum)) * criterion.weight;
    }, 0);
  }

  function openSubmitConfirmation(): void {
    setSubmitError(null);
    setSubmitConfirmation(true);
  }

  function submitReview(): void {
    const missing = assignment.round.rubric.criteria.find((criterion) => {
      const value = Number(scoreValues[criterion.id]);
      return (
        criterion.required &&
        (!humanConfirmed.has(criterion.id) ||
          !Number.isFinite(value) ||
          value < criterion.minimum ||
          value > criterion.maximum)
      );
    });
    if (missing) {
      setSubmitError(`Confirm or edit the required “${missing.label}” score before submitting.`);
      return;
    }
    setSubmitError(null);
    setSubmitted(true);
    setSubmitConfirmation(false);
    setAutosaveState("Review submitted");
  }

  function declareAbstention(): void {
    if (abstentionReason.trim().length === 0) {
      setAbstentionError("A written conflict-of-interest reason is required.");
      return;
    }
    setAbstentionError(null);
    setAbstained(true);
  }

  if (abstained) {
    return (
      <main className={styles.workspace} id="review-workspace">
        <a className={styles.skipLink} href="#abstention-result">Skip to abstention result</a>
        <header className={styles.workspaceHeader}>
          <div>
            <p className={styles.eyebrow}>{seed.eventName} · evaluator</p>
            <h1>Review access removed</h1>
            <p className={styles.headerDescription}>Your conflict declaration has been recorded.</p>
          </div>
          <div className={styles.headerSide}>
            <ReviewNavigation eventId={eventId} mode="evaluator" />
          </div>
        </header>
        <section className={styles.abstentionResult} id="abstention-result" role="alert">
          <span className={styles.noticeIcon} aria-hidden="true">!</span>
          <div>
            <h2>Assignment abstained</h2>
            <p>
              Access to the assigned submission has been removed from this workspace. The written reason
              was recorded for organizer audit and a replacement reviewer can now be assigned.
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.workspace} id="review-workspace">
      <a className={styles.skipLink} href="#review-content">Skip to review workspace content</a>
      <header className={styles.workspaceHeader}>
        <div>
          <p className={styles.eyebrow}>{seed.eventName} · evaluator</p>
          <h1>Assigned review</h1>
          <p className={styles.headerDescription}>
            Complete one assigned review for <strong>{assignment.round.name}</strong>. Only your assigned
            submission is available in this workspace.
          </p>
        </div>
        <div className={styles.headerSide}>
          <ReviewNavigation eventId={eventId} mode="evaluator" />
          <span className={`${styles.statusBadge} ${styles.statusOpen}`}>
            <span aria-hidden="true" />
            Assignment open
          </span>
        </div>
      </header>

      <div id="review-content">
        <AuthorityNotice />

        <section className={styles.privacyNotice} role="note" aria-labelledby="blind-review-heading">
          <span className={styles.noticeIcon} aria-hidden="true">◌</span>
          <div>
            <h2 id="blind-review-heading">Blind review is on</h2>
            <p>
              Author identity is hidden from reviewers. Names, email addresses, and biographies are not
              shown in this workspace; evaluate the content only.
            </p>
          </div>
        </section>

        <section className={styles.submissionPanel} aria-labelledby="assigned-submission-heading">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionEyebrow}>One assigned submission</p>
              <h2 id="assigned-submission-heading">{assignment.title}</h2>
            </div>
            <span className={styles.referenceBadge}>{assignment.reference}</span>
          </div>
          <p className={styles.submissionAbstract}>{assignment.abstract}</p>
          <dl className={styles.assignmentDetails}>
            <div>
              <dt>Round</dt>
              <dd>{assignment.round.name}</dd>
            </div>
            <div>
              <dt>Review closes</dt>
              <dd>{assignment.round.closesAt}</dd>
            </div>
            <div>
              <dt>Identity</dt>
              <dd>Redacted for blind review</dd>
            </div>
          </dl>
        </section>

        <section className={styles.section} aria-labelledby="score-heading">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionEyebrow}>Human rubric</p>
              <h2 id="score-heading">Score this submission</h2>
            </div>
            <p className={styles.autosaveStatus} aria-live="polite">{autosaveState}</p>
          </div>
          <p className={styles.sectionIntro}>
            Scores are bounded from 1 to 5. An AI prefill is advisory and uncounted; editing a score or
            pressing its human confirmation control makes your human score count.
          </p>
          <div className={styles.scoreList}>
            {assignment.round.rubric.criteria.map((criterion) => {
              const suggestion = assignment.aiSuggestions[criterion.id];
              const isConfirmed = humanConfirmed.has(criterion.id);
              return (
                <article className={styles.scoreCard} key={criterion.id}>
                  <div className={styles.scoreCardHeader}>
                    <div>
                      <h3>{criterion.label}</h3>
                      <p>{criterion.description}</p>
                    </div>
                    <span className={isConfirmed ? styles.confirmedPill : styles.uncountedPill}>
                      {isConfirmed ? "Human confirmed · counted" : "AI prefill · uncounted"}
                    </span>
                  </div>
                  <div className={styles.scoreControls}>
                    <div className={styles.formField}>
                      <label htmlFor={`${criterion.id}-score`}>
                        Human score <span>({criterion.minimum}–{criterion.maximum})</span>
                      </label>
                      <input
                        id={`${criterion.id}-score`}
                        name={criterion.id}
                        type="number"
                        min={criterion.minimum}
                        max={criterion.maximum}
                        step={1}
                        value={scoreValues[criterion.id] ?? ""}
                        onChange={(event) => changeScore(criterion.id, event.currentTarget.value)}
                        required={criterion.required}
                        aria-describedby={`${criterion.id}-score-help`}
                      />
                      <p className={styles.fieldHint} id={`${criterion.id}-score-help`}>
                        Enter a whole number from {criterion.minimum} through {criterion.maximum}.
                      </p>
                    </div>
                    {suggestion ? (
                      <div className={styles.aiSuggestion} aria-label={`AI suggestion for ${criterion.label}`}>
                        <div>
                          <span className={styles.aiLabel}>AI suggestion · uncounted</span>
                          <strong>{suggestion.value} / {criterion.maximum}</strong>
                        </div>
                        <ul>
                          {suggestion.evidence.map((evidence) => <li key={evidence}>{evidence}</li>)}
                        </ul>
                        <button className={styles.secondaryButton} type="button" onClick={() => confirmAiSuggestion(criterion)}>
                          Confirm or edit this suggestion
                        </button>
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
          <p className={styles.countedTotal}>
            Counted human score: <strong>{countedScore().toFixed(1)} / 100</strong>
            <span> · AI suggestions never count until you confirm or edit them.</span>
          </p>
        </section>

        <section className={styles.section} aria-labelledby="comment-heading">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionEyebrow}>Reviewer notes</p>
              <h2 id="comment-heading">Comments</h2>
            </div>
          </div>
          <div className={styles.formField}>
            <label htmlFor="review-comment">Comments for the organizing committee</label>
            <textarea
              id="review-comment"
              value={comment}
              onChange={(event) => {
                setComment(event.currentTarget.value);
                markChanged();
              }}
              rows={5}
              placeholder="Share evidence for your scores and any practical considerations."
            />
          </div>
        </section>

        <section className={styles.submitPanel} aria-labelledby="submit-heading">
          <div>
            <p className={styles.sectionEyebrow}>Final step</p>
            <h2 id="submit-heading">Submit review</h2>
            <p>
              A confirmation is required before this review is submitted. Submission locks your scores
              and comments for organizer aggregation.
            </p>
          </div>
          {submitError ? <p className={styles.formError} role="alert">{submitError}</p> : null}
          {submitted ? (
            <p className={styles.submittedMessage} role="status">Review submitted to the committee.</p>
          ) : (
            <>
              <button className={styles.primaryButton} type="button" onClick={openSubmitConfirmation}>
                Review and submit
              </button>
              <div
                className={styles.confirmationBox}
                hidden={!submitConfirmation}
                role="dialog"
                aria-labelledby="confirm-submit-heading"
                aria-modal="false"
              >
                <h3 id="confirm-submit-heading">Confirm review submission</h3>
                <p>Check that every required score is human-confirmed or edited before locking this review.</p>
                <div className={styles.confirmationActions}>
                  <button className={styles.secondaryButton} type="button" onClick={() => setSubmitConfirmation(false)}>
                    Keep editing
                  </button>
                  <button className={styles.primaryButton} type="button" onClick={submitReview}>
                    Confirm and submit review
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        <section className={styles.conflictPanel} aria-labelledby="conflict-heading">
          <div>
            <p className={styles.sectionEyebrow}>Safety control</p>
            <h2 id="conflict-heading">Conflict of interest</h2>
            <p>
              If you have a personal, financial, or professional conflict with this submission, abstain
              instead of scoring it. A written reason is required and immediately removes your access.
            </p>
          </div>
          <div className={styles.formField}>
            <label htmlFor="abstention-reason">Reason for abstention <span>(required)</span></label>
            <textarea
              id="abstention-reason"
              value={abstentionReason}
              onChange={(event) => setAbstentionReason(event.currentTarget.value)}
              rows={3}
              required
              aria-describedby="abstention-help"
              placeholder="Describe the conflict for the organizer audit log."
            />
            <p className={styles.fieldHint} id="abstention-help">
              The reason is visible to organizers; declaring a conflict removes this assignment from your view.
            </p>
          </div>
          {abstentionError ? <p className={styles.formError} role="alert">{abstentionError}</p> : null}
          <button className={styles.dangerButton} type="button" onClick={declareAbstention}>
            Declare conflict and abstain
          </button>
        </section>
      </div>
    </main>
  );
}
