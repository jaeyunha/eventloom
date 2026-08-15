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
import type { Submission, SubmissionParticipant } from "../../../features/cfp/model";
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
  SpeakerAssetComment,
  SpeakerAssetReviewCommand,
  SpeakerEventResource,
  SpeakerOrganizerAccessScope,
  SpeakerPortalCapability,
  SpeakerPortalContext,
  SpeakerPortalContextScopeProjection,
  SpeakerProfile,
  SpeakerSubmission,
  SpeakerTask,
  SpeakerTaskFormDefinition,
  SpeakerTaskRepositoryCommand,
  SpeakerTaskResponseRecord,
  SpeakerWikiPage,
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
const d1SubmissionId = (value: string): string =>
  value.startsWith("speaker-submission:") ? value.slice("speaker-submission:".length) : value;

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
  const storedCapabilities = portalCapabilities(row.capabilities_json);
  const grantedParticipantIds = new Set(commaSeparatedIds(row.granted_participant_ids));
  // Legacy projections did not expose ownership. Treat only an explicit zero as non-owner so old
  // stored contexts keep their submission-edit behavior while D1 grant revocation fails closed.
  const ownsSubmission = row.owns_submission === undefined || Number(row.owns_submission) > 0;
  const primaryParticipantId =
    typeof row.primary_participant_id === "string" ? row.primary_participant_id : undefined;
  const capabilitiesByParticipant = Object.fromEntries(
    participantIds.map((participantId) => [
      participantId,
      storedCapabilities.filter(
        (capability) =>
          (capability === "submission-edit"
            ? ownsSubmission || grantedParticipantIds.has(participantId)
            : grantedParticipantIds.has(participantId)) &&
          (capability !== "roster-manage" || participantId === primaryParticipantId),
      ),
    ]),
  );
  const capabilities = storedCapabilities.filter((capability) =>
    participantIds.some((participantId) =>
      capabilitiesByParticipant[participantId]?.includes(capability),
    ),
  );
  return { participantIds, capabilities, capabilitiesByParticipant };
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

