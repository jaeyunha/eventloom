"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  planId: string;
  version: number;
  decisionBySubmission: Readonly<
    Record<
      string,
      {
        readonly status: DecisionStatus;
        readonly reason: string;
        readonly version: number;
      }
    >
  >;
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
  planId: string;
  reviewVersion: number | undefined;
  initialScores: Readonly<Record<string, string>>;
  initialConfirmed: readonly string[];
  initialComment: string;
  submittedAt: string | null;
  id: string;
  reference: string;
  title: string;
  abstract: string;
  round: ReviewRound;
  aiSuggestions: Readonly<Record<string, { value: number; evidence: readonly string[] }>>;
}

interface ApiPlan {
  id: string;
  eventId: string;
  name: string;
  status: PlanStatus;
  blindReview: boolean;
  closesAt: string | null;
  assignmentRule: {
    reviewsPerSubmission: number;
    maxAssignmentsPerReviewer: number;
  };
  version: number;
  createdAt: string;
  updatedAt: string;
  rounds: readonly {
    id: string;
    name: string;
    sequence: number;
    closesAt: string | null;
    rubric: {
      id: string;
      name: string;
      criteria: readonly RubricCriterion[];
    };
  }[];
}

interface ApiSubmission {
  id: string;
  title: string;
  abstract: string;
}

interface ApiProgress {
  total: number;
  assigned: number;
  inProgress: number;
  submitted: number;
  abstained: number;
  completionPercent: number;
}

interface ApiAggregate {
  submissionId: string;
  submittedReviewCount: number;
  expectedReviewCount: number;
  averageWeightedTotal: number | null;
  possibleWeightedTotal: number;
}

interface ApiDecision {
  status: DecisionStatus;
  version: number;
  history: readonly {
    reason: string;
  }[];
}

interface ApiReviewContext {
  assignment: {
    id: string;
    planId: string;
    submissionId: string;
    status: "assigned" | "in_progress" | "submitted" | "abstained";
    version: number;
  };
  round: ApiPlan["rounds"][number];
  submission: {
    id: string;
    title: string;
    abstract: string;
  };
  review: {
    version: number;
    comment: string;
    submittedAt: string | null;
    scores: Readonly<
      Record<
        string,
        {
          value: number;
          origin: "human" | "ai";
          evidence: readonly string[];
          humanConfirmedBy: string | null;
        }
      >
    >;
  } | null;
}

interface ApiEnvelope<T> {
  data?: T;
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function apiBaseUrl(): string | null {
  const value = process.env.NEXT_PUBLIC_API_URL?.trim();
  return value && value.length > 0 ? value.replace(/\/$/u, "") : null;
}

async function evaluationRequest<T>(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
  fetcher: Fetcher = fetch,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body !== undefined) headers.set("content-type", "application/json");
  const response = await fetcher(`${baseUrl}/api/admin/evaluations${path}`, {
    ...init,
    credentials: "include",
    headers,
    cache: "no-store",
  });
  const body = (await response.json().catch(() => undefined)) as
    | ApiEnvelope<T>
    | T
    | { error?: { message?: string } }
    | undefined;
  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "object" &&
      body.error !== null &&
      typeof body.error.message === "string"
        ? body.error.message
        : "The evaluation request could not be completed.";
    throw new Error(message);
  }
  if (typeof body === "object" && body !== null && "data" in body && body.data !== undefined) {
    return body.data as T;
  }
  return body as T;
}

function dateLabel(value: string | null): string {
  if (value === null) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(date)
    : value;
}

