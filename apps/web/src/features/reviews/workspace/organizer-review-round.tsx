import type { RoundStatus } from "./organizer-round-status";
import type { RubricCriterion } from "./scorecard-rubric-criterion";

export interface ReviewRound {
  sequence?: number | undefined;
  id: string;
  name: string;
  status: RoundStatus;
  readonly roundRevision?: number | undefined;
  readonly rubricRevision?: number | undefined;
  opensAt: string;
  opensAtIso?: string | undefined;
  closesAt: string;
  closesAtIso?: string | undefined;
  aiTriageEnabled?: boolean | undefined;
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
