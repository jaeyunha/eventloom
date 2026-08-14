import { describe, expect, it } from "vitest";
import { D1WebhookRepository, type D1WebhookRepositoryOptions } from "./d1-webhook-repository";

const NOW = new Date("2026-08-13T12:00:00.000Z");

type StoredRow = Record<string, unknown>;

class FakeD1 {
  readonly subscriptions = new Map<string, StoredRow>();
  readonly deliveries = new Map<string, StoredRow>();

  encryptedSecret(subscriptionId: string): unknown {
    return this.subscriptions.get(subscriptionId)?.signing_secret_ciphertext;
  }

  deliveryClaim(deliveryId: string): StoredRow | undefined {
    const row = this.deliveries.get(deliveryId);
    if (row === undefined) return undefined;
    return {
      state: row.state,
      claim_owner: row.claim_owner,
      claim_token: row.claim_token,
      lease_expires_at: row.lease_expires_at,
    };
  }

  database(): D1Database {
    const store = this;
    return {
      prepare(query: string) {
        const sql = query.replaceAll(/\s+/g, " ").trim();
        let values: unknown[] = [];
        const statement = {
          bind(...next: unknown[]) {
            values = next;
            return statement;
          },
          async first<T>() {
            let row: StoredRow | undefined;
            if (sql.startsWith("SELECT * FROM webhook_subscriptions")) {
              const [organizationId, id] = values;
              const candidate = store.subscriptions.get(String(id));
              if (candidate?.organization_id === organizationId) row = candidate;
            } else if (sql.startsWith("SELECT id FROM webhook_subscriptions")) {
              const [organizationId, id] = values;
              const candidate = store.subscriptions.get(String(id));
              if (candidate?.organization_id === organizationId) row = { id };
            } else if (
              sql.includes(
                "WHERE organization_id = ? AND subscription_id = ? AND event_external_id = ?",
              )
            ) {
              const [organizationId, subscriptionId, eventExternalId] = values;
              row = [...store.deliveries.values()].find(
                (candidate) =>
                  candidate.organization_id === organizationId &&
                  candidate.subscription_id === subscriptionId &&
                  candidate.event_external_id === eventExternalId,
              );
            } else if (sql.includes("ORDER BY available_at ASC, created_at ASC, id ASC")) {
              const now = String(values[0]);
              row = [...store.deliveries.values()]
                .filter(
                  (candidate) =>
                    ((candidate.state === "pending" || candidate.state === "retry") &&
                      String(candidate.available_at) <= now) ||
                    (candidate.state === "claimed" &&
                      candidate.lease_expires_at !== null &&
                      String(candidate.lease_expires_at) <= now),
                )
                .sort(
                  (left, right) =>
                    String(left.available_at).localeCompare(String(right.available_at)) ||
                    String(left.created_at).localeCompare(String(right.created_at)) ||
                    String(left.id).localeCompare(String(right.id)),
                )[0];
            } else if (sql.includes("AND claim_owner = ? AND claim_token = ?")) {
              const [id, organizationId, owner, token] = values;
              const candidate = store.deliveries.get(String(id));
              if (
                candidate !== undefined &&
                candidate.organization_id === organizationId &&
                candidate.state === "claimed" &&
                candidate.claim_owner === owner &&
                candidate.claim_token === token
              ) {
                row = candidate;
              }
            } else {
              throw new Error(`Unexpected first query: ${sql}`);
            }
            return (row as T | undefined) ?? null;
          },
          async all<T>() {
            if (!sql.startsWith("SELECT * FROM webhook_subscriptions")) {
              throw new Error(`Unexpected all query: ${sql}`);
            }
            const organizationId = values[0];
            const results = [...store.subscriptions.values()]
              .filter((row) => row.organization_id === organizationId)
              .sort(
                (left, right) =>
                  String(left.created_at).localeCompare(String(right.created_at)) ||
                  String(left.id).localeCompare(String(right.id)),
              );
            return { success: true, results: results as T[], meta: {} };
          },
          async run<T>() {
            let changes = 0;
            if (sql.startsWith("INSERT INTO webhook_subscriptions")) {
              const [
                id,
                organizationId,
                eventId,
                endpointUrl,
                eventsJson,
                active,
                encryptedSecret,
                secretLastFour,
                createdAt,
                updatedAt,
              ] = values;
              if (!store.subscriptions.has(String(id))) {
                store.subscriptions.set(String(id), {
                  id,
                  organization_id: organizationId,
                  event_id: eventId,
                  endpoint_url: endpointUrl,
                  events_json: eventsJson,
                  active,
                  signing_secret_ciphertext: encryptedSecret,
                  signing_secret_last_four: secretLastFour,
                  created_at: createdAt,
                  updated_at: updatedAt,
                });
                changes = 1;
              }
            } else if (sql.startsWith("UPDATE webhook_subscriptions")) {
              const [
                eventId,
                endpointUrl,
                eventsJson,
                active,
                encryptedSecret,
                secretLastFour,
                updatedAt,
                organizationId,
                id,
              ] = values;
              const row = store.subscriptions.get(String(id));
              if (row !== undefined && row.organization_id === organizationId) {
                Object.assign(row, {
                  event_id: eventId,
                  endpoint_url: endpointUrl,
                  events_json: eventsJson,
                  active,
                  signing_secret_ciphertext: encryptedSecret,
                  signing_secret_last_four: secretLastFour,
                  updated_at: updatedAt,
                });
                changes = 1;
              }
            } else if (sql.startsWith("DELETE FROM webhook_subscriptions")) {
              const [organizationId, id] = values;
              const row = store.subscriptions.get(String(id));
              if (row?.organization_id === organizationId) {
                store.subscriptions.delete(String(id));
                changes = 1;
              }
            } else if (sql.startsWith("INSERT INTO customer_webhook_deliveries")) {
              const [
                id,
                organizationId,
                subscriptionId,
                eventExternalId,
                eventType,
                payload,
                availableAt,
                createdAt,
                updatedAt,
              ] = values;
              const duplicate = [...store.deliveries.values()].some(
                (row) =>
                  row.organization_id === organizationId &&
                  row.subscription_id === subscriptionId &&
                  row.event_external_id === eventExternalId,
              );
              if (!duplicate) {
                store.deliveries.set(String(id), {
                  id,
                  organization_id: organizationId,
                  subscription_id: subscriptionId,
                  event_external_id: eventExternalId,
                  event_type: eventType,
                  payload_json: payload,
                  state: "pending",
                  attempts: 0,
                  available_at: availableAt,
                  claim_owner: null,
                  claim_token: null,
                  lease_expires_at: null,
                  response_status: null,
                  last_error: null,
                  delivered_at: null,
                  created_at: createdAt,
                  updated_at: updatedAt,
                });
                changes = 1;
              }
            } else if (sql.includes("SET state = 'claimed'")) {
              const [owner, token, leaseExpiresAt, payload, updatedAt, id, organizationId, now] =
                values;
              const row = store.deliveries.get(String(id));
              const claimable =
                row !== undefined &&
                row.organization_id === organizationId &&
                (((row.state === "pending" || row.state === "retry") &&
                  String(row.available_at) <= String(now)) ||
                  (row.state === "claimed" &&
                    row.lease_expires_at !== null &&
                    String(row.lease_expires_at) <= String(now)));
              if (row !== undefined && claimable) {
                Object.assign(row, {
                  state: "claimed",
                  claim_owner: owner,
                  claim_token: token,
                  lease_expires_at: leaseExpiresAt,
                  payload_json: payload,
                  updated_at: updatedAt,
                });
                changes = 1;
              }
            } else if (sql.startsWith("UPDATE customer_webhook_deliveries")) {
              const [
                state,
                attempts,
                availableAt,
                responseStatus,
                error,
                deliveredAt,
                payload,
                updatedAt,
                id,
                organizationId,
                owner,
                token,
                attemptedAt,
              ] = values;
              const row = store.deliveries.get(String(id));
              if (
                row !== undefined &&
                row.organization_id === organizationId &&
                row.state === "claimed" &&
                row.claim_owner === owner &&
                row.claim_token === token &&
                String(row.lease_expires_at) > String(attemptedAt)
              ) {
                Object.assign(row, {
                  state,
                  attempts,
                  available_at: availableAt,
                  claim_owner: null,
                  claim_token: null,
                  lease_expires_at: null,
                  response_status: responseStatus,
                  last_error: error,
                  delivered_at: deliveredAt,
                  payload_json: payload,
                  updated_at: updatedAt,
                });
                changes = 1;
              }
            } else {
              throw new Error(`Unexpected run query: ${sql}`);
            }
            return { success: true, results: [] as T[], meta: { changes } };
          },
        };
        return statement as unknown as D1PreparedStatement;
      },
    } as unknown as D1Database;
  }
}

