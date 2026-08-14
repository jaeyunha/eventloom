import {
  type CreateReportDefinitionInput,
  REPORT_FIELD_ALLOWLIST,
  type ReportActor,
  type ReportDataRepository,
  type ReportDefinition,
  type ReportDefinitionRepository,
  type ReportExport,
  type ReportExporter,
  type ReportExportInput,
  type ReportFieldSelector,
  type ReportFilter,
  type ReportFormat,
  type ReportProgramRecord,
  type ReportRelationship,
  type ReportRepository,
  type ReportRepositoryScope,
  type ReportRun,
  type ReportRunRepository,
  type ReportServiceOptions,
  type ReportSort,
  type UpdateReportDefinitionInput,
} from "./types";

export type ReportErrorCode =
  | "REPORT_INVALID_INPUT"
  | "REPORT_FORBIDDEN"
  | "REPORT_NOT_FOUND"
  | "REPORT_CONFLICT"
  | "REPORT_EXPORT_UNAVAILABLE";

export class ReportError extends Error {
  readonly status: 400 | 403 | 404 | 409 | 503;
  readonly code: ReportErrorCode;

  constructor(code: ReportErrorCode, message: string, status: 400 | 403 | 404 | 409 | 503) {
    super(message);
    this.name = "ReportError";
    this.code = code;
    this.status = status;
  }
}

export function reportInvalidInput(message: string): ReportError {
  return new ReportError("REPORT_INVALID_INPUT", message, 400);
}

export function reportForbidden(message = "Report access is not allowed."): ReportError {
  return new ReportError("REPORT_FORBIDDEN", message, 403);
}

export function reportNotFound(message = "The report was not found."): ReportError {
  return new ReportError("REPORT_NOT_FOUND", message, 404);
}

export function reportConflict(
  message = "The report has changed; refresh and try again.",
): ReportError {
  return new ReportError("REPORT_CONFLICT", message, 409);
}

export function reportExportUnavailable(
  message = "The report export is unavailable.",
): ReportError {
  return new ReportError("REPORT_EXPORT_UNAVAILABLE", message, 503);
}

interface ParsedField {
  readonly key: string;
  readonly relationship: ReportRelationship;
  readonly field: string;
  readonly personal: boolean;
}

interface ReportSpec {
  readonly eventId: string;
  readonly name: string;
  readonly description: string;
  readonly relationships: readonly ReportRelationship[];
  readonly fields: readonly string[];
  readonly order: readonly string[];
  readonly filters: readonly ReportFilter[];
  readonly sort: readonly ReportSort[];
}

export interface RunReportInput {
  readonly format?: ReportFormat;
  readonly expectedVersion?: number;
  readonly parameters?: Readonly<Record<string, unknown>>;
  readonly evaluationPlanId?: string;
  readonly evaluationPlanVersion?: number;
}

const relationshipAliases: Readonly<Record<string, ReportRelationship>> = {
  session: "sessions",
  sessions: "sessions",
  participant: "participants",
  participants: "participants",
  speaker: "speakers",
  speakers: "speakers",
  evaluation: "evaluationProgress",
  evaluations: "evaluationProgress",
  evaluationprogress: "evaluationProgress",
  "evaluation-progress": "evaluationProgress",
  evaluation_progress: "evaluationProgress",
  evaluationProgress: "evaluationProgress",
};
const fieldAliases: Readonly<Record<ReportRelationship, Readonly<Record<string, string>>>> = {
  sessions: {
    name: "title",
    startAt: "startsAt",
    endAt: "endsAt",
  },
  participants: {
    name: "displayName",
  },
  speakers: {
    name: "displayName",
  },
  evaluationProgress: {
    evaluationPlanId: "planId",
    evaluationPlanName: "planName",
    version: "planVersion",
    completion: "completionPercent",
    completed: "submitted",
  },
};

const filterOperators = new Set<ReportFilter["operator"]>([
  "eq",
  "neq",
  "contains",
  "startsWith",
  "endsWith",
  "in",
  "gt",
  "gte",
  "lt",
  "lte",
  "isNull",
  "isNotNull",
]);

function canonicalRelationship(value: string): ReportRelationship {
  const key = value.trim();
  const relationship = relationshipAliases[key] ?? relationshipAliases[key.toLowerCase()];
  if (relationship === undefined) {
    throw reportInvalidInput(`The relationship '${value}' is not available in program reports.`);
  }
  return relationship;
}

function requireText(value: string, field: string, maximum: number, allowEmpty = false): string {
  if (typeof value !== "string") {
    throw reportInvalidInput(`${field} must be text.`);
  }
  const normalized = value.trim();
  if ((!allowEmpty && normalized.length === 0) || normalized.length > maximum) {
    throw reportInvalidInput(
      allowEmpty
        ? `${field} cannot exceed ${maximum} characters.`
        : `${field} must contain between 1 and ${maximum} characters.`,
    );
  }
  return normalized;
}

