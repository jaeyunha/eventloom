import { MemberRepositoryConflictError } from "../../../features/members/service";
import type {
  ReviewerPool,
  ReviewerPoolGrant,
  ReviewerPoolRepository,
} from "../../../features/members/types";
import {
  batch,
  consequentialStatements,
  guard,
  insertGuard,
  parseJson,
  rows,
  stableSort,
  statement,
  updateGuard,
} from "./shared";

interface PoolRow extends Record<string, unknown> {
  readonly id: string;
  readonly organization_id: string;
  readonly event_id: string;
  readonly round_id: string;
  readonly round_revision: number;
  readonly name: string | null;
  readonly version: number;
  readonly created_at: string;
  readonly updated_at: string;
}

interface MemberRow extends Record<string, unknown> {
  readonly reviewer_id: string;
  readonly assigned_count: number;
}

interface PoolMetadata {
  readonly grants?: Readonly<Record<string, number>>;
}

function poolId(organizationId: string, eventId: string, roundId: string): string {
  return `reviewer-pool:${organizationId}:${eventId}:${roundId}`;
}

function metadata(pool: ReviewerPool): string {
  return JSON.stringify({
    grants: Object.fromEntries(
      pool.grants.map((grant) => [grant.reviewerId, grant.maxAssignments]),
    ),
  } satisfies PoolMetadata);
}

function caps(value: string | null): Readonly<Record<string, number>> {
  if (value === null) return {};
  const parsed = parseJson<PoolMetadata>(value, {});
  return parsed.grants ?? {};
}

export class D1ReviewerPoolRepository implements ReviewerPoolRepository {
  constructor(private readonly database: D1Database) {}

  async getReviewerPool(
    organizationId: string,
    eventId: string,
    roundId: string,
  ): Promise<ReviewerPool | null> {
    const root = await statement(
      this.database,
      `SELECT * FROM reviewer_pools
       WHERE organization_id = ? AND event_id = ? AND round_id = ?
       ORDER BY round_revision DESC
       LIMIT 1`,
      [organizationId, eventId, roundId],
    ).first<PoolRow>();
    if (root === null) return null;

    const result = await statement(
      this.database,
      `SELECT member.reviewer_id,
              count(assignment.id) AS assigned_count
       FROM reviewer_pool_members AS member
       LEFT JOIN review_assignments AS assignment
         ON assignment.organization_id = member.organization_id
        AND assignment.event_id = member.event_id
        AND assignment.round_id = ?
        AND assignment.round_revision = ?
        AND assignment.reviewer_id = member.reviewer_id
        AND assignment.status <> 'superseded'
       WHERE member.organization_id = ?
         AND member.event_id = ?
         AND member.pool_id = ?
       GROUP BY member.reviewer_id
       ORDER BY member.reviewer_id`,
      [roundId, root.round_revision, organizationId, eventId, root.id],
    ).all<MemberRow>();
    const maximums = caps(root.name);
    const grants: ReviewerPoolGrant[] = rows(result).map((row) => ({
      reviewerId: row.reviewer_id,
      maxAssignments: maximums[row.reviewer_id] ?? 1,
      assignedCount: Number(row.assigned_count),
    }));
    return {
      organizationId,
      eventId,
      roundId,
      reviewerIds: grants.map((grant) => grant.reviewerId),
      grants,
      version: Number(root.version),
      createdAt: root.created_at,
      updatedAt: root.updated_at,
    };
  }

