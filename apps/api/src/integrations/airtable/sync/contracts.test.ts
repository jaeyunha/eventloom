import { describe, expect, it } from "vitest";

import { createAirtableSyncDeduplicationKey } from "./contracts";
import { createAirtableSyncJobRecord } from "./enqueue";

describe("Airtable sync job contract", () => {
  it("builds a stable deduplication key from the source version and operation", () => {
    expect(
      createAirtableSyncDeduplicationKey({
        connectionId: "connection-1",
        entityType: "session",
        applicationId: "session-1",
        sourceVersion: 7,
        operation: "upsert",
      }),
    ).toBe("connection-1:session:session-1:7:upsert");
  });

  it("creates a pending job record without provider identifiers", () => {
    const record = createAirtableSyncJobRecord({
      id: "job-1",
      connectionVersion: 3,
      createdAt: "2026-08-13T12:00:00.000Z",
      job: {
        connectionId: "connection-1",
        organizationId: "organization-1",
        entityType: "event",
        applicationId: "event-1",
        sourceVersion: 2,
        operation: "archive",
        payloadJson: "{}",
        availableAt: "2026-08-13T12:00:00.000Z",
      },
    });

    expect(record).toEqual({
      id: "job-1",
      connectionId: "connection-1",
      organizationId: "organization-1",
      entityType: "event",
      applicationId: "event-1",
      sourceVersion: 2,
      operation: "archive",
      payloadJson: "{}",
      availableAt: "2026-08-13T12:00:00.000Z",
      connectionVersion: 3,
      createdAt: "2026-08-13T12:00:00.000Z",
      updatedAt: "2026-08-13T12:00:00.000Z",
      deduplicationKey: "connection-1:event:event-1:2:archive",
    });
  });
});