function mapPlan(
  plan: ApiPlan,
  eventId: string,
  aggregates: readonly AggregateRow[],
  progress: ApiProgress,
  decisions: Readonly<Record<string, ApiDecision | null>>,
): ReviewPlanSeed {
  const now = Date.now();
  return {
    planId: plan.id,
    version: plan.version,
    decisionBySubmission: Object.fromEntries(
      Object.entries(decisions).flatMap(([submissionId, decision]) => {
        if (decision === null) return [];
        const reason = decision.history.at(-1)?.reason ?? "";
        return [[submissionId, { status: decision.status, reason, version: decision.version }]];
      }),
    ),
    eventId,
    eventName: eventId,
    planName: plan.name,
    status: plan.status,
    opensAt: dateLabel(plan.createdAt),
    closesAt: dateLabel(plan.closesAt),
    blindReview: plan.blindReview,
    assignmentRule: plan.assignmentRule,
    rounds: plan.rounds.map((round) => ({
      id: round.id,
      name: round.name,
      status:
        plan.status === "closed" || (round.closesAt !== null && Date.parse(round.closesAt) <= now)
          ? "closed"
          : round.sequence === 1 && plan.status === "open"
            ? "open"
            : "scheduled",
      opensAt: dateLabel(plan.createdAt),
      closesAt: dateLabel(round.closesAt),
      completionPercent: round.sequence === 1 ? progress.completionPercent : 0,
      rubric: { name: round.rubric.name, criteria: round.rubric.criteria },
    })),
    aggregates,
    progress: {
      totalAssignments: progress.total,
      assigned: progress.assigned,
      inProgress: progress.inProgress,
      submitted: progress.submitted,
      abstained: progress.abstained,
      conflicts: 0,
      completionPercent: progress.completionPercent,
    },
  };
}

async function loadOrganizerData(eventId: string, baseUrl: string): Promise<ReviewPlanSeed> {
  const planResult = await evaluationRequest<{ plans: readonly ApiPlan[] }>(
    baseUrl,
    `/plans?eventId=${encodeURIComponent(eventId)}`,
  );
  const plan = planResult.plans[0];
  if (plan === undefined) throw new Error("No evaluation plan is configured for this event.");
  const [progress, submissions] = await Promise.all([
    evaluationRequest<ApiProgress>(baseUrl, `/plans/${encodeURIComponent(plan.id)}/progress`),
    evaluationRequest<readonly ApiSubmission[]>(
      baseUrl,
      `/events/${encodeURIComponent(eventId)}/submissions`,
    ),
  ]);
  const round = plan.rounds[0];
  const aggregateEntries = await Promise.all(
    submissions.map(async (submission) => {
      const aggregate =
        round === undefined
          ? null
          : await evaluationRequest<ApiAggregate>(
              baseUrl,
              `/plans/${encodeURIComponent(plan.id)}/rounds/${encodeURIComponent(round.id)}/submissions/${encodeURIComponent(submission.id)}/aggregate`,
            );
      return {
        id: submission.id,
        reference: submission.id,
        title: submission.title,
        countedScore: aggregate?.averageWeightedTotal?.toFixed(1) ?? "—",
        possibleScore: aggregate?.possibleWeightedTotal?.toFixed(1) ?? "—",
        countedReviews: aggregate?.submittedReviewCount ?? 0,
        expectedReviews: aggregate?.expectedReviewCount ?? progress.total,
        conflicts: 0,
        abstentions: 0,
      };
    }),
  );
  const decisions = Object.fromEntries(
    await Promise.all(
      submissions.map(async (submission) => {
        const decision = await evaluationRequest<ApiDecision | null>(
          baseUrl,
          `/plans/${encodeURIComponent(plan.id)}/submissions/${encodeURIComponent(submission.id)}/decision`,
        );
        return [submission.id, decision] as const;
      }),
    ),
  );
  return mapPlan(plan, eventId, aggregateEntries, progress, decisions);
}

