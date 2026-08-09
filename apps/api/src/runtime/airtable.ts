import type { ApiDependencies, EvaluationRouteDependencies } from "../app";
import type { RequestAuthenticator } from "../features/auth/authenticator";
import { AgendaEngine } from "../features/agenda/engine";
import {
  AgendaRepositoryConflictError,
  type DurableObjectAgendaCoordinator,
} from "../features/agenda/infrastructure";
import type { AgendaEntry, AgendaState } from "../features/agenda/types";
import type {
  AuditEntry,
  CfpForm,
  EventCfp,
  Submission,
  SubmissionVersion,
} from "../features/cfp/model";
import {
  CfpError,
  type CfpEffects,
  type CfpIdempotencyCoordinator,
  type CfpRepository,
  CfpService,
} from "../features/cfp/service";
import type { AuthPrincipal } from "../features/auth/types";
import type {
  EvaluationAssignment,
  EvaluationConflictDeclaration,
  EvaluationDecision,
  EvaluationPlan,
  EvaluationReview,
  SubmissionReviewMaterial,
} from "../features/evaluations/types";
import type {
  EvaluationRepository,
  SubmissionReviewSource,
} from "../features/evaluations/repository";
import { conflict } from "../features/evaluations/errors";
import { EvaluationService } from "../features/evaluations/service";
import type {
  IdempotencyBeginResult,
  IdempotencyStoredResponse,
  IdempotencyStore,
} from "../features/public-api/idempotency";
import { createIdempotencyCoordinator } from "../features/public-api/idempotency";
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
import type {
  CreateWebhookDeliveryInput,
  CreateWebhookSubscriptionInput,
  DeliveryAttemptResult,
  UpdateWebhookSubscriptionInput,
  WebhookDelivery,
  WebhookRepository,
  WebhookSubscriptionRecord,
} from "../integrations/webhooks/types";
import { WebhookRepositoryError } from "../integrations/webhooks/types";
import {
  AirtableRepository,
  type AirtableMapper,
  type AirtableTransport,
} from "../infrastructure/airtable";
import type { CloudflareOutboxMessage } from "../infrastructure/cloudflare/bindings";
import type {
  DurableObjectNamespace,
  D1Database,
  R2Bucket,
  Queue,
} from "@cloudflare/workers-types";

const APPLICATION_ID = "Application ID";
const DEFAULT_JSON_FIELD = "Settings JSON";

type JsonRecord = Record<string, unknown>;

type AirtableFields = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
function entityType(value: object): string | undefined {
  return isRecord(value) && typeof value.entityType === "string" ? value.entityType : undefined;
}

function tagged<T extends object>(value: T, kind: string): T {
  return { ...value, entityType: kind } as T;
}

function requiredId(value: unknown, label = "id"): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function recordId(value: object): string {
  const candidate = isRecord(value) ? value.id : undefined;
  return requiredId(candidate);
}

function organizationIdOf(value: object): string | undefined {
  if (!isRecord(value)) return undefined;
  const candidate = value.organizationId ?? value.tenantId;
  return typeof candidate === "string" && candidate.trim().length > 0
    ? candidate.trim()
    : undefined;
}

const FIELD_ALIASES: Readonly<Record<string, string>> = {
  Name: "name",
  Title: "title",
  Abstract: "abstract",
  Biography: "biography",
  "Display Name": "displayName",
  Status: "status",
  Version: "version",
  "Event ID": "eventId",
  "Form ID": "formId",
  "Organization ID": "organizationId",
  "Tenant ID": "tenantId",
  "Updated At": "updatedAt",
  "Created At": "createdAt",
  "Due At": "dueAt",
  "Time Zone": "timeZone",
  Timezone: "timezone",
  Type: "type",
  Owner: "owner",
  "Headshot Asset ID": "headshotAssetId",
  "Participant IDs": "participantIds",
  "Participant ID": "participantId",
  "Submission ID": "submissionId",
  "Dependency IDs": "dependencyIds",
  "Reminder Offsets Minutes": "reminderOffsetsMinutes",
  "Accepted Asset Kinds": "acceptedAssetKinds",
  Kind: "kind",
  "Object Key": "objectKey",
  "File Name": "fileName",
  "Content Type": "contentType",
  "Size Bytes": "sizeBytes",
  State: "state",
  "Owner Account ID": "ownerAccountId",
  "Endpoint URL": "endpointUrl",
  Events: "events",
  Active: "active",
  "Signing Secret": "signingSecret",
  "Signing Secret Last Four": "signingSecretLastFour",
};
function encodeJson(value: object, jsonField: string): AirtableFields {
  const id = recordId(value);
  return {
    [APPLICATION_ID]: id,
    [jsonField]: JSON.stringify(value),
  };
}

function decodeJson<T extends object>(fields: Readonly<AirtableFields>, jsonField: string): T {
  const payloadAliases = [jsonField, "Payload", "JSON", "Data", "Record JSON"];
  const payload = payloadAliases
    .map((alias) => fields[alias])
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);
  if (payload !== undefined) {
    try {
      const parsed: unknown = JSON.parse(payload);
      if (isRecord(parsed)) {
        const organizationId =
          typeof fields["Organization ID"] === "string"
            ? fields["Organization ID"]
            : typeof parsed.organizationId === "string"
              ? parsed.organizationId
              : undefined;
        const tenantId =
          organizationId ?? (typeof parsed.tenantId === "string" ? parsed.tenantId : undefined);
        const id = typeof fields[APPLICATION_ID] === "string" ? fields[APPLICATION_ID] : parsed.id;
        requiredId(id);
        return {
          ...parsed,
          ...(id === undefined ? {} : { id }),
          ...(tenantId === undefined ? {} : { tenantId }),
          ...(organizationId === undefined && tenantId === undefined
            ? {}
            : { organizationId: organizationId ?? tenantId }),
        } as T;
      }
      throw new TypeError("The Airtable payload is not valid JSON.");
    } catch {
      throw new TypeError("The Airtable payload is not valid JSON.");
    }
  }

  const result: JsonRecord = {};
  for (const [key, value] of Object.entries(fields)) {
    if (payloadAliases.includes(key)) continue;
    if (key === APPLICATION_ID) {
      result.id = value;
    } else if (key === "Organization ID") {
      result.organizationId = value;
      result.tenantId = value;
    } else if (key === "Version") {
      result.version = value;
    } else if (key === "Updated At") {
      result.updatedAt = value;
    } else if (key === "Created At") {
      result.createdAt = value;
    } else {
      const alias = FIELD_ALIASES[key] ?? key;
      if (typeof value === "string" && (value.startsWith("[") || value.startsWith("{"))) {
        try {
          result[alias] = JSON.parse(value) as unknown;
        } catch {
          result[alias] = value;
        }
      } else {
        result[alias] = value;
      }
    }
  }
  requiredId(result.id);
  return result as T;
}

function jsonMapper<T extends object>(
  jsonField: string,
): AirtableMapper<T, T, Partial<T>, AirtableFields> {
  return {
    applicationIdField: APPLICATION_ID,
    applicationIdOf: (input) => recordId(input),
    encodeCreate: (input) => encodeJson(input, jsonField),
    encodeUpdate: (input) => encodeJson(input as T, jsonField),
    decode: (fields) => decodeJson<T>(fields, jsonField),
  };
}

/** A typed Airtable repository whose only opaque identifier is Airtable's internal record id. */
export class AirtableJsonStore<T extends object> {
  readonly #repository: AirtableRepository<T, T, Partial<T>, AirtableFields>;

