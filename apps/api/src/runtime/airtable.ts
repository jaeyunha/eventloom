import type {
  D1Database,
  DurableObjectNamespace,
  Queue,
  R2Bucket,
} from "@cloudflare/workers-types";
import type { ApiDependencies } from "../app";
import { AgendaCatalogSynchronizer } from "../features/agenda/catalog-sync";
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
  type CfpFileAsset,
  type CfpFileAssetGateway,
  type CfpFileUploadAuthorization,
  type CfpIdempotencyCoordinator,
  type CfpRepository,
  CfpService,
} from "../features/cfp/service";
import { CommunicationError, CommunicationService } from "../features/communications/service";
import type {
  CommunicationActor,
  CommunicationAudience,
  CommunicationDeliveryAdapter,
  CommunicationDeliveryRequest,
  CommunicationPreview,
  CommunicationRecipient,
  CommunicationRepository,
  CommunicationSend,
  CommunicationTemplate,
  CommunicationTemplatePurpose,
} from "../features/communications/types";
import { CrmRepositoryConflictError, CrmService } from "../features/crm/service";
import type {
  CrmContact,
  CrmEventProjection,
  CrmHistoryEntry,
  CrmImportResult,
  CrmNote,
  CrmOutreachBoundary,
  CrmOutreachCommand,
  CrmPipelineEntry,
  CrmRepository,
  CrmRepositoryFilter,
  CrmSegment,
} from "../features/crm/types";
import { conflict } from "../features/evaluations/errors";
import type {
  EvaluationRepository,
  SubmissionReviewSource,
} from "../features/evaluations/repository";
import type {
  EvaluationReminderBoundary,
  EvaluationReviewerIdentityBoundary,
} from "../features/evaluations/routes";
import type {
  EvaluationAcceptanceHandoff,
  EvaluationAcceptanceHandoffInput,
  EvaluationDecisionProjectionInput,
  EvaluationSubmissionRecord,
  EvaluationSubmissionSource,
} from "../features/evaluations/service";
import { EvaluationService } from "../features/evaluations/service";
import type {
  EvaluationActor,
  EvaluationAssignment,
  EvaluationConflictDeclaration,
  EvaluationDecision,
  EvaluationPlan,
  EvaluationReview,
  SubmissionReviewMaterial,
} from "../features/evaluations/types";
import { EventService } from "../features/events/service";
import {
  type Event,
  type EventAuditEntry,
  type EventRepository,
  EventRepositoryConflictError,
} from "../features/events/types";
import type {
  IdempotencyBeginResult,
  IdempotencyStore,
  IdempotencyStoredResponse,
} from "../features/public-api/idempotency";
import { createIdempotencyCoordinator } from "../features/public-api/idempotency";
import { publicApiV1Contract } from "../features/public-api/contract";
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
  RemixField,
  RemixRecordFilter,
  RemixRepository,
  RemixSessionRecord,
  RemixSpeakerRecord,
} from "../features/remix/types";
import { ReportError, ReportService, SafeReportExporter } from "../features/reports/service";
import type {
  ReportActor,
  ReportDefinition,
  ReportProgramRecord,
  ReportRepository,
  ReportRepositoryScope,
  ReportRun,
} from "../features/reports/types";
import { SessionService } from "../features/sessions/service";
import type {
  Format,
  Level,
  Room,
  Session,
  SessionAuditEntry,
  SessionRepository,
  SessionSettings,
  SessionSpeakerReference,
  Tag,
  Track,
} from "../features/sessions/types";
import { SessionRepositoryConflictError } from "../features/sessions/types";
import { SpeakerService } from "../features/speaker/service";
import type {
  CreatePrivateUploadGrantCommand,
  FinalizeSpeakerAssetCommand,
  PrivateAssetCapabilityBinding,
  PrivateAssetGateway,
  PrivateDownloadGrant,
  PrivateDownloadObject,
  PrivateUploadGrant,
  PrivateUploadReceipt,
  RepositoryResult,
  SpeakerAccessScope,
  SpeakerAsset,
  SpeakerAssetComment,
  SpeakerEventResource,
  SpeakerInvitationDeliveryInput,
  SpeakerInvitationDeliveryReceipt,
  SpeakerOrganizerAccessScope,
  SpeakerPortalCapability,
  SpeakerPortalContext,
  SpeakerProfile,
  SpeakerReminderDelivery,
  SpeakerReminderDeliveryInput,
  SpeakerReminderDeliveryReceipt,
  SpeakerRepository,
  SpeakerRosterEntry,
  SpeakerSubmission,
  SpeakerSubmissionStatus,
  SpeakerTask,
  SpeakerTaskFormDefinition,
  SpeakerTaskRepositoryCommand,
  SpeakerTaskResponseRecord,
  SpeakerWikiPage,
  TransitionSpeakerTaskCommand,
  UpdateBiographyCommand,
  UpdateSpeakerProfileCommand,
} from "../features/speaker/types";
import {
  type AirtableListOptions,
  type AirtableMapper,
  AirtableRepository,
  AirtableRepositoryError,
  type AirtableTransport,
  applicationIdFormula,
} from "../infrastructure/airtable";
import type { CloudflareOutboxMessage } from "../infrastructure/cloudflare/bindings";
import type { CloudflareAiProviders } from "../integrations/ai";
import { DEFAULT_OPEN_SEND_SENDERS } from "../integrations/opensend/client";
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
  const id = isRecord(value) && typeof value.id === "string" ? value.id : "";
  return (
    id.startsWith("speaker-submission:") ||
    ("primaryParticipantId" in value && "participantIds" in value) ||
    !("formId" in value)
  );
}

