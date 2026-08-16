import { createHash, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import nodemailer from "nodemailer";

const DEFAULT_TOKEN = "local-development";
const MAX_REQUEST_BYTES = 60 * 1024 * 1024;

type MailAttachment = {
  readonly filename: string;
  readonly content: Buffer;
  readonly contentType?: string;
  readonly cid?: string;
};

type CapturedMessage = {
  readonly from: string;
  readonly to: readonly string[];
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly attachments?: readonly MailAttachment[];
};

export interface MailTransport {
  sendMail(message: CapturedMessage): Promise<{ readonly messageId?: string }>;
}

type StoredDelivery = {
  readonly digest: string;
  readonly delivery: Promise<string>;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function containsLineBreak(value: string): boolean {
  return value.includes("\r") || value.includes("\n");
}

function requiredString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function stringRecord(value: unknown): Readonly<Record<string, string>> | null {
  if (!isRecord(value)) return null;
  const entries: Array<readonly [string, string]> = [];
  for (const [name, candidate] of Object.entries(value)) {
    if (
      name.trim().length === 0 ||
      containsLineBreak(name) ||
      typeof candidate !== "string" ||
      containsLineBreak(candidate)
    ) {
      return null;
    }
    entries.push([name, candidate]);
  }
  return Object.fromEntries(entries);
}

function decodeBase64(value: unknown): Buffer | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s/gu, "");
  if (normalized.length === 0 || normalized.length % 4 !== 0) return null;
  if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(normalized)) return null;
  try {
    return Buffer.from(normalized, "base64");
  } catch {
    return null;
  }
}

function parseAttachments(value: unknown): readonly MailAttachment[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const attachments: MailAttachment[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate)) return null;
    const filename = requiredString(candidate.filename);
    const content = decodeBase64(candidate.content);
    const contentType =
      candidate.content_type === undefined ? undefined : requiredString(candidate.content_type);
    const cid =
      candidate.content_id === undefined ? undefined : requiredString(candidate.content_id);
    if (
      filename === null ||
      filename.length > 255 ||
      containsLineBreak(filename) ||
      content === null ||
      (candidate.content_type !== undefined && contentType === null) ||
      (candidate.content_id !== undefined && cid === null)
    ) {
      return null;
    }
    attachments.push({
      filename,
      content,
      ...(contentType === undefined ? {} : { contentType }),
      ...(cid === undefined ? {} : { cid }),
    });
  }
  return attachments;
}

function parseMessage(value: unknown): CapturedMessage | null {
  if (!isRecord(value)) return null;
  const from = requiredString(value.from);
  const subject = requiredString(value.subject);
  const html = typeof value.html === "string" ? value.html : null;
  const text = typeof value.text === "string" ? value.text : null;
  const to = Array.isArray(value.to)
    ? value.to.filter((candidate): candidate is string => requiredString(candidate) !== null)
    : [];
  const headers = value.headers === undefined ? undefined : stringRecord(value.headers);
  const attachments = parseAttachments(value.attachments);
  if (
    from === null ||
    containsLineBreak(from) ||
    subject === null ||
    containsLineBreak(subject) ||
    html === null ||
    text === null ||
    to.length === 0 ||
    to.length !== (Array.isArray(value.to) ? value.to.length : 0) ||
    to.some(containsLineBreak) ||
    (value.headers !== undefined && headers === null) ||
    attachments === null
  ) {
    return null;
  }
  return {
    from,
    to,
    subject,
    html,
    text,
    ...(headers === undefined ? {} : { headers }),
    ...(attachments.length === 0 ? {} : { attachments }),
  };
}

function json(status: number, body: unknown): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'",
      "x-content-type-options": "nosniff",
    },
  });
}

function requestDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function mailpitOpenSendToken(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return environment.OPENSEND_API_KEY?.trim() || DEFAULT_TOKEN;
}

