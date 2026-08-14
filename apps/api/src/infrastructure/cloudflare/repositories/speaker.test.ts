import type { D1Database } from "@cloudflare/workers-types";
import { describe, expect, it } from "vitest";

import type { SpeakerAssetAuditEntry, SpeakerTask } from "../../../features/speaker/types";
import { D1SpeakerRepository, portalSubmissionStatus } from "./speaker";

class RecordingD1 {
  readonly batches: string[][] = [];
  readonly queries: string[] = [];
  readonly sessionConstraints: string[] = [];
  withSession(constraint?: string) {
    this.sessionConstraints.push(constraint ?? "");
    return this;
  }
  prepare(sql: string) {
    this.queries.push(sql);
    const statement = {
      sql,
      bind: (..._values: unknown[]) => statement,
      all: async () => ({
        results: sql.includes("s.owner_account_id = ?")
          ? [
              {
                organization_id: "org-1",
                event_id: "event-1",
                event_name: "Event One",
                event_slug: "event-one",
                event_status: "active",
                submission_id: "submission-1",
                participant_id: "participant-1",
                participant_role: "primary",
              },
            ]
          : [],
      }),
      first: async () =>
        sql.includes("GROUP BY s.organization_id")
          ? {
              organization_id: "org-1",
              submission_ids: "submission-1",
              participant_ids: "participant-1",
              primary_participant_id: "participant-1",
            }
          : null,
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
  it("projects authoritative decisions into participant submission status", () => {
    expect(portalSubmissionStatus("submitted", "accepted")).toBe("accepted");
    expect(portalSubmissionStatus("submitted", "rejected")).toBe("declined");
    expect(portalSubmissionStatus("submitted", "waitlisted")).toBe("under_review");
    expect(portalSubmissionStatus("submitted", undefined)).toBe("submitted");
  });

  it("discovers CFP applicant portal contexts from owned submissions", async () => {
    const database = new RecordingD1();
    const repository = new D1SpeakerRepository(database as unknown as D1Database);

    await expect(repository.listPortalContexts?.("account-1")).resolves.toEqual([
      {
        id: "event-1",
        organizationId: "org-1",
        eventId: "event-1",
        name: "Event One",
        slug: "event-one",
        status: "active",
        capabilities: ["submission-edit"],
        submissionIds: ["submission-1"],
        participantIds: ["participant-1"],
        primaryParticipantId: "participant-1",
      },
    ]);
    await expect(repository.listPortalContextScopes?.("account-1")).resolves.toEqual([
      {
        context: {
          id: "event-1",
          organizationId: "org-1",
          eventId: "event-1",
          name: "Event One",
          slug: "event-one",
          status: "active",
          capabilities: ["submission-edit"],
          submissionIds: ["submission-1"],
          participantIds: ["participant-1"],
          primaryParticipantId: "participant-1",
        },
        scope: {
          submissionIds: ["submission-1"],
          participantIds: ["participant-1"],
          capabilities: ["submission-edit"],
        },
      },
    ]);
    expect(database.queries.join("\n")).toContain("s.owner_account_id = ?");
    expect(database.sessionConstraints).toEqual(["first-primary", "first-primary"]);
  });

  it("authorizes CFP applicants to their owned submission resources", async () => {
    const database = new RecordingD1();
    const repository = new D1SpeakerRepository(database as unknown as D1Database);

    await expect(repository.getAccessScope("event-1", "account-1")).resolves.toEqual({
      tenantId: "org-1",
      submissionIds: ["submission-1"],
      participantIds: ["participant-1"],
      capabilities: ["submission-edit"],
      primaryParticipantId: "participant-1",
      role: "speaker",
    });
    expect(database.queries.join("\n")).toContain("s.event_id = ?");
    expect(database.queries.join("\n")).toContain("s.owner_account_id = ?");
    expect(database.sessionConstraints).toContain("first-primary");
  });

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
