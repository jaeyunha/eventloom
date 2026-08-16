import { and, asc, eq } from "drizzle-orm";

import { createDatabase } from "../../../db/client";
import { eventEmbedConfigurations, events } from "../../../db/schema";
import { eventAllowedDates } from "../../../features/events/event-temporal-dependencies";
import type {
  Event,
  EventAuditEntry,
  EventEmbedConfiguration,
  EventRepository,
  EventRepositoryCommand,
} from "../../../features/events/types";
import { EventRepositoryConflictError } from "../../../features/events/types";
import { airtableSyncStatement, guard as d1Guard } from "./shared";

const EMBED_METADATA_PREFIX = "__osb_embed_v1:";

interface D1MutationResult {
  readonly meta?: { readonly changes?: number };
}

function changed(result: unknown): number {
  return (result as D1MutationResult | undefined)?.meta?.changes ?? 0;
}

function encodeEmbedMetadata(configuration: EventEmbedConfiguration): string {
  return `${EMBED_METADATA_PREFIX}${JSON.stringify({
    accent: configuration.accent,
    backgroundColor: configuration.backgroundColor,
    textColor: configuration.textColor,
    customCss: configuration.customCss,
    statuses: configuration.statuses,
  })}`;
}

function decodeEmbedMetadata(values: readonly string[]): {
  trackIds: string[];
  accent: string;
  backgroundColor: string;
  textColor: string;
  customCss: string;
  statuses: string[];
} {
  const encoded = values.find((value) => value.startsWith(EMBED_METADATA_PREFIX));
  const trackIds = values.filter((value) => !value.startsWith(EMBED_METADATA_PREFIX));
  if (encoded === undefined) {
    return {
      trackIds,
      accent: "#4f5ee8",
      backgroundColor: "#ffffff",
      textColor: "#111827",
      customCss: "",
      statuses: [],
    };
  }
  try {
    const metadata = JSON.parse(encoded.slice(EMBED_METADATA_PREFIX.length)) as Record<
      string,
      unknown
    >;
    return {
      trackIds,
      accent: typeof metadata.accent === "string" ? metadata.accent : "#4f5ee8",
      backgroundColor:
        typeof metadata.backgroundColor === "string" ? metadata.backgroundColor : "#ffffff",
      textColor: typeof metadata.textColor === "string" ? metadata.textColor : "#111827",
      customCss: typeof metadata.customCss === "string" ? metadata.customCss : "",
      statuses: Array.isArray(metadata.statuses)
        ? metadata.statuses.filter((value): value is string => typeof value === "string")
        : [],
    };
  } catch {
    return {
      trackIds,
      accent: "#4f5ee8",
      backgroundColor: "#ffffff",
      textColor: "#111827",
      customCss: "",
      statuses: [],
    };
  }
}

