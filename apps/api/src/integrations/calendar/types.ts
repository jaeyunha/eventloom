import type { CalendarInvitationPayload } from "@eventloom/contracts";

export type { CalendarInvitationPayload };

export type CalendarInvitationMethod = CalendarInvitationPayload["method"];

export interface CalendarInvitationScope {
  tenantId: string;
  eventId: string;
  sessionId: string;
}

export interface CalendarIntegrationOptions {
  readonly organizer: string;
  readonly uidDomain: string;
}

export type CalendarInvitationDetails = Omit<
  CalendarInvitationPayload,
  "uid" | "sequence" | "organizer"
>;

export type CalendarInvitationInput = CalendarInvitationScope & CalendarInvitationDetails;
export interface CalendarInvitationSerializationOptions {
  readonly generatedAt?: string;
}

export interface CalendarInvitationResult {
  readonly ics: string;
  readonly method: "REQUEST" | "CANCEL";
  readonly contentType: string;
  readonly generatedAt: string;
}

export interface CalendarInvitationRecord extends CalendarInvitationResult {
  readonly uid: string;
  readonly sequence: number;
  readonly payload: CalendarInvitationPayload;
  readonly ical: string;
}

/**
 * The repository boundary is one atomic publication operation. Implementations
 * must commit the complete invitation (payload and serialized representation),
 * and must return the existing record for an idempotent replay.
 */
export interface CalendarInvitationRepository {
  publish(payload: CalendarInvitationPayload): Promise<CalendarInvitationRecord>;
  load(uid: string): Promise<CalendarInvitationRecord | null>;
}

export type CalendarInvitationErrorCode =
  | "INVALID_PAYLOAD"
  | "INVALID_TIME_ZONE"
  | "INVALID_TIMESTAMP"
  | "INVALID_INTERVAL"
  | "HEADER_INJECTION"
  | "SEQUENCE_VIOLATION"
  | "IDEMPOTENCY_CONFLICT";

export class CalendarInvitationError extends Error {
  constructor(
    readonly code: CalendarInvitationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CalendarInvitationError";
  }
}

const emailPattern =
  /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;
const domainLabelPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

export function isCalendarEmailAddress(value: string): boolean {
  return value.length <= 254 && emailPattern.test(value);
}

export function validateCalendarIntegrationOptions(options: unknown): CalendarIntegrationOptions {
  if (options === null || typeof options !== "object") {
    throw new CalendarInvitationError("INVALID_PAYLOAD", "Calendar options must be an object");
  }
  const candidate = options as Partial<CalendarIntegrationOptions>;
  if (typeof candidate.organizer !== "string" || !isCalendarEmailAddress(candidate.organizer)) {
    throw new CalendarInvitationError(
      "INVALID_PAYLOAD",
      "Calendar organizer must be a valid email address",
    );
  }
  if (
    typeof candidate.uidDomain !== "string" ||
    candidate.uidDomain.length > 253 ||
    candidate.uidDomain.endsWith(".") ||
    !candidate.uidDomain.includes(".") ||
    !candidate.uidDomain.split(".").every((label) => domainLabelPattern.test(label))
  ) {
    throw new CalendarInvitationError(
      "INVALID_PAYLOAD",
      "Calendar UID domain must be a valid domain name",
    );
  }
  return { organizer: candidate.organizer, uidDomain: candidate.uidDomain };
}
