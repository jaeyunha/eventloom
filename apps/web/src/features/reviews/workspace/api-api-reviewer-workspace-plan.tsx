import type { PlanStatus } from "./organizer-plan-status";

export interface ApiReviewerWorkspacePlan {
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
