"use client";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Checkbox } from "../../components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldLabel } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { Progress } from "../../components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import {
  activeVerifiedReviewers,
  createMemberApi,
  type MemberApi,
  type OrganizationMember,
} from "../members/api";
import { OrganizerReviewOverview } from "./organizer-review-overview";
import styles from "./review-workspace.module.css";
import {
  emptyReviewerInboxFilters,
  filterReviewerInbox,
  groupReviewerInbox,
  type ReviewerInboxFilters,
  type ReviewerInboxGroupBy,
  type ReviewerInboxStatusView,
  reviewerInboxItems,
} from "./reviewer-inbox";
import { scorecardPrimaryAction } from "./scorecard-action";

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
  readonly roundRevision?: number | undefined;
  readonly rubricRevision?: number | undefined;
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
  readonly roundId?: string;
  readonly roundRevision?: number;
  readonly rubricRevision?: number;
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
  assignments: readonly ReviewPlanAssignment[];
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
          generatedAt?: string;
          sourceReferences: readonly string[];
          promptVersion?: string;
          traceId?: string;
        };
      }[]
    >
  >;
  provenance: {
    provider: string;
    model: string;
    generatedAt?: string;
    sourceReferences: readonly string[];
    promptVersion?: string;
    traceId?: string;
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

export interface ReviewPlanAssignment {
  id: string;
  eventId: string;
  planId: string;
  roundId: string;
  submissionId: string;
  reviewerId: string;
  status: "assigned" | "in_progress" | "submitted" | "abstained" | "superseded";
  version: number;
  predecessorAssignmentId?: string | null;
  successorAssignmentId?: string | null;
  supersededReason?: string | null;
  lineage?: {
    predecessorAssignmentId: string | null;
    successorAssignmentId: string | null;
    reason: string;
    supersededAt?: string;
  };
  planVersion?: number;
  rubricRevision?: number;
  roundRevision?: number;
  submissionRevision?: number;
}
type ApiAssignment = ReviewPlanAssignment;
export interface EvaluatorAssignment {
  readonly organizationId?: string | undefined;
  readonly organizationName?: string | undefined;
  eventId: string;
  eventName: string;
  readonly dueAt?: string | null | undefined;
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
  readonly predecessorAssignmentId?: string | null | undefined;
  readonly successorAssignmentId?: string | null | undefined;
  readonly supersededReason?: string | null | undefined;
  readonly lineage?: ReviewPlanAssignment["lineage"] | undefined;
  readonly roundRevision?: number | undefined;
  readonly rubricRevision?: number | undefined;
  readonly submissionRevision?: number | undefined;
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
    revision?: number;
    rubricRevision?: number;
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
  roundId: string;
  roundRevision: number;
  rubricRevision: number;
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
    status: "assigned" | "in_progress" | "submitted" | "abstained" | "superseded";
    version: number;
    predecessorAssignmentId?: string | null;
    successorAssignmentId?: string | null;
    supersededReason?: string | null;
    lineage?: ReviewPlanAssignment["lineage"];
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
  organizationId?: string | undefined;
  organizationName?: string | undefined;
  eventId: string;
  eventName?: string | undefined;
  name: string;
  status: PlanStatus;
  blindReview: boolean;
  closesAt: string | null;
  createdAt: string;
  updatedAt?: string;
}
interface ApiReviewerWorkspaceAssignment extends ApiReviewContext {
  plan: ApiReviewerWorkspacePlan;
}
interface ApiReviewerWorkspaceResponse {
  assignments: readonly ApiReviewerWorkspaceAssignment[];
}
interface ApiOrganizerWorkspaceResponse {
  readonly plan: ApiPlan;
  readonly submissions: readonly ApiSubmission[];
  readonly assignments: readonly ApiAssignment[];
  readonly progress: ApiProgress;
  readonly aggregates: readonly ApiAggregate[];
  readonly decisions: Readonly<Record<string, ApiDecision>>;
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

export interface ReviewAutosaveQueue {
  enqueue(operation: () => Promise<void>): Promise<void>;
  whenIdle(): Promise<void>;
  isPending(): boolean;
}

export function createReviewAutosaveQueue(
  onPendingChange: (pending: boolean) => void = () => undefined,
): ReviewAutosaveQueue {
  let tail = Promise.resolve();
  let pendingCount = 0;
  return {
    enqueue(operation) {
      pendingCount += 1;
      onPendingChange(true);
      const result = tail.then(operation);
      const settled = result.finally(() => {
        pendingCount -= 1;
        onPendingChange(pendingCount > 0);
      });
      tail = settled.catch(() => undefined);
      return settled;
    },
    whenIdle() {
      return tail;
    },
    isPending() {
      return pendingCount > 0;
    },
  };
}

export function reviewerNavigationDisabled(
  destinationAvailable: boolean,
  autosavePending: boolean,
  draftBusy: boolean,
  submitBusy: boolean,
): boolean {
  return !destinationAvailable || autosavePending || draftBusy || submitBusy;
}

export function reviewerSelectionBlocked(
  pendingAssignmentId: string | null,
  selectedAssignmentId: string | null,
  nextAssignmentId: string | null,
): boolean {
  return pendingAssignmentId !== null && nextAssignmentId !== selectedAssignmentId;
}

export function isHumanConfirmedReviewScore(score: {
  origin: "human" | "ai";
  humanConfirmedBy: string | null;
  suggestionStatus?: "pending" | "accepted" | "edited" | "rejected" | "stale" | null;
}): boolean {
  return (
    score.origin === "human" ||
    (score.origin === "ai" &&
      score.humanConfirmedBy !== null &&
      (score.suggestionStatus === "accepted" || score.suggestionStatus === "edited"))
  );
}

function apiBaseUrl(): string {
  return "";
}

function browserSameOrigin(): string {
  return typeof window === "undefined" ? "" : window.location.origin;
}

function configuredOrganizationId(explicit: string | undefined): string | null {
  const value = explicit?.trim() ?? "";
  return value.length > 0 ? value : null;
}
export function reviewerDisplayLabel(
  reviewerId: string,
  members: readonly OrganizationMember[],
): string {
  const member = members.find((candidate) => candidate.userId === reviewerId);
  return member?.name?.trim() || member?.email || reviewerId;
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
export async function reviseEvaluationPlan(
  baseUrl: string,
  planId: string,
  expectedVersion: number,
  fetcher: Fetcher = fetch,
): Promise<ApiPlan> {
  return evaluationRequest<ApiPlan>(
    baseUrl,
    `/plans/${encodeURIComponent(planId)}/revise`,
    { method: "POST", body: JSON.stringify({ expectedVersion }) },
    fetcher,
  );
}

export interface DistributionPreviewInput {
  readonly roundId: string;
  readonly submissionIds: readonly string[];
  readonly reviewerIds?: readonly string[] | undefined;
  readonly expectedVersion: number;
}
export function distributionPreviewKey(input: DistributionPreviewInput): string {
  return JSON.stringify({
    roundId: input.roundId,
    submissionIds: [...input.submissionIds],
    ...(input.reviewerIds === undefined ? {} : { reviewerIds: [...input.reviewerIds] }),
    expectedVersion: input.expectedVersion,
  });
}

export interface DistributionPreview {
  readonly scope: {
    readonly tenantId: string;
    readonly eventId: string;
    readonly planId: string;
    readonly roundId: string;
    readonly planVersion: number;
  };
  readonly desiredAssignments: readonly {
    readonly submissionId: string;
    readonly reviewerId: string;
    readonly existingAssignmentId?: string | undefined;
  }[];
  readonly deficits: readonly {
    readonly submissionId: string;
    readonly missingReviewCount: number;
    readonly reason: string;
  }[];
  readonly exclusions: readonly {
    readonly submissionId: string;
    readonly reviewerId: string;
    readonly reason: string;
  }[];
  readonly expectedActiveVersions: readonly {
    readonly assignmentId: string;
    readonly version: number;
  }[];
  readonly submissionRevisions: readonly {
    readonly submissionId: string;
    readonly revision: number;
  }[];
  readonly fingerprint: string;
}

export interface DistributionApplyResult {
  readonly scope: DistributionPreview["scope"];
  readonly activeAssignments: readonly ReviewPlanAssignment[];
  readonly supersededAssignments: readonly ReviewPlanAssignment[];
  readonly history: readonly {
    readonly assignment: ReviewPlanAssignment;
    readonly review: unknown;
  }[];
}

export async function previewReviewAssignments(
  baseUrl: string,
  planId: string,
  input: DistributionPreviewInput,
  fetcher: Fetcher = fetch,
): Promise<DistributionPreview> {
  return evaluationRequest<DistributionPreview>(
    baseUrl,
    `/plans/${encodeURIComponent(planId)}/distribution/preview`,
    {
      method: "POST",
      body: JSON.stringify({
        roundId: input.roundId,
        submissionIds: input.submissionIds,
        ...(input.reviewerIds === undefined ? {} : { reviewerIds: input.reviewerIds }),
        expectedVersion: input.expectedVersion,
      }),
    },
    fetcher,
  );
}

export async function applyReviewAssignments(
  baseUrl: string,
  planId: string,
  input: DistributionPreviewInput & { readonly fingerprint: string },
  fetcher: Fetcher = fetch,
): Promise<DistributionApplyResult> {
  return evaluationRequest<DistributionApplyResult>(
    baseUrl,
    `/plans/${encodeURIComponent(planId)}/distribution/apply`,
    {
      method: "POST",
      body: JSON.stringify({
        roundId: input.roundId,
        submissionIds: input.submissionIds,
        ...(input.reviewerIds === undefined ? {} : { reviewerIds: input.reviewerIds }),
        expectedVersion: input.expectedVersion,
        fingerprint: input.fingerprint,
      }),
    },
    fetcher,
  );
}

export interface ReplaceAssignmentInput {
  readonly replacementReviewerId: string;
  readonly expectedVersion: number;
  readonly reason: string;
}

export interface AssignmentReplacementResult {
  readonly scope: {
    readonly tenantId: string;
    readonly eventId: string;
    readonly planId: string;
    readonly roundId: string;
    readonly submissionId?: string | undefined;
    readonly planVersion?: number | undefined;
  };
  readonly replacedAssignment: ReviewPlanAssignment;
  readonly successorAssignment: ReviewPlanAssignment;
  readonly activeAssignments: readonly ReviewPlanAssignment[];
  readonly history: readonly {
    readonly assignment: ReviewPlanAssignment;
    readonly review: unknown;
  }[];
}

export async function replaceSingleReviewAssignment(
  baseUrl: string,
  planId: string,
  assignmentId: string,
  input: ReplaceAssignmentInput,
  fetcher: Fetcher = fetch,
): Promise<AssignmentReplacementResult> {
  return evaluationRequest<AssignmentReplacementResult>(
    baseUrl,
    `/plans/${encodeURIComponent(planId)}/assignments/${encodeURIComponent(assignmentId)}/replace`,
    {
      method: "POST",
      body: JSON.stringify({
        replacementReviewerId: input.replacementReviewerId,
        expectedVersion: input.expectedVersion,
        reason: input.reason,
      }),
    },
    fetcher,
  );
}
export interface ReminderDeliveryFact {
  readonly runId?: string;
  readonly outboxId?: string;
  readonly providerId?: string;
  readonly reviewerId?: string;
  readonly roundId?: string | null;
  readonly status?: string;
  readonly timestamp?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly completedAt?: string | null;
  readonly lastErrorCode?: string | null;
}

export interface ReminderDeliveryResponse {
  readonly queued: number;
  readonly reviewerIds?: readonly string[];
  readonly runId?: string;
  readonly outboxId?: string;
  readonly providerId?: string;
  readonly status?: string;
  readonly timestamp?: string;
  readonly createdAt?: string;
  readonly facts?: readonly ReminderDeliveryFact[];
  readonly reminders?: readonly ReminderDeliveryFact[];
}

export function reminderDeliveryMessage(result: ReminderDeliveryResponse): string {
  const facts = [
    ...(result.facts ?? []),
    ...(result.reminders ?? []),
    {
      ...(result.runId === undefined ? {} : { runId: result.runId }),
      ...(result.outboxId === undefined ? {} : { outboxId: result.outboxId }),
      ...(result.providerId === undefined ? {} : { providerId: result.providerId }),
      ...(result.status === undefined ? {} : { status: result.status }),
      ...(result.timestamp === undefined ? {} : { timestamp: result.timestamp }),
      ...(result.createdAt === undefined ? {} : { createdAt: result.createdAt }),
    } satisfies ReminderDeliveryFact,
  ].filter((fact) =>
    Object.values(fact).some((value) => typeof value === "string" && value.trim().length > 0),
  );
  const delivered = facts.filter((fact) => fact.status?.toLowerCase() === "delivered");
  const failed = facts.filter((fact) => {
    const status = fact.status?.toLowerCase();
    return status === "failed" || status === "dead-letter";
  });
  if (delivered.length > 0) {
    return `Reminder delivery confirmed for ${delivered.length} reviewer${delivered.length === 1 ? "" : "s"}.`;
  }
  if (failed.length > 0) {
    return `Reminder delivery failed for ${failed.length} reviewer${failed.length === 1 ? "" : "s"}.`;
  }
  const queued = result.queued > 0 ? result.queued : facts.length;
  return `Reminder request queued for ${queued} reviewer${queued === 1 ? "" : "s"}; delivery is pending.`;
}

export async function loadReminderDeliveryFacts(
  baseUrl: string,
  planId: string,
  fetcher: Fetcher = fetch,
): Promise<readonly ReminderDeliveryFact[]> {
  const result = await evaluationRequest<{ readonly facts: readonly ReminderDeliveryFact[] }>(
    baseUrl,
    `/plans/${encodeURIComponent(planId)}/reminders`,
    {},
    fetcher,
  );
  return result.facts;
}

export function reminderDeliveryForSelection(
  facts: readonly ReminderDeliveryFact[],
  roundId: string,
  reviewerIds: readonly string[],
): string {
  const reviewerSet = new Set(reviewerIds);
  const selectedFacts = facts.filter(
    (fact) =>
      fact.roundId === roundId &&
      typeof fact.reviewerId === "string" &&
      reviewerSet.has(fact.reviewerId),
  );
  return reminderDeliveryMessage({
    queued: selectedFacts.length === 0 ? reviewerIds.length : 0,
    facts: selectedFacts,
  });
}

export function reminderReviewerIdsRequiringSend(
  facts: readonly ReminderDeliveryFact[],
  roundId: string,
  reviewerIds: readonly string[],
): readonly string[] {
  const reusableStatuses = new Set(["queued", "processing", "delivered"]);
  return reviewerIds.filter(
    (reviewerId) =>
      !facts.some(
        (fact) =>
          fact.roundId === roundId &&
          fact.reviewerId === reviewerId &&
          typeof fact.status === "string" &&
          reusableStatuses.has(fact.status.toLowerCase()),
      ),
  );
}

export function reminderRequestPresentation(busy: boolean): Readonly<{
  ariaBusy: boolean;
  action: "idle" | "pending";
}> {
  return {
    ariaBusy: busy,
    action: busy ? "pending" : "idle",
  };
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

export function effectiveReviewClosesAt(plan: ApiPlan): string | null {
  if (plan.closesAt !== null) return plan.closesAt;
  return (
    plan.rounds
      .map((round) => round.closesAt)
      .filter((value): value is string => value !== null)
      .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null
  );
}

function dateTimeLocalValue(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (part: number): string => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function authoringDateLabel(value: string | null | undefined): string {
  if (!value) return "Not set";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function isoDateTimeValue(value: string): string | null {
  if (value.trim().length === 0) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
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
export function validateSuggestionEditValue(
  criterion: RubricCriterion,
  rawValue: number | string,
): string | null {
  if (criterionType(criterion) === "free_text") {
    return "Free-text criteria cannot resolve a numeric suggestion.";
  }
  const numericValue =
    criterionType(criterion) === "dropdown"
      ? criterionNumericValue(criterion, String(rawValue))
      : Number(rawValue);
  if (!Number.isFinite(numericValue)) return `Enter a numeric value for ${criterion.label}.`;
  if (numericValue < criterion.minimum || numericValue > criterion.maximum) {
    return `${criterion.label} must be between ${criterion.minimum} and ${criterion.maximum}.`;
  }
  return null;
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

export function normalizeCompletionPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function normalizeReviewerProgress(reviewer: ReviewerProgressSummary): ReviewerProgressSummary {
  return {
    ...reviewer,
    completionPercent: normalizeCompletionPercent(reviewer.completionPercent),
  };
}
export function assignmentCompletionPercent(
  assignments: readonly ReviewPlanAssignment[],
  roundId?: string,
): number {
  const relevantAssignments =
    roundId === undefined
      ? assignments
      : assignments.filter((assignment) => assignment.roundId === roundId);
  const activeAssignments = relevantAssignments.filter(
    (assignment) => assignment.status !== "abstained" && assignment.status !== "superseded",
  );
  const submitted = activeAssignments.filter(
    (assignment) => assignment.status === "submitted",
  ).length;
  return normalizeCompletionPercent(
    activeAssignments.length === 0 ? 0 : (submitted / activeAssignments.length) * 100,
  );
}

function mapPlan(
  plan: ApiPlan,
  eventId: string,
  aggregates: readonly AggregateRow[],
  progress: ApiProgress,
  decisions: Readonly<Record<string, ApiDecision | null>>,
  assignments: readonly ReviewPlanAssignment[] = [],
): ReviewPlanSeed {
  const reviewerProgress = progress.reviewers?.map(normalizeReviewerProgress);
  const activeAssignments = assignments.filter(
    (assignment) => assignment.status !== "abstained" && assignment.status !== "superseded",
  );
  const submittedAssignments = activeAssignments.filter(
    (assignment) => assignment.status === "submitted",
  ).length;
  const abstainedAssignments = assignments.filter(
    (assignment) => assignment.status === "abstained",
  ).length;
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
    opensAt: dateLabel(plan.rounds[0]?.opensAt ?? null),
    closesAt: dateLabel(effectiveReviewClosesAt(plan)),
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
      revision: round.revision,
      rubricRevision: round.rubricRevision,
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
      completionPercent: assignmentCompletionPercent(assignments, round.id),
      blindReview: round.blindReview === true || plan.blindReview,
      anonymization: round.anonymization,
      reviewerPool: round.reviewerPool,
      trackFilter: round.trackFilter ?? null,
      rubric: { name: round.rubric.name, criteria: round.rubric.criteria },
    })),
    aggregates,
    assignments,
    progress: {
      totalAssignments: assignments.length,
      assigned: activeAssignments.length,
      inProgress: activeAssignments.filter((assignment) => assignment.status === "in_progress")
        .length,
      submitted: submittedAssignments,
      abstained: abstainedAssignments,
      conflicts: abstainedAssignments,
      completionPercent: assignmentCompletionPercent(assignments),
      reviewers: reviewerProgress ?? [],
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
    seed.assignments,
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
    else if (assignment.status !== "superseded") {
      current.assigned += 1;
      if (assignment.status === "in_progress") current.inProgress += 1;
      if (assignment.status === "submitted") current.submitted += 1;
    }
    current.outstanding = Math.max(0, current.assigned - current.submitted);
    current.completionPercent = normalizeCompletionPercent(
      current.assigned === 0 ? 0 : (current.submitted / current.assigned) * 100,
    );
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
export async function loadRoundAggregates(
  baseUrl: string,
  planId: string,
  roundId: string,
  fetcher: Fetcher = fetch,
): Promise<readonly ApiAggregate[]> {
  const result = await evaluationRequest<{ aggregates: readonly ApiAggregate[] }>(
    baseUrl,
    `/plans/${encodeURIComponent(planId)}/rounds/${encodeURIComponent(roundId)}/aggregates`,
    {},
    fetcher,
  );
  return result.aggregates;
}

export function mapRoundAggregates(
  submissions: readonly ApiSubmission[],
  assignments: readonly ReviewPlanAssignment[],
  aggregates: readonly ApiAggregate[],
  roundId: string,
): readonly AggregateRow[] {
  const aggregateBySubmissionId = new Map(
    aggregates
      .filter((aggregate) => aggregate.roundId === roundId)
      .map((aggregate) => [aggregate.submissionId, aggregate] as const),
  );
  return submissions.map((submission) => {
    const aggregate = aggregateBySubmissionId.get(submission.id);
    const submissionAssignments = assignments.filter(
      (assignment) =>
        assignment.submissionId === submission.id &&
        assignment.roundId === roundId &&
        assignment.status !== "superseded",
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
      roundId,
      ...(aggregate?.roundRevision === undefined ? {} : { roundRevision: aggregate.roundRevision }),
      ...(aggregate?.rubricRevision === undefined
        ? {}
        : { rubricRevision: aggregate.rubricRevision }),
    };
  });
}
export function mapSeedRoundAggregates(
  seed: ReviewPlanSeed,
  aggregates: readonly ApiAggregate[],
  roundId: string,
): readonly AggregateRow[] {
  const submissionRows = seed.aggregates.map((aggregate) => ({
    id: aggregate.id,
    title: aggregate.title,
    abstract: "",
    ...(aggregate.participants === undefined ? {} : { participants: aggregate.participants }),
  }));
  const mapped = mapRoundAggregates(submissionRows, seed.assignments, aggregates, roundId);
  const referenceById = new Map(
    seed.aggregates.map((aggregate) => [aggregate.id, aggregate.reference]),
  );
  return mapped.map((aggregate) => ({
    ...aggregate,
    reference: referenceById.get(aggregate.id) ?? aggregate.reference,
  }));
}
export async function loadOrganizerData(
  eventId: string,
  baseUrl: string,
  preferredPlanId?: string,
): Promise<ReviewPlanSeed> {
  const planQuery =
    preferredPlanId === undefined ? "" : `&planId=${encodeURIComponent(preferredPlanId)}`;
  let workspace: ApiOrganizerWorkspaceResponse;
  try {
    workspace = await evaluationRequest<ApiOrganizerWorkspaceResponse>(
      baseUrl,
      `/organizer/workspace?eventId=${encodeURIComponent(eventId)}${planQuery}`,
    );
  } catch (reason: unknown) {
    if (reason instanceof EvaluationRequestError && reason.status === 404) {
      throw new MissingEvaluationPlanError();
    }
    throw reason;
  }
  const plan = normalizeApiPlan(workspace.plan);
  const assignments = workspace.assignments;
  const mappedProgress: ApiProgress = {
    ...workspace.progress,
    reviewers: workspace.progress.reviewers ?? deriveReviewerProgress(assignments),
  };
  const uniqueSubmissions = [
    ...new Map(
      workspace.submissions
        .map(normalizeApiSubmission)
        .filter((submission): submission is ApiSubmission => submission !== null)
        .map((submission) => [submission.id, submission] as const),
    ).values(),
  ];
  const aggregateRoundId = workspace.aggregates[0]?.roundId;
  const round =
    plan.rounds.find((candidate) => candidate.id === aggregateRoundId) ??
    [...plan.rounds]
      .sort((left, right) => right.sequence - left.sequence)
      .find(
        (candidate) =>
          plan.status === "open" &&
          (candidate.opensAt === null ||
            candidate.opensAt === undefined ||
            Date.parse(candidate.opensAt) <= Date.now()) &&
          (candidate.closesAt === null || Date.parse(candidate.closesAt) > Date.now()),
      ) ??
    [...plan.rounds].sort((left, right) => left.sequence - right.sequence)[0];
  const selectedRoundId = round?.id ?? aggregateRoundId ?? "";
  const aggregateEntries = mapRoundAggregates(
    uniqueSubmissions,
    assignments,
    workspace.aggregates,
    selectedRoundId,
  );
  return mapPlan(plan, eventId, aggregateEntries, mappedProgress, workspace.decisions, assignments);
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
    closesAt: dateLabel(context.round.closesAt ?? plan.closesAt),
    completionPercent: 0,
    roundRevision: context.round.revision,
    rubricRevision: context.round.rubricRevision ?? context.rubricRevision,
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
    organizationId: plan.organizationId ?? resolvedEventId,
    organizationName: plan.organizationName ?? plan.organizationId ?? resolvedEventId,
    eventId: resolvedEventId,
    eventName: plan.eventName ?? resolvedEventId,
    dueAt: round.closesAt ?? plan.closesAt,
    planId: context.assignment.planId || plan.id,
    planName: plan.name,
    reviewVersion: context.review?.version,
    initialScores,
    initialResponses,
    initialConfirmed: Object.entries(scores)
      .filter(([criterionId, score]) => {
        const criterion = round.rubric.criteria.find((candidate) => candidate.id === criterionId);
        return (
          isHumanConfirmedReviewScore(score) &&
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
    predecessorAssignmentId: context.assignment.predecessorAssignmentId,
    successorAssignmentId: context.assignment.successorAssignmentId,
    supersededReason: context.assignment.supersededReason,
    lineage: context.assignment.lineage,
    roundRevision: context.round.revision,
    rubricRevision: context.round.rubricRevision ?? context.rubricRevision,
    submissionRevision: context.submissionRevision,
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
      .filter(
        (entry) =>
          entry.assignment.status !== "abstained" && entry.assignment.status !== "superseded",
      )
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
function planStatusVariant(status: PlanStatus): "default" | "secondary" | "outline" {
  if (status === "open") return "default";
  if (status === "draft") return "outline";
  return "secondary";
}
const assignmentControlGridStyle = {
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 24rem), 1fr))",
} as const;
const assignmentControlFieldStyle = {
  boxSizing: "border-box",
  minWidth: 0,
  border: 0,
  padding: 0,
  margin: 0,
} as const;
const assignmentControlSelectStyle = {
  boxSizing: "border-box",
  display: "block",
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
} as const;
function formatDecisionStatus(status: DecisionStatus): string {
  if (status === "accepted") return "Accepted";
  if (status === "waitlisted") return "Waitlisted";
  return "Rejected";
}

function formatAssignmentStatus(status: EvaluatorAssignment["assignmentStatus"]): string {
  if (status === "submitted") return "Submitted";
  if (status === "in_progress") return "In progress";
  if (status === "abstained") return "Recused";
  if (status === "superseded") return "Superseded";
  return "Needs review";
}
type AssignmentReviewStatus =
  | "needs-review"
  | "in-progress"
  | "submitted"
  | "recused"
  | "superseded";

function assignmentReviewStatus(
  status: EvaluatorAssignment["assignmentStatus"],
): AssignmentReviewStatus {
  if (status === "submitted") return "submitted";
  if (status === "in_progress") return "in-progress";
  if (status === "abstained") return "recused";
  if (status === "superseded") return "superseded";
  return "needs-review";
}

function AssignmentStatusBadge({
  status,
}: Readonly<{ status: EvaluatorAssignment["assignmentStatus"] }>) {
  const normalized = assignmentReviewStatus(status);
  const className =
    normalized === "submitted"
      ? styles.statusSubmitted
      : normalized === "in-progress"
        ? styles.statusInProgress
        : normalized === "recused" || normalized === "superseded"
          ? styles.statusRecused
          : styles.statusNeedsReview;
  return (
    <Badge variant="outline" className={className} data-assignment-status={normalized}>
      {formatAssignmentStatus(status)}
    </Badge>
  );
}

function DecisionStatusBadge({ status }: Readonly<{ status: DecisionStatus }>) {
  const className =
    status === "accepted"
      ? styles.statusAccepted
      : status === "waitlisted"
        ? styles.statusWaitlisted
        : styles.statusRejected;
  return (
    <Badge variant="outline" className={className}>
      {formatDecisionStatus(status)}
    </Badge>
  );
}

function ProgressBar({ label, value }: Readonly<{ label: string; value: number }>) {
  const normalizedValue = normalizeCompletionPercent(value);
  return (
    <div className={styles.progressBlock}>
      <div className={styles.progressLabel}>
        <span>{label}</span>
        <strong>{normalizedValue}%</strong>
      </div>
      <Progress value={normalizedValue} aria-label={label} />
    </div>
  );
}

function AuthorityNotice() {
  return (
    <Alert className={styles.authorityNotice} role="note">
      <AlertTitle>Human approval required.</AlertTitle>
      <AlertDescription>
        AI suggestions remain advisory; an authorized human confirms every score and outcome.
      </AlertDescription>
    </Alert>
  );
}

function ReviewNavigation({
  eventId,
  mode,
  organizationId,
}: Readonly<{ eventId?: string; mode: ReviewWorkspaceMode; organizationId?: string | undefined }>) {
  if (mode === "evaluator") return null;
  if (eventId === undefined) return null;
  const resolvedOrganizationId = configuredOrganizationId(organizationId);
  if (resolvedOrganizationId === null) return null;
  const reviewBase = `/admin/organizations/${encodeURIComponent(resolvedOrganizationId)}/events/${encodeURIComponent(eventId)}/reviews`;
  return (
    <nav className={styles.reviewNavigation} aria-label="Review workspace">
      <Button asChild size="sm">
        <Link href={reviewBase} aria-current="page">
          Review plan
        </Link>
      </Button>
      {resolvedOrganizationId === null ? null : (
        <Button asChild size="sm" variant="ghost">
          <Link href={`/admin/organizations/${encodeURIComponent(resolvedOrganizationId)}/members`}>
            Invite reviewers
          </Link>
        </Button>
      )}
    </nav>
  );
}

export async function loadCreatedOrganizerPlan(
  eventId: string,
  baseUrl: string,
  planId: string,
  loader: typeof loadOrganizerData = loadOrganizerData,
): Promise<ReviewPlanSeed> {
  return loader(eventId, baseUrl, planId);
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
  const reviewerQueueMode =
    mode === "evaluator" &&
    (eventId === undefined || initialState?.queue !== undefined || !initialStateProvided);
  const [seed, setSeed] = useState<ReviewPlanSeed | null>(() =>
    mode === "organizer" ? (initialState?.organizer ?? null) : null,
  );
  const [assignment, setAssignment] = useState<EvaluatorAssignment | null>(() =>
    mode === "evaluator" &&
    !reviewerQueueMode &&
    initialState?.assignment?.assignmentStatus !== "superseded"
      ? (initialState?.assignment ?? null)
      : null,
  );
  const [queue, setQueue] = useState<readonly ReviewerQueueEntry[] | null>(() =>
    mode === "evaluator" && reviewerQueueMode
      ? (initialState?.queue ?? []).filter(
          (entry) =>
            entry.assignment.assignmentStatus !== "abstained" &&
            entry.assignment.assignmentStatus !== "superseded",
        )
      : null,
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
  const [createdPlanRefresh, setCreatedPlanRefresh] = useState<{
    eventId: string;
    planId: string;
  } | null>(null);
  const [createdPlanRefreshLoading, setCreatedPlanRefreshLoading] = useState(false);
  const [createdPlanRefreshError, setCreatedPlanRefreshError] = useState<string | null>(null);

  async function refreshCreatedPlan(eventId: string, planId: string): Promise<void> {
    setCreatedPlanRefreshLoading(true);
    setCreatedPlanRefreshError(null);
    try {
      const authoritative = await loadCreatedOrganizerPlan(eventId, baseUrl, planId);
      setSeed(authoritative);
      setCreatedPlanRefresh(null);
    } catch (reason: unknown) {
      setCreatedPlanRefreshError(
        reason instanceof Error
          ? reason.message
          : "The authoritative review plan could not be loaded.",
      );
    } finally {
      setCreatedPlanRefreshLoading(false);
    }
  }
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
      if (reviewerOrganizationId === null) {
        setReviewerMembersLoading(false);
        setReviewerMembersError("The organization member API is not configured.");
        return () => {
          active = false;
        };
      }
      try {
        memberApi = createMemberApi(baseUrl || browserSameOrigin(), reviewerOrganizationId);
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
    const load =
      mode === "organizer"
        ? eventId === undefined
          ? Promise.reject(new Error("An event is required for organizer review plans."))
          : loadOrganizerData(eventId, baseUrl)
        : loadEvaluatorQueue(eventId, baseUrl);
    void load
      .then((value) => {
        if (!active) return;
        if (mode === "organizer") setSeed(value as ReviewPlanSeed);
        else setQueue(value as readonly ReviewerQueueEntry[]);
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
  }, [baseUrl, eventId, mode, initialStateProvided]);

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
      return <ReviewerQueueWorkspace entries={queue ?? []} baseUrl={baseUrl} />;
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
      <EvaluatorWorkspace assignment={assignment} baseUrl={baseUrl} />
    );
  }
  if (missingPlan && eventId !== undefined) {
    return (
      <OrganizerPlanCreation
        eventId={eventId}
        organizationId={explicitOrganizationId}
        baseUrl={baseUrl}
        onCreated={(plan) => {
          const refresh = { eventId, planId: plan.id };
          setMissingPlan(false);
          setSeed(seedFromCreatedPlan(plan, eventId));
          setCreatedPlanRefresh(refresh);
          void refreshCreatedPlan(refresh.eventId, refresh.planId);
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
    <>
      <OrganizerDetailStatus
        loading={createdPlanRefreshLoading}
        error={createdPlanRefreshError}
        onRetry={() => {
          if (createdPlanRefresh !== null) {
            void refreshCreatedPlan(createdPlanRefresh.eventId, createdPlanRefresh.planId);
          }
        }}
      />
      <OrganizerWorkspace
        seed={seed}
        baseUrl={baseUrl}
        organizationId={explicitOrganizationId}
        reviewerMembers={activeVerifiedReviewers(reviewerMembers)}
        reviewerMembersLoading={reviewerMembersLoading}
        reviewerMembersError={reviewerMembersError}
      />
    </>
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
            <Field orientation="horizontal" className={styles.checkboxField}>
              <Checkbox
                id="create-plan-blind-review"
                checked={blindReview}
                onCheckedChange={(checked) => setBlindReview(checked === true)}
              />
              <FieldContent>
                <FieldLabel htmlFor="create-plan-blind-review">Blind review</FieldLabel>
                <FieldDescription>Hide submitter identity from reviewers.</FieldDescription>
              </FieldContent>
            </Field>
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
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create evaluation plan"}
          </Button>
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
  assignmentOnly = false,
  assignmentTarget,
}: Readonly<{
  seed: ReviewPlanSeed;
  baseUrl: string;
  reviewerMembers: readonly OrganizationMember[];
  reviewerMembersLoading: boolean;
  reviewerMembersError: string | null;
  onAuthoritativePlan?: ((plan: ApiPlan) => void) | undefined;
  onAssignmentsPersisted?: (() => Promise<void>) | undefined;
  assignmentOnly?: boolean;
  assignmentTarget?:
    | {
        readonly roundId: string;
        readonly submissionId: string;
      }
    | undefined;
}>) {
  const initialRounds: readonly ApiPlan["rounds"][number][] =
    seed.sourceRounds ??
    seed.rounds.map((round, index) => ({
      id: round.id,
      name: round.name,
      sequence: round.sequence ?? index + 1,
      ...(round.roundRevision === undefined ? {} : { revision: round.roundRevision }),
      ...(round.rubricRevision === undefined ? {} : { rubricRevision: round.rubricRevision }),
      opensAt: null,
      closesAt: null,
      ...(round.blindReview === undefined ? {} : { blindReview: round.blindReview }),
      ...(round.anonymization === undefined ? {} : { anonymization: round.anonymization }),
      ...(round.reviewerPool === undefined ? {} : { reviewerPool: round.reviewerPool }),
      ...(round.trackFilter === undefined ? {} : { trackFilter: round.trackFilter }),
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
  const [assignmentPreview, setAssignmentPreview] = useState<DistributionPreview | null>(null);
  const [assignmentPreviewKey, setAssignmentPreviewKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [assignmentSubmissionId, setAssignmentSubmissionId] = useState("");
  const [assignmentReviewerIds, setAssignmentReviewerIds] = useState<readonly string[]>([]);
  const [assignmentReviewerQuery, setAssignmentReviewerQuery] = useState("");
  const [version, setVersion] = useState(seed.version);
  const [status, setStatus] = useState(seed.status);
  const [busy, setBusy] = useState(false);
  const reviewerIdSet = new Set(reviewerMembers.map((member) => member.userId));
  const reviewerDirectoryReady = !reviewerMembersLoading && reviewerMembersError === null;
  const isDraft = status === "draft";
  const criterionCount = rounds.reduce((total, round) => total + round.rubric.criteria.length, 0);
  const planStatusLabel =
    status === "open" ? "Open for review" : status === "closed" ? "Review closed" : "Draft";
  const normalizedAssignmentReviewerQuery = assignmentReviewerQuery.trim().toLowerCase();
  const matchingAssignmentReviewerMembers = reviewerMembers.filter((member) =>
    [member.name, member.email]
      .filter((value): value is string => typeof value === "string")
      .some((value) => value.toLowerCase().includes(normalizedAssignmentReviewerQuery)),
  );
  const visibleAssignmentReviewerMembers = matchingAssignmentReviewerMembers.slice(0, 8);
  const assignmentReviewerSelectionDisabled =
    busy || status !== "open" || reviewerMembersLoading || reviewerMembersError !== null;

  useEffect(() => {
    if (assignmentTarget === undefined) return;
    setAssignmentRoundId(assignmentTarget.roundId);
    setAssignmentSubmissionId(assignmentTarget.submissionId);
  }, [assignmentTarget]);

  useEffect(() => {
    const authoritativeReviewerIds = reviewerIdsForAssignmentTarget(
      seed.assignments,
      assignmentRoundId,
      assignmentSubmissionId,
    );
    if (!reviewerDirectoryReady) {
      setAssignmentReviewerIds(authoritativeReviewerIds);
      return;
    }
    const allowedReviewerIds = new Set(reviewerMembers.map((member) => member.userId));
    setAssignmentReviewerIds(
      authoritativeReviewerIds.filter((reviewerId) => allowedReviewerIds.has(reviewerId)),
    );
  }, [
    assignmentRoundId,
    assignmentSubmissionId,
    reviewerDirectoryReady,
    reviewerMembers,
    seed.assignments,
  ]);
  const assignmentSelectionKey = `${assignmentRoundId}:${assignmentSubmissionId}:${assignmentReviewerIds.join(",")}:${version}`;
  const assignmentSelectionKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (assignmentSelectionKeyRef.current === null) {
      assignmentSelectionKeyRef.current = assignmentSelectionKey;
      return;
    }
    if (assignmentSelectionKeyRef.current === assignmentSelectionKey) return;
    assignmentSelectionKeyRef.current = assignmentSelectionKey;
    setAssignmentPreview(null);
    setAssignmentPreviewKey(null);
  }, [assignmentSelectionKey]);

  function removeCriterion(roundIndex: number, criterionIndex: number): void {
    setRounds((currentRounds) =>
      currentRounds.map((round, currentRoundIndex) => {
        if (currentRoundIndex !== roundIndex || round.rubric.criteria.length <= 1) return round;
        return {
          ...round,
          rubric: {
            ...round.rubric,
            criteria: round.rubric.criteria.filter((_, index) => index !== criterionIndex),
          },
        };
      }),
    );
  }

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
      setMessage("Draft saved.");
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

  async function saveSchedule(): Promise<void> {
    if (status !== "open") return;
    setBusy(true);
    setMessage(null);
    try {
      const updated = await evaluationRequest<ApiPlan>(
        baseUrl,
        `/plans/${encodeURIComponent(seed.planId)}/schedule`,
        {
          method: "PATCH",
          body: JSON.stringify({
            expectedVersion: version,
            closesAt: planClosesAt.trim().length === 0 ? null : planClosesAt,
          }),
        },
      );
      setPlanClosesAt(updated.closesAt ?? "");
      setVersion(updated.version);
      setStatus(updated.status);
      onAuthoritativePlan?.(updated);
      setMessage("Review closing date saved.");
    } catch (reason: unknown) {
      setMessage(
        reason instanceof Error ? reason.message : "The review closing date could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function previewAssignments(): Promise<void> {
    if (status !== "open") {
      setAssignmentPreview(null);
      setAssignmentPreviewKey(null);
      setMessage("Reviewer assignments require an open evaluation plan.");
      return;
    }
    const round = rounds.find((candidate) => candidate.id === assignmentRoundId);
    const reviewerIds = [...assignmentReviewerIds];
    const submissionId = assignmentSubmissionId.trim();
    if (round === undefined || submissionId.length === 0) {
      setMessage("Enter a round and submission id to preview reviewer distribution.");
      return;
    }
    if (!reviewerDirectoryReady) {
      setMessage(
        reviewerMembersError ??
          "Load the active, verified organization reviewers before previewing a distribution.",
      );
      return;
    }
    if (reviewerIds.some((reviewerId) => !reviewerIdSet.has(reviewerId))) {
      setMessage("Select only active, verified organization reviewers.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const input = {
        roundId: round.id,
        submissionIds: [submissionId],
        ...(reviewerIds.length === 0 ? {} : { reviewerIds }),
        expectedVersion: version,
      } satisfies DistributionPreviewInput;
      const preview = await previewReviewAssignments(baseUrl, seed.planId, input);
      setAssignmentPreview(preview);
      setAssignmentPreviewKey(distributionPreviewKey(input));
      setMessage("Authoritative reviewer distribution preview loaded.");
    } catch (reason: unknown) {
      setAssignmentPreview(null);
      setAssignmentPreviewKey(null);
      setMessage(
        reason instanceof Error
          ? reason.message
          : "The reviewer distribution preview could not be loaded.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function assignReviewers(): Promise<void> {
    if (status !== "open") {
      setMessage("Reviewer assignments require an open evaluation plan.");
      return;
    }
    const round = rounds.find((candidate) => candidate.id === assignmentRoundId);
    const reviewerIds = [...assignmentReviewerIds];
    const submissionId = assignmentSubmissionId.trim();
    if (round === undefined || submissionId.length === 0) {
      setMessage("Provide a round and submission id.");
      return;
    }
    if (!reviewerDirectoryReady) {
      setMessage(
        reviewerMembersError ??
          "Load the active, verified organization reviewers before applying a distribution.",
      );
      return;
    }
    if (reviewerIds.some((reviewerId) => !reviewerIdSet.has(reviewerId))) {
      setMessage("Select only active, verified organization reviewers.");
      return;
    }
    const preview = assignmentPreview;
    const input = {
      roundId: round.id,
      submissionIds: [submissionId],
      ...(reviewerIds.length === 0 ? {} : { reviewerIds }),
      expectedVersion: version,
    } satisfies DistributionPreviewInput;
    if (
      preview === null ||
      assignmentPreviewKey !== distributionPreviewKey(input) ||
      preview.scope.roundId !== round.id ||
      preview.fingerprint.trim().length === 0
    ) {
      setMessage("Load a fresh authoritative preview before applying reviewer distribution.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await applyReviewAssignments(baseUrl, seed.planId, {
        ...input,
        fingerprint: preview.fingerprint,
      });
      setAssignmentPreview(null);
      setAssignmentPreviewKey(null);
      const activeIds = [...result.activeAssignments]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((assignment) => assignment.id);
      const supersededIds = [...result.supersededAssignments]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((assignment) => assignment.id);
      setMessage(
        `Distribution applied atomically. Active assignments: ${activeIds.join(", ") || "none"}. Superseded: ${supersededIds.join(", ") || "none"}. History preserved: ${result.history.length}.`,
      );
      await onAssignmentsPersisted?.();
    } catch (reason: unknown) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : "Reviewer distribution could not be applied atomically.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function transition(action: "open" | "close"): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const updated = await evaluationRequest<ApiPlan>(
        baseUrl,
        `/plans/${encodeURIComponent(seed.planId)}/${action}`,
        { method: "POST", body: JSON.stringify({ expectedVersion: version }) },
      );
      setMessage("Plan status updated.");
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

  async function reviseToDraft(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const revision = await reviseEvaluationPlan(baseUrl, seed.planId, version);
      setMessage(
        "Editable draft revision created. Historical grading remains on the original plan.",
      );
      setRounds(revision.rounds);
      setName(revision.name);
      setBlindReview(revision.blindReview);
      setPlanClosesAt(revision.closesAt ?? "");
      setReviewsPerSubmission(revision.assignmentRule.reviewsPerSubmission);
      setMaxAssignmentsPerReviewer(revision.assignmentRule.maxAssignmentsPerReviewer);
      setFieldIds(revision.reviewerProjection?.fieldIds?.join(", ") ?? "");
      setFileIds(revision.reviewerProjection?.fileIds?.join(", ") ?? "");
      setVersion(revision.version);
      setStatus(revision.status);
      onAuthoritativePlan?.(revision);
    } catch (reason: unknown) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : "The editable plan revision could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={`${styles.section} ${assignmentOnly ? "" : styles.authoringSection}`}
      aria-labelledby="authoring-heading"
    >
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.sectionEyebrow}>
            {assignmentOnly ? "Coverage operations" : "Organizer authoring"}
          </p>
          <h2 id="authoring-heading">
            {assignmentOnly
              ? "Manage reviewer coverage"
              : isDraft
                ? "Draft configuration"
                : "Live configuration"}
          </h2>
        </div>
        {!assignmentOnly ? (
          <div className={styles.authoringStatus}>
            <Badge variant={status === "open" ? "default" : "outline"}>{planStatusLabel}</Badge>
            <span className={styles.mutedLabel}>Version {version}</span>
          </div>
        ) : null}
      </div>
      <p className={styles.sectionIntro}>
        {assignmentOnly
          ? "Choose a submission that needs attention, fill missing reviewer slots, preview coverage, and apply coverage without editing the plan or rubric. Existing assignments remain unchanged."
          : isDraft
            ? "Shape the review schedule, reviewer eligibility, and rubric before opening this version for reviewers."
            : "Inspect the live grading configuration. Its rounds and rubric are locked to protect existing assignments and reviews; create a revision before changing them."}
      </p>
      {assignmentOnly ? (
        <section
          className={styles.assignmentCoverageTask}
          aria-labelledby="assignment-task-heading"
        >
          <div className={styles.assignmentTaskHeader}>
            <div>
              <p className={styles.sectionEyebrow}>Assignment task</p>
              <h3 id="assignment-task-heading">Fill missing reviewer slots</h3>
            </div>
            <span className={styles.assignmentSelectionCount} aria-live="polite">
              {assignmentReviewerIds.length} selected
            </span>
          </div>
          <div className={styles.summaryGrid} style={assignmentControlGridStyle}>
            <fieldset className={styles.formField} style={assignmentControlFieldStyle}>
              <label htmlFor="assignment-round-id">Round</label>
              <select
                id="assignment-round-id"
                style={assignmentControlSelectStyle}
                value={assignmentRoundId}
                disabled={busy || status !== "open"}
                onChange={(event) => setAssignmentRoundId(event.currentTarget.value)}
              >
                {rounds.map((round) => (
                  <option value={round.id} key={round.id}>
                    {round.name}
                  </option>
                ))}
              </select>
            </fieldset>
            <fieldset className={styles.formField} style={assignmentControlFieldStyle}>
              <legend className={styles.cardLabel}>Coverage guidance</legend>
              <span className={styles.fieldHint}>
                The plan cap is {maxAssignmentsPerReviewer} assignments per reviewer. Select
                reviewer candidates to fill missing reviewer slots. Existing assignments remain
                unchanged.
              </span>
            </fieldset>
          </div>
          <div className={styles.summaryGrid} style={assignmentControlGridStyle}>
            <fieldset className={styles.formField} style={assignmentControlFieldStyle}>
              <label htmlFor="assignment-submission-id">Submission needing coverage</label>
              <select
                id="assignment-submission-id"
                style={assignmentControlSelectStyle}
                value={assignmentSubmissionId}
                onChange={(event) => setAssignmentSubmissionId(event.currentTarget.value)}
                disabled={busy || status !== "open" || seed.aggregates.length === 0}
                required
                aria-describedby="assignment-submission-help"
              >
                <option value="">Choose a submission</option>
                {seed.aggregates.map((aggregate) => (
                  <option value={aggregate.id} key={aggregate.id}>
                    {aggregate.reference} · {aggregate.title}
                  </option>
                ))}
              </select>
              <span className={styles.fieldHint} id="assignment-submission-help">
                {seed.aggregates.length === 0
                  ? "No submissions are available for coverage."
                  : "Choose a submission from the authoritative event material. Existing assignments remain unchanged."}
              </span>
            </fieldset>
            <fieldset
              className={`${styles.formField} ${styles.assignmentReviewerCandidates}`}
              style={assignmentControlFieldStyle}
              aria-describedby="assignment-reviewer-help"
            >
              <legend className={styles.cardLabel}>Reviewer candidates</legend>
              <div className={styles.assignmentCandidateToolbar}>
                <label htmlFor="assignment-reviewer-search">Search reviewers</label>
                <Input
                  id="assignment-reviewer-search"
                  type="search"
                  value={assignmentReviewerQuery}
                  onChange={(event) => setAssignmentReviewerQuery(event.currentTarget.value)}
                  placeholder="Name or email"
                  disabled={assignmentReviewerSelectionDisabled}
                  aria-controls="assignment-reviewer-candidates"
                />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setAssignmentReviewerIds([])}
                  disabled={
                    assignmentReviewerSelectionDisabled || assignmentReviewerIds.length === 0
                  }
                >
                  Clear selection
                </Button>
              </div>
              <ul
                id="assignment-reviewer-candidates"
                className={styles.assignmentCandidateList}
                aria-label="Verified organization reviewers"
              >
                {visibleAssignmentReviewerMembers.map((member) => {
                  const inputId = `assignment-reviewer-${member.userId}`;
                  const checked = assignmentReviewerIds.includes(member.userId);
                  return (
                    <li key={member.userId}>
                      <Field orientation="horizontal" className={styles.assignmentCandidate}>
                        <Checkbox
                          id={inputId}
                          checked={checked}
                          disabled={assignmentReviewerSelectionDisabled}
                          onCheckedChange={(nextChecked) =>
                            setAssignmentReviewerIds((current) =>
                              nextChecked === true
                                ? [...new Set([...current, member.userId])]
                                : current.filter((reviewerId) => reviewerId !== member.userId),
                            )
                          }
                        />
                        <FieldContent>
                          <FieldLabel htmlFor={inputId}>{member.name ?? member.email}</FieldLabel>
                          <FieldDescription>{member.email}</FieldDescription>
                        </FieldContent>
                      </Field>
                    </li>
                  );
                })}
              </ul>
              <span className={styles.fieldHint} id="assignment-reviewer-help">
                {reviewerMembersLoading
                  ? "Loading active, verified organization reviewers…"
                  : (reviewerMembersError ??
                    (reviewerMembers.length === 0
                      ? "No active, verified organization reviewers are available."
                      : matchingAssignmentReviewerMembers.length === 0
                        ? "No reviewers match that search."
                        : `${visibleAssignmentReviewerMembers.length} of ${matchingAssignmentReviewerMembers.length} matching reviewers shown. Names and email addresses are display-only; assignments submit each member user ID.`))}
              </span>
            </fieldset>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={previewAssignments}
            disabled={busy || status !== "open" || !reviewerDirectoryReady}
          >
            Preview coverage
          </Button>
          {assignmentPreview ? (
            <div className={styles.fieldHint} role="status" aria-live="polite">
              <p>
                Fingerprint: <code>{assignmentPreview.fingerprint}</code>
              </p>
              <p>
                Desired assignments ({assignmentPreview.desiredAssignments.length}):{" "}
                {[...assignmentPreview.desiredAssignments]
                  .sort(
                    (left, right) =>
                      left.submissionId.localeCompare(right.submissionId) ||
                      left.reviewerId.localeCompare(right.reviewerId),
                  )
                  .map(
                    (assignment) =>
                      `${assignment.submissionId} → ${assignment.reviewerId}${assignment.existingAssignmentId ? ` (existing ${assignment.existingAssignmentId})` : ""}`,
                  )
                  .join(", ") || "none"}
              </p>
              <p>
                Deficits ({assignmentPreview.deficits.length}):{" "}
                {[...assignmentPreview.deficits]
                  .sort((left, right) => left.submissionId.localeCompare(right.submissionId))
                  .map(
                    (deficit) =>
                      `${deficit.submissionId}: ${deficit.missingReviewCount} (${deficit.reason})`,
                  )
                  .join(", ") || "none"}
              </p>
              <p>
                Exclusions ({assignmentPreview.exclusions.length}):{" "}
                {[...assignmentPreview.exclusions]
                  .sort(
                    (left, right) =>
                      left.submissionId.localeCompare(right.submissionId) ||
                      left.reviewerId.localeCompare(right.reviewerId),
                  )
                  .map(
                    (exclusion) =>
                      `${exclusion.submissionId}/${exclusion.reviewerId}: ${exclusion.reason}`,
                  )
                  .join(", ") || "none"}
              </p>
              <p>
                Submission revisions:{" "}
                {[...assignmentPreview.submissionRevisions]
                  .sort((left, right) => left.submissionId.localeCompare(right.submissionId))
                  .map((revision) => `${revision.submissionId}=${revision.revision}`)
                  .join(", ") || "none"}
              </p>
            </div>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={assignReviewers}
            disabled={
              busy || status !== "open" || !reviewerDirectoryReady || assignmentPreview === null
            }
          >
            Apply coverage
          </Button>
        </section>
      ) : null}
      {!assignmentOnly ? (
        <div className={styles.authoringWorkbench} data-layout="plan-authoring-workbench">
          <div className={styles.authoringMain}>
            {isDraft ? (
              <>
                <section className={styles.authoringPanel} aria-labelledby="plan-basics-heading">
                  <div className={styles.authoringPanelHeader}>
                    <div>
                      <p className={styles.sectionEyebrow}>Plan</p>
                      <h3 id="plan-basics-heading">Plan basics</h3>
                    </div>
                    <span className={styles.authoringPanelMeta}>Editable draft</span>
                  </div>
                  <div className={styles.authoringBasicsGrid}>
                    <div className={styles.formField}>
                      <label htmlFor="evaluation-plan-name">Plan name</label>
                      <input
                        id="evaluation-plan-name"
                        value={name}
                        onChange={(event) => setName(event.currentTarget.value)}
                      />
                    </div>
                    <div className={styles.formField}>
                      <label htmlFor="evaluation-plan-closes-at">Overall review deadline</label>
                      <input
                        id="evaluation-plan-closes-at"
                        type="datetime-local"
                        value={dateTimeLocalValue(planClosesAt)}
                        onChange={(event) =>
                          setPlanClosesAt(isoDateTimeValue(event.currentTarget.value) ?? "")
                        }
                      />
                    </div>
                  </div>
                </section>
                <section className={styles.authoringRounds} aria-labelledby="review-rounds-heading">
                  <div className={styles.authoringPanelHeader}>
                    <div>
                      <p className={styles.sectionEyebrow}>Workflow</p>
                      <h3 id="review-rounds-heading">Review rounds</h3>
                      <p className={styles.authoringPanelDescription}>
                        Set the schedule and grading model for each stage of review.
                      </p>
                    </div>
                    <Button type="button" variant="outline" onClick={addRound} disabled={busy}>
                      Add round
                    </Button>
                  </div>
                  <div className={styles.scoreList}>
                    {rounds.map((round, roundIndex) => (
                      <fieldset
                        className={`${styles.scoreCard} ${styles.authoringRoundCard}`}
                        data-authoring-round=""
                        key={round.id}
                      >
                        <legend>
                          <span>Round {roundIndex + 1}</span>
                          <strong>{round.name}</strong>
                        </legend>
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
                          <label htmlFor={`${round.id}-closes-at`}>Round closes</label>
                          <input
                            id={`${round.id}-closes-at`}
                            type="datetime-local"
                            value={dateTimeLocalValue(round.closesAt)}
                            onChange={(event) => {
                              const nextClosesAt = isoDateTimeValue(event.currentTarget.value);
                              updateRound(roundIndex, (current) => ({
                                ...current,
                                closesAt: nextClosesAt,
                              }));
                            }}
                          />
                        </div>
                        <div className={styles.authoringScheduleGrid}>
                          <div className={styles.formField}>
                            <label htmlFor={`${round.id}-opens-at`}>Round opens</label>
                            <input
                              id={`${round.id}-opens-at`}
                              type="datetime-local"
                              value={dateTimeLocalValue(round.opensAt)}
                              onChange={(event) => {
                                const nextOpensAt = isoDateTimeValue(event.currentTarget.value);
                                updateRound(roundIndex, (current) => ({
                                  ...current,
                                  opensAt: nextOpensAt,
                                }));
                              }}
                            />
                          </div>
                          <div className={styles.formField}>
                            <label htmlFor={`${round.id}-anonymization`}>
                              Anonymization / blind review
                            </label>
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
                        <details className={styles.reviewerTargeting}>
                          <summary>
                            <span>
                              <strong>Reviewer targeting</strong>
                              <small>Choose who can receive assignments in this round.</small>
                            </span>
                            <span>
                              {round.reviewerPool?.reviewerIds.length ?? reviewerMembers.length}{" "}
                              reviewers ·{" "}
                              {round.trackFilter?.trim().length ? round.trackFilter : "all tracks"}
                            </span>
                          </summary>
                          <div
                            className={styles.reviewerTargetingGrid}
                            style={assignmentControlGridStyle}
                          >
                            <fieldset
                              className={styles.formField}
                              style={assignmentControlFieldStyle}
                            >
                              <legend className={styles.cardLabel}>Round reviewer pool</legend>
                              <label htmlFor={`${round.id}-reviewer-pool`}>
                                Verified organization reviewers for this round
                              </label>
                              <select
                                id={`${round.id}-reviewer-pool`}
                                style={assignmentControlSelectStyle}
                                multiple
                                size={Math.max(3, Math.min(8, reviewerMembers.length || 3))}
                                value={(round.reviewerPool?.reviewerIds ?? []).filter(
                                  (reviewerId) => reviewerIdSet.has(reviewerId),
                                )}
                                disabled={
                                  busy || reviewerMembersLoading || reviewerMembersError !== null
                                }
                                onChange={(event) => {
                                  const nextReviewerIds = [
                                    ...event.currentTarget.selectedOptions,
                                  ].map((option) => option.value);
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
                            </fieldset>
                            <fieldset
                              className={styles.formField}
                              style={assignmentControlFieldStyle}
                            >
                              <legend className={styles.cardLabel}>Bulk assignment filter</legend>
                              <label htmlFor={`${round.id}-track-filter`}>
                                Track filter for bulk assignment
                              </label>
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
                            </fieldset>
                          </div>
                        </details>
                        <section
                          className={styles.criteriaList}
                          aria-label={`${round.name} criteria authoring`}
                        >
                          {round.rubric.criteria.map((criterion, criterionIndex) => (
                            <fieldset className={styles.criterionEditor} key={criterion.id}>
                              <legend>
                                Criterion {criterionIndex + 1}:{" "}
                                {criterion.label || "Untitled criterion"}
                              </legend>
                              <div className={styles.criterionEditorGrid}>
                                <div className={styles.formField}>
                                  <label htmlFor={`${round.id}-criterion-${criterionIndex}-label`}>
                                    Label
                                  </label>
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
                                      const nextType = event.currentTarget
                                        .value as CriterionInputType;
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
                                {criterionType(criterion) === "dropdown" ? (
                                  <div className={styles.formField}>
                                    <label
                                      htmlFor={`${round.id}-criterion-${criterionIndex}-options`}
                                    >
                                      Dropdown options
                                    </label>
                                    <input
                                      id={`${round.id}-criterion-${criterionIndex}-options`}
                                      aria-label={`${criterion.label} dropdown options`}
                                      value={(criterion.options ?? [])
                                        .map((option) => option.label)
                                        .join(", ")}
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
                                ) : null}
                                <div className={styles.formField}>
                                  <label
                                    htmlFor={`${round.id}-criterion-${criterionIndex}-description`}
                                  >
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
                                    <label
                                      htmlFor={`${round.id}-criterion-${criterionIndex}-minimum`}
                                    >
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
                                          minimum: parseNumericAuthoringValue(
                                            current.minimum,
                                            nextMinimum,
                                          ),
                                        }));
                                      }}
                                    />
                                  </div>
                                  <div className={styles.formField}>
                                    <label
                                      htmlFor={`${round.id}-criterion-${criterionIndex}-maximum`}
                                    >
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
                                          maximum: parseNumericAuthoringValue(
                                            current.maximum,
                                            nextMaximum,
                                          ),
                                        }));
                                      }}
                                    />
                                  </div>
                                  <div className={styles.formField}>
                                    <label
                                      htmlFor={`${round.id}-criterion-${criterionIndex}-weight`}
                                    >
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
                                          weight: parseNumericAuthoringValue(
                                            current.weight,
                                            nextWeight,
                                          ),
                                        }));
                                      }}
                                    />
                                  </div>
                                </div>
                                <Field orientation="horizontal" className={styles.checkboxField}>
                                  <Checkbox
                                    id={`${round.id}-criterion-${criterionIndex}-required`}
                                    aria-label={`${criterion.label} required`}
                                    checked={criterion.required}
                                    onCheckedChange={(checked) => {
                                      const nextRequired = checked === true;
                                      updateCriterion(roundIndex, criterionIndex, (current) => ({
                                        ...current,
                                        required: nextRequired,
                                      }));
                                    }}
                                  />
                                  <FieldContent>
                                    <FieldLabel
                                      htmlFor={`${round.id}-criterion-${criterionIndex}-required`}
                                    >
                                      Required criterion
                                    </FieldLabel>
                                    <FieldDescription>
                                      Reviewers must complete this criterion.
                                    </FieldDescription>
                                  </FieldContent>
                                </Field>
                              </div>
                              {round.rubric.criteria.length > 1 ? (
                                <Button
                                  type="button"
                                  variant="destructive"
                                  onClick={() => removeCriterion(roundIndex, criterionIndex)}
                                  disabled={busy || status !== "draft"}
                                >
                                  Remove criterion
                                </Button>
                              ) : null}
                            </fieldset>
                          ))}
                        </section>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => addCriterion(roundIndex)}
                          disabled={busy || status !== "draft"}
                        >
                          Add criterion
                        </Button>
                      </fieldset>
                    ))}
                  </div>
                </section>
              </>
            ) : (
              <div className={styles.authoringReadOnly}>
                <section className={styles.authoringPanel} aria-labelledby="plan-overview-heading">
                  <div className={styles.authoringPanelHeader}>
                    <div>
                      <p className={styles.sectionEyebrow}>Plan</p>
                      <h3 id="plan-overview-heading">Plan overview</h3>
                    </div>
                    <Badge variant="outline">Grading locked</Badge>
                  </div>
                  <dl className={styles.authoringOverviewGrid}>
                    <div>
                      <dt>Plan name</dt>
                      <dd>{name}</dd>
                    </div>
                    <div>
                      <dt>Overall review deadline</dt>
                      <dd>{authoringDateLabel(planClosesAt)}</dd>
                    </div>
                    <div>
                      <dt>Rounds</dt>
                      <dd>{rounds.length}</dd>
                    </div>
                    <div>
                      <dt>Criteria</dt>
                      <dd>{criterionCount}</dd>
                    </div>
                  </dl>
                </section>
                <section className={styles.authoringRounds} aria-labelledby="review-rounds-heading">
                  <div className={styles.authoringPanelHeader}>
                    <div>
                      <p className={styles.sectionEyebrow}>Workflow</p>
                      <h3 id="review-rounds-heading">Review rounds</h3>
                      <p className={styles.authoringPanelDescription}>
                        The live schedule and rubric reviewers are currently using.
                      </p>
                    </div>
                  </div>
                  <div className={styles.readOnlyRoundList}>
                    {rounds.map((round, roundIndex) => {
                      const selectedReviewerCount =
                        round.reviewerPool?.reviewerIds.filter((reviewerId) =>
                          reviewerIdSet.has(reviewerId),
                        ).length ?? 0;
                      const totalWeight = round.rubric.criteria.reduce(
                        (total, criterion) => total + criterion.weight,
                        0,
                      );
                      return (
                        <article className={styles.readOnlyRound} key={round.id}>
                          <header className={styles.readOnlyRoundHeader}>
                            <div>
                              <span className={styles.roundSequence}>Round {roundIndex + 1}</span>
                              <h4>{round.name}</h4>
                              <p>{round.rubric.name}</p>
                            </div>
                            <Badge variant="outline">
                              {round.anonymization === "double"
                                ? "Double-blind"
                                : round.anonymization === "single"
                                  ? "Single-blind"
                                  : "Identities visible"}
                            </Badge>
                          </header>
                          <dl className={styles.readOnlyRoundStats}>
                            <div>
                              <dt>Opens</dt>
                              <dd>{authoringDateLabel(round.opensAt)}</dd>
                            </div>
                            <div>
                              <dt>Deadline</dt>
                              <dd>{authoringDateLabel(round.closesAt)}</dd>
                            </div>
                            <div>
                              <dt>Reviewers</dt>
                              <dd>{selectedReviewerCount}</dd>
                            </div>
                            <div>
                              <dt>Total weight</dt>
                              <dd>{totalWeight}</dd>
                            </div>
                          </dl>
                          <div className={styles.readOnlyRubric}>
                            <div className={styles.readOnlyRubricHeader}>
                              <div>
                                <span>Rubric</span>
                                <strong>
                                  {round.rubric.criteria.length}{" "}
                                  {round.rubric.criteria.length === 1 ? "criterion" : "criteria"}
                                </strong>
                              </div>
                              <span>
                                {round.trackFilter?.trim().length
                                  ? round.trackFilter
                                  : "All tracks"}
                              </span>
                            </div>
                            <ul className={styles.readOnlyCriteria}>
                              {round.rubric.criteria.map((criterion) => (
                                <li key={criterion.id}>
                                  <div>
                                    <strong>{criterion.label}</strong>
                                    <span>{criterion.description}</span>
                                  </div>
                                  <div className={styles.readOnlyCriterionMeta}>
                                    <span>
                                      {criterionType(criterion) === "numeric"
                                        ? `Numeric ${criterion.minimum}-${criterion.maximum}`
                                        : criterionType(criterion) === "dropdown"
                                          ? `${criterion.options?.length ?? 0} options`
                                          : "Written response"}
                                    </span>
                                    <span>Weight {criterion.weight}</span>
                                    <span>{criterion.required ? "Required" : "Optional"}</span>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              </div>
            )}
          </div>
          <aside className={styles.authoringAside} aria-label="Plan authoring summary">
            <div className={styles.authoringAsideInner}>
              <div>
                <p className={styles.sectionEyebrow}>Plan status</p>
                <h3>{name}</h3>
              </div>
              <div className={styles.authoringAsideStatus}>
                <Badge variant={status === "open" ? "default" : "outline"}>{planStatusLabel}</Badge>
                <span className={styles.authoringVersion}>Version {version}</span>
              </div>
              <dl className={styles.authoringAsideMetrics}>
                <div>
                  <dt>Rounds</dt>
                  <dd>{rounds.length}</dd>
                </div>
                <div>
                  <dt>Criteria</dt>
                  <dd>{criterionCount}</dd>
                </div>
                <div>
                  <dt>Review deadline</dt>
                  <dd>{authoringDateLabel(planClosesAt)}</dd>
                </div>
              </dl>
              {status === "open" ? (
                <div className={styles.authoringDeadlineEditor}>
                  <label htmlFor="evaluation-plan-closes-at">Overall review deadline</label>
                  <input
                    id="evaluation-plan-closes-at"
                    type="datetime-local"
                    value={dateTimeLocalValue(planClosesAt)}
                    onChange={(event) =>
                      setPlanClosesAt(isoDateTimeValue(event.currentTarget.value) ?? "")
                    }
                  />
                  <Button type="button" onClick={() => void saveSchedule()} disabled={busy}>
                    {busy ? "Saving…" : "Update review deadline"}
                  </Button>
                </div>
              ) : null}
              <fieldset className={styles.authoringAsideActions}>
                <legend className={styles.srOnly}>Plan lifecycle actions</legend>
                {isDraft ? (
                  <>
                    <Button type="button" onClick={() => void saveDraft()} disabled={busy}>
                      {busy ? "Saving…" : "Save authoring draft"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void transition("open")}
                      disabled={busy}
                    >
                      Open plan for review
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant={status === "open" ? "outline" : "default"}
                    onClick={() => void reviseToDraft()}
                    disabled={busy}
                  >
                    Create editable draft revision
                  </Button>
                )}
                {status === "open" ? (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => void transition("close")}
                    disabled={busy}
                  >
                    Close plan
                  </Button>
                ) : null}
                {status === "closed" ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void transition("open")}
                    disabled={busy}
                  >
                    Reopen plan
                  </Button>
                ) : null}
              </fieldset>
              <p className={styles.authoringAsideHint}>
                {isDraft
                  ? "Save the draft before opening it for reviewers."
                  : "Create a revision to change rounds, reviewer eligibility, or rubric criteria without rewriting review history."}
              </p>
            </div>
          </aside>
        </div>
      ) : null}
      {message ? (
        <p className={styles.submittedMessage} role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
export function OrganizerDetailStatus({
  loading,
  error,
  onRetry,
}: Readonly<{
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}>) {
  if (!loading && error === null) return null;
  return (
    <Alert
      className={styles.authorityNotice}
      role={error === null ? "status" : "alert"}
      variant={error === null ? "default" : "destructive"}
    >
      <AlertTitle>
        {error === null ? "Loading review details" : "Review details need attention"}
      </AlertTitle>
      <AlertDescription>
        {error === null ? "The plan is usable while aggregate scores and decisions load." : error}
      </AlertDescription>
      {error === null ? null : (
        <Button type="button" variant="outline" onClick={onRetry}>
          Retry review details
        </Button>
      )}
    </Alert>
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
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const refreshSequenceRef = useRef(0);

  useEffect(() => {
    refreshSequenceRef.current += 1;
    setAuthoritativeSeed(seed);
    setDetailLoading(false);
    setDetailError(null);
  }, [seed]);

  async function refreshAuthoritativeSeed(): Promise<void> {
    const sequence = refreshSequenceRef.current + 1;
    refreshSequenceRef.current = sequence;
    setDetailLoading(true);
    setDetailError(null);
    try {
      const nextSeed = await loadOrganizerData(seed.eventId, baseUrl, seed.planId);
      if (refreshSequenceRef.current === sequence) {
        setAuthoritativeSeed(nextSeed);
      }
    } catch (reason: unknown) {
      if (refreshSequenceRef.current === sequence) {
        setDetailError(
          reason instanceof Error ? reason.message : "The review details could not be loaded.",
        );
      }
    } finally {
      if (refreshSequenceRef.current === sequence) setDetailLoading(false);
    }
  }

  return (
    <>
      <OrganizerDetailStatus
        loading={detailLoading}
        error={detailError}
        onRetry={() => void refreshAuthoritativeSeed()}
      />
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
    </>
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
  const initialRoundId =
    seed.aggregates.find((aggregate) => aggregate.roundId !== undefined)?.roundId ??
    activeRound?.id ??
    seed.rounds[0]?.id ??
    "";
  const [selectedRoundId, setSelectedRoundId] = useState(initialRoundId);
  const [roundAggregates, setRoundAggregates] = useState<readonly AggregateRow[]>(seed.aggregates);
  const [aggregateLoading, setAggregateLoading] = useState(false);
  const [aggregateError, setAggregateError] = useState<string | null>(null);
  const [aggregateSort, setAggregateSort] = useState<"ascending" | "descending">("descending");
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [view, setView] = useState<"overview" | "setup" | "assignments" | "decisions">("overview");
  const [assignmentTarget, setAssignmentTarget] = useState<{
    readonly roundId: string;
    readonly submissionId: string;
  } | null>(null);
  const [selectedDecisionId, setSelectedDecisionId] = useState<string | null>(null);
  const [decisionQuery, setDecisionQuery] = useState("");
  const [decisionFilter, setDecisionFilter] = useState<"all" | "undecided" | DecisionStatus>(
    "undecided",
  );
  const [decisionRowLimit, setDecisionRowLimit] = useState(5);
  const decisionEditorRef = useRef<HTMLDivElement | null>(null);
  const selectedRound = seed.rounds.find((round) => round.id === selectedRoundId) ?? activeRound;
  useEffect(() => {
    setRoundAggregates(seed.aggregates);
    setAggregateError(null);
    if (!seed.rounds.some((round) => round.id === selectedRoundId)) {
      setSelectedRoundId(initialRoundId);
    }
  }, [initialRoundId, seed, selectedRoundId]);
  useEffect(() => {
    if (selectedRoundId.length === 0) return;
    let cancelled = false;
    setAggregateLoading(true);
    setAggregateError(null);
    void loadRoundAggregates(baseUrl, seed.planId, selectedRoundId)
      .then((aggregates) => {
        if (!cancelled) {
          setRoundAggregates(mapSeedRoundAggregates(seed, aggregates, selectedRoundId));
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setAggregateError(
            reason instanceof Error
              ? reason.message
              : `Aggregates for ${selectedRoundId} are unavailable; other organizer data remains available.`,
          );
        }
      })
      .finally(() => {
        if (!cancelled) setAggregateLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [baseUrl, seed, selectedRoundId]);
  useEffect(() => {
    if (selectedDecisionId === null) return;
    decisionEditorRef.current?.focus();
    decisionEditorRef.current?.scrollIntoView({ block: "start" });
  }, [selectedDecisionId]);
  const sortedAggregates = [...roundAggregates].sort((left, right) => {
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
  const filteredDecisionRows = sortedAggregates.filter((aggregate) => {
    const decision = seed.decisionBySubmission[aggregate.id];
    const matchesStatus =
      decisionFilter === "all"
        ? true
        : decisionFilter === "undecided"
          ? decision === undefined
          : decision?.status === decisionFilter;
    if (!matchesStatus) return false;
    const query = decisionQuery.trim().toLocaleLowerCase();
    if (query.length === 0) return true;
    return [
      aggregate.reference,
      aggregate.title,
      ...(aggregate.participants ?? []).map(({ displayName }) => displayName),
    ]
      .join(" ")
      .toLocaleLowerCase()
      .includes(query);
  });
  const visibleDecisionRows = filteredDecisionRows.slice(0, decisionRowLimit);
  const selectedAggregate =
    selectedDecisionId === null
      ? undefined
      : roundAggregates.find((aggregate) => aggregate.id === selectedDecisionId);
  const overviewRows = [...roundAggregates]
    .map((aggregate) => {
      const roundId = aggregate.roundId ?? selectedRound?.id ?? selectedRoundId;
      const reviewerIds = reviewerIdsForAssignmentTarget(seed.assignments, roundId, aggregate.id);
      const expectedReviewCount = Math.max(
        seed.assignmentRule.reviewsPerSubmission,
        aggregate.expectedReviews,
      );
      const decision = seed.decisionBySubmission[aggregate.id];
      let attentionKind: "none" | "assignment" | "completion" | "conflict" | "decision" = "none";
      let attentionLabel = "Complete";
      if (aggregate.conflicts > 0) {
        attentionKind = "conflict";
        attentionLabel = `${aggregate.conflicts} conflict${aggregate.conflicts === 1 ? "" : "s"}`;
      } else if (reviewerIds.length < expectedReviewCount) {
        const missingReviewers = expectedReviewCount - reviewerIds.length;
        attentionKind = "assignment";
        attentionLabel = `${missingReviewers} reviewer slot${missingReviewers === 1 ? "" : "s"} open`;
      } else if (aggregate.countedReviews < expectedReviewCount) {
        attentionKind = "completion";
        attentionLabel = "Reviews in progress";
      } else if (decision === undefined) {
        attentionKind = "decision";
        attentionLabel = "Decision needed";
      }
      return {
        id: aggregate.id,
        reference: aggregate.reference,
        title: aggregate.title,
        roundName: selectedRound?.name ?? "Round unavailable",
        assignedReviewerCount: reviewerIds.length,
        expectedReviewerCount: expectedReviewCount,
        completedReviewCount: aggregate.countedReviews,
        expectedReviewCount,
        weightedScoreLabel:
          aggregate.possibleScore === "—"
            ? aggregate.countedScore
            : `${aggregate.countedScore} / ${aggregate.possibleScore}`,
        conflictCount: aggregate.conflicts,
        decisionLabel:
          decision === undefined ? "Not decided" : formatDecisionStatus(decision.status),
        attentionKind,
        attentionLabel,
        reviewerDisplayNames: reviewerIds.map((reviewerId) =>
          reviewerDisplayLabel(reviewerId, reviewerMembers),
        ),
        manageable: true,
        attentionAction:
          attentionKind === "decision"
            ? { label: "Record decision", target: "decisions" as const }
            : { label: "Manage reviewers", target: "reviewers" as const },
      };
    })
    .sort(
      (left, right) =>
        left.reference.localeCompare(right.reference) || left.id.localeCompare(right.id),
    );
  const overviewExpectedReviewCount = overviewRows.reduce(
    (total, row) => total + row.expectedReviewCount,
    0,
  );
  const overviewAssignedReviewerCount = overviewRows.reduce(
    (total, row) => total + row.assignedReviewerCount,
    0,
  );
  const overviewCompletedReviewCount = overviewRows.reduce(
    (total, row) => total + row.completedReviewCount,
    0,
  );
  const overviewDecisionCount = overviewRows.filter(
    (row) => row.decisionLabel !== "Not decided",
  ).length;
  const overviewAttentionCount = overviewRows.filter((row) => row.attentionKind !== "none").length;
  const overviewCompletionPercent = normalizeCompletionPercent(seed.progress.completionPercent);
  const overviewMetrics = [
    {
      label: "Review window",
      value: seed.opensAt,
      detail: `Closes ${seed.closesAt}`,
    },
    {
      label: "Reviewer coverage",
      value: `${overviewAssignedReviewerCount}/${overviewExpectedReviewCount}`,
      detail: "reviewer slots assigned",
    },
    {
      label: "Review completion",
      value: `${overviewCompletionPercent}%`,
      detail: `${overviewCompletedReviewCount} of ${overviewExpectedReviewCount} reviews submitted`,
    },
    {
      label: "Decisions",
      value: `${overviewDecisionCount}/${overviewRows.length}`,
      detail: "submissions decided",
    },
  ];
  const overviewAttentionSummary = {
    count: overviewAttentionCount,
    label:
      overviewAttentionCount === 1 ? "submission needs attention" : "submissions need attention",
    description:
      overviewAttentionCount === 0
        ? `${seed.progress.conflicts} conflicts declared. Coverage, review completion, and decisions are up to date.`
        : `${seed.progress.conflicts} conflicts declared. Use row actions to resolve coverage, review progress, conflicts, or decisions.`,
  };

  function openReviewersForSubmission(submissionId: string): void {
    const aggregate = roundAggregates.find((candidate) => candidate.id === submissionId);
    const roundId = aggregate?.roundId ?? selectedRound?.id ?? selectedRoundId;
    if (roundId.length > 0) setAssignmentTarget({ roundId, submissionId });
    setView("assignments");
  }

  function openDecisionForSubmission(submissionId: string): void {
    const aggregate = roundAggregates.find((candidate) => candidate.id === submissionId);
    const roundId = aggregate?.roundId ?? selectedRound?.id ?? selectedRoundId;
    if (roundId.length > 0) setSelectedRoundId(roundId);
    setDecisionQuery("");
    setDecisionFilter("all");
    setSelectedDecisionId(submissionId);
    setView("decisions");
  }

  async function exportResults(): Promise<void> {
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
          <h1>{seed.planName}</h1>
          <p className={styles.headerDescription}>
            Configure the plan, repair review coverage, follow up with reviewers, and record final
            program decisions.
          </p>
        </div>
        <div className={styles.headerSide}>
          <ReviewNavigation
            eventId={seed.eventId}
            mode="organizer"
            organizationId={organizationId}
          />
          <Badge variant={planStatusVariant(seed.status)}>{formatPlanStatus(seed.status)}</Badge>
        </div>
      </header>

      <div id="review-content" tabIndex={-1}>
        <Tabs
          value={view}
          onValueChange={(value) =>
            setView(value as "overview" | "setup" | "assignments" | "decisions")
          }
          className={styles.workspaceTabs}
        >
          <TabsList
            className={styles.workspaceTabList}
            variant="line"
            aria-label="Review plan sections"
          >
            {(
              [
                ["overview", "Overview"],
                ["assignments", "Reviewers"],
                ["setup", "Plan & rubric"],
                ["decisions", "Results"],
              ] as const
            ).map(([tabView, label]) => (
              <TabsTrigger
                id={`review-tab-${tabView}`}
                value={tabView}
                key={tabView}
                aria-controls={`review-panel-${tabView}`}
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent
            id="review-panel-overview"
            aria-labelledby="review-tab-overview"
            value="overview"
            className={styles.tabPanel}
          >
            <OrganizerReviewOverview
              planName={seed.planName}
              planStatusLabel={formatPlanStatus(seed.status)}
              description={`${selectedRound?.name ?? "Selected round"} has ${overviewRows.length} submission${overviewRows.length === 1 ? "" : "s"} in view.`}
              metrics={overviewMetrics}
              completionPercent={overviewCompletionPercent}
              attentionSummary={overviewAttentionSummary}
              rows={overviewRows}
              onManageReviewers={openReviewersForSubmission}
              onOpenPlan={() => setView("setup")}
              onOpenReviewers={() => setView("assignments")}
              onOpenDecisions={openDecisionForSubmission}
            />
          </TabsContent>

          <TabsContent
            id="review-panel-setup"
            aria-labelledby="review-tab-setup"
            value="setup"
            className={styles.tabPanel}
          >
            <div className={styles.viewIntro}>
              <p className={styles.sectionEyebrow}>Plan &amp; rubric</p>
              <h2>Configure the review plan</h2>
              <p>
                Set dates, rounds, rubrics, reviewer pools, and the fields reviewers can use before
                opening the plan.
              </p>
            </div>
            <OrganizerAuthoring
              seed={seed}
              baseUrl={baseUrl}
              reviewerMembers={reviewerMembers}
              reviewerMembersLoading={reviewerMembersLoading}
              reviewerMembersError={reviewerMembersError}
              onAuthoritativePlan={onAuthoritativePlan}
              onAssignmentsPersisted={onAssignmentsPersisted}
            />
          </TabsContent>

          <TabsContent
            id="review-panel-assignments"
            aria-labelledby="review-tab-assignments"
            value="assignments"
            className={styles.tabPanel}
          >
            <OrganizerAuthoring
              seed={seed}
              baseUrl={baseUrl}
              reviewerMembers={reviewerMembers}
              reviewerMembersLoading={reviewerMembersLoading}
              reviewerMembersError={reviewerMembersError}
              onAuthoritativePlan={onAuthoritativePlan}
              onAssignmentsPersisted={onAssignmentsPersisted}
              assignmentOnly
              assignmentTarget={assignmentTarget ?? undefined}
            />
            <div className={styles.viewIntro}>
              <p className={styles.sectionEyebrow}>Reviewers</p>
              <h2>Keep reviewer coverage moving</h2>
              <p>
                Monitor completion, send reminders, and remove assignments that need to be replaced.
              </p>
              <Button type="button" variant="outline" onClick={() => setView("assignments")}>
                Add or update assignments
              </Button>
            </div>
            {seed.assignments.length === 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>No reviewers assigned</CardTitle>
                  <CardDescription>
                    Choose a submission and verified reviewers to begin this review round.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button type="button" onClick={() => setView("assignments")}>
                    Assign reviewers
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                <ReviewerProgressDashboard
                  seed={seed}
                  baseUrl={baseUrl}
                  reviewerMembers={reviewerMembers}
                />
                <ReviewerAssignmentList
                  seed={seed}
                  baseUrl={baseUrl}
                  reviewerMembers={reviewerMembers}
                  onAssignmentsPersisted={onAssignmentsPersisted}
                />
              </>
            )}
          </TabsContent>

          <TabsContent
            id="review-panel-decisions"
            aria-labelledby="review-tab-decisions"
            value="decisions"
            className={styles.tabPanel}
          >
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
                      setAggregateSort((current) =>
                        current === "descending" ? "ascending" : "descending",
                      )
                    }
                    aria-label={`Sort aggregate score ${aggregateSort === "descending" ? "ascending" : "descending"}`}
                  >
                    Sort {aggregateSort === "descending" ? "ascending" : "descending"}
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => void exportResults()}
                  >
                    Export CSV
                  </Button>
                </div>
              </div>
              <div className={styles.formField}>
                <label htmlFor="organizer-aggregate-round">Aggregate round</label>
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
                  Exact round: {selectedRound?.name ?? selectedRoundId} · round revision{" "}
                  {selectedRound?.roundRevision ?? "unavailable"} · rubric revision{" "}
                  {selectedRound?.rubricRevision ?? "unavailable"}
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
                Scores shown below are only from {selectedRound?.name ?? selectedRoundId}, with
                round revision {selectedRound?.roundRevision ?? "unavailable"} and rubric revision{" "}
                {selectedRound?.rubricRevision ?? "unavailable"}.
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
                      setDecisionFilter(
                        event.currentTarget.value as "all" | "undecided" | DecisionStatus,
                      )
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
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={300}>All 300</option>
                  </select>
                </div>
                <p className={styles.toolbarMeta} role="status">
                  Showing {visibleDecisionRows.length} of {filteredDecisionRows.length} matching
                  submissions
                </p>
              </div>
              {exportMessage ? (
                <p className={styles.fieldHint} role="status">
                  {exportMessage}
                </p>
              ) : null}
              <div className={styles.tableWrap}>
                <table className={`${styles.dataTable} ${styles.decisionTable}`}>
                  <caption>
                    Submission aggregates for {selectedRound?.name ?? selectedRoundId} · round
                    revision {selectedRound?.roundRevision ?? "unavailable"} · rubric revision{" "}
                    {selectedRound?.rubricRevision ?? "unavailable"}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Submission</th>
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
                    {visibleDecisionRows.map((aggregate) => (
                      <tr key={aggregate.id}>
                        <th scope="row" data-label="Submission">
                          <strong>{aggregate.title}</strong>
                          <span className={styles.mutedLabel}>{aggregate.reference}</span>
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
                          {aggregate.abstentions > 0
                            ? ` · ${aggregate.abstentions} abstention`
                            : ""}
                        </td>
                        <td data-label="Decision">
                          <div className={styles.tableAction}>
                            {(() => {
                              const decision = seed.decisionBySubmission[aggregate.id];
                              return decision === undefined ? (
                                <span className={styles.mutedLabel}>Not decided</span>
                              ) : (
                                <DecisionStatusBadge status={decision.status} />
                              );
                            })()}
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
                    ))}
                  </tbody>
                </table>
              </div>
              <p className={styles.tableNote}>
                Scores count only after a reviewer confirms or edits them.
              </p>
              {visibleDecisionRows.length === 0 ? (
                <p className={styles.emptyText}>No submissions match these decision filters.</p>
              ) : null}
              {selectedAggregate ? (
                <div
                  ref={decisionEditorRef}
                  id={`decision-editor-${selectedAggregate.id}`}
                  className={styles.selectedDecisionEditor}
                  tabIndex={-1}
                >
                  <DecisionEditor
                    aggregate={selectedAggregate}
                    baseUrl={baseUrl}
                    planId={seed.planId}
                    decision={seed.decisionBySubmission[selectedAggregate.id]}
                  />
                </div>
              ) : (
                <p className={styles.fieldHint}>
                  Choose Review in the table to open one decision editor.
                </p>
              )}
            </section>
          </TabsContent>
        </Tabs>
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
  const [reviewerQuery, setReviewerQuery] = useState("");
  const [reviewerRowLimit, setReviewerRowLimit] = useState(5);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"info" | "success" | "error">("info");
  const [deliveryFacts, setDeliveryFacts] = useState<readonly ReminderDeliveryFact[]>([]);
  const [busy, setBusy] = useState(false);
  const requestPresentation = reminderRequestPresentation(busy);
  const outstanding = seed.progress.reviewers.filter((reviewer) => reviewer.outstanding > 0);
  const normalizedReviewerQuery = reviewerQuery.trim().toLowerCase();
  const filteredReviewers = seed.progress.reviewers.filter((reviewer) => {
    if (normalizedReviewerQuery.length === 0) return true;
    const round = seed.rounds.find((candidate) => candidate.id === reviewer.roundId);
    return [reviewerDisplayLabel(reviewer.reviewerId, reviewerMembers), round?.name]
      .filter((value): value is string => value !== undefined)
      .some((value) => value.toLowerCase().includes(normalizedReviewerQuery));
  });
  const visibleReviewers = filteredReviewers.slice(0, reviewerRowLimit);
  const visibleOutstanding = visibleReviewers.filter((reviewer) => reviewer.outstanding > 0);
  const reviewerLabel = (reviewerId: string): string =>
    reviewerDisplayLabel(reviewerId, reviewerMembers);
  const selectedOutstanding = outstanding.filter((reviewer) =>
    selected.has(`${reviewer.reviewerId}\u0000${reviewer.roundId}`),
  );
  const selectedVisibleOutstanding = visibleOutstanding.filter((reviewer) =>
    selected.has(`${reviewer.reviewerId}\u0000${reviewer.roundId}`),
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadReminderDeliveryFacts(baseUrl, seed.planId, (input, init) =>
      fetch(input, { ...init, signal: controller.signal }),
    )
      .then((facts) => setDeliveryFacts(facts))
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setMessageTone("error");
          setMessage(
            reason instanceof Error
              ? reason.message
              : "Reminder delivery status could not be loaded.",
          );
        }
      });
    return () => controller.abort();
  }, [baseUrl, seed.planId]);

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
    if (selectedOutstanding.length === 0) {
      setMessageTone("error");
      setMessage("Select at least one reviewer with outstanding assignments.");
      return;
    }
    setBusy(true);
    setMessageTone("info");
    setMessage(
      `Sending reminder to ${selectedOutstanding.length} selected reviewer${selectedOutstanding.length === 1 ? "" : "s"}… Delivery status will appear here when the request completes.`,
    );
    try {
      const byRound = new Map<string, string[]>();
      const responseFacts: ReminderDeliveryFact[] = [];
      for (const reviewer of selectedOutstanding) {
        const ids = byRound.get(reviewer.roundId) ?? [];
        if (!ids.includes(reviewer.reviewerId)) ids.push(reviewer.reviewerId);
        byRound.set(reviewer.roundId, ids);
      }
      for (const [roundId, reviewerIds] of byRound) {
        const reviewerIdsToSend = reminderReviewerIdsRequiringSend(
          deliveryFacts,
          roundId,
          reviewerIds,
        );
        const reusableFacts = deliveryFacts.filter(
          (fact) =>
            fact.roundId === roundId &&
            typeof fact.reviewerId === "string" &&
            reviewerIds.includes(fact.reviewerId) &&
            fact.status !== undefined &&
            ["queued", "processing", "delivered"].includes(fact.status.toLowerCase()),
        );
        responseFacts.push(...reusableFacts);
        if (reviewerIdsToSend.length === 0) continue;
        const result = await evaluationRequest<ReminderDeliveryResponse>(
          baseUrl,
          `/plans/${encodeURIComponent(seed.planId)}/reminders`,
          {
            method: "POST",
            body: JSON.stringify({ roundId, reviewerIds: [...reviewerIdsToSend].sort() }),
          },
        );
        responseFacts.push(...(result.facts ?? []));
      }
      setDeliveryFacts((current) => {
        const responseIds = new Set(responseFacts.map((fact) => fact.outboxId));
        return [...responseFacts, ...current.filter((fact) => !responseIds.has(fact.outboxId))];
      });
      setMessage(
        [...byRound.entries()]
          .map(([roundId, reviewerIds]) => {
            const roundName = seed.rounds.find((round) => round.id === roundId)?.name ?? roundId;
            return `${roundName}: ${reminderDeliveryForSelection(
              responseFacts,
              roundId,
              reviewerIds,
            )}`;
          })
          .join(" "),
      );
      setMessageTone("success");
      setSelected(new Set<string>());
    } catch (reason: unknown) {
      setMessageTone("error");
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
    <section
      className={styles.section}
      aria-labelledby="reviewer-progress-heading"
      aria-busy={requestPresentation.ariaBusy}
    >
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.sectionEyebrow}>Per-reviewer monitoring</p>
          <h2 id="reviewer-progress-heading">Reviewer progress dashboard</h2>
        </div>
        <span className={styles.mutedLabel}>{outstanding.length} with outstanding reviews</span>
      </div>
      <div className={styles.collectionToolbar}>
        <div className={styles.formField}>
          <label htmlFor="reviewer-progress-search">Find a reviewer</label>
          <input
            id="reviewer-progress-search"
            type="search"
            value={reviewerQuery}
            onChange={(event) => setReviewerQuery(event.currentTarget.value)}
            placeholder="Search reviewer or round"
          />
        </div>
        <div className={styles.formField}>
          <label htmlFor="reviewer-progress-limit">Rows shown</label>
          <select
            id="reviewer-progress-limit"
            value={reviewerRowLimit}
            onChange={(event) => setReviewerRowLimit(Number(event.currentTarget.value))}
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={25}>25</option>
          </select>
        </div>
        <p className={styles.toolbarMeta} role="status">
          Showing {visibleReviewers.length} of {filteredReviewers.length} matching reviewers
        </p>
      </div>
      <div className={styles.tableWrap}>
        <table className={`${styles.dataTable} ${styles.reviewerProgressTable}`}>
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
            {visibleReviewers.map((reviewer) => {
              const key = `${reviewer.reviewerId}\u0000${reviewer.roundId}`;
              const round = seed.rounds.find((candidate) => candidate.id === reviewer.roundId);
              return (
                <tr key={key}>
                  <td data-label="Select">
                    <Field orientation="horizontal" className={styles.tableCheckboxField}>
                      <Checkbox
                        id={`reminder-${key.replaceAll("\u0000", "-")}`}
                        aria-label={`Select ${reviewerLabel(reviewer.reviewerId)} reminder`}
                        checked={selected.has(key)}
                        disabled={reviewer.outstanding === 0}
                        onCheckedChange={() => toggle(reviewer)}
                      />
                      <FieldLabel
                        htmlFor={`reminder-${key.replaceAll("\u0000", "-")}`}
                        className={styles.srOnly}
                      >
                        Select {reviewerLabel(reviewer.reviewerId)} reminder
                      </FieldLabel>
                    </Field>
                  </td>
                  <th scope="row" data-label="Reviewer">
                    {reviewerLabel(reviewer.reviewerId)}
                  </th>
                  <td data-label="Round">{round?.name ?? "Round unavailable"}</td>
                  <td data-label="Assigned">{reviewer.assigned}</td>
                  <td data-label="Complete">{reviewer.submitted}</td>
                  <td data-label="Outstanding">{reviewer.outstanding}</td>
                  <td data-label="Completion">
                    {normalizeCompletionPercent(reviewer.completionPercent)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {seed.progress.reviewers.length === 0 ? (
        <p className={styles.fieldHint}>No reviewer assignments have been persisted yet.</p>
      ) : null}
      {deliveryFacts.length > 0 ? (
        <section aria-label="Reviewer reminder delivery status">
          <p className={styles.fieldHint}>Durable reminder delivery status</p>
          <ul>
            {deliveryFacts.map((fact) => (
              <li
                key={fact.outboxId ?? `${fact.reviewerId ?? "reviewer"}:${fact.roundId ?? "all"}`}
              >
                {reviewerLabel(fact.reviewerId ?? "Unknown reviewer")}: {fact.status ?? "unknown"}
                {(fact.completedAt ?? fact.updatedAt ?? fact.createdAt)
                  ? ` at ${fact.completedAt ?? fact.updatedAt ?? fact.createdAt}`
                  : ""}
                {fact.lastErrorCode ? ` (${fact.lastErrorCode})` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className={styles.confirmationActions}>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={() =>
            setSelected(
              new Set(
                selectedVisibleOutstanding.length === visibleOutstanding.length
                  ? []
                  : visibleOutstanding.map(
                      (reviewer) => `${reviewer.reviewerId}\u0000${reviewer.roundId}`,
                    ),
              ),
            )
          }
          disabled={busy || visibleOutstanding.length === 0}
        >
          {selectedVisibleOutstanding.length === visibleOutstanding.length
            ? "Clear reminder selection"
            : "Select shown outstanding"}
        </button>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={() => void sendReminders()}
          disabled={busy || selectedOutstanding.length === 0}
        >
          {requestPresentation.action === "pending"
            ? "Sending reminder…"
            : "Send reminder to selected reviewers"}
        </button>
      </div>
      {message ? (
        <p
          className={messageTone === "error" ? styles.formError : styles.submittedMessage}
          role={messageTone === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}

export function reviewerIdsForAssignmentTarget(
  assignments: readonly ReviewPlanAssignment[],
  roundId: string,
  submissionId: string,
  excludedReviewerId?: string,
): readonly string[] {
  return [
    ...new Set(
      assignments
        .filter(
          (assignment) =>
            assignment.roundId === roundId &&
            assignment.submissionId === submissionId &&
            assignment.status !== "abstained" &&
            assignment.status !== "superseded" &&
            assignment.reviewerId !== excludedReviewerId,
        )
        .map((assignment) => assignment.reviewerId),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

function ReviewerAssignmentList({
  seed,
  baseUrl,
  reviewerMembers,
  onAssignmentsPersisted,
}: Readonly<{
  seed: ReviewPlanSeed;
  baseUrl: string;
  reviewerMembers: readonly OrganizationMember[];
  onAssignmentsPersisted?: (() => Promise<void>) | undefined;
}>) {
  const [busyAssignmentId, setBusyAssignmentId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [replacementReviewerByAssignment, setReplacementReviewerByAssignment] = useState<
    Readonly<Record<string, string>>
  >({});
  const [replacementReasonByAssignment, setReplacementReasonByAssignment] = useState<
    Readonly<Record<string, string>>
  >({});
  const [assignmentQuery, setAssignmentQuery] = useState("");
  const [assignmentStatusFilter, setAssignmentStatusFilter] = useState<
    "all" | ReviewPlanAssignment["status"]
  >("all");
  const [assignmentRowLimit, setAssignmentRowLimit] = useState(5);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const assignmentEditorRef = useRef<HTMLElement | null>(null);
  const submissionById = new Map(seed.aggregates.map((aggregate) => [aggregate.id, aggregate]));
  const roundById = new Map(seed.rounds.map((round) => [round.id, round]));
  const verifiedReviewerIds = new Set(reviewerMembers.map((member) => member.userId));
  const normalizedAssignmentQuery = assignmentQuery.trim().toLowerCase();
  const filteredAssignments = seed.assignments.filter((assignment) => {
    if (assignmentStatusFilter !== "all" && assignment.status !== assignmentStatusFilter) {
      return false;
    }
    if (normalizedAssignmentQuery.length === 0) return true;
    const aggregate = submissionById.get(assignment.submissionId);
    const reviewer = reviewerDisplayLabel(assignment.reviewerId, reviewerMembers);
    const round = roundById.get(assignment.roundId);
    return [aggregate?.title, aggregate?.reference, reviewer, round?.name]
      .filter((value): value is string => value !== undefined)
      .some((value) => value.toLowerCase().includes(normalizedAssignmentQuery));
  });
  const visibleAssignments = filteredAssignments.slice(0, assignmentRowLimit);
  const selectedAssignment =
    seed.assignments.find((assignment) => assignment.id === selectedAssignmentId) ?? null;
  const selectedAggregate =
    selectedAssignment === null ? undefined : submissionById.get(selectedAssignment.submissionId);
  const selectedRound =
    selectedAssignment === null ? undefined : roundById.get(selectedAssignment.roundId);
  const selectedReviewer =
    selectedAssignment === null
      ? null
      : reviewerDisplayLabel(selectedAssignment.reviewerId, reviewerMembers);
  const selectedProtectedHistory =
    selectedAssignment?.status === "abstained" || selectedAssignment?.status === "superseded";
  useEffect(() => {
    if (selectedAssignmentId === null) return;
    assignmentEditorRef.current?.focus();
    assignmentEditorRef.current?.scrollIntoView({ block: "start" });
  }, [selectedAssignmentId]);

  async function replaceAssignment(assignment: ReviewPlanAssignment): Promise<void> {
    const replacementReviewerId = replacementReviewerByAssignment[assignment.id]?.trim() ?? "";
    const reason = replacementReasonByAssignment[assignment.id]?.trim() ?? "";
    if (!verifiedReviewerIds.has(replacementReviewerId)) {
      setMessage("Choose an active, verified organization member as the replacement reviewer.");
      return;
    }
    if (reason.length === 0) {
      setMessage("A non-empty replacement reason is required.");
      return;
    }
    if (assignment.status === "superseded" || assignment.status === "abstained") {
      setMessage("Protected assignment history cannot be mutated.");
      return;
    }
    if (busyAssignmentId !== null) return;
    setBusyAssignmentId(assignment.id);
    setMessage(null);
    try {
      const result = await replaceSingleReviewAssignment(baseUrl, seed.planId, assignment.id, {
        replacementReviewerId,
        expectedVersion: assignment.version,
        reason,
      });
      setMessage(
        `Assignment ${result.replacedAssignment.id} superseded by ${result.successorAssignment.id}. Lineage predecessor: ${result.successorAssignment.predecessorAssignmentId ?? result.replacedAssignment.id}; successor: ${result.replacedAssignment.successorAssignmentId ?? result.successorAssignment.id}. History preserved: ${result.history.length}.`,
      );
      setSelectedAssignmentId(null);
      await onAssignmentsPersisted?.();
    } catch (reasonError: unknown) {
      setMessage(
        reasonError instanceof Error
          ? reasonError.message
          : "The reviewer assignment could not be replaced.",
      );
    } finally {
      setBusyAssignmentId(null);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="current-assignments-heading">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.sectionEyebrow}>Current assignments and lineage</p>
          <h2 id="current-assignments-heading">Reviewer assignment history</h2>
        </div>
        <span className={styles.mutedLabel}>{seed.assignments.length} records</span>
      </div>
      <div className={styles.collectionToolbar}>
        <div className={styles.formField}>
          <label htmlFor="assignment-search">Find an assignment</label>
          <input
            id="assignment-search"
            type="search"
            value={assignmentQuery}
            onChange={(event) => setAssignmentQuery(event.currentTarget.value)}
            placeholder="Search submission, reviewer, reference, or round"
          />
        </div>
        <div className={styles.formField}>
          <label htmlFor="assignment-status-filter">Assignment status</label>
          <select
            id="assignment-status-filter"
            value={assignmentStatusFilter}
            onChange={(event) =>
              setAssignmentStatusFilter(
                event.currentTarget.value as "all" | ReviewPlanAssignment["status"],
              )
            }
          >
            <option value="all">All statuses</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In progress</option>
            <option value="submitted">Submitted</option>
            <option value="abstained">Conflict / recused</option>
            <option value="superseded">Superseded</option>
          </select>
        </div>
        <div className={styles.formField}>
          <label htmlFor="assignment-row-limit">Rows shown</label>
          <select
            id="assignment-row-limit"
            value={assignmentRowLimit}
            onChange={(event) => setAssignmentRowLimit(Number(event.currentTarget.value))}
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
        <p className={styles.toolbarMeta} role="status">
          Showing {visibleAssignments.length} of {filteredAssignments.length} matching assignments
        </p>
      </div>
      {seed.assignments.length === 0 ? (
        <p className={styles.fieldHint}>No reviewer assignments have been persisted yet.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={`${styles.dataTable} ${styles.assignmentTable}`}>
            <caption>Active reviewer assignments and protected history</caption>
            <thead>
              <tr>
                <th scope="col">Submission</th>
                <th scope="col">Reviewer</th>
                <th scope="col">Round</th>
                <th scope="col">Status / lineage</th>
                <th scope="col">Atomic replacement</th>
              </tr>
            </thead>
            <tbody>
              {visibleAssignments.map((assignment) => {
                const aggregate = submissionById.get(assignment.submissionId);
                const round = roundById.get(assignment.roundId);
                const reviewer = reviewerDisplayLabel(assignment.reviewerId, reviewerMembers);
                const protectedHistory =
                  assignment.status === "abstained" || assignment.status === "superseded";
                const submissionTitle = aggregate?.title ?? "Untitled submission";
                return (
                  <tr key={assignment.id}>
                    <th scope="row" data-label="Submission">
                      <strong>{submissionTitle}</strong>
                      <span>{aggregate?.reference ?? "Submission"}</span>
                    </th>
                    <td data-label="Reviewer">
                      <strong>{reviewer}</strong>
                    </td>
                    <td data-label="Round">{round?.name ?? "Round unavailable"}</td>
                    <td data-label="Status">
                      <AssignmentStatusBadge status={assignment.status} />
                      {assignment.predecessorAssignmentId || assignment.successorAssignmentId ? (
                        <span className={styles.fieldHint}>
                          predecessor: {assignment.predecessorAssignmentId ?? "none"} · successor:{" "}
                          {assignment.successorAssignmentId ?? "none"}
                        </span>
                      ) : null}
                      {assignment.supersededReason ? (
                        <span className={styles.fieldHint}>
                          Reason: {assignment.supersededReason}
                        </span>
                      ) : null}
                    </td>
                    <td data-label="History">
                      <button
                        className={styles.secondaryButton}
                        type="button"
                        onClick={() =>
                          setSelectedAssignmentId((current) =>
                            current === assignment.id ? null : assignment.id,
                          )
                        }
                        aria-expanded={selectedAssignmentId === assignment.id}
                        aria-controls={
                          selectedAssignmentId === assignment.id
                            ? `assignment-editor-${assignment.id}`
                            : undefined
                        }
                      >
                        {selectedAssignmentId === assignment.id
                          ? "Hide assignment"
                          : protectedHistory
                            ? "View assignment"
                            : "Manage assignment"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {selectedAssignment ? (
        <section
          ref={assignmentEditorRef}
          id={`assignment-editor-${selectedAssignment.id}`}
          className={styles.assignmentManagementEditor}
          aria-labelledby="assignment-editor-heading"
          tabIndex={-1}
        >
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionEyebrow}>Selected assignment</p>
              <h3 id="assignment-editor-heading">
                {selectedAggregate?.title ?? "Untitled submission"}
              </h3>
            </div>
            <AssignmentStatusBadge status={selectedAssignment.status} />
          </div>
          <dl className={styles.assignmentEditorSummary}>
            <div>
              <dt>Reviewer</dt>
              <dd>{selectedReviewer}</dd>
            </div>
            <div>
              <dt>Round</dt>
              <dd>{selectedRound?.name ?? "Round unavailable"}</dd>
            </div>
            <div>
              <dt>Reference</dt>
              <dd>{selectedAggregate?.reference ?? "Submission"}</dd>
            </div>
          </dl>
          {selectedProtectedHistory ? (
            <p className={styles.fieldHint}>
              This {selectedAssignment.status} record is protected history and cannot be replaced.
            </p>
          ) : (
            <div className={styles.assignmentReplacementForm}>
              <div className={styles.formField}>
                <label htmlFor={`replacement-reviewer-${selectedAssignment.id}`}>
                  Replacement reviewer
                </label>
                <select
                  id={`replacement-reviewer-${selectedAssignment.id}`}
                  value={replacementReviewerByAssignment[selectedAssignment.id] ?? ""}
                  onChange={(event) =>
                    setReplacementReviewerByAssignment((current) => ({
                      ...current,
                      [selectedAssignment.id]: event.currentTarget.value,
                    }))
                  }
                  disabled={busyAssignmentId !== null}
                >
                  <option value="">Choose verified reviewer</option>
                  {reviewerMembers
                    .filter((member) => member.userId !== selectedAssignment.reviewerId)
                    .map((member) => (
                      <option value={member.userId} key={member.userId}>
                        {member.name ?? member.email} · {member.email}
                      </option>
                    ))}
                </select>
              </div>
              <div className={styles.formField}>
                <label htmlFor={`replacement-reason-${selectedAssignment.id}`}>
                  Replacement reason
                </label>
                <textarea
                  id={`replacement-reason-${selectedAssignment.id}`}
                  rows={3}
                  placeholder="Explain why this assignment must move."
                  value={replacementReasonByAssignment[selectedAssignment.id] ?? ""}
                  onChange={(event) =>
                    setReplacementReasonByAssignment((current) => ({
                      ...current,
                      [selectedAssignment.id]: event.currentTarget.value,
                    }))
                  }
                  disabled={busyAssignmentId !== null}
                />
              </div>
              <button
                className={styles.dangerButton}
                type="button"
                onClick={() => void replaceAssignment(selectedAssignment)}
                disabled={busyAssignmentId !== null}
              >
                {busyAssignmentId === selectedAssignment.id
                  ? "Replacing reviewer…"
                  : "Replace reviewer"}
              </button>
              <p className={styles.fieldHint}>
                The old assignment remains in protected history and the replacement is recorded
                atomically.
              </p>
            </div>
          )}
        </section>
      ) : null}
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
        <Field orientation="horizontal" className={styles.checkboxField}>
          <Checkbox
            id={`${aggregate.id}-confirm`}
            checked={confirmed}
            onCheckedChange={(checked) => setConfirmed(checked === true)}
            required
          />
          <FieldContent>
            <FieldLabel htmlFor={`${aggregate.id}-confirm`}>
              I confirm this is a human organizer decision, not an AI decision.
            </FieldLabel>
            <FieldDescription>This confirmation is required before saving.</FieldDescription>
          </FieldContent>
        </Field>
        {error ? (
          <p className={styles.formError} role="alert">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p className={styles.submittedMessage} role="status">
            Decision saved. Submitter notification queued.
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
  const pendingAutosaveAssignmentRef = useRef<string | null>(null);
  const [pendingAutosaveAssignmentId, setPendingAutosaveAssignmentId] = useState<string | null>(
    null,
  );
  const [recusedIds, setRecusedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [submittedAtById, setSubmittedAtById] = useState<Readonly<Record<string, string>>>({});
  const [draftsById, setDraftsById] = useState<Readonly<Record<string, EvaluatorDraftSnapshot>>>(
    {},
  );
  const [statusView, setStatusView] = useState<ReviewerInboxStatusView>("all");
  const [filters, setFilters] = useState<ReviewerInboxFilters>(emptyReviewerInboxFilters);
  const [groupBy, setGroupBy] = useState<ReviewerInboxGroupBy>("event");
  const queueActionRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const detailHeadingRef = useRef<HTMLElement | null>(null);
  const restoreQueueFocusIdRef = useRef<string | null>(null);
  const normalizedAssignments = entries.map(({ assignment }) => ({
    ...assignment,
    organizationId: assignment.organizationId ?? assignment.eventId,
    organizationName:
      assignment.organizationName ?? assignment.organizationId ?? assignment.eventName,
    eventName: assignment.eventName || assignment.eventId,
    roundId: assignment.round.id,
    roundName: assignment.round.name,
    track: assignment.track ?? null,
    dueAt: assignment.dueAt ?? assignment.round.closesAt ?? null,
    assignmentStatus: assignment.assignmentStatus ?? "assigned",
  }));
  const inboxItems = reviewerInboxItems(
    normalizedAssignments,
    recusedIds,
    submittedAtById,
    new Date(),
  );
  const filteredItems = filterReviewerInbox(inboxItems, statusView, filters);
  const groupedItems = groupReviewerInbox(filteredItems, groupBy);
  const visibleEntries = groupedItems.flatMap((group) =>
    group.items.map(({ assignment }, index) => ({
      assignment,
      groupLabel: group.label,
      groupCount: group.items.length,
      groupStart: index === 0,
    })),
  );
  const selectedVisible = visibleEntries.some((entry) => entry.assignment.id === selectedId);
  const navigationEntries = selectedVisible
    ? visibleEntries
    : inboxItems.map(({ assignment }) => ({ assignment }));
  const selectedBase =
    inboxItems.find(({ assignment }) => assignment.id === selectedId)?.assignment ?? null;
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
      : navigationEntries.findIndex((entry) => entry.assignment.id === selectedBase.id);
  const statusCounts = {
    all: inboxItems.length,
    needsReview: inboxItems.filter(({ status }) => status === "assigned").length,
    inProgress: inboxItems.filter(({ status }) => status === "in_progress").length,
    submitted: inboxItems.filter(({ status }) => status === "submitted").length,
  };
  const organizationOptions = [
    ...new Map(
      inboxItems.map(({ assignment }) => [assignment.organizationId, assignment.organizationName]),
    ),
  ].sort((left, right) => left[1].localeCompare(right[1]));
  const eventOptions = [
    ...new Map(
      inboxItems
        .filter(
          ({ assignment }) =>
            filters.organizationId === "all" ||
            assignment.organizationId === filters.organizationId,
        )
        .map(({ assignment }) => [assignment.eventId, assignment.eventName]),
    ),
  ].sort((left, right) => left[1].localeCompare(right[1]));
  const roundOptions = [
    ...new Map(
      inboxItems
        .filter(
          ({ assignment }) =>
            (filters.organizationId === "all" ||
              assignment.organizationId === filters.organizationId) &&
            (filters.eventId === "all" || assignment.eventId === filters.eventId),
        )
        .map(({ assignment, roundKey }) => [
          roundKey,
          `${assignment.eventName} · ${assignment.roundName}`,
        ]),
    ),
  ].sort((left, right) => left[1].localeCompare(right[1]));
  const trackOptions = [
    ...new Set(
      inboxItems.flatMap(({ assignment }) => (assignment.track === null ? [] : [assignment.track])),
    ),
  ].sort((left, right) => left.localeCompare(right));
  const filtersActive =
    statusView !== "all" ||
    filters.organizationId !== "all" ||
    filters.eventId !== "all" ||
    filters.roundKey !== "all" ||
    filters.due !== "all" ||
    filters.track !== "all";
  useEffect(() => {
    if (selectedId !== null) {
      detailHeadingRef.current?.focus();
      detailHeadingRef.current?.scrollIntoView({ block: "start" });
      return;
    }
    const restoreId = restoreQueueFocusIdRef.current;
    if (restoreId === null) return;
    const action = queueActionRefs.current[restoreId];
    action?.focus();
    action?.scrollIntoView({ block: "center" });
    restoreQueueFocusIdRef.current = null;
  }, [selectedId]);
  function updateAutosavePending(assignmentId: string, pending: boolean): void {
    if (pending) {
      pendingAutosaveAssignmentRef.current = assignmentId;
      setPendingAutosaveAssignmentId(assignmentId);
      return;
    }
    if (pendingAutosaveAssignmentRef.current === assignmentId) {
      pendingAutosaveAssignmentRef.current = null;
    }
    setPendingAutosaveAssignmentId((current) => (current === assignmentId ? null : current));
  }

  function selectAssignment(nextAssignmentId: string | null): boolean {
    if (
      reviewerSelectionBlocked(pendingAutosaveAssignmentRef.current, selectedId, nextAssignmentId)
    ) {
      return false;
    }
    setSelectedId(nextAssignmentId);
    return true;
  }

  return (
    <div className={styles.workspace} id="review-workspace">
      <a
        className={styles.skipLink}
        href={selected ? `#scorecard-${encodeURIComponent(selected.id)}` : "#review-content"}
      >
        {selected ? "Skip to open scorecard" : "Skip to reviewer queue"}
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

      <div
        id="review-content"
        className={styles.reviewerWorkbench}
        data-detail-open={selected !== null}
      >
        <section
          className={`${styles.section} ${styles.reviewerQueuePanel}`}
          aria-labelledby="review-queue-heading"
        >
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.sectionEyebrow}>Assigned work</p>
              <h2 id="review-queue-heading">Submissions to review</h2>
              <p className={styles.sectionIntro}>
                Open one scorecard at a time. Drafts stay saved while you move through the queue.
              </p>
            </div>
            <span className={styles.mutedLabel}>
              {filteredItems.length} of {inboxItems.length}
            </span>
          </div>
          <fieldset className={styles.reviewerStatusViews}>
            <legend className={styles.srOnly}>Review status views</legend>
            {[
              ["all", "All", statusCounts.all],
              ["needs-review", "Needs review", statusCounts.needsReview],
              ["in-progress", "In progress", statusCounts.inProgress],
              ["submitted", "Submitted", statusCounts.submitted],
            ].map(([value, label, count]) => (
              <Button
                aria-pressed={statusView === value}
                key={String(value)}
                size="sm"
                type="button"
                variant={statusView === value ? "default" : "outline"}
                onClick={() => setStatusView(value as ReviewerInboxStatusView)}
              >
                {label}
                <Badge variant={statusView === value ? "secondary" : "outline"}>{count}</Badge>
              </Button>
            ))}
          </fieldset>
          <fieldset className={styles.reviewerFilterBar}>
            <legend className={styles.srOnly}>Reviewer inbox filters</legend>
            <label className={styles.reviewerFilterField}>
              <span>Organization</span>
              <select
                value={filters.organizationId}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    organizationId: event.target.value,
                    eventId: "all",
                    roundKey: "all",
                  }))
                }
              >
                <option value="all">All organizations</option>
                {organizationOptions.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.reviewerFilterField}>
              <span>Event</span>
              <select
                value={filters.eventId}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    eventId: event.target.value,
                    roundKey: "all",
                  }))
                }
              >
                <option value="all">All events</option>
                {eventOptions.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.reviewerFilterField}>
              <span>Round</span>
              <select
                value={filters.roundKey}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, roundKey: event.target.value }))
                }
              >
                <option value="all">All rounds</option>
                {roundOptions.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.reviewerFilterField}>
              <span>Due</span>
              <select
                value={filters.due}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    due: event.target.value as ReviewerInboxFilters["due"],
                  }))
                }
              >
                <option value="all">Any time</option>
                <option value="overdue">Overdue</option>
                <option value="today">Today</option>
                <option value="next-7-days">Next 7 days</option>
                <option value="later">Later</option>
                <option value="none">No deadline</option>
              </select>
            </label>
            <label className={styles.reviewerFilterField}>
              <span>Track</span>
              <select
                value={filters.track}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, track: event.target.value }))
                }
              >
                <option value="all">All tracks</option>
                <option value="none">No track</option>
                {trackOptions.map((track) => (
                  <option key={track} value={track}>
                    {track}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.reviewerFilterField}>
              <span>Group by</span>
              <select
                value={groupBy}
                onChange={(event) => setGroupBy(event.target.value as ReviewerInboxGroupBy)}
              >
                <option value="event">Event</option>
                <option value="organization">Organization</option>
                <option value="round">Round</option>
                <option value="due">Due date</option>
              </select>
            </label>
            {filtersActive ? (
              <Button
                className={styles.reviewerClearFilters}
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => {
                  setStatusView("all");
                  setFilters(emptyReviewerInboxFilters);
                }}
              >
                Clear filters
              </Button>
            ) : null}
          </fieldset>
          {inboxItems.length === 0 ? (
            <div className={styles.emptyQueue} role="status">
              <h3>No assigned reviews yet</h3>
              <p>
                This queue is assignment-driven. An organizer must assign a submission before it
                appears here.
              </p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className={styles.filteredQueueEmpty} role="status">
              <h3>No reviews match these filters</h3>
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={() => {
                  setStatusView("all");
                  setFilters(emptyReviewerInboxFilters);
                }}
              >
                Clear filters
              </Button>
            </div>
          ) : (
            <div className={styles.reviewerQueueList}>
              {visibleEntries.map(({ assignment, groupCount, groupLabel, groupStart }) => {
                const isSelected = assignment.id === selectedId;
                const isSubmitted =
                  assignment.submittedAt !== null || submittedAtById[assignment.id] !== undefined;
                const navigationBlocked = reviewerSelectionBlocked(
                  pendingAutosaveAssignmentId,
                  selectedId,
                  assignment.id,
                );
                const actionLabel = isSubmitted
                  ? "View review"
                  : assignment.assignmentStatus === "in_progress"
                    ? "Resume review"
                    : "Start review";
                return (
                  <article
                    className={`${styles.reviewerQueueCard} ${
                      isSelected ? styles.reviewerQueueCardSelected : ""
                    }`}
                    key={assignment.id}
                  >
                    {groupStart ? (
                      <div className={styles.reviewerGroupHeader}>
                        <strong>{groupLabel}</strong>
                        <span>{groupCount}</span>
                      </div>
                    ) : null}
                    <div className={styles.reviewerQueueRow}>
                      <div className={styles.reviewerQueueContent}>
                        <div className={styles.reviewerQueueSummary}>
                          <div>
                            <p className={styles.sectionEyebrow}>
                              {groupBy === "event"
                                ? assignment.planName
                                : `${assignment.eventName} · ${assignment.planName}`}
                            </p>
                            <h3>{assignment.title}</h3>
                          </div>
                          <span className={styles.mutedLabel}>{assignment.reference}</span>
                        </div>
                        <div className={styles.reviewerQueueMeta}>
                          <span>{assignment.round.name}</span>
                          <span>Due {assignment.round.closesAt}</span>
                        </div>
                      </div>
                      <div className={styles.reviewerQueueFooter}>
                        <AssignmentStatusBadge
                          status={isSubmitted ? "submitted" : assignment.assignmentStatus}
                        />
                        <button
                          ref={(element) => {
                            queueActionRefs.current[assignment.id] = element;
                          }}
                          className={styles.reviewerQueueAction}
                          data-action-kind={isSubmitted ? "secondary" : "primary"}
                          type="button"
                          onClick={() => {
                            restoreQueueFocusIdRef.current = assignment.id;
                            selectAssignment(assignment.id);
                          }}
                          aria-label={`Open scorecard for ${assignment.title}`}
                          aria-pressed={isSelected}
                          disabled={navigationBlocked}
                        >
                          {isSelected ? "Review open" : actionLabel}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {selected ? (
          <section
            className={`${styles.section} ${styles.reviewerDetailPanel}`}
            id={`scorecard-${encodeURIComponent(selected.id)}`}
            aria-label={`Review ${selected.title}`}
            ref={detailHeadingRef}
            tabIndex={-1}
          >
            <div className={styles.reviewerDetailToolbar}>
              <span>
                {selected.eventName} · {selected.round.name}
              </span>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => {
                  restoreQueueFocusIdRef.current = selected.id;
                  selectAssignment(null);
                }}
                disabled={reviewerSelectionBlocked(pendingAutosaveAssignmentId, selectedId, null)}
              >
                Back to reviewer queue
              </button>
            </div>
            <EvaluatorWorkspace
              key={selected.id}
              assignment={selected}
              baseUrl={baseUrl}
              embedded
              submittedOverride={submittedAtById[selected.id] !== undefined}
              queuePosition={{ position: selectedIndex + 1, total: navigationEntries.length }}
              onNext={
                selectedIndex >= 0 && selectedIndex < navigationEntries.length - 1
                  ? () => {
                      selectAssignment(navigationEntries[selectedIndex + 1]?.assignment.id ?? null);
                    }
                  : undefined
              }
              onDraftChange={(snapshot) =>
                setDraftsById((current) => ({ ...current, [selected.id]: snapshot }))
              }
              onAutosavePendingChange={(pending) => updateAutosavePending(selected.id, pending)}
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
    </div>
  );
}
function EvaluatorWorkspace({
  assignment,
  baseUrl,
  embedded = false,
  onAbstain,
  onSubmitted,
  submittedOverride = false,
  queuePosition,
  onNext,
  onDraftChange,
  onAutosavePendingChange,
}: Readonly<{
  assignment: EvaluatorAssignment;
  baseUrl: string;
  embedded?: boolean | undefined;
  onAbstain?: (() => void) | undefined;
  onSubmitted?: ((review: AuthoritativeReview) => void) | undefined;
  submittedOverride?: boolean | undefined;
  queuePosition?: Readonly<{ position: number; total: number }> | undefined;
  onNext?: (() => void) | undefined;
  onDraftChange?: ((snapshot: EvaluatorDraftSnapshot) => void) | undefined;
  onAutosavePendingChange?: ((pending: boolean) => void) | undefined;
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
  const abstentionReasonRef = useRef<HTMLTextAreaElement | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [autosavePending, setAutosavePending] = useState(false);
  const [autosaveQueue] = useState(() =>
    createReviewAutosaveQueue((pending) => {
      setAutosavePending(pending);
      onAutosavePendingChange?.(pending);
    }),
  );
  const [autosaveState, setAutosaveState] = useState(
    initiallySubmitted ? "Review submitted" : "Autosave ready",
  );
  const [submitted, setSubmitted] = useState(initiallySubmitted);
  const reviewLocked =
    submitted || assignment.assignmentStatus === "abstained" || assignment.round.status !== "open";
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitBusy, setSubmitBusy] = useState(false);
  const primaryAction = scorecardPrimaryAction({
    submitted,
    hasNext: onNext !== undefined,
    submitBusy,
    autosavePending,
  });
  const submitBusyRef = useRef(false);
  const [abstentionReason, setAbstentionReason] = useState("");
  const [abstentionError, setAbstentionError] = useState<string | null>(null);
  const [abstained, setAbstained] = useState(() => assignment.assignmentStatus === "abstained");
  const [abstentionBusy, setAbstentionBusy] = useState(false);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<readonly ApiSuggestion[]>(assignment.suggestions);
  const [suggestionBusy, setSuggestionBusy] = useState(false);
  const [suggestionUnavailable, setSuggestionUnavailable] = useState<string | null>(null);
  const [suggestionConflict, setSuggestionConflict] = useState<string | null>(null);
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
    setSuggestionUnavailable(null);
    setSuggestionConflict(null);
    try {
      const suggestion = await evaluationRequest<ApiSuggestion>(
        baseUrl,
        `/assignments/${encodeURIComponent(assignment.id)}/suggestions/generate`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setSuggestions((current) => [...current, suggestion]);
      setAutosaveState("AI suggestion is pending human resolution");
    } catch (reason: unknown) {
      const message = reason instanceof Error ? reason.message : "AI suggestions are unavailable.";
      if (reason instanceof EvaluationRequestError && reason.status === 503) {
        setSuggestionUnavailable(message);
        setAutosaveState("AI unavailable; manual scoring and save remain available");
        return;
      }
      setSubmitError(message);
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
    if (action === "edit") {
      const criterion = assignment.round.rubric.criteria.find(
        (candidate) => candidate.id === criterionId,
      );
      if (criterion === undefined || value === undefined) {
        setSubmitError("Choose a rubric criterion and valid edit value before saving.");
        return;
      }
      const validationError = validateSuggestionEditValue(criterion, value);
      if (validationError !== null) {
        setSubmitError(validationError);
        return;
      }
    }
    setSuggestionBusy(true);
    setSubmitError(null);
    setSuggestionConflict(null);
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
      setSuggestionUnavailable(null);
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
      const message =
        reason instanceof Error ? reason.message : "The suggestion could not be resolved.";
      if (
        reason instanceof EvaluationRequestError &&
        (reason.status === 409 || reason.status === 412)
      ) {
        setSuggestions((current) =>
          current.map((candidate) =>
            candidate.id === suggestion.id ? { ...candidate, status: "stale" as const } : candidate,
          ),
        );
        setSuggestionConflict(
          `${message} This suggestion is stale; regenerate it before resolving. Manual scoring, autosave, and submit remain available.`,
        );
        setAutosaveState("AI suggestion stale; manual scoring remains available");
      } else {
        setSubmitError(message);
      }
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
      if (isHumanConfirmedReviewScore(score)) nextConfirmed.add(criterionId);
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
    void autosaveQueue.enqueue(async () => {
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

  function openConflictDisclosure(): void {
    setConflictDialogOpen(true);
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
      return;
    }
    setSubmitError(null);
    setSubmitBusy(true);
    submitBusyRef.current = true;
    try {
      await autosaveQueue.whenIdle();
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
      setConflictDialogOpen(false);
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
    <div
      className={embedded ? styles.embeddedEvaluator : styles.workspace}
      id={embedded ? undefined : "review-workspace"}
    >
      {embedded ? null : (
        <>
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
                Evaluate this submission in <strong>{assignment.round.name}</strong>. Only your
                assigned submission is available in this workspace; your draft stays available while
                you move through the reviewer queue.
              </p>
            </div>
            <div className={styles.headerSide}>
              <ReviewNavigation mode="evaluator" />
              <section className={styles.reviewState} aria-label="Review state">
                <AssignmentStatusBadge
                  status={submitted ? "submitted" : assignment.assignmentStatus}
                />
                <span className={styles.queuePosition}>
                  {queuePosition
                    ? `Queue position ${queuePosition.position} of ${queuePosition.total}`
                    : "Assigned submission"}
                </span>
              </section>
            </div>
          </header>
        </>
      )}

      <div id={embedded ? undefined : "review-content"} tabIndex={embedded ? undefined : -1}>
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
              <p className={styles.sectionEyebrow}>
                {assignment.organizationName ?? assignment.organizationId ?? assignment.eventName} ·{" "}
                {assignment.eventName} · {assignment.planName}
              </p>
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
                    <AssignmentStatusBadge
                      status={submitted ? "submitted" : assignment.assignmentStatus}
                    />
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
              className={styles.dangerButton}
              type="button"
              onClick={openConflictDisclosure}
              disabled={abstentionBusy || reviewLocked}
            >
              Declare conflict
            </button>
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
            {suggestionUnavailable ? (
              <p className={styles.fieldHint} role="status">
                AI provider unavailable locally: {suggestionUnavailable} Manual scoring, autosave,
                and submit evaluation remain usable.
              </p>
            ) : null}
            {suggestionConflict ? (
              <p className={styles.formError} role="alert">
                {suggestionConflict}{" "}
                <button
                  className={styles.secondaryButton}
                  type="button"
                  onClick={() => void generateSuggestions()}
                  disabled={suggestionBusy || reviewLocked}
                >
                  Regenerate suggestions
                </button>
              </p>
            ) : null}
            {suggestions.length > 0 ? (
              <details className={styles.disclosure}>
                <summary>AI suggestion status and provenance</summary>
                <ul>
                  {suggestions.map((suggestion) => (
                    <li key={suggestion.id}>
                      <strong>{suggestion.status}</strong> · suggestion {suggestion.id} · rubric
                      revision {suggestion.rubricRevision} · submission revision{" "}
                      {suggestion.submissionRevision} · provider {suggestion.provenance.provider} ·
                      model {suggestion.provenance.model}
                      {suggestion.provenance.generatedAt
                        ? ` · generated ${suggestion.provenance.generatedAt}`
                        : ""}
                      {suggestion.provenance.promptVersion
                        ? ` · prompt ${suggestion.provenance.promptVersion}`
                        : ""}
                      {suggestion.provenance.traceId
                        ? ` · trace ${suggestion.provenance.traceId}`
                        : ""}
                      {suggestion.provenance.sourceReferences.length > 0
                        ? ` · sources ${suggestion.provenance.sourceReferences.join(", ")}`
                        : " · sources unavailable"}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
          {suggestions
            .filter((suggestion) => suggestion.status === "stale")
            .map((suggestion) => (
              <p className={styles.formError} role="alert" key={suggestion.id}>
                AI suggestion is stale for rubric revision {suggestion.rubricRevision} and
                submission revision {suggestion.submissionRevision}; generate a new suggestion.
              </p>
            ))}
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
              const compactNumericScale =
                criterionType(criterion) === "numeric" &&
                criterion.maximum - criterion.minimum <= 6;
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
                      <label
                        htmlFor={
                          compactNumericScale
                            ? `${criterion.id}-score-${criterion.minimum}`
                            : `${criterion.id}-score`
                        }
                      >
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
                        compactNumericScale ? (
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
                                  id={`${criterion.id}-score-${value}`}
                                  ref={
                                    value === criterion.minimum
                                      ? (element) => {
                                          criterionRefs.current[criterion.id] = element;
                                        }
                                      : undefined
                                  }
                                  type="radio"
                                  name={`${criterion.id}-rating-choice`}
                                  value={value}
                                  checked={scoreValues[criterion.id] === String(value)}
                                  disabled={reviewLocked}
                                  onChange={() => changeScore(criterion.id, String(value))}
                                  aria-invalid={validationMessage !== null}
                                  aria-describedby={`${criterion.id}-description ${criterion.id}-score-help${validationMessage ? ` ${criterion.id}-error` : ""}`}
                                />
                                <span>{value}</span>
                              </label>
                            ))}
                          </div>
                        ) : (
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
                        )
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
                            : compactNumericScale
                              ? `Choose one score from ${criterion.minimum} through ${criterion.maximum}.`
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
                          <div className={styles.fieldHint}>
                            <p>
                              Provider: {suggestionRecord.provenance.provider} · model{" "}
                              {suggestionRecord.provenance.model}
                              {suggestionRecord.provenance.generatedAt
                                ? ` · generated ${suggestionRecord.provenance.generatedAt}`
                                : ""}
                            </p>
                            <p>
                              Rubric revision {suggestionRecord.rubricRevision} · submission
                              revision {suggestionRecord.submissionRevision}
                            </p>
                            {suggestionRecord.provenance.promptVersion ? (
                              <p>Prompt version: {suggestionRecord.provenance.promptVersion}</p>
                            ) : null}
                            {suggestionRecord.provenance.traceId ? (
                              <p>Trace ID: {suggestionRecord.provenance.traceId}</p>
                            ) : null}
                            <p>
                              Source references:{" "}
                              {suggestionRecord.provenance.sourceReferences.join(", ") ||
                                "none returned"}
                            </p>
                          </div>
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
          <section className={styles.commentRow} aria-labelledby="comment-heading">
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
        </section>

        <section className={styles.submitPanel} aria-labelledby="submit-heading">
          <div>
            <p className={styles.sectionEyebrow}>Final step</p>
            <h2 id="submit-heading">Submit review</h2>
            <p>
              Submission waits for autosave, then locks scores and comments for organizer
              aggregation.
            </p>
          </div>
          {submitError ? (
            <p className={styles.formError} role="alert">
              {submitError}
            </p>
          ) : null}
          {primaryAction.kind !== "submit" ? (
            <div className={styles.confirmationActions}>
              <p className={styles.submittedMessage} role="status">
                Review submitted to the committee.
              </p>
              {primaryAction.kind === "open-next" && onNext ? (
                <button className={styles.primaryButton} type="button" onClick={onNext}>
                  {primaryAction.label}
                </button>
              ) : null}
            </div>
          ) : (
            <button
              className={styles.primaryButton}
              type="button"
              onClick={() => void submitReview()}
              disabled={primaryAction.disabled || reviewLocked}
            >
              {submitBusy ? "Submitting…" : primaryAction.label}
            </button>
          )}
        </section>

        <Dialog open={conflictDialogOpen} onOpenChange={setConflictDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Declare a conflict</DialogTitle>
              <DialogDescription>
                A written reason is required. Declaring a conflict removes this assignment from your
                reviewer inbox and records the reason for organizer audit.
              </DialogDescription>
            </DialogHeader>
            <div className={styles.formField}>
              <label htmlFor="abstention-reason">
                Reason for abstention <span>(required)</span>
              </label>
              <textarea
                ref={abstentionReasonRef}
                id="abstention-reason"
                value={abstentionReason}
                disabled={abstentionBusy}
                onChange={(event) => setAbstentionReason(event.currentTarget.value)}
                rows={4}
                required
                aria-describedby="abstention-help"
                placeholder="Describe the conflict for the organizer audit log."
              />
              <p className={styles.fieldHint} id="abstention-help">
                This reason is visible to organizers.
              </p>
            </div>
            {abstentionError ? (
              <p className={styles.formError} role="alert">
                {abstentionError}
              </p>
            ) : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void declareAbstention()}
                disabled={abstentionBusy}
              >
                {abstentionBusy ? "Declaring…" : "Declare conflict and abstain"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
