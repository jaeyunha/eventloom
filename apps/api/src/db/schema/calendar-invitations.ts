import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";
import { events } from "./program-core";

export const calendarInvitations = sqliteTable(
  "calendar_invitations",
  {
    uid: text("uid").primaryKey().notNull(),
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    sessionId: text("session_id").notNull(),
    sequence: integer("sequence").notNull(),
    organizer: text("organizer").notNull(),
    method: text("method", { enum: ["REQUEST", "UPDATE", "CANCEL"] }).notNull(),
    payloadJson: text("payload_json").notNull(),
    ical: text("ical").notNull(),
    contentType: text("content_type").notNull(),
    generatedAt: text("generated_at").notNull(),
    lastIdempotencyKey: text("last_idempotency_key").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.eventId],
      foreignColumns: [events.organizationId, events.id],
    }).onDelete("cascade"),
    unique("calendar_invitations_event_session_unique").on(
      table.organizationId,
      table.eventId,
      table.sessionId,
    ),
    index("calendar_invitations_event_state_idx").on(
      table.organizationId,
      table.eventId,
      table.method,
      table.sessionId,
    ),
    check("calendar_invitations_sequence_check", sql`${table.sequence} >= 0`),
    check(
      "calendar_invitations_payload_check",
      sql`json_valid(${table.payloadJson}) AND json_type(${table.payloadJson}) = 'object'`,
    ),
  ],
);

export const calendarInvitationPublications = sqliteTable(
  "calendar_invitation_publications",
  {
    organizationId: text("organization_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    uid: text("uid")
      .notNull()
      .references(() => calendarInvitations.uid, { onDelete: "cascade" }),
    fingerprint: text("fingerprint").notNull(),
    sequence: integer("sequence").notNull(),
    method: text("method", { enum: ["REQUEST", "UPDATE", "CANCEL"] }).notNull(),
    payloadJson: text("payload_json").notNull(),
    ical: text("ical").notNull(),
    contentType: text("content_type").notNull(),
    generatedAt: text("generated_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.idempotencyKey] }),
    index("calendar_invitation_publications_uid_sequence_idx").on(table.uid, table.sequence),
    check("calendar_invitation_publications_sequence_check", sql`${table.sequence} >= 0`),
    check(
      "calendar_invitation_publications_payload_check",
      sql`json_valid(${table.payloadJson}) AND json_type(${table.payloadJson}) = 'object'`,
    ),
  ],
);
