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
  readonly actorName: string;
  readonly createdAt: string;
}

export interface CrmPipelineUpdateInput {
  readonly stage: CrmPipelineStage;
  readonly expectedVersion: number;
  readonly score?: number | null;
  readonly rationale?: string | null;
  readonly note?: string;
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
    readonly eventId?: string;
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
  updatePipeline(contactId: string, input: CrmPipelineUpdateInput): Promise<CrmContact>;
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

type CrmContactCollectionUpdate =
  | readonly CrmContact[]
  | ((current: readonly CrmContact[]) => readonly CrmContact[]);

interface CrmWorkspaceReadHandlers {
  readonly setContacts: (update: CrmContactCollectionUpdate) => void;
  readonly setSegments: (segments: readonly CrmSegment[]) => void;
  readonly setEvents: (events: readonly CrmEvent[]) => void;
  readonly setAnalytics: (analytics: CrmAnalytics) => void;
  readonly setContactsLoading: (loading: boolean) => void;
  readonly setSegmentsLoading: (loading: boolean) => void;
  readonly setEventsLoading: (loading: boolean) => void;
  readonly setAnalyticsLoading: (loading: boolean) => void;
  readonly setError: (error: string | null) => void;
}

export function preferNewerCrmContact(
  current: CrmContact | undefined,
  candidate: CrmContact,
): CrmContact {
  return current?.id === candidate.id && current.version > candidate.version ? current : candidate;
}

function mergeContactCollection(
  current: readonly CrmContact[],
  candidates: readonly CrmContact[],
): readonly CrmContact[] {
  const currentById = new Map(current.map((contact) => [contact.id, contact]));
  return candidates.map((candidate) =>
    preferNewerCrmContact(currentById.get(candidate.id), candidate),
  );
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
      if (isCurrent("contacts", generation)) {
        handlers.setContacts((current) => mergeContactCollection(current, nextContacts));
      }
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

export function displayName(contact: Pick<CrmContact, "displayName" | "email" | "id">): string {
  return contact.displayName.trim() || contact.email?.trim() || contact.id;
}
function outreachNameParts(contact: Pick<CrmContact, "firstName" | "lastName" | "displayName">): {
  readonly firstName: string;
  readonly lastName: string;
} {
  const displayParts = contact.displayName.trim().split(/\s+/u).filter(Boolean);
  const fallbackFirstName = displayParts[0] ?? "";
  const fallbackLastName = displayParts.slice(1).join(" ");
  return {
    firstName: contact.firstName?.trim() || fallbackFirstName,
    lastName: contact.lastName?.trim() || fallbackLastName,
  };
}

export function focusAndScroll(target: HTMLElement | null): void {
  if (target === null) return;
  if (typeof target.scrollIntoView === "function") {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  target.focus({ preventScroll: true });
}

export function humanErrorSummary(error: string): string {
  const summary =
    error
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean)
      ?.replace(/\s*\(trace(?:\s+id)?\s*[:#]?\s*[^)]+\)/gi, "")
      .replace(/\s+trace(?:\s+id)?\s*[:#]?\s*[a-z0-9-]+/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim() ?? "";
  return summary || "The CRM request could not be completed.";
}

export function customFieldText(
  contact: CrmContact | undefined,
  aliases: readonly string[],
): string {
  if (contact === undefined) return "";
  const aliasSet = new Set(aliases.map((alias) => alias.toLowerCase()));
  for (const [key, value] of Object.entries(contact.customFields)) {
    if (!aliasSet.has(key.toLowerCase())) continue;
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
  }
  return "";
}

export function contactBio(contact: CrmContact | undefined): string {
  const direct = contact?.bio?.trim();
  return direct || customFieldText(contact, ["bio", "biography", "profileBio"]);
}

export function contactHeadshotUrl(contact: CrmContact | undefined): string {
  const direct = contact?.headshotUrl?.trim();
  return (
    direct ||
    customFieldText(contact, ["headshotUrl", "headshot", "headshotAssetId", "profileImage"])
  );
}
export const CRM_MERGE_SCALAR_FIELDS: readonly {
  readonly key: CrmMergeScalarField;
  readonly label: string;
}[] = [
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "name", label: "Name" },
  { key: "company", label: "Company" },
  { key: "title", label: "Title" },
  { key: "bio", label: "Bio" },
  { key: "headshot", label: "Headshot" },
];

const CRM_PROFILE_CUSTOM_FIELD_KEYS = new Set([
  "bio",
  "biography",
  "profilebio",
  "headshoturl",
  "headshot",
  "headshotassetid",
  "profileimage",
]);

export function mergeFieldValue(contact: CrmContact, field: CrmMergeScalarField): string {
  switch (field) {
    case "email":
      return contact.email?.trim() ?? "";
    case "phone":
      return contact.phone?.trim() ?? "";
    case "name": {
      const display = contact.displayName.trim();
      const fullName = [contact.firstName ?? "", contact.lastName ?? ""]
        .map((value) => value.trim())
        .filter(Boolean)
        .join(" ");
      return display && fullName && display !== fullName
        ? `${display} (${fullName})`
        : display || fullName;
    }
    case "company":
      return contact.company?.trim() ?? "";
    case "title":
      return contact.title?.trim() ?? "";
    case "bio":
      return contactBio(contact);
    case "headshot":
      return contactHeadshotUrl(contact);
  }
}

export function mergeValueText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

export function mergeValuePresent(value: unknown): boolean {
  return mergeValueText(value).length > 0;
}

export function mergeCustomFieldKeys(contacts: readonly CrmContact[]): readonly string[] {
  const keys = new Set<string>();
  for (const contact of contacts) {
    for (const key of Object.keys(contact.customFields)) {
      if (!CRM_PROFILE_CUSTOM_FIELD_KEYS.has(key.toLowerCase())) keys.add(key);
    }
  }
  return [...keys].sort((left, right) => left.localeCompare(right));
}

export function mergeFieldHasConflict(
  contacts: readonly CrmContact[],
  field: CrmMergeScalarField,
): boolean {
  const values = contacts.reduce<Set<string>>((values, contact) => {
    const value = mergeFieldValue(contact, field);
    if (mergeValuePresent(value)) {
      values.add(value);
    }
    return values;
  }, new Set<string>());
  return values.size > 1;
}

export function mergeCustomFieldHasConflict(contacts: readonly CrmContact[], key: string): boolean {
  const values = contacts.reduce<Set<string>>((values, contact) => {
    const value = Object.hasOwn(contact.customFields, key)
      ? mergeValueText(contact.customFields[key])
      : "";
    if (mergeValuePresent(value)) {
      values.add(value);
    }
    return values;
  }, new Set<string>());
  return values.size > 1;
}

function profileCustomFields(draft: ContactDraft): Record<string, unknown> {
  const fields = parseCustomFields(draft.customFields);
  if (draft.bio.trim()) fields.bio = draft.bio.trim();
  else delete fields.bio;
  if (draft.headshotUrl.trim()) fields.headshotUrl = draft.headshotUrl.trim();
  else delete fields.headshotUrl;
  return fields;
}
export function contactDraft(contact: CrmContact | undefined): ContactDraft {
  return {
    firstName: contact?.firstName ?? "",
    lastName: contact?.lastName ?? "",
    displayName: contact?.displayName ?? "",
    email: contact?.email ?? "",
    phone: contact?.phone ?? "",
    company: contact?.company ?? "",
    title: contact?.title ?? "",
    website: contact?.website ?? "",
    linkedinUrl: contact?.linkedinUrl ?? "",
    bio: contactBio(contact),
    headshotUrl: contactHeadshotUrl(contact),
    tags: contact?.tags.join(", ") ?? "",
    customFields: Object.entries(contact?.customFields ?? {})
      .reduce<string[]>((lines, [key, value]) => {
        if (
          [
            "bio",
            "biography",
            "profileBio",
            "headshotUrl",
            "headshot",
            "headshotAssetId",
            "profileImage",
          ].includes(key)
        ) {
          return lines;
        }
        lines.push(`${key}=${typeof value === "string" ? value : JSON.stringify(value)}`);
        return lines;
      }, [])
      .join("\n"),
    notes: contact?.notes ?? "",
  };
}

function optionalValue(value: string): string | null | undefined {
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

function parseCustomFields(value: string): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const line of value.split("\n")) {
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const raw = line.slice(separator + 1).trim();
    if (!key) continue;
    try {
      fields[key] = raw.length === 0 ? null : JSON.parse(raw);
    } catch {
      fields[key] = raw;
    }
  }
  return fields;
}

export function draftInput(draft: ContactDraft): Record<string, unknown> {
  return {
    firstName: optionalValue(draft.firstName),
    lastName: optionalValue(draft.lastName),
    displayName: optionalValue(draft.displayName),
    email: optionalValue(draft.email),
    phone: optionalValue(draft.phone),
    company: optionalValue(draft.company),
    title: optionalValue(draft.title),
    website: optionalValue(draft.website),
    linkedinUrl: optionalValue(draft.linkedinUrl),
    tags: draft.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    customFields: profileCustomFields(draft),
    notes: optionalValue(draft.notes),
  };
}

function contactMergeTagValues(contact: CrmContact): Readonly<Record<string, string>> {
  const displayName = contact.displayName.trim();
  const firstName = contact.firstName?.trim() || displayName.split(/\s+/u)[0] || displayName;
  const lastName = contact.lastName?.trim() ?? "";
  return {
    first_name: firstName,
    firstName,
    last_name: lastName,
    lastName,
    display_name: displayName,
    displayName,
    email: contact.email?.trim() ?? "",
    company: contact.company?.trim() ?? "",
    title: contact.title?.trim() ?? "",
  };
}

export function renderVariablePreview(
  content: string,
  contact: CrmContact,
): { readonly value: string; readonly unknownTags: readonly string[] } {
  const { firstName, lastName } = outreachNameParts(contact);
  const values: Readonly<Record<string, string>> = {
    ...contactMergeTagValues(contact),
    first_name: firstName,
    firstName,
    last_name: lastName,
    lastName,
  };
  const unknown = new Set<string>();
  const value = content.replace(
    /\{\{\s*([A-Za-z][A-Za-z0-9_.-]{0,99})\s*\}\}/gu,
    (token, key: string) => {
      if (!Object.hasOwn(values, key)) {
        unknown.add(key);
        return token;
      }
      return values[key] ?? "";
    },
  );
  return { value, unknownTags: [...unknown].sort() };
}

export function parseCsvPreview(csv: string): {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly mapping: readonly {
    readonly sourceColumn: string;
    readonly targetField: string;
    readonly custom: boolean;
  }[];
  readonly issues: readonly string[];
} {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
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
      record.push(cell);
      cell = "";
    } else if (character === "\n") {
      record.push(cell.replace(/\r$/u, ""));
      records.push(record);
      record = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (quoted)
    return {
      headers: [],
      rows: [],
      mapping: [],
      issues: ["CSV contains an unterminated quoted field."],
    };
  if (cell.length > 0 || record.length > 0) {
    record.push(cell.replace(/\r$/u, ""));
    records.push(record);
  }
  const headers = (records[0] ?? []).map((header) => header.trim());
  const normalizedHeaders = headers.map((header) => header.toLowerCase());
  const hasEmailColumn = normalizedHeaders.includes("email");
  const importTargets: Readonly<Record<string, string>> = {
    firstname: "firstName",
    "first name": "firstName",
    lastname: "lastName",
    "last name": "lastName",
    name: "displayName",
    displayname: "displayName",
    "display name": "displayName",
    email: "email",
    phone: "phone",
    company: "company",
    title: "title",
    jobtitle: "title",
    "job title": "title",
    website: "website",
    linkedin: "linkedinUrl",
    linkedinurl: "linkedinUrl",
    notes: "notes",
    tags: "tags",
    source: "source",
    pipelinestage: "pipelineStage",
    stage: "pipelineStage",
  };
  const issues: string[] = [];
  if (headers.length === 0) issues.push("Add a header row before importing.");
  if (!hasEmailColumn) issues.push("No Email column was detected.");
  if (new Set(normalizedHeaders).size !== normalizedHeaders.length) {
    issues.push("CSV column names must be unique.");
  }
  const mapping = headers.map((sourceColumn, index) => {
    const target = importTargets[normalizedHeaders[index] ?? ""];
    return {
      sourceColumn,
      targetField: target ?? `custom.${sourceColumn}`,
      custom: target === undefined,
    };
  });
  return {
    headers,
    rows: records
      .slice(1)
      .filter((values) => values.some((value) => value.trim()))
      .slice(0, 5),
    mapping,
    issues,
  };
}
export type CsvPreview = ReturnType<typeof parseCsvPreview>;
export async function refreshSelectedContactAfterCollectionReload(input: {
  readonly contactId: string | undefined;
  readonly expectedSelectionGeneration: number;
  readonly currentSelectionGeneration: () => number;
  readonly getContact: (contactId: string) => Promise<CrmContact>;
  readonly applyContact: (contact: CrmContact) => void;
}): Promise<void> {
  if (input.contactId === undefined) return;
  const contact = await input.getContact(input.contactId);
  if (input.currentSelectionGeneration() === input.expectedSelectionGeneration) {
    input.applyContact(contact);
  }
}
