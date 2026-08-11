"use client";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  activeVerifiedReviewers,
  createMemberApi,
  type MemberApi,
  type OrganizationMember,
} from "../members/api";
import styles from "./review-workspace.module.css";

export type ReviewWorkspaceMode = "organizer" | "evaluator";

export interface ReviewWorkspaceProps {
  eventId?: string;
  mode?: ReviewWorkspaceMode;
  initialState?: ReviewWorkspaceInitialState;
  organizationId?: string | undefined;
  memberApi?: MemberApi;
}

type PlanStatus = "draft" | "open" | "closed";
type RoundStatus = "open" | "scheduled" | "closed";
type DecisionStatus = "accepted" | "waitlisted" | "rejected";

export type CriterionInputType = "numeric" | "dropdown" | "free_text";

interface CriterionOption {
  readonly id?: string | undefined;
  readonly label: string;
  readonly value: string;
}

export interface RubricCriterion {
  id: string;
  label: string;
  description: string;
  minimum: number;
  maximum: number;
  weight: number;
  required: boolean;
  inputType?: CriterionInputType | undefined;
  options?: readonly CriterionOption[] | undefined;
}

export interface ReviewRound {
  sequence?: number | undefined;
  id: string;
  name: string;
  status: RoundStatus;
  opensAt: string;
  closesAt: string;
  completionPercent: number;
  blindReview?: boolean | undefined;
  anonymization?: "none" | "single" | "double" | undefined;
  reviewerPool?:
    | {
        readonly reviewerIds: readonly string[];
        readonly name?: string | undefined;
      }
    | undefined;
  trackFilter?: string | null | undefined;
  rubric: {
    name: string;
    criteria: readonly RubricCriterion[];
  };
}

interface AggregateParticipant {
  readonly id: string;
  readonly displayName: string;
  readonly role?: string | undefined;
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
  participants?: readonly AggregateParticipant[];
}

export interface ReviewPlanSeed {
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
    trackFilter?: string | null | undefined;
    autoDistribute?: boolean | undefined;
  };
  rounds: readonly ReviewRound[];
  reviewerProjection?: {
    readonly fieldIds: readonly string[];
    readonly fileIds: readonly string[];
  };
  sourceRounds?: ApiPlan["rounds"];
  sourceClosesAt?: string | null;
  aggregates: readonly AggregateRow[];
  progress: {
    totalAssignments: number;
    assigned: number;
    inProgress: number;
    submitted: number;
    abstained: number;
    conflicts: number;
    completionPercent: number;
    reviewers: readonly ReviewerProgressSummary[];
  };
}

interface ApiSuggestion {
  id: string;
  status: "pending" | "accepted" | "edited" | "rejected" | "stale";
  version: number;
  rubricRevision: number;
  submissionRevision: number;
  candidates: Readonly<
    Record<
      string,
      readonly {
        id: string;
        criterionId: string;
        value: number;
        evidence: readonly string[];
        provenance?: {
          provider: string;
          model: string;
          sourceReferences: readonly string[];
        };
      }[]
    >
  >;
  provenance: {
    provider: string;
    model: string;
    sourceReferences: readonly string[];
  };
}
interface ReviewerProgressSummary {
  reviewerId: string;
  roundId: string;
  assigned: number;
  inProgress: number;
  submitted: number;
  abstained: number;
  outstanding: number;
  completionPercent: number;
}

interface ApiAssignment {
  id: string;
  eventId: string;
  planId: string;
  roundId: string;
  submissionId: string;
  reviewerId: string;
  status: "assigned" | "in_progress" | "submitted" | "abstained";
  version: number;
}
export interface EvaluatorAssignment {
  eventId: string;
  eventName: string;
  planId: string;
  planName: string;
  reviewVersion: number | undefined;
  initialScores: Readonly<Record<string, string>>;
  initialResponses: Readonly<Record<string, string>>;
  initialConfirmed: readonly string[];
  initialComment: string;
  submittedAt: string | null;
  id: string;
  reference: string;
  title: string;
  abstract: string;
  round: ReviewRound;
  aiSuggestions: Readonly<Record<string, { value: number; evidence: readonly string[] }>>;
  readonly assignmentStatus?: ApiAssignment["status"] | undefined;
  readonly track?: string | null | undefined;
  readonly participants?: readonly AggregateParticipant[] | undefined;
  readonly identityRedacted?: boolean | undefined;
  readonly submissionFields?:
    | readonly {
        readonly id?: string | undefined;
        readonly label: string;
        readonly value: string;
      }[]
    | undefined;
  suggestions: readonly ApiSuggestion[];
}
export interface ReviewerQueueEntry {
  assignment: EvaluatorAssignment;
}
interface EvaluatorDraftSnapshot {
  readonly scoreValues: Readonly<Record<string, string>>;
  readonly responseValues: Readonly<Record<string, string>>;
  readonly humanConfirmed: readonly string[];
  readonly comment: string;
  readonly reviewVersion?: number | undefined;
}

export interface ReviewWorkspaceInitialState {
  readonly organizer?: ReviewPlanSeed | null;
  readonly assignment?: EvaluatorAssignment | null;
  readonly queue?: readonly ReviewerQueueEntry[] | null;
  readonly organizerPlanMissing?: boolean;
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
    trackFilter?: string | null | undefined;
    autoDistribute?: boolean | undefined;
  };
  version: number;
  createdAt: string;
  updatedAt: string;
  rounds: readonly {
    id: string;
    name: string;
    sequence: number;
    opensAt?: string | null | undefined;
    closesAt: string | null;
    blindReview?: boolean | undefined;
    anonymization?: "none" | "single" | "double" | undefined;
    reviewerPool?:
      | {
          readonly reviewerIds: readonly string[];
          readonly name?: string | undefined;
        }
      | undefined;
    trackFilter?: string | null | undefined;
    rubric: {
      id: string;
      name: string;
      criteria: readonly RubricCriterion[];
    };
  }[];
  reviewerProjection?: {
    readonly fieldIds: readonly string[];
    readonly fileIds: readonly string[];
  };
}

interface ApiSubmission {
  id: string;
  title: string;
  abstract: string;
  participants?: readonly AggregateParticipant[];
}

interface ApiProgress {
  total: number;
  assigned: number;
  inProgress: number;
  submitted: number;
  abstained: number;
  completionPercent: number;
  reviewers?: readonly ReviewerProgressSummary[];
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
    eventId: string;
    planId: string;
    submissionId: string;
    roundId: string;
    reviewerId: string;
    status: "assigned" | "in_progress" | "submitted" | "abstained";
    version: number;
    updatedAt?: string;
    createdAt?: string;
  };
  round: ApiPlan["rounds"][number];
  submission: {
    id: string;
    title: string;
    abstract: string;
    participants?: readonly {
      readonly id: string;
      readonly displayName: string;
      readonly role?: string | undefined;
    }[];
    answers?: Readonly<Record<string, unknown>>;
    identityRedacted?: boolean;
  };
  review: {
    version: number;
    comment: string;
    submittedAt: string | null;
    scores: Readonly<
      Record<
        string,
        {
          value: number | string;
          origin: "human" | "ai";
          evidence: readonly string[];
          humanConfirmedBy: string | null;
        }
      >
    >;
  } | null;
  rubricRevision?: number;
  submissionRevision?: number;
  suggestions?: readonly ApiSuggestion[];
}
interface ApiReviewerWorkspacePlan {
  id: string;
  eventId: string;
  name: string;
  status: PlanStatus;
  blindReview: boolean;
  createdAt: string;
  updatedAt?: string;
}
interface ApiReviewerWorkspaceAssignment extends ApiReviewContext {
  plan: ApiReviewerWorkspacePlan;
}
interface ApiReviewerWorkspaceResponse {
  assignments: readonly ApiReviewerWorkspaceAssignment[];
}
type AuthoritativeReview = NonNullable<ApiReviewContext["review"]>;

class EvaluationRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "EvaluationRequestError";
    this.status = status;
  }
}
class MissingEvaluationPlanError extends Error {
  constructor() {
    super("No evaluation plan is configured for this event.");
    this.name = "MissingEvaluationPlanError";
  }
}

interface ApiEnvelope<T> {
  data?: T;
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function apiBaseUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  return configured ? configured.replace(/\/+$/u, "") : null;
}

function configuredOrganizationId(explicit: string | undefined): string | null {
  const value = (explicit ?? process.env.NEXT_PUBLIC_ORGANIZATION_ID)?.trim() ?? "";
  return value.length > 0 ? value : null;
}

export function parseNumericAuthoringValue(current: number, rawValue: string): number {
  const normalized = rawValue.trim();
  if (normalized.length === 0) return current;
  const next = Number(normalized);
  return Number.isFinite(next) ? next : current;
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
    throw new EvaluationRequestError(message, response.status);
  }
  if (typeof body === "object" && body !== null && "data" in body) {
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
function criterionType(criterion: RubricCriterion): CriterionInputType {
  return criterion.inputType ?? "numeric";
}

function criterionOptionValue(
  criterion: RubricCriterion,
  score: number | string | undefined,
): string {
  if (score === undefined || criterionType(criterion) !== "dropdown") return "";
  if (typeof score === "string") return score;
  const index = Math.round(score - criterion.minimum);
  return criterion.options?.[index]?.value ?? "";
}

function criterionNumericValue(criterion: RubricCriterion, value: string): number {
  if (criterionType(criterion) === "dropdown") {
    const index = criterion.options?.findIndex((option) => option.value === value) ?? -1;
    return index < 0 ? Number.NaN : criterion.minimum + index;
  }
  return Number(value);
}

function parseScorecardResponses(comment: string): {
  readonly comment: string;
  readonly responses: Readonly<Record<string, string>>;
} {
  const responses: Record<string, string> = {};
  const cleanComment = comment.replace(
    /\n?\[scorecard-response id="([^"]*)"\]([\s\S]*?)\[\/scorecard-response\]/gu,
    (_match, id: string, value: string) => {
      responses[id] = value.trim();
      return "";
    },
  );
  return { comment: cleanComment.trim(), responses };
}

function withScorecardResponses(
  comment: string,
  responses: Readonly<Record<string, string>>,
): string {
  const entries = Object.entries(responses)
    .filter(([, value]) => value.trim().length > 0)
    .sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) return comment.trim();
  return `${comment.trim()}${comment.trim().length > 0 ? "\n\n" : ""}${entries
    .map(([id, value]) => `[scorecard-response id="${id}"]\n${value.trim()}\n[/scorecard-response]`)
    .join("\n")}`;
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
    ...(plan.reviewerProjection === undefined
      ? {}
      : {
          reviewerProjection: {
            fieldIds: Array.isArray(plan.reviewerProjection.fieldIds)
              ? plan.reviewerProjection.fieldIds
              : [],
            fileIds: Array.isArray(plan.reviewerProjection.fileIds)
              ? plan.reviewerProjection.fileIds
              : [],
          },
        }),
    sourceRounds: plan.rounds,
    sourceClosesAt: plan.closesAt,
    rounds: plan.rounds.map((round) => ({
      id: round.id,
      sequence: round.sequence,
      name: round.name,
      status:
        plan.status === "closed" || (round.closesAt !== null && Date.parse(round.closesAt) <= now)
          ? "closed"
          : plan.status !== "open" ||
              (round.opensAt !== null &&
                round.opensAt !== undefined &&
                Date.parse(round.opensAt) > now)
            ? "scheduled"
            : "open",
      opensAt: dateLabel(round.opensAt ?? plan.createdAt),
      closesAt: dateLabel(round.closesAt),
      completionPercent:
        progress.reviewers?.find((reviewer) => reviewer.roundId === round.id)?.completionPercent ??
        (round.sequence === 1 ? progress.completionPercent : 0),
      blindReview: round.blindReview === true || plan.blindReview,
      anonymization: round.anonymization,
      reviewerPool: round.reviewerPool,
      trackFilter: round.trackFilter ?? null,
      rubric: { name: round.rubric.name, criteria: round.rubric.criteria },
    })),
    aggregates,
    progress: {
      totalAssignments: progress.total,
      assigned: progress.assigned,
      inProgress: progress.inProgress,
      submitted: progress.submitted,
      abstained: progress.abstained,
      conflicts: progress.abstained,
      completionPercent: progress.completionPercent,
      reviewers: progress.reviewers ?? [],
    },
  };
}
function seedFromCreatedPlan(plan: ApiPlan, eventId: string): ReviewPlanSeed {
  return mapPlan(
    plan,
    eventId,
    [],
    {
      total: 0,
      assigned: 0,
      inProgress: 0,
      submitted: 0,
      abstained: 0,
      completionPercent: 0,
      reviewers: [],
    },
    {},
  );
}
function seedWithAuthoritativePlan(seed: ReviewPlanSeed, plan: ApiPlan): ReviewPlanSeed {
  const decisions = Object.fromEntries(
    Object.entries(seed.decisionBySubmission).map(([submissionId, decision]) => [
      submissionId,
      {
        status: decision.status,
        version: decision.version,
        history: [{ reason: decision.reason }],
      },
    ]),
  );
  const mapped = mapPlan(
    plan,
    seed.eventId,
    seed.aggregates,
    {
      total: seed.progress.totalAssignments,
      assigned: seed.progress.assigned,
      inProgress: seed.progress.inProgress,
      submitted: seed.progress.submitted,
      abstained: seed.progress.abstained,
      completionPercent: seed.progress.completionPercent,
      reviewers: seed.progress.reviewers,
    },
    decisions,
  );
  return {
    ...mapped,
    eventName: seed.eventName,
    progress: { ...mapped.progress, conflicts: seed.progress.conflicts },
  };
}
function deriveReviewerProgress(
  assignments: readonly ApiAssignment[],
): readonly ReviewerProgressSummary[] {
  const grouped = new Map<string, ReviewerProgressSummary>();
  for (const assignment of assignments) {
    const key = `${assignment.reviewerId}\u0000${assignment.roundId}`;
    const current = grouped.get(key) ?? {
      reviewerId: assignment.reviewerId,
      roundId: assignment.roundId,
      assigned: 0,
      inProgress: 0,
      submitted: 0,
      abstained: 0,
      outstanding: 0,
      completionPercent: 0,
    };
    if (assignment.status === "abstained") current.abstained += 1;
    else {
      current.assigned += 1;
      if (assignment.status === "in_progress") current.inProgress += 1;
      if (assignment.status === "submitted") current.submitted += 1;
    }
    current.outstanding = Math.max(0, current.assigned - current.submitted);
    current.completionPercent =
      current.assigned === 0 ? 0 : Math.round((current.submitted / current.assigned) * 100);
    grouped.set(key, current);
  }
  return [...grouped.values()].sort(
    (left, right) =>
      left.reviewerId.localeCompare(right.reviewerId) || left.roundId.localeCompare(right.roundId),
  );
}

function normalizeApiPlan(plan: ApiPlan): ApiPlan {
  return {
    ...plan,
    ...(Array.isArray(plan.rounds) ? {} : { rounds: [] }),
    ...((plan.status as string) === "active" ? { status: "open" } : {}),
  };
}

