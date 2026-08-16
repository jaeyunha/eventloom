import { describe, expect, it } from "vitest";
import type { CommunicationTemplate } from "../features/communications/types";
import {
  AirtableRepositoryError,
  type AirtableRequest,
  type AirtableTransport,
  FakeAirtableTransport,
} from "../infrastructure/airtable";
import { AirtableCommunicationRepository } from "./airtable";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

class DelayedCountingTransport implements AirtableTransport {
  readonly fake = new FakeAirtableTransport();
  readonly requests: AirtableRequest[] = [];
  templateListReads = 0;
  #nextTemplateListDelay: ReturnType<typeof deferred> | null = null;

  seed(record: Parameters<FakeAirtableTransport["seed"]>[0]): void {
    this.fake.seed(record);
  }

  delayNextTemplateList(): () => void {
    const gate = deferred();
    this.#nextTemplateListDelay = gate;
    return gate.resolve;
  }

  async request<TBody = unknown>(request: AirtableRequest) {
    this.requests.push({
      ...request,
      ...(request.query === undefined ? {} : { query: { ...request.query } }),
    });
    if (
      request.method === "GET" &&
      request.table === "Email Templates" &&
      request.recordId === undefined
    ) {
      this.templateListReads += 1;
      const gate = this.#nextTemplateListDelay;
      this.#nextTemplateListDelay = null;
      if (gate !== null) await gate.promise;
    }
    const formula = request.query?.filterByFormula;
    const delegatedFormula =
      typeof formula === "string" && formula.startsWith("AND(")
        ? formula.slice(4, -1).split(",")[0]
        : formula;
    return this.fake.request<TBody>({
      ...request,
      ...(request.query === undefined
        ? {}
        : { query: { ...request.query, filterByFormula: delegatedFormula } }),
    });
  }
}

function template(overrides: Partial<CommunicationTemplate> = {}): CommunicationTemplate {
  return {
    id: "group-template",
    tenantId: "org-1",
    eventId: "event-1",
    name: "Event update",
    purpose: "organizer_group_email",
    version: 1,
    status: "approved",
    sender: "program@conference.example",
    subject: "Hello",
    html: "<p>Hello</p>",
    text: "Hello",
    variables: [],
    createdBy: "organizer-1",
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
    approvedBy: "organizer-1",
    approvedAt: "2026-08-11T00:00:00.000Z",
    ...overrides,
  };
}

function seedTemplate(transport: DelayedCountingTransport, value: CommunicationTemplate): void {
  transport.seed({
    baseId: "base-test",
    table: "Email Templates",
    fields: {
      "Application ID": `template:${value.id}:v${value.version}`,
      "Organization ID": value.tenantId,
      "Event ID": value.eventId,
      Purpose: value.purpose,
      Status: value.status,
      Sender: value.sender,
      "Settings JSON": JSON.stringify({ ...value, entityType: "communication_template" }),
    },
  });
}

describe("Airtable communication template reads", () => {
  it("crosses one delayed Airtable boundary with an indexed scope formula", async () => {
    const transport = new DelayedCountingTransport();
    seedTemplate(transport, template());
    const receipt = template({ id: "receipt-template", purpose: "receipt" });
    seedTemplate(transport, receipt);
    seedTemplate(
      transport,
      template({ id: "other-template", tenantId: "org-2", eventId: "event-2" }),
    );
    const repository = new AirtableCommunicationRepository({
      baseId: "base-test",
      transport,
    });
    const release = transport.delayNextTemplateList();
    let settled = false;

    const read = repository.listTemplates("org-1", "event-1").finally(() => {
      settled = true;
    });

    expect(transport.templateListReads).toBe(1);
    expect(settled).toBe(false);
    expect(transport.requests[0]?.query?.filterByFormula).toBe(
      "AND({Organization ID}='org-1',{Event ID}='event-1')",
    );

    release();
    await expect(read).resolves.toEqual([template(), receipt]);
    expect(transport.templateListReads).toBe(1);
  });

  it("accepts any normalized valid sender identity from persisted templates", async () => {
    const transport = new DelayedCountingTransport();
    seedTemplate(transport, template({ sender: "Program@Conference.Example" }));
    const repository = new AirtableCommunicationRepository({
      baseId: "base-test",
      transport,
    });

    await expect(repository.listTemplates("org-1", "event-1")).resolves.toMatchObject([
      { sender: "program@conference.example" },
    ]);
  });

  it("makes template creates and updates immediately visible through indexed reads", async () => {
    const transport = new DelayedCountingTransport();
    const repository = new AirtableCommunicationRepository({
      baseId: "base-test",
      transport,
    });
    const saved = template();

    await expect(repository.saveTemplate(saved)).resolves.toEqual(saved);
    const create = transport.requests.find((request) => request.method === "POST");
    expect(create?.body).toMatchObject({
      fields: {
        "Application ID": "template:group-template:v1",
        "Organization ID": "org-1",
        "Event ID": "event-1",
        Purpose: "organizer_group_email",
        Status: "approved",
        Sender: "program@conference.example",
        "Settings JSON": expect.any(String),
      },
    });
    const updated = template({
      subject: "Updated subject",
      updatedAt: "2026-08-11T00:01:00.000Z",
    });
    await expect(repository.saveTemplate(updated)).resolves.toEqual(updated);
    const update = transport.requests.find((request) => request.method === "PATCH");
    expect(update?.body).toMatchObject({
      fields: {
        "Application ID": "template:group-template:v1",
        "Organization ID": "org-1",
        "Event ID": "event-1",
        Purpose: "organizer_group_email",
        Status: "approved",
        Sender: "program@conference.example",
        "Settings JSON": expect.any(String),
      },
    });

    transport.requests.length = 0;
    transport.templateListReads = 0;
    await expect(
      repository.listTemplates("org-1", "event-1", "organizer_group_email"),
    ).resolves.toEqual([updated]);
    expect(transport.templateListReads).toBe(1);
  });
  it("rejects incomplete communication template JSON instead of returning a partial DTO", async () => {
    const transport = new DelayedCountingTransport();
    transport.seed({
      baseId: "base-test",
      table: "Email Templates",
      fields: {
        "Application ID": "template:malformed:v1",
        "Organization ID": "org-1",
        "Event ID": "event-1",
        Purpose: "organizer_group_email",
        Status: "approved",
        Sender: "speakers@sessionboard.namuh.co",
        "Settings JSON": JSON.stringify({ sentAt: null }),
      },
    });
    const repository = new AirtableCommunicationRepository({
      baseId: "base-test",
      transport,
    });

    const read = repository.listTemplates("org-1", "event-1");
    await expect(read).rejects.toBeInstanceOf(AirtableRepositoryError);
    await expect(read).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      message: expect.stringContaining("Invalid communication template record"),
    });
  });
});
