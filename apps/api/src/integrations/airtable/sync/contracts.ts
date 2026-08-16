export const airtableSyncOperations = ["upsert", "archive", "delete", "reconcile"] as const;

export type AirtableSyncOperation = (typeof airtableSyncOperations)[number];

export const airtableSyncJobStates = [
  "pending",
  "claimed",
  "retry",
  "succeeded",
  "dead",
  "cancelled",
] as const;

export type AirtableSyncJobState = (typeof airtableSyncJobStates)[number];

export interface AirtableSyncJobInput {
  connectionId: string;
  organizationId: string;
  entityType: string;
  applicationId: string;
  sourceVersion: number;
  operation: AirtableSyncOperation;
  payloadJson: string;
  availableAt: string;
}

export interface AirtableSyncJob extends AirtableSyncJobInput {
  id: string;
  state: AirtableSyncJobState;
  deduplicationKey: string;
  attempts: number;
  connectionVersion: number;
  claimOwner: string | null;
  claimToken: string | null;
  leaseExpiresAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export function createAirtableSyncDeduplicationKey(
  job: Pick<
    AirtableSyncJobInput,
    "connectionId" | "entityType" | "applicationId" | "sourceVersion" | "operation"
  >,
): string {
  return [
    job.connectionId,
    job.entityType,
    job.applicationId,
    job.sourceVersion,
    job.operation,
  ].join(":");
}
