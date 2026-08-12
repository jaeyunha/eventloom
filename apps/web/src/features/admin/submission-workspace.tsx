"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCfpStepRoute } from "../cfp/routes";
import styles from "./submission-workspace.module.css";

export type SubmissionStatus =
  | "draft"
  | "submitted"
  | "reopened"
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
  answers?: Readonly<Record<string, unknown>>;
  biography?: string;
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
  criterionScores?: readonly { criterion: string; value: number | string }[];
  comment?: string;
  conflict?: string;
}
export type SubmittedReviewReadState =
  | { readonly status: "ready"; readonly count: number }
  | { readonly status: "error"; readonly message: string };

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
  submittedReviewRead?: SubmittedReviewReadState;

  organizerNotes: string;
  reopenAudit: { at: string; organizer: string; reason: string }[];
  evaluationPlanId?: string;
  decision?: EvaluationDecisionRecord;
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
      {
        reviewer: "Avery Patel",
        status: "complete",
        score: 5,
        criterionScores: [{ criterion: "Overall rating", value: 5 }],
        comment: "Strong evidence and a clear audience fit.",
      },
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
  draft: "Draft",
  submitted: "Submitted",
  reopened: "Reopened",
  under_review: "Under review",
  accepted: "Accepted",
  waitlisted: "Waitlisted",
  declined: "Declined",
  withdrawn: "Withdrawn",
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
function apiBaseUrl(): string {
  return "";
}

async function apiRequest<T>(
  baseUrl: string,
  prefix: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body !== undefined) headers.set("content-type", "application/json");
  const response = await fetch(`${baseUrl}${prefix}${path}`, {
    ...init,
    credentials: "include",
    headers,
    cache: "no-store",
  });
  const body = (await response.json().catch(() => undefined)) as
    | { data?: T; error?: { message?: string } }
    | T
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
        : "The submission request could not be completed.";
    throw new Error(message);
  }
  if (typeof body === "object" && body !== null && "data" in body && body.data !== undefined) {
    return body.data as T;
  }
  return body as T;
}

async function evaluationRequest<T>(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  return apiRequest(baseUrl, "/api/admin/evaluations", path, init);
}

async function canonicalSubmissionRequest<T>(
  baseUrl: string,
  organizationId: string,
  eventId: string,
  init: RequestInit = {},
): Promise<T> {
  return apiRequest(
    baseUrl,
    "/api/cfp",
    `/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventId)}/submissions`,
    init,
  );
}

export async function loadCanonicalSubmissionList(
  baseUrl: string,
  organizationId: string,
  eventId: string,
  signal?: AbortSignal,
): Promise<readonly CanonicalSubmissionEnvelope[]> {
  return canonicalSubmissionRequest<readonly CanonicalSubmissionEnvelope[]>(
    baseUrl,
    organizationId,
    eventId,
    signal === undefined ? {} : { signal },
  );
}

function localDemoEnabled(): boolean {
  return process.env.NODE_ENV === "test" || process.env.NEXT_PUBLIC_RUNTIME_PROFILE === "fixture";
}
interface SubmissionFieldOption {
  readonly value: string;
  readonly label?: string;
}

export interface SubmissionFieldDefinition {
  readonly id?: string;
  readonly key: string;
  readonly label?: string;
  readonly options?: readonly (string | SubmissionFieldOption)[];
}

export type EvaluationDecisionStatus = "accepted" | "waitlisted" | "rejected";

export interface EvaluationDecisionTransition {
  readonly from: EvaluationDecisionStatus | null;
  readonly to: EvaluationDecisionStatus;
  readonly reason: string;
  readonly decidedBy: string;
  readonly decidedAt: string;
  readonly idempotencyKey: string;
}

export interface EvaluationDecisionRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly eventId: string;
  readonly planId: string;
  readonly submissionId: string;
  readonly status: EvaluationDecisionStatus;
  readonly version: number;
  readonly history: readonly EvaluationDecisionTransition[];
  readonly updatedAt: string;
}

export interface OrganizerEvaluationWorkspace {
  readonly plan: {
    readonly id: string;
    readonly rounds: readonly { readonly id: string; readonly sequence?: number | undefined }[];
  };
  readonly assignments: readonly {
    readonly id: string;
    readonly reviewerId: string;
    readonly submissionId: string;
    readonly status: "assigned" | "in_progress" | "submitted" | "abstained";
  }[];
  readonly aggregates: readonly {
    readonly roundId: string;
    readonly submissionId: string;
    readonly submittedReviewCount: number;
    readonly expectedReviewCount: number;
    readonly averageWeightedTotal: number | null;
    readonly possibleWeightedTotal: number;
  }[];
  readonly decisions: Readonly<Record<string, EvaluationDecisionRecord>>;
}

export interface OrganizerEvaluationIndex {
  readonly plan: OrganizerEvaluationWorkspace["plan"];
  readonly round: OrganizerEvaluationWorkspace["plan"]["rounds"][number] | undefined;
  readonly assignmentsBySubmissionId: ReadonlyMap<
    string,
    OrganizerEvaluationWorkspace["assignments"]
  >;
  readonly aggregateBySubmissionId: ReadonlyMap<
    string,
    OrganizerEvaluationWorkspace["aggregates"][number]
  >;
  readonly decisions: OrganizerEvaluationWorkspace["decisions"];
}

export interface AcceptedHandoffMetadata {
  readonly title: string;
  readonly track: string;
  readonly version: number;
  readonly primarySpeaker: SubmissionParticipant | null;
  readonly coSpeakers: readonly SubmissionParticipant[];
}
export interface CanonicalSubmissionParticipant {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly role: "primary" | "co_speaker";
  readonly biography: string;
  readonly answers: Readonly<Record<string, unknown>>;
}

