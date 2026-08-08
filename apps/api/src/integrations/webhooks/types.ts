export const webhookDeliveryStatuses = [
  "pending",
  "delivering",
  "retrying",
  "succeeded",
  "failed",
  "dead_letter",
] as const;

export type WebhookDeliveryStatus = (typeof webhookDeliveryStatuses)[number];

/**
 * Webhook event names are intentionally open ended. The contracts package
 * publishes the first-party event names, while integrations may add names
 * without changing the delivery subsystem.
 */
export type WebhookEventType = string;

export interface WebhookEvent {
  id: string;
  organizationId: string;
  type: WebhookEventType;
  occurredAt: Date | string;
  data: unknown;
  eventId?: string;
  resource?: { type: string; id: string } | null;
}

/** A stored subscription includes the signing secret and must never be sent to callers. */
export interface WebhookSubscriptionRecord {
  id: string;
  organizationId: string;
  endpointUrl: string;
  events: readonly WebhookEventType[];
  active: boolean;
  signingSecret: string;
  signingSecretLastFour: string;
  createdAt: Date;
  updatedAt: Date;
  /** Optional event scoping for installations that bind a hook to one event. */
  eventId?: string;
}

/** Public representation of a subscription. It deliberately has no secret field. */
export type WebhookSubscription = Omit<WebhookSubscriptionRecord, "signingSecret">;
export type WebhookSubscriptionView = WebhookSubscription;

export interface CreateWebhookSubscriptionInput {
  organizationId: string;
  endpointUrl: string;
  events: readonly WebhookEventType[];
  signingSecret?: string;
  active?: boolean;
  eventId?: string;
}

export interface UpdateWebhookSubscriptionInput {
  endpointUrl?: string;
  events?: readonly WebhookEventType[];
  signingSecret?: string;
  active?: boolean;
  eventId?: string | null;
}

export interface WebhookDeliveryFailure {
  attemptedAt: Date;
  attempt: number;
  responseStatus: number | null;
  error: string;
  responseBody: string | null;
  retryable: boolean;
}

export interface WebhookDelivery {
  id: string;
  organizationId: string;
  subscriptionId: string;
  event: WebhookEvent;
  status: WebhookDeliveryStatus;
  attemptCount: number;
  nextAttemptAt: Date | null;
  lastResponseStatus: number | null;
  lastError: string | null;
  lastResponseBody?: string | null;
  createdAt: Date;
  completedAt: Date | null;
  failureHistory: readonly WebhookDeliveryFailure[];
}

export interface CreateWebhookDeliveryInput {
  organizationId: string;
  subscriptionId: string;
  event: WebhookEvent;
  createdAt: Date;
}

export interface DeliveryAttemptResult {
  attemptCount: number;
  attemptedAt: Date;
  responseStatus: number | null;
  error: string | null;
  responseBody?: string | null;
  nextAttemptAt?: Date | null;
  retryable?: boolean;
}

export interface WebhookClock {
  now(): Date;
}

export interface WebhookTransportRequest {
  method: "POST";
  url: string;
  headers: Readonly<Record<string, string>>;
  body: string;
  delivery: WebhookDelivery;
}

export interface WebhookTransportResponse {
  status: number;
  body?: string | null;
  headers?: Readonly<Record<string, string>>;
}

export interface WebhookTransport {
  send(request: WebhookTransportRequest): Promise<WebhookTransportResponse | Response>;
}

export interface WebhookRepository {
  listSubscriptions(organizationId: string): Promise<readonly WebhookSubscriptionRecord[]>;
  getSubscription(
    organizationId: string,
    subscriptionId: string,
  ): Promise<WebhookSubscriptionRecord | null>;
  createSubscription(input: CreateWebhookSubscriptionInput): Promise<WebhookSubscriptionRecord>;
  updateSubscription(
    organizationId: string,
    subscriptionId: string,
    input: UpdateWebhookSubscriptionInput,
  ): Promise<WebhookSubscriptionRecord | null>;
  deleteSubscription(organizationId: string, subscriptionId: string): Promise<boolean>;

