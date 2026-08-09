import { describe, expect, it, vi } from "vitest";
import {
  consumeOutboxQueue,
  InMemoryOutboxJobRepository,
  type OutboxConsumerBindings,
  OutboxDeliveryError,
  type OutboxJob,
  type OutboxQueueMessage,
} from "./outbox-consumer";

const NOW = new Date("2026-08-09T12:00:00.000Z");

function bindings(overrides: Record<string, unknown> = {}): OutboxConsumerBindings {
  return overrides as unknown as OutboxConsumerBindings;
}

function job(overrides: Partial<OutboxJob> = {}): OutboxJob {
  return {
    id: "job-1",
    tenantId: "tenant-1",
    topic: "communications",
    payload: {
      from: "auth@foreverbrowsing.com",
      to: ["recipient@example.com"],
      subject: "Welcome",
      html: "<p>Welcome</p>",
      text: "Welcome",
      idempotencyKey: "idem-job-1",
    },
    state: "pending",
    attemptCount: 0,
    availableAt: NOW,
    leaseExpiresAt: null,
    ...overrides,
  };
}

function message(
  body: unknown,
  attempts = 0,
): OutboxQueueMessage & {
  readonly acked: boolean;
  readonly retries: number[];
} {
  const state = { acked: false, retries: [] as number[] };
  return {
    body,
    attempts,
    get acked() {
      return state.acked;
    },
    get retries() {
      return state.retries;
    },
    ack() {
      state.acked = true;
    },
    retry(options = {}) {
      state.retries.push(options.delaySeconds ?? 0);
    },
  };
}

function queueBody(topic: OutboxJob["topic"] = "communications") {
  return {
    version: 1,
    jobId: "job-1",
    tenantId: "tenant-1",
    topic,
    enqueuedAt: NOW.toISOString(),
  };
}

async function run(
  queueMessage: OutboxQueueMessage,
  repository: InMemoryOutboxJobRepository,
  adapters: NonNullable<NonNullable<Parameters<typeof consumeOutboxQueue>[3]>["adapters"]>,
  env: OutboxConsumerBindings = bindings(),
) {
  await consumeOutboxQueue(
    { messages: [queueMessage] } as unknown as MessageBatch<unknown>,
    env,
    undefined,
    {
      repository,
      adapters,
      now: () => NOW,
      logger: {},
      baseRetryDelayMs: 1_000,
      maxRetryDelayMs: 10_000,
      maxAttempts: 3,
      leaseOwner: "test-worker",
    },
  );
}

describe("Cloudflare outbox consumer", () => {
  it("dispatches a successful side effect and acknowledges it", async () => {
    const repository = new InMemoryOutboxJobRepository([job()]);
    const send = vi.fn(async () => undefined);
    const queueMessage = message(queueBody());

    await run(queueMessage, repository, { communications: send });

    expect(send).toHaveBeenCalledOnce();
    expect(queueMessage.acked).toBe(true);
    expect(queueMessage.retries).toEqual([]);
    expect(repository.get("job-1")?.state).toBe("delivered");
  });
  it("keeps a configured OpenSend HTTP 500 retryable", async () => {
    const repository = new InMemoryOutboxJobRepository([job()]);
    const queueMessage = message(queueBody());
    const request = vi.fn(async () => new Response("provider secret", { status: 500 }));
    vi.stubGlobal("fetch", request);

    try {
      await run(queueMessage, repository, {}, bindings({ OPENSEND_API_KEY: "not-logged" }));
    } finally {
      vi.unstubAllGlobals();
    }

    expect(queueMessage.acked).toBe(false);
    expect(queueMessage.retries).toEqual([1]);
    expect(repository.get("job-1")?.state).toBe("queued");
    expect(request).toHaveBeenCalledOnce();
  });

  it("persists retryable failures and retries with bounded backoff", async () => {
    const repository = new InMemoryOutboxJobRepository([job()]);
    const send = vi.fn(async () => {
      throw new OutboxDeliveryError("PROVIDER_UNAVAILABLE", "provider unavailable", {
        retryable: true,
      });
    });
    const queueMessage = message(queueBody());

    await run(queueMessage, repository, { communications: send });

    expect(queueMessage.acked).toBe(false);
    expect(queueMessage.retries).toEqual([1]);
    expect(repository.get("job-1")?.state).toBe("queued");
  });

  it("records terminal failures and acknowledges without retrying", async () => {
    const repository = new InMemoryOutboxJobRepository([job()]);
    const send = vi.fn(async () => {
      throw new OutboxDeliveryError("VALIDATION_ERROR", "invalid payload", { retryable: false });
    });
    const queueMessage = message(queueBody());

    await run(queueMessage, repository, { communications: send });

    expect(queueMessage.acked).toBe(true);
    expect(queueMessage.retries).toEqual([]);
    expect(repository.get("job-1")?.state).toBe("failed");
  });

  it("acknowledges duplicate delivery without invoking the adapter", async () => {
    const repository = new InMemoryOutboxJobRepository([job({ state: "delivered" })]);
    const send = vi.fn(async () => undefined);
    const queueMessage = message(queueBody());

    await run(queueMessage, repository, { communications: send });

    expect(send).not.toHaveBeenCalled();
    expect(queueMessage.acked).toBe(true);
    expect(queueMessage.retries).toEqual([]);
  });

  it("retries malformed queue messages without exposing their body", async () => {
    const repository = new InMemoryOutboxJobRepository([job()]);
    const queueMessage = message({ version: 1, jobId: "job-1", secret: "do-not-log" });
    const logger = { error: vi.fn() };

    await consumeOutboxQueue(
      { messages: [queueMessage] } as unknown as MessageBatch<unknown>,
      bindings(),
      undefined,
      { repository, logger, now: () => NOW, leaseOwner: "test-worker" },
    );

    expect(queueMessage.acked).toBe(false);
    expect(queueMessage.retries).toEqual([1]);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain("do-not-log");
  });
  it("retains missing integration configuration for bounded DLQ replay", async () => {
    const repository = new InMemoryOutboxJobRepository([job()]);
    const queueMessage = message(queueBody());

    await run(queueMessage, repository, {});

    expect(queueMessage.acked).toBe(false);
    expect(queueMessage.retries).toEqual([1]);
    expect(repository.get("job-1")).toMatchObject({
      state: "queued",
      attemptCount: 1,
    });
  });
  it("moves missing integration configuration to the recoverable dead-letter state", async () => {
    const repository = new InMemoryOutboxJobRepository([job({ attemptCount: 2 })]);
    const queueMessage = message(queueBody());

    await run(queueMessage, repository, {});

    expect(queueMessage.acked).toBe(false);
    expect(queueMessage.retries).toEqual([1]);
    expect(repository.get("job-1")).toMatchObject({
      state: "dead-letter",
      attemptCount: 3,
    });
  });

  it.each(["accelevents", "file-scan"] as const)(
    "does not acknowledge disabled %s work",
    async (topic) => {
      const repository = new InMemoryOutboxJobRepository([job()]);
      const queueMessage = message({ ...queueBody(), topic });

      await run(queueMessage, repository, {});

      expect(queueMessage.acked).toBe(false);
      expect(queueMessage.retries).toEqual([1]);
      expect(repository.get("job-1")?.state).toBe("pending");
    },
  );
});
