import type { ApiScope } from "@open-sessionboard/contracts";
import type { ApiDependencies } from "../app";
import { EventService, InMemoryEventRepository } from "../features/events/service";
import type { Event } from "../features/events/types";
import {
  InMemoryMemberAuthBoundary,
  InMemoryMemberIdentityRepository,
  InMemoryMemberInvitationDelivery,
  InMemoryReviewerPoolRepository,
  MemberService,
} from "../features/members/service";
import type { OrganizationRecord } from "../features/members/service";
import type { MemberRepositorySeed } from "../features/members/types";
import { CrmService, InMemoryCrmRepository } from "../features/crm/service";
import {
  CommunicationService,
  InMemoryCommunicationRepository,
} from "../features/communications/service";
import type {
  CommunicationActor,
  CommunicationDeliveryAdapter,
  CommunicationDeliveryRequest,
  CommunicationRecipient,
  CommunicationTemplate,
} from "../features/communications/types";
import { AgendaEngine } from "../features/agenda/engine";
import {
  InMemoryAgendaMutationLock,
  InMemoryAgendaRepository,
} from "../features/agenda/infrastructure";
import type { AgendaEntryInput } from "../features/agenda/types";
import { InMemorySessionRepository, SessionService } from "../features/sessions/service";
import type {
  Format,
  Level,
  Room,
  Session,
  SessionSettings,
  Tag,
  Track,
} from "../features/sessions/types";
import { RequestAuthenticator } from "../features/auth/authenticator";
import type {
  ApiKeyScope,
  AuthPrincipal,
  BetterAuthGateway,
  D1ApiKeyGateway,
} from "../features/auth/types";
import {
  InMemoryEvaluationRepository,
  InMemorySubmissionReviewSource,
} from "../features/evaluations/repository";
import { EvaluationService } from "../features/evaluations/service";
import type { EvaluationActor, EvaluationPlan } from "../features/evaluations/types";
import type {
  PublicApiCreateInput,
  PublicApiGetInput,
  PublicApiListInput,
  PublicApiListResult,
  PublicApiRepository,
  PublicApiUpdateInput,
} from "../features/public-api/routes";
import { RemixService } from "../features/remix/service";
import type {
  ContentRemixCandidate,
  ContentRevision,
  RemixAuditEntry,
  RemixCandidateFilter,
  RemixContent,
  RemixContentGateway,
  RemixRecordFilter,
  RemixRepository,
  RemixSessionRecord,
  RemixSpeakerRecord,
  RemixActor,
} from "../features/remix/types";
import {
  InMemoryReportRepository,
  ReportService,
  SafeReportExporter,
} from "../features/reports/service";
import type { ReportActor, ReportProgramRecord } from "../features/reports/types";
import { SpeakerService } from "../features/speaker/service";
import type {
  CreatePrivateUploadGrantCommand,
  PrivateAssetGateway,
  RepositoryResult,
  SpeakerAccessScope,
  SpeakerAsset,
  SpeakerContentHistoryEntry,
  SpeakerContentRecord,
  SpeakerPortalCapability,
  SpeakerProfile,
  SpeakerRepository,
  SpeakerSubmission,
  SpeakerTask,
  TransitionSpeakerTaskCommand,
  RestoreSpeakerContentVersionCommand,
  UpdateBiographyCommand,
  UpdateSpeakerProfileCommand,
  UpdateSpeakerContentCommand,
} from "../features/speaker/types";
import type { CloudflareAiProviders } from "../integrations/ai";
import { InMemoryWebhookRepository } from "../integrations/webhooks/types";
import type {
  IntegrationAdminRouteDependencies,
  IntegrationApiKeyCreation,
  IntegrationApiKeySummary,
  IntegrationDeliveryStatus,
  IntegrationEvent,
  IntegrationWebhookDelivery,
} from "../routes/integrations";
import type {
  OrganizerOverviewActionItem,
  OrganizerOverviewActivityData,
  OrganizerOverviewCoreData,
  OrganizerOverviewEvent,
  OrganizerOverviewRouteDependencies,
} from "../routes/organizer-overview";
import type {
  PublishedSpeakerProjection,
  PublishedSpeakerRouteDependencies,
} from "../routes/public-speakers";
import { createLocalCfpService } from "./cfp";

export {
  LOCAL_API_KEY,
  LOCAL_ORGANIZATION_ID,
  LOCAL_SESSION_TOKEN,
  LOCAL_SPEAKER_ACCOUNT_ID,
} from "./constants";

import {
  LOCAL_API_KEY,
  LOCAL_ORGANIZATION_ID,
  LOCAL_SESSION_TOKEN,
  LOCAL_SPEAKER_ACCOUNT_ID,
} from "./constants";

const SEEDED_AT = "2026-08-08T12:00:00.000Z";
const LOCAL_ORGANIZER_ACCOUNT_ID = "local-organizer";
const LOCAL_REVIEWER_ACCOUNT_ID = "local-reviewer";
const LOCAL_REVIEWER_SESSION_TOKEN = "local-reviewer-session";
const LOCAL_SPEAKER_SESSION_TOKEN = "local-speaker-session";
const LOCAL_EVENTS: readonly Event[] = [
  {
    id: "demo-event",
    organizationId: LOCAL_ORGANIZATION_ID,
    slug: "demo-event",
    name: "Open Sessionboard Demo",
    status: "active",
    timeZone: "America/Los_Angeles",
    startsAt: "2026-09-18T16:00:00.000Z",
    endsAt: "2026-09-18T23:00:00.000Z",
    venue: "Main Hall",
    cfpSettings: {
      enabled: true,
      opensAt: "2026-08-01T07:00:00.000Z",
      closesAt: "2026-09-15T07:00:00.000Z",
    },
    defaultCalendarSettings: {
      durationMinutes: 30,
      timeZone: "America/Los_Angeles",
      location: "Main Hall",
    },
    embedConfigurations: [],
    version: 1,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
    createdBy: LOCAL_ORGANIZER_ACCOUNT_ID,
    updatedBy: LOCAL_ORGANIZER_ACCOUNT_ID,
  },
  {
    id: "open-sessionboard-conf",
    organizationId: LOCAL_ORGANIZATION_ID,
    slug: "open-sessionboard-conf",
    name: "Open Sessionboard Conference",
    status: "active",
    timeZone: "America/Los_Angeles",
    startsAt: "2026-09-25T16:00:00.000Z",
    endsAt: "2026-09-25T23:00:00.000Z",
    venue: "Conference Center",
    cfpSettings: {
      enabled: true,
      opensAt: "2026-08-01T07:00:00.000Z",
      closesAt: "2026-09-22T07:00:00.000Z",
    },
    defaultCalendarSettings: {
      durationMinutes: 30,
      timeZone: "America/Los_Angeles",
      location: "Conference Center",
    },
    embedConfigurations: [],
    version: 1,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
    createdBy: LOCAL_ORGANIZER_ACCOUNT_ID,
    updatedBy: LOCAL_ORGANIZER_ACCOUNT_ID,
  },
];

const LOCAL_MEMBER_SEED: MemberRepositorySeed & {
  readonly organizations: readonly OrganizationRecord[];
} = {
  organizations: [
    {
      organizationId: LOCAL_ORGANIZATION_ID,
      slug: LOCAL_ORGANIZATION_ID,
      name: "Local Organization",
      config: {},
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    },
  ],
  users: [
    {
      userId: LOCAL_ORGANIZER_ACCOUNT_ID,
      email: "organizer@local.test",
      name: "Local Organizer",
      emailVerified: true,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    },
    {
      userId: LOCAL_REVIEWER_ACCOUNT_ID,
      email: "reviewer@local.test",
      name: "Local Reviewer",
      emailVerified: true,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    },
    {
      userId: LOCAL_SPEAKER_ACCOUNT_ID,
      email: "speaker@local.test",
      name: "Local Speaker",
      emailVerified: true,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    },
  ],
  memberships: [
    {
      organizationId: LOCAL_ORGANIZATION_ID,
      userId: LOCAL_ORGANIZER_ACCOUNT_ID,
      role: "owner",
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    },
    {
      organizationId: LOCAL_ORGANIZATION_ID,
      userId: LOCAL_REVIEWER_ACCOUNT_ID,
      role: "reviewer",
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    },
  ],
};
const FAR_FUTURE = new Date("2099-01-01T00:00:00.000Z");
const LOCAL_API_KEY_SCOPES: readonly ApiKeyScope[] = [
  "events:read",
  "events:write",
  "submissions:read",
  "submissions:write",
  "agenda:read",
  "agenda:write",
  "webhooks:read",
  "webhooks:write",
];
const LOCAL_SPEAKER_CAPABILITIES = [
  "profile-self",
  "submission-edit",
  "roster-manage",
  "task-response",
  "asset-read",
  "asset-write",
  "asset-comment",
  "resource-read",
] as const satisfies readonly SpeakerPortalCapability[];

function clone<T>(value: T): T {
  return structuredClone(value);
}

type LocalIdentity = Readonly<{
  token: string;
  sessionId: string;
  userId: string;
  email: string;
  name: string;
  memberships: readonly { organizationId: string; role: "owner" | "reviewer" }[];
  speakerGrants: readonly { organizationId: string; speakerProfileId: string }[];
}>;

