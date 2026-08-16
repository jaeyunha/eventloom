import type { Queue } from "@cloudflare/workers-types";
import {
  CalendarInvitationError,
  type CalendarInvitationPayload,
  type CalendarInvitationRecord,
  type CalendarInvitationRepository,
  createCalendarInvitation,
  validateCalendarInvitationPayload,
} from "../../../integrations/calendar";
import type { CloudflareOutboxMessage } from "../bindings";

interface CalendarInvitationRow extends Record<string, unknown> {
  readonly uid: string;
  readonly session_id?: string;
  readonly sequence: number;
  readonly payload_json: string;
  readonly ical: string;
  readonly content_type: string;
  readonly generated_at: string;
}

interface CalendarPublicationRow extends CalendarInvitationRow {
  readonly fingerprint: string;
}

export interface D1CalendarInvitationRepositoryOptions {
  readonly database: D1Database;
  readonly queue: Queue<CloudflareOutboxMessage>;
  readonly organizationId: string;
  readonly eventId: string;
  readonly sessionId?: string;
  readonly now?: () => Date;
}

function parseRecord(row: CalendarInvitationRow): CalendarInvitationRecord {
  const payload = validateCalendarInvitationPayload(
    JSON.parse(row.payload_json) as CalendarInvitationPayload,
  );
  if (payload.uid !== row.uid || payload.sequence !== Number(row.sequence)) {
    throw new Error("The persisted calendar invitation is inconsistent.");
  }
  const method = payload.method === "CANCEL" ? "CANCEL" : "REQUEST";
  return {
    uid: row.uid,
    sequence: Number(row.sequence),
    payload,
    ics: row.ical,
    ical: row.ical,
    method,
    contentType: row.content_type,
    generatedAt: row.generated_at,
  };
}

function isCalendarInvitationRow(
  value: CalendarInvitationRecord | CalendarInvitationRow,
): value is CalendarInvitationRow {
  return "payload_json" in value && typeof value.payload_json === "string";
}

