import {
  type AddContactToEventInput,
  type AddCrmNoteInput,
  type CreateCrmContactInput,
  type CreateCrmSegmentInput,
  type CrmActor,
  type CrmAnalytics,
  type CrmContact,
  type CrmContactInput,
  type CrmContactSearch,
  type CrmContactSource,
  type CrmContactStatus,
  type CrmDuplicateMatch,
  type CrmDuplicateReport,
  type CrmEventProjection,
  type CrmHistoryEntry,
  type CrmImportResult,
  type CrmImportRow,
  type CrmMergeResult,
  type CrmMergeScalarField,
  type CrmNote,
  type CrmOutreachBoundary,
  type CrmOutreachCommand,
  type CrmPipelineEntry,
  type CrmPipelineStage,
  type CrmRepository,
  type CrmRepositoryFilter,
  type CrmRepositorySeed,
  type CrmSegment,
  type CrmSegmentRule,
  type CrmServiceDependencies,
  CrmServiceError,
  type CrmServiceOptions,
  type CrmValue,
  type ImportCrmContactsInput,
  type MergeCrmContactsInput,
  type SendCrmOutreachInput,
  type UpdateCrmContactInput,
  type UpdateCrmPipelineInput,
  type UpdateCrmSegmentInput,
} from "./types";

export type { AirtableCrmRepository, CrmRepository, CrmServiceErrorCode } from "./types";
export { CrmServiceError } from "./types";

export class CrmRepositoryConflictError extends Error {
  constructor(message = "The CRM record already exists or changed.") {
    super(message);
    this.name = "CrmRepositoryConflictError";
  }
}

const MAX_ID = 200;
const MAX_TEXT = 20_000;
const MAX_TAG = 100;
const MAX_TAGS = 100;
const MAX_CUSTOM_FIELDS = 100;
const MAX_IMPORT_ROWS = 10_000;
const MAX_SEGMENT_RULES = 50;
const DEFAULT_LIMIT = 100;
const PIPELINE_STAGES: readonly CrmPipelineStage[] = [
  "new",
  "contacted",
  "qualified",
  "invited",
  "registered",
  "accepted",
  "declined",
  "won",
  "lost",
];
const CONTACT_SOURCES: readonly CrmContactSource[] = ["manual", "csv", "speaker", "import"];
const CONTACT_STATUSES: readonly CrmContactStatus[] = ["active", "merged"];
const CRM_MERGE_SCALAR_FIELDS: readonly CrmMergeScalarField[] = [
  "email",
  "phone",
  "name",
  "company",
  "title",
  "bio",
  "headshot",
];
const MERGE_PROFILE_FIELD_ALIASES: Readonly<Record<"bio" | "headshot", readonly string[]>> = {
  bio: ["bio", "biography", "profilebio"],
  headshot: ["headshoturl", "headshot", "headshotassetid", "profileimage"],
};
const EVENT_ROLES = ["speaker", "prospect", "attendee", "sponsor"] as const;
type CrmEventRole = (typeof EVENT_ROLES)[number];

function clone<T>(value: T): T {
  return structuredClone(value);
}

function invalid(message: string, details?: unknown): CrmServiceError {
  return new CrmServiceError("CRM_INVALID_INPUT", message, 400, details);
}

function forbidden(message = "An owner or administrator is required."): CrmServiceError {
  return new CrmServiceError("CRM_FORBIDDEN", message, 403);
}

function notFound(message = "The CRM record was not found."): CrmServiceError {
  return new CrmServiceError("CRM_NOT_FOUND", message, 404);
}

function conflict(message: string): CrmServiceError {
  return new CrmServiceError("CRM_CONFLICT", message, 409);
}

function dependencyUnavailable(message = "The CRM repository is not configured."): CrmServiceError {
  return new CrmServiceError("CRM_DEPENDENCY_UNAVAILABLE", message, 503);
}

function repositoryConflict(error: unknown): boolean {
  return (
    error instanceof CrmRepositoryConflictError ||
    (error instanceof Error && error.name === "CrmRepositoryConflictError")
  );
}

function text(value: unknown, field: string, maximum = MAX_ID): string {
  if (typeof value !== "string") throw invalid(`${field} must be a string.`);
  const normalized = value.normalize("NFC").replace(/\r\n?/gu, "\n").trim();
  if (normalized.length === 0 || normalized.length > maximum || unsafeControl(normalized)) {
    throw invalid(`${field} must contain between 1 and ${maximum} safe characters.`);
  }
  return normalized;
}

function optionalText(
  value: unknown,
  field: string,
  maximum = MAX_TEXT,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw invalid(`${field} must be a string or null.`);
  const normalized = value.normalize("NFC").replace(/\r\n?/gu, "\n").trim();
  if (normalized.length > maximum || unsafeControl(normalized)) {
    throw invalid(`${field} must contain at most ${maximum} safe characters.`);
  }
  return normalized.length === 0 ? null : normalized;
}

function identifier(value: unknown, field: string): string {
  return text(value, field, MAX_ID);
}
function normalizeMergeScalarWinners(
  value: MergeCrmContactsInput["fieldWinners"],
): Readonly<Partial<Record<CrmMergeScalarField, string>>> {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalid("fieldWinners must be an object of contact IDs.");
  }
  const normalized: Partial<Record<CrmMergeScalarField, string>> = {};
  for (const [field, winnerId] of Object.entries(value)) {
    if (!CRM_MERGE_SCALAR_FIELDS.includes(field as CrmMergeScalarField)) {
      throw invalid(`fieldWinners.${field} is not a supported merge field.`);
    }
    normalized[field as CrmMergeScalarField] = identifier(winnerId, `fieldWinners.${field}`);
  }
  return normalized;
}

function normalizeMergeCustomFieldWinners(
  value: MergeCrmContactsInput["customFieldWinners"],
): Readonly<Record<string, string>> {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalid("customFieldWinners must be an object of contact IDs.");
  }
  const normalized: Record<string, string> = {};
  for (const [field, winnerId] of Object.entries(value)) {
    const normalizedField = text(field, "custom field name", 100);
    normalized[normalizedField] = identifier(winnerId, `customFieldWinners.${normalizedField}`);
  }
  return normalized;
}

function nullableEmail(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = text(value, "email", 320).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(normalized)) throw invalid("email must be a valid email address.");
  return normalized;
}

function unsafeControl(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if ((code < 0x20 && code !== 0x0a && code !== 0x09) || code === 0x7f) return true;
  }
  return false;
}

function stage(value: unknown, field = "pipeline stage"): CrmPipelineStage {
  if (typeof value !== "string" || !PIPELINE_STAGES.includes(value as CrmPipelineStage)) {
    throw invalid(`${field} must be one of: ${PIPELINE_STAGES.join(", ")}.`);
  }
  return value as CrmPipelineStage;
}

function source(value: unknown): CrmContactSource {
  if (value === undefined) return "manual";
  if (typeof value !== "string" || !CONTACT_SOURCES.includes(value as CrmContactSource)) {
    throw invalid(`source must be one of: ${CONTACT_SOURCES.join(", ")}.`);
  }
  return value as CrmContactSource;
}

function status(value: unknown): CrmContactStatus {
  if (value === undefined) return "active";
  if (typeof value !== "string" || !CONTACT_STATUSES.includes(value as CrmContactStatus)) {
    throw invalid(`status must be one of: ${CONTACT_STATUSES.join(", ")}.`);
  }
  return value as CrmContactStatus;
}
function eventRole(value: unknown): CrmEventRole {
  if (value === undefined) return "prospect";
  if (typeof value !== "string" || !EVENT_ROLES.includes(value as CrmEventRole)) {
    throw invalid(`role must be one of: ${EVENT_ROLES.join(", ")}.`);
  }
  return value as CrmEventRole;
}

function boundedLimit(value: unknown): number {
  if (value === undefined) return DEFAULT_LIMIT;
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 500) {
    throw invalid("limit must be between 1 and 500.");
  }
  return value as number;
}

function nowIso(clock: () => Date): string {
  const value = clock();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new TypeError("CRM clock returned an invalid date.");
  }
  return value.toISOString();
}

function normalizeTags(values: unknown, field = "tags"): readonly string[] {
  if (values === undefined || values === null) return [];
  const candidates =
    typeof values === "string" ? values.split(",") : Array.isArray(values) ? values : null;
  if (candidates === null) throw invalid(`${field} must be an array of strings.`);
  if (candidates.length > MAX_TAGS)
    throw invalid(`${field} cannot contain more than ${MAX_TAGS} values.`);
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of candidates) {
    const normalized = text(value, `${field} value`, MAX_TAG).toLowerCase();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result.sort((left, right) => left.localeCompare(right));
}