export function createMailpitOpenSendHandler(options: {
  readonly transport: MailTransport;
  readonly token?: string;
}): (request: Request) => Promise<Response> {
  const token = options.token ?? DEFAULT_TOKEN;
  const deliveries = new Map<string, StoredDelivery>();

  return async (request) => {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json(200, { status: "ok", service: "mailpit-opensend-bridge" });
    }
    if (request.method !== "POST" || url.pathname !== "/api/emails") {
      return json(404, { error: { code: "NOT_FOUND", message: "The route was not found." } });
    }
    if (request.headers.get("authorization") !== `Bearer ${token}`) {
      return json(401, {
        error: { code: "AUTHENTICATION_ERROR", message: "Authentication failed." },
      });
    }
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey || idempotencyKey.length > 512 || containsLineBreak(idempotencyKey)) {
      return json(400, {
        error: {
          code: "IDEMPOTENCY_KEY_REQUIRED",
          message: "A valid idempotency key is required.",
        },
      });
    }
    const body = await request.json().catch(() => null);
    const message = parseMessage(body);
    if (message === null) {
      return json(422, {
        error: { code: "VALIDATION_ERROR", message: "The email payload is invalid." },
      });
    }
    const digest = requestDigest(body);
    const existing = deliveries.get(idempotencyKey);
    if (existing !== undefined) {
      if (existing.digest !== digest) {
        return json(409, {
          error: {
            code: "IDEMPOTENCY_CONFLICT",
            message: "The idempotency key is already bound to another request.",
          },
        });
      }
      return json(200, { id: await existing.delivery });
    }

    const delivery = options.transport
      .sendMail(message)
      .then((result) => result.messageId?.trim() || `mailpit-${randomUUID()}`);
    deliveries.set(idempotencyKey, { digest, delivery });
    try {
      return json(200, { id: await delivery });
    } catch {
      deliveries.delete(idempotencyKey);
      return json(503, {
        error: { code: "PROVIDER_UNAVAILABLE", message: "Local email capture is unavailable." },
      });
    }
  };
}

async function readRequestBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_REQUEST_BYTES) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function writeResponse(response: ServerResponse, result: Response): Promise<void> {
  response.statusCode = result.status;
  result.headers.forEach((value, name) => {
    response.setHeader(name, value);
  });
  response.end(Buffer.from(await result.arrayBuffer()));
}

export function startMailpitOpenSendBridge(): void {
  const transport = nodemailer.createTransport({
    host: "127.0.0.1",
    port: 1025,
    secure: false,
  });
  const handler = createMailpitOpenSendHandler({
    token: mailpitOpenSendToken(),
    transport: {
      async sendMail(message) {
        const result = await transport.sendMail({
          from: message.from,
          to: [...message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
          ...(message.headers === undefined ? {} : { headers: { ...message.headers } }),
          ...(message.attachments === undefined
            ? {}
            : { attachments: message.attachments.map((attachment) => ({ ...attachment })) }),
        });
        return {
          ...(typeof result.messageId === "string" ? { messageId: result.messageId } : {}),
        };
      },
    },
  });
  const server = createServer(async (incoming, outgoing) => {
    try {
      const body = await readRequestBody(incoming);
      const request = new Request(`http://127.0.0.1:8026${incoming.url ?? "/"}`, {
        method: incoming.method,
        headers: incoming.headers as HeadersInit,
        ...(body.length === 0 ? {} : { body: Uint8Array.from(body).buffer }),
      });
      await writeResponse(outgoing, await handler(request));
    } catch (error) {
      const status = error instanceof Error && error.message === "REQUEST_TOO_LARGE" ? 413 : 400;
      await writeResponse(
        outgoing,
        json(status, { error: { code: "INVALID_REQUEST", message: "The request is invalid." } }),
      );
    }
  });
  server.listen(8026, "127.0.0.1", () => {
    process.stdout.write("Local email bridge listening on http://127.0.0.1:8026\n");
  });
}

if (import.meta.main) startMailpitOpenSendBridge();
