import { describe, expect, it } from "vitest";
import { InMemoryReportRepository, neutralizeSpreadsheetFormula, ReportService } from "./service";
import type { ReportActor, ReportProgramRecord } from "./types";

const now = () => new Date("2026-08-09T12:00:00.000Z");

const organizer: ReportActor = {
  tenantId: "tenant-1",
  userId: "organizer-1",
  kind: "human",
  grants: [{ eventId: "event-1", role: "organizer" }],
};

const piiOrganizer: ReportActor = {
  ...organizer,
  userId: "organizer-pii",
  canViewPersonalData: true,
  grants: [{ eventId: "event-1", role: "organizer", canViewPersonalData: true }],
};

const otherTenantOrganizer: ReportActor = {
  tenantId: "tenant-2",
  userId: "organizer-2",
  kind: "human",
  grants: [{ eventId: "event-1", role: "organizer" }],
};

const records: readonly ReportProgramRecord[] = [
  {
    tenantId: "tenant-1",
    eventId: "event-1",
    session: {
      id: "session-2",
      title: '=HYPERLINK("https://attacker.test")',
      description: "Public session",
      privateNotes: "must not be exported",
    },
    participants: [
      {
        id: "participant-2",
        displayName: "Beta Person",
        email: "beta@example.test",
        privateFile: "r2://private",
      },
    ],
    speakers: [{ id: "speaker-2", displayName: "Beta Speaker", email: "speaker@example.test" }],
    evaluationProgress: {
      planId: "plan-1",
      planName: "Program review",
      planVersion: 3,
      total: 4,
      assigned: 4,
      inProgress: 1,
      submitted: 2,
      abstained: 1,
      completionPercent: 50,
      reviewerNotes: "blind note",
    },
  },
  {
    tenantId: "tenant-1",
    eventId: "event-1",
    session: { id: "session-1", title: "Alpha", description: "A public session" },
    participants: [
      { id: "participant-1", displayName: "Alpha Person", email: "alpha@example.test" },
    ],
    speakers: [
      { id: "speaker-1", displayName: "Alpha Speaker", email: "alpha-speaker@example.test" },
    ],
    evaluationProgress: {
      planId: "plan-1",
      planName: "Program review",
      planVersion: 3,
      total: 4,
      assigned: 4,
      inProgress: 0,
      submitted: 4,
      abstained: 0,
      completionPercent: 100,
    },
  },
  {
    tenantId: "tenant-2",
    eventId: "event-1",
    session: { id: "other-session", title: "Other tenant" },
    participants: [
      { id: "other-person", displayName: "Other Person", email: "other@example.test" },
    ],
  },
];

function createService() {
  return new ReportService(new InMemoryReportRepository(records), { clock: now });
}

const definitionInput = {
  id: "definition-1",
  eventId: "event-1",
  name: "Completion report",
  description: "Program progress",
  relationships: ["sessions", "participants", "evaluationProgress"],
  fields: [
    "sessions.id",
    "sessions.title",
    "participants.displayName",
    "participants.email",
    "evaluationProgress.completionPercent",
  ],
  order: [
    "sessions.id",
    "sessions.title",
    "participants.displayName",
    "participants.email",
    "evaluationProgress.completionPercent",
  ],
  filters: [{ field: "evaluationProgress.completionPercent", operator: "gte" as const, value: 50 }],
  sort: [{ field: "sessions.id", direction: "asc" as const }],
};

describe("program report service", () => {
  it("isolates tenants and rejects fields outside the program allowlist", async () => {
    const service = createService();
    const created = await service.createDefinition(organizer, definitionInput);
    expect(created.tenantId).toBe("tenant-1");
    expect((await service.listDefinitions(organizer, "event-1")).map((item) => item.id)).toEqual([
      "definition-1",
    ]);
    expect(await service.listDefinitions(otherTenantOrganizer, "event-1")).toEqual([]);
    await expect(service.getDefinition(otherTenantOrganizer, "definition-1")).rejects.toMatchObject(
      {
        code: "REPORT_NOT_FOUND",
      },
    );
    await expect(
      service.createDefinition(organizer, {
        ...definitionInput,
        id: "private-definition",
        fields: ["sessions.privateNotes"],
      }),
    ).rejects.toMatchObject({ code: "REPORT_INVALID_INPUT" });
    expect(created.fields).not.toContain("sessions.privateNotes");
  });

  it("applies stable filters and sort, excludes blind/private data, and neutralizes CSV formulas", async () => {
    const service = createService();
    await service.createDefinition(organizer, definitionInput);
    const first = await service.runDefinition(organizer, "definition-1", { format: "csv" });
    const second = await service.runDefinition(organizer, "definition-1", { format: "csv" });

    expect(first.export.columns).toEqual([
      "sessions.id",
      "sessions.title",
      "participants.displayName",
      "evaluationProgress.completionPercent",
    ]);
    expect(first.export.body).toContain("session-1,Alpha,Alpha Person,100");
    expect(first.export.body).toContain(
      'session-2,"\'=HYPERLINK(""https://attacker.test"")",Beta Person,50',
    );
    expect(first.export.body).not.toContain("privateNotes");
    expect(first.export.body).not.toContain("reviewerNotes");
    expect(first.export.body).not.toContain("beta@example.test");
    expect(first.export.body).toBe(second.export.body);
    expect(first.audit).toEqual(second.audit);
    expect(first.audit.parameters).toMatchObject({
      definitionId: "definition-1",
      definitionVersion: 1,
      expectedVersion: 1,
    });
    expect(neutralizeSpreadsheetFormula("=1+1")).toBe("'=1+1");
    expect(neutralizeSpreadsheetFormula(10)).toBe(10);

    const xlsx = await service.runDefinition(organizer, "definition-1", { format: "xlsx" });
    expect(xlsx.export.contentType).toContain("spreadsheet");
    expect(xlsx.export.body).toContain("&apos;=HYPERLINK");
  });

  it("allows explicitly authorized personal fields and enforces optimistic version conflicts", async () => {
    const service = createService();
    await service.createDefinition(organizer, definitionInput);
    const updated = await service.updateDefinition(organizer, "definition-1", {
      expectedVersion: 1,
      description: "Updated description",
    });
    expect(updated.version).toBe(2);
    await expect(
      service.updateDefinition(organizer, "definition-1", { expectedVersion: 1, name: "stale" }),
    ).rejects.toMatchObject({ code: "REPORT_CONFLICT" });
    await expect(
      service.runDefinition(organizer, "definition-1", { expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: "REPORT_CONFLICT" });

    const authorized = await service.runDefinition(piiOrganizer, "definition-1", {
      expectedVersion: 2,
      parameters: { requestedByUi: true },
    });
    expect(authorized.export.columns).toContain("participants.email");
    expect(authorized.export.body).toContain("alpha@example.test");
    expect(authorized.audit.parameters.runParameters).toEqual({ requestedByUi: true });
    await service.deleteDefinition(organizer, "definition-1", 2);
    expect(await service.listDefinitions(organizer, "event-1")).toEqual([]);
  });
});