export interface CanonicalSubmission {
  readonly id: string;
  readonly tenantId: string;
  readonly eventId: string;
  readonly formId: string;
  readonly ownerAccountId: string;
  readonly formVersion: number;
  readonly version: number;
  readonly status: "draft" | "submitted" | "reopened" | "withdrawn";
  readonly completedSteps: readonly string[];
  readonly answers: Readonly<Record<string, unknown>>;
  readonly participants: readonly CanonicalSubmissionParticipant[];
  readonly secondaryContacts: readonly {
    readonly id: string;
    readonly name: string;
    readonly email: string;
  }[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly submittedAt?: string | null;
  readonly reopenedAt?: string | null;
  readonly withdrawnAt?: string | null;
  readonly finalDecisionAt?: string | null;
}

export interface CanonicalSubmissionEnvelope {
  readonly submission: CanonicalSubmission;
  readonly submissionFields: readonly SubmissionFieldDefinition[];
  readonly participantFields: readonly SubmissionFieldDefinition[];
}

function answerText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value.trim().length === 0 ? null : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const serialized = JSON.stringify(value);
  return serialized === undefined ? null : serialized;
}

function optionValue(value: unknown): string | null {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "value" in value &&
    typeof value.value === "string"
  ) {
    return value.value;
  }
  return answerText(value);
}

function fieldAnswer(value: unknown, definition: SubmissionFieldDefinition | undefined): string {
  if (Array.isArray(value)) {
    const values = value
      .map((candidate) => fieldAnswer(candidate, definition))
      .filter((candidate) => candidate !== "—");
    return values.length === 0 ? "—" : values.join(", ");
  }
  const raw = answerText(value);
  if (raw === null) return "—";
  const comparable = optionValue(value) ?? raw;
  const option = definition?.options?.find((candidate) => optionValue(candidate) === comparable);
  if (typeof option === "string") return option;
  if (
    typeof option === "object" &&
    option !== null &&
    typeof option.label === "string" &&
    option.label.trim().length > 0
  ) {
    return option.label;
  }
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "label" in value &&
    typeof value.label === "string" &&
    value.label.trim().length > 0
  ) {
    return value.label;
  }
  return raw;
}

function participantRole(role: string | undefined): string {
  const normalized = role?.trim();
  if (normalized === "primary") return "Speaker";
  if (normalized === "co_speaker") return "Co-speaker";
  return normalized || "Speaker";
}
export function getAcceptedHandoffMetadata(
  submission: Pick<SubmissionRecord, "title" | "track" | "version" | "participants">,
): AcceptedHandoffMetadata {
  const primarySpeaker =
    submission.participants.find((participant) => participant.role === "Speaker") ??
    submission.participants[0] ??
    null;
  const coSpeakers = submission.participants.filter(
    (participant) => participant.id !== primarySpeaker?.id && participant.role === "Co-speaker",
  );
  return {
    title: submission.title,
    track: submission.track,
    version: submission.version,
    primarySpeaker,
    coSpeakers,
  };
}

function canonicalFieldValue(
  answers: Readonly<Record<string, unknown>>,
  definition: SubmissionFieldDefinition,
): unknown {
  if (Object.hasOwn(answers, definition.key)) return answers[definition.key];
  if (definition.id !== undefined && Object.hasOwn(answers, definition.id)) {
    return answers[definition.id];
  }
  return undefined;
}

function participantFieldValue(
  participant: CanonicalSubmissionParticipant,
  definition: SubmissionFieldDefinition,
): unknown {
  if (definition.key === "firstName") return participant.firstName;
  if (definition.key === "lastName") return participant.lastName;
  if (definition.key === "email") return participant.email;
  if (definition.key === "biography") return participant.biography;
  return canonicalFieldValue(participant.answers, definition);
}

function participantOrganization(
  participant: CanonicalSubmissionParticipant,
  definitions: readonly SubmissionFieldDefinition[],
): string {
  const definition = definitions.find((candidate) =>
    ["organization", "company", "participantCompany"].includes(candidate.key),
  );
  if (definition === undefined) return "";
  const value = fieldAnswer(participantFieldValue(participant, definition), definition);
  return value === "—" ? "" : value;
}

