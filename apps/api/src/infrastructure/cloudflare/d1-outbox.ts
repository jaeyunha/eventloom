import type { AirtableSyncJob } from "../../integrations/airtable/sync/contracts";

export const airtableSyncClaimLeaseMilliseconds = 60_000;
export const airtableSyncClaimBatchSize = 25;

export interface AirtableSyncJobRepository {
  claimDue(input: {
    now: string;
    owner: string;
    claimToken: string;
    leaseExpiresAt: string;
    limit?: number;
  }): Promise<AirtableSyncJob[]>;
  complete(input: {
    jobId: string;
    owner: string;
    claimToken: string;
    completedAt: string;
  }): Promise<boolean>;
  retry(input: {
    jobId: string;
    owner: string;
    claimToken: string;
    availableAt: string;
    error: string;
  }): Promise<boolean>;
  releaseExpired(now: string): Promise<number>;
}

interface D1RunMeta {
  changes?: number;
}

interface D1RunResult {
  meta?: D1RunMeta;
}

function changedRows(result: D1RunResult): number {
  return result.meta?.changes ?? 0;
}

function rowToJob(row: Record<string, unknown>): AirtableSyncJob {
  return {
    id: String(row.id),
    connectionId: String(row.connection_id),
    organizationId: String(row.organization_id),
    entityType: String(row.entity_type),
    applicationId: String(row.application_id),
    sourceVersion: Number(row.source_version),
    operation: row.operation as AirtableSyncJob["operation"],
    payloadJson: String(row.payload_json),
    availableAt: String(row.available_at),
    state: row.state as AirtableSyncJob["state"],
    deduplicationKey: String(row.deduplication_key),
    attempts: Number(row.attempts),
    connectionVersion: Number(row.connection_version),
    claimOwner: row.claim_owner === null ? null : String(row.claim_owner),
    claimToken: row.claim_token === null ? null : String(row.claim_token),
    leaseExpiresAt: row.lease_expires_at === null ? null : String(row.lease_expires_at),
    lastError: row.last_error === null ? null : String(row.last_error),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    completedAt: row.completed_at === null ? null : String(row.completed_at),
  };
}

export class D1AirtableSyncJobRepository implements AirtableSyncJobRepository {
  constructor(private readonly db: D1Database) {}

  async claimDue(input: {
    now: string;
    owner: string;
    claimToken: string;
    leaseExpiresAt: string;
    limit?: number;
  }): Promise<AirtableSyncJob[]> {
    const limit = input.limit ?? airtableSyncClaimBatchSize;
    const candidates = await this.db
      .prepare(
        `SELECT id
           FROM airtable_sync_jobs
          WHERE state IN ('pending', 'retry')
            AND available_at <= ?
          ORDER BY available_at ASC, created_at ASC
          LIMIT ?`,
      )
      .bind(input.now, limit)
      .all<{ id: string }>();

    const claimed: AirtableSyncJob[] = [];
    for (const candidate of candidates.results ?? []) {
      const update = await this.db
        .prepare(
          `UPDATE airtable_sync_jobs
              SET state = 'claimed',
                  claim_owner = ?,
                  claim_token = ?,
                  lease_expires_at = ?,
                  updated_at = ?
            WHERE id = ?
              AND state IN ('pending', 'retry')
              AND available_at <= ?`,
        )
        .bind(
          input.owner,
          input.claimToken,
          input.leaseExpiresAt,
          input.now,
          candidate.id,
          input.now,
        )
        .run();

      if (changedRows(update) !== 1) {
        continue;
      }

      const row = await this.db
        .prepare("SELECT * FROM airtable_sync_jobs WHERE id = ?")
        .bind(candidate.id)
        .first<Record<string, unknown>>();
      if (row !== null) {
        claimed.push(rowToJob(row));
      }
    }
    return claimed;
  }

  async complete(input: {
    jobId: string;
    owner: string;
    claimToken: string;
    completedAt: string;
  }): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE airtable_sync_jobs
            SET state = 'succeeded',
                claim_owner = NULL,
                claim_token = NULL,
                lease_expires_at = NULL,
                completed_at = ?,
                updated_at = ?
          WHERE id = ?
            AND state = 'claimed'
            AND claim_owner = ?
            AND claim_token = ?
            AND lease_expires_at > ?`,
      )
      .bind(
        input.completedAt,
        input.completedAt,
        input.jobId,
        input.owner,
        input.claimToken,
        input.completedAt,
      )
      .run();
    return changedRows(result) === 1;
  }

  async retry(input: {
    jobId: string;
    owner: string;
    claimToken: string;
    availableAt: string;
    error: string;
  }): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE airtable_sync_jobs
            SET state = 'retry',
                attempts = attempts + 1,
                available_at = ?,
                claim_owner = NULL,
                claim_token = NULL,
                lease_expires_at = NULL,
                last_error = ?,
                updated_at = ?
          WHERE id = ?
            AND state = 'claimed'
            AND claim_owner = ?
            AND claim_token = ?`,
      )
      .bind(
        input.availableAt,
        input.error,
        input.availableAt,
        input.jobId,
        input.owner,
        input.claimToken,
      )
      .run();
    return changedRows(result) === 1;
  }

  async releaseExpired(now: string): Promise<number> {
    const result = await this.db
      .prepare(
        `UPDATE airtable_sync_jobs
            SET state = 'pending',
                claim_owner = NULL,
                claim_token = NULL,
                lease_expires_at = NULL,
                updated_at = ?
          WHERE state = 'claimed'
            AND lease_expires_at <= ?`,
      )
      .bind(now, now)
      .run();
    return changedRows(result);
  }
}