const LOCAL_IDENTITIES: readonly LocalIdentity[] = [
  {
    token: LOCAL_SESSION_TOKEN,
    sessionId: "local-organizer-session-id",
    userId: LOCAL_ORGANIZER_ACCOUNT_ID,
    email: "organizer@local.test",
    name: "Local Organizer",
    memberships: [{ organizationId: LOCAL_ORGANIZATION_ID, role: "owner" }],
    speakerGrants: [],
  },
  {
    token: LOCAL_REVIEWER_SESSION_TOKEN,
    sessionId: "local-reviewer-session-id",
    userId: LOCAL_REVIEWER_ACCOUNT_ID,
    email: "reviewer@local.test",
    name: "Local Reviewer",
    memberships: [{ organizationId: LOCAL_ORGANIZATION_ID, role: "reviewer" }],
    speakerGrants: [],
  },
  {
    token: LOCAL_SPEAKER_SESSION_TOKEN,
    sessionId: "local-speaker-session-id",
    userId: LOCAL_SPEAKER_ACCOUNT_ID,
    email: "speaker@local.test",
    name: "Local Speaker",
    memberships: [],
    speakerGrants: [
      { organizationId: LOCAL_ORGANIZATION_ID, speakerProfileId: "local-participant" },
    ],
  },
];

function localIdentityForToken(token: string): LocalIdentity | undefined {
  return LOCAL_IDENTITIES.find((identity) => identity.token === token);
}

function localIdentityForEmail(email: string): LocalIdentity | undefined {
  const normalized = email.trim().toLowerCase();
  return LOCAL_IDENTITIES.find((identity) => identity.email === normalized);
}

function localAuthenticator(): RequestAuthenticator {
  const sessions: BetterAuthGateway = {
    async resolveSession(token) {
      const identity = localIdentityForToken(token);
      if (identity === undefined) return null;
      return {
        sessionId: identity.sessionId,
        userId: identity.userId,
        email: identity.email,
        emailVerified: true,
        expiresAt: FAR_FUTURE,
        memberships: identity.memberships,
        speakerGrants: identity.speakerGrants,
      };
    },
    async requestMagicLink() {},
    async consumeMagicLink() {
      return null;
    },
  };
  const apiKeys: D1ApiKeyGateway = {
    async findByPresentedKey(token) {
      if (token !== LOCAL_API_KEY) return null;
      return {
        id: "local-api-key-id",
        organizationId: LOCAL_ORGANIZATION_ID,
        label: "Local development",
        scopes: LOCAL_API_KEY_SCOPES,
        expiresAt: null,
        revokedAt: null,
      };
    },
    async recordSuccessfulUse() {},
  };
  return new RequestAuthenticator(sessions, apiKeys, {
    clock: { now: () => new Date(SEEDED_AT) },
  });
}

const LOCAL_SESSION_COOKIE = "better-auth.session_token";

function localSessionPayload(identity: LocalIdentity): Record<string, unknown> {
  return {
    session: {
      id: identity.sessionId,
      userId: identity.userId,
      expiresAt: FAR_FUTURE.toISOString(),
    },
    user: {
      id: identity.userId,
      email: identity.email,
      name: identity.name,
      emailVerified: true,
    },
    memberships: identity.memberships,
    speakerGrants: identity.speakerGrants,
  };
}

function localAuthCookieHeader(token: string): string {
  return `${LOCAL_SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax`;
}

function localAuthJson(payload: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(payload), { ...init, headers });
}

function localSessionIdentity(request: Request): LocalIdentity | undefined {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LOCAL_SESSION_COOKIE}=`))
    ?.slice(`${LOCAL_SESSION_COOKIE}=`.length);
  return token === undefined ? undefined : localIdentityForToken(token);
}

/**
 * Deterministic email/password sign-in for local development. Each persona
 * receives a distinct session and the same password, `local`.
 */
function localAuthRoutes(): { handler: (request: Request) => Promise<Response> } {
  return {
    async handler(request) {
      const path = new URL(request.url).pathname;
      if (
        (path === "/api/auth/sign-in/email" || path === "/api/auth/sign-up/email") &&
        request.method === "POST"
      ) {
        const input = await request
          .clone()
          .json<{ email?: unknown; password?: unknown }>()
          .catch((): { email?: unknown; password?: unknown } => ({}));
        const identity =
          typeof input.email === "string" ? localIdentityForEmail(input.email) : undefined;
        if (identity === undefined || input.password !== "local") {
          return localAuthJson(
            { code: "INVALID_CREDENTIALS", message: "The local credentials are invalid." },
            { status: 401 },
          );
        }
        return localAuthJson(
          { token: identity.token, ...localSessionPayload(identity) },
          { headers: { "set-cookie": localAuthCookieHeader(identity.token) } },
        );
      }
      if (path === "/api/auth/sign-in/magic-link" && request.method === "POST") {
        return localAuthJson({ status: true });
      }
      if (path === "/api/auth/get-session" && request.method === "GET") {
        const identity = localSessionIdentity(request);
        if (identity === undefined) {
          return localAuthJson(null, { status: 401 });
        }
        return localAuthJson(localSessionPayload(identity));
      }
      if (path === "/api/auth/sign-out" && request.method === "POST") {
        return localAuthJson(
          { success: true },
          {
            headers: {
              "set-cookie": `${LOCAL_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
            },
          },
        );
      }
      return localAuthJson(
        { code: "LOCAL_AUTH_UNSUPPORTED", message: "This auth route is not available locally." },
        { status: 404 },
      );
    },
  };
}

class LocalSpeakerRepository implements SpeakerRepository {
  readonly #submissions = new Map<string, SpeakerSubmission[]>();
  readonly #profiles = new Map<string, SpeakerProfile[]>();
  readonly #tasks = new Map<string, SpeakerTask[]>();
  readonly #assets = new Map<string, SpeakerAsset[]>();
  readonly #content = new Map<string, SpeakerContentRecord>();
  readonly #contentHistory = new Map<string, SpeakerContentHistoryEntry[]>();
  constructor() {
    this.#seed("demo-event");
  }

