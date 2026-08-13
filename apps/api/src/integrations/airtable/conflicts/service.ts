export type AirtableConflictResolution = "use_d1" | "use_airtable" | "manual";

export interface AirtableSyncConflict {
  id: string;
  organizationId: string;
  connectionId: string;
  entityType: string;
  applicationId: string;
  fieldId: string;
  sourceTransaction: number;
  d1Version: number;
  d1ValueJson: string;
  airtableValueJson: string;
  status: "open" | "resolving" | "resolved";
  resolution: AirtableConflictResolution | null;
  resolverId: string | null;
  resolutionCommandId: string | null;
}

export interface BeginAirtableConflictResolutionInput {
  conflictId: string;
  organizationId: string;
  resolution: AirtableConflictResolution;
  resolverId: string;
  commandId: string;
  resolvingAt: string;
}

export type BeginAirtableConflictResolutionResult =
  | {
      kind: "started";
      conflict: AirtableSyncConflict;
    }
  | {
      kind: "replay";
      conflict: AirtableSyncConflict;
    }
  | {
      kind: "not_found";
    }
  | {
      kind: "command_reused";
    }
  | {
      kind: "already_resolving";
      conflict: AirtableSyncConflict;
    };

export interface CompleteAirtableConflictResolutionInput {
  conflictId: string;
  organizationId: string;
  commandId: string;
  resolvedAt: string;
}

export interface ReopenAirtableConflictResolutionInput {
  conflictId: string;
  organizationId: string;
  commandId: string;
}

export interface AirtableConflictStore {
  /** Claims an open conflict or returns the existing command for idempotent replay. */
  beginResolution(
    input: BeginAirtableConflictResolutionInput,
  ): Promise<BeginAirtableConflictResolutionResult>;

  completeResolution(input: CompleteAirtableConflictResolutionInput): Promise<boolean>;

  reopenResolution(input: ReopenAirtableConflictResolutionInput): Promise<boolean>;
}

export type AirtableConflictDomainWriteResult =
  | {
      kind: "applied";
      version: number;
    }
  | {
      kind: "already_applied";
      version: number;
    }
  | {
      kind: "version_conflict";
    };

export interface AirtableConflictDomainCommands {
  applyValue(input: {
    commandId: string;
    organizationId: string;
    entityType: string;
    applicationId: string;
    fieldId: string;
    valueJson: string;
    expectedVersion: number;
  }): Promise<AirtableConflictDomainWriteResult>;
}

export interface AirtableConflictProviderWriteResult {
  kind: "applied" | "already_applied";
}

export interface AirtableConflictProviderCommands {
  writeValue(input: {
    commandId: string;
    organizationId: string;
    connectionId: string;
    entityType: string;
    applicationId: string;
    fieldId: string;
    valueJson: string;
  }): Promise<AirtableConflictProviderWriteResult>;
}

export interface AirtableConflictManualValue {
  valueJson: string;
}

export interface AirtableConflictServiceDependencies {
  conflicts: AirtableConflictStore;
  domain: AirtableConflictDomainCommands;
  provider: AirtableConflictProviderCommands;
  now: () => Date;
}

export interface ResolveAirtableConflictInput {
  conflictId: string;
  organizationId: string;
  resolverId: string;
  commandId: string;
  resolution: AirtableConflictResolution;
  manualValue?: AirtableConflictManualValue;
}

export type ResolveAirtableConflictResult =
  | {
      kind: "resolved";
      conflictId: string;
      resolution: AirtableConflictResolution;
    }
  | {
      kind: "already_resolved";
      conflictId: string;
      resolution: AirtableConflictResolution;
    }
  | {
      kind: "not_found";
    }
  | {
      kind: "command_reused";
    }
  | {
      kind: "already_resolving";
      conflictId: string;
    }
  | {
      kind: "version_conflict";
      conflictId: string;
    };