function parseField(selector: ReportFieldSelector): ParsedField {
  let relationshipValue: string;
  let fieldValue: string;
  if (typeof selector === "string") {
    const parts = selector.trim().split(".");
    if (parts.length !== 2 || parts[0] === undefined || parts[1] === undefined) {
      throw reportInvalidInput(
        `Report fields must use relationship.field notation: '${selector}'.`,
      );
    }
    relationshipValue = parts[0];
    fieldValue = parts[1];
  } else if (
    selector !== null &&
    typeof selector === "object" &&
    typeof selector.relationship === "string" &&
    typeof selector.field === "string"
  ) {
    relationshipValue = selector.relationship;
    fieldValue = selector.field;
  } else {
    throw reportInvalidInput("Each report field must identify a relationship and field.");
  }

  const relationship = canonicalRelationship(relationshipValue);
  const requestedField = fieldValue.trim();
  const field = fieldAliases[relationship][requestedField] ?? requestedField;
  const allowlisted = (REPORT_FIELD_ALLOWLIST[relationship] as readonly string[]).includes(field);
  if (!allowlisted) {
    throw reportInvalidInput(
      `The field '${relationship}.${field}' is not available in program reports.`,
    );
  }
  const key = `${relationship}.${field}`;
  return {
    key,
    relationship,
    field,
    personal: (relationship === "participants" || relationship === "speakers") && field === "email",
  };
}

function normalizeRelationships(values: readonly string[]): readonly ReportRelationship[] {
  if (!Array.isArray(values) || values.length === 0) {
    throw reportInvalidInput("At least one report relationship is required.");
  }
  const normalized: ReportRelationship[] = [];
  const seen = new Set<ReportRelationship>();
  for (const value of values) {
    const relationship = canonicalRelationship(value);
    if (!seen.has(relationship)) {
      seen.add(relationship);
      normalized.push(relationship);
    }
  }
  return normalized;
}

function normalizeFields(
  values: readonly ReportFieldSelector[],
  relationships: readonly ReportRelationship[],
): readonly string[] {
  if (!Array.isArray(values) || values.length === 0) {
    throw reportInvalidInput("At least one report field is required.");
  }
  const relationshipSet = new Set(relationships);
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const parsed = parseField(value);
    if (!relationshipSet.has(parsed.relationship)) {
      throw reportInvalidInput(`The field '${parsed.key}' uses an unselected relationship.`);
    }
    if (!seen.has(parsed.key)) {
      seen.add(parsed.key);
      normalized.push(parsed.key);
    }
  }
  return normalized;
}

function normalizeOrder(
  values: readonly ReportFieldSelector[] | undefined,
  fields: readonly string[],
): readonly string[] {
  const source = values === undefined ? fields : values;
  const normalized: string[] = [];
  const fieldSet = new Set(fields);
  const seen = new Set<string>();
  for (const value of source) {
    const parsed = parseField(value);
    if (!fieldSet.has(parsed.key)) {
      throw reportInvalidInput(
        `The report column order contains '${parsed.key}', which is not selected.`,
      );
    }
    if (!seen.has(parsed.key)) {
      seen.add(parsed.key);
      normalized.push(parsed.key);
    }
  }
  // An omitted column order means the fields' declaration order. Explicit partial order is
  // useful for callers that only care about the leading columns; append the rest deterministically.
  for (const field of fields) {
    if (!seen.has(field)) normalized.push(field);
  }
  if (normalized.length === 0) throw reportInvalidInput("At least one report column is required.");
  return normalized;
}

function normalizeFilters(
  values: readonly ReportFilter[] | undefined,
  relationships: readonly ReportRelationship[],
): readonly ReportFilter[] {
  const normalized: ReportFilter[] = [];
  const relationshipSet = new Set(relationships);
  for (const filter of values ?? []) {
    if (filter === null || typeof filter !== "object") {
      throw reportInvalidInput("Report filters must be objects.");
    }
    const parsed = parseField(filter.field);
    if (!relationshipSet.has(parsed.relationship)) {
      throw reportInvalidInput(`The filter field '${parsed.key}' uses an unselected relationship.`);
    }
    if (!filterOperators.has(filter.operator)) {
      throw reportInvalidInput(
        `The filter operator '${String(filter.operator)}' is not supported.`,
      );
    }
    if (
      (filter.operator === "in" && !Array.isArray(filter.value)) ||
      ((filter.operator === "isNull" || filter.operator === "isNotNull") &&
        filter.value !== undefined)
    ) {
      throw reportInvalidInput(`The value for '${filter.operator}' is invalid.`);
    }
    assertSerializable(filter.value, "Report filter values");
    normalized.push(
      filter.value === undefined
        ? { field: parsed.key, operator: filter.operator }
        : { field: parsed.key, operator: filter.operator, value: stableClone(filter.value) },
    );
  }
  return normalized;
}

function normalizeSort(
  values: readonly ReportSort[] | undefined,
  relationships: readonly ReportRelationship[],
): readonly ReportSort[] {
  const normalized: ReportSort[] = [];
  const relationshipSet = new Set(relationships);
  const seen = new Set<string>();
  for (const sort of values ?? []) {
    if (sort === null || typeof sort !== "object") {
      throw reportInvalidInput("Report sorting must be objects.");
    }
    const parsed = parseField(sort.field);
    if (!relationshipSet.has(parsed.relationship)) {
      throw reportInvalidInput(`The sort field '${parsed.key}' uses an unselected relationship.`);
    }
    if (sort.direction !== "asc" && sort.direction !== "desc") {
      throw reportInvalidInput("Report sort direction must be asc or desc.");
    }
    if (!seen.has(parsed.key)) {
      seen.add(parsed.key);
      normalized.push({ field: parsed.key, direction: sort.direction });
    }
  }
  return normalized;
}

