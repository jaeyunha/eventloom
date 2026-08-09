import { describe, expect, it } from "vitest";
import { DEFAULT_OPEN_SEND_SENDERS, OpenSendClient } from "./client";
import type { OpenSendError, OpenSendMessage } from "./types";

const message: OpenSendMessage = {
  from: DEFAULT_OPEN_SEND_SENDERS.speakers,
  to: ["speaker@example.com"],
  subject: "Session update",
  html: "<p>Your session was updated.</p>",
  text: "Your session was updated.",
  idempotencyKey: "email-test-0001",
};

describe("OpenSendClient production configuration", () => {
  it("selects the three verified senders and allows only verified overrides", async () => {
    const requests: RequestInit[] = [];
    const fetch: typeof globalThis.fetch = async (_input, init = {}) => {
      requests.push(init);
      return Response.json({ id: "provider-message-1" }, { status: 201 });
    };
    const client = new OpenSendClient({
      sendingApiKey: "test-sending-key",
      fetch,
      senderAddresses: {
        auth: "auth@foreverbrowsing.com",
        speakers: "speakers@foreverbrowsing.com",
        calendar: "calendar@foreverbrowsing.com",
      },
    });

    expect(client.senderFor("auth")).toBe("auth@foreverbrowsing.com");
    expect(client.senderFor("speakers")).toBe("speakers@foreverbrowsing.com");
    expect(client.senderFor("calendar")).toBe("calendar@foreverbrowsing.com");

    await client.send(message, "calendar");
    const request = requests[0];
    if (request === undefined) throw new Error("Expected an OpenSend request.");
    expect(JSON.parse(String(request.body))).toMatchObject({
      from: "calendar@foreverbrowsing.com",
    });

    expect(
      () =>
        new OpenSendClient({
          sendingApiKey: "test-sending-key",
          senderAddresses: { auth: "unverified@example.com" },
          fetch,
        }),
    ).toThrowError(
      expect.objectContaining<Partial<OpenSendError>>({
        code: "CONFIGURATION_ERROR",
        retryable: false,
      }),
    );
  });

  it("uses a sending-only bearer key and preserves the idempotency key", async () => {
    let request: RequestInit | undefined;
    const fetch: typeof globalThis.fetch = async (_input, init = {}) => {
      request = init;
      return Response.json({ id: "provider-message-2" }, { status: 201 });
    };
    const client = new OpenSendClient({ sendingApiKey: "test-sending-key", fetch });

    await expect(client.send(message)).resolves.toEqual({
      providerMessageId: "provider-message-2",
      idempotencyKey: "email-test-0001",
    });

    if (request === undefined) throw new Error("Expected an OpenSend request.");
    const headers = new Headers(request.headers);
    expect(headers.get("authorization")).toBe("Bearer test-sending-key");
    expect(headers.get("idempotency-key")).toBe("email-test-0001");
    expect(headers.get("x-api-key")).toBeNull();
  });

  it("reports retryable provider failures without exposing provider bodies or keys", async () => {
    const fetch: typeof globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          error: "provider-internal-secret",
          apiKey: "provider-key-that-must-not-leak",
          correlationId: "5d99a3481e8a8f68de7ed71a66d1ff4c",
        }),
        { status: 500, headers: { "content-type": "application/json" } },
      );
    const client = new OpenSendClient({ sendingApiKey: "test-sending-key", fetch });

    const rejection = client.send(message);
    await expect(rejection).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      retryable: true,
      status: 500,
    });
    await expect(rejection).rejects.not.toThrow(
      /provider-internal-secret|provider-key-that-must-not-leak/,
    );
  });
  it("invokes the runtime fetch through globalThis in strict worker runtimes", async () => {
    const originalFetch = globalThis.fetch;
    let observedThis: unknown;
    globalThis.fetch = async function runtimeFetch(this: unknown) {
      observedThis = this;
      return Response.json({ id: "provider-message-runtime" }, { status: 201 });
    };

    try {
      const client = new OpenSendClient({ sendingApiKey: "test-sending-key" });
      await client.send(message);
      expect(observedThis).toBe(globalThis);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
