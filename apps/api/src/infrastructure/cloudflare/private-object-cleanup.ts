import type { CloudflareFileScanPayload, CloudflareOutboxMessage } from "./bindings";

const DEFAULT_RECONCILIATION_LIMIT = 25;
const MAX_RECONCILIATION_LIMIT = 100;

interface CleanupStatement {
  bind(...values: unknown[]): CleanupStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
}

export interface PrivateObjectCleanupDatabase {
  prepare(query: string): CleanupStatement;
  batch(
    statements: readonly CleanupStatement[],
  ): Promise<readonly { meta?: { changes?: number } }[]>;
}

interface AuthoritativeAssetRow {
  readonly object_key: string;
  readonly state: string;
}

interface ReadyReferenceRow {
  readonly present: number;
}

function cleanupJobId(payload: CloudflareFileScanPayload): string {
  return `private-object-delete:${payload.tenantId}:${payload.source}:${payload.assetId}`;
}

export function privateObjectCleanupOutboxStatement(
  database: PrivateObjectCleanupDatabase,
  payload: CloudflareFileScanPayload,
  createdAt: string,
): CleanupStatement {
  const id = cleanupJobId(payload);
  return database
    .prepare(
      `INSERT INTO outbox_jobs
         (id, tenant_id, topic, deduplication_key, payload_json, state, attempt_count,
          available_at, lease_owner, lease_expires_at, last_error_code,
          created_at, updated_at, completed_at)
       VALUES (?, ?, 'file-scan', ?, ?, 'pending', 0, ?, NULL, NULL, NULL, ?, ?, NULL)
       ON CONFLICT (tenant_id, topic, deduplication_key) DO NOTHING`,
    )
    .bind(id, payload.tenantId, id, JSON.stringify(payload), createdAt, createdAt, createdAt);
}

/** R2 deletion is idempotent; D1 is consulted immediately before every delete. */
export class D1PrivateObjectDeletionGateway {
  constructor(
    private readonly database: PrivateObjectCleanupDatabase,
    private readonly bucket: R2Bucket,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async deleteIfAuthorized(payload: CloudflareFileScanPayload): Promise<void> {
    const authoritative = await this.authoritativeRow(payload);
    if (authoritative === null || authoritative.object_key !== payload.objectKey) return;

    if (payload.source === "private-upload") {
      if (!["pending", "uploaded", "scanning", "quarantined"].includes(authoritative.state)) {
        return;
      }
      if (Date.parse(payload.expiresAt) > this.now().getTime()) return;
    } else if (authoritative.state !== "rejected") {
      return;
    }

    const ready = await this.database
      .prepare(
        `SELECT 1 AS present
           FROM (
             SELECT object_key
               FROM speaker_assets
              WHERE organization_id = ? AND object_key = ? AND state = 'ready'
             UNION ALL
             SELECT object_key
               FROM cfp_file_assets
              WHERE organization_id = ? AND object_key = ? AND state = 'ready'
           )
          LIMIT 1`,
      )
      .bind(payload.tenantId, payload.objectKey, payload.tenantId, payload.objectKey)
      .first<ReadyReferenceRow>();
    if (ready !== null) return;

    if (payload.source === "private-upload" && authoritative.state !== "quarantined") {
      const claim = await this.database
        .prepare(
          `UPDATE private_uploads
              SET state = 'quarantined', updated_at = ?
            WHERE tenant_id = ? AND id = ? AND object_key = ? AND expires_at = ?
              AND state IN ('pending', 'uploaded', 'scanning')
              AND NOT EXISTS (
                SELECT 1 FROM speaker_assets
                 WHERE organization_id = ? AND object_key = ? AND state = 'ready'
                UNION ALL
                SELECT 1 FROM cfp_file_assets
                 WHERE organization_id = ? AND object_key = ? AND state = 'ready'
              )`,
        )
        .bind(
          this.now().toISOString(),
          payload.tenantId,
          payload.assetId,
          payload.objectKey,
          payload.expiresAt,
          payload.tenantId,
          payload.objectKey,
          payload.tenantId,
          payload.objectKey,
        )
        .run();
      if ((claim.meta?.changes ?? 0) !== 1) return;
    }

    await this.bucket.delete(payload.objectKey);
    await this.database
      .prepare(
        `UPDATE private_uploads
            SET state = 'deleted', updated_at = ?
          WHERE tenant_id = ? AND object_key = ? AND state <> 'clean'`,
      )
      .bind(this.now().toISOString(), payload.tenantId, payload.objectKey)
      .run();
  }

  private async authoritativeRow(
    payload: CloudflareFileScanPayload,
  ): Promise<AuthoritativeAssetRow | null> {
    if (payload.source === "speaker") {
      return this.database
        .prepare(
          `SELECT object_key, state
             FROM speaker_assets
            WHERE organization_id = ? AND event_id = ? AND id = ?
            LIMIT 1`,
        )
        .bind(payload.tenantId, payload.eventId, payload.assetId)
        .first<AuthoritativeAssetRow>();
    }
    if (payload.source === "cfp") {
      return this.database
        .prepare(
          `SELECT object_key, state
             FROM cfp_file_assets
            WHERE organization_id = ? AND event_id = ? AND submission_id = ? AND id = ?
            LIMIT 1`,
        )
        .bind(payload.tenantId, payload.eventId, payload.submissionId, payload.assetId)
        .first<AuthoritativeAssetRow>();
    }
    return this.database
      .prepare(
        `SELECT object_key, state
           FROM private_uploads
          WHERE tenant_id = ? AND id = ? AND object_key = ? AND expires_at = ?
          LIMIT 1`,
      )
      .bind(payload.tenantId, payload.assetId, payload.objectKey, payload.expiresAt)
      .first<AuthoritativeAssetRow>();
  }
}

interface ExpiredUploadRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly object_key: string;
  readonly expires_at: string;
  readonly scan_result_code: string | null;
}

