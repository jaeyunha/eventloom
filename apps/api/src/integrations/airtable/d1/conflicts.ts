import type {
  AirtableConflictStore,
  AirtableSyncConflict,
  BeginAirtableConflictResolutionInput,
  BeginAirtableConflictResolutionResult,
  CompleteAirtableConflictResolutionInput,
  ReopenAirtableConflictResolutionInput,
} from "../conflicts/service";
import type { AirtableD1Database } from "./adapters";

type Row = Record<string, unknown>;

export interface AirtableConflictListItem extends AirtableSyncConflict {
  detectedAt: string;
  resolvingAt: string | null;
  resolvedAt: string | null;
}

export interface ListAirtableConflictsInput {
  organizationId: string;
  connectionId: string;
}

export class D1AirtableConflictStore implements AirtableConflictStore {
  constructor(private readonly db: AirtableD1Database) {}

  async beginResolution(
    input: BeginAirtableConflictResolutionInput,
  ): Promise<BeginAirtableConflictResolutionResult> {
    const claimed = mapConflict(
      await this.db
        .prepare(`UPDATE airtable_sync_conflicts SET
          status = 'resolving', resolution = ?, resolver_id = ?, resolving_at = ?,
          resolved_at = NULL, resolution_command_id = ?
        WHERE id = ? AND organization_id = ? AND status = 'open'
          AND NOT EXISTS (
            SELECT 1 FROM airtable_sync_conflicts AS command_conflict
            WHERE command_conflict.connection_id = airtable_sync_conflicts.connection_id
              AND command_conflict.resolution_command_id = ?
          )
        RETURNING *`)
        .bind(
          input.resolution,
          input.resolverId,
          input.resolvingAt,
          input.commandId,
          input.conflictId,
          input.organizationId,
          input.commandId,
        )
        .first<Row>(),
    );
    if (claimed !== null) return { kind: "started", conflict: claimed };

    const conflict = mapConflict(
      await this.db
        .prepare(`SELECT * FROM airtable_sync_conflicts
          WHERE id = ? AND organization_id = ?`)
        .bind(input.conflictId, input.organizationId)
        .first<Row>(),
    );
    if (conflict === null) return { kind: "not_found" };

    if (conflict.resolutionCommandId === input.commandId) {
      return { kind: "replay", conflict };
    }

    const reusedCommand = await this.db
      .prepare(`SELECT id FROM airtable_sync_conflicts
        WHERE connection_id = ? AND resolution_command_id = ? LIMIT 1`)
      .bind(conflict.connectionId, input.commandId)
      .first<Row>();
    if (reusedCommand !== null) return { kind: "command_reused" };

    return { kind: "already_resolving", conflict };
  }

  async completeResolution(input: CompleteAirtableConflictResolutionInput): Promise<boolean> {
    const result = await this.db
      .prepare(`UPDATE airtable_sync_conflicts SET
        status = 'resolved', resolved_at = ?
      WHERE id = ? AND organization_id = ? AND status = 'resolving'
        AND resolution_command_id = ?`)
      .bind(input.resolvedAt, input.conflictId, input.organizationId, input.commandId)
      .run();
    return changed(result);
  }

  async reopenResolution(input: ReopenAirtableConflictResolutionInput): Promise<boolean> {
    const result = await this.db
      .prepare(`UPDATE airtable_sync_conflicts SET
        status = 'open', resolution = NULL, resolver_id = NULL,
        resolving_at = NULL, resolved_at = NULL, resolution_command_id = NULL
      WHERE id = ? AND organization_id = ? AND status = 'resolving'
        AND resolution_command_id = ?`)
      .bind(input.conflictId, input.organizationId, input.commandId)
      .run();
    return changed(result);
  }

  async listByOrganizationAndConnection(
    input: ListAirtableConflictsInput,
  ): Promise<AirtableConflictListItem[]> {
    const result = await this.db
      .prepare(`SELECT * FROM airtable_sync_conflicts
        WHERE organization_id = ? AND connection_id = ?
          AND status IN ('open', 'resolving')
        ORDER BY detected_at DESC, id ASC`)
      .bind(input.organizationId, input.connectionId)
      .run<Row>();

    return (result.results ?? []).map(requireConflictListItem);
  }
}

function mapConflict(row: Row | null): AirtableSyncConflict | null {
  if (row === null) return null;
  return {
    id: text(row.id),
    organizationId: text(row.organization_id),
    connectionId: text(row.connection_id),
    entityType: text(row.entity_type),
    applicationId: text(row.application_id),
    fieldId: text(row.field_id),
    sourceTransaction: integer(row.source_transaction),
    d1Version: integer(row.d1_version),
    d1ValueJson: text(row.d1_value_json),
    airtableValueJson: text(row.airtable_value_json),
    status: conflictStatus(row.status),
    resolution: conflictResolution(row.resolution),
    resolverId: nullableText(row.resolver_id),
    resolutionCommandId: nullableText(row.resolution_command_id),
  };
}

function requireConflictListItem(row: Row): AirtableConflictListItem {
  const conflict = mapConflict(row);
  if (conflict === null) throw new Error("Invalid empty Airtable D1 conflict row");
  return {
    ...conflict,
    detectedAt: text(row.detected_at),
    resolvingAt: nullableText(row.resolving_at),
    resolvedAt: nullableText(row.resolved_at),
  };
}

function changed(result: { meta?: { changes?: number } }): boolean {
  return (result.meta?.changes ?? 0) > 0;
}

function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("Invalid Airtable D1 text column");
  return value;
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : text(value);
}

function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error("Invalid Airtable D1 integer column");
  }
  return value;
}

function conflictStatus(value: unknown): AirtableSyncConflict["status"] {
  if (value !== "open" && value !== "resolving" && value !== "resolved") {
    throw new Error("Invalid Airtable D1 conflict status");
  }
  return value;
}

function conflictResolution(value: unknown): AirtableSyncConflict["resolution"] {
  if (value === null || value === undefined) return null;
  if (value !== "use_d1" && value !== "use_airtable" && value !== "manual") {
    throw new Error("Invalid Airtable D1 conflict resolution");
  }
  return value;
}
