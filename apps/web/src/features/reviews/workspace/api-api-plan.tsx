import type { PlanStatus } from "./organizer-plan-status";
import type { RubricCriterion } from "./scorecard-rubric-criterion";

export interface ApiPlan {
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
    aiTriageEnabled?: boolean | undefined;
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