function buildSpec(
  input: CreateReportDefinitionInput | UpdateReportDefinitionInput,
  existing?: ReportDefinition,
): ReportSpec {
  const eventId = requireText(input.eventId ?? existing?.eventId ?? "", "Event id", 200);
  const relationships = normalizeRelationships(
    input.relationships ?? existing?.relationships ?? [],
  );
  const fields = normalizeFields(input.fields ?? existing?.fields ?? [], relationships);
  const order = normalizeOrder(
    input.order ??
      (existing === undefined || input.fields !== undefined ? undefined : existing.order),
    fields,
  );
  const filters = normalizeFilters(input.filters ?? existing?.filters, relationships);
  const sort = normalizeSort(input.sort ?? existing?.sort, relationships);
  const name = requireText(input.name ?? existing?.name ?? "", "Report name", 200);
  const description = requireText(
    input.description ?? existing?.description ?? "",
    "Report description",
    2_000,
    true,
  );
  return { eventId, name, description, relationships, fields, order, filters, sort };
}

function assertSerializable(value: unknown, label: string, seen = new Set<object>()): void {
  if (
    value === undefined ||
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  )
    return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw reportInvalidInput(`${label} must contain finite numbers.`);
    return;
  }
  if (typeof value !== "object") throw reportInvalidInput(`${label} must be JSON-compatible.`);
  if (seen.has(value)) throw reportInvalidInput(`${label} cannot contain circular values.`);
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) assertSerializable(item, label, seen);
  } else {
    for (const [key, item] of Object.entries(value)) {
      if (key.length > 500) throw reportInvalidInput(`${label} contains an invalid key.`);
      assertSerializable(item, label, seen);
    }
  }
  seen.delete(value);
}

function stableClone<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => stableClone(item)) as T;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value as object).sort()) {
    output[key] = stableClone((value as Record<string, unknown>)[key]);
  }
  return output as T;
}