  /** Must atomically return the existing row for a subscription/event key. */
  createDelivery(input: CreateWebhookDeliveryInput): Promise<WebhookDelivery>;
  claimDueDelivery(now: Date): Promise<WebhookDelivery | null>;
  markDeliverySucceeded(
    deliveryId: string,
    result: DeliveryAttemptResult,
  ): Promise<WebhookDelivery | null>;
  markDeliveryRetry(
    deliveryId: string,
    result: DeliveryAttemptResult,
  ): Promise<WebhookDelivery | null>;
  markDeliveryFailed(
    deliveryId: string,
    result: DeliveryAttemptResult,
  ): Promise<WebhookDelivery | null>;
}

export type WebhookSubscriptionRepository = Pick<
  WebhookRepository,
  | "listSubscriptions"
  | "getSubscription"
  | "createSubscription"
  | "updateSubscription"
  | "deleteSubscription"
>;
export type WebhookDeliveryRepository = Pick<
  WebhookRepository,
  | "createDelivery"
  | "claimDueDelivery"
  | "markDeliverySucceeded"
  | "markDeliveryRetry"
  | "markDeliveryFailed"
>;

export class WebhookRepositoryError extends Error {
  readonly code: "NOT_FOUND" | "CONFLICT" | "INVALID";
  readonly status: 400 | 404 | 409;

  constructor(code: "NOT_FOUND" | "CONFLICT" | "INVALID", message: string) {
    super(message);
    this.name = "WebhookRepositoryError";
    this.code = code;
    this.status = code === "NOT_FOUND" ? 404 : code === "CONFLICT" ? 409 : 400;
  }
}
export interface InMemoryWebhookRepositoryOptions {
  clock?: WebhookClock;
  idFactory?: (prefix: "whs" | "whd") => string;
}

interface InMemoryWebhookRepositorySeed {
  readonly subscriptions?: readonly WebhookSubscriptionRecord[];
  readonly deliveries?: readonly WebhookDelivery[];
}

function cloneEvent(event: WebhookEvent): WebhookEvent {
  return {
    ...event,
    ...(event.resource === undefined
      ? {}
      : { resource: event.resource ? { ...event.resource } : null }),
    ...(event.data === undefined ? { data: null } : { data: event.data }),
  };
}

function cloneFailure(failure: WebhookDeliveryFailure): WebhookDeliveryFailure {
  return { ...failure, attemptedAt: new Date(failure.attemptedAt) };
}

function cloneDelivery(delivery: WebhookDelivery): WebhookDelivery {
  return {
    ...delivery,
    event: cloneEvent(delivery.event),
    nextAttemptAt: delivery.nextAttemptAt ? new Date(delivery.nextAttemptAt) : null,
    completedAt: delivery.completedAt ? new Date(delivery.completedAt) : null,
    createdAt: new Date(delivery.createdAt),
    failureHistory: delivery.failureHistory.map(cloneFailure),
  };
}

function cloneSubscription(subscription: WebhookSubscriptionRecord): WebhookSubscriptionRecord {
  return {
    ...subscription,
    events: [...subscription.events],
    createdAt: new Date(subscription.createdAt),
    updatedAt: new Date(subscription.updatedAt),
  };
}

function randomId(prefix: "whs" | "whd"): string {
  const value = crypto.randomUUID().replaceAll("-", "").toUpperCase();
  return `${prefix}_${value.padEnd(26, "0").slice(0, 26)}`;
}

function randomSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function secretLastFour(secret: string): string {
  return secret.slice(-4).padStart(4, "•");
}

function asClock(clock?: WebhookClock): WebhookClock {
  return clock ?? { now: () => new Date() };
}

function isRepositorySeed(
  seed: readonly WebhookSubscriptionRecord[] | InMemoryWebhookRepositorySeed,
): seed is InMemoryWebhookRepositorySeed {
  return !Array.isArray(seed);
}

/** A deterministic, concurrency-safe reference repository for tests and local adapters. */
export class InMemoryWebhookRepository implements WebhookRepository {
  private readonly subscriptions = new Map<string, WebhookSubscriptionRecord>();
  private readonly deliveries = new Map<string, WebhookDelivery>();
  private readonly deliveryKeys = new Map<string, string>();
  private readonly clock: WebhookClock;
  private readonly idFactory: (prefix: "whs" | "whd") => string;

