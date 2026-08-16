import { describe, expect, it } from "vitest";
import type { CfpForm, EventCfp, Submission } from "../features/cfp/model";
import { CfpService } from "../features/cfp/service";
import { FakeAirtableTransport } from "../infrastructure/airtable/fake-transport";
import type {
  AirtableRequest,
  AirtableResponse,
  AirtableTransport,
} from "../infrastructure/airtable/types";
import { AirtableCfpRepository } from "./airtable";

const baseId = "base-cfp-latency";
const tenantId = "ai-engineer";
const eventId = "devflow-conf-2027";
const formId = "form-main";
const testOrganization = {
  getPublicOrganization: async (organizationId: string) => ({
    id: organizationId,
    slug: organizationId,
    name: "Latency test organization",
  }),
};

const event: EventCfp = {
  id: eventId,
  tenantId,
  version: 1,
  slug: eventId,
  name: "DevFlow Conf 2027",
  timezone: "America/Los_Angeles",
  opensAt: "2027-01-01T08:00:00.000Z",
  closesAt: "2027-06-01T07:00:00.000Z",
};

const form: CfpForm = {
  id: formId,
  tenantId,
  eventId,
  name: "Main CFP",
  version: 3,
  status: "published",
  welcomeContent: "Welcome",
  settings: {
    speakerLimit: 3,
    maxSubmissionsPerAccount: 5,
    remindersEnabled: true,
    adminNotificationsEnabled: true,
    confirmationMessage: "Received",
    successContent: "Thank you",
  },
  sections: [],
  submissionFields: [],
  participantFields: [],
  rules: [],
};

function submission(index: number, selectedFormId = formId): Submission {
  return {
    id: `submission-${index}`,
    tenantId,
    eventId,
    formId: selectedFormId,
    ownerAccountId: `account-${index}`,
    formVersion: form.version,
    version: 1,
    status: "submitted",
    completedSteps: ["welcome", "account", "submission", "participant", "review"],
    answers: { title: `Session ${index}` },
    participants: [
      {
        id: `participant-${index}`,
        firstName: "Speaker",
        lastName: String(index),
        email: `speaker-${index}@example.com`,
        role: "primary",
        biography: "Biography",
        answers: {},
      },
    ],
    secondaryContacts: [],
    createdAt: "2027-02-01T00:00:00.000Z",
    updatedAt: "2027-02-01T00:00:00.000Z",
    submittedAt: "2027-02-01T00:00:00.000Z",
  };
}

function seed(
  transport: FakeAirtableTransport,
  submissionCount: number,
  formIds: readonly string[] = [formId],
): void {
  transport.seed({
    baseId,
    table: "Events",
    fields: {
      "Application ID": event.id,
      "Settings JSON": JSON.stringify(event),
    },
  });
  for (const currentFormId of formIds) {
    transport.seed({
      baseId,
      table: "CFP Forms",
      fields: {
        "Application ID": currentFormId,
        "Fields JSON": JSON.stringify({ ...form, id: currentFormId }),
      },
    });
  }
  for (let index = 1; index <= submissionCount; index += 1) {
    const currentFormId = formIds[(index - 1) % formIds.length] ?? formId;
    const record = submission(index, currentFormId);
    transport.seed({
      baseId,
      table: "Submissions",
      fields: {
        "Application ID": record.id,
        "Answers JSON": JSON.stringify(record),
      },
    });
  }
}

class DelayedTransport implements AirtableTransport {
  activeReads = 0;
  maxConcurrentReads = 0;
  activeFormReads = 0;
  maxConcurrentFormReads = 0;

  constructor(
    private readonly transport: AirtableTransport,
    private readonly delayMs: number,
  ) {}

