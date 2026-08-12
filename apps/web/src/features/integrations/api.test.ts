import { describe, expect, it, vi } from "vitest";
import { createIntegrationAdminApi, IntegrationAdminApiError } from "./api";

function response(data: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify({ data }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("integration admin API", () => {
  it("sends OpenSend replacement credentials only in an authenticated JSON body", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "00000000-0000-4000-8000-000000000001",
    );
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const api = createIntegrationAdminApi("https://api.example.test/", async (input, init = {}) => {
      calls.push({ url: String(input), init });
      return response(undefined, 204);
    });

    await api.saveCredential({
      organizationId: "org/2026",
      eventId: "event/2026",
      provider: "opensend",
      secret: "  opensend_secret_value  ",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      "https://api.example.test/api/admin/organizations/org%2F2026/events/event%2F2026/integrations/opensend/credential",
    );
    expect(calls[0]?.url).not.toContain("opensend_secret_value");
    expect(calls[0]?.init.credentials).toBe("include");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ secret: "opensend_secret_value" });
    const headers = new Headers(calls[0]?.init.headers);
    expect(headers.get("idempotency-key")).toBe("web-00000000-0000-4000-8000-000000000001");
  });

  it("rejects empty credentials without issuing a request", async () => {
    const fetcher = vi.fn();
    const api = createIntegrationAdminApi("https://api.example.test", fetcher);

    await expect(
      api.saveCredential({
        organizationId: "org-a",
        eventId: "event-a",
        provider: "opensend",
        secret: "   ",
      }),
    ).rejects.toMatchObject({ code: "SECRET_REQUIRED", status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("removes a webhook without putting its identifier in a request body", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "00000000-0000-4000-8000-000000000002",
    );
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const api = createIntegrationAdminApi("https://api.example.test", async (input, init = {}) => {
      calls.push({ url: String(input), init });
      return response(undefined, 204);
    });

    await api.deleteWebhook("org-a", "event-a", "webhook/1");

    expect(calls[0]?.url).toBe(
      "https://api.example.test/api/admin/organizations/org-a/events/event-a/webhooks/webhook%2F1",
    );
    expect(calls[0]?.init.method).toBe("DELETE");
    expect(calls[0]?.init.body).toBeUndefined();
  });

  it("preserves stable error codes without exposing arbitrary response data", async () => {
    const api = createIntegrationAdminApi(
      "https://api.example.test",
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "ACCESS_DENIED",
              message: "Organizer access is required.",
              traceId: "trace-1",
            },
            internal: { credential: "must-not-surface" },
          }),
          { status: 403, headers: { "content-type": "application/json" } },
        ),
    );

    const rejection = api.getSnapshot("org-a", "event-a");
    await expect(rejection).rejects.toBeInstanceOf(IntegrationAdminApiError);
    await expect(rejection).rejects.toMatchObject({
      code: "ACCESS_DENIED",
      message: "Organizer access is required.",
      status: 403,
      traceId: "trace-1",
    });
    await expect(rejection).rejects.not.toHaveProperty("credential");
  });
  it("routes an empty base URL through the same-origin integrations gateway", async () => {
    let requestedUrl = "";
    let requestInit: RequestInit | undefined;
    const api = createIntegrationAdminApi("", async (input, init) => {
      requestedUrl = String(input);
      requestInit = init;
      return response({ id: "webhook-1", secret: "secret-1" });
    });

    await expect(
      api.createWebhook({
        organizationId: "org/a",
        eventId: "event/a",
        endpointUrl: "https://hooks.example.test/sessionboard",
        events: ["submission.created"],
      }),
    ).resolves.toEqual({ id: "webhook-1", secret: "secret-1" });

    expect(requestedUrl).toBe("/api/admin/organizations/org%2Fa/events/event%2Fa/webhooks");
    expect(requestedUrl.startsWith("/api/")).toBe(true);
    expect(requestedUrl).not.toMatch(/^\/\//);
    expect(requestedUrl).not.toMatch(/^https?:\/\//);
    expect(requestInit?.credentials).toBe("include");
  });
});