  constructor(
    seed?: readonly WebhookSubscriptionRecord[],
    options?: InMemoryWebhookRepositoryOptions,
  );
  constructor(seed?: InMemoryWebhookRepositorySeed, options?: InMemoryWebhookRepositoryOptions);
  constructor(
    seed: readonly WebhookSubscriptionRecord[] | InMemoryWebhookRepositorySeed = [],
    options: InMemoryWebhookRepositoryOptions = {},
  ) {
    this.clock = asClock(options.clock);
    this.idFactory = options.idFactory ?? randomId;
    const subscriptions = isRepositorySeed(seed) ? (seed.subscriptions ?? []) : seed;
    const deliveries = isRepositorySeed(seed) ? (seed.deliveries ?? []) : [];
    for (const subscription of subscriptions) {
      const secret = subscription.signingSecret || randomSecret();
      this.subscriptions.set(subscription.id, {
        ...cloneSubscription(subscription),
        signingSecret: secret,
        signingSecretLastFour: secretLastFour(secret),
      });
    }
    for (const delivery of deliveries) {
      const copy = cloneDelivery(delivery);
      this.deliveries.set(copy.id, copy);
      this.deliveryKeys.set(this.deliveryKey(copy.subscriptionId, copy.event.id), copy.id);
    }
  }

  private deliveryKey(subscriptionId: string, eventId: string): string {
    return `${subscriptionId}\u0000${eventId}`;
  }

