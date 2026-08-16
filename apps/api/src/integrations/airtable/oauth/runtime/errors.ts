export type AirtableOAuthRuntimeErrorCode =
  | "invalid_request"
  | "connection_not_found"
  | "connection_unavailable"
  | "missing_credential"
  | "credential_mode_mismatch"
  | "invalid_credential_reference"
  | "credential_validation_failed"
  | "missing_scope"
  | "base_not_found"
  | "invalid_base_response"
  | "base_selection_conflict";

export class AirtableOAuthRuntimeError extends Error {
  readonly code: AirtableOAuthRuntimeErrorCode;

  constructor(
    code: AirtableOAuthRuntimeErrorCode,
    message: string,
    options: { readonly cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AirtableOAuthRuntimeError";
    this.code = code;
  }
}
