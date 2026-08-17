export type D1Value = ArrayBuffer | ArrayBufferView | string | number | null;

export interface D1StatementCondition {
  readonly sql: string;
  readonly values: readonly D1Value[];
}

export interface ConsequentialWrite {
  readonly tenantId: string;
  readonly eventId?: string | null;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly resourceVersion: number;
  readonly occurredAt: string;
  readonly before?: unknown;
  readonly after?: unknown;
  readonly condition?: D1StatementCondition;
  readonly sync?: {
    readonly entityType: string;
    readonly applicationId?: string;
    readonly operation?: "upsert" | "archive" | "delete" | "reconcile";
    readonly payload?: unknown;
  };
}

export interface AirtableSyncWrite {
  readonly id: string;
  readonly tenantId: string;
  readonly entityType: string;
  readonly applicationId: string;
  readonly sourceVersion: number;
  readonly operation: "upsert" | "archive" | "delete" | "reconcile";
  readonly payloadJson: string;
  readonly availableAt: string;
  readonly condition?: {
    readonly sql: string;
    readonly values: readonly D1Value[];
  };
}

export function statement(
  database: D1Database,
  sql: string,
  values: readonly D1Value[] = [],
): D1PreparedStatement {
  return database.prepare(sql).bind(...values);
}

export function rows<T>(result: D1Result<T>): readonly T[] {
  return result.results ?? [];
}

export function changed(result: D1Result<unknown>): number {
  return result.meta?.changes ?? 0;
}

export function json(value: unknown): string {
  return JSON.stringify(value);
}

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (value === null || value === undefined || value.length === 0) return fallback;
  return JSON.parse(value) as T;
}

export function booleanValue(value: number | boolean): boolean {
  return value === true || value === 1;
}

/**
 * D1 batch has no public conditional transaction primitive. A malformed JSON
 * expression is evaluated only on a failed predicate, aborting and rolling back
 * the whole batch before any domain statement runs.
 */
export function guard(
  database: D1Database,
  predicate: string,
  values: readonly D1Value[],
): D1PreparedStatement {
  return statement(
    database,
    `SELECT CASE WHEN (${predicate}) THEN 1 ELSE json_extract('D1_CAS_CONFLICT', '$') END AS valid`,
    values,
  );
}

export function insertGuard(
  database: D1Database,
  table: string,
  where: string,
  values: readonly D1Value[],
): D1PreparedStatement {
  return guard(database, `NOT EXISTS (SELECT 1 FROM ${table} WHERE ${where})`, values);
}

export function updateGuard(
  database: D1Database,
  table: string,
  where: string,
  values: readonly D1Value[],
): D1PreparedStatement {
  return guard(database, `EXISTS (SELECT 1 FROM ${table} WHERE ${where})`, values);
}

function hash(value: string): string {
  let result = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16_777_619);
  }
  return (result >>> 0).toString(16).padStart(8, "0");
}

export function airtableSyncStatement(
  database: D1Database,
  write: AirtableSyncWrite,
): D1PreparedStatement {
  const deduplicationSuffix = [
    write.entityType,
    write.applicationId,
    write.sourceVersion,
    write.operation,
  ].join(":");
  const condition = write.condition ?? { sql: "1 = 1", values: [] };
  return statement(
    database,
    `INSERT INTO airtable_sync_jobs
       (id, organization_id, connection_id, connection_version, entity_type,
        application_id, source_version, operation, state, deduplication_key,
        attempt_count, available_at, payload_json, payload_hash, created_at, updated_at)
     SELECT ?, connection.organization_id, connection.id, connection.connection_version,
            ?, ?, ?, ?, 'pending', connection.id || ':' || ?, 0, ?, ?, ?, ?, ?
       FROM airtable_connections AS connection
      WHERE connection.organization_id = ?
        AND connection.status = 'connected'
        AND (${condition.sql})
     ON CONFLICT (deduplication_key) DO NOTHING`,
    [
      write.id,
      write.entityType,
      write.applicationId,
      write.sourceVersion,
      write.operation,
      deduplicationSuffix,
      write.availableAt,
      write.payloadJson,
      hash(write.payloadJson),
      write.availableAt,
      write.availableAt,
      write.tenantId,
      ...condition.values,
    ],
  );
}

export function consequentialAuditId(write: ConsequentialWrite): string {
  const identity = [
    write.tenantId,
    write.resourceType,
    write.resourceId,
    write.action,
    write.resourceVersion,
    write.occurredAt,
  ].join(":");
  return `audit:${hash(identity)}:${write.resourceId}`;
}