  constructor(options: {
    readonly baseId: string;
    readonly table: string;
    readonly transport: AirtableTransport;
    readonly jsonField?: string;
  }) {
    const jsonField = options.jsonField ?? DEFAULT_JSON_FIELD;
    this.#repository = new AirtableRepository({
      baseId: options.baseId,
      table: options.table,
      mapper: jsonMapper<T>(jsonField),
      transport: options.transport,
    });
  }

  find(id: string): Promise<T | undefined> {
    return this.#repository.find(requiredId(id));
  }

  get(id: string): Promise<T> {
    return this.#repository.get(requiredId(id));
  }

  create(value: T): Promise<T> {
    return this.#repository.create(clone(value));
  }

  update(id: string, value: T): Promise<T> {
    return this.#repository.update(requiredId(id), clone(value));
  }

  delete(id: string): Promise<boolean> {
    return this.#repository.delete(requiredId(id));
  }

  async list(): Promise<T[]> {
    const values: T[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.#repository.list({
        ...(cursor === undefined ? {} : { cursor }),
        pageSize: 100,
      });
      values.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor !== undefined);
    return values;
  }
}

function byOrganization(value: object, organizationId: string): boolean {
  return organizationIdOf(value) === organizationId;
}
function scalarCompare(left: unknown, right: unknown): number {
  if (left === right) return 0;
  if (left === null || left === undefined) return -1;
  if (right === null || right === undefined) return 1;
  if (typeof left === "number" && typeof right === "number") {
    return left < right ? -1 : 1;
  }
  const leftText = String(left);
  const rightText = String(right);
  return leftText < rightText ? -1 : 1;
}

function isAfterCursor(record: JsonRecord, input: PublicApiListInput): boolean {
  const cursor = input.cursorData;
  if (cursor === undefined) return true;
  const sortCursor = cursor.values[0];
  const idCursor = cursor.id;
  const primary = scalarCompare(record[input.sort], sortCursor);
  const comparison = primary === 0 ? scalarCompare(record.id, idCursor) : primary;
  return input.direction === "asc" ? comparison > 0 : comparison < 0;
}
function publicRecord(record: JsonRecord): JsonRecord {
  const { tenantId: _tenantId, ...safe } = record;
  return safe;
}

function datesFromSubscription(value: WebhookSubscriptionRecord): WebhookSubscriptionRecord {
  return {
    ...value,
    createdAt: new Date(value.createdAt),
    updatedAt: new Date(value.updatedAt),
    events: [...value.events],
  };
}
function datesFromDelivery(value: WebhookDelivery): WebhookDelivery {
  return {
    ...value,
    event: {
      ...value.event,
      occurredAt: value.event.occurredAt,
    },
    nextAttemptAt: value.nextAttemptAt === null ? null : new Date(value.nextAttemptAt),
    completedAt: value.completedAt === null ? null : new Date(value.completedAt),
    createdAt: new Date(value.createdAt),
    failureHistory: value.failureHistory.map((failure) => ({
      ...failure,
      attemptedAt: new Date(failure.attemptedAt),
    })),
  };
}

function randomSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function secretLastFour(secret: string): string {
  return secret.slice(-4).padStart(4, "•");
}

function randomResourceId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

/** Airtable-backed webhook subscriptions and durable delivery records. */
export class AirtableWebhookRepository implements WebhookRepository {
  readonly #subscriptions: AirtableJsonStore<WebhookSubscriptionRecord>;
  readonly #deliveries: AirtableJsonStore<WebhookDelivery>;

  constructor(options: { readonly baseId: string; readonly transport: AirtableTransport }) {
    this.#subscriptions = new AirtableJsonStore({
      baseId: options.baseId,
      table: "Publication Outbox",
      transport: options.transport,
      jsonField: "Payload JSON",
    });
    this.#deliveries = new AirtableJsonStore({
      baseId: options.baseId,
      table: "Publication Outbox",
      transport: options.transport,
      jsonField: "Payload JSON",
    });
  }

  async listSubscriptions(organizationId: string): Promise<readonly WebhookSubscriptionRecord[]> {
    return (await this.#subscriptions.list())
      .filter(
        (subscription) =>
          byOrganization(subscription, organizationId) &&
          (isRecord(subscription) && subscription.entityType !== undefined
            ? subscription.entityType === "webhook_subscription"
            : "events" in subscription),
      )
      .map(datesFromSubscription)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  }

  async getSubscription(
    organizationId: string,
    subscriptionId: string,
  ): Promise<WebhookSubscriptionRecord | null> {
    const subscription = await this.#subscriptions.find(subscriptionId);
    return subscription !== undefined && byOrganization(subscription, organizationId)
      ? datesFromSubscription(subscription)
      : null;
  }

  async createSubscription(
    input: CreateWebhookSubscriptionInput,
  ): Promise<WebhookSubscriptionRecord> {
    const now = new Date();
    const signingSecret = input.signingSecret ?? randomSecret();
    if (signingSecret.trim().length === 0) {
      throw new WebhookRepositoryError("INVALID", "A signing secret is required.");
    }
    const subscription: WebhookSubscriptionRecord = {
      id: randomResourceId("whs"),
      organizationId: input.organizationId,
      endpointUrl: input.endpointUrl,
      events: [...input.events],
      active: input.active ?? true,
      signingSecret,
      signingSecretLastFour: secretLastFour(signingSecret),
      createdAt: now,
      updatedAt: now,
      ...(input.eventId === undefined ? {} : { eventId: input.eventId }),
    };
    try {
      await this.#subscriptions.create(tagged(subscription, "webhook_subscription"));
    } catch {
      throw new WebhookRepositoryError(
        "CONFLICT",
        "The webhook subscription could not be created.",
      );
    }
    return datesFromSubscription(subscription);
  }

  async updateSubscription(
    organizationId: string,
    subscriptionId: string,
    input: UpdateWebhookSubscriptionInput,
  ): Promise<WebhookSubscriptionRecord | null> {
    const existing = await this.getSubscription(organizationId, subscriptionId);
    if (existing === null) return null;
    const signingSecret = input.signingSecret ?? existing.signingSecret;
    const updated: WebhookSubscriptionRecord = {
      ...existing,
      ...(input.endpointUrl === undefined ? {} : { endpointUrl: input.endpointUrl }),
      ...(input.events === undefined ? {} : { events: [...input.events] }),
      ...(input.active === undefined ? {} : { active: input.active }),
      signingSecret,
      signingSecretLastFour: secretLastFour(signingSecret),
      updatedAt: new Date(),
    };
    if (input.eventId !== undefined) {
      if (input.eventId === null) delete updated.eventId;
      else updated.eventId = input.eventId;
    }
    await this.#subscriptions.update(subscriptionId, tagged(updated, "webhook_subscription"));
    return datesFromSubscription(updated);
  }

  async deleteSubscription(organizationId: string, subscriptionId: string): Promise<boolean> {
    const existing = await this.getSubscription(organizationId, subscriptionId);
    if (existing === null) return false;
    return this.#subscriptions.delete(subscriptionId);
  }

  async createDelivery(input: CreateWebhookDeliveryInput): Promise<WebhookDelivery> {
    const subscription = await this.getSubscription(input.organizationId, input.subscriptionId);
    if (subscription === null) {
      throw new WebhookRepositoryError("NOT_FOUND", "The webhook subscription was not found.");
    }
    const existing = (await this.#deliveries.list()).find(
      (delivery) =>
        (isRecord(delivery) && delivery.entityType !== undefined
          ? delivery.entityType === "webhook_delivery"
          : "status" in delivery) &&
        delivery.subscriptionId === input.subscriptionId &&
        delivery.event.id === input.event.id,
    );
    if (existing !== undefined) return datesFromDelivery(existing);
    const delivery: WebhookDelivery = {
      id: randomResourceId("whd"),
      organizationId: input.organizationId,
      subscriptionId: subscription.id,
      event: clone(input.event),
      status: "pending",
      attemptCount: 0,
      nextAttemptAt: new Date(input.createdAt),
      lastResponseStatus: null,
      lastError: null,
      createdAt: new Date(input.createdAt),
      completedAt: null,
      failureHistory: [],
    };
    await this.#deliveries.create(tagged(delivery, "webhook_delivery"));
    return datesFromDelivery(delivery);
  }

  async claimDueDelivery(now: Date): Promise<WebhookDelivery | null> {
    const candidate = (await this.#deliveries.list())
      .map(datesFromDelivery)
      .filter(
        (delivery) =>
          (isRecord(delivery) && delivery.entityType !== undefined
            ? delivery.entityType === "webhook_delivery"
            : "status" in delivery) &&
          (delivery.status === "pending" || delivery.status === "retrying") &&
          delivery.nextAttemptAt !== null &&
          delivery.nextAttemptAt.getTime() <= now.getTime(),
      )
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())[0];
    if (candidate === undefined) return null;
    const claimed = { ...candidate, status: "delivering" as const, nextAttemptAt: null };
    await this.#deliveries.update(claimed.id, tagged(claimed, "webhook_delivery"));
    return datesFromDelivery(claimed);
  }

  async markDeliverySucceeded(
    deliveryId: string,
    result: DeliveryAttemptResult,
  ): Promise<WebhookDelivery | null> {
    return this.applyDeliveryAttempt(deliveryId, result, "succeeded", result.attemptedAt);
  }

  async markDeliveryRetry(
    deliveryId: string,
    result: DeliveryAttemptResult,
  ): Promise<WebhookDelivery | null> {
    return this.applyDeliveryAttempt(deliveryId, result, "retrying", null);
  }

  async markDeliveryFailed(
    deliveryId: string,
    result: DeliveryAttemptResult,
  ): Promise<WebhookDelivery | null> {
    return this.applyDeliveryAttempt(
      deliveryId,
      result,
      result.retryable === true ? "dead_letter" : "failed",
      result.attemptedAt,
    );
  }

  private async applyDeliveryAttempt(
    deliveryId: string,
    result: DeliveryAttemptResult,
    status: WebhookDelivery["status"],
    completedAt: Date | null,
  ): Promise<WebhookDelivery | null> {
    const stored = await this.#deliveries.find(deliveryId);
    if (stored === undefined) return null;
    const delivery = datesFromDelivery(stored);
    const updated: WebhookDelivery = {
      ...delivery,
      status,
      attemptCount: Math.max(delivery.attemptCount, result.attemptCount),
      nextAttemptAt: result.nextAttemptAt === undefined ? null : result.nextAttemptAt,
      lastResponseStatus: result.responseStatus,
      lastError: result.error,
      completedAt,
      ...(result.responseBody === undefined ? {} : { lastResponseBody: result.responseBody }),
      ...(result.error === null
        ? {}
        : {
            failureHistory: [
              ...delivery.failureHistory,
              {
                attemptedAt: new Date(result.attemptedAt),
                attempt: result.attemptCount,
                responseStatus: result.responseStatus,
                error: result.error,
                responseBody: result.responseBody ?? null,
                retryable: result.retryable ?? (status === "retrying" || status === "dead_letter"),
              },
            ],
          }),
    };
    await this.#deliveries.update(deliveryId, tagged(updated, "webhook_delivery"));
    return datesFromDelivery(updated);
  }
}

