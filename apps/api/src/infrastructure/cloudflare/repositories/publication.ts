import type {
  ProgramPublicationManifest,
  ProgramPublicationRepository,
  ProgramPublicationState,
} from "../../../features/events/types";
import { ProgramPublicationRepositoryConflictError } from "../../../features/events/types";

interface Row extends Record<string, unknown> {}
interface RunResult {
  readonly meta?: { readonly changes?: number };
}

const value = (input: unknown): string => String(input);
const nullable = (input: unknown): string | null => (input == null ? null : String(input));
const numeric = (input: unknown): number => Number(input);

function release(row: Row): ProgramPublicationManifest {
  return {
    id: value(row.id),
    organizationId: value(row.organization_id),
    eventId: value(row.event_id),
    revision: numeric(row.revision),
    lifecycle: row.lifecycle as ProgramPublicationManifest["lifecycle"],
    agendaProjectionId: value(row.agenda_projection_id),
    agendaRevisionNumber: numeric(row.agenda_revision_number),
    agendaSourceHash: value(row.agenda_source_hash),
    speakerProjectionId: value(row.speaker_projection_id),
    speakerRevisionNumber: numeric(row.speaker_revision_number),
    speakerSourceHash: value(row.speaker_source_hash),
    approvedContentRevision: numeric(row.approved_content_revision),
    approvedProfileRevision: numeric(row.approved_profile_revision),
    releasedAssetRevision: numeric(row.released_asset_revision),
    actorId: value(row.actor_id),
    publishedAt: value(row.published_at),
    parentServedRevision:
      row.parent_served_revision == null ? null : numeric(row.parent_served_revision),
    rollbackTargetRevision:
      row.rollback_target_revision == null ? null : numeric(row.rollback_target_revision),
    cacheRevision: numeric(row.cache_revision),
    sourceTrigger: row.source_trigger as ProgramPublicationManifest["sourceTrigger"],
    reservationOwnerId: nullable(row.reservation_owner_id),
    reservationExpiresAt: nullable(row.reservation_expires_at),
    failureReason: nullable(row.failure_reason),
  };
}

function bind(db: D1Database, sql: string, values: readonly unknown[]): D1PreparedStatement {
  return db.prepare(sql).bind(...values);
}

export class D1ProgramPublicationRepository implements ProgramPublicationRepository {
  constructor(private readonly db: D1Database) {}

  async getState(organizationId: string, eventId: string): Promise<ProgramPublicationState | null> {
    const root = await this.db
      .prepare("SELECT * FROM program_publication_states WHERE organization_id=? AND event_id=?")
      .bind(organizationId, eventId)
      .first<Row>();
    if (root === null) return null;
    const rows = await this.db
      .prepare(
        "SELECT * FROM program_releases WHERE organization_id=? AND event_id=? ORDER BY revision",
      )
      .bind(organizationId, eventId)
      .all<Row>();
    const releases = (rows.results ?? []).map(release);
    const servedRevision = root.served_revision == null ? null : numeric(root.served_revision);
    return {
      organizationId,
      eventId,
      version: numeric(root.version),
      servedRevision,
      servedManifest:
        servedRevision === null
          ? null
          : (releases.find((item) => item.revision === servedRevision) ?? null),
      pendingRevision: root.pending_revision == null ? null : numeric(root.pending_revision),
      pendingReleaseId: nullable(root.pending_release_id),
      releases,
    };
  }

