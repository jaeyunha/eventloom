import type { D1Database, D1PreparedStatement, R2Bucket } from "@cloudflare/workers-types";
import type { ProgramPublicationManifest } from "../../../features/events/types";
import type {
  OrganizerOverviewActionItem,
  OrganizerOverviewActivityData,
  OrganizerOverviewCoreData,
  OrganizerOverviewEvent,
  OrganizerOverviewRouteDependencies,
} from "../../../routes/organizer-overview";
import type {
  PublishedSpeakerHeadshot,
  PublishedSpeakerProjection,
  PublishedSpeakerRouteDependencies,
} from "../../../routes/public-speakers";
import { publishedSpeakerPhotoPath } from "../../../routes/public-speakers";

interface Row extends Record<string, unknown> {}

function text(value: unknown): string {
  return String(value);
}

function nullableText(value: unknown): string | null {
  return value == null ? null : String(value);
}

function numeric(value: unknown): number {
  return Number(value);
}

function parseStringArray(value: unknown): string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function hrefFor(
  organizationId: string,
  eventId: string,
  suffix: "reviews" | "speakers" | "agenda",
): string {
  return `/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventId)}/${suffix}`;
}

function actionItem(
  input: Omit<OrganizerOverviewActionItem, "dueAt"> & { readonly dueAt?: string | null },
): OrganizerOverviewActionItem {
  return { ...input, dueAt: input.dueAt ?? null };
}

function compareNullableDates(left: string | null, right: string | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return Date.parse(left) - Date.parse(right);
}

interface OrganizerActivityRow extends Row {
  readonly event_id: string;
  readonly pending_review_count: number;
  readonly review_due_at: string | null;
  readonly outstanding_task_count: number;
  readonly task_due_at: string | null;
  readonly session_count: number;
  readonly published_session_count: number;
}

/** Organization dashboard read model over canonical D1 tables. */
export class D1OrganizerOverviewReadModel implements OrganizerOverviewRouteDependencies {
  constructor(private readonly database: D1Database) {}

  async getOverviewCore(organizationId: string): Promise<OrganizerOverviewCoreData> {
    const result = await this.database
      .prepare(
        `SELECT id, name, slug, status, starts_at, ends_at
           FROM events
          WHERE organization_id = ?
          ORDER BY id`,
      )
      .bind(organizationId)
      .all<Row>();
    const events: OrganizerOverviewEvent[] = (result.results ?? []).map((row) => ({
      id: text(row.id),
      name: text(row.name),
      slug: nullableText(row.slug),
      status: nullableText(row.status),
      startsAt: nullableText(row.starts_at),
      endsAt: nullableText(row.ends_at),
    }));
    return {
      organizationId,
      metrics: { eventCount: events.length },
      events,
    };
  }

