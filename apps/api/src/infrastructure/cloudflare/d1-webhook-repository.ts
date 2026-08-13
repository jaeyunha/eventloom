import type {
  CreateWebhookDeliveryInput,
  CreateWebhookSubscriptionInput,
  DeliveryAttemptResult,
  UpdateWebhookSubscriptionInput,
  WebhookDelivery,
  WebhookDeliveryFailure,
  WebhookDeliveryStatus,
  WebhookEvent,
  WebhookRepository,
  WebhookSubscriptionRecord,
} from "../../integrations/webhooks/types";
import { WebhookRepositoryError } from "../../integrations/webhooks/types";

const DEFAULT_LEASE_MILLISECONDS = 60_000;

export interface WebhookSecretCipher {
  encrypt(secret: string): Promise<string>;
  decrypt(ciphertext: string): Promise<string>;
}

export interface D1WebhookRepositoryOptions {
  readonly secretCipher: WebhookSecretCipher;
  readonly clock?: { now(): Date };
  readonly idFactory?: (prefix: "whs" | "whd") => string;
  readonly leaseMilliseconds?: number;
  readonly leaseOwner?: string;
  readonly claimTokenFactory?: () => string;
}

interface SubscriptionRow {
  id: string;
  organization_id: string;
  endpoint: string;
  encrypted_signing_secret: string;
  signing_secret_last_four: string;
  event_filter_json: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

interface DeliveryRow {
  id: string;
  organization_id: string;
  subscription_id: string;
  event_external_id: string;
  event_type: string;
  payload_json: string;
  state: "pending" | "claimed" | "delivered" | "retry" | "dead";
  attempts: number;
  available_at: string;
  claim_owner: string | null;
  claim_token: string | null;
  lease_expires_at: string | null;
  response_status: number | null;
  last_error: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

interface StoredFailure {
  attemptedAt: string;
  attempt: number;
  responseStatus: number | null;
  error: string;
  responseBody: string | null;
  retryable: boolean;
}

interface StoredDeliveryPayload {
  event: Omit<WebhookEvent, "occurredAt"> & { occurredAt: string };
  status: WebhookDeliveryStatus;
  failureHistory: StoredFailure[];
  lastResponseBody?: string | null;
}

interface ActiveClaim {
  organizationId: string;
  owner: string;
  token: string;
}

function changedRows(result: D1Result<unknown>): number {
  return result.meta.changes ?? 0;
}

function randomId(prefix: "whs" | "whd"): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").toUpperCase().slice(0, 26)}`;
}

function randomSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function lastFour(secret: string): string {
  return secret.slice(-4).padStart(4, "•");
}

function parseEvents(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some((event) => typeof event !== "string")) {
    throw new Error("The stored webhook event filter is invalid.");
  }
  return parsed;
}

function storedEvent(event: WebhookEvent): StoredDeliveryPayload["event"] {
  return {
    ...event,
    occurredAt: new Date(event.occurredAt).toISOString(),
    ...(event.resource === undefined
      ? {}
      : { resource: event.resource === null ? null : { ...event.resource } }),
  };
}

function parsePayload(value: string): StoredDeliveryPayload {
  const parsed = JSON.parse(value) as StoredDeliveryPayload;
  if (typeof parsed !== "object" || parsed === null || typeof parsed.event !== "object") {
    throw new Error("The stored webhook delivery payload is invalid.");
  }
  return parsed;
}

function failureFromStored(failure: StoredFailure): WebhookDeliveryFailure {
  return { ...failure, attemptedAt: new Date(failure.attemptedAt) };
}

function physicalState(status: WebhookDeliveryStatus): DeliveryRow["state"] {
  switch (status) {
    case "pending":
      return "pending";
    case "delivering":
      return "claimed";
    case "retrying":
      return "retry";
    case "succeeded":
      return "delivered";
    case "failed":
    case "dead_letter":
      return "dead";
  }
}

function payloadForAttempt(
  row: DeliveryRow,
  result: DeliveryAttemptResult,
  status: WebhookDeliveryStatus,
): StoredDeliveryPayload {
  const payload = parsePayload(row.payload_json);
  const failureHistory = [...payload.failureHistory];
  if (result.error !== null) {
    failureHistory.push({
      attemptedAt: result.attemptedAt.toISOString(),
      attempt: result.attemptCount,
      responseStatus: result.responseStatus,
      error: result.error,
      responseBody: result.responseBody ?? null,
      retryable: result.retryable ?? (status === "retrying" || status === "dead_letter"),
    });
  }
  return {
    ...payload,
    status,
    failureHistory,
    ...(result.responseBody === undefined ? {} : { lastResponseBody: result.responseBody }),
  };
}

