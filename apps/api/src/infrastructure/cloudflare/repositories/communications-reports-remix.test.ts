import { describe, expect, it, vi } from "vitest";

import type { CommunicationTemplate } from "../../../features/communications/types";
import type { ContentRemixCandidate } from "../../../features/remix/types";
import type { ReportDefinition } from "../../../features/reports/types";
import { D1CommunicationRepository } from "./communications";
import { D1RemixRepository } from "./remix";
import { D1ReportRepository } from "./reports";

function database(resultsFor: (query: string) => readonly Record<string, unknown>[] = () => []) {
  const queries: string[] = [];
  const db = {
    prepare(query: string) {
      queries.push(query);
      return {
        bind() {
          return this;
        },
        async first() {
          return null;
        },
        async all() {
          return { results: resultsFor(query) };
        },
        async run() {
          return { meta: { changes: 1 } };
        },
      };
    },
    batch: vi.fn(async (items: readonly unknown[]) =>
      items.map(() => ({ meta: { changes: 1 }, results: [] })),
    ),
    queries,
  };
  return db as unknown as D1Database & { queries: string[]; batch: ReturnType<typeof vi.fn> };
}

const now = "2026-08-13T12:00:00.000Z";

describe("D1 communications, reports, and remix repositories", () => {
  it("updates an existing communication template version for approval", async () => {
    const communications = database();
    const template: CommunicationTemplate = {
      id: "template-1",
      tenantId: "org-1",
      eventId: "event-1",
      name: "Decision",
      purpose: "decision",
      version: 1,
      status: "approved",
      sender: "speakers@sessionboard.namuh.co",
      subject: "Decision",
      html: "<p>Decision</p>",
      text: "Decision",
      variables: [],
      createdBy: "user-1",
      createdAt: now,
      updatedAt: now,
      approvedBy: "user-1",
      approvedAt: now,
    };

    await new D1CommunicationRepository(communications).updateTemplate(template);

    expect(communications.queries.at(-1)).toContain("UPDATE communication_templates");
  });

  it("reads report speakers from canonical tenant-qualified profiles and participants", async () => {
    const reports = database((query) => {
      if (query.includes("FROM sessions s")) {
        return [
          {
            id: "session-1",
            title: "Canonical session",
            description: "Description",
            status: "accepted",
            room_name: null,
            track_names_json: "[]",
            format_name: null,
          },
        ];
      }
      if (
        query.includes("FROM session_speakers ss") &&
        query.includes("speaker_profiles profile")
      ) {
        return [
          {
            id: "participant-1",
            display_name: "Canonical Speaker",
            biography: "Canonical biography",
            email: "speaker@example.test",
          },
        ];
      }
      return [];
    });

    const records = await new D1ReportRepository(reports).listProgramRecords({
      tenantId: "org-1",
      eventId: "event-1",
      requesterId: "organizer-1",
      relationships: ["sessions", "speakers"],
      fields: ["speakers.id", "speakers.displayName", "speakers.biography", "speakers.email"],
      includePersonalData: true,
    });

    expect(records[0]?.speakers).toEqual([
      {
        id: "participant-1",
        displayName: "Canonical Speaker",
        biography: "Canonical biography",
        email: "speaker@example.test",
      },
    ]);
    const sql = reports.queries.join("\n");
    expect(sql).toContain("speaker_profiles profile");
    expect(sql).toContain("profile.organization_id=p.organization_id");
    expect(sql).not.toContain("speaker_roster");
  });

  it("batches tenant-scoped immutable writes, CAS guards, audit, and sync jobs", async () => {
    const communications = database();
    const template: CommunicationTemplate = {
      id: "template-1",
      tenantId: "org-1",
      eventId: "event-1",
      name: "Decision",
      purpose: "decision",
      version: 1,
      status: "draft",
      sender: "speakers@sessionboard.namuh.co",
      subject: "Decision",
      html: "<p>Decision</p>",
      text: "Decision",
      variables: [],
      createdBy: "user-1",
      createdAt: now,
      updatedAt: now,
      approvedBy: null,
      approvedAt: null,
    };
    await new D1CommunicationRepository(communications).saveTemplate(template);
    expect(communications.batch).toHaveBeenCalledOnce();
    expect(communications.queries.join("\n")).toContain("INSERT INTO communication_templates");
    expect(communications.queries.join("\n")).toContain("INSERT INTO audit_events");
    expect(communications.queries.join("\n")).toContain("airtable_sync_jobs");

    const reports = database();
    const definition: ReportDefinition = {
      id: "report-1",
      tenantId: "org-1",
      eventId: "event-1",
      name: "Program",
      description: "",
      relationships: ["sessions"],
      fields: ["sessions.id"],
      order: ["sessions.id"],
      filters: [],
      sort: [],
      version: 2,
      createdBy: "user-1",
      createdAt: now,
      updatedAt: now,
    };
    await new D1ReportRepository(reports).updateDefinition(
      { tenantId: "org-1", eventId: "event-1" },
      definition.id,
      1,
      definition,
    );
    const reportSql = reports.queries.join("\n");
    expect(reportSql).toContain("version=? AND deleted_at IS NULL");
    expect(reportSql).toContain("INSERT INTO report_definition_versions");
    expect(reportSql).toContain("INSERT INTO audit_events");

    const remix = database();
    const candidate: ContentRemixCandidate = {
      id: "candidate-1",
      tenantId: "org-1",
      eventId: "event-1",
      sourceType: "session",
      sourceId: "session-1",
      sourceRevision: 1,
      fields: ["title"],
      tone: "clear",
      guidance: "",
      original: { title: "Old", description: "", tags: [], tracks: [] },
      candidate: { title: "New", description: "", tags: [], tracks: [] },
      changedFields: ["title"],
      changeSummary: "Updated title",
      provenance: { provider: "test", model: "test", promptVersion: "1", generatedAt: now },
      status: "pending",
      version: 1,
      generation: 1,
      parentCandidateId: null,
      createdAt: now,
      createdBy: "user-1",
    };
    await new D1RemixRepository(remix).saveCandidate(candidate, null);
    const remixSql = remix.queries.join("\n");
    expect(remixSql).toContain("INSERT INTO remix_candidates");
    expect(remixSql).toContain("organization_id = ? AND id = ?");
    expect(remixSql).toContain("INSERT INTO audit_events");
  });
});