  async getOverviewActivity(organizationId: string): Promise<OrganizerOverviewActivityData> {
    const [metrics, activity] = await Promise.all([
      this.database
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM submissions WHERE organization_id = ? AND status <> 'withdrawn') AS submission_count,
             (SELECT COUNT(*) FROM review_assignments WHERE organization_id = ? AND status IN ('assigned','in_progress')) AS pending_review_count,
             (SELECT COUNT(*) FROM speaker_tasks WHERE organization_id = ? AND status NOT IN ('completed','waived')) AS outstanding_task_count,
             (SELECT COUNT(DISTINCT entries.session_id)
                FROM agenda_states AS states
                JOIN agenda_entries AS entries
                  ON entries.organization_id = states.organization_id
                 AND entries.event_id = states.event_id
                 AND entries.container_type = 'revision'
                 AND entries.container_id = states.current_published_revision_id
               WHERE states.organization_id = ?) AS published_session_count`,
        )
        .bind(organizationId, organizationId, organizationId, organizationId)
        .first<Row>(),
      this.database
        .prepare(
          `WITH review_activity AS (
             SELECT assignments.event_id,
                    COUNT(*) AS pending_review_count,
                    MIN(plans.closes_at) AS review_due_at
               FROM review_assignments AS assignments
               LEFT JOIN review_plans AS plans
                 ON plans.organization_id = assignments.organization_id
                AND plans.id = assignments.plan_id
              WHERE assignments.organization_id = ?
                AND assignments.status IN ('assigned','in_progress')
              GROUP BY assignments.event_id
           ), task_activity AS (
             SELECT event_id,
                    COUNT(*) AS outstanding_task_count,
                    MIN(due_at) AS task_due_at
               FROM speaker_tasks
              WHERE organization_id = ?
                AND status NOT IN ('completed','waived')
              GROUP BY event_id
           ), session_activity AS (
             SELECT event_id, COUNT(*) AS session_count
               FROM sessions
              WHERE organization_id = ?
                AND deleted_at IS NULL
                AND lower(status) <> 'cancelled'
              GROUP BY event_id
           ), published_activity AS (
             SELECT states.event_id, COUNT(DISTINCT entries.session_id) AS published_session_count
               FROM agenda_states AS states
               JOIN agenda_entries AS entries
                 ON entries.organization_id = states.organization_id
                AND entries.event_id = states.event_id
                AND entries.container_type = 'revision'
                AND entries.container_id = states.current_published_revision_id
              WHERE states.organization_id = ?
              GROUP BY states.event_id
           )
           SELECT events.id AS event_id,
                  COALESCE(review_activity.pending_review_count, 0) AS pending_review_count,
                  review_activity.review_due_at,
                  COALESCE(task_activity.outstanding_task_count, 0) AS outstanding_task_count,
                  task_activity.task_due_at,
                  COALESCE(session_activity.session_count, 0) AS session_count,
                  COALESCE(published_activity.published_session_count, 0) AS published_session_count
             FROM events
             LEFT JOIN review_activity ON review_activity.event_id = events.id
             LEFT JOIN task_activity ON task_activity.event_id = events.id
             LEFT JOIN session_activity ON session_activity.event_id = events.id
             LEFT JOIN published_activity ON published_activity.event_id = events.id
            WHERE events.organization_id = ?
            ORDER BY events.id`,
        )
        .bind(organizationId, organizationId, organizationId, organizationId, organizationId)
        .all<OrganizerActivityRow>(),
    ]);

    const actionItems: OrganizerOverviewActionItem[] = [];
    for (const row of activity.results ?? []) {
      const eventId = text(row.event_id);
      const pendingReviews = numeric(row.pending_review_count);
      if (pendingReviews > 0) {
        actionItems.push(
          actionItem({
            id: `reviews:${eventId}`,
            type: "reviews",
            eventId,
            title: pendingReviews === 1 ? "Complete a pending review" : "Complete pending reviews",
            description: `${pendingReviews} review${pendingReviews === 1 ? "" : "s"} still need organizer attention.`,
            count: pendingReviews,
            priority: 90,
            dueAt: nullableText(row.review_due_at),
            href: hrefFor(organizationId, eventId, "reviews"),
          }),
        );
      }
      const outstandingTasks = numeric(row.outstanding_task_count);
      if (outstandingTasks > 0) {
        actionItems.push(
          actionItem({
            id: `speaker_tasks:${eventId}`,
            type: "speaker_tasks",
            eventId,
            title: outstandingTasks === 1 ? "Resolve a speaker task" : "Resolve speaker tasks",
            description: `${outstandingTasks} speaker task${outstandingTasks === 1 ? "" : "s"} remain open.`,
            count: outstandingTasks,
            priority: 70,
            dueAt: nullableText(row.task_due_at),
            href: hrefFor(organizationId, eventId, "speakers"),
          }),
        );
      }
      const unpublishedSessions = Math.max(
        0,
        numeric(row.session_count) - numeric(row.published_session_count),
      );
      if (unpublishedSessions > 0) {
        actionItems.push(
          actionItem({
            id: `agenda:${eventId}`,
            type: "agenda",
            eventId,
            title:
              unpublishedSessions === 1
                ? "Publish the remaining session"
                : "Publish the remaining sessions",
            description: `${unpublishedSessions} session${unpublishedSessions === 1 ? "" : "s"} are not in the current published agenda.`,
            count: unpublishedSessions,
            priority: 50,
            href: hrefFor(organizationId, eventId, "agenda"),
          }),
        );
      }
    }
    actionItems.sort(
      (left, right) =>
        right.priority - left.priority ||
        compareNullableDates(left.dueAt, right.dueAt) ||
        left.id.localeCompare(right.id),
    );

    return {
      organizationId,
      metrics: {
        submissionCount: numeric(metrics?.submission_count ?? 0),
        pendingReviewCount: numeric(metrics?.pending_review_count ?? 0),
        outstandingSpeakerTaskCount: numeric(metrics?.outstanding_task_count ?? 0),
        publishedSessionCount: numeric(metrics?.published_session_count ?? 0),
      },
      actionItems,
    };
  }
}

export interface D1PublishedSpeakerProjectionRecord extends PublishedSpeakerProjection {
  readonly organizationId: string;
  readonly eventId: string;
  readonly headshots: readonly {
    readonly speakerId: string;
    readonly assetId: string;
    readonly objectKey: string;
    readonly contentType: PublishedSpeakerHeadshot["contentType"];
    readonly sizeBytes: number;
  }[];
}

function manifestFromRow(row: Row): ProgramPublicationManifest {
  return {
    id: text(row.release_id),
    organizationId: text(row.organization_id),
    eventId: text(row.event_id),
    revision: numeric(row.release_revision),
    lifecycle: "served",
    agendaProjectionId: text(row.agenda_projection_id),
    agendaRevisionNumber: numeric(row.agenda_revision_number),
    agendaSourceHash: text(row.agenda_source_hash),
    speakerProjectionId: text(row.speaker_projection_id),
    speakerRevisionNumber: numeric(row.speaker_revision_number),
    speakerSourceHash: text(row.speaker_source_hash),
    approvedContentRevision: numeric(row.approved_content_revision),
    approvedProfileRevision: numeric(row.approved_profile_revision),
    releasedAssetRevision: numeric(row.released_asset_revision),
    actorId: text(row.actor_id),
    publishedAt: text(row.published_at),
    parentServedRevision:
      row.parent_served_revision == null ? null : numeric(row.parent_served_revision),
    rollbackTargetRevision:
      row.rollback_target_revision == null ? null : numeric(row.rollback_target_revision),
    cacheRevision: numeric(row.cache_revision),
    sourceTrigger: row.source_trigger as ProgramPublicationManifest["sourceTrigger"],
    failureReason: null,
  };
}

const SERVED_PUBLICATION_SQL = `SELECT releases.id AS release_id,
       releases.organization_id,
       releases.event_id,
       releases.revision AS release_revision,
       releases.agenda_projection_id,
       releases.agenda_revision_number,
       releases.agenda_source_hash,
       releases.speaker_projection_id,
       releases.speaker_revision_number,
       releases.speaker_source_hash,
       releases.approved_content_revision,
       releases.approved_profile_revision,
       releases.released_asset_revision,
       releases.actor_id,
       releases.published_at,
       releases.parent_served_revision,
       releases.rollback_target_revision,
       releases.cache_revision,
       releases.source_trigger,
       events.slug,
       events.name AS event_name,
       events.time_zone,
       events.starts_at,
       events.ends_at,
       events.venue,
       events.status AS event_status,
       events.cfp_enabled,
       events.cfp_opens_at,
       events.cfp_closes_at,
       organizations.name AS organization_name,
       projections.source_hash,
       projections.created_at AS projection_created_at
  FROM program_publication_states AS states
  JOIN program_releases AS releases
    ON releases.organization_id = states.organization_id
   AND releases.event_id = states.event_id
   AND releases.revision = states.served_revision
   AND releases.lifecycle = 'served'
  JOIN events
    ON events.organization_id = releases.organization_id
   AND events.id = releases.event_id
  JOIN organizations ON organizations.organization_id = releases.organization_id
  JOIN program_speaker_projections AS projections
    ON projections.id = releases.speaker_projection_id
   AND projections.organization_id = releases.organization_id
   AND projections.event_id = releases.event_id`;

/** Immutable public event and speaker projections selected by served D1 manifests. */
export class D1PublishedProgramReadModel implements PublishedSpeakerRouteDependencies {
  constructor(
    private readonly database: D1Database,
    private readonly privateFiles: R2Bucket,
  ) {}

  async listPublicEventDirectory(): Promise<
    readonly {
      organization: { id: string; name: string };
      event: {
        slug: string;
        name: string;
        timeZone: string;
        startsOn: string;
        endsOn: string;
        venueName: string | null;
        programPublished: boolean;
      };
      cfpOpen: boolean;
    }[]
  > {
    const now = new Date().toISOString();
    const result = await this.database
      .withSession("first-primary")
      .prepare(
        `SELECT organizations.organization_id,
                organizations.name AS organization_name,
                events.slug,
                events.name AS event_name,
                events.time_zone,
                substr(events.starts_at, 1, 10) AS starts_on,
                substr(events.ends_at, 1, 10) AS ends_on,
                events.venue,
                CASE
                  WHEN events.cfp_enabled = 1
                   AND events.cfp_opens_at <= ?
                   AND events.cfp_closes_at >= ?
                   AND EXISTS (
                     SELECT 1
                       FROM cfp_forms
                      WHERE cfp_forms.organization_id = events.organization_id
                        AND cfp_forms.event_id = events.id
                        AND cfp_forms.status = 'published'
                   )
                  THEN 1 ELSE 0
                END AS cfp_open,
                CASE
                  WHEN EXISTS (
                    SELECT 1
                      FROM program_publication_states
                     WHERE program_publication_states.organization_id = events.organization_id
                       AND program_publication_states.event_id = events.id
                       AND program_publication_states.served_revision IS NOT NULL
                  )
                  THEN 1 ELSE 0
                END AS program_published
           FROM events
           JOIN organizations
             ON organizations.organization_id = events.organization_id
          WHERE events.status = 'active'
            AND (
              EXISTS (
                SELECT 1
                  FROM cfp_forms
                 WHERE cfp_forms.organization_id = events.organization_id
                   AND cfp_forms.event_id = events.id
                   AND cfp_forms.status = 'published'
              )
              OR EXISTS (
                SELECT 1
                  FROM program_publication_states
                 WHERE program_publication_states.organization_id = events.organization_id
                   AND program_publication_states.event_id = events.id
                   AND program_publication_states.served_revision IS NOT NULL
              )
            )
       ORDER BY organizations.name, events.starts_at, events.name`,
      )
      .bind(now, now)
      .all<Record<string, unknown>>();
    return (result.results ?? []).map((row) => ({
      organization: {
        id: text(row.organization_id),
        name: text(row.organization_name),
      },
      event: {
        slug: text(row.slug),
        name: text(row.event_name),
        timeZone: text(row.time_zone),
        startsOn: text(row.starts_on),
        endsOn: text(row.ends_on),
        venueName: nullableText(row.venue),
        programPublished: Number(row.program_published) === 1,
      },
      cfpOpen: Number(row.cfp_open) === 1,
    }));
  }

  async putPublishedSpeakers(record: D1PublishedSpeakerProjectionRecord): Promise<void> {
    const statements: D1PreparedStatement[] = [
      this.database
        .prepare(
          `INSERT OR IGNORE INTO program_speaker_projections
             (id, organization_id, event_id, revision_number, source_hash, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          record.revision.id,
          record.organizationId,
          record.eventId,
          record.revision.number,
          record.sourceHash ?? "",
          record.revision.publishedAt,
        ),
    ];
    for (const [ordinal, speaker] of record.speakers.entries()) {
      const headshot = record.headshots.find((candidate) => candidate.speakerId === speaker.id);
      statements.push(
        this.database
          .prepare(
            `INSERT OR IGNORE INTO program_speaker_projection_entries
               (projection_id, id, participant_id, session_ids_json, display_name, title, company, bio, avatar_url, ordinal)
             SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
              WHERE EXISTS (
                SELECT 1 FROM program_speaker_projections
                 WHERE id = ? AND organization_id = ? AND event_id = ? AND source_hash = ?
              )`,
          )
          .bind(
            record.revision.id,
            speaker.id,
            speaker.id,
            JSON.stringify(speaker.sessionIds),
            speaker.displayName,
            speaker.jobTitle,
            speaker.organization,
            speaker.biography,
            headshot === undefined
              ? null
              : JSON.stringify({
                  path: publishedSpeakerPhotoPath(record.event.slug, speaker.id),
                  assetId: headshot.assetId,
                  objectKey: headshot.objectKey,
                  contentType: headshot.contentType,
                  sizeBytes: headshot.sizeBytes,
                }),
            ordinal,
            record.revision.id,
            record.organizationId,
            record.eventId,
            record.sourceHash ?? "",
          ),
      );
    }
    await this.database.batch(statements);
  }