function fingerprint(payload: CalendarInvitationPayload): string {
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

async function digest(value: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * D1 is the authority for calendar identity and sequence. The invitation update,
 * idempotency publication, and generic outbox job are committed in one D1 batch.
 */
export class D1CalendarInvitationRepository implements CalendarInvitationRepository {
  readonly #database: D1Database;
  readonly #queue: Queue<CloudflareOutboxMessage>;
  readonly #organizationId: string;
  readonly #eventId: string;
  readonly #sessionId: string | undefined;
  readonly #now: () => Date;

  constructor(options: D1CalendarInvitationRepositoryOptions) {
    this.#database = options.database;
    this.#queue = options.queue;
    this.#organizationId = options.organizationId;
    this.#eventId = options.eventId;
    this.#sessionId = options.sessionId;
    this.#now = options.now ?? (() => new Date());
  }

  async load(uid: string): Promise<CalendarInvitationRecord | null> {
    const row = await this.#database
      .prepare(
        `SELECT uid, sequence, payload_json, ical, content_type, generated_at
           FROM calendar_invitations
          WHERE organization_id = ? AND event_id = ? AND uid = ?
          LIMIT 1`,
      )
      .bind(this.#organizationId, this.#eventId, uid)
      .first<CalendarInvitationRow>();
    return row === null ? null : parseRecord(row);
  }

  async loadForSession(sessionId = this.#sessionId): Promise<CalendarInvitationRecord | null> {
    if (sessionId === undefined || sessionId.trim().length === 0) return null;
    const row = await this.#database
      .prepare(
        `SELECT uid, sequence, payload_json, ical, content_type, generated_at
           FROM calendar_invitations
          WHERE organization_id = ? AND event_id = ? AND session_id = ?
          LIMIT 1`,
      )
      .bind(this.#organizationId, this.#eventId, sessionId)
      .first<CalendarInvitationRow>();
    return row === null ? null : parseRecord(row);
  }

  async listForEvent(): Promise<
    readonly { readonly sessionId: string; readonly record: CalendarInvitationRecord }[]
  > {
    const rows = await this.#database
      .prepare(
        `SELECT session_id, uid, sequence, payload_json, ical, content_type, generated_at
           FROM calendar_invitations
          WHERE organization_id = ? AND event_id = ?
          ORDER BY session_id`,
      )
      .bind(this.#organizationId, this.#eventId)
      .all<CalendarInvitationRow>();
    return (rows.results ?? []).map((row) => ({
      sessionId: String(row.session_id),
      record: parseRecord(row),
    }));
  }

  async listActiveForEvent(): Promise<
    readonly { readonly sessionId: string; readonly record: CalendarInvitationRecord }[]
  > {
    return (await this.listForEvent()).filter((item) => item.record.payload.method !== "CANCEL");
  }

  async publish(payload: CalendarInvitationPayload): Promise<CalendarInvitationRecord> {
    const validated = validateCalendarInvitationPayload(payload);
    const requestedFingerprint = fingerprint(validated);
    const replay = await this.#publication(validated.idempotencyKey);
    if (replay !== null) {
      if (replay.fingerprint !== requestedFingerprint) {
        throw new CalendarInvitationError(
          "IDEMPOTENCY_CONFLICT",
          `Idempotency key ${validated.idempotencyKey} was already used for different calendar content`,
        );
      }
      await this.#enqueuePending(replay);
      return parseRecord(replay);
    }

    const sessionId = this.#sessionId;
    if (sessionId === undefined || sessionId.trim().length === 0) {
      throw new CalendarInvitationError(
        "INVALID_PAYLOAD",
        "A calendar invitation repository session scope is required",
      );
    }
    const current = await this.loadForSession(sessionId);
    if (current === null) {
      if (validated.method !== "REQUEST") {
        throw new CalendarInvitationError(
          "SEQUENCE_VIOLATION",
          "The first publication for a calendar session must be REQUEST",
        );
      }
    } else if (current.uid !== validated.uid) {
      throw new CalendarInvitationError(
        "SEQUENCE_VIOLATION",
        "The persisted calendar UID is authoritative for this session",
      );
    } else if (validated.method === "REQUEST") {
      throw new CalendarInvitationError(
        "SEQUENCE_VIOLATION",
        "An existing calendar UID must use UPDATE or CANCEL",
      );
    }

    const now = this.#now().toISOString();
    const committedPayload: CalendarInvitationPayload = {
      ...validated,
      sequence: current === null ? 0 : current.sequence + 1,
      organizer: current?.payload.organizer ?? validated.organizer,
      attendees: [...validated.attendees],
    };
    const invitation = createCalendarInvitation(committedPayload, { generatedAt: now });
    const payloadJson = JSON.stringify(committedPayload);
    const outboxJobId = `calendar:${await digest(
      `${this.#organizationId}:${validated.idempotencyKey}`,
    )}`;
    const outboxPayload = JSON.stringify({
      effect: "deliver_calendar_updates",
      payload: committedPayload,
    });
    const mutation =
      current === null
        ? this.#database
            .prepare(
              `INSERT INTO calendar_invitations
                 (uid, organization_id, event_id, session_id, sequence, organizer, method,
                  payload_json, ical, content_type, generated_at, last_idempotency_key,
                  created_at, updated_at)
               SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                WHERE NOT EXISTS (
                  SELECT 1 FROM calendar_invitation_publications
                   WHERE organization_id = ? AND idempotency_key = ?
                )`,
            )
            .bind(
              committedPayload.uid,
              this.#organizationId,
              this.#eventId,
              sessionId,
              committedPayload.sequence,
              committedPayload.organizer,
              committedPayload.method,
              payloadJson,
              invitation.ics,
              invitation.contentType,
              invitation.generatedAt,
              committedPayload.idempotencyKey,
              now,
              now,
              this.#organizationId,
              committedPayload.idempotencyKey,
            )
        : this.#database
            .prepare(
              `UPDATE calendar_invitations
                  SET sequence = ?, organizer = ?, method = ?, payload_json = ?, ical = ?,
                      content_type = ?, generated_at = ?, last_idempotency_key = ?, updated_at = ?
                WHERE organization_id = ? AND event_id = ? AND session_id = ? AND uid = ?
                  AND sequence = ?
                  AND NOT EXISTS (
                    SELECT 1 FROM calendar_invitation_publications
                     WHERE organization_id = ? AND idempotency_key = ?
                  )`,
            )
            .bind(
              committedPayload.sequence,
              committedPayload.organizer,
              committedPayload.method,
              payloadJson,
              invitation.ics,
              invitation.contentType,
              invitation.generatedAt,
              committedPayload.idempotencyKey,
              now,
              this.#organizationId,
              this.#eventId,
              sessionId,
              committedPayload.uid,
              current.sequence,
              this.#organizationId,
              committedPayload.idempotencyKey,
            );
    const results = await this.#database.batch([
      mutation,
      this.#database
        .prepare(
          `INSERT INTO calendar_invitation_publications
             (organization_id, idempotency_key, uid, fingerprint, sequence, method,
              payload_json, ical, content_type, generated_at, created_at)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            WHERE EXISTS (
              SELECT 1 FROM calendar_invitations
               WHERE organization_id = ? AND event_id = ? AND session_id = ? AND uid = ?
                 AND sequence = ? AND last_idempotency_key = ?
            )
           ON CONFLICT (organization_id, idempotency_key) DO NOTHING`,
        )
        .bind(
          this.#organizationId,
          committedPayload.idempotencyKey,
          committedPayload.uid,
          requestedFingerprint,
          committedPayload.sequence,
          committedPayload.method,
          payloadJson,
          invitation.ics,
          invitation.contentType,
          invitation.generatedAt,
          now,
          this.#organizationId,
          this.#eventId,
          sessionId,
          committedPayload.uid,
          committedPayload.sequence,
          committedPayload.idempotencyKey,
        ),
      this.#database
        .prepare(
          `INSERT INTO outbox_jobs
             (id, tenant_id, topic, deduplication_key, payload_json, state,
              attempt_count, available_at, created_at, updated_at)
           SELECT ?, ?, 'calendar', ?, ?, 'pending', 0, ?, ?, ?
            WHERE EXISTS (
              SELECT 1 FROM calendar_invitation_publications
               WHERE organization_id = ? AND idempotency_key = ? AND uid = ? AND sequence = ?
            )
           ON CONFLICT (tenant_id, topic, deduplication_key) DO NOTHING`,
        )
        .bind(
          outboxJobId,
          this.#organizationId,
          committedPayload.idempotencyKey,
          outboxPayload,
          now,
          now,
          now,
          this.#organizationId,
          committedPayload.idempotencyKey,
          committedPayload.uid,
          committedPayload.sequence,
        ),
    ]);

    if (Number(results[0]?.meta?.changes ?? 0) !== 1) {
      const raced = await this.#publication(committedPayload.idempotencyKey);
      if (raced !== null && raced.fingerprint === requestedFingerprint) {
        await this.#enqueuePending(raced);
        return parseRecord(raced);
      }
      throw new CalendarInvitationError(
        raced === null ? "SEQUENCE_VIOLATION" : "IDEMPOTENCY_CONFLICT",
        raced === null
          ? "The calendar invitation changed concurrently"
          : `Idempotency key ${validated.idempotencyKey} was already used for different calendar content`,
      );
    }

    const record: CalendarInvitationRecord = {
      uid: committedPayload.uid,
      sequence: committedPayload.sequence,
      payload: committedPayload,
      ics: invitation.ics,
      ical: invitation.ics,
      method: invitation.method,
      contentType: invitation.contentType,
      generatedAt: invitation.generatedAt,
    };
    await this.#enqueuePending(record);
    return record;
  }

  async #publication(idempotencyKey: string): Promise<CalendarPublicationRow | null> {
    return this.#database
      .prepare(
        `SELECT uid, fingerprint, sequence, payload_json, ical, content_type, generated_at
           FROM calendar_invitation_publications
          WHERE organization_id = ? AND idempotency_key = ?
          LIMIT 1`,
      )
      .bind(this.#organizationId, idempotencyKey)
      .first<CalendarPublicationRow>();
  }

  async #enqueuePending(record: CalendarInvitationRecord | CalendarInvitationRow): Promise<void> {
    const payload = isCalendarInvitationRow(record)
      ? validateCalendarInvitationPayload(JSON.parse(record.payload_json))
      : record.payload;
    const jobId = `calendar:${await digest(`${this.#organizationId}:${payload.idempotencyKey}`)}`;
    const row = await this.#database
      .prepare("SELECT state FROM outbox_jobs WHERE id = ? LIMIT 1")
      .bind(jobId)
      .first<{ readonly state: string }>();
    if (row?.state !== "pending") return;
    await this.#queue.send({
      version: 1,
      jobId,
      tenantId: this.#organizationId,
      topic: "calendar",
      enqueuedAt: this.#now().toISOString(),
    });
    await this.#database
      .prepare(
        "UPDATE outbox_jobs SET state = 'queued', updated_at = ? WHERE id = ? AND state = 'pending'",
      )
      .bind(this.#now().toISOString(), jobId)
      .run();
  }
}
