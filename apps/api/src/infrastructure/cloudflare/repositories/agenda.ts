import { AgendaRepositoryConflictError } from "../../../features/agenda/infrastructure";
import type {
  AgendaAuditEntry,
  AgendaEntry,
  AgendaRepository,
  AgendaState,
  AgendaSuggestionRun,
  PublishedAgendaRevision,
} from "../../../features/agenda/types";

interface Row extends Record<string, unknown> {}
interface RunResult {
  readonly meta?: { readonly changes?: number };
}

const json = (value: unknown): string => JSON.stringify(value);
const text = (value: unknown): string => String(value);
const nullable = (value: unknown): string | null => (value == null ? null : String(value));
const number = (value: unknown): number => Number(value);

function parse<T>(value: unknown): T {
  return JSON.parse(String(value)) as T;
}

function statement(
  db: D1Database,
  sql: string,
  values: readonly unknown[] = [],
): D1PreparedStatement {
  return db.prepare(sql).bind(...values);
}

function entryFrom(row: Row, tracks: readonly string[]): AgendaEntry {
  return {
    id: text(row.id),
    sessionId: text(row.session_id),
    roomId: text(row.room_id),
    trackIds: tracks,
    startsAt: text(row.starts_at),
    endsAt: text(row.ends_at),
    startsAtLocal: text(row.starts_at_local),
    endsAtLocal: text(row.ends_at_local),
    timeZone: text(row.time_zone),
    metadata: {
      title: text(row.title),
      summary: text(row.summary),
      format: text(row.format),
      speakerNames: parse<string[]>(row.speaker_names_json),
      roomName: text(row.room_name),
      trackNames: parse<string[]>(row.track_names_json),
    },
  };
}

function releaseFrom(
  row: Row,
  entries: readonly AgendaEntry[],
  overrides: AgendaState["draft"]["warningOverrides"],
): PublishedAgendaRevision {
  return {
    id: text(row.id),
    eventId: text(row.event_id),
    revisionNumber: number(row.revision_number),
    sourceDraftVersion: number(row.source_draft_version),
    timeZone: text(row.time_zone),
    entries,
    warningOverrides: overrides,
    publishedAt: text(row.published_at),
    publishedBy: text(row.published_by),
    rollbackOfRevisionId: nullable(row.rollback_of_revision_id),
  };
}

function entryStatements(
  db: D1Database,
  organizationId: string,
  eventId: string,
  containerType: string,
  containerId: string,
  entries: readonly AgendaEntry[],
  token: string,
): D1PreparedStatement[] {
  const result: D1PreparedStatement[] = [];
  for (const entry of entries) {
    const metadata = entry.metadata ?? {
      title: "",
      summary: "",
      format: "",
      speakerNames: [],
      roomName: "",
      trackNames: [],
    };
    result.push(
      statement(
        db,
        `INSERT INTO agenda_entries
      (id, organization_id, event_id, container_type, container_id, session_id, room_id, starts_at, ends_at, starts_at_local, ends_at_local, time_zone, title, summary, format, speaker_names_json, room_name, track_names_json)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS
      (SELECT 1 FROM agenda_states WHERE organization_id=? AND event_id=? AND updated_at=?)`,
        [
          entry.id,
          organizationId,
          eventId,
          containerType,
          containerId,
          entry.sessionId,
          entry.roomId,
          entry.startsAt,
          entry.endsAt,
          entry.startsAtLocal,
          entry.endsAtLocal,
          entry.timeZone,
          metadata.title,
          metadata.summary,
          metadata.format,
          json(metadata.speakerNames),
          metadata.roomName,
          json(metadata.trackNames),
          organizationId,
          eventId,
          token,
        ],
      ),
    );
    for (const [ordinal, trackId] of entry.trackIds.entries()) {
      result.push(
        statement(
          db,
          `INSERT INTO agenda_entry_tracks
        (organization_id,event_id,container_type,container_id,entry_id,track_id,ordinal)
        SELECT ?,?,?,?,?,?,? WHERE EXISTS
        (SELECT 1 FROM agenda_entries WHERE organization_id=? AND event_id=? AND container_type=? AND container_id=? AND id=?)`,
          [
            organizationId,
            eventId,
            containerType,
            containerId,
            entry.id,
            trackId,
            ordinal,
            organizationId,
            eventId,
            containerType,
            containerId,
            entry.id,
          ],
        ),
      );
    }
  }
  return result;
}