  #contentKey(eventId: string, entityType: "session" | "speaker", entityId: string): string {
    return `${eventId}\u0000${entityType}\u0000${entityId}`;
  }

  #seed(eventId: string): void {
    if (this.#submissions.has(eventId)) return;
    this.#submissions.set(eventId, [
      {
        id: "local-submission",
        eventId,
        title: "Designing reliable community systems",
        status: "accepted",
        participantIds: ["local-participant"],
        updatedAt: SEEDED_AT,
      },
    ]);
    this.#profiles.set(eventId, [
      {
        id: "local-profile",
        eventId,
        participantId: "local-participant",
        displayName: "Alex Rivera",
        biography:
          "Alex builds dependable, accessible systems for communities and the people who run them.",
        version: 1,
        updatedAt: SEEDED_AT,
      },
    ]);
    const speakerContent: SpeakerContentRecord = {
      id: "local-speaker-content",
      eventId,
      tenantId: LOCAL_ORGANIZATION_ID,
      entityType: "speaker",
      entityId: "local-participant",
      biography:
        "Alex builds dependable, accessible systems for communities and the people who run them.",
      socialLinks: {},
      status: "approved",
      version: 1,
      updatedAt: SEEDED_AT,
      updatedBy: LOCAL_SPEAKER_ACCOUNT_ID,
    };
    const speakerContentKey = this.#contentKey(eventId, "speaker", "local-participant");
    this.#content.set(speakerContentKey, speakerContent);
    this.#contentHistory.set(speakerContentKey, [
      {
        id: "local-speaker-content-history-1",
        eventId,
        entityType: "speaker",
        entityId: "local-participant",
        action: "created",
        version: 1,
        actorAccountId: LOCAL_SPEAKER_ACCOUNT_ID,
        actorLabel: "Local Organizer",
        occurredAt: SEEDED_AT,
        snapshot: clone(speakerContent),
      },
    ]);
    this.#tasks.set(eventId, [
      {
        id: "local-biography-task",
        eventId,
        submissionId: "local-submission",
        participantId: "local-participant",
        type: "form",
        owner: "speaker",
        title: "Review your speaker profile",
        description: "Confirm the biography that will appear on the public speaker page.",
        status: "in_progress",
        dueAt: "2026-09-01T23:59:00.000Z",
        dependencyIds: [],
        reminderOffsetsMinutes: [10_080, 1_440],
        version: 1,
        updatedAt: SEEDED_AT,
      },
      {
        id: "local-slides-task",
        eventId,
        submissionId: "local-submission",
        participantId: "local-participant",
        type: "upload",
        owner: "speaker",
        title: "Upload presentation slides",
        description: "Upload the final PDF or presentation file for the event team.",
        status: "not_started",
        dueAt: "2026-09-10T23:59:00.000Z",
        dependencyIds: ["local-biography-task"],
        reminderOffsetsMinutes: [10_080, 1_440],
        acceptedAssetKinds: ["slides"],
        version: 1,
        updatedAt: SEEDED_AT,
      },
    ]);
    this.#assets.set(eventId, []);
  }
  listStoredSubmissions(eventId: string): SpeakerSubmission[] {
    return clone(this.#submissions.get(eventId) ?? []);
  }

  listStoredTasks(eventId: string): SpeakerTask[] {
    return clone(this.#tasks.get(eventId) ?? []);
  }

  async getAccessScope(eventId: string, accountId: string): Promise<SpeakerAccessScope> {
    this.#seed(eventId);
    if (accountId !== LOCAL_SPEAKER_ACCOUNT_ID) {
      return { submissionIds: [], participantIds: [] };
    }
    return {
      tenantId: LOCAL_ORGANIZATION_ID,
      role: "owner",
      organizer: true,
      submissionIds: ["local-submission"],
      participantIds: ["local-participant"],
      capabilities: LOCAL_SPEAKER_CAPABILITIES,
      capabilitiesByParticipant: {
        "local-participant": LOCAL_SPEAKER_CAPABILITIES,
      },
      primaryParticipantId: "local-participant",
    };
  }
  async getOrganizerAccessScope(eventId: string, accountId: string) {
    this.#seed(eventId);
    if (accountId !== LOCAL_ORGANIZER_ACCOUNT_ID) return null;
    return {
      tenantId: LOCAL_ORGANIZATION_ID,
      eventId,
      role: "owner" as const,
      submissionIds: ["local-submission"],
      participantIds: ["local-participant"],
    };
  }

  async listSubmissions(eventId: string, submissionIds: readonly string[]) {
    this.#seed(eventId);
    const allowed = new Set(submissionIds);
    return clone((this.#submissions.get(eventId) ?? []).filter(({ id }) => allowed.has(id)));
  }

  async getSubmission(eventId: string, submissionId: string) {
    this.#seed(eventId);
    return clone(this.#submissions.get(eventId)?.find(({ id }) => id === submissionId) ?? null);
  }

  async listProfiles(eventId: string, participantIds: readonly string[]) {
    this.#seed(eventId);
    const allowed = new Set(participantIds);
    return clone(
      (this.#profiles.get(eventId) ?? []).filter(({ participantId }) => allowed.has(participantId)),
    );
  }

  async getProfile(eventId: string, participantId: string) {
    this.#seed(eventId);
    return clone(
      this.#profiles.get(eventId)?.find((profile) => profile.participantId === participantId) ??
        null,
    );
  }

  async updateBiography(
    command: UpdateBiographyCommand,
  ): Promise<RepositoryResult<SpeakerProfile>> {
    this.#seed(command.eventId);
    const profiles = this.#profiles.get(command.eventId) ?? [];
    const index = profiles.findIndex(
      ({ participantId }) => participantId === command.participantId,
    );
    const profile = profiles[index];
    if (profile === undefined) return { ok: false, reason: "not_found" };
    if (profile.version !== command.expectedVersion) {
      return { ok: false, reason: "version_conflict" };
    }
    const updated: SpeakerProfile = {
      ...profile,
      biography: command.biography,
      version: profile.version + 1,
      updatedAt: command.updatedAt,
    };
    profiles[index] = updated;
    return { ok: true, value: clone(updated) };
  }
  async updateProfile(
    command: UpdateSpeakerProfileCommand,
  ): Promise<RepositoryResult<SpeakerProfile>> {
    this.#seed(command.eventId);
    const profiles = this.#profiles.get(command.eventId) ?? [];
    const index = profiles.findIndex(
      ({ participantId }) => participantId === command.participantId,
    );
    const profile = profiles[index];
    if (profile === undefined) return { ok: false, reason: "not_found" };
    if (profile.version !== command.expectedVersion) {
      return { ok: false, reason: "version_conflict" };
    }
    const updated: SpeakerProfile = {
      ...profile,
      ...(command.displayName === undefined ? {} : { displayName: command.displayName }),
      ...(command.email === undefined ? {} : { email: command.email }),
      ...(command.jobTitle === undefined ? {} : { jobTitle: command.jobTitle }),
      ...(command.company === undefined ? {} : { company: command.company }),
      ...(command.status === undefined ? {} : { status: command.status }),
      ...(command.biography === undefined ? {} : { biography: command.biography }),
      ...(command.socialLinks === undefined ? {} : { socialLinks: clone(command.socialLinks) }),
      ...(command.headshotAssetId === undefined || command.headshotAssetId === null
        ? {}
        : { headshotAssetId: command.headshotAssetId }),
      version: profile.version + 1,
      updatedAt: command.updatedAt,
    };
    if (command.headshotAssetId === null) delete updated.headshotAssetId;
    profiles[index] = updated;
    return { ok: true, value: clone(updated) };
  }

  async listTasks(eventId: string, participantIds: readonly string[]) {
    this.#seed(eventId);
    const allowed = new Set(participantIds);
    return clone(
      (this.#tasks.get(eventId) ?? []).filter(({ participantId }) => allowed.has(participantId)),
    );
  }

  async getTask(eventId: string, taskId: string) {
    this.#seed(eventId);
    return clone(this.#tasks.get(eventId)?.find(({ id }) => id === taskId) ?? null);
  }

  async getTasksByIds(eventId: string, taskIds: readonly string[]) {
    this.#seed(eventId);
    const allowed = new Set(taskIds);
    return clone((this.#tasks.get(eventId) ?? []).filter(({ id }) => allowed.has(id)));
  }

  async transitionTask(command: TransitionSpeakerTaskCommand) {
    this.#seed(command.eventId);
    const tasks = this.#tasks.get(command.eventId) ?? [];
    const index = tasks.findIndex(({ id }) => id === command.taskId);
    const task = tasks[index];
    if (task === undefined) return { ok: false, reason: "not_found" } as const;
    if (task.version !== command.expectedVersion || task.status !== command.fromStatus) {
      return { ok: false, reason: "version_conflict" } as const;
    }
    const updated: SpeakerTask = {
      ...task,
      status: command.toStatus,
      version: task.version + 1,
      updatedAt: command.transition.occurredAt,
    };
    tasks[index] = updated;
    return {
      ok: true,
      value: { task: clone(updated), transition: clone(command.transition) },
    } as const;
  }

  async createPendingAsset(asset: SpeakerAsset) {
    this.#seed(asset.eventId);
    this.#assets.get(asset.eventId)?.push(clone(asset));
    return clone(asset);
  }

  async getAsset(eventId: string, assetId: string) {
    this.#seed(eventId);
    return clone(this.#assets.get(eventId)?.find(({ id }) => id === assetId) ?? null);
  }

  async getContent(eventId: string, entityType: "session" | "speaker", entityId: string) {
    this.#seed(eventId);
    return clone(this.#content.get(this.#contentKey(eventId, entityType, entityId)) ?? null);
  }

  async listContentHistory(eventId: string, entityType: "session" | "speaker", entityId: string) {
    this.#seed(eventId);
    return clone(this.#contentHistory.get(this.#contentKey(eventId, entityType, entityId)) ?? []);
  }

  async updateContent(
    command: UpdateSpeakerContentCommand,
  ): Promise<RepositoryResult<SpeakerContentRecord>> {
    this.#seed(command.eventId);
    const key = this.#contentKey(command.eventId, command.entityType, command.entityId);
    const current = this.#content.get(key);
    if (current === undefined) return { ok: false, reason: "not_found" };
    if (current.version !== command.expectedVersion) {
      return { ok: false, reason: "version_conflict" };
    }
    const updated: SpeakerContentRecord = {
      ...current,
      ...(command.title === undefined ? {} : { title: command.title }),
      ...(command.description === undefined ? {} : { description: command.description }),
      ...(command.abstract === undefined ? {} : { abstract: command.abstract }),
      ...(command.biography === undefined ? {} : { biography: command.biography }),
      ...(command.socialLinks === undefined ? {} : { socialLinks: clone(command.socialLinks) }),
      ...(command.headshotAssetId === undefined || command.headshotAssetId === null
        ? {}
        : { headshotAssetId: command.headshotAssetId }),
      ...(command.status === undefined ? {} : { status: command.status }),
      version: current.version + 1,
      updatedAt: command.updatedAt,
      updatedBy: command.accountId,
    };
    if (command.headshotAssetId === null) delete updated.headshotAssetId;
    this.#content.set(key, updated);
    this.#contentHistory.get(key)?.push({
      id: `local-${command.entityType}-content-history-${updated.version}`,
      eventId: command.eventId,
      entityType: command.entityType,
      entityId: command.entityId,
      action: "updated",
      version: updated.version,
      actorAccountId: command.accountId,
      actorLabel: "Local Organizer",
      occurredAt: command.updatedAt,
      snapshot: clone(updated),
    });
    return { ok: true, value: clone(updated) };
  }

  async restoreContentVersion(
    command: RestoreSpeakerContentVersionCommand,
  ): Promise<RepositoryResult<SpeakerContentRecord>> {
    this.#seed(command.eventId);
    const key = this.#contentKey(command.eventId, command.entityType, command.entityId);
    const current = this.#content.get(key);
    if (current === undefined) return { ok: false, reason: "not_found" };
    if (current.version !== command.expectedVersion) {
      return { ok: false, reason: "version_conflict" };
    }
    const target = this.#contentHistory
      .get(key)
      ?.find(({ version }) => version === command.version);
    if (target === undefined) return { ok: false, reason: "not_found" };
    const restored: SpeakerContentRecord = {
      ...clone(target.snapshot),
      version: current.version + 1,
      updatedAt: command.updatedAt,
      updatedBy: command.accountId,
    };
    this.#content.set(key, restored);
    this.#contentHistory.get(key)?.push({
      id: `local-${command.entityType}-content-history-${restored.version}`,
      eventId: command.eventId,
      entityType: command.entityType,
      entityId: command.entityId,
      action: "restored",
      version: restored.version,
      actorAccountId: command.accountId,
      actorLabel: "Local Organizer",
      occurredAt: command.updatedAt,
      snapshot: clone(restored),
    });
    return { ok: true, value: clone(restored) };
  }
}

class LocalPrivateAssetGateway implements PrivateAssetGateway {
  async createUploadGrant(command: CreatePrivateUploadGrantCommand) {
    return {
      method: "PUT" as const,
      url: `https://uploads.local.open-sessionboard.test/${encodeURIComponent(command.objectKey)}`,
      headers: { "content-type": command.contentType },
      expiresAt: command.expiresAt,
    };
  }

  async createDownloadGrant(command: { objectKey: string; fileName: string; expiresAt: string }) {
    return {
      url: `https://downloads.local.open-sessionboard.test/${encodeURIComponent(command.objectKey)}?file=${encodeURIComponent(command.fileName)}`,
      expiresAt: command.expiresAt,
    };
  }
}

function localAgendaEngine(suggestionProvider?: CloudflareAiProviders["agenda"]): AgendaEngine {
  const repository = new InMemoryAgendaRepository();
  const engine = new AgendaEngine(repository, new InMemoryAgendaMutationLock(), {
    clock: { now: () => new Date(SEEDED_AT) },
    idGenerator: {
      nextId: (() => {
        let sequence = 0;
        return (prefix) => `${prefix}_local_${++sequence}`;
      })(),
    },
    ...(suggestionProvider === undefined ? {} : { suggestionProvider }),
  });
  const seeding = new Map<string, Promise<void>>();
  const seedEntries: readonly AgendaEntryInput[] = [
    {
      id: "local-entry-keynote",
      sessionId: "local-session-keynote",
      roomId: "local-room-main",
      trackIds: ["local-track-main"],
      startsAtLocal: "2026-09-18T09:00:00",
      endsAtLocal: "2026-09-18T10:00:00",
    },
    {
      id: "local-entry-workshop",
      sessionId: "local-session-workshop",
      roomId: "local-room-studio",
      trackIds: ["local-track-practice"],
      startsAtLocal: "2026-09-18T10:15:00",
      endsAtLocal: "2026-09-18T11:15:00",
    },
  ];
  const ensureSeeded = (eventId: string): Promise<void> => {
    const existing = seeding.get(eventId);
    if (existing !== undefined) return existing;
    const pending = (async () => {
      if ((await repository.load(eventId)) !== null) return;
      await engine.createAgenda({
        eventId,
        actorId: LOCAL_SPEAKER_ACCOUNT_ID,
        timeZone: "America/Los_Angeles",
        minimumTravelMinutes: 10,
        sessions: [
          {
            id: "local-session-keynote",
            title: "Opening keynote: Systems that earn trust",
            status: "accepted",
            participantIds: ["local-participant"],
            resourceIds: [],
            capacityRequired: 120,
          },
          {
            id: "local-session-workshop",
            title: "A practical guide to resilient programs",
            status: "accepted",
            participantIds: ["local-participant-two"],
            resourceIds: [],
            capacityRequired: 36,
          },
        ],
        rooms: [
          { id: "local-room-main", name: "Main Hall", capacity: 200 },
          { id: "local-room-studio", name: "Workshop Studio", capacity: 48 },
        ],
        tracks: [
          { id: "local-track-main", name: "Main stage" },
          { id: "local-track-practice", name: "Practice" },
        ],
      });
      await engine.updateDraft({
        eventId,
        actorId: LOCAL_SPEAKER_ACCOUNT_ID,
        expectedVersion: 1,
        entries: seedEntries,
      });
      await engine.publish({
        eventId,
        actorId: LOCAL_SPEAKER_ACCOUNT_ID,
        expectedVersion: 2,
      });
    })();
    seeding.set(eventId, pending);
    return pending;
  };
  const methodsThatRequireSeed = new Set<PropertyKey>([
    "getDraft",
    "getPublishedAgenda",
    "getOutbox",
    "getAudit",
    "validateEntries",
    "preview",
    "updateDraft",
    "updateCatalog",
    "overrideWarning",
    "publish",
    "rollback",
    "generateSuggestion",
    "generateAgendaSuggestion",
    "getSuggestion",
    "getAgendaSuggestion",
    "regenerateSuggestion",
    "regenerateAgendaSuggestion",
    "rejectSuggestion",
    "rejectAgendaSuggestion",
    "applySuggestion",
    "applyAgendaSuggestion",
  ]);
  return new Proxy(engine, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;
      if (!methodsThatRequireSeed.has(property)) return value.bind(target);
      return async (input: string | { eventId: string }, ...rest: unknown[]) => {
        const eventId = typeof input === "string" ? input : input.eventId;
        await ensureSeeded(eventId);
        return value.apply(target, [input, ...rest]);
      };
    },
  });
}

class LocalCommunicationDeliveryAdapter implements CommunicationDeliveryAdapter {
  readonly requests: CommunicationDeliveryRequest[] = [];

  async send(request: CommunicationDeliveryRequest) {
    this.requests.push(clone(request));
    return {
      status: "queued" as const,
      providerMessageId: `local-message-${request.recipientId}`,
    };
  }
}
class LocalRemixRepository implements RemixRepository {
  readonly #candidates = new Map<string, ContentRemixCandidate>();
  readonly #audit: RemixAuditEntry[] = [];

  async getCandidateById(
    tenantId: string,
    candidateId: string,
  ): Promise<ContentRemixCandidate | null> {
    const candidate = this.#candidates.get(candidateId);
    return candidate?.tenantId === tenantId ? clone(candidate) : null;
  }

  async getCandidate(
    tenantId: string,
    eventId: string,
    candidateId: string,
  ): Promise<ContentRemixCandidate | null> {
    const candidate = await this.getCandidateById(tenantId, candidateId);
    return candidate?.eventId === eventId ? candidate : null;
  }

  async listCandidates(
    tenantId: string,
    eventId: string,
    filter: RemixCandidateFilter = {},
  ): Promise<readonly ContentRemixCandidate[]> {
    return [...this.#candidates.values()]
      .filter(
        (candidate) =>
          candidate.tenantId === tenantId &&
          candidate.eventId === eventId &&
          (filter.status === undefined || candidate.status === filter.status) &&
          (filter.sourceType === undefined || candidate.sourceType === filter.sourceType) &&
          (filter.sourceId === undefined || candidate.sourceId === filter.sourceId),
      )
      .map(clone);
  }

  async saveCandidate(
    candidate: ContentRemixCandidate,
    expectedVersion: number | null,
  ): Promise<void> {
    const current = this.#candidates.get(candidate.id);
    if (
      (expectedVersion === null && current !== undefined) ||
      (expectedVersion !== null && current?.version !== expectedVersion)
    ) {
      throw new Error("The remix candidate changed.");
    }
    this.#candidates.set(candidate.id, clone(candidate));
  }

  async appendAudit(entry: RemixAuditEntry): Promise<void> {
    this.#audit.push(clone(entry));
  }

  async listAudit(tenantId: string, eventId: string): Promise<readonly RemixAuditEntry[]> {
    return this.#audit
      .filter((entry) => entry.tenantId === tenantId && entry.eventId === eventId)
      .map(clone);
  }
}

class LocalRemixContentGateway implements RemixContentGateway {
  readonly #sessions = new Map<string, RemixSessionRecord>([
    [
      "local-session-keynote",
      {
        kind: "session",
        id: "local-session-keynote",
        eventId: "demo-event",
        revision: 1,
        title: "Opening keynote: Systems that earn trust",
        description: "How program teams build clear, dependable participant experiences.",
        tags: ["Reliability"],
        tracks: ["Main stage"],
      },
    ],
    [
      "local-session-workshop",
      {
        kind: "session",
        id: "local-session-workshop",
        eventId: "demo-event",
        revision: 1,
        title: "A practical guide to resilient programs",
        description: "A working session for building repeatable event operations.",
        tags: ["Reliability"],
        tracks: ["Practice"],
      },
    ],
  ]);
  readonly #speakers = new Map<string, RemixSpeakerRecord>([
    [
      "local-participant",
      {
        kind: "speaker",
        id: "local-participant",
        eventId: "demo-event",
        revision: 1,
        biography: "Alex builds dependable, accessible systems for communities.",
      },
    ],
  ]);

  async listSessions(input: {
    tenantId: string;
    eventId: string;
    filter?: RemixRecordFilter;
  }): Promise<readonly RemixSessionRecord[]> {
    if (input.tenantId !== LOCAL_ORGANIZATION_ID) return [];
    return this.filterRecords(
      [...this.#sessions.values()].filter((record) => record.eventId === input.eventId),
      input.filter,
    );
  }

  async listSpeakers(input: {
    tenantId: string;
    eventId: string;
    filter?: RemixRecordFilter;
  }): Promise<readonly RemixSpeakerRecord[]> {
    if (input.tenantId !== LOCAL_ORGANIZATION_ID) return [];
    return this.filterRecords(
      [...this.#speakers.values()].filter((record) => record.eventId === input.eventId),
      input.filter,
    );
  }

  async getSession(input: {
    tenantId: string;
    eventId: string;
    sourceId: string;
  }): Promise<RemixSessionRecord | null> {
    const record = this.#sessions.get(input.sourceId);
    return input.tenantId === LOCAL_ORGANIZATION_ID && record?.eventId === input.eventId
      ? clone(record)
      : null;
  }

  async getSpeaker(input: {
    tenantId: string;
    eventId: string;
    sourceId: string;
  }): Promise<RemixSpeakerRecord | null> {
    const record = this.#speakers.get(input.sourceId);
    return input.tenantId === LOCAL_ORGANIZATION_ID && record?.eventId === input.eventId
      ? clone(record)
      : null;
  }

  async applyRevision(input: {
    tenantId: string;
    eventId: string;
    sourceType: "session" | "speaker";
    sourceId: string;
    expectedSourceRevision: number;
    fields: readonly ("title" | "description" | "tags" | "tracks" | "biography")[];
    content: RemixContent;
    candidateId: string;
    actorId: string;
    appliedAt: string;
  }): Promise<ContentRevision> {
    const current =
      input.sourceType === "session" ? await this.getSession(input) : await this.getSpeaker(input);
    if (current === null || current.revision !== input.expectedSourceRevision) {
      throw new Error("The remix source changed.");
    }
    const revision = current.revision + 1;
    if (input.sourceType === "session") {
      const content = input.content as {
        title: string;
        description: string;
        tags: readonly string[];
        tracks: readonly string[];
      };
      this.#sessions.set(input.sourceId, {
        kind: "session",
        id: input.sourceId,
        eventId: input.eventId,
        revision,
        title: content.title,
        description: content.description,
        tags: [...content.tags],
        tracks: [...content.tracks],
      });
    } else {
      const content = input.content as { biography: string };
      this.#speakers.set(input.sourceId, {
        kind: "speaker",
        id: input.sourceId,
        eventId: input.eventId,
        revision,
        biography: content.biography,
      });
    }
    return {
      id: `local-content-revision-${input.candidateId}-${revision}`,
      tenantId: input.tenantId,
      eventId: input.eventId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      sourceRevision: revision,
      fields: [...input.fields],
      content: clone(input.content),
      candidateId: input.candidateId,
      appliedBy: input.actorId,
      appliedAt: input.appliedAt,
    };
  }

  private filterRecords<T extends RemixSessionRecord | RemixSpeakerRecord>(
    records: readonly T[],
    filter: RemixRecordFilter | undefined,
  ): T[] {
    const query = filter?.query?.trim().toLocaleLowerCase();
    const ids = filter?.ids === undefined ? null : new Set(filter.ids);
    return records
      .filter((record) => {
        if (ids !== null && !ids.has(record.id)) return false;
        if (query === undefined || query.length === 0) return true;
        return JSON.stringify(record).toLocaleLowerCase().includes(query);
      })
      .map(clone);
  }
}
class LocalPublicApiRepository implements PublicApiRepository {
  readonly #records = new Map<string, Map<string, Record<string, unknown>>>();
  #sequence = 0;

  constructor() {
    this.#seed("events", [
      {
        id: "open-sessionboard-conf",
        version: 1,
        organizationId: LOCAL_ORGANIZATION_ID,
        name: "Open Sessionboard Conference",
        slug: "open-sessionboard-conf",
        timeZone: "America/Los_Angeles",
        publishedAgendaRevisionId: "agenda-local-revision-1",
        status: "published",
        updatedAt: SEEDED_AT,
      },
      {
        id: "demo-event",
        version: 1,
        organizationId: LOCAL_ORGANIZATION_ID,
        name: "Open Sessionboard Demo",
        slug: "demo-event",
        timeZone: "America/Los_Angeles",
        publishedAgendaRevisionId: "agenda-local-revision-2",
        status: "published",
        updatedAt: SEEDED_AT,
      },
    ]);
    this.#seed("speakers", [
      {
        id: "local-participant",
        version: 1,
        organizationId: LOCAL_ORGANIZATION_ID,
        displayName: "Alex Rivera",
        biography: "Alex builds dependable, accessible systems for communities.",
        published: true,
        updatedAt: SEEDED_AT,
      },
    ]);
    this.#seed("agenda", [
      {
        id: "open-sessionboard-conf",
        version: 1,
        organizationId: LOCAL_ORGANIZATION_ID,
        revision: 1,
        publishedAt: SEEDED_AT,
      },
    ]);
    this.#seed("sessions", [
      {
        id: "local-session-keynote",
        version: 1,
        organizationId: LOCAL_ORGANIZATION_ID,
        eventId: "demo-event",
        title: "Opening keynote: Systems that earn trust",
        status: "accepted",
        updatedAt: SEEDED_AT,
      },
      {
        id: "local-session-workshop",
        version: 1,
        organizationId: LOCAL_ORGANIZATION_ID,
        eventId: "demo-event",
        title: "A practical guide to resilient programs",
        status: "accepted",
        updatedAt: SEEDED_AT,
      },
    ]);
  }

  #seed(resource: string, records: readonly Record<string, unknown>[]): void {
    this.#records.set(
      `${LOCAL_ORGANIZATION_ID}:${resource}`,
      new Map(records.map((record) => [String(record.id), clone(record)])),
    );
  }

  #collection(organizationId: string, resource: string) {
    const key = `${organizationId}:${resource}`;
    let collection = this.#records.get(key);
    if (collection === undefined) {
      collection = new Map();
      this.#records.set(key, collection);
    }
    return collection;
  }
  listStored(organizationId: string, resource: string): Record<string, unknown>[] {
    return clone([...this.#collection(organizationId, resource).values()]);
  }

  async list(input: PublicApiListInput): Promise<PublicApiListResult<Record<string, unknown>>> {
    const items = [...this.#collection(input.organizationId, input.resource).values()].filter(
      (record) =>
        Object.entries(input.filters).every(([key, value]) => String(record[key] ?? "") === value),
    );
    return { items: clone(items), hasMore: false, nextCursor: null };
  }

  async get(input: PublicApiGetInput) {
    return clone(this.#collection(input.organizationId, input.resource).get(input.id) ?? null);
  }

  async create(input: PublicApiCreateInput<Record<string, unknown>>) {
    const collection = this.#collection(input.organizationId, input.resource);
    const requestedId = typeof input.data.id === "string" ? input.data.id.trim() : "";
    const id = requestedId || `${input.resource}-local-${++this.#sequence}`;
    const record = {
      ...clone(input.data),
      id,
      organizationId: input.organizationId,
      version: 1,
      updatedAt: SEEDED_AT,
    };
    collection.set(id, record);
    return clone(record);
  }

  async update(input: PublicApiUpdateInput<Record<string, unknown>>) {
    const collection = this.#collection(input.organizationId, input.resource);
    const current = collection.get(input.id);
    if (current === undefined || current.version !== input.expectedVersion) return null;
    const record = {
      ...current,
      ...clone(input.data),
      id: input.id,
      organizationId: input.organizationId,
      version: input.expectedVersion + 1,
      updatedAt: SEEDED_AT,
    };
    collection.set(input.id, record);
    return clone(record);
  }
}
class LocalIntegrationAdminRepository {
  readonly #events = new Map<string, IntegrationEvent>();
  readonly #delivery = new Map<string, IntegrationDeliveryStatus>();
  readonly #apiKeys = new Map<string, IntegrationApiKeySummary[]>();
  readonly #webhookLastDelivery = new Map<string, IntegrationWebhookDelivery>();
  #apiKeySequence = 0;

  constructor(publicRepository: LocalPublicApiRepository) {
    for (const record of publicRepository.listStored(LOCAL_ORGANIZATION_ID, "events")) {
      const id = textValue(record, "id");
      if (id === null) continue;
      const event: IntegrationEvent = {
        id,
        organizationId: LOCAL_ORGANIZATION_ID,
        name: textValue(record, "name", "title") ?? id,
        timeZone: textValue(record, "timeZone") ?? "UTC",
        publishedAgendaRevisionId: textValue(record, "publishedAgendaRevisionId"),
      };
      this.#events.set(id, event);
      this.#delivery.set(id, {
        openSend: {
          state: "connected",
          credentialLastFour: "al-key",
          senderChecks: [
            { address: "auth@foreverbrowsing.com", status: "verified" },
            { address: "speakers@foreverbrowsing.com", status: "verified" },
            { address: "calendar@foreverbrowsing.com", status: "verified" },
          ],
          deliveredLast24Hours: id === "demo-event" ? 18 : 11,
          failedLast24Hours: id === "demo-event" ? 1 : 0,
          lastDeliveryAt: SEEDED_AT,
        },
        calendar: {
          state: "degraded",
          sentLast24Hours: id === "demo-event" ? 7 : 4,
          failedLast24Hours: 1,
          lastInvitationAt: SEEDED_AT,
          lastFailure: {
            deliveryId: `calendar-local-failure-${id}`,
            summary: "One invitation needs a retry after its recipient address was corrected.",
            occurredAt: SEEDED_AT,
            retryable: true,
          },
        },
      });
      this.#apiKeys.set(id, [
        {
          id: `local-key-${id}`,
          label: "Local integration client",
          prefix: "osb_local_",
          scopes: ["events:read", "agenda:read", "webhooks:read"],
          createdAt: SEEDED_AT,
          lastUsedAt: SEEDED_AT,
          expiresAt: null,
          revokedAt: null,
        },
      ]);
    }
    this.#webhookLastDelivery.set("local-webhook-demo", {
      status: "succeeded",
      attemptedAt: SEEDED_AT,
      responseStatus: 202,
    });
    this.#webhookLastDelivery.set("local-webhook-conference", {
      status: "retrying",
      attemptedAt: SEEDED_AT,
      responseStatus: 503,
    });
  }

  async getEvent(eventId: string): Promise<IntegrationEvent | null> {
    return clone(this.#events.get(eventId) ?? null);
  }

  async getDeliveryStatus(eventId: string): Promise<IntegrationDeliveryStatus> {
    const status = this.#delivery.get(eventId);
    if (status === undefined) throw new Error("The local integration event was not seeded.");
    return clone(status);
  }

  async saveCredential(eventId: string, _provider: "opensend", secret: string): Promise<void> {
    const status = await this.getDeliveryStatus(eventId);
    this.#delivery.set(eventId, {
      ...status,
      openSend: {
        ...status.openSend,
        state: "connected",
        credentialLastFour: secret.slice(-4),
      },
    });
  }

  async listApiKeys(eventId: string): Promise<readonly IntegrationApiKeySummary[]> {
    return clone(this.#apiKeys.get(eventId) ?? []);
  }

  async createApiKey(input: {
    readonly eventId: string;
    readonly label: string;
    readonly scopes: readonly ApiScope[];
    readonly expiresAt: string | null;
  }): Promise<IntegrationApiKeyCreation> {
    const secret = `osb_${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
    const summary: IntegrationApiKeySummary = {
      id: `local-created-key-${++this.#apiKeySequence}`,
      label: input.label,
      prefix: secret.slice(0, 12),
      scopes: [...new Set(input.scopes)],
      createdAt: SEEDED_AT,
      lastUsedAt: null,
      expiresAt: input.expiresAt?.trim() || null,
      revokedAt: null,
    };
    const keys = this.#apiKeys.get(input.eventId);
    if (keys === undefined) throw new Error("The local integration event was not seeded.");
    keys.push(summary);
    return { summary: clone(summary), secret };
  }

  async revokeApiKey(eventId: string, apiKeyId: string): Promise<boolean> {
    const keys = this.#apiKeys.get(eventId);
    const index = keys?.findIndex((key) => key.id === apiKeyId) ?? -1;
    if (keys === undefined || index < 0) return false;
    const key = keys[index];
    if (key === undefined) return false;
    keys[index] = { ...key, revokedAt: SEEDED_AT };
    return true;
  }

  async getWebhookLastDelivery(
    eventId: string,
    subscriptionId: string,
  ): Promise<IntegrationWebhookDelivery | null> {
    if (!this.#events.has(eventId)) return null;
    return clone(this.#webhookLastDelivery.get(subscriptionId) ?? null);
  }

  async retryCalendarDelivery(eventId: string, deliveryId: string): Promise<boolean> {
    const status = await this.getDeliveryStatus(eventId);
    if (status.calendar.lastFailure?.deliveryId !== deliveryId) return false;
    this.#delivery.set(eventId, {
      ...status,
      calendar: {
        ...status.calendar,
        state: "connected",
        lastFailure: null,
        sentLast24Hours: status.calendar.sentLast24Hours + 1,
      },
    });
    return true;
  }
}