async function loadEvaluatorData(eventId: string, baseUrl: string): Promise<EvaluatorAssignment> {
  const planResult = await evaluationRequest<{ plans: readonly ApiPlan[] }>(
    baseUrl,
    `/plans?eventId=${encodeURIComponent(eventId)}`,
  );
  const plan = planResult.plans[0];
  if (plan === undefined) throw new Error("No evaluation plan is configured for this event.");
  const assignmentResult = await evaluationRequest<{
    assignments: readonly {
      id: string;
      submissionId: string;
      status: ApiReviewContext["assignment"]["status"];
      version: number;
    }[];
  }>(baseUrl, `/plans/${encodeURIComponent(plan.id)}/assignments/mine`);
  const assignment = assignmentResult.assignments[0];
  if (assignment === undefined) throw new Error("No review assignment is available.");
  const context = await evaluationRequest<ApiReviewContext>(
    baseUrl,
    `/assignments/${encodeURIComponent(assignment.id)}`,
  );
  const round: ReviewRound = {
    id: context.round.id,
    name: context.round.name,
    status: plan.status === "open" ? "open" : "closed",
    opensAt: dateLabel(plan.createdAt),
    closesAt: dateLabel(context.round.closesAt),
    completionPercent: 0,
    rubric: {
      name: context.round.rubric.name,
      criteria: context.round.rubric.criteria,
    },
  };
  const scores = context.review?.scores ?? {};
  const aiSuggestions = Object.fromEntries(
    Object.entries(scores)
      .filter(([, score]) => score.origin === "ai")
      .map(([criterionId, score]) => [
        criterionId,
        { value: score.value, evidence: score.evidence },
      ]),
  );
  return {
    planId: plan.id,
    reviewVersion: context.review?.version,
    initialScores: Object.fromEntries(
      Object.entries(scores).map(([criterionId, score]) => [criterionId, String(score.value)]),
    ),
    initialConfirmed: Object.entries(scores)
      .filter(([, score]) => score.humanConfirmedBy !== null)
      .map(([criterionId]) => criterionId),
    initialComment: context.review?.comment ?? "",
    submittedAt: context.review?.submittedAt ?? null,
    id: context.assignment.id,
    reference: context.assignment.submissionId,
    title: context.submission.title,
    abstract: context.submission.abstract,
    round,
    aiSuggestions,
  };
}
const testCriteria: readonly RubricCriterion[] = [
  {
    id: "audience-impact",
    label: "Audience impact",
    description: "A clear, useful outcome for the event audience.",
    minimum: 1,
    maximum: 5,
    weight: 35,
    required: true,
  },
  {
    id: "clarity",
    label: "Clarity and structure",
    description: "A focused proposal with an understandable arc.",
    minimum: 1,
    maximum: 5,
    weight: 25,
    required: true,
  },
  {
    id: "originality",
    label: "Originality",
    description: "A distinctive point of view.",
    minimum: 1,
    maximum: 5,
    weight: 20,
    required: true,
  },
  {
    id: "feasibility",
    label: "Delivery feasibility",
    description: "The scope can be delivered in the available session.",
    minimum: 1,
    maximum: 5,
    weight: 20,
    required: true,
  },
];