function cloneCrmValue(value: unknown, path: string, depth = 0): CrmValue {
  if (depth > 5) throw invalid(`${path} is nested too deeply.`);
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw invalid(`${path} must be finite.`);
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 100) throw invalid(`${path} cannot contain more than 100 values.`);
    return value.map((item, index) => cloneCrmValue(item, `${path}[${index}]`, depth + 1));
  }
  if (typeof value === "object") {
    const output: Record<string, CrmValue> = {};
    for (const [key, item] of Object.entries(value)) {
      const normalizedKey = text(key, `${path} key`, 100);
      output[normalizedKey] = cloneCrmValue(item, `${path}.${normalizedKey}`, depth + 1);
    }
    return output;
  }
  throw invalid(`${path} contains an unsupported value.`);
}

function normalizeCustomFields(value: unknown): Readonly<Record<string, CrmValue>> {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw invalid("customFields must be an object.");
  }
  const entries = Object.entries(value);
  if (entries.length > MAX_CUSTOM_FIELDS) {
    throw invalid(`customFields cannot contain more than ${MAX_CUSTOM_FIELDS} values.`);
  }
  const result: Record<string, CrmValue> = {};
  for (const [key, item] of entries) {
    const normalizedKey = text(key, "custom field name", 100);
    result[normalizedKey] = cloneCrmValue(item, `customFields.${normalizedKey}`);
  }
  return result;
}

function normalizedName(input: CrmContactInput): {
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly displayName: string;
} {
  const firstName = optionalText(input.firstName, "firstName", 200) ?? null;
  const lastName = optionalText(input.lastName, "lastName", 200) ?? null;
  const explicit = optionalText(input.displayName, "displayName", 300);
  const displayName =
    explicit ?? [firstName, lastName].filter((part): part is string => part !== null).join(" ");
  if (displayName === null || displayName.length === 0) {
    throw invalid("A contact needs displayName, firstName/lastName, or email.");
  }
  return { firstName, lastName, displayName };
}

function canonical(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function contactField(contact: CrmContact, field: string): unknown {
  if (field.startsWith("custom.")) return contact.customFields[field.slice("custom.".length)];
  if (field in contact) return (contact as unknown as Record<string, unknown>)[field];
  return contact.customFields[field];
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) && Array.isArray(right))
    return left.some((value) => right.includes(value));
  if (typeof left === "string" && typeof right === "string")
    return canonical(left) === canonical(right);
  return left === right;
}

function segmentMatches(contact: CrmContact, rules: readonly CrmSegmentRule[]): boolean {
  return rules.every((rule) => {
    const actual = contactField(contact, rule.field);
    const value = rule.value;
    switch (rule.operator) {
      case "exists":
        return actual !== undefined && actual !== null && actual !== "";
      case "eq":
        return sameValue(actual, value);
      case "neq":
        return !sameValue(actual, value);
      case "contains":
        if (Array.isArray(actual)) return actual.some((item) => sameValue(item, value));
        return (
          typeof actual === "string" &&
          typeof value === "string" &&
          actual.toLowerCase().includes(value.toLowerCase())
        );
      case "startsWith":
        return (
          typeof actual === "string" &&
          typeof value === "string" &&
          actual.toLowerCase().startsWith(value.toLowerCase())
        );
      case "endsWith":
        return (
          typeof actual === "string" &&
          typeof value === "string" &&
          actual.toLowerCase().endsWith(value.toLowerCase())
        );
      case "in":
        return Array.isArray(value) && value.some((candidate) => sameValue(actual, candidate));
      case "notIn":
        return Array.isArray(value) && !value.some((candidate) => sameValue(actual, candidate));
      default:
        return false;
    }
  });
}

function parseCsv(csv: string): readonly Record<string, string>[] {
  const input = text(csv, "csv", 2_000_000);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (quoted) throw invalid("csv contains an unterminated quoted field.");
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  if (rows.length < 2) throw invalid("csv must contain a header and at least one row.");
  const headers = rows[0]?.map((header) => header.trim()) ?? [];
  if (headers.length === 0 || headers.some((header) => header.length === 0)) {
    throw invalid("csv headers must not be empty.");
  }
  if (new Set(headers.map((header) => header.toLowerCase())).size !== headers.length) {
    throw invalid("csv headers must be unique.");
  }
  return rows
    .slice(1)
    .filter((values) => values.some((value) => value.trim().length > 0))
    .map((values) => {
      const result: Record<string, string> = {};
      for (let index = 0; index < headers.length; index += 1)
        result[headers[index] ?? ""] = values[index] ?? "";
      return result;
    });
}

function csvRowInput(row: Record<string, string>): CrmImportRow {
  const known: Record<string, unknown> = {};
  const customFields: Record<string, unknown> = {};
  const names: Record<string, string> = {
    firstname: "firstName",
    "first name": "firstName",
    lastname: "lastName",
    "last name": "lastName",
    name: "displayName",
    displayname: "displayName",
    email: "email",
    phone: "phone",
    company: "company",
    title: "title",
    website: "website",
    linkedin: "linkedinUrl",
    linkedinurl: "linkedinUrl",
    notes: "notes",
    tags: "tags",
    source: "source",
    pipelinestage: "pipelineStage",
    stage: "pipelineStage",
  };
  for (const [key, value] of Object.entries(row)) {
    const target = names[key.trim().toLowerCase()];
    if (target === "tags") known.tags = value.split(",");
    else if (target !== undefined) known[target] = value;
    else if (key.trim().length > 0) customFields[key.trim()] = value;
  }
  if (Object.keys(customFields).length > 0) known.customFields = customFields;
  return known as CrmImportRow;
}

function normalizeSegmentRules(value: unknown): readonly CrmSegmentRule[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SEGMENT_RULES) {
    throw invalid(`rules must contain between 1 and ${MAX_SEGMENT_RULES} entries.`);
  }
  return value.map((candidate, index) => {
    if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw invalid(`rules[${index}] must be an object.`);
    }
    const record = candidate as Record<string, unknown>;
    const field = text(record.field, `rules[${index}].field`, 200);
    const operator = record.operator;
    if (
      operator !== "eq" &&
      operator !== "neq" &&
      operator !== "contains" &&
      operator !== "startsWith" &&
      operator !== "endsWith" &&
      operator !== "in" &&
      operator !== "notIn" &&
      operator !== "exists"
    ) {
      throw invalid(`rules[${index}].operator is invalid.`);
    }
    const normalized: CrmSegmentRule = {
      field,
      operator,
      ...(record.value === undefined
        ? {}
        : { value: cloneCrmValue(record.value, `rules[${index}].value`) }),
    };
    if (operator !== "exists" && record.value === undefined)
      throw invalid(`rules[${index}].value is required.`);
    return normalized;
  });
}

function assertActor(actor: CrmActor, organizationId: string): void {
  if (
    actor === null ||
    typeof actor !== "object" ||
    actor.kind !== "user" ||
    typeof actor.organizationId !== "string" ||
    actor.organizationId.trim() !== organizationId ||
    typeof actor.userId !== "string" ||
    actor.userId.trim().length === 0
  ) {
    throw forbidden("The authenticated organizer cannot access this organization.");
  }
  if (actor.role !== "owner" && actor.role !== "admin" && actor.role !== "organizer") {
    throw forbidden();
  }
}

function assertTenant<T extends { organizationId: string }>(record: T, organizationId: string): T {
  if (record.organizationId !== organizationId)
    throw forbidden("The CRM repository returned a cross-tenant record.");
  return record;
}

function normalizeSearch(input: CrmContactSearch | undefined): CrmContactSearch {
  if (input === undefined) return {};
  const output: CrmContactSearch = {
    ...(input.query === undefined ? {} : { query: text(input.query, "query", 500) }),
    ...(input.email === undefined ? {} : { email: text(input.email, "email", 320).toLowerCase() }),
    ...(input.tags === undefined ? {} : { tags: normalizeTags(input.tags, "tags") }),
    ...(input.pipelineStage === undefined ? {} : { pipelineStage: stage(input.pipelineStage) }),
    ...(input.status === undefined ? {} : { status: status(input.status) }),
    ...(input.company === undefined ? {} : { company: text(input.company, "company", 300) }),
    ...(input.limit === undefined ? {} : { limit: boundedLimit(input.limit) }),
    ...(input.cursor === undefined ? {} : { cursor: text(input.cursor, "cursor", 500) }),
  };
  return output;
}

