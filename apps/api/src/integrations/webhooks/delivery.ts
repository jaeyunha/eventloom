import {
  canonicalJson,
  createWebhookSignatureHeaders,
  type WebhookSignatureHeaders,
} from "./signature";
import type {
  DeliveryAttemptResult,
  WebhookClock,
  WebhookDelivery,
  WebhookEvent,
  WebhookRepository,
  WebhookSubscriptionRecord,
  WebhookTransport,
  WebhookTransportRequest,
  WebhookTransportResponse,
} from "./types";

export { canonicalJson };


export function canonicalWebhookPayload(event: unknown): string {
  return canonicalJson(event);
}


export interface WebhookDispatcherOptions {
  clock?: WebhookClock;
}

function asClock(clock?: WebhookClock): WebhookClock {
  return clock ?? { now: () => new Date() };
}

function eventMatchesSubscription(
  subscription: WebhookSubscriptionRecord,
  event: { type: string; eventId?: string },
): boolean {
  if (!subscription.active) return false;
  if (subscription.eventId !== undefined && subscription.eventId !== event.eventId) return false;
  return subscription.events.includes("*") || subscription.events.includes(event.type);
}

/** Fans one domain event into one idempotent delivery row per matching hook. */
export class WebhookDispatcher {
  private readonly clock: WebhookClock;

  constructor(
    private readonly repository: WebhookRepository,
    options: WebhookDispatcherOptions = {},
  ) {
    this.clock = asClock(options.clock);
  }

  async fanOut(event: WebhookEvent) {
    const subscriptions = await this.repository.listSubscriptions(event.organizationId);
    const deliveries: WebhookDelivery[] = [];
    for (const subscription of subscriptions) {
      if (!eventMatchesSubscription(subscription, event)) continue;
      const input = {
        organizationId: event.organizationId,
        subscriptionId: subscription.id,
        event,
        createdAt: this.clock.now(),
      };
      deliveries.push(await this.repository.createDelivery(input));
    }
    return deliveries;
  }
}

export interface WebhookDeliveryWorkerOptions {
  clock?: WebhookClock;
  maxAttempts?: number;
  initialRetryDelayMs?: number;
  maxRetryDelayMs?: number;
  userAgent?: string;
  maxResponseBodyBytes?: number;
}

export interface WebhookDeliveryAttempt {
  delivery: WebhookDelivery | null;
  outcome: "idle" | "succeeded" | "retrying" | "failed" | "dead_letter";
}

const defaultWorkerOptions: Required<
  Pick<WebhookDeliveryWorkerOptions, "maxAttempts" | "initialRetryDelayMs" | "maxRetryDelayMs" | "userAgent" | "maxResponseBodyBytes">
> = {
  maxAttempts: 5,
  initialRetryDelayMs: 1_000,
  maxRetryDelayMs: 60 * 60 * 1_000,
  userAgent: "OpenSessionboard-Webhooks/1",
  maxResponseBodyBytes: 4_096,
};

function endpointUrl(subscription: WebhookSubscriptionRecord): string {
  return subscription.endpointUrl;
}

function redact(value: string, secret: string): string {
  if (!value) return value;
  return value.split(secret).join("[REDACTED]").slice(0, 4_096);
}

function responseStatus(value: unknown): number | null {
  if (typeof value !== "object" || value === null) return null;
  const status = (value as { status?: unknown; statusCode?: unknown }).status ??
    (value as { statusCode?: unknown }).statusCode;
  return typeof status === "number" && Number.isInteger(status) ? status : null;
}

async function responseBody(value: unknown, maxBytes: number): Promise<string | null> {
  if (typeof value !== "object" || value === null) return null;
  const body = (value as { body?: unknown }).body;
  if (typeof body === "string") return body.slice(0, maxBytes);
  const text = (value as { text?: unknown }).text;
  if (typeof text === "function") {
    try {
      const result = await (text as () => Promise<string>)();
      return result.slice(0, maxBytes);
    } catch {
      return null;
    }
  }
  return null;
}

function isRetryableStatus(status: number | null): boolean {
  return status === null || status <= 0 || status === 408 || status === 425 || status === 429 || status >= 500;
}

export function classifyWebhookResponse(status: number | null): "retryable" | "terminal" | "success" {
  if (status !== null && status >= 200 && status < 300) return "success";
  return isRetryableStatus(status) ? "retryable" : "terminal";
}

export function retryDelayMs(
  attempt: number,
  initialRetryDelayMs = defaultWorkerOptions.initialRetryDelayMs,
  maxRetryDelayMs = defaultWorkerOptions.maxRetryDelayMs,
): number {
  const exponent = Math.max(0, Math.min(attempt - 1, 30));
  return Math.min(maxRetryDelayMs, initialRetryDelayMs * 2 ** exponent);
}

async function normalizeTransportResponse(
  response: WebhookTransportResponse | Response,
  maxResponseBodyBytes: number,
): Promise<{ status: number | null; body: string | null }> {
  const status = responseStatus(response);
  return { status, body: await responseBody(response, maxResponseBodyBytes) };
}

/**
 * Processes exactly one claimed row. Persistence claims are authoritative, and
 * completed rows are never sent again even when a caller retries this method.
 */
export class WebhookDeliveryWorker {
  private readonly options: Required<
    Pick<WebhookDeliveryWorkerOptions, "maxAttempts" | "initialRetryDelayMs" | "maxRetryDelayMs" | "userAgent" | "maxResponseBodyBytes">
  >;
  private readonly clock: WebhookClock;
  private running = false;