interface PendingCleanupRow {
  readonly id: string;
  readonly tenant_id: string;
}

function storedEventId(value: string | null): string | null {
  if (value === null) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" &&
      parsed !== null &&
      "eventId" in parsed &&
      typeof parsed.eventId === "string" &&
      parsed.eventId.trim().length > 0
      ? parsed.eventId
      : null;
  } catch {
    return null;
  }
}

export interface PrivateObjectCleanupReconciliationResult {
  readonly expiredSelected: number;
  readonly intentsCreated: number;
  readonly pendingSelected: number;
  readonly queued: number;
  readonly failed: number;
}

/** Bounded repair for expired uploads and D1 outbox rows stranded before Queue publication. */
export async function reconcilePrivateObjectCleanup(
  database: PrivateObjectCleanupDatabase,
  queue: Queue<CloudflareOutboxMessage>,
  options: { readonly limit?: number; readonly now?: () => Date } = {},
): Promise<PrivateObjectCleanupReconciliationResult> {
  const limit = options.limit ?? DEFAULT_RECONCILIATION_LIMIT;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_RECONCILIATION_LIMIT) {
    throw new TypeError(
      `Private object cleanup limit must be between 1 and ${MAX_RECONCILIATION_LIMIT}.`,
    );
  }
  const now = options.now ?? (() => new Date());
  const reconciledAt = now().toISOString();
  const expired = await database
    .prepare(
      `SELECT id, tenant_id, object_key, expires_at, scan_result_code
         FROM private_uploads
        WHERE state IN ('pending', 'uploaded', 'scanning')
          AND expires_at IS NOT NULL AND expires_at <= ?
        ORDER BY expires_at, created_at, id
        LIMIT ?`,
    )
    .bind(reconciledAt, limit)
    .all<ExpiredUploadRow>();

  let intentsCreated = 0;
  for (const row of expired.results) {
    const eventId = storedEventId(row.scan_result_code);
    if (eventId === null) continue;
    const result = await privateObjectCleanupOutboxStatement(
      database,
      {
        kind: "private_object_delete",
        source: "private-upload",
        tenantId: row.tenant_id,
        eventId,
        assetId: row.id,
        objectKey: row.object_key,
        expiresAt: row.expires_at,
      },
      reconciledAt,
    ).run();
    intentsCreated += result.meta?.changes ?? 0;
  }

  const pending = await database
    .prepare(
      `SELECT id, tenant_id
         FROM outbox_jobs
        WHERE topic = 'file-scan' AND state = 'pending' AND available_at <= ?
        ORDER BY available_at, created_at, id
        LIMIT ?`,
    )
    .bind(reconciledAt, limit)
    .all<PendingCleanupRow>();
  let queued = 0;
  let failed = 0;
  for (const row of pending.results) {
    try {
      await queue.send({
        version: 1,
        jobId: row.id,
        tenantId: row.tenant_id,
        topic: "file-scan",
        enqueuedAt: reconciledAt,
      });
      const result = await database
        .prepare(
          `UPDATE outbox_jobs SET state = 'queued', updated_at = ?
            WHERE id = ? AND tenant_id = ? AND topic = 'file-scan' AND state = 'pending'`,
        )
        .bind(reconciledAt, row.id, row.tenant_id)
        .run();
      queued += result.meta?.changes ?? 0;
    } catch {
      failed += 1;
    }
  }
  return {
    expiredSelected: expired.results.length,
    intentsCreated,
    pendingSelected: pending.results.length,
    queued,
    failed,
  };
}