  async getProgramPublicationManifest(
    eventSlug: string,
  ): Promise<ProgramPublicationManifest | null> {
    const row = await this.database
      .prepare(`${SERVED_PUBLICATION_SQL} WHERE events.slug = ? COLLATE NOCASE LIMIT 2`)
      .bind(eventSlug.trim())
      .all<Row>();
    return row.results.length === 1 && row.results[0] !== undefined
      ? manifestFromRow(row.results[0])
      : null;
  }

  async getPublishedSpeakers(
    eventSlug: string,
    speakerRevisionId?: string,
    speakerRevisionNumber?: number,
  ): Promise<PublishedSpeakerProjection | null> {
    const publication = await this.database
      .prepare(`${SERVED_PUBLICATION_SQL} WHERE events.slug = ? COLLATE NOCASE LIMIT 2`)
      .bind(eventSlug.trim())
      .all<Row>();
    if (publication.results.length !== 1 || publication.results[0] === undefined) return null;
    const row = publication.results[0];
    if (
      (speakerRevisionId !== undefined && text(row.speaker_projection_id) !== speakerRevisionId) ||
      (speakerRevisionNumber !== undefined &&
        numeric(row.speaker_revision_number) !== speakerRevisionNumber)
    ) {
      return null;
    }
    const entries = await this.database
      .prepare(
        `SELECT entry.*, sessions.title AS session_title,
                GROUP_CONCAT(DISTINCT tracks.name) AS track_names
           FROM program_speaker_projection_entries AS entry
           LEFT JOIN sessions
             ON sessions.organization_id = ?
            AND sessions.event_id = ?
            AND EXISTS (SELECT 1 FROM json_each(entry.session_ids_json) WHERE value = sessions.id)
           LEFT JOIN session_tracks
             ON session_tracks.organization_id = sessions.organization_id
            AND session_tracks.event_id = sessions.event_id
            AND session_tracks.session_id = sessions.id
           LEFT JOIN tracks
             ON tracks.organization_id = session_tracks.organization_id
            AND tracks.event_id = session_tracks.event_id
            AND tracks.id = session_tracks.track_id
          WHERE entry.projection_id = ?
          GROUP BY entry.projection_id, entry.id
          ORDER BY entry.ordinal`,
      )
      .bind(row.organization_id, row.event_id, row.speaker_projection_id)
      .all<Row>();
    return {
      event: {
        slug: text(row.slug),
        name: text(row.event_name),
        timeZone: text(row.time_zone),
        startsOn: text(row.starts_at).slice(0, 10),
        endsOn: text(row.ends_at).slice(0, 10),
        venueName: nullableText(row.venue),
      },
      revision: {
        id: text(row.speaker_projection_id),
        number: numeric(row.speaker_revision_number),
        publishedAt: text(row.published_at),
      },
      speakers: (entries.results ?? []).map((entry) => {
        const sessionIds = parseStringArray(entry.session_ids_json);
        const sessionTitles = typeof entry.session_title === "string" ? [entry.session_title] : [];
        const trackNames =
          typeof entry.track_names === "string" && entry.track_names.length > 0
            ? entry.track_names.split(",").sort()
            : [];
        const avatar = this.#avatar(entry.avatar_url);
        return {
          id: text(entry.participant_id),
          displayName: text(entry.display_name),
          pronouns: null,
          jobTitle: nullableText(entry.title),
          organization: nullableText(entry.company),
          biography: nullableText(entry.bio) ?? "",
          photoUrl: avatar?.path ?? null,
          sessionIds,
          sessionTitles,
          trackNames,
        };
      }),
      sourceHash: text(row.source_hash),
    };
  }

