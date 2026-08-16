import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { participants } from "./cfp-speakers";
import { authUsers } from "./identity-access";
import { events } from "./program-core";

export const eventRoleInvitations = sqliteTable(
  "event_role_invitations",
  {
    id: text().primaryKey().notNull(),
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    role: text({ enum: ["reviewer", "speaker"] }).notNull(),
    recipientUserId: text("recipient_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    normalizedEmail: text("normalized_email").notNull(),
    participantId: text("participant_id"),
    status: text({ enum: ["pending", "accepted", "declined", "revoked"] }).notNull(),
    creationIdempotencyKey: text("creation_idempotency_key").notNull(),
    invitedByActorType: text("invited_by_actor_type", { enum: ["user", "system"] }).notNull(),
    invitedByActorId: text("invited_by_actor_id"),
    invitedAt: text("invited_at").notNull(),
    acceptedByUserId: text("accepted_by_user_id").references(() => authUsers.id, {
      onDelete: "restrict",
    }),
    acceptedAt: text("accepted_at"),
    declinedByUserId: text("declined_by_user_id").references(() => authUsers.id, {
      onDelete: "restrict",
    }),
    declinedAt: text("declined_at"),
    revokedByActorType: text("revoked_by_actor_type", { enum: ["user", "system"] }),
    revokedByActorId: text("revoked_by_actor_id"),
    revokedAt: text("revoked_at"),
    version: integer().notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.eventId],
      foreignColumns: [events.organizationId, events.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.eventId, table.participantId],
      foreignColumns: [participants.organizationId, participants.eventId, participants.id],
    }).onDelete("restrict"),
    unique().on(table.organizationId, table.eventId, table.id),
    unique().on(table.organizationId, table.eventId, table.creationIdempotencyKey),
    uniqueIndex("event_role_invitations_live_reviewer_account_uidx")
      .on(table.organizationId, table.eventId, table.recipientUserId)
      .where(sql`${table.role} = 'reviewer' and ${table.status} in ('pending','accepted')`),
    uniqueIndex("event_role_invitations_live_speaker_account_participant_uidx")
      .on(table.organizationId, table.eventId, table.recipientUserId, table.participantId)
      .where(sql`${table.role} = 'speaker' and ${table.status} in ('pending','accepted')`),
    uniqueIndex("event_role_invitations_live_participant_uidx")
      .on(table.organizationId, table.eventId, table.participantId)
      .where(sql`${table.role} = 'speaker' and ${table.status} in ('pending','accepted')`),
    index("event_role_invitations_recipient_status_idx").on(
      table.recipientUserId,
      table.status,
      table.invitedAt,
    ),
    index("event_role_invitations_event_status_idx").on(
      table.organizationId,
      table.eventId,
      table.status,
      table.role,
    ),
    check(
      "event_role_invitations_email_check",
      sql`length(trim(${table.normalizedEmail})) > 0 and ${table.normalizedEmail} = lower(trim(${table.normalizedEmail}))`,
    ),
    check(
      "event_role_invitations_binding_check",
      sql`(${table.role} = 'reviewer' and ${table.participantId} is null) or (${table.role} = 'speaker' and ${table.participantId} is not null)`,
    ),
    check("event_role_invitations_version_check", sql`${table.version} > 0`),
    check(
      "event_role_invitations_inviter_check",
      sql`(${table.invitedByActorType} = 'user' and ${table.invitedByActorId} is not null) or (${table.invitedByActorType} = 'system' and ${table.invitedByActorId} is null)`,
    ),
    check(
      "event_role_invitations_status_audit_check",
      sql`(${table.status} = 'pending' and ${table.acceptedByUserId} is null and ${table.acceptedAt} is null and ${table.declinedByUserId} is null and ${table.declinedAt} is null and ${table.revokedByActorType} is null and ${table.revokedAt} is null) or (${table.status} = 'accepted' and ${table.acceptedByUserId} = ${table.recipientUserId} and ${table.acceptedAt} is not null and ${table.declinedByUserId} is null and ${table.declinedAt} is null and ${table.revokedByActorType} is null and ${table.revokedAt} is null) or (${table.status} = 'declined' and ${table.acceptedByUserId} is null and ${table.acceptedAt} is null and ${table.declinedByUserId} = ${table.recipientUserId} and ${table.declinedAt} is not null and ${table.revokedByActorType} is null and ${table.revokedAt} is null) or (${table.status} = 'revoked' and ${table.declinedByUserId} is null and ${table.declinedAt} is null and ${table.revokedByActorType} is not null and ${table.revokedAt} is not null and ((${table.acceptedByUserId} is null) = (${table.acceptedAt} is null)))`,
    ),
  ],
);