  async request<TBody = unknown>(request: AirtableRequest): Promise<AirtableResponse<TBody>> {
    if (request.method !== "GET") {
      return this.transport.request<TBody>(request);
    }
    const isFormRead = request.table === "CFP Forms";
    this.activeReads += 1;
    if (isFormRead) {
      this.activeFormReads += 1;
      this.maxConcurrentFormReads = Math.max(this.maxConcurrentFormReads, this.activeFormReads);
    }
    this.maxConcurrentReads = Math.max(this.maxConcurrentReads, this.activeReads);
    try {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
      return await this.transport.request<TBody>(request);
    } finally {
      this.activeReads -= 1;
      if (isFormRead) {
        this.activeFormReads -= 1;
      }
    }
  }
}

describe("organizer CFP submission latency", () => {
  it("runs event, submission, and form reads in one wave without losing alternate records", async () => {
    const fake = new FakeAirtableTransport();
    seed(fake, 4);
    for (const invalid of [
      { ...submission(5), id: "submission-other-tenant", tenantId: "other-tenant" },
      { ...submission(6), id: "submission-other-event", eventId: "other-event" },
    ]) {
      fake.seed({
        baseId,
        table: "Submissions",
        fields: {
          "Application ID": invalid.id,
          "Answers JSON": JSON.stringify(invalid),
        },
      });
    }

    const alternatePayload = submission(7);
    fake.seed({
      baseId,
      table: "Submissions",
      fields: {
        "Application ID": alternatePayload.id,
        Payload: JSON.stringify(alternatePayload),
      },
    });
    const indexedEvent = submission(8);
    fake.seed({
      baseId,
      table: "Submissions",
      fields: {
        "Application ID": indexedEvent.id,
        "Event ID": indexedEvent.eventId,
        "Answers JSON": JSON.stringify({ ...indexedEvent, eventId: "other-event" }),
      },
    });
    const flat = submission(9);
    fake.seed({
      baseId,
      table: "Submissions",
      fields: {
        "Application ID": flat.id,
        "Tenant ID": flat.tenantId,
        "Event ID": flat.eventId,
        "Form ID": flat.formId,
        "Owner Account ID": flat.ownerAccountId,
        formVersion: flat.formVersion,
        Version: flat.version,
        Status: flat.status,
        completedSteps: JSON.stringify(flat.completedSteps),
        answers: JSON.stringify(flat.answers),
        participants: JSON.stringify(flat.participants),
        secondaryContacts: JSON.stringify(flat.secondaryContacts),
        "Created At": flat.createdAt,
        "Updated At": flat.updatedAt,
        submittedAt: flat.submittedAt ?? "",
      },
    });
    const aliasSubmissions = [
      { alias: "JSON", record: submission(10) },
      { alias: "Data", record: submission(11) },
      { alias: "Record JSON", record: submission(12) },
    ] as const;
    for (const { alias, record } of aliasSubmissions) {
      fake.seed({
        baseId,
        table: "Submissions",
        fields: {
          "Application ID": record.id,
          [alias]: JSON.stringify(record),
        },
      });
    }

    const alternateForm = { ...form, id: "form-alternate" };
    fake.seed({
      baseId,
      table: "CFP Forms",
      fields: {
        "Application ID": alternateForm.id,
        JSON: JSON.stringify(alternateForm),
      },
    });
    const alternateFormSubmission = submission(13, alternateForm.id);
    fake.seed({
      baseId,
      table: "Submissions",
      fields: {
        "Application ID": alternateFormSubmission.id,
        "Answers JSON": JSON.stringify(alternateFormSubmission),
      },
    });
    const wrongEventForm = { ...form, id: "form-other-event", eventId: "other-event" };
    fake.seed({
      baseId,
      table: "CFP Forms",
      fields: {
        "Application ID": wrongEventForm.id,
        "Fields JSON": JSON.stringify(wrongEventForm),
      },
    });
    const wrongFormSubmission = submission(14, wrongEventForm.id);
    fake.seed({
      baseId,
      table: "Submissions",
      fields: {
        "Application ID": wrongFormSubmission.id,
        "Answers JSON": JSON.stringify(wrongFormSubmission),
      },
    });
    const wrongTenantForm = { ...form, id: "form-other-tenant", tenantId: "other-tenant" };
    fake.seed({
      baseId,
      table: "CFP Forms",
      fields: {
        "Application ID": wrongTenantForm.id,
        "Fields JSON": JSON.stringify(wrongTenantForm),
      },
    });

    const readDelayMs = 700;
    const delayed = new DelayedTransport(fake, readDelayMs);
    const repository = new AirtableCfpRepository({ baseId, transport: delayed });
    const service = new CfpService({
      repository,
      idempotency: {} as never,
      effects: {} as never,
      organization: testOrganization,
    });

    const startedAt = performance.now();
    const records = await service.listOrganizerSubmissions({ tenantId, eventId });
    const elapsedMs = performance.now() - startedAt;

    expect(3 * readDelayMs).toBeGreaterThan(1_000);
    expect(elapsedMs).toBeLessThan(1_200);
    expect(delayed.maxConcurrentReads).toBe(3);
    expect(delayed.maxConcurrentFormReads).toBe(1);
    expect(records).toHaveLength(11);
    expect(Object.keys(records[0] ?? {}).sort()).toEqual([
      "participantFields",
      "submission",
      "submissionFields",
    ]);
    expect(records[0]?.submission).toEqual(submission(1));
    expect(records[0]?.submission.participants).toEqual(submission(1).participants);
    expect(records.map(({ submission: record }) => record.id)).toEqual([
      "submission-1",
      "submission-10",
      "submission-11",
      "submission-12",
      alternateFormSubmission.id,
      "submission-2",
      "submission-3",
      "submission-4",
      alternatePayload.id,
      indexedEvent.id,
      flat.id,
    ]);
    const indexedRecord = records.find(
      ({ submission: record }) => record.id === indexedEvent.id,
    )?.submission;
    expect(indexedRecord).toEqual(indexedEvent);
    const flatRecord = records.find(({ submission: record }) => record.id === flat.id)?.submission;
    expect(flatRecord).toEqual(flat);
    expect(
      records.find(({ submission: record }) => record.id === wrongFormSubmission.id),
    ).toBeUndefined();

    const reads = fake.requests.filter((request) => request.method === "GET");
    expect(reads).toHaveLength(3);
    expect(reads.filter((request) => request.table === "Events")).toHaveLength(1);
    expect(reads.filter((request) => request.table === "Submissions")).toHaveLength(1);
    expect(reads.filter((request) => request.table === "CFP Forms")).toHaveLength(1);
    expect(
      reads.find((request) => request.table === "Submissions")?.query?.filterByFormula,
    ).toBeUndefined();
    expect(
      reads.find((request) => request.table === "CFP Forms")?.query?.filterByFormula,
    ).toBeUndefined();
  });

  it("keeps the provider request count bounded as event forms grow", async () => {
    const fake = new FakeAirtableTransport();
    const formIds = [formId, ...Array.from({ length: 50 }, (_, index) => `form-${index + 1}`)];
    seed(fake, formIds.length, formIds);
    const delayed = new DelayedTransport(fake, 5);
    const repository = new AirtableCfpRepository({ baseId, transport: delayed });
    const service = new CfpService({
      repository,
      idempotency: {} as never,
      effects: {} as never,
      organization: testOrganization,
    });

    const records = await service.listOrganizerSubmissions({ tenantId, eventId });

    expect(records).toHaveLength(formIds.length);
    const reads = fake.requests.filter((request) => request.method === "GET");
    expect(reads).toHaveLength(3);
    expect(reads.filter((request) => request.table === "CFP Forms")).toHaveLength(1);
    expect(delayed.maxConcurrentReads).toBe(3);
    expect(delayed.maxConcurrentFormReads).toBe(1);
  });
  it("saves an existing draft in three read waves without a redundant update lookup", async () => {
    const fake = new FakeAirtableTransport();
    seed(fake, 0);
    const { submittedAt: _submittedAt, ...submitted } = submission(1);
    const draft: Submission = {
      ...submitted,
      status: "draft",
      completedSteps: ["welcome"],
    };
    fake.seed({
      baseId,
      table: "Submissions",
      fields: {
        "Application ID": draft.id,
        "Answers JSON": JSON.stringify(draft),
      },
    });
    const readDelayMs = 300;
    const delayed = new DelayedTransport(fake, readDelayMs);
    const repository = new AirtableCfpRepository({ baseId, transport: delayed });
    const service = new CfpService({
      repository,
      idempotency: {
        run: <T>(_scope: string, _key: string, operation: () => Promise<T>) => operation(),
      },
      effects: {
        enqueueSubmissionConfirmation: async () => undefined,
      },
      organization: testOrganization,
      clock: { now: () => new Date("2027-02-01T00:00:00.000Z") },
    });

    const startedAt = performance.now();
    const saved = await service.saveDraft({
      tenantId,
      eventId,
      submissionId: draft.id,
      ownerAccountId: draft.ownerAccountId,
      expectedVersion: draft.version,
      formVersion: draft.formVersion,
      idempotencyKey: "save-existing-draft",
      completedStep: "account",
      answers: {},
    });
    const elapsedMs = performance.now() - startedAt;

    expect(saved.version).toBe(2);
    expect(saved.completedSteps).toEqual(["welcome", "account"]);
    expect(elapsedMs).toBeLessThan(1_300);
    expect(delayed.maxConcurrentReads).toBe(2);
    const reads = fake.requests.filter((request) => request.method === "GET");
    expect(reads).toHaveLength(4);
    expect(reads.filter((request) => request.table === "Submissions")).toHaveLength(2);
    expect(reads.filter((request) => request.table === "Events")).toHaveLength(1);
    expect(reads.filter((request) => request.table === "CFP Forms")).toHaveLength(1);
    expect(fake.requests.filter((request) => request.method === "PATCH")).toHaveLength(1);
  });

  it("preserves authoritative Airtable event identity while updating CFP-owned fields", async () => {
    const fake = new FakeAirtableTransport();
    seed(fake, 0);
    const repository = new AirtableCfpRepository({ baseId, transport: fake });

    await repository.saveEvent(
      {
        ...event,
        version: 2,
        slug: "forged-slug",
        name: "Forged name",
        timezone: "UTC",
        opensAt: "2027-01-02T08:00:00.000Z",
        closesAt: "2027-06-02T07:00:00.000Z",
      },
      1,
    );

    await expect(repository.getEvent(tenantId, eventId)).resolves.toMatchObject({
      id: event.id,
      tenantId: event.tenantId,
      version: 2,
      slug: event.slug,
      name: event.name,
      timezone: event.timezone,
      opensAt: "2027-01-02T08:00:00.000Z",
      closesAt: "2027-06-02T07:00:00.000Z",
    });
  });

  it("does not create a missing authoritative Airtable event through CFP persistence", async () => {
    const fake = new FakeAirtableTransport();
    const repository = new AirtableCfpRepository({ baseId, transport: fake });

    await expect(repository.saveEvent(event, null)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(fake.requests.some((request) => request.method === "POST")).toBe(false);
  });

  it("checks the live submission version before updating by Airtable record id", async () => {
    const fake = new FakeAirtableTransport();
    seed(fake, 1);
    const repository = new AirtableCfpRepository({ baseId, transport: fake });
    const current = submission(1);

    await expect(
      repository.saveSubmissionVersion(
        {
          submission: { ...current, version: current.version + 1 },
          reason: "draft_saved",
          actorId: current.ownerAccountId,
        },
        current.version + 1,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(fake.requests.filter((request) => request.method === "PATCH")).toHaveLength(0);
  });
});
