import { describe, expect, it, vi } from "vitest";
import { type RawBodyReadError, readBoundedRawBody, verifyAirtableContentMac } from "./mac";
import {
  type AirtableWebhookNotificationInsert,
  type AirtableWebhookNotificationStore,
  handleAirtableWebhook,
} from "./webhook";

const encoder = new TextEncoder();
const secret = encoder.encode("airtable webhook secret");

async function contentMac(body: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, body));
  return `hmac-sha256=${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function request(body: Uint8Array, mac: string | null): Request {
  const headers = new Headers({ "content-length": String(body.byteLength) });
  if (mac !== null) headers.set("x-airtable-content-mac", mac);
  return new Request("https://api.example.test/airtable/webhook", {
    method: "POST",
    headers,
    body,
  });
}

function handlerOptions(
  insertNotification: AirtableWebhookNotificationStore["insertNotification"],
) {
  return {
    registration: {
      id: "registration-1",
      organizationId: "organization-1",
      connectionId: "connection-1",
      macSecret: secret,
    },
    notifications: { insertNotification },
    now: () => new Date("2026-08-13T12:34:56.789Z"),
    createId: () => "notification-1",
  };
}

describe("readBoundedRawBody", () => {
  it("reads the exact streamed bytes", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([0, 1]));
        controller.enqueue(new Uint8Array([2, 255]));
        controller.close();
      },
    });
    const result = await readBoundedRawBody(
      new Request("https://example.test", {
        method: "POST",
        headers: { "content-length": "4" },
        body: stream,
        duplex: "half",
      } as RequestInit),
      4,
    );

    expect(Array.from(result)).toEqual([0, 1, 2, 255]);
  });

  it("rejects a body beyond the configured bound", async () => {
    await expect(
      readBoundedRawBody(request(encoder.encode("12345"), null), 4),
    ).rejects.toMatchObject({
      code: "body_too_large",
    } satisfies Partial<RawBodyReadError>);
  });

  it("rejects malformed and mismatched content lengths", async () => {
    const malformed = new Request("https://example.test", {
      method: "POST",
      headers: { "content-length": "1x" },
      body: "x",
    });
    const mismatched = new Request("https://example.test", {
      method: "POST",
      headers: { "content-length": "2" },
      body: "x",
    });

    await expect(readBoundedRawBody(malformed)).rejects.toMatchObject({
      code: "malformed_content_length",
    });
    await expect(readBoundedRawBody(mismatched)).rejects.toMatchObject({
      code: "body_length_mismatch",
    });
  });
});

describe("verifyAirtableContentMac", () => {
  it("accepts only the exact hmac-sha256 MAC", async () => {
    const body = encoder.encode('{"changed":true}');
    const mac = await contentMac(body);

    await expect(verifyAirtableContentMac(body, mac, secret)).resolves.toBe(true);
    await expect(
      verifyAirtableContentMac(encoder.encode('{"changed":false}'), mac, secret),
    ).resolves.toBe(false);
    await expect(verifyAirtableContentMac(body, null, secret)).resolves.toBe(false);
    await expect(verifyAirtableContentMac(body, "hmac-sha256=xyz", secret)).resolves.toBe(false);
  });
});

describe("handleAirtableWebhook", () => {
  it("durably records a verified notification and returns an empty 204", async () => {
    const body = encoder.encode('{"base":{"id":"app123"}}');
    const insertNotification = vi.fn(
      async (_notification: AirtableWebhookNotificationInsert) => "inserted" as const,
    );

    const response = await handleAirtableWebhook(
      request(body, await contentMac(body)),
      handlerOptions(insertNotification),
    );

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(insertNotification).toHaveBeenCalledWith({
      id: "notification-1",
      organizationId: "organization-1",
      connectionId: "connection-1",
      registrationId: "registration-1",
      providerNotificationId: null,
      rawBodyHash: "bab12fe635fad179a677aada5b6e48b089308d96a2e4c2589f9c15c562b6faa7",
      timeBucket: "2026-08-13T12:34:00.000Z",
      rawBody: '{"base":{"id":"app123"}}',
      contentMac: await contentMac(body),
      status: "received",
      receivedAt: "2026-08-13T12:34:56.789Z",
    });
  });

  it("acknowledges a duplicate durable receipt with the same empty 204", async () => {
    const body = encoder.encode("{}");
    const insertNotification = vi.fn(async () => "duplicate" as const);

    const response = await handleAirtableWebhook(
      request(body, await contentMac(body)),
      handlerOptions(insertNotification),
    );

    expect(response.status).toBe(204);
    expect((await response.arrayBuffer()).byteLength).toBe(0);
    expect(insertNotification).toHaveBeenCalledOnce();
  });

  it("rejects missing, malformed, invalid, and oversized receipts without inserting", async () => {
    const body = encoder.encode("{}");
    const insertNotification = vi.fn(async () => "inserted" as const);
    const options = handlerOptions(insertNotification);

    const responses = await Promise.all([
      handleAirtableWebhook(request(body, null), options),
      handleAirtableWebhook(request(body, "not-a-mac"), options),
      handleAirtableWebhook(request(body, await contentMac(encoder.encode("different"))), options),
      handleAirtableWebhook(request(body, await contentMac(body)), { ...options, maxBodyBytes: 1 }),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([401, 401, 401, 413]);
    expect(insertNotification).not.toHaveBeenCalled();
  });

  it("rejects signed malformed JSON without inserting", async () => {
    const body = encoder.encode("{");
    const insertNotification = vi.fn(async () => "inserted" as const);

    const response = await handleAirtableWebhook(
      request(body, await contentMac(body)),
      handlerOptions(insertNotification),
    );

    expect(response.status).toBe(400);
    expect(insertNotification).not.toHaveBeenCalled();
  });
});