export async function resolveAirtableConflict(
  dependencies: AirtableConflictServiceDependencies,
  input: ResolveAirtableConflictInput,
): Promise<ResolveAirtableConflictResult> {
  validateInput(input);

  const begun = await dependencies.conflicts.beginResolution({
    conflictId: input.conflictId,
    organizationId: input.organizationId,
    resolution: input.resolution,
    resolverId: input.resolverId,
    commandId: input.commandId,
    resolvingAt: dependencies.now().toISOString(),
  });

  if (begun.kind === "not_found" || begun.kind === "command_reused") {
    return { kind: begun.kind };
  }

  if (begun.kind === "already_resolving") {
    return {
      kind: "already_resolving",
      conflictId: begun.conflict.id,
    };
  }

  const conflict = begun.conflict;
  assertReplayMatchesInput(conflict, input);

  if (conflict.status === "resolved") {
    return {
      kind: "already_resolved",
      conflictId: conflict.id,
      resolution: input.resolution,
    };
  }

  try {
    const execution = await executeResolution(dependencies, conflict, input);

    if (execution === "version_conflict") {
      await dependencies.conflicts.reopenResolution({
        conflictId: conflict.id,
        organizationId: input.organizationId,
        commandId: input.commandId,
      });
      return { kind: "version_conflict", conflictId: conflict.id };
    }

    const completed = await dependencies.conflicts.completeResolution({
      conflictId: conflict.id,
      organizationId: input.organizationId,
      commandId: input.commandId,
      resolvedAt: dependencies.now().toISOString(),
    });

    if (!completed) {
      throw new Error(`Lost Airtable conflict resolution claim for ${conflict.id}`);
    }

    return {
      kind: begun.kind === "replay" ? "already_resolved" : "resolved",
      conflictId: conflict.id,
      resolution: input.resolution,
    };
  } catch (error) {
    await dependencies.conflicts.reopenResolution({
      conflictId: conflict.id,
      organizationId: input.organizationId,
      commandId: input.commandId,
    });
    throw error;
  }
}

async function executeResolution(
  dependencies: AirtableConflictServiceDependencies,
  conflict: AirtableSyncConflict,
  input: ResolveAirtableConflictInput,
): Promise<"applied" | "version_conflict"> {
  if (input.resolution === "use_d1") {
    await dependencies.provider.writeValue({
      commandId: input.commandId,
      organizationId: input.organizationId,
      connectionId: conflict.connectionId,
      entityType: conflict.entityType,
      applicationId: conflict.applicationId,
      fieldId: conflict.fieldId,
      valueJson: conflict.d1ValueJson,
    });
    return "applied";
  }

  const valueJson =
    input.resolution === "use_airtable" ? conflict.airtableValueJson : input.manualValue?.valueJson;
  if (valueJson === undefined) {
    throw new Error("Manual conflict resolution requires a value.");
  }
  const applied = await dependencies.domain.applyValue({
    commandId: input.commandId,
    organizationId: input.organizationId,
    entityType: conflict.entityType,
    applicationId: conflict.applicationId,
    fieldId: conflict.fieldId,
    valueJson,
    expectedVersion: conflict.d1Version,
  });

  return applied.kind === "version_conflict" ? "version_conflict" : "applied";
}

function validateInput(input: ResolveAirtableConflictInput): void {
  if (
    input.conflictId.length === 0 ||
    input.organizationId.length === 0 ||
    input.resolverId.length === 0 ||
    input.commandId.length === 0
  ) {
    throw new Error("conflictId, organizationId, resolverId, and commandId are required");
  }

  if (input.resolution === "manual") {
    if (input.manualValue === undefined) {
      throw new Error("manual resolution requires a manual value");
    }
    assertJson(input.manualValue.valueJson, "manual value");
  } else if (input.manualValue !== undefined) {
    throw new Error("manualValue is only valid for manual resolution");
  }
}

function assertReplayMatchesInput(
  conflict: AirtableSyncConflict,
  input: ResolveAirtableConflictInput,
): void {
  if (
    conflict.organizationId !== input.organizationId ||
    conflict.resolution !== input.resolution ||
    conflict.resolverId !== input.resolverId ||
    conflict.resolutionCommandId !== input.commandId
  ) {
    throw new Error(
      `Conflict resolution command ${input.commandId} does not match its original request`,
    );
  }
}

function assertJson(valueJson: string, name: string): void {
  try {
    JSON.parse(valueJson);
  } catch {
    throw new Error(`${name} must be valid JSON`);
  }
}