const ownsSubmissionSql = `EXISTS (
  SELECT 1
    FROM portal_context_submissions owned_pcs
    JOIN submissions owned_s
      ON owned_s.organization_id = owned_pcs.organization_id
     AND owned_s.event_id = owned_pcs.event_id
     AND owned_s.id = owned_pcs.submission_id
   WHERE owned_pcs.organization_id = pc.organization_id
     AND owned_pcs.event_id = pc.event_id
     AND owned_pcs.context_id = pc.id
     AND owned_s.owner_account_id = pc.account_id
) AS owns_submission`;

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

  async #listOwnedPortalContexts(accountId: string): Promise<SpeakerPortalContext[]> {
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

  async getAccessScope(eventId: string, accountId: string): Promise<SpeakerAccessScope> {
    const session = this.#db.withSession("first-primary");
    const context = await session
      .prepare(
        `SELECT pc.organization_id, pc.primary_participant_id, pc.capabilities_json,
              ${ownsSubmissionSql},
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
    if (context !== null) {
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
    const participantIds = commaSeparatedIds(owned.participant_ids);
    const capabilities = ["submission-edit"] as const;
    return {
      tenantId: String(owned.organization_id),
      submissionIds: commaSeparatedIds(owned.submission_ids),
      participantIds,
      capabilities,
      capabilitiesByParticipant: Object.fromEntries(
        participantIds.map((participantId) => [participantId, capabilities]),
      ),
      primaryParticipantId: String(owned.primary_participant_id ?? ""),
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
                ${ownsSubmissionSql},
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
                ${ownsSubmissionSql},
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
    const projections = (rows.results ?? []).flatMap((row) => {
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
    if (projections.length > 0) return projections;
    return (await this.#listOwnedPortalContexts(accountId)).flatMap((context) => {
      const tenantId = context.organizationId;
      if (tenantId === undefined) return [];
      return [
        {
          speakerProfileIds: [],
          context,
          scope: {
            tenantId,
            submissionIds: context.submissionIds,
            participantIds: context.participantIds,
            capabilities: context.capabilities,
            capabilitiesByParticipant: Object.fromEntries(
              context.participantIds.map((participantId) => [participantId, context.capabilities]),
            ),
            ...(context.primaryParticipantId === undefined
              ? {}
              : { primaryParticipantId: context.primaryParticipantId }),
            role: "speaker" as const,
          },
        },
      ];
    });
  }

  async listPortalContexts(accountId: string) {
    return (await this.listPortalContextScopes(accountId)).map(({ context }) => context);
  }

  async getOrganizerAccessScope(
    eventId: string,
    accountId: string,
  ): Promise<SpeakerOrganizerAccessScope | null> {
    if (eventId.trim().length === 0 || accountId.trim().length === 0) return null;
    const membership = await this.#db
      .prepare(
        `SELECT e.organization_id, m.role
           FROM events e
           JOIN organization_memberships m
             ON m.organization_id = e.organization_id
            AND m.user_id = ?
          WHERE e.id = ? AND m.role IN ('owner', 'admin')
          LIMIT 2`,
      )
      .bind(accountId, eventId)
      .all<{ organization_id: string; role: "owner" | "admin" }>();
    const memberships = membership.results ?? [];
    const authority = memberships.length === 1 ? memberships[0] : undefined;
    if (authority === undefined) return null;
    const accepted = await this.#db
      .prepare(
        `SELECT s.id AS submission_id, sp.participant_id
           FROM submissions s
           JOIN evaluation_decisions d
             ON d.organization_id = s.organization_id
            AND d.event_id = s.event_id
            AND d.submission_id = s.id
            AND d.status = 'accepted'
            AND d.id = (
              SELECT latest.id
                FROM evaluation_decisions latest
               WHERE latest.organization_id = s.organization_id
                 AND latest.event_id = s.event_id
                 AND latest.submission_id = s.id
               ORDER BY latest.updated_at DESC, latest.version DESC, latest.id DESC
               LIMIT 1
            )
      LEFT JOIN submission_participants sp
             ON sp.organization_id = s.organization_id
            AND sp.event_id = s.event_id
            AND sp.submission_id = s.id
          WHERE s.organization_id = ? AND s.event_id = ?
          ORDER BY s.id, sp.ordinal`,
      )
      .bind(authority.organization_id, eventId)
      .all<{ submission_id: string; participant_id: string | null }>();
    return {
      tenantId: authority.organization_id,
      eventId,
      role: authority.role,
      submissionIds: [...new Set((accepted.results ?? []).map((row) => row.submission_id))],
      participantIds: [
        ...new Set(
          (accepted.results ?? []).flatMap((row) =>
            row.participant_id === null ? [] : [row.participant_id],
          ),
        ),
      ],
    };
  }

  async ensureAcceptedSubmission(input: {
    readonly submission: Submission;
    readonly updatedAt: string;
  }): Promise<SpeakerSubmission> {
    const { submission } = input;
    const event = await this.#db
      .prepare(
        `SELECT organization_id, id, name, slug, status
           FROM events
          WHERE organization_id = ? AND id = ?
          LIMIT 1`,
      )
      .bind(submission.tenantId, submission.eventId)
      .first<{
        organization_id: string;
        id: string;
        name: string;
        slug: string;
        status: string;
      }>();
    if (event === null) throw new Error("The accepted speaker event was not found.");
    const primary =
      submission.participants.find((participant) => participant.role === "primary") ??
      submission.participants[0];
    if (primary === undefined) throw new Error("An accepted submission must contain a speaker.");

    const ownedSubmissions = await this.#db
      .prepare(
        `SELECT s.id AS submission_id, sp.participant_id
           FROM submissions s
      LEFT JOIN submission_participants sp
             ON sp.organization_id = s.organization_id
            AND sp.event_id = s.event_id
            AND sp.submission_id = s.id
          WHERE s.organization_id = ? AND s.event_id = ? AND s.owner_account_id = ?
          ORDER BY s.id, sp.ordinal`,
      )
      .bind(submission.tenantId, submission.eventId, submission.ownerAccountId)
      .all<{ submission_id: string; participant_id: string | null }>();
    const ownerSubmissionIds = [
      ...new Set((ownedSubmissions.results ?? []).map((row) => row.submission_id)),
    ];
    const ownerParticipantIds = [
      ...new Set(
        (ownedSubmissions.results ?? []).flatMap((row) =>
          row.participant_id === null ? [] : [row.participant_id],
        ),
      ),
    ];
    await this.#ensurePortalContext({
      organizationId: submission.tenantId,
      event,
      accountId: submission.ownerAccountId,
      primaryParticipantId: primary.id,
      submissionIds: ownerSubmissionIds.length === 0 ? [submission.id] : ownerSubmissionIds,
      participantIds:
        ownerParticipantIds.length === 0
          ? submission.participants.map((participant) => participant.id)
          : ownerParticipantIds,
      updatedAt: input.updatedAt,
    });

    const identities = await this.#db
      .prepare(
        `SELECT sp.participant_id, p.claimed_user_id, u.id AS verified_user_id
           FROM submission_participants sp
           JOIN participants p
             ON p.organization_id = sp.organization_id
            AND p.event_id = sp.event_id
            AND p.id = sp.participant_id
      LEFT JOIN auth_users u
             ON lower(u.email) = lower(p.email)
            AND u.email_verified = 1
          WHERE sp.organization_id = ? AND sp.event_id = ? AND sp.submission_id = ?
          ORDER BY sp.ordinal, u.id`,
      )
      .bind(submission.tenantId, submission.eventId, submission.id)
      .all<{
        participant_id: string;
        claimed_user_id: string | null;
        verified_user_id: string | null;
      }>();
    const accountsByParticipant = new Map<string, Set<string>>();
    for (const row of identities.results ?? []) {
      const accounts = accountsByParticipant.get(row.participant_id) ?? new Set<string>();
      if (row.claimed_user_id !== null) accounts.add(row.claimed_user_id);
      if (row.verified_user_id !== null) accounts.add(row.verified_user_id);
      accountsByParticipant.set(row.participant_id, accounts);
    }
    for (const [participantId, accounts] of accountsByParticipant) {
      if (accounts.size !== 1) continue;
      const accountId = [...accounts][0];
      if (accountId === undefined || accountId === submission.ownerAccountId) continue;
      await this.#ensurePortalContext({
        organizationId: submission.tenantId,
        event,
        accountId,
        primaryParticipantId: participantId,
        submissionIds: [submission.id],
        participantIds: [participantId],
        updatedAt: input.updatedAt,
      });
    }

    const title =
      typeof submission.answers.title === "string" && submission.answers.title.trim().length > 0
        ? submission.answers.title.trim()
        : submission.id;
    return {
      tenantId: submission.tenantId,
      id: submission.id,
      eventId: submission.eventId,
      formId: submission.formId,
      title,
      status: "accepted",
      participantIds: submission.participants.map((participant) => participant.id),
      primaryParticipantId: primary.id,
      version: submission.version,
      updatedAt: input.updatedAt,
    };
  }

  async ensureProfile(input: {
    readonly eventId: string;
    readonly participant: SubmissionParticipant;
    readonly updatedAt: string;
    readonly organizationId?: string;
  }): Promise<SpeakerProfile> {
    const scope = await this.#eventScope(input.eventId);
    if (
      scope === null ||
      (input.organizationId !== undefined && input.organizationId !== scope.organizationId)
    ) {
      throw new Error("The accepted speaker profile event was not found.");
    }
    const existing = await this.#db
      .prepare(
        `SELECT id, display_name, email, job_title, company, status, biography, social_links_json,
                travel_required, arrival_at, departure_at, accommodation, dietary_requirements,
                accessibility_needs, travel_notes, headshot_asset_id, source_type, source_id,
                version, updated_at
           FROM speaker_profiles
          WHERE organization_id = ? AND event_id = ? AND participant_id = ?
          LIMIT 1`,
      )
      .bind(scope.organizationId, input.eventId, input.participant.id)
      .first<Record<string, unknown>>();
    const displayName =
      `${input.participant.firstName.trim()} ${input.participant.lastName.trim()}`.trim() ||
      input.participant.id;
    const email = input.participant.email.trim().toLowerCase();
    if (existing !== null) {
      const changed =
        String(existing.display_name) !== displayName || String(existing.email ?? "") !== email;
      if (changed) {
        const result = await this.#db
          .prepare(
            `UPDATE speaker_profiles
                SET display_name = ?, email = ?, version = version + 1, updated_at = ?
              WHERE organization_id = ? AND event_id = ? AND participant_id = ? AND version = ?`,
          )
          .bind(
            displayName,
            email.length === 0 ? null : email,
            input.updatedAt,
            scope.organizationId,
            input.eventId,
            input.participant.id,
            Number(existing.version),
          )
          .run();
        if ((result.meta?.changes ?? 0) !== 1) {
          throw new Error("The accepted speaker profile changed during projection.");
        }
      }
      const persisted = await this.getProfile(input.eventId, input.participant.id);
      if (persisted === null) throw new Error("The accepted speaker profile was not persisted.");
      return persisted;
    }
    const profile: SpeakerProfile = {
      id: `speaker-profile:${input.eventId}:${input.participant.id}`,
      eventId: input.eventId,
      participantId: input.participant.id,
      displayName,
      ...(email.length === 0 ? {} : { email }),
      biography: input.participant.biography,
      status: "accepted",
      sourceType: "cfp",
      sourceId: input.participant.id,
      version: 1,
      updatedAt: input.updatedAt,
    };
    const created = await this.createProfile(profile);
    if (!created.ok) throw new Error("The accepted speaker profile was not persisted.");
    return created.value;
  }

  async ensureVerifiedSpeakerGrant(input: {
    readonly organizationId: string;
    readonly eventId: string;
    readonly participantId: string;
    readonly email: string;
    readonly createdAt: string;
  }): Promise<boolean> {
    const profile = await this.getProfile(input.eventId, input.participantId);
    const email = input.email.trim().toLowerCase();
    if (profile === null || email.length === 0 || profile.email?.trim().toLowerCase() !== email) {
      return false;
    }
    const users = await this.#db
      .prepare(
        `SELECT id
           FROM auth_users
          WHERE lower(email) = lower(?) AND email_verified = 1
          ORDER BY id
          LIMIT 2`,
      )
      .bind(email)
      .all<{ id: string }>();
    const matches = users.results ?? [];
    const user = matches.length === 1 ? matches[0] : undefined;
    if (user === undefined) return false;
    await this.#db
      .prepare(
        `INSERT INTO speaker_grants
           (organization_id, speaker_profile_id, user_id, created_at, revoked_at)
         VALUES (?, ?, ?, ?, NULL)
         ON CONFLICT (organization_id, speaker_profile_id, user_id) DO NOTHING`,
      )
      .bind(input.organizationId, profile.id, user.id, input.createdAt)
      .run();
    return true;
  }

  async listSubmissions(
    eventId: string,
    submissionIds: readonly string[],
  ): Promise<SpeakerSubmission[]> {
    if (submissionIds.length === 0) return [];
    const storedSubmissionIds = [...new Set(submissionIds.map(d1SubmissionId))];
    const rows = await this.#orm
      .select()
      .from(submissions)
      .where(and(eq(submissions.eventId, eventId), inArray(submissions.id, storedSubmissionIds)));
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
          "SELECT status FROM evaluation_decisions WHERE organization_id = ? AND event_id = ? AND submission_id = ? ORDER BY updated_at DESC, version DESC, id DESC LIMIT 1",
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
          inArray(submissions.id, [...new Set(submissionIds.map(d1SubmissionId))]),
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

  async getTaskForm(eventId: string, taskId: string): Promise<SpeakerTaskFormDefinition | null> {
    const scope = await this.#eventScope(eventId);
    if (scope === null) return null;
    const row = await this.#db
      .prepare(
        `SELECT id, event_id, task_id, title, description, fields_json, version, published, updated_at
           FROM speaker_task_forms
          WHERE organization_id = ? AND event_id = ? AND task_id = ? AND published = 1
          LIMIT 1`,
      )
      .bind(scope.organizationId, eventId, taskId)
      .first<Record<string, unknown>>();
    if (row === null) return null;
    return {
      id: String(row.id),
      eventId: String(row.event_id),
      taskId: String(row.task_id),
      title: String(row.title),
      ...(String(row.description ?? "").length === 0
        ? {}
        : { description: String(row.description) }),
      fields: this.#storedJson(row.fields_json) as SpeakerTaskFormDefinition["fields"],
      version: Number(row.version),
      published: Boolean(row.published),
      updatedAt: String(row.updated_at),
    };
  }

  async listTaskResponses(
    eventId: string,
    taskId: string,
    participantId: string,
  ): Promise<SpeakerTaskResponseRecord[]> {
    const scope = await this.#eventScope(eventId);
    if (scope === null) return [];
    const rows = await this.#db
      .prepare(
        `SELECT id, event_id, task_id, participant_id, definition_version, answers_json,
                status, version, feedback, submitted_at, updated_at
           FROM speaker_task_responses
          WHERE organization_id = ? AND event_id = ? AND task_id = ? AND participant_id = ?
          ORDER BY version ASC, updated_at ASC, id ASC`,
      )
      .bind(scope.organizationId, eventId, taskId, participantId)
      .all<Record<string, unknown>>();
    return (rows.results ?? []).map((row) => ({
      id: String(row.id),
      eventId: String(row.event_id),
      taskId: String(row.task_id),
      participantId: String(row.participant_id),
      definitionVersion: Number(row.definition_version),
      answers: this.#storedJson(row.answers_json) as SpeakerTaskResponseRecord["answers"],
      status: String(row.status) as SpeakerTaskResponseRecord["status"],
      version: Number(row.version),
      updatedAt: String(row.updated_at),
      ...(row.feedback === null || row.feedback === undefined
        ? {}
        : { feedback: String(row.feedback) }),
      ...(row.submitted_at === null || row.submitted_at === undefined
        ? {}
        : { submittedAt: String(row.submitted_at) }),
    }));
  }

  async saveTaskResponse(
    response: SpeakerTaskResponseRecord,
    expectedVersion: number | null,
  ): Promise<RepositoryResult<SpeakerTaskResponseRecord>> {
    const scope = await this.#eventScope(response.eventId);
    if (scope === null) return { ok: false, reason: "not_found" };
    const currentVersion = expectedVersion ?? 0;
    if (response.version !== currentVersion + 1) {
      return { ok: false, reason: "version_conflict" };
    }
    try {
      const result = await this.#db
        .prepare(
          `INSERT INTO speaker_task_responses
             (id, organization_id, event_id, task_id, participant_id, definition_version,
              answers_json, status, version, feedback, submitted_at, updated_at)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            WHERE COALESCE((
                    SELECT MAX(version)
                      FROM speaker_task_responses
                     WHERE organization_id = ? AND event_id = ? AND task_id = ? AND participant_id = ?
                  ), 0) = ?`,
        )
        .bind(
          response.id,
          scope.organizationId,
          response.eventId,
          response.taskId,
          response.participantId,
          response.definitionVersion,
          json(response.answers),
          response.status,
          response.version,
          response.feedback ?? null,
          response.submittedAt ?? null,
          response.updatedAt,
          scope.organizationId,
          response.eventId,
          response.taskId,
          response.participantId,
          currentVersion,
        )
        .run();
      if ((result.meta?.changes ?? 0) !== 1) return { ok: false, reason: "version_conflict" };
    } catch {
      return { ok: false, reason: "version_conflict" };
    }
    return { ok: true, value: structuredClone(response) };
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

  async listAssetHistory(eventId: string, versionFamilyId: string): Promise<SpeakerAsset[]> {
    const scope = await this.#eventScope(eventId);
    if (scope === null) return [];
    const rows = await this.#db
      .prepare(
        `SELECT *
           FROM speaker_assets
          WHERE organization_id = ? AND event_id = ? AND version_family_id = ?
          ORDER BY version ASC, created_at ASC, id ASC`,
      )
      .bind(scope.organizationId, eventId, versionFamilyId)
      .all<Record<string, unknown>>();
    return (rows.results ?? []).map((row) => this.#assetRecord(row));
  }

  async listAssetComments(eventId: string, assetId: string): Promise<SpeakerAssetComment[]> {
    const scope = await this.#eventScope(eventId);
    if (scope === null) return [];
    const rows = await this.#db
      .prepare(
        `SELECT id, event_id, asset_id, version_id, body, author_label, version, created_at, updated_at
           FROM speaker_asset_comments
          WHERE organization_id = ? AND event_id = ? AND asset_id = ? AND version_id = ?
            AND author_label <> ?
          ORDER BY created_at ASC, version ASC, id ASC`,
      )
      .bind(scope.organizationId, eventId, assetId, assetId, auditLabel)
      .all<Record<string, unknown>>();
    return (rows.results ?? []).map((row) => this.#assetCommentRecord(row));
  }

  async createAssetComment(comment: SpeakerAssetComment): Promise<SpeakerAssetComment> {
    const scope = await this.#eventScope(comment.eventId);
    if (scope === null || comment.versionId !== comment.assetId) {
      throw new Error("The version-specific speaker asset does not exist.");
    }
    const asset = await this.#db
      .prepare(
        `SELECT id
           FROM speaker_assets
          WHERE organization_id = ? AND event_id = ? AND id = ?
          LIMIT 1`,
      )
      .bind(scope.organizationId, comment.eventId, comment.assetId)
      .first<Record<string, unknown>>();
    if (asset === null) throw new Error("The version-specific speaker asset does not exist.");
    await this.#db
      .prepare(
        `INSERT INTO speaker_asset_comments
           (id, organization_id, event_id, asset_id, version_id, body, author_label,
            author_account_id, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        comment.id,
        scope.organizationId,
        comment.eventId,
        comment.assetId,
        comment.versionId,
        comment.body,
        comment.authorLabel,
        comment.authorAccountId ?? null,
        comment.version ?? 1,
        comment.createdAt,
        comment.updatedAt ?? comment.createdAt,
      )
      .run();
    return structuredClone(comment);
  }

  async listEventResources(eventId: string): Promise<SpeakerEventResource[]> {
    const scope = await this.#eventScope(eventId);
    if (scope === null) return [];
    const rows = await this.#db
      .prepare(
        `SELECT id, event_id, title, summary, html, url, sort_order, updated_at
           FROM speaker_event_resources
          WHERE organization_id = ? AND event_id = ? AND status = 'published'
          ORDER BY sort_order ASC, id ASC`,
      )
      .bind(scope.organizationId, eventId)
      .all<Record<string, unknown>>();
    return (rows.results ?? []).map((row) => this.#resourceRecord(row));
  }

  async listWikiPages(eventId: string): Promise<SpeakerWikiPage[]> {
    const scope = await this.#eventScope(eventId);
    if (scope === null) return [];
    const rows = await this.#db
      .prepare(
        `SELECT id, event_id, title, slug, summary, html, url, sort_order, updated_at
           FROM speaker_wiki_pages
          WHERE organization_id = ? AND event_id = ? AND status = 'published'
          ORDER BY sort_order ASC, id ASC`,
      )
      .bind(scope.organizationId, eventId)
      .all<Record<string, unknown>>();
    return (rows.results ?? []).map((row) => ({
      ...this.#resourceRecord(row),
      slug: String(row.slug),
    }));
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

  async #ensurePortalContext(input: {
    organizationId: string;
    event: { id: string; name: string; slug: string; status: string };
    accountId: string;
    primaryParticipantId: string;
    submissionIds: readonly string[];
    participantIds: readonly string[];
    updatedAt: string;
  }): Promise<void> {
    const contextId = `portal-context:${input.organizationId}:${input.event.id}:${input.accountId}`;
    const capabilities: readonly SpeakerPortalCapability[] = [
      "profile-self",
      "submission-edit",
      "task-response",
      "asset-read",
      "asset-write",
      "asset-comment",
    ];
    const current = await this.#db
      .prepare(
        `SELECT version, capabilities_json, name, slug, status, primary_participant_id
           FROM portal_contexts
          WHERE organization_id = ? AND event_id = ? AND id = ? AND account_id = ?
          LIMIT 1`,
      )
      .bind(input.organizationId, input.event.id, contextId, input.accountId)
      .first<Record<string, unknown>>();
    if (current === null) {
      await this.#db
        .prepare(
          `INSERT INTO portal_contexts
             (id, organization_id, event_id, account_id, name, slug, status,
              primary_participant_id, capabilities_json, version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
           ON CONFLICT (id) DO NOTHING`,
        )
        .bind(
          contextId,
          input.organizationId,
          input.event.id,
          input.accountId,
          input.event.name,
          `${input.event.slug}--${input.accountId}`,
          input.event.status,
          input.primaryParticipantId,
          json(capabilities),
          input.updatedAt,
          input.updatedAt,
        )
        .run();
    } else {
      const stored = portalCapabilities(current.capabilities_json);
      const nextCapabilities = [...new Set([...stored, ...capabilities])];
      const changed =
        String(current.name) !== input.event.name ||
        String(current.status) !== input.event.status ||
        String(current.primary_participant_id) !== input.primaryParticipantId ||
        JSON.stringify(stored) !== JSON.stringify(nextCapabilities);
      if (changed) {
        const result = await this.#db
          .prepare(
            `UPDATE portal_contexts
                SET name = ?, status = ?, primary_participant_id = ?, capabilities_json = ?,
                    version = version + 1, updated_at = ?
              WHERE organization_id = ? AND event_id = ? AND id = ? AND account_id = ?
                AND version = ?`,
          )
          .bind(
            input.event.name,
            input.event.status,
            input.primaryParticipantId,
            json(nextCapabilities),
            input.updatedAt,
            input.organizationId,
            input.event.id,
            contextId,
            input.accountId,
            Number(current.version),
          )
          .run();
        if ((result.meta?.changes ?? 0) !== 1) {
          throw new Error("The speaker portal context changed during acceptance projection.");
        }
      }
    }
    const statements: D1PreparedStatement[] = [];
    for (const submissionId of [...new Set(input.submissionIds)]) {
      statements.push(
        this.#db
          .prepare(
            `INSERT INTO portal_context_submissions
               (organization_id, event_id, context_id, submission_id)
             VALUES (?, ?, ?, ?)
             ON CONFLICT (organization_id, event_id, context_id, submission_id) DO NOTHING`,
          )
          .bind(input.organizationId, input.event.id, contextId, submissionId),
      );
    }
    for (const participantId of [...new Set(input.participantIds)]) {
      statements.push(
        this.#db
          .prepare(
            `INSERT INTO portal_context_participants
               (organization_id, event_id, context_id, participant_id)
             VALUES (?, ?, ?, ?)
             ON CONFLICT (organization_id, event_id, context_id, participant_id) DO NOTHING`,
          )
          .bind(input.organizationId, input.event.id, contextId, participantId),
      );
    }
    if (statements.length > 0) await this.#db.batch(statements);
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
            task.submissionId === null ? null : d1SubmissionId(task.submissionId),
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
            task.submissionId === null ? null : d1SubmissionId(task.submissionId),
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

  #storedJson(value: unknown): unknown {
    return typeof value === "string" ? JSON.parse(value) : value;
  }

  #resourceRecord(row: Record<string, unknown>): SpeakerEventResource {
    return {
      id: String(row.id),
      eventId: String(row.event_id),
      title: String(row.title),
      ...(row.summary === null || row.summary === undefined
        ? {}
        : { summary: String(row.summary) }),
      ...(row.html === null || row.html === undefined ? {} : { html: String(row.html) }),
      ...(row.url === null || row.url === undefined ? {} : { url: String(row.url) }),
      order: Number(row.sort_order),
      updatedAt: String(row.updated_at),
    };
  }

  #assetCommentRecord(row: Record<string, unknown>): SpeakerAssetComment {
    return {
      id: String(row.id),
      eventId: String(row.event_id),
      assetId: String(row.asset_id),
      versionId: String(row.version_id),
      body: String(row.body),
      authorLabel: String(row.author_label),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      version: Number(row.version),
    };
  }

  #assetRecord(row: Record<string, unknown>): SpeakerAsset {
    return {
      id: String(row.id),
      tenantId: String(row.organization_id),
      eventId: String(row.event_id),
      ...(row.submission_id === null || row.submission_id === undefined
        ? {}
        : { submissionId: String(row.submission_id) }),
      participantId: String(row.participant_id),
      ...(row.task_id === null || row.task_id === undefined ? {} : { taskId: String(row.task_id) }),
      kind: String(row.kind) as SpeakerAsset["kind"],
      objectKey: String(row.object_key),
      fileName: String(row.file_name),
      contentType: String(row.content_type),
      sizeBytes: Number(row.size_bytes),
      state: String(row.state) as SpeakerAsset["state"],
      createdAt: String(row.created_at),
      version: Number(row.version),
      versionFamilyId: String(row.version_family_id),
      ...(row.supersedes_asset_id === null || row.supersedes_asset_id === undefined
        ? {}
        : { supersedesAssetId: String(row.supersedes_asset_id) }),
      commentThreadId: String(row.comment_thread_id),
      versionId: String(row.id),
      ...(row.review_state === null || row.review_state === undefined
        ? {}
        : { reviewState: String(row.review_state) as NonNullable<SpeakerAsset["reviewState"]> }),
      ...(row.review_note === null || row.review_note === undefined
        ? {}
        : { reviewNote: String(row.review_note) }),
      ...(row.reviewed_at === null || row.reviewed_at === undefined
        ? {}
        : { reviewedAt: String(row.reviewed_at) }),
      ...(row.reviewed_by === null || row.reviewed_by === undefined
        ? {}
        : { reviewedBy: String(row.reviewed_by) }),
      reviewVersion: Number(row.review_version),
      ...(row.latest_version_id === null || row.latest_version_id === undefined
        ? {}
        : { latestVersionId: String(row.latest_version_id) }),
      ...(row.current_version_id === null || row.current_version_id === undefined
        ? {}
        : { currentVersionId: String(row.current_version_id) }),
      ...(row.approved_version_id === null || row.approved_version_id === undefined
        ? {}
        : { approvedVersionId: String(row.approved_version_id) }),
      ...(row.released_version_id === null || row.released_version_id === undefined
        ? {}
        : { releasedVersionId: String(row.released_version_id) }),
      ...(row.rejection_reason === null || row.rejection_reason === undefined
        ? {}
        : { rejectionReason: String(row.rejection_reason) }),
      ...(row.finalized_at === null || row.finalized_at === undefined
        ? {}
        : { finalizedAt: String(row.finalized_at) }),
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