  async compareAndSwap(
    organizationId: string,
    eventId: string,
    expectedVersion: number | null,
    state: ProgramPublicationState,
  ): Promise<void> {
    if (
      state.organizationId !== organizationId ||
      state.eventId !== eventId ||
      state.version !== (expectedVersion ?? 0) + 1
    ) {
      throw new ProgramPublicationRepositoryConflictError();
    }
    const current = await this.getState(organizationId, eventId);
    if ((current?.version ?? null) !== expectedVersion)
      throw new ProgramPublicationRepositoryConflictError();
    if (state.releases.filter((item) => item.lifecycle === "pending").length > 1)
      throw new ProgramPublicationRepositoryConflictError(
        "Only one program release may be pending.",
      );
    const token = `${new Date().toISOString()}:${crypto.randomUUID()}`;
    const statements: D1PreparedStatement[] = [];
    if (expectedVersion === null) {
      statements.push(
        bind(
          this.db,
          `INSERT INTO program_publication_states (organization_id,event_id,version,served_revision,pending_revision,pending_release_id,updated_at)
        SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM program_publication_states WHERE organization_id=? AND event_id=?)`,
          [
            organizationId,
            eventId,
            state.version,
            state.servedRevision,
            state.pendingRevision,
            state.pendingReleaseId,
            token,
            organizationId,
            eventId,
          ],
        ),
      );
    } else {
      statements.push(
        bind(
          this.db,
          `UPDATE program_publication_states SET version=?,served_revision=?,pending_revision=?,pending_release_id=?,updated_at=? WHERE organization_id=? AND event_id=? AND version=?`,
          [
            state.version,
            state.servedRevision,
            state.pendingRevision,
            state.pendingReleaseId,
            token,
            organizationId,
            eventId,
            expectedVersion,
          ],
        ),
      );
    }
    const existing = new Map((current?.releases ?? []).map((item) => [item.id, item]));
    for (const item of state.releases) {
      const previous = existing.get(item.id);
      if (previous === undefined) {
        statements.push(
          bind(
            this.db,
            `INSERT INTO program_releases (id,organization_id,event_id,revision,lifecycle,agenda_projection_id,agenda_revision_number,agenda_source_hash,speaker_projection_id,speaker_revision_number,speaker_source_hash,approved_content_revision,approved_profile_revision,released_asset_revision,actor_id,published_at,parent_served_revision,rollback_target_revision,cache_revision,source_trigger,reservation_owner_id,reservation_expires_at,failure_reason)
          SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM program_publication_states WHERE organization_id=? AND event_id=? AND version=? AND updated_at=?)`,
            [
              item.id,
              organizationId,
              eventId,
              item.revision,
              item.lifecycle,
              item.agendaProjectionId,
              item.agendaRevisionNumber,
              item.agendaSourceHash,
              item.speakerProjectionId,
              item.speakerRevisionNumber,
              item.speakerSourceHash,
              item.approvedContentRevision,
              item.approvedProfileRevision,
              item.releasedAssetRevision,
              item.actorId,
              item.publishedAt,
              item.parentServedRevision,
              item.rollbackTargetRevision,
              item.cacheRevision,
              item.sourceTrigger,
              item.reservationOwnerId ?? null,
              item.reservationExpiresAt ?? null,
              item.failureReason,
              organizationId,
              eventId,
              state.version,
              token,
            ],
          ),
        );
      } else if (
        previous.lifecycle !== item.lifecycle ||
        previous.failureReason !== item.failureReason ||
        previous.publishedAt !== item.publishedAt ||
        previous.reservationOwnerId !== (item.reservationOwnerId ?? null) ||
        previous.reservationExpiresAt !== (item.reservationExpiresAt ?? null)
      ) {
        const immutable = {
          ...previous,
          lifecycle: item.lifecycle,
          failureReason: item.failureReason,
          publishedAt: item.publishedAt,
          reservationOwnerId: item.reservationOwnerId ?? null,
          reservationExpiresAt: item.reservationExpiresAt ?? null,
        };
        const reservationUpdate =
          previous.lifecycle === "pending" &&
          item.lifecycle === "pending" &&
          previous.failureReason === item.failureReason &&
          previous.publishedAt === item.publishedAt;
        if (
          JSON.stringify(immutable) !== JSON.stringify(item) ||
          previous.lifecycle !== "pending" ||
          (item.lifecycle === "pending" && !reservationUpdate)
        ) {
          throw new ProgramPublicationRepositoryConflictError(
            "Program releases are immutable except pending lifecycle completion.",
          );
        }
        statements.push(
          bind(
            this.db,
            `UPDATE program_releases SET lifecycle=?,failure_reason=?,published_at=?,reservation_owner_id=?,reservation_expires_at=? WHERE organization_id=? AND event_id=? AND id=? AND lifecycle='pending' AND EXISTS (SELECT 1 FROM program_publication_states WHERE organization_id=? AND event_id=? AND version=? AND updated_at=?)`,
            [
              item.lifecycle,
              item.failureReason,
              item.publishedAt,
              item.reservationOwnerId ?? null,
              item.reservationExpiresAt ?? null,
              organizationId,
              eventId,
              item.id,
              organizationId,
              eventId,
              state.version,
              token,
            ],
          ),
        );
      } else if (JSON.stringify(previous) !== JSON.stringify(item)) {
        throw new ProgramPublicationRepositoryConflictError("Program releases are immutable.");
      }
    }
    if (
      existing.size > state.releases.length ||
      [...existing.keys()].some((id) => !state.releases.some((item) => item.id === id))
    ) {
      throw new ProgramPublicationRepositoryConflictError("Program releases cannot be deleted.");
    }
    const result = await this.db.batch<RunResult>(statements);
    if (Number(result[0]?.meta?.changes ?? 0) !== 1)
      throw new ProgramPublicationRepositoryConflictError();
  }
}
