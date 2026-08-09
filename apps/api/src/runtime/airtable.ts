import type {
  D1Database,
  DurableObjectNamespace,
  Queue,
  R2Bucket,
} from "@cloudflare/workers-types";
import type { ApiDependencies, EvaluationRouteDependencies } from "../app";
import { AgendaEngine } from "../features/agenda/engine";
import {
  AgendaRepositoryConflictError,
  type DurableObjectAgendaCoordinator,
} from "../features/agenda/infrastructure";
import type { AgendaEntry, AgendaState } from "../features/agenda/types";
import type { RequestAuthenticator } from "../features/auth/authenticator";
import type { AuthPrincipal } from "../features/auth/types";
import type {
  AuditEntry,
  CfpForm,
  EventCfp,
  Submission,
  SubmissionParticipant,
  SubmissionVersion,
} from "../features/cfp/model";
import {
  type CfpEffects,
  CfpError,
  type CfpIdempotencyCoordinator,
  type CfpRepository,
  CfpService,
} from "../features/cfp/service";
import { conflict } from "../features/evaluations/errors";
import type {
  EvaluationRepository,
  SubmissionReviewSource,
} from "../features/evaluations/repository";
import type {
  EvaluationAcceptanceHandoff,
  EvaluationAcceptanceHandoffInput,
  EvaluationSubmissionRecord,
  EvaluationSubmissionSource,
} from "../features/evaluations/service";
import { EvaluationService } from "../features/evaluations/service";
import type {
  EvaluationAssignment,
  EvaluationConflictDeclaration,
  EvaluationDecision,
  EvaluationPlan,
  EvaluationReview,
  SubmissionReviewMaterial,
} from "../features/evaluations/types";
import type {
  IdempotencyBeginResult,
  IdempotencyStore,
  IdempotencyStoredResponse,
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
import {
  type AirtableMapper,
  AirtableRepository,
  type AirtableTransport,
} from "../infrastructure/airtable";
import type { CloudflareOutboxMessage } from "../infrastructure/cloudflare/bindings";
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
import type {
  OrganizerOverviewActionItem,
  OrganizerOverviewData,
  OrganizerOverviewEvent,
  OrganizerOverviewRouteDependencies,
} from "../routes/organizer-overview";
import type {
  PublishedSpeakerProjection,
  PublishedSpeakerRouteDependencies,
} from "../routes/public-speakers";

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

function isSpeakerSubmissionRecord(value: object): boolean {
  const kind = entityType(value);
  if (kind !== undefined) return kind === "speaker_submission";
  return !("formId" in value);
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
function isEvaluationAssignmentRecord(value: object): boolean {
  const kind = entityType(value);
  return (
    kind === "evaluation_assignment" ||
    (kind === undefined && "reviewerId" in value && !("scores" in value))
  );
}

function isEvaluationReviewRecord(value: object): boolean {
  const kind = entityType(value);
  return kind === "evaluation_review" || (kind === undefined && "scores" in value);
}

function textValue(record: JsonRecord, ...keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

function eventReference(record: JsonRecord): string | null {
  return textValue(record, "eventId", "eventID", "event");
}

function belongsToOrganization(
  record: JsonRecord,
  organizationId: string,
  eventIds: ReadonlySet<string>,
): boolean {
  const recordOrganizationId = organizationIdOf(record);
  if (recordOrganizationId !== undefined) return recordOrganizationId === organizationId;
  const eventId = eventReference(record);
  return eventId !== null && eventIds.has(eventId);
}

function dueAtValue(record: JsonRecord): string | null {
  const candidate = textValue(record, "dueAt", "closesAt", "endsAt", "deadline");
  return candidate !== null && Number.isNaN(Date.parse(candidate)) === false ? candidate : null;
}

function earliestDueAt(values: readonly (string | null)[]): string | null {
  return (
    values
      .filter((value): value is string => value !== null)
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

function actionItem(
  input: Omit<OrganizerOverviewActionItem, "dueAt"> & { dueAt?: string | null },
): OrganizerOverviewActionItem {
  return { ...input, dueAt: input.dueAt ?? null };
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
export const PUBLISHED_SPEAKER_PROJECTIONS_TABLE = "Published Speaker Projections";

interface PublishedSpeakerProjectionRecord extends PublishedSpeakerProjection {
  readonly id: string;
  readonly organizationId: string;
}

/**
 * Read-only adapter for the materialized publication table. The route never
 * falls back to Participants, speaker profiles, drafts, or review records.
 */
class AirtablePublishedSpeakerProjectionStore implements PublishedSpeakerRouteDependencies {
  readonly #store: AirtableJsonStore<PublishedSpeakerProjectionRecord>;

  constructor(options: {
    readonly baseId: string;
    readonly transport: AirtableTransport;
  }) {
    this.#store = new AirtableJsonStore({
      ...options,
      table: PUBLISHED_SPEAKER_PROJECTIONS_TABLE,
      jsonField: "Projection JSON",
    });
  }

  async getPublishedSpeakers(eventSlug: string): Promise<PublishedSpeakerProjection | null> {
    const normalizedSlug = eventSlug.trim();
    if (normalizedSlug.length === 0) return null;
    const matches = (await this.#store.list()).filter(
      (record) => record.event.slug === normalizedSlug && record.organizationId.trim().length > 0,
    );
    if (matches.length !== 1) return null;
    const record = matches[0];
    if (record === undefined) return null;
    return {
      event: {
        slug: record.event.slug,
        name: record.event.name,
        timeZone: record.event.timeZone,
        startsOn: record.event.startsOn,
        endsOn: record.event.endsOn,
        venueName: record.event.venueName,
      },
      revision: {
        id: record.revision.id,
        number: record.revision.number,
        publishedAt: record.revision.publishedAt,
      },
      speakers: record.speakers.map((speaker) => ({
        id: speaker.id,
        displayName: speaker.displayName,
        pronouns: speaker.pronouns,
        jobTitle: speaker.jobTitle,
        organization: speaker.organization,
        biography: speaker.biography,
        photoUrl: speaker.photoUrl,
        sessionIds: [...speaker.sessionIds],
        sessionTitles: [...speaker.sessionTitles],
        trackNames: [...speaker.trackNames],
      })),
    };
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
        isSpeakerSubmissionRecord(submission) &&
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
      (submission) =>
        isSpeakerSubmissionRecord(submission) &&
        submission.eventId === eventId &&
        allowed.has(submission.id),
    );
  }

  async getSubmission(eventId: string, submissionId: string): Promise<SpeakerSubmission | null> {
    const submission = await this.#submissions.find(submissionId);
    return submission !== undefined &&
      isSpeakerSubmissionRecord(submission) &&
      submission.eventId === eventId
      ? submission
      : null;
  }
  async ensureAcceptedSubmission(input: {
    readonly submission: Submission;
    readonly updatedAt: string;
  }): Promise<SpeakerSubmission> {
    const id = `speaker-submission:${input.submission.id}`;
    const answers = isRecord(input.submission.answers) ? input.submission.answers : {};
    const titleCandidate = answers.title ?? answers.sessionTitle;
    const next: SpeakerSubmission = tagged(
      {
        id,
        eventId: input.submission.eventId,
        title: typeof titleCandidate === "string" && titleCandidate.trim() ? titleCandidate : id,
        status: "accepted",
        participantIds: input.submission.participants.map((participant) => participant.id),
        updatedAt: input.updatedAt,
      },
      "speaker_submission",
    );
    const existing = await this.#submissions.find(id);
    if (existing === undefined) {
      await this.#submissions.create(next);
      return clone(next);
    }
    if (existing.eventId !== next.eventId) {
      throw new Error("The accepted speaker submission belongs to another event.");
    }
    const updated = { ...existing, ...next };
    if (existing.status !== "accepted" || existing.updatedAt !== next.updatedAt) {
      await this.#submissions.update(id, updated);
    }
    return clone(updated);
  }

  async ensureProfile(input: {
    readonly eventId: string;
    readonly participant: SubmissionParticipant;
    readonly updatedAt: string;
  }): Promise<SpeakerProfile> {
    const id = `speaker-profile:${input.eventId}:${input.participant.id}`;
    const existing = await this.getProfile(input.eventId, input.participant.id);
    if (existing !== null) return existing;
    const profile = tagged(
      {
        id,
        eventId: input.eventId,
        participantId: input.participant.id,
        displayName: `${input.participant.firstName} ${input.participant.lastName}`.trim(),
        biography: input.participant.biography,
        version: 1,
        updatedAt: input.updatedAt,
      },
      "speaker_profile",
    );
    await this.#profiles.create(profile);
    return clone(profile);
  }

  async ensureProfileTask(input: {
    readonly eventId: string;
    readonly submissionId: string;
    readonly participantId: string;
    readonly updatedAt: string;
  }): Promise<SpeakerTask> {
    const id = `speaker-task:${input.eventId}:${input.submissionId}:${input.participantId}:profile`;
    const existing = await this.#tasks.find(id);
    if (existing !== undefined) return existing;
    const task = tagged(
      {
        id,
        eventId: input.eventId,
        submissionId: `speaker-submission:${input.submissionId}`,
        participantId: input.participantId,
        type: "form" as const,
        owner: "speaker" as const,
        title: "Complete your speaker profile",
        description: "Review your public name and biography before the program is published.",
        status: "not_started" as const,
        dependencyIds: [],
        reminderOffsetsMinutes: [10080, 1440],
        version: 1,
        updatedAt: input.updatedAt,
      },
      "speaker_task",
    );
    await this.#tasks.create(task);
    return clone(task);
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
  async listSubmissionsForEvent(tenantId: string, eventId: string): Promise<Submission[]> {
    return (await this.#submissions.list()).filter(
      (submission) =>
        submission.formId !== undefined &&
        submission.tenantId === tenantId &&
        submission.eventId === eventId,
    );
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
  async listPlans(tenantId: string, eventId?: string): Promise<readonly EvaluationPlan[]> {
    return (await this.#plans.list()).filter(
      (plan) => plan.tenantId === tenantId && (eventId === undefined || plan.eventId === eventId),
    );
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

export class AirtableSubmissionReviewSource
  implements SubmissionReviewSource, EvaluationSubmissionSource
{
  readonly #cfp: AirtableCfpRepository;
  readonly #cfpService: CfpService | undefined;

  constructor(cfp: AirtableCfpRepository, cfpService?: CfpService) {
    this.#cfp = cfp;
    this.#cfpService = cfpService;
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

  async listSubmissionsForOrganizer(
    tenantId: string,
    eventId: string,
  ): Promise<readonly EvaluationSubmissionRecord[]> {
    const submissions = await this.#cfp.listSubmissionsForEvent(tenantId, eventId);
    return submissions.map((submission) => this.toAdminRecord(submission));
  }

  async reopenSubmission(
    tenantId: string,
    eventId: string,
    submissionId: string,
    input: {
      readonly organizerId: string;
      readonly expectedVersion: number;
      readonly reason: string;
      readonly idempotencyKey: string;
    },
  ): Promise<EvaluationSubmissionRecord> {
    if (this.#cfpService === undefined) {
      throw new Error("CFP reopen service is not configured.");
    }
    const submission = await this.#cfpService.reopen({
      tenantId,
      submissionId,
      organizerId: input.organizerId,
      expectedVersion: input.expectedVersion,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
    });
    if (submission.eventId !== eventId) {
      throw new Error("The submission does not belong to the requested event.");
    }
    return this.toAdminRecord(submission);
  }

  private toAdminRecord(submission: Submission): EvaluationSubmissionRecord {
    const answers = isRecord(submission.answers) ? submission.answers : {};
    const titleCandidate = answers.title ?? answers.sessionTitle;
    const abstractCandidate = answers.abstract ?? answers.description;
    return {
      id: submission.id,
      tenantId: submission.tenantId,
      eventId: submission.eventId,
      title: typeof titleCandidate === "string" ? titleCandidate : submission.id,
      abstract: typeof abstractCandidate === "string" ? abstractCandidate : "",
      answers,
      participants: submission.participants.map((participant) => ({
        id: participant.id,
        displayName: `${participant.firstName} ${participant.lastName}`.trim(),
        email: participant.email,
        biography: participant.biography,
      })),
      status: submission.status,
      version: submission.version,
      submittedAt: submission.submittedAt ?? null,
      updatedAt: submission.updatedAt,
      reopenedAt: submission.reopenedAt ?? null,
    };
  }
}
export class AirtableEvaluationAcceptanceHandoff implements EvaluationAcceptanceHandoff {
  readonly #cfp: AirtableCfpRepository;
  readonly #speakers: AirtableSpeakerRepository;
  readonly #database: D1Database;
  readonly #queue: Queue<CloudflareOutboxMessage>;

  constructor(options: {
    readonly cfp: AirtableCfpRepository;
    readonly speakers: AirtableSpeakerRepository;
    readonly database: D1Database;
    readonly queue: Queue<CloudflareOutboxMessage>;
  }) {
    this.#cfp = options.cfp;
    this.#speakers = options.speakers;
    this.#database = options.database;
    this.#queue = options.queue;
  }

  async accept(input: EvaluationAcceptanceHandoffInput): Promise<void> {
    const idempotency = new D1IdempotencyStore(this.#database);
    const scope = `${input.tenantId}:evaluation-acceptance`;
    const key = `acceptance:${input.submissionId}`;
    await idempotency.run(scope, key, async () => {
      const submission = await this.#cfp.getSubmission(input.tenantId, input.submissionId);
      if (submission === null || submission.eventId !== input.eventId) {
        throw new Error("The accepted submission was not found for the event.");
      }
      if (submission.participants.length === 0) {
        throw new Error("An accepted submission must contain at least one speaker.");
      }
      const recipients = submission.participants
        .map((participant) => participant.email.trim())
        .filter((email) => email.length > 0);
      if (recipients.length !== submission.participants.length) {
        throw new Error("Every accepted speaker must have a portal email address.");
      }
      const users = new Map<string, string>();
      for (const participant of submission.participants) {
        const user = await this.#database
          .prepare(
            `SELECT id
               FROM auth_users
              WHERE LOWER(email) = LOWER(?)
                AND email_verified = 1
              LIMIT 1`,
          )
          .bind(participant.email.trim())
          .first<{ id: string }>();
        if (user === null || user.id.trim().length === 0) {
          throw new Error(
            `No verified portal account exists for accepted speaker ${participant.email || participant.id}.`,
          );
        }
        users.set(participant.id, user.id);
      }

      await this.#speakers.ensureAcceptedSubmission({
        submission,
        updatedAt: input.decidedAt,
      });

      const profiles = [];
      for (const participant of submission.participants) {
        const profile = await this.#speakers.ensureProfile({
          eventId: input.eventId,
          participant,
          updatedAt: input.decidedAt,
        });
        await this.#speakers.ensureProfileTask({
          eventId: input.eventId,
          submissionId: input.submissionId,
          participantId: participant.id,
          updatedAt: input.decidedAt,
        });
        const userId = users.get(participant.id);
        if (userId === undefined) {
          throw new Error(
            `Portal account lookup disappeared for accepted speaker ${participant.id}.`,
          );
        }
        await this.#database
          .prepare(
            `INSERT INTO speaker_grants
               (organization_id, speaker_profile_id, user_id, created_at, revoked_at)
             VALUES (?, ?, ?, ?, NULL)
             ON CONFLICT (organization_id, speaker_profile_id, user_id) DO UPDATE SET revoked_at = NULL`,
          )
          .bind(input.tenantId, profile.id, userId, input.decidedAt)
          .run();
        profiles.push(profile.id);
      }

      await this.#database
        .prepare(
          `INSERT INTO audit_events
             (id, tenant_id, actor_type, actor_id, action, resource_type, resource_id,
              trace_id, details_json, occurred_at)
           VALUES (?, ?, 'user', ?, 'evaluation_accepted', 'submission', ?, NULL, ?, ?)
           ON CONFLICT (id) DO NOTHING`,
        )
        .bind(
          `evaluation-accepted:${input.submissionId}`,
          input.tenantId,
          input.decidedBy,
          input.submissionId,
          JSON.stringify({
            planId: input.planId,
            decisionId: input.decisionId,
            reason: input.reason,
            idempotencyKey: input.idempotencyKey,
            profileIds: profiles,
          }),
          input.decidedAt,
        )
        .run();

      await this.#enqueue(input, "communications", `evaluation-accepted:${input.submissionId}`, {
        from: "speakers@foreverbrowsing.com",
        to: recipients,
        subject: "Your session was accepted",
        html: "<p>Your session was accepted. Sign in to complete your speaker profile.</p>",
        text: "Your session was accepted. Sign in to complete your speaker profile.",
        idempotencyKey: `evaluation-accepted:${input.submissionId}`,
      });
      await this.#enqueue(
        input,
        "cache-invalidation",
        `evaluation-projection:${input.eventId}:${input.submissionId}`,
        { eventId: input.eventId },
      );
      return { accepted: true };
    });
  }

  async #enqueue(
    input: EvaluationAcceptanceHandoffInput,
    topic: "communications" | "cache-invalidation",
    deduplicationKey: string,
    payload: unknown,
  ): Promise<void> {
    const jobId = `evaluation:${input.tenantId}:${topic}:${deduplicationKey}`;
    const now = input.decidedAt;
    const result = await this.#database
      .prepare(
        `INSERT INTO outbox_jobs
           (id, tenant_id, topic, deduplication_key, payload_json, state,
            attempt_count, available_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)
         ON CONFLICT (tenant_id, topic, deduplication_key) DO NOTHING`,
      )
      .bind(jobId, input.tenantId, topic, deduplicationKey, JSON.stringify(payload), now, now, now)
      .run();
    const inserted = result.meta === undefined || result.meta.changes > 0;
    const state = inserted
      ? "pending"
      : (
          await this.#database
            .prepare("SELECT state FROM outbox_jobs WHERE id = ? LIMIT 1")
            .bind(jobId)
            .first<{ state: string }>()
        )?.state;
    if (state === "pending") {
      await this.#queue.send({
        version: 1,
        jobId,
        tenantId: input.tenantId,
        topic,
        enqueuedAt: now,
      });
      await this.#database
        .prepare(
          "UPDATE outbox_jobs SET state = 'queued', updated_at = ? WHERE id = ? AND state = 'pending'",
        )
        .bind(now, jobId)
        .run();
    }
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