/** D1-backed agenda aggregate. One instance is scoped to one organization. */
export class D1AgendaRepository implements AgendaRepository {
  constructor(
    private readonly db: D1Database,
    private readonly organizationId: string,
  ) {}

  async load(eventId: string): Promise<AgendaState | null> {
    const root = await this.db
      .prepare("SELECT * FROM agenda_states WHERE organization_id=? AND event_id=?")
      .bind(this.organizationId, eventId)
      .first<Row>();
    if (root === null) return null;

    const [
      draftRow,
      sessionRows,
      roomRows,
      trackRows,
      revisionRows,
      outboxRows,
      auditRows,
      runRows,
    ] = await Promise.all([
      this.db
        .prepare("SELECT * FROM agenda_drafts WHERE organization_id=? AND event_id=?")
        .bind(this.organizationId, eventId)
        .first<Row>(),
      this.db
        .prepare(`SELECT s.*, COALESCE((SELECT json_group_array(speaker_id) FROM session_speakers x WHERE x.organization_id=s.organization_id AND x.event_id=s.event_id AND x.session_id=s.id),'[]') participant_ids_json,
        COALESCE((SELECT json_group_array(resource_id) FROM session_resources x WHERE x.organization_id=s.organization_id AND x.event_id=s.event_id AND x.session_id=s.id),'[]') resource_ids_json,
        COALESCE((SELECT json_group_array(display_name) FROM session_speakers x WHERE x.organization_id=s.organization_id AND x.event_id=s.event_id AND x.session_id=s.id AND display_name IS NOT NULL),'[]') speaker_names_json,
        COALESCE((SELECT json_group_array(track_id) FROM session_tracks x WHERE x.organization_id=s.organization_id AND x.event_id=s.event_id AND x.session_id=s.id ORDER BY ordinal),'[]') track_ids_json
        FROM sessions s WHERE organization_id=? AND event_id=? AND deleted_at IS NULL ORDER BY id`)
        .bind(this.organizationId, eventId)
        .all<Row>(),
      this.db
        .prepare(
          "SELECT id,name,capacity FROM rooms WHERE organization_id=? AND event_id=? ORDER BY id",
        )
        .bind(this.organizationId, eventId)
        .all<Row>(),
      this.db
        .prepare("SELECT id,name FROM tracks WHERE organization_id=? AND event_id=? ORDER BY id")
        .bind(this.organizationId, eventId)
        .all<Row>(),
      this.db
        .prepare(
          "SELECT * FROM agenda_revisions WHERE organization_id=? AND event_id=? ORDER BY revision_number",
        )
        .bind(this.organizationId, eventId)
        .all<Row>(),
      this.db
        .prepare(
          "SELECT * FROM agenda_outbox_events WHERE organization_id=? AND event_id=? ORDER BY created_at,id",
        )
        .bind(this.organizationId, eventId)
        .all<Row>(),
      this.db
        .prepare(
          "SELECT * FROM audit_events WHERE tenant_id=? AND resource_type='agenda' AND resource_id=? ORDER BY sequence",
        )
        .bind(this.organizationId, eventId)
        .all<Row>(),
      this.db
        .prepare(
          "SELECT * FROM agenda_suggestion_runs WHERE organization_id=? AND event_id=? ORDER BY generated_at,id",
        )
        .bind(this.organizationId, eventId)
        .all<Row>(),
    ]);
    if (draftRow === null) throw new Error(`Agenda ${eventId} has no draft row`);

    const loadEntries = async (
      containerType: string,
      containerId: string,
    ): Promise<AgendaEntry[]> => {
      const rows = await this.db
        .prepare(
          `SELECT e.*, COALESCE((SELECT json_group_array(track_id) FROM agenda_entry_tracks t WHERE t.organization_id=e.organization_id AND t.event_id=e.event_id AND t.container_type=e.container_type AND t.container_id=e.container_id AND t.entry_id=e.id ORDER BY ordinal),'[]') track_ids_json FROM agenda_entries e WHERE organization_id=? AND event_id=? AND container_type=? AND container_id=? ORDER BY starts_at,id`,
        )
        .bind(this.organizationId, eventId, containerType, containerId)
        .all<Row>();
      return (rows.results ?? []).map((row) => entryFrom(row, parse<string[]>(row.track_ids_json)));
    };
    const draftEntries = await loadEntries("draft", eventId);
    const overrideRows = await this.db
      .prepare(
        "SELECT * FROM agenda_warning_overrides WHERE organization_id=? AND event_id=? AND draft_version=? ORDER BY created_at,warning_id",
      )
      .bind(this.organizationId, eventId, number(draftRow.version))
      .all<Row>();
    const warningOverrides = (overrideRows.results ?? []).map((row) => ({
      warningId: text(row.warning_id),
      reason: text(row.reason),
      actorId: text(row.actor_id),
      createdAt: text(row.created_at),
    }));

    const revisions: PublishedAgendaRevision[] = [];
    for (const row of revisionRows.results ?? []) {
      const entries = await loadEntries("revision", text(row.id));
      revisions.push(releaseFrom(row, entries, []));
    }
    const suggestionRuns: AgendaSuggestionRun[] = [];
    for (const row of runRows.results ?? []) {
      const changes = await this.db
        .prepare(
          "SELECT * FROM agenda_suggestion_changes WHERE organization_id=? AND event_id=? AND run_id=? ORDER BY id",
        )
        .bind(this.organizationId, eventId, text(row.id))
        .all<Row>();
      const criteria = parse<AgendaSuggestionRun["criteria"]>(row.criteria_json);
      const diff = parse<AgendaSuggestionRun["diff"]>(row.diff_json);
      suggestionRuns.push({
        id: text(row.id),
        eventId,
        version: number(row.version),
        status: row.status as AgendaSuggestionRun["status"],
        baseDraftVersion: number(row.base_draft_version),
        baseDraftRevision: number(row.base_draft_revision),
        baseEntries: await loadEntries("suggestion_base", text(row.id)),
        criteria,
        criteriaSnapshot: criteria,
        placements: await loadEntries("suggestion_proposed", text(row.id)),
        proposedEntries: await loadEntries("suggestion_proposed", text(row.id)),
        diff: {
          ...diff,
          changes: (changes.results ?? []).map((change) => ({
            id: text(change.id),
            kind: change.kind as never,
            entryId: text(change.entry_id),
            sessionId: text(change.session_id),
            before: change.before_json == null ? null : parse(change.before_json),
            after: change.after_json == null ? null : parse(change.after_json),
            summary: text(change.summary),
            ...(change.rationale == null ? {} : { rationale: text(change.rationale) }),
          })),
        },
        candidateDiagnostics: parse(row.diagnostics_json),
        generatedAt: text(row.generated_at),
        generatedBy: text(row.generated_by),
        regenerationOfRunId: nullable(row.regeneration_of_run_id),
        acceptedChangeIds: parse(row.accepted_change_ids_json),
        appliedChangeIds: parse(row.applied_change_ids_json),
        ...(row.rejected_at == null
          ? {}
          : { rejectedAt: text(row.rejected_at), rejectedBy: text(row.rejected_by) }),
        ...(row.superseded_at == null ? {} : { supersededAt: text(row.superseded_at) }),
        ...(row.applied_at == null
          ? {}
          : { appliedAt: text(row.applied_at), appliedBy: text(row.applied_by) }),
      });
    }

    return {
      eventId,
      stateVersion: number(root.state_version),
      timeZone: text(root.time_zone),
      minimumTravelMinutes: number(root.minimum_travel_minutes),
      sessions: (sessionRows.results ?? []).map((row) => ({
        id: text(row.id),
        title: text(row.title),
        status: text(row.status),
        participantIds: parse(row.participant_ids_json),
        resourceIds: parse(row.resource_ids_json),
        capacityRequired: number(row.capacity_required),
        durationMinutes: number(row.duration_minutes),
        summary: text(row.description),
        format: "",
        speakerNames: parse(row.speaker_names_json),
        trackIds: parse(row.track_ids_json),
      })),
      rooms: (roomRows.results ?? []).map((row) => ({
        id: text(row.id),
        name: text(row.name),
        capacity: number(row.capacity),
      })),
      tracks: (trackRows.results ?? []).map((row) => ({ id: text(row.id), name: text(row.name) })),
      draft: {
        eventId,
        version: number(draftRow.version),
        timeZone: text(draftRow.time_zone),
        entries: draftEntries,
        warningOverrides,
        updatedAt: text(draftRow.updated_at),
        updatedBy: text(draftRow.updated_by),
      },
      revisions,
      currentPublishedRevisionId: nullable(root.current_published_revision_id),
      outbox: (outboxRows.results ?? []).map((row) => ({
        id: text(row.id),
        eventId,
        revisionId: text(row.revision_id),
        type: row.type as never,
        idempotencyKey: text(row.idempotency_key),
        createdAt: text(row.created_at),
      })),
      audit: (auditRows.results ?? []).map((row) => ({
        id: text(row.id),
        eventId,
        actorId: text(row.actor_id),
        action: row.action as AgendaAuditEntry["action"],
        createdAt: text(row.occurred_at),
        details: row.details_json == null ? {} : parse(row.details_json),
      })),
      suggestionRuns,
    };
  }

