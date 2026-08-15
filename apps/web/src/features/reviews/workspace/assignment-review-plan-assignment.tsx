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