/**
 * D1-backed customer webhook persistence.
 *
 * The customer tables do not have an event scope column on subscriptions, so
 * non-null `eventId` subscription scopes are rejected instead of being stored
 * ambiguously in the event filter. Delivery claims are process-local handles
 * backed by owner/token/lease CAS predicates in D1.
 */
export class D1WebhookRepository implements WebhookRepository {
  readonly #clock: { now(): Date };
  readonly #idFactory: (prefix: "whs" | "whd") => string;
  readonly #leaseMilliseconds: number;
  readonly #leaseOwner: string;
  readonly #claimTokenFactory: () => string;
  readonly #claims = new Map<string, ActiveClaim>();

  constructor(
    private readonly database: D1Database,
    private readonly options: D1WebhookRepositoryOptions,
  ) {
    this.#clock = options.clock ?? { now: () => new Date() };
    this.#idFactory = options.idFactory ?? randomId;
    this.#leaseMilliseconds = options.leaseMilliseconds ?? DEFAULT_LEASE_MILLISECONDS;
    this.#leaseOwner = options.leaseOwner ?? `webhook-worker-${crypto.randomUUID()}`;
    this.#claimTokenFactory = options.claimTokenFactory ?? (() => crypto.randomUUID());
    if (!Number.isInteger(this.#leaseMilliseconds) || this.#leaseMilliseconds <= 0) {
      throw new RangeError("leaseMilliseconds must be a positive integer.");
    }
  }

  async #subscription(row: SubscriptionRow): Promise<WebhookSubscriptionRecord> {
    return {
      id: row.id,
      organizationId: row.organization_id,
      endpointUrl: row.endpoint,
      events: parseEvents(row.event_filter_json),
      active: row.is_active === 1,
      signingSecret: await this.options.secretCipher.decrypt(row.encrypted_signing_secret),
      signingSecretLastFour: row.signing_secret_last_four,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  #delivery(row: DeliveryRow): WebhookDelivery {
    const payload = parsePayload(row.payload_json);
    return {
      id: row.id,
      organizationId: row.organization_id,
      subscriptionId: row.subscription_id,
      event: { ...payload.event, occurredAt: new Date(payload.event.occurredAt) },
      status: payload.status,
      attemptCount: row.attempts,
      nextAttemptAt:
        row.state === "pending" || row.state === "retry" ? new Date(row.available_at) : null,
      lastResponseStatus: row.response_status,
      lastError: row.last_error,
      ...(payload.lastResponseBody === undefined
        ? {}
        : { lastResponseBody: payload.lastResponseBody }),
      createdAt: new Date(row.created_at),
      completedAt: row.delivered_at === null ? null : new Date(row.delivered_at),
      failureHistory: payload.failureHistory.map(failureFromStored),
    };
  }

  async listSubscriptions(organizationId: string): Promise<readonly WebhookSubscriptionRecord[]> {
    const rows = await this.database
      .prepare(
        `SELECT * FROM customer_webhook_subscriptions
          WHERE organization_id = ?
          ORDER BY created_at ASC, id ASC`,
      )
      .bind(organizationId)
      .all<SubscriptionRow>();
    return Promise.all((rows.results ?? []).map((row) => this.#subscription(row)));
  }

  async getSubscription(
    organizationId: string,
    subscriptionId: string,
  ): Promise<WebhookSubscriptionRecord | null> {
    const row = await this.database
      .prepare(
        `SELECT * FROM customer_webhook_subscriptions
          WHERE organization_id = ? AND id = ?
          LIMIT 1`,
      )
      .bind(organizationId, subscriptionId)
      .first<SubscriptionRow>();
    return row === null ? null : this.#subscription(row);
  }

  async createSubscription(
    input: CreateWebhookSubscriptionInput,
  ): Promise<WebhookSubscriptionRecord> {
    if (input.eventId !== undefined) {
      throw new WebhookRepositoryError(
        "INVALID",
        "The D1 customer webhook schema does not support event-scoped subscriptions.",
      );
    }
    const signingSecret = input.signingSecret ?? randomSecret();
    if (signingSecret.trim().length === 0) {
      throw new WebhookRepositoryError("INVALID", "A signing secret is required.");
    }
    const now = this.#clock.now().toISOString();
    const id = this.#idFactory("whs");
    try {
      await this.database
        .prepare(
          `INSERT INTO customer_webhook_subscriptions
             (id, organization_id, endpoint, encrypted_signing_secret,
              signing_secret_last_four, event_filter_json, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          input.organizationId,
          input.endpointUrl,
          await this.options.secretCipher.encrypt(signingSecret),
          lastFour(signingSecret),
          JSON.stringify([...input.events]),
          input.active === false ? 0 : 1,
          now,
          now,
        )
        .run();
    } catch {
      throw new WebhookRepositoryError(
        "CONFLICT",
        "The webhook subscription could not be created.",
      );
    }
    return {
      id,
      organizationId: input.organizationId,
      endpointUrl: input.endpointUrl,
      events: [...input.events],
      active: input.active ?? true,
      signingSecret,
      signingSecretLastFour: lastFour(signingSecret),
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
  }

  async updateSubscription(
    organizationId: string,
    subscriptionId: string,
    input: UpdateWebhookSubscriptionInput,
  ): Promise<WebhookSubscriptionRecord | null> {
    if (input.eventId !== undefined && input.eventId !== null) {
      throw new WebhookRepositoryError(
        "INVALID",
        "The D1 customer webhook schema does not support event-scoped subscriptions.",
      );
    }
    const existing = await this.getSubscription(organizationId, subscriptionId);
    if (existing === null) return null;
    const signingSecret = input.signingSecret ?? existing.signingSecret;
    if (signingSecret.trim().length === 0) {
      throw new WebhookRepositoryError("INVALID", "A signing secret is required.");
    }
    const now = this.#clock.now().toISOString();
    const result = await this.database
      .prepare(
        `UPDATE customer_webhook_subscriptions
            SET endpoint = ?, encrypted_signing_secret = ?, signing_secret_last_four = ?,
                event_filter_json = ?, is_active = ?, updated_at = ?
          WHERE organization_id = ? AND id = ?`,
      )
      .bind(
        input.endpointUrl ?? existing.endpointUrl,
        await this.options.secretCipher.encrypt(signingSecret),
        lastFour(signingSecret),
        JSON.stringify(input.events === undefined ? existing.events : [...input.events]),
        (input.active ?? existing.active) ? 1 : 0,
        now,
        organizationId,
        subscriptionId,
      )
      .run();
    if (changedRows(result) !== 1) return null;
    return {
      ...existing,
      ...(input.endpointUrl === undefined ? {} : { endpointUrl: input.endpointUrl }),
      ...(input.events === undefined ? {} : { events: [...input.events] }),
      ...(input.active === undefined ? {} : { active: input.active }),
      signingSecret,
      signingSecretLastFour: lastFour(signingSecret),
      updatedAt: new Date(now),
    };
  }

  async deleteSubscription(organizationId: string, subscriptionId: string): Promise<boolean> {
    const result = await this.database
      .prepare("DELETE FROM customer_webhook_subscriptions WHERE organization_id = ? AND id = ?")
      .bind(organizationId, subscriptionId)
      .run();
    return changedRows(result) === 1;
  }

  async createDelivery(input: CreateWebhookDeliveryInput): Promise<WebhookDelivery> {
    const subscription = await this.database
      .prepare(
        `SELECT id FROM customer_webhook_subscriptions
          WHERE organization_id = ? AND id = ?
          LIMIT 1`,
      )
      .bind(input.organizationId, input.subscriptionId)
      .first<{ id: string }>();
    if (subscription === null) {
      throw new WebhookRepositoryError("NOT_FOUND", "The webhook subscription was not found.");
    }

    const id = this.#idFactory("whd");
    const createdAt = input.createdAt.toISOString();
    const payload: StoredDeliveryPayload = {
      event: storedEvent(input.event),
      status: "pending",
      failureHistory: [],
    };
    await this.database
      .prepare(
        `INSERT INTO customer_webhook_deliveries
           (id, organization_id, subscription_id, event_external_id, event_type, payload_json,
            state, attempts, available_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)
         ON CONFLICT (organization_id, subscription_id, event_external_id) DO NOTHING`,
      )
      .bind(
        id,
        input.organizationId,
        input.subscriptionId,
        input.event.id,
        input.event.type,
        JSON.stringify(payload),
        createdAt,
        createdAt,
        createdAt,
      )
      .run();

    const row = await this.database
      .prepare(
        `SELECT * FROM customer_webhook_deliveries
          WHERE organization_id = ? AND subscription_id = ? AND event_external_id = ?
          LIMIT 1`,
      )
      .bind(input.organizationId, input.subscriptionId, input.event.id)
      .first<DeliveryRow>();
    if (row === null) {
      throw new WebhookRepositoryError("CONFLICT", "The webhook delivery could not be created.");
    }
    return this.#delivery(row);
  }

  async claimDueDelivery(now: Date): Promise<WebhookDelivery | null> {
    const nowValue = now.toISOString();
    const candidate = await this.database
      .prepare(
        `SELECT * FROM customer_webhook_deliveries
          WHERE (state IN ('pending', 'retry') AND available_at <= ?)
             OR (state = 'claimed' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?)
          ORDER BY available_at ASC, created_at ASC, id ASC
          LIMIT 1`,
      )
      .bind(nowValue, nowValue)
      .first<DeliveryRow>();
    if (candidate === null) return null;

    const owner = this.#leaseOwner;
    const token = this.#claimTokenFactory();
    const leaseExpiresAt = new Date(now.getTime() + this.#leaseMilliseconds).toISOString();
    const payload = { ...parsePayload(candidate.payload_json), status: "delivering" as const };
    const result = await this.database
      .prepare(
        `UPDATE customer_webhook_deliveries
            SET state = 'claimed', claim_owner = ?, claim_token = ?, lease_expires_at = ?,
                payload_json = ?, updated_at = ?
          WHERE id = ? AND organization_id = ?
            AND ((state IN ('pending', 'retry') AND available_at <= ?)
              OR (state = 'claimed' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?))`,
      )
      .bind(
        owner,
        token,
        leaseExpiresAt,
        JSON.stringify(payload),
        nowValue,
        candidate.id,
        candidate.organization_id,
        nowValue,
        nowValue,
      )
      .run();
    if (changedRows(result) !== 1) return null;

    this.#claims.set(candidate.id, {
      organizationId: candidate.organization_id,
      owner,
      token,
    });
    return this.#delivery({
      ...candidate,
      state: "claimed",
      claim_owner: owner,
      claim_token: token,
      lease_expires_at: leaseExpiresAt,
      payload_json: JSON.stringify(payload),
      updated_at: nowValue,
    });
  }

  async #applyAttempt(
    deliveryId: string,
    result: DeliveryAttemptResult,
    status: WebhookDeliveryStatus,
  ): Promise<WebhookDelivery | null> {
    const claim = this.#claims.get(deliveryId);
    if (claim === undefined) return null;
    const row = await this.database
      .prepare(
        `SELECT * FROM customer_webhook_deliveries
          WHERE id = ? AND organization_id = ? AND state = 'claimed'
            AND claim_owner = ? AND claim_token = ?
          LIMIT 1`,
      )
      .bind(deliveryId, claim.organizationId, claim.owner, claim.token)
      .first<DeliveryRow>();
    if (row === null) {
      this.#claims.delete(deliveryId);
      return null;
    }

    const attemptedAt = result.attemptedAt.toISOString();
    const nextAttemptAt = result.nextAttemptAt?.toISOString() ?? attemptedAt;
    const completedAt = status === "retrying" ? null : attemptedAt;
    const payload = payloadForAttempt(row, result, status);
    const state = physicalState(status);
    const update = await this.database
      .prepare(
        `UPDATE customer_webhook_deliveries
            SET state = ?, attempts = ?, available_at = ?, claim_owner = NULL,
                claim_token = NULL, lease_expires_at = NULL, response_status = ?,
                last_error = ?, delivered_at = ?, payload_json = ?, updated_at = ?
          WHERE id = ? AND organization_id = ? AND state = 'claimed'
            AND claim_owner = ? AND claim_token = ? AND lease_expires_at > ?`,
      )
      .bind(
        state,
        Math.max(row.attempts, result.attemptCount),
        nextAttemptAt,
        result.responseStatus,
        result.error,
        completedAt,
        JSON.stringify(payload),
        attemptedAt,
        deliveryId,
        claim.organizationId,
        claim.owner,
        claim.token,
        attemptedAt,
      )
      .run();
    this.#claims.delete(deliveryId);
    if (changedRows(update) !== 1) return null;
    return this.#delivery({
      ...row,
      state,
      attempts: Math.max(row.attempts, result.attemptCount),
      available_at: nextAttemptAt,
      claim_owner: null,
      claim_token: null,
      lease_expires_at: null,
      response_status: result.responseStatus,
      last_error: result.error,
      delivered_at: completedAt,
      payload_json: JSON.stringify(payload),
      updated_at: attemptedAt,
    });
  }

  async markDeliverySucceeded(
    deliveryId: string,
    result: DeliveryAttemptResult,
  ): Promise<WebhookDelivery | null> {
    return this.#applyAttempt(deliveryId, result, "succeeded");
  }

  async markDeliveryRetry(
    deliveryId: string,
    result: DeliveryAttemptResult,
  ): Promise<WebhookDelivery | null> {
    return this.#applyAttempt(deliveryId, result, "retrying");
  }

  async markDeliveryFailed(
    deliveryId: string,
    result: DeliveryAttemptResult,
  ): Promise<WebhookDelivery | null> {
    return this.#applyAttempt(
      deliveryId,
      result,
      result.retryable === true ? "dead_letter" : "failed",
    );
  }
}
