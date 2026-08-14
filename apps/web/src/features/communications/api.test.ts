import { describe, expect, it, vi } from "vitest";
import {
  CommunicationApiError,
  type CommunicationTemplate,
  createCommunicationApi,
  formatCommunicationAudience,
  formatCommunicationPurpose,
  type ReminderDispatch,
  type ReminderFacts,
  type ReminderRun,
} from "./api";

type TestFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function template(id: string, purpose: CommunicationTemplate["purpose"]): CommunicationTemplate {
  return {
    id,
    tenantId: "org-1",
    eventId: "event-1",
    name: `${purpose} template`,
    purpose,
    version: 1,
    status: "approved",
    sender: "program@self-hosted.example",
    subject: "Subject",
    html: "<p>Body</p>",
    text: "Body",
    variables: [],
    createdBy: "organizer-1",
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
    approvedBy: "organizer-1",
    approvedAt: "2026-08-11T00:00:00.000Z",
  };
}
function reminderRun(triggerType: ReminderRun["triggerType"] = "automatic"): ReminderRun {
  return {
    id: `${triggerType}-run-1`,
    organizationId: "org-1",
    eventId: "event-1",
    triggerType,
    audienceType: "combined",
    audienceRevision: "audience-revision-1",
    candidateCount: 2,
    eligibleCount: 1,
    queuedCount: 1,
    skippedCount: 1,
    failedCount: 0,
    state: "completed",
    configurationFailure: null,
    actorId: "organizer-1",
    startedAt: "2026-08-11T00:00:00.000Z",
    completedAt: "2026-08-11T00:01:00.000Z",
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:01:00.000Z",
  };
}

function reminderDispatch(
  status: ReminderDispatch["status"] = "provider_accepted",
): ReminderDispatch {
  return {
    id: `${status}-dispatch-1`,
    runId: "automatic-run-1",
    organizationId: "org-1",
    eventId: "event-1",
    recipient: "application-1",
    subject: { type: "task", taskId: "task-1" },
    eligibilityReason: "due",
    cadenceWindow: "2026-08-11T00:00:00.000Z",
    idempotencyKey: "reminder-key-1",
    providerMessageId: status === "candidate" || status === "eligible" ? null : "provider-1",
    status,
    skipMetadata: null,
    failureMetadata: null,
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:01:00.000Z",
    eligibleAt: "2026-08-11T00:00:10.000Z",
    skippedAt: null,
    queuedAt: "2026-08-11T00:00:20.000Z",
    providerAcceptedAt: "2026-08-11T00:00:30.000Z",
    deliveredAt: status === "delivered" ? "2026-08-11T00:01:00.000Z" : null,
    failedAt: status === "failed" ? "2026-08-11T00:01:00.000Z" : null,
    bouncedAt: status === "bounced" ? "2026-08-11T00:01:00.000Z" : null,
    completedAt:
      status === "candidate" || status === "eligible" || status === "queued"
        ? null
        : "2026-08-11T00:01:00.000Z",
    outboxJobId: "outbox-1",
  };
}

function reminderFacts(): ReminderFacts {
  return {
    lastAutomatic: reminderRun("automatic"),
    lastManual: reminderRun("manual"),
    nextEligibleAt: "2026-08-12T00:00:00.000Z",
    lastOutcome: reminderDispatch("delivered"),
  };
}

