/// <reference types="node" />

import type { Queue, R2Bucket } from "@cloudflare/workers-types";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteD1 } from "../../test-support/sqlite-d1";
import type { CloudflareFileScanPayload, CloudflareOutboxMessage } from "./bindings";
import {
  D1PrivateObjectDeletionGateway,
  reconcilePrivateObjectCleanup,
} from "./private-object-cleanup";

const databases: SqliteD1[] = [];

class RecordingBucket {
  readonly objects = new Set<string>();
  readonly deleted: string[] = [];

  async delete(key: string): Promise<void> {
    this.deleted.push(key);
    this.objects.delete(key);
  }
}

function database(): SqliteD1 {
  const db = new SqliteD1("eventloom-private-cleanup-");
  databases.push(db);
  db.executeScript(`
    CREATE TABLE private_uploads (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      object_key TEXT NOT NULL UNIQUE,
      state TEXT NOT NULL,
      expires_at TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE speaker_assets (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      object_key TEXT NOT NULL UNIQUE,
      state TEXT NOT NULL
    );
    CREATE TABLE cfp_file_assets (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      submission_id TEXT NOT NULL,
      object_key TEXT NOT NULL UNIQUE,
      state TEXT NOT NULL
    );
    CREATE TABLE outbox_jobs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      topic TEXT NOT NULL,
      deduplication_key TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      state TEXT NOT NULL,
      attempt_count INTEGER NOT NULL,
      available_at TEXT NOT NULL,
      lease_owner TEXT,
      lease_expires_at TEXT,
      last_error_code TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      UNIQUE (tenant_id, topic, deduplication_key)
    );
  `);
  return db;
}

afterEach(() => {
  for (const db of databases.splice(0)) db.dispose();
});

const speakerPayload: CloudflareFileScanPayload = {
  kind: "private_object_delete",
  source: "speaker",
  tenantId: "tenant-1",
  eventId: "event-1",
  assetId: "asset-1",
  objectKey: "speaker/private/asset-1.pdf",
};

describe("private object deletion authority", () => {
  it("deletes a rejected object idempotently", async () => {
    const db = database();
    const bucket = new RecordingBucket();
    bucket.objects.add(speakerPayload.objectKey);
    db.executeScript(`
      INSERT INTO speaker_assets VALUES
        ('asset-1','tenant-1','event-1','${speakerPayload.objectKey}','rejected');
      INSERT INTO private_uploads VALUES
        ('asset-1','tenant-1','${speakerPayload.objectKey}','deleted',
         '2026-08-09T11:00:00.000Z','2026-08-09T12:00:00.000Z');
    `);
    const gateway = new D1PrivateObjectDeletionGateway(
      db,
      bucket as unknown as R2Bucket,
      () => new Date("2026-08-09T12:00:00.000Z"),
    );

    await gateway.deleteIfAuthorized(speakerPayload);
    await gateway.deleteIfAuthorized(speakerPayload);

    expect(bucket.objects.has(speakerPayload.objectKey)).toBe(false);
    expect(bucket.deleted).toEqual([speakerPayload.objectKey, speakerPayload.objectKey]);
  });

  it("does not delete on an object-key mismatch or after authoritative ready state", async () => {
    const db = database();
    const bucket = new RecordingBucket();
    const authoritativeKey = "speaker/private/authoritative.pdf";
    bucket.objects.add(authoritativeKey);
    db.executeScript(`
      INSERT INTO speaker_assets VALUES
        ('asset-1','tenant-1','event-1','${authoritativeKey}','rejected');
    `);
    const gateway = new D1PrivateObjectDeletionGateway(
      db,
      bucket as unknown as R2Bucket,
      () => new Date("2026-08-09T12:00:00.000Z"),
    );

    await gateway.deleteIfAuthorized(speakerPayload);
    db.executeScript("UPDATE speaker_assets SET state = 'ready' WHERE id = 'asset-1';");
    await gateway.deleteIfAuthorized({ ...speakerPayload, objectKey: authoritativeKey });

    expect(bucket.deleted).toEqual([]);
    expect(bucket.objects.has(authoritativeKey)).toBe(true);
  });

  it("protects an object referenced by any ready file record", async () => {
    const db = database();
    const bucket = new RecordingBucket();
    const objectKey = "private/shared-ready.pdf";
    bucket.objects.add(objectKey);
    db.executeScript(`
      INSERT INTO private_uploads VALUES
        ('upload-1','tenant-1','${objectKey}','uploaded',
         '2026-08-09T11:00:00.000Z','2026-08-09T10:00:00.000Z');
      INSERT INTO cfp_file_assets VALUES
        ('cfp-ready','tenant-1','event-1','submission-1','${objectKey}','ready');
    `);
    const gateway = new D1PrivateObjectDeletionGateway(
      db,
      bucket as unknown as R2Bucket,
      () => new Date("2026-08-09T12:00:00.000Z"),
    );

    await gateway.deleteIfAuthorized({
      kind: "private_object_delete",
      source: "private-upload",
      tenantId: "tenant-1",
      eventId: "event-1",
      assetId: "upload-1",
      objectKey,
      expiresAt: "2026-08-09T11:00:00.000Z",
    });

    expect(bucket.deleted).toEqual([]);
    expect(bucket.objects.has(objectKey)).toBe(true);
  });

  it("reconciles expired uploads and retries queue publication without losing the intent", async () => {
    const db = database();
    db.executeScript(`
      ALTER TABLE private_uploads ADD COLUMN scan_result_code TEXT;
      ALTER TABLE private_uploads ADD COLUMN created_at TEXT;
      INSERT INTO private_uploads
        (id,tenant_id,object_key,state,expires_at,updated_at,scan_result_code,created_at)
      VALUES
        ('upload-expired','tenant-1','private/expired.pdf','uploaded',
         '2026-08-09T11:00:00.000Z','2026-08-09T10:00:00.000Z',
         '{"eventId":"event-1"}','2026-08-09T10:00:00.000Z');
    `);
    const messages: CloudflareOutboxMessage[] = [];
    let fail = true;
    const queue = {
      async send(message: CloudflareOutboxMessage) {
        if (fail) throw new Error("queue unavailable");
        messages.push(message);
      },
    } as unknown as Queue<CloudflareOutboxMessage>;
    const now = () => new Date("2026-08-09T12:00:00.000Z");

    await expect(reconcilePrivateObjectCleanup(db, queue, { limit: 1, now })).resolves.toEqual({
      expiredSelected: 1,
      intentsCreated: 1,
      pendingSelected: 1,
      queued: 0,
      failed: 1,
    });
    expect(db.query<{ state: string }>("SELECT state FROM outbox_jobs")).toEqual([
      { state: "pending" },
    ]);

    fail = false;
    await expect(reconcilePrivateObjectCleanup(db, queue, { limit: 1, now })).resolves.toEqual({
      expiredSelected: 1,
      intentsCreated: 0,
      pendingSelected: 1,
      queued: 1,
      failed: 0,
    });
    expect(messages).toEqual([
      expect.objectContaining({ topic: "file-scan", tenantId: "tenant-1" }),
    ]);
    expect(db.query<{ state: string }>("SELECT state FROM outbox_jobs")).toEqual([
      { state: "queued" },
    ]);
  });
});