  async compareAndSwap(
    eventId: string,
    expectedStateVersion: number | null,
    next: AgendaState,
  ): Promise<void> {
    if (next.eventId !== eventId || next.stateVersion !== (expectedStateVersion ?? 0) + 1)
      throw new AgendaRepositoryConflictError(eventId);
    const current = await this.load(eventId);
    if ((current?.stateVersion ?? null) !== expectedStateVersion)
      throw new AgendaRepositoryConflictError(eventId);
    const token = crypto.randomUUID();
    const statements: D1PreparedStatement[] = [];
    if (expectedStateVersion === null) {
      statements.push(
        statement(
          this.db,
          `INSERT INTO agenda_states (organization_id,event_id,state_version,time_zone,minimum_travel_minutes,current_published_revision_id,created_at,updated_at)
        SELECT ?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM agenda_states WHERE organization_id=? AND event_id=?)`,
          [
            this.organizationId,
            eventId,
            next.stateVersion,
            next.timeZone,
            next.minimumTravelMinutes,
            next.currentPublishedRevisionId,
            token,
            token,
            this.organizationId,
            eventId,
          ],
        ),
      );
      statements.push(
        statement(
          this.db,
          `INSERT INTO agenda_drafts (organization_id,event_id,version,time_zone,updated_at,updated_by)
        SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM agenda_states WHERE organization_id=? AND event_id=? AND state_version=? AND updated_at=?)`,
          [
            this.organizationId,
            eventId,
            next.draft.version,
            next.draft.timeZone,
            token,
            next.draft.updatedBy,
            this.organizationId,
            eventId,
            next.stateVersion,
            token,
          ],
        ),
      );
    } else {
      statements.push(
        statement(
          this.db,
          `UPDATE agenda_states SET state_version=?,time_zone=?,minimum_travel_minutes=?,current_published_revision_id=?,updated_at=? WHERE organization_id=? AND event_id=? AND state_version=?`,
          [
            next.stateVersion,
            next.timeZone,
            next.minimumTravelMinutes,
            next.currentPublishedRevisionId,
            token,
            this.organizationId,
            eventId,
            expectedStateVersion,
          ],
        ),
      );
      statements.push(
        statement(
          this.db,
          `DELETE FROM agenda_entry_tracks WHERE organization_id=? AND event_id=? AND container_type='draft' AND EXISTS (SELECT 1 FROM agenda_states WHERE organization_id=? AND event_id=? AND state_version=? AND updated_at=?)`,
          [this.organizationId, eventId, this.organizationId, eventId, next.stateVersion, token],
        ),
      );
      statements.push(
        statement(
          this.db,
          `DELETE FROM agenda_entries WHERE organization_id=? AND event_id=? AND container_type='draft' AND EXISTS (SELECT 1 FROM agenda_states WHERE organization_id=? AND event_id=? AND state_version=? AND updated_at=?)`,
          [this.organizationId, eventId, this.organizationId, eventId, next.stateVersion, token],
        ),
      );
      statements.push(
        statement(
          this.db,
          `DELETE FROM agenda_warning_overrides WHERE organization_id=? AND event_id=? AND EXISTS (SELECT 1 FROM agenda_states WHERE organization_id=? AND event_id=? AND state_version=? AND updated_at=?)`,
          [this.organizationId, eventId, this.organizationId, eventId, next.stateVersion, token],
        ),
      );
      statements.push(
        statement(
          this.db,
          `UPDATE agenda_drafts SET version=?,time_zone=?,updated_at=?,updated_by=? WHERE organization_id=? AND event_id=? AND EXISTS (SELECT 1 FROM agenda_states WHERE organization_id=? AND event_id=? AND state_version=? AND updated_at=?)`,
          [
            next.draft.version,
            next.draft.timeZone,
            token,
            next.draft.updatedBy,
            this.organizationId,
            eventId,
            this.organizationId,
            eventId,
            next.stateVersion,
            token,
          ],
        ),
      );
    }
    for (const prepared of entryStatements(
      this.db,
      this.organizationId,
      eventId,
      "draft",
      eventId,
      next.draft.entries,
      token,
    ))
      statements.push(prepared);
    for (const override of next.draft.warningOverrides)
      statements.push(
        statement(
          this.db,
          `INSERT INTO agenda_warning_overrides (organization_id,event_id,draft_version,warning_id,reason,actor_id,created_at)
      SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM agenda_states WHERE organization_id=? AND event_id=? AND state_version=? AND updated_at=?)`,
          [
            this.organizationId,
            eventId,
            next.draft.version,
            override.warningId,
            override.reason,
            override.actorId,
            override.createdAt,
            this.organizationId,
            eventId,
            next.stateVersion,
            token,
          ],
        ),
      );

    const oldRevisionIds = new Set(current?.revisions.map((item) => item.id) ?? []);
    for (const revision of next.revisions)
      if (!oldRevisionIds.has(revision.id)) {
        statements.push(
          statement(
            this.db,
            `INSERT INTO agenda_revisions (id,organization_id,event_id,revision_number,source_draft_version,time_zone,published_at,published_by,rollback_of_revision_id,source_hash)
        SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM agenda_states WHERE organization_id=? AND event_id=? AND state_version=? AND updated_at=?)`,
            [
              revision.id,
              this.organizationId,
              eventId,
              revision.revisionNumber,
              revision.sourceDraftVersion,
              revision.timeZone,
              revision.publishedAt,
              revision.publishedBy,
              revision.rollbackOfRevisionId,
              revision.id,
              this.organizationId,
              eventId,
              next.stateVersion,
              token,
            ],
          ),
        );
        for (const entryStatement of entryStatements(
          this.db,
          this.organizationId,
          eventId,
          "revision",
          revision.id,
          revision.entries,
          token,
        ))
          statements.push(entryStatement);
      }
    const oldRunIds = new Set(current?.suggestionRuns.map((item) => item.id) ?? []);
    for (const run of next.suggestionRuns) {
      if (oldRunIds.has(run.id))
        statements.push(
          statement(
            this.db,
            `UPDATE agenda_suggestion_runs SET status=?,accepted_change_ids_json=?,applied_change_ids_json=?,rejected_at=?,rejected_by=?,superseded_at=?,applied_at=?,applied_by=? WHERE organization_id=? AND event_id=? AND id=? AND EXISTS (SELECT 1 FROM agenda_states WHERE organization_id=? AND event_id=? AND state_version=? AND updated_at=?)`,
            [
              run.status,
              json(run.acceptedChangeIds),
              json(run.appliedChangeIds),
              run.rejectedAt ?? null,
              run.rejectedBy ?? null,
              run.supersededAt ?? null,
              run.appliedAt ?? null,
              run.appliedBy ?? null,
              this.organizationId,
              eventId,
              run.id,
              this.organizationId,
              eventId,
              next.stateVersion,
              token,
            ],
          ),
        );
      else {
        statements.push(
          statement(
            this.db,
            `INSERT INTO agenda_suggestion_runs (id,organization_id,event_id,version,status,base_draft_version,base_draft_revision,criteria_json,diff_json,diagnostics_json,generated_at,generated_by,regeneration_of_run_id,accepted_change_ids_json,applied_change_ids_json,rejected_at,rejected_by,superseded_at,applied_at,applied_by)
          SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM agenda_states WHERE organization_id=? AND event_id=? AND state_version=? AND updated_at=?)`,
            [
              run.id,
              this.organizationId,
              eventId,
              run.version,
              run.status,
              run.baseDraftVersion,
              run.baseDraftRevision,
              json(run.criteria),
              json(run.diff),
              json(run.candidateDiagnostics),
              run.generatedAt,
              run.generatedBy,
              run.regenerationOfRunId,
              json(run.acceptedChangeIds),
              json(run.appliedChangeIds),
              run.rejectedAt ?? null,
              run.rejectedBy ?? null,
              run.supersededAt ?? null,
              run.appliedAt ?? null,
              run.appliedBy ?? null,
              this.organizationId,
              eventId,
              next.stateVersion,
              token,
            ],
          ),
        );
        for (const change of run.diff.changes)
          statements.push(
            statement(
              this.db,
              `INSERT INTO agenda_suggestion_changes (organization_id,event_id,run_id,id,kind,entry_id,session_id,before_json,after_json,summary,rationale) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM agenda_suggestion_runs WHERE id=?)`,
              [
                this.organizationId,
                eventId,
                run.id,
                change.id,
                change.kind,
                change.entryId,
                change.sessionId,
                change.before === null ? null : json(change.before),
                change.after === null ? null : json(change.after),
                change.summary,
                change.rationale ?? null,
                run.id,
              ],
            ),
          );
        for (const s of entryStatements(
          this.db,
          this.organizationId,
          eventId,
          "suggestion_base",
          run.id,
          run.baseEntries,
          token,
        ))
          statements.push(s);
        for (const s of entryStatements(
          this.db,
          this.organizationId,
          eventId,
          "suggestion_proposed",
          run.id,
          run.proposedEntries,
          token,
        ))
          statements.push(s);
      }
    }
    const oldOutbox = new Set(current?.outbox.map((item) => item.id) ?? []);
    for (const item of next.outbox)
      if (!oldOutbox.has(item.id))
        statements.push(
          statement(
            this.db,
            `INSERT INTO agenda_outbox_events (id,organization_id,event_id,revision_id,type,idempotency_key,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM agenda_states WHERE organization_id=? AND event_id=? AND state_version=? AND updated_at=?)`,
            [
              item.id,
              this.organizationId,
              eventId,
              item.revisionId,
              item.type,
              item.idempotencyKey,
              item.createdAt,
              this.organizationId,
              eventId,
              next.stateVersion,
              token,
            ],
          ),
        );
    const oldAudit = new Set(current?.audit.map((item) => item.id) ?? []);
    for (const item of next.audit)
      if (!oldAudit.has(item.id))
        statements.push(
          statement(
            this.db,
            `INSERT INTO audit_events (id,tenant_id,actor_type,actor_id,action,resource_type,resource_id,details_json,occurred_at) SELECT ?,?,'user',? ,?,'agenda',?,?,? WHERE EXISTS (SELECT 1 FROM agenda_states WHERE organization_id=? AND event_id=? AND state_version=? AND updated_at=?)`,
            [
              item.id,
              this.organizationId,
              item.actorId,
              item.action,
              eventId,
              json(item.details),
              item.createdAt,
              this.organizationId,
              eventId,
              next.stateVersion,
              token,
            ],
          ),
        );
    const syncPayload = json({ eventId, stateVersion: next.stateVersion });
    statements.push(
      statement(
        this.db,
        `INSERT INTO airtable_sync_jobs
      (id,organization_id,connection_id,connection_version,entity_type,application_id,source_version,operation,state,deduplication_key,attempt_count,available_at,payload_json,payload_hash,created_at,updated_at)
      SELECT 'sync:'||c.id||':agenda:'||?||':'||?, ?, c.id, c.connection_version, 'agenda', ?, ?, 'upsert', 'pending', c.id||':agenda:'||?||':'||?||':upsert', 0, ?, ?, ?, ?, ?
      FROM airtable_connections c JOIN airtable_projection_configs p ON p.connection_id=c.id AND p.entity_type='agenda' AND p.enabled=1
      WHERE c.organization_id=? AND c.status='connected' AND EXISTS (SELECT 1 FROM agenda_states WHERE organization_id=? AND event_id=? AND state_version=? AND updated_at=?)
      ON CONFLICT(deduplication_key) DO NOTHING`,
        [
          eventId,
          next.stateVersion,
          this.organizationId,
          eventId,
          next.stateVersion,
          eventId,
          next.stateVersion,
          token,
          syncPayload,
          String(next.stateVersion),
          token,
          token,
          this.organizationId,
          this.organizationId,
          eventId,
          next.stateVersion,
          token,
        ],
      ),
    );

    const results = await this.db.batch<RunResult>(statements);
    if (Number(results[0]?.meta?.changes ?? 0) !== 1)
      throw new AgendaRepositoryConflictError(eventId);
  }
}
