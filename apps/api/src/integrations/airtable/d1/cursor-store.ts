import type {
  AdvanceAirtableWebhookCursorInput,
  AdvanceAirtableWebhookCursorResult,
  AirtableWebhookCursorClaim,
  AirtableWebhookCursorStore,
  ClaimAirtableWebhookCursorInput,
  MarkAirtableCursorRetentionGapInput,
  ReleaseAirtableWebhookCursorInput,
} from "../inbound/cursor-worker";
import type { AirtableD1Database } from "./adapters";

type Row = Record<string, unknown>;

export class D1AirtableWebhookCursorStore implements AirtableWebhookCursorStore {
  constructor(private readonly db: AirtableD1Database) {}

  async claimNext(
    input: ClaimAirtableWebhookCursorInput,
  ): Promise<AirtableWebhookCursorClaim | null> {
    const row = await this.db
      .prepare(`UPDATE airtable_webhook_cursors SET
        claim_owner = ?, claim_token = ?, lease_expires_at = ?,
        row_version = row_version + 1
      WHERE registration_id = (
        SELECT cursor.registration_id
        FROM airtable_webhook_cursors AS cursor
        INNER JOIN airtable_webhook_registrations AS registration
          ON registration.id = cursor.registration_id
        WHERE cursor.reconciliation_required = 0
          AND registration.status = 'active'
          AND registration.provider_webhook_id IS NOT NULL
          AND (
            cursor.claim_token IS NULL OR cursor.lease_expires_at <= ?
          )
        ORDER BY cursor.last_fetched_at IS NOT NULL,
          cursor.last_fetched_at, cursor.registration_id
        LIMIT 1
      )
      AND reconciliation_required = 0
      AND (claim_token IS NULL OR lease_expires_at <= ?)
      RETURNING registration_id, next_cursor, row_version, claim_token`)
      .bind(
        input.claimOwner,
        input.claimToken,
        input.leaseExpiresAt,
        input.claimedAt,
        input.claimedAt,
      )
      .first<Row>();

    return row === null ? null : this.requireClaim(row);
  }

  async advancePage(
    input: AdvanceAirtableWebhookCursorInput,
  ): Promise<AdvanceAirtableWebhookCursorResult> {
    const ownershipPredicate = `registration_id = ? AND claim_token = ?
      AND row_version = ? AND next_cursor = ? AND reconciliation_required = 0`;
    const statements = input.changes.map((change) =>
      this.db
        .prepare(`INSERT INTO airtable_inbound_changes (
          id, organization_id, connection_id, registration_id,
          base_transaction_number, table_id, record_id, field_id,
          entity_type, application_id, source_value_json, source_hash,
          state, attempt_count, available_at, claim_owner, claim_token,
          lease_expires_at, last_error, created_at, updated_at, completed_at
        )
        SELECT
          'airtable_inbound:' || json_array(registration.id, ?, ?, ?, ?),
          registration.organization_id, registration.connection_id, registration.id,
          ?, ?, ?, ?, ?, ?, ?, ?,
          'pending', 0, ?, NULL, NULL, NULL, NULL, ?, ?, NULL
        FROM airtable_webhook_registrations AS registration
        WHERE registration.id = ? AND EXISTS (
          SELECT 1 FROM airtable_webhook_cursors
          WHERE ${ownershipPredicate}
        )
        ON CONFLICT(registration_id, base_transaction_number, table_id, record_id, field_id)
        DO NOTHING`)
        .bind(
          change.baseTransactionNumber,
          change.tableId,
          change.recordId,
          change.fieldId,
          change.baseTransactionNumber,
          change.tableId,
          change.recordId,
          change.fieldId,
          change.entityType,
          change.applicationId,
          change.sourceValueJson,
          change.sourceHash,
          input.fetchedAt,
          input.fetchedAt,
          input.fetchedAt,
          input.registrationId,
          input.registrationId,
          input.claimToken,
          input.expectedRowVersion,
          input.expectedCursor,
        ),
    );
    const cursorStatement = this.db
      .prepare(`UPDATE airtable_webhook_cursors SET
        next_cursor = ?, row_version = row_version + 1,
        claim_owner = CASE WHEN ? = 1 THEN NULL ELSE claim_owner END,
        claim_token = CASE WHEN ? = 1 THEN NULL ELSE claim_token END,
        lease_expires_at = ?, last_fetched_at = ?
      WHERE ${ownershipPredicate}
      RETURNING registration_id, next_cursor, row_version, claim_token`)
      .bind(
        input.nextCursor,
        input.releaseClaim ? 1 : 0,
        input.releaseClaim ? 1 : 0,
        input.leaseExpiresAt,
        input.fetchedAt,
        input.registrationId,
        input.claimToken,
        input.expectedRowVersion,
        input.expectedCursor,
      );

    const results = await this.db.batch<Row>([...statements, cursorStatement]);
    const cursorRow = results.at(-1)?.results?.[0] ?? null;
    if (cursorRow === null) return { kind: "lease_lost" };
    if (input.releaseClaim) return { kind: "advanced", claim: null };
    return { kind: "advanced", claim: await this.requireClaim(cursorRow) };
  }

