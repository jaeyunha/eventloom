export const CRM_PIPELINE_STAGES = [
  "new",
  "contacted",
  "qualified",
  "invited",
  "registered",
  "accepted",
  "declined",
  "won",
  "lost",
] as const;
export type CrmPipelineStage = (typeof CRM_PIPELINE_STAGES)[number];
export type CrmContactStatus = "active" | "merged";
export type CrmContactSource = "manual" | "csv" | "speaker" | "import";
export type CrmSegmentOperator =
  | "eq"
  | "neq"
  | "contains"
  | "startsWith"
  | "endsWith"
  | "in"
  | "notIn"
  | "exists";

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
  readonly bio?: string | null;
  readonly linkedinUrl: string | null;
  readonly headshotUrl?: string | null;
  readonly notes: string | null;
  readonly tags: readonly string[];
  readonly customFields: Readonly<Record<string, unknown>>;
  readonly source: CrmContactSource;
  readonly status: CrmContactStatus;
  readonly mergedIntoId: string | null;
  readonly pipelineStage: CrmPipelineStage;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CrmSegmentRule {
  readonly field: string;
  readonly operator: CrmSegmentOperator;
  readonly value?: unknown;
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

export interface CrmHistoryEntry {
  readonly id: string;
  readonly organizationId: string;
  readonly contactId: string;
  readonly kind: string;
  readonly eventId: string | null;
  readonly sessionId: string | null;
  readonly title: string;
  readonly detail: string | null;
  readonly occurredAt: string;
  readonly metadata: Readonly<Record<string, unknown>>;
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

export interface CrmEvent {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly slug?: string;
  readonly status?: string;
  readonly startsAt?: string;
  readonly endsAt?: string;
}

export interface CrmDuplicateMatch {
  readonly contact: CrmContact;
  readonly score: number;
  readonly matchedFields: readonly string[];
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

export type CrmMergeField = CrmMergeScalarField | "customFields";

export interface CrmMergeWinners {
  readonly fieldWinners: Readonly<Record<CrmMergeScalarField, string>>;
  readonly customFieldWinners: Readonly<Record<string, string>>;
}

export interface CrmMergePlan extends CrmMergeWinners {
  readonly duplicateContactIds: readonly string[];
}
export function mergePlanKey(plan: CrmMergePlan): string {
  const customFieldWinners = Object.fromEntries(
    Object.entries(plan.customFieldWinners).sort(([left], [right]) => left.localeCompare(right)),
  );
  return JSON.stringify({
    duplicateContactIds: [...plan.duplicateContactIds].sort((left, right) =>
      left.localeCompare(right),
    ),
    fieldWinners: plan.fieldWinners,
    customFieldWinners,
  });
}

export interface CrmParticipantConflict {
  readonly eventId: string;
  readonly participantIds: readonly string[];
  readonly crmContactIds: readonly string[];
  readonly reason: "distinct-participants-share-merged-contacts";
}

export interface CrmMergeRewireCounts {
  readonly participantContactLinks: number;
  readonly notes: number;
  readonly segments: number;
  readonly pipelineHistory: number;
}

export interface CrmMergePreview {
  readonly organizationId: string;
  readonly survivorId: string;
  readonly retiredIds: readonly string[];
  readonly rewired: CrmMergeRewireCounts;
  readonly participantConflicts: readonly CrmParticipantConflict[];
  readonly auditId: string;
  readonly planFingerprint: string;
  readonly survivor: CrmContact;
  readonly tombstones: readonly CrmContact[];
  readonly primary: CrmContact;
  readonly merged: readonly CrmContact[];
  readonly preview: true;
  readonly canCommit: boolean;
}

export interface CrmMergeResult {
  readonly survivorId: string;
  readonly retiredIds: readonly string[];
  readonly rewired: CrmMergeRewireCounts;
  readonly participantConflicts: readonly CrmParticipantConflict[];
  readonly auditId: string;
  readonly primary: CrmContact;
  readonly merged: readonly CrmContact[];
  readonly survivor: CrmContact;
  readonly tombstones: readonly CrmContact[];
  readonly idempotent: boolean;
  readonly planFingerprint: string;
}

export interface CrmAnalytics {
  readonly organizationId: string;
  readonly totalContacts: number;
  readonly activeContacts: number;
  readonly contactsByPipelineStage: Readonly<Record<string, number>>;
  readonly contactsByEvent: readonly { readonly eventId: string; readonly count: number }[];
  readonly contactsBySource: Readonly<Record<string, number>>;
  readonly outreach: { readonly queued: number; readonly sent: number; readonly failed: number };
  readonly generatedAt: string;
}
export interface CrmImportResult {
  readonly id: string;
  readonly organizationId: string;
  readonly created: number;
  readonly updated: number;
  readonly skipped: number;
  readonly errors: number;
  readonly contacts: readonly CrmContact[];
  readonly mapping: readonly {
    readonly sourceColumn: string;
    readonly targetField: string;
    readonly custom: boolean;
  }[];
  readonly rows: readonly {
    readonly rowNumber: number;
    readonly identity: string | null;
    readonly status: "created" | "updated" | "skipped" | "error";
    readonly contactId: string | null;
    readonly reason: string | null;
  }[];
  readonly idempotent: boolean;
  readonly createdAt: string;
  readonly idempotencyKey?: string;
  readonly planFingerprint?: string;
  readonly preview?: boolean;
}
export type CrmImportPreviewResult = CrmImportResult;

export interface CrmEventProjectionResult {
  readonly idempotent: boolean;
  readonly outcome: "created" | "existing";
  readonly projection: {
    readonly id: string;
    readonly eventId: string;
    readonly contactId: string;
    readonly role: "speaker" | "prospect" | "attendee" | "sponsor";
  };
}

export interface CrmOutreachCommand {
  readonly id: string;
  readonly contactId: string;
  readonly recipientEmail: string;
  readonly subject: string;
  readonly renderedBody: string;
  readonly status: "queued" | "sent" | "delivered" | "failed" | "bounced" | "complained";
  readonly queuedCount: number;
  readonly sentCount: number;
  readonly failedCount: number;
  readonly terminal: boolean;
  readonly failureReason: string | null;
  readonly providerMessageId?: string | null;
  readonly completedAt?: string | null;
}

export interface CrmOutreachRecipientPreview {
  readonly contactId: string;
  readonly email: string;
  readonly displayName: string;
  readonly subject: string;
  readonly body: string;
  readonly unknownTags: readonly string[];
  readonly idempotencyKey: string;
}

export interface CrmOutreachPreview {
  readonly subject: string;
  readonly body: string;
  readonly count: number;
  readonly recipients: readonly CrmOutreachRecipientPreview[];
  readonly segmentId?: string;
  readonly eventId?: string;
}

export interface ContactDraft {
  readonly firstName: string;
  readonly lastName: string;
  readonly displayName: string;
  readonly email: string;
  readonly phone: string;
  readonly company: string;
  readonly title: string;
  readonly website: string;
  readonly linkedinUrl: string;
  readonly bio: string;
  readonly headshotUrl: string;
  readonly tags: string;
  readonly customFields: string;
  readonly notes: string;
}

export interface CrmApi {
  listContacts(filter?: {
    readonly query?: string;
    readonly company?: string;
    readonly pipelineStage?: CrmPipelineStage | "";
    readonly status?: CrmContactStatus | "";
    readonly tags?: string;
  }): Promise<readonly CrmContact[]>;
  getContact(contactId: string): Promise<CrmContact>;
  createContact(input: Record<string, unknown>): Promise<CrmContact>;
  updateContact(contactId: string, input: Record<string, unknown>): Promise<CrmContact>;
  previewImport(csv: string): Promise<CrmImportPreviewResult>;
  importContacts(csv: string, idempotencyKey: string): Promise<CrmImportResult>;
  listSegments(): Promise<readonly CrmSegment[]>;
  createSegment(input: {
    name: string;
    description?: string;
    rules: readonly CrmSegmentRule[];
  }): Promise<CrmSegment>;
  listSegmentContacts(segmentId: string): Promise<readonly CrmContact[]>;
  findDuplicates(contactId: string): Promise<CrmDuplicateReport>;
  previewMerge(
    contactId: string,
    duplicateContactIds: readonly string[],
    winners?: CrmMergeWinners,
  ): Promise<CrmMergePreview>;
  mergeContacts(
    contactId: string,
    duplicateContactIds: readonly string[],
    idempotencyKey: string,
    winners?: CrmMergeWinners,
  ): Promise<CrmMergeResult>;
  getContactHistory(contactId: string): Promise<readonly CrmHistoryEntry[]>;
  getPipelineHistory(contactId: string): Promise<readonly CrmPipelineEntry[]>;
  updatePipeline(contactId: string, stage: CrmPipelineStage, note?: string): Promise<CrmContact>;
  listNotes(contactId: string): Promise<readonly CrmNote[]>;
  addNote(contactId: string, body: string): Promise<CrmNote>;
  addContactToEvent(
    contactId: string,
    input: {
      eventId: string;
      role: "speaker" | "prospect" | "attendee" | "sponsor";
      note?: string;
    },
    idempotencyKey: string,
  ): Promise<CrmEventProjectionResult>;
  sendOutreach(
    input: {
      contactId: string;
      eventId?: string;
      segmentId?: string;
      subject: string;
      body: string;
      variables?: Record<string, string>;
    },
    idempotencyKey: string,
  ): Promise<CrmOutreachCommand>;
  analytics(): Promise<CrmAnalytics>;
  listEvents(): Promise<readonly CrmEvent[]>;
}

export class CrmApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly traceId?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "CrmApiError";
  }
}

export function messageFromError(error: unknown): string {
  if (error instanceof CrmApiError) {
    const details =
      error.details === undefined
        ? ""
        : `\nDetails: ${
            typeof error.details === "string" ? error.details : JSON.stringify(error.details)
          }`;
    return `${error.message}${details}${
      error.traceId ? `\nTechnical reference: trace ${error.traceId}` : ""
    }`;
  }
  return error instanceof Error ? error.message : "The CRM request could not be completed.";
}

export type CrmWorkspaceContactFilter = NonNullable<Parameters<CrmApi["listContacts"]>[0]>;

type CrmWorkspaceReadKind = "contacts" | "segments" | "events" | "analytics";
const CRM_WORKSPACE_READ_KINDS: readonly CrmWorkspaceReadKind[] = [
  "contacts",
  "segments",
  "events",
  "analytics",
];

interface CrmWorkspaceReadHandlers {
  readonly setContacts: (contacts: readonly CrmContact[]) => void;
  readonly setSegments: (segments: readonly CrmSegment[]) => void;
  readonly setEvents: (events: readonly CrmEvent[]) => void;
  readonly setAnalytics: (analytics: CrmAnalytics) => void;
  readonly setContactsLoading: (loading: boolean) => void;
  readonly setSegmentsLoading: (loading: boolean) => void;
  readonly setEventsLoading: (loading: boolean) => void;
  readonly setAnalyticsLoading: (loading: boolean) => void;
  readonly setError: (error: string | null) => void;
}

export function createCrmWorkspaceReadCoordinator(api: CrmApi, handlers: CrmWorkspaceReadHandlers) {
  const generations: Record<CrmWorkspaceReadKind, number> = {
    contacts: 0,
    segments: 0,
    events: 0,
    analytics: 0,
  };
  let disposed = false;
  const errors: Record<CrmWorkspaceReadKind, string | null> = {
    contacts: null,
    segments: null,
    events: null,
    analytics: null,
  };

  function setReadError(kind: CrmWorkspaceReadKind, error: string | null): void {
    errors[kind] = error;
    const messages = CRM_WORKSPACE_READ_KINDS.flatMap((candidate) =>
      errors[candidate] === null ? [] : [errors[candidate]],
    );
    const summary = messages[0] ?? null;
    handlers.setError(summary === null ? null : messages.join("\n"));
  }

  function isCurrent(kind: CrmWorkspaceReadKind, generation: number): boolean {
    return !disposed && generations[kind] === generation;
  }

  async function loadContacts(filter: CrmWorkspaceContactFilter): Promise<void> {
    const generation = ++generations.contacts;
    handlers.setContactsLoading(true);
    setReadError("contacts", null);
    try {
      const nextContacts = await api.listContacts(filter);
      if (isCurrent("contacts", generation)) handlers.setContacts(nextContacts);
    } catch (reason) {
      if (isCurrent("contacts", generation)) setReadError("contacts", messageFromError(reason));
    } finally {
      if (isCurrent("contacts", generation)) handlers.setContactsLoading(false);
    }
  }

  async function loadSegments(): Promise<void> {
    const generation = ++generations.segments;
    handlers.setSegmentsLoading(true);
    setReadError("segments", null);
    try {
      const nextSegments = await api.listSegments();
      if (isCurrent("segments", generation)) handlers.setSegments(nextSegments);
    } catch (reason) {
      if (isCurrent("segments", generation)) setReadError("segments", messageFromError(reason));
    } finally {
      if (isCurrent("segments", generation)) handlers.setSegmentsLoading(false);
    }
  }

  async function loadEvents(): Promise<void> {
    const generation = ++generations.events;
    handlers.setEventsLoading(true);
    setReadError("events", null);
    try {
      const nextEvents = await api.listEvents();
      if (isCurrent("events", generation)) handlers.setEvents(nextEvents);
    } catch (reason) {
      if (isCurrent("events", generation)) setReadError("events", messageFromError(reason));
    } finally {
      if (isCurrent("events", generation)) handlers.setEventsLoading(false);
    }
  }

  async function loadAnalytics(): Promise<void> {
    const generation = ++generations.analytics;
    handlers.setAnalyticsLoading(true);
    setReadError("analytics", null);
    try {
      const nextAnalytics = await api.analytics();
      if (isCurrent("analytics", generation)) handlers.setAnalytics(nextAnalytics);
    } catch (reason) {
      if (isCurrent("analytics", generation)) setReadError("analytics", messageFromError(reason));
    } finally {
      if (isCurrent("analytics", generation)) handlers.setAnalyticsLoading(false);
    }
  }

  async function refresh(filter: CrmWorkspaceContactFilter): Promise<void> {
    await Promise.all([loadContacts(filter), loadSegments(), loadEvents(), loadAnalytics()]);
  }

  return {
    loadContacts,
    loadSegments,
    loadEvents,
    loadAnalytics,
    refresh,
    activate() {
      disposed = false;
    },
    dispose() {
      disposed = true;
    },
  };
}

export async function refreshCrmAnalyticsAfterContactSave(
  existingContact: CrmContact | undefined,
  loadAnalytics: () => Promise<void>,
): Promise<void> {
  if (existingContact === undefined) await loadAnalytics();
}
function contactIdentityChanged(previous: CrmContact, next: CrmContact): boolean {
  return (
    previous.firstName !== next.firstName ||
    previous.lastName !== next.lastName ||
    previous.displayName !== next.displayName ||
    previous.email !== next.email ||
    previous.company !== next.company ||
    previous.phone !== next.phone
  );
}

export async function refreshCrmDuplicatesAfterContactSave(
  existingContact: CrmContact | undefined,
  nextContact: CrmContact,
  findDuplicates: (contactId: string) => Promise<CrmDuplicateReport>,
): Promise<CrmDuplicateReport | null> {
  if (existingContact === undefined || contactIdentityChanged(existingContact, nextContact)) {
    return findDuplicates(nextContact.id);
  }
  return null;
}
