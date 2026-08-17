import type { D1Database, D1PreparedStatement, R2Bucket } from "@cloudflare/workers-types";
import { describe, expect, it } from "vitest";
import type { PublishedAgendaRevision } from "../../../features/agenda/types";
import type { EventRepository, ProgramPublicationRepository } from "../../../features/events/types";
import type { SpeakerAsset, SpeakerRepository } from "../../../features/speaker/types";
import { publishedSpeakerPhotoPath } from "../../../routes/public-speakers";
import {
  D1PublishedSpeakerProjectionStore,
  type PublishedSpeakerProjectionRecord,
  selectReleasedSpeakerHeadshot,
} from "./published-speakers";

function objectBody(bytes: Uint8Array, contentType: string) {
  return {
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
    size: bytes.byteLength,
    httpMetadata: { contentType },
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  };
}

function releasedHeadshot(id: string): SpeakerAsset {
  return {
    id,
    tenantId: "org-1",
    eventId: "event-1",
    participantId: "participant-1",
    kind: "headshot",
    objectKey: `headshots/${id}.png`,
    fileName: `${id}.png`,
    contentType: "image/png",
    sizeBytes: 1,
    state: "ready",
    reviewState: "approved",
    releasedVersionId: id,
    createdAt: "2026-08-15T00:00:00.000Z",
  };
}

describe("selectReleasedSpeakerHeadshot", () => {
  const input = {
    tenantId: "org-1",
    eventId: "event-1",
    participantId: "participant-1",
  };

  it("keeps unversioned asset families distinct for an explicit selection", () => {
    const selected = releasedHeadshot("selected");

    expect(
      selectReleasedSpeakerHeadshot([releasedHeadshot("other"), selected], {
        ...input,
        selectedAssetId: selected.id,
      })?.id,
    ).toBe(selected.id);
  });

  it("does not infer a fallback across multiple unversioned asset families", () => {
    expect(
      selectReleasedSpeakerHeadshot([releasedHeadshot("first"), releasedHeadshot("second")], input),
    ).toBeUndefined();
  });

  it("fails closed when an explicit selection does not resolve", () => {
    expect(
      selectReleasedSpeakerHeadshot([releasedHeadshot("released")], {
        ...input,
        selectedAssetId: "missing",
      }),
    ).toBeUndefined();
  });
});