export class CrmService {
  readonly #repository: CrmRepository | undefined;
  readonly #outreach: CrmOutreachBoundary | undefined;
  readonly #clock: () => Date;
  readonly #generateId: (prefix: string) => string;
  readonly #locks = new Map<string, Promise<unknown>>();

  constructor(
    dependencies: CrmServiceDependencies | CrmRepository | undefined = undefined,
    options: CrmServiceOptions = {},
  ) {
    if (dependencies !== undefined && "repository" in dependencies) {
      this.#repository = dependencies.repository;
      this.#outreach = dependencies.outreach;
    } else {
      this.#repository = dependencies as CrmRepository | undefined;
      this.#outreach = undefined;
    }
    this.#clock = options.clock ?? (() => new Date());
    this.#generateId = options.generateId ?? ((prefix) => `${prefix}_${crypto.randomUUID()}`);
  }

  async listContacts(actor: CrmActor, input?: CrmRepositoryFilter): Promise<readonly CrmContact[]>;
  async listContacts(
    actor: CrmActor,
    organizationId: string,
    input?: CrmContactSearch,
  ): Promise<readonly CrmContact[]>;
  async listContacts(
    actor: CrmActor,
    organizationOrInput: string | CrmRepositoryFilter = actor.organizationId,
    search?: CrmContactSearch,
  ): Promise<readonly CrmContact[]> {
    const organizationId =
      typeof organizationOrInput === "string"
        ? identifier(organizationOrInput, "organizationId")
        : identifier(organizationOrInput.organizationId ?? actor.organizationId, "organizationId");
    assertActor(actor, organizationId);
    const filter = normalizeSearch(
      typeof organizationOrInput === "string" ? search : organizationOrInput,
    );
    const repository = this.requireRepository();
    const records = await repository.listContacts(organizationId, {
      ...filter,
      organizationId,
    });
    const visible = records.filter((record) => record.organizationId === organizationId).map(clone);
    const limit = filter.limit ?? DEFAULT_LIMIT;
    const offset =
      filter.cursor === undefined ? 0 : Math.max(0, Number.parseInt(filter.cursor, 10) || 0);
    return visible.slice(offset, offset + limit);
  }

  async searchContacts(
    actor: CrmActor,
    input?: CrmRepositoryFilter,
  ): Promise<readonly CrmContact[]>;
  async searchContacts(
    actor: CrmActor,
    organizationId: string,
    search?: CrmContactSearch,
  ): Promise<readonly CrmContact[]>;
  async searchContacts(
    actor: CrmActor,
    organizationOrInput: string | CrmRepositoryFilter = actor.organizationId,
    search?: CrmContactSearch,
  ): Promise<readonly CrmContact[]> {
    return typeof organizationOrInput === "string"
      ? this.listContacts(actor, organizationOrInput, search)
      : this.listContacts(actor, organizationOrInput);
  }

  async getContact(
    actor: CrmActor,
    organizationId: string,
    contactId: string,
  ): Promise<CrmContact> {
    const organization = identifier(organizationId, "organizationId");
    const id = identifier(contactId, "contactId");
    assertActor(actor, organization);
    const contact = await this.requireRepository().getContact(organization, id);
    if (contact === null || contact.organizationId !== organization)
      throw notFound("The contact was not found.");
    return clone(contact);
  }

  async createContact(actor: CrmActor, input: CreateCrmContactInput): Promise<CrmContact> {
    const organizationId = identifier(input.organizationId, "organizationId");
    assertActor(actor, organizationId);
    const idempotencyKey =
      input.idempotencyKey === undefined
        ? undefined
        : text(input.idempotencyKey, "idempotencyKey", 512);
    const operation = async () => this.#createContact(actor, input, idempotencyKey);
    return this.runIdempotent(`create:${organizationId}:${idempotencyKey ?? ""}`, operation);
  }