function stableSerialize(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableSerialize((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function digest(value: string): string {
  // A deterministic, non-cryptographic digest is sufficient for export identity. The content
  // itself remains the audit source; callers needing tamper evidence can wrap the exporter.
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function csvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return stableSerialize(value);
}

/** Prefixes potentially executable spreadsheet values while preserving ordinary numeric cells. */
export function neutralizeSpreadsheetFormula(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return /^[\t\r\n ]*[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: unknown): string {
  const normalized = csvValue(neutralizeSpreadsheetFormula(value));
  return /[",\r\n]/.test(normalized) ? `"${normalized.replaceAll('"', '""')}"` : normalized;
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function spreadsheetXmlCell(value: unknown): string {
  const safe = neutralizeSpreadsheetFormula(value);
  const text = xmlEscape(csvValue(safe));
  const type = typeof safe === "number" && Number.isFinite(safe) ? "Number" : "String";
  return `<Cell><Data ss:Type="${type}">${text}</Data></Cell>`;
}

export class SafeReportExporter implements ReportExporter {
  export(input: ReportExportInput): ReportExport {
    const columns = input.columns.map((column) => String(column));
    const safeRows = input.rows.map((row) => row.map((value) => value));
    let body: string;
    let contentType: string;
    if (input.format === "csv") {
      body = [
        columns.map(csvCell).join(","),
        ...safeRows.map((row) => row.map(csvCell).join(",")),
      ].join("\r\n");
      contentType = "text/csv; charset=utf-8";
    } else {
      // SpreadsheetML is deterministic, UTF-8, and directly consumable by Excel/LibreOffice;
      // it avoids a runtime ZIP dependency while preserving an XLSX-compatible table contract.
      const header = `<Row>${columns.map(spreadsheetXmlCell).join("")}</Row>`;
      const rows = safeRows
        .map((row) => `<Row>${row.map(spreadsheetXmlCell).join("")}</Row>`)
        .join("");
      body = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Report"><Table>${header}${rows}</Table></Worksheet></Workbook>`;
      contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    }
    return {
      format: input.format,
      fileName: input.fileName,
      contentType,
      body,
      content: body,
      columns,
      rowCount: safeRows.length,
      outputDigest: digest(body),
    };
  }
}

function hasEventGrant(actor: ReportActor, eventId: string): boolean {
  return (
    actor.grants?.some(
      (grant) =>
        grant.eventId === eventId && (grant.role === "organizer" || grant.role === "reporter"),
    ) ?? false
  );
}

function hasReadGrant(actor: ReportActor, eventId: string): boolean {
  if (actor.grants?.some((grant) => grant.eventId === eventId)) return true;
  return actor.eventIds?.includes(eventId) ?? false;
}

function canViewPersonalData(actor: ReportActor, eventId: string): boolean {
  if (actor.canViewPersonalData === true) return true;
  return (
    actor.grants?.some(
      (grant) => grant.eventId === eventId && grant.canViewPersonalData === true,
    ) ?? false
  );
}

function scope(tenantId: string, eventId: string): ReportRepositoryScope {
  return { tenantId, eventId };
}

function isReportDefinitionRepository(
  repository: unknown,
): repository is ReportDefinitionRepository & ReportRunRepository {
  return (
    typeof repository === "object" &&
    repository !== null &&
    typeof (repository as ReportDefinitionRepository).getDefinition === "function" &&
    typeof (repository as ReportRunRepository).recordRun === "function"
  );
}

function fieldParts(key: string): ParsedField {
  return parseField(key);
}

function valueFor(
  record: ReportProgramRecord,
  field: ParsedField,
  participant: Record<string, unknown> | null,
  speaker: Record<string, unknown> | null,
  progress: Record<string, unknown> | null,
): unknown {
  const source =
    field.relationship === "sessions"
      ? record.session
      : field.relationship === "participants"
        ? participant
        : field.relationship === "speakers"
          ? speaker
          : progress;
  if (source === null || source === undefined) return null;
  const value = source[field.field];
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}
function relationValues(
  record: ReportProgramRecord,
  relationship: ReportRelationship,
  selectedFields: readonly ParsedField[],
): readonly (Record<string, unknown> | null)[] {
  if (!selectedFields.some((field) => field.relationship === relationship)) return [null];
  if (relationship === "sessions") return [record.session as unknown as Record<string, unknown>];
  if (relationship === "participants") {
    const values = record.participants ?? [];
    return values.length === 0 ? [null] : values.map((value) => value as Record<string, unknown>);
  }
  if (relationship === "speakers") {
    const values = record.speakers ?? [];
    return values.length === 0 ? [null] : values.map((value) => value as Record<string, unknown>);
  }
  const value = record.evaluationProgress;
  if (value === null || value === undefined) return [null];
  const values = Array.isArray(value) ? value : [value];
  return values.length === 0 ? [null] : values.map((entry) => entry as Record<string, unknown>);
}

function comparisonValue(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") return value;
  return stableSerialize(value);
}

function compareValues(left: unknown, right: unknown): number {
  const a = comparisonValue(left);
  const b = comparisonValue(right);
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a < b ? -1 : a > b ? 1 : 0;
  const leftString = String(a);
  const rightString = String(b);
  return leftString < rightString ? -1 : leftString > rightString ? 1 : 0;
}

function matchesFilter(value: unknown, filter: ReportFilter): boolean {
  const expected = filter.value;
  switch (filter.operator) {
    case "eq":
      return stableSerialize(value) === stableSerialize(expected);
    case "neq":
      return stableSerialize(value) !== stableSerialize(expected);
    case "contains":
      return typeof value === "string" && typeof expected === "string" && value.includes(expected);
    case "startsWith":
      return (
        typeof value === "string" && typeof expected === "string" && value.startsWith(expected)
      );
    case "endsWith":
      return typeof value === "string" && typeof expected === "string" && value.endsWith(expected);
    case "in":
      return (
        Array.isArray(expected) &&
        expected.some((candidate) => stableSerialize(candidate) === stableSerialize(value))
      );
    case "gt":
      return compareValues(value, expected) > 0;
    case "gte":
      return compareValues(value, expected) >= 0;
    case "lt":
      return compareValues(value, expected) < 0;
    case "lte":
      return compareValues(value, expected) <= 0;
    case "isNull":
      return value === null || value === undefined;
    case "isNotNull":
      return value !== null && value !== undefined;
  }
}

interface MaterializedRow {
  readonly values: readonly unknown[];
  readonly key: string;
  readonly sortValues: readonly unknown[];
}

function slug(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.slice(0, 80) || "report";
}

export class ReportService {
  readonly #repository: ReportDefinitionRepository & ReportRunRepository;
  readonly #data: ReportDataRepository;
  readonly #exporter: ReportExporter;
  readonly #clock: () => Date;
  readonly #idGenerator: (prefix: "definition" | "run") => string;
  #definitionSequence = 0;
  #runSequence = 0;

  constructor(repository: ReportRepository, options?: ReportServiceOptions);
  constructor(
    repository: ReportRepository,
    exporter: ReportExporter,
    options?: ReportServiceOptions,
  );
  constructor(
    repository: ReportDefinitionRepository & ReportRunRepository,
    data: ReportDataRepository,
    options?: ReportServiceOptions,
  );
  constructor(
    repository: ReportDefinitionRepository & ReportRunRepository,
    data: ReportDataRepository,
    exporter?: ReportExporter,
    options?: ReportServiceOptions,
  );
  constructor(
    repository: ReportDefinitionRepository & ReportRunRepository,
    dataOrExporter?: ReportDataRepository | ReportExporter | ReportServiceOptions,
    exporterOrOptions?: ReportExporter | ReportServiceOptions,
    maybeOptions?: ReportServiceOptions,
  ) {
    if (!isReportDefinitionRepository(repository)) {
      throw new Error("A complete report repository is required.");
    }
    this.#repository = repository;
    const isData =
      dataOrExporter !== undefined &&
      typeof (dataOrExporter as ReportDataRepository).listProgramRecords === "function";
    if (
      !isData &&
      typeof (repository as unknown as ReportDataRepository).listProgramRecords !== "function"
    ) {
      throw new Error("A report data repository is required.");
    }
    const hasExporter =
      dataOrExporter !== undefined &&
      typeof (dataOrExporter as ReportExporter).export === "function";
    this.#data = isData
      ? (dataOrExporter as ReportDataRepository)
      : (repository as unknown as ReportDataRepository);
    this.#exporter = isData
      ? typeof (exporterOrOptions as ReportExporter | undefined)?.export === "function"
        ? (exporterOrOptions as ReportExporter)
        : new SafeReportExporter()
      : hasExporter
        ? (dataOrExporter as ReportExporter)
        : new SafeReportExporter();
    const options = isData
      ? (maybeOptions ?? (exporterOrOptions as ReportServiceOptions | undefined))
      : hasExporter
        ? (exporterOrOptions as ReportServiceOptions | undefined)
        : ((exporterOrOptions as ReportServiceOptions | undefined) ??
          (dataOrExporter as ReportServiceOptions | undefined));
    this.#clock = options?.clock ?? (() => new Date());
    this.#idGenerator =
      options?.idGenerator ??
      ((prefix) => {
        if (prefix === "definition") {
          this.#definitionSequence += 1;
          return `report-definition-${this.#definitionSequence}`;
        }
        this.#runSequence += 1;
        return `report-run-${this.#runSequence}`;
      });
  }

  async listDefinitions(
    actor: ReportActor,
    eventId?: string,
  ): Promise<readonly ReportDefinition[]> {
    if (eventId !== undefined) {
      requireReadAccess(actor, eventId);
      return (await this.#repository.listDefinitions(scope(actor.tenantId, eventId))).filter(
        (definition) => definition.tenantId === actor.tenantId && definition.eventId === eventId,
      );
    }
    const eventIds = authorizedEventIds(actor);
    const definitions: ReportDefinition[] = [];
    for (const id of eventIds) {
      definitions.push(
        ...(await this.#repository.listDefinitions(scope(actor.tenantId, id))).filter(
          (definition) => definition.tenantId === actor.tenantId && definition.eventId === id,
        ),
      );
    }
    return definitions.sort(
      (left, right) => left.eventId.localeCompare(right.eventId) || left.id.localeCompare(right.id),
    );
  }

  async createDefinition(
    actor: ReportActor,
    input: CreateReportDefinitionInput,
  ): Promise<ReportDefinition> {
    requireManageAccess(actor, input.eventId);
    const spec = buildSpec(input);
    const now = this.#clock().toISOString();
    const definition: ReportDefinition = {
      id: requireText(input.id ?? this.#idGenerator("definition"), "Report id", 200),
      tenantId: actor.tenantId,
      eventId: spec.eventId,
      name: spec.name,
      description: spec.description,
      relationships: spec.relationships,
      fields: spec.fields,
      order: spec.order,
      filters: spec.filters,
      sort: spec.sort,
      version: 1,
      createdBy: actor.userId,
      createdAt: now,
      updatedAt: now,
    };
    return this.#repository.createDefinition(definition);
  }
  async createReportDefinition(
    actor: ReportActor,
    input: CreateReportDefinitionInput,
  ): Promise<ReportDefinition> {
    return this.createDefinition(actor, input);
  }

  async getDefinition(actor: ReportActor, definitionId: string): Promise<ReportDefinition>;
  async getDefinition(
    actor: ReportActor,
    eventId: string,
    definitionId: string,
  ): Promise<ReportDefinition>;
  async getDefinition(
    actor: ReportActor,
    eventOrDefinitionId: string,
    maybeDefinitionId?: string,
  ): Promise<ReportDefinition> {
    const definition = await this.findDefinition(actor, eventOrDefinitionId, maybeDefinitionId);
    requireReadAccess(actor, definition.eventId);
    return definition;
  }

  async getReportDefinition(actor: ReportActor, definitionId: string): Promise<ReportDefinition> {
    return this.getDefinition(actor, definitionId);
  }

  async updateDefinition(
    actor: ReportActor,
    definitionId: string,
    input: UpdateReportDefinitionInput,
  ): Promise<ReportDefinition> {
    const existing =
      input.eventId === undefined
        ? await this.findDefinition(actor, definitionId)
        : await this.findDefinition(actor, input.eventId, definitionId);
    requireManageAccess(actor, existing.eventId);
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
      throw reportInvalidInput("expectedVersion must be a positive integer.");
    }
    if (existing.version !== input.expectedVersion) {
      throw reportConflict(
        `Report version ${input.expectedVersion} is stale; current version is ${existing.version}.`,
      );
    }
    const spec = buildSpec(input, existing);
    if (spec.eventId !== existing.eventId)
      throw reportForbidden("A report cannot move between events.");
    const now = this.#clock().toISOString();
    const next: ReportDefinition = {
      ...existing,
      name: spec.name,
      description: spec.description,
      relationships: spec.relationships,
      fields: spec.fields,
      order: spec.order,
      filters: spec.filters,
      sort: spec.sort,
      version: existing.version + 1,
      updatedAt: now,
    };
    return this.#repository.updateDefinition(
      scope(existing.tenantId, existing.eventId),
      existing.id,
      input.expectedVersion,
      next,
    );
  }
  async updateReportDefinition(
    actor: ReportActor,
    definitionId: string,
    input: UpdateReportDefinitionInput,
  ): Promise<ReportDefinition> {
    return this.updateDefinition(actor, definitionId, input);
  }

  async deleteDefinition(
    actor: ReportActor,
    definitionId: string,
    expectedVersion: number,
  ): Promise<void> {
    const existing = await this.findDefinition(actor, definitionId);
    requireManageAccess(actor, existing.eventId);
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      throw reportInvalidInput("expectedVersion must be a positive integer.");
    }
    if (existing.version !== expectedVersion) {
      throw reportConflict(
        `Report version ${expectedVersion} is stale; current version is ${existing.version}.`,
      );
    }
    await this.#repository.deleteDefinition(
      scope(existing.tenantId, existing.eventId),
      existing.id,
      expectedVersion,
    );
  }
  async deleteReportDefinition(
    actor: ReportActor,
    definitionId: string,
    expectedVersion: number,
  ): Promise<void> {
    return this.deleteDefinition(actor, definitionId, expectedVersion);
  }

  async runDefinition(
    actor: ReportActor,
    definitionId: string,
    input: RunReportInput = {},
  ): Promise<ReportRun> {
    const definition = await this.findDefinition(actor, definitionId);
    requireReadAccess(actor, definition.eventId);
    const expectedVersion = input.expectedVersion ?? definition.version;
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      throw reportInvalidInput("expectedVersion must be a positive integer.");
    }
    if (expectedVersion !== definition.version) {
      throw reportConflict(
        `Report version ${expectedVersion} is stale; current version is ${definition.version}.`,
      );
    }
    const format = input.format ?? "csv";
    if (format !== "csv" && format !== "xlsx")
      throw reportInvalidInput("Report format must be csv or xlsx.");
    assertSerializable(input.parameters, "Report run parameters");
    const runFilters: ReportFilter[] = [...definition.filters];
    if (input.evaluationPlanId !== undefined || input.evaluationPlanVersion !== undefined) {
      if (!definition.relationships.includes("evaluationProgress")) {
        throw reportInvalidInput("An evaluation plan selection requires evaluationProgress.");
      }
      if (input.evaluationPlanId !== undefined) {
        runFilters.push({
          field: "evaluationProgress.planId",
          operator: "eq",
          value: requireText(input.evaluationPlanId, "Evaluation plan id", 200),
        });
      }
      if (input.evaluationPlanVersion !== undefined) {
        runFilters.push({
          field: "evaluationProgress.planVersion",
          operator: "eq",
          value: input.evaluationPlanVersion,
        });
      }
    }

    const selectedFieldKeys = new Set<string>([
      ...definition.fields,
      ...definition.filters.map((filter) => String(filter.field)),
      ...definition.sort.map((sort) => String(sort.field)),
      ...runFilters.map((filter) => String(filter.field)),
    ]);
    const parsedFields = [...selectedFieldKeys].map(fieldParts);
    const personalDataAllowed = canViewPersonalData(actor, definition.eventId);
    const outputFields = definition.order
      .map(fieldParts)
      .filter((field) => !field.personal || personalDataAllowed);
    if (outputFields.length === 0)
      throw reportForbidden("No authorized report fields remain for this requester.");
    const requestedAt = this.#clock().toISOString();
    let records: readonly ReportProgramRecord[];
    try {
      records = (
        await this.#data.listProgramRecords({
          tenantId: actor.tenantId,
          eventId: definition.eventId,
          requesterId: actor.userId,
          relationships: definition.relationships,
          fields: [
            ...new Set([...definition.fields, ...runFilters.map((filter) => String(filter.field))]),
          ],
          includePersonalData: personalDataAllowed,
        })
      ).filter(
        (record) => record.tenantId === actor.tenantId && record.eventId === definition.eventId,
      );
    } catch (error) {
      if (error instanceof ReportError) throw error;
      throw reportExportUnavailable("The report data source is unavailable.");
    }
    const rows = materializeRows(
      records,
      parsedFields,
      outputFields,
      runFilters,
      definition.sort,
      personalDataAllowed,
    );
    const parameters = {
      format,
      expectedVersion,
      definitionId: definition.id,
      definitionVersion: definition.version,
      requestedFilters: runFilters,
      requestedSort: definition.sort,
      ...(input.parameters === undefined ? {} : { runParameters: stableClone(input.parameters) }),
      ...(input.evaluationPlanId === undefined ? {} : { evaluationPlanId: input.evaluationPlanId }),
      ...(input.evaluationPlanVersion === undefined
        ? {}
        : { evaluationPlanVersion: input.evaluationPlanVersion }),
    };
    const fileName = `${slug(definition.name)}-v${definition.version}.${format}`;
    let exported: ReportExport;
    try {
      exported = await this.#exporter.export({
        format,
        fileName,
        columns: outputFields.map((field) => field.key),
        rows: rows.map((row) => row.values.map((value) => neutralizeSpreadsheetFormula(value))),
      });
    } catch {
      throw reportExportUnavailable();
    }
    const completedAt = this.#clock().toISOString();
    const audit = {
      requesterId: actor.userId,
      tenantId: actor.tenantId,
      eventId: definition.eventId,
      definitionId: definition.id,
      definitionVersion: definition.version,
      parameters,
      requestedAt,
      completedAt,
      outputDigest: exported.outputDigest,
      rowCount: exported.rowCount,
    };
    const run: ReportRun = {
      id: this.#idGenerator("run"),
      tenantId: actor.tenantId,
      eventId: definition.eventId,
      definitionId: definition.id,
      definitionVersion: definition.version,
      requesterId: actor.userId,
      parameters,
      requestedAt,
      completedAt,
      export: exported,
      output: exported,
      audit,
    };
    return this.#repository.recordRun(run);
  }

  async runReport(
    actor: ReportActor,
    definitionId: string,
    input: RunReportInput = {},
  ): Promise<ReportRun> {
    return this.runDefinition(actor, definitionId, input);
  }
  async run(
    actor: ReportActor,
    definitionId: string,
    input: RunReportInput = {},
  ): Promise<ReportRun> {
    return this.runDefinition(actor, definitionId, input);
  }

  async getRun(actor: ReportActor, runId: string, eventId?: string): Promise<ReportRun> {
    let run: ReportRun | null = null;
    if (eventId !== undefined) {
      requireReadAccess(actor, eventId);
      run = await this.#repository.getRun(scope(actor.tenantId, eventId), runId);
    } else {
      for (const candidateEventId of authorizedEventIds(actor)) {
        run = await this.#repository.getRun(scope(actor.tenantId, candidateEventId), runId);
        if (run !== null) break;
      }
    }
    if (
      run === null ||
      run.tenantId !== actor.tenantId ||
      (eventId !== undefined && run.eventId !== eventId)
    ) {
      throw reportNotFound();
    }
    requireReadAccess(actor, run.eventId);
    return run;
  }

  async listRuns(
    actor: ReportActor,
    eventId: string,
    definitionId?: string,
  ): Promise<readonly ReportRun[]> {
    requireReadAccess(actor, eventId);
    return (await this.#repository.listRuns(scope(actor.tenantId, eventId), definitionId)).filter(
      (run) => run.tenantId === actor.tenantId && run.eventId === eventId,
    );
  }

  private async findDefinition(
    actor: ReportActor,
    eventOrDefinitionId: string,
    maybeDefinitionId?: string,
  ): Promise<ReportDefinition> {
    if (maybeDefinitionId !== undefined) {
      requireReadAccess(actor, eventOrDefinitionId);
      const definition = await this.#repository.getDefinition(
        scope(actor.tenantId, eventOrDefinitionId),
        maybeDefinitionId,
      );
      if (
        definition === null ||
        definition.tenantId !== actor.tenantId ||
        definition.eventId !== eventOrDefinitionId
      ) {
        throw reportNotFound();
      }
      return definition;
    }
    const definitionId = eventOrDefinitionId;
    if (this.#repository.findDefinition !== undefined) {
      const definition = await this.#repository.findDefinition(actor.tenantId, definitionId);
      if (definition === null || definition.tenantId !== actor.tenantId) throw reportNotFound();
      return definition;
    }
    for (const eventId of authorizedEventIds(actor)) {
      const definition = await this.#repository.getDefinition(
        scope(actor.tenantId, eventId),
        definitionId,
      );
      if (
        definition !== null &&
        definition.tenantId === actor.tenantId &&
        definition.eventId === eventId
      ) {
        return definition;
      }
    }
    throw reportNotFound();
  }
}

