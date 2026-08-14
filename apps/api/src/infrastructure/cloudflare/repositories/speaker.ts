import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";
import { and, eq, inArray } from "drizzle-orm";

import { createDatabase, type OpenSessionboardDatabase } from "../../../db/client";
import {
  events,
  speakerAssetComments,
  speakerAssets,
  speakerProfiles,
  speakerTaskDependencies,
  speakerTaskReminderOffsets,
  speakerTasks,
  submissions,
} from "../../../db/schema";
import type {
  FinalizeSpeakerAssetCommand,
  RepositoryResult,
  SpeakerAccessScope,
  SpeakerAsset,
  SpeakerAssetAuditEntry,
  SpeakerAssetReviewCommand,
  SpeakerPortalContext,
  SpeakerProfile,
  SpeakerRepository,
  SpeakerSubmission,
  SpeakerTask,
  SpeakerTaskRepositoryCommand,
  TransitionSpeakerTaskCommand,
  UpdateBiographyCommand,
  UpdateSpeakerProfileCommand,
} from "../../../features/speaker/types";

export function portalSubmissionStatus(
  submissionStatus: string,
  decisionStatus: string | undefined,
): SpeakerSubmission["status"] {
  if (decisionStatus === "accepted") return "accepted";
  if (decisionStatus === "rejected") return "declined";
  if (decisionStatus === "waitlisted") return "under_review";
  if (
    submissionStatus === "draft" ||
    submissionStatus === "submitted" ||
    submissionStatus === "under_review" ||
    submissionStatus === "accepted" ||
    submissionStatus === "declined" ||
    submissionStatus === "withdrawn"
  ) {
    return submissionStatus;
  }
  return "submitted";
}

const json = (value: unknown): string => JSON.stringify(value);
const auditLabel = "__speaker_asset_audit__";

type EventScope = { organizationId: string; eventId: string };

export class D1SpeakerRepository implements SpeakerRepository {
  readonly #db: D1Database;
  readonly #orm: OpenSessionboardDatabase;

  constructor(db: D1Database) {
    this.#db = db;
    this.#orm = createDatabase(db);
  }

  async listPortalContexts(accountId: string): Promise<SpeakerPortalContext[]> {
    const result = await this.#db
      .withSession("first-primary")
      .prepare(
        `SELECT e.organization_id,
                e.id AS event_id,
                e.name AS event_name,
                e.slug AS event_slug,
                e.status AS event_status,
                s.id AS submission_id,
                sp.participant_id
           FROM submissions AS s
           JOIN events AS e
             ON e.organization_id = s.organization_id
            AND e.id = s.event_id
      LEFT JOIN submission_participants AS sp
             ON sp.organization_id = s.organization_id
            AND sp.event_id = s.event_id
            AND sp.submission_id = s.id
            AND sp.role = 'primary'
          WHERE s.owner_account_id = ?
       ORDER BY e.updated_at DESC, s.updated_at DESC`,
      )
      .bind(accountId)
      .all<Record<string, unknown>>();
    const contexts = new Map<string, SpeakerPortalContext>();
    for (const row of result.results ?? []) {
      const eventId = String(row.event_id);
      const submissionId = String(row.submission_id);
      const participantId =
        row.participant_id === null || row.participant_id === undefined
          ? undefined
          : String(row.participant_id);
      const existing = contexts.get(eventId);
      if (existing !== undefined) {
        contexts.set(eventId, {
          ...existing,
          submissionIds: existing.submissionIds.includes(submissionId)
            ? existing.submissionIds
            : [...existing.submissionIds, submissionId],
          participantIds:
            participantId === undefined || existing.participantIds.includes(participantId)
              ? existing.participantIds
              : [...existing.participantIds, participantId],
        });
        continue;
      }
      contexts.set(eventId, {
        id: eventId,
        organizationId: String(row.organization_id),
        eventId,
        name: String(row.event_name),
        slug: String(row.event_slug),
        status: String(row.event_status),
        capabilities: ["submission-edit"],
        submissionIds: [submissionId],
        participantIds: participantId === undefined ? [] : [participantId],
        ...(participantId === undefined ? {} : { primaryParticipantId: participantId }),
      });
    }
    return [...contexts.values()];
  }

  async listPortalContextScopes(accountId: string): Promise<
    readonly {
      context: SpeakerPortalContext;
      scope: SpeakerAccessScope;
    }[]
  > {
    return (await this.listPortalContexts(accountId)).map((context) => ({
      context,
      scope: {
        submissionIds: context.submissionIds,
        participantIds: context.participantIds,
        capabilities: context.capabilities,
      },
    }));
  }

