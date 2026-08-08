export const portalSubmissionStatuses = [
  "draft",
  "submitted",
  "under_review",
  "accepted",
  "declined",
  "withdrawn",
] as const;

export type PortalSubmissionStatus = (typeof portalSubmissionStatuses)[number];

export const portalTaskStatuses = [
  "not_started",
  "in_progress",
  "submitted",
  "needs_changes",
  "completed",
  "waived",
  "overdue",
  "reopened",
] as const;

export type PortalTaskStatus = (typeof portalTaskStatuses)[number];
export type PortalTaskType = "form" | "upload" | "action";
export type PortalAssetKind = "headshot" | "slides" | "supporting_file";

export interface PortalSubmission {
  id: string;
  eventId: string;
  title: string;
  status: PortalSubmissionStatus;
  participantIds: readonly string[];
  updatedAt: string;
}

export interface PortalProfile {
  id: string;
  eventId: string;
  participantId: string;
  displayName: string;
  biography: string;
  headshotAssetId?: string;
  version: number;
  updatedAt: string;
}

export interface PortalTask {
  id: string;
  eventId: string;
  submissionId: string;
  participantId: string;
  type: PortalTaskType;
  owner: "speaker" | "organizer";
  title: string;
  description?: string;
  status: PortalTaskStatus;
  dueAt?: string;
  dependencyIds: readonly string[];
  reminderOffsetsMinutes: readonly number[];
  acceptedAssetKinds?: readonly PortalAssetKind[];
  version: number;
  updatedAt: string;
}

export interface PortalView {
  submissions: PortalSubmission[];
  profiles: PortalProfile[];
  tasks: PortalTask[];
  outstandingTaskCount: number;
}

export interface PortalUploadAuthorization {
  asset: {
    id: string;
  };
  grant: {
    method: "PUT";
    url: string;
    headers: Readonly<Record<string, string>>;
    expiresAt: string;
  };
}

export interface PortalErrorResponse {
  error?: {
    code?: string;
    message?: string;
    traceId?: string;
  };
}
