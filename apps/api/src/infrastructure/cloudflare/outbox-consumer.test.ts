import { describe, expect, it, vi } from "vitest";
import type { CloudflareOutboxInvitationTransient } from "./bindings";
import {
  consumeOutboxQueue,
  InMemoryOutboxJobRepository,
  type OutboxConsumerBindings,
  OutboxDeliveryError,
  type OutboxDeliveryStatusRecorder,
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
      from: "auth@sessionboard.namuh.co",
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

function invitationTransient(
  setupUrl = "https://example.test/admin/organizations/tenant-1/members/setup?token=setup-token",
): CloudflareOutboxInvitationTransient {
  const invitationId = "invitation-1";
  const recipient = "recipient@example.com";
  return {
    kind: "member_invitation",
    invitationId,
    recipient,
    message: {
      from: "auth@sessionboard.namuh.co",
      to: [recipient],
      subject: "You are invited to Eventloom as Owner",
      html: `<p>Set up access: ${setupUrl}</p>`,
      text: `Set up access: ${setupUrl}`,
      idempotencyKey: `member-invitation:${invitationId}`,
    },
  };
}

function invitationJob(overrides: Partial<OutboxJob> = {}): OutboxJob {
  return job({
    deduplicationKey: "member-invitation:invitation-1",
    payload: {
      kind: "member_invitation",
      invitationId: "invitation-1",
      recipient: "recipient@example.com",
      expiresAt: "2026-08-10T12:00:00.000Z",
    },
    ...overrides,
  });
}

async function run(
  queueMessage: OutboxQueueMessage,
  repository: InMemoryOutboxJobRepository,
  adapters: NonNullable<NonNullable<Parameters<typeof consumeOutboxQueue>[3]>["adapters"]>,
  env: OutboxConsumerBindings = bindings(),
  statusRecorder?: OutboxDeliveryStatusRecorder,
) {
  await consumeOutboxQueue(
    { messages: [queueMessage] } as unknown as MessageBatch<unknown>,
    env,
    undefined,
    {
      repository,
      adapters,
      now: () => NOW,
      ...(statusRecorder === undefined ? {} : { statusRecorder }),
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
  it("persists provider completion through the communication status boundary", async () => {
    const repository = new InMemoryOutboxJobRepository([
      job({
        payload: {
          effect: "send_communication",
          sendId: "send-1",
          recipientId: "participant-1",
          eventId: "event-1",
          payload: job().payload,
        },
      }),
    ]);
    const send = vi.fn(async () => ({ providerMessageId: "provider-1" }));
    const statusRecorder = { recordCommunicationStatus: vi.fn(async () => undefined) };
    const queueMessage = message(queueBody());

    await run(queueMessage, repository, { communications: send }, bindings(), statusRecorder);

    expect(statusRecorder.recordCommunicationStatus).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      target: {
        kind: "communication",
        eventId: "event-1",
        sendId: "send-1",
        recipientId: "participant-1",
      },
      status: "delivered",
      providerMessageId: "provider-1",
      occurredAt: NOW.toISOString(),
    });
    expect(repository.get("job-1")?.state).toBe("delivered");
  });
  it("records reminder provider acceptance before acknowledging the generic outbox job", async () => {
    const reminder = {
      from: "speakers@sessionboard.namuh.co",
      to: ["recipient@example.com"],
      subject: "Reminder",
      html: "<p>Reminder</p>",
      text: "Reminder",
      idempotencyKey: "reminder-idem-1",
    };
    const repository = new InMemoryOutboxJobRepository([
      job({
        payload: {
          effect: "send_reminder",
          runId: "run-1",
          dispatchId: "dispatch-1",
          eventId: "event-1",
          payload: reminder,
        },
      }),
    ]);
    const send = vi.fn(async (payload: unknown) => {
      expect(payload).toEqual({ ...reminder, senderPurpose: "speakers" });
      return { providerMessageId: "provider-reminder-1" };
    });
    const statusRecorder = {
      recordCommunicationStatus: vi.fn(async () => {
        expect(repository.get("job-1")?.state).toBe("processing");
      }),
    };
    const queueMessage = message(queueBody());

    await run(queueMessage, repository, { communications: send }, bindings(), statusRecorder);

    expect(statusRecorder.recordCommunicationStatus).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      target: {
        kind: "reminder",
        eventId: "event-1",
        runId: "run-1",
        dispatchId: "dispatch-1",
      },
      status: "provider_accepted",
      providerMessageId: "provider-reminder-1",
      occurredAt: NOW.toISOString(),
    });
    expect(queueMessage.acked).toBe(true);
    expect(queueMessage.retries).toEqual([]);
    expect(repository.get("job-1")?.state).toBe("delivered");
  });
  it("records terminal reminder rejection as failed", async () => {
    const repository = new InMemoryOutboxJobRepository([
      job({
        payload: {
          effect: "send_reminder",
          runId: "run-1",
          dispatchId: "dispatch-1",
          eventId: "event-1",
          payload: job().payload,
        },
      }),
    ]);
    const statusRecorder = { recordCommunicationStatus: vi.fn(async () => undefined) };
    const send = vi.fn(async () => {
      throw new OutboxDeliveryError("REQUEST_REJECTED", "provider rejected the reminder", {
        retryable: false,
      });
    });
    const queueMessage = message(queueBody());

    await run(queueMessage, repository, { communications: send }, bindings(), statusRecorder);

    expect(statusRecorder.recordCommunicationStatus).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      target: {
        kind: "reminder",
        eventId: "event-1",
        runId: "run-1",
        dispatchId: "dispatch-1",
      },
      status: "failed",
      reason: "REQUEST_REJECTED",
      occurredAt: NOW.toISOString(),
    });
    expect(queueMessage.acked).toBe(true);
    expect(queueMessage.retries).toEqual([]);
    expect(repository.get("job-1")?.state).toBe("failed");
  });
  it("keeps retryable reminder failures nonterminal", async () => {
    const repository = new InMemoryOutboxJobRepository([
      job({
        payload: {
          effect: "send_reminder",
          runId: "run-1",
          dispatchId: "dispatch-1",
          eventId: "event-1",
          payload: job().payload,
        },
      }),
    ]);
    const statusRecorder = { recordCommunicationStatus: vi.fn(async () => undefined) };
    const send = vi.fn(async () => {
      throw new OutboxDeliveryError("PROVIDER_UNAVAILABLE", "provider unavailable", {
        retryable: true,
      });
    });
    const queueMessage = message(queueBody());

    await run(queueMessage, repository, { communications: send }, bindings(), statusRecorder);

    expect(statusRecorder.recordCommunicationStatus).not.toHaveBeenCalled();
    expect(queueMessage.acked).toBe(false);
    expect(queueMessage.retries).toEqual([1]);
    expect(repository.get("job-1")?.state).toBe("queued");
  });
  it("persists CRM outreach completion with its command correlation", async () => {
    const repository = new InMemoryOutboxJobRepository([
      job({
        payload: {
          effect: "send_crm_outreach",
          outreachId: "outreach-1",
          contactId: "contact-1",
          eventId: "event-1",
          idempotencyKey: "outreach-key-1",
          payload: job().payload,
        },
      }),
    ]);
    const statusRecorder = { recordCommunicationStatus: vi.fn(async () => undefined) };
    const queueMessage = message(queueBody());

    await run(
      queueMessage,
      repository,
      { communications: vi.fn(async () => ({ providerMessageId: "provider-2" })) },
      bindings(),
      statusRecorder,
    );

    expect(statusRecorder.recordCommunicationStatus).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      target: {
        kind: "crm_outreach",
        eventId: "event-1",
        outreachId: "outreach-1",
        contactId: "contact-1",
        idempotencyKey: "outreach-key-1",
      },
      status: "delivered",
      providerMessageId: "provider-2",
      occurredAt: NOW.toISOString(),
    });
  });
  it("dispatches a member invitation from the transient queue payload", async () => {
    const setupUrl =
      "https://example.test/admin/organizations/tenant-1/members/setup?token=setup-token";
    const repository = new InMemoryOutboxJobRepository([invitationJob()]);
    const send = vi.fn(async () => undefined);
    const queueMessage = message({ ...queueBody(), transient: invitationTransient(setupUrl) });

    await run(queueMessage, repository, { communications: send });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining(setupUrl),
      }),
      expect.objectContaining({ idempotencyKey: "member-invitation:invitation-1" }),
    );
    expect(queueMessage.acked).toBe(true);
    expect(repository.get("job-1")?.state).toBe("delivered");
  });

  it("retries a transient member invitation through the queue message", async () => {
    const repository = new InMemoryOutboxJobRepository([invitationJob()]);
    const send = vi.fn(async () => {
      throw new OutboxDeliveryError("PROVIDER_UNAVAILABLE", "provider unavailable", {
        retryable: true,
      });
    });
    const queueMessage = message({ ...queueBody(), transient: invitationTransient() });

    await run(queueMessage, repository, { communications: send });

    expect(send).toHaveBeenCalledOnce();
    expect(queueMessage.acked).toBe(false);
    expect(queueMessage.retries).toEqual([1]);
    expect(repository.get("job-1")?.state).toBe("queued");
  });
  it("keeps the member setup URL only in transient queue data, not persisted metadata", () => {
    const setupUrl =
      "https://example.test/admin/organizations/tenant-1/members/setup?token=raw-setup-token";
    const persisted = JSON.stringify(invitationJob().payload);
    const transient = JSON.stringify(invitationTransient(setupUrl));

    expect(persisted).toContain("member_invitation");
    expect(persisted).not.toContain(setupUrl);
    expect(persisted).not.toContain("raw-setup-token");
    expect(transient).toContain(setupUrl);
  });
  it("fails closed when transient invitation metadata does not match the claimed job", async () => {
    const repository = new InMemoryOutboxJobRepository([invitationJob()]);
    const send = vi.fn(async () => undefined);
    const transient = invitationTransient();
    const queueMessage = message({
      ...queueBody(),
      transient: {
        ...transient,
        recipient: "attacker@example.com",
        message: { ...transient.message, to: ["attacker@example.com"] },
      },
    });

    await run(queueMessage, repository, { communications: send });

    expect(send).not.toHaveBeenCalled();
    expect(queueMessage.acked).toBe(true);
    expect(queueMessage.retries).toEqual([]);
    expect(repository.get("job-1")?.state).toBe("failed");
  });
  it("uses deployment-provided senders and keeps a configured OpenSend HTTP 500 retryable", async () => {
    const repository = new InMemoryOutboxJobRepository([
      job({
        payload: {
          from: "login@conference.example",
          senderPurpose: "auth",
          to: ["recipient@example.com"],
          subject: "Welcome",
          html: "<p>Welcome</p>",
          text: "Welcome",
          idempotencyKey: "idem-job-1",
        },
      }),
    ]);
    const queueMessage = message(queueBody());
    const request = vi.fn(async () => new Response("provider secret", { status: 500 }));
    vi.stubGlobal("fetch", request);

    try {
      await run(
        queueMessage,
        repository,
        {},
        bindings({
          OPENSEND_API_KEY: "not-logged",
          AUTH_FROM_EMAIL: "login@conference.example",
          SPEAKERS_FROM_EMAIL: "program@conference.example",
          CALENDAR_FROM_EMAIL: "schedule@conference.example",
          CALENDAR_UID_DOMAIN: "calendar.conference.example",
        }),
      );
    } finally {
      vi.unstubAllGlobals();
    }

    expect(queueMessage.acked).toBe(false);
    expect(queueMessage.retries).toEqual([1]);
    expect(repository.get("job-1")?.state).toBe("queued");
    expect(request).toHaveBeenCalledOnce();
  });

  it("delivers a rotated non-calendar sender snapshot with the current purpose envelope", async () => {
    const persistedFrom = "program@legacy.example";
    const persisted = {
      from: persistedFrom,
      senderPurpose: "speakers" as const,
      to: ["recipient@example.com"],
      subject: "Program update",
      html: "<p>Program update</p>",
      text: "Program update",
      idempotencyKey: "rotated-sender-job-1",
    };
    const repository = new InMemoryOutboxJobRepository([job({ payload: persisted })]);
    const queueMessage = message(queueBody());
    const requests: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input, init) => {
        requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return Response.json({ id: "message-rotated-1" });
      }),
    );

    try {
      await run(
        queueMessage,
        repository,
        {},
        bindings({
          OPENSEND_API_KEY: "opensend-key",
          OPENSEND_API_URL: "https://mail.example.test",
          AUTH_FROM_EMAIL: "login@conference.example",
          SPEAKERS_FROM_EMAIL: "program@current.example",
          CALENDAR_FROM_EMAIL: "schedule@conference.example",
        }),
      );
    } finally {
      vi.unstubAllGlobals();
    }

    expect(queueMessage.acked).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.from).toBe("program@current.example");
    const stored = repository.get("job-1")?.payload;
    expect(stored).toMatchObject({ from: persistedFrom });
  });

  it("infers a legacy reminder purpose from its unambiguous machine envelope after rotation", async () => {
    const persistedFrom = "program@legacy.example";
    const repository = new InMemoryOutboxJobRepository([
      job({
        payload: {
          effect: "send_reminder",
          runId: "run-legacy",
          dispatchId: "dispatch-legacy",
          eventId: "event-1",
          payload: {
            from: persistedFrom,
            to: ["recipient@example.com"],
            subject: "Legacy reminder",
            html: "<p>Legacy reminder</p>",
            text: "Legacy reminder",
            idempotencyKey: "legacy-reminder-job-1",
          },
        },
      }),
    ]);
    const queueMessage = message(queueBody());
    const requests: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input, init) => {
        requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return Response.json({ id: "legacy-reminder-message" });
      }),
    );

    try {
      await run(
        queueMessage,
        repository,
        {},
        bindings({
          OPENSEND_API_KEY: "opensend-key",
          AUTH_FROM_EMAIL: "login@conference.example",
          SPEAKERS_FROM_EMAIL: "program@current.example",
          CALENDAR_FROM_EMAIL: "schedule@conference.example",
        }),
      );
    } finally {
      vi.unstubAllGlobals();
    }

    expect(queueMessage.acked).toBe(true);
    expect(requests[0]?.from).toBe("program@current.example");
    expect(repository.get("job-1")?.payload).toMatchObject({
      payload: { from: persistedFrom },
    });
  });

  it("fails closed for a legacy payload without trustworthy purpose metadata", async () => {
    const repository = new InMemoryOutboxJobRepository([
      job({
        payload: {
          from: "program@conference.example",
          to: ["recipient@example.com"],
          subject: "Legacy update",
          html: "<p>Legacy update</p>",
          text: "Legacy update",
          idempotencyKey: "unresolved-sender-job-1",
        },
      }),
    ]);
    const queueMessage = message(queueBody());
    const request = vi.fn(async () => Response.json({ id: "must-not-send" }));
    vi.stubGlobal("fetch", request);

    try {
      await run(
        queueMessage,
        repository,
        {},
        bindings({
          OPENSEND_API_KEY: "opensend-key",
          AUTH_FROM_EMAIL: "login@conference.example",
          SPEAKERS_FROM_EMAIL: "program@conference.example",
          CALENDAR_FROM_EMAIL: "schedule@conference.example",
        }),
      );
    } finally {
      vi.unstubAllGlobals();
    }

    expect(request).not.toHaveBeenCalled();
    expect(queueMessage.acked).toBe(true);
    expect(repository.get("job-1")?.state).toBe("failed");
  });

  it("delivers a legacy persisted calendar identity with the current configured envelope sender", async () => {
    const legacyOrganizer = "calendar@legacy.example";
    const repository = new InMemoryOutboxJobRepository([
      job({
        topic: "calendar",
        payload: {
          uid: "tenant.event.session@calendar.legacy.example",
          sequence: 3,
          method: "UPDATE",
          organizer: legacyOrganizer,
          attendees: ["speaker@example.com"],
          summary: "Legacy session",
          location: "Room 1",
          startsAt: "2026-08-10T09:00:00.000Z",
          endsAt: "2026-08-10T10:00:00.000Z",
          timeZone: "UTC",
          idempotencyKey: "legacy-calendar-update-3",
        },
      }),
    ]);
    const queueMessage = message(queueBody("calendar"));
    const requests: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input, init) => {
        requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return Response.json({ id: "message-1" });
      }),
    );

    try {
      await run(
        queueMessage,
        repository,
        {},
        bindings({
          OPENSEND_API_KEY: "opensend-key",
          OPENSEND_API_URL: "https://mail.example.test",
          AUTH_FROM_EMAIL: "login@conference.example",
          SPEAKERS_FROM_EMAIL: "program@conference.example",
          CALENDAR_FROM_EMAIL: "schedule@conference.example",
          CALENDAR_UID_DOMAIN: "calendar.conference.example",
        }),
      );
    } finally {
      vi.unstubAllGlobals();
    }

    expect(queueMessage.acked).toBe(true);
    expect(repository.get("job-1")?.state).toBe("delivered");
    expect(requests).toHaveLength(1);
    expect(requests[0]?.from).toBe("schedule@conference.example");
    const attachments = requests[0]?.attachments as Array<{ content?: string }>;
    const ics = Buffer.from(attachments[0]?.content ?? "", "base64").toString("utf8");
    expect(ics).toContain("UID:tenant.event.session@calendar.legacy.example");
    expect(ics).toContain(`ORGANIZER:mailto:${legacyOrganizer}`);
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
  it("does not persist a terminal status while a delivery remains retryable", async () => {
    const repository = new InMemoryOutboxJobRepository([
      job({
        payload: {
          effect: "send_communication",
          sendId: "send-1",
          recipientId: "participant-1",
          eventId: "event-1",
          payload: job().payload,
        },
      }),
    ]);
    const statusRecorder = { recordCommunicationStatus: vi.fn(async () => undefined) };
    const send = vi.fn(async () => {
      throw new OutboxDeliveryError("PROVIDER_UNAVAILABLE", "provider unavailable", {
        retryable: true,
      });
    });
    const queueMessage = message(queueBody());

    await run(queueMessage, repository, { communications: send }, bindings(), statusRecorder);

    expect(statusRecorder.recordCommunicationStatus).not.toHaveBeenCalled();
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
  it("persists terminal delivery failure through the status boundary", async () => {
    const repository = new InMemoryOutboxJobRepository([
      job({
        payload: {
          effect: "send_communication",
          sendId: "send-1",
          recipientId: "participant-1",
          eventId: "event-1",
          payload: job().payload,
        },
      }),
    ]);
    const statusRecorder = { recordCommunicationStatus: vi.fn(async () => undefined) };
    const send = vi.fn(async () => {
      throw new OutboxDeliveryError("VALIDATION_ERROR", "invalid payload", { retryable: false });
    });
    const queueMessage = message(queueBody());

    await run(queueMessage, repository, { communications: send }, bindings(), statusRecorder);

    expect(statusRecorder.recordCommunicationStatus).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      target: {
        kind: "communication",
        eventId: "event-1",
        sendId: "send-1",
        recipientId: "participant-1",
      },
      status: "failed",
      reason: "VALIDATION_ERROR",
      occurredAt: NOW.toISOString(),
    });
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
    const repository = new InMemoryOutboxJobRepository([
      job({
        payload: {
          from: "auth@sessionboard.namuh.co",
          senderPurpose: "auth",
          to: ["recipient@example.com"],
          subject: "Welcome",
          html: "<p>Welcome</p>",
          text: "Welcome",
          idempotencyKey: "idem-job-1",
        },
      }),
    ]);
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
    const repository = new InMemoryOutboxJobRepository([
      job({
        attemptCount: 2,
        payload: {
          from: "auth@sessionboard.namuh.co",
          senderPurpose: "auth",
          to: ["recipient@example.com"],
          subject: "Welcome",
          html: "<p>Welcome</p>",
          text: "Welcome",
          idempotencyKey: "idem-job-1",
        },
      }),
    ]);
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
