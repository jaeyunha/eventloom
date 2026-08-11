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
  it("parallelizes scoped reads, batches form enrichment, and stays under the warm budget", async () => {
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
    const readDelayMs = 350;
    const delayed = new DelayedTransport(fake, readDelayMs);
    const repository = new AirtableCfpRepository({ baseId, transport: delayed });
    const service = new CfpService({
      repository,
      idempotency: {} as never,
      effects: {} as never,
    });

    const startedAt = performance.now();
    const records = await service.listOrganizerSubmissions({ tenantId, eventId });
    const elapsedMs = performance.now() - startedAt;

    expect(6 * readDelayMs).toBeGreaterThan(1_000);
    expect(elapsedMs).toBeLessThan(1_000);
    expect(delayed.maxConcurrentReads).toBe(2);
    expect(records).toHaveLength(7);
    expect(Object.keys(records[0] ?? {}).sort()).toEqual([
      "participantFields",
      "submission",
      "submissionFields",
    ]);
    expect(records[0]?.submission).toEqual(submission(1));
    expect(records[0]?.submission.participants).toEqual(submission(1).participants);
    expect(records.map(({ submission: record }) => record.id)).toEqual([
      "submission-1",
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

    const reads = fake.requests.filter((request) => request.method === "GET");
    expect(reads).toHaveLength(3);
    expect(reads.filter((request) => request.table === "CFP Forms")).toHaveLength(1);
    expect(
      reads.find((request) => request.table === "Submissions")?.query?.filterByFormula,
    ).toBeUndefined();
  });

  it("parallelizes multiple Airtable form-ID batches", async () => {
    const fake = new FakeAirtableTransport();
    const formIds = [formId, ...Array.from({ length: 50 }, (_, index) => `form-${index + 1}`)];
    seed(fake, formIds.length, formIds);
    const delayed = new DelayedTransport(fake, 5);
    const repository = new AirtableCfpRepository({ baseId, transport: delayed });
    const service = new CfpService({
      repository,
      idempotency: {} as never,
      effects: {} as never,
    });

    const records = await service.listOrganizerSubmissions({ tenantId, eventId });

    expect(records).toHaveLength(formIds.length);
    const reads = fake.requests.filter((request) => request.method === "GET");
    expect(reads).toHaveLength(4);
    expect(reads.filter((request) => request.table === "CFP Forms")).toHaveLength(2);
    expect(delayed.maxConcurrentFormReads).toBe(2);
  });
});