  async getAccessScope(eventId: string, accountId: string): Promise<SpeakerAccessScope> {
    const session = this.#db.withSession("first-primary");
    const projected = await session
      .prepare(
        `SELECT pc.organization_id, pc.primary_participant_id, pc.capabilities_json,
              group_concat(DISTINCT pcp.participant_id) AS participant_ids,
              group_concat(DISTINCT pcs.submission_id) AS submission_ids
         FROM portal_contexts pc
         LEFT JOIN portal_context_participants pcp ON pcp.organization_id = pc.organization_id AND pcp.event_id = pc.event_id AND pcp.context_id = pc.id
         LEFT JOIN portal_context_submissions pcs ON pcs.organization_id = pc.organization_id AND pcs.event_id = pc.event_id AND pcs.context_id = pc.id
        WHERE pc.event_id = ? AND pc.account_id = ? AND pc.status <> 'archived'
        GROUP BY pc.organization_id, pc.id
        LIMIT 1`,
      )
      .bind(eventId, accountId)
      .first<Record<string, unknown>>();
    if (projected !== null) {
      return {
        tenantId: String(projected.organization_id),
        submissionIds: String(projected.submission_ids ?? "")
          .split(",")
          .filter(Boolean),
        participantIds: String(projected.participant_ids ?? "")
          .split(",")
          .filter(Boolean),
        capabilities: JSON.parse(String(projected.capabilities_json ?? "[]")),
        primaryParticipantId: String(projected.primary_participant_id),
        role: "speaker",
      };
    }
    const owned = await session
      .prepare(
        `SELECT s.organization_id,
                group_concat(DISTINCT s.id) AS submission_ids,
                group_concat(DISTINCT sp.participant_id) AS participant_ids,
                max(CASE WHEN sp.role = 'primary' THEN sp.participant_id END)
                  AS primary_participant_id
           FROM submissions AS s
      LEFT JOIN submission_participants AS sp
             ON sp.organization_id = s.organization_id
            AND sp.event_id = s.event_id
            AND sp.submission_id = s.id
          WHERE s.event_id = ?
            AND s.owner_account_id = ?
       GROUP BY s.organization_id
          LIMIT 1`,
      )
      .bind(eventId, accountId)
      .first<Record<string, unknown>>();
    if (owned === null) return { submissionIds: [], participantIds: [] };
    return {
      tenantId: String(owned.organization_id),
      submissionIds: String(owned.submission_ids ?? "")
        .split(",")
        .filter(Boolean),
      participantIds: String(owned.participant_ids ?? "")
        .split(",")
        .filter(Boolean),
      capabilities: ["submission-edit"],
      primaryParticipantId: String(owned.primary_participant_id ?? ""),
      role: "speaker",
    };
  }

  async listSubmissions(
    eventId: string,
    submissionIds: readonly string[],
  ): Promise<SpeakerSubmission[]> {
    if (submissionIds.length === 0) return [];
    const rows = await this.#orm
      .select()
      .from(submissions)
      .where(
        and(eq(submissions.eventId, eventId), inArray(submissions.id, [...new Set(submissionIds)])),
      );
    const result: SpeakerSubmission[] = [];
    for (const row of rows) {
      const links = await this.#db
        .prepare(
          `SELECT sp.participant_id, sp.role, p.first_name, p.last_name, p.email
             FROM submission_participants sp
             JOIN participants p
               ON p.organization_id = sp.organization_id
              AND p.event_id = sp.event_id
              AND p.id = sp.participant_id
            WHERE sp.organization_id = ? AND sp.submission_id = ?
            ORDER BY sp.ordinal`,
        )
        .bind(row.organizationId, row.id)
        .all<{
          participant_id: string;
          role: string;
          first_name: string;
          last_name: string;
          email: string;
        }>();
      const answers = await this.#db
        .prepare(
          "SELECT field_key, value_json FROM submission_answers WHERE organization_id = ? AND submission_id = ?",
        )
        .bind(row.organizationId, row.id)
        .all<{ field_key: string; value_json: string }>();
      const answerRecord = Object.fromEntries(
        (answers.results ?? []).map((answer) => [answer.field_key, JSON.parse(answer.value_json)]),
      );
      const decision = await this.#db
        .withSession("first-primary")
        .prepare(
          "SELECT status FROM evaluation_decisions WHERE organization_id = ? AND event_id = ? AND submission_id = ? LIMIT 1",
        )
        .bind(row.organizationId, row.eventId, row.id)
        .first<{ status: string }>();
      result.push({
        id: row.id,
        eventId: row.eventId,
        title: typeof answerRecord.title === "string" ? answerRecord.title : row.id,
        status: portalSubmissionStatus(row.status, decision?.status),
        participantIds: (links.results ?? []).map((link) => link.participant_id),
        participants: (links.results ?? []).map((link) => ({
          id: link.participant_id,
          firstName: link.first_name,
          lastName: link.last_name,
          email: link.email,
          role: link.role === "primary" ? "primary" : "co_author",
        })),
        primaryParticipantId: (links.results ?? []).find((link) => link.role === "primary")
          ?.participant_id,
        formId: row.formId,
        version: row.version,
        updatedAt: row.updatedAt,
        answers: answerRecord,
      } as SpeakerSubmission);
    }
    return result;
  }

