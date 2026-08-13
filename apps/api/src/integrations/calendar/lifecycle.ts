import type { CalendarInvitationPayload } from "@eventloom/contracts";
import { createCalendarInvitation, validateCalendarInvitationPayload } from "./ical";
import {
  CALENDAR_ORGANIZER,
  CALENDAR_UID_DOMAIN,
  type CalendarInvitationDetails,
  CalendarInvitationError,
  type CalendarInvitationInput,
  type CalendarInvitationRecord,
  type CalendarInvitationRepository,
  type CalendarInvitationScope,
} from "./types";

export type CalendarInvitationActionInput = Omit<CalendarInvitationInput, "method">;

/**
 * Builds a UID from all three tenancy coordinates. Encoding each coordinate
 * prevents delimiter collisions while keeping the UID readable in mail clients.
 */
export function createCalendarUid(scope: CalendarInvitationScope): string;
export function createCalendarUid(tenantId: string, eventId: string, sessionId: string): string;
export function createCalendarUid(
  scopeOrTenantId: CalendarInvitationScope | string,
  eventId?: string,
  sessionId?: string,
): string {
  const scope =
    typeof scopeOrTenantId === "string"
      ? { tenantId: scopeOrTenantId, eventId: eventId ?? "", sessionId: sessionId ?? "" }
      : scopeOrTenantId;
  const tenantId = encodeUidPart(scope.tenantId, "tenantId");
  const scopedEventId = encodeUidPart(scope.eventId, "eventId");
  const scopedSessionId = encodeUidPart(scope.sessionId, "sessionId");
  return `${tenantId}.${scopedEventId}.${scopedSessionId}@${CALENDAR_UID_DOMAIN}`;
}

export const createStableCalendarUid = createCalendarUid;
export const generateCalendarUid = createCalendarUid;

export function createCalendarInvitationPayload(
  scope: CalendarInvitationScope,
  details: CalendarInvitationDetails,
): CalendarInvitationPayload {
  return {
    ...details,
    uid: createCalendarUid(scope),
    sequence: 0,
  };
}

/**
 * Durable repositories can implement this boundary with a transaction in D1 or
 * a Durable Object. The in-memory implementation below is deterministic and
 * follows exactly the same sequence/idempotency rules.
 */
export interface InMemoryCalendarInvitationRepositoryOptions {
  readonly now?: () => Date;
}

export class InMemoryCalendarInvitationRepository implements CalendarInvitationRepository {
  readonly #records = new Map<string, CalendarInvitationRecord>();
  readonly #idempotency = new Map<
    string,
    { fingerprint: string; record: CalendarInvitationRecord }
  >();
  readonly #now: () => Date;

  constructor(options: InMemoryCalendarInvitationRepositoryOptions = {}) {
    this.#now = options.now ?? (() => new Date());
  }

  async publish(payload: CalendarInvitationPayload): Promise<CalendarInvitationRecord> {
    const validated = validateCalendarInvitationPayload(payload);
    const idempotencyReference = validated.idempotencyKey;
    const fingerprint = invitationFingerprint(validated);
    const previousAttempt = this.#idempotency.get(idempotencyReference);
    if (previousAttempt !== undefined) {
      if (previousAttempt.fingerprint !== fingerprint) {
        throw new CalendarInvitationError(
          "IDEMPOTENCY_CONFLICT",
          `Idempotency key ${validated.idempotencyKey} was already used for different calendar content`,
        );
      }
      return cloneRecord(previousAttempt.record);
    }

    const current = this.#records.get(validated.uid);
    if (current === undefined) {
      if (validated.method !== "REQUEST" || validated.sequence !== 0) {
        throw new CalendarInvitationError(
          "SEQUENCE_VIOLATION",
          "The first publication for a calendar UID must be REQUEST with sequence 0",
        );
      }
    } else if (validated.method === "REQUEST") {
      throw new CalendarInvitationError(
        "SEQUENCE_VIOLATION",
        "An existing calendar UID must use UPDATE or CANCEL",
      );
    }

    const sequence = current === undefined ? 0 : current.payload.sequence + 1;
    const committedPayload: CalendarInvitationPayload = {
      ...validated,
      sequence,
      organizer: CALENDAR_ORGANIZER,
      attendees: [...validated.attendees],
    };
    const invitation = createCalendarInvitation(committedPayload, {
      generatedAt: this.#now().toISOString(),
    });
    const record: CalendarInvitationRecord = {
      ...invitation,
      uid: committedPayload.uid,
      sequence,
      payload: committedPayload,
      ical: invitation.ics,
    };

    // There is no await between the validation and these writes, so one worker
    // turn commits the record and idempotency marker as an atomic unit.
    this.#records.set(committedPayload.uid, record);
    this.#idempotency.set(idempotencyReference, { fingerprint, record });
    return cloneRecord(record);
  }

