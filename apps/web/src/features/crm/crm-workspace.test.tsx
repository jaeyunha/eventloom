import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  CRM_PIPELINE_STAGES,
  type CrmAnalytics,
  type CrmApi,
  type CrmContact,
  type CrmEvent,
  type CrmSegment,
  CrmWorkspaceView,
  createCrmApi,
  createCrmWorkspaceReadCoordinator,
  refreshCrmAnalyticsAfterContactSave,
} from "./crm-workspace";

type TestFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
type Deferred<T> = {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
  readonly reject: (reason?: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>["resolve"];
  let reject!: Deferred<T>["reject"];
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function readHandlers() {
  return {
    setContacts: vi.fn(),
    setSegments: vi.fn(),
    setEvents: vi.fn(),
    setAnalytics: vi.fn(),
    setContactsLoading: vi.fn(),
    setSegmentsLoading: vi.fn(),
    setEventsLoading: vi.fn(),
    setAnalyticsLoading: vi.fn(),
    setError: vi.fn(),
  };
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
  it("replaces stale directory controls with an accessible loading state", () => {
    const markup = renderToStaticMarkup(
      createElement(CrmWorkspaceView, {
        organizationId: "org/one",
        contacts: [contact],
        segments: [],
        events: [],
        history: [],
        pipelineHistory: [],
        notes: [],
        duplicates: null,
        analytics: null,
        loading: true,
      }),
    );

    expect(markup).toContain("Updating the contact directory for the current filters…");
    expect(markup).toContain('aria-label="Loading contact directory"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-label="Loading organization CRM data"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).not.toContain('aria-label="Select Ada Lovelace"');
    expect(markup).not.toContain("Organization CRM contact directory");
    expect(markup).not.toContain("1 contact shown");
  });

  it("exposes direct outreach, duplicate review, and analytics drill-down targets", () => {
    const markup = renderToStaticMarkup(
      createElement(CrmWorkspaceView, {
        organizationId: "org/one",
        contacts: [contact],
        selectedContact: contact,
        selectedContactId: contact.id,
        segments: [],
        events: [event],
        history: [],
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
      }),
    );

    expect(markup).toContain("Open outreach composer");
    expect(markup).toContain('aria-controls="crm-outreach-composer"');
    expect(markup).toMatch(/<section id="crm-outreach-composer"/u);
    expect(markup).toContain("Review possible duplicates");
    expect(markup).toContain('aria-controls="crm-duplicate-review"');
    expect(markup).toContain('id="crm-duplicate-review"');
    expect(markup).toContain('aria-labelledby="crm-duplicate-review-title"');
    expect(markup).toMatch(/<section id="crm-duplicate-review"/u);
    expect(markup).toContain("Contact snapshot");
    expect(markup).toContain('href="#crm-analytics"');
    expect(markup).toContain('id="crm-analytics"');
    expect(markup).toMatch(/<section id="crm-analytics"/u);
    expect(markup.indexOf("Contact snapshot")).toBeLessThan(markup.indexOf("Contact directory"));
    expect(markup).toContain("View contacts");
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
describe("CRM workspace read coordination", () => {
  it("starts all independent initial reads before any deferred response settles", async () => {
    const starts: string[] = [];
    const contactsRead = deferred<readonly CrmContact[]>();
    const segmentsRead = deferred<readonly CrmSegment[]>();
    const eventsRead = deferred<readonly CrmEvent[]>();
    const analyticsRead = deferred<CrmAnalytics>();
    const api = {
      listContacts: vi.fn(() => {
        starts.push("contacts");
        return contactsRead.promise;
      }),
      listSegments: vi.fn(() => {
        starts.push("segments");
        return segmentsRead.promise;
      }),
      listEvents: vi.fn(() => {
        starts.push("events");
        return eventsRead.promise;
      }),
      analytics: vi.fn(() => {
        starts.push("analytics");
        return analyticsRead.promise;
      }),
    } as unknown as CrmApi;
    const handlers = readHandlers();
    const coordinator = createCrmWorkspaceReadCoordinator(api, handlers);

    const refresh = coordinator.refresh({ query: "Ada", status: "active" });

    expect(starts).toEqual(["contacts", "segments", "events", "analytics"]);
    expect(api.listContacts).toHaveBeenCalledTimes(1);
    expect(api.listSegments).toHaveBeenCalledTimes(1);
    expect(api.listEvents).toHaveBeenCalledTimes(1);
    expect(api.analytics).toHaveBeenCalledTimes(1);

    contactsRead.resolve([contact]);
    segmentsRead.resolve([]);
    eventsRead.resolve([event]);
    analyticsRead.resolve(analytics);
    await refresh;
    coordinator.dispose();
  });
  it("reactivates after an effect cleanup replay", async () => {
    const api = {
      listSegments: vi.fn(async () => []),
    } as unknown as CrmApi;
    const handlers = readHandlers();
    const coordinator = createCrmWorkspaceReadCoordinator(api, handlers);

    coordinator.dispose();
    coordinator.activate();
    await coordinator.loadSegments();

    expect(api.listSegments).toHaveBeenCalledTimes(1);
    expect(handlers.setSegments).toHaveBeenCalledWith([]);
    expect(handlers.setSegmentsLoading).toHaveBeenLastCalledWith(false);
    coordinator.dispose();
  });

  it("reloads only contacts for a filter change and ignores stale contact responses", async () => {
    const firstContactsRead = deferred<readonly CrmContact[]>();
    const secondContactsRead = deferred<readonly CrmContact[]>();
    const newerContact = { ...contact, id: "contact-2", email: "newer@example.test" };
    const api = {
      listContacts: vi
        .fn()
        .mockImplementationOnce(() => firstContactsRead.promise)
        .mockImplementationOnce(() => secondContactsRead.promise),
      listSegments: vi.fn(async () => []),
      listEvents: vi.fn(async () => []),
      analytics: vi.fn(async () => analytics),
    } as unknown as CrmApi;
    const handlers = readHandlers();
    const coordinator = createCrmWorkspaceReadCoordinator(api, handlers);

    const firstLoad = coordinator.loadContacts({ query: "Ada", status: "active" });
    const secondLoad = coordinator.loadContacts({ query: "Grace", status: "active" });

    expect(api.listContacts).toHaveBeenCalledTimes(2);
    expect(api.listSegments).not.toHaveBeenCalled();
    expect(api.listEvents).not.toHaveBeenCalled();
    expect(api.analytics).not.toHaveBeenCalled();

    secondContactsRead.resolve([newerContact]);
    await secondLoad;
    firstContactsRead.resolve([contact]);
    await firstLoad;

    expect(handlers.setContacts).toHaveBeenLastCalledWith([newerContact]);
    coordinator.dispose();
  });

  it("refreshes each intended resource exactly once", async () => {
    const api = {
      listContacts: vi.fn(async () => [contact]),
      listSegments: vi.fn(async () => []),
      listEvents: vi.fn(async () => [event]),
      analytics: vi.fn(async () => analytics),
    } as unknown as CrmApi;
    const handlers = readHandlers();
    const coordinator = createCrmWorkspaceReadCoordinator(api, handlers);

    await coordinator.refresh({ status: "active" });

    expect(api.listContacts).toHaveBeenCalledTimes(1);
    expect(api.listSegments).toHaveBeenCalledTimes(1);
    expect(api.listEvents).toHaveBeenCalledTimes(1);
    expect(api.analytics).toHaveBeenCalledTimes(1);
    coordinator.dispose();
  });
  it("keeps resource failures visible until that same resource succeeds", async () => {
    const contactsRead = deferred<readonly CrmContact[]>();
    const api = {
      listContacts: vi
        .fn()
        .mockImplementationOnce(() => contactsRead.promise)
        .mockResolvedValue([contact]),
      listSegments: vi.fn(async () => []),
      listEvents: vi.fn(async () => []),
      analytics: vi.fn(async () => analytics),
    } as unknown as CrmApi;
    const handlers = readHandlers();
    const coordinator = createCrmWorkspaceReadCoordinator(api, handlers);

    const contactsLoad = coordinator.loadContacts({ status: "active" });
    contactsRead.reject(new Error("Contacts unavailable"));
    await contactsLoad;

    expect(handlers.setError).toHaveBeenLastCalledWith("Contacts unavailable");

    await coordinator.loadSegments();
    expect(handlers.setError).toHaveBeenLastCalledWith("Contacts unavailable");

    await coordinator.loadContacts({ status: "active" });
    expect(handlers.setError).toHaveBeenLastCalledWith(null);
    coordinator.dispose();
  });

  it("aggregates concurrent resource failures in stable read-kind order", async () => {
    const api = {
      listContacts: vi.fn(async () => {
        throw new Error("Contacts unavailable");
      }),
      listSegments: vi.fn(async () => {
        throw new Error("Segments unavailable");
      }),
      listEvents: vi.fn(async () => []),
      analytics: vi.fn(async () => analytics),
    } as unknown as CrmApi;
    const handlers = readHandlers();
    const coordinator = createCrmWorkspaceReadCoordinator(api, handlers);

    await Promise.all([coordinator.loadSegments(), coordinator.loadContacts({ status: "active" })]);

    expect(handlers.setError).toHaveBeenLastCalledWith(
      "Contacts unavailable\nSegments unavailable",
    );
    coordinator.dispose();
  });
});

describe("CRM contact analytics refresh", () => {
  it("skips analytics for profile-only edits and refreshes after creates", async () => {
    const loadAnalytics = vi.fn(async () => undefined);

    await refreshCrmAnalyticsAfterContactSave(contact, loadAnalytics);
    expect(loadAnalytics).not.toHaveBeenCalled();

    await refreshCrmAnalyticsAfterContactSave(undefined, loadAnalytics);
    expect(loadAnalytics).toHaveBeenCalledTimes(1);
  });
});