interface LocalOverviewAssignment {
  readonly id: string;
  readonly tenantId: string;
  readonly eventId: string;
  readonly status: string;
  readonly dueAt?: string;
}

class LocalOrganizerOverviewRepository implements OrganizerOverviewRouteDependencies {
  readonly #publicRepository: LocalPublicApiRepository;
  readonly #speakerRepository: LocalSpeakerRepository;
  readonly #assignments: readonly LocalOverviewAssignment[];

  constructor(options: {
    readonly publicRepository: LocalPublicApiRepository;
    readonly speakerRepository: LocalSpeakerRepository;
    readonly assignments?: readonly LocalOverviewAssignment[];
  }) {
    this.#publicRepository = options.publicRepository;
    this.#speakerRepository = options.speakerRepository;
    this.#assignments = options.assignments ?? [];
  }

  async getOverviewCore(organizationId: string): Promise<OrganizerOverviewCoreData> {
    const { events } = this.scopedEvents(organizationId);
    return {
      organizationId,
      metrics: { eventCount: events.length },
      events,
    };
  }

  async getOverviewActivity(organizationId: string): Promise<OrganizerOverviewActivityData> {
    const { events, eventIds } = this.scopedEvents(organizationId);
    if (events.length === 0) {
      return {
        organizationId,
        metrics: {
          submissionCount: 0,
          pendingReviewCount: 0,
          outstandingSpeakerTaskCount: 0,
          publishedSessionCount: 0,
        },
        actionItems: [],
      };
    }

    const submissions =
      organizationId === LOCAL_ORGANIZATION_ID
        ? events.flatMap((event) =>
            this.#speakerRepository
              .listStoredSubmissions(event.id)
              .filter((submission) => submission.status !== "withdrawn"),
          )
        : [];
    const pendingAssignments = this.#assignments.filter(
      (assignment) =>
        assignment.tenantId === organizationId &&
        eventIds.has(assignment.eventId) &&
        (assignment.status === "assigned" || assignment.status === "in_progress"),
    );
    const tasks =
      organizationId === LOCAL_ORGANIZATION_ID
        ? events.flatMap((event) =>
            this.#speakerRepository
              .listStoredTasks(event.id)
              .filter((task) => task.status !== "completed" && task.status !== "waived"),
          )
        : [];
    const sessions = this.#publicRepository
      .listStored(organizationId, "sessions")
      .filter(
        (session) =>
          eventIds.has(textValue(session, "eventId") ?? "") &&
          textValue(session, "status") !== "cancelled",
      );
    const publishedSessionIdsByEvent = new Map(
      events.map(
        (event) => [event.id, this.publishedSessionIds(organizationId, event.id)] as const,
      ),
    );
    const publishedSessionCount = [...publishedSessionIdsByEvent.values()].reduce(
      (total, ids) => total + ids.size,
      0,
    );
    const actionItems: OrganizerOverviewActionItem[] = [];