export function mapCanonicalSubmission(envelope: CanonicalSubmissionEnvelope): SubmissionRecord {
  const { submission, submissionFields, participantFields } = envelope;
  const definitions = new Map(submissionFields.map((definition) => [definition.key, definition]));
  const answer = (key: string): string => {
    const definition = definitions.get(key);
    return definition === undefined
      ? fieldAnswer(submission.answers[key], undefined)
      : fieldAnswer(canonicalFieldValue(submission.answers, definition), definition);
  };
  const title = answer("title");
  const abstractAnswer = answer("abstract");
  const abstractValue = abstractAnswer === "—" ? answer("description") : abstractAnswer;
  const submittedAt = submission.submittedAt ?? null;
  const reopenedAt = submission.reopenedAt ?? null;
  const timeline: SubmissionTimelineEntry[] = [];
  if (submittedAt !== null) {
    timeline.push({
      label: "Submitted",
      at: submittedAt,
      detail: "The submission was submitted through the CFP.",
    });
  }
  if (reopenedAt !== null) {
    timeline.push({
      label: "Reopened",
      at: reopenedAt,
      detail: "An organizer reopened this submission.",
    });
  }

  return {
    eventId: submission.eventId,
    id: submission.id,
    title: title === "—" ? "Untitled submission" : title,
    status: submission.status,
    track: answer("track"),
    format: answer("format"),
    version: submission.version,
    submittedAt: submittedAt ?? submission.updatedAt,
    updatedAt: submission.updatedAt,
    participants: submission.participants.map((participant) => ({
      id: participant.id,
      name: `${participant.firstName} ${participant.lastName}`.trim() || participant.email,
      email: participant.email,
      role: participantRole(participant.role),
      organization: participantOrganization(participant, participantFields),
      biography: participant.biography,
      answers: Object.fromEntries(
        participantFields.map((definition) => [
          definition.label?.trim() || definition.key,
          fieldAnswer(participantFieldValue(participant, definition), definition),
        ]),
      ),
    })),
    participantProgress: {
      completed: submission.participants.filter(
        (participant) => participant.biography.trim().length > 0,
      ).length,
      total: submission.participants.length,
    },
    abstract: abstractValue,
    answers: submissionFields.map((definition) => ({
      question: definition.label?.trim() || definition.key,
      answer: fieldAnswer(canonicalFieldValue(submission.answers, definition), definition),
    })),
    timeline,
    reviewSummary: {
      completed: 0,
      total: 0,
      averageScore: null,
      maxScore: 0,
      recommendation: "Evaluation data loads from the plan.",
    },
    reviewAssignments: [],
    organizerNotes: "Submission details are ready. Review information loads with the event.",
    reopenAudit:
      reopenedAt === null
        ? []
        : [
            {
              at: reopenedAt,
              organizer: "Organizer",
              reason: "Recorded in the server audit log.",
            },
          ],
  };
}
interface SubmittedReview {
  readonly assignmentId: string;
  readonly submissionId: string;
  readonly comment: string;
  readonly scores: Readonly<Record<string, { readonly value: number | string }>>;
}
interface SubmittedReviewResult {
  readonly reviews: readonly SubmittedReview[];
  readonly error: string | null;
}

