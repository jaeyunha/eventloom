import {
  DEFAULT_AIRTABLE_WEBHOOK_BODY_LIMIT,
  RawBodyReadError,
  readBoundedRawBody,
  verifyAirtableContentMac,
} from "./mac";

export interface AirtableWebhookRegistration {
  id: string;
  organizationId: string;
  connectionId: string;
  macSecret: Uint8Array;
}

export interface AirtableWebhookNotificationInsert {
  id: string;
  organizationId: string;
  connectionId: string;
  registrationId: string;
  providerNotificationId: string | null;
  rawBodyHash: string;
  timeBucket: string;
  rawBody: string;
  contentMac: string;
  status: "received";
  receivedAt: string;
}

export type AirtableWebhookNotificationInsertResult = "inserted" | "duplicate";

export interface AirtableWebhookNotificationStore {
  insertNotification(
    notification: AirtableWebhookNotificationInsert,
  ): Promise<AirtableWebhookNotificationInsertResult>;
}

export interface AirtableWebhookHandlerOptions {
  registration: AirtableWebhookRegistration;
  notifications: AirtableWebhookNotificationStore;
  maxBodyBytes?: number;
  now?: () => Date;
  createId?: () => string;
  wakeCursor?: (registration: AirtableWebhookRegistration) => Promise<void>;
}

const textDecoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });

export async function handleAirtableWebhook(
  request: Request,
  options: AirtableWebhookHandlerOptions,
): Promise<Response> {
  if (request.method !== "POST") return response(405);

  const contentMac = request.headers.get("x-airtable-content-mac");
  if (contentMac === null) return response(401);

  let rawBody: Uint8Array;
  try {
    rawBody = await readBoundedRawBody(
      request,
      options.maxBodyBytes ?? DEFAULT_AIRTABLE_WEBHOOK_BODY_LIMIT,
    );
  } catch (error) {
    if (error instanceof RawBodyReadError) {
      return response(error.code === "body_too_large" ? 413 : 400);
    }
    throw error;
  }

  if (!(await verifyAirtableContentMac(rawBody, contentMac, options.registration.macSecret))) {
    return response(401);
  }

  let rawBodyText: string;
  let body: unknown;
  try {
    rawBodyText = textDecoder.decode(rawBody);
    body = JSON.parse(rawBodyText) as unknown;
  } catch {
    return response(400);
  }

  if (!isObject(body)) return response(400);

  const providerNotificationId = readProviderNotificationId(request);
  const receivedAt = (options.now ?? (() => new Date()))();
  if (!Number.isFinite(receivedAt.getTime())) return response(500);

  const result = await options.notifications.insertNotification({
    id: (options.createId ?? (() => crypto.randomUUID()))(),
    organizationId: options.registration.organizationId,
    connectionId: options.registration.connectionId,
    registrationId: options.registration.id,
    providerNotificationId,
    rawBodyHash: await sha256Hex(rawBody),
    timeBucket: toMinuteBucket(receivedAt),
    rawBody: rawBodyText,
    contentMac,
    status: "received",
    receivedAt: receivedAt.toISOString(),
  });

  if (result !== "inserted" && result !== "duplicate") {
    throw new Error(`Unexpected notification insert result: ${String(result)}`);
  }
  await options.wakeCursor?.(options.registration);
  return response(204);
}

function readProviderNotificationId(request: Request): string | null {
  const headerId = request.headers.get("x-airtable-notification-id")?.trim();
  if (headerId) return headerId;

  return null;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toMinuteBucket(date: Date): string {
  return `${date.toISOString().slice(0, 16)}:00.000Z`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function response(status: number): Response {
  return new Response(null, { status });
}