    for (const event of events) {
      const eventPendingReviews = pendingAssignments.filter(
        (assignment) => assignment.eventId === event.id,
      );
      if (eventPendingReviews.length > 0) {
        actionItems.push({
          id: `reviews:${event.id}`,
          type: "reviews",
          eventId: event.id,
          title:
            eventPendingReviews.length === 1
              ? "Complete a pending review"
              : "Complete pending reviews",
          description: `${eventPendingReviews.length} review${eventPendingReviews.length === 1 ? "" : "s"} still need organizer attention.`,
          count: eventPendingReviews.length,
          priority: 90,
          dueAt: earliestDueAt(eventPendingReviews.map((assignment) => assignment.dueAt ?? null)),
          href: hrefFor(organizationId, event.id, "reviews"),
        });
      }

      const eventTasks = tasks.filter((task) => task.eventId === event.id);
      if (eventTasks.length > 0) {
        actionItems.push({
          id: `speaker_tasks:${event.id}`,
          type: "speaker_tasks",
          eventId: event.id,
          title: eventTasks.length === 1 ? "Resolve a speaker task" : "Resolve speaker tasks",
          description: `${eventTasks.length} speaker task${eventTasks.length === 1 ? "" : "s"} remain open.`,
          count: eventTasks.length,
          priority: 70,
          dueAt: earliestDueAt(eventTasks.map((task) => task.dueAt ?? null)),
          href: hrefFor(organizationId, event.id, "speakers"),
        });
      }

      const eventSessions = sessions.filter(
        (session) => textValue(session, "eventId") === event.id,
      );
      const publishedIds = publishedSessionIdsByEvent.get(event.id) ?? new Set<string>();
      const unpublishedSessionCount = eventSessions.filter(
        (session) => !publishedIds.has(textValue(session, "id") ?? ""),
      ).length;
      if (unpublishedSessionCount > 0) {
        actionItems.push({
          id: `agenda:${event.id}`,
          type: "agenda",
          eventId: event.id,
          title:
            unpublishedSessionCount === 1
              ? "Publish the remaining session"
              : "Publish the remaining sessions",
          description: `${unpublishedSessionCount} session${unpublishedSessionCount === 1 ? "" : "s"} are not in the current published agenda.`,
          count: unpublishedSessionCount,
          priority: 50,
          dueAt: null,
          href: hrefFor(organizationId, event.id, "agenda"),
        });
      }
    }

