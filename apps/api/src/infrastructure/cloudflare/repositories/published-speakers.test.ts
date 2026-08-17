import type { D1Database, D1PreparedStatement, R2Bucket } from "@cloudflare/workers-types";
import { describe, expect, it } from "vitest";
import { publishedSpeakerPhotoPath } from "../../../routes/public-speakers";
import { D1PublishedSpeakerProjectionStore } from "./published-speakers";

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

describe("D1PublishedSpeakerProjectionStore", () => {
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
        objectKey: "headshots/replacement.png",
        contentType: "image/png",
        sizeBytes: replacementBytes.byteLength,
      },
    ];

    const stillPublished = await store.getPublishedSpeakerHeadshot(eventSlug, participantId);
    expect(new TextDecoder().decode(stillPublished?.body)).toBe("published-headshot");
  });
});
