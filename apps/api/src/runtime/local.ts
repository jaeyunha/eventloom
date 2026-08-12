import type { ApiScope } from "@open-sessionboard/contracts";
import type { ApiDependencies } from "../app";
import { EventService, InMemoryEventRepository } from "../features/events/service";
import type { Event, EventAuditEntry, EventEmbedConfiguration } from "../features/events/types";
import {
  InMemoryMemberAuthBoundary,
  InMemoryMemberIdentityRepository,
  InMemoryMemberInvitationDelivery,
  InMemoryReviewerPoolRepository,
  MemberService,
} from "../features/members/service";
import type { MemberMembership, MemberUser, ReviewerPool } from "../features/members/types";
import { CrmService, InMemoryCrmRepository } from "../features/crm/service";
import { AgendaEngine } from "../features/agenda/engine";
import {
  InMemoryAgendaMutationLock,
  InMemoryAgendaRepository,
} from "../features/agenda/infrastructure";
import type { AgendaEntryInput } from "../features/agenda/types";
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
import type {
  EvaluationActor,
  EvaluationAssignment,
  EvaluationPlan,
} from "../features/evaluations/types";
import type {
  PublicApiCreateInput,
  PublicApiGetInput,
  PublicApiListInput,
  PublicApiListResult,
  PublicApiRepository,
  PublicApiUpdateInput,
} from "../features/public-api/routes";
import { SpeakerService } from "../features/speaker/service";
import type {
  CreatePrivateUploadGrantCommand,
  PrivateAssetGateway,
  PrivateDownloadGrant,
  PrivateUploadGrant,
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
  PrivateAssetCapabilityBinding,
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
import { createLocalCfpService } from "./cfp";
import {
  InMemoryCommunicationRepository,
  CommunicationService,
} from "../features/communications/service";
import type {
  CommunicationRecipient,
  CommunicationTemplate,
} from "../features/communications/types";
import { InMemoryReportRepository, ReportService } from "../features/reports/service";
import type { ReportDefinition, ReportProgramRecord } from "../features/reports/types";
import { RemixService } from "../features/remix/service";
import type {
  ContentRemixCandidate,
  RemixAuditEntry,
  RemixContentGateway,
  RemixRepository,
  RemixSessionRecord,
  RemixSpeakerRecord,
} from "../features/remix/types";
import { InMemorySessionRepository, SessionService } from "../features/sessions/service";
import type {
  Format,
  Level,
  Room,
  Session,
  SessionAuditEntry,
  SessionSettings,
  Tag,
  Track,
} from "../features/sessions/types";
import type { PublishedSpeakerProjection } from "../routes/public-speakers";

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
    createdBy: LOCAL_SPEAKER_ACCOUNT_ID,
    updatedBy: LOCAL_SPEAKER_ACCOUNT_ID,
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
    createdBy: LOCAL_SPEAKER_ACCOUNT_ID,
    updatedBy: LOCAL_SPEAKER_ACCOUNT_ID,
  },
];

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

const LOCAL_EVENT_START = "2026-09-18T16:00:00.000Z";
const LOCAL_EVENT_END = "2026-09-18T23:00:00.000Z";
const LOCAL_EVENT_TIME_ZONE = "America/Los_Angeles";
const LOCAL_EVENT_VENUE = "Open Sessionboard Hall";

const LOCAL_PUBLIC_EMBED: EventEmbedConfiguration = {
  id: "public-schedule",
  name: "Public schedule",
  widgetId: "agenda",
  enabled: true,
  theme: "light",
  outputFormat: "styled-html",
  layout: "comfortable",
  accent: "#4f5ee8",
  backgroundColor: "#ffffff",
  textColor: "#20232b",
  customCss: "",
  displayFields: ["title", "date-time", "room", "speakers", "track", "summary"],
  trackIds: ["local-track-main", "local-track-practice"],
  statuses: ["Accepted"],
};

export const LOCAL_ORGANIZER_ACCOUNT_ID = "local-organizer";
export const LOCAL_REVIEWER_ACCOUNT_ID = "local-reviewer";
export const LOCAL_ORGANIZER_EMAIL = "organizer@local.open-sessionboard.test";
export const LOCAL_REVIEWER_EMAIL = "reviewer@local.open-sessionboard.test";
export const LOCAL_SPEAKER_EMAIL = "speaker@local.open-sessionboard.test";
export const LOCAL_ORGANIZER_PASSWORD = "organizer-local";
export const LOCAL_REVIEWER_PASSWORD = "reviewer-local";
export const LOCAL_SPEAKER_PASSWORD = "speaker-local";

export const LOCAL_ORGANIZER_SESSION_TOKEN = LOCAL_SESSION_TOKEN;
export const LOCAL_REVIEWER_SESSION_TOKEN = "local-reviewer-session";
export const LOCAL_SPEAKER_SESSION_TOKEN = "local-speaker-session";

type LocalPersona = {
  readonly key: "organizer" | "reviewer" | "speaker";
  readonly sessionToken: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  readonly password: string;
  readonly memberships: readonly { organizationId: string; role: "owner" | "reviewer" }[];
  readonly speakerGrants: readonly { organizationId: string; speakerProfileId: string }[];
};

const LOCAL_PERSONAS: readonly LocalPersona[] = [
  {
    key: "organizer",
    sessionToken: LOCAL_ORGANIZER_SESSION_TOKEN,
    sessionId: "local-organizer-session-id",
    userId: LOCAL_ORGANIZER_ACCOUNT_ID,
    email: LOCAL_ORGANIZER_EMAIL,
    name: "Local Organizer",
    password: LOCAL_ORGANIZER_PASSWORD,
    memberships: [{ organizationId: LOCAL_ORGANIZATION_ID, role: "owner" }],
    speakerGrants: [],
  },
  {
    key: "reviewer",
    sessionToken: LOCAL_REVIEWER_SESSION_TOKEN,
    sessionId: "local-reviewer-session-id",
    userId: LOCAL_REVIEWER_ACCOUNT_ID,
    email: LOCAL_REVIEWER_EMAIL,
    name: "Local Reviewer",
    password: LOCAL_REVIEWER_PASSWORD,
    memberships: [{ organizationId: LOCAL_ORGANIZATION_ID, role: "reviewer" }],
    speakerGrants: [],
  },
  {
    key: "speaker",
    sessionToken: LOCAL_SPEAKER_SESSION_TOKEN,
    sessionId: "local-speaker-session-id",
    userId: LOCAL_SPEAKER_ACCOUNT_ID,
    email: LOCAL_SPEAKER_EMAIL,
    name: "Alex Rivera",
    password: LOCAL_SPEAKER_PASSWORD,
    memberships: [],
    speakerGrants: [
      { organizationId: LOCAL_ORGANIZATION_ID, speakerProfileId: "local-participant" },
    ],
  },
];

