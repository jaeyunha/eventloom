/**
 * Serialize JSON with lexicographically sorted object keys so retries sign
 * identical bytes regardless of insertion order.
 */
export function canonicalJson(value: unknown): string {
  const ancestors = new Set<object>();

  const encode = (current: unknown, inArray = false): string | undefined => {
    if (current === null) return "null";
    if (current === undefined || typeof current === "function" || typeof current === "symbol") {
      return inArray ? "null" : undefined;
    }
    if (typeof current === "string" || typeof current === "boolean") return JSON.stringify(current);
    if (typeof current === "number") {
      if (!Number.isFinite(current)) {
        throw new TypeError("Webhook payload contains a non-finite number.");
      }
      return Object.is(current, -0) ? "0" : JSON.stringify(current);
    }
    if (typeof current === "bigint") throw new TypeError("Webhook payload contains a bigint.");
    if (current instanceof Date) {
      if (Number.isNaN(current.getTime())) {
        throw new TypeError("Webhook payload contains an invalid date.");
      }
      return JSON.stringify(current.toISOString());
    }
    if (typeof current !== "object") {
      throw new TypeError("Webhook payload contains an unsupported value.");
    }
    if (ancestors.has(current)) {
      throw new TypeError("Webhook payload contains a circular reference.");
    }

    ancestors.add(current);
    try {
      if (Array.isArray(current)) {
        return `[${current.map((item) => encode(item, true) ?? "null").join(",")}]`;
      }
      const fields: string[] = [];
      for (const key of Object.keys(current).sort()) {
        const encoded = encode((current as Record<string, unknown>)[key]);
        if (encoded !== undefined) fields.push(`${JSON.stringify(key)}:${encoded}`);
      }
      return `{${fields.join(",")}}`;
    } finally {
      ancestors.delete(current);
    }
  };

  return encode(value, true) ?? "null";
}

export const WEBHOOK_ID_HEADER = "webhook-id";
export const WEBHOOK_TIMESTAMP_HEADER = "webhook-timestamp";
export const WEBHOOK_SIGNATURE_HEADER = "webhook-signature";

export interface WebhookSignatureOptions {
  deliveryId?: string;
  timestamp?: Date | string | number;
}

export interface WebhookSignatureHeaders {
  "webhook-id": string;
  "webhook-timestamp": string;
  "webhook-signature": string;
}

type HeaderSource =
  | string
  | Headers
  | Readonly<Record<string, string | undefined>>
  | Partial<WebhookSignatureHeaders>;

function payloadText(payload: unknown): string {
  return typeof payload === "string" ? payload : canonicalJson(payload);
}

function timestampText(timestamp: Date | string | number): string {
  if (timestamp instanceof Date) return Math.floor(timestamp.getTime() / 1000).toString();
  if (typeof timestamp === "number") {
    if (!Number.isFinite(timestamp)) throw new TypeError("Webhook timestamp must be finite.");
    return Math.trunc(timestamp).toString();
  }
  if (!/^\d+$/.test(timestamp)) throw new TypeError("Webhook timestamp must be a Unix timestamp.");
  return timestamp;
}