  async #createContact(
    actor: CrmActor,
    input: CreateCrmContactInput,
    idempotencyKey: string | undefined,
  ): Promise<CrmContact> {
    const organizationId = identifier(input.organizationId, "organizationId");
    assertActor(actor, organizationId);
    const repository = this.requireRepository();
    if (idempotencyKey !== undefined) {
      const prior = await repository.getCommandResult<CrmContact>(
        organizationId,
        "create-contact",
        idempotencyKey,
      );
      if (prior !== null) return clone(assertTenant(prior, organizationId));
    }
    const contact = this.buildContact(organizationId, input, undefined, "manual");
    if (contact.email !== null) {
      const existing = await repository.findContactByEmail(organizationId, contact.email);
      if (existing !== null) throw conflict("A contact with this email already exists.");
    }
    let saved: CrmContact;
    try {
      saved = await repository.saveContact(contact, null);
    } catch (error) {
      if (repositoryConflict(error)) throw conflict("The contact already exists or changed.");
      throw error;
    }
    assertTenant(saved, organizationId);
    if (idempotencyKey !== undefined)
      await repository.saveCommandResult(organizationId, "create-contact", idempotencyKey, saved);
    return clone(saved);
  }

  async updateContact(actor: CrmActor, input: UpdateCrmContactInput): Promise<CrmContact> {
    const organizationId = identifier(input.organizationId, "organizationId");
    const contactId = identifier(input.contactId, "contactId");
    assertActor(actor, organizationId);
    const repository = this.requireRepository();
    const current = await this.getContact(actor, organizationId, contactId);
    const contact = this.buildContact(organizationId, input, current, current.source);
    const expectedVersion = input.expectedVersion ?? current.version;
    if (expectedVersion !== current.version)
      throw conflict("The contact changed. Reload it before saving.");
    if (contact.email !== null && contact.email !== current.email) {
      const duplicate = await repository.findContactByEmail(organizationId, contact.email);
      if (duplicate !== null && duplicate.id !== current.id)
        throw conflict("A contact with this email already exists.");
    }
    let saved: CrmContact;
    try {
      saved = await repository.saveContact(contact, expectedVersion);
    } catch (error) {
      if (repositoryConflict(error))
        throw conflict("The contact changed. Reload it before saving.");
      throw error;
    }
    assertTenant(saved, organizationId);
    if (saved.pipelineStage !== current.pipelineStage) {
      await this.appendPipelineChange(
        actor,
        current,
        saved.pipelineStage,
        saved.updatedAt,
        optionalText(input.pipelineNote, "pipelineNote", 2_000) ?? null,
      );
    }
    return clone(saved);
  }

  async addTag(
    actor: CrmActor,
    input: { readonly organizationId: string; readonly contactId: string; readonly tag: string },
  ): Promise<CrmContact> {
    const contact = await this.getContact(actor, input.organizationId, input.contactId);
    const tag = text(input.tag, "tag", MAX_TAG).toLowerCase();
    return this.updateContact(actor, {
      organizationId: input.organizationId,
      contactId: input.contactId,
      tags: [...contact.tags, tag],
      expectedVersion: contact.version,
    });
  }

  async removeTag(
    actor: CrmActor,
    input: { readonly organizationId: string; readonly contactId: string; readonly tag: string },
  ): Promise<CrmContact> {
    const contact = await this.getContact(actor, input.organizationId, input.contactId);
    const tag = text(input.tag, "tag", MAX_TAG).toLowerCase();
    return this.updateContact(actor, {
      organizationId: input.organizationId,
      contactId: input.contactId,
      tags: contact.tags.filter((candidate) => candidate !== tag),
      expectedVersion: contact.version,
    });
  }

  async importContacts(actor: CrmActor, input: ImportCrmContactsInput): Promise<CrmImportResult> {
    const organizationId = identifier(input.organizationId, "organizationId");
    assertActor(actor, organizationId);
    const key = text(input.idempotencyKey, "idempotencyKey", 512);
    return this.runIdempotent(`import:${organizationId}:${key}`, async () => {
      const repository = this.requireRepository();
      const existing = await repository.getImportByIdempotencyKey(organizationId, key);
      if (existing !== null) return { ...clone(existing), idempotent: true };
      const prior = await repository.getCommandResult<CrmImportResult>(
        organizationId,
        "import-contacts",
        key,
      );
      if (prior !== null) return { ...clone(prior), idempotent: true };
      if (input.csv !== undefined && input.rows !== undefined)
        throw invalid("Provide csv or rows, not both.");
      const rawRows =
        input.rows !== undefined
          ? input.rows
          : input.csv === undefined
            ? []
            : parseCsv(input.csv).map(csvRowInput);
      if (rawRows.length === 0 || rawRows.length > MAX_IMPORT_ROWS)
        throw invalid(`Import must contain between 1 and ${MAX_IMPORT_ROWS} rows.`);
      const mode = input.mode ?? "upsert";
      if (mode !== "upsert" && mode !== "create") throw invalid("mode must be upsert or create.");
      const contacts: CrmContact[] = [];
      let created = 0;
      let updated = 0;
      let skipped = 0;
      for (const raw of rawRows) {
        const candidate = this.buildContact(
          organizationId,
          { ...raw, source: raw.source ?? "csv" },
          undefined,
          "csv",
        );
        const existingContact =
          candidate.email === null
            ? null
            : await repository.findContactByEmail(organizationId, candidate.email);
        if (existingContact !== null && mode === "create") {
          skipped += 1;
          continue;
        }
        if (existingContact === null) {
          const saved = await repository.saveContact(candidate, null);
          assertTenant(saved, organizationId);
          contacts.push(clone(saved));
          created += 1;
        } else {
          const merged = this.buildContact(
            organizationId,
            raw,
            existingContact,
            existingContact.source,
          );
          const saved = await repository.saveContact(merged, existingContact.version);
          assertTenant(saved, organizationId);
          contacts.push(clone(saved));
          updated += 1;
        }
      }
      const result: CrmImportResult = {
        id: this.#generateId("import"),
        organizationId,
        created,
        updated,
        skipped,
        contacts,
        idempotent: false,
        createdAt: nowIso(this.#clock),
        idempotencyKey: key,
      };
      await repository.saveImport(result);
      await repository.saveCommandResult(organizationId, "import-contacts", key, result);
      return clone(result);
    });
  }

  async importCsv(actor: CrmActor, input: ImportCrmContactsInput): Promise<CrmImportResult> {
    return this.importContacts(actor, input);
  }

  async createSegment(actor: CrmActor, input: CreateCrmSegmentInput): Promise<CrmSegment> {
    const organizationId = identifier(input.organizationId, "organizationId");
    assertActor(actor, organizationId);
    const segment: CrmSegment = {
      id: this.#generateId("segment"),
      organizationId,
      name: text(input.name, "name", 200),
      description: optionalText(input.description, "description", 2_000) ?? null,
      rules: normalizeSegmentRules(input.rules),
      createdBy: identifier(actor.userId, "actor userId"),
      version: 1,
      createdAt: nowIso(this.#clock),
      updatedAt: nowIso(this.#clock),
    };
    const saved = await this.requireRepository().saveSegment(segment, null);
    assertTenant(saved, organizationId);
    return clone(saved);
  }

  async listSegments(
    actor: CrmActor,
    organizationId = actor.organizationId,
  ): Promise<readonly CrmSegment[]> {
    const organization = identifier(organizationId, "organizationId");
    assertActor(actor, organization);
    return (await this.requireRepository().listSegments(organization))
      .filter((segment) => segment.organizationId === organization)
      .map(clone);
  }

  async getSegment(
    actor: CrmActor,
    organizationId: string,
    segmentId: string,
  ): Promise<CrmSegment> {
    const organization = identifier(organizationId, "organizationId");
    const id = identifier(segmentId, "segmentId");
    assertActor(actor, organization);
    const segment = await this.requireRepository().getSegment(organization, id);
    if (segment === null || segment.organizationId !== organization)
      throw notFound("The segment was not found.");
    return clone(segment);
  }

  async updateSegment(actor: CrmActor, input: UpdateCrmSegmentInput): Promise<CrmSegment> {
    const organizationId = identifier(input.organizationId, "organizationId");
    const segmentId = identifier(input.segmentId, "segmentId");
    assertActor(actor, organizationId);
    const current = await this.getSegment(actor, organizationId, segmentId);
    const expectedVersion = input.expectedVersion ?? current.version;
    if (expectedVersion !== current.version)
      throw conflict("The segment changed. Reload it before saving.");
    const next: CrmSegment = {
      ...current,
      ...(input.name === undefined ? {} : { name: text(input.name, "name", 200) }),
      ...(input.description === undefined
        ? {}
        : { description: optionalText(input.description, "description", 2_000) ?? null }),
      ...(input.rules === undefined ? {} : { rules: normalizeSegmentRules(input.rules) }),
      version: current.version + 1,
      updatedAt: nowIso(this.#clock),
    };
    try {
      const saved = await this.requireRepository().saveSegment(next, expectedVersion);
      assertTenant(saved, organizationId);
      return clone(saved);
    } catch (error) {
      if (repositoryConflict(error))
        throw conflict("The segment changed. Reload it before saving.");
      throw error;
    }
  }

  async deleteSegment(
    actor: CrmActor,
    organizationId: string,
    segmentId: string,
    expectedVersion?: number,
  ): Promise<void> {
    const organization = identifier(organizationId, "organizationId");
    const id = identifier(segmentId, "segmentId");
    assertActor(actor, organization);
    const current = await this.getSegment(actor, organization, id);
    const expected = expectedVersion ?? current.version;
    if (expected !== current.version)
      throw conflict("The segment changed. Reload it before deleting.");
    try {
      await this.requireRepository().deleteSegment(organization, id, expected);
    } catch (error) {
      if (repositoryConflict(error))
        throw conflict("The segment changed. Reload it before deleting.");
      throw error;
    }
  }

  async listSegmentContacts(
    actor: CrmActor,
    organizationId: string,
    segmentId: string,
  ): Promise<readonly CrmContact[]> {
    const segment = await this.getSegment(actor, organizationId, segmentId);
    const contacts = await this.listContacts(actor, organizationId, { limit: 500 });
    return contacts.filter((contact) => segmentMatches(contact, segment.rules));
  }

  async findDuplicates(
    actor: CrmActor,
    organizationId: string,
    contactId: string,
  ): Promise<CrmDuplicateReport> {
    const organization = identifier(organizationId, "organizationId");
    const contact = await this.getContact(actor, organization, contactId);
    const contacts = await this.listContacts(actor, organization, { limit: 500 });
    const matches: CrmDuplicateMatch[] = [];
    for (const candidate of contacts) {
      if (candidate.id === contact.id || candidate.status === "merged") continue;
      const matchedFields: ("email" | "phone" | "name" | "company")[] = [];
      let score = 0;
      if (
        contact.email !== null &&
        candidate.email !== null &&
        canonical(contact.email) === canonical(candidate.email)
      ) {
        matchedFields.push("email");
        score = 1;
      }
      if (
        contact.phone !== null &&
        candidate.phone !== null &&
        canonical(contact.phone) === canonical(candidate.phone)
      ) {
        matchedFields.push("phone");
        score = Math.max(score, 0.9);
      }
      if (
        canonical(contact.displayName) !== "" &&
        canonical(contact.displayName) === canonical(candidate.displayName)
      ) {
        matchedFields.push("name");
        score = Math.max(score, 0.75);
      }
      if (
        contact.company !== null &&
        candidate.company !== null &&
        canonical(contact.company) === canonical(candidate.company)
      ) {
        matchedFields.push("company");
        score = Math.max(score, matchedFields.includes("name") ? 0.75 : 0.55);
      }
      if (score >= 0.5) matches.push({ contact: clone(candidate), score, matchedFields });
    }
    matches.sort(
      (left, right) => right.score - left.score || left.contact.id.localeCompare(right.contact.id),
    );
    return { contactId: contact.id, matches };
  }

  async detectDuplicates(
    actor: CrmActor,
    organizationId: string,
    contactId: string,
  ): Promise<CrmDuplicateReport> {
    return this.findDuplicates(actor, organizationId, contactId);
  }

  async mergeContacts(actor: CrmActor, input: MergeCrmContactsInput): Promise<CrmMergeResult> {
    const organizationId = identifier(input.organizationId, "organizationId");
    const primaryContactId = identifier(input.primaryContactId, "primaryContactId");
    if (!Array.isArray(input.duplicateContactIds))
      throw invalid("duplicateContactIds must be an array.");
    const duplicateContactIds = input.duplicateContactIds.map((id) =>
      identifier(id, "duplicateContactId"),
    );
    if (
      duplicateContactIds.length === 0 ||
      new Set(duplicateContactIds).size !== duplicateContactIds.length ||
      duplicateContactIds.includes(primaryContactId)
    ) {
      throw invalid(
        "duplicateContactIds must contain unique contacts other than the primary contact.",
      );
    }
    assertActor(actor, organizationId);
    const fieldWinners = normalizeMergeScalarWinners(input.fieldWinners);
    const customFieldWinners = normalizeMergeCustomFieldWinners(input.customFieldWinners);
    const key =
      input.idempotencyKey === undefined
        ? undefined
        : text(input.idempotencyKey, "idempotencyKey", 512);
    return this.runIdempotent(
      `merge:${organizationId}:${key ?? `${primaryContactId}:${duplicateContactIds.join(",")}`}`,
      async () => {
        const repository = this.requireRepository();
        if (key !== undefined) {
          const prior = await repository.getCommandResult<CrmMergeResult>(
            organizationId,
            "merge-contacts",
            key,
          );
          if (prior !== null) return { ...clone(prior), idempotent: true };
        }
        const primary = await this.getContact(actor, organizationId, primaryContactId);
        if (primary.status !== "active") throw invalid("The primary contact must be active.");
        const duplicates: CrmContact[] = [];
        for (const id of duplicateContactIds)
          duplicates.push(await this.getContact(actor, organizationId, id));
        const alreadyMergedDuplicateIds = new Set<string>();
        for (const duplicate of duplicates) {
          if (duplicate.status === "active") continue;
          if (duplicate.status === "merged" && duplicate.mergedIntoId === primary.id) {
            alreadyMergedDuplicateIds.add(duplicate.id);
            continue;
          }
          throw invalid(
            "Every duplicate contact must be active or already merged into this primary contact.",
          );
        }
        const allowedWinnerIds = new Set([primary.id, ...duplicates.map((contact) => contact.id)]);
        for (const winnerId of [
          ...Object.values(fieldWinners),
          ...Object.values(customFieldWinners),
        ]) {
          if (typeof winnerId !== "string" || !allowedWinnerIds.has(winnerId)) {
            throw invalid(
              "Every merge winner must be the primary contact or a requested duplicate being merged into it.",
            );
          }
        }
        const contactsById = new Map<string, CrmContact>([
          [primary.id, primary],
          ...duplicates.map((contact) => [contact.id, contact] as const),
        ]);
        const mergedTags = normalizeTags([
          ...primary.tags,
          ...duplicates.flatMap((contact) => contact.tags),
        ]);
        const mergedFields: Record<string, CrmValue> = { ...primary.customFields };
        for (const duplicate of duplicates) {
          for (const [field, value] of Object.entries(duplicate.customFields))
            if (mergedFields[field] === undefined) mergedFields[field] = clone(value);
        }
        let firstName =
          primary.firstName ??
          duplicates.find((contact) => contact.firstName !== null)?.firstName ??
          null;
        let lastName =
          primary.lastName ??
          duplicates.find((contact) => contact.lastName !== null)?.lastName ??
          null;
        let displayName =
          primary.displayName ||
          duplicates.find((contact) => contact.displayName)?.displayName ||
          "Unnamed contact";
        let email =
          primary.email ?? duplicates.find((contact) => contact.email !== null)?.email ?? null;
        let phone =
          primary.phone ?? duplicates.find((contact) => contact.phone !== null)?.phone ?? null;
        let company =
          primary.company ??
          duplicates.find((contact) => contact.company !== null)?.company ??
          null;
        let title =
          primary.title ?? duplicates.find((contact) => contact.title !== null)?.title ?? null;
        const website =
          primary.website ??
          duplicates.find((contact) => contact.website !== null)?.website ??
          null;
        const linkedinUrl =
          primary.linkedinUrl ??
          duplicates.find((contact) => contact.linkedinUrl !== null)?.linkedinUrl ??
          null;
        const notes =
          primary.notes ?? duplicates.find((contact) => contact.notes !== null)?.notes ?? null;

        for (const [field, winnerId] of Object.entries(fieldWinners)) {
          const winner = contactsById.get(winnerId);
          if (winner === undefined) throw invalid(`fieldWinners.${field} is not valid.`);
          if (winner.id === primary.id) continue;
          switch (field as CrmMergeScalarField) {
            case "email":
              email = winner.email;
              break;
            case "phone":
              phone = winner.phone;
              break;
            case "name":
              firstName = winner.firstName;
              lastName = winner.lastName;
              displayName = winner.displayName;
              break;
            case "company":
              company = winner.company;
              break;
            case "title":
              title = winner.title;
              break;
            case "bio":
            case "headshot": {
              const aliases = new Set(MERGE_PROFILE_FIELD_ALIASES[field as "bio" | "headshot"]);
              let hasValue = false;
              let value: CrmValue | null = null;
              for (const [customField, candidate] of Object.entries(winner.customFields)) {
                if (aliases.has(customField.toLowerCase())) {
                  hasValue = true;
                  value = candidate;
                  break;
                }
              }
              for (const customField of Object.keys(mergedFields))
                if (aliases.has(customField.toLowerCase())) delete mergedFields[customField];
              if (hasValue) mergedFields[field === "bio" ? "bio" : "headshotUrl"] = clone(value);
              break;
            }
          }
        }
        for (const [field, winnerId] of Object.entries(customFieldWinners)) {
          const winner = contactsById.get(winnerId);
          if (winner === undefined) throw invalid(`customFieldWinners.${field} is not valid.`);
          if (winner.id === primary.id) continue;
          const winnerValue = winner.customFields[field];
          if (Object.hasOwn(winner.customFields, field) && winnerValue !== undefined)
            mergedFields[field] = clone(winnerValue);
          else delete mergedFields[field];
        }
        if (email !== null) {
          const existing = await repository.findContactByEmail(organizationId, email);
          if (existing !== null) {
            assertTenant(existing, organizationId);
            if (existing.id !== primary.id && !allowedWinnerIds.has(existing.id))
              throw conflict("A contact with this email already exists.");
          }
        }
        const mergedPrimary: CrmContact = {
          ...primary,
          firstName,
          lastName,
          displayName,
          email,
          phone,
          company,
          title,
          website,
          linkedinUrl,
          notes,
          tags: mergedTags,
          customFields: mergedFields,
          version: primary.version + 1,
          updatedAt: nowIso(this.#clock),
        };
        // Retire requested duplicates before saving a winner email onto the primary.
        const merged: CrmContact[] = [];
        for (const duplicate of duplicates) {
          if (alreadyMergedDuplicateIds.has(duplicate.id)) {
            merged.push(clone(duplicate));
            continue;
          }
          const saved = await repository.saveContact(
            {
              ...duplicate,
              status: "merged",
              mergedIntoId: primary.id,
              version: duplicate.version + 1,
              updatedAt: nowIso(this.#clock),
            },
            duplicate.version,
          );
          assertTenant(saved, organizationId);
          merged.push(clone(saved));
        }
        const savedPrimary = assertTenant(
          await repository.saveContact(mergedPrimary, primary.version),
          organizationId,
        );
        await repository.appendHistory({
          id: this.#generateId("history"),
          organizationId,
          contactId: primary.id,
          kind: "note",
          eventId: null,
          sessionId: null,
          title: "Contacts merged",
          detail: `Merged ${merged.length} duplicate contact(s).`,
          occurredAt: nowIso(this.#clock),
          metadata: { duplicateIds: merged.map((contact) => contact.id) },
        });
        const result: CrmMergeResult = { primary: clone(savedPrimary), merged, idempotent: false };
        if (key !== undefined)
          await repository.saveCommandResult(organizationId, "merge-contacts", key, result);
        return result;
      },
    );
  }

  async getContactHistory(
    actor: CrmActor,
    organizationId: string,
    contactId: string,
  ): Promise<readonly CrmHistoryEntry[]> {
    const organization = identifier(organizationId, "organizationId");
    const id = identifier(contactId, "contactId");
    await this.getContact(actor, organization, id);
    return (await this.requireRepository().listHistory(organization, id))
      .filter((entry) => entry.organizationId === organization && entry.contactId === id)
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .map(clone);
  }

  async listHistory(
    actor: CrmActor,
    organizationId: string,
    contactId: string,
  ): Promise<readonly CrmHistoryEntry[]> {
    return this.getContactHistory(actor, organizationId, contactId);
  }
  async listEventHistory(
    actor: CrmActor,
    organizationId: string,
    eventId: string,
    contactId?: string,
  ): Promise<readonly CrmHistoryEntry[]> {
    const organization = identifier(organizationId, "organizationId");
    const event = identifier(eventId, "eventId");
    assertActor(actor, organization);
    const contacts =
      contactId === undefined
        ? await this.listContacts(actor, organization, { limit: 500 })
        : [await this.getContact(actor, organization, contactId)];
    const entries: CrmHistoryEntry[] = [];
    for (const contact of contacts) {
      const history = await this.requireRepository().listHistory(organization, contact.id);
      entries.push(
        ...history.filter(
          (entry) =>
            entry.organizationId === organization &&
            entry.contactId === contact.id &&
            entry.eventId === event,
        ),
      );
    }
    return entries
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .map(clone);
  }
  async getContactEventHistory(
    actor: CrmActor,
    organizationId: string,
    contactId: string,
  ): Promise<readonly CrmHistoryEntry[]> {
    return this.getContactHistory(actor, organizationId, contactId);
  }

  async setPipelineStage(actor: CrmActor, input: UpdateCrmPipelineInput): Promise<CrmContact> {
    const organizationId = identifier(input.organizationId, "organizationId");
    const contactId = identifier(input.contactId, "contactId");
    const nextStage = stage(input.stage);
    assertActor(actor, organizationId);
    const current = await this.getContact(actor, organizationId, contactId);
    const note = optionalText(input.note, "note", 2_000) ?? null;
    if (current.pipelineStage === nextStage) return current;
    const saved = await this.updateContact(actor, {
      organizationId,
      contactId,
      pipelineStage: nextStage,
      expectedVersion: current.version,
      pipelineNote: note,
    });
    return saved;
  }

  async updatePipeline(actor: CrmActor, input: UpdateCrmPipelineInput): Promise<CrmContact> {
    return this.setPipelineStage(actor, input);
  }
  async updateProspectStage(actor: CrmActor, input: UpdateCrmPipelineInput): Promise<CrmContact> {
    return this.setPipelineStage(actor, input);
  }

  async listPipelineHistory(
    actor: CrmActor,
    organizationId: string,
    contactId: string,
  ): Promise<readonly CrmPipelineEntry[]> {
    const organization = identifier(organizationId, "organizationId");
    const id = identifier(contactId, "contactId");
    await this.getContact(actor, organization, id);
    return (await this.requireRepository().listPipelineHistory(organization, id))
      .filter((entry) => entry.organizationId === organization && entry.contactId === id)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(clone);
  }

  async addNote(actor: CrmActor, input: AddCrmNoteInput): Promise<CrmNote> {
    const organizationId = identifier(input.organizationId, "organizationId");
    const contactId = identifier(input.contactId, "contactId");
    assertActor(actor, organizationId);
    await this.getContact(actor, organizationId, contactId);
    const note: CrmNote = {
      id: this.#generateId("note"),
      organizationId,
      contactId,
      body: text(input.body, "body", 10_000),
      authorId: identifier(actor.userId, "actor userId"),
      createdAt: nowIso(this.#clock),
    };
    const saved = await this.requireRepository().appendNote(note);
    assertTenant(saved, organizationId);
    await this.requireRepository().appendHistory({
      id: this.#generateId("history"),
      organizationId,
      contactId,
      kind: "note",
      eventId: null,
      sessionId: null,
      title: "Note added",
      detail: note.body,
      occurredAt: note.createdAt,
      metadata: { noteId: note.id },
    });
    return clone(saved);
  }
  async addProspectNote(actor: CrmActor, input: AddCrmNoteInput): Promise<CrmNote> {
    return this.addNote(actor, input);
  }

  async listNotes(
    actor: CrmActor,
    organizationId: string,
    contactId: string,
  ): Promise<readonly CrmNote[]> {
    const organization = identifier(organizationId, "organizationId");
    const id = identifier(contactId, "contactId");
    await this.getContact(actor, organization, id);
    return (await this.requireRepository().listNotes(organization, id))
      .filter((note) => note.organizationId === organization && note.contactId === id)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(clone);
  }

  async addContactToEvent(
    actor: CrmActor,
    input: AddContactToEventInput,
  ): Promise<{ readonly projection: CrmEventProjection; readonly idempotent: boolean }> {
    const organizationId = identifier(input.organizationId, "organizationId");
    const contactId = identifier(input.contactId, "contactId");
    const eventId = identifier(input.eventId, "eventId");
    const key = text(input.idempotencyKey, "idempotencyKey", 512);
    const role = eventRole(input.role);
    assertActor(actor, organizationId);
    await this.getContact(actor, organizationId, contactId);
    return this.runIdempotent(`event:${organizationId}:${key}`, async () => {
      const repository = this.requireRepository();
      const prior = await repository.getCommandResult<{
        readonly projection: CrmEventProjection;
        readonly idempotent: boolean;
      }>(organizationId, "add-to-event", key);
      if (prior !== null) {
        if (prior.projection.contactId !== contactId || prior.projection.eventId !== eventId) {
          throw conflict(
            "The add-to-event idempotency key was already used for another projection.",
          );
        }
        return { projection: clone(prior.projection), idempotent: true };
      }
      const existing = await repository.getProjection(organizationId, eventId, contactId);
      if (existing !== null) {
        if (existing.role !== role || existing.sessionId !== (input.sessionId ?? null))
          throw conflict("The contact is already projected to this event with another role.");
        const result = { projection: clone(existing), idempotent: true };
        await repository.saveCommandResult(organizationId, "add-to-event", key, result);
        return result;
      }
      const createdAt = nowIso(this.#clock);
      const projection: CrmEventProjection = {
        id: this.#generateId("event-contact"),
        organizationId,
        eventId,
        contactId,
        sessionId:
          input.sessionId === undefined || input.sessionId === null
            ? null
            : identifier(input.sessionId, "sessionId"),
        role,
        note: optionalText(input.note, "note", 2_000) ?? null,
        createdBy: identifier(actor.userId, "actor userId"),
        createdAt,
        updatedAt: createdAt,
      };
      const saved = await repository.saveProjection(projection);
      assertTenant(saved, organizationId);
      if (saved.id !== projection.id) {
        if (saved.role !== role || saved.sessionId !== (input.sessionId ?? null))
          throw conflict("The contact is already projected to this event with another role.");
        const result = { projection: clone(saved), idempotent: true };
        await repository.saveCommandResult(organizationId, "add-to-event", key, result);
        return result;
      }
      await repository.appendHistory({
        id: this.#generateId("history"),
        organizationId,
        contactId,
        kind: "event",
        eventId,
        sessionId: saved.sessionId,
        title: "Added to event",
        detail: saved.note,
        occurredAt: createdAt,
        metadata: { role: saved.role, projectionId: saved.id },
      });
      const result = { projection: clone(saved), idempotent: false };
      await repository.saveCommandResult(organizationId, "add-to-event", key, result);
      return result;
    });
  }

  async addToEvent(actor: CrmActor, input: AddContactToEventInput): Promise<CrmEventProjection> {
    return (await this.addContactToEvent(actor, input)).projection;
  }
  async addToEventProjection(
    actor: CrmActor,
    input: AddContactToEventInput,
  ): Promise<CrmEventProjection> {
    return this.addToEvent(actor, input);
  }

  async sendPersonalizedOutreach(
    actor: CrmActor,
    input: SendCrmOutreachInput,
  ): Promise<CrmOutreachCommand> {
    const organizationId = identifier(input.organizationId, "organizationId");
    const contactId = identifier(input.contactId, "contactId");
    const key = text(input.idempotencyKey, "idempotencyKey", 512);
    assertActor(actor, organizationId);
    const contact = await this.getContact(actor, organizationId, contactId);
    if (input.eventId !== undefined && input.eventId !== null) identifier(input.eventId, "eventId");
    if (input.segmentId !== undefined && input.segmentId !== null)
      await this.getSegment(actor, organizationId, input.segmentId);
    const subject = text(input.subject, "subject", 500);
    const body = text(input.body, "body", 20_000);
    return this.runIdempotent(`outreach:${organizationId}:${key}`, async () => {
      const repository = this.requireRepository();
      const prior = await repository.getOutreachByIdempotencyKey(organizationId, key);
      if (prior !== null) {
        if (prior.contactId !== contactId || prior.subject !== subject || prior.body !== body)
          throw conflict("The outreach idempotency key was already used for another message.");
        return clone(prior);
      }
      const renderedBody = this.render(body, contact, input.variables);
      let command: CrmOutreachCommand = {
        id: this.#generateId("outreach"),
        organizationId,
        contactId,
        eventId: input.eventId ?? null,
        subject,
        body,
        renderedBody,
        status: "queued",
        idempotencyKey: key,
        createdBy: identifier(actor.userId, "actor userId"),
        createdAt: nowIso(this.#clock),
      };
      if (this.#outreach !== undefined) {
        const sent = await this.#outreach.send(clone(command));
        if (sent !== undefined) {
          assertTenant(sent, organizationId);
          command = sent;
        } else {
          command = { ...command, status: "sent" };
        }
      }
      const saved = await repository.saveOutreach(command);
      assertTenant(saved, organizationId);
      await repository.saveCommandResult(organizationId, "outreach", key, saved);
      return clone(saved);
    });
  }

  async outreach(actor: CrmActor, input: SendCrmOutreachInput): Promise<CrmOutreachCommand> {
    return this.sendPersonalizedOutreach(actor, input);
  }
  async sendOutreach(actor: CrmActor, input: SendCrmOutreachInput): Promise<CrmOutreachCommand> {
    return this.sendPersonalizedOutreach(actor, input);
  }

  async analytics(actor: CrmActor, organizationId = actor.organizationId): Promise<CrmAnalytics> {
    const organization = identifier(organizationId, "organizationId");
    assertActor(actor, organization);
    const contacts = await this.listContacts(actor, organization, { limit: 500 });
    const projections = (await this.requireRepository().listProjections(organization)).filter(
      (projection) => projection.organizationId === organization,
    );
    const stageCounts = Object.fromEntries(
      PIPELINE_STAGES.map((candidate) => [candidate, 0]),
    ) as Record<CrmPipelineStage, number>;
    const sourceCounts = Object.fromEntries(
      CONTACT_SOURCES.map((candidate) => [candidate, 0]),
    ) as Record<CrmContactSource, number>;
    for (const contact of contacts) {
      stageCounts[contact.pipelineStage] += 1;
      sourceCounts[contact.source] += 1;
    }
    const eventCounts = new Map<string, number>();
    for (const projection of projections)
      eventCounts.set(projection.eventId, (eventCounts.get(projection.eventId) ?? 0) + 1);
    const repository = this.requireRepository();
    const outreach =
      repository.listOutreach === undefined ? [] : await repository.listOutreach(organization);
    const outreachCounts = { queued: 0, sent: 0, failed: 0 };
    for (const command of outreach.filter((candidate) => candidate.organizationId === organization))
      outreachCounts[command.status] += 1;
    return {
      organizationId: organization,
      totalContacts: contacts.length,
      activeContacts: contacts.filter((contact) => contact.status === "active").length,
      contactsByPipelineStage: stageCounts,
      contactsByEvent: [...eventCounts.entries()]
        .map(([eventId, count]) => ({ eventId, count }))
        .sort((left, right) => left.eventId.localeCompare(right.eventId)),
      contactsBySource: sourceCounts,
      outreach: outreachCounts,
      generatedAt: nowIso(this.#clock),
    };
  }

  async getAnalytics(
    actor: CrmActor,
    organizationId = actor.organizationId,
  ): Promise<CrmAnalytics> {
    return this.analytics(actor, organizationId);
  }
  async aggregateAnalytics(
    actor: CrmActor,
    organizationId = actor.organizationId,
  ): Promise<CrmAnalytics> {
    return this.analytics(actor, organizationId);
  }

  private buildContact(
    organizationId: string,
    input: CrmContactInput,
    current: CrmContact | undefined,
    fallbackSource: CrmContactSource,
  ): CrmContact {
    const firstName = input.firstName === undefined ? current?.firstName : input.firstName;
    const lastName = input.lastName === undefined ? current?.lastName : input.lastName;
    const displayName = input.displayName === undefined ? current?.displayName : input.displayName;
    const nameInput: CrmContactInput = {
      ...(firstName === undefined ? {} : { firstName }),
      ...(lastName === undefined ? {} : { lastName }),
      ...(displayName === undefined ? {} : { displayName }),
    };
    let name: {
      readonly firstName: string | null;
      readonly lastName: string | null;
      readonly displayName: string;
    };
    try {
      name = normalizedName(nameInput);
    } catch (error) {
      if (input.email === undefined && current === undefined) throw error;
      const email = input.email === undefined ? current?.email : input.email;
      const fallback = nullableEmail(email);
      if (fallback === undefined || fallback === null) throw error;
      name = { firstName: null, lastName: null, displayName: fallback };
    }
    const contact: CrmContact = {
      id: current?.id ?? this.#generateId("contact"),
      organizationId,
      firstName: name.firstName,
      lastName: name.lastName,
      displayName: name.displayName,
      email:
        input.email === undefined ? (current?.email ?? null) : (nullableEmail(input.email) ?? null),
      phone:
        input.phone === undefined
          ? (current?.phone ?? null)
          : (optionalText(input.phone, "phone", 100) ?? null),
      company:
        input.company === undefined
          ? (current?.company ?? null)
          : (optionalText(input.company, "company", 300) ?? null),
      title:
        input.title === undefined
          ? (current?.title ?? null)
          : (optionalText(input.title, "title", 300) ?? null),
      website:
        input.website === undefined
          ? (current?.website ?? null)
          : (optionalText(input.website, "website", 500) ?? null),
      linkedinUrl:
        input.linkedinUrl === undefined
          ? (current?.linkedinUrl ?? null)
          : (optionalText(input.linkedinUrl, "linkedinUrl", 500) ?? null),
      notes:
        input.notes === undefined
          ? (current?.notes ?? null)
          : (optionalText(input.notes, "notes", 10_000) ?? null),
      tags: input.tags === undefined ? (current?.tags ?? []) : normalizeTags(input.tags),
      customFields:
        input.customFields === undefined
          ? (current?.customFields ?? {})
          : normalizeCustomFields(input.customFields),
      source:
        input.source === undefined ? (current?.source ?? fallbackSource) : source(input.source),
      status: current?.status ?? "active",
      mergedIntoId: current?.mergedIntoId ?? null,
      pipelineStage:
        input.pipelineStage === undefined
          ? (current?.pipelineStage ?? "new")
          : stage(input.pipelineStage),
      version: current?.version ?? 1,
      createdAt: current?.createdAt ?? nowIso(this.#clock),
      updatedAt: nowIso(this.#clock),
    };
    if (contact.email === null && contact.displayName.length === 0)
      throw invalid("A contact needs an email or name.");
    return contact;
  }

  private async appendPipelineChange(
    actor: CrmActor,
    current: CrmContact,
    nextStage: CrmPipelineStage,
    createdAt: string,
    note: string | null,
  ): Promise<void> {
    const repository = this.requireRepository();
    const entry: CrmPipelineEntry = {
      id: this.#generateId("pipeline"),
      organizationId: current.organizationId,
      contactId: current.id,
      fromStage: current.pipelineStage,
      toStage: nextStage,
      note,
      actorId: identifier(actor.userId, "actor userId"),
      createdAt,
    };
    await repository.appendPipeline(entry);
    await repository.appendHistory({
      id: this.#generateId("history"),
      organizationId: current.organizationId,
      contactId: current.id,
      kind: "pipeline",
      eventId: null,
      sessionId: null,
      title: `Pipeline stage changed to ${nextStage}`,
      detail: note,
      occurredAt: createdAt,
      metadata: { fromStage: current.pipelineStage, toStage: nextStage },
    });
  }

  private render(
    body: string,
    contact: CrmContact,
    variables: Readonly<Record<string, string>> | undefined,
  ): string {
    const values: Record<string, string> = {
      firstName: contact.firstName ?? "",
      lastName: contact.lastName ?? "",
      displayName: contact.displayName,
      email: contact.email ?? "",
      company: contact.company ?? "",
      title: contact.title ?? "",
      ...(variables ?? {}),
    };
    return body.replace(
      /\{\{\s*([A-Za-z][A-Za-z0-9_.-]{0,99})\s*\}\}/gu,
      (_match, key: string) => values[key] ?? "",
    );
  }

  private requireRepository(): CrmRepository {
    if (this.#repository === undefined) throw dependencyUnavailable();
    return this.#repository;
  }

  private async runIdempotent<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const active = this.#locks.get(key) as Promise<T> | undefined;
    if (active !== undefined) return clone(await active);
    const running = operation();
    this.#locks.set(key, running);
    try {
      return clone(await running);
    } finally {
      if (this.#locks.get(key) === running) this.#locks.delete(key);
    }
  }
}

/** Deterministic repository used by unit tests. It enforces organization on every read/write. */
export class InMemoryCrmRepository implements CrmRepository {
  readonly #contacts = new Map<string, CrmContact>();
  readonly #segments = new Map<string, CrmSegment>();
  readonly #history: CrmHistoryEntry[] = [];
  readonly #pipeline: CrmPipelineEntry[] = [];
  readonly #notes: CrmNote[] = [];
  readonly #projections = new Map<string, CrmEventProjection>();
  readonly #outreach = new Map<string, CrmOutreachCommand>();
  readonly #imports = new Map<string, CrmImportResult>();
  readonly #commands = new Map<string, unknown>();

  constructor(seed: CrmRepositorySeed = {}) {
    for (const contact of seed.contacts ?? [])
      this.#contacts.set(this.contactKey(contact.organizationId, contact.id), clone(contact));
    for (const segment of seed.segments ?? [])
      this.#segments.set(this.segmentKey(segment.organizationId, segment.id), clone(segment));
    this.#history.push(...(seed.history ?? []).map(clone));
    this.#pipeline.push(...(seed.pipeline ?? []).map(clone));
    this.#notes.push(...(seed.notes ?? []).map(clone));
    for (const projection of seed.projections ?? [])
      this.#projections.set(
        this.projectionKey(projection.organizationId, projection.eventId, projection.contactId),
        clone(projection),
      );
    for (const command of seed.outreach ?? [])
      this.#outreach.set(
        this.commandKey(command.organizationId, command.idempotencyKey),
        clone(command),
      );
    for (const result of seed.imports ?? [])
      if (result.idempotencyKey !== undefined)
        this.#imports.set(
          this.commandKey(result.organizationId, result.idempotencyKey),
          clone(result),
        );
  }

  async listContacts(
    organizationId: string,
    filter: CrmRepositoryFilter = {},
  ): Promise<readonly CrmContact[]> {
    const normalizedQuery = filter.query?.toLowerCase();
    return [...this.#contacts.values()]
      .filter((contact) => {
        if (contact.organizationId !== organizationId) return false;
        if (filter.email !== undefined && contact.email !== filter.email) return false;
        if (filter.status !== undefined && contact.status !== filter.status) return false;
        if (filter.pipelineStage !== undefined && contact.pipelineStage !== filter.pipelineStage)
          return false;
        if (
          filter.company !== undefined &&
          !(contact.company ?? "").toLowerCase().includes(filter.company.toLowerCase())
        )
          return false;
        if (filter.tags !== undefined && !filter.tags.every((tag) => contact.tags.includes(tag)))
          return false;
        if (
          normalizedQuery !== undefined &&
          ![
            contact.displayName,
            contact.email ?? "",
            contact.company ?? "",
            contact.title ?? "",
            contact.phone ?? "",
          ].some((value) => value.toLowerCase().includes(normalizedQuery))
        )
          return false;
        return true;
      })
      .sort((left, right) => left.displayName.localeCompare(right.displayName))
      .map(clone);
  }

  async getContact(organizationId: string, contactId: string): Promise<CrmContact | null> {
    const contact = this.#contacts.get(this.contactKey(organizationId, contactId));
    return contact === undefined ? null : clone(contact);
  }

  async findContactByEmail(organizationId: string, email: string): Promise<CrmContact | null> {
    const normalized = email.toLowerCase();
    const found = [...this.#contacts.values()].find(
      (contact) =>
        contact.organizationId === organizationId &&
        contact.email?.toLowerCase() === normalized &&
        contact.status === "active",
    );
    return found === undefined ? null : clone(found);
  }

  async saveContact(contact: CrmContact, expectedVersion: number | null): Promise<CrmContact> {
    const key = this.contactKey(contact.organizationId, contact.id);
    const existing = this.#contacts.get(key);
    if (expectedVersion === null ? existing !== undefined : existing?.version !== expectedVersion)
      throw new CrmRepositoryConflictError();
    this.#contacts.set(key, clone(contact));
    return clone(contact);
  }

  async listSegments(organizationId: string): Promise<readonly CrmSegment[]> {
    return [...this.#segments.values()]
      .filter((segment) => segment.organizationId === organizationId)
      .map(clone);
  }

  async getSegment(organizationId: string, segmentId: string): Promise<CrmSegment | null> {
    const segment = this.#segments.get(this.segmentKey(organizationId, segmentId));
    return segment === undefined ? null : clone(segment);
  }

  async saveSegment(segment: CrmSegment, expectedVersion: number | null): Promise<CrmSegment> {
    const key = this.segmentKey(segment.organizationId, segment.id);
    const existing = this.#segments.get(key);
    if (expectedVersion === null ? existing !== undefined : existing?.version !== expectedVersion)
      throw new CrmRepositoryConflictError();
    this.#segments.set(key, clone(segment));
    return clone(segment);
  }

  async deleteSegment(
    organizationId: string,
    segmentId: string,
    expectedVersion: number,
  ): Promise<void> {
    const key = this.segmentKey(organizationId, segmentId);
    const existing = this.#segments.get(key);
    if (existing?.version !== expectedVersion) throw new CrmRepositoryConflictError();
    this.#segments.delete(key);
  }

  async listHistory(
    organizationId: string,
    contactId: string,
  ): Promise<readonly CrmHistoryEntry[]> {
    return this.#history
      .filter((entry) => entry.organizationId === organizationId && entry.contactId === contactId)
      .map(clone);
  }

  async appendHistory(entry: CrmHistoryEntry): Promise<CrmHistoryEntry> {
    this.#history.push(clone(entry));
    return clone(entry);
  }

  async listPipelineHistory(
    organizationId: string,
    contactId: string,
  ): Promise<readonly CrmPipelineEntry[]> {
    return this.#pipeline
      .filter((entry) => entry.organizationId === organizationId && entry.contactId === contactId)
      .map(clone);
  }

  async appendPipeline(entry: CrmPipelineEntry): Promise<CrmPipelineEntry> {
    this.#pipeline.push(clone(entry));
    return clone(entry);
  }

  async listNotes(organizationId: string, contactId: string): Promise<readonly CrmNote[]> {
    return this.#notes
      .filter((note) => note.organizationId === organizationId && note.contactId === contactId)
      .map(clone);
  }

  async appendNote(note: CrmNote): Promise<CrmNote> {
    this.#notes.push(clone(note));
    return clone(note);
  }

  async getProjection(
    organizationId: string,
    eventId: string,
    contactId: string,
  ): Promise<CrmEventProjection | null> {
    const projection = this.#projections.get(
      this.projectionKey(organizationId, eventId, contactId),
    );
    return projection === undefined ? null : clone(projection);
  }

  async saveProjection(projection: CrmEventProjection): Promise<CrmEventProjection> {
    const key = this.projectionKey(
      projection.organizationId,
      projection.eventId,
      projection.contactId,
    );
    const existing = this.#projections.get(key);
    if (existing !== undefined) return clone(existing);
    this.#projections.set(key, clone(projection));
    return clone(projection);
  }

  async listProjections(organizationId: string): Promise<readonly CrmEventProjection[]> {
    return [...this.#projections.values()]
      .filter((projection) => projection.organizationId === organizationId)
      .map(clone);
  }

  async saveOutreach(command: CrmOutreachCommand): Promise<CrmOutreachCommand> {
    const key = this.commandKey(command.organizationId, command.idempotencyKey);
    const existing = this.#outreach.get(key);
    if (existing !== undefined) return clone(existing);
    this.#outreach.set(key, clone(command));
    return clone(command);
  }

  async getOutreachByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<CrmOutreachCommand | null> {
    const command = this.#outreach.get(this.commandKey(organizationId, idempotencyKey));
    return command === undefined ? null : clone(command);
  }

  async listOutreach(organizationId: string): Promise<readonly CrmOutreachCommand[]> {
    return [...this.#outreach.values()]
      .filter((command) => command.organizationId === organizationId)
      .map(clone);
  }

  async saveImport(result: CrmImportResult): Promise<CrmImportResult> {
    if (result.idempotencyKey !== undefined)
      this.#imports.set(
        this.commandKey(result.organizationId, result.idempotencyKey),
        clone(result),
      );
    return clone(result);
  }

  async getImportByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<CrmImportResult | null> {
    const result = this.#imports.get(this.commandKey(organizationId, idempotencyKey));
    return result === undefined ? null : clone(result);
  }

  async getCommandResult<T>(
    organizationId: string,
    command: string,
    key: string,
  ): Promise<T | null> {
    const value = this.#commands.get(this.commandKey(organizationId, `${command}:${key}`));
    return value === undefined ? null : clone(value as T);
  }

  async saveCommandResult<T>(
    organizationId: string,
    command: string,
    key: string,
    value: T,
  ): Promise<void> {
    this.#commands.set(this.commandKey(organizationId, `${command}:${key}`), clone(value));
  }

  private contactKey(organizationId: string, contactId: string): string {
    return `${organizationId}\u0000${contactId}`;
  }
  private segmentKey(organizationId: string, segmentId: string): string {
    return `${organizationId}\u0000${segmentId}`;
  }
  private projectionKey(organizationId: string, eventId: string, contactId: string): string {
    return `${organizationId}\u0000${eventId}\u0000${contactId}`;
  }
  private commandKey(organizationId: string, key: string): string {
    return `${organizationId}\u0000${key}`;
  }
}

export type InMemoryAirtableCrmRepository = InMemoryCrmRepository;
