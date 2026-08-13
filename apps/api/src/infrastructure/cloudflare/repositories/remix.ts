import { RemixError } from "../../../features/remix/service";
import type {
  ContentRemixCandidate,
  RemixAuditEntry,
  RemixCandidateFilter,
  RemixRepository,
} from "../../../features/remix/types";
import {
  batch,
  consequentialStatements,
  type D1Value,
  guard,
  insertGuard,
  json,
  parseJson,
  rows,
  statement,
} from "./shared";

interface CandidateRow {
  id: string;
  organization_id: string;
  event_id: string;
  source_type: ContentRemixCandidate["sourceType"];
  source_id: string;
  source_revision: number;
  fields_json: string;
  tone: string;
  guidance: string;
  original_json: string;
  candidate_json: string;
  changed_fields_json: string;
  change_summary: string;
  provenance_json: string;
  status: ContentRemixCandidate["status"];
  version: number;
  generation: number;
  parent_candidate_id: string | null;
  created_at: string;
  created_by: string;
  applied_at: string | null;
  applied_by: string | null;
  applied_revision_id: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  stale_at: string | null;
  stale_reason: string | null;
}

interface AuditRow {
  id: string;
  organization_id: string;
  event_id: string;
  candidate_id: string;
  actor_id: string;
  action: RemixAuditEntry["action"];
  created_at: string;
  details_json: string;
}

function candidateFromRow(row: CandidateRow): ContentRemixCandidate {
  return {
    id: row.id,
    tenantId: row.organization_id,
    eventId: row.event_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceRevision: row.source_revision,
    fields: parseJson(row.fields_json, []),
    tone: row.tone,
    guidance: row.guidance,
    original: parseJson(row.original_json, {} as ContentRemixCandidate["original"]),
    candidate: parseJson(row.candidate_json, {} as ContentRemixCandidate["candidate"]),
    changedFields: parseJson(row.changed_fields_json, []),
    changeSummary: row.change_summary,
    provenance: parseJson(row.provenance_json, {} as ContentRemixCandidate["provenance"]),
    status: row.status,
    version: row.version,
    generation: row.generation,
    parentCandidateId: row.parent_candidate_id,
    createdAt: row.created_at,
    createdBy: row.created_by,
    ...(row.applied_at === null ? {} : { appliedAt: row.applied_at }),
    ...(row.applied_by === null ? {} : { appliedBy: row.applied_by }),
    ...(row.applied_revision_id === null ? {} : { appliedRevisionId: row.applied_revision_id }),
    ...(row.rejected_at === null ? {} : { rejectedAt: row.rejected_at }),
    ...(row.rejected_by === null ? {} : { rejectedBy: row.rejected_by }),
    ...(row.rejection_reason === null ? {} : { rejectionReason: row.rejection_reason }),
    ...(row.stale_at === null ? {} : { staleAt: row.stale_at }),
    ...(row.stale_reason === null ? {} : { staleReason: row.stale_reason }),
  };
}

function toD1Values(values: readonly unknown[]): readonly D1Value[] {
  return values.map((value) => {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      value instanceof ArrayBuffer ||
      ArrayBuffer.isView(value)
    ) {
      return value;
    }
    throw new TypeError("Unsupported D1 bind value.");
  });
}

function candidateValues(candidate: ContentRemixCandidate): readonly D1Value[] {
  return [
    candidate.sourceType,
    candidate.sourceId,
    candidate.sourceRevision,
    json(candidate.fields),
    candidate.tone,
    candidate.guidance,
    json(candidate.original),
    json(candidate.candidate),
    json(candidate.changedFields),
    candidate.changeSummary,
    json(candidate.provenance),
    candidate.status,
    candidate.version,
    candidate.generation,
    candidate.parentCandidateId,
    candidate.createdAt,
    candidate.createdBy,
    candidate.appliedAt ?? null,
    candidate.appliedBy ?? null,
    candidate.appliedRevisionId ?? null,
    candidate.rejectedAt ?? null,
    candidate.rejectedBy ?? null,
    candidate.rejectionReason ?? null,
    candidate.staleAt ?? null,
    candidate.staleReason ?? null,
  ];
}

function conflict(): RemixError {
  return new RemixError("REMIX_CONFLICT", "The remix candidate changed since it was loaded.", 409);
}

export class D1RemixRepository implements RemixRepository {
  constructor(private readonly database: D1Database) {}

  async getCandidateById(tenantId: string, candidateId: string) {
    const row = await statement(
      this.database,
      "SELECT * FROM remix_candidates WHERE organization_id = ? AND id = ? LIMIT 1",
      [tenantId, candidateId],
    ).first<CandidateRow>();
    return row === null ? null : candidateFromRow(row);
  }

  async getCandidate(tenantId: string, eventId: string, candidateId: string) {
    const row = await statement(
      this.database,
      "SELECT * FROM remix_candidates WHERE organization_id = ? AND event_id = ? AND id = ? LIMIT 1",
      [tenantId, eventId, candidateId],
    ).first<CandidateRow>();
    return row === null ? null : candidateFromRow(row);
  }