describe("D1PublishedSpeakerProjectionStore", () => {
  it("clears requested headshot bindings when release revalidation fails", async () => {
    const writes: Array<{ sql: string; values: unknown[] }> = [];
    const database = {
      prepare(sql: string) {
        const statement = {
          bind(...values: unknown[]) {
            writes.push({ sql, values });
            return statement;
          },
        } as unknown as D1PreparedStatement;
        return statement;
      },
      async batch() {
        return [];
      },
    } as unknown as D1Database;
    const unreleased = releasedHeadshot("unreleased");
    delete unreleased.releasedVersionId;
    const store = new D1PublishedSpeakerProjectionStore(
      database,
      {} as unknown as EventRepository,
      {} as unknown as ProgramPublicationRepository,
      {
        async listAssets() {
          return [unreleased];
        },
      } as unknown as SpeakerRepository,
      {} as R2Bucket,
    );
    const projection: PublishedSpeakerProjectionRecord = {
      id: "speaker-revision-1",
      organizationId: "org-1",
      eventId: "event-1",
      event: {
        slug: "event-1",
        name: "Event",
        timeZone: "UTC",
        startsOn: "2026-08-15",
        endsOn: "2026-08-16",
        venueName: null,
      },
      revision: {
        id: "speaker-revision-1",
        number: 1,
        publishedAt: "2026-08-15T00:00:00.000Z",
      },
      speakers: [
        {
          id: "participant-1",
          displayName: "Alex Rivera",
          pronouns: null,
          jobTitle: null,
          organization: null,
          biography: "",
          photoUrl: publishedSpeakerPhotoPath("event-1", "participant-1"),
          sessionIds: [],
          sessionTitles: [],
          trackNames: [],
        },
      ],
      headshots: {
        "participant-1": {
          assetId: unreleased.id,
          objectKey: unreleased.objectKey,
          contentType: "image/png",
          sizeBytes: unreleased.sizeBytes,
        },
      },
    };
    const agenda: PublishedAgendaRevision = {
      id: "agenda-revision-1",
      eventId: "event-1",
      revisionNumber: 1,
      sourceDraftVersion: 1,
      timeZone: "UTC",
      entries: [],
      warningOverrides: [],
      publishedAt: "2026-08-15T00:00:00.000Z",
      publishedBy: "organizer-1",
      rollbackOfRevisionId: null,
    };

    await store.putPublishedSpeakers(projection, agenda, "source-hash");

    const speakerWrite = writes.find(({ sql }) =>
      sql.includes("program_speaker_projection_entries"),
    );
    expect(speakerWrite?.values.slice(8, 13)).toEqual([null, null, null, null, null]);
  });

  it("serves the headshot object pinned by the published projection", async () => {
    const eventSlug = "immutable-event";
    const eventId = "event-1";
    const participantId = "participant-1";
    const projectionId = "speaker-projection-1";
    const photoPath = publishedSpeakerPhotoPath(eventSlug, participantId);
    const pinnedBytes = new TextEncoder().encode("published-headshot");
    const replacementBytes = new TextEncoder().encode("replacement-headshot");
    const objects = new Map([
      ["headshots/published.png", objectBody(pinnedBytes, "image/png")],
      ["headshots/replacement.png", objectBody(replacementBytes, "image/png")],
    ]);
    let currentAssets = [
      {
        id: "asset-published",
        participantId,
        kind: "headshot",
        state: "ready",
        reviewState: "approved",
        approvedVersionId: "asset-published",
        releasedVersionId: "asset-published",
        objectKey: "headshots/published.png",
        contentType: "image/png",
        sizeBytes: pinnedBytes.byteLength,
      },
    ];
    const database = {
      prepare(sql: string) {
        const statement = {
          bind(..._values: unknown[]) {
            return statement;
          },
          async first() {
            if (sql.includes("FROM program_speaker_projections")) {
              return {
                id: projectionId,
                revision_number: 1,
                source_hash: "speaker-source",
                created_at: "2026-08-15T00:00:00.000Z",
              };
            }
            if (sql.includes("avatar_object_key")) {
              return {
                avatar_asset_id: "asset-published",
                avatar_object_key: "headshots/published.png",
                avatar_content_type: "image/png",
                avatar_size_bytes: pinnedBytes.byteLength,
              };
            }
            return null;
          },
          async all() {
            if (sql.includes("FROM events")) {
              return { results: [{ organization_id: "org-1", id: eventId }] };
            }
            if (sql.includes("FROM program_speaker_projection_entries")) {
              return {
                results: [
                  {
                    id: participantId,
                    participant_id: participantId,
                    session_ids_json: "[]",
                    display_name: "Published Speaker",
                    title: null,
                    company: null,
                    bio: "",
                    avatar_url: photoPath,
                    avatar_asset_id: "asset-published",
                    avatar_object_key: "headshots/published.png",
                    avatar_content_type: "image/png",
                    avatar_size_bytes: pinnedBytes.byteLength,
                  },
                ],
              };
            }
            if (sql.includes("FROM program_agenda_projection_entries")) {
              return { results: [] };
            }
            return { results: [] };
          },
        };
        return statement as unknown as D1PreparedStatement;
      },
    } as unknown as D1Database;
    const store = new D1PublishedSpeakerProjectionStore(
      database,
      {
        async getEvent() {
          return {
            id: eventId,
            organizationId: "org-1",
            slug: eventSlug,
            name: "Immutable Event",
            timeZone: "UTC",
            startsAt: "2026-09-01T09:00:00.000Z",
            endsAt: "2026-09-01T17:00:00.000Z",
            venue: null,
          } as never;
        },
      } as never,
      {
        async getState() {
          return {
            servedManifest: {
              agendaProjectionId: "agenda-projection-1",
              speakerProjectionId: projectionId,
              speakerRevisionNumber: 1,
              publishedAt: "2026-08-15T00:00:00.000Z",
            },
          } as never;
        },
      } as never,
      {
        async listAssets() {
          return currentAssets as never;
        },
      } as never,
      {
        async get(key: string) {
          return (objects.get(key) ?? null) as never;
        },
      } as unknown as R2Bucket,
    );

    const published = await store.getPublishedSpeakerHeadshot(eventSlug, participantId);
    expect(new TextDecoder().decode(published?.body)).toBe("published-headshot");
    await expect(store.getPublishedSpeakerHeadshots(eventSlug)).resolves.toEqual({
      [participantId]: {
        assetId: "asset-published",
        objectKey: "headshots/published.png",
        contentType: "image/png",
        sizeBytes: pinnedBytes.byteLength,
      },
    });

    currentAssets = [
      {
        id: "asset-replacement",
        participantId,
        kind: "headshot",
        state: "ready",
        reviewState: "approved",
        approvedVersionId: "asset-replacement",
        releasedVersionId: "asset-replacement",
        objectKey: "headshots/replacement.png",
        contentType: "image/png",
        sizeBytes: replacementBytes.byteLength,
      },
    ];

    const stillPublished = await store.getPublishedSpeakerHeadshot(eventSlug, participantId);
    expect(new TextDecoder().decode(stillPublished?.body)).toBe("published-headshot");
  });
});