function messageFor(payload: unknown, options: WebhookSignatureOptions): string {
  const body = payloadText(payload);
  if (options.deliveryId === undefined && options.timestamp === undefined) return body;
  if (options.deliveryId === undefined || options.timestamp === undefined) {
    throw new TypeError("A delivery id and timestamp must be supplied together.");
  }
  return `${options.deliveryId}.${timestampText(options.timestamp)}.${body}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array | null {
  try {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

function hexToBytes(value: string): Uint8Array | null {
  if (!/^(?:[0-9a-f]{2})+$/i.test(value)) return null;
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  if (!secret) throw new TypeError("A webhook signing secret is required.");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return new Uint8Array(signature);
}

/**
 * Sign a body using HMAC-SHA256. When delivery context is supplied, the signed
 * message is `${deliveryId}.${unixTimestamp}.${body}`, matching the headers
 * emitted by the delivery worker. Without context this signs the body itself.
 */
export async function signWebhookPayload(
  secret: string,
  payload: unknown,
  options: WebhookSignatureOptions = {},
): Promise<string> {
  return `v1,${bytesToBase64(await hmac(secret, messageFor(payload, options)))}`;
}

export async function createWebhookSignatureHeaders(
  secret: string,
  payload: unknown,
  input: { deliveryId: string; timestamp?: Date | string | number },
): Promise<WebhookSignatureHeaders> {
  const timestamp = timestampText(input.timestamp ?? Math.floor(Date.now() / 1000));
  const signature = await signWebhookPayload(secret, payload, {
    deliveryId: input.deliveryId,
    timestamp,
  });
  return {
    [WEBHOOK_ID_HEADER]: input.deliveryId,
    [WEBHOOK_TIMESTAMP_HEADER]: timestamp,
    [WEBHOOK_SIGNATURE_HEADER]: signature,
  };
}

function headerValue(source: HeaderSource, key: string): string | undefined {
  if (typeof source === "string") {
    return key === WEBHOOK_SIGNATURE_HEADER ? source : undefined;
  }
  if (source instanceof Headers) {
    return source.get(key) ?? source.get(key.toLowerCase()) ?? source.get(key.toUpperCase()) ?? undefined;
  }
  const record = source as Readonly<Record<string, string | undefined>>;
  return (
    record[key] ??
    record[key.toLowerCase()] ??
    record[key.toUpperCase()] ??
    Object.entries(record).find(([candidate]) => candidate.toLowerCase() === key.toLowerCase())?.[1]
  );
}

function signatureValues(value: string): Array<{ algorithm: "v1" | "sha256"; value: string }> {
  const values: Array<{ algorithm: "v1" | "sha256"; value: string }> = [];
  for (const part of value.split(/\s+/).filter(Boolean)) {
    if (part.startsWith("v1,")) values.push({ algorithm: "v1", value: part.slice(3) });
    else if (part.startsWith("sha256=")) values.push({ algorithm: "sha256", value: part.slice(7) });
    else if (part.startsWith("v1=")) values.push({ algorithm: "v1", value: part.slice(3) });
  }
  return values;
}

/**
 * Verify either a raw `v1,...`/`sha256=...` value or the three webhook
 * signature headers. Invalid input always returns false and never echoes a
 * secret or the presented signature.
 */
export async function verifyWebhookSignature(
  secret: string,
  payload: unknown,
  source: HeaderSource,
  options: WebhookSignatureOptions = {},
): Promise<boolean> {
  if (!secret) return false;
  const signature = headerValue(source, WEBHOOK_SIGNATURE_HEADER);
  if (!signature) return false;
  const deliveryId = headerValue(source, WEBHOOK_ID_HEADER) ?? options.deliveryId;
  const timestamp = headerValue(source, WEBHOOK_TIMESTAMP_HEADER) ?? options.timestamp;
  const context =
    deliveryId === undefined && timestamp === undefined
      ? {}
      : deliveryId !== undefined && timestamp !== undefined
        ? { deliveryId, timestamp }
        : null;
  if (context === null) return false;

  let expected: Uint8Array;
  try {
    expected = await hmac(secret, messageFor(payload, context));
  } catch {
    return false;
  }
  const values = signatureValues(signature);
  for (const candidate of values) {
    const presented =
      candidate.algorithm === "sha256"
        ? hexToBytes(candidate.value)
        : base64ToBytes(candidate.value);
    if (!presented || presented.length !== expected.length) continue;
    try {
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"],
      );
      if (
        await crypto.subtle.verify(
          "HMAC",
          key,
          presented,
          new TextEncoder().encode(messageFor(payload, context)),
        )
      ) {
        return true;
      }
    } catch {
      return false;
    }
  }
  return false;
}

