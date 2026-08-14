import { z } from "zod";

export const OPEN_SEND_SENDER_PURPOSES = ["auth", "speakers", "calendar"] as const;
export type OpenSendSenderPurpose = (typeof OPEN_SEND_SENDER_PURPOSES)[number];

export const openSendSenderAddressSchema = z.string().trim().pipe(z.email());

const openSendAttachmentSchema = z.object({
  filename: z.string(),
  content: z.string(),
  content_type: z.string().optional(),
  content_id: z.string().optional(),
});

export const openSendMessageSchema = z.object({
  from: openSendSenderAddressSchema,
  senderPurpose: z.enum(OPEN_SEND_SENDER_PURPOSES).optional(),
  to: z.array(z.email()).min(1),
  subject: z.string().trim().min(1).max(998),
  html: z.string().min(1),
  text: z.string().min(1),
  idempotencyKey: z.string().trim().min(8).max(128),
  headers: z.record(z.string(), z.string()).optional(),
  attachments: z.array(openSendAttachmentSchema).optional(),
});

export interface OpenSendAttachment {
  readonly filename: string;
  readonly content: string;
  readonly content_type?: string;
  readonly content_id?: string;
}

export interface OpenSendMessage {
  /** Persisted sender identity retained for audit; senderPurpose may select a rotated envelope. */
  readonly from: string;
  readonly senderPurpose?: OpenSendSenderPurpose;
  readonly to: readonly string[];
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly idempotencyKey: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly attachments?: readonly OpenSendAttachment[];
}

export interface OpenSendSendResult {
  readonly providerMessageId: string;
  readonly idempotencyKey: string;
}

export interface OpenSendSender {
  send(message: OpenSendMessage): Promise<OpenSendSendResult>;
}

export type OpenSendErrorCode =
  | "AUTHENTICATION_ERROR"
  | "CONFIGURATION_ERROR"
  | "IDEMPOTENCY_CONFLICT"
  | "MALFORMED_RESPONSE"
  | "NETWORK_ERROR"
  | "PROVIDER_UNAVAILABLE"
  | "RATE_LIMITED"
  | "REQUEST_REJECTED"
  | "VALIDATION_ERROR";

export interface OpenSendErrorOptions {
  readonly retryable: boolean;
  readonly status?: number;
  readonly retryAfterMs?: number;
  readonly cause?: unknown;
}

export class OpenSendError extends Error {
  readonly code: OpenSendErrorCode;
  readonly retryable: boolean;
  readonly status: number | undefined;
  readonly retryAfterMs: number | undefined;

  constructor(code: OpenSendErrorCode, message: string, options: OpenSendErrorOptions) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "OpenSendError";
    this.code = code;
    this.retryable = options.retryable;
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
  }
}
