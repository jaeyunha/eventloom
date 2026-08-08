import { describe, expect, it } from "vitest";
import {
  WebhookDeliveryWorker,
  WebhookDispatcher,
} from "../../apps/api/src/integrations/webhooks/delivery";
import {
  canonicalJson,
  createWebhookSignatureHeaders,
  verifyWebhookSignature,
} from "../../apps/api/src/integrations/webhooks/signature";
import {
  InMemoryWebhookRepository,
  type WebhookTransportRequest,
} from "../../apps/api/src/integrations/webhooks/types";

const signingSecret = "webhook-secret-value-that-must-stay-private";

describe("webhook signatures and retry safety", () => {
  it("canonicalizes signatures and rejects body, delivery, and timestamp tampering", async () => {
    const left = { z: 1, nested: { b: true, a: "same" } };
    const right = { nested: { a: "same", b: true }, z: 1 };
    const headers = await createWebhookSignatureHeaders(signingSecret, left, {
      deliveryId: "delivery-1",
      timestamp: 1_786_176_000,
    });

    expect(canonicalJson(left)).toBe(canonicalJson(right));
    await expect(verifyWebhookSignature(signingSecret, right, headers)).resolves.toBe(true);
    await expect(
      verifyWebhookSignature(signingSecret, { ...right, z: 2 }, headers),
    ).resolves.toBe(false);
    await expect(
      verifyWebhookSignature(signingSecret, right, { ...headers, "webhook-id": "delivery-2" }),
    ).resolves.toBe(false);
    await expect(
      verifyWebhookSignature(signingSecret, right, {
        ...headers,
        "webhook-timestamp": "1786176001",
      }),
    ).resolves.toBe(false);
  });

  it("deduplicates fan-out, signs every attempt, retries 5xx, and redacts secrets", async () => {
    let nowMs = Date.parse("2026-08-08T12:00:00.000Z");
    let sequence = 0;
    const clock = { now: () => new Date(nowMs) };
    const repository = new InMemoryWebhookRepository([], {
      clock,
      idFactory: (prefix) => `${prefix}-${++sequence}`,
    });
    await repository.createSubscription({
      organizationId: "org-1",
      endpointUrl: "https://hooks.example.test/events",
      events: ["agenda.published"],
      signingSecret,
    });
    const dispatcher = new WebhookDispatcher(repository, { clock });
    const event = {
      id: "domain-event-1",
      organizationId: "org-1",
      type: "agenda.published",
      occurredAt: "2026-08-08T12:00:00.000Z",
      data: { revisionId: "revision-1", eventId: "event-1" },
      eventId: "event-1",
    };
    const firstFanOut = await dispatcher.fanOut(event);
    const replayFanOut = await dispatcher.fanOut(event);
    const requests: WebhookTransportRequest[] = [];
    const worker = new WebhookDeliveryWorker(
      repository,
      {
        send: async (request) => {
          requests.push(request);
          return requests.length === 1
            ? { status: 503, body: `provider echoed ${signingSecret}` }
            : { status: 204, body: null };
        },
      },
      {
        clock,
        initialRetryDelayMs: 1_000,
        maxRetryDelayMs: 1_000,
        maxAttempts: 3,
      },
    );

    expect(firstFanOut).toHaveLength(1);
    expect(replayFanOut[0]?.id).toBe(firstFanOut[0]?.id);
    const retrying = await worker.processNext();
    expect(retrying.outcome).toBe("retrying");
    expect(JSON.stringify(retrying.delivery)).not.toContain(signingSecret);
    expect(retrying.delivery?.lastResponseBody).toContain("[REDACTED]");

    nowMs += 1_000;
    const succeeded = await worker.processNext();
    const idle = await worker.processNext();

    expect(succeeded.outcome).toBe("succeeded");
    expect(idle.outcome).toBe("idle");
    expect(requests).toHaveLength(2);
    expect(requests[0]?.delivery.id).toBe(requests[1]?.delivery.id);
    expect(requests[0]?.body).toBe(requests[1]?.body);
    expect(requests[0]?.headers["webhook-timestamp"]).not.toBe(
      requests[1]?.headers["webhook-timestamp"],
    );
    for (const request of requests) {
      await expect(
        verifyWebhookSignature(signingSecret, request.body, request.headers),
      ).resolves.toBe(true);
      await expect(
        verifyWebhookSignature(signingSecret, `${request.body} `, request.headers),
      ).resolves.toBe(false);
    }
  });
});
