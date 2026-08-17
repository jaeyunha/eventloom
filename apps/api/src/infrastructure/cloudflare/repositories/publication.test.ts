import { describe, expect, it } from "vitest";
import type { ProgramPublicationState } from "../../../features/events/types";
import { D1ProgramPublicationRepository } from "./publication";

interface CapturedStatement {
  readonly sql: string;
  readonly values: readonly unknown[];
}

class FakePublicationD1 {
  readonly batches: CapturedStatement[][] = [];

  constructor(
    readonly stateRow: Record<string, unknown>,
    readonly releaseRows: readonly Record<string, unknown>[],
  ) {}

  prepare(sql: string): D1PreparedStatement {
    const database = this;
    return {
      bind(...values: unknown[]) {
        return {
          async first<T>() {
            if (!sql.startsWith("SELECT * FROM program_publication_states")) {
              throw new Error(`Unexpected first query: ${sql}`);
            }
            return database.stateRow as T;
          },
          async all<T>() {
            if (!sql.startsWith("SELECT * FROM program_releases")) {
              throw new Error(`Unexpected all query: ${sql}`);
            }
            return { results: database.releaseRows as T[] };
          },
          sql,
          values,
        } as unknown as D1PreparedStatement;
      },
    } as unknown as D1PreparedStatement;
  }

  async batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const captured = statements.map((statement) => {
      const value = statement as unknown as CapturedStatement;
      return { sql: value.sql, values: value.values };
    });
    this.batches.push(captured);
    return statements.map(() => ({ meta: { changes: 1 } }) as D1Result<T>);
  }
}

const pendingRelease = {
  id: "release-1",
  organization_id: "org-a",
  event_id: "event-a",
  revision: 1,
  lifecycle: "pending",
  agenda_projection_id: "agenda-1",
  agenda_revision_number: 1,
  agenda_source_hash: "agenda-hash-1",
  speaker_projection_id: "speakers-1",
  speaker_revision_number: 1,
  speaker_source_hash: "speaker-hash-1",
  approved_content_revision: 1,
  approved_profile_revision: 1,
  released_asset_revision: 1,
  actor_id: "organizer-1",
  published_at: "2026-08-17T12:00:00.000Z",
  parent_served_revision: null,
  rollback_target_revision: null,
  cache_revision: 1,
  source_trigger: "initial-publication",
  reservation_owner_id: "agenda:event-a:operation-1",
  reservation_expires_at: "2026-08-17T12:05:00.000Z",
  failure_reason: null,
} as const;

describe("D1ProgramPublicationRepository", () => {
  it("round-trips reservation ownership and clears it when serving the release", async () => {
    const database = new FakePublicationD1(
      {
        organization_id: "org-a",
        event_id: "event-a",
        version: 1,
        served_revision: null,
        pending_revision: 1,
        pending_release_id: "release-1",
      },
      [pendingRelease],
    );
    const repository = new D1ProgramPublicationRepository(database as unknown as D1Database);
    const pending = await repository.getState("org-a", "event-a");
    expect(pending?.releases[0]).toMatchObject({
      reservationOwnerId: "agenda:event-a:operation-1",
      reservationExpiresAt: "2026-08-17T12:05:00.000Z",
    });
    if (pending === null) throw new Error("Expected the pending publication state.");
    const pendingManifest = pending.releases[0];
    if (pendingManifest === undefined) throw new Error("Expected the pending release.");
    const reassignedRelease = {
      ...pendingManifest,
      reservationOwnerId: "agenda:event-a:operation-2",
      reservationExpiresAt: "2026-08-17T12:10:00.000Z",
    };
    await repository.compareAndSwap("org-a", "event-a", 1, {
      ...pending,
      version: 2,
      releases: [reassignedRelease],
    });
    const reassignment = database.batches[0]?.find(({ sql }) =>
      sql.startsWith("UPDATE program_releases"),
    );
    expect(reassignment?.values.slice(0, 5)).toEqual([
      "pending",
      null,
      "2026-08-17T12:00:00.000Z",
      "agenda:event-a:operation-2",
      "2026-08-17T12:10:00.000Z",
    ]);
    const servedRelease = {
      ...pendingManifest,
      lifecycle: "served" as const,
      reservationOwnerId: null,
      reservationExpiresAt: null,
      publishedAt: "2026-08-17T12:01:00.000Z",
    };
    const served: ProgramPublicationState = {
      ...pending,
      version: 2,
      servedRevision: 1,
      servedManifest: servedRelease,
      pendingRevision: null,
      pendingReleaseId: null,
      releases: [servedRelease],
    };
    await repository.compareAndSwap("org-a", "event-a", 1, served);
    const releaseUpdate = database.batches[1]?.find(({ sql }) =>
      sql.startsWith("UPDATE program_releases"),
    );
    expect(releaseUpdate?.sql).toContain("reservation_owner_id=?");
    expect(releaseUpdate?.values.slice(0, 5)).toEqual([
      "served",
      null,
      "2026-08-17T12:01:00.000Z",
      null,
      null,
    ]);
    const reassignmentRootToken = database.batches[0]?.[0]?.values[4];
    const servedRootToken = database.batches[1]?.[0]?.values[4];
    expect(reassignmentRootToken).toEqual(expect.any(String));
    expect(servedRootToken).toEqual(expect.any(String));
    expect(servedRootToken).not.toBe(reassignmentRootToken);
    expect(reassignment?.values.at(-1)).toBe(reassignmentRootToken);
    expect(releaseUpdate?.values.at(-1)).toBe(servedRootToken);
  });
});
