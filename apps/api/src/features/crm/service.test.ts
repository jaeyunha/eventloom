import { describe, expect, it } from "vitest";
import { CrmService, InMemoryCrmRepository } from "./service";
import type { CrmActor, CrmContact } from "./types";

const actor: CrmActor = { kind: "user", organizationId: "org-a", userId: "owner-a", role: "owner" };
const otherActor: CrmActor = {
  kind: "user",
  organizationId: "org-b",
  userId: "owner-b",
  role: "owner",
};

function service() {
  let sequence = 0;
  return new CrmService(
    { repository: new InMemoryCrmRepository() },
    {
      clock: () => new Date("2026-01-01T00:00:00.000Z"),
      generateId: (prefix) => `${prefix}-${++sequence}`,
    },
  );
}

class FailPrimaryMergeRepository extends InMemoryCrmRepository {
  primaryContactId: string | undefined;
  failPrimarySaveOnce = false;
  duplicateRetirementWrites = 0;

  override async saveContact(
    contact: CrmContact,
    expectedVersion: number | null,
  ): Promise<CrmContact> {
    if (
      this.failPrimarySaveOnce &&
      contact.id === this.primaryContactId &&
      contact.status === "active" &&
      expectedVersion !== null
    ) {
      this.failPrimarySaveOnce = false;
      throw new Error("Injected primary save failure.");
    }
    if (contact.status === "merged" && contact.mergedIntoId === this.primaryContactId)
      this.duplicateRetirementWrites += 1;
    return super.saveContact(contact, expectedVersion);
  }
}

