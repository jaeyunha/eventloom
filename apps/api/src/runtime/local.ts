import type { ApiDependencies } from "../app";
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
import type { EvaluationActor } from "../features/evaluations/types";
import type {
  IdempotencyCoordinator,
  IdempotencyOutcome,
} from "../features/public-api/idempotency";
import { IdempotencyConflictError } from "../features/public-api/idempotency";
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
  RepositoryResult,
  SpeakerAccessScope,
  SpeakerAsset,
  SpeakerProfile,
  SpeakerRepository,
  SpeakerSubmission,
  SpeakerTask,
  TransitionSpeakerTaskCommand,
  UpdateBiographyCommand,
} from "../features/speaker/types";
import { InMemoryWebhookRepository } from "../integrations/webhooks/types";
import type {
  OrganizerOverviewActionItem,
  OrganizerOverviewData,
  OrganizerOverviewEvent,
  OrganizerOverviewRouteDependencies,
} from "../routes/organizer-overview";
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

function clone<T>(value: T): T {
  return structuredClone(value);
}

function localAuthenticator(): RequestAuthenticator {
  const sessions: BetterAuthGateway = {
    async resolveSession(token) {
      if (token !== LOCAL_SESSION_TOKEN) return null;
      return {
        sessionId: "local-session-id",
        userId: LOCAL_SPEAKER_ACCOUNT_ID,
        email: "speaker@local.open-sessionboard.test",
        emailVerified: true,
        expiresAt: FAR_FUTURE,
        memberships: [{ organizationId: LOCAL_ORGANIZATION_ID, role: "owner" }],
        speakerGrants: [
          {
            organizationId: LOCAL_ORGANIZATION_ID,
            speakerProfileId: "local-participant",
          },
        ],
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

class LocalSpeakerRepository implements SpeakerRepository {
  readonly #submissions = new Map<string, SpeakerSubmission[]>();
  readonly #profiles = new Map<string, SpeakerProfile[]>();
  readonly #tasks = new Map<string, SpeakerTask[]>();
  readonly #assets = new Map<string, SpeakerAsset[]>();
  constructor() {
    this.#seed("demo-event");
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

function localAgendaEngine(): AgendaEngine {
  const repository = new InMemoryAgendaRepository();
  const engine = new AgendaEngine(repository, new InMemoryAgendaMutationLock(), {
    clock: { now: () => new Date(SEEDED_AT) },
    idGenerator: {
      nextId: (() => {
        let sequence = 0;
        return (prefix) => `${prefix}_local_${++sequence}`;
      })(),
    },
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

  async getOverview(organizationId: string): Promise<OrganizerOverviewData> {
    const events = this.#publicRepository
      .listStored(organizationId, "events")
      .map((event) => this.eventView(event))
      .sort((left, right) => left.id.localeCompare(right.id));
    const eventIds = new Set(events.map((event) => event.id));
    if (events.length === 0) {
      return {
        organizationId,
        metrics: {
          eventCount: 0,
          submissionCount: 0,
          pendingReviewCount: 0,
          outstandingSpeakerTaskCount: 0,
          publishedSessionCount: 0,
        },
        events: [],
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
        eventCount: events.length,
        submissionCount: submissions.length,
        pendingReviewCount: pendingAssignments.length,
        outstandingSpeakerTaskCount: tasks.length,
        publishedSessionCount,
      },
      events,
      actionItems,
    };
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
class LocalIdempotencyCoordinator implements IdempotencyCoordinator {
  readonly #records = new Map<
    string,
    { fingerprint: string; promise: Promise<unknown>; completed: boolean }
  >();

  async run<T>(
    scope: string,
    key: string,
    fingerprint: string,
    operation: () => Promise<T>,
  ): Promise<IdempotencyOutcome<T>> {
    const storageKey = `${scope}\u0000${key}`;
    const existing = this.#records.get(storageKey);
    if (existing !== undefined) {
      if (existing.fingerprint !== fingerprint) throw new IdempotencyConflictError();
      return { value: (await existing.promise) as T, replayed: true };
    }
    const record = {
      fingerprint,
      completed: false,
      promise: Promise.resolve().then(operation) as Promise<unknown>,
    };
    this.#records.set(storageKey, record);
    try {
      const value = (await record.promise) as T;
      record.completed = true;
      return { value, replayed: false };
    } catch (error) {
      this.#records.delete(storageKey);
      throw error;
    }
  }
}

function eventIdFrom(request: Request): string {
  const pathMatch = /\/(?:events|event)\/([^/]+)/u.exec(new URL(request.url).pathname)?.[1];
  return pathMatch === undefined ? "demo-event" : decodeURIComponent(pathMatch);
}

export function createLocalDependencies(): ApiDependencies {
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
  const evaluationRepository = new InMemoryEvaluationRepository();
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
  });
  const agendaEngine = localAgendaEngine();
  const organizerOverview = new LocalOrganizerOverviewRepository({
    publicRepository,
    speakerRepository,
  });
  const webhookIds = { whs: 0, whd: 0 };

  return {
    authenticator,
    organizerOverview,
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
          grants: [
            { eventId, role: "organizer" },
            { eventId, role: "reviewer" },
          ],
        };
      },
    },
    publicApi: {
      resources: [
        {
          name: "events",
          repository: publicRepository,
          readScope: "events:read",
          writeScope: "events:write",
          sortFields: ["id", "name", "updatedAt"],
          defaultSort: "id",
        },
        {
          name: "speakers",
          repository: publicRepository,
          readScope: "submissions:read",
          writeScope: "submissions:write",
          sortFields: ["id", "displayName", "updatedAt"],
          defaultSort: "id",
        },
        {
          name: "agenda",
          repository: publicRepository,
          readScope: "agenda:read",
          writeScope: "agenda:write",
          sortFields: ["id", "updatedAt"],
          defaultSort: "id",
        },
        {
          name: "sessions",
          repository: publicRepository,
          readScope: "agenda:read",
          writeScope: "agenda:write",
          sortFields: ["id", "title", "updatedAt"],
          defaultSort: "id",
        },
      ],
      idempotency: new LocalIdempotencyCoordinator(),
    },
    webhooks: new InMemoryWebhookRepository([], {
      clock: { now: () => new Date(SEEDED_AT) },
      idFactory: (prefix) => `${prefix}_LOCAL_${String(++webhookIds[prefix]).padStart(4, "0")}`,
    }),
    cfp: { service: createLocalCfpService() },
  } as ApiDependencies & {
    cfp: { service: ReturnType<typeof createLocalCfpService> };
  };
}
