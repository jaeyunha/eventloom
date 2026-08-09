import { openSendEmailPayloadSchema, openSendSenderSchema } from "@open-sessionboard/contracts";
import {
  OpenSendError,
  type OpenSendErrorCode,
  type OpenSendMessage,
  type OpenSendSender,
  type OpenSendSendResult,
} from "./types";

export type OpenSendSenderPurpose = "auth" | "speakers" | "calendar";
export type OpenSendSenderAddress = OpenSendMessage["from"];
export type OpenSendSenderAddresses = Readonly<
  Record<OpenSendSenderPurpose, OpenSendSenderAddress>
>;

export const DEFAULT_OPEN_SEND_SENDERS: OpenSendSenderAddresses = {
  auth: "auth@foreverbrowsing.com",
  speakers: "speakers@foreverbrowsing.com",
  calendar: "calendar@foreverbrowsing.com",
};

const DEFAULT_BASE_URL = "https://opensend.namuh.co";
const MAX_ATTACHMENT_BASE64_BYTES = 40 * 1024 * 1024;

export interface OpenSendClientOptions {
  readonly sendingApiKey: string;
  readonly baseUrl?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: () => Date;
  readonly senderAddresses?: Partial<Record<OpenSendSenderPurpose, string>>;
}

export class OpenSendClient implements OpenSendSender {
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #now: () => Date;
  readonly #senderAddresses: OpenSendSenderAddresses;

  constructor(options: OpenSendClientOptions) {
    const apiKey = options.sendingApiKey.trim();
    if (apiKey.length === 0) {
      throw new OpenSendError("CONFIGURATION_ERROR", "An OpenSend sending API key is required.", {
        retryable: false,
      });
    }

    this.#apiKey = apiKey;
    this.#baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    this.#fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.#now = options.now ?? (() => new Date());
    this.#senderAddresses = resolveSenderAddresses(options.senderAddresses);
  }

  async send(
    message: OpenSendMessage,
    purpose?: OpenSendSenderPurpose,
  ): Promise<OpenSendSendResult> {
    const selectedMessage =
      purpose === undefined ? message : { ...message, from: this.senderFor(purpose) };
    assertMessage(selectedMessage);

    let response: Response;
    try {
      response = await this.#fetch(`${this.#baseUrl}/api/emails`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.#apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": selectedMessage.idempotencyKey,
        },
        body: JSON.stringify(toRequestBody(selectedMessage)),
      });
    } catch (cause) {
      throw new OpenSendError("NETWORK_ERROR", "OpenSend could not be reached.", {
        retryable: true,
        cause,
      });
    }

    if (!response.ok) {
      throw errorForResponse(response, this.#now());
    }

    const body = await readJson(response);
    if (!isRecord(body) || typeof body.id !== "string" || body.id.trim().length === 0) {
      throw new OpenSendError(
        "MALFORMED_RESPONSE",
        "OpenSend returned an invalid success response.",
        { retryable: true, status: response.status },
      );
    }

    return {
      providerMessageId: body.id,
      idempotencyKey: selectedMessage.idempotencyKey,
    };
  }

  senderFor(purpose: OpenSendSenderPurpose): OpenSendSenderAddress {
    return this.#senderAddresses[purpose];
  }
}

function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch (cause) {
    throw new OpenSendError("CONFIGURATION_ERROR", "OpenSend base URL must be absolute.", {
      retryable: false,
      cause,
    });
  }

  const localHttp =
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]");
  if (
    (url.protocol !== "https:" && !localHttp) ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.search ||
    url.hash
  ) {
    throw new OpenSendError(
      "CONFIGURATION_ERROR",
      "OpenSend base URL must use HTTPS (or local HTTP) and must not include credentials, a query, or a fragment.",
      { retryable: false },
    );
  }

  return url.toString().replace(/\/$/, "");
}