function tagged<T extends object>(value: T, kind: string): T {
  return { ...value, entityType: kind } as T;
}
function untagged<T extends object>(value: T): T {
  if (!isRecord(value)) return value;
  const { entityType: _kind, ...rest } = value;
  if (typeof rest.tenantId === "string" && typeof rest.organizationId === "string") {
    delete rest.organizationId;
  }
  return rest as T;
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
function authoritativeOrganizationId(value: object): string | undefined {
  if (!isRecord(value)) return undefined;
  const organization =
    typeof value.organizationId === "string" && value.organizationId.trim().length > 0
      ? value.organizationId.trim()
      : undefined;
  const tenant =
    typeof value.tenantId === "string" && value.tenantId.trim().length > 0
      ? value.tenantId.trim()
      : undefined;
  if (organization !== undefined && tenant !== undefined && organization !== tenant)
    return undefined;
  return organization ?? tenant;
}
function isEvaluationAssignmentRecord(value: object): boolean {
  const kind = entityType(value);
  return (
    kind === "evaluation_assignment" ||
    (kind === undefined &&
      "reviewerId" in value &&
      !("scores" in value) &&
      !("assignmentId" in value))
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
function isCrmRosterAdmission(value: object): boolean {
  if (!isRecord(value)) return false;
  return (
    textValue(value, "workflowStatus") === "crm-prospect" &&
    textValue(value, "submissionId")?.startsWith("speaker-submission:crm-contact:") === true
  );
}

function eventReference(record: JsonRecord): string | null {
  return textValue(record, "eventId", "eventID", "event");
}
function speakerProfileScoped(
  profile: JsonRecord | SpeakerProfile,
  tenantId: string,
  eventId: string,
  eventOrganizationId: string | undefined,
): boolean {
  const record = profile as unknown as JsonRecord;
  if (eventReference(record) !== eventId || eventOrganizationId !== tenantId) return false;
  const profileOrganizationId = authoritativeOrganizationId(record);
  if (profileOrganizationId !== undefined) return profileOrganizationId === tenantId;
  return !Object.hasOwn(record, "organizationId") && !Object.hasOwn(record, "tenantId");
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
  "Version Family ID": "versionFamilyId",
  "Supersedes Asset ID": "supersedesAssetId",
  "Comment Thread ID": "commentThreadId",
  "Rejection Reason": "rejectionReason",
  "Finalized At": "finalizedAt",
  "Owner Account ID": "ownerAccountId",
  "Endpoint URL": "endpointUrl",
  Events: "events",
  Active: "active",
  "Signing Secret": "signingSecret",
  "Signing Secret Last Four": "signingSecretLastFour",
};
function encodeJson(
  value: object,
  jsonField: string,
  scopeFields: { readonly eventId?: boolean; readonly organizationId?: boolean } = {},
  indexedFields: Readonly<Record<string, string>> = {},
): AirtableFields {
  const record = value as JsonRecord;
  const id = recordId(value);
  const organizationId =
    typeof record.organizationId === "string"
      ? record.organizationId
      : typeof record.tenantId === "string"
        ? record.tenantId
        : undefined;
  const indexed = Object.fromEntries(
    Object.entries(indexedFields).flatMap(([field, property]) => {
      const indexedValue = record[property];
      return typeof indexedValue === "string" ||
        typeof indexedValue === "number" ||
        typeof indexedValue === "boolean"
        ? [[field, indexedValue]]
        : [];
    }),
  );
  return {
    [APPLICATION_ID]: id,
    ...(scopeFields.organizationId && organizationId !== undefined
      ? { "Organization ID": organizationId }
      : {}),
    ...(scopeFields.eventId && typeof record.eventId === "string"
      ? { "Event ID": record.eventId }
      : {}),
    ...indexed,
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
        const eventId =
          typeof fields["Event ID"] === "string"
            ? fields["Event ID"]
            : typeof parsed.eventId === "string"
              ? parsed.eventId
              : undefined;
        const id = typeof fields[APPLICATION_ID] === "string" ? fields[APPLICATION_ID] : parsed.id;
        requiredId(id);
        return {
          ...parsed,
          ...(id === undefined ? {} : { id }),
          ...(tenantId === undefined ? {} : { tenantId }),
          ...(eventId === undefined ? {} : { eventId }),
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

function decodeCfpSubmission(fields: Readonly<AirtableFields>): Submission {
  const submission = decodeJson<Submission>(fields, "Answers JSON") as Submission & JsonRecord;
  const title = textValue(fields as JsonRecord, "Title");
  const abstract = textValue(fields as JsonRecord, "Abstract");
  return {
    ...submission,
    ...(title === null ? {} : { title }),
    ...(abstract === null ? {} : { abstract }),
  } as Submission;
}
function jsonMapper<T extends object>(
  jsonField: string,
  decode: (fields: Readonly<AirtableFields>) => T = (fields) => decodeJson<T>(fields, jsonField),
  scopeFields: { readonly eventId?: boolean; readonly organizationId?: boolean } = {},
  indexedFields: Readonly<Record<string, string>> = {},
): AirtableMapper<T, T, Partial<T>, AirtableFields> {
  return {
    applicationIdField: APPLICATION_ID,
    applicationIdOf: (input) => recordId(input),
    encodeCreate: (input) => encodeJson(input, jsonField, scopeFields, indexedFields),
    encodeUpdate: (input) => encodeJson(input as T, jsonField, scopeFields, indexedFields),
    decode,
  };
}

function applicationIdsFormula(ids: readonly string[]): string {
  const formulas = ids.map((id) => applicationIdFormula(APPLICATION_ID, id));
  if (formulas.length === 0) {
    throw new TypeError("At least one application ID is required.");
  }
  return formulas.length === 1 ? (formulas[0] as string) : `OR(${formulas.join(",")})`;
}
function eventFilterFormula(jsonField: string, eventId: string): string {
  return `FIND(${JSON.stringify(eventId)},{${jsonField}})>0`;
}
/**
 * Matches records whose JSON payload names the organization or any of the
 * organization's event ids. Plain-substring FIND needles intentionally
 * over-match (whitespace-insensitive, substring collisions); callers still
 * apply the exact parsed-JSON filter afterwards, so the formula only needs
 * to be a guaranteed superset of the client-side filter.
 */
function organizationScopeFormula(
  jsonField: string,
  organizationId: string,
  eventIds: readonly string[],
): string {
  const needles = [organizationId, ...eventIds];
  const clauses = needles.map((needle) => `FIND(${JSON.stringify(needle)},{${jsonField}})>0`);
  return clauses.length === 1 ? (clauses[0] as string) : `OR(${clauses.join(",")})`;
}

/** A typed Airtable repository whose only opaque identifier is Airtable's internal record id. */
export class AirtableJsonStore<T extends object> {
  readonly #repository: AirtableRepository<T, T, Partial<T>, AirtableFields>;

  constructor(options: {
    readonly baseId: string;
    readonly table: string;
    readonly transport: AirtableTransport;
    readonly jsonField?: string;
    readonly decode?: (fields: Readonly<AirtableFields>) => T;
    readonly scopeFields?: {
      readonly eventId?: boolean;
      readonly organizationId?: boolean;
    };
    readonly indexedFields?: Readonly<Record<string, string>>;
  }) {
    const jsonField = options.jsonField ?? DEFAULT_JSON_FIELD;
    this.#repository = new AirtableRepository({
      baseId: options.baseId,
      table: options.table,
      mapper: jsonMapper<T>(jsonField, options.decode, options.scopeFields, options.indexedFields),
      transport: options.transport,
    });
  }

  find(id: string): Promise<T | undefined> {
    return this.#repository.find(requiredId(id));
  }

  findWithRecordId(
    id: string,
  ): Promise<{ readonly recordId: string; readonly entity: T } | undefined> {
    return this.#repository.findWithRecordId(requiredId(id));
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

  updateByRecordId(id: string, recordId: string, value: T): Promise<T> {
    return this.#repository.updateByRecordId(requiredId(id), recordId, clone(value));
  }

  delete(id: string): Promise<boolean> {
    return this.#repository.delete(requiredId(id));
  }

  deleteByRecordId(recordId: string): Promise<boolean> {
    return this.#repository.deleteByRecordId(recordId);
  }

  async list(options: Omit<AirtableListOptions, "cursor"> = {}): Promise<T[]> {
    const values: T[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.#repository.list({
        ...options,
        ...(cursor === undefined ? {} : { cursor }),
        pageSize: options.pageSize ?? 100,
      });
      values.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor !== undefined);
    return values;
  }

  async listWithRecordIds(
    options: Omit<AirtableListOptions, "cursor"> = {},
  ): Promise<Array<{ readonly recordId: string; readonly entity: T }>> {
    const values: Array<{ readonly recordId: string; readonly entity: T }> = [];
    let cursor: string | undefined;
    do {
      const page = await this.#repository.listWithRecordIds({
        ...options,
        ...(cursor === undefined ? {} : { cursor }),
        pageSize: options.pageSize ?? 100,
      });
      values.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor !== undefined);
    return values;
  }

  async listByIds(ids: readonly string[]): Promise<T[]> {
    const uniqueIds = [...new Set(ids.map((id) => requiredId(id)))];
    if (uniqueIds.length === 0) return [];
    return this.list({ filterByFormula: applicationIdsFormula(uniqueIds) });
  }
}
async function listEventScopedJson<T extends object>(
  store: AirtableJsonStore<T>,
  jsonField: string,
  eventId: string,
): Promise<T[]> {
  try {
    return await store.list({ filterByFormula: eventFilterFormula(jsonField, eventId) });
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return store.list();
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
  async putPublishedSpeakers(record: PublishedSpeakerProjectionRecord): Promise<void> {
    const existing = await this.#store.findWithRecordId(record.id);
    if (existing === undefined) {
      await this.#store.create(record);
      return;
    }
    await this.#store.updateByRecordId(record.id, existing.recordId, record);
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
const ACCEPTED_PORTAL_CAPABILITIES: readonly SpeakerPortalCapability[] = [
  "profile-self",
  "task-response",
  "asset-read",
  "asset-write",
  "asset-comment",
];

interface PortalDecisionProjection {
  readonly status: string;
  readonly reason?: string;
}

function portalDecisionProjections(
  records: readonly JsonRecord[],
): Map<string, PortalDecisionProjection> {
  const projections = new Map<string, PortalDecisionProjection>();
  for (const record of records) {
    const submissionId = textValue(record, "submissionId", "Submission ID");
    const status = textValue(record, "status", "decision", "Decision");
    if (submissionId === null || status === null) continue;
    const history = Array.isArray(record.history) ? record.history.filter(isRecord) : [];
    const transition = [...history]
      .reverse()
      .find((entry) => textValue(entry, "to", "status") === status);
    const reason =
      (transition === undefined ? null : textValue(transition, "reason", "Reason")) ??
      textValue(record, "reason", "Reason");
    projections.set(submissionId, {
      status,
      ...(reason === null ? {} : { reason }),
    });
  }
  return projections;
}

function portalRecordStatus(
  record: JsonRecord,
  decisions: ReadonlyMap<string, PortalDecisionProjection>,
): string | null {
  const id = textValue(record, "id", APPLICATION_ID);
  const originalId = id === null ? null : originalCfpSubmissionId(id);
  const projected =
    id === null
      ? undefined
      : (decisions.get(id) ?? (originalId === null ? undefined : decisions.get(originalId)));
  return projected?.status ?? textValue(record, "status", "Status");
}

function portalParticipantIds(record: JsonRecord): string[] {
  if (Array.isArray(record.participantIds)) {
    return record.participantIds.filter(
      (participantId): participantId is string =>
        typeof participantId === "string" && participantId.trim().length > 0,
    );
  }
  if (!Array.isArray(record.participants)) return [];
  return record.participants.flatMap((participant) => {
    if (!isRecord(participant) || typeof participant.id !== "string") return [];
    const id = participant.id.trim();
    return id.length === 0 ? [] : [id];
  });
}
function portalParticipantIdsForEmail(record: JsonRecord, email: string): string[] {
  if (!Array.isArray(record.participants)) return [];
  const normalizedEmail = email.trim().toLowerCase();
  return record.participants.flatMap((participant) => {
    if (
      !isRecord(participant) ||
      typeof participant.id !== "string" ||
      typeof participant.email !== "string" ||
      participant.email.trim().toLowerCase() !== normalizedEmail
    ) {
      return [];
    }
    const participantId = participant.id.trim();
    return participantId.length === 0 ? [] : [participantId];
  });
}

function portalPrimaryParticipantId(record: JsonRecord): string | undefined {
  if (
    typeof record.primaryParticipantId === "string" &&
    record.primaryParticipantId.trim().length > 0
  ) {
    return record.primaryParticipantId.trim();
  }
  if (!Array.isArray(record.participants)) return undefined;
  const primary = record.participants.find(
    (participant) => isRecord(participant) && participant.role === "primary",
  );
  if (isRecord(primary) && typeof primary.id === "string" && primary.id.trim().length > 0) {
    return primary.id.trim();
  }
  const first = record.participants.find(
    (participant) => isRecord(participant) && typeof participant.id === "string",
  );
  return isRecord(first) && typeof first.id === "string" && first.id.trim().length > 0
    ? first.id.trim()
    : undefined;
}

function portalAnswerText(record: JsonRecord, ...keys: readonly string[]): string | null {
  const answers = isRecord(record.answers) ? record.answers : {};
  for (const key of keys) {
    const value = answers[key] ?? record[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}
function isSpeakerSubmissionStatus(value: string): value is SpeakerSubmissionStatus {
  return (
    value === "draft" ||
    value === "submitted" ||
    value === "under_review" ||
    value === "accepted" ||
    value === "declined" ||
    value === "withdrawn"
  );
}

function speakerSubmissionFromRecord(record: JsonRecord): SpeakerSubmission | null {
  const id = textValue(record, "id", APPLICATION_ID);
  const eventId = textValue(record, "eventId", "Event ID");
  const title = portalAnswerText(record, "title", "sessionTitle", "name");
  const rawStatus = textValue(record, "status", "Status");
  const updatedAt = textValue(record, "updatedAt", "Updated At");
  if (
    id === null ||
    eventId === null ||
    title === null ||
    rawStatus === null ||
    updatedAt === null ||
    !isSpeakerSubmissionStatus(rawStatus)
  ) {
    return null;
  }
  const version =
    typeof record.version === "number" &&
    Number.isSafeInteger(record.version) &&
    record.version >= 1
      ? record.version
      : undefined;
  const primaryParticipantId = portalPrimaryParticipantId(record);
  const formId = textValue(record, "formId", "Form ID");
  return {
    id,
    eventId,
    title,
    status: rawStatus,
    participantIds: portalParticipantIds(record),
    updatedAt,
    ...(version === undefined ? {} : { version }),
    ...(primaryParticipantId === undefined ? {} : { primaryParticipantId }),
    ...(formId === null ? {} : { formId }),
    ...(typeof record.closeAt === "string" && record.closeAt.trim().length > 0
      ? { closeAt: record.closeAt.trim() }
      : {}),
    ...(isRecord(record.answers) ? { answers: clone(record.answers) } : {}),
  };
}
function speakerStatusFromPortalStatus(value: string): SpeakerSubmissionStatus {
  switch (value) {
    case "draft":
    case "submitted":
    case "under_review":
    case "accepted":
    case "withdrawn":
      return value;
    case "declined":
    case "rejected":
      return "declined";
    default:
      return "submitted";
  }
}

function portalSubmissionFromRecord(
  record: JsonRecord,
  requestedId: string,
  decisions: ReadonlyMap<string, PortalDecisionProjection>,
): SpeakerSubmission | null {
  const sourceId = textValue(record, "id", APPLICATION_ID);
  const eventId = textValue(record, "eventId", "Event ID");
  if (sourceId === null || eventId === null) return null;
  const decision = decisions.get(sourceId);
  const status = decision?.status ?? textValue(record, "status", "Status") ?? "submitted";
  const updatedAt =
    textValue(record, "updatedAt", "Updated At") ??
    textValue(record, "createdAt", "Created At") ??
    new Date(0).toISOString();
  const title = portalAnswerText(record, "title", "sessionTitle", "name") ?? sourceId;
  const primaryParticipantId = portalPrimaryParticipantId(record);
  const formId = textValue(record, "formId", "Form ID");
  const version =
    typeof record.version === "number" &&
    Number.isSafeInteger(record.version) &&
    record.version >= 1
      ? record.version
      : undefined;
  const projected: SpeakerSubmission & { readonly reason?: string } = {
    id: requestedId,
    eventId,
    title,
    status: speakerStatusFromPortalStatus(status),
    participantIds: portalParticipantIds(record),
    updatedAt,
    ...(version === undefined ? {} : { version }),
    ...(primaryParticipantId === undefined ? {} : { primaryParticipantId }),
    ...(formId === null ? {} : { formId }),
    ...(isRecord(record.answers) ? { answers: clone(record.answers) } : {}),
    ...(decision?.reason === undefined ? {} : { reason: decision.reason }),
  };
  return projected;
}

function originalCfpSubmissionId(value: string): string | null {
  const prefix = "speaker-submission:";
  return value.startsWith(prefix) && value.length > prefix.length
    ? value.slice(prefix.length)
    : null;
}

/** Airtable-backed webhook subscriptions and durable delivery records. */
export class AirtableWebhookRepository implements WebhookRepository {
  readonly #subscriptions: AirtableJsonStore<WebhookSubscriptionRecord>;
  readonly #deliveries: AirtableJsonStore<WebhookDelivery>;

  constructor(options: {
    readonly baseId: string;
    readonly transport: AirtableTransport;
  }) {
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
    const claimed = {
      ...candidate,
      status: "delivering" as const,
      nextAttemptAt: null,
    };
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
  readonly #events: AirtableJsonStore<JsonRecord>;
  readonly #roster: AirtableJsonStore<SpeakerRosterEntry & { tenantId?: string }>;
  readonly #taskForms: AirtableJsonStore<SpeakerTaskFormDefinition & { tenantId?: string }>;
  readonly #taskResponses: AirtableJsonStore<SpeakerTaskResponseRecord & { tenantId?: string }>;
  readonly #assetComments: AirtableJsonStore<SpeakerAssetComment & { tenantId?: string }>;
  readonly #resources: AirtableJsonStore<SpeakerEventResource & { tenantId?: string }>;
  readonly #wikiPages: AirtableJsonStore<SpeakerWikiPage & { tenantId?: string }>;
  readonly #decisions: AirtableJsonStore<JsonRecord>;

  constructor(options: {
    readonly baseId: string;
    readonly transport: AirtableTransport;
    readonly database: D1Database;
  }) {
    const shared = { baseId: options.baseId, transport: options.transport };
    this.#events = new AirtableJsonStore({
      ...shared,
      table: "Events",
      jsonField: "Settings JSON",
    });
    this.#roster = new AirtableJsonStore({
      ...shared,
      table: "Session Roster",
      jsonField: "Members JSON",
      scopeFields: { eventId: true, organizationId: true },
    });
    this.#taskForms = new AirtableJsonStore({
      ...shared,
      table: "Task Forms",
      jsonField: "Definition JSON",
    });
    this.#taskResponses = new AirtableJsonStore({
      ...shared,
      table: "Task Responses",
      jsonField: "Answers JSON",
    });
    this.#assetComments = new AirtableJsonStore({
      ...shared,
      table: "File Comments",
      jsonField: "Settings JSON",
    });
    this.#resources = new AirtableJsonStore({
      ...shared,
      table: "Portal Resources",
      jsonField: "Settings JSON",
    });
    this.#wikiPages = new AirtableJsonStore({
      ...shared,
      table: "Wiki Pages",
      jsonField: "Settings JSON",
    });
    this.#submissions = new AirtableJsonStore({
      ...shared,
      table: "Submissions",
      jsonField: "Answers JSON",
    });
    this.#decisions = new AirtableJsonStore({
      ...shared,
      table: "Decisions",
      jsonField: "Metadata JSON",
    });
    this.#profiles = new AirtableJsonStore({
      ...shared,
      table: "Speaker Profiles",
      jsonField: "Biography",
      scopeFields: { eventId: true, organizationId: true },
    });
    this.#tasks = new AirtableJsonStore({
      ...shared,
      table: "Speaker Tasks",
      jsonField: "Owner JSON",
    });
    this.#assets = new AirtableJsonStore({
      ...shared,
      table: "File Assets",
      jsonField: "Settings JSON",
      scopeFields: { eventId: true, organizationId: true },
    });
    this.#database = options.database;
  }
  async findAcceptedParticipantByEmail(
    eventId: string,
    submissionIds: readonly string[],
    email: string,
  ): Promise<{
    participantId: string;
    submissionId: string;
    email: string;
  } | null> {
    const normalizedEmail = email.trim().toLowerCase();
    if (eventId.trim().length === 0 || normalizedEmail.length === 0) return null;
    const event = await this.#events.find(eventId);
    const tenantId = event === undefined ? undefined : authoritativeOrganizationId(event);
    if (tenantId === undefined) return null;
    const [decisions, submissionRecords] = await Promise.all([
      this.#decisions.list().then(portalDecisionProjections),
      this.#submissions.list(),
    ]);
    const records = submissionRecords as unknown as JsonRecord[];
    const byId = new Map(
      records
        .map((record) => [textValue(record, "id", APPLICATION_ID), record] as const)
        .filter((entry): entry is readonly [string, JsonRecord] => entry[0] !== null),
    );
    const requestedBySource = new Map<string, string>();
    for (const submissionId of submissionIds) {
      const sourceId = originalCfpSubmissionId(submissionId) ?? submissionId;
      if (submissionId === sourceId || !requestedBySource.has(sourceId)) {
        requestedBySource.set(sourceId, submissionId);
      }
    }
    const matches: Array<{
      participantId: string;
      submissionId: string;
      email: string;
    }> = [];
    for (const [sourceId, submissionId] of requestedBySource) {
      const record = byId.get(sourceId);
      if (
        record === undefined ||
        isSpeakerSubmissionRecord(record) ||
        eventReference(record) !== eventId ||
        authoritativeOrganizationId(record) !== tenantId ||
        portalRecordStatus(record, decisions) !== "accepted"
      ) {
        continue;
      }
      if (!Array.isArray(record.participants)) continue;
      for (const participant of record.participants) {
        if (!isRecord(participant)) continue;
        const participantId = typeof participant.id === "string" ? participant.id.trim() : "";
        const participantEmail =
          typeof participant.email === "string" ? participant.email.trim().toLowerCase() : "";
        if (participantId.length > 0 && participantEmail === normalizedEmail) {
          matches.push({
            participantId,
            submissionId,
            email: participantEmail,
          });
        }
      }
    }
    return matches.length === 1 ? (matches[0] ?? null) : null;
  }
  async getOrganizerAccessScope(
    eventId: string,
    accountId: string,
  ): Promise<SpeakerOrganizerAccessScope | null> {
    if (eventId.trim().length === 0 || accountId.trim().length === 0) return null;
    const event = await this.#events.find(eventId);
    if (event === undefined || event.id !== eventId) return null;
    const tenantId = authoritativeOrganizationId(event);
    if (tenantId === undefined) return null;

    const membership = await this.#database
      .prepare(
        `SELECT organization_id, role
           FROM organization_memberships
          WHERE organization_id = ? AND user_id = ?
          LIMIT 1`,
      )
      .bind(tenantId, accountId)
      .first<{ organization_id?: unknown; role?: unknown }>();
    const role =
      membership?.role === "owner" ? "owner" : membership?.role === "admin" ? "admin" : null;
    if (
      membership === null ||
      membership === undefined ||
      membership.organization_id !== tenantId ||
      role === null
    ) {
      return null;
    }

    const [submissionRecords, rosterRecordsForEvent] = await Promise.all([
      listEventScopedJson(this.#submissions, "Answers JSON", eventId),
      listEventScopedJson(this.#roster, "Members JSON", eventId),
    ]);
    const records = submissionRecords as unknown as JsonRecord[];
    const sourceRecords = records.filter(
      (record) =>
        !isSpeakerSubmissionRecord(record) &&
        eventReference(record) === eventId &&
        authoritativeOrganizationId(record) === tenantId,
    );
    const sourceIds = new Set(
      sourceRecords.map((record) => textValue(record, "id", APPLICATION_ID)).filter(isNonEmpty),
    );
    const linkedSpeakerRecords = records.filter((record) => {
      if (!isSpeakerSubmissionRecord(record) || eventReference(record) !== eventId) return false;
      const id = textValue(record, "id", APPLICATION_ID);
      if (id === null) return false;
      const sourceId = originalCfpSubmissionId(id);
      if (sourceId !== null) return sourceIds.has(sourceId);
      return authoritativeOrganizationId(record) === tenantId;
    });
    const rosterRecords = rosterRecordsForEvent.filter((record) => {
      const recordTenantId = authoritativeOrganizationId(record);
      return (
        record.eventId === eventId && (recordTenantId === undefined || recordTenantId === tenantId)
      );
    });
    const organizerRosterRecords = rosterRecords.filter((record) => !isCrmRosterAdmission(record));
    const validRecords = [...sourceRecords, ...linkedSpeakerRecords];
    const sourceParticipantIds = new Set(
      sourceRecords.flatMap((record) => portalParticipantIds(record)),
    );
    const submissionIds = [
      ...new Set([
        ...validRecords.map((record) => textValue(record, "id", APPLICATION_ID)).filter(isNonEmpty),
        ...organizerRosterRecords.map((record) => record.submissionId).filter(isNonEmpty),
      ]),
    ];
    const participantIds = [
      ...new Set([
        ...sourceParticipantIds,
        ...organizerRosterRecords.map((record) => record.participantId).filter(isNonEmpty),
      ]),
    ];
    return {
      tenantId,
      eventId,
      role,
      submissionIds,
      participantIds,
    };
  }

  async getAccessScope(eventId: string, accountId: string): Promise<SpeakerAccessScope> {
    const [result, account, event] = await Promise.all([
      this.#database
        .prepare(
          `SELECT organization_id, speaker_profile_id
             FROM speaker_grants
            WHERE user_id = ? AND revoked_at IS NULL
            ORDER BY organization_id, speaker_profile_id`,
        )
        .bind(accountId)
        .all<{ organization_id: string; speaker_profile_id: string }>(),
      this.#database
        .prepare(
          `SELECT email
             FROM auth_users
            WHERE id = ? AND email_verified = 1
            LIMIT 1`,
        )
        .bind(accountId)
        .first<{ email?: unknown }>(),
      this.#events.find(eventId),
    ]);
    const accountEmail =
      typeof account?.email === "string" ? account.email.trim().toLowerCase() : undefined;
    const eventOrganizationId = event === undefined ? undefined : organizationIdOf(event);
    const scopedGrants = result.results.filter(
      (row) => eventOrganizationId === undefined || row.organization_id === eventOrganizationId,
    );
    const grants = new Set(
      scopedGrants
        .map((row) => row.speaker_profile_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    );
    const [submissionRecords, decisionRecords, profileRecords] = await Promise.all([
      this.#submissions.list(),
      this.#decisions.list(),
      this.#profiles.list(),
    ]);
    const records = submissionRecords as unknown as JsonRecord[];
    const decisions = portalDecisionProjections(decisionRecords);
    const ownedRecords = records.filter(
      (record) =>
        !isSpeakerSubmissionRecord(record) &&
        textValue(record, "eventId", "Event ID") === eventId &&
        textValue(record, "ownerAccountId", "Owner Account ID") === accountId &&
        (eventOrganizationId === undefined ||
          recordTenantId(record) === undefined ||
          recordTenantId(record) === eventOrganizationId),
    );
    const profiles = profileRecords.filter(
      (profile) =>
        profile.eventId === eventId &&
        (grants.has(profile.id) || grants.has(profile.participantId)),
    );
    const accountProfiles =
      accountEmail === undefined
        ? []
        : profiles.filter((profile) => profile.email?.trim().toLowerCase() === accountEmail);
    const participantIds =
      accountEmail === undefined
        ? []
        : [
            ...new Set([
              ...ownedRecords.flatMap((record) =>
                portalParticipantIdsForEmail(record, accountEmail),
              ),
              ...accountProfiles.map((profile) => profile.participantId),
            ]),
          ];
    const acceptedGrantRecords = records.filter(
      (record) =>
        isSpeakerSubmissionRecord(record) &&
        textValue(record, "eventId", "Event ID") === eventId &&
        portalRecordStatus(record, decisions) === "accepted" &&
        portalParticipantIds(record).some((participantId) =>
          accountProfiles.some(
            (profile) =>
              profile.participantId === participantId &&
              (grants.has(profile.id) || grants.has(profile.participantId)),
          ),
        ),
    );
    const acceptedOwnerRecords = ownedRecords.filter(
      (record) => portalRecordStatus(record, decisions) === "accepted",
    );
    const acceptedRecords = [...acceptedOwnerRecords, ...acceptedGrantRecords];
    const ownerIds = new Set(
      ownedRecords.map((record) => textValue(record, "id", APPLICATION_ID)).filter(isNonEmpty),
    );
    const submissionIds = [
      ...ownerIds,
      ...acceptedGrantRecords
        .map((record) => textValue(record, "id", APPLICATION_ID))
        .filter(
          (id): id is string => id !== null && !ownerIds.has(originalCfpSubmissionId(id) ?? id),
        ),
    ];
    if (submissionIds.length === 0 || participantIds.length === 0) {
      return { submissionIds: [], participantIds: [] };
    }
    const acceptedParticipants = new Set(acceptedRecords.flatMap(portalParticipantIds));
    const submissionEditingAllowed = ownedRecords.some((record) => {
      const status = portalRecordStatus(record, decisions);
      return status === "draft" || status === "submitted" || status === "under_review";
    });
    const capabilities: readonly SpeakerPortalCapability[] = [
      ...(acceptedParticipants.size > 0 ? ACCEPTED_PORTAL_CAPABILITIES : []),
      ...(submissionEditingAllowed ? (["submission-edit"] as const) : []),
    ];
    const primaryParticipantId =
      ownedRecords.map(portalPrimaryParticipantId).find(isDefinedString) ??
      acceptedGrantRecords.map(portalPrimaryParticipantId).find(isDefinedString) ??
      participantIds[0];
    const capabilitiesByParticipant = Object.fromEntries(
      participantIds.map((participantId) => [
        participantId,
        acceptedParticipants.has(participantId)
          ? [
              ...capabilities,
              ...(participantId === primaryParticipantId ? (["roster-manage"] as const) : []),
            ]
          : [],
      ]),
    );
    const tenantIds = [
      ...new Set(
        scopedGrants
          .filter((row) =>
            profiles.some(
              (profile) =>
                profile.id === row.speaker_profile_id ||
                profile.participantId === row.speaker_profile_id,
            ),
          )
          .map((row) => row.organization_id)
          .filter((value) => typeof value === "string" && value.trim().length > 0),
      ),
    ];
    if (eventOrganizationId !== undefined) tenantIds.push(eventOrganizationId);
    const uniqueTenantIds = [...new Set(tenantIds)];
    if (uniqueTenantIds.length > 1) return { submissionIds: [], participantIds: [] };
    return {
      ...(uniqueTenantIds[0] === undefined ? {} : { tenantId: uniqueTenantIds[0] }),
      participantIds,
      submissionIds: [...new Set(submissionIds)],
      capabilities,
      capabilitiesByParticipant,
      ...(primaryParticipantId === undefined ? {} : { primaryParticipantId }),
    };
  }

  async listPortalContexts(accountId: string): Promise<SpeakerPortalContext[]> {
    const [grants, account, profiles, submissionRecords, decisionRecords, events] =
      await Promise.all([
        this.#database
          .prepare(
            `SELECT organization_id, speaker_profile_id
               FROM speaker_grants
              WHERE user_id = ? AND revoked_at IS NULL
              ORDER BY organization_id, speaker_profile_id`,
          )
          .bind(accountId)
          .all<{ organization_id: string; speaker_profile_id: string }>(),
        this.#database
          .prepare(
            `SELECT email
               FROM auth_users
              WHERE id = ? AND email_verified = 1
              LIMIT 1`,
          )
          .bind(accountId)
          .first<{ email?: unknown }>(),
        this.#profiles.list(),
        this.#submissions.list(),
        this.#decisions.list(),
        this.#events.list(),
      ]);
    const accountEmail =
      typeof account?.email === "string" ? account.email.trim().toLowerCase() : undefined;
    const records = submissionRecords as unknown as JsonRecord[];
    const decisions = portalDecisionProjections(decisionRecords);
    const contexts: SpeakerPortalContext[] = [];
    for (const event of events) {
      const eventId = typeof event.id === "string" ? event.id : null;
      if (eventId === null) continue;
      const organizationId = organizationIdOf(event);
      const eventGrants = grants.results.filter(
        (grant) => organizationId === undefined || organizationId === grant.organization_id,
      );
      const ownerRecords = records.filter(
        (record) =>
          !isSpeakerSubmissionRecord(record) &&
          textValue(record, "eventId", "Event ID") === eventId &&
          textValue(record, "ownerAccountId", "Owner Account ID") === accountId &&
          (organizationId === undefined ||
            recordTenantId(record) === undefined ||
            recordTenantId(record) === organizationId),
      );
      const eventProfiles = profiles.filter(
        (profile) =>
          profile.eventId === eventId &&
          eventGrants.some(
            (grant) =>
              grant.speaker_profile_id === profile.id ||
              grant.speaker_profile_id === profile.participantId,
          ),
      );
      const grantParticipantIds = new Set(eventProfiles.map((profile) => profile.participantId));
      const grantSubmissions = records.filter(
        (record) =>
          isSpeakerSubmissionRecord(record) &&
          textValue(record, "eventId", "Event ID") === eventId &&
          portalRecordStatus(record, decisions) === "accepted" &&
          portalParticipantIds(record).some((participantId) =>
            grantParticipantIds.has(participantId),
          ),
      );
      const ownerIds = new Set(
        ownerRecords.map((record) => textValue(record, "id", APPLICATION_ID)).filter(isNonEmpty),
      );
      const submissionIds = [
        ...ownerIds,
        ...grantSubmissions
          .map((record) => textValue(record, "id", APPLICATION_ID))
          .filter(
            (id): id is string => id !== null && !ownerIds.has(originalCfpSubmissionId(id) ?? id),
          ),
      ];
      const participantIds = [
        ...new Set([
          ...ownerRecords.flatMap(portalParticipantIds),
          ...eventProfiles.map((profile) => profile.participantId),
        ]),
      ];
      if (submissionIds.length === 0 || participantIds.length === 0) continue;
      const acceptedOwnerRecords = ownerRecords.filter(
        (record) => portalRecordStatus(record, decisions) === "accepted",
      );
      const acceptedRecords = [...acceptedOwnerRecords, ...grantSubmissions];
      const acceptedParticipants = new Set(acceptedRecords.flatMap(portalParticipantIds));
      const submissionEditingAllowed = ownerRecords.some((record) => {
        const recordStatus = portalRecordStatus(record, decisions);
        return (
          recordStatus === "draft" ||
          recordStatus === "submitted" ||
          recordStatus === "under_review"
        );
      });
      const capabilities: readonly SpeakerPortalCapability[] = [
        ...(acceptedParticipants.size > 0 ? ACCEPTED_PORTAL_CAPABILITIES : []),
        ...(submissionEditingAllowed ? (["submission-edit"] as const) : []),
      ];
      const accountParticipantId =
        accountEmail === undefined
          ? undefined
          : eventProfiles.find((profile) => profile.email?.trim().toLowerCase() === accountEmail)
              ?.participantId;
      const primaryParticipantId =
        accountParticipantId ??
        ownerRecords.map(portalPrimaryParticipantId).find(isDefinedString) ??
        grantSubmissions.map(portalPrimaryParticipantId).find(isDefinedString) ??
        participantIds[0];
      const slug = textValue(event, "slug");
      const status = textValue(event, "status");
      contexts.push({
        id: `portal:${organizationId ?? eventGrants[0]?.organization_id ?? eventId}:${eventId}`,
        eventId,
        name: textValue(event, "name", "title") ?? eventId,
        ...(slug === null ? {} : { slug }),
        ...(status === null ? {} : { status }),
        capabilities,
        submissionIds: [...new Set(submissionIds)],
        participantIds,
        ...(primaryParticipantId === undefined ? {} : { primaryParticipantId }),
      });
    }
    return contexts;
  }

  async listSubmissions(
    eventId: string,
    submissionIds: readonly string[],
  ): Promise<SpeakerSubmission[]> {
    const allowed = new Set(submissionIds);
    const [submissionRecords, decisionRecords] = await Promise.all([
      this.#submissions.listByIds([
        ...new Set(submissionIds.flatMap((id) => [id, originalCfpSubmissionId(id) ?? id])),
      ]),
      listEventScopedJson(this.#decisions, "Metadata JSON", eventId),
    ]);
    const records = submissionRecords as unknown as JsonRecord[];
    const byId = new Map(
      records
        .map((record) => [textValue(record, "id", APPLICATION_ID), record] as const)
        .filter((entry): entry is readonly [string, JsonRecord] => entry[0] !== null),
    );
    const decisions = portalDecisionProjections(decisionRecords);
    const result: SpeakerSubmission[] = [];
    for (const requestedId of submissionIds) {
      if (!allowed.has(requestedId)) continue;
      const sourceId = originalCfpSubmissionId(requestedId) ?? requestedId;
      const source = byId.get(sourceId);
      if (source !== undefined && !isSpeakerSubmissionRecord(source)) {
        const projected = portalSubmissionFromRecord(source, requestedId, decisions);
        if (projected !== null && projected.eventId === eventId) result.push(projected);
        continue;
      }
      const speaker = byId.get(requestedId);
      if (
        speaker !== undefined &&
        isSpeakerSubmissionRecord(speaker) &&
        textValue(speaker, "eventId", "Event ID") === eventId
      ) {
        const validated = speakerSubmissionFromRecord(speaker);
        if (validated !== null) result.push(validated);
      }
    }
    return result;
  }

  async getSubmission(eventId: string, submissionId: string): Promise<SpeakerSubmission | null> {
    const submissions = await this.listSubmissions(eventId, [submissionId]);
    return submissions[0] ?? null;
  }
  async ensureAcceptedSubmission(input: {
    readonly submission: Submission;
    readonly updatedAt: string;
  }): Promise<SpeakerSubmission> {
    const id = `speaker-submission:${input.submission.id}`;
    const answers = isRecord(input.submission.answers) ? input.submission.answers : {};
    const titleCandidate = answers.title ?? answers.sessionTitle;
    const primaryParticipantId =
      input.submission.participants.find((participant) => participant.role === "primary")?.id ??
      input.submission.participants[0]?.id;
    const next: SpeakerSubmission = tagged(
      {
        id,
        eventId: input.submission.eventId,
        formId: input.submission.formId,
        title: typeof titleCandidate === "string" && titleCandidate.trim() ? titleCandidate : id,
        status: "accepted",
        participantIds: input.submission.participants.map((participant) => participant.id),
        version: input.submission.version,
        ...(primaryParticipantId === undefined ? {} : { primaryParticipantId }),
        updatedAt: input.updatedAt,
      },
      "speaker_submission",
    );
    const existing = await this.#submissions.find(id);
    if (existing === undefined) {
      await this.#submissions.create(next);
      await this.ensureRosterForAcceptedSubmission(input.submission, input.updatedAt);
      return clone(untagged(next));
    }
    if (existing.eventId !== next.eventId) {
      throw new Error("The accepted speaker submission belongs to another event.");
    }
    const updated = { ...existing, ...next };
    if (existing.status !== "accepted" || existing.updatedAt !== next.updatedAt) {
      await this.#submissions.update(id, updated);
    }
    await this.ensureRosterForAcceptedSubmission(input.submission, input.updatedAt);
    return clone(untagged(updated));
  }
  private async ensureRosterForAcceptedSubmission(
    submission: Submission,
    updatedAt: string,
  ): Promise<void> {
    const existing = await this.#roster.list();
    const primaryParticipantId =
      submission.participants.find((participant) => participant.role === "primary")?.id ??
      submission.participants[0]?.id;
    for (const participant of submission.participants) {
      const id = `roster:${submission.eventId}:speaker-submission:${submission.id}:${participant.id}`;
      if (existing.some((entry) => entry.id === id)) continue;
      const entry: SpeakerRosterEntry & { tenantId?: string } = {
        id,
        tenantId: submission.tenantId,
        eventId: submission.eventId,
        submissionId: `speaker-submission:${submission.id}`,
        participantId: participant.id,
        displayName: `${participant.firstName} ${participant.lastName}`.trim() || participant.id,
        ...(participant.email.trim().length === 0
          ? {}
          : { email: participant.email.trim().toLowerCase() }),
        role: participant.id === primaryParticipantId ? "primary" : "co_speaker",
        status: "active",
        version: 1,
        createdAt: updatedAt,
        updatedAt,
      };
      await this.#roster.create(entry);
    }
  }

  async ensureProfile(input: {
    readonly eventId: string;
    readonly participant: SubmissionParticipant;
    readonly updatedAt: string;
    readonly organizationId?: string;
  }): Promise<SpeakerProfile> {
    const id = `speaker-profile:${input.eventId}:${input.participant.id}`;
    const event = await this.#events.find(input.eventId);
    const eventOrganizationId =
      event === undefined ? undefined : authoritativeOrganizationId(event);
    const organizationId =
      typeof input.organizationId === "string" && input.organizationId.trim().length > 0
        ? input.organizationId.trim()
        : eventOrganizationId;
    if (organizationId === undefined) {
      throw new Error("The speaker profile organization could not be resolved.");
    }
    if (eventOrganizationId !== undefined && eventOrganizationId !== organizationId) {
      throw new Error("The speaker profile event belongs to another organization.");
    }
    const existing = await this.getProfile(input.eventId, input.participant.id, organizationId);
    const displayName = `${input.participant.firstName} ${input.participant.lastName}`.trim();
    const email = input.participant.email.trim().toLowerCase();
    if (existing !== null) {
      const existingOrganizationId = authoritativeOrganizationId(existing);
      if (
        existingOrganizationId === undefined &&
        (Object.hasOwn(existing, "organizationId") || Object.hasOwn(existing, "tenantId"))
      ) {
        throw new Error("The speaker profile has conflicting tenant data.");
      }
      if (existingOrganizationId !== undefined && existingOrganizationId !== organizationId) {
        throw new Error("The speaker profile belongs to another organization.");
      }
      const updated: SpeakerProfile & JsonRecord = {
        ...existing,
        tenantId: organizationId,
        ...(displayName.length === 0 || existing.displayName === displayName
          ? {}
          : { displayName }),
        ...(email.length === 0 || existing.email === email ? {} : { email }),
        ...(existing.status === "accepted" ? {} : { status: "accepted" }),
      };
      if (
        updated.displayName === existing.displayName &&
        updated.email === existing.email &&
        updated.status === existing.status &&
        existingOrganizationId === organizationId
      ) {
        return existing;
      }
      const persisted: SpeakerProfile & JsonRecord = {
        ...updated,
        version: existing.version + 1,
        updatedAt: input.updatedAt,
      };
      await this.#profiles.update(existing.id, tagged(persisted, "speaker_profile"));
      return clone(persisted);
    }
    const profile = tagged(
      {
        id,
        tenantId: organizationId,
        eventId: input.eventId,
        participantId: input.participant.id,
        displayName,
        ...(email.length === 0 ? {} : { email }),
        biography: input.participant.biography,
        status: "accepted",
        version: 1,
        updatedAt: input.updatedAt,
      },
      "speaker_profile",
    );
    await this.#profiles.create(profile);
    return clone(untagged(profile));
  }
  async ensureOrganizerSpeakerProfile(input: {
    readonly organizationId: string;
    readonly eventId: string;
    readonly participantId: string;
    readonly displayName: string;
    readonly email: string;
    readonly jobTitle: string;
    readonly company: string;
    readonly biography: string;
    readonly socialLinks: Readonly<Record<string, string>>;
    readonly status: string;
    readonly updatedAt: string;
  }): Promise<SpeakerProfile> {
    const existing = await this.getProfile(
      input.eventId,
      input.participantId,
      input.organizationId,
    );
    const profile: SpeakerProfile & JsonRecord = {
      id: existing?.id ?? `speaker-profile:${input.eventId}:${input.participantId}`,
      tenantId: input.organizationId,
      eventId: input.eventId,
      participantId: input.participantId,
      displayName: input.displayName,
      email: input.email.trim().toLowerCase(),
      jobTitle: input.jobTitle,
      company: input.company,
      biography: input.biography,
      socialLinks: { ...input.socialLinks },
      status: input.status,
      version: existing?.version ?? 1,
      updatedAt: input.updatedAt,
    };
    if (existing === null) {
      await this.#profiles.create(tagged(profile, "speaker_profile"));
    } else {
      await this.#profiles.update(
        existing.id,
        tagged({ ...profile, version: existing.version + 1 }, "speaker_profile"),
      );
      profile.version = existing.version + 1;
    }
    await this.ensureVerifiedSpeakerGrant({
      organizationId: input.organizationId,
      eventId: input.eventId,
      participantId: input.participantId,
      email: input.email,
      createdAt: input.updatedAt,
    });
    return clone(profile);
  }
  async ensureVerifiedSpeakerGrant(input: {
    readonly organizationId: string;
    readonly eventId: string;
    readonly participantId: string;
    readonly email: string;
    readonly createdAt: string;
  }): Promise<boolean> {
    const email = input.email.trim().toLowerCase();
    if (
      input.organizationId.trim().length === 0 ||
      input.eventId.trim().length === 0 ||
      input.participantId.trim().length === 0 ||
      email.length === 0
    ) {
      return false;
    }
    const profile = await this.getProfile(input.eventId, input.participantId, input.organizationId);
    if (profile === null || profile.email?.trim().toLowerCase() !== email) return false;
    const result = await this.#database
      .prepare(
        `SELECT id
           FROM auth_users
          WHERE LOWER(email) = LOWER(?) AND email_verified = 1
          ORDER BY id
          LIMIT 2`,
      )
      .bind(email)
      .all<{ id?: unknown }>();
    let userIds = result.results
      .map((row) => (typeof row.id === "string" ? row.id.trim() : ""))
      .filter((id) => id.length > 0);
    if (userIds.length === 0) {
      const user = await this.#database
        .prepare(
          `SELECT id
             FROM auth_users
            WHERE LOWER(email) = LOWER(?) AND email_verified = 1
            LIMIT 1`,
        )
        .bind(email)
        .first<{ id?: unknown }>();
      const id = typeof user?.id === "string" ? user.id.trim() : "";
      if (id.length > 0) userIds = [id];
    }
    if (userIds.length !== 1) return false;
    await this.#database
      .prepare(
        `INSERT INTO speaker_grants
           (organization_id, speaker_profile_id, user_id, created_at, revoked_at)
         VALUES (?, ?, ?, ?, NULL)
         ON CONFLICT (organization_id, speaker_profile_id, user_id) DO UPDATE SET revoked_at = NULL`,
      )
      .bind(input.organizationId, profile.id, userIds[0], input.createdAt)
      .run();
    return true;
  }

  async ensureProfileTask(input: {
    readonly eventId: string;
    readonly submissionId: string;
    readonly participantId: string;
    readonly updatedAt: string;
  }): Promise<SpeakerTask> {
    const id = `speaker-task:${input.eventId}:${input.submissionId}:${input.participantId}:profile`;
    const existing = await this.#tasks.find(id);
    if (existing !== undefined) return untagged(existing);
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
    return clone(untagged(task));
  }

  async listProfiles(
    eventId: string,
    participantIds: readonly string[],
  ): Promise<SpeakerProfile[]> {
    const event = await this.#events.find(eventId);
    const organizationId = event === undefined ? undefined : authoritativeOrganizationId(event);
    if (organizationId === undefined) return [];
    const profileIds = participantIds.map(
      (participantId) => `speaker-profile:${eventId}:${participantId}`,
    );
    return (await this.#profiles.listByIds(profileIds))
      .filter(
        (profile) =>
          speakerProfileScoped(profile, organizationId, eventId, organizationId) &&
          participantIds.includes(profile.participantId),
      )
      .map((profile) => untagged(profile));
  }

  async getProfile(
    eventId: string,
    participantId: string,
    organizationId?: string,
  ): Promise<SpeakerProfile | null> {
    const profile = await this.#profiles.find(`speaker-profile:${eventId}:${participantId}`);
    if (
      profile === undefined ||
      profile.eventId !== eventId ||
      profile.participantId !== participantId
    ) {
      return null;
    }
    const event = await this.#events.find(eventId);
    const eventOrganizationId =
      event === undefined ? undefined : authoritativeOrganizationId(event);
    const expectedOrganizationId =
      typeof organizationId === "string" && organizationId.trim().length > 0
        ? organizationId.trim()
        : eventOrganizationId;
    if (expectedOrganizationId === undefined) return null;
    return speakerProfileScoped(
      profile,
      expectedOrganizationId,
      eventId,
      eventOrganizationId ?? expectedOrganizationId,
    )
      ? untagged(profile)
      : null;
  }

  async updateBiography(
    command: UpdateBiographyCommand,
  ): Promise<RepositoryResult<SpeakerProfile>> {
    const event = await this.#events.find(command.eventId);
    const organizationId = event === undefined ? undefined : authoritativeOrganizationId(event);
    if (organizationId === undefined) return { ok: false, reason: "not_found" };
    const profile = await this.getProfile(command.eventId, command.participantId, organizationId);
    if (profile === null) return { ok: false, reason: "not_found" };
    if (profile.version !== command.expectedVersion)
      return { ok: false, reason: "version_conflict" };
    const updated: SpeakerProfile & JsonRecord = {
      ...profile,
      tenantId: organizationId,
      biography: command.biography,
      version: profile.version + 1,
      updatedAt: command.updatedAt,
    };
    await this.#profiles.update(profile.id, tagged(updated, "speaker_profile"));
    return { ok: true, value: clone(updated) };
  }
  async updateProfile(
    command: UpdateSpeakerProfileCommand,
  ): Promise<RepositoryResult<SpeakerProfile>> {
    const event = await this.#events.find(command.eventId);
    const organizationId = event === undefined ? undefined : authoritativeOrganizationId(event);
    if (organizationId === undefined) return { ok: false, reason: "not_found" };
    const profile = await this.getProfile(command.eventId, command.participantId, organizationId);
    if (profile === null) return { ok: false, reason: "not_found" };
    if (profile.version !== command.expectedVersion) {
      return { ok: false, reason: "version_conflict" };
    }
    if (command.headshotAssetId !== undefined && command.headshotAssetId !== null) {
      const asset = await this.getAsset(command.eventId, command.headshotAssetId);
      if (
        asset === null ||
        asset.eventId !== command.eventId ||
        asset.participantId !== command.participantId ||
        asset.kind !== "headshot" ||
        asset.state !== "ready"
      ) {
        return { ok: false, reason: "not_found" };
      }
    }
    const updated: SpeakerProfile & JsonRecord = {
      ...profile,
      tenantId: organizationId,
      ...(command.displayName === undefined ? {} : { displayName: command.displayName }),
      ...(command.email === undefined ? {} : { email: command.email }),
      ...(command.jobTitle === undefined ? {} : { jobTitle: command.jobTitle }),
      ...(command.company === undefined ? {} : { company: command.company }),
      ...(command.status === undefined ? {} : { status: command.status }),
      ...(command.biography === undefined ? {} : { biography: command.biography }),
      ...(command.socialLinks === undefined ? {} : { socialLinks: command.socialLinks }),
      version: profile.version + 1,
      updatedAt: command.updatedAt,
    };
    if (command.headshotAssetId === null) {
      delete updated.headshotAssetId;
    } else if (command.headshotAssetId !== undefined) {
      updated.headshotAssetId = command.headshotAssetId;
    }
    await this.#profiles.update(profile.id, tagged(updated, "speaker_profile"));
    return { ok: true, value: clone(updated) };
  }

  async listTasks(eventId: string, participantIds: readonly string[]): Promise<SpeakerTask[]> {
    const allowed = new Set(participantIds);
    return (await this.#tasks.list())
      .filter((task) => task.eventId === eventId && allowed.has(task.participantId))
      .map((task) => untagged(task));
  }

  async createTask(command: SpeakerTaskRepositoryCommand): Promise<RepositoryResult<SpeakerTask>> {
    if (command.expectedVersion !== null) {
      return { ok: false, reason: "version_conflict" };
    }
    const existing = await this.#tasks.find(command.task.id);
    if (existing !== undefined) {
      return { ok: false, reason: "version_conflict" };
    }
    const stored = tagged(command.task, "speaker_task");
    await this.#tasks.create(stored);
    return { ok: true, value: clone(untagged(stored)) };
  }

  async updateTask(command: SpeakerTaskRepositoryCommand): Promise<RepositoryResult<SpeakerTask>> {
    if (command.expectedVersion === null) {
      return { ok: false, reason: "version_conflict" };
    }
    const existing = await this.#tasks.find(command.task.id);
    if (existing === undefined || existing.eventId !== command.task.eventId) {
      return { ok: false, reason: "not_found" };
    }
    if (existing.version !== command.expectedVersion) {
      return { ok: false, reason: "version_conflict" };
    }
    const stored = tagged(command.task, "speaker_task");
    await this.#tasks.update(command.task.id, stored);
    return { ok: true, value: clone(untagged(stored)) };
  }

  async getTask(eventId: string, taskId: string): Promise<SpeakerTask | null> {
    const task = await this.#tasks.find(taskId);
    return task !== undefined && task.eventId === eventId ? untagged(task) : null;
  }

  async getTasksByIds(eventId: string, taskIds: readonly string[]): Promise<SpeakerTask[]> {
    const allowed = new Set(taskIds);
    return (await this.#tasks.listByIds([...allowed]))
      .filter((task) => task.eventId === eventId && allowed.has(task.id))
      .map((task) => untagged(task));
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
    return {
      ok: true,
      value: { task: updated, transition: clone(command.transition) },
    };
  }

  async createPendingAsset(asset: SpeakerAsset): Promise<SpeakerAsset> {
    await this.#assets.create(tagged(asset, "speaker_asset"));
    return clone(asset);
  }
  async getAsset(eventId: string, assetId: string): Promise<SpeakerAsset | null> {
    const [asset, event] = await Promise.all([
      this.#assets.find(assetId),
      this.#events.find(eventId),
    ]);
    const tenantId = event === undefined ? undefined : authoritativeOrganizationId(event);
    return asset !== undefined &&
      entityType(asset) === "speaker_asset" &&
      asset.eventId === eventId &&
      (tenantId === undefined || asset.tenantId === undefined || asset.tenantId === tenantId)
      ? clone(untagged(asset))
      : null;
  }

  async listAssets(eventId: string, participantIds: readonly string[]): Promise<SpeakerAsset[]> {
    const allowed = new Set(participantIds);
    if (participantIds.length === 0) return [];
    const assets = await listEventScopedJson(this.#assets, "Settings JSON", eventId);
    return assets
      .filter(
        (asset) =>
          entityType(asset) === "speaker_asset" &&
          asset.eventId === eventId &&
          allowed.has(asset.participantId),
      )
      .map((asset) => clone(untagged(asset)));
  }

  async finalizeAsset(
    command: FinalizeSpeakerAssetCommand,
  ): Promise<RepositoryResult<SpeakerAsset>> {
    const current = await this.getAsset(command.eventId, command.assetId);
    if (current === null) return { ok: false, reason: "not_found" };
    if (current.state !== "pending_upload") return { ok: false, reason: "invalid_state" };
    const updated: SpeakerAsset = {
      ...current,
      state: command.state,
      finalizedAt: command.finalizedAt,
      ...(command.rejectionReason === undefined
        ? {}
        : { rejectionReason: command.rejectionReason }),
    };
    await this.#assets.update(command.assetId, tagged(updated, "speaker_asset"));
    return { ok: true, value: clone(updated) };
  }

  async listRosterForEvent(eventId: string): Promise<SpeakerRosterEntry[]> {
    const [event, roster] = await Promise.all([
      this.#events.find(eventId),
      listEventScopedJson(this.#roster, "Members JSON", eventId),
    ]);
    const tenantId = event === undefined ? undefined : authoritativeOrganizationId(event);
    return roster
      .filter((entry) => {
        const recordTenantId = authoritativeOrganizationId(entry);
        const crmRoster = isCrmRosterAdmission(entry);
        return (
          entry.eventId === eventId &&
          (crmRoster
            ? tenantId !== undefined && recordTenantId === tenantId
            : tenantId === undefined || recordTenantId === undefined || recordTenantId === tenantId)
        );
      })
      .map(({ tenantId: _tenantId, authorAccountId: _authorAccountId, ...entry }) => clone(entry));
  }

  async listRoster(eventId: string, submissionId: string): Promise<SpeakerRosterEntry[]> {
    const canonicalSubmissionId = submissionId.startsWith("speaker-submission:")
      ? submissionId
      : `speaker-submission:${submissionId}`;
    return (await this.listRosterForEvent(eventId)).filter(
      (entry) => entry.submissionId === canonicalSubmissionId,
    );
  }

  async saveRoster(
    entry: SpeakerRosterEntry,
    expectedVersion: number | null,
  ): Promise<RepositoryResult<SpeakerRosterEntry>> {
    const event = await this.#events.find(entry.eventId);
    const tenantId = event === undefined ? undefined : authoritativeOrganizationId(event);
    const persistedEntry = {
      ...entry,
      ...(tenantId === undefined ? {} : { tenantId }),
    };
    const existing = await this.#roster.find(entry.id);
    if (expectedVersion === null) {
      if (existing !== undefined) return { ok: false, reason: "version_conflict" };
      await this.#roster.create(clone(persistedEntry));
      return { ok: true, value: clone(entry) };
    }
    if (
      existing === undefined ||
      existing.eventId !== entry.eventId ||
      existing.submissionId !== entry.submissionId
    ) {
      return { ok: false, reason: "not_found" };
    }
    if (existing.version !== expectedVersion) return { ok: false, reason: "version_conflict" };
    await this.#roster.update(entry.id, clone(persistedEntry));
    return { ok: true, value: clone(entry) };
  }

  async revokeRoster(
    eventId: string,
    submissionId: string,
    participantId: string,
    expectedVersion: number,
    updatedAt: string,
  ): Promise<RepositoryResult<SpeakerRosterEntry>> {
    const entry = (await this.listRoster(eventId, submissionId)).find(
      (candidate) => candidate.participantId === participantId,
    );
    if (entry === undefined) return { ok: false, reason: "not_found" };
    return this.saveRoster(
      { ...entry, status: "revoked", version: entry.version + 1, updatedAt },
      expectedVersion,
    );
  }

  async getTaskForm(eventId: string, taskId: string): Promise<SpeakerTaskFormDefinition | null> {
    const definition = (await this.#taskForms.list()).find(
      (candidate) =>
        candidate.eventId === eventId &&
        candidate.taskId === taskId &&
        candidate.published === true,
    );
    return definition === undefined ? null : clone(definition);
  }

  async listTaskResponses(
    eventId: string,
    taskId: string,
    participantId: string,
  ): Promise<SpeakerTaskResponseRecord[]> {
    return (await this.#taskResponses.list())
      .filter(
        (response) =>
          response.eventId === eventId &&
          response.taskId === taskId &&
          response.participantId === participantId,
      )
      .map(({ tenantId: _tenantId, ...response }) => clone(response));
  }

  async saveTaskResponse(
    response: SpeakerTaskResponseRecord,
    expectedVersion: number | null,
  ): Promise<RepositoryResult<SpeakerTaskResponseRecord>> {
    const existing = await this.#taskResponses.find(response.id);
    if (existing !== undefined) return { ok: false, reason: "version_conflict" };
    const matching = (await this.#taskResponses.list()).filter(
      (candidate) =>
        candidate.eventId === response.eventId &&
        candidate.taskId === response.taskId &&
        candidate.participantId === response.participantId,
    );
    const latestVersion = matching.reduce(
      (latest, candidate) => Math.max(latest, candidate.version),
      0,
    );
    if (expectedVersion === null ? matching.length > 0 : latestVersion !== expectedVersion) {
      return { ok: false, reason: "version_conflict" };
    }
    await this.#taskResponses.create(clone(response));
    return { ok: true, value: clone(response) };
  }

  async listAssetHistory(eventId: string, versionFamilyId: string): Promise<SpeakerAsset[]> {
    return (await this.#assets.list())
      .filter(
        (asset) =>
          entityType(asset) === "speaker_asset" &&
          asset.eventId === eventId &&
          (asset.versionFamilyId ?? asset.id) === versionFamilyId,
      )
      .map((asset) => clone(untagged(asset)))
      .sort((left, right) => (left.version ?? 0) - (right.version ?? 0));
  }

  async listAssetComments(eventId: string, assetId: string): Promise<SpeakerAssetComment[]> {
    return (await this.#assetComments.list())
      .filter((comment) => comment.eventId === eventId && comment.assetId === assetId)
      .map(({ tenantId: _tenantId, authorAccountId: _authorAccountId, ...comment }) =>
        clone(comment),
      );
  }

  async createAssetComment(comment: SpeakerAssetComment): Promise<SpeakerAssetComment> {
    await this.#assetComments.create(clone(comment));
    return clone(comment);
  }

  async listEventResources(eventId: string): Promise<SpeakerEventResource[]> {
    return (await this.#resources.list())
      .filter((resource) => {
        if (resource.eventId !== eventId) return false;
        const record: unknown = resource;
        return !isRecord(record) || (record.published !== false && record.status !== "draft");
      })
      .map(({ tenantId: _tenantId, ...resource }) => clone(resource))
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  }

  async listWikiPages(eventId: string): Promise<SpeakerWikiPage[]> {
    return (await this.#wikiPages.list())
      .filter((page) => {
        if (page.eventId !== eventId) return false;
        const record: unknown = page;
        return !isRecord(record) || (record.published !== false && record.status !== "draft");
      })
      .map(({ tenantId: _tenantId, ...page }) => clone(page))
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  }
}

interface StoredPrivateCapability {
  kind: "upload" | "download";
  capabilityHash: string;
  tenantId: string;
  eventId: string;
  submissionId: string;
  participantId: string;
  taskId?: string;
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  fileName: string;
  expiresAt: string;
}

interface PrivateUploadRow {
  object_key: string;
  content_type: string;
  byte_size: number;
  state: string;
  scan_result_code: string | null;
}

function capabilityPayload(capability: StoredPrivateCapability): string {
  return JSON.stringify(capability);
}

function parseStoredCapability(value: string | null): StoredPrivateCapability | null {
  if (value === null) return null;
  try {
    const candidate: unknown = JSON.parse(value);
    if (!isRecord(candidate)) return null;
    if (
      (candidate.kind !== "upload" && candidate.kind !== "download") ||
      typeof candidate.capabilityHash !== "string" ||
      typeof candidate.tenantId !== "string" ||
      typeof candidate.eventId !== "string" ||
      typeof candidate.submissionId !== "string" ||
      typeof candidate.participantId !== "string" ||
      typeof candidate.objectKey !== "string" ||
      typeof candidate.contentType !== "string" ||
      typeof candidate.sizeBytes !== "number" ||
      !Number.isSafeInteger(candidate.sizeBytes) ||
      typeof candidate.fileName !== "string" ||
      typeof candidate.expiresAt !== "string"
    ) {
      return null;
    }
    return candidate as unknown as StoredPrivateCapability;
  } catch {
    return null;
  }
}

function capabilityToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function capabilityHash(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** R2 private bytes are reachable only through database-backed opaque capabilities. */
export class R2PrivateAssetGateway implements PrivateAssetGateway {
  readonly #bucket: R2Bucket;
  readonly #database: D1Database | undefined;
  readonly #memory = new Map<
    string,
    {
      capability: StoredPrivateCapability;
      state: "pending" | "uploaded" | "consumed";
    }
  >();

  constructor(bucket: R2Bucket, _origin: string, database?: D1Database) {
    this.#bucket = bucket;
    this.#database = database;
  }

  async createUploadGrant(_command: CreatePrivateUploadGrantCommand): Promise<PrivateUploadGrant> {
    throw new Error("A fully bound upload capability is required.");
  }

  async createDownloadGrant(_command: {
    objectKey: string;
    fileName: string;
    expiresAt: string;
  }): Promise<PrivateDownloadGrant> {
    throw new Error("A fully bound download capability is required.");
  }

  async registerUploadCapability(
    binding: PrivateAssetCapabilityBinding,
  ): Promise<PrivateUploadGrant> {
    const token = capabilityToken();
    const capability: StoredPrivateCapability = {
      kind: "upload",
      capabilityHash: await capabilityHash(token),
      tenantId: binding.tenantId,
      eventId: binding.eventId,
      submissionId: binding.submissionId,
      participantId: binding.participantId,
      ...(binding.taskId === undefined ? {} : { taskId: binding.taskId }),
      objectKey: binding.objectKey,
      contentType: binding.contentType,
      sizeBytes: binding.sizeBytes,
      fileName: binding.fileName,
      expiresAt: binding.expiresAt,
    };
    await this.storeCapability(binding.capabilityId, capability, "pending");
    return {
      method: "PUT",
      url: `/api/speaker/assets/capabilities/upload/${encodeURIComponent(binding.capabilityId)}/${token}`,
      headers: {
        "content-type": binding.contentType,
        "content-length": String(binding.sizeBytes),
      },
      expiresAt: binding.expiresAt,
    };
  }

  async registerDownloadCapability(
    binding: PrivateAssetCapabilityBinding,
  ): Promise<PrivateDownloadGrant> {
    const object = await this.#bucket.head(binding.objectKey);
    if (
      object === null ||
      object.size !== binding.sizeBytes ||
      (object.httpMetadata?.contentType ?? "").trim().toLowerCase() !==
        binding.contentType.trim().toLowerCase()
    ) {
      throw new Error("The requested private asset is not available.");
    }
    const token = capabilityToken();
    const capability: StoredPrivateCapability = {
      kind: "download",
      capabilityHash: await capabilityHash(token),
      tenantId: binding.tenantId,
      eventId: binding.eventId,
      submissionId: binding.submissionId,
      participantId: binding.participantId,
      ...(binding.taskId === undefined ? {} : { taskId: binding.taskId }),
      objectKey: binding.objectKey,
      contentType: binding.contentType,
      sizeBytes: binding.sizeBytes,
      fileName: binding.fileName,
      expiresAt: binding.expiresAt,
    };
    const existing = await this.readRow(binding.capabilityId);
    await this.storeCapability(
      binding.capabilityId,
      capability,
      existing?.state === "pending" ? "pending" : "uploaded",
    );
    return {
      method: "GET",
      url: `/api/speaker/assets/capabilities/download/${encodeURIComponent(binding.capabilityId)}/${token}`,
      expiresAt: binding.expiresAt,
    };
  }

  async consumeUploadCapability(
    capabilityId: string,
    token: string,
    request: Request,
  ): Promise<PrivateUploadReceipt> {
    if (request.method !== "PUT") throw new Error("The upload capability requires PUT.");
    const row = await this.readRow(capabilityId);
    const capability = parseStoredCapability(row?.scan_result_code ?? null);
    if (row === null || capability === null || capability.kind !== "upload") {
      throw new Error("The upload capability is invalid.");
    }
    await this.assertToken(capability, token);
    if (row.state !== "pending") throw new Error("The upload capability has already been used.");
    if (Date.parse(capability.expiresAt) <= Date.now()) {
      throw new Error("The upload capability has expired.");
    }
    const contentType = request.headers.get("content-type")?.trim().toLowerCase() ?? "";
    const declaredLength = request.headers.get("content-length");
    if (
      contentType !== capability.contentType.trim().toLowerCase() ||
      (declaredLength !== null &&
        (!/^\d+$/u.test(declaredLength) || Number(declaredLength) !== capability.sizeBytes))
    ) {
      throw new Error("The uploaded object metadata is not allowed.");
    }
    const body = await request.arrayBuffer();
    if (body.byteLength !== capability.sizeBytes) {
      throw new Error("The uploaded object size does not match the capability.");
    }
    await this.claim(capabilityId, row.scan_result_code ?? "", "uploaded");
    try {
      await this.#bucket.put(capability.objectKey, body, {
        httpMetadata: { contentType: capability.contentType },
      });
    } catch (error) {
      await this.releaseClaim(capabilityId, capabilityPayload(capability));
      throw error;
    }
    return {
      contentType: capability.contentType,
      sizeBytes: capability.sizeBytes,
      uploadedAt: new Date().toISOString(),
    };
  }

  async consumeDownloadCapability(
    capabilityId: string,
    token: string,
  ): Promise<PrivateDownloadObject> {
    const row = await this.readRow(capabilityId);
    const capability = parseStoredCapability(row?.scan_result_code ?? null);
    if (row === null || capability === null || capability.kind !== "download") {
      throw new Error("The download capability is invalid.");
    }
    await this.assertToken(capability, token);
    if (Date.parse(capability.expiresAt) <= Date.now()) {
      throw new Error("The download capability has expired.");
    }
    if (row.state !== "uploaded") throw new Error("The download capability has already been used.");
    await this.claim(capabilityId, row.scan_result_code ?? "", "download-consumed", "uploaded");
    const object = await this.#bucket.get(capability.objectKey);
    if (object === null || object.body === null) {
      throw new Error("The requested private asset is not available.");
    }
    const contentType = object.httpMetadata?.contentType ?? capability.contentType;
    if (object.size !== capability.sizeBytes) {
      throw new Error("The private asset no longer matches its immutable metadata.");
    }
    return {
      body: object.body,
      contentType,
      sizeBytes: object.size,
      fileName: capability.fileName,
    };
  }

  async inspectObject(
    command: Pick<PrivateAssetCapabilityBinding, "objectKey" | "contentType" | "sizeBytes">,
  ) {
    const object = await this.#bucket.head(command.objectKey);
    if (object === null || object.size !== command.sizeBytes) return null;
    const contentType = object.httpMetadata?.contentType ?? "";
    return contentType.trim().toLowerCase() === command.contentType.trim().toLowerCase()
      ? { contentType, sizeBytes: object.size }
      : null;
  }
  async verifyUploadCapability(binding: PrivateAssetCapabilityBinding): Promise<boolean> {
    const row = await this.readRow(binding.capabilityId);
    const capability = parseStoredCapability(row?.scan_result_code ?? null);
    if (
      row === null ||
      capability === null ||
      capability.kind !== "upload" ||
      row.state !== "uploaded" ||
      capability.tenantId !== binding.tenantId ||
      capability.eventId !== binding.eventId ||
      capability.submissionId !== binding.submissionId ||
      capability.participantId !== binding.participantId ||
      capability.objectKey !== binding.objectKey ||
      capability.contentType.trim().toLowerCase() !== binding.contentType.trim().toLowerCase() ||
      capability.sizeBytes !== binding.sizeBytes ||
      capability.fileName !== binding.fileName
    ) {
      return false;
    }
    return (await this.inspectObject(binding)) !== null;
  }

  async invalidateUploadCapability(binding: PrivateAssetCapabilityBinding): Promise<void> {
    const row = await this.readRow(binding.capabilityId);
    const capability = parseStoredCapability(row?.scan_result_code ?? null);
    if (
      row === null ||
      capability === null ||
      capability.kind !== "upload" ||
      capability.tenantId !== binding.tenantId ||
      capability.eventId !== binding.eventId ||
      capability.submissionId !== binding.submissionId ||
      capability.participantId !== binding.participantId ||
      capability.objectKey !== binding.objectKey
    ) {
      return;
    }
    if (this.#database === undefined) {
      const stored = this.#memory.get(binding.capabilityId);
      if (stored !== undefined) stored.state = "consumed";
      return;
    }
    await this.#database
      .prepare(
        `UPDATE private_uploads
            SET state = 'deleted', updated_at = ?
          WHERE id = ? AND scan_result_code = ?`,
      )
      .bind(new Date().toISOString(), binding.capabilityId, row.scan_result_code)
      .run();
  }

  async readObject(binding: PrivateAssetCapabilityBinding): Promise<PrivateDownloadObject | null> {
    const object = await this.#bucket.get(binding.objectKey);
    if (object === null || object.body === null || object.size !== binding.sizeBytes) return null;
    const contentType = object.httpMetadata?.contentType?.trim().toLowerCase() ?? "";
    if (contentType !== binding.contentType.trim().toLowerCase()) return null;
    return {
      body: object.body,
      contentType: object.httpMetadata?.contentType ?? binding.contentType,
      sizeBytes: object.size,
      fileName: binding.fileName,
    };
  }

  private async assertToken(capability: StoredPrivateCapability, token: string): Promise<void> {
    if (token.length < 32 || (await capabilityHash(token)) !== capability.capabilityHash) {
      throw new Error("The capability token is invalid.");
    }
  }

  private async readRow(capabilityId: string): Promise<PrivateUploadRow | null> {
    if (this.#database !== undefined) {
      return this.#database
        .prepare(
          `SELECT object_key, content_type, byte_size, state, scan_result_code
             FROM private_uploads
            WHERE id = ?
            LIMIT 1`,
        )
        .bind(capabilityId)
        .first<PrivateUploadRow>();
    }
    const stored = this.#memory.get(capabilityId);
    return stored === undefined
      ? null
      : {
          object_key: stored.capability.objectKey,
          content_type: stored.capability.contentType,
          byte_size: stored.capability.sizeBytes,
          state: stored.state,
          scan_result_code: capabilityPayload(stored.capability),
        };
  }

  private async storeCapability(
    capabilityId: string,
    capability: StoredPrivateCapability,
    state: "pending" | "uploaded",
  ): Promise<void> {
    const payload = capabilityPayload(capability);
    if (this.#database === undefined) {
      this.#memory.set(capabilityId, { capability, state });
      return;
    }
    const existing = await this.readRow(capabilityId);
    if (existing === null) {
      await this.#database
        .prepare(
          `INSERT INTO private_uploads
             (id, tenant_id, object_key, content_type, byte_size, checksum_sha256,
              state, scan_result_code, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'not-computed', ?, ?, ?, ?)`,
        )
        .bind(
          capabilityId,
          capability.tenantId,
          capability.objectKey,
          capability.contentType,
          capability.sizeBytes,
          state,
          payload,
          new Date().toISOString(),
          new Date().toISOString(),
        )
        .run();
      return;
    }
    if (
      existing.object_key !== capability.objectKey ||
      existing.content_type !== capability.contentType ||
      existing.byte_size !== capability.sizeBytes
    ) {
      throw new Error("The private asset capability binding is immutable.");
    }
    await this.#database
      .prepare(
        `UPDATE private_uploads
            SET state = ?, scan_result_code = ?, updated_at = ?
          WHERE id = ?`,
      )
      .bind(state, payload, new Date().toISOString(), capabilityId)
      .run();
  }

  private async claim(
    capabilityId: string,
    expectedPayload: string,
    nextState: string,
    expectedState: "pending" | "uploaded" = "pending",
  ): Promise<void> {
    if (this.#database === undefined) {
      const stored = this.#memory.get(capabilityId);
      if (
        stored === undefined ||
        stored.state !== expectedState ||
        capabilityPayload(stored.capability) !== expectedPayload
      ) {
        throw new Error("The capability has already been used.");
      }
      stored.state = nextState === "download-consumed" ? "consumed" : "uploaded";
      return;
    }
    const databaseState = nextState === "download-consumed" ? expectedState : nextState;
    const result = await this.#database
      .prepare(
        `UPDATE private_uploads
            SET state = ?, scan_result_code = ?, updated_at = ?
          WHERE id = ? AND state = ? AND scan_result_code = ?`,
      )
      .bind(
        databaseState,
        nextState === "download-consumed" ? nextState : expectedPayload,
        new Date().toISOString(),
        capabilityId,
        expectedState,
        expectedPayload,
      )
      .run();
    if ((result.meta?.changes ?? 0) !== 1) {
      throw new Error("The capability has already been used.");
    }
  }

  private async releaseClaim(capabilityId: string, payload: string): Promise<void> {
    if (this.#database === undefined) {
      const stored = this.#memory.get(capabilityId);
      if (stored !== undefined) stored.state = "pending";
      return;
    }
    await this.#database
      .prepare(
        `UPDATE private_uploads
            SET state = 'pending', scan_result_code = ?, updated_at = ?
          WHERE id = ? AND state = 'uploaded'`,
      )
      .bind(payload, new Date().toISOString(), capabilityId)
      .run();
  }
}

const CFP_SUBMISSION_PARTICIPANT = "__cfp_submission__";
const CFP_FILE_UPLOAD_LIFETIME_MS = 15 * 60 * 1000;

function cfpAssetMetadata(asset: SpeakerAsset): {
  readonly fieldKey: string;
  readonly owner: "submission" | "participant";
  readonly participantId?: string;
} | null {
  const tenantId = typeof asset.tenantId === "string" ? asset.tenantId.trim() : "";
  const submissionId = typeof asset.submissionId === "string" ? asset.submissionId.trim() : "";
  const segments = asset.objectKey.split("/");
  if (
    tenantId.length === 0 ||
    submissionId.length === 0 ||
    segments.length !== 7 ||
    segments[0] !== "cfp" ||
    segments[6] !== asset.id
  ) {
    return null;
  }
  const pathTenantEncoded = segments[1];
  const pathEventEncoded = segments[2];
  const pathSubmissionEncoded = segments[3];
  const owner = segments[4];
  const pathFieldEncoded = segments[5];
  if (
    pathTenantEncoded === undefined ||
    pathEventEncoded === undefined ||
    pathSubmissionEncoded === undefined ||
    owner === undefined ||
    pathFieldEncoded === undefined
  ) {
    return null;
  }
  let pathTenant: string;
  let pathEvent: string;
  let pathSubmission: string;
  let pathField: string;
  try {
    pathTenant = decodeURIComponent(pathTenantEncoded);
    pathEvent = decodeURIComponent(pathEventEncoded);
    pathSubmission = decodeURIComponent(pathSubmissionEncoded);
    pathField = decodeURIComponent(pathFieldEncoded);
  } catch {
    return null;
  }
  if (
    pathTenant !== tenantId ||
    pathEvent !== asset.eventId ||
    pathSubmission !== submissionId ||
    (owner !== "submission" && owner !== "participant") ||
    pathField.trim().length === 0
  ) {
    return null;
  }
  if (owner === "submission") {
    return asset.participantId === CFP_SUBMISSION_PARTICIPANT
      ? { fieldKey: pathField, owner }
      : null;
  }
  const participantId = typeof asset.participantId === "string" ? asset.participantId.trim() : "";
  return participantId.length === 0 ? null : { fieldKey: pathField, owner, participantId };
}

function cfpAssetView(asset: SpeakerAsset): CfpFileAsset | null {
  const metadata = cfpAssetMetadata(asset);
  const tenantId = typeof asset.tenantId === "string" ? asset.tenantId.trim() : "";
  const submissionId = typeof asset.submissionId === "string" ? asset.submissionId.trim() : "";
  if (
    metadata === null ||
    tenantId.length === 0 ||
    asset.eventId.trim().length === 0 ||
    submissionId.length === 0 ||
    asset.id.trim().length === 0 ||
    asset.kind !== "supporting_file"
  ) {
    return null;
  }
  return {
    assetId: asset.id,
    tenantId,
    eventId: asset.eventId,
    submissionId,
    ...(metadata.owner === "participant" ? { participantId: metadata.participantId } : {}),
    owner: metadata.owner,
    state: asset.state,
    contentType: asset.contentType,
    sizeBytes: asset.sizeBytes,
  };
}
type CfpSpeakerAssetStore = Pick<
  AirtableSpeakerRepository,
  "createPendingAsset" | "getAsset" | "finalizeAsset"
>;
type CfpPrivateAssetProvider = Pick<
  R2PrivateAssetGateway,
  "registerUploadCapability" | "verifyUploadCapability" | "invalidateUploadCapability"
>;

/** Airtable-authoritative CFP file assets backed by the existing speaker asset and R2 stores. */
export class AirtableCfpFileAssetGateway implements CfpFileAssetGateway {
  readonly #cfp: CfpRepository;
  readonly #speakers: CfpSpeakerAssetStore;
  readonly #privateAssets: CfpPrivateAssetProvider;
  readonly #now: () => Date;

  constructor(options: {
    readonly cfp: CfpRepository;
    readonly speakers: CfpSpeakerAssetStore;
    readonly privateAssets: CfpPrivateAssetProvider;
    readonly now?: () => Date;
  }) {
    this.#cfp = options.cfp;
    this.#speakers = options.speakers;
    this.#privateAssets = options.privateAssets;
    this.#now = options.now ?? (() => new Date());
  }

  private async context(input: {
    tenantId: string;
    eventId: string;
    submissionId: string;
    owner: "submission" | "participant";
    participantId?: string;
    fieldKey: string;
  }): Promise<{
    readonly submission: Submission;
    readonly form: CfpForm;
    readonly field: CfpForm["submissionFields"][number];
  }> {
    const [event, submission] = await Promise.all([
      this.#cfp.getEvent(input.tenantId, input.eventId),
      this.#cfp.getSubmission(input.tenantId, input.submissionId),
    ]);
    if (event === null || submission === null || submission.eventId !== input.eventId) {
      throw new CfpError("FORBIDDEN", "The file asset binding is not owned by this event.");
    }
    const form = await this.#cfp.getForm(input.tenantId, submission.formId);
    if (form === null || form.eventId !== input.eventId) {
      throw new CfpError("FORBIDDEN", "The file asset form is not owned by this event.");
    }
    const fields =
      input.participantId === undefined ? form.submissionFields : form.participantFields;
    const field = fields.find((candidate) => candidate.key === input.fieldKey);
    if (field === undefined || field.kind !== "file_request" || field.fileRequest === undefined) {
      throw new CfpError(
        "VALIDATION_FAILED",
        "The requested field is not an authorized file request.",
      );
    }
    if (field.fileRequest.owner !== input.owner) {
      throw new CfpError("FORBIDDEN", "The file asset owner does not match the requested field.");
    }
    if (input.owner === "participant") {
      if (
        input.participantId === undefined ||
        !submission.participants.some((participant) => participant.id === input.participantId)
      ) {
        throw new CfpError(
          "FORBIDDEN",
          "The file upload participant is not part of this submission.",
        );
      }
    } else if (input.participantId !== undefined) {
      throw new CfpError("FORBIDDEN", "This submission file request cannot target a participant.");
    }
    return { submission, form, field };
  }

  private async stored(input: {
    tenantId: string;
    eventId: string;
    submissionId: string;
    assetId: string;
    owner: "submission" | "participant";
    participantId?: string;
    fieldKey?: string;
  }): Promise<{
    readonly stored: SpeakerAsset;
    readonly asset: CfpFileAsset;
    readonly metadata: NonNullable<ReturnType<typeof cfpAssetMetadata>>;
  } | null> {
    const stored = await this.#speakers.getAsset(input.eventId, input.assetId);
    if (stored === null) return null;
    const metadata = cfpAssetMetadata(stored);
    const asset = cfpAssetView(stored);
    if (
      metadata === null ||
      asset === null ||
      asset.tenantId !== input.tenantId ||
      asset.eventId !== input.eventId ||
      asset.submissionId !== input.submissionId ||
      asset.owner !== input.owner ||
      asset.participantId !== input.participantId ||
      (input.fieldKey !== undefined && metadata.fieldKey !== input.fieldKey)
    ) {
      return null;
    }
    try {
      await this.context({
        tenantId: input.tenantId,
        eventId: input.eventId,
        submissionId: input.submissionId,
        owner: metadata.owner,
        fieldKey: metadata.fieldKey,
        ...(metadata.participantId === undefined ? {} : { participantId: metadata.participantId }),
      });
    } catch {
      return null;
    }
    return { stored, asset, metadata };
  }

  private binding(asset: SpeakerAsset, expiresAt: string): PrivateAssetCapabilityBinding {
    const metadata = cfpAssetMetadata(asset);
    if (metadata === null || asset.submissionId === undefined || asset.tenantId === undefined) {
      throw new Error("The CFP file asset metadata is incomplete.");
    }
    return {
      capabilityId: asset.id,
      tenantId: asset.tenantId,
      eventId: asset.eventId,
      submissionId: asset.submissionId,
      participantId: asset.participantId,
      objectKey: asset.objectKey,
      contentType: asset.contentType,
      sizeBytes: asset.sizeBytes,
      fileName: asset.fileName,
      expiresAt,
    };
  }

  async issueUpload(input: {
    tenantId: string;
    eventId: string;
    submissionId: string;
    owner: "submission" | "participant";
    participantId?: string;
    fieldKey: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    idempotencyKey: string;
  }): Promise<CfpFileUploadAuthorization> {
    if (input.idempotencyKey.trim().length === 0) {
      throw new CfpError("IDEMPOTENCY_KEY_REQUIRED", "An idempotency key is required.");
    }
    const { submission, field } = await this.context(input);
    const fileName = input.fileName.trim();
    const contentType = input.contentType.trim().toLowerCase();
    if (
      fileName.length === 0 ||
      !Number.isSafeInteger(input.sizeBytes) ||
      input.sizeBytes <= 0 ||
      field.fileRequest === undefined ||
      input.sizeBytes > field.fileRequest.maxBytes ||
      !field.fileRequest.allowedMimeTypes.some((allowed) => {
        const candidate = allowed.trim().toLowerCase();
        return (
          candidate === contentType ||
          (candidate.endsWith("/*") && contentType.startsWith(candidate.slice(0, -1)))
        );
      })
    ) {
      throw new CfpError("VALIDATION_FAILED", "The upload metadata is not allowed.");
    }
    const requestKey = JSON.stringify([
      input.tenantId,
      input.eventId,
      submission.id,
      input.owner,
      input.participantId ?? "",
      input.fieldKey,
      input.idempotencyKey,
    ]);
    const assetId = `cfp-file-${(await capabilityHash(requestKey)).slice(0, 40)}`;
    const existing = await this.stored({
      tenantId: input.tenantId,
      eventId: input.eventId,
      submissionId: submission.id,
      assetId,
      owner: input.owner,
      ...(input.participantId === undefined ? {} : { participantId: input.participantId }),
      fieldKey: input.fieldKey,
    });
    if (existing !== null) {
      if (
        existing.asset.state !== "pending_upload" ||
        existing.stored.contentType.trim().toLowerCase() !== contentType ||
        existing.stored.sizeBytes !== input.sizeBytes ||
        existing.stored.fileName !== fileName
      ) {
        throw new CfpError("CONFLICT", "The file upload idempotency key is already bound.");
      }
      const expiresAt = new Date(this.#now().getTime() + CFP_FILE_UPLOAD_LIFETIME_MS).toISOString();
      const grant = await this.#privateAssets.registerUploadCapability(
        this.binding(existing.stored, expiresAt),
      );
      return {
        authorizationId: existing.asset.assetId,
        asset: existing.asset,
        grant,
      };
    }

    const expiresAt = new Date(this.#now().getTime() + CFP_FILE_UPLOAD_LIFETIME_MS).toISOString();
    const storedAsset: SpeakerAsset = {
      id: assetId,
      tenantId: input.tenantId,
      eventId: input.eventId,
      submissionId: submission.id,
      participantId: input.participantId ?? CFP_SUBMISSION_PARTICIPANT,
      kind: "supporting_file",
      objectKey: [
        "cfp",
        encodeURIComponent(input.tenantId),
        encodeURIComponent(input.eventId),
        encodeURIComponent(submission.id),
        input.owner,
        encodeURIComponent(input.fieldKey),
        assetId,
      ].join("/"),
      fileName,
      contentType,
      sizeBytes: input.sizeBytes,
      state: "pending_upload",
      createdAt: this.#now().toISOString(),
    };
    const persisted = await this.#speakers.createPendingAsset(storedAsset);
    const grant = await this.#privateAssets.registerUploadCapability(
      this.binding(persisted, expiresAt),
    );
    const asset = cfpAssetView(persisted);
    if (asset === null) throw new Error("The persisted CFP file asset is invalid.");
    return { authorizationId: asset.assetId, asset, grant };
  }

  async finalizeUpload(input: {
    tenantId: string;
    eventId: string;
    submissionId: string;
    fieldKey: string;
    assetId: string;
    owner: "submission" | "participant";
    participantId?: string;
    state: "ready" | "rejected";
    rejectionReason?: string;
    idempotencyKey: string;
  }): Promise<CfpFileAsset> {
    if (input.idempotencyKey.trim().length === 0) {
      throw new CfpError("IDEMPOTENCY_KEY_REQUIRED", "An idempotency key is required.");
    }
    const rejectionReason = input.rejectionReason?.trim();
    if (rejectionReason !== undefined && rejectionReason.length > 2000) {
      throw new CfpError("VALIDATION_FAILED", "The upload rejection reason is too long.");
    }
    const existing = await this.stored(input);
    if (existing === null) {
      throw new CfpError("FORBIDDEN", "The private upload asset is not owned by this submission.");
    }
    if (existing.asset.state === input.state) return existing.asset;
    if (existing.asset.state !== "pending_upload") {
      throw new CfpError("VALIDATION_FAILED", "The private upload asset is no longer available.");
    }
    const expiresAt = new Date(this.#now().getTime() + CFP_FILE_UPLOAD_LIFETIME_MS).toISOString();
    const binding = this.binding(existing.stored, expiresAt);
    if (input.state === "ready") {
      if (!(await this.#privateAssets.verifyUploadCapability(binding))) {
        throw new CfpError("VALIDATION_FAILED", "The private upload has not been uploaded.");
      }
    } else {
      await this.#privateAssets.invalidateUploadCapability(binding);
    }
    const result = await this.#speakers.finalizeAsset({
      eventId: input.eventId,
      assetId: input.assetId,
      state: input.state,
      finalizedAt: this.#now().toISOString(),
      ...(rejectionReason === undefined ? {} : { rejectionReason }),
    });
    if (!result.ok) {
      throw new CfpError("VALIDATION_FAILED", "The private upload could not be finalized.");
    }
    const asset = cfpAssetView(result.value);
    if (asset === null) throw new Error("The finalized CFP file asset is invalid.");
    return asset;
  }

  async getAsset(input: {
    tenantId: string;
    eventId: string;
    submissionId: string;
    assetId: string;
    owner: "submission" | "participant";
    participantId?: string;
  }): Promise<CfpFileAsset | null> {
    return (await this.stored(input))?.asset ?? null;
  }
}
function eventStatusFromRecord(value: unknown): Event["status"] {
  if (value === "draft") return "draft";
  if (value === "archived") return "archived";
  return "active";
}

function eventInstantFromRecord(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

function eventInstantOrNull(value: unknown): string | null {
  if (value === null || value === undefined || typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
function eventDateOnly(value: string, timeZone: string): string | null {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return null;
  try {
    const parts = new Intl.DateTimeFormat("en", {
      calendar: "iso8601",
      day: "2-digit",
      month: "2-digit",
      numberingSystem: "latn",
      timeZone,
      year: "numeric",
    }).formatToParts(new Date(timestamp));
    const valueFor = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? "";
    const date = `${valueFor("year")}-${valueFor("month")}-${valueFor("day")}`;
    return /^\d{4}-\d{2}-\d{2}$/u.test(date) ? date : null;
  } catch {
    return null;
  }
}

function eventRecord(value: JsonRecord): Event {
  const id = requiredId(value.id);
  const organizationId = organizationIdOf(value);
  if (organizationId === undefined) {
    throw new TypeError("An Airtable event record must contain an organization id.");
  }
  const name = textValue(value, "name", "title") ?? id;
  const slug = textValue(value, "slug") ?? id;
  const timeZone = textValue(value, "timeZone", "timezone") ?? "UTC";
  const startsAt = eventInstantFromRecord(
    textValue(value, "startsAt", "startAt"),
    "1970-01-01T00:00:00.000Z",
  );
  const endsFallback = new Date(Date.parse(startsAt) + 30 * 60_000).toISOString();
  const endsCandidate = eventInstantFromRecord(textValue(value, "endsAt", "endAt"), endsFallback);
  const endsAt = Date.parse(endsCandidate) > Date.parse(startsAt) ? endsCandidate : endsFallback;
  const rawCfp = isRecord(value.cfpSettings) ? value.cfpSettings : {};
  const opensAt = eventInstantOrNull(rawCfp.opensAt ?? value.opensAt);
  const closesAt = eventInstantOrNull(rawCfp.closesAt ?? value.closesAt);
  const rawCalendar = isRecord(value.defaultCalendarSettings) ? value.defaultCalendarSettings : {};
  const durationMinutes =
    typeof rawCalendar.durationMinutes === "number" &&
    Number.isSafeInteger(rawCalendar.durationMinutes) &&
    rawCalendar.durationMinutes >= 1 &&
    rawCalendar.durationMinutes <= 1_440
      ? rawCalendar.durationMinutes
      : 30;
  const calendarTimeZone =
    typeof rawCalendar.timeZone === "string" && rawCalendar.timeZone.trim().length > 0
      ? rawCalendar.timeZone.trim()
      : timeZone;
  const location =
    rawCalendar.location === null
      ? null
      : typeof rawCalendar.location === "string"
        ? rawCalendar.location
        : textValue(value, "venue");
  const version =
    typeof value.version === "number" && Number.isSafeInteger(value.version) && value.version >= 1
      ? value.version
      : 1;
  const createdAt = eventInstantFromRecord(
    textValue(value, "createdAt"),
    eventInstantFromRecord(textValue(value, "updatedAt"), "1970-01-01T00:00:00.000Z"),
  );
  const updatedAt = eventInstantFromRecord(textValue(value, "updatedAt"), createdAt);
  return {
    id,
    organizationId,
    slug,
    name,
    status: eventStatusFromRecord(value.status),
    timeZone,
    startsAt,
    endsAt,
    venue: textValue(value, "venue"),
    cfpSettings: {
      enabled:
        typeof rawCfp.enabled === "boolean"
          ? rawCfp.enabled
          : opensAt !== null && closesAt !== null,
      opensAt,
      closesAt,
    },
    defaultCalendarSettings: {
      durationMinutes,
      timeZone: calendarTimeZone,
      location,
    },
    embedConfigurations: Array.isArray(value.embedConfigurations)
      ? (clone(value.embedConfigurations) as readonly Event["embedConfigurations"][number][])
      : [],
    version,
    createdAt,
    updatedAt,
    createdBy: textValue(value, "createdBy") ?? "system",
    updatedBy: textValue(value, "updatedBy") ?? "system",
  };
}
function cfpEventFromRecord(value: JsonRecord): EventCfp {
  const id = requiredId(value.id);
  const tenantId = organizationIdOf(value);
  if (tenantId === undefined) {
    throw new TypeError("An Airtable CFP event record must contain an organization id.");
  }
  const startsAt = eventInstantFromRecord(
    textValue(value, "startsAt", "startAt"),
    "1970-01-01T00:00:00.000Z",
  );
  const endsFallback = new Date(Date.parse(startsAt) + 30 * 60_000).toISOString();
  const rawCfp = isRecord(value.cfpSettings) ? value.cfpSettings : {};
  const opensAt = eventInstantOrNull(rawCfp.opensAt ?? value.opensAt) ?? startsAt;
  const closesAt = eventInstantOrNull(rawCfp.closesAt ?? value.closesAt) ?? endsFallback;
  return {
    id,
    tenantId,
    version:
      typeof value.version === "number" && Number.isSafeInteger(value.version) && value.version >= 1
        ? value.version
        : 1,
    slug: textValue(value, "slug") ?? id,
    name: textValue(value, "name", "title") ?? id,
    timezone: textValue(value, "timezone", "timeZone") ?? "UTC",
    opensAt,
    closesAt: Date.parse(closesAt) > Date.parse(opensAt) ? closesAt : endsFallback,
  };
}
function isCanonicalEventRecord(value: JsonRecord): boolean {
  return (
    typeof value.timeZone === "string" ||
    isRecord(value.cfpSettings) ||
    isRecord(value.defaultCalendarSettings)
  );
}

export class AirtableEventRepository implements EventRepository {
  readonly #events: AirtableJsonStore<JsonRecord>;
  readonly #audit: AirtableJsonStore<JsonRecord>;

  constructor(options: {
    readonly baseId: string;
    readonly transport: AirtableTransport;
  }) {
    const shared = { baseId: options.baseId, transport: options.transport };
    this.#events = jsonStore(shared, "Events", "Settings JSON");
    this.#audit = jsonStore(shared, "Audit Records", "Changes JSON");
  }

  async getEvent(organizationId: string, eventId: string): Promise<Event | null> {
    const raw = await this.#events.find(eventId);
    if (raw === undefined) return null;
    const event = eventRecord(raw);
    return event.organizationId === organizationId ? clone(event) : null;
  }

  async listEvents(organizationId: string): Promise<readonly Event[]> {
    return (await this.#events.list())
      .map(eventRecord)
      .filter((event) => event.organizationId === organizationId)
      .map(clone);
  }

  async findEventBySlug(organizationId: string, slug: string): Promise<Event | null> {
    const normalizedSlug = slug.trim().toLowerCase();
    const event = (await this.listEvents(organizationId)).find(
      (candidate) => candidate.slug.toLowerCase() === normalizedSlug,
    );
    return event === undefined ? null : clone(event);
  }

  async saveEvent(event: Event, expectedVersion: number | null): Promise<void> {
    const existingRaw = await this.#events.find(event.id);
    const existing = existingRaw === undefined ? undefined : eventRecord(existingRaw);
    if (
      (existing?.version ?? null) !== expectedVersion ||
      (existing !== undefined && existing.organizationId !== event.organizationId)
    ) {
      throw new EventRepositoryConflictError();
    }
    if (existing === undefined) {
      await this.#events.create(clone(event) as unknown as JsonRecord);
    } else {
      await this.#events.update(event.id, clone(event) as unknown as JsonRecord);
    }
  }

  async appendAudit(entry: EventAuditEntry): Promise<void> {
    const stored = tagged(clone(entry) as unknown as JsonRecord, "event_audit");
    const existing = await this.#audit.find(entry.id);
    if (existing === undefined) await this.#audit.create(stored);
    else await this.#audit.update(entry.id, stored);
  }

  async listAudit(organizationId: string, eventId: string): Promise<readonly EventAuditEntry[]> {
    return (await this.#audit.list())
      .filter(
        (entry) =>
          entityType(entry) === "event_audit" &&
          organizationIdOf(entry) === organizationId &&
          eventReference(entry) === eventId,
      )
      .map((entry) => {
        const { entityType: _kind, ...audit } = entry;
        return clone(audit as unknown as EventAuditEntry);
      });
  }
}

export class AirtableCfpRepository implements CfpRepository {
  readonly #events: AirtableJsonStore<EventCfp>;
  readonly #forms: AirtableJsonStore<CfpForm>;
  readonly #submissions: AirtableJsonStore<Submission>;
  readonly #audits: AirtableJsonStore<AuditEntry & { id: string }>;
  constructor(options: {
    readonly baseId: string;
    readonly transport: AirtableTransport;
  }) {
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
      decode: decodeCfpSubmission,
    });
    this.#audits = new AirtableJsonStore({
      ...shared,
      table: "Audit Records",
      jsonField: "Changes JSON",
    });
  }

  async getEvent(tenantId: string, eventId: string): Promise<EventCfp | null> {
    const raw = await this.#events.find(eventId);
    if (raw === undefined) return null;
    const event = cfpEventFromRecord(raw as unknown as JsonRecord);
    return event.tenantId === tenantId ? event : null;
  }

  async saveEvent(event: EventCfp, expectedVersion: number | null): Promise<void> {
    const existingRaw = await this.#events.find(event.id);
    const existing =
      existingRaw === undefined
        ? undefined
        : cfpEventFromRecord(existingRaw as unknown as JsonRecord);
    if (
      (existing?.version ?? null) !== expectedVersion ||
      (existing !== undefined && existing.tenantId !== event.tenantId)
    ) {
      throw new CfpError("CONFLICT", "The event CFP configuration has changed.");
    }
    if (existingRaw !== undefined && isCanonicalEventRecord(existingRaw as unknown as JsonRecord)) {
      const canonical = eventRecord(existingRaw as unknown as JsonRecord);
      const updated: Event = {
        ...canonical,
        version: event.version,
        cfpSettings: {
          ...canonical.cfpSettings,
          enabled: true,
          opensAt: event.opensAt,
          closesAt: event.closesAt,
        },
      };
      await this.#events.update(event.id, updated as unknown as EventCfp);
    } else if (existing === undefined) {
      await this.#events.create(clone(event));
    } else {
      await this.#events.update(event.id, clone(event));
    }
  }

  async getForm(tenantId: string, formId: string): Promise<CfpForm | null> {
    const form = await this.#forms.find(formId);
    return form !== undefined && form.tenantId === tenantId ? untagged(form) : null;
  }

  async listForms(tenantId: string, eventId: string): Promise<CfpForm[]> {
    return (await this.#forms.list())
      .filter((form) => form.tenantId === tenantId && form.eventId === eventId)
      .map((form) => untagged(form));
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
    return submission !== undefined &&
      !isSpeakerSubmissionRecord(submission) &&
      submission.tenantId === tenantId
      ? untagged(submission)
      : null;
  }
  async listSubmissionsForEvent(tenantId: string, eventId: string): Promise<Submission[]> {
    const byId = new Map<string, Submission>();
    for (const submission of await this.#submissions.list()) {
      if (
        submission.formId === undefined ||
        submission.tenantId !== tenantId ||
        submission.eventId !== eventId ||
        isSpeakerSubmissionRecord(submission)
      ) {
        continue;
      }
      const current = byId.get(submission.id);
      if (
        current === undefined ||
        submission.version > current.version ||
        (submission.version === current.version &&
          (submission.updatedAt ?? "").localeCompare(current.updatedAt ?? "") > 0)
      ) {
        byId.set(submission.id, submission);
      }
    }
    return [...byId.values()].map((submission) => untagged(submission));
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

  constructor(options: {
    readonly baseId: string;
    readonly transport: AirtableTransport;
  }) {
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
    return plan !== undefined && plan.tenantId === tenantId ? untagged(plan) : null;
  }
  async listPlans(tenantId: string, eventId?: string): Promise<readonly EvaluationPlan[]> {
    return (await this.#plans.list())
      .filter(
        (plan) => plan.tenantId === tenantId && (eventId === undefined || plan.eventId === eventId),
      )
      .map((plan) => clone(untagged(plan)));
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
    return assignment !== undefined &&
      isEvaluationAssignmentRecord(assignment) &&
      assignment.tenantId === tenantId
      ? untagged(assignment)
      : null;
  }

  async listAssignments(
    tenantId: string,
    planId: string,
  ): Promise<readonly EvaluationAssignment[]> {
    const byId = new Map<string, EvaluationAssignment>();
    for (const assignment of await this.#assignments.list()) {
      if (
        !isEvaluationAssignmentRecord(assignment) ||
        assignment.tenantId !== tenantId ||
        assignment.planId !== planId
      ) {
        continue;
      }
      const current = byId.get(assignment.id);
      if (
        current === undefined ||
        assignment.version > current.version ||
        (assignment.version === current.version &&
          (assignment.updatedAt ?? "").localeCompare(current.updatedAt ?? "") > 0)
      ) {
        byId.set(assignment.id, assignment);
      }
    }
    return [...byId.values()].map((assignment) => untagged(assignment));
  }

  async putAssignments(assignments: readonly EvaluationAssignment[]): Promise<void> {
    const existing = (await this.#assignments.list()).filter(isEvaluationAssignmentRecord);
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
    return review !== undefined && isEvaluationReviewRecord(review) && review.tenantId === tenantId
      ? untagged(review)
      : null;
  }

  async listReviews(tenantId: string, planId: string): Promise<readonly EvaluationReview[]> {
    return (await this.#reviews.list())
      .filter(
        (review) =>
          isEvaluationReviewRecord(review) &&
          review.tenantId === tenantId &&
          review.planId === planId,
      )
      .map((review) => untagged(review));
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
    return declaration !== undefined && declaration.tenantId === tenantId
      ? untagged(declaration)
      : null;
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
    return decision !== undefined && decision.tenantId === tenantId ? untagged(decision) : null;
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

function submissionText(submission: Submission, ...keys: readonly string[]): string | null {
  const record = submission as unknown as JsonRecord;
  const answers = isRecord(record.answers) ? record.answers : {};
  for (const key of keys) {
    const answer = answers[key] ?? record[key];
    if (typeof answer === "string" && answer.trim().length > 0) return answer.trim();
  }
  return null;
}

function submissionParticipants(submission: Submission): readonly SubmissionParticipant[] {
  return Array.isArray(submission.participants) ? submission.participants : [];
}

function submissionTitle(submission: Submission): string {
  return (
    submissionText(submission, "title", "sessionTitle", "field-title", "Title") ?? submission.id
  );
}

function submissionAbstract(submission: Submission): string {
  return submissionText(submission, "abstract", "description", "field-abstract", "Abstract") ?? "";
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
    const identityFieldIds =
      form?.submissionFields
        .filter((field) => field.kind === "email" || /email|name/iu.test(field.key))
        .flatMap((field) => [field.id, field.key]) ?? [];
    return {
      id: submission.id,
      tenantId,
      eventId,
      title: submissionTitle(submission),
      abstract: submissionAbstract(submission),
      answers,
      identityFieldIds,
      participants: submissionParticipants(submission).map((participant) => ({
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
    return {
      id: submission.id,
      tenantId: submission.tenantId,
      eventId: submission.eventId,
      title: submissionTitle(submission),
      abstract: submissionAbstract(submission),
      answers,
      participants: submissionParticipants(submission).map((participant) => ({
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
function submissionAnswerValue(submission: Submission, ...keys: readonly string[]): unknown {
  const answers = isRecord(submission.answers) ? submission.answers : {};
  for (const key of keys) {
    if (answers[key] !== undefined) return answers[key];
  }
  return undefined;
}

function submissionAnswerText(submission: Submission, ...keys: readonly string[]): string {
  const value = submissionAnswerValue(submission, ...keys);
  return typeof value === "string" ? value.trim() : "";
}

function submissionAnswerIds(submission: Submission, ...keys: readonly string[]): string[] {
  const values: unknown[] = [];
  for (const key of keys) {
    const value = submissionAnswerValue(submission, key);
    if (Array.isArray(value)) values.push(...value);
    else if (value !== undefined) values.push(value);
  }
  return [
    ...new Set(
      values.flatMap((value) => {
        if (typeof value === "string") {
          const normalized = value.trim();
          return normalized.length === 0 ? [] : [normalized];
        }
        if (!isRecord(value)) return [];
        const id = value.id ?? value.value;
        return typeof id === "string" && id.trim().length > 0 ? [id.trim()] : [];
      }),
    ),
  ];
}

function submissionDurationMinutes(submission: Submission): number {
  const value = submissionAnswerValue(
    submission,
    "durationMinutes",
    "duration",
    "sessionDuration",
    "length",
  );
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 1_440) {
    return value;
  }
  if (typeof value === "string") {
    const match = /(\d{1,4})/u.exec(value);
    const parsed = match === null ? NaN : Number(match[1]);
    if (Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 1_440) return parsed;
  }
  return 30;
}

function sessionsDiffer(left: Session, right: Session): boolean {
  return (
    left.title !== right.title ||
    left.description !== right.description ||
    left.status !== right.status ||
    left.durationMinutes !== right.durationMinutes ||
    left.capacityRequired !== right.capacityRequired ||
    left.roomId !== right.roomId ||
    left.formatId !== right.formatId ||
    left.levelId !== right.levelId ||
    left.trackId !== right.trackId ||
    JSON.stringify(left.trackIds) !== JSON.stringify(right.trackIds) ||
    JSON.stringify(left.tagIds) !== JSON.stringify(right.tagIds) ||
    JSON.stringify(left.speakerIds) !== JSON.stringify(right.speakerIds) ||
    JSON.stringify(left.speakerRoster) !== JSON.stringify(right.speakerRoster) ||
    JSON.stringify(left.resourceIds) !== JSON.stringify(right.resourceIds)
  );
}
export class AirtableEvaluationAcceptanceHandoff implements EvaluationAcceptanceHandoff {
  readonly #cfp: AirtableCfpRepository;
  readonly #speakers: AirtableSpeakerRepository;
  readonly #database: D1Database;
  readonly #sessions: SessionRepository;
  readonly #sessionService: SessionService | undefined;
  readonly #queue: Queue<CloudflareOutboxMessage>;

  constructor(options: {
    readonly cfp: AirtableCfpRepository;
    readonly speakers: AirtableSpeakerRepository;
    readonly sessions: SessionRepository;
    readonly database: D1Database;
    readonly sessionService?: SessionService;
    readonly queue: Queue<CloudflareOutboxMessage>;
  }) {
    this.#cfp = options.cfp;
    this.#speakers = options.speakers;
    this.#database = options.database;
    this.#queue = options.queue;
    this.#sessions = options.sessions;
    this.#sessionService = options.sessionService;
  }

  async accept(input: EvaluationAcceptanceHandoffInput): Promise<void> {
    const idempotency = new D1IdempotencyStore(this.#database);
    const scope = `${input.tenantId}:evaluation-acceptance`;
    const transitionKey = input.idempotencyKey.trim();
    const key = `acceptance:${input.submissionId}:${transitionKey}`;
    await idempotency.run(scope, key, async () => {
      const submission = await this.#cfp.getSubmission(input.tenantId, input.submissionId);
      if (submission === null || submission.eventId !== input.eventId) {
        throw new Error("The accepted submission was not found for the event.");
      }
      if (submission.participants.length === 0) {
        throw new Error("An accepted submission must contain at least one speaker.");
      }
      const session = await this.#ensureCanonicalSession(input, submission);
      await this.#speakers.ensureAcceptedSubmission({
        submission,
        updatedAt: input.decidedAt,
      });

      const profiles: string[] = [];
      for (const participant of submission.participants) {
        const profile = await this.#speakers.ensureProfile({
          eventId: input.eventId,
          participant,
          organizationId: input.tenantId,
          updatedAt: input.decidedAt,
        });
        await this.#speakers.ensureProfileTask({
          eventId: input.eventId,
          submissionId: input.submissionId,
          participantId: participant.id,
          updatedAt: input.decidedAt,
        });
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
          `evaluation-accepted:${input.submissionId}:${transitionKey}`,
          input.tenantId,
          input.decidedBy,
          input.submissionId,
          JSON.stringify({
            planId: input.planId,
            decisionId: input.decisionId,
            reason: input.reason,
            idempotencyKey: input.idempotencyKey,
            profileIds: profiles,
            sessionId: session.id,
          }),
          input.decidedAt,
        )
        .run();

      const recipients = submission.participants
        .map((participant) => participant.email.trim())
        .filter((email) => email.length > 0);
      if (recipients.length > 0) {
        await this.#enqueue(
          input,
          "communications",
          `evaluation-accepted:${input.submissionId}:${transitionKey}`,
          {
            from: DEFAULT_OPEN_SEND_SENDERS.speakers,
            to: recipients,
            subject: "Your session was accepted",
            html: "<p>Your session was accepted. Sign in to complete your speaker profile.</p>",
            text: "Your session was accepted. Sign in to complete your speaker profile.",
            idempotencyKey: `evaluation-accepted:${input.submissionId}:${transitionKey}`,
          },
        );
      }
      await this.#enqueue(
        input,
        "cache-invalidation",
        `evaluation-projection:${input.eventId}:${input.submissionId}:${transitionKey}`,
        { eventId: input.eventId },
      );
      return { accepted: true };
    });

    const submission = await this.#cfp.getSubmission(input.tenantId, input.submissionId);
    if (submission === null || submission.eventId !== input.eventId) return;
    await this.#ensureSpeakerGrants(input, submission);
  }

  async #ensureCanonicalSession(
    input: EvaluationAcceptanceHandoffInput,
    submission: Submission,
  ): Promise<Session> {
    const id = `session-${submission.id}`;
    const current = await this.#sessions.getSession(input.tenantId, input.eventId, id);
    const formatIds = submissionAnswerIds(submission, "formatId", "format");
    const trackIdsFromAnswers = submissionAnswerIds(
      submission,
      "trackIds",
      "tracks",
      "trackId",
      "track",
    );
    const tagIdsFromAnswers = submissionAnswerIds(submission, "tagIds", "tags", "tag");
    const trackIds =
      trackIdsFromAnswers.length > 0
        ? trackIdsFromAnswers
        : [...(current?.trackIds ?? (current?.trackId === undefined ? [] : [current.trackId]))];
    const tagIds = tagIdsFromAnswers.length > 0 ? tagIdsFromAnswers : [...(current?.tagIds ?? [])];
    const formatId = formatIds[0] ?? current?.formatId;
    const durationAnswer = submissionAnswerValue(
      submission,
      "durationMinutes",
      "duration",
      "sessionDuration",
      "length",
    );
    const durationMinutes =
      durationAnswer === undefined
        ? (current?.durationMinutes ?? 30)
        : submissionDurationMinutes(submission);
    const title =
      submissionAnswerText(submission, "title", "sessionTitle", "name") || current?.title || id;
    const description =
      submissionAnswerText(submission, "abstract", "description", "sessionAbstract", "summary") ||
      current?.description ||
      "";
    const speakerIds = submission.participants.map((participant) => participant.id);
    const speakerRoster: readonly SessionSpeakerReference[] = submission.participants.map(
      (participant) => ({
        id: participant.id,
        displayName:
          `${participant.firstName.trim()} ${participant.lastName.trim()}`.trim() || participant.id,
        role: participant.role,
      }),
    );
    const base: Session = {
      id,
      tenantId: input.tenantId,
      eventId: input.eventId,
      title,
      description,
      status: "Accepted",
      durationMinutes,
      capacityRequired: current?.capacityRequired ?? 0,
      ...(current?.roomId === undefined ? {} : { roomId: current.roomId }),
      ...(trackIds[0] === undefined ? {} : { trackId: trackIds[0] }),
      trackIds,
      ...(formatId === undefined ? {} : { formatId }),
      ...(current?.levelId === undefined ? {} : { levelId: current.levelId }),
      tagIds,
      speakerIds,
      speakerRoster,
      resourceIds: [...(current?.resourceIds ?? [])],
      version: current?.version ?? 1,
      createdAt: current?.createdAt ?? input.decidedAt,
      updatedAt: input.decidedAt,
      createdBy: current?.createdBy ?? input.decidedBy,
      updatedBy: current?.updatedBy ?? input.decidedBy,
      history: [...(current?.history ?? [])],
    };
    if (this.#sessionService !== undefined) {
      return this.#sessionService.upsertAcceptedSession({
        session: base,
        actorId: input.decidedBy,
      });
    }
    if (current === null) {
      const created: Session = {
        ...base,
        version: 1,
        createdAt: input.decidedAt,
        updatedAt: input.decidedAt,
        createdBy: input.decidedBy,
        updatedBy: input.decidedBy,
        history: [
          {
            id: `${id}:v1`,
            action: "created",
            version: 1,
            actorId: input.decidedBy,
            occurredAt: input.decidedAt,
          },
        ],
      };
      await this.#sessions.putSession(created, null);
      await this.#sessions.appendAudit({
        id: `${id}:v1`,
        tenantId: input.tenantId,
        eventId: input.eventId,
        entityType: "session",
        entityId: id,
        action: "created",
        version: 1,
        actorId: input.decidedBy,
        occurredAt: input.decidedAt,
        after: clone(created),
      });
      return created;
    }
    if (!sessionsDiffer(current, base)) return current;
    const nextVersion = current.version + 1;
    const updated: Session = {
      ...base,
      version: nextVersion,
      createdAt: current.createdAt,
      createdBy: current.createdBy,
      updatedAt: input.decidedAt,
      updatedBy: input.decidedBy,
      history: [
        ...current.history,
        {
          id: `${id}:v${nextVersion}`,
          action: "updated",
          version: nextVersion,
          actorId: input.decidedBy,
          occurredAt: input.decidedAt,
        },
      ],
    };
    await this.#sessions.putSession(updated, current.version);
    await this.#sessions.appendAudit({
      id: `${id}:v${nextVersion}`,
      tenantId: input.tenantId,
      eventId: input.eventId,
      entityType: "session",
      entityId: id,
      action: "updated",
      version: nextVersion,
      actorId: input.decidedBy,
      occurredAt: input.decidedAt,
      before: clone(current),
      after: clone(updated),
    });
    return updated;
  }

  async #ensureSpeakerGrants(
    input: EvaluationAcceptanceHandoffInput,
    submission: Submission,
  ): Promise<void> {
    for (const participant of submission.participants) {
      const email = participant.email.trim();
      await this.#speakers.ensureProfile({
        eventId: input.eventId,
        participant,
        organizationId: input.tenantId,
        updatedAt: input.decidedAt,
      });
      const provisioned = await this.#speakers.ensureVerifiedSpeakerGrant({
        organizationId: input.tenantId,
        eventId: input.eventId,
        participantId: participant.id,
        email,
        createdAt: input.decidedAt,
      });
      if (!provisioned) {
        throw new Error(`Speaker grant provisioning failed for participant ${participant.id}.`);
      }
    }
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

interface StoredAgendaState extends AgendaState {
  id: string;
}
interface StoredAgendaEntry {
  id: string;
  eventId: string;
  entry: AgendaEntry;
}
export class AirtableAgendaRepository {
  readonly #store: AirtableJsonStore<StoredAgendaState>;
  readonly #entries: AirtableJsonStore<StoredAgendaEntry>;
  readonly #loadedRecords = new Map<
    string,
    { readonly recordId: string | null; readonly stateVersion: number | null }
  >();

  constructor(options: {
    readonly baseId: string;
    readonly transport: AirtableTransport;
  }) {
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
    const stored = await this.#store.findWithRecordId(eventId);
    if (stored === undefined || stored.entity.eventId !== eventId) {
      this.#loadedRecords.set(eventId, { recordId: null, stateVersion: null });
      return null;
    }
    this.#loadedRecords.set(eventId, {
      recordId: stored.recordId,
      stateVersion: stored.entity.stateVersion,
    });
    const { id: _id, ...state } = stored.entity;
    return state;
  }

  async compareAndSwap(
    eventId: string,
    expectedStateVersion: number | null,
    nextState: AgendaState,
  ): Promise<void> {
    const cached = this.#loadedRecords.get(eventId);
    const current =
      cached?.stateVersion === expectedStateVersion
        ? cached
        : await this.#store.findWithRecordId(eventId).then((record) =>
            record === undefined
              ? { recordId: null, stateVersion: null }
              : {
                  recordId: record.recordId,
                  stateVersion: record.entity.stateVersion,
                },
          );
    if (current.stateVersion !== expectedStateVersion) {
      throw new AgendaRepositoryConflictError(eventId);
    }
    if (nextState.eventId !== eventId) {
      throw new TypeError(`Cannot save agenda ${nextState.eventId} under event ${eventId}.`);
    }
    const stored: StoredAgendaState = { ...nextState, id: eventId };
    await Promise.all([
      current.recordId === null
        ? this.#store.create(stored)
        : this.#store.updateByRecordId(eventId, current.recordId, stored),
      this.#synchronizeEntries(eventId, nextState.draft.entries),
    ]);
    if (current.recordId === null) {
      this.#loadedRecords.delete(eventId);
    } else {
      this.#loadedRecords.set(eventId, {
        recordId: current.recordId,
        stateVersion: nextState.stateVersion,
      });
    }
  }

  async #synchronizeEntries(eventId: string, entries: readonly AgendaEntry[]): Promise<void> {
    const existingEntries = (await this.#entries.listWithRecordIds()).filter(
      (entry) => entry.entity.eventId === eventId,
    );
    const nextEntries = new Map(
      entries.map((entry) => [
        `${eventId}:${entry.id}`,
        { id: `${eventId}:${entry.id}`, eventId, entry },
      ]),
    );
    const mutations: Array<Promise<unknown>> = [];

    for (const existing of existingEntries) {
      if (!nextEntries.has(existing.entity.id)) {
        mutations.push(this.#entries.deleteByRecordId(existing.recordId));
      }
    }
    for (const [id, entry] of nextEntries) {
      const existing = existingEntries.find((candidate) => candidate.entity.id === id);
      if (existing === undefined) {
        mutations.push(this.#entries.create(entry));
      } else if (JSON.stringify(existing.entity.entry) !== JSON.stringify(entry.entry)) {
        mutations.push(this.#entries.updateByRecordId(id, existing.recordId, entry));
      }
    }
    await Promise.all(mutations);
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

  constructor(options: {
    readonly baseId: string;
    readonly transport: AirtableTransport;
  }) {
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
    const allEvents = await this.#events.list({
      filterByFormula: organizationScopeFormula("Settings JSON", organizationId, []),
    });
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

    const scoped = (jsonField: string) =>
      organizationScopeFormula(jsonField, organizationId, [...eventIds]);
    const [allSubmissions, allPlans, allEvaluations, allTasks, allSessions, agendaStates] =
      await Promise.all([
        this.#submissions.list({ filterByFormula: scoped("Answers JSON") }),
        this.#plans.list({ filterByFormula: scoped("Rounds JSON") }),
        this.#evaluations.list({ filterByFormula: scoped("Scores JSON") }),
        this.#tasks.list({ filterByFormula: scoped("Owner JSON") }),
        this.#sessions.list({ filterByFormula: scoped("Metadata JSON") }),
        this.#agendas.listByIds(events.map((event) => event.id)),
      ]);
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
    const agendaByEvent = new Map<string, JsonRecord>(
      agendaStates.flatMap((state) => {
        const eventId = textValue(state, "eventId", "id");
        return eventId === null ? [] : [[eventId, state] as const];
      }),
    );
    const publishedSessionIdsByEvent = new Map<string, ReadonlySet<string>>(
      events.map(
        (event) => [event.id, this.publishedSessionIds(agendaByEvent.get(event.id))] as const,
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
      status: eventStatusFromRecord(record.status),
      startsAt: textValue(record, "startsAt", "startsOn", "startAt"),
      endsAt: textValue(record, "endsAt", "endsOn", "endAt"),
    };
  }

  private publishedSessionIds(state: JsonRecord | undefined): ReadonlySet<string> {
    if (state === undefined) return new Set<string>();
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

function isDefinedString(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
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
      await this.complete({
        scope,
        key,
        fingerprint,
        response: { status: 200, body: value },
      });
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
        return {
          status: row.response_status ?? 200,
          body: parseStoredJson(row.response_json),
        };
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
function escapeCfpReceiptHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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
    event: EventCfp;
    submissionTitle: string;
    idempotencyKey: string;
  }): Promise<void> {
    const recipient = await this.#database
      .prepare(
        `SELECT email
           FROM auth_users
          WHERE id = ? AND email_verified = 1
          LIMIT 1`,
      )
      .bind(input.submission.ownerAccountId)
      .first<{ email: string }>();
    const email = recipient?.email.trim();
    if (email === undefined || email.length === 0) {
      throw new Error("The CFP submitter does not have a verified account email.");
    }

    const idempotencyKey = `cfp-receipt:${input.submission.id}:v${input.submission.version}`;
    const eventName = input.event.name.trim();
    const submissionTitle = input.submissionTitle.trim();
    const escapedEventName = escapeCfpReceiptHtml(eventName);
    const escapedSubmissionTitle = escapeCfpReceiptHtml(submissionTitle);
    await enqueueCloudflareOutbox({
      database: this.#database,
      queue: this.#queue,
      tenantId: input.submission.tenantId,
      topic: "communications",
      deduplicationKey: idempotencyKey,
      payload: {
        from: "speakers@sessionboard.namuh.co",
        to: [email],
        subject: `Submission received: ${submissionTitle} — ${eventName}`,
        html: `<p>Your submission <strong>${escapedSubmissionTitle}</strong> for <strong>${escapedEventName}</strong> was received.</p>`,
        text: `Your submission "${submissionTitle}" for ${eventName} was received.`,
        idempotencyKey,
      },
    });
  }
}

function scopedRecord(value: object, tenantId: string, eventId: string): boolean {
  return (
    organizationIdOf(value) === tenantId && eventReference(isRecord(value) ? value : {}) === eventId
  );
}

function recordTenantId(value: object): string | undefined {
  return organizationIdOf(value);
}

function asStringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function jsonStore<T extends object>(
  shared: { readonly baseId: string; readonly transport: AirtableTransport },
  table: string,
  jsonField: string,
): AirtableJsonStore<T> {
  return new AirtableJsonStore<T>({ ...shared, table, jsonField });
}

function decodeRoom(fields: Readonly<AirtableFields>): Room {
  const settings = fields["Settings JSON"];
  const room =
    typeof settings === "string" && settings.trim().length > 0
      ? decodeJson<Room>(fields, "Settings JSON")
      : decodeJson<Room>(fields, "Metadata JSON");
  return Object.hasOwn(fields, "Capacity")
    ? { ...room, capacity: fields.Capacity as number }
    : room;
}
/** Session business resources are persisted in their provisioned Airtable tables. */
export class AirtableSessionRepository implements SessionRepository {
  readonly #sessions: AirtableJsonStore<Session>;
  readonly #rooms: AirtableJsonStore<Room>;
  readonly #tracks: AirtableJsonStore<Track>;
  readonly #formats: AirtableJsonStore<Format>;
  readonly #levels: AirtableJsonStore<Level>;
  readonly #tags: AirtableJsonStore<Tag>;
  readonly #settings: AirtableJsonStore<SessionSettings>;
  readonly #audits: AirtableJsonStore<SessionAuditEntry>;
  readonly #participants: AirtableJsonStore<JsonRecord>;
  readonly #submissions: AirtableJsonStore<JsonRecord>;
  private static decodeSession(fields: Readonly<AirtableFields>): Session {
    const parsed = decodeJson<Session>(fields, "Metadata JSON") as Session & JsonRecord;
    const storedMetadata = (() => {
      const raw = fields["Metadata JSON"];
      if (typeof raw !== "string" || raw.trim().length === 0) return null;
      try {
        const value = JSON.parse(raw) as unknown;
        return isRecord(value) ? value : null;
      } catch {
        return null;
      }
    })();
    const scalarText = (...keys: readonly string[]): string | undefined =>
      textValue(fields as JsonRecord, ...keys) ?? undefined;
    const jsonArray = (key: string, fallback: readonly string[]): readonly string[] => {
      const raw = fields[key];
      if (typeof raw !== "string" || raw.trim().length === 0) return fallback;
      try {
        return asStringArray(JSON.parse(raw) as unknown);
      } catch {
        return fallback;
      }
    };
    const settings = (() => {
      const raw = fields["Settings JSON"];
      if (typeof raw !== "string" || raw.trim().length === 0) return {} as JsonRecord;
      try {
        const value = JSON.parse(raw) as unknown;
        return isRecord(value) ? value : ({} as JsonRecord);
      } catch {
        return {} as JsonRecord;
      }
    })();
    const id = scalarText(APPLICATION_ID) ?? parsed.id;
    const tenantId = scalarText("Organization ID") ?? parsed.tenantId;
    const eventId = scalarText("Event ID") ?? parsed.eventId;
    const canonicalPayload =
      typeof storedMetadata?.tenantId === "string" &&
      storedMetadata.tenantId.trim().length > 0 &&
      typeof storedMetadata.eventId === "string" &&
      storedMetadata.eventId.trim().length > 0;
    const title = canonicalPayload ? parsed.title : (scalarText("Title") ?? parsed.title);
    const description = canonicalPayload
      ? parsed.description
      : (scalarText("Description") ?? parsed.description);
    const status = canonicalPayload ? parsed.status : (scalarText("Status") ?? parsed.status);
    const version =
      canonicalPayload ||
      typeof fields.Version !== "number" ||
      !Number.isSafeInteger(fields.Version)
        ? parsed.version
        : fields.Version;
    const durationMinutes =
      canonicalPayload || typeof fields["Duration Minutes"] !== "number"
        ? parsed.durationMinutes
        : fields["Duration Minutes"];
    const capacityRequired =
      canonicalPayload || typeof fields["Capacity Required"] !== "number"
        ? parsed.capacityRequired
        : fields["Capacity Required"];
    const trackIds = canonicalPayload
      ? asStringArray(parsed.trackIds)
      : jsonArray("Track IDs JSON", asStringArray(parsed.trackIds));
    const tagIds = canonicalPayload
      ? asStringArray(parsed.tagIds)
      : jsonArray("Tag IDs JSON", asStringArray(parsed.tagIds));
    const speakerIds = canonicalPayload
      ? asStringArray(parsed.speakerIds)
      : jsonArray(
          "Speaker IDs JSON",
          asStringArray(parsed.speakerIds ?? parsed.speakerProfileIds ?? parsed.participantIds),
        );
    const resourceIds = canonicalPayload
      ? asStringArray(parsed.resourceIds)
      : jsonArray("Resource IDs JSON", asStringArray(parsed.resourceIds));
    const roomId = canonicalPayload
      ? parsed.roomId
      : (textValue(settings, "roomId") ?? parsed.roomId);
    const trackId = canonicalPayload
      ? (parsed.trackId ?? trackIds[0])
      : (textValue(settings, "trackId") ?? parsed.trackId ?? trackIds[0]);
    const formatId = canonicalPayload
      ? parsed.formatId
      : (scalarText("Format ID") ?? textValue(settings, "formatId") ?? parsed.formatId);
    const publicationStatus = textValue(settings, "publicationStatus")?.toLowerCase();
    const contentStatus =
      parsed.contentStatus ??
      (publicationStatus === "published"
        ? "Approved"
        : publicationStatus === "needs_changes"
          ? "Needs changes"
          : undefined);

    requiredId(id);
    return {
      ...parsed,
      id,
      ...(tenantId === undefined ? {} : { tenantId }),
      ...(eventId === undefined ? {} : { eventId }),
      title,
      description,
      status,
      version,
      durationMinutes,
      capacityRequired,
      ...(roomId === undefined ? {} : { roomId }),
      ...(trackId === undefined ? {} : { trackId }),
      trackIds,
      ...(formatId === undefined ? {} : { formatId }),
      tagIds,
      speakerIds,
      resourceIds,
      ...(contentStatus === undefined ? {} : { contentStatus }),
    };
  }
  private static decodeTaxonomy<T extends Track | Format | Level | Tag>(
    fields: Readonly<AirtableFields>,
  ): T {
    const parsed = decodeJson<T>(fields, "Metadata JSON") as T & JsonRecord;
    const textField = (key: string): string | undefined => {
      const value = fields[key];
      return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
    };
    const descriptionField = fields.Description;
    const id = textField(APPLICATION_ID) ?? (typeof parsed.id === "string" ? parsed.id : undefined);
    const organizationId =
      textField("Organization ID") ??
      (typeof parsed.organizationId === "string"
        ? parsed.organizationId
        : typeof parsed.tenantId === "string"
          ? parsed.tenantId
          : undefined);
    const eventId =
      textField("Event ID") ?? (typeof parsed.eventId === "string" ? parsed.eventId : undefined);
    const name = textField("Name") ?? (typeof parsed.name === "string" ? parsed.name : undefined);
    const description =
      typeof descriptionField === "string"
        ? descriptionField
        : typeof parsed.description === "string"
          ? parsed.description
          : undefined;
    const version =
      typeof fields.Version === "number" && Number.isSafeInteger(fields.Version)
        ? fields.Version
        : typeof parsed.version === "number"
          ? parsed.version
          : undefined;
    requiredId(id);
    return {
      ...parsed,
      id,
      ...(organizationId === undefined ? {} : { organizationId, tenantId: organizationId }),
      ...(eventId === undefined ? {} : { eventId }),
      ...(name === undefined ? {} : { name }),
      ...(description === undefined ? {} : { description }),
      ...(version === undefined ? {} : { version }),
    } as T;
  }
  constructor(options: {
    readonly baseId: string;
    readonly transport: AirtableTransport;
  }) {
    const shared = { baseId: options.baseId, transport: options.transport };
    this.#sessions = new AirtableJsonStore({
      ...shared,
      table: "Sessions",
      jsonField: "Metadata JSON",
      decode: AirtableSessionRepository.decodeSession,
    });
    this.#rooms = new AirtableJsonStore({
      ...shared,
      table: "Rooms",
      jsonField: "Settings JSON",
      decode: decodeRoom,
    });
    this.#tracks = new AirtableJsonStore({
      ...shared,
      table: "Tracks",
      jsonField: "Metadata JSON",
      decode: (fields) => AirtableSessionRepository.decodeTaxonomy<Track>(fields),
    });
    this.#formats = new AirtableJsonStore({
      ...shared,
      table: "Formats",
      jsonField: "Metadata JSON",
      decode: (fields) => AirtableSessionRepository.decodeTaxonomy<Format>(fields),
    });
    this.#levels = new AirtableJsonStore({
      ...shared,
      table: "Levels",
      jsonField: "Metadata JSON",
      decode: (fields) => AirtableSessionRepository.decodeTaxonomy<Level>(fields),
    });
    this.#tags = new AirtableJsonStore({
      ...shared,
      table: "Tags",
      jsonField: "Metadata JSON",
      decode: (fields) => AirtableSessionRepository.decodeTaxonomy<Tag>(fields),
    });
    this.#settings = jsonStore(shared, "Session Settings", "Settings JSON");
    this.#audits = jsonStore(shared, "Audit Records", "Changes JSON");
    this.#participants = jsonStore(shared, "Participants", "Metadata JSON");
    this.#submissions = jsonStore(shared, "Submissions", "Answers JSON");
  }

  async getSession(tenantId: string, eventId: string, sessionId: string): Promise<Session | null> {
    return this.scopedFind(this.#sessions, tenantId, eventId, sessionId);
  }

  async listSessions(tenantId: string, eventId: string): Promise<readonly Session[]> {
    return this.scopedList(this.#sessions, tenantId, eventId);
  }

  async putSession(session: Session, expectedVersion: number | null): Promise<void> {
    await this.putVersioned(this.#sessions, session, expectedVersion);
  }

  async deleteSession(
    tenantId: string,
    eventId: string,
    sessionId: string,
    expectedVersion: number,
  ): Promise<void> {
    await this.deleteVersioned(this.#sessions, tenantId, eventId, sessionId, expectedVersion);
  }

  async getRoom(tenantId: string, eventId: string, roomId: string): Promise<Room | null> {
    return this.scopedFind(this.#rooms, tenantId, eventId, roomId);
  }

  async listRooms(tenantId: string, eventId: string): Promise<readonly Room[]> {
    return this.scopedList(this.#rooms, tenantId, eventId);
  }

  async putRoom(room: Room, expectedVersion: number | null): Promise<void> {
    await this.putVersioned(this.#rooms, room, expectedVersion);
  }

  async deleteRoom(
    tenantId: string,
    eventId: string,
    roomId: string,
    expectedVersion: number,
  ): Promise<void> {
    await this.deleteVersioned(this.#rooms, tenantId, eventId, roomId, expectedVersion);
  }

  async getTrack(tenantId: string, eventId: string, trackId: string): Promise<Track | null> {
    return this.scopedFind(this.#tracks, tenantId, eventId, trackId);
  }

  async listTracks(tenantId: string, eventId: string): Promise<readonly Track[]> {
    return this.scopedList(this.#tracks, tenantId, eventId);
  }

  async putTrack(track: Track, expectedVersion: number | null): Promise<void> {
    await this.putVersioned(this.#tracks, track, expectedVersion);
  }

  async deleteTrack(
    tenantId: string,
    eventId: string,
    trackId: string,
    expectedVersion: number,
  ): Promise<void> {
    await this.deleteVersioned(this.#tracks, tenantId, eventId, trackId, expectedVersion);
  }

  async getFormat(tenantId: string, eventId: string, formatId: string): Promise<Format | null> {
    return this.scopedFind(this.#formats, tenantId, eventId, formatId);
  }

  async listFormats(tenantId: string, eventId: string): Promise<readonly Format[]> {
    return this.scopedList(this.#formats, tenantId, eventId);
  }

  async putFormat(format: Format, expectedVersion: number | null): Promise<void> {
    await this.putVersioned(this.#formats, format, expectedVersion);
  }

  async deleteFormat(
    tenantId: string,
    eventId: string,
    formatId: string,
    expectedVersion: number,
  ): Promise<void> {
    await this.deleteVersioned(this.#formats, tenantId, eventId, formatId, expectedVersion);
  }

  async getLevel(tenantId: string, eventId: string, levelId: string): Promise<Level | null> {
    return this.scopedFind(this.#levels, tenantId, eventId, levelId);
  }

  async listLevels(tenantId: string, eventId: string): Promise<readonly Level[]> {
    return this.scopedList(this.#levels, tenantId, eventId);
  }

  async putLevel(level: Level, expectedVersion: number | null): Promise<void> {
    await this.putVersioned(this.#levels, level, expectedVersion);
  }

  async deleteLevel(
    tenantId: string,
    eventId: string,
    levelId: string,
    expectedVersion: number,
  ): Promise<void> {
    await this.deleteVersioned(this.#levels, tenantId, eventId, levelId, expectedVersion);
  }

  async getTag(tenantId: string, eventId: string, tagId: string): Promise<Tag | null> {
    return this.scopedFind(this.#tags, tenantId, eventId, tagId);
  }

  async listTags(tenantId: string, eventId: string): Promise<readonly Tag[]> {
    return this.scopedList(this.#tags, tenantId, eventId);
  }

  async putTag(tag: Tag, expectedVersion: number | null): Promise<void> {
    await this.putVersioned(this.#tags, tag, expectedVersion);
  }

  async deleteTag(
    tenantId: string,
    eventId: string,
    tagId: string,
    expectedVersion: number,
  ): Promise<void> {
    await this.deleteVersioned(this.#tags, tenantId, eventId, tagId, expectedVersion);
  }

  async getSettings(tenantId: string, eventId: string): Promise<SessionSettings | null> {
    const id = `settings:${eventId}`;
    return this.scopedFind(this.#settings, tenantId, eventId, id);
  }

  async putSettings(settings: SessionSettings, expectedVersion: number | null): Promise<void> {
    await this.putVersioned(this.#settings, settings, expectedVersion);
  }

  async appendAudit(entry: SessionAuditEntry): Promise<void> {
    const stored = tagged(entry, "session_audit");
    const existing = await this.#audits.find(entry.id);
    if (existing === undefined) await this.#audits.create(stored);
    else await this.#audits.update(entry.id, stored);
  }

  async listAudit(
    tenantId: string,
    eventId: string,
    entityId?: string,
  ): Promise<readonly SessionAuditEntry[]> {
    return (await this.#audits.list())
      .filter(
        (entry) =>
          scopedRecord(entry, tenantId, eventId) &&
          (entityType(entry) === "session_audit" || entityType(entry) === undefined) &&
          (entityId === undefined || entry.entityId === entityId),
      )
      .map((entry) => untagged(entry) as SessionAuditEntry);
  }

  async listSpeakerIds(tenantId: string, eventId: string): Promise<readonly string[] | undefined> {
    const participants = (await this.#participants.list()).filter((record) =>
      scopedRecord(record, tenantId, eventId),
    );
    const ids = new Set<string>();
    for (const participant of participants) {
      const id = typeof participant.id === "string" ? participant.id : undefined;
      if (id !== undefined) ids.add(id);
    }
    if (ids.size > 0) return [...ids];
    const submissions = (await this.#submissions.list()).filter((record) =>
      scopedRecord(record, tenantId, eventId),
    );
    for (const submission of submissions) {
      const participants = submission.participants;
      if (!Array.isArray(participants)) continue;
      for (const participant of participants) {
        if (isRecord(participant) && typeof participant.id === "string") ids.add(participant.id);
      }
    }
    return ids.size === 0 ? undefined : [...ids];
  }

  private async scopedFind<T extends object>(
    store: AirtableJsonStore<T>,
    tenantId: string,
    eventId: string,
    id: string,
  ): Promise<T | null> {
    const value = await store.find(id);
    return value !== undefined && scopedRecord(value, tenantId, eventId) ? untagged(value) : null;
  }

  private async scopedList<T extends object>(
    store: AirtableJsonStore<T>,
    tenantId: string,
    eventId: string,
  ): Promise<readonly T[]> {
    return (await store.list())
      .filter((value) => scopedRecord(value, tenantId, eventId))
      .map((value) => untagged(value));
  }

  private async putVersioned<
    T extends {
      id: string;
      tenantId: string;
      eventId: string;
      version: number;
    },
  >(store: AirtableJsonStore<T>, value: T, expectedVersion: number | null): Promise<void> {
    const existing = await store.find(value.id);
    if (
      (existing?.version ?? null) !== expectedVersion ||
      (existing !== undefined &&
        (existing.tenantId !== value.tenantId || existing.eventId !== value.eventId))
    ) {
      throw new SessionRepositoryConflictError();
    }
    if (existing === undefined) await store.create(tagged(value, `session_${value.id}`));
    else await store.update(value.id, tagged(value, `session_${value.id}`));
  }

  private async deleteVersioned<
    T extends {
      id: string;
      tenantId: string;
      eventId: string;
      version: number;
    },
  >(
    store: AirtableJsonStore<T>,
    tenantId: string,
    eventId: string,
    id: string,
    expectedVersion: number,
  ): Promise<void> {
    const existing = await store.find(id);
    if (
      existing === undefined ||
      existing.tenantId !== tenantId ||
      existing.eventId !== eventId ||
      existing.version !== expectedVersion
    ) {
      throw new SessionRepositoryConflictError();
    }
    await store.delete(id);
  }
}
function communicationEntity(value: object, kind: string): boolean {
  const tag = entityType(value);
  return tag === undefined || tag === kind;
}

function templateLogicalId(id: string): string {
  const match = /^template:(.*):v\d+$/u.exec(id);
  return match?.[1] ?? id;
}

function templatePhysicalId(id: string, version: number): string {
  return `template:${id}:v${version}`;
}

function communicationIndexedFilterFormula(
  tenantId: string,
  eventId: string,
  purpose?: CommunicationTemplatePurpose,
): string {
  const clauses = [
    applicationIdFormula("Organization ID", tenantId),
    applicationIdFormula("Event ID", eventId),
    ...(purpose === undefined ? [] : [applicationIdFormula("Purpose", purpose)]),
  ];
  return clauses.length === 1 ? (clauses[0] as string) : `AND(${clauses.join(",")})`;
}

function normalizeTemplate(value: JsonRecord): CommunicationTemplate {
  const clean = untagged(value) as unknown as CommunicationTemplate;
  return {
    ...clean,
    id: templateLogicalId(requiredId(value.id)),
  };
}

function normalizeCommunicationAudience(value: unknown): CommunicationAudience[] {
  const known = new Set<CommunicationAudience>([
    "all_participants",
    "accepted_participants",
    "waitlisted_participants",
    "rejected_participants",
    "task_assignees",
    "scheduled_participants",
  ]);
  return asStringArray(value).filter((entry): entry is CommunicationAudience =>
    known.has(entry as CommunicationAudience),
  );
}

function participantRecipient(
  value: JsonRecord,
  tenantId: string,
  eventId: string,
  fallbackAudience: CommunicationAudience[] = ["all_participants"],
): CommunicationRecipient | null {
  const email = textValue(value, "email", "Email");
  const id = textValue(value, "id", APPLICATION_ID);
  if (email === null || id === null) return null;
  const displayName =
    textValue(value, "displayName", "name", "Name") ??
    [textValue(value, "firstName", "First Name"), textValue(value, "lastName", "Last Name")]
      .filter((part): part is string => part !== null)
      .join(" ");
  const audiences = normalizeCommunicationAudience(value.audiences ?? value.Audiences);
  return {
    id,
    participantId: textValue(value, "participantId", "Participant ID") ?? id,
    tenantId,
    eventId,
    email,
    displayName: displayName || id,
    audiences: audiences.length === 0 ? fallbackAudience : audiences,
    data: isRecord(value.data) ? clone(value.data) : {},
  };
}

/** Email templates, recipient snapshots, and sends are durable Airtable business records. */
export class AirtableCommunicationRepository implements CommunicationRepository {
  readonly #templates: AirtableJsonStore<JsonRecord>;
  readonly #snapshots: AirtableJsonStore<JsonRecord>;
  readonly #participants: AirtableJsonStore<JsonRecord>;
  readonly #submissions: AirtableJsonStore<JsonRecord>;
  readonly #decisions: AirtableJsonStore<JsonRecord>;

  constructor(options: {
    readonly baseId: string;
    readonly transport: AirtableTransport;
  }) {
    const shared = { baseId: options.baseId, transport: options.transport };
    this.#templates = new AirtableJsonStore({
      ...shared,
      table: "Email Templates",
      jsonField: "Settings JSON",
      scopeFields: { eventId: true, organizationId: true },
      indexedFields: {
        Purpose: "purpose",
        Status: "status",
        Sender: "sender",
      },
    });
    this.#snapshots = new AirtableJsonStore({
      ...shared,
      table: "Email Send Snapshots",
      jsonField: "Data JSON",
      scopeFields: { eventId: true, organizationId: true },
      indexedFields: {
        Purpose: "purpose",
        Status: "status",
      },
    });
    this.#participants = jsonStore(shared, "Participants", "Metadata JSON");
    this.#submissions = jsonStore(shared, "Submissions", "Answers JSON");
    this.#decisions = jsonStore(shared, "Decisions", "Metadata JSON");
  }

  async listTemplates(
    tenantId: string,
    eventId: string,
    purpose?: CommunicationTemplatePurpose,
  ): Promise<readonly CommunicationTemplate[]> {
    return (
      await this.#templates.list({
        filterByFormula: eventFilterFormula("Settings JSON", eventId),
      })
    )
      .filter(
        (value) =>
          communicationEntity(value, "communication_template") &&
          scopedRecord(value, tenantId, eventId) &&
          (purpose === undefined || value.purpose === purpose),
      )
      .map(normalizeTemplate)
      .sort((left, right) => left.id.localeCompare(right.id) || left.version - right.version);
  }

  async getTemplate(
    tenantId: string,
    eventId: string,
    templateId: string,
    version?: number,
  ): Promise<CommunicationTemplate | undefined> {
    const templates = await this.listTemplates(tenantId, eventId);
    const matches = templates.filter(
      (template) =>
        template.id === templateId && (version === undefined || template.version === version),
    );
    return matches.reduce<CommunicationTemplate | undefined>(
      (current, candidate) =>
        current === undefined || candidate.version > current.version ? candidate : current,
      undefined,
    );
  }

  async saveTemplate(template: CommunicationTemplate): Promise<CommunicationTemplate> {
    const id = templatePhysicalId(template.id, template.version);
    const stored = tagged({ ...clone(template), id }, "communication_template");
    const existing = await this.#templates.find(id);
    if (existing === undefined) await this.#templates.create(stored);
    else await this.#templates.update(id, stored);
    return clone(template);
  }

  async listRecipients(
    tenantId: string,
    eventId: string,
    audience: CommunicationAudience,
  ): Promise<readonly CommunicationRecipient[]> {
    const [decisionRecords, participantRecords, submissionRecords] = await Promise.all([
      listEventScopedJson(this.#decisions, "Metadata JSON", eventId),
      this.#participants.list({ filterByFormula: applicationIdFormula("Event", eventId) }),
      listEventScopedJson(this.#submissions, "Answers JSON", eventId),
    ]);
    const decisions = decisionRecords.filter((value) => scopedRecord(value, tenantId, eventId));
    const decisionBySubmission = new Map<string, string>();
    for (const decision of decisions) {
      const submissionId = textValue(decision, "submissionId", "Submission ID");
      const status = textValue(decision, "status", "decision", "Decision");
      if (submissionId !== null && status !== null) decisionBySubmission.set(submissionId, status);
    }
    const recipients = new Map<string, CommunicationRecipient>();
    for (const record of participantRecords) {
      const outcome = textValue(record, "outcome", "decision", "status");
      const fallback: CommunicationAudience[] =
        outcome === "accepted" || outcome === "waitlisted" || outcome === "rejected"
          ? ["all_participants", `${outcome}_participants` as CommunicationAudience]
          : ["all_participants"];
      const recipient = participantRecipient(record, tenantId, eventId, fallback);
      if (recipient !== null) recipients.set(recipient.id, recipient);
    }
    for (const submission of submissionRecords.filter((value) =>
      scopedRecord(value, tenantId, eventId),
    )) {
      const submissionId = textValue(submission, "id", APPLICATION_ID);
      const outcome = submissionId === null ? undefined : decisionBySubmission.get(submissionId);
      const fallback: CommunicationAudience[] =
        outcome === "accepted" || outcome === "waitlisted" || outcome === "rejected"
          ? ["all_participants", `${outcome}_participants` as CommunicationAudience]
          : ["all_participants"];
      const participants = submission.participants;
      if (!Array.isArray(participants)) continue;
      for (const entry of participants) {
        if (!isRecord(entry)) continue;
        const recipient = participantRecipient(entry, tenantId, eventId, fallback);
        if (recipient !== null && !recipients.has(recipient.id))
          recipients.set(recipient.id, recipient);
      }
    }
    return [...recipients.values()].filter((recipient) => recipient.audiences.includes(audience));
  }

  async getRecipientsByIds(
    tenantId: string,
    eventId: string,
    recipientIds: readonly string[],
  ): Promise<readonly CommunicationRecipient[]> {
    const all = await Promise.all(
      (
        [
          "all_participants",
          "accepted_participants",
          "waitlisted_participants",
          "rejected_participants",
          "task_assignees",
          "scheduled_participants",
        ] as const
      ).map((audience) => this.listRecipients(tenantId, eventId, audience)),
    );
    const byId = new Map<string, CommunicationRecipient>();
    for (const list of all) for (const recipient of list) byId.set(recipient.id, recipient);
    return recipientIds.flatMap((id) => {
      const recipient = byId.get(id);
      return recipient === undefined ? [] : [recipient];
    });
  }

  async isAudienceAuthorized(
    tenantId: string,
    eventId: string,
    _audience: CommunicationAudience,
  ): Promise<boolean> {
    const [submissions, participants] = await Promise.all([
      listEventScopedJson(this.#submissions, "Answers JSON", eventId),
      this.#participants.list({ filterByFormula: applicationIdFormula("Event", eventId) }),
    ]);
    return (
      submissions.some((value) => scopedRecord(value, tenantId, eventId)) || participants.length > 0
    );
  }

  async getPreview(
    tenantId: string,
    eventId: string,
    previewId: string,
  ): Promise<CommunicationPreview | undefined> {
    const value = await this.#snapshots.find(previewId);
    return value !== undefined &&
      communicationEntity(value, "communication_preview") &&
      scopedRecord(value, tenantId, eventId)
      ? (untagged(value) as unknown as CommunicationPreview)
      : undefined;
  }

  async savePreview(preview: CommunicationPreview): Promise<CommunicationPreview> {
    const stored = tagged(clone(preview) as unknown as JsonRecord, "communication_preview");
    try {
      await this.#snapshots.create(stored);
    } catch (error) {
      if (
        !(error instanceof AirtableRepositoryError) ||
        error.code !== "DUPLICATE_APPLICATION_ID"
      ) {
        throw error;
      }
      await this.#snapshots.update(preview.id, stored);
    }
    return clone(preview);
  }

  async findSendByIdempotency(
    tenantId: string,
    eventId: string,
    idempotencyKey: string,
  ): Promise<CommunicationSend | undefined> {
    const value = (
      await this.#snapshots.list({
        filterByFormula: communicationIndexedFilterFormula(tenantId, eventId),
      })
    ).find(
      (candidate) =>
        communicationEntity(candidate, "communication_send") &&
        scopedRecord(candidate, tenantId, eventId) &&
        candidate.idempotencyKey === idempotencyKey,
    );
    return value === undefined ? undefined : (untagged(value) as unknown as CommunicationSend);
  }

  async getSend(
    tenantId: string,
    eventId: string,
    sendId: string,
  ): Promise<CommunicationSend | undefined> {
    const value = await this.#snapshots.find(sendId);
    return value !== undefined &&
      communicationEntity(value, "communication_send") &&
      scopedRecord(value, tenantId, eventId)
      ? (untagged(value) as unknown as CommunicationSend)
      : undefined;
  }

  async saveSend(send: CommunicationSend): Promise<CommunicationSend> {
    const duplicate = await this.findSendByIdempotency(
      send.tenantId,
      send.eventId,
      send.idempotencyKey,
    );
    if (duplicate !== undefined && duplicate.id !== send.id) {
      throw new CommunicationError(
        "COMMUNICATION_CONFLICT",
        409,
        "The communication idempotency key is already in use.",
      );
    }
    const stored = tagged(clone(send) as unknown as JsonRecord, "communication_send");
    const existing = await this.#snapshots.find(send.id);
    if (existing === undefined) await this.#snapshots.create(stored);
    else await this.#snapshots.update(send.id, stored);
    return clone(send);
  }
}
function reportScoped(value: object, scope: ReportRepositoryScope): boolean {
  return scopedRecord(value, scope.tenantId, scope.eventId);
}

function reportConflictError(message: string): ReportError {
  return new ReportError("REPORT_CONFLICT", message, 409);
}

/** Reports persist definitions and immutable run artifacts; source rows are a narrow program projection. */
export class AirtableReportRepository implements ReportRepository {
  readonly #definitions: AirtableJsonStore<JsonRecord>;
  readonly #runs: AirtableJsonStore<JsonRecord>;
  readonly #sessions: AirtableJsonStore<Session>;
  readonly #participants: AirtableJsonStore<JsonRecord>;
  readonly #profiles: AirtableJsonStore<JsonRecord>;
  readonly #plans: AirtableJsonStore<EvaluationPlan>;
  readonly #assignments: AirtableJsonStore<EvaluationAssignment>;

  constructor(options: {
    readonly baseId: string;
    readonly transport: AirtableTransport;
  }) {
    const shared = { baseId: options.baseId, transport: options.transport };
    this.#definitions = jsonStore(shared, "Report Definitions", "Settings JSON");
    this.#runs = jsonStore(shared, "Report Runs", "Output JSON");
    this.#sessions = jsonStore(shared, "Sessions", "Metadata JSON");
    this.#participants = jsonStore(shared, "Participants", "Metadata JSON");
    this.#profiles = jsonStore(shared, "Speaker Profiles", "Biography");
    this.#plans = jsonStore(shared, "Review Plans", "Rounds JSON");
    this.#assignments = jsonStore(shared, "Evaluations", "Scores JSON");
  }

  async listDefinitions(scope: ReportRepositoryScope): Promise<readonly ReportDefinition[]> {
    return (await this.#definitions.list())
      .filter((value) => reportScoped(value, scope))
      .map((value) => clone(untagged(value) as unknown as ReportDefinition))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  async getDefinition(
    scope: ReportRepositoryScope,
    definitionId: string,
  ): Promise<ReportDefinition | null> {
    const value = await this.#definitions.find(definitionId);
    return value !== undefined && reportScoped(value, scope)
      ? clone(untagged(value) as unknown as ReportDefinition)
      : null;
  }

  async findDefinition(tenantId: string, definitionId: string): Promise<ReportDefinition | null> {
    const values = (await this.#definitions.list()).filter(
      (value) => recordTenantId(value) === tenantId && value.id === definitionId,
    );
    if (values.length !== 1) return null;
    const [value] = values;
    if (value === undefined) return null;
    return clone(untagged(value) as unknown as ReportDefinition);
  }

  async createDefinition(definition: ReportDefinition): Promise<ReportDefinition> {
    const existing = await this.#definitions.find(definition.id);
    if (existing !== undefined) {
      throw reportConflictError("A report with this id already exists.");
    }
    await this.#definitions.create(
      tagged(clone(definition) as unknown as JsonRecord, "report_definition"),
    );
    return clone(definition);
  }

  async updateDefinition(
    scope: ReportRepositoryScope,
    definitionId: string,
    expectedVersion: number,
    definition: ReportDefinition,
  ): Promise<ReportDefinition> {
    const existing = await this.getDefinition(scope, definitionId);
    if (existing === null)
      throw new ReportError("REPORT_NOT_FOUND", "The report was not found.", 404);
    if (existing.version !== expectedVersion) {
      throw reportConflictError("The report was modified by another requester.");
    }
    await this.#definitions.update(
      definitionId,
      tagged(clone(definition) as unknown as JsonRecord, "report_definition"),
    );
    return clone(definition);
  }

  async deleteDefinition(
    scope: ReportRepositoryScope,
    definitionId: string,
    expectedVersion: number,
  ): Promise<void> {
    const existing = await this.getDefinition(scope, definitionId);
    if (existing === null)
      throw new ReportError("REPORT_NOT_FOUND", "The report was not found.", 404);
    if (existing.version !== expectedVersion) {
      throw reportConflictError("The report was modified by another requester.");
    }
    await this.#definitions.delete(definitionId);
  }

  async recordRun(run: ReportRun): Promise<ReportRun> {
    if (await this.#runs.find(run.id)) {
      throw reportConflictError("A report run with this id already exists.");
    }
    await this.#runs.create(tagged(clone(run) as unknown as JsonRecord, "report_run"));
    return clone(run);
  }

  async getRun(scope: ReportRepositoryScope, runId: string): Promise<ReportRun | null> {
    const value = await this.#runs.find(runId);
    return value !== undefined && reportScoped(value, scope)
      ? clone(untagged(value) as unknown as ReportRun)
      : null;
  }

  async listRuns(
    scope: ReportRepositoryScope,
    definitionId?: string,
  ): Promise<readonly ReportRun[]> {
    return (await this.#runs.list())
      .filter(
        (value) =>
          reportScoped(value, scope) &&
          (definitionId === undefined || value.definitionId === definitionId),
      )
      .map((value) => clone(untagged(value) as unknown as ReportRun))
      .sort(
        (left, right) =>
          left.requestedAt.localeCompare(right.requestedAt) || left.id.localeCompare(right.id),
      );
  }

  async listProgramRecords(input: {
    readonly tenantId: string;
    readonly eventId: string;
    readonly requesterId: string;
    readonly relationships: readonly string[];
    readonly fields: readonly string[];
    readonly includePersonalData: boolean;
  }): Promise<readonly ReportProgramRecord[]> {
    const sessions = (await this.#sessions.list()).filter((session) =>
      scopedRecord(session, input.tenantId, input.eventId),
    );
    const participants = (await this.#participants.list()).filter((record) =>
      scopedRecord(record, input.tenantId, input.eventId),
    );
    const profiles = (await this.#profiles.list()).filter((record) =>
      scopedRecord(record, input.tenantId, input.eventId),
    );
    const plans = (await this.#plans.list()).filter((plan) =>
      scopedRecord(plan, input.tenantId, input.eventId),
    );
    const records: ReportProgramRecord[] = [];
    for (const session of sessions) {
      const sessionRecord: ReportProgramRecord["session"] = {
        id: session.id,
        title: session.title,
        description: session.description,
        status: session.status,
        ...(isRecord(session) && typeof session.startsAt === "string"
          ? { startsAt: session.startsAt }
          : {}),
        ...(isRecord(session) && typeof session.endsAt === "string"
          ? { endsAt: session.endsAt }
          : {}),
        ...(isRecord(session) && typeof session.roomId === "string"
          ? { room: session.roomId }
          : {}),
        ...(isRecord(session) && typeof session.trackId === "string"
          ? { track: session.trackId }
          : {}),
      };
      const speakerIds = new Set(session.speakerIds);
      const people = participants
        .filter((record) => {
          const id = textValue(record, "id", APPLICATION_ID);
          return id !== null && speakerIds.has(id);
        })
        .map((record) => {
          const person: {
            id: string;
            displayName?: string;
            biography?: string;
            email?: string;
            [key: string]: unknown;
          } = {
            id: textValue(record, "id", APPLICATION_ID) ?? "",
            displayName:
              textValue(record, "displayName", "name", "Name") ??
              [
                textValue(record, "firstName", "First Name"),
                textValue(record, "lastName", "Last Name"),
              ]
                .filter((part): part is string => part !== null)
                .join(" "),
          };
          const biography = textValue(record, "biography", "Biography");
          if (biography !== null) person.biography = biography;
          if (input.includePersonalData) {
            const email = textValue(record, "email", "Email");
            if (email !== null) person.email = email;
          }
          return person;
        });
      const speakers = profiles
        .filter((record) => {
          const profileId = textValue(record, "participantId", "Participant ID", "id");
          return profileId !== null && speakerIds.has(profileId);
        })
        .map((record) => {
          const person: {
            id: string;
            displayName?: string;
            biography?: string;
            email?: string;
            [key: string]: unknown;
          } = {
            id: textValue(record, "participantId", "Participant ID", "id") ?? "",
            displayName: textValue(record, "displayName", "name", "Name") ?? "",
          };
          const biography = textValue(record, "biography", "Biography");
          if (biography !== null) person.biography = biography;
          if (input.includePersonalData) {
            const email = textValue(record, "email", "Email");
            if (email !== null) person.email = email;
          }
          return person;
        });
      const progress = [];
      for (const plan of plans) {
        const assignments = (await this.#assignments.list()).filter(
          (value) =>
            isEvaluationAssignmentRecord(value) &&
            value.tenantId === input.tenantId &&
            value.eventId === input.eventId &&
            value.planId === plan.id,
        ) as readonly EvaluationAssignment[];
        const counts = {
          assigned: assignments.filter((entry) => entry.status === "assigned").length,
          inProgress: assignments.filter((entry) => entry.status === "in_progress").length,
          submitted: assignments.filter((entry) => entry.status === "submitted").length,
          abstained: assignments.filter((entry) => entry.status === "abstained").length,
        };
        const total = assignments.length;
        progress.push({
          planId: plan.id,
          planName: plan.name,
          planVersion: plan.version,
          total,
          ...counts,
          completionPercent: total === 0 ? 0 : Math.round((counts.submitted / total) * 100),
        });
      }
      records.push({
        tenantId: input.tenantId,
        eventId: input.eventId,
        session: sessionRecord,
        ...(people.length === 0 ? {} : { participants: people }),
        ...(speakers.length === 0 ? {} : { speakers }),
        ...(progress.length === 0 ? {} : { evaluationProgress: progress }),
      });
    }
    return records;
  }
}
/**
 * Airtable-authoritative CRM records. CRM data is deliberately kept in
 * dedicated tables rather than D1; D1 remains only the coordination/outbox
 * boundary used by integrations.
 */
export class AirtableCrmRepository implements CrmRepository {
  readonly #contacts: AirtableJsonStore<CrmContact>;
  readonly #segments: AirtableJsonStore<CrmSegment>;
  readonly #history: AirtableJsonStore<CrmHistoryEntry>;
  readonly #pipeline: AirtableJsonStore<CrmPipelineEntry>;
  readonly #notes: AirtableJsonStore<CrmNote>;
  readonly #projections: AirtableJsonStore<CrmEventProjection>;
  readonly #outreach: AirtableJsonStore<CrmOutreachCommand>;
  readonly #imports: AirtableJsonStore<CrmImportResult>;
  readonly #commands: AirtableJsonStore<JsonRecord>;
  readonly #speakerProfiles: AirtableJsonStore<SpeakerProfile & JsonRecord>;
  readonly #speakerRoster: AirtableJsonStore<SpeakerRosterEntry & { readonly tenantId?: string }>;
  readonly #events: AirtableEventRepository | undefined;

  constructor(options: {
    readonly baseId: string;
    readonly transport: AirtableTransport;
    readonly events?: AirtableEventRepository;
  }) {
    const shared = { baseId: options.baseId, transport: options.transport };
    this.#contacts = jsonStore(shared, "CRM Contacts", "Contact JSON");
    this.#segments = jsonStore(shared, "CRM Segments", "Segment JSON");
    this.#history = jsonStore(shared, "CRM History", "History JSON");
    this.#pipeline = jsonStore(shared, "CRM Pipeline", "Pipeline JSON");
    this.#notes = jsonStore(shared, "CRM Notes", "Note JSON");
    this.#projections = jsonStore(shared, "CRM Event Projections", "Projection JSON");
    this.#outreach = jsonStore(shared, "CRM Outreach", "Outreach JSON");
    this.#imports = jsonStore(shared, "CRM Imports", "Import JSON");
    this.#commands = jsonStore(shared, "CRM Commands", "Result JSON");
    this.#speakerProfiles = new AirtableJsonStore({
      ...shared,
      table: "Speaker Profiles",
      jsonField: "Biography",
      scopeFields: { eventId: true, organizationId: true },
    });
    this.#speakerRoster = jsonStore(shared, "Session Roster", "Members JSON");
    this.#events = options.events;
  }

  async listContacts(
    organizationId: string,
    filter: CrmRepositoryFilter = {},
  ): Promise<readonly CrmContact[]> {
    const organization = crmOrganization(organizationId);
    if (filter.organizationId !== undefined && filter.organizationId !== organization) return [];
    const query = filter.query?.trim().toLowerCase();
    const email = filter.email?.trim().toLowerCase();
    const tags = filter.tags?.map((tag) => tag.trim().toLowerCase());
    return (await this.#contacts.list())
      .filter((contact) => {
        if (contact.organizationId !== organization) return false;
        if (email !== undefined && contact.email?.toLowerCase() !== email) return false;
        if (filter.status !== undefined && contact.status !== filter.status) return false;
        if (filter.pipelineStage !== undefined && contact.pipelineStage !== filter.pipelineStage)
          return false;
        if (
          filter.company !== undefined &&
          !(contact.company ?? "").toLowerCase().includes(filter.company.toLowerCase())
        ) {
          return false;
        }
        if (tags !== undefined && !tags.every((tag) => contact.tags.includes(tag))) return false;
        if (
          query !== undefined &&
          ![
            contact.displayName,
            contact.email ?? "",
            contact.company ?? "",
            contact.title ?? "",
            contact.phone ?? "",
            contact.notes ?? "",
          ].some((value) => value.toLowerCase().includes(query))
        ) {
          return false;
        }
        return true;
      })
      .sort(
        (left, right) =>
          left.displayName.localeCompare(right.displayName) || left.id.localeCompare(right.id),
      )
      .map(clone);
  }

  async getContact(organizationId: string, contactId: string): Promise<CrmContact | null> {
    const organization = crmOrganization(organizationId);
    const contact = await this.#contacts.find(requiredId(contactId, "contactId"));
    return contact !== undefined && contact.organizationId === organization ? clone(contact) : null;
  }

  async findContactByEmail(organizationId: string, email: string): Promise<CrmContact | null> {
    const organization = crmOrganization(organizationId);
    const normalized = email.trim().toLowerCase();
    const contacts = await this.listContacts(organization, { email: normalized, status: "active" });
    return contacts[0] ?? null;
  }

  async saveContact(contact: CrmContact, expectedVersion: number | null): Promise<CrmContact> {
    const organization = crmOrganization(contact.organizationId);
    const existing = await this.#contacts.find(requiredId(contact.id, "contactId"));
    if (existing !== undefined && existing.organizationId !== organization) {
      throw new CrmRepositoryConflictError("The contact belongs to another organization.");
    }
    if (
      expectedVersion === null
        ? existing !== undefined
        : existing === undefined || existing.version !== expectedVersion
    ) {
      throw new CrmRepositoryConflictError("The contact changed before it could be saved.");
    }
    const next: CrmContact = {
      ...clone(contact),
      organizationId: organization,
      version: existing === undefined ? 1 : existing.version + 1,
      createdAt: existing?.createdAt ?? contact.createdAt,
      updatedAt: contact.updatedAt,
    };
    try {
      if (existing === undefined) await this.#contacts.create(next);
      else await this.#contacts.update(next.id, next);
    } catch (error) {
      throw new CrmRepositoryConflictError(
        error instanceof Error ? error.message : "The contact could not be saved.",
      );
    }
    const projections = (await this.#projections.list()).filter(
      (projection) =>
        projection.organizationId === organization && projection.contactId === next.id,
    );
    for (const projection of projections)
      await this.#projectCanonicalSpeaker(organization, projection);
    return clone(next);
  }

  async listSegments(organizationId: string): Promise<readonly CrmSegment[]> {
    const organization = crmOrganization(organizationId);
    return (await this.#segments.list())
      .filter((segment) => segment.organizationId === organization)
      .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
      .map(clone);
  }

  async getSegment(organizationId: string, segmentId: string): Promise<CrmSegment | null> {
    const organization = crmOrganization(organizationId);
    const segment = await this.#segments.find(requiredId(segmentId, "segmentId"));
    return segment !== undefined && segment.organizationId === organization ? clone(segment) : null;
  }

  async saveSegment(segment: CrmSegment, expectedVersion: number | null): Promise<CrmSegment> {
    const organization = crmOrganization(segment.organizationId);
    const existing = await this.#segments.find(requiredId(segment.id, "segmentId"));
    if (existing !== undefined && existing.organizationId !== organization) {
      throw new CrmRepositoryConflictError("The segment belongs to another organization.");
    }
    if (
      expectedVersion === null
        ? existing !== undefined
        : existing === undefined || existing.version !== expectedVersion
    ) {
      throw new CrmRepositoryConflictError("The segment changed before it could be saved.");
    }
    const next: CrmSegment = {
      ...clone(segment),
      organizationId: organization,
      version: existing === undefined ? 1 : existing.version + 1,
      createdAt: existing?.createdAt ?? segment.createdAt,
      updatedAt: segment.updatedAt,
    };
    try {
      if (existing === undefined) await this.#segments.create(next);
      else await this.#segments.update(next.id, next);
    } catch (error) {
      throw new CrmRepositoryConflictError(
        error instanceof Error ? error.message : "The segment could not be saved.",
      );
    }
    return clone(next);
  }

  async deleteSegment(
    organizationId: string,
    segmentId: string,
    expectedVersion: number,
  ): Promise<void> {
    const organization = crmOrganization(organizationId);
    const existing = await this.#segments.find(requiredId(segmentId, "segmentId"));
    if (
      existing === undefined ||
      existing.organizationId !== organization ||
      existing.version !== expectedVersion
    ) {
      throw new CrmRepositoryConflictError("The segment changed before it could be deleted.");
    }
    const deleted = await this.#segments.delete(existing.id);
    if (!deleted) throw new CrmRepositoryConflictError("The segment could not be deleted.");
  }

  async listHistory(
    organizationId: string,
    contactId: string,
  ): Promise<readonly CrmHistoryEntry[]> {
    const organization = crmOrganization(organizationId);
    const contact = requiredId(contactId, "contactId");
    return (await this.#history.list())
      .filter((entry) => entry.organizationId === organization && entry.contactId === contact)
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .map(clone);
  }

  async appendHistory(entry: CrmHistoryEntry): Promise<CrmHistoryEntry> {
    const organization = crmOrganization(entry.organizationId);
    if (entry.organizationId !== organization || entry.contactId.trim().length === 0) {
      throw new CrmRepositoryConflictError("History entry tenant data is invalid.");
    }
    if ((await this.getContact(organization, entry.contactId)) === null) {
      throw new CrmRepositoryConflictError(
        "The history contact does not belong to this organization.",
      );
    }
    const existing = await this.#history.find(requiredId(entry.id, "historyId"));
    if (existing !== undefined) {
      if (existing.organizationId !== organization) {
        throw new CrmRepositoryConflictError("The history entry belongs to another organization.");
      }
      return clone(existing);
    }
    try {
      await this.#history.create(clone(entry));
    } catch (error) {
      throw new CrmRepositoryConflictError(
        error instanceof Error ? error.message : "The history entry could not be saved.",
      );
    }
    return clone(entry);
  }

  async listPipelineHistory(
    organizationId: string,
    contactId: string,
  ): Promise<readonly CrmPipelineEntry[]> {
    const organization = crmOrganization(organizationId);
    const contact = requiredId(contactId, "contactId");
    return (await this.#pipeline.list())
      .filter((entry) => entry.organizationId === organization && entry.contactId === contact)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(clone);
  }

  async appendPipeline(entry: CrmPipelineEntry): Promise<CrmPipelineEntry> {
    const organization = crmOrganization(entry.organizationId);
    if (entry.organizationId !== organization || entry.contactId.trim().length === 0) {
      throw new CrmRepositoryConflictError("Pipeline entry tenant data is invalid.");
    }
    if ((await this.getContact(organization, entry.contactId)) === null) {
      throw new CrmRepositoryConflictError(
        "The pipeline contact does not belong to this organization.",
      );
    }
    const existing = await this.#pipeline.find(requiredId(entry.id, "pipelineId"));
    if (existing !== undefined) {
      if (existing.organizationId !== organization) {
        throw new CrmRepositoryConflictError("The pipeline entry belongs to another organization.");
      }
      return clone(existing);
    }
    try {
      await this.#pipeline.create(clone(entry));
    } catch (error) {
      throw new CrmRepositoryConflictError(
        error instanceof Error ? error.message : "The pipeline entry could not be saved.",
      );
    }
    return clone(entry);
  }

  async listNotes(organizationId: string, contactId: string): Promise<readonly CrmNote[]> {
    const organization = crmOrganization(organizationId);
    const contact = requiredId(contactId, "contactId");
    return (await this.#notes.list())
      .filter((note) => note.organizationId === organization && note.contactId === contact)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(clone);
  }

  async appendNote(note: CrmNote): Promise<CrmNote> {
    const organization = crmOrganization(note.organizationId);
    if (note.organizationId !== organization || note.contactId.trim().length === 0) {
      throw new CrmRepositoryConflictError("Note tenant data is invalid.");
    }
    if ((await this.getContact(organization, note.contactId)) === null) {
      throw new CrmRepositoryConflictError(
        "The note contact does not belong to this organization.",
      );
    }
    const existing = await this.#notes.find(requiredId(note.id, "noteId"));
    if (existing !== undefined) {
      if (existing.organizationId !== organization) {
        throw new CrmRepositoryConflictError("The note belongs to another organization.");
      }
      return clone(existing);
    }
    try {
      await this.#notes.create(clone(note));
    } catch (error) {
      throw new CrmRepositoryConflictError(
        error instanceof Error ? error.message : "The note could not be saved.",
      );
    }
    return clone(note);
  }

  async getProjection(
    organizationId: string,
    eventId: string,
    contactId: string,
  ): Promise<CrmEventProjection | null> {
    const organization = crmOrganization(organizationId);
    const event = requiredId(eventId, "eventId");
    const contact = requiredId(contactId, "contactId");
    const projection = (await this.#projections.list()).find(
      (candidate) =>
        candidate.organizationId === organization &&
        candidate.eventId === event &&
        candidate.contactId === contact,
    );
    return projection === undefined ? null : clone(projection);
  }

  async saveProjection(projection: CrmEventProjection): Promise<CrmEventProjection> {
    const organization = crmOrganization(projection.organizationId);
    const eventId = requiredId(projection.eventId, "eventId");
    const contactId = requiredId(projection.contactId, "contactId");
    if (projection.organizationId !== organization) {
      throw new CrmRepositoryConflictError("The projection tenant data is invalid.");
    }
    if ((await this.getContact(organization, contactId)) === null) {
      throw new CrmRepositoryConflictError(
        "The projected contact does not belong to this organization.",
      );
    }
    if (this.#events !== undefined) {
      const event = await this.#events.getEvent(organization, eventId);
      if (event === null) {
        throw new CrmRepositoryConflictError("The event does not belong to this organization.");
      }
    }
    const existing = await this.getProjection(organization, eventId, contactId);
    if (existing !== null) {
      await this.#projectCanonicalSpeaker(organization, existing);
      return clone(existing);
    }
    const stored: CrmEventProjection = {
      ...clone(projection),
      organizationId: organization,
      eventId,
      contactId,
    };
    try {
      await this.#projections.create(stored);
    } catch (error) {
      const concurrent = await this.getProjection(organization, eventId, contactId);
      if (concurrent !== null) {
        await this.#projectCanonicalSpeaker(organization, concurrent);
        return clone(concurrent);
      }
      throw new CrmRepositoryConflictError(
        error instanceof Error ? error.message : "The event projection could not be saved.",
      );
    }
    await this.#projectCanonicalSpeaker(organization, stored);
    return clone(stored);
  }

  async listProjections(organizationId: string): Promise<readonly CrmEventProjection[]> {
    const organization = crmOrganization(organizationId);
    return (await this.#projections.list())
      .filter((projection) => projection.organizationId === organization)
      .sort(
        (left, right) =>
          left.eventId.localeCompare(right.eventId) ||
          left.contactId.localeCompare(right.contactId),
      )
      .map(clone);
  }

  async saveOutreach(command: CrmOutreachCommand): Promise<CrmOutreachCommand> {
    const organization = crmOrganization(command.organizationId);
    const key = requiredId(command.idempotencyKey, "idempotencyKey");
    if (command.organizationId !== organization) {
      throw new CrmRepositoryConflictError("The outreach tenant data is invalid.");
    }
    if ((await this.getContact(organization, command.contactId)) === null) {
      throw new CrmRepositoryConflictError(
        "The outreach contact does not belong to this organization.",
      );
    }
    if (
      command.eventId !== null &&
      this.#events !== undefined &&
      (await this.#events.getEvent(organization, requiredId(command.eventId, "eventId"))) === null
    ) {
      throw new CrmRepositoryConflictError(
        "The outreach event does not belong to this organization.",
      );
    }
    const existing = await this.getOutreachByIdempotencyKey(organization, key);
    if (existing !== null) return clone(existing);
    const stored = { ...clone(command), organizationId: organization, idempotencyKey: key };
    try {
      await this.#outreach.create(stored);
    } catch (error) {
      const concurrent = await this.getOutreachByIdempotencyKey(organization, key);
      if (concurrent !== null) return clone(concurrent);
      throw new CrmRepositoryConflictError(
        error instanceof Error ? error.message : "The outreach could not be saved.",
      );
    }
    return clone(stored);
  }

  async getOutreachByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<CrmOutreachCommand | null> {
    const organization = crmOrganization(organizationId);
    const key = requiredId(idempotencyKey, "idempotencyKey");
    const command = (await this.#outreach.list()).find(
      (candidate) => candidate.organizationId === organization && candidate.idempotencyKey === key,
    );
    if (command === undefined) return null;
    if (
      command.eventId !== null &&
      this.#events !== undefined &&
      (await this.#events.getEvent(organization, requiredId(command.eventId, "eventId"))) === null
    ) {
      throw new CrmRepositoryConflictError(
        "The outreach event does not belong to this organization.",
      );
    }
    return clone(command);
  }

  async listOutreach(organizationId: string): Promise<readonly CrmOutreachCommand[]> {
    const organization = crmOrganization(organizationId);
    return (await this.#outreach.list())
      .filter((command) => command.organizationId === organization)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(clone);
  }

  async saveImport(result: CrmImportResult): Promise<CrmImportResult> {
    const organization = crmOrganization(result.organizationId);
    if (result.organizationId !== organization) {
      throw new CrmRepositoryConflictError("The import tenant data is invalid.");
    }
    const importId = requiredId(result.id, "importId");
    const key =
      result.idempotencyKey === undefined
        ? undefined
        : requiredId(result.idempotencyKey, "idempotencyKey");
    const stored: CrmImportResult = {
      ...clone(result),
      id: importId,
      organizationId: organization,
      ...(key === undefined ? {} : { idempotencyKey: key }),
    };
    crmNestedTenant(stored, organization);
    if (key === undefined) {
      const existing = await this.#imports.find(importId);
      if (existing !== undefined && existing.organizationId !== organization) {
        throw new CrmRepositoryConflictError("The import belongs to another organization.");
      }
      if (existing !== undefined) crmNestedTenant(existing, organization);
      if (existing === undefined) await this.#imports.create(stored);
      return clone(existing ?? stored);
    }
    const existing = await this.getImportByIdempotencyKey(organization, key);
    if (existing !== null) return clone(existing);
    try {
      await this.#imports.create(stored);
    } catch (error) {
      const concurrent = await this.getImportByIdempotencyKey(organization, key);
      if (concurrent !== null) return clone(concurrent);
      throw new CrmRepositoryConflictError(
        error instanceof Error ? error.message : "The import could not be saved.",
      );
    }
    return clone(stored);
  }

  async getImportByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<CrmImportResult | null> {
    const organization = crmOrganization(organizationId);
    const key = requiredId(idempotencyKey, "idempotencyKey");
    const result = (await this.#imports.list()).find(
      (candidate) => candidate.organizationId === organization && candidate.idempotencyKey === key,
    );
    if (result === undefined) return null;
    crmNestedTenant(result, organization);
    return clone(result);
  }

  async getCommandResult<T>(
    organizationId: string,
    command: string,
    key: string,
  ): Promise<T | null> {
    const organization = crmOrganization(organizationId);
    const commandValue = requiredId(command, "command");
    const keyValue = requiredId(key, "idempotencyKey");
    const id = crmCommandId(organization, commandValue, keyValue);
    const record = await this.#commands.find(id);
    if (record === undefined) return null;
    if (record.organizationId !== organization) return null;
    if (record.command !== commandValue || record.idempotencyKey !== keyValue) return null;
    crmNestedTenant(record.value, organization);
    return clone(record.value as T);
  }

  async saveCommandResult<T>(
    organizationId: string,
    command: string,
    key: string,
    value: T,
  ): Promise<void> {
    const organization = crmOrganization(organizationId);
    const commandValue = requiredId(command, "command");
    const keyValue = requiredId(key, "idempotencyKey");
    const id = crmCommandId(organization, commandValue, keyValue);
    crmNestedTenant(value, organization);
    const existing = await this.#commands.find(id);
    if (existing !== undefined) {
      if (existing.organizationId !== organization) {
        throw new CrmRepositoryConflictError("The command result belongs to another organization.");
      }
      if (existing.command !== commandValue || existing.idempotencyKey !== keyValue) {
        throw new CrmRepositoryConflictError("The command result key is inconsistent.");
      }
      crmNestedTenant(existing.value, organization);
      return;
    }
    const stored: JsonRecord = {
      id,
      organizationId: organization,
      command: commandValue,
      idempotencyKey: keyValue,
      createdAt:
        isRecord(value) && typeof value.createdAt === "string"
          ? value.createdAt
          : new Date().toISOString(),
      value: clone(value),
    };
    await this.#commands.create(stored);
  }

  async #projectCanonicalSpeaker(
    organizationId: string,
    projection: CrmEventProjection,
  ): Promise<void> {
    const contact = await this.getContact(organizationId, projection.contactId);
    if (contact === null)
      throw new CrmRepositoryConflictError("The projected contact was not found.");
    if (this.#events !== undefined) {
      const event = await this.#events.getEvent(organizationId, projection.eventId);
      if (event === null)
        throw new CrmRepositoryConflictError("The event does not belong to this organization.");
    }
    const canonicalSubmissionId = `speaker-submission:crm-contact:${contact.id}`;
    const profileId = `speaker-profile:${projection.eventId}:${contact.id}`;
    const rosterId = `roster:${projection.eventId}:${canonicalSubmissionId}:${contact.id}`;
    const profile = await this.#speakerProfiles.find(profileId);
    const profileOrganization =
      profile === undefined ? undefined : authoritativeOrganizationId(profile);
    if (
      profile !== undefined &&
      profileOrganization === undefined &&
      (Object.hasOwn(profile, "organizationId") || Object.hasOwn(profile, "tenantId"))
    ) {
      throw new CrmRepositoryConflictError("The speaker profile has conflicting tenant data.");
    }
    if (profileOrganization !== undefined && profileOrganization !== organizationId) {
      throw new CrmRepositoryConflictError("The speaker profile belongs to another organization.");
    }
    const socialLinks = {
      ...crmSocialLinks(contact.customFields?.socialLinks),
      ...(contact.website === null ? {} : { website: contact.website }),
      ...(contact.linkedinUrl === null ? {} : { linkedin: contact.linkedinUrl }),
    };
    const profileChanged =
      profile === undefined ||
      profileOrganization !== organizationId ||
      profile.displayName !== contact.displayName ||
      (profile.email ?? null) !== contact.email ||
      (profile.jobTitle ?? null) !== contact.title ||
      (profile.company ?? null) !== contact.company ||
      profile.biography !== (contact.notes ?? "") ||
      JSON.stringify(profile.socialLinks ?? profile.social ?? {}) !== JSON.stringify(socialLinks) ||
      profile.status !== "active";
    if (profileChanged) {
      const profileBase: JsonRecord = profile === undefined ? {} : { ...profile };
      delete profileBase.email;
      delete profileBase.jobTitle;
      delete profileBase.company;
      delete profileBase.social;
      delete profileBase.socialLinks;
      const profileValue: SpeakerProfile & JsonRecord = {
        ...profileBase,
        tenantId: organizationId,
        id: profileId,
        eventId: projection.eventId,
        participantId: contact.id,
        displayName: contact.displayName,
        ...(contact.email === null ? {} : { email: contact.email }),
        ...(contact.title === null ? {} : { jobTitle: contact.title }),
        ...(contact.company === null ? {} : { company: contact.company }),
        biography: contact.notes ?? "",
        socialLinks,
        status: "active",
        version: profile?.version === undefined ? 1 : profile.version + 1,
        updatedAt: contact.updatedAt,
      };
      if (profile === undefined)
        await this.#speakerProfiles.create(tagged(profileValue, "speaker_profile"));
      else await this.#speakerProfiles.update(profileId, tagged(profileValue, "speaker_profile"));
    }

    const storedRoster = await this.#speakerRoster.find(rosterId);
    const rosterOrganization =
      storedRoster === undefined ? undefined : authoritativeOrganizationId(storedRoster);
    if (
      storedRoster !== undefined &&
      rosterOrganization === undefined &&
      (Object.hasOwn(storedRoster, "organizationId") || Object.hasOwn(storedRoster, "tenantId"))
    ) {
      throw new CrmRepositoryConflictError("The speaker roster has conflicting tenant data.");
    }
    if (rosterOrganization !== undefined && rosterOrganization !== organizationId) {
      throw new CrmRepositoryConflictError("The speaker roster belongs to another organization.");
    }
    const rosterChanged =
      storedRoster === undefined ||
      storedRoster.tenantId !== organizationId ||
      storedRoster.eventId !== projection.eventId ||
      storedRoster.submissionId !== canonicalSubmissionId ||
      storedRoster.participantId !== contact.id ||
      storedRoster.displayName !== contact.displayName ||
      (storedRoster.email ?? null) !== contact.email ||
      (storedRoster.jobTitle ?? null) !== contact.title ||
      (storedRoster.company ?? null) !== contact.company ||
      (storedRoster.biography ?? null) !== contact.notes ||
      JSON.stringify(storedRoster.socialLinks ?? {}) !== JSON.stringify(socialLinks) ||
      storedRoster.workflowStatus !== "crm-prospect" ||
      storedRoster.status !== "active" ||
      storedRoster.role !== "primary";
    if (rosterChanged) {
      const rosterBase: JsonRecord = storedRoster === undefined ? {} : { ...storedRoster };
      delete rosterBase.email;
      delete rosterBase.jobTitle;
      delete rosterBase.company;
      delete rosterBase.biography;
      delete rosterBase.socialLinks;
      const rosterValue: SpeakerRosterEntry & { readonly tenantId: string } = {
        ...rosterBase,
        id: rosterId,
        tenantId: organizationId,
        eventId: projection.eventId,
        submissionId: canonicalSubmissionId,
        participantId: contact.id,
        displayName: contact.displayName,
        ...(contact.email === null ? {} : { email: contact.email }),
        ...(contact.title === null ? {} : { jobTitle: contact.title }),
        ...(contact.company === null ? {} : { company: contact.company }),
        ...(contact.notes === null ? {} : { biography: contact.notes }),
        socialLinks,
        role: "primary",
        status: "active",
        workflowStatus: "crm-prospect",
        version: storedRoster?.version === undefined ? 1 : storedRoster.version + 1,
        createdAt: storedRoster?.createdAt ?? projection.createdAt,
        updatedAt: contact.updatedAt,
      };
      if (storedRoster === undefined) await this.#speakerRoster.create(clone(rosterValue));
      else await this.#speakerRoster.update(rosterId, clone(rosterValue));
    }
  }
}

function crmOrganization(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new TypeError("organizationId must be a non-empty string.");
  return normalized;
}

function crmCommandId(organizationId: string, command: string, key: string): string {
  const organization = crmOrganization(organizationId);
  const commandValue = requiredId(command, "command");
  const keyValue = requiredId(key, "idempotencyKey");
  return `crm-command:${organization}:${commandValue}:${keyValue}`;
}

function crmSocialLinks(value: unknown): Readonly<Record<string, string>> {
  if (!isRecord(value)) return {};
  const entries: Array<readonly [string, string]> = [];
  for (const [key, candidate] of Object.entries(value)) {
    if (key.trim().length > 0 && typeof candidate === "string" && candidate.trim().length > 0) {
      entries.push([key, candidate]);
    }
  }
  return Object.fromEntries(entries);
}
function crmNestedTenant(value: unknown, organizationId: string): void {
  const visited = new Set<object>();
  const visit = (candidate: unknown): void => {
    if (candidate === null || typeof candidate !== "object" || visited.has(candidate)) return;
    visited.add(candidate);
    if (isRecord(candidate)) {
      const directOrganization =
        typeof candidate.organizationId === "string" ? candidate.organizationId.trim() : undefined;
      const directTenant =
        typeof candidate.tenantId === "string" ? candidate.tenantId.trim() : undefined;
      if (
        directOrganization !== undefined &&
        directTenant !== undefined &&
        directOrganization !== directTenant
      ) {
        throw new CrmRepositoryConflictError("The command result contains conflicting tenants.");
      }
      const candidateOrganization = authoritativeOrganizationId(candidate);
      if (candidateOrganization !== undefined && candidateOrganization !== organizationId) {
        throw new CrmRepositoryConflictError("The command result contains another organization.");
      }
      for (const nested of Object.values(candidate)) visit(nested);
      return;
    }
    if (Array.isArray(candidate)) {
      for (const nested of candidate) visit(nested);
    }
  };
  visit(value);
}

/** Durable CRM outreach boundary. The command is persisted in Airtable while the
 * D1-backed outbox is used solely for delivery coordination. */
export class AirtableCrmOutreachBoundary implements CrmOutreachBoundary {
  constructor(
    private readonly repository: Pick<CrmRepository, "getContact">,
    private readonly database: D1Database,
    private readonly outboxQueue: Queue<CloudflareOutboxMessage>,
    private readonly events?: Pick<EventRepository, "getEvent">,
  ) {}

  async send(command: CrmOutreachCommand): Promise<CrmOutreachCommand | undefined> {
    const contact = await this.repository.getContact(command.organizationId, command.contactId);
    if (
      command.eventId !== null &&
      this.events !== undefined &&
      (await this.events.getEvent(
        command.organizationId,
        requiredId(command.eventId, "eventId"),
      )) === null
    ) {
      return { ...clone(command), status: "failed" };
    }
    const recipient =
      contact?.status === "active" ? contact.email?.trim().toLowerCase() : undefined;
    if (
      recipient === undefined ||
      recipient.length === 0 ||
      speakerDeliverySenderAddress(recipient)
    ) {
      return { ...clone(command), status: "failed" };
    }
    const idempotencyKey = `crm-outreach:${command.organizationId}:${command.idempotencyKey}`;
    const escapedBody = speakerDeliveryHtml(command.renderedBody).replaceAll("\n", "<br />");
    const result = await enqueueCloudflareOutbox({
      database: this.database,
      queue: this.outboxQueue,
      tenantId: command.organizationId,
      topic: "communications",
      deduplicationKey: idempotencyKey,
      payload: {
        from: DEFAULT_OPEN_SEND_SENDERS.speakers,
        to: [recipient],
        subject: command.subject,
        html: `<p>${escapedBody}</p>`,
        text: command.renderedBody,
        idempotencyKey,
        contactId: command.contactId,
        eventId: command.eventId,
      },
      now: command.createdAt,
    });
    return {
      ...clone(command),
      status: result.inserted ? "queued" : "sent",
    };
  }
}
async function enqueueCloudflareOutbox(input: {
  readonly database: D1Database;
  readonly queue: Queue<CloudflareOutboxMessage>;
  readonly tenantId: string;
  readonly topic: CloudflareOutboxMessage["topic"];
  readonly deduplicationKey: string;
  readonly payload: unknown;
  readonly now?: string;
}): Promise<{ readonly inserted: boolean; readonly queued: boolean }> {
  const now = input.now ?? new Date().toISOString();
  const jobId = `runtime:${input.tenantId}:${input.topic}:${input.deduplicationKey}`;
  const result = await input.database
    .prepare(
      `INSERT INTO outbox_jobs
         (id, tenant_id, topic, deduplication_key, payload_json, state,
          attempt_count, available_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)
       ON CONFLICT (tenant_id, topic, deduplication_key) DO NOTHING`,
    )
    .bind(
      jobId,
      input.tenantId,
      input.topic,
      input.deduplicationKey,
      JSON.stringify(input.payload),
      now,
      now,
      now,
    )
    .run();
  const changes = result.meta?.changes;
  const inserted = changes === undefined || changes > 0;
  const state = inserted
    ? "pending"
    : (
        await input.database
          .prepare("SELECT state FROM outbox_jobs WHERE id = ? LIMIT 1")
          .bind(jobId)
          .first<{ state: string }>()
      )?.state;
  if (state !== "pending") return { inserted, queued: false };
  await input.queue.send({
    version: 1,
    jobId,
    tenantId: input.tenantId,
    topic: input.topic,
    enqueuedAt: now,
  });
  await input.database
    .prepare(
      "UPDATE outbox_jobs SET state = 'queued', updated_at = ? WHERE id = ? AND state = 'pending'",
    )
    .bind(now, jobId)
    .run();
  return { inserted, queued: true };
}

function speakerDeliverySenderAddress(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return Object.values(DEFAULT_OPEN_SEND_SENDERS).some(
    (sender) => sender.trim().toLowerCase() === normalized,
  );
}

function speakerDeliveryHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function speakerDeliveryKey(
  kind: "invitation" | "reminder",
  organizationId: string,
  eventId: string,
  idempotencyKey: string,
  participantId: string,
): Promise<string> {
  const raw = `speaker-${kind}:${organizationId}:${eventId}:${idempotencyKey}:${participantId}`;
  if (raw.length <= 128) return raw;
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)),
  );
  return `speaker-${kind}:${[...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export class AirtableSpeakerReminderDeliveryAdapter implements SpeakerReminderDelivery {
  constructor(
    private readonly database: D1Database,
    private readonly outboxQueue: Queue<CloudflareOutboxMessage>,
  ) {}

  enqueue(input: SpeakerReminderDeliveryInput): Promise<SpeakerReminderDeliveryReceipt> {
    return this.enqueueReminder(input);
  }

  queue(input: SpeakerReminderDeliveryInput): Promise<SpeakerReminderDeliveryReceipt> {
    return this.enqueueReminder(input);
  }

  enqueueReminder(input: SpeakerReminderDeliveryInput): Promise<SpeakerReminderDeliveryReceipt> {
    return this.#enqueueReminder(input);
  }

  enqueueDeliverableReminder(
    input: SpeakerReminderDeliveryInput,
  ): Promise<SpeakerReminderDeliveryReceipt> {
    return this.#enqueueReminder(input);
  }

  async enqueueInvitation(
    input: SpeakerInvitationDeliveryInput,
  ): Promise<SpeakerInvitationDeliveryReceipt> {
    const recipientEmail = await this.verifiedRecipientEmail(input.recipientEmail);
    if (recipientEmail === null) return { status: "failed" };
    const deliveryKey = await speakerDeliveryKey(
      "invitation",
      input.organizationId,
      input.eventId,
      input.idempotencyKey,
      input.participantId,
    );
    const result = await enqueueCloudflareOutbox({
      database: this.database,
      queue: this.outboxQueue,
      tenantId: input.organizationId,
      topic: "communications",
      deduplicationKey: deliveryKey,
      payload: {
        from: DEFAULT_OPEN_SEND_SENDERS.speakers,
        to: [recipientEmail],
        subject: `Speaker invitation for ${input.eventId}`,
        html: `<p>You are invited to participate as a speaker.</p><p>Template: <strong>${speakerDeliveryHtml(input.templateId)}</strong></p>`,
        text: `You are invited to participate as a speaker for ${input.eventId}. Template: ${input.templateId}`,
        idempotencyKey: deliveryKey,
        eventId: input.eventId,
        participantId: input.participantId,
        templateId: input.templateId,
        actorAccountId: input.actorAccountId,
      },
    });
    return {
      status: result.inserted ? "queued" : "sent",
      duplicate: !result.inserted,
    };
  }

  queueInvitation(
    input: SpeakerInvitationDeliveryInput,
  ): Promise<SpeakerInvitationDeliveryReceipt> {
    return this.enqueueInvitation(input);
  }

  async #enqueueReminder(
    input: SpeakerReminderDeliveryInput,
  ): Promise<SpeakerReminderDeliveryReceipt> {
    const recipientEmail = await this.verifiedRecipientEmail(input.recipient.email);
    if (recipientEmail === null) return { queued: false, duplicate: true };
    const deliveryKey = await speakerDeliveryKey(
      "reminder",
      input.organizationId,
      input.eventId,
      input.idempotencyKey,
      input.recipient.participantId,
    );
    const titles = input.recipient.tasks
      .map((task) => task.title.trim())
      .filter((title) => title.length > 0);
    const taskSummary = titles.length === 0 ? "your outstanding speaker tasks" : titles.join(", ");
    const escapedSummary = speakerDeliveryHtml(taskSummary);
    const result = await enqueueCloudflareOutbox({
      database: this.database,
      queue: this.outboxQueue,
      tenantId: input.organizationId,
      topic: "communications",
      deduplicationKey: deliveryKey,
      payload: {
        from: DEFAULT_OPEN_SEND_SENDERS.speakers,
        to: [recipientEmail],
        subject: `Reminder: ${taskSummary}`,
        html: `<p>Please complete ${escapedSummary}.</p>`,
        text: `Please complete ${taskSummary}.`,
        idempotencyKey: deliveryKey,
        eventId: input.eventId,
        participantId: input.recipient.participantId,
        taskIds: [...input.recipient.taskIds],
        actorAccountId: input.actorAccountId,
      },
    });
    return {
      queued: result.queued,
      duplicate: !result.inserted,
    };
  }

  private async verifiedRecipientEmail(candidate: string | undefined): Promise<string | null> {
    const email = candidate?.trim().toLowerCase() ?? "";
    if (email.length === 0 || speakerDeliverySenderAddress(email)) return null;
    const row = await this.database
      .prepare(
        `SELECT email
           FROM auth_users
          WHERE LOWER(email) = LOWER(?)
            AND email_verified = 1
          LIMIT 1`,
      )
      .bind(email)
      .first<{ email?: unknown }>();
    const verifiedEmail =
      row !== null && row !== undefined && typeof row.email === "string"
        ? row.email.trim().toLowerCase()
        : "";
    return verifiedEmail.length > 0 && !speakerDeliverySenderAddress(verifiedEmail)
      ? verifiedEmail
      : null;
  }
}
class AirtableCommunicationDeliveryAdapter implements CommunicationDeliveryAdapter {
  constructor(
    private readonly database: D1Database,
    private readonly queue: Queue<CloudflareOutboxMessage>,
  ) {}

  async send(request: CommunicationDeliveryRequest) {
    await enqueueCloudflareOutbox({
      database: this.database,
      queue: this.queue,
      tenantId: request.tenantId,
      topic: "communications",
      deduplicationKey: request.idempotencyKey,
      payload: {
        from: request.from,
        to: [request.to],
        subject: request.subject,
        html: request.html,
        text: request.text,
        idempotencyKey: request.idempotencyKey,
      },
    });
    return { status: "queued" as const };
  }
}
function remixScoped(value: object, tenantId: string, eventId: string): boolean {
  return scopedRecord(value, tenantId, eventId);
}

function remixCandidateTag(value: object): boolean {
  return entityType(value) === undefined || entityType(value) === "remix_candidate";
}

function remixAuditTag(value: object): boolean {
  return entityType(value) === undefined || entityType(value) === "remix_audit";
}

export class AirtableRemixRepository implements RemixRepository {
  readonly #candidates: AirtableJsonStore<ContentRemixCandidate>;
  readonly #audit: AirtableJsonStore<RemixAuditEntry>;

  constructor(options: {
    readonly baseId: string;
    readonly transport: AirtableTransport;
  }) {
    const shared = { baseId: options.baseId, transport: options.transport };
    this.#candidates = jsonStore(shared, "Remix Candidates", "Candidate JSON");
    this.#audit = jsonStore(shared, "Remix Audit", "Details JSON");
  }

  async getCandidateById(
    tenantId: string,
    candidateId: string,
  ): Promise<ContentRemixCandidate | null> {
    const candidate = await this.#candidates.find(candidateId);
    return candidate !== undefined &&
      candidate.tenantId === tenantId &&
      remixCandidateTag(candidate)
      ? clone(untagged(candidate))
      : null;
  }

  async getCandidate(
    tenantId: string,
    eventId: string,
    candidateId: string,
  ): Promise<ContentRemixCandidate | null> {
    const candidate = await this.getCandidateById(tenantId, candidateId);
    return candidate !== null && candidate.eventId === eventId ? candidate : null;
  }

  async listCandidates(
    tenantId: string,
    eventId: string,
    filter?: RemixCandidateFilter,
  ): Promise<readonly ContentRemixCandidate[]> {
    return (await this.#candidates.list())
      .filter(
        (candidate) =>
          remixCandidateTag(candidate) &&
          remixScoped(candidate, tenantId, eventId) &&
          (filter?.status === undefined || candidate.status === filter.status) &&
          (filter?.sourceType === undefined || candidate.sourceType === filter.sourceType) &&
          (filter?.sourceId === undefined || candidate.sourceId === filter.sourceId),
      )
      .map((candidate) => clone(untagged(candidate)));
  }

  async saveCandidate(
    candidate: ContentRemixCandidate,
    expectedVersion: number | null,
  ): Promise<void> {
    const existing = await this.#candidates.find(candidate.id);
    if (
      (existing?.version ?? null) !== expectedVersion ||
      (existing !== undefined &&
        (existing.tenantId !== candidate.tenantId || existing.eventId !== candidate.eventId))
    ) {
      throw new Error("The remix candidate changed since it was loaded.");
    }
    const stored = tagged(clone(candidate), "remix_candidate");
    if (existing === undefined) await this.#candidates.create(stored);
    else await this.#candidates.update(candidate.id, stored);
  }

  async appendAudit(entry: RemixAuditEntry): Promise<void> {
    const stored = tagged(clone(entry), "remix_audit");
    const existing = await this.#audit.find(entry.id);
    if (existing === undefined) await this.#audit.create(stored);
    else await this.#audit.update(entry.id, stored);
  }

  async listAudit(tenantId: string, eventId: string): Promise<readonly RemixAuditEntry[]> {
    return (await this.#audit.list())
      .filter((entry) => remixAuditTag(entry) && remixScoped(entry, tenantId, eventId))
      .map((entry) => untagged(entry) as RemixAuditEntry);
  }
}

export class AirtableRemixContentGateway implements RemixContentGateway {
  readonly #sessions: AirtableJsonStore<Session>;
  readonly #events: AirtableJsonStore<JsonRecord>;
  readonly #profiles: AirtableJsonStore<JsonRecord>;
  readonly #database: D1Database;
  readonly #queue: Queue<CloudflareOutboxMessage>;

  constructor(options: {
    readonly baseId: string;
    readonly transport: AirtableTransport;
    readonly database: D1Database;
    readonly queue: Queue<CloudflareOutboxMessage>;
  }) {
    const shared = { baseId: options.baseId, transport: options.transport };
    this.#sessions = jsonStore(shared, "Sessions", "Metadata JSON");
    this.#events = new AirtableJsonStore({
      ...shared,
      table: "Events",
      jsonField: "Settings JSON",
    });
    this.#profiles = new AirtableJsonStore({
      ...shared,
      table: "Speaker Profiles",
      jsonField: "Biography",
      scopeFields: { eventId: true, organizationId: true },
    });
    this.#database = options.database;
    this.#queue = options.queue;
  }

  async listSessions(input: {
    tenantId: string;
    eventId: string;
    filter?: RemixRecordFilter;
  }): Promise<readonly RemixSessionRecord[]> {
    return (await this.#sessions.list())
      .filter((session) => remixScoped(session, input.tenantId, input.eventId))
      .map((session) => ({
        kind: "session" as const,
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
    filter?: RemixRecordFilter;
  }): Promise<readonly RemixSpeakerRecord[]> {
    const event = await this.#events.find(input.eventId);
    const eventOrganizationId =
      event === undefined ? undefined : authoritativeOrganizationId(event);
    return (await this.#profiles.list())
      .filter((profile) =>
        speakerProfileScoped(profile, input.tenantId, input.eventId, eventOrganizationId),
      )
      .flatMap((profile) => {
        const id = textValue(profile, "participantId", "Participant ID", "id");
        const biography = textValue(profile, "biography", "Biography");
        return id === null || biography === null
          ? []
          : [
              {
                kind: "speaker" as const,
                id,
                eventId: input.eventId,
                revision: typeof profile.version === "number" ? profile.version : 1,
                biography,
              },
            ];
      });
  }

  async getSession(input: {
    tenantId: string;
    eventId: string;
    sourceId: string;
  }): Promise<RemixSessionRecord | null> {
    const session = await this.#sessions.find(input.sourceId);
    return session !== undefined && remixScoped(session, input.tenantId, input.eventId)
      ? {
          kind: "session",
          id: session.id,
          eventId: session.eventId,
          revision: session.version,
          title: session.title,
          description: session.description,
          tags: [...session.tagIds],
          tracks: [...session.trackIds],
        }
      : null;
  }

  async getSpeaker(input: {
    tenantId: string;
    eventId: string;
    sourceId: string;
  }): Promise<RemixSpeakerRecord | null> {
    const event = await this.#events.find(input.eventId);
    const eventOrganizationId =
      event === undefined ? undefined : authoritativeOrganizationId(event);
    const profile = (await this.#profiles.list()).find(
      (candidate) =>
        speakerProfileScoped(candidate, input.tenantId, input.eventId, eventOrganizationId) &&
        textValue(candidate, "participantId", "Participant ID", "id") === input.sourceId,
    );
    if (profile === undefined) return null;
    const biography = textValue(profile, "biography", "Biography");
    if (biography === null) return null;
    return {
      kind: "speaker",
      id: input.sourceId,
      eventId: input.eventId,
      revision: typeof profile.version === "number" ? profile.version : 1,
      biography,
    };
  }

  async applyRevision(input: {
    tenantId: string;
    eventId: string;
    sourceType: "session" | "speaker";
    sourceId: string;
    expectedSourceRevision: number;
    fields: readonly RemixField[];
    content: RemixContent;
    candidateId: string;
    actorId: string;
    appliedAt: string;
  }): Promise<ContentRevision> {
    if (input.sourceType === "session") {
      const current = await this.#sessions.find(input.sourceId);
      if (
        current === undefined ||
        !remixScoped(current, input.tenantId, input.eventId) ||
        current.version !== input.expectedSourceRevision
      ) {
        throw new Error("The session content changed since remix generation.");
      }
      const content = input.content as Extract<RemixContent, { title: string }>;
      const next: Session = {
        ...current,
        title: content.title,
        description: content.description,
        tagIds: [...(content.tags ?? [])],
        trackIds: [...(content.tracks ?? [])],
        version: current.version + 1,
        updatedAt: input.appliedAt,
        updatedBy: input.actorId,
        history: [
          ...current.history,
          {
            id: `remix:${input.candidateId}`,
            action: "updated",
            version: current.version + 1,
            actorId: input.actorId,
            occurredAt: input.appliedAt,
          },
        ],
      };
      await this.#sessions.update(current.id, tagged(next, "session_remix_applied"));
      await enqueueCloudflareOutbox({
        database: this.#database,
        queue: this.#queue,
        tenantId: input.tenantId,
        topic: "cache-invalidation",
        deduplicationKey: `remix:${input.eventId}:session:${input.sourceId}:v${next.version}`,
        payload: {
          eventId: input.eventId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          revision: next.version,
        },
        now: input.appliedAt,
      });
      return {
        id: `revision:${input.candidateId}`,
        tenantId: input.tenantId,
        eventId: input.eventId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        sourceRevision: next.version,
        fields: [...input.fields],
        content: clone(content),
        candidateId: input.candidateId,
        appliedBy: input.actorId,
        appliedAt: input.appliedAt,
      };
    }

    const event = await this.#events.find(input.eventId);
    const eventOrganizationId =
      event === undefined ? undefined : authoritativeOrganizationId(event);
    const profiles = await this.#profiles.list();
    const profile = profiles.find(
      (candidate) =>
        speakerProfileScoped(candidate, input.tenantId, input.eventId, eventOrganizationId) &&
        textValue(candidate, "participantId", "Participant ID", "id") === input.sourceId,
    );
    if (
      profile === undefined ||
      typeof profile.version !== "number" ||
      profile.version !== input.expectedSourceRevision
    ) {
      throw new Error("The speaker content changed since remix generation.");
    }
    const content = input.content as Extract<RemixContent, { biography: string }>;
    const next = {
      ...profile,
      tenantId: input.tenantId,
      biography: content.biography,
      version: profile.version + 1,
      updatedAt: input.appliedAt,
    };
    await this.#profiles.update(requiredId(profile.id), tagged(next, "speaker_remix_applied"));
    await enqueueCloudflareOutbox({
      database: this.#database,
      queue: this.#queue,
      tenantId: input.tenantId,
      topic: "cache-invalidation",
      deduplicationKey: `remix:${input.eventId}:speaker:${input.sourceId}:v${next.version}`,
      payload: {
        eventId: input.eventId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        revision: next.version,
      },
      now: input.appliedAt,
    });
    return {
      id: `revision:${input.candidateId}`,
      tenantId: input.tenantId,
      eventId: input.eventId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      sourceRevision: next.version,
      fields: [...input.fields],
      content: clone(content),
      candidateId: input.candidateId,
      appliedBy: input.actorId,
      appliedAt: input.appliedAt,
    };
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
  readonly aiProviders?: CloudflareAiProviders;
}

class AirtablePublicRepository implements PublicApiRepository {
  readonly #store: AirtableJsonStore<JsonRecord>;
  readonly #jsonField: string;

  constructor(options: {
    readonly baseId: string;
    readonly table: string;
    readonly transport: AirtableTransport;
    readonly jsonField?: string;
  }) {
    this.#jsonField = options.jsonField ?? DEFAULT_JSON_FIELD;
    this.#store = new AirtableJsonStore(options);
  }

  async list(input: PublicApiListInput): Promise<PublicApiListResult<JsonRecord>> {
    const records = (
      await this.#store.list({
        filterByFormula: organizationScopeFormula(this.#jsonField, input.organizationId, []),
      })
    )
      .filter((record) => {
        const tenant = record.organizationId ?? record.tenantId;
        return (
          tenant === input.organizationId &&
          Object.entries(input.filters).every(
            ([key, value]) => String(record[key] ?? "") === value,
          ) &&
          isAfterCursor(record, input)
        );
      })
      .sort((left, right) => {
        const primary = scalarCompare(left[input.sort], right[input.sort]);
        const byId = scalarCompare(left.id, right.id);
        const comparison = primary === 0 ? byId : primary;
        return input.direction === "asc" ? comparison : -comparison;
      });
    return {
      items: records.slice(0, input.limit + 1).map(publicRecord),
      hasMore: records.length > input.limit,
      nextCursor: null,
    };
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
      tenantId: input.organizationId,
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
      tenantId: input.organizationId,
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

class AirtableEvaluationDecisionProjection {
  constructor(
    private readonly cfp: AirtableCfpRepository,
    private readonly database: D1Database,
    private readonly queue: Queue<CloudflareOutboxMessage>,
  ) {}

  async projectDecision(input: EvaluationDecisionProjectionInput): Promise<void> {
    const submission = await this.cfp.getSubmission(input.tenantId, input.submissionId);
    if (submission === null || submission.eventId !== input.eventId) return;
    const recipients = submission.participants
      .map((participant) => participant.email.trim())
      .filter((email) => email.length > 0);
    if (recipients.length === 0) return;
    const templatePurpose = input.communication.templatePurpose;
    const idempotencyKey = `decision:${input.idempotencyKey}`;
    await enqueueCloudflareOutbox({
      database: this.database,
      queue: this.queue,
      tenantId: input.tenantId,
      topic: "communications",
      deduplicationKey: idempotencyKey,
      payload: {
        from: DEFAULT_OPEN_SEND_SENDERS.speakers,
        to: recipients,
        subject: `Session application ${input.status}`,
        html: `<p>Your session application was ${input.status}.</p>`,
        text: `Your session application was ${input.status}.`,
        idempotencyKey,
        purpose: "decision",
        templatePurpose,
        status: input.status,
      },
      now: input.decidedAt,
    });
  }
}
export class D1EvaluationReviewerIdentityBoundary implements EvaluationReviewerIdentityBoundary {
  constructor(private readonly database: D1Database) {}

  async resolveReviewerIds(
    actor: EvaluationActor,
    input: {
      readonly eventId: string;
      readonly reviewerIds: readonly string[];
    },
  ): Promise<readonly string[] | null> {
    if (
      actor.kind !== "human" ||
      !actor.grants.some((grant) => grant.eventId === input.eventId && grant.role === "organizer")
    ) {
      return null;
    }

    const resolved: string[] = [];
    for (const candidate of input.reviewerIds) {
      const identifier = candidate.trim();
      if (identifier.length === 0) return null;
      const result = await this.database
        .prepare(
          `SELECT u.id
             FROM auth_users AS u
             INNER JOIN organization_memberships AS m ON m.user_id = u.id
            WHERE m.organization_id = ?
              AND m.role = 'reviewer'
              AND u.email_verified = 1
              AND u.id = ?
            ORDER BY u.id
            LIMIT 2`,
        )
        .bind(actor.tenantId, identifier)
        .all<{ id: string }>();
      const matches = (result.results ?? []).filter(
        (row): row is { id: string } => typeof row.id === "string" && row.id.trim().length > 0,
      );
      if (matches.length !== 1) return null;
      const [match] = matches;
      if (match === undefined || resolved.includes(match.id)) return null;
      resolved.push(match.id);
    }
    return resolved;
  }
}

export class AirtableEvaluationReminderBoundary implements EvaluationReminderBoundary {
  constructor(
    private readonly plans: AirtableEvaluationRepository,
    private readonly database: D1Database,
    private readonly queue: Queue<CloudflareOutboxMessage>,
  ) {}

  async sendOutstandingReviewerReminders(
    actor: EvaluationActor,
    input: {
      readonly planId: string;
      readonly roundId?: string | undefined;
      readonly reviewerIds: readonly string[];
      readonly assignmentIds: readonly string[];
    },
  ): Promise<{
    readonly queued: number;
    readonly reviewerIds: readonly string[];
  }> {
    const plan = await this.plans.getPlan(actor.tenantId, input.planId);
    if (plan === null) return { queued: 0, reviewerIds: [] };
    const requestedAssignmentIds = [...new Set(input.assignmentIds)].sort();
    const storedAssignments = await this.plans.listAssignments(actor.tenantId, plan.id);
    const matchingAssignments = storedAssignments.filter(
      (assignment) =>
        requestedAssignmentIds.includes(assignment.id) &&
        input.reviewerIds.includes(assignment.reviewerId) &&
        (input.roundId === undefined || assignment.roundId === input.roundId) &&
        (assignment.status === "assigned" || assignment.status === "in_progress"),
    );
    const assignmentIdsByReviewer = new Map<string, string[]>();
    for (const assignment of matchingAssignments) {
      const ids = assignmentIdsByReviewer.get(assignment.reviewerId) ?? [];
      ids.push(assignment.id);
      assignmentIdsByReviewer.set(assignment.reviewerId, ids);
    }
    const reviewerIds =
      storedAssignments.length === 0
        ? [...new Set(input.reviewerIds)].sort()
        : [...assignmentIdsByReviewer.keys()].sort();
    if (storedAssignments.length > 0 && assignmentIdsByReviewer.size === 0) {
      return { queued: 0, reviewerIds: [] };
    }
    let queued = 0;
    for (const reviewerId of reviewerIds) {
      const assignmentIds =
        storedAssignments.length === 0
          ? requestedAssignmentIds
          : (assignmentIdsByReviewer.get(reviewerId) ?? []).sort();
      if (assignmentIds.length === 0) continue;
      const recipient = await this.database
        .prepare(
          `SELECT email
             FROM auth_users
            WHERE id = ? AND email_verified = 1
            LIMIT 1`,
        )
        .bind(reviewerId)
        .first<{ email: string }>();
      const email = recipient?.email.trim();
      if (email === undefined || email.length === 0) continue;
      const round = input.roundId === undefined ? "all rounds" : `round ${input.roundId}`;
      const idempotencyKey = `evaluation-reminder:${input.planId}:${input.roundId ?? "all"}:${reviewerId}`;
      const result = await enqueueCloudflareOutbox({
        database: this.database,
        queue: this.queue,
        tenantId: actor.tenantId,
        topic: "communications",
        deduplicationKey: idempotencyKey,
        payload: {
          from: DEFAULT_OPEN_SEND_SENDERS.speakers,
          to: [email],
          subject: `Review reminder: ${plan.name}`,
          html: `<p>You have outstanding reviews for <strong>${plan.name}</strong> (${round}).</p>`,
          text: `You have outstanding reviews for ${plan.name} (${round}).`,
          idempotencyKey,
          planId: input.planId,
          eventId: plan.eventId,
          roundId: input.roundId ?? null,
          assignmentIds,
        },
      });
      if (result.queued) queued += assignmentIds.length;
    }
    return { queued, reviewerIds };
  }
}
export function createAirtableDependencies(options: AirtableRuntimeOptions): ApiDependencies {
  const shared = { baseId: options.baseId, transport: options.transport };
  const cfpRepository = new AirtableCfpRepository(shared);
  const eventRepository = new AirtableEventRepository(shared);
  const eventService = new EventService(eventRepository);
  const cfpIdempotency = new D1IdempotencyStore(options.database);
  const crmRepository = new AirtableCrmRepository({
    ...shared,
    events: eventRepository,
  });
  const crmService = new CrmService({
    repository: crmRepository,
    outreach: new AirtableCrmOutreachBoundary(
      crmRepository,
      options.database,
      options.outboxQueue,
      eventRepository,
    ),
  });
  const speakerRepository = new AirtableSpeakerRepository({
    ...shared,
    database: options.database,
  });
  const privateAssets = new R2PrivateAssetGateway(
    options.privateFiles,
    options.webOrigin,
    options.database,
  );
  const speakerService = new SpeakerService(speakerRepository, privateAssets, {
    delivery: new AirtableSpeakerReminderDeliveryAdapter(options.database, options.outboxQueue),
  });
  const cfpService = new CfpService({
    repository: cfpRepository,
    idempotency: cfpIdempotency,
    effects: new CloudflareCfpEffects(options.outboxQueue, options.database),
    fileAssets: new AirtableCfpFileAssetGateway({
      cfp: cfpRepository,
      speakers: speakerRepository,
      privateAssets,
    }),
  });
  const sessionRepository = new AirtableSessionRepository(shared);
  let sessionService!: SessionService;
  const agendaRepository = new AirtableAgendaRepository(shared);
  const agendaEngine = new AgendaEngine(
    agendaRepository,
    new CloudflareAgendaMutationLock(options.agendaCoordinator),
    options.aiProviders?.agenda === undefined
      ? {}
      : { suggestionProvider: options.aiProviders.agenda },
  );
  const agendaCatalogSynchronizer = new AgendaCatalogSynchronizer({
    engine: agendaEngine,
    catalogReader: {
      getAgendaCatalog: (tenantId, eventId) => sessionService.getAgendaCatalog(tenantId, eventId),
    },
    eventTimeZone: (tenantId, eventId) =>
      eventRepository.getEvent(tenantId, eventId).then((event) => event?.timeZone ?? "UTC"),
  });
  const cacheInvalidatingAgendaCatalogSynchronizer = {
    ensureInitialized: agendaCatalogSynchronizer.ensureInitialized.bind(agendaCatalogSynchronizer),
    async synchronize(input: {
      readonly tenantId: string;
      readonly eventId: string;
      readonly actorId?: string;
      readonly timeZone?: string;
      readonly minimumTravelMinutes?: number;
    }) {
      const draft = await agendaCatalogSynchronizer.synchronize(input);
      await enqueueCloudflareOutbox({
        database: options.database,
        queue: options.outboxQueue,
        tenantId: input.tenantId,
        topic: "cache-invalidation",
        deduplicationKey: `agenda-catalog:${input.eventId}:draft:${draft.version}`,
        payload: {
          eventId: input.eventId,
          draftVersion: draft.version,
        },
        now: draft.updatedAt,
      });
      return draft;
    },
  };
  sessionService = new SessionService(sessionRepository, {
    agendaCatalogSynchronizer: cacheInvalidatingAgendaCatalogSynchronizer,
  });
  const communicationRepository = new AirtableCommunicationRepository(shared);
  const communicationService = new CommunicationService(
    communicationRepository,
    new AirtableCommunicationDeliveryAdapter(options.database, options.outboxQueue),
  );
  const reportRepository = new AirtableReportRepository(shared);
  const reportService = new ReportService(
    reportRepository,
    reportRepository,
    new SafeReportExporter(),
  );
  const remixRepository = new AirtableRemixRepository(shared);
  const remixContentGateway = new AirtableRemixContentGateway({
    ...shared,
    database: options.database,
    queue: options.outboxQueue,
  });
  const remixService = new RemixService(
    remixRepository,
    remixContentGateway,
    options.aiProviders?.remix,
  );
  const evaluationRepository = new AirtableEvaluationRepository(shared);
  const evaluationSource = new AirtableSubmissionReviewSource(cfpRepository, cfpService);
  const acceptanceHandoff = new AirtableEvaluationAcceptanceHandoff({
    cfp: cfpRepository,
    speakers: speakerRepository,
    sessions: sessionRepository,
    sessionService,
    database: options.database,
    queue: options.outboxQueue,
  });
  const evaluationService = new EvaluationService(evaluationRepository, evaluationSource, {
    acceptanceHandoff,
    decisionProjection: new AirtableEvaluationDecisionProjection(
      cfpRepository,
      options.database,
      options.outboxQueue,
    ),
    ...(options.aiProviders?.evaluations === undefined
      ? {}
      : { aiSuggestionProvider: options.aiProviders.evaluations }),
  });
  const evaluationDependencies = {
    service: evaluationService,
    reminders: new AirtableEvaluationReminderBoundary(
      evaluationRepository,
      options.database,
      options.outboxQueue,
    ),
    reviewerIdentity: new D1EvaluationReviewerIdentityBoundary(options.database),
    async actorFor(principal: AuthPrincipal, request: Request): Promise<EvaluationActor | null> {
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

      if (eventId === undefined || eventId.trim().length === 0) {
        const memberships = principal.memberships.filter((candidate) =>
          ["owner", "admin", "reviewer"].includes(candidate.role),
        );
        if (memberships.length !== 1) return null;
        const [membership] = memberships;
        if (membership === undefined) return null;
        const plans = await evaluationRepository.listPlans(membership.organizationId);
        const role =
          membership.role === "owner" || membership.role === "admin" ? "organizer" : "reviewer";
        return {
          tenantId: membership.organizationId,
          userId: principal.userId,
          kind: "human",
          grants: plans.map((plan) => ({ eventId: plan.eventId, role })),
        };
      }

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
          ...(membership.role === "reviewer" ? [{ eventId, role: "reviewer" as const }] : []),
        ],
      };
    },
  };
  const authenticator = options.authenticator;

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

  const organizerMembership = async (
    principal: AuthPrincipal,
    organizationId: string,
    eventId: string,
  ) => {
    if (principal.kind !== "user") return null;
    const membership = principal.memberships.find(
      (candidate) =>
        candidate.organizationId === organizationId &&
        (candidate.role === "owner" || candidate.role === "admin"),
    );
    if (membership === undefined) return null;
    const event = await cfpRepository.getEvent(organizationId, eventId);
    return event === null ? null : membership;
  };
  const communicationActorFor = async (
    principal: AuthPrincipal,
    organizationId: string,
    eventId: string,
  ): Promise<CommunicationActor | null> => {
    const membership = await organizerMembership(principal, organizationId, eventId);
    return membership === null
      ? null
      : {
          tenantId: organizationId,
          userId: principal.kind === "user" ? principal.userId : "",
          kind: "human",
          grants: [{ eventId, role: "organizer" }],
        };
  };
  const reportActorFor = async (
    principal: AuthPrincipal,
    organizationId: string,
    eventId: string,
  ): Promise<ReportActor | null> => {
    const membership = await organizerMembership(principal, organizationId, eventId);
    return membership === null
      ? null
      : {
          tenantId: organizationId,
          userId: principal.kind === "user" ? principal.userId : "",
          kind: "human",
          grants: [{ eventId, role: "organizer", canViewPersonalData: false }],
        };
  };
  const remixActorFor = async (
    principal: AuthPrincipal,
    organizationId: string,
    eventId: string,
  ) => {
    const membership = await organizerMembership(principal, organizationId, eventId);
    return membership === null
      ? null
      : {
          tenantId: organizationId,
          userId: principal.kind === "user" ? principal.userId : "",
          kind: "human" as const,
          grants: [{ eventId, role: "organizer" as const }],
        };
  };

  return {
    events: { service: eventService },
    authenticator,
    speaker: {
      service: speakerService,
      async authenticate(request: Request) {
        const principal = await authenticator.authenticate(request).catch(() => null);
        return principal?.kind === "user" ? { accountId: principal.userId } : null;
      },
    },
    evaluations: evaluationDependencies,
    sessions: { service: sessionService },
    crm: { service: crmService },
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
    agenda: {
      engine: agendaEngine,
      async organizationIdForEvent(eventId: string) {
        const event = await events.find(eventId);
        const eventRecord: unknown = event;
        const organizationId =
          event?.tenantId ?? (isRecord(eventRecord) ? eventRecord.organizationId : undefined);
        return typeof organizationId === "string" ? organizationId : null;
      },
      async eventMetadataForEvent(eventId: string) {
        const rawEvent = await events.find(eventId);
        if (rawEvent === undefined || !isRecord(rawEvent)) return null;
        const startsAt = textValue(rawEvent, "startsAt", "startAt");
        const endsAt = textValue(rawEvent, "endsAt", "endAt");
        if (startsAt === null || endsAt === null) return null;
        const event = eventRecord(rawEvent);
        const startsOn = eventDateOnly(startsAt, event.timeZone);
        const endsOn = eventDateOnly(endsAt, event.timeZone);
        if (startsOn === null || endsOn === null) return null;
        return {
          slug: event.slug,
          name: event.name,
          timeZone: event.timeZone,
          startsOn,
          endsOn,
          venueName: event.venue,
        };
      },
      async afterPublish(eventId, revision) {
        const [rawEvent, agendaState] = await Promise.all([
          events.find(eventId),
          agendaRepository.load(eventId),
        ]);
        const rawEventRecord: unknown = rawEvent;
        const rawEventView: JsonRecord = isRecord(rawEventRecord) ? rawEventRecord : {};
        const organizationId =
          rawEvent?.tenantId ??
          (isRecord(rawEventRecord) ? rawEventRecord.organizationId : undefined);
        if (typeof organizationId !== "string" || organizationId.trim().length === 0) {
          throw new Error("The published event organization could not be resolved.");
        }
        if (rawEvent === undefined || agendaState === null) {
          throw new Error("The published event projection could not be loaded.");
        }

        const trackNameById = new Map(agendaState.tracks.map((track) => [track.id, track.name]));
        const publishedSessionIds = new Set(revision.entries.map((entry) => entry.sessionId));
        const sessions = agendaState.sessions.filter((session) =>
          publishedSessionIds.has(session.id),
        );
        const participantIds = [...new Set(sessions.flatMap((session) => session.participantIds))];
        const profiles = await speakerRepository.listProfiles(eventId, participantIds);
        const entriesBySessionId = new Map(
          revision.entries.map((entry) => [entry.sessionId, entry]),
        );
        const sessionsByParticipantId = new Map<
          string,
          Array<{ id: string; title: string; trackNames: readonly string[] }>
        >();
        for (const session of sessions) {
          const entry = entriesBySessionId.get(session.id);
          if (entry === undefined) continue;
          const trackNames = entry.trackIds.flatMap((trackId) => {
            const name = trackNameById.get(trackId);
            return name === undefined ? [] : [name];
          });
          for (const participantId of session.participantIds) {
            const values = sessionsByParticipantId.get(participantId) ?? [];
            values.push({ id: session.id, title: session.title, trackNames });
            sessionsByParticipantId.set(participantId, values);
          }
        }

        await publishedSpeakerProjections.putPublishedSpeakers({
          id: `published-speakers:${rawEvent.slug}`,
          organizationId,
          event: {
            slug: rawEvent.slug,
            name: rawEvent.name,
            timeZone: textValue(rawEventView, "timeZone", "timezone") ?? rawEvent.timezone,
            startsOn: (textValue(rawEventView, "startsAt", "opensAt") ?? rawEvent.opensAt).slice(
              0,
              10,
            ),
            endsOn: (textValue(rawEventView, "endsAt", "closesAt") ?? rawEvent.closesAt).slice(
              0,
              10,
            ),
            venueName: textValue(rawEventView, "venue"),
          },
          revision: {
            id: revision.id,
            number: revision.revisionNumber,
            publishedAt: revision.publishedAt,
          },
          speakers: profiles
            .map((profile) => {
              const speakerSessions = sessionsByParticipantId.get(profile.participantId) ?? [];
              return {
                id: profile.participantId,
                displayName: profile.displayName,
                pronouns: null,
                jobTitle: profile.jobTitle ?? null,
                organization: profile.company ?? null,
                biography: profile.biography,
                photoUrl: null,
                sessionIds: speakerSessions.map((session) => session.id),
                sessionTitles: speakerSessions.map((session) => session.title),
                trackNames: [
                  ...new Set(speakerSessions.flatMap((session) => session.trackNames)),
                ].sort(),
              };
            })
            .sort((left, right) => left.displayName.localeCompare(right.displayName)),
        });
        await enqueueCloudflareOutbox({
          database: options.database,
          queue: options.outboxQueue,
          tenantId: organizationId,
          topic: "cache-invalidation",
          deduplicationKey: `agenda-publish:${eventId}:revision:${revision.id}`,
          payload: {
            eventId,
            revisionId: revision.id,
            revisionNumber: revision.revisionNumber,
          },
          now: revision.publishedAt,
        });
      },
    },
    publishedSpeakers: publishedSpeakerProjections,
    organizerOverview,
    publicApi: {
      contract: publicApiV1Contract,
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
          sortFields: ["id", "displayName", "updatedAt"],
          defaultSort: "id",
        },
        {
          name: "agenda",
          repository: agendaPublicRepository,
          readScope: "agenda:read",
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
