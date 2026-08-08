export const speakerTaskStatuses = [
  "not_started",
  "in_progress",
  "submitted",
  "needs_changes",
  "completed",
  "waived",
  "overdue",
  "reopened",
] as const;

export type SpeakerTaskStatus = (typeof speakerTaskStatuses)[number];

export type SpeakerTaskType = "form" | "upload" | "action";
export type SpeakerAssetKind = "headshot" | "slides" | "supporting_file";
export type SpeakerAssetState = "pending_upload" | "ready" | "rejected";
export type SpeakerSubmissionStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "accepted"
  | "declined"
  | "withdrawn";

export interface SpeakerAccessScope {
  submissionIds: readonly string[];
  participantIds: readonly string[];
}

export interface SpeakerSubmission {
  id: string;
  eventId: string;
  title: string;
  status: SpeakerSubmissionStatus;
  participantIds: readonly string[];
  updatedAt: string;
}

export interface SpeakerProfile {
  id: string;
  eventId: string;
  participantId: string;
  displayName: string;
  biography: string;
  headshotAssetId?: string;
  version: number;
  updatedAt: string;
}

export interface SpeakerTask {
  id: string;
  eventId: string;
  submissionId: string;
  participantId: string;
  type: SpeakerTaskType;
  owner: "speaker" | "organizer";
  title: string;
  description?: string;
  status: SpeakerTaskStatus;
  dueAt?: string;
  dependencyIds: readonly string[];
  reminderOffsetsMinutes: readonly number[];
  acceptedAssetKinds?: readonly SpeakerAssetKind[];
  version: number;
  updatedAt: string;
}

export interface SpeakerTaskTransition {
  id: string;
  eventId: string;
  taskId: string;
  participantId: string;
  actorAccountId: string;
  fromStatus: SpeakerTaskStatus;
  toStatus: SpeakerTaskStatus;
  note?: string;
  occurredAt: string;
}

export interface SpeakerAsset {
  id: string;
  eventId: string;
  participantId: string;
  taskId?: string;
  kind: SpeakerAssetKind;
  objectKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  state: SpeakerAssetState;
  createdAt: string;
}

export interface RepositoryMutationResult<T> {
  ok: true;
  value: T;
}

export interface RepositoryMutationFailure {
  ok: false;
  reason: "not_found" | "version_conflict" | "invalid_state";
}

export type RepositoryResult<T> = RepositoryMutationResult<T> | RepositoryMutationFailure;

export interface UpdateBiographyCommand {
  eventId: string;
  participantId: string;
  biography: string;
  expectedVersion: number;
  updatedAt: string;
}

export interface TransitionSpeakerTaskCommand {
  eventId: string;
  taskId: string;
  expectedVersion: number;
  fromStatus: SpeakerTaskStatus;
  toStatus: SpeakerTaskStatus;
  transition: SpeakerTaskTransition;
}

export interface SpeakerRepository {
  getAccessScope(eventId: string, accountId: string): Promise<SpeakerAccessScope>;
  listSubmissions(eventId: string, submissionIds: readonly string[]): Promise<SpeakerSubmission[]>;
  getSubmission(eventId: string, submissionId: string): Promise<SpeakerSubmission | null>;
  listProfiles(eventId: string, participantIds: readonly string[]): Promise<SpeakerProfile[]>;
  getProfile(eventId: string, participantId: string): Promise<SpeakerProfile | null>;
  updateBiography(command: UpdateBiographyCommand): Promise<RepositoryResult<SpeakerProfile>>;
  listTasks(eventId: string, participantIds: readonly string[]): Promise<SpeakerTask[]>;
  getTask(eventId: string, taskId: string): Promise<SpeakerTask | null>;
  getTasksByIds(eventId: string, taskIds: readonly string[]): Promise<SpeakerTask[]>;
  transitionTask(
    command: TransitionSpeakerTaskCommand,
  ): Promise<RepositoryResult<{ task: SpeakerTask; transition: SpeakerTaskTransition }>>;
  createPendingAsset(asset: SpeakerAsset): Promise<SpeakerAsset>;
  getAsset(eventId: string, assetId: string): Promise<SpeakerAsset | null>;
}

export interface CreatePrivateUploadGrantCommand {
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  expiresAt: string;
  private: true;
  requireMalwareScan: true;
  stripMetadata: boolean;
}

export interface PrivateUploadGrant {
  method: "PUT";
  url: string;
  headers: Readonly<Record<string, string>>;
  expiresAt: string;
}

export interface PrivateDownloadGrant {
  url: string;
  expiresAt: string;
}

export interface PrivateAssetGateway {
  createUploadGrant(command: CreatePrivateUploadGrantCommand): Promise<PrivateUploadGrant>;
  createDownloadGrant(command: {
    objectKey: string;
    fileName: string;
    expiresAt: string;
  }): Promise<PrivateDownloadGrant>;
}

export interface SpeakerPortalView {
  submissions: SpeakerSubmission[];
  profiles: SpeakerProfile[];
  tasks: SpeakerTask[];
  outstandingTaskCount: number;
}