/** Speaker records and task state are business records in Airtable. */
export class AirtableSpeakerRepository implements SpeakerRepository {
  readonly #submissions: AirtableJsonStore<SpeakerSubmission>;
  readonly #profiles: AirtableJsonStore<SpeakerProfile>;
  readonly #tasks: AirtableJsonStore<SpeakerTask>;
  readonly #assets: AirtableJsonStore<SpeakerAsset>;
  readonly #database: D1Database;

  constructor(options: {
    readonly baseId: string;
    readonly transport: AirtableTransport;
    readonly database: D1Database;
  }) {
    const shared = { baseId: options.baseId, transport: options.transport };
    this.#submissions = new AirtableJsonStore({
      ...shared,
      table: "Submissions",
      jsonField: "Answers JSON",
    });
    this.#profiles = new AirtableJsonStore({
      ...shared,
      table: "Speaker Profiles",
      jsonField: "Biography",
    });
    this.#tasks = new AirtableJsonStore({
      ...shared,
      table: "Speaker Tasks",
      jsonField: "Owner JSON",
    });
    this.#assets = new AirtableJsonStore({
      ...shared,
      table: "Audit Records",
      jsonField: "Changes JSON",
    });
    this.#database = options.database;
  }

  async getAccessScope(eventId: string, accountId: string): Promise<SpeakerAccessScope> {
    const result = await this.#database
      .prepare(
        `SELECT speaker_profile_id
           FROM speaker_grants
          WHERE user_id = ? AND revoked_at IS NULL
          ORDER BY speaker_profile_id`,
      )
      .bind(accountId)
      .all<{ speaker_profile_id: string }>();
    const grants = new Set(
      result.results
        .map((row) => row.speaker_profile_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    );
    if (grants.size === 0) return { submissionIds: [], participantIds: [] };
    const profiles = (await this.#profiles.list()).filter(
      (profile) =>
        profile.eventId === eventId &&
        (grants.has(profile.id) || grants.has(profile.participantId)),
    );
    const participantIds = [...new Set(profiles.map((profile) => profile.participantId))];
    const submissions = (await this.#submissions.list()).filter(
      (submission) =>
        submission.eventId === eventId &&
        submission.participantIds.some((participantId) => participantIds.includes(participantId)),
    );
    return { participantIds, submissionIds: submissions.map((submission) => submission.id) };
  }

  async listSubmissions(
    eventId: string,
    submissionIds: readonly string[],
  ): Promise<SpeakerSubmission[]> {
    const allowed = new Set(submissionIds);
    return (await this.#submissions.list()).filter(
      (submission) => submission.eventId === eventId && allowed.has(submission.id),
    );
  }

  async getSubmission(eventId: string, submissionId: string): Promise<SpeakerSubmission | null> {
    const submission = await this.#submissions.find(submissionId);
    return submission !== undefined && submission.eventId === eventId ? submission : null;
  }

  async listProfiles(
    eventId: string,
    participantIds: readonly string[],
  ): Promise<SpeakerProfile[]> {
    const allowed = new Set(participantIds);
    return (await this.#profiles.list()).filter(
      (profile) => profile.eventId === eventId && allowed.has(profile.participantId),
    );
  }

  async getProfile(eventId: string, participantId: string): Promise<SpeakerProfile | null> {
    return (
      (await this.#profiles.list()).find(
        (profile) => profile.eventId === eventId && profile.participantId === participantId,
      ) ?? null
    );
  }

  async updateBiography(
    command: UpdateBiographyCommand,
  ): Promise<RepositoryResult<SpeakerProfile>> {
    const profile = await this.getProfile(command.eventId, command.participantId);
    if (profile === null) return { ok: false, reason: "not_found" };
    if (profile.version !== command.expectedVersion)
      return { ok: false, reason: "version_conflict" };
    const updated = {
      ...profile,
      biography: command.biography,
      version: profile.version + 1,
      updatedAt: command.updatedAt,
    };
    await this.#profiles.update(profile.id, updated);
    return { ok: true, value: updated };
  }

  async listTasks(eventId: string, participantIds: readonly string[]): Promise<SpeakerTask[]> {
    const allowed = new Set(participantIds);
    return (await this.#tasks.list()).filter(
      (task) => task.eventId === eventId && allowed.has(task.participantId),
    );
  }

  async getTask(eventId: string, taskId: string): Promise<SpeakerTask | null> {
    const task = await this.#tasks.find(taskId);
    return task !== undefined && task.eventId === eventId ? task : null;
  }

  async getTasksByIds(eventId: string, taskIds: readonly string[]): Promise<SpeakerTask[]> {
    const allowed = new Set(taskIds);
    return (await this.#tasks.list()).filter(
      (task) => task.eventId === eventId && allowed.has(task.id),
    );
  }

  async transitionTask(command: TransitionSpeakerTaskCommand): Promise<
    RepositoryResult<{
      task: SpeakerTask;
      transition: import("../features/speaker/types").SpeakerTaskTransition;
    }>
  > {
    const task = await this.getTask(command.eventId, command.taskId);
    if (task === null) return { ok: false, reason: "not_found" };
    if (task.version !== command.expectedVersion || task.status !== command.fromStatus) {
      return { ok: false, reason: "version_conflict" };
    }
    const updated = {
      ...task,
      status: command.toStatus,
      version: task.version + 1,
      updatedAt: command.transition.occurredAt,
    };
    await this.#tasks.update(task.id, updated);
    return { ok: true, value: { task: updated, transition: clone(command.transition) } };
  }

  async createPendingAsset(asset: SpeakerAsset): Promise<SpeakerAsset> {
    await this.#assets.create(tagged(asset, "speaker_asset"));
    return clone(asset);
  }

  async getAsset(eventId: string, assetId: string): Promise<SpeakerAsset | null> {
    const asset = await this.#assets.find(assetId);
    return asset !== undefined && asset.eventId === eventId ? asset : null;
  }
}

