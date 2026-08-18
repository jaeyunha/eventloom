"use client";

import type { ApiAssignment } from "./api-api-assignment";
import type { ReviewPlanAssignment } from "./assignment-review-plan-assignment";
import type { AggregateParticipant } from "./organizer-aggregate-participant";
import type { ReviewRound } from "./organizer-review-round";

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
}
