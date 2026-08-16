export interface AirtableInboundChangeClaim {
  id: string;
  organizationId: string;
  connectionId: string;
  registrationId: string;
  baseTransactionNumber: number;
  tableId: string;
  recordId: string;
  fieldId: string;
  entityType: string | null;
  applicationId: string | null;
  sourceValueJson: string;
  sourceHash: string;
  attemptCount: number;
  claimToken: string;
}

export interface AirtableInboundProjection {
  connectionId: string;
  tableId: string;
  entityType: string;
  inboundFieldIds: readonly string[];
}

export interface AirtableInboundRecordMapping {
  id: string;
  connectionId: string;
  tableId: string;
  recordId: string;
  entityType: string;
  applicationId: string;
  lastExportedVersion: number | null;
  lastExportedHash: string | null;
  lastObservedHash: string | null;
  mappingVersion: number;
}

export interface ClaimAirtableInboundChangeInput {
  claimOwner: string;
  claimToken: string;
  claimedAt: string;
  leaseExpiresAt: string;
}

export type AirtableInboundCompletionState = "applied" | "noop" | "cancelled" | "retry" | "dead";

export interface CompleteAirtableInboundChangeInput {
  changeId: string;
  claimToken: string;
  state: AirtableInboundCompletionState;
  updatedAt: string;
  completedAt: string | null;
  availableAt: string | null;
  lastError: string | null;
  observedHash: string | null;
  mappingId: string | null;
  expectedMappingVersion: number | null;
  resultingD1Version: number | null;
}

export interface CreateAirtableInboundConflictInput {
  conflictId: string;
  changeId: string;
  claimToken: string;
  organizationId: string;
  connectionId: string;
  entityType: string;
  applicationId: string;
  fieldId: string;
  sourceTransaction: number;
  d1Version: number;
  d1ValueJson: string;
  airtableValueJson: string;
  detectedAt: string;
  mappingId: string;
  expectedMappingVersion: number;
  observedHash: string;
}

export type CreateAirtableInboundConflictResult =
  | {
      kind: "recorded";
      conflictId: string;
    }
  | {
      kind: "lease_lost";
    };

export interface AirtableInboundChangeStore {
  claimNext(input: ClaimAirtableInboundChangeInput): Promise<AirtableInboundChangeClaim | null>;

  findEnabledProjection(input: {
    connectionId: string;
    tableId: string;
  }): Promise<AirtableInboundProjection | null>;

  findRecordMapping(input: {
    connectionId: string;
    tableId: string;
    recordId: string;
  }): Promise<AirtableInboundRecordMapping | null>;

  /** Completes or reschedules a claim only when its claim token still owns it. */
  complete(input: CompleteAirtableInboundChangeInput): Promise<boolean>;

  /** Creates/coalesces the open conflict and completes the inbound claim atomically. */
  createConflict(
    input: CreateAirtableInboundConflictInput,
  ): Promise<CreateAirtableInboundConflictResult>;
}

export interface AirtableInboundFieldSnapshot {
  version: number;
  valueJson: string;
  valueHash: string;
}

export type ApplyAirtableInboundValueResult =
  | {
      kind: "applied";
      version: number;
    }
  | {
      kind: "version_conflict";
      current: AirtableInboundFieldSnapshot;
    };

export interface AirtableInboundDomainCommands {
  readField(input: {
    organizationId: string;
    entityType: string;
    applicationId: string;
    fieldId: string;
  }): Promise<AirtableInboundFieldSnapshot>;

  /** commandId makes an application retry return the original result without reapplying. */
  applyValue(input: {
    commandId: string;
    organizationId: string;
    entityType: string;
    applicationId: string;
    fieldId: string;
    valueJson: string;
    expectedVersion: number;
  }): Promise<ApplyAirtableInboundValueResult>;
}

export interface AirtableInboundTranslation {
  valueJson: string;
  valueHash: string;
}

export interface AirtableInboundTranslator {
  translate(input: {
    sourceValue: unknown;
    organizationId: string;
    connectionId: string;
    entityType: string;
    applicationId: string;
    fieldId: string;
  }): Promise<AirtableInboundTranslation>;
}