/** R2 does not expose provider presigning in Workers; grants target the API's private-file endpoint. */
export class R2PrivateAssetGateway implements PrivateAssetGateway {
  readonly #origin: string;
  readonly #bucket: R2Bucket;

  constructor(bucket: R2Bucket, origin: string) {
    this.#bucket = bucket;
    this.#origin = origin.replace(/\/$/u, "");
  }

  async createUploadGrant(command: CreatePrivateUploadGrantCommand) {
    if (command.objectKey.trim().length === 0) throw new TypeError("An object key is required.");
    return {
      method: "PUT" as const,
      url: `${this.#origin}/api/speaker/assets/upload?objectKey=${encodeURIComponent(command.objectKey)}`,
      headers: { "content-type": command.contentType },
      expiresAt: command.expiresAt,
    };
  }

  async createDownloadGrant(command: { objectKey: string; fileName: string; expiresAt: string }) {
    const object = await this.#bucket.head(command.objectKey);
    if (object === null) throw new Error("The requested private asset is not available.");
    return {
      url: `${this.#origin}/api/speaker/assets/download?objectKey=${encodeURIComponent(command.objectKey)}&fileName=${encodeURIComponent(command.fileName)}`,
      expiresAt: command.expiresAt,
    };
  }
}

export class AirtableCfpRepository implements CfpRepository {
  readonly #events: AirtableJsonStore<EventCfp>;
  readonly #forms: AirtableJsonStore<CfpForm>;
  readonly #submissions: AirtableJsonStore<Submission>;
  readonly #audits: AirtableJsonStore<AuditEntry & { id: string }>;
  constructor(options: { readonly baseId: string; readonly transport: AirtableTransport }) {
    const shared = { baseId: options.baseId, transport: options.transport };
    this.#events = new AirtableJsonStore({
      ...shared,
      table: "Events",
      jsonField: "Settings JSON",
    });
    this.#forms = new AirtableJsonStore({
      ...shared,
      table: "CFP Forms",
      jsonField: "Fields JSON",
    });
    this.#submissions = new AirtableJsonStore({
      ...shared,
      table: "Submissions",
      jsonField: "Answers JSON",
    });
    this.#audits = new AirtableJsonStore({
      ...shared,
      table: "Audit Records",
      jsonField: "Changes JSON",
    });
  }

  async getEvent(tenantId: string, eventId: string): Promise<EventCfp | null> {
    const event = await this.#events.find(eventId);
    return event !== undefined && event.tenantId === tenantId ? event : null;
  }

  async saveEvent(event: EventCfp, expectedVersion: number | null): Promise<void> {
    const existing = await this.#events.find(event.id);
    if (
      (existing?.version ?? null) !== expectedVersion ||
      (existing && existing.tenantId !== event.tenantId)
    ) {
      throw new CfpError("CONFLICT", "The event CFP configuration has changed.");
    }
    if (existing === undefined) await this.#events.create(event);
    else await this.#events.update(event.id, event);
  }

  async getForm(tenantId: string, formId: string): Promise<CfpForm | null> {
    const form = await this.#forms.find(formId);
    return form !== undefined && form.tenantId === tenantId ? form : null;
  }

  async listForms(tenantId: string, eventId: string): Promise<CfpForm[]> {
    return (await this.#forms.list()).filter(
      (form) => form.tenantId === tenantId && form.eventId === eventId,
    );
  }

  async saveForm(form: CfpForm, expectedVersion: number | null): Promise<void> {
    const existing = await this.#forms.find(form.id);
    if (
      (existing?.version ?? null) !== expectedVersion ||
      (existing && existing.tenantId !== form.tenantId)
    ) {
      throw new CfpError("CONFLICT", "The CFP form has changed.");
    }
    if (existing === undefined) await this.#forms.create(form);
    else await this.#forms.update(form.id, form);
  }

  async getSubmission(tenantId: string, submissionId: string): Promise<Submission | null> {
    const submission = await this.#submissions.find(submissionId);
    return submission !== undefined && submission.tenantId === tenantId ? submission : null;
  }

  async countOwnedSubmissions(input: {
    tenantId: string;
    eventId: string;
    formId: string;
    ownerAccountId: string;
  }): Promise<number> {
    return (await this.#submissions.list()).filter(
      (submission) =>
        submission.tenantId === input.tenantId &&
        submission.eventId === input.eventId &&
        submission.formId === input.formId &&
        submission.ownerAccountId === input.ownerAccountId &&
        submission.status !== "withdrawn",
    ).length;
  }

  async saveSubmissionVersion(
    version: SubmissionVersion,
    expectedVersion: number | null,
    audit?: AuditEntry,
  ): Promise<void> {
    const current = await this.#submissions.find(version.submission.id);
    if (
      (current?.version ?? null) !== expectedVersion ||
      (current !== undefined && current.tenantId !== version.submission.tenantId)
    ) {
      throw new CfpError("CONFLICT", "The CFP submission has changed.");
    }
    if (current === undefined) await this.#submissions.create(version.submission);
    else await this.#submissions.update(version.submission.id, version.submission);

    if (audit !== undefined) {
      const auditRecord = {
        ...audit,
        id: `${audit.submissionId}:${audit.occurredAt}`,
      };
      const existingAudit = await this.#audits.find(auditRecord.id);
      if (existingAudit === undefined) await this.#audits.create(auditRecord);
    }
  }
}

export class AirtableEvaluationRepository implements EvaluationRepository {
  readonly #plans: AirtableJsonStore<EvaluationPlan>;
  readonly #assignments: AirtableJsonStore<EvaluationAssignment>;
  readonly #reviews: AirtableJsonStore<EvaluationReview>;
  readonly #conflicts: AirtableJsonStore<EvaluationConflictDeclaration>;
  readonly #decisions: AirtableJsonStore<EvaluationDecision>;