function authorizedEventIds(actor: ReportActor): readonly string[] {
  const ids = new Set<string>();
  for (const grant of actor.grants ?? []) ids.add(grant.eventId);
  for (const eventId of actor.eventIds ?? []) ids.add(eventId);
  return [...ids].sort();
}

function requireReadAccess(actor: ReportActor, eventId: string): void {
  if (!hasReadGrant(actor, eventId))
    throw reportForbidden("The requester is not authorized for this event.");
}

function requireManageAccess(actor: ReportActor, eventId: string): void {
  if (!hasEventGrant(actor, eventId))
    throw reportForbidden("An event organizer must manage report definitions.");
}

function materializeRows(
  records: readonly ReportProgramRecord[],
  selectedFields: readonly ParsedField[],
  outputFields: readonly ParsedField[],
  filters: readonly ReportFilter[],
  sorts: readonly ReportSort[],
  personalDataAllowed: boolean,
): readonly MaterializedRow[] {
  const rows: MaterializedRow[] = [];
  const relationFieldMap = new Map<ReportRelationship, ParsedField[]>();
  for (const field of selectedFields) {
    const existing = relationFieldMap.get(field.relationship) ?? [];
    existing.push(field);
    relationFieldMap.set(field.relationship, existing);
  }
  const sortedRecords = [...records].sort((left, right) =>
    left.session.id.localeCompare(right.session.id),
  );
  for (const record of sortedRecords) {
    const participants = relationValues(
      record,
      "participants",
      relationFieldMap.get("participants") ?? [],
    );
    const speakers = relationValues(record, "speakers", relationFieldMap.get("speakers") ?? []);
    const progress = relationValues(
      record,
      "evaluationProgress",
      relationFieldMap.get("evaluationProgress") ?? [],
    );
    const sessions = relationValues(record, "sessions", relationFieldMap.get("sessions") ?? []);
    for (let sessionIndex = 0; sessionIndex < sessions.length; sessionIndex += 1) {
      for (const participant of participants) {
        for (const speaker of speakers) {
          for (const progressValue of progress) {
            const valuesByKey = new Map<string, unknown>();
            for (const field of selectedFields) {
              valuesByKey.set(
                field.key,
                field.personal && !personalDataAllowed
                  ? null
                  : valueFor(record, field, participant, speaker, progressValue),
              );
            }
            const passes = filters.every((filter) =>
              matchesFilter(valuesByKey.get(String(filter.field)), filter),
            );
            if (!passes) continue;
            const values = outputFields.map((field) => valuesByKey.get(field.key) ?? null);
            const sortValues = sorts.map((sort) => valuesByKey.get(String(sort.field)));
            const key = [
              record.session.id,
              participant?.id ?? "",
              speaker?.id ?? "",
              progressValue?.planId ?? "",
            ].join("\u0000");
            rows.push({ values, sortValues, key });
          }
        }
      }
    }
  }
  rows.sort((left, right) => {
    for (let index = 0; index < sorts.length; index += 1) {
      const direction = sorts[index]?.direction === "desc" ? -1 : 1;
      const compared = compareValues(left.sortValues[index], right.sortValues[index]);
      if (compared !== 0) return compared * direction;
    }
    return left.key < right.key ? -1 : left.key > right.key ? 1 : 0;
  });
  return rows;
}

