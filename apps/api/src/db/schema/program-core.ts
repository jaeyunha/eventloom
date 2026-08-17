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
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { organizations } from "./identity-access";

const bool = (name: string) => integer(name, { mode: "boolean" }).notNull();
const jsonArray = (name: string) => text(name, { mode: "json" }).notNull();

export const events = sqliteTable(
  "events",
  {
    id: text().primaryKey().notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.organizationId, { onDelete: "cascade" }),
    slug: text().notNull(),
    name: text().notNull(),
    status: text().notNull(),
    legacyRetiredAt: text("legacy_retired_at"),
    timeZone: text("time_zone").notNull(),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at").notNull(),
    scheduleDatesJson: jsonArray("schedule_dates_json").$type<readonly string[]>(),
    venue: text(),
    cfpEnabled: bool("cfp_enabled"),
    cfpOpensAt: text("cfp_opens_at"),
    cfpClosesAt: text("cfp_closes_at"),
    defaultDurationMinutes: integer("default_duration_minutes").notNull(),
    defaultCalendarTimeZone: text("default_calendar_time_zone").notNull(),
    defaultCalendarLocation: text("default_calendar_location"),
    version: integer().notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
  },
  (t) => [
    unique("events_organization_id_unique").on(t.organizationId, t.id),
    uniqueIndex("events_organization_slug_unique").on(t.organizationId, t.slug),
    index("events_organization_slug_idx").on(t.organizationId, t.slug),
    check("events_duration_check", sql`${t.defaultDurationMinutes}>0`),
    check("events_status_check", sql`${t.status} in ('draft','active','archived')`),
    check("events_version_check", sql`${t.version}>0`),
    check("events_times_check", sql`${t.endsAt}>${t.startsAt}`),
    check(
      "events_cfp_times_check",
      sql`((${t.cfpOpensAt} is null and ${t.cfpClosesAt} is null) or (${t.cfpOpensAt} is not null and ${t.cfpClosesAt} is not null and ${t.cfpClosesAt}>${t.cfpOpensAt}))`,
    ),
  ],
);

export const eventEmbedConfigurations = sqliteTable(
  "event_embed_configurations",
  {
    id: text().primaryKey().notNull(),
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    widgetId: text("widget_id").notNull(),
    name: text().notNull(),
    theme: text().notNull(),
    outputFormat: text("output_format").notNull(),
    layout: text().notNull(),
    displayFieldsJson: jsonArray("display_fields_json"),
    trackIdsJson: jsonArray("track_ids_json"),
    enabled: bool("enabled"),
    revision: integer().notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.eventId],
      foreignColumns: [events.organizationId, events.id],
    }).onDelete("cascade"),
    unique().on(t.organizationId, t.eventId, t.id),
    unique().on(t.organizationId, t.eventId, t.widgetId),
    index("event_embed_configurations_enabled_idx").on(
      t.organizationId,
      t.eventId,
      t.enabled,
      t.widgetId,
    ),
    check(
      "event_embed_widget_check",
      sql`${t.widgetId} in ('sessions','speakers','agenda','itinerary','gallery')`,
    ),
    check("event_embed_theme_check", sql`${t.theme} in ('auto','light','dark')`),
    check(
      "event_embed_output_check",
      sql`${t.outputFormat} in ('styled-html','basic-html','json','xml','ical')`,
    ),
    check(
      "event_embed_layout_check",
      sql`${t.layout} in ('comfortable','compact','list','grid','timeline')`,
    ),
    check(
      "event_embed_display_json_check",
      sql`json_valid(${t.displayFieldsJson}) and json_type(${t.displayFieldsJson})='array'`,
    ),
    check(
      "event_embed_tracks_json_check",
      sql`json_valid(${t.trackIdsJson}) and json_type(${t.trackIdsJson})='array'`,
    ),
    check("event_embed_enabled_check", sql`${t.enabled} in (0,1)`),
    check("event_embed_revision_check", sql`${t.revision}>0`),
  ],
);