function normalizeApiSubmission(submission: ApiSubmission): ApiSubmission | null {
  if (typeof submission.id !== "string" || submission.id.trim().length === 0) return null;
  return {
    ...submission,
    id: submission.id.trim(),
    title:
      typeof submission.title === "string" && submission.title.trim().length > 0
        ? submission.title.trim()
        : submission.id.trim(),
    abstract: typeof submission.abstract === "string" ? submission.abstract : "",
    participants: Array.isArray(submission.participants) ? submission.participants : [],
  };
}
function selectApiPlan(plans: readonly ApiPlan[], preferredPlanId?: string): ApiPlan | undefined {
  const normalizedPlans = plans.map(normalizeApiPlan);
  const preferred =
    preferredPlanId === undefined
      ? undefined
      : normalizedPlans.find((candidate) => candidate.id === preferredPlanId);
  if (preferred !== undefined) return preferred;
  return [...normalizedPlans].sort(
    (left, right) =>
      (right.status === "open" ? 1 : 0) - (left.status === "open" ? 1 : 0) ||
      right.updatedAt.localeCompare(left.updatedAt) ||
      right.id.localeCompare(left.id),
  )[0];
}
export async function loadOrganizerData(
  eventId: string,
  baseUrl: string,
  preferredPlanId?: string,
  includeDetails = true,
): Promise<ReviewPlanSeed> {
  const planResult = await evaluationRequest<{ plans: readonly ApiPlan[] }>(
    baseUrl,
    `/plans?eventId=${encodeURIComponent(eventId)}`,
  );
  const plan = selectApiPlan(planResult.plans, preferredPlanId);
  if (plan === undefined) throw new MissingEvaluationPlanError();
  const [progress, submissions, assignmentResult] = await Promise.all([
    evaluationRequest<ApiProgress>(baseUrl, `/plans/${encodeURIComponent(plan.id)}/progress`),
    evaluationRequest<readonly ApiSubmission[]>(
      baseUrl,
      `/events/${encodeURIComponent(eventId)}/submissions`,
    ),
    evaluationRequest<{ assignments: readonly ApiAssignment[] }>(
      baseUrl,
      `/plans/${encodeURIComponent(plan.id)}/assignments`,
    ),
  ]);
  const assignments = assignmentResult.assignments;
  const reviewerProgress = deriveReviewerProgress(assignments);
  const mappedProgress: ApiProgress = {
    ...progress,
    reviewers: progress.reviewers ?? reviewerProgress,
  };
  const uniqueSubmissions = [
    ...new Map(
      submissions
        .map(normalizeApiSubmission)
        .filter((submission): submission is ApiSubmission => submission !== null)
        .map((submission) => [submission.id, submission] as const),
    ).values(),
  ];
  const round =
    [...plan.rounds]
      .sort((left, right) => right.sequence - left.sequence)
      .find(
        (candidate) =>
          plan.status === "open" &&
          (candidate.opensAt === null ||
            candidate.opensAt === undefined ||
            Date.parse(candidate.opensAt) <= Date.now()) &&
          (candidate.closesAt === null || Date.parse(candidate.closesAt) > Date.now()),
      ) ?? [...plan.rounds].sort((left, right) => left.sequence - right.sequence)[0];
  if (!includeDetails) {
    const pendingAggregates = uniqueSubmissions.map((submission) => {
      const submissionAssignments = assignments.filter(
        (assignment) =>
          assignment.submissionId === submission.id && assignment.roundId === round?.id,
      );
      return {
        id: submission.id,
        reference: submission.id,
        title: submission.title,
        countedScore: "—",
        possibleScore: "—",
        countedReviews: submissionAssignments.filter(
          (assignment) => assignment.status === "submitted",
        ).length,
        expectedReviews: submissionAssignments.filter(
          (assignment) => assignment.status !== "abstained",
        ).length,
        conflicts: submissionAssignments.filter((assignment) => assignment.status === "abstained")
          .length,
        abstentions: submissionAssignments.filter((assignment) => assignment.status === "abstained")
          .length,
        participants: submission.participants ?? [],
      };
    });
    return mapPlan(plan, eventId, pendingAggregates, mappedProgress, {});
  }
  const aggregates =
    round === undefined
      ? []
      : (
          await evaluationRequest<{ aggregates: readonly ApiAggregate[] }>(
            baseUrl,
            `/plans/${encodeURIComponent(plan.id)}/rounds/${encodeURIComponent(round.id)}/aggregates`,
          )
        ).aggregates;
  const aggregateBySubmissionId = new Map(
    aggregates.map((aggregate) => [aggregate.submissionId, aggregate] as const),
  );
  const aggregateEntries = uniqueSubmissions.map((submission) => {
    const aggregate = aggregateBySubmissionId.get(submission.id);
    const submissionAssignments = assignments.filter(
      (assignment) => assignment.submissionId === submission.id && assignment.roundId === round?.id,
    );
    return {
      id: submission.id,
      reference: submission.id,
      title: submission.title,
      countedScore: aggregate?.averageWeightedTotal?.toFixed(1) ?? "—",
      possibleScore: aggregate?.possibleWeightedTotal?.toFixed(1) ?? "—",
      countedReviews: aggregate?.submittedReviewCount ?? 0,
      expectedReviews:
        aggregate?.expectedReviewCount ??
        submissionAssignments.filter((assignment) => assignment.status !== "abstained").length,
      conflicts: submissionAssignments.filter((assignment) => assignment.status === "abstained")
        .length,
      abstentions: submissionAssignments.filter((assignment) => assignment.status === "abstained")
        .length,
      participants: submission.participants ?? [],
    };
  });
  const decisions = Object.fromEntries(
    await Promise.all(
      uniqueSubmissions.map(async (submission) => {
        const decision = await evaluationRequest<ApiDecision | null>(
          baseUrl,
          `/plans/${encodeURIComponent(plan.id)}/submissions/${encodeURIComponent(submission.id)}/decision`,
        );
        return [submission.id, decision] as const;
      }),
    ),
  );
  return mapPlan(plan, eventId, aggregateEntries, mappedProgress, decisions);
}

function readableSubmissionFieldLabel(fieldId: string): string {
  const label = fieldId
    .replace(/([a-z])([A-Z])/gu, "$1 $2")
    .replace(/[_-]+/gu, " ")
    .trim();
  return label.length === 0 ? "Submission detail" : label.charAt(0).toUpperCase() + label.slice(1);
}
function isAccountIdentityField(fieldId: string): boolean {
  const normalizedId = fieldId.toLowerCase().replace(/[^a-z0-9]/gu, "");
  return (
    normalizedId.includes("email") ||
    normalizedId.includes("name") ||
    normalizedId === "first" ||
    normalizedId === "last"
  );
}

function submissionFields(
  answers: Readonly<Record<string, unknown>> | undefined,
  redactIdentity = false,
): readonly { id: string; label: string; value: string }[] {
  if (answers === undefined) return [];
  return Object.entries(answers)
    .filter(([id]) => !redactIdentity || !isAccountIdentityField(id))
    .flatMap(([id, value]) => {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return [{ id, label: readableSubmissionFieldLabel(id), value: String(value) }];
      }
      if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
        return [{ id, label: readableSubmissionFieldLabel(id), value: value.join(", ") }];
      }
      return [];
    });
}

function submissionTrack(
  round: ReviewRound,
  answers: Readonly<Record<string, unknown>> | undefined,
): string | null {
  const trackEntry = Object.entries(answers ?? {}).find(([id, value]) => {
    const normalizedId = id.toLowerCase();
    return (
      typeof value === "string" &&
      (normalizedId === "track" ||
        normalizedId === "tracks" ||
        normalizedId.includes("track") ||
        normalizedId === "category")
    );
  });
  return typeof trackEntry?.[1] === "string" ? trackEntry[1] : (round.trackFilter ?? null);
}
function mapEvaluatorAssignment(
  plan: ApiReviewerWorkspacePlan,
  context: ApiReviewContext,
): EvaluatorAssignment {
  const round: ReviewRound = {
    sequence: context.round.sequence,
    id: context.round.id,
    name: context.round.name,
    status:
      plan.status !== "open"
        ? "scheduled"
        : context.round.closesAt !== null && Date.parse(context.round.closesAt) <= Date.now()
          ? "closed"
          : context.round.opensAt !== null &&
              context.round.opensAt !== undefined &&
              Date.parse(context.round.opensAt) > Date.now()
            ? "scheduled"
            : "open",
    opensAt: dateLabel(context.round.opensAt ?? plan.createdAt),
    closesAt: dateLabel(context.round.closesAt),
    completionPercent: 0,
    blindReview:
      context.round.blindReview === true ||
      (context.round.anonymization !== undefined && context.round.anonymization !== "none") ||
      plan.blindReview,
    anonymization: context.round.anonymization,
    reviewerPool: context.round.reviewerPool,
    trackFilter: context.round.trackFilter ?? null,
    rubric: {
      name: context.round.rubric.name,
      criteria: context.round.rubric.criteria,
    },
  };
  const scores = context.review?.scores ?? {};
  const suggestions = context.suggestions ?? [];
  const parsedComment = parseScorecardResponses(context.review?.comment ?? "");
  const initialResponses: Record<string, string> = {
    ...parsedComment.responses,
  };
  const initialScores = Object.fromEntries(
    Object.entries(scores).flatMap(([criterionId, score]) => {
      const criterion = round.rubric.criteria.find((candidate) => candidate.id === criterionId);
      if (criterion === undefined) return [];
      if (criterionType(criterion) === "free_text") {
        if (typeof score.value === "string") initialResponses[criterionId] = score.value;
        else if (score.evidence[0] !== undefined) initialResponses[criterionId] = score.evidence[0];
        return [];
      }
      return [
        [
          criterionId,
          criterionType(criterion) === "dropdown"
            ? criterionOptionValue(criterion, score.value)
            : String(score.value),
        ],
      ];
    }),
  );
  const aiSuggestions = Object.fromEntries([
    ...Object.entries(scores)
      .filter(([criterionId, score]) => {
        const criterion = round.rubric.criteria.find((candidate) => candidate.id === criterionId);
        return (
          score.origin === "ai" &&
          criterion !== undefined &&
          criterionType(criterion) === "numeric" &&
          typeof score.value === "number"
        );
      })
      .map(([criterionId, score]) => [
        criterionId,
        { value: Number(score.value), evidence: score.evidence },
      ]),
    ...suggestions
      .filter((suggestion) => suggestion.status === "pending")
      .flatMap((suggestion) =>
        Object.entries(suggestion.candidates).flatMap(([criterionId, candidates]) => {
          const criterion = round.rubric.criteria.find((candidate) => candidate.id === criterionId);
          const candidate = candidates[0];
          return criterion !== undefined &&
            criterionType(criterion) === "numeric" &&
            candidate !== undefined
            ? [[criterionId, { value: candidate.value, evidence: candidate.evidence }]]
            : [];
        }),
      ),
  ]);
  const resolvedEventId = context.assignment.eventId || plan.eventId;
  return {
    eventId: resolvedEventId,
    eventName: resolvedEventId,
    planId: context.assignment.planId || plan.id,
    planName: plan.name,
    reviewVersion: context.review?.version,
    initialScores,
    initialResponses,
    initialConfirmed: Object.entries(scores)
      .filter(([criterionId, score]) => {
        const criterion = round.rubric.criteria.find((candidate) => candidate.id === criterionId);
        return (
          score.humanConfirmedBy !== null &&
          criterion !== undefined &&
          criterionType(criterion) !== "free_text"
        );
      })
      .map(([criterionId]) => criterionId),
    initialComment: parsedComment.comment,
    submittedAt:
      context.review?.submittedAt ??
      (context.assignment.status === "submitted" ? (context.assignment.updatedAt ?? null) : null),
    id: context.assignment.id,
    reference: context.assignment.submissionId,
    title: context.submission.title,
    abstract: context.submission.abstract,
    assignmentStatus: context.assignment.status,
    track: submissionTrack(round, context.submission.answers),
    participants: context.submission.participants ?? [],
    identityRedacted: context.submission.identityRedacted === true,
    submissionFields: submissionFields(
      context.submission.answers,
      round.blindReview === true || context.submission.identityRedacted === true,
    ),
    round,
    aiSuggestions,
    suggestions,
  };
}

async function loadReviewerWorkspace(
  eventId: string | undefined,
  baseUrl: string,
): Promise<readonly ApiReviewerWorkspaceAssignment[]> {
  const path =
    eventId === undefined
      ? "/reviewer/workspace"
      : `/reviewer/workspace?eventId=${encodeURIComponent(eventId)}`;
  try {
    const result = await evaluationRequest<ApiReviewerWorkspaceResponse>(baseUrl, path);
    return result.assignments
      .filter((entry) => entry.assignment.status !== "abstained")
      .map((entry) => ({
        ...entry,
        plan: {
          ...entry.plan,
          ...((entry.plan.status as string) === "active" ? { status: "open" as const } : {}),
        },
      }));
  } catch (reason: unknown) {
    if (
      reason instanceof EvaluationRequestError &&
      (reason.status === 401 || reason.status === 403)
    ) {
      throw new Error("Reviewer access is required to open this workspace.");
    }
    throw reason;
  }
}

async function loadEvaluatorData(eventId: string, baseUrl: string): Promise<EvaluatorAssignment> {
  const entries = await loadReviewerWorkspace(eventId, baseUrl);
  const plans = [...new Map(entries.map((entry) => [entry.plan.id, entry.plan] as const)).values()];
  const plan = [...plans].sort(
    (left, right) =>
      (right.status === "open" ? 1 : 0) - (left.status === "open" ? 1 : 0) ||
      (right.updatedAt ?? right.createdAt).localeCompare(left.updatedAt ?? left.createdAt) ||
      right.id.localeCompare(left.id),
  )[0];
  const entry =
    plan === undefined
      ? undefined
      : [...entries]
          .filter((candidate) => candidate.plan.id === plan.id)
          .sort(
            (left, right) =>
              (left.assignment.createdAt ?? left.assignment.updatedAt ?? "").localeCompare(
                right.assignment.createdAt ?? right.assignment.updatedAt ?? "",
              ) || left.assignment.id.localeCompare(right.assignment.id),
          )[0];
  if (entry === undefined) throw new Error("No review assignment is available.");
  return mapEvaluatorAssignment(entry.plan, entry);
}

export async function loadEvaluatorQueue(
  eventId: string | undefined,
  baseUrl: string,
): Promise<readonly ReviewerQueueEntry[]> {
  const entries = await loadReviewerWorkspace(eventId, baseUrl);
  return entries
    .map((entry) => ({
      assignment: mapEvaluatorAssignment(entry.plan, entry),
    }))
    .sort(
      (left, right) =>
        left.assignment.eventId.localeCompare(right.assignment.eventId) ||
        left.assignment.planName.localeCompare(right.assignment.planName) ||
        left.assignment.round.name.localeCompare(right.assignment.round.name) ||
        left.assignment.title.localeCompare(right.assignment.title) ||
        left.assignment.id.localeCompare(right.assignment.id),
    );
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
function formatAssignmentStatus(status: EvaluatorAssignment["assignmentStatus"]): string {
  if (status === "submitted") return "Submitted";
  if (status === "in_progress") return "In progress";
  if (status === "abstained") return "Recused";
  return "Needs review";
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
  organizationId,
}: Readonly<{ eventId?: string; mode: ReviewWorkspaceMode; organizationId?: string | undefined }>) {
  if (mode === "evaluator") {
    return (
      <nav className={styles.reviewNavigation} aria-label="Reviewer navigation">
        <Link className={styles.navCurrent} href="/review" aria-current="page">
          Review queue
        </Link>
      </nav>
    );
  }
  if (eventId === undefined) return null;
  const resolvedOrganizationId = configuredOrganizationId(organizationId);
  const reviewBase =
    resolvedOrganizationId === null
      ? `/admin/events/${encodeURIComponent(eventId)}/reviews`
      : `/admin/organizations/${encodeURIComponent(resolvedOrganizationId)}/events/${encodeURIComponent(eventId)}/reviews`;
  return (
    <nav className={styles.reviewNavigation} aria-label="Review workspace">
      <Link className={styles.navCurrent} href={reviewBase} aria-current="page">
        Review plan
      </Link>
      <Link className={styles.navLink} href={`${reviewBase}/evaluate`}>
        Assigned review
      </Link>
    </nav>
  );
}