  async listSubscriptions(organizationId: string): Promise<readonly WebhookSubscriptionRecord[]> {
    return [...this.subscriptions.values()]
      .filter((subscription) => subscription.organizationId === organizationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(cloneSubscription);
  }

  async getSubscription(
    organizationId: string,
    subscriptionId: string,
  ): Promise<WebhookSubscriptionRecord | null> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription || subscription.organizationId !== organizationId) return null;
    return cloneSubscription(subscription);
  }

  async createSubscription(
    input: CreateWebhookSubscriptionInput,
  ): Promise<WebhookSubscriptionRecord> {
    const now = this.clock.now();
    const signingSecret = input.signingSecret ?? randomSecret();
    if (!signingSecret)
      throw new WebhookRepositoryError("INVALID", "A signing secret is required.");
    const subscription: WebhookSubscriptionRecord = {
      id: this.idFactory("whs"),
      organizationId: input.organizationId,
      endpointUrl: input.endpointUrl,
      events: [...input.events],
      active: input.active ?? true,
      signingSecret,
      signingSecretLastFour: secretLastFour(signingSecret),
      createdAt: new Date(now),
      updatedAt: new Date(now),
      ...(input.eventId === undefined ? {} : { eventId: input.eventId }),
    };
    this.subscriptions.set(subscription.id, subscription);
    return cloneSubscription(subscription);
  }

  async updateSubscription(
    organizationId: string,
    subscriptionId: string,
    input: UpdateWebhookSubscriptionInput,
  ): Promise<WebhookSubscriptionRecord | null> {
    const existing = this.subscriptions.get(subscriptionId);
    if (!existing || existing.organizationId !== organizationId) return null;
    const now = this.clock.now();
    const signingSecret = input.signingSecret ?? existing.signingSecret;
    const updated: WebhookSubscriptionRecord = {
      ...existing,
      ...(input.endpointUrl === undefined ? {} : { endpointUrl: input.endpointUrl }),
      ...(input.events === undefined ? {} : { events: [...input.events] }),
      ...(input.active === undefined ? {} : { active: input.active }),
      signingSecret,
      signingSecretLastFour: secretLastFour(signingSecret),
      updatedAt: new Date(now),
    };
    if (input.eventId !== undefined) {
      if (input.eventId === null) delete updated.eventId;
      else updated.eventId = input.eventId;
    }
    this.subscriptions.set(subscriptionId, updated);
    return cloneSubscription(updated);
  }

  async deleteSubscription(organizationId: string, subscriptionId: string): Promise<boolean> {
    const existing = this.subscriptions.get(subscriptionId);
    if (!existing || existing.organizationId !== organizationId) return false;
    this.subscriptions.delete(subscriptionId);
    return true;
  }

  async createDelivery(input: CreateWebhookDeliveryInput): Promise<WebhookDelivery> {
    const subscription = this.subscriptions.get(input.subscriptionId);
    if (!subscription || subscription.organizationId !== input.organizationId) {
      throw new WebhookRepositoryError("NOT_FOUND", "The webhook subscription was not found.");
    }
    const key = this.deliveryKey(input.subscriptionId, input.event.id);
    const existingId = this.deliveryKeys.get(key);
    if (existingId) {
      const existing = this.deliveries.get(existingId);
      if (existing) return cloneDelivery(existing);
    }
    const delivery: WebhookDelivery = {
      id: this.idFactory("whd"),
      organizationId: input.organizationId,
      subscriptionId: input.subscriptionId,
      event: cloneEvent(input.event),
      status: "pending",
      attemptCount: 0,
      nextAttemptAt: new Date(input.createdAt),
      lastResponseStatus: null,
      lastError: null,
      createdAt: new Date(input.createdAt),
      completedAt: null,
      failureHistory: [],
    };
    this.deliveries.set(delivery.id, delivery);
    this.deliveryKeys.set(key, delivery.id);
    return cloneDelivery(delivery);
  }

  async claimDueDelivery(now: Date): Promise<WebhookDelivery | null> {
    const due = [...this.deliveries.values()]
      .filter(
        (delivery) =>
          (delivery.status === "pending" || delivery.status === "retrying") &&
          delivery.nextAttemptAt !== null &&
          delivery.nextAttemptAt.getTime() <= now.getTime(),
      )
      .sort((a, b) => {
        const at = a.nextAttemptAt?.getTime() ?? 0;
        const bt = b.nextAttemptAt?.getTime() ?? 0;
        return at - bt || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
      })[0];
    if (!due) return null;
    due.status = "delivering";
    due.nextAttemptAt = null;
    this.deliveries.set(due.id, due);
    return cloneDelivery(due);
  }

  private applyAttempt(
    deliveryId: string,
    result: DeliveryAttemptResult,
    status: WebhookDeliveryStatus,
    completedAt: Date | null,
  ): WebhookDelivery | null {
    const delivery = this.deliveries.get(deliveryId);
    if (!delivery || delivery.status === "succeeded")
      return delivery ? cloneDelivery(delivery) : null;
    delivery.attemptCount = Math.max(delivery.attemptCount, result.attemptCount);
    delivery.status = status;
    delivery.nextAttemptAt = result.nextAttemptAt === undefined ? null : result.nextAttemptAt;
    delivery.lastResponseStatus = result.responseStatus;
    delivery.lastError = result.error;
    if (result.responseBody !== undefined) delivery.lastResponseBody = result.responseBody;
    delivery.completedAt = completedAt;
    if (result.error !== null) {
      const failure: WebhookDeliveryFailure = {
        attemptedAt: new Date(result.attemptedAt),
        attempt: result.attemptCount,
        responseStatus: result.responseStatus,
        error: result.error,
        responseBody: result.responseBody ?? null,
        retryable: result.retryable ?? (status === "retrying" || status === "dead_letter"),
      };
      delivery.failureHistory = [...delivery.failureHistory, failure];
    }
    this.deliveries.set(delivery.id, delivery);
    return cloneDelivery(delivery);
  }

  async markDeliverySucceeded(
    deliveryId: string,
    result: DeliveryAttemptResult,
  ): Promise<WebhookDelivery | null> {
    return this.applyAttempt(deliveryId, result, "succeeded", result.attemptedAt);
  }

  async markDeliveryRetry(
    deliveryId: string,
    result: DeliveryAttemptResult,
  ): Promise<WebhookDelivery | null> {
    return this.applyAttempt(deliveryId, result, "retrying", null);
  }

  async markDeliveryFailed(
    deliveryId: string,
    result: DeliveryAttemptResult,
  ): Promise<WebhookDelivery | null> {
    return this.applyAttempt(
      deliveryId,
      result,
      result.retryable === true ? "dead_letter" : "failed",
      result.attemptedAt,
    );
  }

  async getDelivery(deliveryId: string): Promise<WebhookDelivery | null> {
    const delivery = this.deliveries.get(deliveryId);
    return delivery ? cloneDelivery(delivery) : null;
  }

  async listDeliveries(organizationId?: string): Promise<readonly WebhookDelivery[]> {
    return [...this.deliveries.values()]
      .filter(
        (delivery) => organizationId === undefined || delivery.organizationId === organizationId,
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(cloneDelivery);
  }
}

export function toWebhookSubscriptionView(
  subscription: WebhookSubscriptionRecord,
): WebhookSubscriptionView {
  const { signingSecret: _secret, ...view } = subscription;
  return {
    ...view,
    events: [...view.events],
    createdAt: new Date(view.createdAt),
    updatedAt: new Date(view.updatedAt),
  };
}