export interface AirtableInboundTranslatorRegistry {
  get(entityType: string, fieldId: string): AirtableInboundTranslator | null;
}

export interface AirtableInboundChangeWorkerDependencies {
  changes: AirtableInboundChangeStore;
  domain: AirtableInboundDomainCommands;
  translators: AirtableInboundTranslatorRegistry;
  createClaimToken: () => string;
  createConflictId: (changeId: string) => string;
  now: () => Date;
}

export interface RunAirtableInboundChangeWorkerOptions {
  workerId: string;
  leaseDurationMs: number;
  retryDelayMs: number;
  maxAttempts: number;
}

export type AirtableInboundNoopReason =
  | "field_not_allowed"
  | "export_echo"
  | "already_observed"
  | "value_unchanged";

export type AirtableInboundChangeWorkerResult =
  | {
      kind: "idle";
    }
  | {
      kind: "applied";
      changeId: string;
      version: number;
    }
  | {
      kind: "noop";
      changeId: string;
      reason: AirtableInboundNoopReason;
    }
  | {
      kind: "conflict";
      changeId: string;
      conflictId: string;
    }
  | {
      kind: "cancelled";
      changeId: string;
      reason: "projection_not_found" | "mapping_not_found";
    }
  | {
      kind: "retry";
      changeId: string;
    }
  | {
      kind: "dead";
      changeId: string;
    }
  | {
      kind: "lease_lost";
      changeId: string;
    };

export class PermanentAirtableInboundError extends Error {
  override readonly name = "PermanentAirtableInboundError";
}

export async function runAirtableInboundChangeWorkerOnce(
  dependencies: AirtableInboundChangeWorkerDependencies,
  options: RunAirtableInboundChangeWorkerOptions,
): Promise<AirtableInboundChangeWorkerResult> {
  validateOptions(options);

  const claimToken = dependencies.createClaimToken();
  if (claimToken.length === 0) {
    throw new Error("createClaimToken must return a non-empty token");
  }

  const claimedAt = dependencies.now();
  const change = await dependencies.changes.claimNext({
    claimOwner: options.workerId,
    claimToken,
    claimedAt: claimedAt.toISOString(),
    leaseExpiresAt: addMilliseconds(claimedAt, options.leaseDurationMs),
  });

  if (change === null) {
    return { kind: "idle" };
  }

  try {
    return await processClaim(dependencies, change);
  } catch (error) {
    return rescheduleClaim(dependencies, options, change, error);
  }
}