function localPersonaForToken(token: string): LocalPersona | null {
  return LOCAL_PERSONAS.find((persona) => persona.sessionToken === token) ?? null;
}

function localPersonaForCredentials(email: string, password: string): LocalPersona | null {
  return (
    LOCAL_PERSONAS.find(
      (persona) => persona.email === email.trim().toLowerCase() && persona.password === password,
    ) ?? null
  );
}

function localCookieToken(request: Request): string | null {
  const prefix = `${LOCAL_SESSION_COOKIE}=`;
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
  return value === undefined || value.length === 0 ? null : value;
}
function clone<T>(value: T): T {
  return structuredClone(value);
}

function localAuthenticator(): RequestAuthenticator {
  const sessions: BetterAuthGateway = {
    async resolveSession(token) {
      const persona = localPersonaForToken(token);
      if (persona === null) return null;
      return {
        sessionId: persona.sessionId,
        userId: persona.userId,
        email: persona.email,
        emailVerified: true,
        expiresAt: FAR_FUTURE,
        memberships: persona.memberships,
        speakerGrants: persona.speakerGrants,
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

function localSessionPayload(persona: LocalPersona = LOCAL_PERSONAS[0]!): Record<string, unknown> {
  return {
    session: {
      id: persona.sessionId,
      userId: persona.userId,
      expiresAt: FAR_FUTURE.toISOString(),
    },
    user: {
      id: persona.userId,
      email: persona.email,
      name: persona.name,
      emailVerified: true,
    },
    memberships: persona.memberships,
    speakerGrants: persona.speakerGrants,
  };
}

function localAuthCookieHeader(sessionToken: string): string {
  return `${LOCAL_SESSION_COOKIE}=${sessionToken}; Path=/; HttpOnly; SameSite=Lax`;
}

function localPersonaForRequest(request: Request): LocalPersona | null {
  const token = localCookieToken(request);
  return token === null ? null : localPersonaForToken(token);
}
function localAuthJson(payload: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(payload), { ...init, headers });
}

/**
 * Email/password sign-in for local development only. Local mode has no
 * better-auth instance or user database; deterministic fixture credentials issue
 * one of the organizer, reviewer, or speaker sessions.
 */
function localAuthRoutes(): { handler: (request: Request) => Promise<Response> } {
  return {
    async handler(request) {
      const path = new URL(request.url).pathname;
      if (
        (path === "/api/auth/sign-in/email" || path === "/api/auth/sign-up/email") &&
        request.method === "POST"
      ) {
        const body: { email?: unknown; password?: unknown } = await request
          .clone()
          .json<{ email?: unknown; password?: unknown }>()
          .catch(() => ({}));
        const persona =
          typeof body.email === "string" && typeof body.password === "string"
            ? localPersonaForCredentials(body.email, body.password)
            : null;
        if (persona === null) {
          return localAuthJson({ error: { code: "INVALID_EMAIL_OR_PASSWORD" } }, { status: 401 });
        }
        return localAuthJson(
          { token: persona.sessionToken, ...localSessionPayload(persona) },
          { headers: { "set-cookie": localAuthCookieHeader(persona.sessionToken) } },
        );
      }
      if (path === "/api/auth/sign-in/magic-link" && request.method === "POST") {
        return localAuthJson({ status: true });
      }
      if (path === "/api/auth/get-session" && request.method === "GET") {
        const persona = localPersonaForRequest(request);
        if (persona === null) return localAuthJson(null, { status: 401 });
        return localAuthJson(localSessionPayload(persona));
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
    if (eventId !== "demo-event") return;
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
        subject: {
          type: "session",
          participantId: "local-participant",
          submissionId: "local-submission",
        },
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
        subject: {
          type: "session",
          participantId: "local-participant",
          submissionId: "local-submission",
        },
        type: "upload",
        owner: "speaker",
        title: "Upload presentation slides",
        description: "Upload the final PDF or presentation file for the event team.",
        status: "submitted",
        dueAt: "2026-09-10T23:59:00.000Z",
        dependencyIds: ["local-biography-task"],
        reminderOffsetsMinutes: [10_080, 1_440],
        acceptedAssetKinds: ["slides"],
        version: 1,
        updatedAt: SEEDED_AT,
      },
    ]);
    this.#assets.set(eventId, [
      {
        id: "local-slides-asset",
        tenantId: LOCAL_ORGANIZATION_ID,
        eventId,
        submissionId: "local-submission",
        participantId: "local-participant",
        participantName: "Alex Rivera",
        sessionTitle: "Designing reliable community systems",
        taskId: "local-slides-task",
        kind: "slides",
        objectKey: `private/${LOCAL_ORGANIZATION_ID}/${eventId}/local-slides-asset.pdf`,
        fileName: "reliable-community-systems.pdf",
        contentType: "application/pdf",
        sizeBytes: 182_000,
        state: "ready",
        createdAt: SEEDED_AT,
        version: 1,
        versionFamilyId: "local-slides",
        finalizedAt: SEEDED_AT,
        reviewState: "approved",
        reviewedAt: SEEDED_AT,
        reviewedBy: LOCAL_SPEAKER_ACCOUNT_ID,
        reviewVersion: 1,
        commentThreadId: "local-slides-comments",
      },
    ]);
  }
  listStoredSubmissions(eventId: string): SpeakerSubmission[] {
    return clone(this.#submissions.get(eventId) ?? []);
  }

  listStoredTasks(eventId: string): SpeakerTask[] {
    return clone(this.#tasks.get(eventId) ?? []);
  }

  async getAccessScope(eventId: string, accountId: string): Promise<SpeakerAccessScope> {
    this.#seed(eventId);
    if (
      eventId !== "demo-event" ||
      (accountId !== LOCAL_SPEAKER_ACCOUNT_ID && accountId !== LOCAL_ORGANIZER_ACCOUNT_ID)
    ) {
      return { submissionIds: [], participantIds: [] };
    }
    const organizer = accountId === LOCAL_ORGANIZER_ACCOUNT_ID;
    return {
      tenantId: LOCAL_ORGANIZATION_ID,
      role: organizer ? "owner" : "speaker",
      organizer,
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
    if (accountId !== LOCAL_SPEAKER_ACCOUNT_ID) return null;
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

type LocalPrivateAssetRecord = {
  readonly binding: PrivateAssetCapabilityBinding;
  readonly kind: "upload" | "download";
  readonly token: string;
  state: "pending" | "uploaded" | "consumed";
};

type LocalPrivateAssetObject = {
  readonly contentType: string;
  readonly bytes: Uint8Array;
};

class LocalPrivateAssetGateway implements PrivateAssetGateway {
  readonly #capabilities = new Map<string, LocalPrivateAssetRecord>();
  readonly #objects = new Map<string, LocalPrivateAssetObject>();
  #sequence = 0;

  async createUploadGrant(_command: CreatePrivateUploadGrantCommand): Promise<PrivateUploadGrant> {
    throw new Error("A fully bound local upload capability is required.");
  }

  async createDownloadGrant(_command: {
    objectKey: string;
    fileName: string;
    expiresAt: string;
  }): Promise<PrivateDownloadGrant> {
    throw new Error("A fully bound local download capability is required.");
  }

  async registerUploadCapability(binding: PrivateAssetCapabilityBinding) {
    const token = await this.token("upload", binding);
    this.#capabilities.set(binding.capabilityId, {
      binding: { ...binding },
      kind: "upload",
      token,
      state: "pending",
    });
    return {
      method: "PUT" as const,
      url: `/api/speaker/assets/capabilities/upload/${encodeURIComponent(binding.capabilityId)}/${token}`,
      headers: {
        "content-type": binding.contentType,
        "content-length": String(binding.sizeBytes),
      },
      expiresAt: binding.expiresAt,
    };
  }

  async registerDownloadCapability(binding: PrivateAssetCapabilityBinding) {
    const object = this.#objects.get(binding.objectKey);
    if (
      object === undefined ||
      object.bytes.byteLength !== binding.sizeBytes ||
      object.contentType.trim().toLowerCase() !== binding.contentType.trim().toLowerCase()
    ) {
      throw new Error("The requested private asset is not available.");
    }
    const token = await this.token("download", binding);
    this.#capabilities.set(binding.capabilityId, {
      binding: { ...binding },
      kind: "download",
      token,
      state: "uploaded",
    });
    return {
      method: "GET" as const,
      url: `/api/speaker/assets/capabilities/download/${encodeURIComponent(binding.capabilityId)}/${token}`,
      expiresAt: binding.expiresAt,
    };
  }

  async consumeUploadCapability(capabilityId: string, token: string, request: Request) {
    const capability = this.#capabilities.get(capabilityId);
    if (
      capability === undefined ||
      capability.kind !== "upload" ||
      capability.state !== "pending" ||
      capability.token !== token ||
      this.expired(capability.binding.expiresAt)
    ) {
      throw new Error("The upload capability is invalid or has expired.");
    }
    if (request.method !== "PUT") throw new Error("The upload capability requires PUT.");

    const contentType = request.headers.get("content-type")?.trim().toLowerCase() ?? "";
    const declaredLength = request.headers.get("content-length");
    if (
      contentType !== capability.binding.contentType.trim().toLowerCase() ||
      (declaredLength !== null &&
        (!/^\d+$/u.test(declaredLength) || Number(declaredLength) !== capability.binding.sizeBytes))
    ) {
      throw new Error("The uploaded object metadata is not allowed.");
    }
    const body = new Uint8Array(await request.arrayBuffer());
    if (body.byteLength !== capability.binding.sizeBytes) {
      throw new Error("The uploaded object size does not match the capability.");
    }

    capability.state = "uploaded";
    this.#objects.set(capability.binding.objectKey, {
      contentType: capability.binding.contentType,
      bytes: body.slice(),
    });
    return {
      contentType: capability.binding.contentType,
      sizeBytes: capability.binding.sizeBytes,
      uploadedAt: new Date(SEEDED_AT).toISOString(),
    };
  }

  async consumeDownloadCapability(capabilityId: string, token: string) {
    const capability = this.#capabilities.get(capabilityId);
    if (
      capability === undefined ||
      capability.kind !== "download" ||
      capability.state !== "uploaded" ||
      capability.token !== token ||
      this.expired(capability.binding.expiresAt)
    ) {
      throw new Error("The download capability is invalid or has expired.");
    }
    const object = this.#objects.get(capability.binding.objectKey);
    if (
      object === undefined ||
      object.bytes.byteLength !== capability.binding.sizeBytes ||
      object.contentType.trim().toLowerCase() !==
        capability.binding.contentType.trim().toLowerCase()
    ) {
      throw new Error("The requested private asset is not available.");
    }

    capability.state = "consumed";
    return {
      body: this.body(object.bytes),
      contentType: object.contentType,
      sizeBytes: object.bytes.byteLength,
      fileName: capability.binding.fileName,
    };
  }

  async inspectObject(
    command: Pick<PrivateAssetCapabilityBinding, "objectKey" | "contentType" | "sizeBytes">,
  ) {
    const object = this.#objects.get(command.objectKey);
    if (
      object === undefined ||
      object.bytes.byteLength !== command.sizeBytes ||
      object.contentType.trim().toLowerCase() !== command.contentType.trim().toLowerCase()
    ) {
      return null;
    }
    return {
      contentType: object.contentType,
      sizeBytes: object.bytes.byteLength,
    };
  }

  async readObject(binding: PrivateAssetCapabilityBinding) {
    const object = this.#objects.get(binding.objectKey);
    if (
      object === undefined ||
      object.bytes.byteLength !== binding.sizeBytes ||
      object.contentType.trim().toLowerCase() !== binding.contentType.trim().toLowerCase()
    ) {
      return null;
    }
    return {
      body: this.body(object.bytes),
      contentType: object.contentType,
      sizeBytes: object.bytes.byteLength,
      fileName: binding.fileName,
    };
  }

  private expired(expiresAt: string): boolean {
    const timestamp = Date.parse(expiresAt);
    return !Number.isFinite(timestamp) || timestamp <= Date.parse(SEEDED_AT);
  }

  private body(bytes: Uint8Array): ReadableStream<Uint8Array> {
    const copy = bytes.slice();
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(copy);
        controller.close();
      },
    });
  }

  private async token(kind: "upload" | "download", binding: PrivateAssetCapabilityBinding) {
    const sequence = ++this.#sequence;
    const payload = JSON.stringify([
      "local-private-asset-capability-v1",
      kind,
      sequence,
      binding.capabilityId,
      binding.tenantId,
      binding.eventId,
      binding.submissionId,
      binding.participantId,
      binding.taskId ?? "",
      binding.objectKey,
      binding.contentType,
      binding.sizeBytes,
      binding.fileName,
      binding.expiresAt,
    ]);
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload)),
    );
    return `local-capability-${[...digest]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")}`;
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
            title: "Designing reliable community systems",
            status: "accepted",
            participantIds: ["local-participant"],
            resourceIds: [],
            capacityRequired: 120,
          },
          {
            id: "local-session-workshop",
            title: "A practical guide to resilient programs",
            status: "accepted",
            participantIds: ["local-participant"],
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
        startsAt: "2026-09-17T16:00:00.000Z",
        endsAt: "2026-09-18T23:00:00.000Z",
        publishedAgendaRevisionId: "agenda-local-revision-1",
        status: "active",
        updatedAt: SEEDED_AT,
      },
      {
        id: "demo-event",
        version: 1,
        organizationId: LOCAL_ORGANIZATION_ID,
        name: "Open Sessionboard Demo",
        slug: "demo-event",
        timeZone: LOCAL_EVENT_TIME_ZONE,
        startsAt: LOCAL_EVENT_START,
        endsAt: LOCAL_EVENT_END,
        venue: LOCAL_EVENT_VENUE,
        publishedAgendaRevisionId: "agenda-local-revision-2",
        status: "active",
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
      {
        id: "demo-event",
        version: 1,
        organizationId: LOCAL_ORGANIZATION_ID,
        revision: 2,
        publishedAt: SEEDED_AT,
        sessionIds: ["local-session-keynote", "local-session-workshop"],
      },
    ]);
    this.#seed("sessions", [
      {
        id: "local-session-keynote",
        version: 1,
        organizationId: LOCAL_ORGANIZATION_ID,
        eventId: "demo-event",
        title: "Designing reliable community systems",
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
function localEventSeed(
  id: string,
  name: string,
  slug: string,
  embedConfigurations: readonly EventEmbedConfiguration[] = [],
): Event {
  return {
    id,
    organizationId: LOCAL_ORGANIZATION_ID,
    slug,
    name,
    status: "active",
    timeZone: LOCAL_EVENT_TIME_ZONE,
    startsAt: id === "demo-event" ? LOCAL_EVENT_START : "2026-09-17T16:00:00.000Z",
    endsAt: id === "demo-event" ? LOCAL_EVENT_END : "2026-09-18T23:00:00.000Z",
    venue: id === "demo-event" ? LOCAL_EVENT_VENUE : "Open Sessionboard Hall",
    cfpSettings: {
      enabled: true,
      opensAt: "2026-08-01T07:00:00.000Z",
      closesAt: "2026-09-15T07:00:00.000Z",
    },
    defaultCalendarSettings: {
      durationMinutes: 60,
      timeZone: LOCAL_EVENT_TIME_ZONE,
      location: id === "demo-event" ? LOCAL_EVENT_VENUE : "Open Sessionboard Hall",
    },
    embedConfigurations: embedConfigurations.map(clone),
    version: 1,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
    createdBy: LOCAL_ORGANIZER_ACCOUNT_ID,
    updatedBy: LOCAL_ORGANIZER_ACCOUNT_ID,
  };
}

function localSessionSeed(): {
  readonly sessions: readonly Session[];
  readonly rooms: readonly Room[];
  readonly tracks: readonly Track[];
  readonly formats: readonly Format[];
  readonly levels: readonly Level[];
  readonly tags: readonly Tag[];
  readonly settings: readonly SessionSettings[];
  readonly audit: readonly SessionAuditEntry[];
  readonly speakerIds: Readonly<Record<string, readonly string[]>>;
} {
  const history = [
    {
      id: "local-session-keynote:v1",
      action: "created" as const,
      version: 1,
      actorId: LOCAL_ORGANIZER_ACCOUNT_ID,
      occurredAt: SEEDED_AT,
      title: "Designing reliable community systems",
      description: "A practical session about building systems communities can trust.",
      contentStatus: "Approved" as const,
      newStatus: "Accepted",
      newContentStatus: "Approved" as const,
    },
  ];
  const sessions: Session[] = [
    {
      id: "local-session-keynote",
      tenantId: LOCAL_ORGANIZATION_ID,
      eventId: "demo-event",
      title: "Designing reliable community systems",
      description: "A practical session about building systems communities can trust.",
      status: "Accepted",
      contentStatus: "Approved",
      durationMinutes: 60,
      capacityRequired: 120,
      roomId: "local-room-main",
      trackId: "local-track-main",
      trackIds: ["local-track-main"],
      formatId: "local-format-talk",
      levelId: "local-level-all",
      tagIds: ["local-tag-reliable"],
      speakerIds: ["local-participant"],
      speakerRoster: [{ id: "local-participant", displayName: "Alex Rivera", role: "speaker" }],
      resourceIds: [],
      version: 1,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
      createdBy: LOCAL_ORGANIZER_ACCOUNT_ID,
      updatedBy: LOCAL_ORGANIZER_ACCOUNT_ID,
      history,
    },
    {
      id: "local-session-workshop",
      tenantId: LOCAL_ORGANIZATION_ID,
      eventId: "demo-event",
      title: "A practical guide to resilient programs",
      description: "A workshop for turning program intent into reliable operations.",
      status: "Accepted",
      contentStatus: "Approved",
      durationMinutes: 60,
      capacityRequired: 36,
      roomId: "local-room-studio",
      trackId: "local-track-practice",
      trackIds: ["local-track-practice"],
      formatId: "local-format-workshop",
      levelId: "local-level-all",
      tagIds: ["local-tag-practice"],
      speakerIds: ["local-participant"],
      speakerRoster: [{ id: "local-participant", displayName: "Alex Rivera", role: "speaker" }],
      resourceIds: [],
      version: 1,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
      createdBy: LOCAL_ORGANIZER_ACCOUNT_ID,
      updatedBy: LOCAL_ORGANIZER_ACCOUNT_ID,
      history,
    },
  ];
  const rooms: Room[] = [
    {
      id: "local-room-main",
      tenantId: LOCAL_ORGANIZATION_ID,
      eventId: "demo-event",
      name: "Main Hall",
      capacity: 200,
      resources: [],
      resourceIds: [],
      version: 1,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
      createdBy: LOCAL_ORGANIZER_ACCOUNT_ID,
      updatedBy: LOCAL_ORGANIZER_ACCOUNT_ID,
      history: [],
    },
    {
      id: "local-room-studio",
      tenantId: LOCAL_ORGANIZATION_ID,
      eventId: "demo-event",
      name: "Workshop Studio",
      capacity: 48,
      resources: [],
      resourceIds: [],
      version: 1,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
      createdBy: LOCAL_ORGANIZER_ACCOUNT_ID,
      updatedBy: LOCAL_ORGANIZER_ACCOUNT_ID,
      history: [],
    },
  ];
  const tracks: Track[] = [
    {
      id: "local-track-main",
      tenantId: LOCAL_ORGANIZATION_ID,
      eventId: "demo-event",
      name: "Main stage",
      description: "Featured program sessions.",
      version: 1,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
      createdBy: LOCAL_ORGANIZER_ACCOUNT_ID,
      updatedBy: LOCAL_ORGANIZER_ACCOUNT_ID,
      history: [],
    },
    {
      id: "local-track-practice",
      tenantId: LOCAL_ORGANIZATION_ID,
      eventId: "demo-event",
      name: "Practice",
      description: "Hands-on program sessions.",
      version: 1,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
      createdBy: LOCAL_ORGANIZER_ACCOUNT_ID,
      updatedBy: LOCAL_ORGANIZER_ACCOUNT_ID,
      history: [],
    },
  ];
  const format = (id: string, name: string): Format => ({
    id,
    tenantId: LOCAL_ORGANIZATION_ID,
    eventId: "demo-event",
    name,
    description: "",
    version: 1,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
    createdBy: LOCAL_ORGANIZER_ACCOUNT_ID,
    updatedBy: LOCAL_ORGANIZER_ACCOUNT_ID,
    history: [],
  });
  const level: Level = {
    ...format("local-level-all", "All levels"),
    id: "local-level-all",
  };
  const tags: Tag[] = [
    { ...format("local-tag-reliable", "Reliable systems"), id: "local-tag-reliable" },
    { ...format("local-tag-practice", "Practice"), id: "local-tag-practice" },
  ];
  const settings: SessionSettings = {
    id: "local-session-settings",
    tenantId: LOCAL_ORGANIZATION_ID,
    eventId: "demo-event",
    statuses: ["Draft", "Submitted", "Accepted", "Waitlisted", "Rejected", "Withdrawn"],
    agendaEligibleStatuses: ["Accepted"],
    version: 1,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
    createdBy: LOCAL_ORGANIZER_ACCOUNT_ID,
    updatedBy: LOCAL_ORGANIZER_ACCOUNT_ID,
    history: [
      {
        id: "local-session-settings:v1",
        action: "settings.updated",
        version: 1,
        actorId: LOCAL_ORGANIZER_ACCOUNT_ID,
        occurredAt: SEEDED_AT,
      },
    ],
  };
  const audit: SessionAuditEntry[] = sessions.map((session) => ({
    id: `${session.id}:v1`,
    tenantId: LOCAL_ORGANIZATION_ID,
    eventId: "demo-event",
    entityType: "session",
    entityId: session.id,
    action: "created",
    version: 1,
    actorId: LOCAL_ORGANIZER_ACCOUNT_ID,
    occurredAt: SEEDED_AT,
    after: session,
  }));
  return {
    sessions,
    rooms,
    tracks,
    formats: [format("local-format-talk", "Talk"), format("local-format-workshop", "Workshop")],
    levels: [level],
    tags,
    settings: [settings],
    audit,
    speakerIds: {
      [`${LOCAL_ORGANIZATION_ID}\u0000demo-event`]: ["local-participant"],
    },
  };
}
class LocalRemixRepository implements RemixRepository {
  readonly #candidates = new Map<string, ContentRemixCandidate>();
  readonly #audit = new Map<string, RemixAuditEntry[]>();

  async getCandidateById(tenantId: string, candidateId: string) {
    const candidate = this.#candidates.get(`${tenantId}\u0000${candidateId}`);
    return candidate === undefined ? null : clone(candidate);
  }

  async getCandidate(tenantId: string, eventId: string, candidateId: string) {
    const candidate = await this.getCandidateById(tenantId, candidateId);
    return candidate?.eventId === eventId ? candidate : null;
  }

  async listCandidates(tenantId: string, eventId: string) {
    return clone(
      [...this.#candidates.values()].filter(
        (candidate) => candidate.tenantId === tenantId && candidate.eventId === eventId,
      ),
    );
  }

  async saveCandidate(candidate: ContentRemixCandidate, expectedVersion: number | null) {
    const key = `${candidate.tenantId}\u0000${candidate.id}`;
    const current = this.#candidates.get(key);
    if ((current?.version ?? null) !== expectedVersion) {
      throw new Error("The remix candidate changed.");
    }
    this.#candidates.set(key, clone(candidate));
  }

  async appendAudit(entry: RemixAuditEntry) {
    const key = `${entry.tenantId}\u0000${entry.eventId}`;
    const entries = this.#audit.get(key) ?? [];
    entries.push(clone(entry));
    this.#audit.set(key, entries);
  }

  async listAudit(tenantId: string, eventId: string) {
    return clone(this.#audit.get(`${tenantId}\u0000${eventId}`) ?? []);
  }
}

class LocalRemixContentGateway implements RemixContentGateway {
  constructor(
    private readonly sessions: SessionService,
    private readonly sessionRepository: InMemorySessionRepository,
    private readonly speakers: LocalSpeakerRepository,
  ) {}

  async listSessions(input: {
    tenantId: string;
    eventId: string;
  }): Promise<readonly RemixSessionRecord[]> {
    const sessions = await this.sessionRepository.listSessions(input.tenantId, input.eventId);
    return sessions.map((session) => ({
      kind: "session",
      id: session.id,
      eventId: session.eventId,
      revision: session.version,
      title: session.title,
      description: session.description,
      tags: [...session.tagIds],
      tracks: [...session.trackIds],
    }));
  }

  async listSpeakers(input: {
    tenantId: string;
    eventId: string;
  }): Promise<readonly RemixSpeakerRecord[]> {
    const profiles = await this.speakers.listProfiles(input.eventId, ["local-participant"]);
    return profiles.map((profile) => ({
      kind: "speaker",
      id: profile.participantId,
      eventId: profile.eventId,
      revision: profile.version,
      biography: profile.biography,
    }));
  }

  async getSession(input: {
    tenantId: string;
    eventId: string;
    sourceId: string;
  }): Promise<RemixSessionRecord | null> {
    const session = await this.sessionRepository.getSession(
      input.tenantId,
      input.eventId,
      input.sourceId,
    );
    return session === null
      ? null
      : {
          kind: "session",
          id: session.id,
          eventId: session.eventId,
          revision: session.version,
          title: session.title,
          description: session.description,
          tags: [...session.tagIds],
          tracks: [...session.trackIds],
        };
  }

  async getSpeaker(input: {
    tenantId: string;
    eventId: string;
    sourceId: string;
  }): Promise<RemixSpeakerRecord | null> {
    const profile = await this.speakers.getProfile(input.eventId, input.sourceId);
    return profile === null
      ? null
      : {
          kind: "speaker",
          id: profile.participantId,
          eventId: profile.eventId,
          revision: profile.version,
          biography: profile.biography,
        };
  }

  async applyRevision(input: {
    tenantId: string;
    eventId: string;
    sourceType: "session" | "speaker";
    sourceId: string;
    expectedSourceRevision: number;
    fields: readonly ("title" | "description" | "tags" | "tracks" | "biography")[];
    content:
      | { title: string; description: string; tags: readonly string[]; tracks: readonly string[] }
      | { biography: string };
    candidateId: string;
    actorId: string;
    appliedAt: string;
  }) {
    if (input.sourceType === "session") {
      const content = input.content as {
        title: string;
        description: string;
        tags: readonly string[];
        tracks: readonly string[];
      };
      const current = await this.sessionRepository.getSession(
        input.tenantId,
        input.eventId,
        input.sourceId,
      );
      if (current === null) throw new Error("The session content was not found.");
      const updated = await this.sessions.updateSession(
        {
          tenantId: input.tenantId,
          userId: input.actorId,
          role: "owner",
          kind: "user",
        },
        {
          tenantId: input.tenantId,
          eventId: input.eventId,
          sessionId: input.sourceId,
          expectedVersion: input.expectedSourceRevision,
          title: content.title,
          description: content.description,
          tagIds: [...content.tags],
          trackIds: [...content.tracks],
        },
      );
      return {
        id: `revision:${input.candidateId}`,
        tenantId: input.tenantId,
        eventId: input.eventId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        sourceRevision: updated.version,
        fields: [...input.fields],
        content: clone(content),
        candidateId: input.candidateId,
        appliedBy: input.actorId,
        appliedAt: input.appliedAt,
      };
    }
    const content = input.content as { biography: string };
    const result = await this.speakers.updateBiography({
      eventId: input.eventId,
      participantId: input.sourceId,
      biography: content.biography,
      expectedVersion: input.expectedSourceRevision,
      updatedAt: input.appliedAt,
    });
    if (!result.ok) throw new Error("The speaker content was not found.");
    return {
      id: `revision:${input.candidateId}`,
      tenantId: input.tenantId,
      eventId: input.eventId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      sourceRevision: result.value.version,
      fields: [...input.fields],
      content: clone(content),
      candidateId: input.candidateId,
      appliedBy: input.actorId,
      appliedAt: input.appliedAt,
    };
  }
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

async function seedLocalCfp(service: ReturnType<typeof createLocalCfpService>): Promise<void> {
  const draft = await service.createDraft({
    tenantId: LOCAL_ORGANIZATION_ID,
    eventId: "demo-event",
    formId: "main-cfp",
    ownerAccountId: LOCAL_SPEAKER_ACCOUNT_ID,
    idempotencyKey: "local-seeded-submission",
  });
  let version = draft.version;
  const steps = ["welcome", "account", "submission"] as const;
  for (let index = 0; index < steps.length; index += 1) {
    const completedStep = steps[index]!;
    const saved = await service.saveDraft({
      tenantId: LOCAL_ORGANIZATION_ID,
      eventId: "demo-event",
      submissionId: draft.id,
      ownerAccountId: LOCAL_SPEAKER_ACCOUNT_ID,
      expectedVersion: version,
      completedStep,
      ...(completedStep === "submission"
        ? {
            answers: {
              title: "Designing reliable community systems",
              abstract: "A practical session about building systems that communities can trust.",
              format: "Workshop",
            },
          }
        : {}),
      idempotencyKey: `local-seeded-submission-step-${index}`,
    });
    version = saved.version;
  }
  const participantSaved = await service.saveDraft({
    tenantId: LOCAL_ORGANIZATION_ID,
    eventId: "demo-event",
    submissionId: draft.id,
    ownerAccountId: LOCAL_SPEAKER_ACCOUNT_ID,
    expectedVersion: version,
    completedStep: "participant",
    participants: [
      {
        id: "local-participant",
        firstName: "Alex",
        lastName: "Rivera",
        email: LOCAL_SPEAKER_EMAIL,
        role: "primary",
        biography: "Alex builds dependable, accessible systems for communities.",
        answers: {},
      },
    ],
    secondaryContacts: [],
    idempotencyKey: "local-seeded-submission-participant",
  });
  version = participantSaved.version;
  const review = await service.review({
    tenantId: LOCAL_ORGANIZATION_ID,
    eventId: "demo-event",
    submissionId: draft.id,
    ownerAccountId: LOCAL_SPEAKER_ACCOUNT_ID,
    idempotencyKey: "local-seeded-submission-review",
  });
  if (!review.canSubmit) return;
  await service.submit({
    tenantId: LOCAL_ORGANIZATION_ID,
    eventId: "demo-event",
    submissionId: draft.id,
    ownerAccountId: LOCAL_SPEAKER_ACCOUNT_ID,
    expectedVersion: version,
    idempotencyKey: "local-seeded-submission-submit",
  });
}

function localCfpServiceWithSeed(
  service: ReturnType<typeof createLocalCfpService>,
): ReturnType<typeof createLocalCfpService> {
  const seeded = seedLocalCfp(service).catch(() => undefined);
  return new Proxy(service, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => seeded.then(() => value.apply(target, args));
    },
  });
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
  const eventRepository = new InMemoryEventRepository({
    events: [
      localEventSeed(
        "open-sessionboard-conf",
        "Open Sessionboard Conference",
        "open-sessionboard-conf",
      ),
      localEventSeed("demo-event", "Open Sessionboard Demo", "demo-event", [LOCAL_PUBLIC_EMBED]),
    ],
    audit: [
      {
        id: "event:open-sessionboard-conf:v1",
        organizationId: LOCAL_ORGANIZATION_ID,
        eventId: "open-sessionboard-conf",
        action: "created",
        version: 1,
        actorId: LOCAL_ORGANIZER_ACCOUNT_ID,
        occurredAt: SEEDED_AT,
      },
      {
        id: "event:demo-event:v1",
        organizationId: LOCAL_ORGANIZATION_ID,
        eventId: "demo-event",
        action: "created",
        version: 1,
        actorId: LOCAL_ORGANIZER_ACCOUNT_ID,
        occurredAt: SEEDED_AT,
      },
    ] satisfies readonly EventAuditEntry[],
  });
  const eventService = new EventService(eventRepository, {
    clock: () => new Date(SEEDED_AT),
    generateId: (() => {
      let sequence = 0;
      return () => `local-event-id-${++sequence}`;
    })(),
  });
  const sessionRepository = new InMemorySessionRepository(localSessionSeed());
  const agendaEngine = localAgendaEngine(aiProviders?.agenda);
  const sessionService = new SessionService(sessionRepository, {
    clock: () => new Date(SEEDED_AT),
  });
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
          reviewerIds: [],
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
  const evaluationAssignment: EvaluationAssignment = {
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
  };
  void evaluationRepository.putPlan(localEvaluationPlan, null);
  void evaluationRepository.putAssignmentsForTesting([evaluationAssignment]);
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
          email: "speaker@local.open-sessionboard.test",
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
  const organizerOverview = new LocalOrganizerOverviewRepository({
    publicRepository,
    speakerRepository,
    assignments: [
      {
        id: "local-review-assignment",
        tenantId: LOCAL_ORGANIZATION_ID,
        eventId: "demo-event",
        status: "assigned",
        dueAt: "2026-09-12T23:59:00.000Z",
      },
    ],
  });
  const localMemberUsers: MemberUser[] = [
    {
      userId: LOCAL_ORGANIZER_ACCOUNT_ID,
      email: LOCAL_ORGANIZER_EMAIL,
      name: "Local Organizer",
      emailVerified: true,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    },
    {
      userId: LOCAL_REVIEWER_ACCOUNT_ID,
      email: LOCAL_REVIEWER_EMAIL,
      name: "Local Reviewer",
      emailVerified: true,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    },
    {
      userId: LOCAL_SPEAKER_ACCOUNT_ID,
      email: LOCAL_SPEAKER_EMAIL,
      name: "Alex Rivera",
      emailVerified: true,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    },
  ];
  const localMemberMemberships: MemberMembership[] = [
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
  ];
  const reviewerPool: ReviewerPool = {
    organizationId: LOCAL_ORGANIZATION_ID,
    eventId: "demo-event",
    roundId: "local-review-round",
    reviewerIds: [LOCAL_REVIEWER_ACCOUNT_ID],
    grants: [{ reviewerId: LOCAL_REVIEWER_ACCOUNT_ID, maxAssignments: 5, assignedCount: 1 }],
    version: 1,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  };
  const memberIdentity = new InMemoryMemberIdentityRepository({
    users: localMemberUsers,
    memberships: localMemberMemberships,
  });
  const memberService = new MemberService(
    {
      identity: memberIdentity,
      auth: new InMemoryMemberAuthBoundary({
        baseUrl: "http://localhost:3015/setup",
        clock: () => new Date(SEEDED_AT),
        generateToken: () => "local-member-setup-token",
      }),
      invitationDelivery: new InMemoryMemberInvitationDelivery(),
      reviewerPools: new InMemoryReviewerPoolRepository({ pools: [reviewerPool] }),
    },
    {
      clock: () => new Date(SEEDED_AT),
      generateId: (() => {
        let sequence = 0;
        return () => `local-member-id-${++sequence}`;
      })(),
    },
  );
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

  const communicationTemplate: CommunicationTemplate = {
    id: "local-template-accepted",
    tenantId: LOCAL_ORGANIZATION_ID,
    eventId: "demo-event",
    name: "Accepted proposal",
    purpose: "decision",
    version: 1,
    status: "approved",
    sender: "speakers@sessionboard.namuh.co",
    subject: "Your proposal was accepted",
    html: "<p>Your proposal was accepted.</p>",
    text: "Your proposal was accepted.",
    variables: [],
    createdBy: LOCAL_ORGANIZER_ACCOUNT_ID,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
    approvedBy: LOCAL_ORGANIZER_ACCOUNT_ID,
    approvedAt: SEEDED_AT,
  };
  const communicationRepository = new InMemoryCommunicationRepository({
    templates: [communicationTemplate],
    recipients: [
      {
        id: "local-recipient-speaker",
        participantId: "local-participant",
        tenantId: LOCAL_ORGANIZATION_ID,
        eventId: "demo-event",
        email: LOCAL_SPEAKER_EMAIL,
        displayName: "Alex Rivera",
        audiences: ["accepted_participants", "all_participants"],
        data: { firstName: "Alex", sessionTitle: "Designing reliable community systems" },
      } satisfies CommunicationRecipient,
    ],
    authorizedAudiences: {
      [`${LOCAL_ORGANIZATION_ID}:demo-event`]: ["accepted_participants", "all_participants"],
    },
  });
  const communicationService = new CommunicationService(communicationRepository, undefined, {
    clock: () => new Date(SEEDED_AT),
  });
  const reportRecords: ReportProgramRecord[] = [
    {
      tenantId: LOCAL_ORGANIZATION_ID,
      eventId: "demo-event",
      session: {
        id: "local-session-keynote",
        title: "Designing reliable community systems",
        abstract: "A practical session about building systems that communities can trust.",
        status: "Accepted",
        room: "Main Hall",
        track: "Main stage",
      },
      participants: [
        {
          id: "local-participant",
          displayName: "Alex Rivera",
          biography: "Alex builds dependable, accessible systems for communities.",
        },
      ],
      speakers: [
        {
          id: "local-participant",
          displayName: "Alex Rivera",
          biography: "Alex builds dependable, accessible systems for communities.",
        },
      ],
      evaluationProgress: [
        {
          planId: "local-evaluation-plan",
          planName: "Demo CFP review",
          planVersion: 1,
          total: 1,
          assigned: 1,
          inProgress: 0,
          submitted: 0,
          completionPercent: 0,
        },
      ],
    },
  ];
  const reportRepository = new InMemoryReportRepository(reportRecords);
  const reportDefinition: ReportDefinition = {
    id: "local-program-report",
    tenantId: LOCAL_ORGANIZATION_ID,
    eventId: "demo-event",
    name: "Program and review progress",
    description: "Accepted sessions and aggregate evaluation progress.",
    relationships: ["sessions", "participants", "evaluationProgress"],
    fields: [
      "sessions.title",
      "sessions.status",
      "participants.displayName",
      "evaluationProgress.completionPercent",
    ],
    order: [
      "sessions.title",
      "sessions.status",
      "participants.displayName",
      "evaluationProgress.completionPercent",
    ],
    filters: [],
    sort: [{ field: "sessions.title", direction: "asc" }],
    version: 1,
    createdBy: LOCAL_ORGANIZER_ACCOUNT_ID,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  };
  void reportRepository.createDefinition(reportDefinition);
  const reportService = new ReportService(reportRepository, {
    clock: () => new Date(SEEDED_AT),
  });
  const reportSeedActor = {
    tenantId: LOCAL_ORGANIZATION_ID,
    userId: LOCAL_ORGANIZER_ACCOUNT_ID,
    kind: "human" as const,
    grants: [{ eventId: "demo-event", role: "organizer" as const }],
  };
  const reportSeed = reportService
    .runDefinition(reportSeedActor, "local-program-report", { format: "csv" })
    .catch(() => undefined);
  const reportRouteService = new Proxy(reportService, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => reportSeed.then(() => value.apply(target, args));
    },
  });
  const remixService = new RemixService(
    new LocalRemixRepository(),
    new LocalRemixContentGateway(sessionService, sessionRepository, speakerRepository),
    aiProviders?.remix,
    {
      clock: { now: () => new Date(SEEDED_AT) },
      idGenerator: {
        nextId: (prefix) => `${prefix}_local_${prefix === "candidate" ? "1" : "1"}`,
      },
    },
  );
  const cfpService = localCfpServiceWithSeed(createLocalCfpService());
  return {
    events: { service: eventService },
    sessions: { service: sessionService },
    members: { service: memberService },
    communications: {
      service: communicationService,
      async actorFor(principal: AuthPrincipal, organizationId: string, eventId: string) {
        if (principal.kind !== "user") return null;
        const membership = principal.memberships.find(
          (candidate) =>
            candidate.organizationId === organizationId &&
            (candidate.role === "owner" || candidate.role === "admin"),
        );
        return membership === undefined
          ? null
          : {
              tenantId: organizationId,
              userId: principal.userId,
              kind: "human" as const,
              grants: [{ eventId, role: "organizer" as const }],
            };
      },
    },
    reports: {
      service: reportRouteService,
      async actorFor(principal: AuthPrincipal, organizationId: string, eventId: string) {
        if (principal.kind !== "user") return null;
        const membership = principal.memberships.find(
          (candidate) =>
            candidate.organizationId === organizationId &&
            (candidate.role === "owner" || candidate.role === "admin"),
        );
        return membership === undefined
          ? null
          : {
              tenantId: organizationId,
              userId: principal.userId,
              kind: "human" as const,
              canViewPersonalData: false,
              grants: [{ eventId, role: "organizer" as const, canViewPersonalData: false }],
            };
      },
    },
    remix: {
      service: remixService,
      async actorFor(principal: AuthPrincipal, organizationId: string, eventId: string) {
        if (principal.kind !== "user") return null;
        const membership = principal.memberships.find(
          (candidate) =>
            candidate.organizationId === organizationId &&
            (candidate.role === "owner" || candidate.role === "admin"),
        );
        return membership === undefined
          ? null
          : {
              tenantId: organizationId,
              userId: principal.userId,
              kind: "human" as const,
              grants: [{ eventId, role: "organizer" as const }],
            };
      },
    },
    authenticator,
    auth: localAuthRoutes(),
    organizerOverview,
    crm: { service: crmService },
    speaker: {
      service: speakerService,
      async authenticate(request) {
        const principal = await authenticator.authenticate(request).catch(() => null);
        return principal?.kind === "user" ? { accountId: principal.userId } : null;
      },
    },
    agenda: {
      engine: agendaEngine,
      async organizationIdForEvent(eventId) {
        const event = await eventRepository.getEvent(LOCAL_ORGANIZATION_ID, eventId);
        return event?.organizationId ?? null;
      },
      async eventMetadataForEvent(eventId) {
        const event = await eventRepository.getEvent(LOCAL_ORGANIZATION_ID, eventId);
        if (event === null) return null;
        return {
          slug: event.slug,
          name: event.name,
          timeZone: event.timeZone,
          startsOn: event.startsAt.slice(0, 10),
          endsOn: event.endsAt.slice(0, 10),
          venueName: event.venue,
        };
      },
    },
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
        const role =
          membership.role === "owner" || membership.role === "admin" ? "organizer" : "reviewer";
        if (role === "reviewer" && eventId !== "demo-event") return null;
        return {
          tenantId: LOCAL_ORGANIZATION_ID,
          userId: principal.userId,
          kind: "human",
          grants: [{ eventId, role }],
        };
      },
    },
    publishedSpeakers: {
      async getPublishedSpeakers(eventSlug: string): Promise<PublishedSpeakerProjection | null> {
        const event = (await eventRepository.listEvents(LOCAL_ORGANIZATION_ID)).find(
          (candidate) => candidate.slug === eventSlug,
        );
        if (event === undefined) return null;
        const revision = await agendaEngine.getPublishedAgenda(event.id);
        if (revision === null) return null;
        const sessions = await sessionRepository.listSessions(LOCAL_ORGANIZATION_ID, event.id);
        const sessionById = new Map(sessions.map((session) => [session.id, session]));
        const speakerSessions = new Map<string, Array<{ id: string; title: string }>>();
        for (const entry of revision.entries) {
          const session = sessionById.get(entry.sessionId);
          if (session === undefined) continue;
          for (const participantId of session.speakerIds) {
            const entries = speakerSessions.get(participantId) ?? [];
            entries.push({ id: session.id, title: session.title });
            speakerSessions.set(participantId, entries);
          }
        }
        const profiles = await speakerRepository.listProfiles(event.id, [
          ...speakerSessions.keys(),
        ]);
        return {
          event: {
            slug: event.slug,
            name: event.name,
            timeZone: event.timeZone,
            startsOn: event.startsAt.slice(0, 10),
            endsOn: event.endsAt.slice(0, 10),
            venueName: event.venue,
          },
          revision: {
            id: revision.id,
            number: revision.revisionNumber,
            publishedAt: revision.publishedAt,
          },
          speakers: profiles.map((profile) => {
            const speakerSessionList = speakerSessions.get(profile.participantId) ?? [];
            return {
              id: profile.participantId,
              displayName: profile.displayName,
              pronouns: null,
              jobTitle: profile.jobTitle ?? null,
              organization: profile.company ?? null,
              biography: profile.biography,
              photoUrl: null,
              sessionIds: speakerSessionList.map((session) => session.id),
              sessionTitles: speakerSessionList.map((session) => session.title),
              trackNames: [],
            };
          }),
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
    cfp: { service: cfpService },
  } as ApiDependencies & {
    cfp: { service: ReturnType<typeof createLocalCfpService> };
  };
}
