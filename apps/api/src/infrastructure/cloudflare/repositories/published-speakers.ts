import type { D1Database, D1PreparedStatement, R2Bucket } from "@cloudflare/workers-types";
import type { PublishedAgendaRevision } from "../../../features/agenda/types";
import type {
  Event,
  EventRepository,
  ProgramPublicationManifest,
  ProgramPublicationRepository,
} from "../../../features/events/types";
import type { SpeakerRepository } from "../../../features/speaker/types";
import type {
  PublishedSpeakerHeadshot,
  PublishedSpeakerProjection,
  PublishedSpeakerRouteDependencies,
} from "../../../routes/public-speakers";
import { publishedSpeakerPhotoPath } from "../../../routes/public-speakers";

function eventDateOnly(value: string, timeZone: string): string | null {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return null;
  try {
    const parts = new Intl.DateTimeFormat("en", {
      calendar: "iso8601",
      day: "2-digit",
      month: "2-digit",
      numberingSystem: "latn",
      timeZone,
      year: "numeric",
    }).formatToParts(new Date(timestamp));
    const valueFor = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? "";
    const date = `${valueFor("year")}-${valueFor("month")}-${valueFor("day")}`;
    return /^\d{4}-\d{2}-\d{2}$/u.test(date) ? date : null;
  } catch {
    return null;
  }
}

export function publishedHeadshotContentType(
  value: string,
): PublishedSpeakerHeadshot["contentType"] | null {
  const contentType = value.trim().toLowerCase();
  return contentType === "image/jpeg" || contentType === "image/png" || contentType === "image/webp"
    ? contentType
    : null;
}

export interface PublishedSpeakerProjectionRecord extends PublishedSpeakerProjection {
  readonly id: string;
  readonly organizationId: string;
  readonly eventId: string;
  readonly headshots: Readonly<
    Record<
      string,
      {
        readonly assetId: string;
        readonly objectKey: string;
        readonly contentType: PublishedSpeakerHeadshot["contentType"];
        readonly sizeBytes: number;
      }
    >
  >;
}

interface D1PublishedEventProjection {
  readonly organizationId: string;
  readonly eventId: string;
  readonly event: PublishedSpeakerProjection["event"];
  readonly revision: PublishedSpeakerProjection["revision"];
}

export class D1PublishedSpeakerProjectionStore implements PublishedSpeakerRouteDependencies {
  constructor(
    private readonly database: D1Database,
    private readonly events: EventRepository,
    private readonly publications: ProgramPublicationRepository,
    private readonly speakers: SpeakerRepository,
    private readonly privateFiles: R2Bucket,
  ) {}