export const rooms = sqliteTable(
  "rooms",
  {
    id: text().primaryKey().notNull(),
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    name: text().notNull(),
    capacity: integer().notNull(),
    version: integer().notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.eventId],
      foreignColumns: [events.organizationId, events.id],
    }).onDelete("cascade"),
    unique().on(t.organizationId, t.id),
    unique().on(t.organizationId, t.eventId, t.id),
    uniqueIndex("rooms_event_name_unique").on(t.organizationId, t.eventId, t.name),
    index("rooms_event_name_idx").on(t.organizationId, t.eventId, t.name),
    check("rooms_capacity_check", sql`${t.capacity}>=0`),
    check("rooms_version_check", sql`${t.version}>0`),
  ],
);
export const roomResources = sqliteTable(
  "room_resources",
  {
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    roomId: text("room_id").notNull(),
    resourceId: text("resource_id").notNull(),
    ordinal: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.eventId, t.roomId, t.resourceId] }),
    foreignKey({
      columns: [t.organizationId, t.eventId, t.roomId],
      foreignColumns: [rooms.organizationId, rooms.eventId, rooms.id],
    }).onDelete("cascade"),
    unique().on(t.organizationId, t.eventId, t.roomId, t.ordinal),
    index("room_resources_resource_idx").on(t.organizationId, t.eventId, t.resourceId),
    check("room_resources_ordinal_check", sql`${t.ordinal}>=0`),
  ],
);

const catalog = (name: string) =>
  sqliteTable(
    name,
    {
      id: text().primaryKey().notNull(),
      organizationId: text("organization_id").notNull(),
      eventId: text("event_id").notNull(),
      name: text().notNull(),
      description: text().notNull().default(""),
      version: integer().notNull(),
      createdAt: text("created_at").notNull(),
      updatedAt: text("updated_at").notNull(),
      createdBy: text("created_by").notNull(),
      updatedBy: text("updated_by").notNull(),
    },
    (t) => [
      foreignKey({
        columns: [t.organizationId, t.eventId],
        foreignColumns: [events.organizationId, events.id],
      }).onDelete("cascade"),
      unique().on(t.organizationId, t.id),
      unique().on(t.organizationId, t.eventId, t.id),
      uniqueIndex(`${name}_event_name_unique`).on(t.organizationId, t.eventId, t.name),
      index(`${name}_event_name_idx`).on(t.organizationId, t.eventId, t.name),
      check(`${name}_version_check`, sql`${t.version}>0`),
    ],
  );
export const tracks = catalog("tracks");
export const formats = catalog("formats");
export const levels = catalog("levels");
export const tags = catalog("tags");

export const sessionStatuses = sqliteTable(
  "session_statuses",
  {
    id: text().primaryKey().notNull(),
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    value: text().notNull(),
    name: text().notNull(),
    description: text().notNull().default(""),
    agendaEligible: bool("agenda_eligible"),
    sortOrder: integer("sort_order").notNull(),
    active: bool("active"),
    version: integer().notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.eventId],
      foreignColumns: [events.organizationId, events.id],
    }).onDelete("cascade"),
    uniqueIndex("session_statuses_value_unique").on(t.organizationId, t.eventId, t.value),
    unique().on(t.organizationId, t.eventId, t.sortOrder),
    index("session_statuses_active_order_idx").on(
      t.organizationId,
      t.eventId,
      t.active,
      t.sortOrder,
    ),
    check("session_statuses_agenda_check", sql`${t.agendaEligible} in(0,1)`),
    check("session_statuses_active_check", sql`${t.active} in(0,1)`),
    check("session_statuses_order_check", sql`${t.sortOrder}>=0`),
    check("session_statuses_version_check", sql`${t.version}>0`),
  ],
);
export const sessionSettings = sqliteTable(
  "session_settings",
  {
    id: text().primaryKey().notNull(),
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    version: integer().notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.eventId],
      foreignColumns: [events.organizationId, events.id],
    }).onDelete("cascade"),
    unique().on(t.organizationId, t.eventId),
    unique().on(t.organizationId, t.eventId, t.id),
    index("session_settings_event_idx").on(t.organizationId, t.eventId),
    check("session_settings_version_check", sql`${t.version}>0`),
  ],
);
