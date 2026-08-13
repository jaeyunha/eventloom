import { describe, expect, it, vi } from "vitest";
import { createMailpitOpenSendHandler, type MailTransport } from "./mailpit-opensend-bridge";

const payload = {
  from: "auth@sessionboard.namuh.co",
  to: ["developer@example.test"],
  subject: "Verify your account",
  html: "<p>Open the local verification link.</p>",
  text: "Open the local verification link.",
  headers: { "x-eventloom-purpose": "verification" },
  attachments: [
    {
      filename: "invite.ics",
      content: Buffer.from("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n").toString("base64"),
      content_type: "text/calendar; method=REQUEST; charset=utf-8",
      content_id: "calendar-invite",
    },
  ],
};

function request(body: unknown = payload, key = "mail-key-1", token = "local-development") {
  return new Request("http://127.0.0.1:8026/api/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "idempotency-key": key,
    },
    body: JSON.stringify(body),
  });
}

describe("Mailpit OpenSend bridge", () => {
  it("captures HTML, text, headers, and calendar attachments", async () => {
    const sendMail = vi.fn<MailTransport["sendMail"]>(async () => ({ messageId: "mailpit-1" }));
    const handler = createMailpitOpenSendHandler({ transport: { sendMail } });

    const response = await handler(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: "mailpit-1" });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0]?.[0]).toMatchObject({
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      headers: payload.headers,
      attachments: [
        {
          filename: "invite.ics",
          contentType: "text/calendar; method=REQUEST; charset=utf-8",
          cid: "calendar-invite",
        },
      ],
    });
    expect(sendMail.mock.calls[0]?.[0].attachments?.[0]?.content.toString()).toContain(
      "BEGIN:VCALENDAR",
    );
  });

  it("replays identical idempotent requests and rejects conflicting payloads", async () => {
    const sendMail = vi.fn<MailTransport["sendMail"]>(async () => ({ messageId: "mailpit-2" }));
    const handler = createMailpitOpenSendHandler({ transport: { sendMail } });

    const first = await handler(request());
    const replay = await handler(request());
    const conflict = await handler(request({ ...payload, subject: "Changed" }));

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(conflict.status).toBe(409);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it("fails closed for bad authentication and malformed requests", async () => {
    const sendMail = vi.fn<MailTransport["sendMail"]>(async () => ({ messageId: "unused" }));
    const handler = createMailpitOpenSendHandler({ transport: { sendMail } });

    expect((await handler(request(payload, "mail-key-1", "wrong"))).status).toBe(401);
    expect((await handler(request({ ...payload, to: [] }))).status).toBe(422);
    expect(
      (
        await handler(
          new Request("http://127.0.0.1:8026/api/emails", {
            method: "POST",
            headers: { authorization: "Bearer local-development" },
            body: JSON.stringify(payload),
          }),
        )
      ).status,
    ).toBe(400);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("reports transport failures without exposing message content", async () => {
    const sendMail = vi.fn<MailTransport["sendMail"]>(async () => {
      throw new Error("provider included private message content");
    });
    const handler = createMailpitOpenSendHandler({ transport: { sendMail } });

    const response = await handler(request());
    const text = await response.text();

    expect(response.status).toBe(503);
    expect(text).not.toContain("private message content");
    expect(text).not.toContain(payload.to[0]);
  });

  it("serves a health endpoint", async () => {
    const handler = createMailpitOpenSendHandler({
      transport: { sendMail: async () => ({ messageId: "unused" }) },
    });
    const response = await handler(new Request("http://127.0.0.1:8026/health"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "ok" });
  });
});
