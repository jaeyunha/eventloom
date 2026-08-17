/// <reference types="node" />

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach } from "vitest";
import type { QueuedEvaluationExport } from "../../features/evaluations/export-jobs";
import { SqliteD1 } from "../../test-support/sqlite-d1";
import type { CloudflareOutboxMessage } from "./bindings";

export const NOW = "2026-08-16T12:00:00.000Z";
const databases: SqliteD1[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.dispose();
});

export function migration(name: string): string {
  return readFileSync(join(process.cwd(), "apps/api/migrations", name), "utf8");
}

export function databaseBeforeExportMigration(): SqliteD1 {
  const database = new SqliteD1("eventloom-evaluation-export-");
  databases.push(database);
  database.executeScript(migration("0002_operational_state.sql"));
  database.executeScript(migration("0006_domain_consistency_operational_state.sql"));
  return database;
}

export function evaluationExportDatabase(): SqliteD1 {
  const database = databaseBeforeExportMigration();
  database.executeScript(migration("0034_evaluation_export_jobs.sql"));
  return database;
}

export function queued(overrides: Partial<QueuedEvaluationExport> = {}): QueuedEvaluationExport {
  return {
    id: "run-1",
    tenantId: "tenant-1",
    eventId: "event-1",
    planId: "plan-1",
    planVersion: 3,
    requestedBy: "organizer-1",
    idempotencyKey: "request-1",
    requestFingerprint: '{"request":"one"}',
    fileName: "evaluation-plan-1.csv",
    requestedAt: NOW,
    status: "queued",
    ...overrides,
  };
}

export function evaluationExportQueue(send: (message: CloudflareOutboxMessage) => Promise<void>) {
  return { send } as unknown as Queue<CloudflareOutboxMessage>;
}