describe("communications API", () => {
  it("accepts generic server-returned sender emails and rejects malformed sender DTOs", async () => {
    const valid = template("template-1", "receipt");
    const fetcher = vi
      .fn<TestFetcher>()
      .mockResolvedValueOnce(jsonResponse({ templates: [valid] }))
      .mockResolvedValueOnce(jsonResponse({ templates: [{ ...valid, sender: "not-an-email" }] }));
    const api = createCommunicationApi("", "org-1", fetcher);

    await expect(api.listTemplates("event-1")).resolves.toEqual([valid]);
    await expect(api.listTemplates("event-1")).rejects.toMatchObject({
      code: "COMMUNICATION_INVALID_RESPONSE",
      status: 502,
    });
  });

  it("rejects malformed production template DTOs with a controlled validation error", async () => {
    const fetcher = vi.fn<TestFetcher>().mockResolvedValue(
      jsonResponse({
        templates: [
          {
            sentAt: null,
            id: "template-1",
            tenantId: "org-1",
            eventId: "event-1",
          },
        ],
      }),
    );
    const api = createCommunicationApi("", "org-1", fetcher);

    await expect(api.listTemplates("event-1")).rejects.toMatchObject({
      name: "CommunicationApiError",
      code: "COMMUNICATION_INVALID_RESPONSE",
      message: "The communication API returned an invalid response.",
      status: 502,
    });
  });

  it("formats nullish communication values without throwing", () => {
    expect(formatCommunicationPurpose(undefined)).toBe("Not specified");
    expect(formatCommunicationPurpose(null)).toBe("Not specified");
    expect(formatCommunicationAudience(undefined)).toBe("Not specified");
    expect(formatCommunicationAudience(null)).toBe("Not specified");
  });
  it("starts independent resource reads without waiting and keeps their failures separate", async () => {
    const receiptResponse = deferred<Response>();
    const reminderResponse = deferred<Response>();
    const starts: string[] = [];
    const fetcher = vi.fn<TestFetcher>((input) => {
      const url = String(input);
      starts.push(url);
      return url.endsWith("purpose=receipt") ? receiptResponse.promise : reminderResponse.promise;
    });
    const api = createCommunicationApi("", "org-1", fetcher);

    const receiptRead = api.listTemplates("event-1", "receipt");
    const reminderRead = api.listTemplates("event-1", "reminder");

    expect(starts).toEqual([
      "/api/admin/organizations/org-1/events/event-1/communications/templates?purpose=receipt",
      "/api/admin/organizations/org-1/events/event-1/communications/templates?purpose=reminder",
    ]);

    const reminder = template("reminder-1", "reminder");
    reminderResponse.resolve(jsonResponse({ templates: [reminder] }));
    await expect(reminderRead).resolves.toEqual([reminder]);

    receiptResponse.resolve(
      jsonResponse(
        { error: { code: "COMMUNICATION_UNAVAILABLE", message: "Receipt templates unavailable" } },
        503,
      ),
    );
    await expect(receiptRead).rejects.toMatchObject({
      code: "COMMUNICATION_UNAVAILABLE",
      message: "Receipt templates unavailable",
      status: 503,
    });
  });

  it("creates templates without reconstructing or submitting a sender identity", async () => {
    const created = template("template-created", "verification");
    const fetcher = vi
      .fn<TestFetcher>()
      .mockResolvedValueOnce(jsonResponse(created, 201))
      .mockResolvedValueOnce(jsonResponse({ ...created, sender: "not-an-email" }, 201));
    const api = createCommunicationApi("", "org-1", fetcher);

    await expect(
      api.createTemplate({
        eventId: "event-1",
        name: "Login link",
        purpose: "verification",
        subject: "Your login link",
        html: "<p>Open the link</p>",
        text: "Open the link",
      }),
    ).resolves.toEqual(created);

    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty("sender");

    await expect(
      api.createTemplate({
        eventId: "event-1",
        name: "Login link",
        purpose: "verification",
        subject: "Your login link",
        html: "<p>Open the link</p>",
        text: "Open the link",
      }),
    ).rejects.toMatchObject({ code: "COMMUNICATION_INVALID_RESPONSE", status: 502 });
  });

  it("sends previews with an idempotency key and preserves explicit API failures", async () => {
    const preview = { id: "preview-1", recipientCount: 1 };
    const send = { id: "send-1", previewId: preview.id };
    const fetcher = vi
      .fn<TestFetcher>()
      .mockResolvedValueOnce(jsonResponse({ templates: [] }))
      .mockResolvedValueOnce(jsonResponse(preview))
      .mockResolvedValueOnce(jsonResponse(send));
    const api = createCommunicationApi("https://api.example.test/", "org/one", fetcher);

    await expect(api.listTemplates("event/one")).resolves.toEqual([]);
    await expect(
      api.preview({
        eventId: "event/one",
        purpose: "organizer_group_email",
        templateId: "group-1",
        audience: "all_participants",
      }),
    ).resolves.toEqual(preview);
    await expect(
      api.sendGroup({
        eventId: "event/one",
        previewId: preview.id,
        idempotencyKey: "web-key-1",
      }),
    ).resolves.toEqual(send);

    const sendCall = fetcher.mock.calls[2];
    const sendInit = sendCall?.[1];
    expect(String(sendCall?.[0])).toContain(
      "/api/admin/organizations/org%2Fone/events/event%2Fone/communications/sends",
    );
    expect(new Headers(sendInit?.headers).get("idempotency-key")).toBe("web-key-1");
    expect(JSON.parse(String(sendInit?.body))).toMatchObject({
      previewId: preview.id,
      idempotencyKey: "web-key-1",
    });

    const deniedFetcher = vi
      .fn<TestFetcher>()
      .mockResolvedValue(
        jsonResponse(
          { error: { code: "COMMUNICATION_FORBIDDEN", message: "Not authorized" } },
          403,
        ),
      );
    await expect(
      createCommunicationApi("https://api.example.test", "org-1", deniedFetcher).listTemplates(
        "event-1",
      ),
    ).rejects.toMatchObject({ code: "COMMUNICATION_FORBIDDEN", status: 403 });

    const providerFetcher = vi.fn<TestFetcher>().mockResolvedValue(
      jsonResponse(
        {
          error: { code: "COMMUNICATION_UNAVAILABLE", message: "Sender domain is not verified" },
        },
        503,
      ),
    );
    await expect(
      createCommunicationApi("https://api.example.test", "org-1", providerFetcher).sendGroup({
        eventId: "event-1",
        previewId: "preview-1",
        idempotencyKey: "web-key-2",
      }),
    ).rejects.toBeInstanceOf(CommunicationApiError);
  });

  it("keeps list reads same-origin, credentialed, uncached, and abortable", async () => {
    const fetcher = vi.fn<TestFetcher>().mockResolvedValue(jsonResponse({ templates: [] }));
    const api = createCommunicationApi("", "org-1", fetcher);
    const controller = new AbortController();

    await expect(api.listTemplates("event-1", undefined, controller.signal)).resolves.toEqual([]);

    const [input, init] = fetcher.mock.calls[0] ?? [];
    const requestedUrl = String(input);
    expect(requestedUrl).toBe(
      "/api/admin/organizations/org-1/events/event-1/communications/templates",
    );
    expect(requestedUrl.startsWith("/api/")).toBe(true);
    expect(requestedUrl).not.toMatch(/^\/\//);
    expect(requestedUrl).not.toMatch(/^https?:\/\//);
    expect(init?.credentials).toBe("include");
    expect(init?.cache).toBe("no-store");
    expect(init?.signal).toBe(controller.signal);
  });
  it("lists reminder runs and dispatches, fetches facts, and refreshes event-scoped delivery truth", async () => {
    const run = reminderRun();
    const dispatch = reminderDispatch("provider_accepted");
    const facts = reminderFacts();
    const fetcher = vi.fn<TestFetcher>((input) => {
      const url = String(input);
      if (url.endsWith("/reminders/runs")) return Promise.resolve(jsonResponse({ runs: [run] }));
      if (url.includes("/reminders/facts?")) return Promise.resolve(jsonResponse({ facts }));
      if (url.endsWith(`/reminders/dispatches/${dispatch.id}`)) {
        return Promise.resolve(jsonResponse({ dispatch }));
      }
      if (url.includes("/reminders/dispatches?")) {
        return Promise.resolve(jsonResponse({ dispatches: [dispatch] }));
      }
      return Promise.resolve(jsonResponse({ run }));
    });
    const api = createCommunicationApi("", "org-1", fetcher);
    const controller = new AbortController();

    await expect(api.listReminderRuns("event-1", controller.signal)).resolves.toEqual([run]);
    await expect(api.listReminderDispatches("event-1", run.id, controller.signal)).resolves.toEqual(
      [dispatch],
    );
    await expect(
      api.getReminderFacts("event-1", "application-1", { type: "task", taskId: "task-1" }),
    ).resolves.toEqual(facts);
    await expect(
      api.refreshReminderDelivery("event-1", dispatch.id, controller.signal),
    ).resolves.toEqual(dispatch);

    const listCall = fetcher.mock.calls[0];
    expect(String(listCall?.[0])).toBe(
      "/api/admin/organizations/org-1/events/event-1/communications/reminders/runs",
    );
    expect(listCall?.[1]?.credentials).toBe("include");
    expect(listCall?.[1]?.cache).toBe("no-store");
    expect(listCall?.[1]?.signal).toBe(controller.signal);

    const dispatchCall = fetcher.mock.calls[1];
    expect(String(dispatchCall?.[0])).toContain(
      "/communications/reminders/dispatches?runId=automatic-run-1",
    );
  });

  it("sends manual reminder runs with the expected audience revision and idempotency body", async () => {
    const run = reminderRun("manual");
    const fetcher = vi.fn<TestFetcher>().mockResolvedValue(jsonResponse({ run }));
    const api = createCommunicationApi("", "org-1", fetcher);

    await expect(
      api.runManualReminders({
        eventId: "event-1",
        idempotencyKey: "manual-key-1",
        expectedAudienceRevision: "revision-1",
        scheduledAt: "2026-08-11T00:00:00.000Z",
      }),
    ).resolves.toEqual(run);

    const [input, init] = fetcher.mock.calls[0] ?? [];
    expect(String(input)).toBe(
      "/api/admin/organizations/org-1/events/event-1/communications/reminders/runs/manual",
    );
    expect(new Headers(init?.headers).get("idempotency-key")).toBe("manual-key-1");
    expect(JSON.parse(String(init?.body))).toEqual({
      idempotencyKey: "manual-key-1",
      expectedAudienceRevision: "revision-1",
      scheduledAt: "2026-08-11T00:00:00.000Z",
    });
    expect(init?.credentials).toBe("include");
    expect(init?.cache).toBe("no-store");
  });

  it("rejects malformed reminder DTOs and preserves structured API errors", async () => {
    const malformed = vi
      .fn<TestFetcher>()
      .mockResolvedValue(jsonResponse({ runs: [{ id: "run" }] }));
    await expect(
      createCommunicationApi("", "org-1", malformed).listReminderRuns("event-1"),
    ).rejects.toMatchObject({
      code: "COMMUNICATION_INVALID_RESPONSE",
      status: 502,
    });

    const denied = vi
      .fn<TestFetcher>()
      .mockResolvedValue(
        jsonResponse(
          { error: { code: "COMMUNICATION_CONFLICT", message: "Audience revision is stale" } },
          409,
        ),
      );
    await expect(
      createCommunicationApi("", "org-1", denied).runManualReminders({
        eventId: "event-1",
        idempotencyKey: "manual-key-2",
        expectedAudienceRevision: "revision-1",
      }),
    ).rejects.toMatchObject({
      code: "COMMUNICATION_CONFLICT",
      message: "Audience revision is stale",
      status: 409,
    });
  });
});