  async listPublishedEventProjections(): Promise<
    readonly {
      readonly organizationId: string;
      readonly eventId: string;
      readonly event: PublishedSpeakerProjection["event"];
      readonly revision: PublishedSpeakerProjection["revision"];
    }[]
  > {
    const result = await this.database
      .prepare(`${SERVED_PUBLICATION_SQL} WHERE events.status = 'active' ORDER BY events.slug`)
      .all<Row>();
    return (result.results ?? []).map((row) => ({
      organizationId: text(row.organization_id),
      eventId: text(row.event_id),
      event: {
        slug: text(row.slug),
        name: text(row.event_name),
        timeZone: text(row.time_zone),
        startsOn: text(row.starts_at).slice(0, 10),
        endsOn: text(row.ends_at).slice(0, 10),
        venueName: nullableText(row.venue),
      },
      revision: {
        id: text(row.speaker_projection_id),
        number: numeric(row.speaker_revision_number),
        publishedAt: text(row.published_at),
      },
    }));
  }

  async getPublishedSpeakerHeadshot(
    eventSlug: string,
    speakerId: string,
    _programRevision?: number,
    speakerRevisionId?: string,
    speakerRevisionNumber?: number,
  ): Promise<PublishedSpeakerHeadshot | null> {
    const publication = await this.database
      .prepare(`${SERVED_PUBLICATION_SQL} WHERE events.slug = ? COLLATE NOCASE LIMIT 2`)
      .bind(eventSlug.trim())
      .all<Row>();
    if (publication.results.length !== 1 || publication.results[0] === undefined) return null;
    const release = publication.results[0];
    if (
      (speakerRevisionId !== undefined &&
        text(release.speaker_projection_id) !== speakerRevisionId) ||
      (speakerRevisionNumber !== undefined &&
        numeric(release.speaker_revision_number) !== speakerRevisionNumber)
    ) {
      return null;
    }
    const entry = await this.database
      .prepare(
        `SELECT avatar_url FROM program_speaker_projection_entries
          WHERE projection_id = ? AND participant_id = ? LIMIT 1`,
      )
      .bind(release.speaker_projection_id, speakerId.trim())
      .first<Row>();
    const avatar = this.#avatar(entry?.avatar_url);
    if (
      avatar === null ||
      avatar.path !== publishedSpeakerPhotoPath(text(release.slug), speakerId)
    ) {
      return null;
    }
    const object = await this.privateFiles.get(avatar.objectKey);
    const contentType = object?.httpMetadata?.contentType?.trim().toLowerCase();
    if (
      object === null ||
      object.body === null ||
      object.size !== avatar.sizeBytes ||
      contentType !== avatar.contentType
    ) {
      return null;
    }
    const body = await object.arrayBuffer();
    return body.byteLength === avatar.sizeBytes
      ? { body, contentType: avatar.contentType, sizeBytes: avatar.sizeBytes }
      : null;
  }

  #avatar(value: unknown): {
    readonly path: string;
    readonly assetId: string;
    readonly objectKey: string;
    readonly contentType: PublishedSpeakerHeadshot["contentType"];
    readonly sizeBytes: number;
  } | null {
    if (typeof value !== "string") return null;
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      const contentType = parsed.contentType;
      if (
        typeof parsed.path !== "string" ||
        typeof parsed.assetId !== "string" ||
        typeof parsed.objectKey !== "string" ||
        (contentType !== "image/jpeg" &&
          contentType !== "image/png" &&
          contentType !== "image/webp") ||
        typeof parsed.sizeBytes !== "number" ||
        !Number.isSafeInteger(parsed.sizeBytes) ||
        parsed.sizeBytes <= 0
      ) {
        return null;
      }
      return {
        path: parsed.path,
        assetId: parsed.assetId,
        objectKey: parsed.objectKey,
        contentType,
        sizeBytes: parsed.sizeBytes,
      };
    } catch {
      return null;
    }
  }
}