function rubricCriterionLabel(criterionId: string): string {
  return criterionId
    .split(/[-_]/u)
    .filter(Boolean)
    .map((part) => `${part[0]?.toLocaleUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

export async function loadOrganizerEvaluationWorkspace(
  baseUrl: string,
  eventId: string,
  signal?: AbortSignal,
): Promise<OrganizerEvaluationWorkspace> {
  return evaluationRequest<OrganizerEvaluationWorkspace>(
    baseUrl,
    `/organizer/workspace?eventId=${encodeURIComponent(eventId)}`,
    signal === undefined ? {} : { signal },
  );
}

export function indexOrganizerEvaluationWorkspace(
  workspace: OrganizerEvaluationWorkspace,
): OrganizerEvaluationIndex {
  const round = [...workspace.plan.rounds].sort(
    (left, right) => (right.sequence ?? 0) - (left.sequence ?? 0),
  )[0];
  const assignmentsBySubmissionId = new Map<
    string,
    OrganizerEvaluationWorkspace["assignments"][number][]
  >();
  for (const assignment of workspace.assignments) {
    const current = assignmentsBySubmissionId.get(assignment.submissionId) ?? [];
    current.push(assignment);
    assignmentsBySubmissionId.set(assignment.submissionId, current);
  }
  const aggregateBySubmissionId = new Map<
    string,
    OrganizerEvaluationWorkspace["aggregates"][number]
  >();
  if (round !== undefined) {
    for (const aggregate of workspace.aggregates) {
      if (aggregate.roundId === round.id) {
        aggregateBySubmissionId.set(aggregate.submissionId, aggregate);
      }
    }
  }
  return {
    plan: workspace.plan,
    round,
    assignmentsBySubmissionId,
    aggregateBySubmissionId,
    decisions: workspace.decisions,
  };
}

export function mergeCanonicalSubmissionEvaluation(
  envelope: CanonicalSubmissionEnvelope,
  index: OrganizerEvaluationIndex,
  submittedReviewResult: SubmittedReviewResult = { reviews: [], error: null },
): SubmissionRecord {
  const submission = mapCanonicalSubmission(envelope);
  const plan = index.plan;
  const assignments = index.assignmentsBySubmissionId.get(submission.id) ?? [];
  const decision = index.decisions[submission.id] ?? null;
  const aggregate = index.aggregateBySubmissionId.get(submission.id) ?? null;
  const submittedReviewByAssignment = new Map(
    submittedReviewResult.reviews
      .filter((review) => review.submissionId === submission.id)
      .map((review) => [review.assignmentId, review] as const),
  );

  const decisionTimeline =
    decision === null
      ? []
      : decision.history.map((transition) => ({
          label:
            transition.to === "accepted"
              ? "Accepted"
              : transition.to === "rejected"
                ? "Rejected"
                : "Waitlisted",
          at: transition.decidedAt,
          detail: `${transition.reason} (organizer ${transition.decidedBy}).`,
        }));
  return {
    ...submission,
    ...(decision === null ? {} : { decision }),
    evaluationPlanId: plan.id,
    timeline: [...submission.timeline, ...decisionTimeline],
    status:
      decision?.status === "accepted"
        ? "accepted"
        : decision?.status === "waitlisted"
          ? "waitlisted"
          : decision?.status === "rejected"
            ? "declined"
            : submission.status,
    reviewSummary: {
      completed: aggregate?.submittedReviewCount ?? 0,
      total: aggregate?.expectedReviewCount ?? assignments.length,
      averageScore: aggregate?.averageWeightedTotal ?? null,
      maxScore: aggregate?.possibleWeightedTotal ?? 0,
      recommendation: decision?.status
        ? `${decision.status[0]?.toLocaleUpperCase() ?? ""}${decision.status.slice(1)}`
        : "Awaiting human decision",
    },
    submittedReviewRead:
      submittedReviewResult.error === null
        ? { status: "ready", count: submittedReviewByAssignment.size }
        : { status: "error", message: submittedReviewResult.error },

    reviewAssignments: assignments.map((assignment) => {
      const submittedReview = submittedReviewByAssignment.get(assignment.id);
      return {
        reviewer: assignment.reviewerId,
        status:
          assignment.status === "submitted"
            ? "complete"
            : assignment.status === "in_progress"
              ? "in_progress"
              : assignment.status === "abstained"
                ? "abstained"
                : "not_started",
        ...(submittedReview === undefined
          ? {}
          : {
              criterionScores: Object.entries(submittedReview.scores).map(
                ([criterionId, score]) => ({
                  criterion: rubricCriterionLabel(criterionId),
                  value: score.value,
                }),
              ),
              comment: submittedReview.comment,
            }),
        ...(assignment.status === "abstained"
          ? { conflict: "Reviewer declared a conflict and abstained." }
          : {}),
      };
    }),

    organizerNotes: decision?.history.at(-1)?.reason ?? submission.organizerNotes,
  };
}

export async function enrichCanonicalSubmission(
  baseUrl: string,
  envelope: CanonicalSubmissionEnvelope,
): Promise<SubmissionRecord> {
  const workspace = await loadOrganizerEvaluationWorkspace(baseUrl, envelope.submission.eventId);
  const index = indexOrganizerEvaluationWorkspace(workspace);
  const round = index.round;
  const submittedReviewResult =
    round === undefined
      ? { reviews: [], error: null }
      : await evaluationRequest<{ reviews: readonly SubmittedReview[] }>(
          baseUrl,
          `/plans/${encodeURIComponent(workspace.plan.id)}/rounds/${encodeURIComponent(round.id)}/submissions/${encodeURIComponent(envelope.submission.id)}/reviews`,
        )
          .then(({ reviews }) => ({ reviews, error: null }))
          .catch((reason: unknown) => ({
            reviews: [],
            error:
              reason instanceof Error ? reason.message : "Submitted reviews could not be loaded.",
          }));
  return mergeCanonicalSubmissionEvaluation(envelope, index, submittedReviewResult);
}

function eventTitle(eventId: string): string {
  if (eventId === "summit-2026") {
    return "Open Sessionboard Summit 2026";
  }
  if (eventId === "forge-2025") {
    return "Forge Community Day 2025";
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(eventId)) {
    return "Selected event";
  }
  return eventId
    .split(/[-_]/u)
    .filter(Boolean)
    .map((part) => part[0]?.toLocaleUpperCase() + part.slice(1))
    .join(" ");
}

export async function loadOrganizerEventName(
  baseUrl: string,
  organizationId: string,
  eventId: string,
  signal?: AbortSignal,
): Promise<string> {
  const event = await loadOrganizerEventIdentity(baseUrl, organizationId, eventId, signal);
  return event.name;
}

export async function loadOrganizerEventIdentity(
  baseUrl: string,
  organizationId: string,
  eventId: string,
  signal?: AbortSignal,
): Promise<{ readonly name: string; readonly slug: string | null }> {
  const response = await fetch(
    `${baseUrl.replace(/\/+$/u, "")}/api/cfp/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventId)}/config`,
    {
      credentials: "include",
      cache: "no-store",
      ...(signal === undefined ? {} : { signal }),
    },
  );
  if (!response.ok) throw new Error(`The event request failed (HTTP ${response.status}).`);
  const payload = (await response.json()) as {
    readonly data?: { readonly name?: unknown; readonly slug?: unknown };
  };
  const name = payload.data?.name;
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new TypeError("The event response does not contain a name.");
  }
  const slug = payload.data?.slug;
  return {
    name: name.trim(),
    slug: typeof slug === "string" && slug.trim().length > 0 ? slug.trim() : null,
  };
}

function submissionListHref(eventId: string, organizationId: string): string {
  return `/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventId)}/submissions`;
}

function submissionHref(eventId: string, submissionId: string, organizationId: string): string {
  return `${submissionListHref(eventId, organizationId)}/${encodeURIComponent(submissionId)}`;
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
  const variant =
    status === "accepted"
      ? "default"
      : status === "declined" || status === "withdrawn"
        ? "destructive"
        : status === "under_review" || status === "submitted" || status === "reopened"
          ? "secondary"
          : "outline";
  return (
    <Badge variant={variant} className={styles.statusBadge}>
      {statusLabels[status]}
    </Badge>
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

export type SubmissionListState = "loading" | "failure" | "empty" | "filtered_empty" | "ready";

export function submissionListState(input: {
  loading: boolean;
  loadError: string | null;
  submissionCount: number;
  visibleCount: number;
}): SubmissionListState {
  if (input.loading) return "loading";
  if (input.loadError !== null) return "failure";
  if (input.submissionCount === 0) return "empty";
  if (input.visibleCount === 0) return "filtered_empty";
  return "ready";
}

export function SubmissionListWorkspace({
  eventId,
  organizationId,
}: Readonly<{ eventId: string; organizationId: string }>) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<SubmissionStatus | "all">("all");
  const [track, setTrack] = useState("all");
  const [format, setFormat] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>(() =>
    localDemoEnabled() ? getSeededSubmissionsForEvent(eventId) : [],
  );
  const [loading, setLoading] = useState(!localDemoEnabled());
  const [loadError, setLoadError] = useState<string | null>(null);
  const baseUrl = apiBaseUrl();
  const [eventName, setEventName] = useState(() => eventTitle(eventId));
  const [eventSlug, setEventSlug] = useState<string | null>(null);

  useEffect(() => {
    if (localDemoEnabled()) return;
    let active = true;
    if (organizationId === undefined || organizationId.trim().length === 0) {
      setLoading(false);
      setLoadError("An organization-scoped route is required to load submissions.");
      return () => {
        active = false;
      };
    }
    setLoading(true);
    setLoadError(null);
    const eventController = new AbortController();
    void loadOrganizerEventIdentity(baseUrl, organizationId, eventId, eventController.signal)
      .then((event) => {
        if (active) {
          setEventName(event.name);
          setEventSlug(event.slug);
        }
      })
      .catch(() => undefined);

    const workspacePromise = loadOrganizerEvaluationWorkspace(
      baseUrl,
      eventId,
      eventController.signal,
    ).catch(() => null);
    void loadCanonicalSubmissionList(baseUrl, organizationId, eventId, eventController.signal)
      .then((records) => {
        if (!active) return;
        setSubmissions(records.map(mapCanonicalSubmission));
        setLoading(false);
        void workspacePromise.then((workspace) => {
          if (!active || workspace === null) return;
          const index = indexOrganizerEvaluationWorkspace(workspace);
          setSubmissions(
            records.map((record) => mergeCanonicalSubmissionEvaluation(record, index)),
          );
        });
      })
      .catch((reason: unknown) => {
        if (active) {
          setLoadError(
            reason instanceof Error ? reason.message : "Submissions could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      eventController.abort();
      active = false;
    };
  }, [baseUrl, eventId, organizationId]);

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

  const listState = submissionListState({
    loading,
    loadError,
    submissionCount: submissions.length,
    visibleCount: filteredSubmissions.length,
  });
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
        <Button asChild variant="outline">
          <Link href="/admin/events">Back to events</Link>
        </Button>
      </header>

      <div id="submission-list-content" className={styles.workspaceMain} tabIndex={-1}>
        <section className={styles.metricGrid} aria-label="Submission summary">
          <Card size="sm" className={styles.metricCard}>
            <CardHeader>
              <CardDescription>Total submissions</CardDescription>
              <CardTitle className={styles.metricValue}>{submissions.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm" className={styles.metricCard}>
            <CardHeader>
              <CardDescription>Needs review</CardDescription>
              <CardTitle className={styles.metricValue}>
                {submissions.filter((submission) => submission.status === "under_review").length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm" className={styles.metricCard}>
            <CardHeader>
              <CardDescription>Accepted</CardDescription>
              <CardTitle className={styles.metricValue}>
                {submissions.filter((submission) => submission.status === "accepted").length}
              </CardTitle>
            </CardHeader>
          </Card>
        </section>

        <Card
          id="submission-list-card"
          className={styles.listPanel}
          aria-labelledby="submission-table-heading"
        >
          <CardHeader className={styles.panelHeader}>
            <div>
              <CardDescription>{eventName}</CardDescription>
              <CardTitle id="submission-table-heading">
                {submissions.length === 0 ? "Submission inbox" : "All submissions"}
              </CardTitle>
              {listState !== "empty" ? (
                <p className={styles.mutedText}>
                  {filteredSubmissions.length} of {submissions.length} shown
                  {selectedVisibleCount > 0 ? ` · ${selectedVisibleCount} selected` : ""}
                </p>
              ) : null}
            </div>
          </CardHeader>

          {submissions.length > 0 ? (
            <CardContent className={styles.listContent}>
              <fieldset className={styles.toolbar} aria-label="Submission filters">
                <legend className={styles.srOnly}>Filter submissions</legend>
                <label className={styles.toolbarSearch} htmlFor="submission-search">
                  <span className={styles.toolbarLabel}>Search</span>
                  <Input
                    id="submission-search"
                    type="search"
                    value={search}
                    placeholder="Title, track, format, or participant"
                    onChange={(event) => setSearch(event.currentTarget.value)}
                  />
                </label>
                <div className={styles.toolbarField}>
                  <span className={styles.toolbarLabel}>Status</span>
                  <Select
                    value={status}
                    onValueChange={(value) => setStatus(value as SubmissionStatus | "all")}
                  >
                    <SelectTrigger id="submission-status" aria-label="Filter by status">
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className={styles.toolbarField}>
                  <span className={styles.toolbarLabel}>Track</span>
                  <Select value={track} onValueChange={setTrack}>
                    <SelectTrigger id="submission-track" aria-label="Filter by track">
                      <SelectValue placeholder="All tracks" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All tracks</SelectItem>
                      {tracks.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className={styles.toolbarField}>
                  <span className={styles.toolbarLabel}>Format</span>
                  <Select value={format} onValueChange={setFormat}>
                    <SelectTrigger id="submission-format" aria-label="Filter by format">
                      <SelectValue placeholder="All formats" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All formats</SelectItem>
                      {formats.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className={styles.clearButton}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setStatus("all");
                    setTrack("all");
                    setFormat("all");
                  }}
                >
                  Clear filters
                </Button>
              </fieldset>

              {listState === "loading" ? (
                <div className={styles.emptyState} role="status" aria-live="polite">
                  <h3>Loading submissions</h3>
                  <p>We&apos;re getting the latest proposals for this event.</p>
                </div>
              ) : listState === "failure" ? (
                <div className={styles.emptyState} role="alert">
                  <h3>Unable to load submissions</h3>
                  <p>{loadError ?? "Submissions could not be loaded."}</p>
                </div>
              ) : listState === "filtered_empty" ? (
                <div className={styles.emptyState} role="status">
                  <h3>No matching submissions</h3>
                  <p>Try a different search or clear the filters to see more proposals.</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearch("");
                      setStatus("all");
                      setTrack("all");
                      setFormat("all");
                    }}
                  >
                    Clear filters
                  </Button>
                </div>
              ) : (
                <div className={styles.tableWrap}>
                  <Table className={styles.submissionTable}>
                    <TableCaption className={styles.srOnly}>
                      Submissions for {eventName}
                    </TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead className={styles.checkboxColumn} scope="col">
                          <label className={styles.checkboxLabel}>
                            <input
                              type="checkbox"
                              checked={allVisibleSelected}
                              onChange={toggleAllVisible}
                              aria-label="Select all visible submissions"
                            />
                            <span className={styles.srOnly}>Select all visible submissions</span>
                          </label>
                        </TableHead>
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
                        <TableHead scope="col">Participants</TableHead>
                        <TableHead scope="col">Review progress</TableHead>
                        <TableHead scope="col">Track / format</TableHead>
                        <SortableHeader
                          sortKey="updatedAt"
                          activeKey={sortKey}
                          direction={sortDirection}
                          onSort={toggleSort}
                        >
                          Updated
                        </SortableHeader>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSubmissions.map((submission) => (
                        <TableRow key={submission.id}>
                          <TableCell className={styles.checkboxColumn}>
                            <label className={styles.checkboxLabel}>
                              <input
                                type="checkbox"
                                checked={selected.has(submission.id)}
                                onChange={() => toggleSelected(submission.id)}
                                aria-label={`Select ${submission.title}`}
                              />
                              <span className={styles.srOnly}>Select {submission.title}</span>
                            </label>
                          </TableCell>
                          <TableHead scope="row" className={styles.titleCell}>
                            <Link
                              className={styles.submissionLink}
                              href={submissionHref(eventId, submission.id, organizationId)}
                            >
                              {submission.title}
                            </Link>
                            <span className={styles.submissionMeta}>
                              {submission.id} · v{submission.version}
                            </span>
                          </TableHead>
                          <TableCell>
                            <StatusBadge status={submission.status} />
                          </TableCell>
                          <TableCell>
                            <ProgressMeter
                              completed={submission.participantProgress.completed}
                              total={submission.participantProgress.total}
                              label={`${submission.title} participant profile progress`}
                            />
                          </TableCell>
                          <TableCell>
                            <ProgressMeter
                              completed={submission.reviewSummary.completed}
                              total={submission.reviewSummary.total}
                              label={`${submission.title} review progress`}
                            />
                          </TableCell>
                          <TableCell>
                            <span className={styles.trackValue}>{submission.track}</span>
                            <span className={styles.submissionMeta}>{submission.format}</span>
                          </TableCell>
                          <TableCell>
                            <time dateTime={submission.updatedAt}>
                              {formatDate(submission.updatedAt)}
                            </time>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          ) : listState === "loading" ? (
            <CardContent>
              <div className={styles.emptyState} role="status" aria-live="polite">
                <h3>Loading submissions</h3>
                <p>We&apos;re getting the latest proposals for this event.</p>
              </div>
            </CardContent>
          ) : listState === "failure" ? (
            <CardContent>
              <div className={styles.emptyState} role="alert">
                <h3>Unable to load submissions</h3>
                <p>{loadError ?? "Submissions could not be loaded."}</p>
              </div>
            </CardContent>
          ) : (
            <CardContent className={styles.emptyCardContent}>
              <Empty className={styles.emptyState} role="status">
                <EmptyHeader>
                  <EmptyTitle>No submissions yet</EmptyTitle>
                  <EmptyDescription>
                    Share the public call for proposals to start collecting sessions for {eventName}
                    .
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button asChild>
                    {organizationId && eventSlug ? (
                      <Link href={getCfpStepRoute(organizationId, eventSlug, "welcome")}>
                        Open public CFP
                      </Link>
                    ) : null}
                  </Button>
                  <Button asChild variant="outline">
                    {organizationId ? (
                      <Link
                        href={`/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventId)}/cfp`}
                      >
                        Configure CFP
                      </Link>
                    ) : (
                      <span>Organization scope required</span>
                    )}
                  </Button>
                </EmptyContent>
              </Empty>
            </CardContent>
          )}
        </Card>
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
    <TableHead
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
    </TableHead>
  );
}

function decisionSubmissionStatus(status: EvaluationDecisionStatus): SubmissionStatus {
  return status === "accepted" ? "accepted" : status === "waitlisted" ? "waitlisted" : "declined";
}

function DecisionControl({
  submission,
  baseUrl,
  onSaved,
}: Readonly<{
  submission: SubmissionRecord;
  baseUrl: string;
  onSaved: (decision: EvaluationDecisionRecord) => void;
}>) {
  const initialStatus =
    submission.decision?.status ??
    (submission.status === "accepted"
      ? "accepted"
      : submission.status === "waitlisted"
        ? "waitlisted"
        : submission.status === "declined"
          ? "rejected"
          : "accepted");
  const [status, setStatus] = useState<EvaluationDecisionStatus>(initialStatus);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notificationState, setNotificationState] = useState<"idle" | "queued" | "confirmed">(
    submission.decision === undefined ? "idle" : "confirmed",
  );
  const hasDecisionApi = submission.evaluationPlanId !== undefined;
  const decisionHistory = submission.decision?.history ?? [];
  const canSubmit = hasDecisionApi && reason.trim().length >= 5 && !busy;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canSubmit || submission.evaluationPlanId === undefined) return;
    setBusy(true);
    setError(null);
    try {
      const decision = await evaluationRequest<EvaluationDecisionRecord>(
        baseUrl,
        `/plans/${encodeURIComponent(submission.evaluationPlanId)}/submissions/${encodeURIComponent(submission.id)}/decision`,
        {
          method: "PUT",
          body: JSON.stringify({
            status,
            reason: reason.trim(),
            ...(submission.decision === undefined
              ? {}
              : { expectedVersion: submission.decision.version }),
            idempotencyKey: `web-decision-${crypto.randomUUID()}`,
          }),
        },
      );
      onSaved(decision);
      setNotificationState("queued");
      setReason("");
    } catch (reasonValue: unknown) {
      setError(
        reasonValue instanceof Error ? reasonValue.message : "The decision could not be saved.",
      );
      setNotificationState("idle");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.detailPanel} aria-labelledby="decision-heading">
      <p className={styles.eyebrow}>Human organizer decision</p>
      <h2 id="decision-heading">Accept or reject</h2>
      <p className={styles.mutedText}>
        Decisions are versioned on the evaluation server. Saving waits for the durable decision and
        its submitter notification queue. Accepted-speaker onboarding then continues through the
        idempotent background handoff.
      </p>
      <form onSubmit={handleSubmit}>
        <div className={styles.formGrid}>
          <div className={styles.filterField}>
            <label htmlFor="decision-status">Decision outcome</label>
            <select
              id="decision-status"
              value={status}
              disabled={!hasDecisionApi || busy}
              onChange={(event) => setStatus(event.currentTarget.value as EvaluationDecisionStatus)}
            >
              <option value="accepted">Accept</option>
              <option value="waitlisted">Waitlist</option>
              <option value="rejected">Reject</option>
            </select>
          </div>
          <div className={styles.decisionActions}>
            <button
              className={styles.clearButton}
              type="button"
              aria-pressed={status === "accepted"}
              disabled={!hasDecisionApi || busy}
              onClick={() => setStatus("accepted")}
            >
              Accept submission
            </button>
            <button
              className={styles.dangerButton}
              type="button"
              aria-pressed={status === "rejected"}
              disabled={!hasDecisionApi || busy}
              onClick={() => setStatus("rejected")}
            >
              Reject submission
            </button>
          </div>
        </div>
        <label className={styles.textareaLabel} htmlFor="decision-reason">
          Human-authored decision reason
        </label>
        <textarea
          id="decision-reason"
          name="decisionReason"
          value={reason}
          minLength={5}
          required
          rows={3}
          placeholder="Explain the program decision for the audit history."
          disabled={!hasDecisionApi || busy}
          onChange={(event) => setReason(event.currentTarget.value)}
        />
        <p className={styles.fieldHelp}>
          The reason and server decision version are retained in the immutable decision history.
        </p>
        {!hasDecisionApi ? (
          <p className={styles.auditCallout} role="note">
            Decision controls are read-only until the server evaluation plan is available.
          </p>
        ) : null}
        {error ? (
          <p className={styles.formError} role="alert">
            {error}
          </p>
        ) : null}
        <button className={styles.primaryLink} type="submit" disabled={!canSubmit}>
          Save {status === "accepted" ? "accept" : status === "rejected" ? "reject" : "waitlist"}{" "}
          decision and queue notifications
        </button>
      </form>
      <section aria-labelledby="decision-history-heading">
        <h3 id="decision-history-heading">Decision and notification history</h3>
        {decisionHistory.length ? (
          <ol className={styles.timeline}>
            {decisionHistory.map((transition) => (
              <li key={`${transition.idempotencyKey}-${transition.decidedAt}`}>
                <span className={styles.timelineMarker} aria-hidden="true" />
                <div>
                  <h4>
                    {transition.to === "accepted"
                      ? "Accepted"
                      : transition.to === "rejected"
                        ? "Rejected"
                        : "Waitlisted"}
                  </h4>
                  <time dateTime={transition.decidedAt}>
                    {formatDateTime(transition.decidedAt)}
                  </time>
                  <p>
                    {transition.reason} · organizer {transition.decidedBy} · decision version{" "}
                    {decisionHistory.indexOf(transition) + 1}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.mutedText}>No decision has been recorded.</p>
        )}
        {notificationState === "queued" ? (
          <p className={styles.successMessage} role="status">
            Decision notification queued for the all_participants audience.
            {status === "accepted"
              ? " Accepted-speaker onboarding is continuing through the idempotent background handoff."
              : " No accepted-speaker handoff is required for this outcome."}
          </p>
        ) : notificationState === "confirmed" ? (
          <p className={styles.successMessage} role="status">
            Notification projection confirmed for the recorded decision.
          </p>
        ) : null}
      </section>
    </section>
  );
}

function AcceptedHandoffSummary({ submission }: Readonly<{ submission: SubmissionRecord }>) {
  const accepted = submission.status === "accepted" || submission.decision?.status === "accepted";
  if (!accepted) return null;
  const metadata = getAcceptedHandoffMetadata(submission);
  return (
    <section className={styles.detailPanel} aria-labelledby="accepted-handoff-heading">
      <p className={styles.eyebrow}>Session and agenda handoff</p>
      <h2 id="accepted-handoff-heading">Accepted session handoff</h2>
      <p className={styles.mutedText}>
        The accepted session is ready to move into your event program.
      </p>
      <dl className={styles.answerList}>
        <div>
          <dt>Session title</dt>
          <dd>{metadata.title}</dd>
        </div>
        <div>
          <dt>Primary speaker</dt>
          <dd>{metadata.primarySpeaker?.name ?? "—"}</dd>
        </div>
        <div>
          <dt>Co-speaker(s)</dt>
          <dd>
            {metadata.coSpeakers.length === 0
              ? "—"
              : metadata.coSpeakers.map((speaker) => speaker.name).join(", ")}
          </dd>
        </div>
        <div>
          <dt>Track</dt>
          <dd>{metadata.track}</dd>
        </div>
        <div>
          <dt>Submission version</dt>
          <dd>{metadata.version}</dd>
        </div>
      </dl>
    </section>
  );
}
export function SubmissionDetailWorkspace({
  eventId,
  submissionId,
  organizationId,
}: Readonly<{ eventId: string; submissionId: string; organizationId: string }>) {
  const baseUrl = apiBaseUrl();
  const [submission, setSubmission] = useState<SubmissionRecord | null>(() =>
    localDemoEnabled() ? (getSeededSubmission(eventId, submissionId) ?? null) : null,
  );
  const [loading, setLoading] = useState(!localDemoEnabled());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    if (localDemoEnabled()) return;
    let active = true;
    if (organizationId === undefined || organizationId.trim().length === 0) {
      setLoading(false);
      setLoadError("An organization-scoped route is required to load submissions.");
      return () => {
        active = false;
      };
    }
    setLoading(true);
    setLoadError(null);
    const controller = new AbortController();

    void loadCanonicalSubmissionList(baseUrl, organizationId, eventId, controller.signal)

      .then((records) => {
        if (!active) return null;
        const envelope = records.find((candidate) => candidate.submission.id === submissionId);
        return envelope === undefined ? null : enrichCanonicalSubmission(baseUrl, envelope);
      })
      .then((loaded) => {
        if (active) setSubmission(loaded);
      })
      .catch((reason: unknown) => {
        if (active) {
          setLoadError(
            reason instanceof Error ? reason.message : "Submission could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort(`Submission load attempt ${reloadVersion} was superseded.`);
    };
  }, [baseUrl, eventId, organizationId, reloadVersion, submissionId]);

  if (loading) {
    return (
      <div className={styles.workspaceRoot}>
        <div className={styles.notFound} role="status">
          <p className={styles.eyebrow}>Organizer workspace</p>
          <h1>Loading submission</h1>
          <p>Loading this submission.</p>
        </div>
      </div>
    );
  }
  if (!submission) {
    return (
      <div className={styles.workspaceRoot}>
        <div className={styles.notFound} role="alert">
          <p className={styles.eyebrow}>Organizer workspace</p>
          <h1>Submission not found</h1>
          <p>{loadError ?? "This submission is not part of the selected event."}</p>
          <Link className={styles.primaryLink} href={submissionListHref(eventId, organizationId)}>
            Back to submissions
          </Link>
        </div>
      </div>
    );
  }
  const submittedReviewRead = submission.submittedReviewRead ?? {
    status: "ready",
    count: submission.reviewAssignments.filter((assignment) => assignment.status === "complete")
      .length,
  };

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
            <Link href={submissionListHref(eventId, organizationId)}>Submissions</Link>
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
        <Link className={styles.backLink} href={submissionListHref(eventId, organizationId)}>
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

            <DecisionControl
              submission={submission}
              baseUrl={baseUrl}
              onSaved={(decision) => {
                setSubmission((current) =>
                  current === null
                    ? current
                    : {
                        ...current,
                        decision,
                        status: decisionSubmissionStatus(decision.status),
                        reviewSummary: {
                          ...current.reviewSummary,
                          recommendation: `${decision.status[0]?.toLocaleUpperCase() ?? ""}${decision.status.slice(1)}`,
                        },
                      },
                );
              }}
            />
            <AcceptedHandoffSummary submission={submission} />
            <ReopenControl submission={submission} baseUrl={baseUrl} />
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
                        {participant.role}
                        {participant.organization ? ` · ${participant.organization}` : ""}
                      </span>
                      <a href={`mailto:${participant.email}`}>{participant.email}</a>
                      {participant.biography ? (
                        <span>Biography: {participant.biography}</span>
                      ) : null}
                      {Object.entries(participant.answers ?? {}).map(([question, answer]) => (
                        <span key={`${participant.id}-${question}`}>
                          {question}: {answerText(answer) ?? "—"}
                        </span>
                      ))}
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
              {submittedReviewRead.status === "error" ? (
                <div className={styles.auditCallout} role="alert">
                  <p>Submitted reviews could not be loaded: {submittedReviewRead.message}</p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setReloadVersion((current) => current + 1)}
                  >
                    Retry submitted reviews
                  </Button>
                </div>
              ) : submittedReviewRead.count === 0 ? (
                <p className={styles.mutedText}>No submitted reviews yet.</p>
              ) : null}
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
                    {assignment.criterionScores && assignment.criterionScores.length > 0 ? (
                      <ul>
                        {assignment.criterionScores.map((score) => (
                          <li key={score.criterion}>
                            {score.criterion}: {score.value}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {assignment.comment ? (
                      <p className={styles.mutedText}>Reviewer comment: {assignment.comment}</p>
                    ) : null}
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

function ReopenControl({
  submission,
  baseUrl,
}: Readonly<{ submission: SubmissionRecord; baseUrl: string }>) {
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = reason.trim().length >= 10 && confirmed;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      await evaluationRequest(
        baseUrl,
        `/events/${encodeURIComponent(submission.eventId)}/submissions/${encodeURIComponent(submission.id)}/reopen`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedVersion: submission.version,
            reason: reason.trim(),
            idempotencyKey: `web-reopen-${crypto.randomUUID()}`,
          }),
        },
      );
      setSaved(true);
    } catch (reasonValue: unknown) {
      setError(
        reasonValue instanceof Error
          ? reasonValue.message
          : "The reopen request could not be saved.",
      );
    } finally {
      setBusy(false);
    }
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
      <p className={styles.mutedText} role="note">
        After the CFP close date, the public portal shows a closed message and speaker edits are
        read-only. This audited reopen is the only organizer path to permit a post-close change.
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
        {error ? (
          <p className={styles.formError} role="alert">
            {error}
          </p>
        ) : null}
        <button
          className={styles.dangerButton}
          type="submit"
          disabled={!canSubmit || busy || saved}
        >
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
