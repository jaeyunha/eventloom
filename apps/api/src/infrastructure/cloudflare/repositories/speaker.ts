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
import { allSpeakerPortalCapabilities } from "../../../features/speaker/capabilities";
import type {
  FinalizeSpeakerAssetCommand,
  OrganizationQualifiedSpeakerSubmission,
  OrganizationQualifiedSpeakerTask,
  RepositoryResult,
  SpeakerAccessScope,
  SpeakerAccountWorkloadRepository,
  SpeakerAsset,
  SpeakerAssetAuditEntry,
  SpeakerAssetReviewCommand,
  SpeakerPortalCapability,
  SpeakerPortalContext,
  SpeakerPortalContextScopeProjection,
  SpeakerProfile,
  SpeakerSubmission,
  SpeakerTask,
  SpeakerTaskRepositoryCommand,
  TransitionSpeakerTaskCommand,
  UpdateBiographyCommand,
  UpdateSpeakerProfileCommand,
} from "../../../features/speaker/types";

const json = (value: unknown): string => JSON.stringify(value);
const auditLabel = "__speaker_asset_audit__";

type EventScope = { organizationId: string; eventId: string };

function commaSeparatedIds(value: unknown): string[] {
  return String(value ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function portalCapabilities(value: unknown): SpeakerPortalCapability[] {
  try {
    const parsed: unknown = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed)
      ? parsed.filter(
          (capability): capability is SpeakerPortalCapability =>
            typeof capability === "string" &&
            allSpeakerPortalCapabilities.includes(capability as SpeakerPortalCapability),
        )
      : [];
  } catch {
    return [];
  }
}

function participantCapabilities(row: Record<string, unknown>): {
  participantIds: string[];
  capabilities: SpeakerPortalCapability[];
  capabilitiesByParticipant: Record<string, readonly SpeakerPortalCapability[]>;
} {
  const participantIds = commaSeparatedIds(row.participant_ids);
  const capabilities = portalCapabilities(row.capabilities_json);
  const grantedParticipantIds = new Set(commaSeparatedIds(row.granted_participant_ids));
  const primaryParticipantId =
    typeof row.primary_participant_id === "string" ? row.primary_participant_id : undefined;
  return {
    participantIds,
    capabilities,
    capabilitiesByParticipant: Object.fromEntries(
      participantIds.map((participantId) => [
        participantId,
        capabilities.filter(
          (capability) =>
            capability === "submission-edit" ||
            (grantedParticipantIds.has(participantId) &&
              (capability !== "roster-manage" || participantId === primaryParticipantId)),
        ),
      ]),
    ),
  };
}

const grantedSpeakerProfileIdsSql = `(
  SELECT group_concat(DISTINCT sg.speaker_profile_id)
    FROM speaker_grants sg
    JOIN speaker_profiles sp
      ON sp.organization_id = sg.organization_id
     AND sp.id = sg.speaker_profile_id
    JOIN portal_context_participants granted_pcp
      ON granted_pcp.organization_id = pc.organization_id
     AND granted_pcp.event_id = pc.event_id
     AND granted_pcp.context_id = pc.id
     AND granted_pcp.participant_id = sp.participant_id
   WHERE sg.organization_id = pc.organization_id
     AND sg.user_id = pc.account_id
     AND sg.revoked_at IS NULL
     AND sp.event_id = pc.event_id
) AS granted_speaker_profile_ids`;

const grantedParticipantIdsSql = `(
  SELECT group_concat(DISTINCT sp.participant_id)
    FROM speaker_grants sg
    JOIN speaker_profiles sp
      ON sp.organization_id = sg.organization_id
     AND sp.id = sg.speaker_profile_id
    JOIN portal_context_participants granted_pcp
      ON granted_pcp.organization_id = pc.organization_id
     AND granted_pcp.event_id = pc.event_id
     AND granted_pcp.context_id = pc.id
     AND granted_pcp.participant_id = sp.participant_id
   WHERE sg.organization_id = pc.organization_id
     AND sg.user_id = pc.account_id
     AND sg.revoked_at IS NULL
     AND sp.event_id = pc.event_id
) AS granted_participant_ids`;

export class D1SpeakerRepository implements SpeakerAccountWorkloadRepository {
  readonly #db: D1Database;
  readonly #orm: OpenSessionboardDatabase;

  constructor(db: D1Database) {
    this.#db = db;
    this.#orm = createDatabase(db);
  }

  async getAccessScope(eventId: string, accountId: string): Promise<SpeakerAccessScope> {
    const contexts = await this.#db
      .prepare(
        `SELECT pc.organization_id, pc.primary_participant_id, pc.capabilities_json,
              ${grantedParticipantIdsSql},
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
    if (contexts === null) return { submissionIds: [], participantIds: [] };
    const projected = participantCapabilities(contexts);
    return {
      tenantId: String(contexts.organization_id),
      submissionIds: commaSeparatedIds(contexts.submission_ids),
      participantIds: projected.participantIds,
      capabilities: projected.capabilities,
      capabilitiesByParticipant: projected.capabilitiesByParticipant,
      primaryParticipantId: String(contexts.primary_participant_id),
      role: "speaker",
    };
  }

  async getAccessScopeForOrganization(
    organizationId: string,
    eventId: string,
    accountId: string,
  ): Promise<SpeakerAccessScope> {
    const context = await this.#db
      .prepare(
        `SELECT pc.organization_id, pc.primary_participant_id, pc.capabilities_json,
                ${grantedParticipantIdsSql},
                group_concat(DISTINCT pcp.participant_id) AS participant_ids,
                group_concat(DISTINCT pcs.submission_id) AS submission_ids
           FROM portal_contexts pc
           LEFT JOIN portal_context_participants pcp
             ON pcp.organization_id = pc.organization_id
            AND pcp.event_id = pc.event_id
            AND pcp.context_id = pc.id
           LEFT JOIN portal_context_submissions pcs
             ON pcs.organization_id = pc.organization_id
            AND pcs.event_id = pc.event_id
            AND pcs.context_id = pc.id
          WHERE pc.organization_id = ?
            AND pc.event_id = ?
            AND pc.account_id = ?
            AND pc.status <> 'archived'
          GROUP BY pc.organization_id, pc.id
          LIMIT 1`,
      )
      .bind(organizationId, eventId, accountId)
      .first<Record<string, unknown>>();
    if (context === null) return { submissionIds: [], participantIds: [] };
    const projected = participantCapabilities(context);
    return {
      tenantId: String(context.organization_id),
      submissionIds: commaSeparatedIds(context.submission_ids),
      participantIds: projected.participantIds,
      capabilities: projected.capabilities,
      capabilitiesByParticipant: projected.capabilitiesByParticipant,
      primaryParticipantId: String(context.primary_participant_id),
      role: "speaker",
    };
  }

  async listPortalContextScopes(
    accountId: string,
  ): Promise<readonly SpeakerPortalContextScopeProjection[]> {
    const rows = await this.#db
      .prepare(
        `SELECT pc.organization_id, pc.event_id, pc.id, pc.name, pc.slug, pc.status,
                pc.primary_participant_id, pc.capabilities_json,
                ${grantedSpeakerProfileIdsSql},
                ${grantedParticipantIdsSql},
                group_concat(DISTINCT pcp.participant_id) AS participant_ids,
                group_concat(DISTINCT pcs.submission_id) AS submission_ids
           FROM portal_contexts pc
           LEFT JOIN portal_context_participants pcp
             ON pcp.organization_id = pc.organization_id
            AND pcp.event_id = pc.event_id
            AND pcp.context_id = pc.id
           LEFT JOIN portal_context_submissions pcs
             ON pcs.organization_id = pc.organization_id
            AND pcs.event_id = pc.event_id
            AND pcs.context_id = pc.id
          WHERE pc.account_id = ? AND pc.status <> 'archived'
          GROUP BY pc.organization_id, pc.event_id, pc.id
          ORDER BY pc.organization_id, pc.event_id, pc.id`,
      )
      .bind(accountId)
      .all<Record<string, unknown>>();
    return (rows.results ?? []).flatMap((row) => {
      const organizationId =
        typeof row.organization_id === "string" ? row.organization_id.trim() : "";
      const eventId = typeof row.event_id === "string" ? row.event_id.trim() : "";
      const name = typeof row.name === "string" ? row.name.trim() : "";
      const id = typeof row.id === "string" ? row.id.trim() : "";
      if (
        organizationId.length === 0 ||
        eventId.length === 0 ||
        name.length === 0 ||
        id.length === 0
      ) {
        return [];
      }
      const projected = participantCapabilities(row);
      const participantIds = projected.participantIds;
      const speakerProfileIds = commaSeparatedIds(row.granted_speaker_profile_ids);
      const submissionIds = commaSeparatedIds(row.submission_ids);
      const capabilities: SpeakerPortalContext["capabilities"] = projected.capabilities;
      const slug = typeof row.slug === "string" ? row.slug : undefined;
      const status = typeof row.status === "string" ? row.status : undefined;
      const primaryParticipantId =
        typeof row.primary_participant_id === "string" ? row.primary_participant_id : undefined;
      return [
        {
          speakerProfileIds,
          context: {
            id,
            eventId,
            name,
            ...(slug === undefined ? {} : { slug }),
            ...(status === undefined ? {} : { status }),
            capabilities,
            submissionIds,
            participantIds,
            ...(primaryParticipantId === undefined ? {} : { primaryParticipantId }),
          },
          scope: {
            tenantId: organizationId,
            submissionIds,
            participantIds,
            capabilities,
            capabilitiesByParticipant: projected.capabilitiesByParticipant,
            ...(primaryParticipantId === undefined ? {} : { primaryParticipantId }),
            role: "speaker" as const,
          },
        },
      ];
    });
  }

  async listPortalContexts(accountId: string) {
    return (await this.listPortalContextScopes(accountId)).map(({ context }) => context);
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
          "SELECT participant_id, role FROM submission_participants WHERE organization_id = ? AND submission_id = ? ORDER BY ordinal",
        )
        .bind(row.organizationId, row.id)
        .all<{ participant_id: string; role: string }>();
      const answers = await this.#db
        .prepare(
          "SELECT field_key, value_json FROM submission_answers WHERE organization_id = ? AND submission_id = ?",
        )
        .bind(row.organizationId, row.id)
        .all<{ field_key: string; value_json: string }>();
      const answerRecord = Object.fromEntries(
        (answers.results ?? []).map((answer) => [answer.field_key, JSON.parse(answer.value_json)]),
      );
      result.push({
        id: row.id,
        eventId: row.eventId,
        title: typeof answerRecord.title === "string" ? answerRecord.title : row.id,
        status: row.status,
        participantIds: (links.results ?? []).map((link) => link.participant_id),
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

  async listSubmissionsForOrganization(
    organizationId: string,
    eventId: string,
    submissionIds: readonly string[],
  ): Promise<OrganizationQualifiedSpeakerSubmission[]> {
    if (submissionIds.length === 0) return [];
    const rows = await this.#orm
      .select()
      .from(submissions)
      .where(
        and(
          eq(submissions.organizationId, organizationId),
          eq(submissions.eventId, eventId),
          inArray(submissions.id, [...new Set(submissionIds)]),
        ),
      );
    const result: OrganizationQualifiedSpeakerSubmission[] = [];
    for (const row of rows) {
      const links = await this.#db
        .prepare(
          "SELECT participant_id, role FROM submission_participants WHERE organization_id = ? AND event_id = ? AND submission_id = ? ORDER BY ordinal",
        )
        .bind(organizationId, eventId, row.id)
        .all<{ participant_id: string; role: string }>();
      const answers = await this.#db
        .prepare(
          "SELECT field_key, value_json FROM submission_answers WHERE organization_id = ? AND submission_id = ?",
        )
        .bind(organizationId, row.id)
        .all<{ field_key: string; value_json: string }>();
      const answerRecord = Object.fromEntries(
        (answers.results ?? []).map((answer) => [answer.field_key, JSON.parse(answer.value_json)]),
      );
      result.push({
        tenantId: row.organizationId,
        id: row.id,
        eventId: row.eventId,
        title: typeof answerRecord.title === "string" ? answerRecord.title : row.id,
        status: row.status,
        participantIds: (links.results ?? []).map((link) => link.participant_id),
        primaryParticipantId: (links.results ?? []).find((link) => link.role === "primary")
          ?.participant_id,
        formId: row.formId,
        version: row.version,
        updatedAt: row.updatedAt,
        answers: answerRecord,
      } as OrganizationQualifiedSpeakerSubmission);
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

  async listProfilesForEvent(organizationId: string, eventId: string): Promise<SpeakerProfile[]> {
    const rows = await this.#orm
      .select()
      .from(speakerProfiles)
      .where(
        and(
          eq(speakerProfiles.organizationId, organizationId),
          eq(speakerProfiles.eventId, eventId),
        ),
      );
    return rows.map((row) => this.#profile(row));
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

  async listTasksForOrganization(
    organizationId: string,
    eventId: string,
    participantIds: readonly string[],
  ): Promise<OrganizationQualifiedSpeakerTask[]> {
    if (participantIds.length === 0) return [];
    const rows = await this.#orm
      .select()
      .from(speakerTasks)
      .where(
        and(
          eq(speakerTasks.organizationId, organizationId),
          eq(speakerTasks.eventId, eventId),
          inArray(speakerTasks.participantId, [...new Set(participantIds)]),
        ),
      );
    return Promise.all(
      rows.map(async (row) => ({ ...(await this.#task(row)), tenantId: row.organizationId })),
    );
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