function eventFromRows(
  row: typeof events.$inferSelect,
  embeds: readonly (typeof eventEmbedConfigurations.$inferSelect)[],
): Event {
  return {
    id: row.id,
    organizationId: row.organizationId,
    slug: row.slug,
    name: row.name,
    status: row.status as Event["status"],
    timeZone: row.timeZone,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    ...(row.scheduleDatesJson.length === 0
      ? {}
      : { scheduleDates: row.scheduleDatesJson as readonly string[] }),
    venue: row.venue,
    cfpSettings: {
      enabled: row.cfpEnabled,
      opensAt: row.cfpOpensAt,
      closesAt: row.cfpClosesAt,
    },
    defaultCalendarSettings: {
      durationMinutes: row.defaultDurationMinutes,
      timeZone: row.defaultCalendarTimeZone,
      location: row.defaultCalendarLocation,
    },
    embedConfigurations: embeds.map((embed) => {
      const metadata = decodeEmbedMetadata(embed.trackIdsJson as string[]);
      return {
        id: embed.id,
        name: embed.name,
        widgetId: embed.widgetId as EventEmbedConfiguration["widgetId"],
        enabled: embed.enabled,
        theme: embed.theme as EventEmbedConfiguration["theme"],
        outputFormat: embed.outputFormat as EventEmbedConfiguration["outputFormat"],
        layout: embed.layout as EventEmbedConfiguration["layout"],
        displayFields: embed.displayFieldsJson as EventEmbedConfiguration["displayFields"],
        trackIds: metadata.trackIds,
        accent: metadata.accent,
        backgroundColor: metadata.backgroundColor,
        textColor: metadata.textColor,
        customCss: metadata.customCss,
        statuses: metadata.statuses,
        revision: embed.revision,
      };
    }),
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

function auditFromRow(row: Record<string, unknown>): EventAuditEntry | null {
  if (typeof row.details_json !== "string") return null;
  try {
    return JSON.parse(row.details_json) as EventAuditEntry;
  } catch {
    return null;
  }
}

export class D1EventRepository implements EventRepository {
  readonly #database;

  constructor(private readonly binding: D1Database) {
    this.#database = createDatabase(binding);
  }

  async getEvent(organizationId: string, eventId: string): Promise<Event | null> {
    const [row] = await this.#database
      .select()
      .from(events)
      .where(and(eq(events.organizationId, organizationId), eq(events.id, eventId)))
      .limit(1);
    if (row === undefined) return null;
    return eventFromRows(row, await this.#embeds(organizationId, eventId));
  }

  async listEvents(organizationId: string): Promise<readonly Event[]> {
    const rows = await this.#database
      .select()
      .from(events)
      .where(eq(events.organizationId, organizationId));
    const embeds = await this.#database
      .select()
      .from(eventEmbedConfigurations)
      .where(eq(eventEmbedConfigurations.organizationId, organizationId))
      .orderBy(asc(eventEmbedConfigurations.eventId), asc(eventEmbedConfigurations.id));
    return rows.map((row) =>
      eventFromRows(
        row,
        embeds.filter((embed) => embed.eventId === row.id),
      ),
    );
  }

  async findEventBySlug(organizationId: string, slug: string): Promise<Event | null> {
    const [row] = await this.#database
      .select()
      .from(events)
      .where(and(eq(events.organizationId, organizationId), eq(events.slug, slug)))
      .limit(1);
    if (row === undefined) return null;
    return eventFromRows(row, await this.#embeds(organizationId, row.id));
  }

  async saveEvent(event: Event, expectedVersion: number | null): Promise<void> {
    await this.commitEvent({ event, expectedVersion });
  }

  async commitEvent(command: EventRepositoryCommand): Promise<void> {
    const { event, expectedVersion, audit } = command;
    const primary =
      expectedVersion === null
        ? this.binding
            .prepare(
              `INSERT INTO events (id, organization_id, slug, name, status, time_zone, starts_at, ends_at, schedule_dates_json, venue, cfp_enabled, cfp_opens_at, cfp_closes_at, default_duration_minutes, default_calendar_time_zone, default_calendar_location, version, created_at, updated_at, created_by, updated_by)
               SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                WHERE NOT EXISTS (SELECT 1 FROM events WHERE id = ?)`,
            )
            .bind(...this.#eventValues(event), event.id)
        : this.binding
            .prepare(
              `UPDATE events SET slug = ?, name = ?, status = ?, time_zone = ?, starts_at = ?, ends_at = ?, schedule_dates_json = ?, venue = ?, cfp_enabled = ?, cfp_opens_at = ?, cfp_closes_at = ?, default_duration_minutes = ?, default_calendar_time_zone = ?, default_calendar_location = ?, version = ?, updated_at = ?, updated_by = ?
                WHERE organization_id = ? AND id = ? AND version = ?`,
            )
            .bind(
              event.slug,
              event.name,
              event.status,
              event.timeZone,
              event.startsAt,
              event.endsAt,
              JSON.stringify(event.scheduleDates ?? []),
              event.venue,
              event.cfpSettings.enabled ? 1 : 0,
              event.cfpSettings.opensAt,
              event.cfpSettings.closesAt,
              event.defaultCalendarSettings.durationMinutes,
              event.defaultCalendarSettings.timeZone,
              event.defaultCalendarSettings.location,
              event.version,
              event.updatedAt,
              event.updatedBy,
              event.organizationId,
              event.id,
              expectedVersion,
            );

    const statements: D1PreparedStatement[] = [primary];
    statements.push(
      d1Guard(
        this.binding,
        `NOT EXISTS (
           SELECT 1
             FROM review_plans p
            WHERE p.organization_id = ?
              AND p.event_id = ?
              AND p.closes_at IS NOT NULL
              AND p.closes_at > ?
         )
         AND NOT EXISTS (
           SELECT 1
             FROM review_rounds r
             JOIN review_plans p
               ON p.organization_id = r.organization_id
              AND p.id = r.plan_id
            WHERE p.organization_id = ?
              AND p.event_id = ?
              AND (
                (r.opens_at IS NOT NULL AND r.opens_at > ?)
                OR (r.closes_at IS NOT NULL AND r.closes_at > ?)
              )
         )
         AND NOT EXISTS (
           SELECT 1
             FROM agenda_states s
            WHERE s.organization_id = ?
              AND s.event_id = ?
              AND s.time_zone <> ?
         )
         AND NOT EXISTS (
           SELECT 1
             FROM agenda_entries e
             JOIN agenda_states s
               ON s.organization_id = e.organization_id
              AND s.event_id = e.event_id
            WHERE e.organization_id = ?
              AND e.event_id = ?
              AND (
                e.container_type = 'draft'
                OR (
                  e.container_type = 'revision'
                  AND e.container_id = s.current_published_revision_id
                )
              )
              AND (
                s.time_zone <> ?
                OR e.starts_at < ?
                OR e.ends_at > ?
                OR substr(e.starts_at_local, 1, 10) <> substr(e.ends_at_local, 1, 10)
                OR NOT EXISTS (
                  SELECT 1
                    FROM json_each(?)
                   WHERE value = substr(e.starts_at_local, 1, 10)
                )
              )
         )`,
        [
          event.organizationId,
          event.id,
          event.endsAt,
          event.organizationId,
          event.id,
          event.endsAt,
          event.endsAt,
          event.organizationId,
          event.id,
          event.timeZone,
          event.organizationId,
          event.id,
          event.timeZone,
          event.startsAt,
          event.endsAt,
          JSON.stringify(eventAllowedDates(event)),
        ],
      ),
    );
    const auditId = audit?.id;
    const eventGuard =
      "EXISTS (SELECT 1 FROM events WHERE organization_id = ? AND id = ? AND version = ?)";
    const eventGuardValues = [event.organizationId, event.id, event.version];
    if (audit !== undefined) {
      statements.push(this.#auditStatement(audit, eventGuard, eventGuardValues));
      statements.push(
        this.#syncStatement(event, audit, `EXISTS (SELECT 1 FROM audit_events WHERE id = ?)`),
      );
    }
    if (expectedVersion === null) {
      const createGuard =
        auditId === undefined ? eventGuard : `EXISTS (SELECT 1 FROM audit_events WHERE id = ?)`;
      const createGuardValues = auditId === undefined ? eventGuardValues : [auditId];
      statements.push(
        this.binding
          .prepare(
            `INSERT INTO agenda_states (
               organization_id, event_id, state_version, time_zone,
               minimum_travel_minutes, current_published_revision_id,
               created_at, updated_at
             )
             SELECT ?, ?, 1, ?, 0, NULL, ?, ?
             WHERE ${createGuard}`,
          )
          .bind(
            event.organizationId,
            event.id,
            event.timeZone,
            event.createdAt,
            event.createdAt,
            ...createGuardValues,
          ),
        this.binding
          .prepare(
            `INSERT INTO agenda_drafts (
               organization_id, event_id, version, time_zone, updated_at, updated_by
             )
             SELECT ?, ?, 1, ?, ?, ?
             WHERE EXISTS (
               SELECT 1 FROM agenda_states
               WHERE organization_id = ? AND event_id = ? AND state_version = 1
             )`,
          )
          .bind(
            event.organizationId,
            event.id,
            event.timeZone,
            event.createdAt,
            event.createdBy,
            event.organizationId,
            event.id,
          ),
      );
    }
    const guard =
      auditId === undefined
        ? `organization_id = ? AND event_id = ? AND ${eventGuard}`
        : `organization_id = ? AND event_id = ? AND EXISTS (SELECT 1 FROM audit_events WHERE id = ?)`;
    const guardValues =
      auditId === undefined
        ? [event.organizationId, event.id, ...eventGuardValues]
        : [event.organizationId, event.id, auditId];
    statements.push(
      this.binding
        .prepare(`DELETE FROM event_embed_configurations WHERE ${guard}`)
        .bind(...guardValues),
    );
    for (const embed of event.embedConfigurations) {
      statements.push(
        this.binding
          .prepare(
            `INSERT INTO event_embed_configurations (id, organization_id, event_id, widget_id, name, theme, output_format, layout, display_fields_json, track_ids_json, enabled, revision, created_at, updated_at)
             SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
             WHERE ${auditId === undefined ? "(SELECT version FROM events WHERE organization_id = ? AND id = ?) = ?" : "EXISTS (SELECT 1 FROM audit_events WHERE id = ?)"}`,
          )
          .bind(
            embed.id,
            event.organizationId,
            event.id,
            embed.widgetId,
            embed.name,
            embed.theme,
            embed.outputFormat,
            embed.layout,
            JSON.stringify(embed.displayFields),
            JSON.stringify([...embed.trackIds, encodeEmbedMetadata(embed)]),
            embed.enabled ? 1 : 0,
            embed.revision,
            event.createdAt,
            event.updatedAt,
            ...(auditId === undefined
              ? [event.organizationId, event.id, event.version]
              : [auditId]),
          ),
      );
    }
    const results = await this.binding.batch(statements);
    if (changed(results[0]) !== 1) throw new EventRepositoryConflictError();
  }

  async appendAudit(entry: EventAuditEntry): Promise<void> {
    const event = entry.after ?? entry.before;
    if (event === undefined) {
      throw new Error("Event audit requires a before or after snapshot.");
    }
    await this.binding.batch([
      this.#auditStatement(entry, "1 = 1"),
      this.#syncStatement(event, entry, "1 = 1"),
    ]);
  }

  async listAudit(organizationId: string, eventId: string): Promise<readonly EventAuditEntry[]> {
    const result = await this.binding
      .prepare(
        `SELECT details_json FROM audit_events
         WHERE tenant_id = ? AND resource_type = 'event' AND resource_id = ?
         ORDER BY occurred_at ASC, sequence ASC`,
      )
      .bind(organizationId, eventId)
      .all<Record<string, unknown>>();
    return (result.results ?? []).flatMap((row) => {
      const audit = auditFromRow(row);
      return audit?.organizationId === organizationId && audit.eventId === eventId ? [audit] : [];
    });
  }

  async #embeds(organizationId: string, eventId: string) {
    return this.#database
      .select()
      .from(eventEmbedConfigurations)
      .where(
        and(
          eq(eventEmbedConfigurations.organizationId, organizationId),
          eq(eventEmbedConfigurations.eventId, eventId),
        ),
      )
      .orderBy(asc(eventEmbedConfigurations.id));
  }

  #eventValues(event: Event): unknown[] {
    return [
      event.id,
      event.organizationId,
      event.slug,
      event.name,
      event.status,
      event.timeZone,
      event.startsAt,
      event.endsAt,
      JSON.stringify(event.scheduleDates ?? []),
      event.venue,
      event.cfpSettings.enabled ? 1 : 0,
      event.cfpSettings.opensAt,
      event.cfpSettings.closesAt,
      event.defaultCalendarSettings.durationMinutes,
      event.defaultCalendarSettings.timeZone,
      event.defaultCalendarSettings.location,
      event.version,
      event.createdAt,
      event.updatedAt,
      event.createdBy,
      event.updatedBy,
    ];
  }

  #auditStatement(
    entry: EventAuditEntry,
    condition: string,
    conditionValues: readonly unknown[] = [],
  ): D1PreparedStatement {
    return this.binding
      .prepare(
        `INSERT INTO audit_events (id, tenant_id, actor_type, actor_id, action, resource_type, resource_id, details_json, occurred_at)
         SELECT ?, ?, 'user', ?, ?, 'event', ?, ?, ? WHERE ${condition}`,
      )
      .bind(
        entry.id,
        entry.organizationId,
        entry.actorId,
        entry.action,
        entry.eventId,
        JSON.stringify(entry),
        entry.occurredAt,
        ...conditionValues,
      );
  }

  #syncStatement(event: Event, audit: EventAuditEntry, condition: string): D1PreparedStatement {
    const operation = audit.action === "archived" ? "archive" : "upsert";
    const payloadJson = JSON.stringify(event);
    return airtableSyncStatement(this.binding, {
      id: `sync:${audit.id}`,
      tenantId: event.organizationId,
      entityType: "event",
      applicationId: event.id,
      sourceVersion: event.version,
      operation,
      payloadJson,
      availableAt: audit.occurredAt,
      condition: {
        sql: condition,
        values: condition.includes("?") ? [audit.id] : [],
      },
    });
  }
}
