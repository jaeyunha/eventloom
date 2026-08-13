import type { D1Database } from "@cloudflare/workers-types";
import { describe, expect, it } from "vitest";

import type { SpeakerAssetAuditEntry, SpeakerTask } from "../../../features/speaker/types";
import { D1SpeakerRepository } from "./speaker";

class RecordingD1 {
  readonly batches: string[][] = [];
  prepare(sql: string) {
    const statement = {
      sql,
      bind: (..._values: unknown[]) => statement,
      all: async () => ({ results: [] }),
      first: async () => null,
      raw: async () => (sql.includes('from "events"') ? [["org-1", "event-1"]] : []),
      run: async () => ({ meta: { changes: 1 } }),
    };
    return statement;
  }
  async batch(statements: Array<{ sql?: string }>) {
    this.batches.push(statements.map((statement) => statement.sql ?? String(statement)));
    return statements.map(() => ({ meta: { changes: 1 }, results: [] }));
  }
}

const task: SpeakerTask = {
  id: "task-1",
  eventId: "event-1",
  submissionId: null,
  participantId: "participant-1",
  subject: { type: "participant", participantId: "participant-1" },
  type: "upload",
  owner: "speaker",
  title: "Slides",
  status: "not_started",
  dependencyIds: ["task-0"],
  reminderOffsetsMinutes: [60],
  allowedMimeTypes: ["application/pdf"],
  maxBytes: 1_000_000,
  acceptedAssetKinds: ["slides"],
  version: 1,
  updatedAt: "2026-08-13T10:00:00.000Z",
};

const audit: SpeakerAssetAuditEntry = {
  id: "audit-1",
  organizationId: "org-1",
  eventId: "event-1",
  assetId: "asset-1",
  action: "approved",
  actorAccountId: "organizer-1",
  occurredAt: "2026-08-13T10:00:00.000Z",
  version: 1,
};

describe("D1SpeakerRepository", () => {
  it("batches task metadata with the task create", async () => {
    const database = new RecordingD1();
    const repository = new D1SpeakerRepository(database as unknown as D1Database);

    const result = await repository.createTask?.({
      task,
      expectedVersion: null,
      actorAccountId: "organizer-1",
    });

    expect(result.ok).toBe(false); // the read-back is intentionally absent in this statement recorder
    expect(database.batches[0]?.join("\n")).toContain("INSERT INTO speaker_tasks");
    expect(database.batches[0]?.join("\n")).toContain("INSERT INTO speaker_task_dependencies");
    expect(database.batches[0]?.join("\n")).toContain("INSERT INTO speaker_task_reminder_offsets");
  });

  it("includes asset review and audit in one D1 batch", async () => {
    const database = new RecordingD1();
    const repository = new D1SpeakerRepository(database as unknown as D1Database);
    repository.getAsset = async () => ({
      id: "asset-1",
      tenantId: "org-1",
      eventId: "event-1",
      participantId: "participant-1",
      kind: "slides",
      objectKey: "private/asset-1",
      fileName: "slides.pdf",
      contentType: "application/pdf",
      sizeBytes: 100,
      state: "ready",
      createdAt: "2026-08-13T09:00:00.000Z",
      reviewVersion: 0,
      currentVersionId: "asset-1",
    });

    const result = await repository.reviewAsset?.({
      eventId: "event-1",
      assetId: "asset-1",
      state: "approved",
      expectedVersion: 0,
      reviewedAt: audit.occurredAt,
      reviewedBy: audit.actorAccountId,
      release: true,
      audit,
    });

    expect(result.ok).toBe(true);
    expect(database.batches).toHaveLength(1);
    expect(database.batches[0]?.join("\n")).toContain("UPDATE speaker_assets");
    expect(database.batches[0]?.join("\n")).toContain(
      "INSERT OR IGNORE INTO speaker_asset_comments",
    );
  });
});