async function processClaim(
  dependencies: AirtableInboundChangeWorkerDependencies,
  change: AirtableInboundChangeClaim,
): Promise<AirtableInboundChangeWorkerResult> {
  const projection = await dependencies.changes.findEnabledProjection({
    connectionId: change.connectionId,
    tableId: change.tableId,
  });

  if (projection === null) {
    return completeCancelled(dependencies, change, "projection_not_found");
  }

  if (!projection.inboundFieldIds.includes(change.fieldId)) {
    return completeNoop(dependencies, change, null, "field_not_allowed");
  }

  const mapping = await dependencies.changes.findRecordMapping({
    connectionId: change.connectionId,
    tableId: change.tableId,
    recordId: change.recordId,
  });

  if (mapping === null) {
    return completeCancelled(dependencies, change, "mapping_not_found");
  }

  assertMappingMatchesChange(change, projection, mapping);

  if (mapping.lastExportedHash === change.sourceHash) {
    return completeNoop(dependencies, change, mapping, "export_echo");
  }

  if (mapping.lastObservedHash === change.sourceHash) {
    return completeNoop(dependencies, change, mapping, "already_observed");
  }

  const translator = dependencies.translators.get(mapping.entityType, change.fieldId);
  if (translator === null) {
    throw new PermanentAirtableInboundError(
      `No inbound translator for ${mapping.entityType}.${change.fieldId}`,
    );
  }

  const translated = await translator.translate({
    sourceValue: parseSourceValue(change.sourceValueJson),
    organizationId: change.organizationId,
    connectionId: change.connectionId,
    entityType: mapping.entityType,
    applicationId: mapping.applicationId,
    fieldId: change.fieldId,
  });
  assertTranslation(translated);

  const current = await dependencies.domain.readField({
    organizationId: change.organizationId,
    entityType: mapping.entityType,
    applicationId: mapping.applicationId,
    fieldId: change.fieldId,
  });
  assertSnapshot(current);

  if (translated.valueHash === current.valueHash) {
    return completeNoop(dependencies, change, mapping, "value_unchanged");
  }

  if (mapping.lastExportedVersion === null || mapping.lastExportedVersion !== current.version) {
    return createConflict(dependencies, change, mapping, current, translated);
  }

  const applied = await dependencies.domain.applyValue({
    commandId: createApplyCommandId(change.id),
    organizationId: change.organizationId,
    entityType: mapping.entityType,
    applicationId: mapping.applicationId,
    fieldId: change.fieldId,
    valueJson: translated.valueJson,
    expectedVersion: current.version,
  });

  if (applied.kind === "version_conflict") {
    assertSnapshot(applied.current);
    return createConflict(dependencies, change, mapping, applied.current, translated);
  }

  assertPositiveVersion(applied.version, "applied version");
  const completedAt = dependencies.now().toISOString();
  const completed = await dependencies.changes.complete({
    changeId: change.id,
    claimToken: change.claimToken,
    state: "applied",
    updatedAt: completedAt,
    completedAt,
    availableAt: null,
    lastError: null,
    observedHash: change.sourceHash,
    mappingId: mapping.id,
    expectedMappingVersion: mapping.mappingVersion,
    resultingD1Version: applied.version,
  });

  if (!completed) {
    return { kind: "lease_lost", changeId: change.id };
  }

  return {
    kind: "applied",
    changeId: change.id,
    version: applied.version,
  };
}

async function createConflict(
  dependencies: AirtableInboundChangeWorkerDependencies,
  change: AirtableInboundChangeClaim,
  mapping: AirtableInboundRecordMapping,
  current: AirtableInboundFieldSnapshot,
  translated: AirtableInboundTranslation,
): Promise<AirtableInboundChangeWorkerResult> {
  const conflictId = dependencies.createConflictId(change.id);
  if (conflictId.length === 0) {
    throw new Error("createConflictId must return a non-empty identifier");
  }

  const result = await dependencies.changes.createConflict({
    conflictId,
    changeId: change.id,
    claimToken: change.claimToken,
    organizationId: change.organizationId,
    connectionId: change.connectionId,
    entityType: mapping.entityType,
    applicationId: mapping.applicationId,
    fieldId: change.fieldId,
    sourceTransaction: change.baseTransactionNumber,
    d1Version: current.version,
    d1ValueJson: current.valueJson,
    airtableValueJson: translated.valueJson,
    detectedAt: dependencies.now().toISOString(),
    mappingId: mapping.id,
    expectedMappingVersion: mapping.mappingVersion,
    observedHash: change.sourceHash,
  });

  if (result.kind === "lease_lost") {
    return { kind: "lease_lost", changeId: change.id };
  }

  return {
    kind: "conflict",
    changeId: change.id,
    conflictId: result.conflictId,
  };
}

async function completeNoop(
  dependencies: AirtableInboundChangeWorkerDependencies,
  change: AirtableInboundChangeClaim,
  mapping: AirtableInboundRecordMapping | null,
  reason: AirtableInboundNoopReason,
): Promise<AirtableInboundChangeWorkerResult> {
  const completedAt = dependencies.now().toISOString();
  const completed = await dependencies.changes.complete({
    changeId: change.id,
    claimToken: change.claimToken,
    state: "noop",
    updatedAt: completedAt,
    completedAt,
    availableAt: null,
    lastError: null,
    observedHash: mapping === null ? null : change.sourceHash,
    mappingId: mapping?.id ?? null,
    expectedMappingVersion: mapping?.mappingVersion ?? null,
    resultingD1Version: null,
  });

  if (!completed) {
    return { kind: "lease_lost", changeId: change.id };
  }

  return { kind: "noop", changeId: change.id, reason };
}

