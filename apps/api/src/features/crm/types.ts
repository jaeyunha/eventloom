/** Organization-scoped CRM actor. CRM access is intentionally limited to organizer memberships. */
export interface CrmActor {
  readonly kind: "user";
  readonly organizationId: string;
  readonly userId: string;
  readonly role: "owner" | "admin" | "organizer";
}

export type CrmContactSource = "manual" | "csv" | "speaker" | "import";
export type CrmContactStatus = "active" | "merged";
export type CrmPipelineStage =
  | "new"
  | "contacted"
  | "qualified"
  | "invited"
  | "registered"
  | "accepted"
  | "declined"
  | "won"
  | "lost";

export interface CrmContact {
  readonly id: string;
  readonly organizationId: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly displayName: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly company: string | null;
  readonly title: string | null;
  readonly website: string | null;
  readonly linkedinUrl: string | null;
  readonly notes: string | null;
  readonly tags: readonly string[];
  readonly customFields: Readonly<Record<string, CrmValue>>;
  readonly source: CrmContactSource;
  readonly status: CrmContactStatus;
  readonly mergedIntoId: string | null;
  readonly pipelineStage: CrmPipelineStage;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type CrmValue =
  | string
  | number
  | boolean
  | null
  | readonly CrmValue[]
  | { readonly [key: string]: CrmValue };

export interface CrmContactInput {
  readonly firstName?: string | null | undefined;
  readonly lastName?: string | null | undefined;
  readonly displayName?: string | null | undefined;
  readonly email?: string | null | undefined;
  readonly phone?: string | null | undefined;
  readonly company?: string | null | undefined;
  readonly title?: string | null | undefined;
  readonly website?: string | null | undefined;
  readonly linkedinUrl?: string | null | undefined;
  readonly notes?: string | null | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly customFields?: Readonly<Record<string, CrmValue>> | undefined;
  readonly source?: CrmContactSource | undefined;
  readonly pipelineStage?: CrmPipelineStage | undefined;
}

export interface CreateCrmContactInput extends CrmContactInput {
  readonly organizationId: string;
  readonly idempotencyKey?: string | undefined;
}

export interface UpdateCrmContactInput extends CrmContactInput {
  readonly organizationId: string;
  readonly contactId: string;
  readonly expectedVersion?: number | undefined;
  readonly pipelineNote?: string | null | undefined;
}

export interface CrmContactSearch {
  readonly query?: string;
  readonly email?: string;
  readonly tags?: readonly string[];
  readonly pipelineStage?: CrmPipelineStage;
  readonly status?: CrmContactStatus;
  readonly company?: string;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface CrmImportRow extends CrmContactInput {
  readonly id?: string;
  readonly email?: string | null;
  readonly [key: string]: unknown;
}

export interface ImportCrmContactsInput {
  readonly organizationId: string;
  readonly csv?: string | undefined;
  readonly rows?: readonly CrmImportRow[] | undefined;
  readonly idempotencyKey: string;
  readonly mode?: "upsert" | "create" | undefined;
}
export interface CrmImportColumnMapping {
  readonly sourceColumn: string;
  readonly targetField: string;
  readonly custom: boolean;
}

export interface CrmImportRowResult {
  readonly rowNumber: number;
  readonly identity: string | null;
  readonly status: "created" | "updated" | "skipped";
  readonly contactId: string | null;
  readonly reason: string | null;
}

export interface CrmImportResult {
  readonly id: string;
  readonly organizationId: string;
  readonly created: number;
  readonly updated: number;
  readonly skipped: number;
  readonly contacts: readonly CrmContact[];
  readonly mapping: readonly CrmImportColumnMapping[];
  readonly rows: readonly CrmImportRowResult[];
  readonly idempotent: boolean;
  readonly createdAt: string;
  readonly idempotencyKey?: string;
}

export type CrmSegmentOperator =
  | "eq"
  | "neq"
  | "contains"
  | "startsWith"
  | "endsWith"
  | "in"
  | "notIn"
  | "exists";

export interface CrmSegmentRule {
  readonly field: string;
  readonly operator: CrmSegmentOperator;
  readonly value?: CrmValue | readonly CrmValue[];
}

export interface CrmSegment {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly description: string | null;
  readonly rules: readonly CrmSegmentRule[];
  readonly createdBy: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateCrmSegmentInput {
  readonly organizationId: string;
  readonly name: string;
  readonly description?: string | null;
  readonly rules: readonly CrmSegmentRule[];
}

export interface UpdateCrmSegmentInput {
  readonly organizationId: string;
  readonly segmentId: string;
  readonly name?: string;
  readonly description?: string | null;
  readonly rules?: readonly CrmSegmentRule[];
  readonly expectedVersion?: number;
}

export interface CrmDuplicateMatch {
  readonly contact: CrmContact;
  readonly score: number;
  readonly matchedFields: readonly ("email" | "phone" | "name" | "company")[];
}

export interface CrmDuplicateReport {
  readonly contactId: string;
  readonly matches: readonly CrmDuplicateMatch[];
}
export type CrmMergeScalarField =
  | "email"
  | "phone"
  | "name"
  | "company"
  | "title"
  | "bio"
  | "headshot";

export interface MergeCrmContactsInput {
  readonly organizationId: string;
  readonly primaryContactId: string;
  readonly duplicateContactIds: readonly string[];
  readonly fieldWinners?: Readonly<Partial<Record<CrmMergeScalarField, string>>> | undefined;
  readonly customFieldWinners?: Readonly<Record<string, string>> | undefined;
  readonly idempotencyKey?: string | undefined;
}
export interface UpdateCrmPipelineInput {
  readonly organizationId: string;
  readonly contactId: string;
  readonly stage: CrmPipelineStage;
  readonly note?: string | null | undefined;
}

export interface AddCrmNoteInput {
  readonly organizationId: string;
  readonly contactId: string;
  readonly body: string;
}

export interface CrmMergeResult {
  readonly primary: CrmContact;
  readonly merged: readonly CrmContact[];
  readonly idempotent: boolean;
}

export type CrmHistoryKind =
  | "event"
  | "session"
  | "submission"
  | "attendance"
  | "note"
  | "pipeline"
  | "communication";

export interface CrmHistoryEntry {
  readonly id: string;
  readonly organizationId: string;
  readonly contactId: string;
  readonly kind: CrmHistoryKind;
  readonly eventId: string | null;
  readonly sessionId: string | null;
  readonly title: string;
  readonly detail: string | null;
  readonly occurredAt: string;
  readonly metadata: Readonly<Record<string, CrmValue>>;
}

export interface CrmPipelineEntry {
  readonly id: string;
  readonly organizationId: string;
  readonly contactId: string;
  readonly fromStage: CrmPipelineStage | null;
  readonly toStage: CrmPipelineStage;
  readonly note: string | null;
  readonly actorId: string;
  readonly createdAt: string;
}

export interface CrmNote {
  readonly id: string;
  readonly organizationId: string;
  readonly contactId: string;
  readonly body: string;
  readonly authorId: string;
  readonly createdAt: string;
}

export interface AddContactToEventInput {
  readonly organizationId: string;
  readonly contactId: string;
  readonly eventId: string;
  readonly role?: "speaker" | "prospect" | "attendee" | "sponsor";
  readonly sessionId?: string | null;
  readonly note?: string | null;
  readonly idempotencyKey: string;
}

export interface CrmEventProjection {
  readonly id: string;
  readonly organizationId: string;
  readonly eventId: string;
  readonly contactId: string;
  readonly sessionId: string | null;
  readonly role: "speaker" | "prospect" | "attendee" | "sponsor";
  readonly note: string | null;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface CrmEventProjectionResult {
  readonly projection: CrmEventProjection;
  readonly idempotent: boolean;
  readonly outcome: "created" | "existing";
}

export interface SendCrmOutreachInput {
  readonly organizationId: string;
  readonly contactId: string;
  readonly eventId?: string | null | undefined;
  readonly segmentId?: string | null | undefined;
  readonly subject: string;
  readonly body: string;
  readonly variables?: Readonly<Record<string, string>> | undefined;
  readonly idempotencyKey: string;
}

export type CrmOutreachStatus = "queued" | "sent" | "failed";

export interface CrmOutreachCommand {
  readonly id: string;
  readonly organizationId: string;
  readonly contactId: string;
  readonly eventId: string | null;
  readonly recipientEmail: string;
  readonly templateSubject: string;
  readonly subject: string;
  readonly body: string;
  readonly renderedBody: string;
  readonly status: CrmOutreachStatus;
  readonly queuedCount: number;
  readonly sentCount: number;
  readonly failedCount: number;
  readonly terminal: boolean;
  readonly failureReason: string | null;
  readonly idempotencyKey: string;
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface CrmAnalytics {
  readonly organizationId: string;
  readonly totalContacts: number;
  readonly activeContacts: number;
  readonly contactsByPipelineStage: Readonly<Record<CrmPipelineStage, number>>;
  readonly contactsByEvent: readonly { readonly eventId: string; readonly count: number }[];
  readonly contactsBySource: Readonly<Record<CrmContactSource, number>>;
  readonly outreach: { readonly queued: number; readonly sent: number; readonly failed: number };
  readonly generatedAt: string;
}

export interface CrmRepositoryFilter extends CrmContactSearch {
  readonly organizationId?: string;
}

/** Airtable-backed business record boundary. D1/auth repositories must not be substituted here. */
export interface CrmRepository {
  listContacts(
    organizationId: string,
    filter?: CrmRepositoryFilter,
  ): Promise<readonly CrmContact[]>;
  getContact(organizationId: string, contactId: string): Promise<CrmContact | null>;
  findContactByEmail(organizationId: string, email: string): Promise<CrmContact | null>;
  saveContact(contact: CrmContact, expectedVersion: number | null): Promise<CrmContact>;
  listSegments(organizationId: string): Promise<readonly CrmSegment[]>;
  getSegment(organizationId: string, segmentId: string): Promise<CrmSegment | null>;
  saveSegment(segment: CrmSegment, expectedVersion: number | null): Promise<CrmSegment>;
  deleteSegment(organizationId: string, segmentId: string, expectedVersion: number): Promise<void>;
  listHistory(organizationId: string, contactId: string): Promise<readonly CrmHistoryEntry[]>;
  appendHistory(entry: CrmHistoryEntry): Promise<CrmHistoryEntry>;
  listPipelineHistory(
    organizationId: string,
    contactId: string,
  ): Promise<readonly CrmPipelineEntry[]>;
  appendPipeline(entry: CrmPipelineEntry): Promise<CrmPipelineEntry>;
  listNotes(organizationId: string, contactId: string): Promise<readonly CrmNote[]>;
  appendNote(note: CrmNote): Promise<CrmNote>;
  getProjection(
    organizationId: string,
    eventId: string,
    contactId: string,
  ): Promise<CrmEventProjection | null>;
  saveProjection(projection: CrmEventProjection): Promise<CrmEventProjection>;
  listProjections(organizationId: string): Promise<readonly CrmEventProjection[]>;
  saveOutreach(command: CrmOutreachCommand): Promise<CrmOutreachCommand>;
  getOutreachByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<CrmOutreachCommand | null>;
  readonly listOutreach?: (organizationId: string) => Promise<readonly CrmOutreachCommand[]>;
  saveImport(result: CrmImportResult): Promise<CrmImportResult>;
  getImportByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<CrmImportResult | null>;
  getCommandResult<T>(organizationId: string, command: string, key: string): Promise<T | null>;
  saveCommandResult<T>(
    organizationId: string,
    command: string,
    key: string,
    value: T,
  ): Promise<void>;
}

/** Named alias used by production composition code to make Airtable authority explicit. */
export type AirtableCrmRepository = CrmRepository;
export type CrmAirtableRepository = CrmRepository;

export interface CrmServiceDependencies {
  readonly repository?: CrmRepository;
  readonly outreach?: CrmOutreachBoundary;
}

export interface CrmOutreachBoundary {
  send(command: CrmOutreachCommand): Promise<CrmOutreachCommand | undefined>;
}

export interface CrmServiceOptions {
  readonly clock?: () => Date;
  readonly generateId?: (prefix: string) => string;
}

export type CrmServiceErrorCode =
  | "CRM_DEPENDENCY_UNAVAILABLE"
  | "CRM_INVALID_INPUT"
  | "CRM_FORBIDDEN"
  | "CRM_NOT_FOUND"
  | "CRM_CONFLICT";

export class CrmServiceError extends Error {
  readonly status: 400 | 403 | 404 | 409 | 503;

  constructor(
    readonly code: CrmServiceErrorCode,
    message: string,
    status: 400 | 403 | 404 | 409 | 503,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "CrmServiceError";
    this.status = status;
  }
}

export interface CrmRepositorySeed {
  readonly contacts?: readonly CrmContact[];
  readonly segments?: readonly CrmSegment[];
  readonly history?: readonly CrmHistoryEntry[];
  readonly pipeline?: readonly CrmPipelineEntry[];
  readonly notes?: readonly CrmNote[];
  readonly projections?: readonly CrmEventProjection[];
  readonly outreach?: readonly CrmOutreachCommand[];
  readonly imports?: readonly CrmImportResult[];
}