  constructor(options: { readonly baseId: string; readonly transport: AirtableTransport }) {
    const shared = { baseId: options.baseId, transport: options.transport };
    this.#plans = new AirtableJsonStore({
      ...shared,
      table: "Review Plans",
      jsonField: "Rounds JSON",
    });
    this.#assignments = new AirtableJsonStore({
      ...shared,
      table: "Evaluations",
      jsonField: "Scores JSON",
    });
    this.#reviews = new AirtableJsonStore({
      ...shared,
      table: "Evaluations",
      jsonField: "Scores JSON",
    });
    this.#conflicts = new AirtableJsonStore({
      ...shared,
      table: "Evaluations",
      jsonField: "Scores JSON",
    });
    this.#decisions = new AirtableJsonStore({
      ...shared,
      table: "Decisions",
      jsonField: "Metadata JSON",
    });
  }

  async getPlan(tenantId: string, planId: string): Promise<EvaluationPlan | null> {
    const plan = await this.#plans.find(planId);
    return plan !== undefined && plan.tenantId === tenantId ? plan : null;
  }

  async putPlan(plan: EvaluationPlan, expectedVersion: number | null): Promise<void> {
    const existing = await this.#plans.find(plan.id);
    if (
      (existing?.version ?? null) !== expectedVersion ||
      (existing && existing.tenantId !== plan.tenantId)
    ) {
      throw conflict("Evaluation plan changed since it was loaded.");
    }
    if (existing === undefined) await this.#plans.create(plan);
    else await this.#plans.update(plan.id, plan);
  }

  async getAssignment(
    tenantId: string,
    assignmentId: string,
  ): Promise<EvaluationAssignment | null> {
    const assignment = await this.#assignments.find(assignmentId);
    return assignment !== undefined && assignment.tenantId === tenantId ? assignment : null;
  }

  async listAssignments(
    tenantId: string,
    planId: string,
  ): Promise<readonly EvaluationAssignment[]> {
    return (await this.#assignments.list()).filter(
      (assignment) =>
        (entityType(assignment) === undefined
          ? "reviewerId" in assignment && !("scores" in assignment)
          : entityType(assignment) === "evaluation_assignment") &&
        assignment.tenantId === tenantId &&
        assignment.planId === planId,
    );
  }

  async putAssignments(assignments: readonly EvaluationAssignment[]): Promise<void> {
    const existing = (await this.#assignments.list()).filter(
      (assignment) =>
        entityType(assignment) === "evaluation_assignment" ||
        (entityType(assignment) === undefined &&
          "reviewerId" in assignment &&
          !("scores" in assignment)),
    );
    const existingIds = new Set(
      existing.map((assignment) => `${assignment.tenantId}\u0000${assignment.id}`),
    );
    const inputIds = assignments.map(
      (assignment) => `${assignment.tenantId}\u0000${assignment.id}`,
    );
    if (new Set(inputIds).size !== inputIds.length || inputIds.some((id) => existingIds.has(id))) {
      throw conflict("One or more reviewer assignments already exist.");
    }
    for (const assignment of assignments) {
      await this.#assignments.create(tagged(assignment, "evaluation_assignment"));
    }
  }

  async getReview(tenantId: string, assignmentId: string): Promise<EvaluationReview | null> {
    const review = await this.#reviews.find(`review:${assignmentId}`);
    return review !== undefined && review.tenantId === tenantId ? review : null;
  }

  async listReviews(tenantId: string, planId: string): Promise<readonly EvaluationReview[]> {
    return (await this.#reviews.list()).filter(
      (review) =>
        (entityType(review) === undefined
          ? "scores" in review
          : entityType(review) === "evaluation_review") &&
        review.tenantId === tenantId &&
        review.planId === planId,
    );
  }

  async putReview(review: EvaluationReview, expectedVersion: number | null): Promise<void> {
    const id = `review:${review.assignmentId}`;
    const existing = await this.#reviews.find(id);
    if (
      (existing?.version ?? null) !== expectedVersion ||
      (existing && existing.tenantId !== review.tenantId)
    ) {
      throw conflict("Review changed since it was loaded.");
    }
    const storedReview = tagged({ ...review, id }, "evaluation_review");
    if (existing === undefined) await this.#reviews.create(storedReview);
    else await this.#reviews.update(id, storedReview);
  }

  async saveReviewDraft(
    assignment: EvaluationAssignment,
    expectedAssignmentVersion: number,
    review: EvaluationReview,
    expectedReviewVersion: number | null,
  ): Promise<void> {
    const currentAssignment = await this.getAssignment(assignment.tenantId, assignment.id);
    if (currentAssignment?.version !== expectedAssignmentVersion) {
      throw conflict("Assignment changed since it was loaded.");
    }
    await this.putReview(review, expectedReviewVersion);
    await this.#assignments.update(assignment.id, tagged(assignment, "evaluation_assignment"));
  }

  async getConflict(
    tenantId: string,
    assignmentId: string,
  ): Promise<EvaluationConflictDeclaration | null> {
    const declaration = await this.#conflicts.find(`conflict:${assignmentId}`);
    return declaration !== undefined && declaration.tenantId === tenantId ? declaration : null;
  }

  async abstainAssignment(
    assignment: EvaluationAssignment,
    expectedAssignmentVersion: number,
    declaration: EvaluationConflictDeclaration,
  ): Promise<void> {
    const current = await this.getAssignment(assignment.tenantId, assignment.id);
    if (current?.version !== expectedAssignmentVersion)
      throw conflict("Assignment changed since it was loaded.");
    if (await this.getConflict(assignment.tenantId, assignment.id)) {
      throw conflict("A conflict has already been declared for this assignment.");
    }
    await this.#assignments.update(assignment.id, tagged(assignment, "evaluation_assignment"));
    await this.#conflicts.create(
      tagged({ ...declaration, id: `conflict:${assignment.id}` }, "evaluation_conflict"),
    );
  }

  async submitReview(
    assignment: EvaluationAssignment,
    expectedAssignmentVersion: number,
    review: EvaluationReview,
    expectedReviewVersion: number,
  ): Promise<void> {
    const current = await this.getAssignment(assignment.tenantId, assignment.id);
    if (current?.version !== expectedAssignmentVersion)
      throw conflict("Assignment changed since it was loaded.");
    await this.putReview(review, expectedReviewVersion);
    await this.#assignments.update(assignment.id, tagged(assignment, "evaluation_assignment"));
  }

  async getDecision(
    tenantId: string,
    planId: string,
    submissionId: string,
  ): Promise<EvaluationDecision | null> {
    const id = `decision:${planId}:${submissionId}`;
    const decision = await this.#decisions.find(id);
    return decision !== undefined && decision.tenantId === tenantId ? decision : null;
  }

  async putDecision(decision: EvaluationDecision, expectedVersion: number | null): Promise<void> {
    const id = `decision:${decision.planId}:${decision.submissionId}`;
    const existing = await this.#decisions.find(id);
    if (
      (existing?.version ?? null) !== expectedVersion ||
      (existing && existing.tenantId !== decision.tenantId)
    ) {
      throw conflict("Decision changed since it was loaded.");
    }
    const storedDecision = tagged({ ...decision, id }, "evaluation_decision");
    if (existing === undefined) await this.#decisions.create(storedDecision);
    else await this.#decisions.update(id, storedDecision);
  }

  async findPlanForTenant(tenantId: string, planId: string): Promise<EvaluationPlan | null> {
    return this.getPlan(tenantId, planId);
  }
  async findAssignmentForTenant(
    tenantId: string,
    assignmentId: string,
  ): Promise<EvaluationAssignment | null> {
    return this.getAssignment(tenantId, assignmentId);
  }
}

export class AirtableSubmissionReviewSource implements SubmissionReviewSource {
  readonly #cfp: AirtableCfpRepository;

  constructor(cfp: AirtableCfpRepository) {
    this.#cfp = cfp;
  }