async function completeCancelled(
  dependencies: AirtableInboundChangeWorkerDependencies,
  change: AirtableInboundChangeClaim,
  reason: "projection_not_found" | "mapping_not_found",
): Promise<AirtableInboundChangeWorkerResult> {
  const completedAt = dependencies.now().toISOString();
  const completed = await dependencies.changes.complete({
    changeId: change.id,
    claimToken: change.claimToken,
    state: "cancelled",
    updatedAt: completedAt,
    completedAt,
    availableAt: null,
    lastError: null,
    observedHash: null,
    mappingId: null,
    expectedMappingVersion: null,
    resultingD1Version: null,
  });

  if (!completed) {
    return { kind: "lease_lost", changeId: change.id };
  }

  return { kind: "cancelled", changeId: change.id, reason };
}

async function rescheduleClaim(
  dependencies: AirtableInboundChangeWorkerDependencies,
  options: RunAirtableInboundChangeWorkerOptions,
  change: AirtableInboundChangeClaim,
  error: unknown,
): Promise<AirtableInboundChangeWorkerResult> {
  const failedAt = dependencies.now();
  const isDead =
    error instanceof PermanentAirtableInboundError || change.attemptCount >= options.maxAttempts;
  const completed = await dependencies.changes.complete({
    changeId: change.id,
    claimToken: change.claimToken,
    state: isDead ? "dead" : "retry",
    updatedAt: failedAt.toISOString(),
    completedAt: isDead ? failedAt.toISOString() : null,
    availableAt: isDead ? null : addMilliseconds(failedAt, options.retryDelayMs),
    lastError: errorMessage(error),
    observedHash: null,
    mappingId: null,
    expectedMappingVersion: null,
    resultingD1Version: null,
  });

  if (!completed) {
    return { kind: "lease_lost", changeId: change.id };
  }

  return {
    kind: isDead ? "dead" : "retry",
    changeId: change.id,
  };
}

function assertMappingMatchesChange(
  change: AirtableInboundChangeClaim,
  projection: AirtableInboundProjection,
  mapping: AirtableInboundRecordMapping,
): void {
  const mismatches = [
    projection.connectionId !== change.connectionId,
    projection.tableId !== change.tableId,
    projection.entityType !== mapping.entityType,
    mapping.connectionId !== change.connectionId,
    mapping.tableId !== change.tableId,
    mapping.recordId !== change.recordId,
    change.entityType !== null && change.entityType !== mapping.entityType,
    change.applicationId !== null && change.applicationId !== mapping.applicationId,
  ];

  if (mismatches.some(Boolean)) {
    throw new PermanentAirtableInboundError(
      `Inbound change ${change.id} does not match its projection mapping`,
    );
  }
}

function parseSourceValue(sourceValueJson: string): unknown {
  try {
    return JSON.parse(sourceValueJson) as unknown;
  } catch {
    throw new PermanentAirtableInboundError("Inbound source value is not valid JSON");
  }
}

function assertTranslation(translation: AirtableInboundTranslation): void {
  if (translation.valueHash.length === 0) {
    throw new PermanentAirtableInboundError("Inbound translator returned an empty value hash");
  }

  try {
    JSON.parse(translation.valueJson);
  } catch {
    throw new PermanentAirtableInboundError("Inbound translator returned invalid JSON");
  }
}

function assertSnapshot(snapshot: AirtableInboundFieldSnapshot): void {
  assertPositiveVersion(snapshot.version, "D1 version");
  if (snapshot.valueHash.length === 0) {
    throw new Error("D1 field snapshot has an empty value hash");
  }

  JSON.parse(snapshot.valueJson);
}

function assertPositiveVersion(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}

function createApplyCommandId(changeId: string): string {
  return `airtable-inbound:${changeId}`;
}

function addMilliseconds(date: Date, milliseconds: number): string {
  return new Date(date.getTime() + milliseconds).toISOString();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function validateOptions(options: RunAirtableInboundChangeWorkerOptions): void {
  assertPositiveInteger(options.leaseDurationMs, "leaseDurationMs");
  assertPositiveInteger(options.retryDelayMs, "retryDelayMs");
  assertPositiveInteger(options.maxAttempts, "maxAttempts");
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}