function fixture() {
  const store = new FakeD1();
  let subscriptionSequence = 0;
  let deliverySequence = 0;
  let claimSequence = 0;
  const clock = { now: () => new Date(NOW) };
  const options = (owner: string): D1WebhookRepositoryOptions => ({
    secretCipher: {
      async encrypt(secret) {
        return `encrypted:${secret}`;
      },
      async decrypt(ciphertext) {
        return ciphertext.replace(/^encrypted:/, "");
      },
    },
    clock,
    idFactory(prefix) {
      return prefix === "whs" ? `whs-${++subscriptionSequence}` : `whd-${++deliverySequence}`;
    },
    leaseMilliseconds: 1_000,
    leaseOwner: owner,
    claimTokenFactory: () => `claim-${++claimSequence}`,
  });
  return {
    store,
    repository: new D1WebhookRepository(store.database(), options("worker-a")),
    anotherRepository: new D1WebhookRepository(store.database(), options("worker-b")),
  };
}

async function subscription(repository: D1WebhookRepository, organizationId = "org-1") {
  return repository.createSubscription({
    organizationId,
    endpointUrl: "https://hooks.example.test/sessionboard",
    events: ["session.updated"],
    signingSecret: "secret-1234",
  });
}

function deliveryInput(subscriptionId: string, organizationId = "org-1") {
  return {
    organizationId,
    subscriptionId,
    createdAt: new Date(NOW),
    event: {
      id: "event-external-1",
      organizationId,
      type: "session.updated",
      occurredAt: new Date("2026-08-13T11:59:00.000Z"),
      eventId: "conference-1",
      resource: { type: "session", id: "session-1" },
      data: { title: "Deterministic delivery" },
    },
  };
}