function resolveSenderAddresses(
  overrides: Partial<Record<OpenSendSenderPurpose, string>> | undefined,
): OpenSendSenderAddresses {
  const configured = { ...DEFAULT_OPEN_SEND_SENDERS };
  for (const [purpose, address] of Object.entries(overrides ?? {})) {
    if (address !== undefined) {
      configured[purpose as OpenSendSenderPurpose] = address.trim() as OpenSendSenderAddress;
    }
  }
  for (const [purpose, address] of Object.entries(configured)) {
    if (!openSendSenderSchema.safeParse(address).success) {
      throw new OpenSendError(
        "CONFIGURATION_ERROR",
        `OpenSend ${purpose} sender is not a verified sender address.`,
        { retryable: false },
      );
    }
  }
  return configured;
}

function assertMessage(message: OpenSendMessage): void {
  const parsed = openSendEmailPayloadSchema.safeParse(message);
  if (!parsed.success) {
    throw new OpenSendError("VALIDATION_ERROR", "The OpenSend email payload is invalid.", {
      retryable: false,
    });
  }

  if (message.headers !== undefined) {
    for (const [name, value] of Object.entries(message.headers)) {
      if (name.trim().length === 0 || containsLineBreak(name) || containsLineBreak(value)) {
        throw new OpenSendError("VALIDATION_ERROR", "OpenSend email headers are invalid.", {
          retryable: false,
        });
      }
    }
  }

  let encodedAttachmentBytes = 0;
  for (const attachment of message.attachments ?? []) {
    if (
      attachment.filename.trim().length === 0 ||
      attachment.filename.length > 255 ||
      containsLineBreak(attachment.filename) ||
      attachment.content.length === 0 ||
      (attachment.content_type !== undefined &&
        (attachment.content_type.trim().length === 0 ||
          containsLineBreak(attachment.content_type))) ||
      (attachment.content_id !== undefined &&
        (attachment.content_id.trim().length === 0 || containsLineBreak(attachment.content_id)))
    ) {
      throw new OpenSendError("VALIDATION_ERROR", "An OpenSend attachment is invalid.", {
        retryable: false,
      });
    }
    encodedAttachmentBytes += attachment.content.replace(/\s/g, "").length;
  }

  if (encodedAttachmentBytes > MAX_ATTACHMENT_BASE64_BYTES) {
    throw new OpenSendError(
      "VALIDATION_ERROR",
      "OpenSend attachments exceed the 40 MB encoded size limit.",
      { retryable: false },
    );
  }
}

function toRequestBody(message: OpenSendMessage): Record<string, unknown> {
  return {
    from: message.from,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
    ...(message.headers === undefined ? {} : { headers: message.headers }),
    ...(message.attachments === undefined ? {} : { attachments: message.attachments }),
  };
}

function errorForResponse(response: Response, now: Date): OpenSendError {
  const status = response.status;
  const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"), now);
  let code: OpenSendErrorCode = "REQUEST_REJECTED";
  let retryable = false;

  if (status === 401 || status === 403) {
    code = "AUTHENTICATION_ERROR";
  } else if (status === 409) {
    code = "IDEMPOTENCY_CONFLICT";
  } else if (status === 422 || status === 400) {
    code = "VALIDATION_ERROR";
  } else if (status === 408 || status === 425 || status === 429 || status >= 500) {
    retryable = true;
    code = status === 429 ? "RATE_LIMITED" : "PROVIDER_UNAVAILABLE";
  }

  return new OpenSendError(code, `OpenSend rejected the email request with status ${status}.`, {
    retryable,
    status,
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  });
}

function parseRetryAfter(value: string | null, now: Date): number | undefined {
  if (value === null) {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1_000);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return Math.max(0, date.getTime() - now.getTime());
}

async function readJson(response: Response): Promise<unknown> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    return null;
  }
  if (text.length === 0) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function containsLineBreak(value: string): boolean {
  return value.includes("\r") || value.includes("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
