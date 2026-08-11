import { describe, expect, it, vi } from "vitest";
import { CommunicationApiError, type CommunicationTemplate, createCommunicationApi } from "./api";

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
    sender: "speakers@sessionboard.namuh.co",
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

describe("communications API", () => {
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
});
