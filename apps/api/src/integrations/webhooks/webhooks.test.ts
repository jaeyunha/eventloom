import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { canonicalJson, WebhookDeliveryWorker, WebhookDispatcher } from "./delivery";
import { createWebhookSubscriptionRoutes, type WebhookRouteEnvironment } from "./routes";
import { signWebhookPayload, verifyWebhookSignature } from "./signature";
import {
  InMemoryWebhookRepository,
  type WebhookEvent,
  type WebhookTransport,
  type WebhookTransportRequest,
} from "./types";

const now = new Date("2026-08-08T12:00:00.000Z");
const event: WebhookEvent = {
  id: "evt-delivery-1",
  organizationId: "org-1",
  type: "submission.created",
  occurredAt: now,
  data: { z: 1, a: "stable" },
};

function principal(
  organizationId = "org-1",
  scopes: Array<"webhooks:read" | "webhooks:write"> = ["webhooks:read", "webhooks:write"],
) {
  return { kind: "apiKey" as const, apiKeyId: "key-1", organizationId, scopes };
}

describe("webhook signatures", () => {
  it("canonicalizes object keys and detects tampering", async () => {
    expect(canonicalJson({ z: 1, a: { y: true, x: false } })).toBe(
      '{"a":{"x":false,"y":true},"z":1}',
    );
    const signature = await signWebhookPayload("secret", { z: 1, a: 2 });
    expect(await verifyWebhookSignature("secret", { a: 2, z: 1 }, signature)).toBe(true);
    expect(await verifyWebhookSignature("secret", { a: 3, z: 1 }, signature)).toBe(false);
  });
});

describe("webhook fan-out and delivery", () => {
  it("is idempotent per subscription and event", async () => {
    const repository = new InMemoryWebhookRepository([], {
      clock: { now: () => now },
      idFactory: (prefix) => `${prefix}_${prefix === "whs" ? "subscription" : "delivery"}`,
    });
    const subscription = await repository.createSubscription({
      organizationId: "org-1",
      endpointUrl: "https://receiver.example.test/hooks",
      events: [event.type],
      signingSecret: "secret",
    });
    const dispatcher = new WebhookDispatcher(repository, { clock: { now: () => now } });
    expect((await dispatcher.fanOut(event)).map((delivery) => delivery.id)).toEqual([
      "whd_delivery",
    ]);
    expect((await dispatcher.fanOut(event)).map((delivery) => delivery.id)).toEqual([
      "whd_delivery",
    ]);
    expect((await repository.listDeliveries()).length).toBe(1);
    expect(subscription.signingSecret).toBe("secret");
  });

  it("delivers successfully and does not duplicate completed rows", async () => {
    const repository = new InMemoryWebhookRepository([], { clock: { now: () => now } });
    await repository.createSubscription({
      organizationId: "org-1",
      endpointUrl: "https://receiver.example.test/hooks",
      events: [event.type],
      signingSecret: "secret",
    });
    const deliveries = await new WebhookDispatcher(repository, {
      clock: { now: () => now },
    }).fanOut(event);
    const delivery = deliveries[0];
    if (!delivery) throw new Error("Expected a queued delivery.");
    const requests: WebhookTransportRequest[] = [];
    const transport: WebhookTransport = {
      send: async (request) => {
        requests.push(request);
        return { status: 204 };
      },
    };
    const worker = new WebhookDeliveryWorker(repository, transport, { clock: { now: () => now } });
    expect((await worker.processNext()).outcome).toBe("succeeded");
    expect((await worker.processNext()).outcome).toBe("idle");
    const sent = requests[0];
    if (!sent) throw new Error("Expected one webhook request.");
    expect(sent.body).toBe(canonicalJson(event));
    expect(await verifyWebhookSignature("secret", sent.body, sent.headers)).toBe(true);
    expect(await verifyWebhookSignature("secret", `${sent.body} `, sent.headers)).toBe(false);
    expect((await repository.getDelivery(delivery.id))?.status).toBe("succeeded");
  });

  it("schedules bounded retries then records terminal exhaustion", async () => {
    const repository = new InMemoryWebhookRepository([], { clock: { now: () => now } });
    await repository.createSubscription({
      organizationId: "org-1",
      endpointUrl: "https://receiver.example.test/hooks",
      events: [event.type],
      signingSecret: "secret",
    });
    const deliveries = await new WebhookDispatcher(repository, {
      clock: { now: () => now },
    }).fanOut(event);
    const delivery = deliveries[0];
    if (!delivery) throw new Error("Expected a queued delivery.");
    const transport: WebhookTransport = { send: async () => ({ status: 503, body: "busy" }) };
    const worker = new WebhookDeliveryWorker(repository, transport, {
      clock: { now: () => now },
      maxAttempts: 2,
      initialRetryDelayMs: 100,
      maxRetryDelayMs: 100,
    });
    expect((await worker.processNext()).outcome).toBe("retrying");
    const retried = await repository.getDelivery(delivery.id);
    expect(retried?.nextAttemptAt?.getTime()).toBe(now.getTime() + 100);
    // Advance the injected clock to the scheduled due time without sleeping.
    const due = new Date(now.getTime() + 100);
    const dueWorker = new WebhookDeliveryWorker(repository, transport, {
      clock: { now: () => due },
      maxAttempts: 2,
      initialRetryDelayMs: 100,
      maxRetryDelayMs: 100,
    });
    expect((await dueWorker.processNext()).outcome).toBe("dead_letter");
    expect((await repository.getDelivery(delivery.id))?.status).toBe("dead_letter");
  });
});

describe("webhook subscription routes", () => {
  it("enforces tenant/scope and redacts signing secrets", async () => {
    const repository = new InMemoryWebhookRepository([], { clock: { now: () => now } });
    const app = new Hono<WebhookRouteEnvironment>();
    app.use("*", async (context, next) => {
      context.set("authPrincipal", principal());
      context.set("traceId", "trace-1");
      await next();
    });
    app.route(
      "/api/v1/organizations/:organizationId/webhooks",
      createWebhookSubscriptionRoutes(repository),
    );
    const created = await app.request("/api/v1/organizations/org-1/webhooks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        endpointUrl: "https://receiver.example.test/hooks",
        events: [event.type],
        signingSecret: "12345678901234567890123456789012",
      }),
    });
    const insecure = await app.request("/api/v1/organizations/org-1/webhooks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        endpointUrl: "http://receiver.example.test/hooks",
        events: [event.type],
      }),
    });
    const body = (await created.json()) as { data: Record<string, unknown> };
    expect(created.status).toBe(201);
    expect(insecure.status).toBe(400);
    expect(body.data).not.toHaveProperty("signingSecret");
    expect(body.data).not.toHaveProperty("secret");

    const forbidden = new Hono<WebhookRouteEnvironment>();
    forbidden.use("*", async (context, next) => {
      context.set("authPrincipal", principal("other-org"));
      await next();
    });
    forbidden.route(
      "/api/v1/organizations/:organizationId/webhooks",
      createWebhookSubscriptionRoutes(repository),
    );
    expect((await forbidden.request("/api/v1/organizations/org-1/webhooks")).status).toBe(403);
  });
});