  async getSubmission(eventId: string, submissionId: string): Promise<SpeakerSubmission | null> {
    return (await this.listSubmissions(eventId, [submissionId]))[0] ?? null;
  }

  async listProfiles(
    eventId: string,
    participantIds: readonly string[],
  ): Promise<SpeakerProfile[]> {
    if (participantIds.length === 0) return [];
    const rows = await this.#orm
      .select()
      .from(speakerProfiles)
      .where(
        and(
          eq(speakerProfiles.eventId, eventId),
          inArray(speakerProfiles.participantId, [...new Set(participantIds)]),
        ),
      );
    return rows.map((row) => this.#profile(row));
  }

  async getProfile(eventId: string, participantId: string): Promise<SpeakerProfile | null> {
    return (await this.listProfiles(eventId, [participantId]))[0] ?? null;
  }

  async createProfile(profile: SpeakerProfile): Promise<RepositoryResult<SpeakerProfile>> {
    const scope = await this.#eventScope(profile.eventId);
    if (scope === null) return { ok: false, reason: "not_found" };
    try {
      await this.#db
        .prepare(
          `INSERT INTO speaker_profiles
             (id, organization_id, event_id, participant_id, display_name, email, job_title,
              company, status, biography, social_links_json, travel_required, arrival_at,
              departure_at, accommodation, dietary_requirements, accessibility_needs,
              travel_notes, headshot_asset_id, source_type, source_id, version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          profile.id,
          scope.organizationId,
          profile.eventId,
          profile.participantId,
          profile.displayName,
          profile.email ?? null,
          profile.jobTitle ?? "",
          profile.company ?? "",
          profile.status ?? "",
          profile.biography,
          json(profile.socialLinks ?? {}),
          profile.travelLogistics?.travelRequired ? 1 : 0,
          profile.travelLogistics?.arrivalAt ?? null,
          profile.travelLogistics?.departureAt ?? null,
          profile.travelLogistics?.accommodation ?? "",
          profile.travelLogistics?.dietaryRequirements ?? "",
          profile.travelLogistics?.accessibilityNeeds ?? "",
          profile.travelLogistics?.travelNotes ?? "",
          profile.headshotAssetId ?? null,
          profile.sourceType ?? null,
          profile.sourceId ?? null,
          profile.version,
          profile.updatedAt,
          profile.updatedAt,
        )
        .run();
    } catch {
      return { ok: false, reason: "version_conflict" };
    }
    const value = await this.getProfile(profile.eventId, profile.participantId);
    return value === null ? { ok: false, reason: "not_found" } : { ok: true, value };
  }

  async updateBiography(
    command: UpdateBiographyCommand,
  ): Promise<RepositoryResult<SpeakerProfile>> {
    const current = await this.getProfile(command.eventId, command.participantId);
    if (current === null) return { ok: false, reason: "not_found" };
    if (current.version !== command.expectedVersion)
      return { ok: false, reason: "version_conflict" };
    return this.updateProfile?.({ ...command, actorAccountId: command.participantId });
  }

  async updateProfile(
    command: UpdateSpeakerProfileCommand,
  ): Promise<RepositoryResult<SpeakerProfile>> {
    const current = await this.getProfile(command.eventId, command.participantId);
    if (current === null) return { ok: false, reason: "not_found" };
    if (current.version !== command.expectedVersion)
      return { ok: false, reason: "version_conflict" };
    const travel = command.travelLogistics ?? current.travelLogistics;
    const result = await this.#db
      .prepare(
        `UPDATE speaker_profiles SET display_name = ?, email = ?, job_title = ?, company = ?, status = ?, biography = ?, social_links_json = ?, headshot_asset_id = ?, travel_required = ?, arrival_at = ?, departure_at = ?, accommodation = ?, dietary_requirements = ?, accessibility_needs = ?, travel_notes = ?, version = version + 1, updated_at = ?
       WHERE event_id = ? AND participant_id = ? AND version = ?`,
      )
      .bind(
        command.displayName ?? current.displayName,
        command.email ?? current.email ?? null,
        command.jobTitle ?? current.jobTitle ?? "",
        command.company ?? current.company ?? "",
        command.status ?? current.status ?? "",
        command.biography ?? current.biography,
        json(command.socialLinks ?? current.socialLinks ?? {}),
        command.headshotAssetId === null
          ? null
          : (command.headshotAssetId ?? current.headshotAssetId ?? null),
        travel?.travelRequired ? 1 : 0,
        travel?.arrivalAt ?? null,
        travel?.departureAt ?? null,
        travel?.accommodation ?? "",
        travel?.dietaryRequirements ?? "",
        travel?.accessibilityNeeds ?? "",
        travel?.travelNotes ?? "",
        command.updatedAt,
        command.eventId,
        command.participantId,
        command.expectedVersion,
      )
      .run();
    if ((result.meta?.changes ?? 0) !== 1) return { ok: false, reason: "version_conflict" };
    const persisted = await this.getProfile(command.eventId, command.participantId);
    return persisted === null ? { ok: false, reason: "not_found" } : { ok: true, value: persisted };
  }

  async listTasks(eventId: string, participantIds: readonly string[]): Promise<SpeakerTask[]> {
    if (participantIds.length === 0) return [];
    const rows = await this.#orm
      .select()
      .from(speakerTasks)
      .where(
        and(
          eq(speakerTasks.eventId, eventId),
          inArray(speakerTasks.participantId, [...new Set(participantIds)]),
        ),
      );
    return Promise.all(rows.map((row) => this.#task(row)));
  }

  async getTask(eventId: string, taskId: string): Promise<SpeakerTask | null> {
    const rows = await this.#orm
      .select()
      .from(speakerTasks)
      .where(and(eq(speakerTasks.eventId, eventId), eq(speakerTasks.id, taskId)))
      .limit(1);
    return rows[0] === undefined ? null : this.#task(rows[0]);
  }

  async getTasksByIds(eventId: string, taskIds: readonly string[]): Promise<SpeakerTask[]> {
    if (taskIds.length === 0) return [];
    const rows = await this.#orm
      .select()
      .from(speakerTasks)
      .where(
        and(eq(speakerTasks.eventId, eventId), inArray(speakerTasks.id, [...new Set(taskIds)])),
      );
    return Promise.all(rows.map((row) => this.#task(row)));
  }

  async createTask(command: SpeakerTaskRepositoryCommand): Promise<RepositoryResult<SpeakerTask>> {
    return this.#saveTask(command, true);
  }
  async createSpeakerTask(
    command: SpeakerTaskRepositoryCommand,
  ): Promise<RepositoryResult<SpeakerTask>> {
    return this.createTask(command);
  }
  async updateTask(command: SpeakerTaskRepositoryCommand): Promise<RepositoryResult<SpeakerTask>> {
    return this.#saveTask(command, false);
  }
  async updateSpeakerTask(
    command: SpeakerTaskRepositoryCommand,
  ): Promise<RepositoryResult<SpeakerTask>> {
    return this.updateTask(command);
  }

  async transitionTask(
    command: TransitionSpeakerTaskCommand,
  ): Promise<RepositoryResult<{ task: SpeakerTask; transition: typeof command.transition }>> {
    const current = await this.getTask(command.eventId, command.taskId);
    if (current === null) return { ok: false, reason: "not_found" };
    if (current.version !== command.expectedVersion || current.status !== command.fromStatus)
      return { ok: false, reason: "version_conflict" };
    const scope = await this.#eventScope(command.eventId);
    if (scope === null) return { ok: false, reason: "not_found" };
    const statements = [
      this.#db
        .prepare(
          "UPDATE speaker_tasks SET status = ?, version = version + 1, updated_at = ? WHERE organization_id = ? AND event_id = ? AND id = ? AND version = ? AND status = ?",
        )
        .bind(
          command.toStatus,
          command.transition.occurredAt,
          scope.organizationId,
          command.eventId,
          command.taskId,
          command.expectedVersion,
          command.fromStatus,
        ),
      this.#db
        .prepare(
          "INSERT INTO speaker_task_transitions (id, organization_id, event_id, task_id, participant_id, actor_account_id, from_status, to_status, note, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          command.transition.id,
          scope.organizationId,
          command.eventId,
          command.taskId,
          command.transition.participantId,
          command.transition.actorAccountId,
          command.fromStatus,
          command.toStatus,
          command.transition.note ?? null,
          command.transition.occurredAt,
        ),
    ];
    try {
      const result = await this.#db.batch(statements);
      if ((result[0]?.meta?.changes ?? 0) !== 1) return { ok: false, reason: "version_conflict" };
    } catch {
      return { ok: false, reason: "version_conflict" };
    }
    const task = await this.getTask(command.eventId, command.taskId);
    return task === null
      ? { ok: false, reason: "not_found" }
      : { ok: true, value: { task, transition: command.transition } };
  }

  async createPendingAsset(asset: SpeakerAsset): Promise<SpeakerAsset> {
    const scope = await this.#eventScope(asset.eventId);
    if (scope === null || (asset.tenantId !== undefined && asset.tenantId !== scope.organizationId))
      throw new Error("The speaker asset is outside the event tenant.");
    const version = asset.version ?? 1;
    await this.#db.batch([
      this.#db
        .prepare(
          `INSERT INTO speaker_assets (id, organization_id, event_id, submission_id, participant_id, task_id, kind, object_key, file_name, content_type, size_bytes, state, version, version_family_id, supersedes_asset_id, comment_thread_id, review_state, review_note, reviewed_at, reviewed_by, review_version, latest_version_id, current_version_id, approved_version_id, released_version_id, rejection_reason, created_at, finalized_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          asset.id,
          scope.organizationId,
          asset.eventId,
          asset.submissionId ?? null,
          asset.participantId,
          asset.taskId ?? null,
          asset.kind,
          asset.objectKey,
          asset.fileName,
          asset.contentType,
          asset.sizeBytes,
          asset.state,
          version,
          asset.versionFamilyId ?? asset.id,
          asset.supersedesAssetId ?? null,
          asset.commentThreadId ?? `asset-thread:${asset.id}`,
          asset.reviewState ?? null,
          asset.reviewNote ?? null,
          asset.reviewedAt ?? null,
          asset.reviewedBy ?? null,
          asset.reviewVersion ?? 0,
          asset.latestVersionId ?? null,
          asset.currentVersionId ?? null,
          asset.approvedVersionId ?? null,
          asset.releasedVersionId ?? null,
          asset.rejectionReason ?? null,
          asset.createdAt,
          asset.finalizedAt ?? null,
        ),
    ]);
    const persisted = await this.getAsset(asset.eventId, asset.id);
    if (persisted === null) throw new Error("The speaker asset was not persisted.");
    return persisted;
  }

  async getAsset(eventId: string, assetId: string): Promise<SpeakerAsset | null> {
    const scope = await this.#eventScope(eventId);
    if (scope === null) return null;
    const rows = await this.#orm
      .select()
      .from(speakerAssets)
      .where(
        and(
          eq(speakerAssets.organizationId, scope.organizationId),
          eq(speakerAssets.eventId, eventId),
          eq(speakerAssets.id, assetId),
        ),
      )
      .limit(1);
    return rows[0] === undefined ? null : this.#asset(rows[0]);
  }

  async listAssets(eventId: string, participantIds: readonly string[]): Promise<SpeakerAsset[]> {
    if (participantIds.length === 0) return [];
    const scope = await this.#eventScope(eventId);
    if (scope === null) return [];
    const rows = await this.#orm
      .select()
      .from(speakerAssets)
      .where(
        and(
          eq(speakerAssets.organizationId, scope.organizationId),
          eq(speakerAssets.eventId, eventId),
          inArray(speakerAssets.participantId, [...new Set(participantIds)]),
        ),
      );
    return rows.map((row) => this.#asset(row));
  }

  async finalizeAsset(
    command: FinalizeSpeakerAssetCommand,
  ): Promise<RepositoryResult<SpeakerAsset>> {
    const current = await this.getAsset(command.eventId, command.assetId);
    if (current === null) return { ok: false, reason: "not_found" };
    if (current.state !== "pending_upload") return { ok: false, reason: "invalid_state" };
    const result = await this.#db
      .prepare(
        "UPDATE speaker_assets SET state = ?, finalized_at = ?, rejection_reason = ?, latest_version_id = ?, current_version_id = ? WHERE event_id = ? AND id = ? AND state = 'pending_upload'",
      )
      .bind(
        command.state,
        command.finalizedAt,
        command.rejectionReason ?? null,
        command.latestVersionId,
        command.currentVersionId ?? null,
        command.eventId,
        command.assetId,
      )
      .run();
    if ((result.meta?.changes ?? 0) !== 1) return { ok: false, reason: "version_conflict" };
    const value = await this.getAsset(command.eventId, command.assetId);
    return value === null ? { ok: false, reason: "not_found" } : { ok: true, value };
  }

  async reviewAsset(command: SpeakerAssetReviewCommand): Promise<RepositoryResult<SpeakerAsset>> {
    const current = await this.getAsset(command.eventId, command.assetId);
    if (current === null) return { ok: false, reason: "not_found" };
    if (
      current.state !== "ready" ||
      (current.reviewVersion ?? 0) !== command.expectedVersion ||
      current.currentVersionId !== current.id
    )
      return { ok: false, reason: "version_conflict" };
    const statements: D1PreparedStatement[] = [
      this.#db
        .prepare(
          `UPDATE speaker_assets SET review_state = ?, review_note = ?, reviewed_at = ?, reviewed_by = ?, review_version = review_version + 1,
              approved_version_id = CASE WHEN ? = 'approved' THEN id WHEN approved_version_id = id THEN NULL ELSE approved_version_id END,
              released_version_id = CASE WHEN ? = 1 THEN id ELSE released_version_id END
       WHERE event_id = ? AND id = ? AND state = 'ready' AND review_version = ? AND current_version_id = id`,
        )
        .bind(
          command.state,
          command.note ?? null,
          command.reviewedAt,
          command.reviewedBy,
          command.state,
          command.release ? 1 : 0,
          command.eventId,
          command.assetId,
          command.expectedVersion,
        ),
    ];
    if (command.audit !== undefined) statements.push(this.#auditStatement(command.audit));
    try {
      const result = await this.#db.batch(statements);
      if ((result[0]?.meta?.changes ?? 0) !== 1) return { ok: false, reason: "version_conflict" };
    } catch {
      return { ok: false, reason: "version_conflict" };
    }
    const value = await this.getAsset(command.eventId, command.assetId);
    return value === null ? { ok: false, reason: "not_found" } : { ok: true, value };
  }
  async updateAssetReview(
    command: SpeakerAssetReviewCommand,
  ): Promise<RepositoryResult<SpeakerAsset>> {
    return this.reviewAsset(command);
  }

  async appendAssetAudit(entry: SpeakerAssetAuditEntry): Promise<void> {
    await this.#db.batch([this.#auditStatement(entry)]);
  }

  async listAssetAudit(eventId: string, assetId: string): Promise<SpeakerAssetAuditEntry[]> {
    const rows = await this.#orm
      .select()
      .from(speakerAssetComments)
      .where(
        and(
          eq(speakerAssetComments.eventId, eventId),
          eq(speakerAssetComments.assetId, assetId),
          eq(speakerAssetComments.authorLabel, auditLabel),
        ),
      );
    return rows
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((row) => JSON.parse(row.body) as SpeakerAssetAuditEntry);
  }

  async #saveTask(
    command: SpeakerTaskRepositoryCommand,
    create: boolean,
  ): Promise<RepositoryResult<SpeakerTask>> {
    if (
      (create && command.expectedVersion !== null) ||
      (!create && command.expectedVersion === null)
    )
      return { ok: false, reason: "version_conflict" };
    const scope = await this.#eventScope(command.task.eventId);
    if (scope === null) return { ok: false, reason: "not_found" };
    const task = command.task;
    const statements: D1PreparedStatement[] = [];
    if (create) {
      statements.push(
        this.#db
          .prepare(
            `INSERT INTO speaker_tasks (id, organization_id, event_id, submission_id, participant_id, type, owner, title, description, instructions, status, due_at, allowed_mime_types_json, max_bytes, accepted_asset_kinds_json, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            task.id,
            scope.organizationId,
            task.eventId,
            task.submissionId,
            task.participantId,
            task.type,
            task.owner,
            task.title,
            task.description ?? "",
            task.instructions ?? "",
            task.status,
            task.dueAt ?? task.dueDate ?? null,
            json(task.allowedMimeTypes ?? []),
            task.maxBytes ?? task.maxSizeBytes ?? null,
            json(task.acceptedAssetKinds ?? []),
            task.version,
            task.updatedAt,
            task.updatedAt,
          ),
      );
    } else {
      statements.push(
        this.#db
          .prepare(
            `UPDATE speaker_tasks SET submission_id = ?, participant_id = ?, type = ?, owner = ?, title = ?, description = ?, instructions = ?, status = ?, due_at = ?, allowed_mime_types_json = ?, max_bytes = ?, accepted_asset_kinds_json = ?, version = ?, updated_at = ?
         WHERE organization_id = ? AND event_id = ? AND id = ? AND version = ?`,
          )
          .bind(
            task.submissionId,
            task.participantId,
            task.type,
            task.owner,
            task.title,
            task.description ?? "",
            task.instructions ?? "",
            task.status,
            task.dueAt ?? task.dueDate ?? null,
            json(task.allowedMimeTypes ?? []),
            task.maxBytes ?? task.maxSizeBytes ?? null,
            json(task.acceptedAssetKinds ?? []),
            task.version,
            task.updatedAt,
            scope.organizationId,
            task.eventId,
            task.id,
            command.expectedVersion,
          ),
      );
      statements.push(
        this.#db
          .prepare(
            "DELETE FROM speaker_task_dependencies WHERE organization_id = ? AND event_id = ? AND task_id = ?",
          )
          .bind(scope.organizationId, task.eventId, task.id),
        this.#db
          .prepare(
            "DELETE FROM speaker_task_reminder_offsets WHERE organization_id = ? AND event_id = ? AND task_id = ?",
          )
          .bind(scope.organizationId, task.eventId, task.id),
      );
    }
    for (const dependencyId of task.dependencyIds)
      statements.push(
        this.#db
          .prepare(
            "INSERT INTO speaker_task_dependencies (organization_id, event_id, task_id, dependency_task_id) VALUES (?, ?, ?, ?)",
          )
          .bind(scope.organizationId, task.eventId, task.id, dependencyId),
      );
    for (const offset of task.reminderOffsetsMinutes)
      statements.push(
        this.#db
          .prepare(
            "INSERT INTO speaker_task_reminder_offsets (organization_id, event_id, task_id, offset_minutes) VALUES (?, ?, ?, ?)",
          )
          .bind(scope.organizationId, task.eventId, task.id, offset),
      );
    try {
      const result = await this.#db.batch(statements);
      if ((result[0]?.meta?.changes ?? 0) !== 1) return { ok: false, reason: "version_conflict" };
    } catch {
      return { ok: false, reason: "version_conflict" };
    }
    const value = await this.getTask(task.eventId, task.id);
    return value === null ? { ok: false, reason: "not_found" } : { ok: true, value };
  }

  async #eventScope(eventId: string): Promise<EventScope | null> {
    const rows = await this.#orm
      .select({ organizationId: events.organizationId, eventId: events.id })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(2);
    return rows.length === 1 ? (rows[0] ?? null) : null;
  }

  async #task(row: typeof speakerTasks.$inferSelect): Promise<SpeakerTask> {
    const [dependencies, offsets] = await Promise.all([
      this.#orm
        .select()
        .from(speakerTaskDependencies)
        .where(
          and(
            eq(speakerTaskDependencies.organizationId, row.organizationId),
            eq(speakerTaskDependencies.eventId, row.eventId),
            eq(speakerTaskDependencies.taskId, row.id),
          ),
        ),
      this.#orm
        .select()
        .from(speakerTaskReminderOffsets)
        .where(
          and(
            eq(speakerTaskReminderOffsets.organizationId, row.organizationId),
            eq(speakerTaskReminderOffsets.eventId, row.eventId),
            eq(speakerTaskReminderOffsets.taskId, row.id),
          ),
        ),
    ]);
    return {
      id: row.id,
      eventId: row.eventId,
      submissionId: row.submissionId,
      participantId: row.participantId,
      subject:
        row.submissionId === null
          ? { type: "participant", participantId: row.participantId }
          : { type: "session", participantId: row.participantId, submissionId: row.submissionId },
      type: row.type,
      owner: row.owner,
      title: row.title,
      ...(row.description.length === 0 ? {} : { description: row.description }),
      ...(row.instructions.length === 0 ? {} : { instructions: row.instructions }),
      status: row.status,
      ...(row.dueAt === null ? {} : { dueAt: row.dueAt, dueDate: row.dueAt }),
      dependencyIds: dependencies.map((dependency) => dependency.dependencyTaskId),
      reminderOffsetsMinutes: offsets.map((offset) => offset.offsetMinutes),
      allowedMimeTypes: row.allowedMimeTypesJson as string[],
      ...(row.maxBytes === null ? {} : { maxBytes: row.maxBytes, maxSizeBytes: row.maxBytes }),
      acceptedAssetKinds: row.acceptedAssetKindsJson as SpeakerTask["acceptedAssetKinds"],
      version: row.version,
      updatedAt: row.updatedAt,
    } as SpeakerTask;
  }

  #profile(row: typeof speakerProfiles.$inferSelect): SpeakerProfile {
    return {
      id: row.id,
      eventId: row.eventId,
      participantId: row.participantId,
      displayName: row.displayName,
      ...(row.email === null ? {} : { email: row.email }),
      jobTitle: row.jobTitle,
      company: row.company,
      status: row.status,
      biography: row.biography,
      socialLinks: row.socialLinksJson as Record<string, string>,
      ...(row.headshotAssetId === null ? {} : { headshotAssetId: row.headshotAssetId }),
      ...(row.sourceType === null
        ? {}
        : { sourceType: row.sourceType as NonNullable<SpeakerProfile["sourceType"]> }),
      ...(row.sourceId === null ? {} : { sourceId: row.sourceId }),
      travelLogistics: {
        travelRequired: row.travelRequired,
        arrivalAt: row.arrivalAt,
        departureAt: row.departureAt,
        accommodation: row.accommodation,
        dietaryRequirements: row.dietaryRequirements,
        accessibilityNeeds: row.accessibilityNeeds,
        travelNotes: row.travelNotes,
      },
      version: row.version,
      updatedAt: row.updatedAt,
    };
  }

  #asset(row: typeof speakerAssets.$inferSelect): SpeakerAsset {
    return {
      id: row.id,
      tenantId: row.organizationId,
      eventId: row.eventId,
      ...(row.submissionId === null ? {} : { submissionId: row.submissionId }),
      participantId: row.participantId,
      ...(row.taskId === null ? {} : { taskId: row.taskId }),
      kind: row.kind,
      objectKey: row.objectKey,
      fileName: row.fileName,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      state: row.state,
      createdAt: row.createdAt,
      version: row.version,
      versionFamilyId: row.versionFamilyId,
      ...(row.supersedesAssetId === null ? {} : { supersedesAssetId: row.supersedesAssetId }),
      commentThreadId: row.commentThreadId,
      versionId: row.id,
      ...(row.reviewState === null ? {} : { reviewState: row.reviewState }),
      ...(row.reviewNote === null ? {} : { reviewNote: row.reviewNote }),
      ...(row.reviewedAt === null ? {} : { reviewedAt: row.reviewedAt }),
      ...(row.reviewedBy === null ? {} : { reviewedBy: row.reviewedBy }),
      reviewVersion: row.reviewVersion,
      ...(row.latestVersionId === null ? {} : { latestVersionId: row.latestVersionId }),
      ...(row.currentVersionId === null ? {} : { currentVersionId: row.currentVersionId }),
      ...(row.approvedVersionId === null ? {} : { approvedVersionId: row.approvedVersionId }),
      ...(row.releasedVersionId === null ? {} : { releasedVersionId: row.releasedVersionId }),
      ...(row.rejectionReason === null ? {} : { rejectionReason: row.rejectionReason }),
      ...(row.finalizedAt === null ? {} : { finalizedAt: row.finalizedAt }),
    } as SpeakerAsset;
  }

  #auditStatement(entry: SpeakerAssetAuditEntry): D1PreparedStatement {
    return this.#db
      .prepare(
        "INSERT OR IGNORE INTO speaker_asset_comments (id, organization_id, event_id, asset_id, version_id, body, author_label, author_account_id, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        entry.id,
        entry.organizationId,
        entry.eventId,
        entry.assetId,
        entry.assetId,
        json(entry),
        auditLabel,
        entry.actorAccountId,
        Math.max(1, entry.version),
        entry.occurredAt,
        entry.occurredAt,
      );
  }
}