  async getSubmissionForReview(
    tenantId: string,
    eventId: string,
    submissionId: string,
  ): Promise<SubmissionReviewMaterial | null> {
    const submission = await this.#cfp.getSubmission(tenantId, submissionId);
    if (submission === null || submission.eventId !== eventId) return null;
    const form = await this.#cfp.getForm(tenantId, submission.formId);
    const answers = isRecord(submission.answers) ? submission.answers : {};
    const titleCandidate = answers.title ?? answers.sessionTitle;
    const abstractCandidate = answers.abstract ?? answers.description;
    const identityFieldIds =
      form?.submissionFields
        .filter((field) => field.kind === "email" || /email|name/iu.test(field.key))
        .flatMap((field) => [field.id, field.key]) ?? [];
    return {
      id: submission.id,
      tenantId,
      eventId,
      title: typeof titleCandidate === "string" ? titleCandidate : submission.id,
      abstract: typeof abstractCandidate === "string" ? abstractCandidate : "",
      answers,
      identityFieldIds,
      participants: submission.participants.map((participant) => ({
        id: participant.id,
        displayName: `${participant.firstName} ${participant.lastName}`.trim(),
        email: participant.email,
        biography: participant.biography,
      })),
    };
  }
}

interface StoredAgendaEntry {
  id: string;
  eventId: string;
  entry: AgendaEntry;
}
export class AirtableAgendaRepository {
  readonly #store: AirtableJsonStore<AgendaState>;
  readonly #entries: AirtableJsonStore<StoredAgendaEntry>;

  constructor(options: { readonly baseId: string; readonly transport: AirtableTransport }) {
    this.#store = new AirtableJsonStore({
      baseId: options.baseId,
      table: "Agenda Versions",
      jsonField: "Conflicts JSON",
      transport: options.transport,
    });
    this.#entries = new AirtableJsonStore({
      baseId: options.baseId,
      table: "Agenda Entries",
      jsonField: "Metadata JSON",
      transport: options.transport,
    });
  }

  async load(eventId: string): Promise<AgendaState | null> {
    const state = await this.#store.find(eventId);
    if (state === undefined || state.eventId !== eventId) return null;
    const entries = (await this.#entries.list()).filter((entry) => entry.eventId === eventId);
    return entries.length === 0
      ? state
      : {
          ...state,
          draft: {
            ...state.draft,
            entries: entries.map((entry) => entry.entry),
          },
        };
  }

  async compareAndSwap(
    eventId: string,
    expectedStateVersion: number | null,
    nextState: AgendaState,
  ): Promise<void> {
    const current = await this.#store.find(eventId);
    if ((current?.stateVersion ?? null) !== expectedStateVersion) {
      throw new AgendaRepositoryConflictError(eventId);
    }
    if (nextState.eventId !== eventId) {
      throw new TypeError(`Cannot save agenda ${nextState.eventId} under event ${eventId}.`);
    }
    if (current === undefined) await this.#store.create(nextState);
    else await this.#store.update(eventId, nextState);

    const existingEntries = (await this.#entries.list()).filter(
      (entry) => entry.eventId === eventId,
    );
    const nextEntries = new Map(
      nextState.draft.entries.map((entry) => [
        `${eventId}:${entry.id}`,
        { id: `${eventId}:${entry.id}`, eventId, entry },
      ]),
    );
    for (const entry of existingEntries) {
      if (!nextEntries.has(entry.id)) await this.#entries.delete(entry.id);
    }
    for (const [id, entry] of nextEntries) {
      const existing = existingEntries.find((candidate) => candidate.id === id);
      if (existing === undefined) await this.#entries.create(entry);
      else await this.#entries.update(id, entry);
    }
  }
}

/** Durable Object admission plus an in-process tail protects one event's agenda mutations. */
export class CloudflareAgendaMutationLock implements DurableObjectAgendaCoordinator {
  readonly #namespace: DurableObjectNamespace;
  readonly #tails = new Map<string, Promise<void>>();

  constructor(namespace: DurableObjectNamespace) {
    this.#namespace = namespace;
  }

  async runExclusive<T>(eventId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.#tails.get(eventId) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.#tails.set(eventId, current);
    await previous;
    try {
      const stub = this.#namespace.get(this.#namespace.idFromName(eventId));
      const revisionResponse = await stub.fetch(new Request("https://agenda/revision"));
      const revisionBody: unknown = await revisionResponse.json();
      const revision =
        isRecord(revisionBody) && typeof revisionBody.revision === "number"
          ? revisionBody.revision
          : null;
      if (!revisionResponse.ok || revision === null) {
        throw new AgendaRepositoryConflictError(eventId);
      }
      const admission = await stub.fetch(
        new Request("https://agenda/mutations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            operationId: `agenda:${eventId}:${crypto.randomUUID()}`,
            expectedRevision: revision,
          }),
        }),
      );
      if (!admission.ok) throw new AgendaRepositoryConflictError(eventId);
      return await operation();
    } finally {
      release();
      if (this.#tails.get(eventId) === current) this.#tails.delete(eventId);
    }
  }
}

export class D1IdempotencyStore implements IdempotencyStore, CfpIdempotencyCoordinator {
  readonly #database: D1Database;
  readonly #leaseMs: number;

  constructor(database: D1Database, options: { readonly leaseMs?: number } = {}) {
    this.#database = database;
    this.#leaseMs = options.leaseMs ?? 30_000;
  }

