import type { AirtableSyncJob, AirtableSyncJobInput } from "../sync/contracts";

export type AirtableProjectionConnectionStatus =
  | "disconnected"
  | "authorizing"
  | "connected"
  | "refreshing"
  | "paused"
  | "reauthorization_required"
  | "disconnecting";

export interface AirtableProjectionConnection {
  id: string;
  organizationId: string;
  version: number;
  status: AirtableProjectionConnectionStatus;
}

export interface InitialExportCheckpoint {
  connectionId: string;
  entityType: string;
  cursorApplicationId: string | null;
  state: "pending" | "running" | "completed" | "failed";
  scannedCount: number;
  enqueuedCount: number;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface ProjectionSourceEntity {
  applicationId: string;
  sourceVersion: number;
  payloadJson: string;
}

export interface ProjectionSourcePage {
  entities: readonly ProjectionSourceEntity[];
  nextCursorApplicationId: string | null;
}

export interface AirtableRecordMappingForReconciliation {
  connectionId: string;
  organizationId: string;
  entityType: string;
  applicationId: string;
  tableId: string;
  recordId: string;
  mappingVersion: number;
  lastExportedVersion: number | null;
}

export interface RecordMappingPage {
  mappings: readonly AirtableRecordMappingForReconciliation[];
  nextCursor: string | null;
}

export interface AirtableProjectionConnectionStore {
  getConnection(connectionId: string): Promise<AirtableProjectionConnection | null>;
}

export interface InitialExportCheckpointStore {
  get(connectionId: string, entityType: string): Promise<InitialExportCheckpoint | null>;
  save(checkpoint: InitialExportCheckpoint): Promise<void>;
}

export interface ProjectionSourceProvider {
  listEntities(input: {
    connectionId: string;
    entityType: string;
    afterApplicationId: string | null;
    limit: number;
  }): Promise<ProjectionSourcePage>;
}

export interface ProjectionRecordProvider {
  findExistingRecordIds(input: {
    connectionId: string;
    tableId: string;
    recordIds: readonly string[];
  }): Promise<ReadonlySet<string>>;
}

export interface ProjectionMappingStore {
  listMappings(input: {
    connectionId: string;
    afterCursor: string | null;
    limit: number;
  }): Promise<RecordMappingPage>;
}

export interface ProjectionSyncJobStore {
  enqueue(job: AirtableSyncJobInput): Promise<boolean>;
  claim(input: {
    connectionId: string;
    connectionVersion: number;
    owner: string;
    limit: number;
    now: string;
    leaseExpiresAt: string;
  }): Promise<readonly AirtableSyncJob[]>;
}

export type ReconciliationSkipReason =
  | "connection_not_found"
  | "connection_inactive"
  | "already_completed";

export type InitialExportPageResult =
  | {
      kind: "processed";
      checkpoint: InitialExportCheckpoint;
      scanned: number;
      enqueued: number;
    }
  | { kind: "skipped"; reason: ReconciliationSkipReason };

export interface ReconciliationDependencies {
  connections: AirtableProjectionConnectionStore;
  jobs: ProjectionSyncJobStore;
  now: () => string;
}

function activeConnection(
  connection: AirtableProjectionConnection | null,
): connection is AirtableProjectionConnection {
  return connection?.status === "connected";
}

export async function processInitialExportPage(
  input: { connectionId: string; entityType: string; pageSize: number },
  dependencies: ReconciliationDependencies & {
    checkpoints: InitialExportCheckpointStore;
    source: ProjectionSourceProvider;
  },
): Promise<InitialExportPageResult> {
  const connection = await dependencies.connections.getConnection(input.connectionId);
  if (connection === null) {
    return { kind: "skipped", reason: "connection_not_found" };
  }
  if (!activeConnection(connection)) {
    return { kind: "skipped", reason: "connection_inactive" };
  }

  const existing = await dependencies.checkpoints.get(input.connectionId, input.entityType);
  if (existing?.state === "completed") {
    return { kind: "skipped", reason: "already_completed" };
  }

  const now = dependencies.now();
  const checkpoint: InitialExportCheckpoint = existing ?? {
    connectionId: input.connectionId,
    entityType: input.entityType,
    cursorApplicationId: null,
    state: "pending",
    scannedCount: 0,
    enqueuedCount: 0,
    startedAt: now,
    updatedAt: now,
    completedAt: null,
  };
  const page = await dependencies.source.listEntities({
    connectionId: input.connectionId,
    entityType: input.entityType,
    afterApplicationId: checkpoint.cursorApplicationId,
    limit: input.pageSize,
  });

  let enqueued = 0;
  for (const entity of page.entities) {
    const inserted = await dependencies.jobs.enqueue({
      connectionId: connection.id,
      organizationId: connection.organizationId,
      entityType: input.entityType,
      applicationId: entity.applicationId,
      sourceVersion: entity.sourceVersion,
      operation: "upsert",
      payloadJson: entity.payloadJson,
      availableAt: now,
    });
    if (inserted) enqueued += 1;
  }

  const completed = page.nextCursorApplicationId === null;
  const updated: InitialExportCheckpoint = {
    ...checkpoint,
    cursorApplicationId: page.nextCursorApplicationId,
    state: completed ? "completed" : "running",
    scannedCount: checkpoint.scannedCount + page.entities.length,
    enqueuedCount: checkpoint.enqueuedCount + enqueued,
    updatedAt: now,
    completedAt: completed ? now : null,
  };
  await dependencies.checkpoints.save(updated);

  return {
    kind: "processed",
    checkpoint: updated,
    scanned: page.entities.length,
    enqueued,
  };
}

export type StaleMappingRepairResult =
  | { kind: "processed"; scanned: number; enqueued: number; nextCursor: string | null }
  | { kind: "skipped"; reason: "connection_not_found" | "connection_inactive" };

export async function enqueueStaleMappingRepairs(
  input: { connectionId: string; afterCursor: string | null; pageSize: number },
  dependencies: ReconciliationDependencies & {
    mappings: ProjectionMappingStore;
    records: ProjectionRecordProvider;
  },
): Promise<StaleMappingRepairResult> {
  const connection = await dependencies.connections.getConnection(input.connectionId);
  if (connection === null) {
    return { kind: "skipped", reason: "connection_not_found" };
  }
  if (!activeConnection(connection)) {
    return { kind: "skipped", reason: "connection_inactive" };
  }

  const page = await dependencies.mappings.listMappings({
    connectionId: input.connectionId,
    afterCursor: input.afterCursor,
    limit: input.pageSize,
  });
  const byTable = new Map<string, AirtableRecordMappingForReconciliation[]>();
  for (const mapping of page.mappings) {
    const mappings = byTable.get(mapping.tableId) ?? [];
    mappings.push(mapping);
    byTable.set(mapping.tableId, mappings);
  }

  const now = dependencies.now();
  let enqueued = 0;
  for (const [tableId, mappings] of byTable) {
    const existingIds = await dependencies.records.findExistingRecordIds({
      connectionId: input.connectionId,
      tableId,
      recordIds: mappings.map((mapping) => mapping.recordId),
    });
    for (const mapping of mappings) {
      if (existingIds.has(mapping.recordId)) continue;
      const inserted = await dependencies.jobs.enqueue({
        connectionId: mapping.connectionId,
        organizationId: mapping.organizationId,
        entityType: mapping.entityType,
        applicationId: mapping.applicationId,
        sourceVersion: mapping.lastExportedVersion ?? mapping.mappingVersion,
        operation: "reconcile",
        payloadJson: JSON.stringify({
          staleMappingId: `${mapping.tableId}:${mapping.recordId}`,
          tableId: mapping.tableId,
          recordId: mapping.recordId,
        }),
        availableAt: now,
      });
      if (inserted) enqueued += 1;
    }
  }

  return {
    kind: "processed",
    scanned: page.mappings.length,
    enqueued,
    nextCursor: page.nextCursor,
  };
}

export async function claimProjectionSyncJobs(
  input: {
    connectionId: string;
    owner: string;
    limit: number;
    now: string;
    leaseExpiresAt: string;
  },
  dependencies: Pick<ReconciliationDependencies, "connections" | "jobs">,
): Promise<readonly AirtableSyncJob[]> {
  const connection = await dependencies.connections.getConnection(input.connectionId);
  if (!activeConnection(connection)) return [];

  return dependencies.jobs.claim({
    ...input,
    connectionVersion: connection.version,
  });
}
