import { reportConflict } from "../../../features/reports/service";
import type {
  ReportDataScope,
  ReportDefinition,
  ReportProgramRecord,
  ReportRepository,
  ReportRepositoryScope,
  ReportRun,
} from "../../../features/reports/types";
import {
  batch,
  consequentialStatements,
  guard,
  insertGuard,
  json,
  parseJson,
  rows,
  statement,
} from "./shared";

type Row = Record<string, unknown>;
const text = (v: unknown) => String(v);
const number = (v: unknown) => Number(v);

function definitionFrom(row: Row): ReportDefinition {
  return {
    id: text(row.id),
    tenantId: text(row.organization_id),
    eventId: text(row.event_id),
    name: text(row.name),
    description: text(row.description),
    relationships: parseJson(text(row.relationships_json), []),
    fields: parseJson(text(row.fields_json), []),
    order: parseJson(text(row.order_json), []),
    filters: parseJson(text(row.filters_json), []),
    sort: parseJson(text(row.sort_json), []),
    version: number(row.version),
    createdBy: text(row.created_by),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}
function runFrom(row: Row): ReportRun {
  const output = {
    format: row.format as ReportRun["export"]["format"],
    fileName: text(row.file_name),
    contentType: text(row.content_type),
    body: text(row.body),
    content: text(row.body),
    columns: parseJson<string[]>(text(row.columns_json), []),
    rowCount: number(row.row_count),
    outputDigest: text(row.output_digest),
  };
  return {
    id: text(row.id),
    tenantId: text(row.organization_id),
    eventId: text(row.event_id),
    definitionId: text(row.definition_id),
    definitionVersion: number(row.definition_version),
    requesterId: text(row.requester_id),
    parameters: parseJson(text(row.parameters_json), {} as ReportRun["parameters"]),
    requestedAt: text(row.requested_at),
    completedAt: text(row.completed_at),
    export: output,
    output,
    audit: parseJson(text(row.audit_json), {} as ReportRun["audit"]),
  };
}
function definitionValues(d: ReportDefinition) {
  return [
    d.name,
    d.description,
    json(d.relationships),
    json(d.fields),
    json(d.order),
    json(d.filters),
    json(d.sort),
    d.version,
    d.createdBy,
    d.createdAt,
    d.updatedAt,
  ] as const;
}

export class D1ReportRepository implements ReportRepository {
  constructor(private readonly database: D1Database) {}
  async listDefinitions(scope: ReportRepositoryScope) {
    const result = await statement(
      this.database,
      "SELECT * FROM report_definitions WHERE organization_id=? AND event_id=? AND deleted_at IS NULL ORDER BY name,id",
      [scope.tenantId, scope.eventId],
    ).all<Row>();
    return rows(result).map(definitionFrom);
  }
  async getDefinition(scope: ReportRepositoryScope, id: string) {
    const row = await statement(
      this.database,
      "SELECT * FROM report_definitions WHERE organization_id=? AND event_id=? AND id=? AND deleted_at IS NULL LIMIT 1",
      [scope.tenantId, scope.eventId, id],
    ).first<Row>();
    return row === null ? null : definitionFrom(row);
  }
  async findDefinition(tenantId: string, id: string) {
    const row = await statement(
      this.database,
      "SELECT * FROM report_definitions WHERE organization_id=? AND id=? AND deleted_at IS NULL LIMIT 1",
      [tenantId, id],
    ).first<Row>();
    return row === null ? null : definitionFrom(row);
  }
  async createDefinition(value: ReportDefinition) {
    try {
      await batch(this.database, [
        insertGuard(this.database, "report_definitions", "organization_id=? AND id=?", [
          value.tenantId,
          value.id,
        ]),
        statement(
          this.database,
          `INSERT INTO report_definitions (id,organization_id,event_id,name,description,relationships_json,fields_json,order_json,filters_json,sort_json,version,created_by,created_at,updated_at,deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)`,
          [value.id, value.tenantId, value.eventId, ...definitionValues(value)],
        ),
        statement(
          this.database,
          "INSERT INTO report_definition_versions (definition_id,organization_id,event_id,version,snapshot_json,created_at) VALUES (?,?,?,?,?,?)",
          [value.id, value.tenantId, value.eventId, value.version, json(value), value.updatedAt],
        ),
        ...consequentialStatements(this.database, {
          tenantId: value.tenantId,
          eventId: value.eventId,
          action: "definition.created",
          resourceType: "report_definition",
          resourceId: value.id,
          resourceVersion: value.version,
          occurredAt: value.updatedAt,
          after: value,
          sync: { entityType: "report_definition", applicationId: value.id, payload: value },
        }),
      ]);
    } catch {
      throw reportConflict();
    }
    return value;
  }
  async updateDefinition(
    scope: ReportRepositoryScope,
    id: string,
    expectedVersion: number,
    value: ReportDefinition,
  ) {
    try {
      await batch(this.database, [
        guard(
          this.database,
          "EXISTS (SELECT 1 FROM report_definitions WHERE organization_id=? AND event_id=? AND id=? AND version=? AND deleted_at IS NULL)",
          [scope.tenantId, scope.eventId, id, expectedVersion],
        ),
        statement(
          this.database,
          `UPDATE report_definitions SET name=?,description=?,relationships_json=?,fields_json=?,order_json=?,filters_json=?,sort_json=?,version=?,created_by=?,created_at=?,updated_at=? WHERE organization_id=? AND event_id=? AND id=? AND version=? AND deleted_at IS NULL`,
          [...definitionValues(value), scope.tenantId, scope.eventId, id, expectedVersion],
        ),
        statement(
          this.database,
          "INSERT INTO report_definition_versions (definition_id,organization_id,event_id,version,snapshot_json,created_at) VALUES (?,?,?,?,?,?)",
          [id, scope.tenantId, scope.eventId, value.version, json(value), value.updatedAt],
        ),
        ...consequentialStatements(this.database, {
          tenantId: scope.tenantId,
          eventId: scope.eventId,
          action: "definition.updated",
          resourceType: "report_definition",
          resourceId: id,
          resourceVersion: value.version,
          occurredAt: value.updatedAt,
          after: value,
          sync: { entityType: "report_definition", applicationId: id, payload: value },
        }),
      ]);
    } catch {
      throw reportConflict();
    }
    return value;
  }
  async deleteDefinition(scope: ReportRepositoryScope, id: string, expectedVersion: number) {
    const at = new Date().toISOString();
    try {
      await batch(this.database, [
        guard(
          this.database,
          "EXISTS (SELECT 1 FROM report_definitions WHERE organization_id=? AND event_id=? AND id=? AND version=? AND deleted_at IS NULL)",
          [scope.tenantId, scope.eventId, id, expectedVersion],
        ),
        statement(
          this.database,
          "UPDATE report_definitions SET deleted_at=?,updated_at=? WHERE organization_id=? AND event_id=? AND id=? AND version=? AND deleted_at IS NULL",
          [at, at, scope.tenantId, scope.eventId, id, expectedVersion],
        ),
        ...consequentialStatements(this.database, {
          tenantId: scope.tenantId,
          eventId: scope.eventId,
          action: "definition.deleted",
          resourceType: "report_definition",
          resourceId: id,
          resourceVersion: expectedVersion,
          occurredAt: at,
          sync: { entityType: "report_definition", applicationId: id, operation: "archive" },
        }),
      ]);
    } catch {
      throw reportConflict();
    }
  }
  async recordRun(value: ReportRun) {
    try {
      await batch(this.database, [
        insertGuard(this.database, "report_runs", "organization_id=? AND event_id=? AND id=?", [
          value.tenantId,
          value.eventId,
          value.id,
        ]),
        guard(
          this.database,
          "EXISTS (SELECT 1 FROM report_definition_versions WHERE organization_id=? AND event_id=? AND definition_id=? AND version=?)",
          [value.tenantId, value.eventId, value.definitionId, value.definitionVersion],
        ),
        statement(
          this.database,
          `INSERT INTO report_runs (id,organization_id,event_id,definition_id,definition_version,requester_id,format,parameters_json,requested_at,completed_at,file_name,content_type,body,columns_json,row_count,output_digest,audit_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            value.id,
            value.tenantId,
            value.eventId,
            value.definitionId,
            value.definitionVersion,
            value.requesterId,
            value.export.format,
            json(value.parameters),
            value.requestedAt,
            value.completedAt,
            value.export.fileName,
            value.export.contentType,
            value.export.body,
            json(value.export.columns),
            value.export.rowCount,
            value.export.outputDigest,
            json(value.audit),
          ],
        ),
        ...consequentialStatements(this.database, {
          tenantId: value.tenantId,
          eventId: value.eventId,
          action: "run.recorded",
          resourceType: "report_run",
          resourceId: value.id,
          resourceVersion: value.definitionVersion,
          occurredAt: value.completedAt,
          after: value,
        }),
      ]);
    } catch {
      throw reportConflict(
        "The report run already exists or references a stale definition version.",
      );
    }
    return value;
  }
  async getRun(scope: ReportRepositoryScope, id: string) {
    const row = await statement(
      this.database,
      "SELECT * FROM report_runs WHERE organization_id=? AND event_id=? AND id=? LIMIT 1",
      [scope.tenantId, scope.eventId, id],
    ).first<Row>();
    return row === null ? null : runFrom(row);
  }
  async listRuns(scope: ReportRepositoryScope, definitionId?: string) {
    const result = await statement(
      this.database,
      `SELECT * FROM report_runs WHERE organization_id=? AND event_id=?${definitionId === undefined ? "" : " AND definition_id=?"} ORDER BY completed_at DESC,id DESC`,
      definitionId === undefined
        ? [scope.tenantId, scope.eventId]
        : [scope.tenantId, scope.eventId, definitionId],
    ).all<Row>();
    return rows(result).map(runFrom);
  }
  async listProgramRecords(scope: ReportDataScope): Promise<readonly ReportProgramRecord[]> {
    const sessionResult = await statement(
      this.database,
      `SELECT s.*,r.name room_name,f.name format_name,
      COALESCE((SELECT json_group_array(t.name) FROM session_tracks st JOIN tracks t ON t.organization_id=st.organization_id AND t.event_id=st.event_id AND t.id=st.track_id WHERE st.organization_id=s.organization_id AND st.event_id=s.event_id AND st.session_id=s.id),'[]') track_names_json
      FROM sessions s LEFT JOIN rooms r ON r.organization_id=s.organization_id AND r.event_id=s.event_id AND r.id=s.room_id LEFT JOIN formats f ON f.organization_id=s.organization_id AND f.event_id=s.event_id AND f.id=s.format_id WHERE s.organization_id=? AND s.event_id=? AND s.deleted_at IS NULL ORDER BY s.id`,
      [scope.tenantId, scope.eventId],
    ).all<Row>();
    const records: ReportProgramRecord[] = [];
    for (const s of rows(sessionResult)) {
      const [participantResult, speakerResult, progressResult] = await Promise.all([
        statement(
          this.database,
          `SELECT DISTINCT p.id,p.display_name,p.email,sp.biography FROM session_speakers ss LEFT JOIN participants p ON p.organization_id=ss.organization_id AND p.event_id=ss.event_id AND p.id=ss.speaker_id LEFT JOIN submission_participants sp ON sp.organization_id=p.organization_id AND sp.event_id=p.event_id AND sp.participant_id=p.id WHERE ss.organization_id=? AND ss.event_id=? AND ss.session_id=? ORDER BY p.id`,
          [scope.tenantId, scope.eventId, text(s.id)],
        ).all<Row>(),
        statement(
          this.database,
          `SELECT DISTINCT COALESCE(sr.id,p.id) id,COALESCE(sr.display_name,p.display_name,ss.display_name) display_name,COALESCE(sr.biography,sp.biography,'') biography,COALESCE(sr.email,p.email) email FROM session_speakers ss LEFT JOIN speaker_roster sr ON sr.organization_id=ss.organization_id AND sr.event_id=ss.event_id AND (sr.id=ss.speaker_id OR sr.participant_id=ss.speaker_id) LEFT JOIN participants p ON p.organization_id=ss.organization_id AND p.event_id=ss.event_id AND p.id=ss.speaker_id LEFT JOIN submission_participants sp ON sp.organization_id=p.organization_id AND sp.event_id=p.event_id AND sp.participant_id=p.id WHERE ss.organization_id=? AND ss.event_id=? AND ss.session_id=? ORDER BY id`,
          [scope.tenantId, scope.eventId, text(s.id)],
        ).all<Row>(),
        statement(
          this.database,
          `SELECT rp.id plan_id,rp.name plan_name,rp.version plan_version,COUNT(ra.id) total,SUM(CASE WHEN ra.status='assigned' THEN 1 ELSE 0 END) assigned,SUM(CASE WHEN ra.status='in_progress' THEN 1 ELSE 0 END) in_progress,SUM(CASE WHEN ra.status='submitted' THEN 1 ELSE 0 END) submitted,SUM(CASE WHEN ra.status='abstained' THEN 1 ELSE 0 END) abstained,AVG(es.value_number) average_score,COUNT(es.value_number) score_count FROM review_plans rp LEFT JOIN review_assignments ra ON ra.organization_id=rp.organization_id AND ra.event_id=rp.event_id AND ra.plan_id=rp.id AND ra.submission_id=? LEFT JOIN evaluation_reviews er ON er.organization_id=ra.organization_id AND er.event_id=ra.event_id AND er.assignment_id=ra.id LEFT JOIN evaluation_scores es ON es.organization_id=er.organization_id AND es.event_id=er.event_id AND es.review_id=er.id WHERE rp.organization_id=? AND rp.event_id=? GROUP BY rp.id,rp.name,rp.version ORDER BY rp.id`,
          [text(s.id), scope.tenantId, scope.eventId],
        ).all<Row>(),
      ]);
      const people = (result: D1Result<Row>) =>
        rows(result).map((p) => ({
          id: text(p.id),
          displayName: text(p.display_name ?? ""),
          biography: text(p.biography ?? ""),
          ...(scope.includePersonalData && p.email != null ? { email: text(p.email) } : {}),
        }));
      const progress = rows(progressResult).map((p) => {
        const total = number(p.total);
        const submitted = number(p.submitted);
        return {
          planId: text(p.plan_id),
          planName: text(p.plan_name),
          planVersion: number(p.plan_version),
          total,
          assigned: number(p.assigned),
          inProgress: number(p.in_progress),
          submitted,
          abstained: number(p.abstained),
          completionPercent: total === 0 ? 0 : (submitted / total) * 100,
          averageScore: p.average_score == null ? null : number(p.average_score),
          scoreCount: number(p.score_count),
        };
      });
      records.push({
        tenantId: scope.tenantId,
        eventId: scope.eventId,
        session: {
          id: text(s.id),
          title: text(s.title),
          description: text(s.description),
          abstract: text(s.description),
          status: text(s.status),
          startsAt: null,
          endsAt: null,
          room: s.room_name == null ? "" : text(s.room_name),
          track: parseJson<string[]>(text(s.track_names_json), []).join(", "),
        },
        ...(scope.relationships.includes("participants")
          ? { participants: people(participantResult) }
          : {}),
        ...(scope.relationships.includes("speakers") ? { speakers: people(speakerResult) } : {}),
        ...(scope.relationships.includes("evaluationProgress")
          ? { evaluationProgress: progress }
          : {}),
      });
    }
    return records;
  }
}