    actionItems.sort(
      (left, right) =>
        right.priority - left.priority ||
        compareNullableDates(left.dueAt, right.dueAt) ||
        left.id.localeCompare(right.id),
    );
    return {
      organizationId,
      metrics: {
        submissionCount: submissions.length,
        pendingReviewCount: pendingAssignments.length,
        outstandingSpeakerTaskCount: tasks.length,
        publishedSessionCount,
      },
      actionItems,
    };
  }

  private scopedEvents(organizationId: string): {
    readonly events: OrganizerOverviewEvent[];
    readonly eventIds: ReadonlySet<string>;
  } {
    const events = this.#publicRepository
      .listStored(organizationId, "events")
      .map((event) => this.eventView(event))
      .sort((left, right) => left.id.localeCompare(right.id));
    return { events, eventIds: new Set(events.map((event) => event.id)) };
  }
  private eventView(record: Record<string, unknown>): OrganizerOverviewEvent {
    const id = textValue(record, "id") ?? "unknown";
    return {
      id,
      name: textValue(record, "name", "title") ?? id,
      slug: textValue(record, "slug"),
      status: textValue(record, "status"),
      startsAt: textValue(record, "startsAt", "startsOn", "startAt"),
      endsAt: textValue(record, "endsAt", "endsOn", "endAt"),
    };
  }

  private publishedSessionIds(organizationId: string, eventId: string): ReadonlySet<string> {
    const agenda = this.#publicRepository
      .listStored(organizationId, "agenda")
      .find((record) => textValue(record, "id", "eventId") === eventId);
    if (agenda === undefined) return new Set<string>();
    const values = agenda.sessionIds ?? agenda.publishedSessionIds;
    return Array.isArray(values)
      ? new Set(values.filter((value): value is string => typeof value === "string"))
      : new Set<string>();
  }
}

