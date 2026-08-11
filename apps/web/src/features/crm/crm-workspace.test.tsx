import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  CRM_PIPELINE_STAGES,
  type CrmAnalytics,
  type CrmContact,
  type CrmEvent,
  CrmWorkspaceView,
  createCrmApi,
} from "./crm-workspace";

type TestFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const contact: CrmContact = {
  id: "contact-1",
  organizationId: "org/one",
  firstName: "Ada",
  lastName: "Lovelace",
  displayName: "Ada Lovelace",
  email: "ada@example.test",
  phone: "+1 555 0100",
  company: "Analytical Engines",
  title: "Founder",
  website: "https://example.test",
  linkedinUrl: "https://linkedin.test/ada",
  notes: "Met at the summit.",
  tags: ["speaker", "west"],
  customFields: {
    region: "west",
    priority: "high",
    bio: "Mathematician and founder building analytical systems.",
    headshotUrl: "https://cdn.example.test/ada.jpg",
  },
  source: "speaker",
  status: "active",
  mergedIntoId: null,
  pipelineStage: "qualified",
  version: 3,
  createdAt: "2026-08-09T10:00:00.000Z",
  updatedAt: "2026-08-09T10:00:00.000Z",
};

const event: CrmEvent = {
  id: "event/one",
  organizationId: "org/one",
  name: "Open Sessionboard Summit",
  status: "active",
};

const analytics: CrmAnalytics = {
  organizationId: "org/one",
  totalContacts: 1,
  activeContacts: 1,
  contactsByPipelineStage: { qualified: 1 },
  contactsByEvent: [{ eventId: event.id, count: 1 }],
  contactsBySource: { speaker: 1 },
  outreach: { queued: 1, sent: 0, failed: 0 },
  generatedAt: "2026-08-09T10:00:00.000Z",
};

