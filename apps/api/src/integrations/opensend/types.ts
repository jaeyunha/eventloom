import type { OpenSendEmailPayload } from "@eventloom/contracts";

export interface OpenSendAttachment {
  readonly filename: string;
  readonly content: string;
  readonly content_type?: string;
  readonly content_id?: string;
}

export interface OpenSendMessage extends OpenSendEmailPayload {
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