export function ReviewWorkspace({
  eventId,
  mode = "organizer",
  initialState,
  organizationId: explicitOrganizationId,
  memberApi: providedMemberApi,
}: ReviewWorkspaceProps) {
  const baseUrl = apiBaseUrl();
  const reviewerOrganizationId = configuredOrganizationId(explicitOrganizationId);
  const initialStateProvided = initialState !== undefined;
  const reviewerQueueMode = mode === "evaluator" && eventId === undefined;
  const [seed, setSeed] = useState<ReviewPlanSeed | null>(() =>
    mode === "organizer" ? (initialState?.organizer ?? null) : null,
  );
  const [assignment, setAssignment] = useState<EvaluatorAssignment | null>(() =>
    mode === "evaluator" && !reviewerQueueMode ? (initialState?.assignment ?? null) : null,
  );
  const [queue, setQueue] = useState<readonly ReviewerQueueEntry[] | null>(() =>
    mode === "evaluator" && reviewerQueueMode ? (initialState?.queue ?? null) : null,
  );
  const [loading, setLoading] = useState(!initialStateProvided);
  const [error, setError] = useState<string | null>(null);
  const [missingPlan, setMissingPlan] = useState(
    mode === "organizer" && initialState?.organizerPlanMissing === true,
  );
  const [reviewerMembers, setReviewerMembers] = useState<readonly OrganizationMember[]>([]);
  const [reviewerMembersLoading, setReviewerMembersLoading] = useState(
    mode === "organizer" && eventId !== undefined,
  );
  const [reviewerMembersError, setReviewerMembersError] = useState<string | null>(null);
  useEffect(() => {
    if (mode !== "organizer" || eventId === undefined) {
      setReviewerMembersLoading(false);
      setReviewerMembersError(null);
      return;
    }
    let active = true;
    setReviewerMembersLoading(true);
    setReviewerMembersError(null);
    setReviewerMembers([]);
    let memberApi = providedMemberApi;
    if (memberApi === undefined) {
      if (baseUrl === null || reviewerOrganizationId === null) {
        setReviewerMembersLoading(false);
        setReviewerMembersError("The organization member API is not configured.");
        return () => {
          active = false;
        };
      }
      try {
        memberApi = createMemberApi(baseUrl, reviewerOrganizationId);
      } catch (reason: unknown) {
        setReviewerMembersLoading(false);
        setReviewerMembersError(
          reason instanceof Error
            ? reason.message
            : "The organization member API could not be initialized.",
        );
        return () => {
          active = false;
        };
      }
    }
    void memberApi
      .listMembers()
      .then((members) => {
        if (!active) return;
        if (
          reviewerOrganizationId !== null &&
          members.some((member) => member.organizationId !== reviewerOrganizationId)
        ) {
          throw new TypeError("The member response belongs to another organization.");
        }
        setReviewerMembers(members);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setReviewerMembers([]);
        setReviewerMembersError(
          reason instanceof Error ? reason.message : "The organization member request failed.",
        );
      })
      .finally(() => {
        if (active) setReviewerMembersLoading(false);
      });
    return () => {
      active = false;
    };
  }, [baseUrl, eventId, mode, providedMemberApi, reviewerOrganizationId]);

  useEffect(() => {
    if (initialStateProvided) return;
    let active = true;
    setLoading(true);
    setError(null);
    setMissingPlan(false);
    setSeed(null);
    setAssignment(null);
    setQueue(null);
    if (baseUrl === null) {
      setLoading(false);
      setError("The evaluation API is not configured.");
      return () => {
        active = false;
      };
    }
    const load =
      mode === "organizer"
        ? eventId === undefined
          ? Promise.reject(new Error("An event is required for organizer review plans."))
          : loadOrganizerData(eventId, baseUrl, undefined, false)
        : reviewerQueueMode
          ? loadEvaluatorQueue(eventId, baseUrl)
          : eventId === undefined
            ? Promise.reject(new Error("An event is required for assigned review."))
            : loadEvaluatorData(eventId, baseUrl);
    void load
      .then((value) => {
        if (!active) return;
        if (mode === "organizer") {
          const fastSeed = value as ReviewPlanSeed;
          setSeed(fastSeed);
          if (eventId !== undefined) {
            void loadOrganizerData(eventId, baseUrl, fastSeed.planId)
              .then((detailedSeed) => {
                if (active) setSeed(detailedSeed);
              })
              .catch(() => {
                // The fast authoritative plan remains usable when optional score hydration is slow.
              });
          }
        } else if (reviewerQueueMode) setQueue(value as readonly ReviewerQueueEntry[]);
        else setAssignment(value as EvaluatorAssignment);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        if (mode === "organizer" && reason instanceof MissingEvaluationPlanError) {
          setMissingPlan(true);
          return;
        }
        setError(reason instanceof Error ? reason.message : "The evaluation request failed.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [baseUrl, eventId, mode, reviewerQueueMode, initialStateProvided]);

  if (loading) {
    return (
      <WorkspaceStatus
        {...(eventId === undefined ? {} : { eventId })}
        mode={mode}
        organizationId={explicitOrganizationId}
        message="Loading authoritative evaluation data…"
      />
    );
  }
  if (error !== null) {
    return (
      <WorkspaceStatus
        {...(eventId === undefined ? {} : { eventId })}
        mode={mode}
        organizationId={explicitOrganizationId}
        message={error}
        error
      />
    );
  }
  if (mode === "evaluator") {
    if (reviewerQueueMode) {
      return <ReviewerQueueWorkspace entries={queue ?? []} baseUrl={baseUrl ?? ""} />;
    }
    return assignment === null ? (
      <WorkspaceStatus
        {...(eventId === undefined ? {} : { eventId })}
        mode={mode}
        organizationId={explicitOrganizationId}
        message="No review assignment is available."
        error
      />
    ) : (
      <EvaluatorWorkspace assignment={assignment} baseUrl={baseUrl ?? ""} />
    );
  }
  if (missingPlan && eventId !== undefined) {
    return (
      <OrganizerPlanCreation
        eventId={eventId}
        organizationId={explicitOrganizationId}
        baseUrl={baseUrl ?? ""}
        onCreated={(plan) => {
          setMissingPlan(false);
          setSeed(seedFromCreatedPlan(plan, eventId));
          if (baseUrl !== null) {
            void loadOrganizerData(eventId, baseUrl, plan.id)
              .then((authoritative) => setSeed(authoritative))
              .catch(() => {
                // Keep the created plan visible if the follow-up snapshot is unavailable.
              });
          }
        }}
      />
    );
  }
  return seed === null ? (
    <WorkspaceStatus
      {...(eventId === undefined ? {} : { eventId })}
      mode={mode}
      organizationId={explicitOrganizationId}
      message="No evaluation plan is available."
      error
    />
  ) : (
    <OrganizerWorkspace
      seed={seed}
      baseUrl={baseUrl ?? ""}
      organizationId={explicitOrganizationId}
      reviewerMembers={activeVerifiedReviewers(reviewerMembers)}
      reviewerMembersLoading={reviewerMembersLoading}
      reviewerMembersError={reviewerMembersError}
    />
  );
}

function planIdForCreation(eventId: string, name: string): string {
  const slug = `${eventId}-${name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 92);
  return `plan-${slug || "evaluation"}`;
}

export interface CreateEvaluationPlanFormInput {
  readonly eventId: string;
  readonly name: string;
  readonly roundCount: number;
  readonly firstRoundTitle: string;
  readonly firstRubricTitle: string;
  readonly firstCriterionTitle: string;
  readonly blindReview: boolean;
}

export function validateCreateEvaluationPlanForm(
  input: CreateEvaluationPlanFormInput,
): string | null {
  if (input.eventId.trim().length === 0) return "Event ID is required.";
  if (input.name.trim().length === 0) return "Plan name is required.";
  if (input.firstRoundTitle.trim().length === 0) return "The first round title is required.";
  if (input.firstRubricTitle.trim().length === 0) return "The first rubric title is required.";
  if (input.firstCriterionTitle.trim().length === 0)
    return "The first criterion title is required.";
  if (!Number.isSafeInteger(input.roundCount) || input.roundCount < 1 || input.roundCount > 10) {
    return "Rounds must be a whole number between 1 and 10.";
  }
  return null;
}
export function buildEvaluationPlanCreateDto(input: CreateEvaluationPlanFormInput) {
  const normalizedName = input.name.trim();
  const normalizedRoundTitle = input.firstRoundTitle.trim();
  const normalizedRubricTitle = input.firstRubricTitle.trim();
  const normalizedCriterionTitle = input.firstCriterionTitle.trim();
  const rounds = Array.from({ length: input.roundCount }, (_, index) => {
    const sequence = index + 1;
    const suffix = sequence === 1 ? "" : ` ${sequence}`;
    return {
      id: `round-${sequence}`,
      name: `${normalizedRoundTitle}${suffix}`,
      sequence,
      opensAt: null,
      closesAt: null,
      blindReview: input.blindReview,
      anonymization: input.blindReview ? ("double" as const) : ("none" as const),
      rubric: {
        id: `rubric-${sequence}`,
        name: `${normalizedRubricTitle}${suffix}`,
        criteria: [
          {
            id: `criterion-${sequence}-1`,
            label: `${normalizedCriterionTitle}${suffix}`,
            description: "Describe the evidence reviewers should consider.",
            minimum: 1,
            maximum: 5,
            weight: 1,
            required: true,
          },
        ],
      },
    };
  });
  return {
    id: planIdForCreation(input.eventId, normalizedName),
    eventId: input.eventId,
    name: normalizedName,
    blindReview: input.blindReview,
    closesAt: null,
    assignmentRule: {
      reviewsPerSubmission: 1,
      maxAssignmentsPerReviewer: 5,
    },
    rounds,
  };
}

export async function createEvaluationPlan(
  baseUrl: string,
  input: CreateEvaluationPlanFormInput,
  fetcher: Fetcher = fetch,
): Promise<ApiPlan> {
  const validationMessage = validateCreateEvaluationPlanForm(input);
  if (validationMessage !== null) throw new Error(validationMessage);
  return evaluationRequest<ApiPlan>(
    baseUrl,
    "/plans",
    {
      method: "POST",
      body: JSON.stringify(buildEvaluationPlanCreateDto(input)),
    },
    fetcher,
  );
}
function OrganizerPlanCreation({
  eventId,
  baseUrl,
  organizationId,
  onCreated,
}: Readonly<{
  eventId: string;
  organizationId?: string | undefined;
  baseUrl: string;
  onCreated: (plan: ApiPlan) => void;
}>) {
  const [name, setName] = useState("");
  const [roundCount, setRoundCount] = useState(1);
  const [firstRoundTitle, setFirstRoundTitle] = useState("Initial review");
  const [firstRubricTitle, setFirstRubricTitle] = useState("Evaluation rubric");
  const [firstCriterionTitle, setFirstCriterionTitle] = useState("Overall quality");
  const [blindReview, setBlindReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const input = {
      eventId,
      name,
      roundCount,
      firstRoundTitle,
      firstRubricTitle,
      firstCriterionTitle,
      blindReview,
    };
    if (baseUrl.length === 0) {
      setMessage("The evaluation API is not configured.");
      return;
    }
    const validationMessage = validateCreateEvaluationPlanForm(input);
    if (validationMessage !== null) {
      setMessage(validationMessage);
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const plan = await createEvaluationPlan(baseUrl, input);
      onCreated(plan);
    } catch (reason: unknown) {
      setMessage(
        reason instanceof Error ? reason.message : "The evaluation plan could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.workspace} id="review-workspace">
      <a className={styles.skipLink} href="#review-content">
        Skip to review workspace content
      </a>
      <header className={styles.workspaceHeader}>
        <div>
          <p className={styles.eyebrow}>{eventId} · organizer</p>
          <h1>Create evaluation plan</h1>
        </div>
        <ReviewNavigation eventId={eventId} mode="organizer" organizationId={organizationId} />
      </header>
      <section id="review-content" className={styles.section} aria-labelledby="create-plan-heading">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.sectionEyebrow}>Organizer setup</p>
            <h2 id="create-plan-heading">Create the first evaluation plan</h2>
          </div>
        </div>
        <p className={styles.sectionIntro}>
          Start with one or more rounds and a first rubric. You can add rounds, reviewer pools, and
          criteria after the plan is created.
        </p>
        <form onSubmit={(event) => void submit(event)} aria-describedby="create-plan-help">
          <div className={styles.summaryGrid}>
            <div className={styles.formField}>
              <label htmlFor="create-plan-name">Plan name</label>
              <input
                id="create-plan-name"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                autoComplete="off"
                required
              />
            </div>
            <div className={styles.formField}>
              <label htmlFor="create-plan-event-id">Event ID</label>
              <input id="create-plan-event-id" value={eventId} readOnly />
            </div>
            <div className={styles.formField}>
              <label htmlFor="create-plan-rounds">Rounds</label>
              <input
                id="create-plan-rounds"
                type="number"
                min={1}
                max={10}
                step={1}
                value={roundCount}
                onChange={(event) =>
                  setRoundCount(parseNumericAuthoringValue(roundCount, event.currentTarget.value))
                }
                required
              />
            </div>
            <label className={styles.checkboxLabel} htmlFor="create-plan-blind-review">
              <input
                id="create-plan-blind-review"
                type="checkbox"
                checked={blindReview}
                onChange={(event) => setBlindReview(event.currentTarget.checked)}
              />
              Blind review
            </label>
          </div>
          <div className={styles.summaryGrid}>
            <div className={styles.formField}>
              <label htmlFor="create-plan-first-round">First round title</label>
              <input
                id="create-plan-first-round"
                value={firstRoundTitle}
                onChange={(event) => setFirstRoundTitle(event.currentTarget.value)}
                required
              />
            </div>
            <div className={styles.formField}>
              <label htmlFor="create-plan-first-rubric">First rubric title</label>
              <input
                id="create-plan-first-rubric"
                value={firstRubricTitle}
                onChange={(event) => setFirstRubricTitle(event.currentTarget.value)}
                required
              />
            </div>
            <div className={styles.formField}>
              <label htmlFor="create-plan-first-criterion">First criterion title</label>
              <input
                id="create-plan-first-criterion"
                value={firstCriterionTitle}
                onChange={(event) => setFirstCriterionTitle(event.currentTarget.value)}
                required
              />
            </div>
          </div>
          <p className={styles.fieldHint} id="create-plan-help">
            Event access comes from the organizer route. The first draft is ready for authoring
            after creation.
          </p>
          {message ? (
            <p className={styles.formError} role="alert">
              {message}
            </p>
          ) : null}
          <button className={styles.primaryButton} type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create evaluation plan"}
          </button>
        </form>
      </section>
    </div>
  );
}
function WorkspaceStatus({
  eventId,
  mode,
  organizationId,
  message,
  error = false,
}: Readonly<{
  eventId?: string;
  organizationId?: string | undefined;
  mode: ReviewWorkspaceMode;
  message: string;
  error?: boolean;
}>) {
  const reviewer = mode === "evaluator";
  return (
    <div className={styles.workspace} id="review-workspace">
      <a className={styles.skipLink} href="#review-content">
        Skip to review workspace content
      </a>
      <header className={styles.workspaceHeader}>
        <div>
          <p className={styles.eyebrow}>
            {eventId === undefined ? "Reviewer workspace" : `${eventId} · ${mode}`}
          </p>
          <h1>{reviewer ? "Reviewer queue" : "Evaluation plan"}</h1>
        </div>
        <ReviewNavigation
          {...(eventId === undefined ? {} : { eventId })}
          mode={mode}
          organizationId={organizationId}
        />
      </header>
      <section id="review-content" className={styles.section} role={error ? "alert" : "status"}>
        <h2>{error ? "Evaluation unavailable" : "Evaluation data"}</h2>
        <p>{message}</p>
      </section>
    </div>
  );
}

function OrganizerAuthoring({
  seed,
  baseUrl,
  reviewerMembers,
  reviewerMembersLoading,
  reviewerMembersError,
  onAuthoritativePlan,
  onAssignmentsPersisted,
}: Readonly<{
  seed: ReviewPlanSeed;
  baseUrl: string;
  reviewerMembers: readonly OrganizationMember[];
  reviewerMembersLoading: boolean;
  reviewerMembersError: string | null;
  onAuthoritativePlan?: ((plan: ApiPlan) => void) | undefined;
  onAssignmentsPersisted?: (() => Promise<void>) | undefined;
}>) {
  const initialRounds: readonly ApiPlan["rounds"][number][] =
    seed.sourceRounds ??
    seed.rounds.map((round, index) => ({
      id: round.id,
      name: round.name,
      sequence: round.sequence ?? index + 1,
      opensAt: null,
      closesAt: null,
      blindReview: round.blindReview,
      anonymization: round.anonymization,
      reviewerPool: round.reviewerPool,
      trackFilter: round.trackFilter,
      rubric: {
        id: `rubric-${round.id}`,
        name: round.rubric.name,
        criteria: round.rubric.criteria,
      },
    }));
  const [name, setName] = useState(seed.planName);
  const [planClosesAt, setPlanClosesAt] = useState(seed.sourceClosesAt ?? "");
  const [blindReview, setBlindReview] = useState(seed.blindReview);
  const [reviewsPerSubmission, setReviewsPerSubmission] = useState(
    seed.assignmentRule.reviewsPerSubmission,
  );
  const [maxAssignmentsPerReviewer, setMaxAssignmentsPerReviewer] = useState(
    seed.assignmentRule.maxAssignmentsPerReviewer,
  );
  const [fieldIds, setFieldIds] = useState(seed.reviewerProjection?.fieldIds?.join(", ") ?? "");
  const [fileIds, setFileIds] = useState(seed.reviewerProjection?.fileIds?.join(", ") ?? "");
  const [rounds, setRounds] = useState<readonly ApiPlan["rounds"][number][]>(initialRounds);
  const [assignmentRoundId, setAssignmentRoundId] = useState(
    seed.rounds[0]?.id ?? initialRounds[0]?.id ?? "",
  );
  const [assignmentPreview, setAssignmentPreview] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [assignmentSubmissionId, setAssignmentSubmissionId] = useState("");
  const [assignmentReviewerIds, setAssignmentReviewerIds] = useState<readonly string[]>([]);
  const [version, setVersion] = useState(seed.version);
  const [status, setStatus] = useState(seed.status);
  const [busy, setBusy] = useState(false);
  const reviewerIdSet = new Set(reviewerMembers.map((member) => member.userId));
  const reviewerDirectoryReady = !reviewerMembersLoading && reviewerMembersError === null;

  useEffect(() => {
    const allowedReviewerIds = new Set(reviewerMembers.map((member) => member.userId));
    setAssignmentReviewerIds((current) =>
      current.filter((reviewerId) => allowedReviewerIds.has(reviewerId)),
    );
  }, [reviewerMembers]);

  function updateRound(
    roundIndex: number,
    update: (round: ApiPlan["rounds"][number]) => ApiPlan["rounds"][number],
  ): void {
    setRounds((current) =>
      current.map((round, index) => (index === roundIndex ? update(round) : round)),
    );
  }

  function updateCriterion(
    roundIndex: number,
    criterionIndex: number,
    update: (criterion: RubricCriterion) => RubricCriterion,
  ): void {
    updateRound(roundIndex, (round) => ({
      ...round,
      rubric: {
        ...round.rubric,
        criteria: round.rubric.criteria.map((criterion, index) =>
          index === criterionIndex ? update(criterion) : criterion,
        ),
      },
    }));
  }

  function addRound(): void {
    const source = rounds[rounds.length - 1];
    if (source === undefined) return;
    const sequence = rounds.length + 1;
    setRounds((current) => [
      ...current,
      {
        ...source,
        id: `round-${sequence}`,
        name: `Round ${sequence}`,
        sequence,
        opensAt: null,
        closesAt: null,
        blindReview: source.blindReview,
        anonymization: source.anonymization,
        reviewerPool: source.reviewerPool,
        trackFilter: source.trackFilter,
        rubric: {
          ...source.rubric,
          id: `rubric-round-${sequence}`,
          name: `${source.rubric.name} ${sequence}`,
          criteria: source.rubric.criteria.map((criterion) => ({
            ...criterion,
          })),
        },
      },
    ]);
  }

  function addCriterion(roundIndex: number): void {
    updateRound(roundIndex, (round) => {
      const nextNumber = round.rubric.criteria.length + 1;
      return {
        ...round,
        rubric: {
          ...round.rubric,
          criteria: [
            ...round.rubric.criteria,
            {
              id: `${round.id}-criterion-${nextNumber}`,
              label: `Criterion ${nextNumber}`,
              description: "Describe the evidence reviewers should consider.",
              minimum: 1,
              maximum: 5,
              weight: 1,
              required: false,
            },
          ],
        },
      };
    });
  }

  async function saveDraft(): Promise<void> {
    if (baseUrl.length === 0) {
      setMessage("The evaluation API is not configured.");
      return;
    }
    const poolsConfigured = rounds.some(
      (round) => (round.reviewerPool?.reviewerIds.length ?? 0) > 0,
    );
    if (poolsConfigured && !reviewerDirectoryReady) {
      setMessage(
        reviewerMembersError ??
          "Load the active, verified organization reviewers before saving reviewer pools.",
      );
      return;
    }
    const invalidPoolReviewer = rounds
      .flatMap((round) => round.reviewerPool?.reviewerIds ?? [])
      .find((reviewerId) => !reviewerIdSet.has(reviewerId));
    if (invalidPoolReviewer !== undefined) {
      setMessage(
        `Reviewer ${invalidPoolReviewer} is not an active, verified member of this organization.`,
      );
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const updated = await evaluationRequest<ApiPlan>(
        baseUrl,
        `/plans/${encodeURIComponent(seed.planId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            expectedVersion: version,
            closesAt: planClosesAt.trim().length === 0 ? null : planClosesAt,
            name: name.trim(),
            blindReview: blindReview || rounds.some((round) => round.blindReview === true),
            assignmentRule: {
              reviewsPerSubmission,
              maxAssignmentsPerReviewer,
              trackFilter: null,
              autoDistribute: false,
            },
            rounds,
            reviewerProjection: {
              fieldIds: fieldIds
                .split(",")
                .map((value) => value.trim())
                .filter((value) => value.length > 0),
              fileIds: fileIds
                .split(",")
                .map((value) => value.trim())
                .filter((value) => value.length > 0),
            },
          }),
        },
      );
      setMessage(`Draft saved at server version ${updated.version}.`);
      setRounds(updated.rounds);
      setName(updated.name);
      setPlanClosesAt(updated.closesAt ?? "");
      setReviewsPerSubmission(updated.assignmentRule.reviewsPerSubmission);
      setMaxAssignmentsPerReviewer(updated.assignmentRule.maxAssignmentsPerReviewer);
      setFieldIds(updated.reviewerProjection?.fieldIds?.join(", ") ?? "");
      setFileIds(updated.reviewerProjection?.fileIds?.join(", ") ?? "");
      setVersion(updated.version);
      setBlindReview(updated.blindReview);
      setStatus(updated.status);
      onAuthoritativePlan?.(updated);
    } catch (reason: unknown) {
      setMessage(reason instanceof Error ? reason.message : "The plan draft could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  function previewAssignments(): void {
    const round = rounds.find((candidate) => candidate.id === assignmentRoundId);
    const reviewerIds = [...assignmentReviewerIds];
    const submissionId = assignmentSubmissionId.trim();
    if (round === undefined || submissionId.length === 0 || reviewerIds.length === 0) {
      setAssignmentPreview("Enter a round, submission id, and at least one reviewer to preview.");
      return;
    }
    if (!reviewerDirectoryReady) {
      setAssignmentPreview(
        reviewerMembersError ??
          "Load the active, verified organization reviewers before previewing assignments.",
      );
      return;
    }
    if (reviewerIds.some((reviewerId) => !reviewerIdSet.has(reviewerId))) {
      setAssignmentPreview("Select only active, verified organization reviewers.");
      return;
    }
    const pool = round.reviewerPool?.reviewerIds;
    const inPoolCount = pool?.filter((reviewerId) => reviewerIds.includes(reviewerId)).length ?? 0;
    setAssignmentPreview(
      `${reviewerIds.length} reviewer(s) will receive ${submissionId} in ${round.name}${
        pool === undefined
          ? ". No round pool is configured."
          : `; ${inPoolCount} of ${reviewerIds.length} are in the configured pool.`
      }`,
    );
  }

  async function assignReviewers(): Promise<void> {
    const round = rounds.find((candidate) => candidate.id === assignmentRoundId);
    const reviewerIds = [...assignmentReviewerIds];
    if (baseUrl.length === 0) {
      setMessage("The evaluation API is not configured.");
      return;
    }
    if (
      round === undefined ||
      assignmentSubmissionId.trim().length === 0 ||
      reviewerIds.length === 0
    ) {
      setMessage("Provide a round, submission id, and at least one reviewer id.");
      return;
    }
    if (!reviewerDirectoryReady) {
      setMessage(
        reviewerMembersError ??
          "Load the active, verified organization reviewers before assigning reviews.",
      );
      return;
    }
    if (reviewerIds.some((reviewerId) => !reviewerIdSet.has(reviewerId))) {
      setMessage("Select only active, verified organization reviewers.");
      return;
    }
    const configuredPool = round.reviewerPool?.reviewerIds;
    if (
      configuredPool !== undefined &&
      reviewerIds.some((reviewerId) => !configuredPool.includes(reviewerId))
    ) {
      setMessage("Every assigned reviewer must belong to this round's reviewer pool.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await evaluationRequest<{
        assignments: readonly ApiAssignment[];
      }>(baseUrl, `/plans/${encodeURIComponent(seed.planId)}/assignments`, {
        method: "POST",
        body: JSON.stringify({
          roundId: round.id,
          submissionId: assignmentSubmissionId.trim(),
          reviewerIds,
          expectedVersion: version,
        }),
      });
      const assignmentIds = result.assignments.map((assignment) => assignment.id);
      setAssignmentPreview(
        `${result.assignments.length} reviewer assignment(s) persisted: ${assignmentIds.join(", ")}`,
      );
      setMessage(`${result.assignments.length} reviewer assignment(s) saved.`);
      await onAssignmentsPersisted?.();
    } catch (reason: unknown) {
      setMessage(
        reason instanceof Error ? reason.message : "Reviewer assignments could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function transition(action: "open" | "close"): Promise<void> {
    if (baseUrl.length === 0) {
      setMessage("The evaluation API is not configured.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const updated = await evaluationRequest<ApiPlan>(
        baseUrl,
        `/plans/${encodeURIComponent(seed.planId)}/${action}`,
        { method: "POST", body: JSON.stringify({ expectedVersion: version }) },
      );
      setMessage(`Plan is now ${updated.status} at server version ${updated.version}.`);
      setRounds(updated.rounds);
      setBlindReview(updated.blindReview);
      setPlanClosesAt(updated.closesAt ?? "");
      setVersion(updated.version);
      setStatus(updated.status);
      onAuthoritativePlan?.(updated);
    } catch (reason: unknown) {
      setMessage(
        reason instanceof Error ? reason.message : "The plan status could not be changed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="authoring-heading">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.sectionEyebrow}>Organizer authoring</p>
          <h2 id="authoring-heading">Author and lock the evaluation plan</h2>
        </div>
        <span className={styles.mutedLabel}>Version {version} · optimistic locking</span>
      </div>
      <p className={styles.sectionIntro}>
        Edit rounds, rubric criteria, bounds, weights, assignment limits, and the deny-by-default
        evaluator projection while the plan is a draft. Opening the plan locks grading
        configuration.
      </p>
      <div className={styles.formField}>
        <label htmlFor="evaluation-plan-name">Plan name</label>
        <input
          id="evaluation-plan-name"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
      </div>
      <div className={styles.formField}>
        <label htmlFor="evaluation-plan-closes-at">Plan closes at (ISO-8601)</label>
        <input
          id="evaluation-plan-closes-at"
          value={planClosesAt}
          onChange={(event) => setPlanClosesAt(event.currentTarget.value)}
          placeholder="2026-08-24T12:00:00.000Z"
        />
      </div>
      <div className={styles.summaryGrid}>
        <div className={styles.formField}>
          <label htmlFor="reviews-per-submission">Reviews per submission</label>
          <input
            id="reviews-per-submission"
            type="number"
            min={1}
            value={reviewsPerSubmission}
            onChange={(event) =>
              setReviewsPerSubmission(
                parseNumericAuthoringValue(reviewsPerSubmission, event.currentTarget.value),
              )
            }
          />
        </div>
        <div className={styles.formField}>
          <label htmlFor="max-assignments-per-reviewer">Maximum assignments per reviewer</label>
          <input
            id="max-assignments-per-reviewer"
            type="number"
            min={1}
            value={maxAssignmentsPerReviewer}
            onChange={(event) =>
              setMaxAssignmentsPerReviewer(
                parseNumericAuthoringValue(maxAssignmentsPerReviewer, event.currentTarget.value),
              )
            }
          />
        </div>
        <label className={styles.checkboxLabel} htmlFor="blind-review-setting">
          <input
            id="blind-review-setting"
            type="checkbox"
            checked={blindReview}
            onChange={(event) => setBlindReview(event.currentTarget.checked)}
          />
          Blind review
        </label>
      </div>
      <div className={styles.summaryGrid}>
        <div className={styles.formField}>
          <label htmlFor="reviewer-visible-fields">Evaluator-visible fields</label>
          <input
            id="reviewer-visible-fields"
            value={fieldIds}
            onChange={(event) => setFieldIds(event.currentTarget.value)}
            placeholder="abstract, audience"
            aria-describedby="projection-help"
          />
        </div>
        <div className={styles.formField}>
          <label htmlFor="reviewer-visible-files">Evaluator-visible files</label>
          <input
            id="reviewer-visible-files"
            value={fileIds}
            onChange={(event) => setFileIds(event.currentTarget.value)}
            placeholder="file-id-1"
            aria-describedby="projection-help"
          />
        </div>
      </div>
      <p className={styles.fieldHint} id="projection-help">
        Comma-separated ids are allowlisted; omitted fields and files stay private.
      </p>
      <div className={styles.summaryGrid}>
        <div className={styles.formField}>
          <label htmlFor="assignment-round-id">Round for assignment</label>
          <select
            id="assignment-round-id"
            value={assignmentRoundId}
            onChange={(event) => setAssignmentRoundId(event.currentTarget.value)}
          >
            {rounds.map((round) => (
              <option value={round.id} key={round.id}>
                {round.name}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.formField}>
          <span className={styles.cardLabel}>Assignment tooling</span>
          <span className={styles.fieldHint}>
            The plan cap is {maxAssignmentsPerReviewer} assignments per reviewer. Preview before
            confirming a persisted assignment.
          </span>
        </div>
      </div>
      <div className={styles.summaryGrid}>
        <div className={styles.formField}>
          <label htmlFor="assignment-submission-id">Submission id to assign</label>
          <select
            id="assignment-submission-id"
            value={assignmentSubmissionId}
            onChange={(event) => setAssignmentSubmissionId(event.currentTarget.value)}
            disabled={busy || seed.aggregates.length === 0}
            required
          >
            <option value="">Choose a submission</option>
            {seed.aggregates.map((aggregate) => (
              <option value={aggregate.id} key={aggregate.id}>
                {aggregate.reference} · {aggregate.title}
              </option>
            ))}
          </select>
          <span className={styles.fieldHint}>
            {seed.aggregates.length === 0
              ? "No submissions are available for assignment."
              : "Choose a submission from the authoritative event material."}
          </span>
        </div>
        <div className={styles.formField}>
          <label htmlFor="assignment-reviewer-ids">Verified organization reviewers</label>
          <select
            id="assignment-reviewer-ids"
            multiple
            size={Math.max(3, Math.min(8, reviewerMembers.length || 3))}
            value={[...assignmentReviewerIds]}
            disabled={busy || reviewerMembersLoading || reviewerMembersError !== null}
            onChange={(event) =>
              setAssignmentReviewerIds(
                [...event.currentTarget.selectedOptions].map((option) => option.value),
              )
            }
            aria-describedby="assignment-reviewer-help"
          >
            {reviewerMembers.map((member) => (
              <option value={member.userId} key={member.userId}>
                {member.name ?? member.email} · {member.email}
              </option>
            ))}
          </select>
          <span className={styles.fieldHint} id="assignment-reviewer-help">
            {reviewerMembersLoading
              ? "Loading active, verified organization reviewers…"
              : (reviewerMembersError ??
                (reviewerMembers.length === 0
                  ? "No active, verified organization reviewers are available."
                  : "Names and email addresses are display-only; assignments submit each member user ID."))}
          </span>
        </div>
      </div>
      <button
        className={styles.secondaryButton}
        type="button"
        onClick={previewAssignments}
        disabled={busy}
      >
        Preview assignments
      </button>
      {assignmentPreview ? (
        <p className={styles.fieldHint} role="status">
          {assignmentPreview}
        </p>
      ) : null}
      <button
        className={styles.secondaryButton}
        type="button"
        onClick={() => void assignReviewers()}
        disabled={busy}
      >
        Assign reviewers
      </button>
      <div className={styles.scoreList}>
        {rounds.map((round, roundIndex) => (
          <fieldset className={styles.scoreCard} key={round.id}>
            <legend>{round.name}</legend>
            <div className={styles.formField}>
              <label htmlFor={`${round.id}-name`}>Round name</label>
              <input
                id={`${round.id}-name`}
                value={round.name}
                onChange={(event) => {
                  const nextName = event.currentTarget.value;
                  updateRound(roundIndex, (current) => ({
                    ...current,
                    name: nextName,
                  }));
                }}
              />
            </div>
            <div className={styles.formField}>
              <label htmlFor={`${round.id}-rubric`}>Rubric name</label>
              <input
                id={`${round.id}-rubric`}
                value={round.rubric.name}
                onChange={(event) => {
                  const nextRubricName = event.currentTarget.value;
                  updateRound(roundIndex, (current) => ({
                    ...current,
                    rubric: {
                      ...current.rubric,
                      name: nextRubricName,
                    },
                  }));
                }}
              />
            </div>
            <div className={styles.formField}>
              <label htmlFor={`${round.id}-closes-at`}>Round closes at (ISO-8601)</label>
              <input
                id={`${round.id}-closes-at`}
                value={round.closesAt ?? ""}
                onChange={(event) => {
                  const nextClosesAt = event.currentTarget.value.trim() || null;
                  updateRound(roundIndex, (current) => ({
                    ...current,
                    closesAt: nextClosesAt,
                  }));
                }}
                placeholder="2026-08-18T12:00:00.000Z"
              />
            </div>
            <div className={styles.summaryGrid}>
              <div className={styles.formField}>
                <label htmlFor={`${round.id}-opens-at`}>Round opens at (ISO-8601)</label>
                <input
                  id={`${round.id}-opens-at`}
                  value={round.opensAt ?? ""}
                  onChange={(event) => {
                    const nextOpensAt = event.currentTarget.value.trim() || null;
                    updateRound(roundIndex, (current) => ({
                      ...current,
                      opensAt: nextOpensAt,
                    }));
                  }}
                  placeholder="2026-08-01T12:00:00.000Z"
                />
              </div>
              <div className={styles.formField}>
                <label htmlFor={`${round.id}-anonymization`}>Anonymization / blind review</label>
                <select
                  id={`${round.id}-anonymization`}
                  value={round.anonymization ?? (round.blindReview ? "double" : "none")}
                  onChange={(event) => {
                    const nextAnonymization = event.currentTarget.value as
                      | "none"
                      | "single"
                      | "double";
                    updateRound(roundIndex, (current) => ({
                      ...current,
                      anonymization: nextAnonymization,
                      blindReview: nextAnonymization !== "none",
                    }));
                  }}
                >
                  <option value="none">No anonymization</option>
                  <option value="single">Single-blind</option>
                  <option value="double">Double-blind</option>
                </select>
              </div>
            </div>
            <div className={styles.summaryGrid}>
              <div className={styles.formField}>
                <label htmlFor={`${round.id}-reviewer-pool`}>
                  Round reviewer pool (verified organization reviewers)
                </label>
                <select
                  id={`${round.id}-reviewer-pool`}
                  multiple
                  size={Math.max(3, Math.min(8, reviewerMembers.length || 3))}
                  value={(round.reviewerPool?.reviewerIds ?? []).filter((reviewerId) =>
                    reviewerIdSet.has(reviewerId),
                  )}
                  disabled={busy || reviewerMembersLoading || reviewerMembersError !== null}
                  onChange={(event) => {
                    const nextReviewerIds = [...event.currentTarget.selectedOptions].map(
                      (option) => option.value,
                    );
                    updateRound(roundIndex, (current) => ({
                      ...current,
                      reviewerPool: {
                        ...(current.reviewerPool ?? {}),
                        reviewerIds: nextReviewerIds,
                      },
                    }));
                  }}
                  aria-describedby={`${round.id}-pool-help`}
                >
                  {reviewerMembers.map((member) => (
                    <option value={member.userId} key={member.userId}>
                      {member.name ?? member.email} · {member.email}
                    </option>
                  ))}
                </select>
                <span className={styles.fieldHint} id={`${round.id}-pool-help`}>
                  {reviewerMembersLoading
                    ? "Loading active, verified organization reviewers…"
                    : (reviewerMembersError ??
                      `This pool applies only to ${round.name}; other rounds have independent pools. Member names are display-only.`)}
                </span>
              </div>
              <div className={styles.formField}>
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
              </div>
            </div>
            <section
              className={styles.criteriaList}
              aria-label={`${round.name} criteria authoring`}
            >
              {round.rubric.criteria.map((criterion, criterionIndex) => (
                <fieldset className={styles.criterionEditor} key={criterion.id}>
                  <legend>
                    Criterion {criterionIndex + 1}: {criterion.label || "Untitled criterion"}
                  </legend>
                  <div className={styles.criterionEditorGrid}>
                    <div className={styles.formField}>
                      <label htmlFor={`${round.id}-criterion-${criterionIndex}-label`}>Label</label>
                      <input
                        id={`${round.id}-criterion-${criterionIndex}-label`}
                        aria-label={`${round.name} criterion ${criterionIndex + 1} label`}
                        value={criterion.label}
                        onChange={(event) => {
                          const nextLabel = event.currentTarget.value;
                          updateCriterion(roundIndex, criterionIndex, (current) => ({
                            ...current,
                            label: nextLabel,
                          }));
                        }}
                      />
                    </div>
                    <div className={styles.formField}>
                      <label htmlFor={`${round.id}-criterion-${criterionIndex}-type`}>
                        Input type
                      </label>
                      <select
                        id={`${round.id}-criterion-${criterionIndex}-type`}
                        aria-label={`${criterion.label} input type`}
                        value={criterionType(criterion)}
                        onChange={(event) => {
                          const nextType = event.currentTarget.value as CriterionInputType;
                          updateCriterion(roundIndex, criterionIndex, (current) => ({
                            ...current,
                            inputType: nextType,
                            ...(nextType === "dropdown" ? {} : { options: undefined }),
                          }));
                        }}
                      >
                        <option value="numeric">Numeric rating</option>
                        <option value="dropdown">Dropdown</option>
                        <option value="free_text">Free text</option>
                      </select>
                    </div>
                    <div className={styles.formField}>
                      <label htmlFor={`${round.id}-criterion-${criterionIndex}-options`}>
                        Dropdown options
                      </label>
                      <input
                        id={`${round.id}-criterion-${criterionIndex}-options`}
                        aria-label={`${criterion.label} dropdown options`}
                        value={(criterion.options ?? []).map((option) => option.label).join(", ")}
                        disabled={criterionType(criterion) !== "dropdown"}
                        onChange={(event) => {
                          const nextOptionLabels = event.currentTarget.value
                            .split(",")
                            .map((value) => value.trim())
                            .filter((value) => value.length > 0);
                          updateCriterion(roundIndex, criterionIndex, (current) => ({
                            ...current,
                            options: nextOptionLabels.map((value, index) => ({
                              id: `${current.id}-option-${index + 1}`,
                              label: value,
                              value,
                            })),
                          }));
                        }}
                        placeholder="Accept, Maybe, Reject"
                      />
                    </div>
                    <div className={styles.formField}>
                      <label htmlFor={`${round.id}-criterion-${criterionIndex}-description`}>
                        Description
                      </label>
                      <textarea
                        id={`${round.id}-criterion-${criterionIndex}-description`}
                        aria-label={`${criterion.label} description`}
                        value={criterion.description}
                        onChange={(event) => {
                          const nextDescription = event.currentTarget.value;
                          updateCriterion(roundIndex, criterionIndex, (current) => ({
                            ...current,
                            description: nextDescription,
                          }));
                        }}
                        rows={3}
                      />
                    </div>
                    <div className={styles.criterionBounds}>
                      <div className={styles.formField}>
                        <label htmlFor={`${round.id}-criterion-${criterionIndex}-minimum`}>
                          Minimum
                        </label>
                        <input
                          id={`${round.id}-criterion-${criterionIndex}-minimum`}
                          aria-label={`${criterion.label} minimum`}
                          type="number"
                          value={criterion.minimum}
                          onChange={(event) => {
                            const nextMinimum = event.currentTarget.value;
                            updateCriterion(roundIndex, criterionIndex, (current) => ({
                              ...current,
                              minimum: parseNumericAuthoringValue(current.minimum, nextMinimum),
                            }));
                          }}
                        />
                      </div>
                      <div className={styles.formField}>
                        <label htmlFor={`${round.id}-criterion-${criterionIndex}-maximum`}>
                          Maximum
                        </label>
                        <input
                          id={`${round.id}-criterion-${criterionIndex}-maximum`}
                          aria-label={`${criterion.label} maximum`}
                          type="number"
                          value={criterion.maximum}
                          onChange={(event) => {
                            const nextMaximum = event.currentTarget.value;
                            updateCriterion(roundIndex, criterionIndex, (current) => ({
                              ...current,
                              maximum: parseNumericAuthoringValue(current.maximum, nextMaximum),
                            }));
                          }}
                        />
                      </div>
                      <div className={styles.formField}>
                        <label htmlFor={`${round.id}-criterion-${criterionIndex}-weight`}>
                          Weight
                        </label>
                        <input
                          id={`${round.id}-criterion-${criterionIndex}-weight`}
                          aria-label={`${criterion.label} weight`}
                          type="number"
                          min={0.01}
                          step={0.01}
                          value={criterion.weight}
                          onChange={(event) => {
                            const nextWeight = event.currentTarget.value;
                            updateCriterion(roundIndex, criterionIndex, (current) => ({
                              ...current,
                              weight: parseNumericAuthoringValue(current.weight, nextWeight),
                            }));
                          }}
                        />
                      </div>
                    </div>
                    <label
                      className={styles.checkboxLabel}
                      htmlFor={`${round.id}-criterion-${criterionIndex}-required`}
                    >
                      <input
                        id={`${round.id}-criterion-${criterionIndex}-required`}
                        aria-label={`${criterion.label} required`}
                        type="checkbox"
                        checked={criterion.required}
                        onChange={(event) => {
                          const nextRequired = event.currentTarget.checked;
                          updateCriterion(roundIndex, criterionIndex, (current) => ({
                            ...current,
                            required: nextRequired,
                          }));
                        }}
                      />
                      Required criterion
                    </label>
                  </div>
                </fieldset>
              ))}
            </section>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => addCriterion(roundIndex)}
              disabled={busy || status !== "draft"}
            >
              Add criterion
            </button>
          </fieldset>
        ))}
      </div>
      <div className={styles.confirmationActions}>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={addRound}
          disabled={busy || status !== "draft"}
        >
          Add round
        </button>
        <button
          className={styles.primaryButton}
          type="button"
          onClick={() => void saveDraft()}
          disabled={busy || status !== "draft"}
        >
          {busy ? "Saving…" : "Save authoring draft"}
        </button>
        {status === "draft" ? (
          <button
            className={styles.primaryButton}
            type="button"
            onClick={() => void transition("open")}
            disabled={busy}
          >
            Open plan
          </button>
        ) : null}
        {status === "open" ? (
          <button
            className={styles.dangerButton}
            type="button"
            onClick={() => void transition("close")}
            disabled={busy}
          >
            Close plan
          </button>
        ) : null}
      </div>
      {message ? (
        <p className={styles.submittedMessage} role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
function OrganizerWorkspace({
  seed,
  baseUrl,
  organizationId,
  reviewerMembers,
  reviewerMembersLoading,
  reviewerMembersError,
}: Readonly<{
  seed: ReviewPlanSeed;
  baseUrl: string;
  organizationId?: string | undefined;
  reviewerMembers: readonly OrganizationMember[];
  reviewerMembersLoading: boolean;
  reviewerMembersError: string | null;
}>) {
  const [authoritativeSeed, setAuthoritativeSeed] = useState(seed);
  const refreshSequenceRef = useRef(0);

  useEffect(() => {
    refreshSequenceRef.current += 1;
    setAuthoritativeSeed(seed);
  }, [seed]);

  async function refreshAuthoritativeSeed(): Promise<void> {
    const sequence = refreshSequenceRef.current + 1;
    refreshSequenceRef.current = sequence;
    try {
      const nextSeed = await loadOrganizerData(seed.eventId, baseUrl, seed.planId);
      if (refreshSequenceRef.current === sequence) setAuthoritativeSeed(nextSeed);
    } catch {
      // Keep the last authoritative snapshot visible when a refresh is unavailable.
    }
  }

  return (
    <OrganizerWorkspaceView
      seed={authoritativeSeed}
      baseUrl={baseUrl}
      organizationId={organizationId}
      reviewerMembers={reviewerMembers}
      reviewerMembersLoading={reviewerMembersLoading}
      reviewerMembersError={reviewerMembersError}
      onAuthoritativePlan={(plan) =>
        setAuthoritativeSeed((current) => seedWithAuthoritativePlan(current, plan))
      }
      onAssignmentsPersisted={refreshAuthoritativeSeed}
    />
  );
}

function OrganizerWorkspaceView({
  seed,
  baseUrl,
  organizationId,
  reviewerMembers,
  reviewerMembersLoading,
  reviewerMembersError,
  onAuthoritativePlan,
  onAssignmentsPersisted,
}: Readonly<{
  seed: ReviewPlanSeed;
  baseUrl: string;
  organizationId?: string | undefined;
  reviewerMembers: readonly OrganizationMember[];
  reviewerMembersLoading: boolean;
  reviewerMembersError: string | null;
  onAuthoritativePlan?: ((plan: ApiPlan) => void) | undefined;
  onAssignmentsPersisted?: (() => Promise<void>) | undefined;
}>) {
  const activeRound =
    [...seed.rounds]
      .filter((round) => round.status === "open")
      .sort((left, right) => (right.sequence ?? 0) - (left.sequence ?? 0))[0] ??
    [...seed.rounds].sort((left, right) => (right.sequence ?? 0) - (left.sequence ?? 0))[0];
  const criteria = activeRound?.rubric.criteria ?? [];
  const [aggregateSort, setAggregateSort] = useState<"ascending" | "descending">("descending");
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const sortedAggregates = [...seed.aggregates].sort((left, right) => {
    const leftScore = Number(left.countedScore);
    const rightScore = Number(right.countedScore);
    const leftHasScore = Number.isFinite(leftScore);
    const rightHasScore = Number.isFinite(rightScore);
    if (leftHasScore !== rightHasScore) return leftHasScore ? -1 : 1;
    if (leftHasScore && rightHasScore && leftScore !== rightScore) {
      return aggregateSort === "descending" ? rightScore - leftScore : leftScore - rightScore;
    }
    return left.reference.localeCompare(right.reference);
  });

  async function exportResults(): Promise<void> {
    if (baseUrl.length === 0) {
      setExportMessage("The evaluation API is not configured.");
      return;
    }
    setExportMessage(`Preparing evaluation-${seed.planId}.csv…`);
    try {
      const response = await fetch(
        `${baseUrl}/api/admin/evaluations/plans/${encodeURIComponent(seed.planId)}/export.csv`,
        {
          credentials: "include",
          cache: "no-store",
          headers: { accept: "text/csv" },
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => undefined)) as
          | { error?: { message?: string } }
          | undefined;
        throw new Error(body?.error?.message ?? "The CSV export could not be generated.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `evaluation-${seed.planId}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      setExportMessage(`CSV export ready: ${link.download}`);
    } catch (reason: unknown) {
      setExportMessage(
        reason instanceof Error ? reason.message : "The CSV export could not be generated.",
      );
    }
  }

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
          <ReviewNavigation
            eventId={seed.eventId}
            mode="organizer"
            organizationId={organizationId}
          />
          <span className={`${styles.statusBadge} ${styles.statusOpen}`}>
            <span aria-hidden="true" />
            {formatPlanStatus(seed.status)}
          </span>
        </div>
      </header>

      <div id="review-content" tabIndex={-1}>
        <AuthorityNotice />
        <OrganizerAuthoring
          seed={seed}
          baseUrl={baseUrl}
          reviewerMembers={reviewerMembers}
          reviewerMembersLoading={reviewerMembersLoading}
          reviewerMembersError={reviewerMembersError}
          onAuthoritativePlan={onAuthoritativePlan}
          onAssignmentsPersisted={onAssignmentsPersisted}
        />

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
            {seed.rounds.map((round, roundIndex) => (
              <article className={styles.roundCard} key={round.id}>
                <div className={styles.roundCardHeader}>
                  <div>
                    <span className={styles.roundNumber}>
                      Round {round.sequence ?? roundIndex + 1}
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
                <p className={styles.fieldHint}>
                  {round.blindReview
                    ? "Blind reviewer projection"
                    : "Identity visible to reviewers"}{" "}
                  · {round.reviewerPool?.reviewerIds.length ?? 0} reviewer(s) in this round&apos;s
                  pool
                </p>
                <ProgressBar label={`${round.name} completion`} value={round.completionPercent} />
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section} aria-labelledby="rubric-heading">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionEyebrow}>Round {activeRound?.sequence ?? 1} rubric</p>
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
                  <th scope="col">Input type</th>
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
                      {criterionType(criterion) === "free_text"
                        ? "Free text"
                        : criterionType(criterion) === "dropdown"
                          ? `Dropdown (${criterion.options?.length ?? 0} options)`
                          : "Numeric"}
                    </td>
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
        <ReviewerProgressDashboard
          seed={seed}
          baseUrl={baseUrl}
          reviewerMembers={reviewerMembers}
        />

        <section className={styles.section} aria-labelledby="aggregate-heading">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionEyebrow}>Decision input</p>
              <h2 id="aggregate-heading">Counted aggregate scores</h2>
            </div>
            <span className={styles.mutedLabel}>Human-confirmed scores only</span>
            <div className={styles.confirmationActions}>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() =>
                  setAggregateSort((current) =>
                    current === "descending" ? "ascending" : "descending",
                  )
                }
                aria-label={`Sort aggregate score ${aggregateSort === "descending" ? "ascending" : "descending"}`}
              >
                Sort {aggregateSort === "descending" ? "ascending" : "descending"}
              </button>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => void exportResults()}
              >
                Export review results CSV
              </button>
            </div>
            {exportMessage ? (
              <p className={styles.fieldHint} role="status">
                {exportMessage}
              </p>
            ) : null}
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.dataTable}>
              <caption>Submission aggregates available to organizers</caption>
              <thead>
                <tr>
                  <th scope="col">Submission</th>
                  <th
                    scope="col"
                    aria-sort={aggregateSort === "descending" ? "descending" : "ascending"}
                  >
                    <button
                      className={styles.secondaryButton}
                      type="button"
                      onClick={() =>
                        setAggregateSort((current) =>
                          current === "descending" ? "ascending" : "descending",
                        )
                      }
                    >
                      Counted score ({aggregateSort})
                    </button>
                  </th>
                  <th scope="col">Reviews counted</th>
                  <th scope="col">Safety signals</th>
                </tr>
              </thead>
              <tbody>
                {sortedAggregates.map((aggregate) => (
                  <tr key={aggregate.id}>
                    <th scope="row">
                      <strong>{aggregate.reference}</strong>
                      <span>{aggregate.title}</span>
                      {aggregate.participants && aggregate.participants.length > 0 ? (
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
function ReviewerProgressDashboard({
  seed,
  baseUrl,
  reviewerMembers,
}: Readonly<{
  seed: ReviewPlanSeed;
  baseUrl: string;
  reviewerMembers: readonly OrganizationMember[];
}>) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const outstanding = seed.progress.reviewers.filter((reviewer) => reviewer.outstanding > 0);
  const reviewerLabel = (reviewerId: string): string => {
    const member = reviewerMembers.find((candidate) => candidate.userId === reviewerId);
    return member?.name?.trim() || member?.email || reviewerId;
  };
  const selectedOutstanding = outstanding.filter((reviewer) =>
    selected.has(`${reviewer.reviewerId}\u0000${reviewer.roundId}`),
  );

  function toggle(reviewer: ReviewerProgressSummary): void {
    const key = `${reviewer.reviewerId}\u0000${reviewer.roundId}`;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function sendReminders(): Promise<void> {
    if (baseUrl.length === 0) {
      setMessage("The evaluation API is not configured.");
      return;
    }
    if (selectedOutstanding.length === 0) {
      setMessage("Select at least one reviewer with outstanding assignments.");
      return;
    }
    setMessage(null);
    setBusy(true);
    try {
      const byRound = new Map<string, string[]>();
      for (const reviewer of selectedOutstanding) {
        const ids = byRound.get(reviewer.roundId) ?? [];
        if (!ids.includes(reviewer.reviewerId)) ids.push(reviewer.reviewerId);
        byRound.set(reviewer.roundId, ids);
      }
      let queued = 0;
      const sentReviewerIds = new Set<string>();
      for (const [roundId, reviewerIds] of byRound) {
        const result = await evaluationRequest<{
          queued: number;
          reviewerIds: readonly string[];
        }>(baseUrl, `/plans/${encodeURIComponent(seed.planId)}/reminders`, {
          method: "POST",
          body: JSON.stringify({ roundId, reviewerIds: reviewerIds.sort() }),
        });
        queued += result.queued;
        for (const reviewerId of result.reviewerIds) sentReviewerIds.add(reviewerId);
      }
      setMessage(
        `Reminder queued for ${queued} outstanding review assignment(s) for ${[...sentReviewerIds].sort().join(", ")}.`,
      );
      setSelected(new Set<string>());
    } catch (reason: unknown) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : "Reviewer reminders could not be sent through communications.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="reviewer-progress-heading">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.sectionEyebrow}>Per-reviewer monitoring</p>
          <h2 id="reviewer-progress-heading">Reviewer progress dashboard</h2>
        </div>
        <span className={styles.mutedLabel}>{outstanding.length} with outstanding reviews</span>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.dataTable}>
          <caption>Reviewer completion by round</caption>
          <thead>
            <tr>
              <th scope="col">Select</th>
              <th scope="col">Reviewer</th>
              <th scope="col">Round</th>
              <th scope="col">Assigned</th>
              <th scope="col">Complete</th>
              <th scope="col">Outstanding</th>
              <th scope="col">Completion</th>
            </tr>
          </thead>
          <tbody>
            {seed.progress.reviewers.map((reviewer) => {
              const key = `${reviewer.reviewerId}\u0000${reviewer.roundId}`;
              const round = seed.rounds.find((candidate) => candidate.id === reviewer.roundId);
              return (
                <tr key={key}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${reviewerLabel(reviewer.reviewerId)} reminder`}
                      checked={selected.has(key)}
                      disabled={reviewer.outstanding === 0}
                      onChange={() => toggle(reviewer)}
                    />
                  </td>
                  <th scope="row">{reviewerLabel(reviewer.reviewerId)}</th>
                  <td>{round?.name ?? reviewer.roundId}</td>
                  <td>{reviewer.assigned}</td>
                  <td>{reviewer.submitted}</td>
                  <td>{reviewer.outstanding}</td>
                  <td>{reviewer.completionPercent}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {seed.progress.reviewers.length === 0 ? (
        <p className={styles.fieldHint}>No reviewer assignments have been persisted yet.</p>
      ) : null}
      <div className={styles.confirmationActions}>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={() =>
            setSelected(
              new Set(
                selectedOutstanding.length === outstanding.length
                  ? []
                  : outstanding.map(
                      (reviewer) => `${reviewer.reviewerId}\u0000${reviewer.roundId}`,
                    ),
              ),
            )
          }
          disabled={busy || outstanding.length === 0}
        >
          {selectedOutstanding.length === outstanding.length
            ? "Clear reminder selection"
            : "Select all outstanding"}
        </button>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={() => void sendReminders()}
          disabled={busy || selectedOutstanding.length === 0}
        >
          Send reminder to selected reviewers
        </button>
      </div>
      {message ? (
        <p className={styles.submittedMessage} role="status">
          {message}
        </p>
      ) : null}
    </section>
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

function ReviewerQueueWorkspace({
  entries,
  baseUrl,
}: Readonly<{
  entries: readonly ReviewerQueueEntry[];
  baseUrl: string;
}>) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recusedIds, setRecusedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [submittedAtById, setSubmittedAtById] = useState<Readonly<Record<string, string>>>({});
  const [draftsById, setDraftsById] = useState<Readonly<Record<string, EvaluatorDraftSnapshot>>>(
    {},
  );
  const visibleEntries = entries.filter(
    (entry) =>
      entry.assignment.assignmentStatus !== "abstained" && !recusedIds.has(entry.assignment.id),
  );
  const selectedBase =
    visibleEntries.find((entry) => entry.assignment.id === selectedId)?.assignment ?? null;
  const selectedDraft = selectedBase === null ? undefined : draftsById[selectedBase.id];
  const selected =
    selectedBase === null || selectedDraft === undefined
      ? selectedBase
      : {
          ...selectedBase,
          initialScores: selectedDraft.scoreValues,
          initialResponses: selectedDraft.responseValues,
          initialConfirmed: selectedDraft.humanConfirmed,
          initialComment: selectedDraft.comment,
          reviewVersion: selectedDraft.reviewVersion,
        };
  const selectedIndex =
    selectedBase === null
      ? -1
      : visibleEntries.findIndex((entry) => entry.assignment.id === selectedBase.id);

  return (
    <div className={styles.workspace} id="review-workspace">
      <a className={styles.skipLink} href="#review-content">
        Skip to reviewer queue
      </a>
      <header className={styles.workspaceHeader}>
        <div>
          <p className={styles.eyebrow}>Reviewer workspace</p>
          <h1>Reviewer queue</h1>
          <p className={styles.headerDescription}>
            Review only the submissions assigned to you. Event, plan, and round access come from the
            server assignment projection.
          </p>
        </div>
        <div className={styles.headerSide}>
          <ReviewNavigation mode="evaluator" />
          <span className={`${styles.statusBadge} ${styles.statusOpen}`}>
            <span aria-hidden="true" />
            Reviewer access
          </span>
        </div>
      </header>

      <section
        id="review-content"
        className={styles.section}
        aria-labelledby="review-queue-heading"
      >
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.sectionEyebrow}>Assigned work</p>
            <h2 id="review-queue-heading">Submissions to review</h2>
            <p className={styles.sectionIntro}>
              Open a scorecard to save a review or recuse from that single assignment when a
              conflict exists.
            </p>
          </div>
          <span className={styles.mutedLabel}>{visibleEntries.length} assigned</span>
        </div>
        {visibleEntries.length === 0 ? (
          <p role="status">No review assignments are currently available.</p>
        ) : (
          <div className={styles.decisionList}>
            {visibleEntries.map(({ assignment }, assignmentIndex) => {
              const isSelected = assignment.id === selectedId;
              return (
                <article className={styles.decisionCard} key={assignment.id}>
                  <div className={styles.decisionSummary}>
                    <div>
                      <p className={styles.sectionEyebrow}>
                        {assignment.eventName} · {assignment.planName}
                      </p>
                      <h3>{assignment.title}</h3>
                    </div>
                    <span className={styles.referenceBadge}>{assignment.reference}</span>
                  </div>
                  <dl className={styles.assignmentDetails}>
                    <div>
                      <dt>Round</dt>
                      <dd>{assignment.round.name}</dd>
                    </div>
                    <div>
                      <dt>Queue position</dt>
                      <dd>
                        {assignmentIndex + 1} of {visibleEntries.length}
                      </dd>
                    </div>
                    <div>
                      <dt>Review closes</dt>
                      <dd>{assignment.round.closesAt}</dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>
                        {assignment.submittedAt !== null ||
                        submittedAtById[assignment.id] !== undefined
                          ? "Submitted"
                          : formatAssignmentStatus(assignment.assignmentStatus)}
                      </dd>
                    </div>
                  </dl>
                  <Link
                    className={styles.primaryButton}
                    href={`#scorecard-${encodeURIComponent(assignment.id)}`}
                    onClick={() => setSelectedId(assignment.id)}
                    aria-label={`Open scorecard for ${assignment.title}`}
                    aria-current={isSelected ? "location" : undefined}
                  >
                    {isSelected ? "Scorecard open" : "Open scorecard"}
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {selected ? (
        <section
          className={styles.section}
          id={`scorecard-${encodeURIComponent(selected.id)}`}
          aria-labelledby="selected-scorecard-heading"
        >
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionEyebrow}>Assigned scorecard</p>
              <h2 id="selected-scorecard-heading">{selected.title}</h2>
            </div>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => setSelectedId(null)}
            >
              Back to reviewer queue
            </button>
          </div>
          <EvaluatorWorkspace
            key={selected.id}
            assignment={selected}
            baseUrl={baseUrl}
            submittedOverride={submittedAtById[selected.id] !== undefined}
            queuePosition={{ position: selectedIndex + 1, total: visibleEntries.length }}
            onPrevious={
              selectedIndex > 0
                ? () => setSelectedId(visibleEntries[selectedIndex - 1]?.assignment.id ?? null)
                : undefined
            }
            onNext={
              selectedIndex >= 0 && selectedIndex < visibleEntries.length - 1
                ? () => setSelectedId(visibleEntries[selectedIndex + 1]?.assignment.id ?? null)
                : undefined
            }
            onDraftChange={(snapshot) =>
              setDraftsById((current) => ({ ...current, [selected.id]: snapshot }))
            }
            onAbstain={() => {
              setRecusedIds((current) => new Set([...current, selected.id]));
              setSelectedId(null);
            }}
            onSubmitted={(review) => {
              const submittedAt = review.submittedAt;
              if (submittedAt !== null) {
                setSubmittedAtById((current) => ({
                  ...current,
                  [selected.id]: submittedAt,
                }));
              }
            }}
          />
        </section>
      ) : null}
    </div>
  );
}
function EvaluatorWorkspace({
  assignment,
  baseUrl,
  onAbstain,
  onSubmitted,
  submittedOverride = false,
  queuePosition,
  onPrevious,
  onNext,
  onDraftChange,
}: Readonly<{
  assignment: EvaluatorAssignment;
  baseUrl: string;
  onAbstain?: (() => void) | undefined;
  onSubmitted?: ((review: AuthoritativeReview) => void) | undefined;
  submittedOverride?: boolean | undefined;
  queuePosition?: Readonly<{ position: number; total: number }> | undefined;
  onPrevious?: (() => void) | undefined;
  onNext?: (() => void) | undefined;
  onDraftChange?: ((snapshot: EvaluatorDraftSnapshot) => void) | undefined;
}>) {
  const initiallySubmitted =
    assignment.submittedAt !== null ||
    submittedOverride ||
    assignment.assignmentStatus === "submitted";
  const [scoreValues, setScoreValues] = useState<Record<string, string>>(() => ({
    ...assignment.initialScores,
  }));
  const [responseValues, setResponseValues] = useState<Record<string, string>>(() => ({
    ...assignment.initialResponses,
  }));
  const [humanConfirmed, setHumanConfirmed] = useState<Set<string>>(
    () => new Set(assignment.initialConfirmed),
  );
  const [comment, setComment] = useState(assignment.initialComment);
  const [, setReviewVersion] = useState<number | undefined>(assignment.reviewVersion);
  const reviewVersionRef = useRef<number | undefined>(assignment.reviewVersion);
  const criterionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [showValidation, setShowValidation] = useState(false);
  const autosaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [autosaveState, setAutosaveState] = useState(
    initiallySubmitted ? "Review submitted" : "Autosave ready",
  );
  const [submitConfirmation, setSubmitConfirmation] = useState(false);
  const [submitted, setSubmitted] = useState(initiallySubmitted);
  const reviewLocked =
    submitted || assignment.assignmentStatus === "abstained" || assignment.round.status !== "open";
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const submitBusyRef = useRef(false);
  const [abstentionReason, setAbstentionReason] = useState("");
  const [abstentionError, setAbstentionError] = useState<string | null>(null);
  const [abstained, setAbstained] = useState(() => assignment.assignmentStatus === "abstained");
  const [abstentionBusy, setAbstentionBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<readonly ApiSuggestion[]>(assignment.suggestions);
  const [suggestionBusy, setSuggestionBusy] = useState(false);
  function reportDraft(
    nextScores: Readonly<Record<string, string>> = scoreValues,
    nextResponses: Readonly<Record<string, string>> = responseValues,
    nextConfirmed: ReadonlySet<string> = humanConfirmed,
    nextComment: string = comment,
    nextVersion: number | undefined = reviewVersionRef.current,
  ): void {
    onDraftChange?.({
      scoreValues: nextScores,
      responseValues: nextResponses,
      humanConfirmed: [...nextConfirmed],
      comment: nextComment,
      reviewVersion: nextVersion,
    });
  }
  function suggestionForCriterion(criterionId: string): {
    suggestion: ApiSuggestion;
    candidate: {
      value: number;
      evidence: readonly string[];
      provenance?: ApiSuggestion["candidates"][string][number]["provenance"];
    };
  } | null {
    for (const suggestion of suggestions) {
      if (suggestion.status !== "pending") continue;
      const criterion = assignment.round.rubric.criteria.find(
        (candidate) => candidate.id === criterionId,
      );
      if (criterion === undefined || criterionType(criterion) !== "numeric") continue;
      const candidate = suggestion.candidates[criterionId]?.[0];
      if (candidate !== undefined) return { suggestion, candidate };
    }
    return null;
  }

  async function generateSuggestions(): Promise<void> {
    setSuggestionBusy(true);
    setSubmitError(null);
    try {
      const suggestion = await evaluationRequest<ApiSuggestion>(
        baseUrl,
        `/assignments/${encodeURIComponent(assignment.id)}/suggestions/generate`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setSuggestions((current) => [...current, suggestion]);
      setAutosaveState("AI suggestion is pending human resolution");
    } catch (reason: unknown) {
      setSubmitError(reason instanceof Error ? reason.message : "AI suggestions are unavailable.");
    } finally {
      setSuggestionBusy(false);
    }
  }

  async function resolveSuggestion(
    suggestion: ApiSuggestion,
    action: "accept" | "edit" | "reject",
    criterionId?: string,
    value?: number,
  ): Promise<void> {
    setSuggestionBusy(true);
    setSubmitError(null);
    try {
      const response = await evaluationRequest<{
        suggestion: ApiSuggestion;
        review: NonNullable<ApiReviewContext["review"]> | null;
      }>(
        baseUrl,
        `/assignments/${encodeURIComponent(assignment.id)}/suggestions/${encodeURIComponent(suggestion.id)}/resolve`,
        {
          method: "POST",
          body: JSON.stringify({
            action,
            expectedVersion: suggestion.version,
            ...(action === "edit" && criterionId !== undefined && value !== undefined
              ? {
                  scores: { [criterionId]: value },
                  reason: "Edited by the assigned human evaluator.",
                }
              : {}),
            ...(action === "reject" ? { reason: "Rejected by the assigned human evaluator." } : {}),
          }),
        },
      );
      setSuggestions((current) =>
        current.map((candidate) =>
          candidate.id === response.suggestion.id ? response.suggestion : candidate,
        ),
      );
      if (response.review !== null) {
        applyAuthoritativeReview(response.review);
      }
      setAutosaveState(
        action === "accept"
          ? "Suggestion accepted by a human"
          : action === "edit"
            ? "Suggestion edited by a human"
            : "Suggestion rejected by a human",
      );
    } catch (reason: unknown) {
      setSubmitError(
        reason instanceof Error ? reason.message : "The suggestion could not be resolved.",
      );
    } finally {
      setSuggestionBusy(false);
    }
  }

  function applyAuthoritativeReview(review: NonNullable<ApiReviewContext["review"]>): void {
    setReviewVersion(review.version);
    reviewVersionRef.current = review.version;
    const nextScores: Record<string, string> = {};
    const nextResponses: Record<string, string> = {};
    const nextConfirmed = new Set<string>();
    for (const [criterionId, score] of Object.entries(review.scores)) {
      const criterion = assignment.round.rubric.criteria.find(
        (candidate) => candidate.id === criterionId,
      );
      if (criterion === undefined) continue;
      if (criterionType(criterion) === "free_text") {
        if (typeof score.value === "string") nextResponses[criterionId] = score.value;
        else if (score.evidence?.[0] !== undefined) nextResponses[criterionId] = score.evidence[0];
      } else if (typeof score.value === "number") {
        nextScores[criterionId] =
          criterionType(criterion) === "dropdown"
            ? criterionOptionValue(criterion, score.value)
            : String(score.value);
      } else if (criterionType(criterion) === "dropdown" && typeof score.value === "string") {
        nextScores[criterionId] = score.value;
      }
      if (score.humanConfirmedBy !== null) nextConfirmed.add(criterionId);
    }
    const parsedComment = parseScorecardResponses(review.comment ?? "");
    setScoreValues(nextScores);
    setResponseValues({ ...parsedComment.responses, ...nextResponses });
    setHumanConfirmed(nextConfirmed);
    setComment(parsedComment.comment);
    reportDraft(
      nextScores,
      { ...parsedComment.responses, ...nextResponses },
      nextConfirmed,
      parsedComment.comment,
      review.version,
    );
  }

  async function persistReview(
    nextScores: Readonly<Record<string, string>> = scoreValues,
    nextComment: string = comment,
    nextConfirmed: ReadonlySet<string> = humanConfirmed,
    nextResponses: Readonly<Record<string, string>> = responseValues,
  ): Promise<NonNullable<ApiReviewContext["review"]>> {
    const scores: Array<{
      criterionId: string;
      value: number | string;
      origin: "human" | "ai";
      evidence?: readonly string[];
    }> = [];
    for (const criterion of assignment.round.rubric.criteria) {
      if (criterionType(criterion) === "free_text") {
        const value = nextResponses[criterion.id]?.trim() ?? "";
        if (value.length > 0) {
          scores.push({ criterionId: criterion.id, value, origin: "human" });
        }
        continue;
      }
      const generated = suggestionForCriterion(criterion.id)?.candidate;
      const hasSuggestionRecord = suggestions.some(
        (candidate) => candidate.candidates[criterion.id]?.length !== undefined,
      );
      const suggestion =
        generated ?? (hasSuggestionRecord ? undefined : assignment.aiSuggestions[criterion.id]);
      const rawValue =
        criterionType(criterion) === "dropdown"
          ? (nextScores[criterion.id] ?? "")
          : (nextScores[criterion.id] ??
            (suggestion === undefined ? "" : String(suggestion.value)));
      const numericValue =
        criterionType(criterion) === "dropdown"
          ? criterionNumericValue(criterion, rawValue)
          : Number(rawValue);
      if (!Number.isFinite(numericValue)) continue;
      const confirmed = nextConfirmed.has(criterion.id);
      if (!confirmed && suggestion === undefined) continue;
      scores.push({
        criterionId: criterion.id,
        value: numericValue,
        origin: confirmed ? "human" : "ai",
        ...(confirmed || suggestion === undefined ? {} : { evidence: suggestion.evidence }),
      });
    }
    const review = await evaluationRequest<NonNullable<ApiReviewContext["review"]>>(
      baseUrl,
      `/assignments/${encodeURIComponent(assignment.id)}/review`,
      {
        method: "PUT",
        body: JSON.stringify({
          scores,
          comment: withScorecardResponses(nextComment, nextResponses),
          ...(reviewVersionRef.current === undefined
            ? {}
            : { expectedVersion: reviewVersionRef.current }),
        }),
      },
    );
    applyAuthoritativeReview(review);
    setSubmitError(null);
    setAutosaveState("Saved on server");
    return review;
  }

  function enqueueAutosave(
    nextScores: Readonly<Record<string, string>>,
    nextComment: string,
    nextConfirmed: ReadonlySet<string>,
    nextResponses: Readonly<Record<string, string>>,
  ): void {
    autosaveQueueRef.current = autosaveQueueRef.current.then(async () => {
      setAutosaveState("Saving draft…");
      try {
        await persistReview(nextScores, nextComment, nextConfirmed, nextResponses);
      } catch (reason: unknown) {
        setAutosaveState("Save failed");
        setSubmitError(
          reason instanceof Error ? reason.message : "The review draft could not be saved.",
        );
      }
    });
  }

  async function saveDraft(): Promise<void> {
    if (reviewLocked) {
      setSubmitError("This review is locked and cannot save another draft.");
      return;
    }
    if (draftBusy || submitBusy) return;
    setDraftBusy(true);
    setSubmitError(null);
    setAutosaveState("Saving draft…");
    try {
      await autosaveQueueRef.current;
      await persistReview();
      setAutosaveState("Draft saved");
    } catch (reason: unknown) {
      setAutosaveState("Save failed");
      setSubmitError(
        reason instanceof Error ? reason.message : "The review draft could not be saved.",
      );
    } finally {
      setDraftBusy(false);
    }
  }
  function changeScore(criterionId: string, value: string): void {
    const criterion = assignment.round.rubric.criteria.find(
      (candidate) => candidate.id === criterionId,
    );
    if (criterion === undefined || criterionType(criterion) === "free_text") return;
    const nextScores = { ...scoreValues, [criterionId]: value };
    const nextConfirmed = new Set(humanConfirmed).add(criterionId);
    const numericValue = criterionNumericValue(criterion, value);
    setScoreValues(nextScores);
    reportDraft(nextScores, responseValues, nextConfirmed, comment);
    setHumanConfirmed(nextConfirmed);
    const generated = suggestionForCriterion(criterionId);
    if (generated !== null && Number.isFinite(numericValue)) {
      setAutosaveState("Unsaved changes");
      void resolveSuggestion(generated.suggestion, "edit", criterionId, numericValue);
      return;
    }
    setAutosaveState("Unsaved changes");
    enqueueAutosave(nextScores, comment, nextConfirmed, responseValues);
  }

  function changeResponse(criterionId: string, value: string): void {
    const nextResponses = { ...responseValues, [criterionId]: value };
    setResponseValues(nextResponses);
    reportDraft(scoreValues, nextResponses, humanConfirmed, comment);
    setAutosaveState("Unsaved changes");
    enqueueAutosave(scoreValues, comment, humanConfirmed, nextResponses);
  }

  function confirmAiSuggestion(criterion: RubricCriterion): void {
    const generated = suggestionForCriterion(criterion.id);
    if (generated !== null) {
      void resolveSuggestion(generated.suggestion, "accept");
      return;
    }
    if (suggestions.some((candidate) => candidate.candidates[criterion.id]?.length !== undefined)) {
      return;
    }
    const suggestion = assignment.aiSuggestions[criterion.id];
    if (!suggestion) return;
    const nextScores = {
      ...scoreValues,
      [criterion.id]: String(suggestion.value),
    };
    const nextConfirmed = new Set(humanConfirmed).add(criterion.id);
    setScoreValues(nextScores);
    reportDraft(nextScores, responseValues, nextConfirmed, comment);
    setHumanConfirmed(nextConfirmed);
    setAutosaveState("Unsaved changes");
    enqueueAutosave(nextScores, comment, nextConfirmed, responseValues);
  }

  function countedScore(): number {
    return assignment.round.rubric.criteria.reduce((total, criterion) => {
      if (criterionType(criterion) === "free_text") return total;
      const value = criterionNumericValue(criterion, scoreValues[criterion.id] ?? "");
      if (
        !humanConfirmed.has(criterion.id) ||
        !Number.isFinite(value) ||
        value < criterion.minimum ||
        value > criterion.maximum
      ) {
        return total;
      }
      return total + value * criterion.weight;
    }, 0);
  }

  function possibleScore(): number {
    return assignment.round.rubric.criteria.reduce(
      (total, criterion) =>
        criterionType(criterion) === "free_text"
          ? total
          : total + criterion.maximum * criterion.weight,
      0,
    );
  }

  function criterionComplete(criterion: RubricCriterion): boolean {
    if (criterionType(criterion) === "free_text") {
      return (responseValues[criterion.id] ?? "").trim().length > 0;
    }
    const value = criterionNumericValue(criterion, scoreValues[criterion.id] ?? "");
    return (
      humanConfirmed.has(criterion.id) &&
      Number.isFinite(value) &&
      value >= criterion.minimum &&
      value <= criterion.maximum
    );
  }
  function criterionValidationMessage(criterion: RubricCriterion): string | null {
    if (!showValidation || !criterion.required || criterionComplete(criterion)) return null;
    return criterionType(criterion) === "free_text"
      ? "Required response is incomplete."
      : `Choose and confirm a score from ${criterion.minimum} through ${criterion.maximum}.`;
  }

  function openSubmitConfirmation(): void {
    if (submitBusy || submitBusyRef.current) return;
    const missing = assignment.round.rubric.criteria.find(
      (criterion) => criterion.required && !criterionComplete(criterion),
    );
    if (missing) {
      setShowValidation(true);
      setSubmitError(`Confirm or edit the required “${missing.label}” score before submitting.`);
      criterionRefs.current[missing.id]?.focus();
      setSubmitConfirmation(false);
      return;
    }
    setSubmitError(null);
    setSubmitConfirmation(true);
    setShowValidation(false);
  }

  async function submitReview(): Promise<void> {
    if (submitBusy || submitBusyRef.current) return;
    if (reviewLocked) {
      setSubmitError("This review round is no longer accepting changes.");
      return;
    }
    setShowValidation(true);
    const missing = assignment.round.rubric.criteria.find(
      (criterion) => criterion.required && !criterionComplete(criterion),
    );
    if (missing) {
      setSubmitError(`Confirm or edit the required “${missing.label}” score before submitting.`);
      criterionRefs.current[missing.id]?.focus();
      setSubmitConfirmation(false);
      return;
    }
    setSubmitError(null);
    setSubmitBusy(true);
    submitBusyRef.current = true;
    try {
      await autosaveQueueRef.current;
      const review = await persistReview();
      const submittedReview = await evaluationRequest<NonNullable<ApiReviewContext["review"]>>(
        baseUrl,
        `/assignments/${encodeURIComponent(assignment.id)}/review/submit`,
        {
          method: "POST",
          body: JSON.stringify({ expectedVersion: review.version }),
        },
      );
      applyAuthoritativeReview(submittedReview);
      setSubmitted(submittedReview.submittedAt !== null);
      if (submittedReview.submittedAt !== null) onSubmitted?.(submittedReview);
      setSubmitConfirmation(false);
      setAutosaveState("Review submitted");
      setShowValidation(false);
    } catch (reason: unknown) {
      setAutosaveState("Save failed");
      setSubmitError(
        reason instanceof Error ? reason.message : "The review could not be submitted.",
      );
    } finally {
      setSubmitBusy(false);
      submitBusyRef.current = false;
    }
  }

  async function declareAbstention(): Promise<void> {
    if (abstentionReason.trim().length === 0) {
      setAbstentionError("A written conflict-of-interest reason is required.");
      return;
    }
    setAbstentionError(null);
    setAbstentionBusy(true);
    try {
      const declaration = await evaluationRequest<{
        id: string;
        reason: string;
        declaredAt: string;
      }>(baseUrl, `/assignments/${encodeURIComponent(assignment.id)}/conflict`, {
        method: "POST",
        body: JSON.stringify({ reason: abstentionReason.trim() }),
      });
      setAbstentionReason(declaration.reason);
      setAbstained(true);
      onAbstain?.();
    } catch (reason: unknown) {
      setAbstentionError(
        reason instanceof Error ? reason.message : "The conflict could not be recorded.",
      );
    } finally {
      setAbstentionBusy(false);
    }
  }

  const rubricCriteria = assignment.round.rubric.criteria;
  const identityRedacted = assignment.round.blindReview || assignment.identityRedacted === true;
  const visibleSubmissionFields =
    assignment.submissionFields?.filter(
      (field) =>
        !identityRedacted ||
        ![field.id, field.label].some(
          (candidate) => candidate !== undefined && isAccountIdentityField(candidate),
        ),
    ) ?? [];
  const completedCriteria = rubricCriteria.filter(criterionComplete).length;
  const reviewProgress =
    rubricCriteria.length === 0 ? 0 : Math.round((completedCriteria / rubricCriteria.length) * 100);
  if (abstained) {
    return (
      <div className={styles.workspace} id="review-workspace">
        <a className={styles.skipLink} href="#abstention-result">
          Skip to abstention result
        </a>
        <header className={styles.workspaceHeader}>
          <div>
            <p className={styles.eyebrow}>
              {assignment.eventName} · {assignment.planName}
            </p>
            <h1>Review access removed</h1>
            <p className={styles.headerDescription}>Your conflict declaration has been recorded.</p>
          </div>
          <div className={styles.headerSide}>
            <ReviewNavigation mode="evaluator" />
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
          <p className={styles.eyebrow}>
            Assigned review · {assignment.eventName} · {assignment.planName}
          </p>
          <h1>{assignment.title}</h1>
          <p className={styles.headerDescription}>
            Evaluate this submission in <strong>{assignment.round.name}</strong>. Only your assigned
            submission is available in this workspace; your draft stays available while you move
            through the reviewer queue.
          </p>
        </div>
        <div className={styles.headerSide}>
          <ReviewNavigation mode="evaluator" />
          <section className={styles.reviewState} aria-label="Review state">
            <span className={`${styles.statusBadge} ${styles.statusOpen}`}>
              <span aria-hidden="true" />
              {submitted ? "Submitted" : formatAssignmentStatus(assignment.assignmentStatus)}
            </span>
            <span className={styles.queuePosition}>
              {queuePosition
                ? `Queue position ${queuePosition.position} of ${queuePosition.total}`
                : "Assigned submission"}
            </span>
          </section>
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
            <h2 id="blind-review-heading">
              {identityRedacted ? "Blind review is on" : "Blind review is off"}
            </h2>
            <p>
              {identityRedacted
                ? "Author identity is hidden from reviewers. Names, email addresses, and biographies are not shown in this workspace; evaluate the content only."
                : "This round permits organizer-configured identity fields; reviewer access remains limited to the assigned submission."}
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
          <div className={styles.submissionContent}>
            <div className={styles.submissionProse}>
              <h3>Submission overview</h3>
              <p className={styles.submissionAbstract}>{assignment.abstract}</p>
            </div>
            <div className={styles.submissionMeta}>
              <dl className={styles.assignmentDetails}>
                <div>
                  <dt>Round</dt>
                  <dd>{assignment.round.name}</dd>
                </div>
                <div>
                  <dt>Track</dt>
                  <dd>{assignment.track ?? "Not specified"}</dd>
                </div>
                <div>
                  <dt>Review closes</dt>
                  <dd>{assignment.round.closesAt}</dd>
                </div>
                <div>
                  <dt>Reviewer state</dt>
                  <dd>
                    {submitted ? "Submitted" : formatAssignmentStatus(assignment.assignmentStatus)}
                  </dd>
                </div>
                <div>
                  <dt>Identity</dt>
                  <dd>
                    {identityRedacted
                      ? "Redacted for blind review"
                      : "Visible per round projection"}
                  </dd>
                </div>
              </dl>
              <div className={styles.participantBlock}>
                <h3>Speaker / participants</h3>
                {assignment.participants &&
                assignment.participants.length > 0 &&
                !identityRedacted ? (
                  <ul className={styles.participantList}>
                    {assignment.participants.map((participant) => (
                      <li key={participant.id}>
                        <strong>{participant.displayName}</strong>
                        {participant.role ? <span>{participant.role}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.fieldHint}>
                    {identityRedacted
                      ? "Participant identities are hidden for this blind review."
                      : "No participant details were shared with reviewers."}
                  </p>
                )}
              </div>
            </div>
          </div>
          {visibleSubmissionFields.length > 0 ? (
            <dl className={styles.submissionFields}>
              {visibleSubmissionFields.map((field) => (
                <div key={field.id ?? field.label}>
                  <dt>{field.label}</dt>
                  <dd>{field.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <div className={styles.reviewProgressSummary}>
            <ProgressBar label="Rubric progress" value={reviewProgress} />
            <span>
              {completedCriteria} of {rubricCriteria.length} criteria complete
            </span>
          </div>
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
            Numeric criteria are bounded by their configured scale; dropdown and free-text criteria
            use their configured options and response fields. AI prefills are advisory and uncounted
            until a human confirms or edits a numeric score.
          </p>
          <div className={styles.confirmationActions}>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => void generateSuggestions()}
              disabled={suggestionBusy || reviewLocked}
            >
              {suggestionBusy ? "Generating…" : "Generate AI suggestions"}
            </button>
            <span className={styles.fieldHint}>
              Pending suggestions include exact revisions, evidence, and provider provenance.
            </span>
          </div>
          {suggestions
            .filter((suggestion) => suggestion.status === "stale")
            .map((suggestion) => (
              <p className={styles.formError} role="alert" key={suggestion.id}>
                AI suggestion is stale for rubric revision {suggestion.rubricRevision} and
                submission revision {suggestion.submissionRevision}; generate a new suggestion.
              </p>
            ))}
          <nav className={styles.reviewActions} aria-label="Evaluation actions">
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={onPrevious}
              disabled={onPrevious === undefined || draftBusy || submitBusy}
            >
              Previous
            </button>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={onNext}
              disabled={onNext === undefined || draftBusy || submitBusy}
            >
              Next
            </button>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => void saveDraft()}
              disabled={draftBusy || submitBusy || reviewLocked}
            >
              {draftBusy ? "Saving draft…" : "Save draft"}
            </button>
            <button
              className={styles.primaryButton}
              type="button"
              onClick={openSubmitConfirmation}
              disabled={submitBusy || draftBusy || reviewLocked}
            >
              Submit evaluation
            </button>
          </nav>
          <div className={styles.scoreList}>
            {assignment.round.rubric.criteria.map((criterion) => {
              const generatedSuggestion = suggestionForCriterion(criterion.id);
              const hasSuggestionRecord = suggestions.some(
                (candidate) => candidate.candidates[criterion.id]?.length !== undefined,
              );
              const suggestion =
                generatedSuggestion?.candidate ??
                (hasSuggestionRecord ? undefined : assignment.aiSuggestions[criterion.id]);
              const suggestionRecord = generatedSuggestion?.suggestion;
              const isConfirmed =
                criterionType(criterion) === "free_text"
                  ? (responseValues[criterion.id] ?? "").trim().length > 0
                  : humanConfirmed.has(criterion.id);
              const validationMessage = criterionValidationMessage(criterion);
              return (
                <fieldset
                  className={`${styles.scoreCard} ${validationMessage ? styles.invalidCriterion : ""}`}
                  key={criterion.id}
                  aria-describedby={`${criterion.id}-description`}
                >
                  <legend className={styles.scoreCardLegend}>{criterion.label}</legend>
                  <div className={styles.scoreCardHeader}>
                    <div>
                      <h3>{criterion.label}</h3>
                      <p id={`${criterion.id}-description`}>{criterion.description}</p>
                    </div>
                    <span className={isConfirmed ? styles.confirmedPill : styles.uncountedPill}>
                      {isConfirmed
                        ? criterionType(criterion) === "free_text"
                          ? "Human response · saved"
                          : "Human confirmed · counted"
                        : suggestion
                          ? "AI prefill · uncounted"
                          : "Awaiting human response"}
                    </span>
                  </div>
                  <div className={styles.scoreControls}>
                    <div className={styles.formField}>
                      <label htmlFor={`${criterion.id}-score`}>
                        {criterionType(criterion) === "free_text"
                          ? "Human response"
                          : "Human score"}{" "}
                        {criterionType(criterion) !== "free_text" ? (
                          <span>
                            ({criterion.minimum}–{criterion.maximum})
                          </span>
                        ) : null}
                      </label>
                      {criterionType(criterion) === "numeric" ? (
                        <>
                          <input
                            id={`${criterion.id}-score`}
                            ref={(element) => {
                              criterionRefs.current[criterion.id] = element;
                            }}
                            name={criterion.id}
                            type="number"
                            min={criterion.minimum}
                            max={criterion.maximum}
                            step={1}
                            value={scoreValues[criterion.id] ?? ""}
                            disabled={reviewLocked}
                            onChange={(event) =>
                              changeScore(criterion.id, event.currentTarget.value)
                            }
                            required={criterion.required}
                            aria-invalid={validationMessage !== null}
                            aria-describedby={`${criterion.id}-description ${criterion.id}-score-help${validationMessage ? ` ${criterion.id}-error` : ""}`}
                          />
                          <div
                            className={styles.ratingChoices}
                            role="radiogroup"
                            aria-label={`${criterion.label} rating choices`}
                          >
                            {Array.from(
                              { length: criterion.maximum - criterion.minimum + 1 },
                              (_, index) => criterion.minimum + index,
                            ).map((value) => (
                              <label className={styles.ratingChoice} key={value}>
                                <input
                                  type="radio"
                                  name={`${criterion.id}-rating-choice`}
                                  value={value}
                                  checked={scoreValues[criterion.id] === String(value)}
                                  disabled={reviewLocked}
                                  onChange={() => changeScore(criterion.id, String(value))}
                                />
                                <span>{value}</span>
                              </label>
                            ))}
                          </div>
                        </>
                      ) : criterionType(criterion) === "dropdown" ? (
                        <select
                          id={`${criterion.id}-score`}
                          ref={(element) => {
                            criterionRefs.current[criterion.id] = element;
                          }}
                          name={criterion.id}
                          value={scoreValues[criterion.id] ?? ""}
                          disabled={reviewLocked}
                          onChange={(event) => changeScore(criterion.id, event.currentTarget.value)}
                          required={criterion.required}
                          aria-invalid={validationMessage !== null}
                          aria-describedby={`${criterion.id}-description ${criterion.id}-score-help${validationMessage ? ` ${criterion.id}-error` : ""}`}
                        >
                          <option value="">Choose an option</option>
                          {(criterion.options ?? []).map((option) => (
                            <option value={option.value} key={option.id ?? option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <textarea
                          id={`${criterion.id}-score`}
                          ref={(element) => {
                            criterionRefs.current[criterion.id] = element;
                          }}
                          name={criterion.id}
                          value={responseValues[criterion.id] ?? ""}
                          disabled={reviewLocked}
                          onChange={(event) =>
                            changeResponse(criterion.id, event.currentTarget.value)
                          }
                          required={criterion.required}
                          rows={4}
                          aria-invalid={validationMessage !== null}
                          aria-describedby={`${criterion.id}-description ${criterion.id}-score-help${validationMessage ? ` ${criterion.id}-error` : ""}`}
                        />
                      )}
                      <p className={styles.fieldHint} id={`${criterion.id}-score-help`}>
                        {criterionType(criterion) === "free_text"
                          ? "Written responses are stored with this scorecard criterion."
                          : criterionType(criterion) === "dropdown"
                            ? "Choose one of the configured scorecard options."
                            : `Enter a whole number from ${criterion.minimum} through ${criterion.maximum}.`}
                      </p>
                      {validationMessage ? (
                        <p className={styles.formError} id={`${criterion.id}-error`} role="alert">
                          {validationMessage}
                        </p>
                      ) : null}
                    </div>
                    {suggestion ? (
                      <aside
                        className={styles.aiSuggestion}
                        aria-label={`AI suggestion for ${criterion.label}`}
                      >
                        <div>
                          <span className={styles.aiLabel}>
                            AI suggestion · {suggestionRecord?.status ?? "uncounted"}
                          </span>
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
                        {suggestionRecord ? (
                          <p className={styles.fieldHint}>
                            Provider: {suggestionRecord.provenance.provider} · model{" "}
                            {suggestionRecord.provenance.model}
                          </p>
                        ) : null}
                        <div className={styles.confirmationActions}>
                          <button
                            className={styles.secondaryButton}
                            type="button"
                            onClick={() => confirmAiSuggestion(criterion)}
                            disabled={suggestionBusy || reviewLocked}
                          >
                            Accept suggestion — Confirm or edit this suggestion
                          </button>
                          {suggestionRecord ? (
                            <>
                              <button
                                className={styles.secondaryButton}
                                type="button"
                                onClick={() =>
                                  void resolveSuggestion(
                                    suggestionRecord,
                                    "edit",
                                    criterion.id,
                                    Number(scoreValues[criterion.id]),
                                  )
                                }
                                disabled={suggestionBusy || reviewLocked}
                              >
                                Edit suggestion — save human edit
                              </button>
                              <button
                                className={styles.dangerButton}
                                type="button"
                                onClick={() => void resolveSuggestion(suggestionRecord, "reject")}
                                disabled={suggestionBusy || reviewLocked}
                              >
                                Reject suggestion
                              </button>
                            </>
                          ) : null}
                        </div>
                      </aside>
                    ) : null}
                  </div>
                </fieldset>
              );
            })}
          </div>
          <p className={styles.countedTotal}>
            Counted human score:{" "}
            <strong>
              {countedScore().toFixed(1)} / {possibleScore().toFixed(1)} weighted points
            </strong>
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
              disabled={reviewLocked}
              onChange={(event) => {
                const nextComment = event.currentTarget.value;
                setComment(nextComment);
                reportDraft(scoreValues, responseValues, humanConfirmed, nextComment);
                setAutosaveState("Unsaved changes");
                enqueueAutosave(scoreValues, nextComment, humanConfirmed, responseValues);
              }}
              rows={5}
              placeholder="Share evidence for your scores and any practical considerations."
            />
          </div>
        </section>

        <nav className={styles.reviewActions} aria-label="Evaluation actions">
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={onPrevious}
            disabled={onPrevious === undefined || draftBusy || submitBusy}
          >
            Previous
          </button>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={onNext}
            disabled={onNext === undefined || draftBusy || submitBusy}
          >
            Next
          </button>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => void saveDraft()}
            disabled={draftBusy || submitBusy || reviewLocked}
          >
            {draftBusy ? "Saving draft…" : "Save draft"}
          </button>
          <button
            className={styles.primaryButton}
            type="button"
            onClick={openSubmitConfirmation}
            disabled={submitBusy || draftBusy || reviewLocked}
          >
            Submit evaluation
          </button>
        </nav>
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
                disabled={submitBusy || reviewLocked}
              >
                Review and submit
              </button>
              {submitConfirmation ? (
                <div
                  className={styles.confirmationBox}
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
                    <button
                      className={styles.primaryButton}
                      type="button"
                      onClick={submitReview}
                      disabled={submitBusy}
                    >
                      Confirm and submit review
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>

        <section className={styles.conflictPanel} aria-labelledby="conflict-heading">
          <div>
            <p className={styles.sectionEyebrow}>Safety control</p>
            <h2 id="conflict-heading">Conflict of interest / recuse</h2>
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
              disabled={abstentionBusy}
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
          <button
            className={styles.dangerButton}
            type="button"
            onClick={declareAbstention}
            disabled={abstentionBusy}
          >
            Recuse — Declare conflict and abstain
          </button>
        </section>
      </div>
    </div>
  );
}