describe("CrmService", () => {
  it("keeps contacts tenant isolated while supporting search, custom fields, and tags", async () => {
    const crm = service();
    const contact = await crm.createContact(actor, {
      organizationId: "org-a",
      displayName: "Ada Lovelace",
      email: "ADA@example.com",
      tags: ["Speaker", "speaker"],
      customFields: { sourceCampaign: "winter" },
    });
    await crm.createContact(otherActor, {
      organizationId: "org-b",
      displayName: "Ada B",
      email: "ada-b@example.com",
    });

    expect(contact.email).toBe("ada@example.com");
    expect(contact.tags).toEqual(["speaker"]);
    expect(
      (await crm.searchContacts(actor, "org-a", { query: "ada" })).map((item) => item.id),
    ).toEqual([contact.id]);
    await expect(crm.listContacts(actor, "org-b")).rejects.toMatchObject({ code: "CRM_FORBIDDEN" });
    await expect(crm.getContact(actor, "org-a", "missing")).rejects.toMatchObject({
      code: "CRM_NOT_FOUND",
    });
  });

  it("imports CSV rows idempotently and supports saved segment evaluation", async () => {
    const crm = service();
    const first = await crm.importCsv(actor, {
      organizationId: "org-a",
      idempotencyKey: "csv-1",
      csv: "name,email,topics\nGrace Hopper,grace@example.com,compiler\nAlan Turing,alan@example.com,security",
    });
    const replay = await crm.importCsv(actor, {
      organizationId: "org-a",
      idempotencyKey: "csv-1",
      csv: "name,email,topics\nGrace Hopper,grace@example.com,compiler\nAlan Turing,alan@example.com,security",
    });
    expect(first.created).toBe(2);
    expect(first.mapping).toEqual([
      { sourceColumn: "name", targetField: "displayName", custom: false },
      { sourceColumn: "email", targetField: "email", custom: false },
      { sourceColumn: "topics", targetField: "custom.topics", custom: true },
    ]);
    expect(first.rows).toEqual([
      {
        rowNumber: 1,
        identity: "grace@example.com",
        status: "created",
        contactId: first.contacts[0]?.id,
        reason: null,
      },
      {
        rowNumber: 2,
        identity: "alan@example.com",
        status: "created",
        contactId: first.contacts[1]?.id,
        reason: null,
      },
    ]);
    const createOnly = await crm.importCsv(actor, {
      organizationId: "org-a",
      idempotencyKey: "csv-create-only",
      mode: "create",
      csv: "name,email\nGrace Duplicate, GRACE@example.com\nNo identity,",
    });
    expect(createOnly).toMatchObject({ created: 0, updated: 0, skipped: 2 });
    expect(createOnly.rows.map((row) => row.status)).toEqual(["skipped", "skipped"]);
    expect(replay.id).toBe(first.id);
    expect(replay.idempotent).toBe(true);

    const segment = await crm.createSegment(actor, {
      organizationId: "org-a",
      name: "Compiler contacts",
      rules: [{ field: "custom.topics", operator: "contains", value: "compiler" }],
    });
    expect(
      (await crm.listSegmentContacts(actor, "org-a", segment.id)).map((item) => item.displayName),
    ).toEqual(["Grace Hopper"]);
  });

  it("imports same-name contacts by normalized email and preserves speaker metadata on partial updates", async () => {
    const crm = service();
    const result = await crm.importCsv(actor, {
      organizationId: "org-a",
      idempotencyKey: "speaker-import-identity",
      csv: [
        "name,email,jobTitle,company,source",
        "Priya Raman,priya@example.com,Principal Engineer,Latticework Systems,speaker",
        "Priya Raman,priya.second@example.com,Community Lead,Northstar,speaker",
        "Priya Updated, PRIYA@example.com, , ,speaker",
      ].join("\n"),
    });

    expect(result).toMatchObject({ created: 2, updated: 1, skipped: 0 });
    const contacts = await crm.listContacts(actor, "org-a", { limit: 10 });
    expect(contacts).toHaveLength(2);
    expect(contacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayName: "Priya Updated",
          email: "priya@example.com",
          company: "Latticework Systems",
          title: "Principal Engineer",
          source: "speaker",
        }),
        expect.objectContaining({
          displayName: "Priya Raman",
          email: "priya.second@example.com",
          company: "Northstar",
          title: "Community Lead",
          source: "speaker",
        }),
      ]),
    );
    expect(result.rows[0]?.contactId).toBe(result.rows[2]?.contactId);
  });

  it("maps speaker row metadata without clearing fields omitted by a later email upsert", async () => {
    const crm = service();
    const created = await crm.importContacts(actor, {
      organizationId: "org-a",
      idempotencyKey: "speaker-row-create",
      rows: [
        {
          displayName: "Marcus Okafor",
          email: "MARCUS@example.com",
          company: "Northstar",
          jobTitle: "Community Lead",
          source: "speaker",
        },
      ],
    });
    const contactId = created.rows[0]?.contactId;
    expect(contactId).not.toBeNull();

    const updated = await crm.importContacts(actor, {
      organizationId: "org-a",
      idempotencyKey: "speaker-row-update",
      rows: [
        {
          displayName: "Marcus O.",
          email: " marcus@example.com ",
          company: " ",
          jobTitle: " ",
          source: "speaker",
        },
      ],
    });

    expect(updated).toMatchObject({ created: 0, updated: 1, skipped: 0 });
    expect(updated.contacts).toEqual([
      expect.objectContaining({
        id: contactId,
        displayName: "Marcus O.",
        email: "marcus@example.com",
        company: "Northstar",
        title: "Community Lead",
        source: "speaker",
      }),
    ]);
    await expect(crm.listContacts(actor, "org-a")).resolves.toHaveLength(1);
  });
  it("detects and merges duplicates, retaining tags and custom fields", async () => {
    const crm = service();
    const primary = await crm.createContact(actor, {
      organizationId: "org-a",
      displayName: "Katherine Johnson",
      email: "katherine@example.com",
      tags: ["vip"],
      customFields: { cohort: "one" },
    });
    const duplicate = await crm.createContact(actor, {
      organizationId: "org-a",
      displayName: "Katherine Johnson",
      email: "other@example.com",
      tags: ["speaker"],
      customFields: { track: "math" },
    });
    expect(
      (await crm.findDuplicates(actor, "org-a", primary.id)).matches.map((item) => item.contact.id),
    ).toContain(duplicate.id);
    const merged = await crm.mergeContacts(actor, {
      organizationId: "org-a",
      primaryContactId: primary.id,
      duplicateContactIds: [duplicate.id],
      idempotencyKey: "merge-1",
    });
    expect(merged.primary.tags).toEqual(["speaker", "vip"]);
    expect(merged.primary.customFields).toMatchObject({ cohort: "one", track: "math" });
    expect(merged.merged[0]?.mergedIntoId).toBe(primary.id);
  });
  it("applies authoritative scalar and custom-field winners while merging duplicate emails", async () => {
    const crm = service();
    const primary = await crm.createContact(actor, {
      organizationId: "org-a",
      displayName: "Primary Contact",
      email: "primary@example.com",
      customFields: { role: "primary", region: "west" },
    });
    const duplicate = await crm.createContact(actor, {
      organizationId: "org-a",
      displayName: "Duplicate Contact",
      email: "winner@example.com",
      customFields: { role: "duplicate", source: "import" },
    });

    const merged = await crm.mergeContacts(actor, {
      organizationId: "org-a",
      primaryContactId: primary.id,
      duplicateContactIds: [duplicate.id],
      fieldWinners: { email: duplicate.id, name: duplicate.id },
      customFieldWinners: { role: duplicate.id },
      idempotencyKey: "merge-winners",
    });

    expect(merged.primary.email).toBe("winner@example.com");
    expect(merged.primary.displayName).toBe("Duplicate Contact");
    expect(merged.primary.customFields).toMatchObject({
      role: "duplicate",
      region: "west",
      source: "import",
    });
    expect(merged.merged[0]?.status).toBe("merged");
    expect(merged.merged[0]?.mergedIntoId).toBe(primary.id);
  });

  it("rejects invalid or cross-tenant winner IDs before mutating contacts", async () => {
    const crm = service();
    const primary = await crm.createContact(actor, {
      organizationId: "org-a",
      displayName: "Primary Contact",
      email: "primary@example.com",
    });
    const duplicate = await crm.createContact(actor, {
      organizationId: "org-a",
      displayName: "Duplicate Contact",
      email: "duplicate@example.com",
    });
    const foreign = await crm.createContact(otherActor, {
      organizationId: "org-b",
      displayName: "Foreign Contact",
      email: "foreign@example.com",
    });

    await expect(
      crm.mergeContacts(actor, {
        organizationId: "org-a",
        primaryContactId: primary.id,
        duplicateContactIds: [duplicate.id],
        fieldWinners: { email: "missing-contact" },
      }),
    ).rejects.toMatchObject({ code: "CRM_INVALID_INPUT" });
    await expect(
      crm.mergeContacts(actor, {
        organizationId: "org-a",
        primaryContactId: primary.id,
        duplicateContactIds: [duplicate.id],
        fieldWinners: { email: foreign.id },
      }),
    ).rejects.toMatchObject({ code: "CRM_INVALID_INPUT" });

    expect(await crm.getContact(actor, "org-a", primary.id)).toEqual(primary);
    expect(await crm.getContact(actor, "org-a", duplicate.id)).toEqual(duplicate);
  });

  it("replays an idempotent merge without applying it twice", async () => {
    const crm = service();
    const primary = await crm.createContact(actor, {
      organizationId: "org-a",
      displayName: "Primary Contact",
      email: "primary@example.com",
    });
    const duplicate = await crm.createContact(actor, {
      organizationId: "org-a",
      displayName: "Duplicate Contact",
      email: "duplicate@example.com",
    });
    const input = {
      organizationId: "org-a",
      primaryContactId: primary.id,
      duplicateContactIds: [duplicate.id],
      fieldWinners: { email: duplicate.id },
      idempotencyKey: "merge-replay",
    } as const;

    const first = await crm.mergeContacts(actor, input);
    const replay = await crm.mergeContacts(actor, input);

    expect(first.idempotent).toBe(false);
    expect(replay.idempotent).toBe(true);
    expect(replay.primary).toEqual(first.primary);
    expect(await crm.getContactHistory(actor, "org-a", primary.id)).toHaveLength(1);
  });
  it("resumes after duplicate retirement when the primary save fails", async () => {
    let sequence = 0;
    const repository = new FailPrimaryMergeRepository();
    const crm = new CrmService(
      { repository },
      {
        clock: () => new Date("2026-01-01T00:00:00.000Z"),
        generateId: (prefix) => `${prefix}-${++sequence}`,
      },
    );
    const primary = await crm.createContact(actor, {
      organizationId: "org-a",
      displayName: "Primary Contact",
      email: "primary@example.com",
      customFields: { region: "west" },
    });
    const duplicate = await crm.createContact(actor, {
      organizationId: "org-a",
      displayName: "Duplicate Contact",
      email: "winner@example.com",
      customFields: { role: "duplicate", source: "import" },
    });
    repository.primaryContactId = primary.id;
    repository.failPrimarySaveOnce = true;
    const input = {
      organizationId: "org-a",
      primaryContactId: primary.id,
      duplicateContactIds: [duplicate.id],
      fieldWinners: { email: duplicate.id },
      customFieldWinners: { role: duplicate.id },
      idempotencyKey: "merge-resume",
    } as const;

    await expect(crm.mergeContacts(actor, input)).rejects.toThrow("Injected primary save failure.");

    const partiallyMergedDuplicate = await crm.getContact(actor, "org-a", duplicate.id);
    expect(partiallyMergedDuplicate).toMatchObject({
      status: "merged",
      mergedIntoId: primary.id,
      customFields: duplicate.customFields,
    });
    expect(await crm.getContact(actor, "org-a", primary.id)).toEqual(primary);

    const retry = await crm.mergeContacts(actor, input);
    expect(retry.idempotent).toBe(false);
    expect(retry.primary.email).toBe(duplicate.email);
    expect(retry.primary.customFields).toMatchObject({
      region: "west",
      role: "duplicate",
      source: "import",
    });
    expect(retry.merged[0]?.customFields).toEqual(duplicate.customFields);
    expect(repository.duplicateRetirementWrites).toBe(1);

    const replay = await crm.mergeContacts(actor, input);
    expect(replay.idempotent).toBe(true);
    expect(repository.duplicateRetirementWrites).toBe(1);
    expect(await crm.getContactHistory(actor, "org-a", primary.id)).toHaveLength(1);
  });

  it("records pipeline history, notes, event projection, personalized outreach, and analytics", async () => {
    const crm = service();
    const contact = await crm.createContact(actor, {
      organizationId: "org-a",
      displayName: "Grace Hopper",
      email: "grace@example.com",
      firstName: "Grace",
    });
    const progressed = await crm.setPipelineStage(actor, {
      organizationId: "org-a",
      contactId: contact.id,
      stage: "qualified",
      note: "Strong fit",
    });
    expect(progressed.pipelineStage).toBe("qualified");
    await crm.addNote(actor, {
      organizationId: "org-a",
      contactId: contact.id,
      body: "Follow up after the event.",
    });
    const event = await crm.addContactToEvent(actor, {
      organizationId: "org-a",
      contactId: contact.id,
      eventId: "event-a",
      idempotencyKey: "event-1",
    });
    expect(
      (
        await crm.addContactToEvent(actor, {
          organizationId: "org-a",
          contactId: contact.id,
          eventId: "event-a",
          idempotencyKey: "event-1",
        })
      ).idempotent,
    ).toBe(true);
    const existingEvent = await crm.addContactToEvent(actor, {
      organizationId: "org-a",
      contactId: contact.id,
      eventId: "event-a",
      idempotencyKey: "event-2",
    });
    expect(existingEvent).toMatchObject({ idempotent: true, outcome: "existing" });
    await expect(
      crm.addContactToEvent(actor, {
        organizationId: "org-a",
        contactId: contact.id,
        eventId: "event-a",
        role: "speaker",
        idempotencyKey: "event-1",
      }),
    ).rejects.toMatchObject({ code: "CRM_CONFLICT" });
    const outreach = await crm.sendPersonalizedOutreach(actor, {
      organizationId: "org-a",
      contactId: contact.id,
      subject: "Hello",
      body: "Hi {{firstName}}",
      idempotencyKey: "outreach-1",
    });
    expect(outreach.renderedBody).toBe("Hi Grace");
    expect(outreach).toMatchObject({
      subject: "Hello",
      status: "failed",
      queuedCount: 0,
      sentCount: 0,
      failedCount: 1,
      terminal: true,
    });
    const history = await crm.getContactHistory(actor, "org-a", contact.id);
    expect(history.map((entry) => entry.kind)).toEqual(
      expect.arrayContaining(["pipeline", "note", "event", "communication"]),
    );
    expect((await crm.analytics(actor, "org-a")).contactsByEvent).toEqual([
      { eventId: "event-a", count: 1 },
    ]);
    expect(event.projection.contactId).toBe(contact.id);
    expect(event.outcome).toBe("created");
    await expect(
      crm.sendPersonalizedOutreach(actor, {
        organizationId: "org-a",
        contactId: contact.id,
        subject: "Hello {{unknownTag}}",
        body: "Body",
        idempotencyKey: "outreach-unknown",
      }),
    ).rejects.toMatchObject({ code: "CRM_INVALID_INPUT" });
  });
  it("keeps same-name event projections keyed by contact identity", async () => {
    const repository = new InMemoryCrmRepository();
    let sequence = 0;
    const crm = new CrmService(
      { repository },
      {
        clock: () => new Date("2026-01-01T00:00:00.000Z"),
        generateId: (prefix) => `${prefix}-${++sequence}`,
      },
    );
    const first = await crm.createContact(actor, {
      organizationId: "org-a",
      displayName: "Marcus Chen",
      email: "marcus.first@example.com",
    });
    const selected = await crm.createContact(actor, {
      organizationId: "org-a",
      displayName: "Marcus Chen",
      email: "marcus.selected@example.com",
    });

    await crm.addContactToEvent(actor, {
      organizationId: "org-a",
      contactId: first.id,
      eventId: "event-a",
      idempotencyKey: "event-first",
    });
    const projected = await crm.addContactToEvent(actor, {
      organizationId: "org-a",
      contactId: selected.id,
      eventId: "event-a",
      idempotencyKey: "event-selected",
    });

    const projections = await repository.listProjections("org-a");
    expect(projections).toHaveLength(2);
    expect(projections.map((projection) => projection.contactId)).toEqual(
      expect.arrayContaining([first.id, selected.id]),
    );
    expect(projected.projection.contactId).toBe(selected.id);
    await expect(crm.getContact(actor, "org-a", selected.id)).resolves.toMatchObject({
      id: selected.id,
      email: "marcus.selected@example.com",
    });
  });
  it("uses the outreach boundary once while retaining an Airtable-compatible command receipt", async () => {
    const repository = new InMemoryCrmRepository();
    const sent: string[] = [];
    const crm = new CrmService(
      {
        repository,
        outreach: {
          async send(command) {
            sent.push(command.idempotencyKey);
            return { ...command, status: "queued" };
          },
        },
      },
      {
        clock: () => new Date("2026-01-01T00:00:00.000Z"),
        generateId: (prefix) => `${prefix}-boundary`,
      },
    );
    const contact = await crm.createContact(actor, {
      organizationId: "org-a",
      displayName: "Queue Recipient",
      email: "recipient@example.com",
    });
    const input = {
      organizationId: "org-a",
      contactId: contact.id,
      subject: "Follow up",
      body: "Hello {{displayName}}",
      idempotencyKey: "outreach-boundary-1",
    };
    const first = await crm.sendPersonalizedOutreach(actor, input);
    const replay = await crm.sendPersonalizedOutreach(actor, input);
    expect(first.status).toBe("queued");
    expect(first).toMatchObject({
      status: "queued",
      queuedCount: 1,
      sentCount: 0,
      failedCount: 0,
      terminal: false,
      recipientEmail: "recipient@example.com",
      subject: "Follow up",
    });
    expect(replay).toEqual(first);
    expect(sent).toEqual(["outreach-boundary-1"]);
    await expect(
      repository.getOutreachByIdempotencyKey("org-a", input.idempotencyKey),
    ).resolves.toEqual(expect.objectContaining({ contactId: contact.id, status: "queued" }));
    expect(
      (await repository.listHistory("org-a", contact.id)).filter(
        (entry) => entry.kind === "communication",
      ),
    ).toHaveLength(1);

    const delivered = await crm.recordOutreachDeliveryStatus({
      organizationId: "org-a",
      outreachId: first.id,
      idempotencyKey: input.idempotencyKey,
      status: "delivered",
      providerMessageId: "provider-message-1",
      occurredAt: "2026-01-01T00:01:00.000Z",
    });
    expect(delivered).toMatchObject({
      status: "delivered",
      queuedCount: 0,
      sentCount: 1,
      failedCount: 0,
      terminal: true,
      providerMessageId: "provider-message-1",
      completedAt: "2026-01-01T00:01:00.000Z",
    });
    await expect(
      crm.recordOutreachDeliveryStatus({
        organizationId: "org-a",
        outreachId: first.id,
        idempotencyKey: input.idempotencyKey,
        status: "delivered",
        providerMessageId: "provider-message-1",
      }),
    ).resolves.toEqual(delivered);
    await expect(
      crm.recordOutreachDeliveryStatus({
        organizationId: "org-a",
        outreachId: first.id,
        idempotencyKey: input.idempotencyKey,
        status: "bounced",
      }),
    ).rejects.toMatchObject({ code: "CRM_CONFLICT" });
    expect(
      (await repository.listHistory("org-a", contact.id)).filter(
        (entry) => entry.kind === "communication",
      ),
    ).toHaveLength(2);
  });
  it.each(["failed", "bounced", "complained"] as const)(
    "persists terminal %s outreach completion",
    async (status) => {
      const repository = new InMemoryCrmRepository();
      const crm = new CrmService(
        {
          repository,
          outreach: {
            async send(command) {
              return { ...command, status: "queued" };
            },
          },
        },
        {
          clock: () => new Date("2026-01-01T00:00:00.000Z"),
          generateId: (prefix) => `${prefix}-${status}`,
        },
      );
      const contact = await crm.createContact(actor, {
        organizationId: "org-a",
        displayName: "Terminal Recipient",
        email: `${status}@example.com`,
      });
      const outreach = await crm.sendPersonalizedOutreach(actor, {
        organizationId: "org-a",
        contactId: contact.id,
        subject: "Follow up",
        body: "Hello",
        idempotencyKey: `outreach-${status}`,
      });

      const completed = await crm.recordOutreachDeliveryStatus({
        organizationId: "org-a",
        outreachId: outreach.id,
        idempotencyKey: `outreach-${status}`,
        status,
        providerMessageId: `provider-${status}`,
        reason: `provider reported ${status}`,
      });

      expect(completed).toMatchObject({
        status,
        queuedCount: 0,
        sentCount: 0,
        failedCount: 1,
        terminal: true,
        failureReason: `provider reported ${status}`,
        providerMessageId: `provider-${status}`,
      });
    },
  );
});