function textValue(record: Record<string, unknown>, ...keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

function earliestDueAt(values: readonly (string | null)[]): string | null {
  return (
    values
      .filter((value): value is string => value !== null && !Number.isNaN(Date.parse(value)))
      .sort((left, right) => Date.parse(left) - Date.parse(right))[0] ?? null
  );
}

function hrefFor(
  organizationId: string,
  eventId: string,
  suffix: "reviews" | "speakers" | "agenda",
): string {
  return `/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventId)}/${suffix}`;
}

function compareNullableDates(left: string | null, right: string | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return Date.parse(left) - Date.parse(right);
}

function eventIdFrom(request: Request): string {
  const pathMatch = /\/(?:events|event)\/([^/]+)/u.exec(new URL(request.url).pathname)?.[1];
  return pathMatch === undefined ? "demo-event" : decodeURIComponent(pathMatch);
}

export function createLocalDependencies(aiProviders?: CloudflareAiProviders): ApiDependencies {
  const authenticator = localAuthenticator();
  const speakerRepository = new LocalSpeakerRepository();
  const speakerService = new SpeakerService(speakerRepository, new LocalPrivateAssetGateway(), {
    now: () => new Date(SEEDED_AT),
    generateId: (() => {
      let sequence = 0;
      return () => `local-speaker-id-${++sequence}`;
    })(),
  });
  const publicRepository = new LocalPublicApiRepository();
  let eventSequence = 0;
  const eventService = new EventService(new InMemoryEventRepository({ events: LOCAL_EVENTS }), {
    clock: () => new Date(SEEDED_AT),
    generateId: () => `local-event-${++eventSequence}`,
  });
  const localRecord = {
    tenantId: LOCAL_ORGANIZATION_ID,
    eventId: "demo-event",
    version: 1,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
    createdBy: LOCAL_ORGANIZER_ACCOUNT_ID,
    updatedBy: LOCAL_ORGANIZER_ACCOUNT_ID,
    history: [],
  } as const;
  const sessionService = new SessionService(
    new InMemorySessionRepository({
      settings: [
        {
          ...localRecord,
          id: "local-session-settings",
          statuses: ["draft", "accepted", "scheduled", "cancelled"],
          agendaEligibleStatuses: ["accepted", "scheduled"],
        } satisfies SessionSettings,
      ],
      rooms: [
        {
          ...localRecord,
          id: "local-room-main",
          name: "Main Hall",
          capacity: 200,
          resources: ["projector", "stage"],
          resourceIds: ["projector", "stage"],
        },
        {
          ...localRecord,
          id: "local-room-studio",
          name: "Workshop Studio",
          capacity: 48,
          resources: ["projector", "whiteboard"],
          resourceIds: ["projector", "whiteboard"],
        },
      ] satisfies readonly Room[],
      tracks: [
        {
          ...localRecord,
          id: "local-track-main",
          name: "Main stage",
          description: "Keynotes and featured sessions.",
        },
        {
          ...localRecord,
          id: "local-track-practice",
          name: "Practice",
          description: "Hands-on program operations.",
        },
      ] satisfies readonly Track[],
      formats: [
        {
          ...localRecord,
          id: "local-format-keynote",
          name: "Keynote",
          description: "Featured plenary session.",
        },
        {
          ...localRecord,
          id: "local-format-workshop",
          name: "Workshop",
          description: "Interactive working session.",
        },
      ] satisfies readonly Format[],
      levels: [
        {
          ...localRecord,
          id: "local-level-all",
          name: "All levels",
          description: "No prior experience required.",
        },
      ] satisfies readonly Level[],
      tags: [
        {
          ...localRecord,
          id: "local-tag-reliability",
          name: "Reliability",
          description: "Operationally dependable systems.",
        },
      ] satisfies readonly Tag[],
      sessions: [
        {
          ...localRecord,
          id: "local-session-keynote",
          title: "Opening keynote: Systems that earn trust",
          description: "How program teams build clear, dependable participant experiences.",
          status: "accepted",
          contentStatus: "Approved",
          durationMinutes: 60,
          capacityRequired: 120,
          roomId: "local-room-main",
          trackId: "local-track-main",
          trackIds: ["local-track-main"],
          formatId: "local-format-keynote",
          levelId: "local-level-all",
          tagIds: ["local-tag-reliability"],
          speakerIds: ["local-participant"],
          speakerRoster: [{ id: "local-participant", role: "speaker" }],
          resourceIds: ["projector", "stage"],
        },
        {
          ...localRecord,
          id: "local-session-workshop",
          title: "A practical guide to resilient programs",
          description: "A working session for building repeatable event operations.",
          status: "accepted",
          contentStatus: "Approved",
          durationMinutes: 60,
          capacityRequired: 36,
          roomId: "local-room-studio",
          trackId: "local-track-practice",
          trackIds: ["local-track-practice"],
          formatId: "local-format-workshop",
          levelId: "local-level-all",
          tagIds: ["local-tag-reliability"],
          speakerIds: ["local-participant-two"],
          speakerRoster: [{ id: "local-participant-two", role: "speaker" }],
          resourceIds: ["projector", "whiteboard"],
        },
      ] satisfies readonly Session[],
      speakerIds: {
        [`${LOCAL_ORGANIZATION_ID}:demo-event`]: ["local-participant", "local-participant-two"],
      },
    }),
    {
      clock: () => new Date(SEEDED_AT),
      generateId: (() => {
        let sequence = 0;
        return () => `local-session-resource-${++sequence}`;
      })(),
    },
  );
  const communicationRepository = new InMemoryCommunicationRepository({
    templates: [
      {
        id: "local-event-update",
        tenantId: LOCAL_ORGANIZATION_ID,
        eventId: "demo-event",
        name: "Speaker event update",
        purpose: "organizer_group_email",
        version: 1,
        status: "approved",
        sender: "speakers@sessionboard.namuh.co",
        subject: "Program update for {{displayName}}",
        html: "<p>Hello {{displayName}},</p><p>{{message}}</p>",
        text: "Hello {{displayName}},\n\n{{message}}",
        variables: ["displayName", "message"],
        createdBy: LOCAL_ORGANIZER_ACCOUNT_ID,
        createdAt: SEEDED_AT,
        updatedAt: SEEDED_AT,
        approvedBy: LOCAL_ORGANIZER_ACCOUNT_ID,
        approvedAt: SEEDED_AT,
      } satisfies CommunicationTemplate,
    ],
    recipients: [
      {
        id: "local-participant",
        tenantId: LOCAL_ORGANIZATION_ID,
        eventId: "demo-event",
        email: "speaker@local.test",
        displayName: "Alex Rivera",
        audiences: ["all_participants", "accepted_participants"],
        data: { firstName: "Alex", displayName: "Alex Rivera" },
      } satisfies CommunicationRecipient,
    ],
    authorizedAudiences: {
      [`${LOCAL_ORGANIZATION_ID}:demo-event`]: ["all_participants", "accepted_participants"],
    },
  });
  const communicationService = new CommunicationService(
    communicationRepository,
    new LocalCommunicationDeliveryAdapter(),
    { clock: () => new Date(SEEDED_AT) },
  );
  const reportRepository = new InMemoryReportRepository([
    {
      tenantId: LOCAL_ORGANIZATION_ID,
      eventId: "demo-event",
      session: {
        id: "local-session-keynote",
        title: "Opening keynote: Systems that earn trust",
        description: "How program teams build clear, dependable participant experiences.",
        status: "accepted",
        room: "Main Hall",
        track: "Main stage",
      },
      participants: [{ id: "local-participant", displayName: "Alex Rivera" }],
      speakers: [
        {
          id: "local-participant",
          displayName: "Alex Rivera",
          biography: "Alex builds dependable, accessible systems for communities.",
        },
      ],
      evaluationProgress: {
        planId: "local-evaluation-plan",
        planName: "Program review",
        planVersion: 2,
        total: 1,
        assigned: 1,
        inProgress: 0,
        submitted: 0,
        completionPercent: 0,
      },
    } satisfies ReportProgramRecord,
  ]);
  const reportService = new ReportService(
    reportRepository,
    reportRepository,
    new SafeReportExporter(),
  );
  const remixService = new RemixService(
    new LocalRemixRepository(),
    new LocalRemixContentGateway(),
    aiProviders?.remix,
    {
      clock: { now: () => new Date(SEEDED_AT) },
      idGenerator: {
        nextId: (() => {
          let sequence = 0;
          return (prefix) => `${prefix}-local-${++sequence}`;
        })(),
      },
    },
  );
  const communicationActorFor = (
    principal: AuthPrincipal,
    organizationId: string,
    eventId: string,
  ): CommunicationActor | null => {
    if (
      principal.kind !== "user" ||
      organizationId !== LOCAL_ORGANIZATION_ID ||
      !principal.memberships.some(
        (membership) => membership.organizationId === organizationId && membership.role === "owner",
      )
    ) {
      return null;
    }
    return {
      tenantId: organizationId,
      userId: principal.userId,
      kind: "human",
      grants: [{ eventId, role: "organizer" }],
    };
  };
  const reportActorFor = (
    principal: AuthPrincipal,
    organizationId: string,
    eventId: string,
  ): ReportActor | null => {
    const communicationActor = communicationActorFor(principal, organizationId, eventId);
    return communicationActor === null
      ? null
      : {
          tenantId: organizationId,
          userId: communicationActor.userId,
          kind: "human",
          grants: [{ eventId, role: "organizer", canViewPersonalData: false }],
        };
  };
  const remixActorFor = (
    principal: AuthPrincipal,
    organizationId: string,
    eventId: string,
  ): RemixActor | null => {
    const communicationActor = communicationActorFor(principal, organizationId, eventId);
    return communicationActor === null
      ? null
      : {
          tenantId: organizationId,
          userId: communicationActor.userId,
          kind: "human",
          grants: [{ eventId, role: "organizer" }],
        };
  };
  let memberSequence = 0;
  const memberIdentity = new InMemoryMemberIdentityRepository(LOCAL_MEMBER_SEED);
  const memberService = new MemberService(
    {
      identity: memberIdentity,
      organizations: memberIdentity,
      auth: new InMemoryMemberAuthBoundary({
        baseUrl: "http://127.0.0.1:3015/member-setup",
        clock: () => new Date(SEEDED_AT),
        generateToken: () => `local-member-token-${++memberSequence}`,
      }),
      invitationDelivery: new InMemoryMemberInvitationDelivery(),
      reviewerPools: new InMemoryReviewerPoolRepository(LOCAL_MEMBER_SEED),
    },
    {
      clock: () => new Date(SEEDED_AT),
      generateId: () => `local-member-${++memberSequence}`,
    },
  );
  let crmSequence = 0;
  const crmService = new CrmService(
    { repository: new InMemoryCrmRepository() },
    {
      clock: () => new Date(SEEDED_AT),
      generateId: (prefix) => `${prefix}-local-${++crmSequence}`,
    },
  );
  const evaluationRepository = new InMemoryEvaluationRepository();
  const localEvaluationPlan: EvaluationPlan = {
    id: "local-evaluation-plan",
    tenantId: LOCAL_ORGANIZATION_ID,
    eventId: "demo-event",
    name: "Program review",
    status: "open",
    blindReview: true,
    closesAt: "2026-09-10T19:00:00.000Z",
    assignmentRule: {
      reviewsPerSubmission: 2,
      maxAssignmentsPerReviewer: 6,
    },
    rounds: [
      {
        id: "local-review-round",
        name: "Committee review",
        sequence: 1,
        opensAt: "2026-08-08T12:00:00.000Z",
        closesAt: "2026-09-10T19:00:00.000Z",
        blindReview: true,
        anonymization: "double",
        reviewerPool: {
          name: "Program committee",
          reviewerIds: [LOCAL_REVIEWER_ACCOUNT_ID],
        },
        rubric: {
          id: "local-program-rubric",
          name: "Program rubric",
          criteria: [
            {
              id: "quality",
              label: "Overall quality",
              description: "How strong and useful is this proposal for the event audience?",
              minimum: 1,
              maximum: 5,
              weight: 2,
              required: true,
              inputType: "numeric",
            },
            {
              id: "recommendation",
              label: "Recommendation",
              description: "Would you recommend this proposal for the program?",
              minimum: 0,
              maximum: 0,
              weight: 0,
              required: true,
              inputType: "dropdown",
              options: [
                { label: "Accept", value: "accept" },
                { label: "Maybe", value: "maybe" },
                { label: "Reject", value: "reject" },
              ],
            },
          ],
        },
      },
    ],
    reviewerProjection: {
      fieldIds: ["format", "level"],
      fileIds: [],
    },
    gradingLockedAt: SEEDED_AT,
    version: 2,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  };
  void evaluationRepository.putPlan(localEvaluationPlan, null);
  void evaluationRepository.putAssignmentsForTesting([
    {
      id: "local-review-assignment",
      tenantId: LOCAL_ORGANIZATION_ID,
      eventId: "demo-event",
      planId: localEvaluationPlan.id,
      roundId: "local-review-round",
      submissionId: "local-submission",
      reviewerId: LOCAL_REVIEWER_ACCOUNT_ID,
      status: "assigned",
      planVersion: localEvaluationPlan.version,
      rubricRevision: 1,
      submissionRevision: 1,
      version: 1,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    },
  ]);
  const evaluationSubmissions = new InMemorySubmissionReviewSource([
    {
      id: "local-submission",
      tenantId: LOCAL_ORGANIZATION_ID,
      eventId: "demo-event",
      title: "Designing reliable community systems",
      abstract: "A practical session about building systems that communities can trust.",
      answers: { format: "Talk", level: "All levels" },
      identityFieldIds: ["speakerEmail"],
      participants: [
        {
          id: "local-participant",
          displayName: "Alex Rivera",
          email: "speaker@local.test",
          biography: "Alex builds dependable, accessible systems for communities.",
        },
      ],
    },
  ]);
  const evaluationService = new EvaluationService(evaluationRepository, evaluationSubmissions, {
    clock: () => new Date(SEEDED_AT),
    ...(aiProviders?.evaluations === undefined
      ? {}
      : { aiSuggestionProvider: aiProviders.evaluations }),
  });
  const agendaEngine = localAgendaEngine(aiProviders?.agenda);
  const publishedSpeakers = {
    async getPublishedSpeakers(eventSlug: string): Promise<PublishedSpeakerProjection | null> {
      const event = LOCAL_EVENTS.find((candidate) => candidate.slug === eventSlug);
      if (event === undefined) return null;
      const revision = await agendaEngine.getPublishedAgenda(event.id);
      if (revision === null) return null;
      return {
        event: {
          slug: event.slug,
          name: event.name,
          timeZone: event.timeZone,
          startsOn: event.startsAt.slice(0, 10),
          endsOn: event.endsAt.slice(0, 10),
          venueName: event.venue ?? null,
        },
        revision: {
          id: revision.id,
          number: revision.revisionNumber,
          publishedAt: revision.publishedAt,
        },
        speakers: [
          {
            id: "local-public-speaker-alex",
            displayName: "Alex Rivera",
            pronouns: null,
            jobTitle: "Program systems lead",
            organization: "Open Sessionboard",
            biography: "Alex builds dependable, accessible systems for communities.",
            photoUrl: null,
            sessionIds: ["local-session-keynote"],
            sessionTitles: ["Opening keynote: Systems that earn trust"],
            trackNames: ["Main stage"],
          },
        ],
      };
    },
  } satisfies PublishedSpeakerRouteDependencies;
  const organizerOverview = new LocalOrganizerOverviewRepository({
    publicRepository,
    speakerRepository,
  });
  const webhookIds = { whs: 0, whd: 0 };
  const integrationRepository = new LocalIntegrationAdminRepository(publicRepository);
  const webhookRepository = new InMemoryWebhookRepository(
    [
      {
        id: "local-webhook-demo",
        organizationId: LOCAL_ORGANIZATION_ID,
        eventId: "demo-event",
        endpointUrl: "https://hooks.local.open-sessionboard.test/demo",
        events: ["agenda.published", "integration.publication_completed"],
        active: true,
        signingSecret: "local-demo-webhook-secret-20260808-000000",
        signingSecretLastFour: "0000",
        createdAt: new Date(SEEDED_AT),
        updatedAt: new Date(SEEDED_AT),
      },
      {
        id: "local-webhook-conference",
        organizationId: LOCAL_ORGANIZATION_ID,
        eventId: "open-sessionboard-conf",
        endpointUrl: "https://hooks.local.open-sessionboard.test/conference",
        events: ["submission.created", "participant.updated"],
        active: true,
        signingSecret: "local-conference-webhook-secret-20260808",
        signingSecretLastFour: "0808",
        createdAt: new Date(SEEDED_AT),
        updatedAt: new Date(SEEDED_AT),
      },
    ],
    {
      clock: { now: () => new Date(SEEDED_AT) },
      idFactory: (prefix) => `${prefix}_LOCAL_${String(++webhookIds[prefix]).padStart(4, "0")}`,
    },
  );

  return {
    authenticator,
    auth: localAuthRoutes(),
    organizerOverview,
    events: { service: eventService },
    sessions: { service: sessionService },
    communications: {
      service: communicationService,
      actorFor: communicationActorFor,
    },
    reports: {
      service: reportService,
      actorFor: reportActorFor,
    },
    remix: {
      service: remixService,
      actorFor: remixActorFor,
    },
    members: { service: memberService },
    crm: { service: crmService },
    speaker: {
      service: speakerService,
      async authenticate(request) {
        const hasCredential =
          request.headers.has("authorization") ||
          request.headers
            .get("cookie")
            ?.split(";")
            .some((part) => part.trim().startsWith("better-auth.session_token=")) === true;
        const principal = await authenticator.authenticate(request).catch(() => null);
        if (principal?.kind === "user") return { accountId: principal.userId };
        return hasCredential ? null : { accountId: LOCAL_SPEAKER_ACCOUNT_ID };
      },
    },
    agenda: {
      engine: agendaEngine,
      async organizationIdForEvent(eventId) {
        return eventId.trim().length === 0 ? null : LOCAL_ORGANIZATION_ID;
      },
    },
    publishedSpeakers,
    evaluations: {
      service: evaluationService,
      async actorFor(principal: AuthPrincipal, request: Request): Promise<EvaluationActor | null> {
        if (principal.kind !== "user") return null;
        const membership = principal.memberships.find(
          ({ organizationId }) => organizationId === LOCAL_ORGANIZATION_ID,
        );
        if (membership === undefined) return null;
        const body = await request
          .clone()
          .json<Record<string, unknown>>()
          .catch(() => undefined);
        const eventId =
          typeof body?.eventId === "string" && body.eventId.trim().length > 0
            ? body.eventId
            : eventIdFrom(request);
        return {
          tenantId: LOCAL_ORGANIZATION_ID,
          userId: principal.userId,
          kind: "human",
          grants:
            membership.role === "reviewer"
              ? [{ eventId, role: "reviewer" }]
              : [{ eventId, role: "organizer" }],
        };
      },
    },
    publicApi: {
      resources: [],
    },
    integrations: {
      getEvent: integrationRepository.getEvent.bind(integrationRepository),
      getDeliveryStatus: integrationRepository.getDeliveryStatus.bind(integrationRepository),
      saveCredential: integrationRepository.saveCredential.bind(integrationRepository),
      listApiKeys: integrationRepository.listApiKeys.bind(integrationRepository),
      createApiKey: integrationRepository.createApiKey.bind(integrationRepository),
      revokeApiKey: integrationRepository.revokeApiKey.bind(integrationRepository),
      webhooks: webhookRepository,
      getWebhookLastDelivery:
        integrationRepository.getWebhookLastDelivery.bind(integrationRepository),
      retryCalendarDelivery:
        integrationRepository.retryCalendarDelivery.bind(integrationRepository),
    } satisfies IntegrationAdminRouteDependencies,
    webhooks: webhookRepository,
    cfp: { service: createLocalCfpService() },
  } as ApiDependencies & {
    cfp: { service: ReturnType<typeof createLocalCfpService> };
  };
}
