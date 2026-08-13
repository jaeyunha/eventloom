import type { CalendarInvitationPayload } from "@eventloom/contracts";

export type CalendarInvitationMethod = CalendarInvitationPayload["method"];

export interface CalendarInvitationScope {
  tenantId: string;
  eventId: string;
  sessionId: string;
}

export type CalendarInvitationDetails = Omit<CalendarInvitationPayload, "uid" | "sequence">;

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

export const CALENDAR_UID_DOMAIN = "calendar.sessionboard.namuh.co";
export const CALENDAR_ORGANIZER = "calendar@sessionboard.namuh.co";