  async markRetentionGap(input: MarkAirtableCursorRetentionGapInput): Promise<boolean> {
    const result = await this.db
      .prepare(`UPDATE airtable_webhook_cursors SET
        next_cursor = COALESCE(?, next_cursor),
        row_version = row_version + 1,
        claim_owner = NULL, claim_token = NULL, lease_expires_at = NULL,
        last_fetched_at = ?, reconciliation_required = 1
      WHERE registration_id = ? AND claim_token = ?
        AND row_version = ? AND next_cursor = ?
        AND reconciliation_required = 0`)
      .bind(
        input.recoveryCursor,
        input.detectedAt,
        input.registrationId,
        input.claimToken,
        input.expectedRowVersion,
        input.expectedCursor,
      )
      .run();
    return changed(result);
  }

  async releaseClaim(input: ReleaseAirtableWebhookCursorInput): Promise<boolean> {
    const result = await this.db
      .prepare(`UPDATE airtable_webhook_cursors SET
        row_version = row_version + 1,
        claim_owner = NULL, claim_token = NULL, lease_expires_at = NULL
      WHERE registration_id = ? AND claim_token = ? AND row_version = ?`)
      .bind(input.registrationId, input.claimToken, input.expectedRowVersion)
      .run();
    return changed(result);
  }

  private async requireClaim(cursorRow: Row): Promise<AirtableWebhookCursorClaim> {
    const registrationId = text(cursorRow.registration_id);
    const registration = await this.db
      .prepare(`SELECT registration.organization_id, registration.connection_id,
          registration.provider_webhook_id, connection.base_id,
          connection.credential_reference, connection.auth_mode
        FROM airtable_webhook_registrations AS registration
        JOIN airtable_connections AS connection
          ON connection.id = registration.connection_id
         AND connection.organization_id = registration.organization_id
        WHERE registration.id = ? AND registration.provider_webhook_id IS NOT NULL`)
      .bind(registrationId)
      .first<Row>();
    if (registration === null) {
      throw new Error("Airtable webhook cursor registration was not found");
    }
    return {
      registrationId,
      organizationId: text(registration.organization_id),
      connectionId: text(registration.connection_id),
      providerWebhookId: text(registration.provider_webhook_id),
      ...(typeof registration.base_id === "string" ? { baseId: registration.base_id } : {}),
      ...(typeof registration.credential_reference === "string"
        ? { credentialReference: registration.credential_reference }
        : {}),
      ...(registration.auth_mode === "oauth" || registration.auth_mode === "pat"
        ? { authMode: registration.auth_mode }
        : {}),
      nextCursor: text(cursorRow.next_cursor),
      rowVersion: integer(cursorRow.row_version),
      claimToken: text(cursorRow.claim_token),
    };
  }
}

function changed(result: { meta?: { changes?: number } }): boolean {
  return (result.meta?.changes ?? 0) > 0;
}

function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("Invalid Airtable D1 text column");
  return value;
}

function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error("Invalid Airtable D1 integer column");
  }
  return value;
}
