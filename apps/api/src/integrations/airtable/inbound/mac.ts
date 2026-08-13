const AIRTABLE_MAC_PREFIX = "hmac-sha256=";
const SHA256_BYTE_LENGTH = 32;

export const DEFAULT_AIRTABLE_WEBHOOK_BODY_LIMIT = 1024 * 1024;

export class RawBodyReadError extends Error {
  constructor(
    readonly code: "body_too_large" | "malformed_content_length" | "body_length_mismatch",
  ) {
    super(code);
    this.name = "RawBodyReadError";
  }
}

export async function readBoundedRawBody(
  request: Request,
  maxBytes = DEFAULT_AIRTABLE_WEBHOOK_BODY_LIMIT,
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError("maxBytes must be a non-negative safe integer");
  }

  const contentLengthHeader = request.headers.get("content-length");
  let contentLength: number | undefined;
  if (contentLengthHeader !== null) {
    if (!/^(0|[1-9]\d*)$/.test(contentLengthHeader)) {
      throw new RawBodyReadError("malformed_content_length");
    }

    contentLength = Number(contentLengthHeader);
    if (!Number.isSafeInteger(contentLength)) {
      throw new RawBodyReadError("malformed_content_length");
    }
    if (contentLength > maxBytes) {
      throw new RawBodyReadError("body_too_large");
    }
  }

  if (request.body === null) {
    if (contentLength !== undefined && contentLength !== 0) {
      throw new RawBodyReadError("body_length_mismatch");
    }
    return new Uint8Array();
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength === 0) continue;

      totalLength += value.byteLength;
      if (totalLength > maxBytes) {
        await reader.cancel();
        throw new RawBodyReadError("body_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (contentLength !== undefined && totalLength !== contentLength) {
    throw new RawBodyReadError("body_length_mismatch");
  }

  const body = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export function decodeAirtableMacSecret(secretBase64: string): Uint8Array | null {
  if (secretBase64.length === 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(secretBase64)) {
    return null;
  }

  try {
    const binary = atob(secretBase64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.length === 0 ? null : bytes;
  } catch {
    return null;
  }
}

export async function verifyAirtableContentMac(
  rawBody: Uint8Array,
  contentMac: string | null,
  macSecret: Uint8Array,
): Promise<boolean> {
  const suppliedMac = parseContentMac(contentMac);
  if (suppliedMac === null || macSecret.byteLength === 0) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    macSecret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expectedMac = new Uint8Array(await crypto.subtle.sign("HMAC", key, rawBody));
  return constantTimeEqual(expectedMac, suppliedMac);
}

function parseContentMac(value: string | null): Uint8Array | null {
  if (value === null || !value.startsWith(AIRTABLE_MAC_PREFIX)) return null;

  const hex = value.slice(AIRTABLE_MAC_PREFIX.length);
  if (hex.length !== SHA256_BYTE_LENGTH * 2 || !/^[0-9a-fA-F]+$/.test(hex)) {
    return null;
  }

  const bytes = new Uint8Array(SHA256_BYTE_LENGTH);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.byteLength ^ right.byteLength;
  const length = Math.max(left.byteLength, right.byteLength);

  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}
