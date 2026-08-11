export type ReportFormat = "csv" | "xlsx";

/** Relationships exposed by the program reporting projection. CRM entities are intentionally absent. */
export type ReportRelationship = "sessions" | "participants" | "speakers" | "evaluationProgress";

export type ReportFilterOperator =
  | "eq"
  | "neq"
  | "contains"
  | "startsWith"
  | "endsWith"
  | "in"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "isNull"
  | "isNotNull";

export interface ReportFieldObject {
  readonly relationship: string;
  readonly field: string;
  readonly alias?: string;
}

/** Input form accepts a dotted field name or an explicit relationship/field pair. */
export type ReportFieldSelector = string | ReportFieldObject;

export interface ReportFilter {
  readonly field: ReportFieldSelector;
  readonly operator: ReportFilterOperator;
  readonly value?: unknown;
}

export interface ReportSort {
  readonly field: ReportFieldSelector;
  readonly direction: "asc" | "desc";
}

export type ReportGrantRole = "organizer" | "reporter" | "viewer";

export interface ReportGrant {
  readonly eventId: string;
  readonly role: ReportGrantRole;
  /** Personal fields are denied unless this is explicitly true. */
  readonly canViewPersonalData?: boolean;
}

export interface ReportActor {
  readonly tenantId: string;
  readonly userId: string;
  readonly kind: "human" | "automation";
  readonly grants?: readonly ReportGrant[];
  /** A narrow compatibility shape for authenticators that materialize event ids separately. */
  readonly eventIds?: readonly string[];
  readonly canViewPersonalData?: boolean;
}