  async begin(input: {
    scope: string;
    key: string;
    fingerprint: string;
  }): Promise<IdempotencyBeginResult> {
    const tenantId = tenantFromScope(input.scope);
    const now = new Date();
    const existing = await this.#database
      .prepare(
        `SELECT request_digest, state, response_status, response_json, expires_at
           FROM idempotency_records
          WHERE tenant_id = ? AND scope = ? AND idempotency_key = ?`,
      )
      .bind(tenantId, input.scope, input.key)
      .first<{
        request_digest: string;
        state: string;
        response_status: number | null;
        response_json: string | null;
        expires_at: string;
      }>();
    if (existing !== null && Date.parse(existing.expires_at) > now.getTime()) {
      if (existing.request_digest !== input.fingerprint) return { status: "conflict" };
      if (existing.state === "completed" && existing.response_json !== null) {
        return {
          status: "replay",
          response: {
            status: existing.response_status ?? 200,
            body: parseStoredJson(existing.response_json),
          },
        };
      }
      if (existing.state === "processing") {
        return {
          status: "pending",
          wait: () => this.waitForCompletion(tenantId, input),
        };
      }
    }
    if (existing !== null) {
      await this.#database
        .prepare(
          `DELETE FROM idempotency_records
            WHERE tenant_id = ? AND scope = ? AND idempotency_key = ?`,
        )
        .bind(tenantId, input.scope, input.key)
        .run();
    }
    const leaseId = crypto.randomUUID();
    try {
      await this.#database
        .prepare(
          `INSERT INTO idempotency_records
             (tenant_id, scope, idempotency_key, request_digest, state, created_at, expires_at)
           VALUES (?, ?, ?, ?, 'processing', ?, ?)`,
        )
        .bind(
          tenantId,
          input.scope,
          input.key,
          input.fingerprint,
          now.toISOString(),
          new Date(now.getTime() + this.#leaseMs).toISOString(),
        )
        .run();
    } catch {
      const raced = await this.begin(input);
      if (raced.status === "acquired") {
        return {
          status: "pending",
          wait: () => this.waitForCompletion(tenantId, input),
        };
      }
      return raced;
    }
    return { status: "acquired", leaseId };
  }

  async complete(input: {
    scope: string;
    key: string;
    fingerprint: string;
    leaseId?: string;
    response: IdempotencyStoredResponse;
  }): Promise<void> {
    const tenantId = tenantFromScope(input.scope);
    await this.#database
      .prepare(
        `UPDATE idempotency_records
            SET state = 'completed', response_status = ?, response_json = ?, expires_at = ?
          WHERE tenant_id = ? AND scope = ? AND idempotency_key = ? AND request_digest = ?`,
      )
      .bind(
        input.response.status,
        JSON.stringify(input.response.body),
        new Date(Date.now() + 86_400_000).toISOString(),
        tenantId,
        input.scope,
        input.key,
        input.fingerprint,
      )
      .run();
  }

  async release(input: {
    scope: string;
    key: string;
    fingerprint: string;
    leaseId?: string;
  }): Promise<void> {
    await this.#database
      .prepare(
        `DELETE FROM idempotency_records
          WHERE tenant_id = ? AND scope = ? AND idempotency_key = ? AND request_digest = ?`,
      )
      .bind(tenantFromScope(input.scope), input.scope, input.key, input.fingerprint)
      .run();
  }

  async run<T>(scope: string, key: string, operation: () => Promise<T>): Promise<T> {
    const fingerprint = `cfp:${scope}:${key}`;
    const claim = await this.begin({ scope, key, fingerprint });
    if (claim.status === "replay") return claim.response.body as T;
    if (claim.status === "conflict")
      throw new CfpError(
        "CONFLICT",
        "The idempotency key was already used with a different request.",
      );
    if (claim.status === "pending") return (await claim.wait()).body as T;
    try {
      const value = await operation();
      await this.complete({ scope, key, fingerprint, response: { status: 200, body: value } });
      return value;
    } catch (error) {
      await this.release({ scope, key, fingerprint });
      throw error;
    }
  }

  private async waitForCompletion(
    tenantId: string,
    input: { scope: string; key: string; fingerprint: string },
  ): Promise<IdempotencyStoredResponse> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const row = await this.#database
        .prepare(
          `SELECT request_digest, state, response_status, response_json
             FROM idempotency_records
            WHERE tenant_id = ? AND scope = ? AND idempotency_key = ?`,
        )
        .bind(tenantId, input.scope, input.key)
        .first<{
          request_digest: string;
          state: string;
          response_status: number | null;
          response_json: string | null;
        }>();
      if (row === null) throw new Error("The idempotency operation expired before completion.");
      if (row.request_digest !== input.fingerprint)
        throw new CfpError(
          "CONFLICT",
          "The idempotency key was already used with a different request.",
        );
      if (row.state === "completed" && row.response_json !== null) {
        return { status: row.response_status ?? 200, body: parseStoredJson(row.response_json) };
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error("The idempotency operation did not complete in time.");
  }
}

function tenantFromScope(scope: string): string {
  const tenant = scope.split(":", 1)[0]?.trim();
  return tenant === undefined || tenant.length === 0 ? "runtime" : tenant;
}

function parseStoredJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error("Stored idempotency response is invalid.");
  }
}

export class CloudflareCfpEffects implements CfpEffects {
  readonly #queue: Queue<CloudflareOutboxMessage>;
  readonly #database: D1Database;

  constructor(queue: Queue<CloudflareOutboxMessage>, database: D1Database) {
    this.#queue = queue;
    this.#database = database;
  }

  async enqueueSubmissionConfirmation(input: {
    submission: Submission;
    form: CfpForm;
    idempotencyKey: string;
  }): Promise<void> {
    const jobId = `submission-confirmation:${input.idempotencyKey}`;
    const now = new Date().toISOString();
    const payload = {
      from: "speakers@foreverbrowsing.com" as const,
      to: input.submission.participants
        .map((participant) => participant.email)
        .filter((email) => email.trim().length > 0),
      subject: "Your Open Sessionboard submission was received",
      html: "<p>Your submission was received and is now available to the event team.</p>",
      text: "Your submission was received and is now available to the event team.",
      idempotencyKey: input.idempotencyKey,
    };
    await this.#database
      .prepare(
        `INSERT INTO outbox_jobs
           (id, tenant_id, topic, deduplication_key, payload_json, state,
            attempt_count, available_at, created_at, updated_at)
         VALUES (?, ?, 'communications', ?, ?, 'pending', 0, ?, ?, ?)
         ON CONFLICT (tenant_id, topic, deduplication_key) DO NOTHING`,
      )
      .bind(
        jobId,
        input.submission.tenantId,
        input.idempotencyKey,
        JSON.stringify(payload),
        now,
        now,
        now,
      )
      .run();
    await this.#queue.send({
      version: 1,
      jobId,
      tenantId: input.submission.tenantId,
      topic: "communications",
      enqueuedAt: now,
    });
  }
}

export interface AirtableRuntimeOptions {
  readonly authenticator: Pick<RequestAuthenticator, "authenticate">;
  readonly baseId: string;
  readonly transport: AirtableTransport;
  readonly database: D1Database;
  readonly agendaCoordinator: DurableObjectNamespace;
  readonly privateFiles: R2Bucket;
  readonly outboxQueue: Queue<CloudflareOutboxMessage>;
  readonly webOrigin: string;
}

class AirtablePublicRepository implements PublicApiRepository {
  readonly #store: AirtableJsonStore<JsonRecord>;

  constructor(options: {
    readonly baseId: string;
    readonly table: string;
    readonly transport: AirtableTransport;
    readonly jsonField?: string;
  }) {
    this.#store = new AirtableJsonStore(options);
  }

  async list(input: PublicApiListInput): Promise<PublicApiListResult<JsonRecord>> {
    const records = (await this.#store.list()).filter((record) => {
      const tenant = record.organizationId ?? record.tenantId;
      return (
        tenant === input.organizationId &&
        Object.entries(input.filters).every(
          ([key, value]) => String(record[key] ?? "") === value,
        ) &&
        isAfterCursor(record, input)
      );
    });
    return { items: records.map(publicRecord), hasMore: false, nextCursor: null };
  }

  async get(input: PublicApiGetInput): Promise<JsonRecord | null> {
    const record = await this.#store.find(input.id);
    if (record === undefined) return null;
    const tenant = record.organizationId ?? record.tenantId;
    return tenant === input.organizationId ? publicRecord(record) : null;
  }

  async create(input: PublicApiCreateInput<JsonRecord>): Promise<JsonRecord> {
    const requestedId = typeof input.data.id === "string" ? input.data.id.trim() : "";
    const record: JsonRecord = {
      ...clone(input.data),
      id: requestedId || randomResourceId(input.resource),
      organizationId: input.organizationId,
      version: 1,
      updatedAt: new Date().toISOString(),
    };
    await this.#store.create(record);
    return record;
  }

  async update(input: PublicApiUpdateInput<JsonRecord>): Promise<JsonRecord | null> {
    const current = await this.get({ ...input, id: input.id });
    if (current === null || current.version !== input.expectedVersion) return null;
    const updated: JsonRecord = {
      ...current,
      ...clone(input.data),
      id: input.id,
      organizationId: input.organizationId,
      version: input.expectedVersion + 1,
      updatedAt: new Date().toISOString(),
    };
    await this.#store.update(input.id, updated);
    return updated;
  }
}
class AirtableAgendaPublicRepository implements PublicApiRepository {
  readonly #states: AirtableJsonStore<AgendaState>;
  readonly #events: AirtableJsonStore<EventCfp>;
  readonly #generic: AirtablePublicRepository;