describe("D1WebhookRepository", () => {
  it("persists encrypted subscriptions and scopes reads, updates, and deletes by tenant", async () => {
    const { repository, store } = fixture();
    const created = await subscription(repository);

    expect(created).toMatchObject({
      id: "whs-1",
      organizationId: "org-1",
      endpointUrl: "https://hooks.example.test/sessionboard",
      events: ["session.updated"],
      active: true,
      signingSecret: "secret-1234",
      signingSecretLastFour: "1234",
    });
    expect(store.encryptedSecret(created.id)).toBe("encrypted:secret-1234");
    expect(await repository.getSubscription("org-2", created.id)).toBeNull();
    expect(await repository.updateSubscription("org-2", created.id, { active: false })).toBeNull();
    expect(await repository.deleteSubscription("org-2", created.id)).toBe(false);

    const updated = await repository.updateSubscription("org-1", created.id, {
      endpointUrl: "https://hooks.example.test/updated",
      events: ["*"],
      signingSecret: "rotated-5678",
      active: false,
    });
    expect(updated).toMatchObject({
      endpointUrl: "https://hooks.example.test/updated",
      events: ["*"],
      signingSecret: "rotated-5678",
      signingSecretLastFour: "5678",
      active: false,
    });
    expect(await repository.listSubscriptions("org-2")).toEqual([]);
    expect(await repository.listSubscriptions("org-1")).toHaveLength(1);
    expect(await repository.deleteSubscription("org-1", created.id)).toBe(true);
  });

  it("uses the deployed webhook schema and preserves event scope", async () => {
    const { repository } = fixture();

    expect(await repository.listSubscriptions("org-1")).toEqual([]);
    const created = await repository.createSubscription({
      organizationId: "org-1",
      endpointUrl: "https://hooks.example.test/scoped",
      events: ["session.updated"],
      eventId: "conference-1",
    });

    expect(created.eventId).toBe("conference-1");
    await expect(repository.getSubscription("org-1", created.id)).resolves.toMatchObject({
      eventId: "conference-1",
    });
  });

  it("atomically returns one delivery for concurrent duplicate creates and enforces tenant scope", async () => {
    const { repository } = fixture();
    const createdSubscription = await subscription(repository);
    const input = deliveryInput(createdSubscription.id);

    const [first, duplicate] = await Promise.all([
      repository.createDelivery(input),
      repository.createDelivery(input),
    ]);

    expect(duplicate).toEqual(first);
    expect(first).toMatchObject({
      id: "whd-1",
      organizationId: "org-1",
      subscriptionId: createdSubscription.id,
      status: "pending",
      attemptCount: 0,
      failureHistory: [],
      event: input.event,
    });
    await expect(
      repository.createDelivery(deliveryInput(createdSubscription.id, "org-2")),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  });

  it("uses lease and claim-token CAS for retry, reclaim, and completion", async () => {
    const { repository, anotherRepository, store } = fixture();
    const createdSubscription = await subscription(repository);
    const pending = await repository.createDelivery(deliveryInput(createdSubscription.id));

    const firstClaim = await repository.claimDueDelivery(NOW);
    expect(firstClaim).toMatchObject({ id: pending.id, status: "delivering", attemptCount: 0 });
    expect(await anotherRepository.claimDueDelivery(NOW)).toBeNull();

    const retryAt = new Date("2026-08-13T12:00:05.000Z");
    const retried = await repository.markDeliveryRetry(pending.id, {
      attemptCount: 1,
      attemptedAt: new Date("2026-08-13T12:00:00.500Z"),
      responseStatus: 503,
      error: "temporary failure",
      responseBody: "unavailable",
      retryable: true,
      nextAttemptAt: retryAt,
    });
    expect(retried).toMatchObject({
      status: "retrying",
      attemptCount: 1,
      nextAttemptAt: retryAt,
      lastResponseStatus: 503,
      lastError: "temporary failure",
      lastResponseBody: "unavailable",
      failureHistory: [
        expect.objectContaining({ attempt: 1, error: "temporary failure", retryable: true }),
      ],
    });
    expect(await anotherRepository.claimDueDelivery(new Date(retryAt.getTime() - 1))).toBeNull();

    const secondClaim = await repository.claimDueDelivery(retryAt);
    expect(secondClaim).toMatchObject({ status: "delivering", attemptCount: 1 });

    const reclaimedAt = new Date(retryAt.getTime() + 1_001);
    const reclaimed = await anotherRepository.claimDueDelivery(reclaimedAt);
    expect(reclaimed).toMatchObject({ id: pending.id, status: "delivering", attemptCount: 1 });
    await expect(
      repository.markDeliverySucceeded(pending.id, {
        attemptCount: 2,
        attemptedAt: reclaimedAt,
        responseStatus: 204,
        error: null,
      }),
    ).resolves.toBeNull();

    const completedAt = new Date(reclaimedAt.getTime() + 100);
    const completed = await anotherRepository.markDeliverySucceeded(pending.id, {
      attemptCount: 2,
      attemptedAt: completedAt,
      responseStatus: 204,
      error: null,
      responseBody: "",
      retryable: false,
    });
    expect(completed).toMatchObject({
      status: "succeeded",
      attemptCount: 2,
      nextAttemptAt: null,
      completedAt,
      lastResponseStatus: 204,
      lastError: null,
    });
    expect(
      await anotherRepository.claimDueDelivery(new Date(completedAt.getTime() + 10_000)),
    ).toBeNull();
    expect(store.deliveryClaim(pending.id)).toEqual({
      state: "delivered",
      claim_owner: null,
      claim_token: null,
      lease_expires_at: null,
    });
  });

  it("persists terminal failed and dead-letter transitions with failure history", async () => {
    const terminal = fixture();
    const terminalSubscription = await subscription(terminal.repository);
    const failedDelivery = await terminal.repository.createDelivery(
      deliveryInput(terminalSubscription.id),
    );
    await terminal.repository.claimDueDelivery(NOW);
    const failed = await terminal.repository.markDeliveryFailed(failedDelivery.id, {
      attemptCount: 1,
      attemptedAt: NOW,
      responseStatus: 400,
      error: "bad request",
      responseBody: "invalid payload",
      retryable: false,
    });
    expect(failed).toMatchObject({
      status: "failed",
      completedAt: NOW,
      failureHistory: [expect.objectContaining({ retryable: false, responseStatus: 400 })],
    });

    const exhausted = fixture();
    const exhaustedSubscription = await subscription(exhausted.repository);
    const deadDelivery = await exhausted.repository.createDelivery(
      deliveryInput(exhaustedSubscription.id),
    );
    await exhausted.repository.claimDueDelivery(NOW);
    const dead = await exhausted.repository.markDeliveryFailed(deadDelivery.id, {
      attemptCount: 5,
      attemptedAt: NOW,
      responseStatus: 503,
      error: "exhausted",
      retryable: true,
    });
    expect(dead).toMatchObject({
      status: "dead_letter",
      attemptCount: 5,
      completedAt: NOW,
      failureHistory: [expect.objectContaining({ retryable: true, attempt: 5 })],
    });
  });
});