  async putPublishedSpeakers(
    record: PublishedSpeakerProjectionRecord,
    agenda: PublishedAgendaRevision,
    agendaSourceHash: string,
  ): Promise<void> {
    const assets =
      (await this.speakers.listAssets?.(
        record.eventId,
        record.speakers.map((speaker) => speaker.id),
      )) ?? [];
    const statements: D1PreparedStatement[] = [
      this.database
        .prepare(
          `INSERT OR IGNORE INTO program_agenda_projections
             (id, organization_id, event_id, revision_number, source_hash, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          agenda.id,
          record.organizationId,
          record.eventId,
          agenda.revisionNumber,
          agendaSourceHash,
          agenda.publishedAt,
        ),
      this.database
        .prepare(
          `INSERT OR IGNORE INTO program_speaker_projections
             (id, organization_id, event_id, revision_number, source_hash, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          record.id,
          record.organizationId,
          record.eventId,
          record.revision.number,
          record.sourceHash ?? record.id,
          record.revision.publishedAt,
        ),
    ];
    for (const [ordinal, entry] of agenda.entries.entries()) {
      const metadata = entry.metadata;
      statements.push(
        this.database
          .prepare(
            `INSERT OR IGNORE INTO program_agenda_projection_entries
               (projection_id, id, session_id, title, summary, format, starts_at, ends_at,
                starts_at_local, ends_at_local, time_zone, room_name, track_names_json,
                speaker_names_json, track_ids_json, status, ordinal)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            agenda.id,
            entry.id,
            entry.sessionId,
            metadata?.title ?? "",
            metadata?.summary ?? null,
            metadata?.format ?? null,
            entry.startsAt,
            entry.endsAt,
            entry.startsAtLocal,
            entry.endsAtLocal,
            entry.timeZone,
            metadata?.roomName ?? null,
            JSON.stringify(metadata?.trackNames ?? []),
            JSON.stringify(metadata?.speakerNames ?? []),
            JSON.stringify(entry.trackIds),
            "published",
            ordinal,
          ),
      );
    }
    for (const [ordinal, speaker] of record.speakers.entries()) {
      const requestedHeadshot = record.headshots[speaker.id];
      const headshot =
        requestedHeadshot === undefined
          ? undefined
          : assets.find(
                (asset) =>
                  asset.id === requestedHeadshot.assetId &&
                  asset.eventId === record.eventId &&
                  asset.participantId === speaker.id &&
                  asset.kind === "headshot" &&
                  asset.state === "ready" &&
                  asset.reviewState === "approved" &&
                  asset.objectKey === requestedHeadshot.objectKey &&
                  publishedHeadshotContentType(asset.contentType) ===
                    requestedHeadshot.contentType &&
                  asset.sizeBytes === requestedHeadshot.sizeBytes,
              ) === undefined
            ? undefined
            : requestedHeadshot;
      statements.push(
        this.database
          .prepare(
            `INSERT OR IGNORE INTO program_speaker_projection_entries
               (projection_id, id, participant_id, session_ids_json, display_name, title,
                 company, bio, avatar_url, avatar_asset_id, avatar_object_key,
                 avatar_content_type, avatar_size_bytes, ordinal)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            record.id,
            speaker.id,
            speaker.id,
            JSON.stringify(speaker.sessionIds),
            speaker.displayName,
            speaker.jobTitle,
            speaker.organization,
            speaker.biography,
            speaker.photoUrl,
            headshot?.assetId ?? null,
            headshot?.objectKey ?? null,
            headshot?.contentType ?? null,
            headshot?.sizeBytes ?? null,
            ordinal,
          ),
      );
    }
    await this.database.batch(statements);
  }

  async getProgramPublicationManifest(
    eventSlug: string,
  ): Promise<ProgramPublicationManifest | null> {
    const event = await this.#eventForSlug(eventSlug);
    if (event === null) return null;
    return (
      (await this.publications.getState(event.organizationId, event.id))?.servedManifest ?? null
    );
  }

  async getPublishedSpeakers(
    eventSlug: string,
    speakerRevisionId?: string,
    speakerRevisionNumber?: number,
  ): Promise<PublishedSpeakerProjection | null> {
    const event = await this.#eventForSlug(eventSlug);
    if (event === null) return null;
    const manifest = (await this.publications.getState(event.organizationId, event.id))
      ?.servedManifest;
    if (manifest === null || manifest === undefined) return null;
    const projectionId = speakerRevisionId ?? manifest.speakerProjectionId;
    const revisionNumber = speakerRevisionNumber ?? manifest.speakerRevisionNumber;
    const projection = await this.database
      .prepare(
        `SELECT id, revision_number, source_hash, created_at
           FROM program_speaker_projections
          WHERE organization_id = ? AND event_id = ? AND id = ? AND revision_number = ?`,
      )
      .bind(event.organizationId, event.id, projectionId, revisionNumber)
      .first<{ id: string; revision_number: number; source_hash: string; created_at: string }>();
    if (projection === null) return null;
    const rows = await this.database
      .prepare(
        `SELECT id, participant_id, session_ids_json, display_name, title, company, bio, avatar_url
           FROM program_speaker_projection_entries
          WHERE projection_id = ? ORDER BY ordinal`,
      )
      .bind(projection.id)
      .all<Record<string, unknown>>();
    const agendaRows = await this.database
      .prepare(
        `SELECT session_id, title, track_names_json
           FROM program_agenda_projection_entries
          WHERE projection_id = ? ORDER BY ordinal`,
      )
      .bind(manifest.agendaProjectionId)
      .all<Record<string, unknown>>();
    const agendaBySession = new Map(
      (agendaRows.results ?? []).map((row) => [String(row.session_id), row] as const),
    );
    return {
      event: this.#publicEvent(event),
      revision: {
        id: projection.id,
        number: Number(projection.revision_number),
        publishedAt: projection.created_at,
      },
      speakers: (rows.results ?? []).map((row) => {
        const sessionIds = JSON.parse(String(row.session_ids_json)) as string[];
        const agendaEntries = sessionIds.flatMap((sessionId) => {
          const entry = agendaBySession.get(sessionId);
          return entry === undefined ? [] : [entry];
        });
        return {
          id: String(row.participant_id),
          displayName: String(row.display_name),
          pronouns: null,
          jobTitle: row.title == null ? null : String(row.title),
          organization: row.company == null ? null : String(row.company),
          biography: row.bio == null ? "" : String(row.bio),
          photoUrl: row.avatar_url == null ? null : String(row.avatar_url),
          sessionIds,
          sessionTitles: agendaEntries.map((entry) => String(entry.title)),
          trackNames: [
            ...new Set(
              agendaEntries.flatMap(
                (entry) => JSON.parse(String(entry.track_names_json)) as string[],
              ),
            ),
          ].sort(),
        };
      }),
      sourceHash: projection.source_hash,
    };
  }

  async getPublishedSpeakerHeadshots(
    eventSlug: string,
  ): Promise<PublishedSpeakerProjectionRecord["headshots"]> {
    const event = await this.#eventForSlug(eventSlug);
    if (event === null) return {};
    const manifest = (await this.publications.getState(event.organizationId, event.id))
      ?.servedManifest;
    if (manifest === null || manifest === undefined) return {};
    const rows = await this.database
      .prepare(
        `SELECT participant_id, avatar_asset_id, avatar_object_key,
                avatar_content_type, avatar_size_bytes
           FROM program_speaker_projection_entries
          WHERE projection_id = ?`,
      )
      .bind(manifest.speakerProjectionId)
      .all<Record<string, unknown>>();
    const headshots: Record<string, PublishedSpeakerProjectionRecord["headshots"][string]> = {};
    for (const row of rows.results ?? []) {
      if (
        row.avatar_asset_id == null ||
        row.avatar_object_key == null ||
        row.avatar_content_type == null ||
        row.avatar_size_bytes == null
      ) {
        continue;
      }
      const contentType = publishedHeadshotContentType(String(row.avatar_content_type));
      const sizeBytes = Number(row.avatar_size_bytes);
      if (contentType === null || !Number.isSafeInteger(sizeBytes) || sizeBytes < 0) continue;
      headshots[String(row.participant_id)] = {
        assetId: String(row.avatar_asset_id),
        objectKey: String(row.avatar_object_key),
        contentType,
        sizeBytes,
      };
    }
    return headshots;
  }

  async listPublishedEventProjections(): Promise<readonly D1PublishedEventProjection[]> {
    const rows = await this.database
      .prepare(
        `SELECT e.organization_id, e.id
           FROM events e
          INNER JOIN program_publication_states p
             ON p.organization_id = e.organization_id AND p.event_id = e.id
          WHERE p.served_revision IS NOT NULL
            AND e.legacy_retired_at IS NULL`,
      )
      .all<{ organization_id: string; id: string }>();
    const projections: D1PublishedEventProjection[] = [];
    for (const row of rows.results ?? []) {
      const event = await this.events.getEvent(row.organization_id, row.id);
      if (event === null) continue;
      const manifest = (await this.publications.getState(row.organization_id, row.id))
        ?.servedManifest;
      if (manifest === null || manifest === undefined) continue;
      projections.push({
        organizationId: row.organization_id,
        eventId: row.id,
        event: this.#publicEvent(event),
        revision: {
          id: manifest.speakerProjectionId,
          number: manifest.speakerRevisionNumber,
          publishedAt: manifest.publishedAt,
        },
      });
    }
    return projections;
  }

  async getPublishedSpeakerHeadshot(
    eventSlug: string,
    speakerId: string,
    _programRevision?: number,
    speakerRevisionId?: string,
    speakerRevisionNumber?: number,
  ): Promise<PublishedSpeakerHeadshot | null> {
    const event = await this.#eventForSlug(eventSlug);
    if (event === null) return null;
    const projection = await this.getPublishedSpeakers(
      eventSlug,
      speakerRevisionId,
      speakerRevisionNumber,
    );
    if (projection === null) return null;
    const normalizedSpeakerId = speakerId.trim();
    const publicSpeaker = projection.speakers.find(
      (candidate) =>
        candidate.id === normalizedSpeakerId &&
        candidate.photoUrl === publishedSpeakerPhotoPath(event.slug, normalizedSpeakerId),
    );
    if (publicSpeaker === undefined) return null;
    const headshot = await this.database
      .prepare(
        `SELECT avatar_asset_id, avatar_object_key, avatar_content_type, avatar_size_bytes
           FROM program_speaker_projection_entries
          WHERE projection_id = ? AND participant_id = ? AND avatar_url = ?
          LIMIT 1`,
      )
      .bind(projection.revision.id, normalizedSpeakerId, publicSpeaker.photoUrl)
      .first<{
        avatar_asset_id: string | null;
        avatar_object_key: string | null;
        avatar_content_type: string | null;
        avatar_size_bytes: number | null;
      }>();
    if (
      headshot === null ||
      headshot.avatar_asset_id === null ||
      headshot.avatar_object_key === null ||
      headshot.avatar_content_type === null ||
      headshot.avatar_size_bytes === null ||
      headshot.avatar_size_bytes <= 0 ||
      !Number.isSafeInteger(headshot.avatar_size_bytes)
    ) {
      return null;
    }
    const contentType = publishedHeadshotContentType(headshot.avatar_content_type);
    if (contentType === null) return null;
    const object = await this.privateFiles.get(headshot.avatar_object_key);
    if (
      object === null ||
      object.body === null ||
      object.size !== headshot.avatar_size_bytes ||
      object.httpMetadata?.contentType?.trim().toLowerCase() !== contentType
    ) {
      return null;
    }
    const body = await object.arrayBuffer();
    return body.byteLength === headshot.avatar_size_bytes
      ? { body, contentType, sizeBytes: headshot.avatar_size_bytes }
      : null;
  }

  async #eventForSlug(eventSlug: string): Promise<Event | null> {
    const normalizedSlug = eventSlug.trim().toLowerCase();
    if (normalizedSlug.length === 0) return null;
    const rows = await this.database
      .prepare(
        `SELECT organization_id, id FROM events
          WHERE legacy_retired_at IS NULL
            AND lower(slug) = ? LIMIT 2`,
      )
      .bind(normalizedSlug)
      .all<{ organization_id: string; id: string }>();
    const matches = rows.results ?? [];
    if (matches.length !== 1) return null;
    const match = matches[0];
    return match === undefined ? null : this.events.getEvent(match.organization_id, match.id);
  }

  #publicEvent(event: Event): PublishedSpeakerProjection["event"] {
    return {
      slug: event.slug,
      name: event.name,
      timeZone: event.timeZone,
      startsOn: eventDateOnly(event.startsAt, event.timeZone) ?? event.startsAt.slice(0, 10),
      endsOn: eventDateOnly(event.endsAt, event.timeZone) ?? event.endsAt.slice(0, 10),
      venueName: event.venue,
    };
  }
}
