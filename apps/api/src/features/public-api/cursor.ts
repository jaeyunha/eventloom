import { z } from "zod";

export const cursorDirectionSchema = z.enum(["asc", "desc"]);
export type CursorDirection = z.infer<typeof cursorDirectionSchema>;

const cursorValueSchema = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);

export const cursorPayloadSchema = z
  .object({
    version: z.literal(1),
    organizationId: z.string().trim().min(1).max(200),
    resource: z.string().trim().min(1).max(100),
    sort: z.string().trim().min(1).max(100),
    direction: cursorDirectionSchema,
    values: z.array(cursorValueSchema).min(1).max(8),
    id: z.string().trim().min(1).max(200),
    filterHash: z.string().trim().min(1).max(512).optional(),
  })
  .strict();

export type CursorValue = z.infer<typeof cursorValueSchema>;
export type CursorPayload = z.infer<typeof cursorPayloadSchema>;

export class CursorError extends Error {
  constructor(message = "The cursor is invalid or expired.") {
    super(message);
    this.name = "CursorError";
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new CursorError();
  }
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  const remainder = padded.length % 4;
  const normalized = remainder === 0 ? padded : `${padded}${"=".repeat(4 - remainder)}`;
  try {
    const binary = atob(normalized);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new CursorError();
  }
}

function normalizeCursorInput(
  input: CursorPayload | Omit<CursorPayload, "version">,
): CursorPayload {
  const withVersion = "version" in input ? input : { ...input, version: 1 as const };
  const result = cursorPayloadSchema.safeParse(withVersion);
  if (!result.success) {
    throw new CursorError();
  }
  return result.data;
}

/**
 * Encodes a cursor as a versioned URL-safe token. The JSON representation is
 * intentionally an implementation detail; callers must only persist and
 * replay the returned token.
 */
export function encodeCursor(input: CursorPayload | Omit<CursorPayload, "version">): string {
  const payload = normalizeCursorInput(input);
  const encoded = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  return `c1.${encoded}`;
}

/** Decodes and validates an opaque cursor token. Invalid tokens never leak details. */
export function decodeCursor(token: string): CursorPayload {
  if (typeof token !== "string" || token.length < 4 || token.length > 2048) {
    throw new CursorError();
  }
  const [prefix, encoded, ...rest] = token.split(".");
  if (prefix !== "c1" || encoded === undefined || rest.length > 0) {
    throw new CursorError();
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encoded)));
  } catch {
    throw new CursorError();
  }
  const result = cursorPayloadSchema.safeParse(decoded);
  if (!result.success) {
    throw new CursorError();
  }
  return result.data;
}

export function tryDecodeCursor(token: string | undefined): CursorPayload | undefined {
  if (token === undefined) {
    return undefined;
  }
  try {
    return decodeCursor(token);
  } catch {
    return undefined;
  }
}

export interface CursorPage<T> {
  readonly data: readonly T[];
  readonly page: {
    readonly nextCursor: string | null;
    readonly hasMore: boolean;
  };
}

export function cursorPage<T>(
  data: readonly T[],
  nextCursor: string | null,
  hasMore = nextCursor !== null,
): CursorPage<T> {
  return {
    data,
    page: {
      nextCursor,
      hasMore,
    },
  };
}