function auditStatement(database: D1Database, write: ConsequentialWrite): D1PreparedStatement {
  const details = {
    ...(write.eventId === undefined ? {} : { eventId: write.eventId }),
    resourceVersion: write.resourceVersion,
    ...(write.before === undefined ? {} : { before: write.before }),
    ...(write.after === undefined ? {} : { after: write.after }),
  };
  const condition = write.condition ?? { sql: "1 = 1", values: [] };
  return statement(
    database,
    `INSERT INTO audit_events
       (id, tenant_id, actor_type, actor_id, action, resource_type, resource_id,
        trace_id, details_json, occurred_at)
     SELECT ?, ?, 'system', NULL, ?, ?, ?, NULL, ?, ?
      WHERE (${condition.sql})
     ON CONFLICT (id) DO NOTHING`,
    [
      consequentialAuditId(write),
      write.tenantId,
      write.action,
      write.resourceType,
      write.resourceId,
      json(details),
      write.occurredAt,
      ...condition.values,
    ],
  );
}

function syncStatement(
  database: D1Database,
  write: ConsequentialWrite,
): D1PreparedStatement | null {
  if (write.sync === undefined) return null;
  const condition = write.condition ?? { sql: "1 = 1", values: [] };
  const operation = write.sync.operation ?? "upsert";
  const applicationId = write.sync.applicationId ?? write.resourceId;
  const payload = json(
    write.sync.payload ?? {
      resourceType: write.resourceType,
      resourceId: write.resourceId,
      resourceVersion: write.resourceVersion,
      eventId: write.eventId ?? null,
    },
  );
  const suffix = [write.sync.entityType, applicationId, write.resourceVersion, operation].join(":");
  return statement(
    database,
    `INSERT INTO airtable_sync_jobs
       (id, organization_id, connection_id, connection_version, entity_type,
        application_id, source_version, operation, state, deduplication_key,
        attempt_count, available_at, payload_json, payload_hash, created_at, updated_at)
     SELECT 'sync:' || connection.id || ':' || ?, config.organization_id,
            connection.id, connection.connection_version, ?, ?, ?, ?, 'pending',
            connection.id || ':' || ?, 0, ?, ?, ?, ?, ?
       FROM airtable_projection_configs AS config
       JOIN airtable_connections AS connection
         ON connection.organization_id = config.organization_id
        AND connection.id = config.connection_id
      WHERE config.organization_id = ?
        AND config.entity_type = ?
        AND config.enabled = 1
        AND connection.status = 'connected'
        AND (${condition.sql})
     ON CONFLICT (deduplication_key) DO NOTHING`,
    [
      hash(suffix),
      write.sync.entityType,
      applicationId,
      write.resourceVersion,
      operation,
      suffix,
      write.occurredAt,
      payload,
      hash(payload),
      write.occurredAt,
      write.occurredAt,
      write.tenantId,
      write.sync.entityType,
      ...condition.values,
    ],
  );
}

export function consequentialStatements(
  database: D1Database,
  write: ConsequentialWrite,
): readonly [D1PreparedStatement] | readonly [D1PreparedStatement, D1PreparedStatement] {
  const sync = syncStatement(database, write);
  return sync === null
    ? [auditStatement(database, write)]
    : [auditStatement(database, write), sync];
}

export function communicationOutboxStatement(
  database: D1Database,
  input: {
    readonly tenantId: string;
    readonly deduplicationKey: string;
    readonly payload: unknown;
    readonly occurredAt: string;
  },
): D1PreparedStatement {
  const jobId = `communications:${hash(`${input.tenantId}:${input.deduplicationKey}`)}`;
  return statement(
    database,
    `INSERT INTO outbox_jobs
       (id, tenant_id, topic, deduplication_key, payload_json, state,
        attempt_count, available_at, created_at, updated_at)
     VALUES (?, ?, 'communications', ?, ?, 'pending', 0, ?, ?, ?)
     ON CONFLICT (tenant_id, topic, deduplication_key) DO NOTHING`,
    [
      jobId,
      input.tenantId,
      input.deduplicationKey,
      json(input.payload),
      input.occurredAt,
      input.occurredAt,
      input.occurredAt,
    ],
  );
}

export async function batch(database: D1Database, statements: readonly D1PreparedStatement[]) {
  if (statements.length === 0) return [];
  return database.batch([...statements]);
}

export function stableSort<T>(values: readonly T[], key: (value: T) => string): readonly T[] {
  return [...values].sort((left, right) => key(left).localeCompare(key(right)));
}
