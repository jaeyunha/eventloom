import type { CalendarInvitationPayload } from "@eventloom/contracts";
import { describe, expect, it } from "vitest";
import { createCalendarInvitation } from "../calendar";
import {
  createCalendarOpenSendMessage,
  createOpenSendOutboxJob,
  enqueueOpenSendOutboxJob,
  InMemoryOpenSendOutboxRepository,
  OpenSendClient,
  OpenSendError,
  type OpenSendMessage,
  OpenSendOutboxProcessor,
  type OpenSendOutboxQueue,
  type OpenSendSender,
} from "./index";

const senderAddresses = {
  auth: "auth@sessionboard.namuh.co",
  speakers: "speakers@sessionboard.namuh.co",
  calendar: "calendar@sessionboard.namuh.co",
} as const;

const message: OpenSendMessage = {
  from: senderAddresses.speakers,
  to: ["speaker@example.com"],
  subject: "Your session is accepted",
  html: "<p>Congratulations</p>",
  text: "Congratulations",
  idempotencyKey: "email-job-0001",
};
function calendarFixture(overrides: Partial<CalendarInvitationPayload> = {}): {
  payload: CalendarInvitationPayload;
  invitation: ReturnType<typeof createCalendarInvitation>;
  message: OpenSendMessage;
} {
  const payload: CalendarInvitationPayload = {
    method: "UPDATE",
    uid: "tenant-event-session@calendar.sessionboard.namuh.co",
    sequence: 1,
    timeZone: "America/Los_Angeles",
    startsAt: "2026-11-01T10:30:00.000Z",
    endsAt: "2026-11-01T11:30:00.000Z",
    organizer: "calendar@sessionboard.namuh.co",
    attendees: ["speaker@example.com"],
    summary: "A <safer> session",
    location: "Room & Board",
    idempotencyKey: "calendar-update-0001",
    ...overrides,
  };
  const invitation = createCalendarInvitation(payload, {
    generatedAt: "2026-08-08T12:00:00.000Z",
  });
  return {
    payload,
    invitation,
    message: createCalendarOpenSendMessage(payload, invitation),
  };
}

describe("OpenSendClient", () => {
  it("uses the hosted send contract and forwards idempotency and calendar attachments", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const fetch: typeof globalThis.fetch = async (input, init = {}) => {
      requests.push({ url: String(input), init });
      return Response.json({ id: "email-provider-1" }, { status: 201 });
    };
    const client = new OpenSendClient({
      sendingApiKey: "os_sending_secret",
      baseUrl: "https://mail.example.test/",
      senderAddresses,
      fetch,
    });

    const result = await client.send({
      ...message,
      from: "calendar@sessionboard.namuh.co",
      headers: { "X-Eventloom-Calendar-Action": "REQUEST" },
      attachments: [
        {
          filename: "session.ics",
          content: "QkVHSU46VkNBTEVOREFS",
          content_type: "text/calendar; charset=utf-8; method=REQUEST",
        },
      ],
    });

    expect(result).toEqual({
      providerMessageId: "email-provider-1",
      idempotencyKey: "email-job-0001",
    });
    expect(requests).toHaveLength(1);
    const request = requests[0];
    if (request === undefined) {
      throw new Error("Expected an OpenSend request.");
    }
    expect(request.url).toBe("https://mail.example.test/api/emails");
    const headers = new Headers(request.init.headers);
    expect(headers.get("authorization")).toBe("Bearer os_sending_secret");
    expect(headers.get("idempotency-key")).toBe("email-job-0001");
    expect(JSON.parse(String(request.init.body))).toMatchObject({
      from: "calendar@sessionboard.namuh.co",
      to: ["speaker@example.com"],
      attachments: [{ filename: "session.ics" }],
    });
  });

  it("classifies retryable provider failures without exposing response bodies", async () => {
    const fetch: typeof globalThis.fetch = async () =>
      new Response(JSON.stringify({ secret: "must-not-leak" }), {
        status: 429,
        headers: { "retry-after": "3" },
      });
    const client = new OpenSendClient({ sendingApiKey: "os_key", senderAddresses, fetch });

    const rejection = client.send(message);
    await expect(rejection).rejects.toMatchObject({
      code: "RATE_LIMITED",
      retryable: true,
      status: 429,
      retryAfterMs: 3_000,
    });
    await expect(rejection).rejects.not.toThrow(/must-not-leak/);
  });

  it("rejects invalid payloads before transport and malformed success responses safely", async () => {
    let requestCount = 0;
    const fetch: typeof globalThis.fetch = async () => {
      requestCount += 1;
      return Response.json({ accepted: true });
    };
    const client = new OpenSendClient({ sendingApiKey: "os_key", senderAddresses, fetch });

    await expect(
      client.send({ ...message, from: "attacker@example.com" } as unknown as OpenSendMessage),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", retryable: false });
    expect(requestCount).toBe(0);

    await expect(client.send(message)).rejects.toMatchObject({
      code: "MALFORMED_RESPONSE",
      retryable: true,
    });
  });
});