  async saveReviewerPool(pool: ReviewerPool, expectedVersion: number | null): Promise<void> {
    if (pool.version !== (expectedVersion ?? 0) + 1) {
      throw new MemberRepositoryConflictError("The reviewer pool version is invalid.");
    }
    const normalizedGrants = stableSort(pool.grants, (grant) => grant.reviewerId);
    if (
      new Set(normalizedGrants.map((grant) => grant.reviewerId)).size !== normalizedGrants.length ||
      normalizedGrants.some(
        (grant) =>
          !Number.isInteger(grant.maxAssignments) ||
          grant.maxAssignments <= 0 ||
          grant.assignedCount < 0 ||
          grant.assignedCount > grant.maxAssignments,
      )
    ) {
      throw new MemberRepositoryConflictError("The reviewer pool grants are invalid.");
    }

    const id = poolId(pool.organizationId, pool.eventId, pool.roundId);
    const roundRevision = `(SELECT max(revision) FROM review_rounds WHERE organization_id = ? AND event_id = ? AND id = ?)`;
    const primary =
      expectedVersion === null
        ? statement(
            this.database,
            `INSERT INTO reviewer_pools
               (id, organization_id, event_id, round_id, round_revision, name, version, created_at, updated_at)
             VALUES (?, ?, ?, ?, ${roundRevision}, ?, ?, ?, ?)`,
            [
              id,
              pool.organizationId,
              pool.eventId,
              pool.roundId,
              pool.organizationId,
              pool.eventId,
              pool.roundId,
              metadata(pool),
              pool.version,
              pool.createdAt,
              pool.updatedAt,
            ],
          )
        : statement(
            this.database,
            `UPDATE reviewer_pools
             SET round_revision = ${roundRevision}, name = ?, version = ?, updated_at = ?
             WHERE organization_id = ? AND event_id = ? AND round_id = ? AND version = ?`,
            [
              pool.organizationId,
              pool.eventId,
              pool.roundId,
              metadata(pool),
              pool.version,
              pool.updatedAt,
              pool.organizationId,
              pool.eventId,
              pool.roundId,
              expectedVersion,
            ],
          );
    const cas =
      expectedVersion === null
        ? insertGuard(
            this.database,
            "reviewer_pools",
            "organization_id = ? AND event_id = ? AND round_id = ?",
            [pool.organizationId, pool.eventId, pool.roundId],
          )
        : updateGuard(
            this.database,
            "reviewer_pools",
            "organization_id = ? AND event_id = ? AND round_id = ? AND version = ?",
            [pool.organizationId, pool.eventId, pool.roundId, expectedVersion],
          );
    const statements = [
      guard(
        this.database,
        "EXISTS (SELECT 1 FROM review_rounds WHERE organization_id = ? AND event_id = ? AND id = ?)",
        [pool.organizationId, pool.eventId, pool.roundId],
      ),
      cas,
      primary,
      statement(
        this.database,
        "DELETE FROM reviewer_pool_members WHERE organization_id = ? AND event_id = ? AND pool_id = ?",
        [pool.organizationId, pool.eventId, id],
      ),
      ...normalizedGrants.map((grant) =>
        statement(
          this.database,
          `INSERT INTO reviewer_pool_members
             (organization_id, event_id, pool_id, reviewer_id)
           VALUES (?, ?, ?, ?)`,
          [pool.organizationId, pool.eventId, id, grant.reviewerId],
        ),
      ),
      guard(
        this.database,
        `NOT EXISTS (
           SELECT 1
           FROM review_assignments AS assignment
           JOIN reviewer_pools AS saved
             ON saved.organization_id = assignment.organization_id
            AND saved.event_id = assignment.event_id
            AND saved.round_id = assignment.round_id
            AND saved.round_revision = assignment.round_revision
           WHERE saved.organization_id = ? AND saved.event_id = ? AND saved.id = ?
             AND assignment.status <> 'superseded'
           GROUP BY assignment.reviewer_id
           HAVING count(*) > coalesce(json_extract(saved.name, '$.grants.' || assignment.reviewer_id), 0)
         )`,
        [pool.organizationId, pool.eventId, id],
      ),
      ...consequentialStatements(this.database, {
        tenantId: pool.organizationId,
        eventId: pool.eventId,
        action: expectedVersion === null ? "created" : "updated",
        resourceType: "reviewer_pool",
        resourceId: id,
        resourceVersion: pool.version,
        occurredAt: pool.updatedAt,
        after: pool,
        sync: { entityType: "reviewer_pool", applicationId: id, payload: pool },
      }),
    ];
    try {
      await batch(this.database, statements);
    } catch (error) {
      throw new MemberRepositoryConflictError(
        error instanceof Error
          ? `The reviewer pool changed or violates an assignment cap. ${error.message}`
          : "The reviewer pool changed or violates an assignment cap.",
      );
    }
  }
}

export { D1ReviewerPoolRepository as CloudflareReviewerPoolRepository };