  constructor(options: {
    readonly baseId: string;
    readonly transport: AirtableTransport;
    readonly events: AirtableJsonStore<EventCfp>;
  }) {
    this.#states = new AirtableJsonStore({
      baseId: options.baseId,
      table: "Agenda Versions",
      jsonField: "Conflicts JSON",
      transport: options.transport,
    });
    this.#events = options.events;
    this.#generic = new AirtablePublicRepository({
      baseId: options.baseId,
      table: "Agenda Versions",
      jsonField: "Conflicts JSON",
      transport: options.transport,
    });
  }

  private async project(state: AgendaState): Promise<JsonRecord | null> {
    const event = await this.#events.find(state.eventId);
    const eventRecord: unknown = event;
    const organizationId =
      event?.tenantId ?? (isRecord(eventRecord) ? eventRecord.organizationId : undefined);
    if (typeof organizationId !== "string" || organizationId.length === 0) return null;
    const currentRevision =
      state.currentPublishedRevisionId === null
        ? null
        : (state.revisions.find((revision) => revision.id === state.currentPublishedRevisionId) ??
          null);
    return {
      id: state.eventId,
      organizationId,
      version: state.draft.version,
      revision: currentRevision?.revisionNumber ?? 0,
      updatedAt: state.draft.updatedAt,
      ...(currentRevision === null ? {} : { publishedAt: currentRevision.publishedAt }),
    };
  }

  async list(input: PublicApiListInput): Promise<PublicApiListResult<JsonRecord>> {
    const states = await this.#states.list();
    const items: JsonRecord[] = [];
    for (const state of states) {
      const projected = await this.project(state);
      if (
        projected !== null &&
        projected.organizationId === input.organizationId &&
        Object.entries(input.filters).every(
          ([key, value]) => String(projected[key] ?? "") === value,
        ) &&
        isAfterCursor(projected, input)
      ) {
        items.push(projected);
      }
    }
    return { items, hasMore: false, nextCursor: null };
  }

  async get(input: PublicApiGetInput): Promise<JsonRecord | null> {
    const state = await this.#states.find(input.id);
    if (state === undefined) return null;
    const projected = await this.project(state);
    return projected?.organizationId === input.organizationId ? projected : null;
  }

  create(input: PublicApiCreateInput<JsonRecord>): Promise<JsonRecord> {
    return this.#generic.create(input);
  }

  update(input: PublicApiUpdateInput<JsonRecord>): Promise<JsonRecord | null> {
    return this.#generic.update(input);
  }
}

function eventIdFromRequest(request: Request): string | undefined {
  const bodyPath = /\/events\/([^/]+)/u.exec(new URL(request.url).pathname)?.[1];
  if (bodyPath !== undefined) return decodeURIComponent(bodyPath);
  return undefined;
}

export function createAirtableDependencies(options: AirtableRuntimeOptions): ApiDependencies {
  const shared = { baseId: options.baseId, transport: options.transport };
  const cfpRepository = new AirtableCfpRepository(shared);
  const cfpIdempotency = new D1IdempotencyStore(options.database);
  const cfpService = new CfpService({
    repository: cfpRepository,
    idempotency: cfpIdempotency,
    effects: new CloudflareCfpEffects(options.outboxQueue, options.database),
  });

  const evaluationRepository = new AirtableEvaluationRepository(shared);
  const evaluationService = new EvaluationService(
    evaluationRepository,
    new AirtableSubmissionReviewSource(cfpRepository),
  );
  const evaluationDependencies: EvaluationRouteDependencies = {
    service: evaluationService,
    async actorFor(principal: AuthPrincipal, request: Request) {
      if (principal.kind !== "user") return null;
      const body = await request
        .clone()
        .json<unknown>()
        .catch(() => undefined);
      let eventId = isRecord(body) && typeof body.eventId === "string" ? body.eventId : undefined;
      if (eventId === undefined) {
        eventId = eventIdFromRequest(request);
      }
      if (eventId === undefined) {
        const planId = /\/plans\/([^/]+)/u.exec(new URL(request.url).pathname)?.[1];
        if (planId !== undefined) {
          for (const membership of principal.memberships) {
            const plan = await evaluationRepository.findPlanForTenant(
              membership.organizationId,
              decodeURIComponent(planId),
            );
            if (plan !== null) {
              eventId = plan.eventId;
              break;
            }
          }
        }
      }
      if (eventId === undefined) {
        const assignmentId = /\/assignments\/([^/]+)/u.exec(new URL(request.url).pathname)?.[1];
        if (assignmentId !== undefined) {
          for (const membership of principal.memberships) {
            const assignment = await evaluationRepository.findAssignmentForTenant(
              membership.organizationId,
              decodeURIComponent(assignmentId),
            );
            if (assignment !== null) {
              eventId = assignment.eventId;
              break;
            }
          }
        }
      }
      if (eventId === undefined || eventId.trim().length === 0) return null;
      let membership = principal.memberships.length === 1 ? principal.memberships[0] : undefined;
      if (membership === undefined) {
        for (const candidate of principal.memberships) {
          const event = await cfpRepository.getEvent(candidate.organizationId, eventId);
          if (event !== null) {
            membership = candidate;
            break;
          }
        }
      }
      if (membership === undefined) return null;
      const organizer = membership.role === "owner" || membership.role === "admin";
      return {
        tenantId: membership.organizationId,
        userId: principal.userId,
        kind: "human",
        grants: [
          ...(organizer ? [{ eventId, role: "organizer" as const }] : []),
          ...(organizer || membership.role === "reviewer"
            ? [{ eventId, role: "reviewer" as const }]
            : []),
        ],
      };
    },
  };

  const speakerRepository = new AirtableSpeakerRepository({
    ...shared,
    database: options.database,
  });
  const speakerService = new SpeakerService(
    speakerRepository,
    new R2PrivateAssetGateway(options.privateFiles, options.webOrigin),
  );
  const authenticator = options.authenticator;

  const agendaRepository = new AirtableAgendaRepository(shared);
  const agendaEngine = new AgendaEngine(
    agendaRepository,
    new CloudflareAgendaMutationLock(options.agendaCoordinator),
  );
  const events = new AirtableJsonStore<EventCfp>({
    ...shared,
    table: "Events",
    jsonField: "Settings JSON",
  });
  const webhooks = new AirtableWebhookRepository(shared);
  const eventsRepository = new AirtablePublicRepository({
    ...shared,
    table: "Events",
    jsonField: "Settings JSON",
  });
  const speakersRepository = new AirtablePublicRepository({
    ...shared,
    table: "Participants",
    jsonField: "First Name",
  });
  const agendaPublicRepository = new AirtableAgendaPublicRepository({
    ...shared,
    events,
  });
  const publicIdempotency = createIdempotencyCoordinator(new D1IdempotencyStore(options.database));

  return {
    authenticator,
    speaker: {
      service: speakerService,
      async authenticate(request: Request) {
        const principal = await authenticator.authenticate(request).catch(() => null);
        return principal?.kind === "user" ? { accountId: principal.userId } : null;
      },
    },
    evaluations: evaluationDependencies,
    agenda: {
      engine: agendaEngine,
      async organizationIdForEvent(eventId: string) {
        const event = await events.find(eventId);
        const eventRecord: unknown = event;
        const organizationId =
          event?.tenantId ?? (isRecord(eventRecord) ? eventRecord.organizationId : undefined);
        return typeof organizationId === "string" ? organizationId : null;
      },
    },
    publicApi: {
      resources: [
        {
          name: "events",
          repository: eventsRepository,
          readScope: "events:read",
          writeScope: "events:write",
          sortFields: ["id", "name", "updatedAt"],
          defaultSort: "id",
        },
        {
          name: "speakers",
          repository: speakersRepository,
          readScope: "submissions:read",
          writeScope: "submissions:write",
          sortFields: ["id", "displayName", "updatedAt"],
          defaultSort: "id",
        },
        {
          name: "agenda",
          repository: agendaPublicRepository,
          readScope: "agenda:read",
          writeScope: "agenda:write",
          sortFields: ["id", "updatedAt"],
          defaultSort: "id",
        },
      ],
      idempotency: publicIdempotency,
    },
    webhooks,
    cfp: { service: cfpService },
  };
}
