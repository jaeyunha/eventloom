import type {
  AirtableInboundChangeClaim,
  AirtableInboundChangeStore,
  AirtableInboundProjection,
  AirtableInboundRecordMapping,
  ClaimAirtableInboundChangeInput,
  CompleteAirtableInboundChangeInput,
  CreateAirtableInboundConflictInput,
  CreateAirtableInboundConflictResult,
} from "../inbound/change-worker";
import type { AirtableD1Database } from "./adapters";

type Row = Record<string, unknown>;

export class D1AirtableInboundChangeStore implements AirtableInboundChangeStore {
  constructor(private readonly db: AirtableD1Database) {}

  async claimNext(
    input: ClaimAirtableInboundChangeInput,
  ): Promise<AirtableInboundChangeClaim | null> {
    return mapClaim(
      await this.db
        .prepare(`UPDATE airtable_inbound_changes SET
          state = 'claimed', attempt_count = attempt_count + 1,
          claim_owner = ?, claim_token = ?, lease_expires_at = ?,
          updated_at = ?
        WHERE id = (
          SELECT id FROM airtable_inbound_changes
          WHERE (
            state IN ('pending', 'retry') AND available_at <= ?
          ) OR (
            state = 'claimed' AND lease_expires_at <= ?
          )
          ORDER BY available_at, created_at, id
          LIMIT 1
        )
        AND (
          (state IN ('pending', 'retry') AND available_at <= ?)
          OR (state = 'claimed' AND lease_expires_at <= ?)
        )
        RETURNING *`)
        .bind(
          input.claimOwner,
          input.claimToken,
          input.leaseExpiresAt,
          input.claimedAt,
          input.claimedAt,
          input.claimedAt,
          input.claimedAt,
          input.claimedAt,
        )
        .first<Row>(),
    );
  }

  async findEnabledProjection(input: {
    connectionId: string;
    tableId: string;
  }): Promise<AirtableInboundProjection | null> {
    const row = await this.db
      .prepare(`SELECT connection_id, table_id, entity_type, inbound_fields_json
        FROM airtable_projection_configs
        WHERE connection_id = ? AND table_id = ? AND enabled = 1`)
      .bind(input.connectionId, input.tableId)
      .first<Row>();
    if (row === null) return null;
    return {
      connectionId: text(row.connection_id),
      tableId: text(row.table_id),
      entityType: text(row.entity_type),
      inboundFieldIds: stringArray(row.inbound_fields_json),
    };
  }

  async findRecordMapping(input: {
    connectionId: string;
    tableId: string;
    recordId: string;
  }): Promise<AirtableInboundRecordMapping | null> {
    const row = await this.db
      .prepare(`SELECT id, connection_id, table_id, record_id, entity_type,
          application_id, last_exported_version, last_exported_hash,
          last_observed_hash, mapping_version
        FROM airtable_record_mappings
        WHERE connection_id = ? AND table_id = ? AND record_id = ?`)
      .bind(input.connectionId, input.tableId, input.recordId)
      .first<Row>();
    return mapMapping(row);
  }

  async complete(input: CompleteAirtableInboundChangeInput): Promise<boolean> {
    if (input.mappingId === null) {
      return changed(await this.completeStatement(input, false).run());
    }
    if (input.expectedMappingVersion === null || input.observedHash === null) {
      throw new Error("Mapping completion requires its version and observed hash");
    }

    const mapping = this.db
      .prepare(`UPDATE airtable_record_mappings SET
        last_observed_hash = ?, mapping_version = mapping_version + 1, updated_at = ?
      WHERE id = ? AND mapping_version = ? AND EXISTS (
        SELECT 1 FROM airtable_inbound_changes
        WHERE id = ? AND state = 'claimed' AND claim_token = ?
      )`)
      .bind(
        input.observedHash,
        input.updatedAt,
        input.mappingId,
        input.expectedMappingVersion,
        input.changeId,
        input.claimToken,
      );
    const completion = this.completeStatement(input, true);
    const results = await this.db.batch([mapping, completion]);
    return changed(results[1] ?? {});
  }