function testPlan(eventId: string): ReviewPlanSeed {
  const round = {
    id: "round-initial",
    name: "Initial committee review",
    status: "open" as const,
    opensAt: "Aug 10, 2026",
    closesAt: "Aug 18, 2026",
    completionPercent: 67,
    rubric: { name: "Summit proposal rubric", criteria: testCriteria },
  };
  return {
    planId: "plan-test",
    version: 3,
    decisionBySubmission: {},
    eventId,
    eventName: "Summit 2026",
    planName: "Summit 2026 program committee",
    status: "open",
    opensAt: "Aug 10, 2026",
    closesAt: "Aug 24, 2026",
    blindReview: true,
    assignmentRule: { reviewsPerSubmission: 3, maxAssignmentsPerReviewer: 8 },
    rounds: [
      round,
      {
        ...round,
        id: "round-calibration",
        name: "Calibration and final review",
        status: "scheduled",
        opensAt: "Aug 19, 2026",
        closesAt: "Aug 24, 2026",
        completionPercent: 0,
      },
    ],
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

function testAssignment(eventId: string): EvaluatorAssignment {
  const seed = testPlan(eventId);
  const round = seed.rounds[0] as ReviewRound;
  return {
    planId: seed.planId,
    reviewVersion: undefined,
    initialScores: {},
    initialConfirmed: [],
    initialComment: "",
    submittedAt: null,
    id: "assignment-test",
    reference: "SUB-042",
    title: "Designing resilient public services",
    abstract: "A practical session for resilient public services.",
    round,
    aiSuggestions: Object.fromEntries(
      testCriteria.map((criterion, index) => [
        criterion.id,
        { value: 3 + (index % 3), evidence: ["Cited proposal evidence."] },
      ]),
    ),
  };
}

function formatPlanStatus(status: PlanStatus): string {
  if (status === "open") return "Open for review";
  if (status === "draft") return "Draft";
  return "Closed";
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
          AI suggestions never count and never decide an outcome; they remain advisory until a human
          reviewer confirms or edits every score, and a human organizer confirms each final
          decision.
        </p>
      </div>
    </aside>
  );
}

function ReviewNavigation({
  eventId,
  mode,
}: Readonly<{ eventId: string; mode: ReviewWorkspaceMode }>) {
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
  const baseUrl = apiBaseUrl();
  const testMode =
    baseUrl === null && process.env.APP_ENV !== "production" && process.env.NODE_ENV === "test";
  const [seed, setSeed] = useState<ReviewPlanSeed | null>(() =>
    testMode && mode === "organizer" ? testPlan(eventId) : null,
  );
  const [assignment, setAssignment] = useState<EvaluatorAssignment | null>(() =>
    testMode && mode === "evaluator" ? testAssignment(eventId) : null,
  );
  const [loading, setLoading] = useState(!testMode);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (testMode) return;
    let active = true;
    setLoading(true);
    setError(null);
    setSeed(null);
    setAssignment(null);
    if (baseUrl === null) {
      setLoading(false);
      setError("The evaluation API is not configured.");
      return () => {
        active = false;
      };
    }
    const load =
      mode === "organizer"
        ? loadOrganizerData(eventId, baseUrl)
        : loadEvaluatorData(eventId, baseUrl);
    void load
      .then((value) => {
        if (!active) return;
        if (mode === "organizer") setSeed(value as ReviewPlanSeed);
        else setAssignment(value as EvaluatorAssignment);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(reason instanceof Error ? reason.message : "The evaluation request failed.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [baseUrl, eventId, mode, testMode]);

  if (loading) {
    return (
      <WorkspaceStatus
        eventId={eventId}
        mode={mode}
        message="Loading authoritative evaluation data…"
      />
    );
  }
  if (error !== null) {
    return <WorkspaceStatus eventId={eventId} mode={mode} message={error} error />;
  }
  if (mode === "evaluator") {
    return assignment === null ? (
      <WorkspaceStatus
        eventId={eventId}
        mode={mode}
        message="No review assignment is available."
        error
      />
    ) : (
      <EvaluatorWorkspace eventId={eventId} assignment={assignment} baseUrl={baseUrl ?? ""} />
    );
  }
  return seed === null ? (
    <WorkspaceStatus
      eventId={eventId}
      mode={mode}
      message="No evaluation plan is available."
      error
    />
  ) : (
    <OrganizerWorkspace seed={seed} baseUrl={baseUrl ?? ""} />
  );
}

function WorkspaceStatus({
  eventId,
  mode,
  message,
  error = false,
}: Readonly<{
  eventId: string;
  mode: ReviewWorkspaceMode;
  message: string;
  error?: boolean;
}>) {
  return (
    <div className={styles.workspace} id="review-workspace">
      <a className={styles.skipLink} href="#review-content">
        Skip to review workspace content
      </a>
      <header className={styles.workspaceHeader}>
        <div>
          <p className={styles.eyebrow}>
            {eventId} · {mode}
          </p>
          <h1>{mode === "organizer" ? "Evaluation plan" : "Assigned review"}</h1>
        </div>
        <ReviewNavigation eventId={eventId} mode={mode} />
      </header>
      <section id="review-content" className={styles.section} role={error ? "alert" : "status"}>
        <h2>{error ? "Evaluation unavailable" : "Evaluation data"}</h2>
        <p>{message}</p>
      </section>
    </div>
  );
}

function OrganizerWorkspace({
  seed,
  baseUrl,
}: Readonly<{ seed: ReviewPlanSeed; baseUrl: string }>) {
  const firstRound = seed.rounds[0];
  const criteria = firstRound?.rubric.criteria ?? [];

  return (
    <div className={styles.workspace} id="review-workspace">
      <a className={styles.skipLink} href="#review-content">
        Skip to review workspace content
      </a>
      <header className={styles.workspaceHeader}>
        <div>
          <p className={styles.eyebrow}>{seed.eventName} · organizer review</p>
          <h1>Evaluation plan</h1>
          <p className={styles.headerDescription}>
            Configure rounds, monitor reviewer coverage, and record the committee&apos;s
            human-approved decisions for <strong>{seed.planName}</strong>.
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

      <div id="review-content" tabIndex={-1}>
        <AuthorityNotice />

        <section className={styles.section} aria-labelledby="plan-status-heading">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionEyebrow}>Plan controls</p>
              <h2 id="plan-status-heading">Evaluation plan status</h2>
            </div>
            <span className={styles.versionLabel}>Version {seed.version} · server state</span>
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
              <strong className={styles.cardValue}>
                {seed.assignmentRule.reviewsPerSubmission} reviews
              </strong>
              <p>
                per submission · {seed.assignmentRule.maxAssignmentsPerReviewer} maximum per
                reviewer
              </p>
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
                    <span className={styles.roundNumber}>
                      Round {round.id === "round-initial" ? "1" : "2"}
                    </span>
                    <h3>{round.name}</h3>
                  </div>
                  <span
                    className={`${styles.statusBadge} ${round.status === "open" ? styles.statusOpen : styles.statusScheduled}`}
                  >
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
                <p className={styles.roundRubric}>
                  {round.rubric.name} · {round.rubric.criteria.length} criteria
                </p>
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
                    <td>
                      {criterion.minimum}–{criterion.maximum}
                    </td>
                    <td>{criterion.weight}%</td>
                    <td>{criterion.required ? "Required" : "Optional"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.tableNote}>
            Weighted aggregate scores include only scores that a human reviewer has confirmed or
            edited; AI-prefilled values remain uncounted until then.
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
                {seed.progress.submitted} of {seed.progress.totalAssignments} assigned reviews
                submitted · {seed.progress.inProgress} in progress
              </p>
            </div>
            <ul className={styles.indicatorList}>
              <li>
                <span
                  className={`${styles.indicatorDot} ${styles.dotSuccess}`}
                  aria-hidden="true"
                />
                <strong>{seed.progress.assigned} assigned</strong>
                <span>within reviewer load limits</span>
              </li>
              <li>
                <span
                  className={`${styles.indicatorDot} ${styles.dotWarning}`}
                  aria-hidden="true"
                />
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
                    <td>
                      <strong>{aggregate.countedScore}</strong> / {aggregate.possibleScore}
                    </td>
                    <td>
                      {aggregate.countedReviews} / {aggregate.expectedReviews}
                    </td>
                    <td>
                      {aggregate.conflicts > 0
                        ? `${aggregate.conflicts} conflict${aggregate.conflicts === 1 ? "" : "s"}`
                        : "No conflicts"}
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
            Only an authorized human organizer can record an outcome. Choose a status, write the
            reason, and confirm; AI suggestions cannot accept, waitlist, reject, or publish a
            decision.
          </p>
          <div className={styles.decisionList}>
            {seed.aggregates.map((aggregate) => (
              <DecisionEditor
                aggregate={aggregate}
                baseUrl={baseUrl}
                planId={seed.planId}
                decision={seed.decisionBySubmission[aggregate.id]}
                key={aggregate.id}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function DecisionEditor({
  aggregate,
  baseUrl,
  planId,
  decision,
}: Readonly<{
  aggregate: AggregateRow;
  baseUrl: string;
  planId: string;
  decision:
    | {
        readonly status: DecisionStatus;
        readonly reason: string;
        readonly version: number;
      }
    | undefined;
}>) {
  const [status, setStatus] = useState<DecisionStatus | "">(decision?.status ?? "");
  const [reason, setReason] = useState(decision?.reason ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(decision !== undefined);
  const [busy, setBusy] = useState(false);

  const [decisionVersion, setDecisionVersion] = useState<number | undefined>(decision?.version);
  async function saveDecision(): Promise<void> {
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
    setBusy(true);
    const decisionKey = `web-${crypto.randomUUID()}`;
    try {
      const savedDecision = await evaluationRequest<{ version: number }>(
        baseUrl,
        `/plans/${encodeURIComponent(planId)}/submissions/${encodeURIComponent(aggregate.id)}/decision`,
        {
          method: "PUT",
          headers: { "idempotency-key": decisionKey },
          body: JSON.stringify({
            status,
            reason: reason.trim(),
            idempotencyKey: decisionKey,
            ...(decisionVersion === undefined ? {} : { expectedVersion: decisionVersion }),
          }),
        },
      );
      setDecisionVersion(savedDecision.version);
      setSaved(true);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "The decision could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={styles.decisionCard}>
      <div className={styles.decisionSummary}>
        <div>
          <span className={styles.cardLabel}>{aggregate.reference}</span>
          <h3>{aggregate.title}</h3>
        </div>
        <span className={styles.scorePill}>
          {aggregate.countedScore} / {aggregate.possibleScore}
        </span>
      </div>
      <div className={styles.decisionForm}>
        <div className={styles.formField}>
          <label htmlFor={`${aggregate.id}-decision`}>Decision</label>
          <select
            id={`${aggregate.id}-decision`}
            value={status}
            onChange={(event) => {
              setStatus(event.currentTarget.value as DecisionStatus | "");
              setSaved(false);
            }}
            required
          >
            <option value="">Choose an outcome</option>
            <option value="accepted">Accept</option>
            <option value="waitlisted">Waitlist</option>
            <option value="rejected">Reject</option>
          </select>
        </div>
        <div className={styles.formField}>
          <label htmlFor={`${aggregate.id}-reason`}>
            Written reason <span>(required)</span>
          </label>
          <textarea
            id={`${aggregate.id}-reason`}
            value={reason}
            onChange={(event) => {
              setReason(event.currentTarget.value);
              setSaved(false);
            }}
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
        {error ? (
          <p className={styles.formError} role="alert">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p className={styles.submittedMessage} role="status">
            Decision saved on the server.
          </p>
        ) : null}
        <button
          className={styles.primaryButton}
          type="button"
          onClick={() => void saveDecision()}
          disabled={busy}
        >
          {busy ? "Saving…" : "Confirm human decision"}
        </button>
      </div>
    </article>
  );
}

function EvaluatorWorkspace({
  eventId,
  assignment,
  baseUrl,
}: Readonly<{ eventId: string; assignment: EvaluatorAssignment; baseUrl: string }>) {
  const [scoreValues, setScoreValues] = useState<Record<string, string>>(() => ({
    ...assignment.initialScores,
  }));
  const [humanConfirmed, setHumanConfirmed] = useState<Set<string>>(
    () => new Set(assignment.initialConfirmed),
  );
  const [comment, setComment] = useState(assignment.initialComment);
  const [reviewVersion, setReviewVersion] = useState<number | undefined>(assignment.reviewVersion);
  const [autosaveState, setAutosaveState] = useState(
    assignment.submittedAt === null ? "Autosave ready" : "Review submitted",
  );
  const [submitConfirmation, setSubmitConfirmation] = useState(false);
  const [submitted, setSubmitted] = useState(assignment.submittedAt !== null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [abstentionReason, setAbstentionReason] = useState("");
  const [abstentionError, setAbstentionError] = useState<string | null>(null);
  const [abstained, setAbstained] = useState(false);
  const [busy, setBusy] = useState(false);

  async function persistReview(
    nextScores: Readonly<Record<string, string>> = scoreValues,
    nextComment: string = comment,
    nextConfirmed: ReadonlySet<string> = humanConfirmed,
  ): Promise<{ version: number }> {
    const scores = assignment.round.rubric.criteria.flatMap((criterion) => {
      const rawValue = Number(nextScores[criterion.id]);
      if (!Number.isFinite(rawValue)) return [];
      const suggestion = assignment.aiSuggestions[criterion.id];
      const confirmed = nextConfirmed.has(criterion.id);
      return [
        {
          criterionId: criterion.id,
          value: rawValue,
          origin: confirmed ? ("human" as const) : ("ai" as const),
          ...(confirmed || suggestion === undefined ? {} : { evidence: suggestion.evidence }),
        },
      ];
    });
    const review = await evaluationRequest<{ version: number }>(
      baseUrl,
      `/assignments/${encodeURIComponent(assignment.id)}/review`,
      {
        method: "PUT",
        body: JSON.stringify({
          scores,
          comment: nextComment,
          ...(reviewVersion === undefined ? {} : { expectedVersion: reviewVersion }),
        }),
      },
    );
    setReviewVersion(review.version);
    setAutosaveState("Saved on server");
    return review;
  }

  function changeScore(criterionId: string, value: string): void {
    const nextScores = { ...scoreValues, [criterionId]: value };
    const nextConfirmed = new Set(humanConfirmed).add(criterionId);
    setScoreValues(nextScores);
    setHumanConfirmed(nextConfirmed);
    setAutosaveState("Saving…");
    void persistReview(nextScores, comment, nextConfirmed).catch((reason: unknown) => {
      setAutosaveState("Save failed");
      setSubmitError(
        reason instanceof Error ? reason.message : "The review draft could not be saved.",
      );
    });
  }

  function confirmAiSuggestion(criterion: RubricCriterion): void {
    const suggestion = assignment.aiSuggestions[criterion.id];
    if (!suggestion) return;
    const nextScores = { ...scoreValues, [criterion.id]: String(suggestion.value) };
    const nextConfirmed = new Set(humanConfirmed).add(criterion.id);
    setScoreValues(nextScores);
    setHumanConfirmed(nextConfirmed);
    setAutosaveState("Saving…");
    void persistReview(nextScores, comment, nextConfirmed).catch((reason: unknown) => {
      setAutosaveState("Save failed");
      setSubmitError(
        reason instanceof Error ? reason.message : "The review draft could not be saved.",
      );
    });
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
      return (
        total +
        ((value - criterion.minimum) / (criterion.maximum - criterion.minimum)) * criterion.weight
      );
    }, 0);
  }

  function openSubmitConfirmation(): void {
    setSubmitError(null);
    setSubmitConfirmation(true);
  }

  async function submitReview(): Promise<void> {
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
    setBusy(true);
    setSubmitError(null);
    try {
      const review = await persistReview();
      await evaluationRequest(
        baseUrl,
        `/assignments/${encodeURIComponent(assignment.id)}/review/submit`,
        {
          method: "POST",
          body: JSON.stringify({ expectedVersion: review.version }),
        },
      );
      setSubmitted(true);
      setSubmitConfirmation(false);
      setAutosaveState("Review submitted");
    } catch (reason: unknown) {
      setSubmitError(
        reason instanceof Error ? reason.message : "The review could not be submitted.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function declareAbstention(): Promise<void> {
    if (abstentionReason.trim().length === 0) {
      setAbstentionError("A written conflict-of-interest reason is required.");
      return;
    }
    setBusy(true);
    setAbstentionError(null);
    try {
      await evaluationRequest(
        baseUrl,
        `/assignments/${encodeURIComponent(assignment.id)}/conflict`,
        {
          method: "POST",
          body: JSON.stringify({ reason: abstentionReason.trim() }),
        },
      );
      setAbstained(true);
    } catch (reason: unknown) {
      setAbstentionError(
        reason instanceof Error ? reason.message : "The conflict could not be recorded.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (abstained) {
    return (
      <div className={styles.workspace} id="review-workspace">
        <a className={styles.skipLink} href="#abstention-result">
          Skip to abstention result
        </a>
        <header className={styles.workspaceHeader}>
          <div>
            <p className={styles.eyebrow}>{eventId} · evaluator</p>
            <h1>Review access removed</h1>
            <p className={styles.headerDescription}>Your conflict declaration has been recorded.</p>
          </div>
          <div className={styles.headerSide}>
            <ReviewNavigation eventId={eventId} mode="evaluator" />
          </div>
        </header>
        <section
          className={styles.abstentionResult}
          id="abstention-result"
          role="alert"
          tabIndex={-1}
        >
          <span className={styles.noticeIcon} aria-hidden="true">
            !
          </span>
          <div>
            <h2>Assignment abstained</h2>
            <p>
              Access to the assigned submission has been removed from this workspace. The written
              reason was recorded for organizer audit and a replacement reviewer can now be
              assigned.
            </p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.workspace} id="review-workspace">
      <a className={styles.skipLink} href="#review-content">
        Skip to review workspace content
      </a>
      <header className={styles.workspaceHeader}>
        <div>
          <p className={styles.eyebrow}>{eventId} · evaluator</p>
          <h1>Assigned review</h1>
          <p className={styles.headerDescription}>
            Complete one assigned review for <strong>{assignment.round.name}</strong>. Only your
            assigned submission is available in this workspace.
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

      <div id="review-content" tabIndex={-1}>
        <AuthorityNotice />

        <section
          className={styles.privacyNotice}
          role="note"
          aria-labelledby="blind-review-heading"
        >
          <span className={styles.noticeIcon} aria-hidden="true">
            ◌
          </span>
          <div>
            <h2 id="blind-review-heading">Blind review is on</h2>
            <p>
              Author identity is hidden from reviewers. Names, email addresses, and biographies are
              not shown in this workspace; evaluate the content only.
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
            <p className={styles.autosaveStatus} aria-live="polite">
              {autosaveState}
            </p>
          </div>
          <p className={styles.sectionIntro}>
            Scores are bounded from 1 to 5. An AI prefill is advisory and uncounted; editing a score
            or pressing its human confirmation control makes your human score count.
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
                        Human score{" "}
                        <span>
                          ({criterion.minimum}–{criterion.maximum})
                        </span>
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
                      <aside
                        className={styles.aiSuggestion}
                        aria-label={`AI suggestion for ${criterion.label}`}
                      >
                        <div>
                          <span className={styles.aiLabel}>AI suggestion · uncounted</span>
                          <strong>
                            {suggestion.value} / {criterion.maximum}
                          </strong>
                        </div>
                        <p className={styles.fieldHint}>Cited evidence</p>
                        <ul>
                          {suggestion.evidence.map((evidence) => (
                            <li key={evidence}>{evidence}</li>
                          ))}
                        </ul>
                        <button
                          className={styles.secondaryButton}
                          type="button"
                          onClick={() => confirmAiSuggestion(criterion)}
                        >
                          Confirm or edit this suggestion
                        </button>
                      </aside>
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
                const nextComment = event.currentTarget.value;
                setComment(nextComment);
                setAutosaveState("Saving…");
                void persistReview(scoreValues, nextComment).catch((reason: unknown) => {
                  setAutosaveState("Save failed");
                  setSubmitError(
                    reason instanceof Error
                      ? reason.message
                      : "The review draft could not be saved.",
                  );
                });
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
              A confirmation is required before this review is submitted. Submission locks your
              scores and comments for organizer aggregation.
            </p>
          </div>
          {submitError ? (
            <p className={styles.formError} role="alert">
              {submitError}
            </p>
          ) : null}
          {submitted ? (
            <p className={styles.submittedMessage} role="status">
              Review submitted to the committee.
            </p>
          ) : (
            <>
              <button
                className={styles.primaryButton}
                type="button"
                onClick={openSubmitConfirmation}
              >
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
                <p>
                  Check that every required score is human-confirmed or edited before locking this
                  review.
                </p>
                <div className={styles.confirmationActions}>
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    onClick={() => setSubmitConfirmation(false)}
                  >
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
              If you have a personal, financial, or professional conflict with this submission,
              abstain instead of scoring it. A written reason is required and immediately removes
              your access.
            </p>
          </div>
          <div className={styles.formField}>
            <label htmlFor="abstention-reason">
              Reason for abstention <span>(required)</span>
            </label>
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
              The reason is visible to organizers; declaring a conflict removes this assignment from
              your view.
            </p>
          </div>
          {abstentionError ? (
            <p className={styles.formError} role="alert">
              {abstentionError}
            </p>
          ) : null}
          <button className={styles.dangerButton} type="button" onClick={declareAbstention}>
            Declare conflict and abstain
          </button>
        </section>
      </div>
    </div>
  );
}