describe("createCalendarOpenSendMessage", () => {
  it("delivers UPDATE as the committed REQUEST calendar attachment without provider OAuth", () => {
    const { invitation, message: email } = calendarFixture({
      sequence: 3,
      idempotencyKey: "calendar-update-0003",
    });

    expect(email).toMatchObject({
      from: "calendar@sessionboard.namuh.co",
      to: ["speaker@example.com"],
      subject: "Updated invitation: A <safer> session",
      idempotencyKey: "calendar-update-0003",
      headers: {
        "Content-Class": "urn:content-classes:calendarmessage",
        "X-Eventloom-Calendar-Action": "UPDATE",
        "X-Eventloom-Calendar-Uid": "tenant-event-session@calendar.sessionboard.namuh.co",
      },
      attachments: [
        {
          content_type: "text/calendar; charset=utf-8; method=REQUEST",
        },
      ],
    });
    expect(email.html).toContain("A &lt;safer&gt; session");
    expect(atob(email.attachments?.[0]?.content ?? "")).toBe(invitation.ics);
    expect(invitation.ics).toContain("SEQUENCE:3");
  });

  it("rejects calendar bytes or MIME metadata from a different lifecycle snapshot", () => {
    const current = calendarFixture();
    const stale = calendarFixture({
      sequence: 2,
      idempotencyKey: "calendar-update-0002",
    });

    expect(() => createCalendarOpenSendMessage(current.payload, stale.invitation)).toThrow(
      "do not match",
    );
    expect(() =>
      createCalendarOpenSendMessage(current.payload, {
        ...current.invitation,
        contentType: "text/calendar; charset=utf-8; method=CANCEL",
      }),
    ).toThrow("do not match");
  });

  it("labels cancellation consistently in the envelope, attachment, and body", () => {
    const {
      payload,
      invitation,
      message: email,
    } = calendarFixture({
      method: "CANCEL",
      sequence: 2,
      idempotencyKey: "calendar-cancel-0002",
    });

    expect(email).toMatchObject({
      subject: "Cancelled: A <safer> session",
      idempotencyKey: payload.idempotencyKey,
      headers: {
        "Content-Class": "urn:content-classes:calendarmessage",
        "X-Eventloom-Calendar-Action": "CANCEL",
        "X-Eventloom-Calendar-Uid": payload.uid,
      },
      attachments: [
        {
          content_type: "text/calendar; charset=utf-8; method=CANCEL",
        },
      ],
    });
    expect(email.text).toContain("remove this event");
    expect(email.html).toContain("remove this event");
    expect(email.text).not.toContain("add or update");
    expect(email.html).not.toContain("add or update");
    expect(atob(email.attachments?.[0]?.content ?? "")).toBe(invitation.ics);
    expect(invitation.ics).toContain("METHOD:CANCEL");
    expect(invitation.ics).toContain("SEQUENCE:2");
    expect(invitation.ics).toContain("STATUS:CANCELLED");
  });
});