export class InMemoryReportRepository implements ReportRepository {
  readonly #definitions = new Map<string, ReportDefinition>();
  readonly #records: ReportProgramRecord[];
  readonly #runs = new Map<string, ReportRun>();

  constructor(records: readonly ReportProgramRecord[] = []) {
    this.#records = records.map((record) => stableClone(record));
  }

  replaceProgramRecords(records: readonly ReportProgramRecord[]): void {
    this.#records.splice(0, this.#records.length, ...records.map((record) => stableClone(record)));
  }

  async listDefinitions(scopeValue: ReportRepositoryScope): Promise<readonly ReportDefinition[]> {
    return [...this.#definitions.values()]
      .filter(
        (definition) =>
          definition.tenantId === scopeValue.tenantId && definition.eventId === scopeValue.eventId,
      )
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  async getDefinition(
    scopeValue: ReportRepositoryScope,
    definitionId: string,
  ): Promise<ReportDefinition | null> {
    const definition = this.#definitions.get(
      definitionKey(scopeValue.tenantId, scopeValue.eventId, definitionId),
    );
    return definition ?? null;
  }

  async findDefinition(tenantId: string, definitionId: string): Promise<ReportDefinition | null> {
    const matches = [...this.#definitions.values()].filter(
      (definition) => definition.tenantId === tenantId && definition.id === definitionId,
    );
    return matches.length === 1 ? (matches[0] ?? null) : null;
  }

  async createDefinition(definition: ReportDefinition): Promise<ReportDefinition> {
    const key = definitionKey(definition.tenantId, definition.eventId, definition.id);
    if (this.#definitions.has(key)) throw reportConflict("A report with this id already exists.");
    this.#definitions.set(key, definition);
    return definition;
  }

  async updateDefinition(
    scopeValue: ReportRepositoryScope,
    definitionId: string,
    expectedVersion: number,
    definition: ReportDefinition,
  ): Promise<ReportDefinition> {
    const key = definitionKey(scopeValue.tenantId, scopeValue.eventId, definitionId);
    const current = this.#definitions.get(key);
    if (current === undefined) throw reportNotFound();
    if (current.version !== expectedVersion)
      throw reportConflict("The report was modified by another requester.");
    this.#definitions.set(key, definition);
    return definition;
  }

  async deleteDefinition(
    scopeValue: ReportRepositoryScope,
    definitionId: string,
    expectedVersion: number,
  ): Promise<void> {
    const key = definitionKey(scopeValue.tenantId, scopeValue.eventId, definitionId);
    const current = this.#definitions.get(key);
    if (current === undefined) throw reportNotFound();
    if (current.version !== expectedVersion)
      throw reportConflict("The report was modified by another requester.");
    this.#definitions.delete(key);
  }

  async listProgramRecords(dataScope: {
    tenantId: string;
    eventId: string;
  }): Promise<readonly ReportProgramRecord[]> {
    return this.#records.filter(
      (record) => record.tenantId === dataScope.tenantId && record.eventId === dataScope.eventId,
    );
  }

  async recordRun(run: ReportRun): Promise<ReportRun> {
    if (this.#runs.has(run.id)) throw reportConflict("A report run with this id already exists.");
    this.#runs.set(run.id, run);
    return run;
  }

  async getRun(scopeValue: ReportRepositoryScope, runId: string): Promise<ReportRun | null> {
    const run = this.#runs.get(runId);
    if (
      run === undefined ||
      run.tenantId !== scopeValue.tenantId ||
      run.eventId !== scopeValue.eventId
    )
      return null;
    return run;
  }

  async listRuns(
    scopeValue: ReportRepositoryScope,
    definitionId?: string,
  ): Promise<readonly ReportRun[]> {
    return [...this.#runs.values()]
      .filter(
        (run) =>
          run.tenantId === scopeValue.tenantId &&
          run.eventId === scopeValue.eventId &&
          (definitionId === undefined || run.definitionId === definitionId),
      )
      .sort(
        (left, right) =>
          left.requestedAt.localeCompare(right.requestedAt) || left.id.localeCompare(right.id),
      );
  }
}

function definitionKey(tenantId: string, eventId: string, definitionId: string): string {
  return `${tenantId}\u0000${eventId}\u0000${definitionId}`;
}
