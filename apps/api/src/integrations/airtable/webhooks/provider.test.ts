import { describe, expect, it, vi } from "vitest";
import { AirtableHttpWebhookProvider, AirtableWebhookProviderError } from "./provider";

describe("AirtableHttpWebhookProvider", () => {
  it("creates, refreshes, and deletes webhooks using Airtable's base endpoints", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          id: "ach-created",
          macSecretBase64: "c2VjcmV0",
          expirationTime: "2026-08-20T12:00:00.000Z",
        }),
      )
      .mockResolvedValueOnce(Response.json({ expirationTime: "2026-08-27T12:00:00.000Z" }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const provider = new AirtableHttpWebhookProvider({
      fetch: fetcher,
      apiOrigin: "https://airtable.test/",
    });

    await expect(
      provider.create({
        credential: "access-token",
        baseId: "app/base",
        notificationUrl: "https://example.test/webhooks/opaque_registration_1",
        specification: { options: { filters: { dataTypes: ["tableData"] } } },
      }),
    ).resolves.toEqual({
      id: "ach-created",
      macSecret: "c2VjcmV0",
      expiresAt: "2026-08-20T12:00:00.000Z",
    });
    await expect(
      provider.refresh({ credential: "access-token", baseId: "app/base", webhookId: "ach/1" }),
    ).resolves.toEqual({ expiresAt: "2026-08-27T12:00:00.000Z" });
    await provider.delete({ credential: "access-token", baseId: "app/base", webhookId: "ach/1" });

    const calls = fetcher.mock.calls as Array<[string, RequestInit]>;
    expect(calls.map(([url, init]) => [url, init.method])).toEqual([
      ["https://airtable.test/v0/bases/app%2Fbase/webhooks", "POST"],
      ["https://airtable.test/v0/bases/app%2Fbase/webhooks/ach%2F1/refresh", "POST"],
      ["https://airtable.test/v0/bases/app%2Fbase/webhooks/ach%2F1", "DELETE"],
    ]);
    expect(new Headers(calls[0]?.[1].headers).get("authorization")).toBe("Bearer access-token");
    expect(JSON.parse(String(calls[0]?.[1].body))).toEqual({
      notificationUrl: "https://example.test/webhooks/opaque_registration_1",
      specification: { options: { filters: { dataTypes: ["tableData"] } } },
    });
  });

  it("classifies a missing refresh target as requiring recreation", async () => {
    const provider = new AirtableHttpWebhookProvider({
      fetch: vi.fn(async () => new Response(null, { status: 404 })),
    });

    const error = await provider
      .refresh({ credential: "token", baseId: "app", webhookId: "ach" })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AirtableWebhookProviderError);
    expect(error).toMatchObject({ operation: "refresh", status: 404, requiresRecreation: true });
  });
});