export interface ReportDefinition {
  readonly id: string;
  readonly tenantId: string;
  readonly eventId: string;
  readonly name: string;
  readonly description: string;
  readonly relationships: readonly ReportRelationship[];
  readonly fields: readonly string[];
  /** Output column order. Every entry must also occur in fields. */
  readonly order: readonly string[];
  readonly filters: readonly ReportFilter[];
  readonly sort: readonly ReportSort[];
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateReportDefinitionInput {
  readonly id?: string;
  readonly eventId: string;
  readonly name: string;
  readonly description?: string;
  readonly relationships: readonly string[];
  readonly fields: readonly ReportFieldSelector[];
  readonly order?: readonly ReportFieldSelector[];
  readonly filters?: readonly ReportFilter[];
  readonly sort?: readonly ReportSort[];
}

export interface UpdateReportDefinitionInput {
  readonly expectedVersion: number;
  readonly eventId?: string;
  readonly name?: string;
  readonly description?: string;
  readonly relationships?: readonly string[];
  readonly fields?: readonly ReportFieldSelector[];
  readonly order?: readonly ReportFieldSelector[];
  readonly filters?: readonly ReportFilter[];
  readonly sort?: readonly ReportSort[];
}

export interface ReportRunParameters {
  readonly format: ReportFormat;
  readonly expectedVersion: number;
  readonly definitionId: string;
  readonly definitionVersion: number;
  readonly requestedFilters: readonly ReportFilter[];
  readonly requestedSort: readonly ReportSort[];
  readonly runParameters?: Readonly<Record<string, unknown>>;
  readonly evaluationPlanId?: string;
  readonly evaluationPlanVersion?: number;
}

export interface ReportExport {
  readonly format: ReportFormat;
  readonly fileName: string;
  readonly contentType: string;
  /** UTF-8 CSV or deterministic Excel SpreadsheetML text. */
  readonly body: string;
  readonly content?: string;
  readonly columns: readonly string[];
  readonly rowCount: number;
  readonly outputDigest: string;
}

export interface ReportRunAudit {
  readonly requesterId: string;
  readonly tenantId: string;
  readonly eventId: string;
  readonly definitionId: string;
  readonly definitionVersion: number;
  readonly parameters: ReportRunParameters;
  readonly requestedAt: string;
  readonly completedAt: string;
  readonly outputDigest: string;
  readonly rowCount: number;
}

export interface ReportRun {
  readonly id: string;
  readonly tenantId: string;
  readonly eventId: string;
  readonly definitionId: string;
  readonly definitionVersion: number;
  readonly requesterId: string;
  readonly parameters: ReportRunParameters;
  readonly requestedAt: string;
  readonly completedAt: string;
  readonly export: ReportExport;
  readonly output?: ReportExport;
  readonly audit: ReportRunAudit;
}

export interface ReportSessionRecord {
  readonly id: string;
  readonly title?: string;
  readonly description?: string;
  readonly abstract?: string;
  readonly status?: string;
  readonly startsAt?: string | null;
  readonly endsAt?: string | null;
  readonly room?: string;
  readonly track?: string;
  readonly [key: string]: unknown;
}

export interface ReportPersonRecord {
  readonly id: string;
  readonly displayName?: string;
  readonly biography?: string;
  readonly email?: string;
  readonly [key: string]: unknown;
}

/** Aggregate progress only; reviewer notes, identities, scores, and private assets are not modeled. */
export interface ReportEvaluationProgressRecord {
  readonly planId: string;
  readonly planName?: string;
  readonly planVersion?: number;
  readonly total?: number;
  readonly assigned?: number;
  readonly inProgress?: number;
  readonly submitted?: number;
  readonly abstained?: number;
  readonly completionPercent?: number;
  readonly averageScore?: number | null;
  readonly possibleScore?: number | null;
  readonly scoreCount?: number;
  readonly individualGrade?: number | null;
  readonly cumulativeGrade?: number | null;
  readonly [key: string]: unknown;
}

export interface ReportProgramRecord {
  readonly tenantId: string;
  readonly eventId: string;
  readonly session: ReportSessionRecord;
  readonly participants?: readonly ReportPersonRecord[];
  readonly speakers?: readonly ReportPersonRecord[];
  readonly evaluationProgress?:
    | readonly ReportEvaluationProgressRecord[]
    | ReportEvaluationProgressRecord
    | null;
}

export interface ReportDataScope {
  readonly tenantId: string;
  readonly eventId: string;
  readonly requesterId: string;
  readonly relationships: readonly ReportRelationship[];
  readonly fields: readonly string[];
  readonly includePersonalData: boolean;
}

export interface ReportRepositoryScope {
  readonly tenantId: string;
  readonly eventId: string;
}

export interface ReportDefinitionRepository {
  listDefinitions(scope: ReportRepositoryScope): Promise<readonly ReportDefinition[]>;
  getDefinition(
    scope: ReportRepositoryScope,
    definitionId: string,
  ): Promise<ReportDefinition | null>;
  /** Implementations must atomically enforce expectedVersion. */
  createDefinition(definition: ReportDefinition): Promise<ReportDefinition>;
  updateDefinition(
    scope: ReportRepositoryScope,
    definitionId: string,
    expectedVersion: number,
    definition: ReportDefinition,
  ): Promise<ReportDefinition>;
  deleteDefinition(
    scope: ReportRepositoryScope,
    definitionId: string,
    expectedVersion: number,
  ): Promise<void>;
  /** Used when an event is not present in the URL; must still be tenant scoped. */
  findDefinition?(tenantId: string, definitionId: string): Promise<ReportDefinition | null>;
}

export interface ReportDataRepository {
  listProgramRecords(scope: ReportDataScope): Promise<readonly ReportProgramRecord[]>;
}

export interface ReportRunRepository {
  recordRun(run: ReportRun): Promise<ReportRun>;
  getRun(scope: ReportRepositoryScope, runId: string): Promise<ReportRun | null>;
  listRuns(scope: ReportRepositoryScope, definitionId?: string): Promise<readonly ReportRun[]>;
}

export interface ReportRepository
  extends ReportDefinitionRepository,
    ReportDataRepository,
    ReportRunRepository {}

export interface ReportExportInput {
  readonly format: ReportFormat;
  readonly fileName: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly unknown[])[];
}

export interface ReportExporter {
  export(input: ReportExportInput): Promise<ReportExport> | ReportExport;
}

export interface ReportServiceOptions {
  readonly clock?: () => Date;
  readonly idGenerator?: (prefix: "definition" | "run") => string;
}

export const REPORT_RELATIONSHIPS: readonly ReportRelationship[] = [
  "sessions",
  "participants",
  "speakers",
  "evaluationProgress",
];

/** Only fields in this registry can be requested by a report definition. */
export const REPORT_FIELD_ALLOWLIST = {
  sessions: [
    "id",
    "title",
    "description",
    "abstract",
    "status",
    "startsAt",
    "endsAt",
    "room",
    "track",
  ],
  participants: ["id", "displayName", "biography", "email"],
  speakers: ["id", "displayName", "biography", "email"],
  evaluationProgress: [
    "planId",
    "planName",
    "planVersion",
    "total",
    "assigned",
    "inProgress",
    "submitted",
    "abstained",
    "completionPercent",
    "averageScore",
    "possibleScore",
    "scoreCount",
    "individualGrade",
    "cumulativeGrade",
  ],
} as const satisfies Record<ReportRelationship, readonly string[]>;

export type ReportAllowlistedField = {
  readonly relationship: ReportRelationship;
  readonly field: (typeof REPORT_FIELD_ALLOWLIST)[ReportRelationship][number];
};
export type ReportDefinitionInput = CreateReportDefinitionInput;
export type ReportUpdateInput = UpdateReportDefinitionInput;
export type ReportSourceRepository = ReportDataRepository;
