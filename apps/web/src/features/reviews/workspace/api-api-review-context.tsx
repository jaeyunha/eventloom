"use client";

import type { ApiPlan } from "./api-api-plan";
import type { ReviewPlanAssignment } from "./assignment-review-plan-assignment";

export interface ApiReviewContext {
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
}