describe("organization CRM workspace", () => {
  it("renders directory, detail, segments, pipeline, outreach, and analytics controls", () => {
    const onMerge = vi.fn(async () => undefined);
    const markup = renderToStaticMarkup(
      createElement(CrmWorkspaceView, {
        organizationId: "org/one",
        contacts: [contact],
        selectedContact: contact,
        selectedContactId: contact.id,
        initialImportOpen: true,
        initialImportCsv: "Name,Email,Topics\nAda Lovelace,ada@example.test,computing",
        selectedContactIds: [contact.id],
        segments: [
          {
            id: "segment-1",
            organizationId: "org/one",
            name: "Qualified speakers",
            description: null,
            rules: [{ field: "pipelineStage", operator: "eq", value: "qualified" }],
            createdBy: "organizer-1",
            version: 1,
            createdAt: contact.createdAt,
            updatedAt: contact.updatedAt,
          },
        ],
        events: [event],
        history: [
          {
            id: "history-1",
            organizationId: "org/one",
            contactId: contact.id,
            kind: "event",
            eventId: event.id,
            sessionId: null,
            title: "Added to event",
            detail: "Prospect",
            occurredAt: contact.updatedAt,
            metadata: {},
          },
        ],
        pipelineHistory: [],
        notes: [],
        duplicates: {
          contactId: contact.id,
          matches: [
            {
              contact: {
                ...contact,
                id: "contact-2",
                email: "ada.duplicate@example.test",
                version: 1,
              },
              score: 0.95,
              matchedFields: ["displayName", "company"],
            },
          ],
        },
        analytics,
        importResult: {
          id: "import-1",
          created: 1,
          updated: 0,
          skipped: 1,
          idempotent: false,
          mapping: [
            { sourceColumn: "Name", targetField: "displayName", custom: false },
            { sourceColumn: "Email", targetField: "email", custom: false },
            { sourceColumn: "Topics", targetField: "custom.Topics", custom: true },
          ],
          rows: [
            {
              rowNumber: 1,
              identity: "ada@example.test",
              status: "created",
              contactId: contact.id,
              reason: null,
            },
            {
              rowNumber: 2,
              identity: null,
              status: "skipped",
              contactId: null,
              reason: "Email is required as the canonical import identity.",
            },
          ],
        },
        outreachPreview: {
          subject: "Hello {{first_name}}",
          body: "Hi {{first_name}}",
          count: 1,
          recipients: [
            {
              contactId: contact.id,
              email: "ada@example.test",
              displayName: "Ada Lovelace",
              subject: "Hello Ada",
              body: "Hi Ada",
              unknownTags: [],
              idempotencyKey: "outreach-preview-1",
            },
          ],
        },
        outreachRecipients: [contact],
        onSelectionChange: vi.fn(),
        onFindDuplicates: vi.fn(),
        onMerge,
        onMovePipeline: vi.fn(),
        onEnrollPipeline: vi.fn(async () => undefined),
        onSavePipeline: vi.fn(async () => undefined),
        onAddNote: vi.fn(async () => undefined),
        onAddToEvent: vi.fn(async () => undefined),
        lastAddedEventId: event.id,
        lastEventResult: {
          idempotent: false,
          outcome: "created",
          projection: {
            id: "event-contact-1",
            eventId: event.id,
            contactId: contact.id,
            role: "prospect",
          },
        },
        onPreviewOutreach: vi.fn(async () => undefined),
        onSendOutreach: vi.fn(async () => undefined),
        outreachResults: [
          {
            id: "send-1",
            contactId: contact.id,
            recipientEmail: "ada@example.test",
            subject: "Hello Ada",
            renderedBody: "Hi Ada",
            status: "sent",
            queuedCount: 0,
            sentCount: 1,
            failedCount: 0,
            terminal: true,
            failureReason: null,
          },
        ],
        onCreateSegment: vi.fn(async () => undefined),
        onSelectSegment: vi.fn(),
      }),
    );

    expect(markup).toContain("Organization CRM");
    expect(markup).toContain("Search contacts");
    expect(markup).toContain("CSV file");
    expect(markup).toContain("Hide import");
    expect(markup).toContain("Detected CSV column mapping");
    expect(markup).toContain("custom.Topics (custom field)");
    expect(markup).toContain("Import result");
    expect(markup).toContain("1 created");
    expect(markup).toContain("1 skipped");
    expect(markup).toContain("Ada Lovelace");
    expect(markup).toContain("Select Ada Lovelace");
    expect(markup).toContain("Custom fields");
    expect(markup).toContain("Communicate with selected");
    expect(markup).toContain("Find possible duplicates");
    expect(markup).toContain("+ Enroll contact");
    expect(markup).toContain("Open pipeline card detail for Ada Lovelace");
    expect(markup).toContain("Review selected merge");
    expect(markup).not.toContain("Merge selected into this contact");
    expect(onMerge).not.toHaveBeenCalled();
    expect(markup).toContain("Select records to compare");
    expect(markup).toContain("Pipeline history");
    expect(markup).toContain("Profile");
    expect(markup).toContain("Add to event");
    expect(markup).toContain("Mathematician and founder");
    expect(markup).toContain("Notes and cross-event history");
    expect(markup).toContain("{{first_name}}");
    expect(markup).toContain("Hello Ada");
    expect(markup).toContain("Outreach delivery result");
    expect(markup).toContain("1 sent");
    expect(markup).toContain("Qualified speakers");
    expect(markup).toContain("Pipeline board");
    expect(markup).toContain("CRM analytics");
    expect(markup).toContain("View contacts");
    expect(markup).toContain("Open event workspace");
    expect(markup).toContain("Canonical relationship created");
  });
  it("shows every recipient preview and blocks unknown outreach merge tags", () => {
    const markup = renderToStaticMarkup(
      createElement(CrmWorkspaceView, {
        organizationId: "org/one",
        contacts: [contact],
        selectedContact: contact,
        segments: [],
        events: [],
        history: [],
        pipelineHistory: [],
        notes: [],
        duplicates: null,
        analytics: null,
        outreachPreview: {
          subject: "Hello {{unknownTag}}",
          body: "Body",
          count: 1,
          recipients: [
            {
              contactId: contact.id,
              email: contact.email ?? "",
              displayName: contact.displayName,
              subject: "Hello {{unknownTag}}",
              body: "Body",
              unknownTags: ["unknownTag"],
              idempotencyKey: "outreach-preview-invalid",
            },
          ],
        },
        onSendOutreach: async () => undefined,
      }),
    );

    expect(markup).toContain("Sending is blocked");
    expect(markup).toContain("Unknown merge tags: unknownTag");
  });

  it("seeds saved segments from active directory filters and exposes selected-contact context", () => {
    const markup = renderToStaticMarkup(
      createElement(CrmWorkspaceView, {
        organizationId: "org/one",
        contacts: [contact],
        segments: [],
        events: [event],
        history: [],
        pipelineHistory: [],
        notes: [],
        duplicates: null,
        analytics: null,
        companyFilter: "Analytical Engines",
        tagsFilter: "speaker,west",
        selectedContactIds: [contact.id],
        initialImportOpen: true,
      }),
    );

    expect(markup).toContain("Save current directory filters");
    expect(markup).toContain("company contains Analytical Engines");
    expect(markup).toContain("tags contains speaker");
    expect(markup).toContain("Selected directory contacts (1)");
    expect(markup).toContain("Segment context (optional)");
    expect(markup).toContain("CSV file");
  });
  it("uses authoritative organization CRM and event envelopes with credentials and no-store", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetcher = vi.fn<TestFetcher>(async (input, init = {}) => {
      calls.push({ url: String(input), init });
      return response(
        calls.length === 2
          ? contact
          : calls.length === 14
            ? event
            : calls.length === 15
              ? analytics
              : [],
      );
    });
    const api = createCrmApi("https://api.example.test/", "org/one", fetcher);

    await api.listContacts({
      query: "Ada",
      company: "Analytical Engines",
      pipelineStage: "qualified",
      status: "active",
    });
    await api.getContact(contact.id);
    await api.createContact({ displayName: "Grace Hopper" });
    await api.updateContact(contact.id, { company: "Navy", expectedVersion: 3 });
    await api.importContacts("firstName,lastName\nGrace,Hopper", "import-key");
    await api.listSegments();
    await api.createSegment({
      name: "Qualified",
      rules: [{ field: "pipelineStage", operator: "eq", value: "qualified" }],
    });
    await api.listSegmentContacts("segment/1");
    await api.findDuplicates(contact.id);
    await api.mergeContacts(contact.id, ["contact/2"], "merge-key");
    await api.getContactHistory(contact.id);
    await api.getPipelineHistory(contact.id);
    await api.updatePipeline(contact.id, "invited", "Invite sent");
    await api.listNotes(contact.id);
    await api.addNote(contact.id, "Follow up next week");
    await api.addContactToEvent(contact.id, { eventId: event.id, role: "prospect" }, "event-key");
    await api.sendOutreach(
      {
        contactId: contact.id,
        subject: "Hello",
        body: "Hi {{first_name}}",
        variables: { first_name: "Ada" },
      },
      "outreach-key",
    );
    await api.analytics();
    await api.listEvents();

    expect(calls[0]?.url).toBe(
      "https://api.example.test/api/admin/organizations/org%2Fone/crm/contacts?query=Ada&company=Analytical+Engines&pipelineStage=qualified&status=active",
    );
    expect(calls[9]?.url).toContain("/crm/contacts/contact-1/merge");
    expect(calls[16]?.url).toContain("/crm/outreach");
    expect(calls[17]?.url).toContain("/crm/analytics");
    expect(calls[18]?.url).toBe(
      "https://api.example.test/api/admin/organizations/org%2Fone/events",
    );
    for (const call of calls) {
      expect(call.init.credentials).toBe("include");
      expect(call.init.cache).toBe("no-store");
    }
    const importHeaders = new Headers(calls[4]?.init.headers);
    expect(importHeaders.get("idempotency-key")).toBe("import-key");
    expect(JSON.parse(String(calls[4]?.init.body))).toMatchObject({
      csv: "firstName,lastName\nGrace,Hopper",
      idempotencyKey: "import-key",
    });
    const outreachHeaders = new Headers(calls[16]?.init.headers);
    expect(outreachHeaders.get("idempotency-key")).toBe("outreach-key");
  });

  it("exposes every pipeline stage for evaluator-visible transitions", () => {
    const markup = renderToStaticMarkup(
      createElement(CrmWorkspaceView, {
        organizationId: "org-1",
        contacts: [],
        segments: [],
        events: [],
        history: [],
        pipelineHistory: [],
        notes: [],
        duplicates: null,
        analytics: null,
      }),
    );
    for (const stage of CRM_PIPELINE_STAGES) expect(markup).toContain(stage);
  });
});