/** Airtable-backed organization dashboard projection assembled from canonical records. */
export class AirtableOrganizerOverviewRepository implements OrganizerOverviewRouteDependencies {
  readonly #events: AirtableJsonStore<JsonRecord>;
  readonly #submissions: AirtableJsonStore<JsonRecord>;
  readonly #plans: AirtableJsonStore<JsonRecord>;
  readonly #evaluations: AirtableJsonStore<JsonRecord>;
  readonly #tasks: AirtableJsonStore<JsonRecord>;
  readonly #sessions: AirtableJsonStore<JsonRecord>;
  readonly #agendas: AirtableJsonStore<JsonRecord>;

  constructor(options: { readonly baseId: string; readonly transport: AirtableTransport }) {
    const shared = { baseId: options.baseId, transport: options.transport };
    this.#events = new AirtableJsonStore({
      ...shared,
      table: "Events",
      jsonField: "Settings JSON",
    });
    this.#submissions = new AirtableJsonStore({
      ...shared,
      table: "Submissions",
      jsonField: "Answers JSON",
    });
    this.#plans = new AirtableJsonStore({
      ...shared,
      table: "Review Plans",
      jsonField: "Rounds JSON",
    });
    this.#evaluations = new AirtableJsonStore({
      ...shared,
      table: "Evaluations",
      jsonField: "Scores JSON",
    });
    this.#tasks = new AirtableJsonStore({
      ...shared,
      table: "Speaker Tasks",
      jsonField: "Owner JSON",
    });
    this.#sessions = new AirtableJsonStore({
      ...shared,
      table: "Sessions",
      jsonField: "Metadata JSON",
    });
    this.#agendas = new AirtableJsonStore({
      ...shared,
      table: "Agenda Versions",
      jsonField: "Conflicts JSON",
    });
  }

  async getOverview(organizationId: string): Promise<OrganizerOverviewData> {
    const [allEvents, allSubmissions, allPlans, allEvaluations, allTasks, allSessions] =
      await Promise.all([
        this.#events.list(),
        this.#submissions.list(),
        this.#plans.list(),
        this.#evaluations.list(),
        this.#tasks.list(),
        this.#sessions.list(),
      ]);
    const events = allEvents
      .filter((event) => organizationIdOf(event) === organizationId)
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

    const submissions = allSubmissions.filter(
      (submission) =>
        belongsToOrganization(submission, organizationId, eventIds) &&
        textValue(submission, "status") !== "withdrawn",
    );
    const plans = allPlans.filter(
      (plan) =>
        belongsToOrganization(plan, organizationId, eventIds) ||
        (organizationIdOf(plan) === organizationId && eventIds.has(eventReference(plan) ?? "")),
    );
    const planIds = new Set(plans.map((plan) => textValue(plan, "id")).filter(isNonEmpty));
    const assignments = allEvaluations.filter(
      (evaluation) =>
        isEvaluationAssignmentRecord(evaluation) &&
        belongsToOrganization(evaluation, organizationId, eventIds) &&
        planIds.has(textValue(evaluation, "planId") ?? "") &&
        eventIds.has(eventReference(evaluation) ?? ""),
    );
    const pendingAssignments = assignments.filter((assignment) => {
      const status = textValue(assignment, "status");
      return status === "assigned" || status === "in_progress";
    });
    const tasks = allTasks.filter(
      (task) =>
        belongsToOrganization(task, organizationId, eventIds) &&
        eventIds.has(eventReference(task) ?? "") &&
        !["completed", "waived"].includes(textValue(task, "status") ?? ""),
    );
    const sessions = allSessions.filter(
      (session) =>
        belongsToOrganization(session, organizationId, eventIds) &&
        eventIds.has(eventReference(session) ?? "") &&
        textValue(session, "status") !== "cancelled",
    );
    const publishedSessionIdsByEvent = new Map<string, ReadonlySet<string>>(
      await Promise.all(
        events.map(async (event) => [event.id, await this.publishedSessionIds(event.id)] as const),
      ),
    );

    const pendingReviewsByEvent = groupByEvent(pendingAssignments);
    const tasksByEvent = groupByEvent(tasks);
    const sessionsByEvent = groupByEvent(sessions);
    const publishedSessionCount = [...publishedSessionIdsByEvent.values()].reduce(
      (total, ids) => total + ids.size,
      0,
    );
    const actionItems: OrganizerOverviewActionItem[] = [];

    for (const event of events) {
      const pendingReviews = pendingReviewsByEvent.get(event.id) ?? [];
      if (pendingReviews.length > 0) {
        const planDueDates = pendingReviews.map((assignment) => {
          const plan = plans.find(
            (candidate) => textValue(candidate, "id") === textValue(assignment, "planId"),
          );
          return plan === undefined ? null : dueAtValue(plan);
        });
        actionItems.push(
          actionItem({
            id: `reviews:${event.id}`,
            type: "reviews",
            eventId: event.id,
            title:
              pendingReviews.length === 1
                ? "Complete a pending review"
                : "Complete pending reviews",
            description: `${pendingReviews.length} review${pendingReviews.length === 1 ? "" : "s"} still need organizer attention.`,
            count: pendingReviews.length,
            priority: 90,
            dueAt: earliestDueAt(planDueDates),
            href: hrefFor(organizationId, event.id, "reviews"),
          }),
        );
      }

      const outstandingTasks = tasksByEvent.get(event.id) ?? [];
      if (outstandingTasks.length > 0) {
        actionItems.push(
          actionItem({
            id: `speaker_tasks:${event.id}`,
            type: "speaker_tasks",
            eventId: event.id,
            title:
              outstandingTasks.length === 1 ? "Resolve a speaker task" : "Resolve speaker tasks",
            description: `${outstandingTasks.length} speaker task${outstandingTasks.length === 1 ? "" : "s"} remain open.`,
            count: outstandingTasks.length,
            priority: 70,
            dueAt: earliestDueAt(outstandingTasks.map(dueAtValue)),
            href: hrefFor(organizationId, event.id, "speakers"),
          }),
        );
      }

      const eventSessions = sessionsByEvent.get(event.id) ?? [];
      const publishedIds = publishedSessionIdsByEvent.get(event.id) ?? new Set<string>();
      const unpublishedSessionCount = eventSessions.filter(
        (session) => !publishedIds.has(textValue(session, "id") ?? ""),
      ).length;
      if (unpublishedSessionCount > 0) {
        actionItems.push(
          actionItem({
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
            href: hrefFor(organizationId, event.id, "agenda"),
          }),
        );
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

  private eventView(record: JsonRecord): OrganizerOverviewEvent {
    const id = requiredId(record.id);
    return {
      id,
      name: textValue(record, "name", "title") ?? id,
      slug: textValue(record, "slug"),
      status: textValue(record, "status"),
      startsAt: textValue(record, "startsAt", "startsOn", "startAt"),
      endsAt: textValue(record, "endsAt", "endsOn", "endAt"),
    };
  }

  private async publishedSessionIds(eventId: string): Promise<ReadonlySet<string>> {
    const state = await this.#agendas.find(eventId);
    if (state === undefined || !isRecord(state)) return new Set<string>();
    const revisionId = textValue(state, "currentPublishedRevisionId");
    if (revisionId === null || !Array.isArray(state.revisions)) return new Set<string>();
    const revision = state.revisions.find(
      (candidate): candidate is JsonRecord =>
        isRecord(candidate) && textValue(candidate, "id") === revisionId,
    );
    if (revision === undefined || !Array.isArray(revision.entries)) return new Set<string>();
    return new Set(
      revision.entries
        .filter(isRecord)
        .map((entry) => textValue(entry, "sessionId"))
        .filter(isNonEmpty),
    );
  }
}

function isNonEmpty(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

function groupByEvent(records: readonly JsonRecord[]): Map<string, JsonRecord[]> {
  const grouped = new Map<string, JsonRecord[]>();
  for (const record of records) {
    const eventId = eventReference(record);
    if (eventId === null) continue;
    const values = grouped.get(eventId);
    if (values === undefined) grouped.set(eventId, [record]);
    else values.push(record);
  }
  return grouped;
}

function compareNullableDates(left: string | null, right: string | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return Date.parse(left) - Date.parse(right);
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
  const url = new URL(request.url);
  const pathId = /\/events\/([^/]+)/u.exec(url.pathname)?.[1];
  if (pathId !== undefined) return decodeURIComponent(pathId);
  const queryId = url.searchParams.get("eventId")?.trim();
  return queryId === undefined || queryId.length === 0 ? undefined : queryId;
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

  const speakerRepository = new AirtableSpeakerRepository({
    ...shared,
    database: options.database,
  });
  const speakerService = new SpeakerService(
    speakerRepository,
    new R2PrivateAssetGateway(options.privateFiles, options.webOrigin),
  );
  const evaluationRepository = new AirtableEvaluationRepository(shared);
  const evaluationSource = new AirtableSubmissionReviewSource(cfpRepository, cfpService);
  const acceptanceHandoff = new AirtableEvaluationAcceptanceHandoff({
    cfp: cfpRepository,
    speakers: speakerRepository,
    database: options.database,
    queue: options.outboxQueue,
  });
  const evaluationService = new EvaluationService(evaluationRepository, evaluationSource, {
    acceptanceHandoff,
  });
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
  const sessionsRepository = new AirtablePublicRepository({
    ...shared,
    table: "Sessions",
    jsonField: "Metadata JSON",
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
  const publishedSpeakerProjections = new AirtablePublishedSpeakerProjectionStore(shared);
  const organizerOverview = new AirtableOrganizerOverviewRepository(shared);

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
    publishedSpeakers: publishedSpeakerProjections,
    organizerOverview,
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
        {
          name: "sessions",
          repository: sessionsRepository,
          readScope: "agenda:read",
          writeScope: "agenda:write",
          sortFields: ["id", "title", "updatedAt"],
          defaultSort: "id",
        },
      ],
      idempotency: publicIdempotency,
    },
    webhooks,
    cfp: { service: cfpService },
  };
}