  async createConflict(
    input: CreateAirtableInboundConflictInput,
  ): Promise<CreateAirtableInboundConflictResult> {
    const mapping = this.db
      .prepare(`UPDATE airtable_record_mappings SET
        last_observed_hash = ?, mapping_version = mapping_version + 1, updated_at = ?
      WHERE id = ? AND mapping_version = ? AND EXISTS (
        SELECT 1 FROM airtable_inbound_changes
        WHERE id = ? AND state = 'claimed' AND claim_token = ?
      ) AND NOT EXISTS (
        SELECT 1 FROM airtable_sync_conflicts
        WHERE connection_id = ? AND entity_type = ? AND application_id = ?
          AND field_id = ? AND status = 'resolving'
      )`)
      .bind(
        input.observedHash,
        input.detectedAt,
        input.mappingId,
        input.expectedMappingVersion,
        input.changeId,
        input.claimToken,
        input.connectionId,
        input.entityType,
        input.applicationId,
        input.fieldId,
      );
    const conflict = this.db
      .prepare(`INSERT INTO airtable_sync_conflicts (
        id, organization_id, connection_id, entity_type, application_id,
        field_id, source_transaction, d1_version, d1_value_json,
        airtable_value_json, status, resolution, resolver_id, detected_at,
        resolving_at, resolved_at, resolution_command_id
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        'open', NULL, NULL, ?, NULL, NULL, NULL
      WHERE changes() = 1
      ON CONFLICT(connection_id, entity_type, application_id, field_id)
        WHERE status IN ('open', 'resolving')
      DO UPDATE SET
        source_transaction = excluded.source_transaction,
        d1_version = excluded.d1_version,
        d1_value_json = excluded.d1_value_json,
        airtable_value_json = excluded.airtable_value_json,
        detected_at = excluded.detected_at
      WHERE airtable_sync_conflicts.status = 'open'
      RETURNING id`)
      .bind(
        input.conflictId,
        input.organizationId,
        input.connectionId,
        input.entityType,
        input.applicationId,
        input.fieldId,
        input.sourceTransaction,
        input.d1Version,
        input.d1ValueJson,
        input.airtableValueJson,
        input.detectedAt,
      );
    const completion = this.db
      .prepare(`UPDATE airtable_inbound_changes SET
        state = 'conflict', claim_owner = NULL, claim_token = NULL,
        lease_expires_at = NULL, last_error = NULL, updated_at = ?, completed_at = ?
      WHERE id = ? AND state = 'claimed' AND claim_token = ?
        AND changes() = 1`)
      .bind(input.detectedAt, input.detectedAt, input.changeId, input.claimToken);
    const results = await this.db.batch<Row>([mapping, conflict, completion]);
    if (!changed(results[2] ?? {})) return { kind: "lease_lost" };
    const conflictId = results[1]?.results?.[0]?.id;
    return { kind: "recorded", conflictId: text(conflictId) };
  }

  private completeStatement(
    input: CompleteAirtableInboundChangeInput,
    requirePriorChange: boolean,
  ) {
    return this.db
      .prepare(`UPDATE airtable_inbound_changes SET
        state = ?, claim_owner = NULL, claim_token = NULL, lease_expires_at = NULL,
        last_error = ?, available_at = COALESCE(?, available_at),
        updated_at = ?, completed_at = ?
      WHERE id = ? AND state = 'claimed' AND claim_token = ?
        ${requirePriorChange ? "AND changes() = 1" : ""}`)
      .bind(
        input.state,
        input.lastError,
        input.availableAt,
        input.updatedAt,
        input.completedAt,
        input.changeId,
        input.claimToken,
      );
  }
}

function mapClaim(row: Row | null): AirtableInboundChangeClaim | null {
  if (row === null) return null;
  return {
    id: text(row.id),
    organizationId: text(row.organization_id),
    connectionId: text(row.connection_id),
    registrationId: text(row.registration_id),
    baseTransactionNumber: integer(row.base_transaction_number),
    tableId: text(row.table_id),
    recordId: text(row.record_id),
    fieldId: text(row.field_id),
    entityType: nullableText(row.entity_type),
    applicationId: nullableText(row.application_id),
    sourceValueJson: text(row.source_value_json),
    sourceHash: text(row.source_hash),
    attemptCount: integer(row.attempt_count),
    claimToken: text(row.claim_token),
  };
}

function mapMapping(row: Row | null): AirtableInboundRecordMapping | null {
  if (row === null) return null;
  return {
    id: text(row.id),
    connectionId: text(row.connection_id),
    tableId: text(row.table_id),
    recordId: text(row.record_id),
    entityType: text(row.entity_type),
    applicationId: text(row.application_id),
    lastExportedVersion: nullableInteger(row.last_exported_version),
    lastExportedHash: nullableText(row.last_exported_hash),
    lastObservedHash: nullableText(row.last_observed_hash),
    mappingVersion: integer(row.mapping_version),
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

function nullableInteger(value: unknown): number | null {
  return value === null || value === undefined ? null : integer(value);
}

function stringArray(value: unknown): string[] {
  const parsed = JSON.parse(text(value)) as unknown;
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error("Invalid Airtable D1 string array column");
  }
  return parsed;
}