  async load(uid: string): Promise<CalendarInvitationRecord | null> {
    const record = this.#records.get(uid);
    return record === undefined ? null : cloneRecord(record);
  }

  async get(uid: string): Promise<CalendarInvitationRecord | null> {
    return this.load(uid);
  }

  async commit(payload: CalendarInvitationPayload): Promise<CalendarInvitationRecord> {
    return this.publish(payload);
  }
  async save(payload: CalendarInvitationPayload): Promise<CalendarInvitationRecord> {
    return this.publish(payload);
  }
}

export class CalendarInvitationLifecycle {
  constructor(
    readonly repository: CalendarInvitationRepository = new InMemoryCalendarInvitationRepository(),
  ) {}

  async publish(input: CalendarInvitationInput): Promise<CalendarInvitationRecord> {
    const { tenantId, eventId, sessionId, ...details } = input;
    return this.repository.publish(
      createCalendarInvitationPayload({ tenantId, eventId, sessionId }, details),
    );
  }

  async publishPayload(payload: CalendarInvitationPayload): Promise<CalendarInvitationRecord> {
    return this.repository.publish(payload);
  }

  async request(input: CalendarInvitationActionInput): Promise<CalendarInvitationRecord> {
    return this.publish({ ...input, method: "REQUEST" });
  }

  async update(input: CalendarInvitationActionInput): Promise<CalendarInvitationRecord> {
    return this.publish({ ...input, method: "UPDATE" });
  }

  async cancel(input: CalendarInvitationActionInput): Promise<CalendarInvitationRecord> {
    return this.publish({ ...input, method: "CANCEL" });
  }
}

function encodeUidPart(value: string, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new CalendarInvitationError("INVALID_PAYLOAD", `${fieldName} must not be empty`);
  }
  if (value.includes("\r") || value.includes("\n")) {
    throw new CalendarInvitationError(
      "HEADER_INJECTION",
      `${fieldName} must not contain CR or LF characters`,
    );
  }
  try {
    return encodeURIComponent(value).replaceAll(".", "%2E");
  } catch {
    throw new CalendarInvitationError(
      "INVALID_PAYLOAD",
      `${fieldName} contains invalid characters`,
    );
  }
}

function invitationFingerprint(payload: CalendarInvitationPayload): string {
  return JSON.stringify([
    payload.method,
    payload.uid,
    payload.timeZone,
    payload.startsAt,
    payload.endsAt,
    payload.organizer,
    payload.attendees,
    payload.summary,
    payload.location,
  ]);
}

function cloneRecord(record: CalendarInvitationRecord): CalendarInvitationRecord {
  return {
    ics: record.ics,
    method: record.method,
    contentType: record.contentType,
    generatedAt: record.generatedAt,
    uid: record.uid,
    sequence: record.sequence,
    payload: { ...record.payload, attendees: [...record.payload.attendees] },
    ical: record.ical,
  };
}