  async listCandidates(tenantId: string, eventId: string, filter?: RemixCandidateFilter) {
    const predicates = ["organization_id = ?", "event_id = ?"];
    const values: D1Value[] = [tenantId, eventId];
    if (filter?.status !== undefined) {
      predicates.push("status = ?");
      values.push(filter.status);
    }
    if (filter?.sourceType !== undefined) {
      predicates.push("source_type = ?");
      values.push(filter.sourceType);
    }
    if (filter?.sourceId !== undefined) {
      predicates.push("source_id = ?");
      values.push(filter.sourceId);
    }
    const result = await statement(
      this.database,
      `SELECT * FROM remix_candidates WHERE ${predicates.join(" AND ")} ORDER BY created_at, id`,
      values,
    ).all<CandidateRow>();
    return rows(result).map(candidateFromRow);
  }

  async saveCandidate(candidate: ContentRemixCandidate, expectedVersion: number | null) {
    const write =
      expectedVersion === null
        ? statement(
            this.database,
            `INSERT INTO remix_candidates
             (id, organization_id, event_id, source_type, source_id, source_revision,
              fields_json, tone, guidance, original_json, candidate_json, changed_fields_json,
              change_summary, provenance_json, status, version, generation, parent_candidate_id,
              created_at, created_by, applied_at, applied_by, applied_revision_id, rejected_at,
              rejected_by, rejection_reason, stale_at, stale_reason)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            toD1Values([
              candidate.id,
              candidate.tenantId,
              candidate.eventId,
              ...candidateValues(candidate),
            ]),
          )
        : statement(
            this.database,
            `UPDATE remix_candidates SET
             source_type = ?, source_id = ?, source_revision = ?, fields_json = ?, tone = ?,
             guidance = ?, original_json = ?, candidate_json = ?, changed_fields_json = ?,
             change_summary = ?, provenance_json = ?, status = ?, version = ?, generation = ?,
             parent_candidate_id = ?, created_at = ?, created_by = ?, applied_at = ?, applied_by = ?,
             applied_revision_id = ?, rejected_at = ?, rejected_by = ?, rejection_reason = ?,
             stale_at = ?, stale_reason = ?
           WHERE organization_id = ? AND event_id = ? AND id = ? AND version = ?`,
            toD1Values([
              ...candidateValues(candidate),
              candidate.tenantId,
              candidate.eventId,
              candidate.id,
              expectedVersion,
            ]),
          );
    const cas =
      expectedVersion === null
        ? insertGuard(this.database, "remix_candidates", "organization_id = ? AND id = ?", [
            candidate.tenantId,
            candidate.id,
          ])
        : guard(
            this.database,
            "EXISTS (SELECT 1 FROM remix_candidates WHERE organization_id = ? AND event_id = ? AND id = ? AND version = ?)",
            [candidate.tenantId, candidate.eventId, candidate.id, expectedVersion],
          );
    try {
      await batch(this.database, [
        cas,
        write,
        ...consequentialStatements(this.database, {
          tenantId: candidate.tenantId,
          eventId: candidate.eventId,
          action: expectedVersion === null ? "candidate.created" : `candidate.${candidate.status}`,
          resourceType: "remix_candidate",
          resourceId: candidate.id,
          resourceVersion: candidate.version,
          occurredAt:
            candidate.appliedAt ?? candidate.rejectedAt ?? candidate.staleAt ?? candidate.createdAt,
          after: candidate,
          sync: { entityType: "remix_candidate", applicationId: candidate.id, payload: candidate },
        }),
      ]);
    } catch {
      throw conflict();
    }
  }

  async appendAudit(entry: RemixAuditEntry) {
    await batch(this.database, [
      guard(
        this.database,
        "EXISTS (SELECT 1 FROM remix_candidates WHERE organization_id = ? AND event_id = ? AND id = ?)",
        [entry.tenantId, entry.eventId, entry.candidateId],
      ),
      statement(
        this.database,
        `INSERT INTO remix_audit
           (id, organization_id, event_id, candidate_id, actor_id, action, created_at, details_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.id,
          entry.tenantId,
          entry.eventId,
          entry.candidateId,
          entry.actorId,
          entry.action,
          entry.createdAt,
          json(entry.details),
        ],
      ),
    ]);
  }

  async listAudit(tenantId: string, eventId: string) {
    const result = await statement(
      this.database,
      "SELECT * FROM remix_audit WHERE organization_id = ? AND event_id = ? ORDER BY created_at, id",
      [tenantId, eventId],
    ).all<AuditRow>();
    return rows(result).map((row) => ({
      id: row.id,
      tenantId: row.organization_id,
      eventId: row.event_id,
      candidateId: row.candidate_id,
      actorId: row.actor_id,
      action: row.action,
      createdAt: row.created_at,
      details: parseJson(row.details_json, {}),
    }));
  }
}
