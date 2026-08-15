import { and, asc, eq, isNull } from "drizzle-orm";

import { createDatabase } from "../../../db/client";
import {
  formats,
  levels,
  roomResources,
  rooms,
  sessionHistory,
  sessionResources,
  sessionSettings,
  sessionSpeakers,
  sessionStatuses,
  sessions,
  sessionTags,
  sessionTracks,
  tags,
  tracks,
} from "../../../db/schema";
import type {
  Format,
  Level,
  Room,
  Session,
  SessionAuditEntry,
  SessionHistoryEntry,
  SessionRepository,
  SessionRepositoryCommand,
  SessionSettings,
  Tag,
  Track,
} from "../../../features/sessions/types";
import { SessionRepositoryConflictError } from "../../../features/sessions/types";
import { airtableSyncStatement } from "./shared";

interface D1MutationResult {
  readonly meta?: { readonly changes?: number };
}

function changed(result: unknown): number {
  return (result as D1MutationResult | undefined)?.meta?.changes ?? 0;
}

function parseObject<T>(value: string | null): T | undefined {
  if (value === null) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function historyFromRow(row: typeof sessionHistory.$inferSelect): SessionHistoryEntry {
  const stored = parseObject<{ history?: SessionHistoryEntry }>(row.snapshotJson);
  if (stored?.history !== undefined) return stored.history;
  return {
    id: row.id,
    action: row.action,
    version: row.version,
    actorId: row.actorId,
    occurredAt: row.occurredAt,
    ...(row.actorLabel === null ? {} : { actorLabel: row.actorLabel }),
    ...(row.priorStatus === null ? {} : { priorStatus: row.priorStatus }),
    ...(row.newStatus === null ? {} : { newStatus: row.newStatus }),
    ...(row.priorContentStatus === null ? {} : { priorContentStatus: row.priorContentStatus }),
    ...(row.newContentStatus === null ? {} : { newContentStatus: row.newContentStatus }),
  };
}

function auditFromRow(row: typeof sessionHistory.$inferSelect): SessionAuditEntry | undefined {
  return parseObject<{ audit?: SessionAuditEntry }>(row.snapshotJson)?.audit;
}

function taxonomyFromRow<T extends Track | Format | Level | Tag>(
  row: typeof tracks.$inferSelect,
  tenantId: string,
  eventId: string,
  history: readonly SessionHistoryEntry[],
): T {
  return {
    id: row.id,
    tenantId,
    eventId,
    name: row.name,
    description: row.description,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    history,
  } as T;
}

export class D1SessionRepository implements SessionRepository {
  readonly #database;

  constructor(private readonly binding: D1Database) {
    this.#database = createDatabase(binding);
  }

  async getSession(tenantId: string, eventId: string, sessionId: string): Promise<Session | null> {
    const [row] = await this.#database
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.organizationId, tenantId),
          eq(sessions.eventId, eventId),
          eq(sessions.id, sessionId),
          isNull(sessions.deletedAt),
        ),
      )
      .limit(1);
    if (row === undefined) return null;
    const [trackRows, tagRows, speakerRows, resourceRows, historyRows] = await Promise.all([
      this.#database
        .select()
        .from(sessionTracks)
        .where(
          and(
            eq(sessionTracks.organizationId, tenantId),
            eq(sessionTracks.eventId, eventId),
            eq(sessionTracks.sessionId, sessionId),
          ),
        )
        .orderBy(asc(sessionTracks.ordinal)),
      this.#database
        .select()
        .from(sessionTags)
        .where(
          and(
            eq(sessionTags.organizationId, tenantId),
            eq(sessionTags.eventId, eventId),
            eq(sessionTags.sessionId, sessionId),
          ),
        )
        .orderBy(asc(sessionTags.ordinal)),
      this.#database
        .select()
        .from(sessionSpeakers)
        .where(
          and(
            eq(sessionSpeakers.organizationId, tenantId),
            eq(sessionSpeakers.eventId, eventId),
            eq(sessionSpeakers.sessionId, sessionId),
          ),
        )
        .orderBy(asc(sessionSpeakers.ordinal)),
      this.#database
        .select()
        .from(sessionResources)
        .where(
          and(
            eq(sessionResources.organizationId, tenantId),
            eq(sessionResources.eventId, eventId),
            eq(sessionResources.sessionId, sessionId),
          ),
        )
        .orderBy(asc(sessionResources.ordinal)),
      this.#history(tenantId, eventId, "session", sessionId),
    ]);
    const trackIds = trackRows.map((item) => item.trackId);
    return {
      id: row.id,
      tenantId: row.organizationId,
      eventId: row.eventId,
      title: row.title,
      description: row.description,
      status: row.status,
      ...(row.contentStatus === null ? {} : { contentStatus: row.contentStatus }),
      durationMinutes: row.durationMinutes,
      capacityRequired: row.capacityRequired,
      ...(row.roomId === null ? {} : { roomId: row.roomId }),
      ...(trackIds[0] === undefined ? {} : { trackId: trackIds[0] }),
      trackIds,
      ...(row.formatId === null ? {} : { formatId: row.formatId }),
      ...(row.levelId === null ? {} : { levelId: row.levelId }),
      tagIds: tagRows.map((item) => item.tagId),
      speakerIds: speakerRows.map((item) => item.speakerId),
      speakerRoster: speakerRows.map((item) => ({
        id: item.speakerId,
        ...(item.displayName === null ? {} : { displayName: item.displayName }),
        ...(item.role === null ? {} : { role: item.role }),
      })),
      resourceIds: resourceRows.map((item) => item.resourceId),
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
      history: historyRows.map(historyFromRow),
    };
  }

  async listSessions(tenantId: string, eventId: string): Promise<readonly Session[]> {
    const rows = await this.#database
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.organizationId, tenantId),
          eq(sessions.eventId, eventId),
          isNull(sessions.deletedAt),
        ),
      )
      .orderBy(asc(sessions.id));
    return (
      await Promise.all(rows.map((row) => this.getSession(tenantId, eventId, row.id)))
    ).filter((value): value is Session => value !== null);
  }

  async putSession(value: Session, expectedVersion: number | null): Promise<void> {
    await this.#commitPut("session", value, expectedVersion);
  }

  async deleteSession(
    tenantId: string,
    eventId: string,
    id: string,
    expectedVersion: number,
  ): Promise<void> {
    await this.#commitDelete("session", tenantId, eventId, id, expectedVersion);
  }

  async getRoom(tenantId: string, eventId: string, roomId: string): Promise<Room | null> {
    const [row] = await this.#database
      .select()
      .from(rooms)
      .where(
        and(eq(rooms.organizationId, tenantId), eq(rooms.eventId, eventId), eq(rooms.id, roomId)),
      )
      .limit(1);
    if (row === undefined) return null;
    const resources = await this.#database
      .select()
      .from(roomResources)
      .where(
        and(
          eq(roomResources.organizationId, tenantId),
          eq(roomResources.eventId, eventId),
          eq(roomResources.roomId, roomId),
        ),
      )
      .orderBy(asc(roomResources.ordinal));
    return {
      id: row.id,
      tenantId,
      eventId,
      name: row.name,
      capacity: row.capacity,
      resources: resources.map((item) => item.resourceId),
      resourceIds: resources.map((item) => item.resourceId),
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
      history: (await this.#history(tenantId, eventId, "room", roomId)).map(historyFromRow),
    };
  }

  async listRooms(tenantId: string, eventId: string): Promise<readonly Room[]> {
    return this.#listByIds(rooms, tenantId, eventId, (id) => this.getRoom(tenantId, eventId, id));
  }
  async putRoom(value: Room, expectedVersion: number | null): Promise<void> {
    await this.#commitPut("room", value, expectedVersion);
  }
  async deleteRoom(
    tenantId: string,
    eventId: string,
    id: string,
    expectedVersion: number,
  ): Promise<void> {
    await this.#commitDelete("room", tenantId, eventId, id, expectedVersion);
  }

  async getTrack(tenantId: string, eventId: string, id: string): Promise<Track | null> {
    return this.#getTaxonomy("track", tracks, tenantId, eventId, id);
  }
  async listTracks(tenantId: string, eventId: string): Promise<readonly Track[]> {
    return this.#listByIds(tracks, tenantId, eventId, (id) => this.getTrack(tenantId, eventId, id));
  }
  async putTrack(value: Track, expectedVersion: number | null): Promise<void> {
    await this.#commitPut("track", value, expectedVersion);
  }
  async deleteTrack(
    tenantId: string,
    eventId: string,
    id: string,
    expectedVersion: number,
  ): Promise<void> {
    await this.#commitDelete("track", tenantId, eventId, id, expectedVersion);
  }

  async getFormat(tenantId: string, eventId: string, id: string): Promise<Format | null> {
    return this.#getTaxonomy("format", formats, tenantId, eventId, id);
  }
  async listFormats(tenantId: string, eventId: string): Promise<readonly Format[]> {
    return this.#listByIds(formats, tenantId, eventId, (id) =>
      this.getFormat(tenantId, eventId, id),
    );
  }
  async putFormat(value: Format, expectedVersion: number | null): Promise<void> {
    await this.#commitPut("format", value, expectedVersion);
  }
  async deleteFormat(
    tenantId: string,
    eventId: string,
    id: string,
    expectedVersion: number,
  ): Promise<void> {
    await this.#commitDelete("format", tenantId, eventId, id, expectedVersion);
  }

  async getLevel(tenantId: string, eventId: string, id: string): Promise<Level | null> {
    return this.#getTaxonomy("level", levels, tenantId, eventId, id);
  }
  async listLevels(tenantId: string, eventId: string): Promise<readonly Level[]> {
    return this.#listByIds(levels, tenantId, eventId, (id) => this.getLevel(tenantId, eventId, id));
  }
  async putLevel(value: Level, expectedVersion: number | null): Promise<void> {
    await this.#commitPut("level", value, expectedVersion);
  }
  async deleteLevel(
    tenantId: string,
    eventId: string,
    id: string,
    expectedVersion: number,
  ): Promise<void> {
    await this.#commitDelete("level", tenantId, eventId, id, expectedVersion);
  }

  async getTag(tenantId: string, eventId: string, id: string): Promise<Tag | null> {
    return this.#getTaxonomy("tag", tags, tenantId, eventId, id);
  }
  async listTags(tenantId: string, eventId: string): Promise<readonly Tag[]> {
    return this.#listByIds(tags, tenantId, eventId, (id) => this.getTag(tenantId, eventId, id));
  }
  async putTag(value: Tag, expectedVersion: number | null): Promise<void> {
    await this.#commitPut("tag", value, expectedVersion);
  }
  async deleteTag(
    tenantId: string,
    eventId: string,
    id: string,
    expectedVersion: number,
  ): Promise<void> {
    await this.#commitDelete("tag", tenantId, eventId, id, expectedVersion);
  }

  async getSettings(tenantId: string, eventId: string): Promise<SessionSettings | null> {
    const [row] = await this.#database
      .select()
      .from(sessionSettings)
      .where(
        and(eq(sessionSettings.organizationId, tenantId), eq(sessionSettings.eventId, eventId)),
      )
      .limit(1);
    if (row === undefined) return null;
    const statuses = await this.#database
      .select()
      .from(sessionStatuses)
      .where(
        and(
          eq(sessionStatuses.organizationId, tenantId),
          eq(sessionStatuses.eventId, eventId),
          eq(sessionStatuses.active, true),
        ),
      )
      .orderBy(asc(sessionStatuses.sortOrder));
    return {
      id: row.id,
      tenantId,
      eventId,
      statuses: statuses.map((item) => item.value),
      agendaEligibleStatuses: statuses
        .filter((item) => item.agendaEligible)
        .map((item) => item.value),
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
      history: (await this.#history(tenantId, eventId, "settings", row.id)).map(historyFromRow),
    };
  }

  async putSettings(value: SessionSettings, expectedVersion: number | null): Promise<void> {
    await this.#commitPut("settings", value, expectedVersion);
  }

  async commit(command: SessionRepositoryCommand): Promise<void> {
    switch (command.operation) {
      case "putSession":
        return this.#commitPut("session", command.value, command.expectedVersion, command.audit);
      case "putRoom":
        return this.#commitPut("room", command.value, command.expectedVersion, command.audit);
      case "putTrack":
        return this.#commitPut("track", command.value, command.expectedVersion, command.audit);
      case "putFormat":
        return this.#commitPut("format", command.value, command.expectedVersion, command.audit);
      case "putLevel":
        return this.#commitPut("level", command.value, command.expectedVersion, command.audit);
      case "putTag":
        return this.#commitPut("tag", command.value, command.expectedVersion, command.audit);
      case "putSettings":
        return this.#commitPut("settings", command.value, command.expectedVersion, command.audit);
      case "deleteSession":
        return this.#commitDelete(
          "session",
          command.tenantId,
          command.eventId,
          command.id,
          command.expectedVersion,
          command.audit,
        );
      case "deleteRoom":
        return this.#commitDelete(
          "room",
          command.tenantId,
          command.eventId,
          command.id,
          command.expectedVersion,
          command.audit,
        );
      case "deleteTrack":
        return this.#commitDelete(
          "track",
          command.tenantId,
          command.eventId,
          command.id,
          command.expectedVersion,
          command.audit,
        );
      case "deleteFormat":
        return this.#commitDelete(
          "format",
          command.tenantId,
          command.eventId,
          command.id,
          command.expectedVersion,
          command.audit,
        );
      case "deleteLevel":
        return this.#commitDelete(
          "level",
          command.tenantId,
          command.eventId,
          command.id,
          command.expectedVersion,
          command.audit,
        );
      case "deleteTag":
        return this.#commitDelete(
          "tag",
          command.tenantId,
          command.eventId,
          command.id,
          command.expectedVersion,
          command.audit,
        );
    }
  }

  async appendAudit(entry: SessionAuditEntry): Promise<void> {
    await this.binding.batch([
      this.#historyStatement(entry, undefined, "1 = 1"),
      this.#syncStatement(entry),
    ]);
  }

  async listAudit(
    tenantId: string,
    eventId: string,
    entityId?: string,
  ): Promise<readonly SessionAuditEntry[]> {
    const rows = await this.#database
      .select()
      .from(sessionHistory)
      .where(
        and(
          eq(sessionHistory.organizationId, tenantId),
          eq(sessionHistory.eventId, eventId),
          ...(entityId === undefined ? [] : [eq(sessionHistory.entityId, entityId)]),
        ),
      )
      .orderBy(asc(sessionHistory.occurredAt), asc(sessionHistory.id));
    return rows.flatMap((row) => {
      const audit = auditFromRow(row);
      return audit?.tenantId === tenantId && audit.eventId === eventId ? [audit] : [];
    });
  }

  async #getTaxonomy<T extends Track | Format | Level | Tag>(
    type: ResourceType,
    table: typeof tracks,
    tenantId: string,
    eventId: string,
    id: string,
  ): Promise<T | null> {
    const [row] = await this.#database
      .select()
      .from(table)
      .where(and(eq(table.organizationId, tenantId), eq(table.eventId, eventId), eq(table.id, id)))
      .limit(1);
    return row === undefined
      ? null
      : taxonomyFromRow<T>(
          row,
          tenantId,
          eventId,
          (await this.#history(tenantId, eventId, type, id)).map(historyFromRow),
        );
  }

  async #listByIds<T>(
    table: typeof rooms | typeof tracks,
    tenantId: string,
    eventId: string,
    get: (id: string) => Promise<T | null>,
  ): Promise<T[]> {
    const rows = await this.#database
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.organizationId, tenantId), eq(table.eventId, eventId)))
      .orderBy(asc(table.id));
    const values = await Promise.all(rows.map((row) => get(row.id)));
    return values.filter((value) => value !== null) as T[];
  }

  #history(tenantId: string, eventId: string, type: ResourceType, id: string) {
    return this.#database
      .select()
      .from(sessionHistory)
      .where(
        and(
          eq(sessionHistory.organizationId, tenantId),
          eq(sessionHistory.eventId, eventId),
          eq(sessionHistory.entityType, type),
          eq(sessionHistory.entityId, id),
        ),
      )
      .orderBy(asc(sessionHistory.version), asc(sessionHistory.occurredAt), asc(sessionHistory.id));
  }

  async #commitPut(
    type: ResourceType,
    value: PutValue,
    expectedVersion: number | null,
    audit?: SessionAuditEntry,
  ): Promise<void> {
    const primary = this.#putStatement(type, value, expectedVersion);
    const statements: D1PreparedStatement[] = [primary];
    if (audit !== undefined) {
      statements.push(
        this.#historyStatement(audit, this.#latestHistory(value), "changes() = 1"),
        this.#syncStatement(audit, value),
      );
    }
    if (type === "session")
      statements.push(...this.#sessionJoinStatements(value as Session, audit));
    if (type === "room") statements.push(...this.#roomResourceStatements(value as Room, audit));
    if (type === "settings")
      statements.push(...this.#statusStatements(value as SessionSettings, audit));
    const results = await this.binding.batch(statements);
    if (changed(results[0]) !== 1) throw new SessionRepositoryConflictError();
  }

  async #commitDelete(
    type: ResourceType,
    tenantId: string,
    eventId: string,
    id: string,
    expectedVersion: number,
    audit?: SessionAuditEntry,
  ): Promise<void> {
    const table = tableName(type);
    const primary = this.binding
      .prepare(
        `DELETE FROM ${table} WHERE organization_id = ? AND event_id = ? AND id = ? AND version = ?`,
      )
      .bind(tenantId, eventId, id, expectedVersion);
    const statements = [primary];
    if (audit !== undefined) {
      statements.push(
        this.#historyStatement(audit, undefined, "changes() = 1"),
        this.#syncStatement(audit),
      );
    }
    const results = await this.binding.batch(statements);
    if (changed(results[0]) !== 1) throw new SessionRepositoryConflictError();
  }

  #putStatement(
    type: ResourceType,
    value: PutValue,
    expectedVersion: number | null,
  ): D1PreparedStatement {
    const table = tableName(type);
    const fields =
      type === "session"
        ? [
            "title",
            "description",
            "status",
            "content_status",
            "duration_minutes",
            "capacity_required",
            "room_id",
            "format_id",
            "level_id",
          ]
        : type === "room"
          ? ["name", "capacity"]
          : type === "settings"
            ? []
            : ["name", "description"];
    const fieldValues =
      type === "session"
        ? [
            (value as Session).title,
            (value as Session).description,
            (value as Session).status,
            (value as Session).contentStatus ?? null,
            (value as Session).durationMinutes,
            (value as Session).capacityRequired,
            (value as Session).roomId ?? null,
            (value as Session).formatId ?? null,
            (value as Session).levelId ?? null,
          ]
        : type === "room"
          ? [(value as Room).name, (value as Room).capacity]
          : type === "settings"
            ? []
            : [(value as Track).name, (value as Track).description];
    if (expectedVersion === null) {
      const columns = [
        "id",
        "organization_id",
        "event_id",
        ...fields,
        "version",
        "created_at",
        "updated_at",
        "created_by",
        "updated_by",
      ];
      return this.binding
        .prepare(
          `INSERT INTO ${table} (${columns.join(", ")}) SELECT ${columns.map(() => "?").join(", ")} WHERE NOT EXISTS (SELECT 1 FROM ${table} WHERE id = ?)`,
        )
        .bind(
          value.id,
          value.tenantId,
          value.eventId,
          ...fieldValues,
          value.version,
          value.createdAt,
          value.updatedAt,
          value.createdBy,
          value.updatedBy,
          value.id,
        );
    }
    return this.binding
      .prepare(
        `UPDATE ${table} SET ${[...fields.map((field) => `${field} = ?`), "version = ?", "updated_at = ?", "updated_by = ?"].join(", ")} WHERE organization_id = ? AND event_id = ? AND id = ? AND version = ?`,
      )
      .bind(
        ...fieldValues,
        value.version,
        value.updatedAt,
        value.updatedBy,
        value.tenantId,
        value.eventId,
        value.id,
        expectedVersion,
      );
  }

  #sessionJoinStatements(value: Session, audit?: SessionAuditEntry): D1PreparedStatement[] {
    const guard =
      audit === undefined
        ? `(SELECT version FROM sessions WHERE organization_id = ? AND event_id = ? AND id = ?) = ?`
        : `EXISTS (SELECT 1 FROM session_history WHERE id = ?)`;
    const guardValues =
      audit === undefined ? [value.tenantId, value.eventId, value.id, value.version] : [audit.id];
    const statements: D1PreparedStatement[] = [
      "session_tracks",
      "session_tags",
      "session_speakers",
      "session_resources",
    ].map((table) =>
      this.binding
        .prepare(
          `DELETE FROM ${table} WHERE organization_id = ? AND event_id = ? AND session_id = ? AND ${guard}`,
        )
        .bind(value.tenantId, value.eventId, value.id, ...guardValues),
    );
    const inserts: readonly [string, readonly { id: string; extra?: readonly unknown[] }[]][] = [
      ["session_tracks", value.trackIds.map((id) => ({ id }))],
      ["session_tags", value.tagIds.map((id) => ({ id }))],
      [
        "session_speakers",
        value.speakerRoster.map((item) => ({
          id: item.id,
          extra: [item.displayName ?? null, item.role ?? null],
        })),
      ],
      ["session_resources", value.resourceIds.map((id) => ({ id }))],
    ];
    for (const [table, items] of inserts) {
      items.forEach((item, ordinal) => {
        statements.push(
          this.binding
            .prepare(
              `INSERT INTO ${table} (organization_id, event_id, session_id, ${table === "session_tracks" ? "track_id" : table === "session_tags" ? "tag_id" : table === "session_speakers" ? "speaker_id, display_name, role" : "resource_id"}, ordinal) SELECT ?, ?, ?, ${item.extra === undefined ? "?" : "?, ?, ?"}, ? WHERE ${guard}`,
            )
            .bind(
              value.tenantId,
              value.eventId,
              value.id,
              item.id,
              ...(item.extra ?? []),
              ordinal,
              ...guardValues,
            ),
        );
      });
    }
    return statements;
  }

  #roomResourceStatements(value: Room, audit?: SessionAuditEntry): D1PreparedStatement[] {
    const resources = value.resources.length > 0 ? value.resources : (value.resourceIds ?? []);
    const guard =
      audit === undefined
        ? `(SELECT version FROM rooms WHERE organization_id = ? AND event_id = ? AND id = ?) = ?`
        : `EXISTS (SELECT 1 FROM session_history WHERE id = ?)`;
    const guardValues =
      audit === undefined ? [value.tenantId, value.eventId, value.id, value.version] : [audit.id];
    return [
      this.binding
        .prepare(
          `DELETE FROM room_resources WHERE organization_id = ? AND event_id = ? AND room_id = ? AND ${guard}`,
        )
        .bind(value.tenantId, value.eventId, value.id, ...guardValues),
      ...resources.map((id, ordinal) =>
        this.binding
          .prepare(
            `INSERT INTO room_resources (organization_id, event_id, room_id, resource_id, ordinal) SELECT ?, ?, ?, ?, ? WHERE ${guard}`,
          )
          .bind(value.tenantId, value.eventId, value.id, id, ordinal, ...guardValues),
      ),
    ];
  }

  #statusStatements(value: SessionSettings, audit?: SessionAuditEntry): D1PreparedStatement[] {
    const guard =
      audit === undefined
        ? `(SELECT version FROM session_settings WHERE organization_id = ? AND event_id = ?) = ?`
        : `EXISTS (SELECT 1 FROM session_history WHERE id = ?)`;
    const guardValues =
      audit === undefined ? [value.tenantId, value.eventId, value.version] : [audit.id];
    return [
      this.binding
        .prepare(
          `UPDATE session_statuses SET active = 0, sort_order = 1000000 + rowid, version = ?, updated_at = ? WHERE organization_id = ? AND event_id = ? AND ${guard}`,
        )
        .bind(
          value.version,
          value.updatedAt,
          value.tenantId,
          value.eventId,
          ...guardValues,
        ),
      ...value.statuses.map((status, ordinal) =>
        this.binding
          .prepare(
            `UPDATE session_statuses SET name = ?, description = '', agenda_eligible = ?, sort_order = ?, active = 1, version = ?, updated_at = ? WHERE organization_id = ? AND event_id = ? AND value = ? AND ${guard}`,
          )
          .bind(
            status,
            value.agendaEligibleStatuses.includes(status) ? 1 : 0,
            ordinal,
            value.version,
            value.updatedAt,
            value.tenantId,
            value.eventId,
            status,
            ...guardValues,
          ),
      ),
      ...value.statuses.map((status, ordinal) =>
        this.binding
          .prepare(
            `INSERT INTO session_statuses (id, organization_id, event_id, value, name, description, agenda_eligible, sort_order, active, version, created_at, updated_at) SELECT ?, ?, ?, ?, ?, '', ?, ?, 1, ?, ?, ? WHERE ${guard} AND NOT EXISTS (SELECT 1 FROM session_statuses WHERE organization_id = ? AND event_id = ? AND value = ?)`,
          )
          .bind(
            `status_${crypto.randomUUID()}`,
            value.tenantId,
            value.eventId,
            status,
            status,
            value.agendaEligibleStatuses.includes(status) ? 1 : 0,
            ordinal,
            value.version,
            value.createdAt,
            value.updatedAt,
            ...guardValues,
            value.tenantId,
            value.eventId,
            status,
          ),
      ),
    ];
  }

  #latestHistory(value: PutValue): SessionHistoryEntry | undefined {
    return value.history[value.history.length - 1];
  }

  #historyStatement(
    audit: SessionAuditEntry,
    history: SessionHistoryEntry | undefined,
    condition: string,
  ): D1PreparedStatement {
    return this.binding
      .prepare(
        `INSERT INTO session_history (id, organization_id, event_id, entity_type, entity_id, action, version, actor_id, actor_label, occurred_at, prior_status, new_status, prior_content_status, new_content_status, snapshot_json) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${condition}`,
      )
      .bind(
        audit.id,
        audit.tenantId,
        audit.eventId,
        audit.entityType,
        audit.entityId,
        audit.action,
        audit.version,
        audit.actorId,
        history?.actorLabel ?? null,
        audit.occurredAt,
        history?.priorStatus ?? null,
        history?.newStatus ?? null,
        history?.priorContentStatus ?? null,
        history?.newContentStatus ?? null,
        JSON.stringify({ audit, ...(history === undefined ? {} : { history }) }),
      );
  }

  #syncStatement(audit: SessionAuditEntry, value?: PutValue): D1PreparedStatement {
    const operation = audit.action === "deleted" ? "delete" : "upsert";
    return airtableSyncStatement(this.binding, {
      id: `sync:${audit.id}`,
      tenantId: audit.tenantId,
      entityType: audit.entityType,
      applicationId: audit.entityId,
      sourceVersion: audit.version,
      operation,
      payloadJson: JSON.stringify(value ?? audit.before ?? {}),
      availableAt: audit.occurredAt,
      condition: {
        sql: "EXISTS (SELECT 1 FROM session_history WHERE id = ?)",
        values: [audit.id],
      },
    });
  }
}

type ResourceType = "session" | "room" | "track" | "format" | "level" | "tag" | "settings";
type PutValue = Session | Room | Track | Format | Level | Tag | SessionSettings;
function tableName(type: ResourceType): string {
  return type === "settings" ? "session_settings" : type === "session" ? "sessions" : `${type}s`;
}