  constructor(
    private readonly repository: WebhookRepository,
    private readonly transport: WebhookTransport,
    options: WebhookDeliveryWorkerOptions = {},
  ) {
    this.clock = asClock(options.clock);
    this.options = {
      maxAttempts: options.maxAttempts ?? defaultWorkerOptions.maxAttempts,
      initialRetryDelayMs: options.initialRetryDelayMs ?? defaultWorkerOptions.initialRetryDelayMs,
      maxRetryDelayMs: options.maxRetryDelayMs ?? defaultWorkerOptions.maxRetryDelayMs,
      userAgent: options.userAgent ?? defaultWorkerOptions.userAgent,
      maxResponseBodyBytes: options.maxResponseBodyBytes ?? defaultWorkerOptions.maxResponseBodyBytes,
    };
    if (!Number.isInteger(this.options.maxAttempts) || this.options.maxAttempts < 1) {
      throw new RangeError("maxAttempts must be a positive integer.");
    }
  }

  private async claim(now: Date): Promise<WebhookDelivery | null> {
    return this.repository.claimDueDelivery(now);
  }

  private async succeed(deliveryId: string, result: DeliveryAttemptResult): Promise<WebhookDelivery | null> {
    return this.repository.markDeliverySucceeded(deliveryId, result);
  }

  private async retry(deliveryId: string, result: DeliveryAttemptResult): Promise<WebhookDelivery | null> {
    return this.repository.markDeliveryRetry(deliveryId, result);
  }

  private async fail(deliveryId: string, result: DeliveryAttemptResult): Promise<WebhookDelivery | null> {
    return this.repository.markDeliveryFailed(deliveryId, result);
  }

  async processNext(): Promise<WebhookDeliveryAttempt> {
    if (this.running) return { delivery: null, outcome: "idle" };
    this.running = true;
    try {
      const now = this.clock.now();
      const delivery = await this.claim(now);
      if (!delivery) return { delivery: null, outcome: "idle" };
      const attempt = delivery.attemptCount + 1;
      let subscription: WebhookSubscriptionRecord | null;
      try {
        subscription = await this.repository.getSubscription(
          delivery.organizationId,
          delivery.subscriptionId,
        );
      } catch {
        const failure: DeliveryAttemptResult = {
          attemptCount: attempt,
          attemptedAt: now,
          responseStatus: null,
          error: "The webhook subscription could not be loaded.",
          responseBody: null,
          retryable: true,
        };
        if (attempt < this.options.maxAttempts) {
          failure.nextAttemptAt = new Date(
            now.getTime() +
              retryDelayMs(
                attempt,
                this.options.initialRetryDelayMs,
                this.options.maxRetryDelayMs,
              ),
          );
          const retried = await this.retry(delivery.id, failure);
          return { delivery: retried ?? delivery, outcome: "retrying" };
        }
        const failed = await this.fail(delivery.id, failure);
        return { delivery: failed ?? delivery, outcome: "dead_letter" };
      }
      if (!subscription || !subscription.active) {
        const failed = await this.fail(delivery.id, {
          attemptCount: attempt,
          attemptedAt: now,
          responseStatus: null,
          error: "The webhook subscription is no longer active.",
          responseBody: null,
          retryable: false,
        });
        return { delivery: failed ?? delivery, outcome: "failed" };
      }

      let result: { status: number | null; body: string | null };
      try {
        const body = canonicalWebhookPayload(delivery.event);
        const signatureHeaders: WebhookSignatureHeaders = await createWebhookSignatureHeaders(
          subscription.signingSecret,
          body,
          { deliveryId: delivery.id, timestamp: now },
        );
        const request: WebhookTransportRequest = {
          method: "POST",
          url: endpointUrl(subscription),
          headers: {
            ...signatureHeaders,
            "content-type": "application/json",
            "user-agent": this.options.userAgent,
          },
          body,
          delivery,
        };
        result = await normalizeTransportResponse(
          await this.transport.send(request),
          this.options.maxResponseBodyBytes,
        );
      } catch (error) {
        const message = redact(
          error instanceof Error ? error.message : "The webhook transport failed.",
          subscription.signingSecret,
        );
        result = { status: null, body: message };
      }

      const classification = classifyWebhookResponse(result.status);
      if (classification === "success") {
        const completed = await this.succeed(delivery.id, {
          attemptCount: attempt,
          attemptedAt: now,
          responseStatus: result.status,
          error: null,
          responseBody: result.body,
          retryable: false,
        });
        return { delivery: completed ?? delivery, outcome: "succeeded" };
      }

      const errorMessage =
        result.status === null
          ? redact(result.body ?? "The webhook transport failed.", subscription.signingSecret)
          : result.status >= 500
            ? `The webhook endpoint returned HTTP ${result.status}.`
            : `The webhook endpoint returned a non-success HTTP ${result.status}.`;
      const attemptResult: DeliveryAttemptResult = {
        attemptCount: attempt,
        attemptedAt: now,
        responseStatus: result.status,
        error: redact(errorMessage, subscription.signingSecret),
        responseBody: result.body === null ? null : redact(result.body, subscription.signingSecret),
        retryable: classification === "retryable",
      };
      if (classification === "retryable" && attempt < this.options.maxAttempts) {
        attemptResult.nextAttemptAt = new Date(
          now.getTime() + retryDelayMs(attempt, this.options.initialRetryDelayMs, this.options.maxRetryDelayMs),
        );
        const retried = await this.retry(delivery.id, attemptResult);
        return { delivery: retried ?? delivery, outcome: "retrying" };
      }
      const failed = await this.fail(delivery.id, attemptResult);
      return {
        delivery: failed ?? delivery,
        outcome: classification === "retryable" ? "dead_letter" : "failed",
      };
    } finally {
      this.running = false;
    }
  }
}

