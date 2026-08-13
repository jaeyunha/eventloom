import { type AirtableSyncJobInput, createAirtableSyncDeduplicationKey } from "./contracts";

export interface AirtableSyncJobRecord extends AirtableSyncJobInput {
  id: string;
  connectionVersion: number;
  createdAt: string;
  updatedAt: string;
}

export function createAirtableSyncJobRecord(input: {
  id: string;
  connectionVersion: number;
  createdAt: string;
  job: AirtableSyncJobInput;
}): AirtableSyncJobRecord & { deduplicationKey: string } {
  return {
    ...input.job,
    id: input.id,
    connectionVersion: input.connectionVersion,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    deduplicationKey: createAirtableSyncDeduplicationKey(input.job),
  };
}