describe("OpenSendOutboxProcessor", () => {
  it("persists a job before scheduling its initial queue delivery", async () => {
    const repository = new InMemoryOpenSendOutboxRepository();
    const queue = new RecordingQueue();

    const job = await enqueueOpenSendOutboxJob(
      {
        id: "outbox-enqueue",
        message,
        createdAt: "2026-08-08T12:00:00.000Z",
      },
      repository,
      queue,
    );

    expect(job.status).toBe("queued");
    expect(await repository.find(job.id)).toEqual(job);
    expect(queue.enqueued).toEqual([{ jobId: job.id, delayMs: 0 }]);
  });
  it("provider-accepts once and preserves an observable receipt for duplicate queue delivery", async () => {
    const repository = new InMemoryOpenSendOutboxRepository();
    await repository.insert(
      createOpenSendOutboxJob({
        id: "outbox-1",
        message,
        createdAt: "2026-08-08T12:00:00.000Z",
      }),
    );
    let sends = 0;
    const sender: OpenSendSender = {
      send: async (payload) => {
        sends += 1;
        return { providerMessageId: "provider-1", idempotencyKey: payload.idempotencyKey };
      },
    };
    const processor = new OpenSendOutboxProcessor({
      repository,
      queue: new RecordingQueue(),
      sender,
      now: () => new Date("2026-08-08T12:01:00.000Z"),
    });

    await expect(processor.process("outbox-1")).resolves.toEqual({
      outcome: "provider_accepted",
      providerMessageId: "provider-1",
    });
    await expect(processor.process("outbox-1")).resolves.toEqual({ outcome: "skipped" });

    expect(sends).toBe(1);
    expect(await repository.find("outbox-1")).toMatchObject({
      status: "provider_accepted",
      attemptCount: 1,
      providerMessageId: "provider-1",
      lastError: null,
      attempts: [{ outcome: "provider_accepted", providerMessageId: "provider-1" }],
    });
  });

  it("honors Retry-After, keeps the idempotency key, and succeeds on retry", async () => {
    let now = new Date("2026-08-08T12:00:00.000Z");
    const repository = new InMemoryOpenSendOutboxRepository();
    await repository.insert(
      createOpenSendOutboxJob({ id: "outbox-2", message, createdAt: now.toISOString() }),
    );
    const seenKeys: string[] = [];
    const sender: OpenSendSender = {
      send: async (payload) => {
        seenKeys.push(payload.idempotencyKey);
        if (seenKeys.length === 1) {
          throw new OpenSendError("RATE_LIMITED", "OpenSend rate limited the request.", {
            retryable: true,
            status: 429,
            retryAfterMs: 5_000,
          });
        }
        return { providerMessageId: "provider-2", idempotencyKey: payload.idempotencyKey };
      },
    };
    const queue = new RecordingQueue();
    const processor = new OpenSendOutboxProcessor({
      repository,
      queue,
      sender,
      now: () => now,
      baseRetryDelayMs: 1_000,
    });

    await expect(processor.process("outbox-2")).resolves.toEqual({
      outcome: "retry_scheduled",
      delayMs: 5_000,
    });
    expect(queue.enqueued).toEqual([{ jobId: "outbox-2", delayMs: 5_000 }]);
    await expect(processor.process("outbox-2")).resolves.toEqual({ outcome: "skipped" });

    now = new Date("2026-08-08T12:00:05.000Z");
    await expect(processor.process("outbox-2")).resolves.toMatchObject({
      outcome: "provider_accepted",
    });
    expect(seenKeys).toEqual(["email-job-0001", "email-job-0001"]);
    expect(await repository.find("outbox-2")).toMatchObject({
      status: "provider_accepted",
      attemptCount: 2,
      attempts: [{ outcome: "retry_scheduled" }, { outcome: "provider_accepted" }],
    });
  });

  it("preserves terminal failure details and reclaims expired processing leases", async () => {
    let now = new Date("2026-08-08T12:00:00.000Z");
    const repository = new InMemoryOpenSendOutboxRepository();
    await repository.insert(
      createOpenSendOutboxJob({
        id: "outbox-3",
        message,
        createdAt: now.toISOString(),
        maxAttempts: 1,
      }),
    );
    const claimed = await repository.claim("outbox-3", now, new Date("2026-08-08T12:00:30.000Z"));
    expect(claimed?.status).toBe("processing");

    const sender: OpenSendSender = {
      send: async () => {
        throw new OpenSendError("VALIDATION_ERROR", "OpenSend rejected the message.", {
          retryable: false,
          status: 422,
        });
      },
    };
    const processor = new OpenSendOutboxProcessor({
      repository,
      queue: new RecordingQueue(),
      sender,
      now: () => now,
    });

    await expect(processor.process("outbox-3")).resolves.toEqual({ outcome: "skipped" });
    now = new Date("2026-08-08T12:00:31.000Z");
    await expect(processor.process("outbox-3")).resolves.toEqual({
      outcome: "failed",
      errorCode: "VALIDATION_ERROR",
    });
    expect(await repository.find("outbox-3")).toMatchObject({
      status: "failed",
      attemptCount: 1,
      lastError: "OpenSend rejected the message.",
      attempts: [
        {
          outcome: "failed",
          errorCode: "VALIDATION_ERROR",
          responseStatus: 422,
          retryable: false,
        },
      ],
    });
  });
});

class RecordingQueue implements OpenSendOutboxQueue {
  readonly enqueued: Array<{ jobId: string; delayMs: number }> = [];

  async enqueue(jobId: string, delayMs: number): Promise<void> {
    this.enqueued.push({ jobId, delayMs });
  }
}
