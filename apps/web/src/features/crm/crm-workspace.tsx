"use client";

import Link from "next/link";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button as UiButton } from "@/components/ui/button";
import {
  Card as UiCard,
  CardContent as UiCardContent,
  CardHeader as UiCardHeader,
  CardTitle as UiCardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import styles from "./crm-workspace.module.css";

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
  readonly created: number;
  readonly updated: number;
  readonly skipped: number;
  readonly idempotent: boolean;
  readonly mapping: readonly {
    readonly sourceColumn: string;
    readonly targetField: string;
    readonly custom: boolean;
  }[];
  readonly rows: readonly {
    readonly rowNumber: number;
    readonly identity: string | null;
    readonly status: "created" | "updated" | "skipped";
    readonly contactId: string | null;
    readonly reason: string | null;
  }[];
}

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
  importContacts(csv: string, idempotencyKey: string): Promise<CrmImportResult>;
  listSegments(): Promise<readonly CrmSegment[]>;
  createSegment(input: {
    name: string;
    description?: string;
    rules: readonly CrmSegmentRule[];
  }): Promise<CrmSegment>;
  listSegmentContacts(segmentId: string): Promise<readonly CrmContact[]>;
  findDuplicates(contactId: string): Promise<CrmDuplicateReport>;
  mergeContacts(
    contactId: string,
    duplicateContactIds: readonly string[],
    idempotencyKey: string,
    winners?: CrmMergeWinners,
  ): Promise<unknown>;
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
      variables: Record<string, string>;
    },
    idempotencyKey: string,
  ): Promise<CrmOutreachCommand>;
  analytics(): Promise<CrmAnalytics>;
  listEvents(): Promise<readonly CrmEvent[]>;
}

type CrmFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class CrmApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly traceId?: string,
  ) {
    super(message);
    this.name = "CrmApiError";
  }
}

function encode(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new TypeError(`A ${label} is required.`);
  return encodeURIComponent(normalized);
}

function unwrap<T>(payload: unknown): T {
  if (typeof payload !== "object" || payload === null || !("data" in payload)) {
    throw new CrmApiError(
      "INVALID_RESPONSE",
      200,
      "The CRM response did not include a data envelope.",
    );
  }
  return (payload as { data: T }).data;
}

function errorFromPayload(payload: unknown, status: number): CrmApiError {
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const error = (payload as { error?: { code?: string; message?: string; traceId?: string } })
      .error;
    return new CrmApiError(
      error?.code ?? "CRM_REQUEST_FAILED",
      status,
      error?.message ?? "The CRM request could not be completed.",
      error?.traceId,
    );
  }
  return new CrmApiError("CRM_REQUEST_FAILED", status, "The CRM request could not be completed.");
}

function idempotencyKey(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

export function createCrmApi(
  apiBaseUrl: string,
  organizationId: string,
  fetcher: CrmFetcher = globalThis.fetch,
): CrmApi {
  const base = apiBaseUrl.trim().replace(/\/+$/u, "");
  const organizationSegment = encode(organizationId, "organization ID");
  const crmBase = `${base}/api/admin/organizations/${organizationSegment}/crm`;
  const eventsBase = `${base}/api/admin/organizations/${organizationSegment}/events`;

  async function request<T>(path: string, init: RequestInit = {}, endpoint = crmBase): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (init.body !== undefined) headers.set("content-type", "application/json");
    const response = await fetcher(`${endpoint}${path}`, {
      ...init,
      credentials: "include",
      cache: "no-store",
      headers: Object.fromEntries(headers.entries()),
    });
    const payload = await response.json().catch(() => undefined);
    if (!response.ok) throw errorFromPayload(payload, response.status);
    return unwrap<T>(payload);
  }

  const json = (value: unknown, key?: string): RequestInit => ({
    method: "POST",
    ...(key === undefined ? {} : { headers: { "idempotency-key": key } }),
    body: JSON.stringify(value),
  });

  return {
    listContacts(filter = {}) {
      const query = new URLSearchParams();
      if (filter.query?.trim()) query.set("query", filter.query.trim());
      if (filter.company?.trim()) query.set("company", filter.company.trim());
      if (filter.pipelineStage) query.set("pipelineStage", filter.pipelineStage);
      if (filter.status) query.set("status", filter.status);
      if (filter.tags?.trim()) query.set("tags", filter.tags.trim());
      const suffix = query.toString() ? `?${query.toString()}` : "";
      return request<readonly CrmContact[]>(`/contacts${suffix}`);
    },
    getContact(contactId) {
      return request<CrmContact>(`/contacts/${encode(contactId, "contact ID")}`);
    },
    createContact(input) {
      return request<CrmContact>("/contacts", json(input));
    },
    updateContact(contactId, input) {
      return request<CrmContact>(`/contacts/${encode(contactId, "contact ID")}`, {
        ...json(input),
        method: "PATCH",
      });
    },
    importContacts(csv, key) {
      return request<CrmImportResult>("/contacts/import", json({ csv, idempotencyKey: key }, key));
    },
    listSegments() {
      return request<readonly CrmSegment[]>("/segments");
    },
    createSegment(input) {
      return request<CrmSegment>("/segments", json(input));
    },
    listSegmentContacts(segmentId) {
      return request<readonly CrmContact[]>(
        `/segments/${encode(segmentId, "segment ID")}/contacts`,
      );
    },
    findDuplicates(contactId) {
      return request<CrmDuplicateReport>(`/contacts/${encode(contactId, "contact ID")}/duplicates`);
    },
    mergeContacts(contactId, duplicateContactIds, key, winners) {
      return request<unknown>(
        `/contacts/${encode(contactId, "contact ID")}/merge`,
        json({ duplicateContactIds, ...(winners ?? {}), idempotencyKey: key }, key),
      );
    },
    getContactHistory(contactId) {
      return request<readonly CrmHistoryEntry[]>(
        `/contacts/${encode(contactId, "contact ID")}/history`,
      );
    },
    getPipelineHistory(contactId) {
      return request<readonly CrmPipelineEntry[]>(
        `/contacts/${encode(contactId, "contact ID")}/pipeline/history`,
      );
    },
    updatePipeline(contactId, stage, note) {
      return request<CrmContact>(
        `/contacts/${encode(contactId, "contact ID")}/pipeline`,
        json({ stage, ...(note?.trim() ? { note: note.trim() } : {}) }),
      );
    },
    listNotes(contactId) {
      return request<readonly CrmNote[]>(`/contacts/${encode(contactId, "contact ID")}/notes`);
    },
    addNote(contactId, body) {
      return request<CrmNote>(`/contacts/${encode(contactId, "contact ID")}/notes`, json({ body }));
    },
    addContactToEvent(contactId, input, key) {
      return request<CrmEventProjectionResult>(
        `/contacts/${encode(contactId, "contact ID")}/events`,
        json({ ...input, idempotencyKey: key }, key),
      );
    },
    sendOutreach(input, key) {
      return request<CrmOutreachCommand>("/outreach", json({ ...input, idempotencyKey: key }, key));
    },
    analytics() {
      return request<CrmAnalytics>("/analytics");
    },
    listEvents() {
      return request<readonly CrmEvent[]>("", {}, eventsBase);
    },
  };
}

function displayName(contact: Pick<CrmContact, "displayName" | "email" | "id">): string {
  return contact.displayName.trim() || contact.email?.trim() || contact.id;
}

function formatDate(value: string | undefined): string {
  if (value === undefined || value.length === 0) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
function focusAndScroll(target: HTMLElement | null): void {
  if (target === null) return;
  if (typeof target.scrollIntoView === "function") {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  target.focus({ preventScroll: true });
}

function messageFromError(error: unknown): string {
  if (error instanceof CrmApiError) {
    return error.traceId
      ? `${error.message}\nTechnical reference: trace ${error.traceId}`
      : error.message;
  }
  return error instanceof Error ? error.message : "The CRM request could not be completed.";
}

function humanErrorSummary(error: string): string {
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

function customFieldText(contact: CrmContact | undefined, aliases: readonly string[]): string {
  if (contact === undefined) return "";
  const aliasSet = new Set(aliases.map((alias) => alias.toLowerCase()));
  for (const [key, value] of Object.entries(contact.customFields)) {
    if (!aliasSet.has(key.toLowerCase())) continue;
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
  }
  return "";
}

function contactBio(contact: CrmContact | undefined): string {
  const direct = contact?.bio?.trim();
  return direct || customFieldText(contact, ["bio", "biography", "profileBio"]);
}

function contactHeadshotUrl(contact: CrmContact | undefined): string {
  const direct = contact?.headshotUrl?.trim();
  return (
    direct ||
    customFieldText(contact, ["headshotUrl", "headshot", "headshotAssetId", "profileImage"])
  );
}
const CRM_MERGE_SCALAR_FIELDS: readonly {
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

function mergeFieldValue(contact: CrmContact, field: CrmMergeScalarField): string {
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

function mergeValueText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function mergeValuePresent(value: unknown): boolean {
  return mergeValueText(value).length > 0;
}

function mergeCustomFieldKeys(contacts: readonly CrmContact[]): readonly string[] {
  const keys = new Set<string>();
  for (const contact of contacts) {
    for (const key of Object.keys(contact.customFields)) {
      if (!CRM_PROFILE_CUSTOM_FIELD_KEYS.has(key.toLowerCase())) keys.add(key);
    }
  }
  return [...keys].sort((left, right) => left.localeCompare(right));
}

function mergeFieldHasConflict(
  contacts: readonly CrmContact[],
  field: CrmMergeScalarField,
): boolean {
  const values = new Set(
    contacts.map((contact) => mergeFieldValue(contact, field)).filter(mergeValuePresent),
  );
  return values.size > 1;
}

function mergeCustomFieldHasConflict(contacts: readonly CrmContact[], key: string): boolean {
  const values = new Set(
    contacts
      .map((contact) =>
        Object.hasOwn(contact.customFields, key) ? mergeValueText(contact.customFields[key]) : "",
      )
      .filter(mergeValuePresent),
  );
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
function contactDraft(contact: CrmContact | undefined): ContactDraft {
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
      .filter(
        ([key]) =>
          ![
            "bio",
            "biography",
            "profileBio",
            "headshotUrl",
            "headshot",
            "headshotAssetId",
            "profileImage",
          ].includes(key),
      )
      .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`)
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

function draftInput(draft: ContactDraft): Record<string, unknown> {
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

function renderVariablePreview(
  content: string,
  contact: CrmContact,
): { readonly value: string; readonly unknownTags: readonly string[] } {
  const values: Readonly<Record<string, string>> = {
    first_name: contact.firstName ?? "",
    firstName: contact.firstName ?? "",
    last_name: contact.lastName ?? "",
    lastName: contact.lastName ?? "",
    displayName: contact.displayName,
    email: contact.email ?? "",
    company: contact.company ?? "",
    title: contact.title ?? "",
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

function parseCsvPreview(csv: string): {
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
function Card({
  title,
  eyebrow,
  children,
  actions,
}: Readonly<{ title: string; eyebrow?: string; children: ReactNode; actions?: ReactNode }>) {
  return (
    <UiCard className={styles.card}>
      <UiCardHeader className={styles.cardHeader}>
        <div>
          {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
          <UiCardTitle>
            <h2>{title}</h2>
          </UiCardTitle>
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </UiCardHeader>
      <UiCardContent className={styles.cardContent}>{children}</UiCardContent>
    </UiCard>
  );
}

function ContactEditor({
  contact,
  busy,
  onSave,
  onCancel,
}: Readonly<{
  contact?: CrmContact;
  busy: boolean;
  onSave: (draft: ContactDraft) => Promise<void>;
  onCancel?: () => void;
}>) {
  const [draft, setDraft] = useState<ContactDraft>(() => contactDraft(contact));
  const [formError, setFormError] = useState<string | null>(null);
  useEffect(() => {
    setDraft(contactDraft(contact));
    setFormError(null);
  }, [contact]);

  function update(key: keyof ContactDraft, value: string): void {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (draft.email.trim().length === 0 && draft.displayName.trim().length === 0) {
      setFormError("Add a display name or email before saving the contact.");
      return;
    }
    setFormError(null);
    await onSave(draft);
  }
  const field = (key: keyof ContactDraft, label: string, type = "text") => (
    <label className={styles.field} key={key}>
      <span>{label}</span>
      <input
        type={type}
        value={draft[key]}
        onChange={(event) => update(key, event.currentTarget.value)}
      />
    </label>
  );
  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <div className={styles.formGrid}>
        {field("firstName", "First name")}
        {field("lastName", "Last name")}
        {field("displayName", "Display name")}
        {field("email", "Email", "email")}
        {field("phone", "Phone", "tel")}
        {field("company", "Company")}
        {field("title", "Title")}
        {field("website", "Website", "url")}
        {field("linkedinUrl", "LinkedIn URL", "url")}
      </div>
      <label className={styles.field}>
        <span>Bio</span>
        <textarea
          rows={4}
          value={draft.bio}
          onChange={(event) => update("bio", event.currentTarget.value)}
          placeholder="A short speaker biography"
        />
      </label>
      <label className={styles.field}>
        <span>Headshot/profile image URL</span>
        <input
          type="url"
          value={draft.headshotUrl}
          onChange={(event) => update("headshotUrl", event.currentTarget.value)}
          placeholder="https://…"
        />
      </label>
      <label className={styles.field}>
        <span>Tags (comma-separated)</span>
        <input value={draft.tags} onChange={(event) => update("tags", event.currentTarget.value)} />
      </label>
      <label className={styles.field}>
        <span>Custom fields (one key=value per line)</span>
        <textarea
          rows={3}
          value={draft.customFields}
          onChange={(event) => update("customFields", event.currentTarget.value)}
          placeholder="region=west\npriority=high"
        />
      </label>
      <label className={styles.field}>
        <span>Contact notes</span>
        <textarea
          rows={3}
          value={draft.notes}
          onChange={(event) => update("notes", event.currentTarget.value)}
        />
      </label>
      {formError ? (
        <p className={styles.error} role="alert">
          {formError}
        </p>
      ) : null}
      <div className={styles.actions}>
        <UiButton type="submit" disabled={busy}>
          {busy ? "Saving…" : contact ? "Save contact" : "Add contact"}
        </UiButton>
        {onCancel ? (
          <UiButton variant="outline" type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </UiButton>
        ) : null}
      </div>
    </form>
  );
}

function DirectoryTable({
  contacts,
  selectedContactId,
  selectedContactIds,
  loading,
  onSelect,
  onToggleSelection,
  onToggleAll,
}: Readonly<{
  contacts: readonly CrmContact[];
  selectedContactId: string | null;
  selectedContactIds: readonly string[];
  loading: boolean;
  onSelect: (contactId: string) => void;
  onToggleSelection: (contactId: string) => void;
  onToggleAll: (checked: boolean) => void;
}>) {
  if (loading) {
    return (
      <div
        className={styles.loading}
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label="Loading contact directory"
      >
        Updating the contact directory for the current filters…
      </div>
    );
  }
  return contacts.length === 0 ? (
    <p className={styles.emptyState}>
      No contacts match these filters. Add a contact or import a CSV directory.
    </p>
  ) : (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className={styles.srOnly}>Organization CRM contact directory</caption>
        <thead>
          <tr>
            <th scope="col">
              <input
                type="checkbox"
                aria-label="Select all visible contacts"
                checked={
                  contacts.length > 0 &&
                  contacts.every((contact) => selectedContactIds.includes(contact.id))
                }
                onChange={(event) => onToggleAll(event.currentTarget.checked)}
                disabled={loading}
              />
            </th>
            <th scope="col">Contact</th>
            <th scope="col">Company</th>
            <th scope="col">Tags</th>
            <th scope="col">Pipeline</th>
            <th scope="col">
              <span className={styles.srOnly}>Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((contact) => (
            <tr
              key={contact.id}
              className={selectedContactId === contact.id ? styles.selectedRow : undefined}
            >
              <td>
                <input
                  type="checkbox"
                  aria-label={`Select ${displayName(contact)}`}
                  checked={selectedContactIds.includes(contact.id)}
                  onChange={() => onToggleSelection(contact.id)}
                  disabled={loading}
                />
              </td>
              <th scope="row">
                <button
                  className={styles.tableLink}
                  type="button"
                  onClick={() => onSelect(contact.id)}
                  disabled={loading}
                >
                  {displayName(contact)}
                </button>
                <small>{contact.email ?? "No email"}</small>
              </th>
              <td>{contact.company ?? "—"}</td>
              <td>
                <div className={styles.tagList}>
                  {contact.tags.length > 0
                    ? contact.tags.map((tag) => (
                        <Badge variant="secondary" className={styles.tag} key={tag}>
                          {tag}
                        </Badge>
                      ))
                    : "—"}
                </div>
              </td>
              <td>
                <Badge variant="outline" className={styles.stageBadge}>
                  {contact.pipelineStage}
                </Badge>
              </td>
              <td>
                <button
                  className={styles.secondaryButtonSmall}
                  type="button"
                  onClick={() => onSelect(contact.id)}
                  disabled={loading}
                >
                  Open
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SegmentManager({
  segments,
  busy,
  currentRules,
  onCreate,
  onSelect,
}: Readonly<{
  segments: readonly CrmSegment[];
  busy: boolean;
  currentRules: readonly CrmSegmentRule[];
  onCreate: (input: {
    name: string;
    description: string;
    rules: readonly CrmSegmentRule[];
  }) => Promise<void>;
  onSelect: (segmentId: string) => void;
}>) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [field, setField] = useState("pipelineStage");
  const [operator, setOperator] = useState<CrmSegmentOperator>("eq");
  const [value, setValue] = useState("new");
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!name.trim() || !field.trim()) return;
    const rules =
      currentRules.length > 0
        ? currentRules
        : [{ field: field.trim(), operator, ...(value.trim() ? { value: value.trim() } : {}) }];
    await onCreate({
      name: name.trim(),
      description: description.trim(),
      rules,
    });
    setName("");
    setDescription("");
  }
  return (
    <Card title="Saved dynamic segments" eyebrow="Audience building">
      <div className={styles.segmentLayout}>
        <div>
          {segments.length === 0 ? (
            <p className={styles.muted}>No saved segments yet.</p>
          ) : (
            <ul className={styles.segmentList}>
              {segments.map((segment) => (
                <li key={segment.id}>
                  <button
                    type="button"
                    className={styles.segmentButton}
                    onClick={() => onSelect(segment.id)}
                  >
                    <strong>{segment.name}</strong>
                    <small>
                      {segment.rules
                        .map((rule) => `${rule.field} ${rule.operator} ${String(rule.value ?? "")}`)
                        .join(" · ")}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {currentRules.length > 0 ? (
          <div className={styles.filterSummary} role="status">
            <strong>Current directory filters will be saved:</strong>{" "}
            {currentRules
              .map((rule) => `${rule.field} ${rule.operator} ${String(rule.value ?? "")}`)
              .join(" · ")}
          </div>
        ) : null}
        <form className={styles.form} onSubmit={(event) => void submit(event)}>
          <h3>
            {currentRules.length > 0 ? "Save current directory filters" : "Create a named segment"}
          </h3>
          <label className={styles.field}>
            <span>Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              required
              placeholder="West coast prospects"
            />
          </label>
          <label className={styles.field}>
            <span>Description</span>
            <input
              value={description}
              onChange={(event) => setDescription(event.currentTarget.value)}
            />
          </label>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Rule field</span>
              <input value={field} onChange={(event) => setField(event.currentTarget.value)} />
            </label>
            <label className={styles.field}>
              <span>Operator</span>
              <select
                value={operator}
                onChange={(event) => setOperator(event.currentTarget.value as CrmSegmentOperator)}
              >
                {["eq", "neq", "contains", "startsWith", "endsWith", "in", "notIn", "exists"].map(
                  (candidate) => (
                    <option key={candidate} value={candidate}>
                      {candidate}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>
          <label className={styles.field}>
            <span>Rule value</span>
            <input
              value={value}
              onChange={(event) => setValue(event.currentTarget.value)}
              placeholder="new"
            />
          </label>
          <button className={styles.primaryButton} type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save segment"}
          </button>
        </form>
      </div>
    </Card>
  );
}

function PipelineBoard({
  contacts,
  onMove,
  onSelect,
  onEnroll,
}: Readonly<{
  contacts: readonly CrmContact[];
  onMove: (contactId: string, stage: CrmPipelineStage) => void;
  onSelect: (contactId: string) => void;
  onEnroll: (input: {
    contactId: string;
    stage: CrmPipelineStage;
    score: string;
    rationale: string;
  }) => Promise<void>;
}>) {
  const [showEnroll, setShowEnroll] = useState(false);
  const [enrollContactId, setEnrollContactId] = useState(contacts[0]?.id ?? "");
  const [enrollStage, setEnrollStage] = useState<CrmPipelineStage>("new");
  const [enrollScore, setEnrollScore] = useState("");
  const [enrollRationale, setEnrollRationale] = useState("");

  async function submitEnrollment(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!enrollContactId) return;
    await onEnroll({
      contactId: enrollContactId,
      stage: enrollStage,
      score: enrollScore,
      rationale: enrollRationale,
    });
    setEnrollScore("");
    setEnrollRationale("");
    setShowEnroll(false);
  }

  return (
    <Card
      title="Pipeline board"
      eyebrow="Stage transitions and history"
      actions={
        <button
          className={styles.primaryButton}
          type="button"
          onClick={() => setShowEnroll((current) => !current)}
        >
          {showEnroll ? "Close enrollment" : "+ Enroll contact"}
        </button>
      }
    >
      {showEnroll ? (
        <form className={styles.enrollBox} onSubmit={(event) => void submitEnrollment(event)}>
          <h3>Enroll a contact in the pipeline</h3>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Contact</span>
              <select
                aria-label="Pipeline contact"
                value={enrollContactId}
                onChange={(event) => setEnrollContactId(event.currentTarget.value)}
                required
              >
                <option value="">Choose a contact</option>
                {contacts.map((contact) => (
                  <option value={contact.id} key={contact.id}>
                    {displayName(contact)}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Starting stage</span>
              <select
                aria-label="Pipeline starting stage"
                value={enrollStage}
                onChange={(event) => setEnrollStage(event.currentTarget.value as CrmPipelineStage)}
              >
                {CRM_PIPELINE_STAGES.map((stage) => (
                  <option value={stage} key={stage}>
                    {stage}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Score (0–100, optional)</span>
              <input
                type="number"
                min={0}
                max={100}
                value={enrollScore}
                onChange={(event) => setEnrollScore(event.currentTarget.value)}
              />
            </label>
          </div>
          <label className={styles.field}>
            <span>Rationale (optional)</span>
            <textarea
              rows={3}
              value={enrollRationale}
              onChange={(event) => setEnrollRationale(event.currentTarget.value)}
              placeholder="Why is this contact a fit?"
            />
          </label>
          <button className={styles.primaryButton} type="submit">
            Enroll in pipeline
          </button>
        </form>
      ) : null}
      <div className={styles.pipelineBoard}>
        {CRM_PIPELINE_STAGES.map((stage) => {
          const stageContacts = contacts.filter((contact) => contact.pipelineStage === stage);
          return (
            <section
              className={styles.pipelineColumn}
              key={stage}
              aria-labelledby={`pipeline-${stage}`}
            >
              <div className={styles.pipelineColumnHeader}>
                <h3 id={`pipeline-${stage}`}>{stage}</h3>
                <span>{stageContacts.length}</span>
              </div>
              {stageContacts.length === 0 ? (
                <p className={styles.muted}>No contacts</p>
              ) : (
                stageContacts.map((contact) => (
                  <article className={styles.pipelineCard} key={contact.id}>
                    <button
                      className={styles.pipelineCardButton}
                      aria-label={`Open pipeline card detail for ${displayName(contact)}`}
                      type="button"
                      onClick={() => onSelect(contact.id)}
                    >
                      <strong>{displayName(contact)}</strong>
                      <small>{contact.company ?? contact.email ?? ""}</small>
                      {customFieldText(contact, ["score", "pipelineScore"]) ? (
                        <small>Score {customFieldText(contact, ["score", "pipelineScore"])}</small>
                      ) : null}
                    </button>
                    <label className={styles.srOnly} htmlFor={`pipeline-move-${contact.id}`}>
                      Move {displayName(contact)}
                    </label>
                    <select
                      id={`pipeline-move-${contact.id}`}
                      value={contact.pipelineStage}
                      onChange={(event) =>
                        onMove(contact.id, event.currentTarget.value as CrmPipelineStage)
                      }
                    >
                      {CRM_PIPELINE_STAGES.map((candidate) => (
                        <option key={candidate} value={candidate}>
                          {candidate}
                        </option>
                      ))}
                    </select>
                  </article>
                ))
              )}
            </section>
          );
        })}
      </div>
    </Card>
  );
}

function AnalyticsPanel({
  analytics,
  events,
  onEventDrillThrough,
}: Readonly<{
  analytics: CrmAnalytics | null;
  events: readonly CrmEvent[];
  onEventDrillThrough: (eventId: string) => void;
}>) {
  if (analytics === null)
    return (
      <Card title="CRM analytics" eyebrow="Organization insights">
        <p className={styles.muted}>Analytics are not available yet.</p>
      </Card>
    );
  const eventName = new Map(events.map((event) => [event.id, event.name]));
  return (
    <Card
      title="CRM analytics"
      eyebrow="Organization insights"
      actions={<span className={styles.muted}>Updated {formatDate(analytics.generatedAt)}</span>}
    >
      <div className={styles.kpiGrid}>
        <div className={styles.kpi}>
          <span>Total contacts</span>
          <strong>{analytics.totalContacts}</strong>
        </div>
        <div className={styles.kpi}>
          <span>Active contacts</span>
          <strong>{analytics.activeContacts}</strong>
        </div>
        <div className={styles.kpi}>
          <span>Queued outreach</span>
          <strong>{analytics.outreach.queued}</strong>
        </div>
        <div className={styles.kpi}>
          <span>Sent outreach</span>
          <strong>{analytics.outreach.sent}</strong>
        </div>
        <div className={styles.kpi}>
          <span>Failed outreach</span>
          <strong>{analytics.outreach.failed}</strong>
        </div>
      </div>
      <div className={styles.analyticsGrid}>
        <div>
          <h3>Pipeline conversion</h3>
          <ul className={styles.metricList}>
            {CRM_PIPELINE_STAGES.map((stage) => (
              <li key={stage}>
                <span>{stage}</span>
                <strong>{analytics.contactsByPipelineStage[stage] ?? 0}</strong>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Contacts by source</h3>
          <ul className={styles.metricList}>
            {Object.entries(analytics.contactsBySource).map(([source, count]) => (
              <li key={source}>
                <span>{source}</span>
                <strong>{count}</strong>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Event reach</h3>
          {analytics.contactsByEvent.length === 0 ? (
            <p className={styles.muted}>No event projections yet.</p>
          ) : (
            <ul className={styles.metricList}>
              {analytics.contactsByEvent.map(({ eventId, count }) => (
                <li key={eventId}>
                  <span>{eventName.get(eventId) ?? eventId}</span>
                  <button
                    className={styles.metricButton}
                    type="button"
                    onClick={() => onEventDrillThrough(eventId)}
                  >
                    {count} · View contacts
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}

export interface CrmWorkspaceViewProps {
  readonly organizationId: string;
  readonly contacts: readonly CrmContact[];
  readonly selectedContact?: CrmContact | undefined;
  readonly segments: readonly CrmSegment[];
  readonly events: readonly CrmEvent[];
  readonly history: readonly CrmHistoryEntry[];
  readonly pipelineHistory: readonly CrmPipelineEntry[];
  readonly notes: readonly CrmNote[];
  readonly duplicates: CrmDuplicateReport | null;
  readonly analytics: CrmAnalytics | null;
  readonly loading?: boolean;
  readonly initialImportOpen?: boolean;
  readonly initialImportCsv?: string;
  readonly busy?: boolean;
  readonly error?: string | null;
  readonly statusMessage?: string | null;
  readonly query?: string;
  readonly companyFilter?: string;
  readonly tagsFilter?: string;
  readonly pipelineFilter?: CrmPipelineStage | "";
  readonly statusFilter?: CrmContactStatus | "";
  readonly selectedContactId?: string | null;
  readonly selectedContactIds?: readonly string[];
  readonly onQueryChange?: (value: string) => void;
  readonly onCompanyChange?: (value: string) => void;
  readonly onTagsChange?: (value: string) => void;
  readonly onPipelineFilterChange?: (value: CrmPipelineStage | "") => void;
  readonly onStatusFilterChange?: (value: CrmContactStatus | "") => void;
  readonly onRefresh?: () => void;
  readonly onSelectContact?: (contactId: string) => void;
  readonly onSelectionChange?: (contactIds: readonly string[]) => void;
  readonly onStartAdd?: () => void;
  readonly onSaveContact?: (draft: ContactDraft) => Promise<void>;
  readonly onCancelEdit?: () => void;
  readonly onImport?: (csv: string) => Promise<void>;
  readonly importResult?: CrmImportResult | null;
  readonly onCreateSegment?: (input: {
    name: string;
    description: string;
    rules: readonly CrmSegmentRule[];
  }) => Promise<void>;
  readonly onSelectSegment?: (segmentId: string) => void;
  readonly onFindDuplicates?: () => void;
  readonly onMerge?: (plan: CrmMergePlan) => Promise<void>;
  readonly onMovePipeline?: (contactId: string, stage: CrmPipelineStage) => void;
  readonly onEnrollPipeline?: (input: {
    contactId: string;
    stage: CrmPipelineStage;
    score: string;
    rationale: string;
  }) => Promise<void>;
  readonly onSavePipeline?: (stage: CrmPipelineStage, note: string) => Promise<void>;
  readonly onAddNote?: (body: string) => Promise<void>;
  readonly onAddToEvent?: (input: {
    eventId: string;
    role: "speaker" | "prospect" | "attendee" | "sponsor";
    note: string;
  }) => Promise<void>;
  readonly lastAddedEventId?: string | null;
  readonly lastEventResult?: CrmEventProjectionResult | null;
  readonly onPreviewOutreach?: (input: {
    subject: string;
    body: string;
    contactIds?: readonly string[];
    segmentId?: string;
    eventId?: string;
  }) => Promise<void>;
  readonly outreachPreview?: CrmOutreachPreview | null;
  readonly outreachRecipients?: readonly CrmContact[];
  readonly onSendOutreach?: () => Promise<void>;
  readonly outreachResults?: readonly CrmOutreachCommand[];
  readonly onAnalyticsEventDrillThrough?: (eventId: string) => void;
}

export function CrmWorkspaceView({
  organizationId,
  contacts,
  selectedContact,
  segments,
  events,
  history,
  pipelineHistory,
  notes,
  duplicates,
  analytics,
  loading = false,
  initialImportOpen = false,
  initialImportCsv = "",
  busy = false,
  error = null,
  statusMessage = null,
  query = "",
  companyFilter = "",
  tagsFilter = "",
  pipelineFilter = "",
  statusFilter = "",
  selectedContactId = null,
  selectedContactIds = [],
  onQueryChange,
  onCompanyChange,
  onTagsChange,
  onPipelineFilterChange,
  onStatusFilterChange,
  onRefresh,
  onSelectContact,
  onSelectionChange,
  onStartAdd,
  onSaveContact,
  onCancelEdit,
  onImport,
  importResult = null,
  onCreateSegment,
  onSelectSegment,
  onFindDuplicates,
  onMerge,
  onMovePipeline,
  onEnrollPipeline,
  onSavePipeline,
  onAddNote,
  onAddToEvent,
  lastAddedEventId = null,
  lastEventResult = null,
  onPreviewOutreach,
  outreachPreview = null,
  onSendOutreach,
  outreachResults = [],
  onAnalyticsEventDrillThrough,
}: CrmWorkspaceViewProps) {
  const [importCsv, setImportCsv] = useState(initialImportCsv);
  const [importFileName, setImportFileName] = useState("");
  const [importPreview, setImportPreview] = useState<ReturnType<typeof parseCsvPreview> | null>(
    initialImportCsv.trim() ? parseCsvPreview(initialImportCsv) : null,
  );
  const [noteBody, setNoteBody] = useState("");
  const [pipelineStage, setPipelineStage] = useState<CrmPipelineStage>(
    selectedContact?.pipelineStage ?? "new",
  );
  const [pipelineNote, setPipelineNote] = useState("");
  const [eventId, setEventId] = useState("");
  const [eventRole, setEventRole] = useState<"speaker" | "prospect" | "attendee" | "sponsor">(
    "prospect",
  );
  const [eventNote, setEventNote] = useState("");
  const [outreachSegmentId, setOutreachSegmentId] = useState("");
  const [outreachContextSegmentId, setOutreachContextSegmentId] = useState("");
  const [outreachEventId, setOutreachEventId] = useState("");
  const [outreachSubject, setOutreachSubject] = useState("Invitation from {{first_name}}");
  const [outreachBody, setOutreachBody] = useState(
    "Hi {{first_name}},\n\nWe would love to have you join us.",
  );
  const [mergeSelection, setMergeSelection] = useState<readonly string[]>([]);
  const [mergeReviewOpen, setMergeReviewOpen] = useState(false);
  const [mergeConfirmed, setMergeConfirmed] = useState(false);
  const [mergeSubmitting, setMergeSubmitting] = useState(false);
  const [mergeCompleted, setMergeCompleted] = useState(false);
  const [mergeCompletedContactId, setMergeCompletedContactId] = useState<string | null>(null);
  const [mergeFieldWinners, setMergeFieldWinners] = useState<
    Partial<Record<CrmMergeScalarField, string>>
  >({});
  const [mergeCustomFieldWinners, setMergeCustomFieldWinners] = useState<Record<string, string>>(
    {},
  );
  const mergeSubmitRef = useRef(false);
  const duplicateReviewRef = useRef<HTMLDivElement>(null);
  const outreachComposerRef = useRef<HTMLDivElement>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showImport, setShowImport] = useState(initialImportOpen);
  const [noteError, setNoteError] = useState<string | null>(null);
  useEffect(() => {
    if (selectedContact) setPipelineStage(selectedContact.pipelineStage);
    setMergeSelection([]);
    setMergeReviewOpen(false);
    setMergeConfirmed(false);
    setMergeFieldWinners({});
    setMergeCustomFieldWinners({});
  }, [selectedContact]);
  useEffect(() => {
    if (lastAddedEventId) setEventId(lastAddedEventId);
  }, [lastAddedEventId]);

  useEffect(() => {
    if (selectedContactIds.length === 0 && outreachSegmentId === "__selected__")
      setOutreachSegmentId("");
  }, [outreachSegmentId, selectedContactIds.length]);

  async function readImportFile(file: File): Promise<void> {
    try {
      const csv = await file.text();
      setImportFileName(file.name);
      setImportCsv(csv);
      setImportPreview(parseCsvPreview(csv));
    } catch (reason) {
      setImportFileName("");
      setImportCsv("");
      setImportPreview({
        headers: [],
        rows: [],
        mapping: [],
        issues: [messageFromError(reason)],
      });
    }
  }
  async function saveNote(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!noteBody.trim() || onAddNote === undefined) return;
    setNoteError(null);
    try {
      await onAddNote(noteBody.trim());
      setNoteBody("");
    } catch (reason) {
      setNoteError(messageFromError(reason));
    }
  }
  async function saveEvent(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!eventId.trim() || onAddToEvent === undefined) return;
    await onAddToEvent({ eventId: eventId.trim(), role: eventRole, note: eventNote.trim() });
    setEventNote("");
  }
  async function previewOutreach(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (onPreviewOutreach === undefined) return;
    const selectedAudience = outreachSegmentId === "__selected__";
    const segmentId = selectedAudience ? outreachContextSegmentId : outreachSegmentId;
    await onPreviewOutreach({
      subject: outreachSubject,
      body: outreachBody,
      ...(selectedAudience && selectedContactIds.length > 0
        ? { contactIds: selectedContactIds }
        : {}),
      ...(segmentId ? { segmentId } : {}),
      ...(outreachEventId ? { eventId: outreachEventId } : {}),
    });
  }
  const selectedEvent = events.find((event) => event.id === eventId);
  const currentFilterRules = useMemo(() => {
    const rules: CrmSegmentRule[] = [];
    if (query.trim())
      rules.push({ field: "displayName", operator: "contains", value: query.trim() });
    if (companyFilter.trim())
      rules.push({ field: "company", operator: "contains", value: companyFilter.trim() });
    for (const tag of tagsFilter
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)) {
      rules.push({ field: "tags", operator: "contains", value: tag });
    }
    if (pipelineFilter)
      rules.push({ field: "pipelineStage", operator: "eq", value: pipelineFilter });
    if (statusFilter) rules.push({ field: "status", operator: "eq", value: statusFilter });
    return rules;
  }, [companyFilter, pipelineFilter, query, statusFilter, tagsFilter]);
  const mergeCandidates =
    selectedContact && duplicates?.contactId === selectedContact.id
      ? duplicates.matches.filter(
          (match) =>
            match.contact.id !== selectedContact.id &&
            match.contact.organizationId === organizationId &&
            match.contact.status === "active",
        )
      : [];
  const selectedMergeContacts = mergeCandidates.filter((match) =>
    mergeSelection.includes(match.contact.id),
  );
  const mergeReviewContacts = selectedContact
    ? [selectedContact, ...selectedMergeContacts.map((match) => match.contact)]
    : [];
  const mergeCustomKeys = mergeCustomFieldKeys(mergeReviewContacts);
  const conflictingScalarFields = CRM_MERGE_SCALAR_FIELDS.filter(({ key }) =>
    mergeFieldHasConflict(mergeReviewContacts, key),
  );
  const conflictingCustomKeys = mergeCustomKeys.filter((key) =>
    mergeCustomFieldHasConflict(mergeReviewContacts, key),
  );
  const outreachHasUnknownTags =
    outreachPreview?.recipients.some((recipient) => recipient.unknownTags.length > 0) ?? false;

  function openMergeReview(): void {
    if (!selectedContact || selectedMergeContacts.length === 0) return;
    const nextFieldWinners: Partial<Record<CrmMergeScalarField, string>> = {};
    for (const { key: field } of CRM_MERGE_SCALAR_FIELDS) {
      const primaryValue = mergeFieldValue(selectedContact, field);
      const fallback = selectedMergeContacts.find((match) =>
        mergeValuePresent(mergeFieldValue(match.contact, field)),
      );
      nextFieldWinners[field] =
        mergeFieldHasConflict(mergeReviewContacts, field) && !mergeValuePresent(primaryValue)
          ? (fallback?.contact.id ?? selectedContact.id)
          : selectedContact.id;
    }
    const nextCustomFieldWinners: Record<string, string> = {};
    for (const key of mergeCustomKeys) {
      const primaryValue = Object.hasOwn(selectedContact.customFields, key)
        ? selectedContact.customFields[key]
        : "";
      const fallback = selectedMergeContacts.find((match) =>
        mergeValuePresent(match.contact.customFields[key]),
      );
      nextCustomFieldWinners[key] =
        mergeCustomFieldHasConflict(mergeReviewContacts, key) && !mergeValuePresent(primaryValue)
          ? (fallback?.contact.id ?? selectedContact.id)
          : selectedContact.id;
    }
    setMergeFieldWinners(nextFieldWinners);
    setMergeCustomFieldWinners(nextCustomFieldWinners);
    setMergeConfirmed(false);
    setMergeCompleted(false);
    setMergeCompletedContactId(null);
    setMergeReviewOpen(true);
  }

  function closeMergeReview(): void {
    if (mergeSubmitting) return;
    setMergeReviewOpen(false);
    setMergeConfirmed(false);
  }

  async function submitMerge(): Promise<void> {
    if (
      mergeSubmitRef.current ||
      mergeSubmitting ||
      !selectedContact ||
      selectedMergeContacts.length === 0 ||
      !mergeConfirmed ||
      onMerge === undefined
    ) {
      return;
    }
    const primaryContact = selectedContact;
    mergeSubmitRef.current = true;
    setMergeSubmitting(true);
    const fieldWinners = {} as Record<CrmMergeScalarField, string>;
    for (const { key: field } of CRM_MERGE_SCALAR_FIELDS) {
      fieldWinners[field] = mergeFieldWinners[field] ?? primaryContact.id;
    }
    try {
      await onMerge({
        duplicateContactIds: selectedMergeContacts.map((match) => match.contact.id),
        fieldWinners,
        customFieldWinners: { ...mergeCustomFieldWinners },
      });
      setMergeCompleted(true);
      setMergeCompletedContactId(primaryContact.id);
    } catch {
      // The owning workspace presents the API error; keep the review open for a retry.
    } finally {
      mergeSubmitRef.current = false;
      setMergeSubmitting(false);
    }
  }
  function focusDuplicateReview(): void {
    focusAndScroll(duplicateReviewRef.current);
  }

  function focusOutreachComposer(): void {
    focusAndScroll(outreachComposerRef.current);
  }
  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#crm-content">
        Skip to CRM content
      </a>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Organization workspace · {organizationId}</p>
          <h1>Organization CRM</h1>
          <p className={styles.heroText}>
            One authoritative directory for speaker identity, event relationships, pipeline
            follow-up, and personalized outreach.
          </p>
        </div>
        <div className={styles.heroActions}>
          <Link
            className={styles.secondaryButton}
            href={`/admin/organizations/${encodeURIComponent(organizationId)}/members`}
          >
            Members
          </Link>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={onRefresh}
            disabled={busy}
          >
            Refresh
          </button>
        </div>
      </header>
      <main id="crm-content" className={styles.content} tabIndex={-1}>
        {analytics && contacts.length > 0 ? (
          <section className={styles.summaryBar} aria-labelledby="crm-analytics-summary-title">
            <div>
              <p className={styles.eyebrow}>CRM analytics</p>
              <h2 id="crm-analytics-summary-title">Contact snapshot</h2>
              <p className={styles.resultCount}>
                {analytics.totalContacts} total contacts · {analytics.activeContacts} active
              </p>
              <p className={styles.muted}>
                Pipeline:{" "}
                {CRM_PIPELINE_STAGES.map(
                  (stage) => `${stage}: ${analytics.contactsByPipelineStage[stage] ?? 0}`,
                ).join(" · ")}
              </p>
            </div>
            <a
              className={styles.secondaryButton}
              href="#crm-analytics"
              aria-controls="crm-analytics"
            >
              Open CRM analytics
            </a>
          </section>
        ) : null}
        {error ? (
          <Alert className={styles.alert} variant="destructive">
            <AlertTitle>We couldn't complete that CRM action.</AlertTitle>
            <AlertDescription>
              <p>{humanErrorSummary(error)}</p>
              {onRefresh ? (
                <UiButton
                  className={styles.alertAction}
                  type="button"
                  onClick={onRefresh}
                  disabled={busy}
                >
                  Try again
                </UiButton>
              ) : null}
              {error.includes("\n") ? (
                <details className={styles.errorDetails}>
                  <summary>Show technical details</summary>
                  <pre>{error}</pre>
                </details>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
        <div className={styles.status} role="status" aria-live="polite">
          {statusMessage}
        </div>
        {loading ? (
          <div
            className={styles.loading}
            role="status"
            aria-live="polite"
            aria-busy="true"
            aria-label="Loading organization CRM data"
          >
            Loading organization CRM data…
          </div>
        ) : null}
        <Card
          title="Contact directory"
          eyebrow="Search, filter, add, edit, or import"
          actions={
            contacts.length > 0 ? (
              <div className={styles.actions}>
                <UiButton
                  type="button"
                  onClick={() => {
                    setShowAddForm(true);
                    onStartAdd?.();
                  }}
                  disabled={busy}
                >
                  Add contact
                </UiButton>
                <UiButton
                  variant="outline"
                  type="button"
                  onClick={() => setShowImport((current) => !current)}
                >
                  {showImport ? "Hide import" : "Import CSV"}
                </UiButton>
              </div>
            ) : null
          }
        >
          {contacts.length > 0 ? (
            <div className={styles.filterGrid}>
              <label className={styles.field} htmlFor="crm-search">
                <span>Search contacts</span>
                <Input
                  id="crm-search"
                  aria-label="Search contacts"
                  value={query}
                  onChange={(event) => onQueryChange?.(event.currentTarget.value)}
                  placeholder="Name, email, company"
                />
              </label>
              <label className={styles.field} htmlFor="crm-company-filter">
                <span>Company</span>
                <Input
                  id="crm-company-filter"
                  aria-label="Filter by company"
                  value={companyFilter}
                  onChange={(event) => onCompanyChange?.(event.currentTarget.value)}
                />
              </label>
              <label className={styles.field} htmlFor="crm-tags-filter">
                <span>Tags</span>
                <Input
                  id="crm-tags-filter"
                  aria-label="Filter by tags"
                  value={tagsFilter}
                  onChange={(event) => onTagsChange?.(event.currentTarget.value)}
                  placeholder="speaker,west"
                />
              </label>
              <label className={styles.field}>
                <span>Pipeline stage</span>
                <select
                  aria-label="Filter by pipeline stage"
                  value={pipelineFilter}
                  onChange={(event) =>
                    onPipelineFilterChange?.(event.currentTarget.value as CrmPipelineStage | "")
                  }
                >
                  <option value="">All stages</option>
                  {CRM_PIPELINE_STAGES.map((stage) => (
                    <option value={stage} key={stage}>
                      {stage}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Record status</span>
                <select
                  aria-label="Filter by contact status"
                  value={statusFilter}
                  onChange={(event) =>
                    onStatusFilterChange?.(event.currentTarget.value as CrmContactStatus | "")
                  }
                >
                  <option value="">All records</option>
                  <option value="active">Active</option>
                  <option value="merged">Merged</option>
                </select>
              </label>
            </div>
          ) : (
            <div className={styles.emptyDirectory} role="status">
              <h3>Your directory is empty</h3>
              <p>
                Add a contact manually or import a CSV to start building your organization
                directory.
              </p>
              <div className={styles.actions}>
                <UiButton
                  type="button"
                  onClick={() => {
                    setShowAddForm(true);
                    onStartAdd?.();
                  }}
                  disabled={busy}
                >
                  Add contact
                </UiButton>
                <UiButton variant="outline" type="button" onClick={() => setShowImport(true)}>
                  Import CSV
                </UiButton>
              </div>
            </div>
          )}
          {selectedContactIds.length > 0 ? (
            <div className={styles.bulkToolbar} role="status">
              <strong>{selectedContactIds.length} selected</strong>
              <button
                className={styles.primaryButton}
                type="button"
                onClick={() => {
                  setOutreachSegmentId("__selected__");
                  focusOutreachComposer();
                }}
                aria-controls="crm-outreach-composer"
                disabled={loading}
              >
                Communicate with selected
              </button>
              <button
                className={styles.secondaryButtonSmall}
                type="button"
                onClick={() => onSelectionChange?.([])}
              >
                Clear selection
              </button>
            </div>
          ) : null}
          {showImport ? (
            <form
              className={styles.importBox}
              onSubmit={(event) => {
                event.preventDefault();
                if (
                  importCsv.trim() &&
                  importPreview !== null &&
                  importPreview.rows.length > 0 &&
                  importPreview.issues.length === 0 &&
                  onImport
                ) {
                  void onImport(importCsv);
                }
              }}
            >
              <label className={styles.field}>
                <span>CSV file</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  aria-label="CSV file"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void readImportFile(file);
                  }}
                />
              </label>
              {importFileName ? (
                <p className={styles.importFileName}>
                  Selected <strong>{importFileName}</strong>
                </p>
              ) : null}
              <label className={styles.field}>
                <span>CSV contents (optional paste fallback)</span>
                <textarea
                  rows={4}
                  value={importCsv}
                  onChange={(event) => {
                    const csv = event.currentTarget.value;
                    setImportCsv(csv);
                    setImportFileName("");
                    setImportPreview(csv.trim() ? parseCsvPreview(csv) : null);
                  }}
                  placeholder="Select a .csv file to preview its mapped rows"
                />
              </label>
              {importPreview ? (
                <div className={styles.importPreview}>
                  <p className={styles.resultCount}>
                    Previewing {importPreview.rows.length} data row
                    {importPreview.rows.length === 1 ? "" : "s"}.
                  </p>
                  {importPreview.issues.length > 0 ? (
                    <ul className={styles.issueList}>
                      {importPreview.issues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className={styles.success}>No mapping issues detected in the preview.</p>
                  )}
                  {importPreview.mapping.length > 0 ? (
                    <div className={styles.tableWrap}>
                      <table className={styles.importTable}>
                        <caption>Detected CSV column mapping</caption>
                        <thead>
                          <tr>
                            <th scope="col">Source column</th>
                            <th scope="col">CRM field</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importPreview.mapping.map((column) => (
                            <tr key={column.sourceColumn}>
                              <th scope="row">{column.sourceColumn}</th>
                              <td>
                                {column.targetField}
                                {column.custom ? " (custom field)" : ""}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  {importPreview.headers.length > 0 ? (
                    <div className={styles.tableWrap}>
                      <table className={styles.importTable}>
                        <caption className={styles.srOnly}>CSV import preview</caption>
                        <thead>
                          <tr>
                            {importPreview.headers.map((header) => (
                              <th scope="col" key={header}>
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {importPreview.rows.map((row) => (
                            <tr key={row.join("\u001f")}>
                              {importPreview.headers.map((header, columnIndex) => (
                                <td key={header}>{row[columnIndex] ?? ""}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <button
                className={styles.primaryButton}
                type="submit"
                disabled={
                  busy ||
                  !importCsv.trim() ||
                  importPreview === null ||
                  importPreview.rows.length === 0 ||
                  importPreview.issues.length > 0 ||
                  onImport === undefined
                }
              >
                {busy ? "Importing…" : "Import directory"}
              </button>
            </form>
          ) : null}
          {importResult ? (
            <section className={styles.importPreview} aria-labelledby="crm-import-result-title">
              <h3 id="crm-import-result-title">Import result</h3>
              <p className={styles.resultCount}>
                {importResult.created} created · {importResult.updated} updated ·{" "}
                {importResult.skipped} skipped
                {importResult.idempotent ? " · idempotent replay" : ""}
              </p>
              <ol className={styles.historyList}>
                {importResult.rows.map((row) => (
                  <li key={`${row.rowNumber}-${row.identity ?? "missing"}`}>
                    <strong>
                      Row {row.rowNumber}: {row.status}
                    </strong>
                    <small>
                      {row.identity ?? "No canonical email"}
                      {row.contactId ? ` · contact ${row.contactId}` : ""}
                      {row.reason ? ` · ${row.reason}` : ""}
                    </small>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
          {!loading ? (
            <p className={styles.resultCount}>
              {contacts.length} contact{contacts.length === 1 ? "" : "s"} shown
            </p>
          ) : null}
          <DirectoryTable
            contacts={contacts}
            selectedContactId={selectedContactId}
            selectedContactIds={selectedContactIds}
            loading={loading}
            onSelect={(id) => {
              setShowAddForm(false);
              setMergeCompleted(false);
              setMergeCompletedContactId(null);
              onSelectContact?.(id);
            }}
            onToggleSelection={(id) =>
              onSelectionChange?.(
                selectedContactIds.includes(id)
                  ? selectedContactIds.filter((candidate) => candidate !== id)
                  : [...selectedContactIds, id],
              )
            }
            onToggleAll={(checked) =>
              onSelectionChange?.(
                checked
                  ? Array.from(
                      new Set([...selectedContactIds, ...contacts.map((contact) => contact.id)]),
                    )
                  : selectedContactIds.filter(
                      (id) => !contacts.some((contact) => contact.id === id),
                    ),
              )
            }
          />
        </Card>
        {showAddForm ? (
          <Card title="Add a CRM contact" eyebrow="New organization record">
            <ContactEditor
              busy={busy}
              onSave={async (draft) => {
                await onSaveContact?.(draft);
                setShowAddForm(false);
              }}
              onCancel={() => setShowAddForm(false)}
            />
          </Card>
        ) : null}
        {selectedContact ? (
          <Card
            title={displayName(selectedContact)}
            eyebrow="Pipeline card detail · identity, tags, custom fields, and notes"
            actions={
              <div className={styles.actions}>
                <Badge variant="outline" className={styles.stageBadge}>
                  {selectedContact.pipelineStage}
                </Badge>
                {mergeCandidates.length > 0 ? (
                  <>
                    <span className={styles.muted}>
                      {mergeCandidates.length} possible duplicate
                      {mergeCandidates.length === 1 ? "" : "s"}
                    </span>
                    <button
                      className={styles.secondaryButtonSmall}
                      type="button"
                      onClick={focusDuplicateReview}
                      aria-controls="crm-duplicate-review"
                      disabled={busy}
                    >
                      Review possible duplicates
                    </button>
                  </>
                ) : null}
              </div>
            }
          >
            <div className={styles.detailGrid}>
              <div className={styles.detailIdentity}>
                <dl className={styles.identityList}>
                  <div>
                    <dt>Email</dt>
                    <dd>{selectedContact.email ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Company</dt>
                    <dd>{selectedContact.company ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Title</dt>
                    <dd>{selectedContact.title ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Phone</dt>
                    <dd>{selectedContact.phone ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>{selectedContact.source}</dd>
                  </div>
                  <div>
                    <dt>Updated</dt>
                    <dd>{formatDate(selectedContact.updatedAt)}</dd>
                  </div>
                </dl>
                <div className={styles.profilePanel}>
                  <h3>Profile</h3>
                  <p>
                    <strong>Bio</strong>
                    <br />
                    {contactBio(selectedContact) || "No persisted bio yet."}
                  </p>
                  <p>
                    <strong>Headshot</strong>
                    <br />
                    {contactHeadshotUrl(selectedContact) ? (
                      <a
                        href={contactHeadshotUrl(selectedContact)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {contactHeadshotUrl(selectedContact)}
                      </a>
                    ) : (
                      "No persisted headshot yet."
                    )}
                  </p>
                </div>
                <div className={styles.tagList}>
                  {selectedContact.tags.map((tag) => (
                    <Badge variant="secondary" className={styles.tag} key={tag}>
                      {tag}
                    </Badge>
                  ))}
                </div>
                <h3>Custom fields</h3>
                {Object.keys(selectedContact.customFields).length === 0 ? (
                  <p className={styles.muted}>No custom fields.</p>
                ) : (
                  <dl className={styles.identityList}>
                    {Object.entries(selectedContact.customFields).map(([key, value]) => (
                      <div key={key}>
                        <dt>{key}</dt>
                        <dd>{typeof value === "string" ? value : JSON.stringify(value)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
              <ContactEditor
                contact={selectedContact}
                busy={busy}
                onSave={async (draft) => onSaveContact?.(draft)}
                {...(onCancelEdit === undefined ? {} : { onCancel: onCancelEdit })}
              />
            </div>
            <div className={styles.detailActions}>
              <button
                className={styles.primaryButton}
                type="button"
                onClick={() => {
                  setOutreachSegmentId("");
                  focusOutreachComposer();
                }}
                aria-controls="crm-outreach-composer"
                disabled={busy || loading}
              >
                Open outreach composer
              </button>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={onFindDuplicates}
                disabled={busy}
              >
                Find possible duplicates
              </button>
              {mergeCompleted && mergeCompletedContactId === selectedContact.id ? (
                <div className={styles.success} role="status">
                  <strong>Merge completed.</strong>
                  <p>
                    The primary contact remains the authoritative record. This CRM has no undo
                    endpoint, so the merge cannot be reversed here; review the retained tags and
                    history on the primary contact.
                  </p>
                </div>
              ) : null}
              {duplicates && mergeCandidates.length > 0 ? (
                <section
                  id="crm-duplicate-review"
                  ref={duplicateReviewRef}
                  className={styles.duplicateBox}
                  tabIndex={-1}
                  aria-labelledby="crm-duplicate-review-title"
                >
                  <strong id="crm-duplicate-review-title">
                    {mergeCandidates.length} possible duplicate
                    {mergeCandidates.length === 1 ? "" : "s"}
                  </strong>
                  <p className={styles.muted}>
                    Select records to compare. Nothing is merged until you review the values and
                    confirm the permanent action.
                  </p>
                  {mergeCandidates.map((match) => (
                    <label className={styles.checkRow} key={match.contact.id}>
                      <input
                        type="checkbox"
                        checked={mergeSelection.includes(match.contact.id)}
                        aria-label={`Select ${displayName(match.contact)}`}
                        onChange={(event) => {
                          const checked = event.currentTarget.checked;
                          setMergeSelection((current) =>
                            checked
                              ? [...new Set([...current, match.contact.id])]
                              : current.filter((id) => id !== match.contact.id),
                          );
                          setMergeReviewOpen(false);
                          setMergeConfirmed(false);
                          setMergeCompleted(false);
                          setMergeCompletedContactId(null);
                        }}
                      />
                      {displayName(match.contact)} · {Math.round(match.score * 100)}% match (
                      {match.matchedFields.join(", ")})
                    </label>
                  ))}
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    onClick={openMergeReview}
                    disabled={busy || selectedMergeContacts.length === 0}
                  >
                    Review selected merge
                  </button>
                  {mergeReviewOpen && selectedMergeContacts.length > 0 ? (
                    <section
                      className={styles.mergeReview}
                      aria-labelledby="crm-merge-review-title"
                    >
                      <div>
                        <h3 id="crm-merge-review-title">Review contact merge</h3>
                        <p className={styles.muted}>
                          Compare the primary with each selected duplicate. Selected winner values
                          are retained on the primary when the merge completes.
                        </p>
                      </div>
                      <div className={styles.mergeComparison}>
                        <table className={styles.mergeTable}>
                          <caption className={styles.srOnly}>
                            Side-by-side primary and duplicate contact comparison
                          </caption>
                          <thead>
                            <tr>
                              <th scope="col">Field</th>
                              <th scope="col">
                                Primary
                                <span className={styles.mergeColumnName}>
                                  {displayName(selectedContact)}
                                </span>
                              </th>
                              {selectedMergeContacts.map((match) => (
                                <th scope="col" key={match.contact.id}>
                                  Duplicate
                                  <span className={styles.mergeColumnName}>
                                    {displayName(match.contact)}
                                  </span>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {CRM_MERGE_SCALAR_FIELDS.map(({ key: field, label }) => (
                              <tr key={field}>
                                <th scope="row">{label}</th>
                                <td>{mergeFieldValue(selectedContact, field) || "—"}</td>
                                {selectedMergeContacts.map((match) => (
                                  <td key={match.contact.id}>
                                    {mergeFieldValue(match.contact, field) || "—"}
                                  </td>
                                ))}
                              </tr>
                            ))}
                            {mergeCustomKeys.map((key) => (
                              <tr key={`custom-${key}`}>
                                <th scope="row">Custom · {key}</th>
                                <td>{mergeValueText(selectedContact.customFields[key]) || "—"}</td>
                                {selectedMergeContacts.map((match) => (
                                  <td key={match.contact.id}>
                                    {mergeValueText(match.contact.customFields[key]) || "—"}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {conflictingScalarFields.length > 0 || conflictingCustomKeys.length > 0 ? (
                        <div className={styles.mergeConflictList}>
                          <h4>Choose a winner for each conflict</h4>
                          {conflictingScalarFields.map(({ key: field, label }) => (
                            <fieldset className={styles.mergeConflict} key={field}>
                              <legend>{label} winner</legend>
                              {mergeReviewContacts
                                .filter((candidate) =>
                                  mergeValuePresent(mergeFieldValue(candidate, field)),
                                )
                                .map((candidate) => (
                                  <label className={styles.mergeOption} key={candidate.id}>
                                    <input
                                      type="radio"
                                      name={`crm-merge-${field}`}
                                      value={candidate.id}
                                      checked={
                                        (mergeFieldWinners[field] ?? selectedContact.id) ===
                                        candidate.id
                                      }
                                      onChange={() => {
                                        setMergeFieldWinners((current) => ({
                                          ...current,
                                          [field]: candidate.id,
                                        }));
                                        setMergeConfirmed(false);
                                      }}
                                    />
                                    <span>
                                      {candidate.id === selectedContact.id
                                        ? "Primary"
                                        : "Duplicate"}{" "}
                                      · {displayName(candidate)}:{" "}
                                      {mergeFieldValue(candidate, field)}
                                    </span>
                                  </label>
                                ))}
                            </fieldset>
                          ))}
                          {conflictingCustomKeys.map((key) => (
                            <fieldset className={styles.mergeConflict} key={`custom-${key}`}>
                              <legend>Custom field “{key}” winner</legend>
                              {mergeReviewContacts
                                .filter((candidate) =>
                                  mergeValuePresent(candidate.customFields[key]),
                                )
                                .map((candidate) => (
                                  <label className={styles.mergeOption} key={candidate.id}>
                                    <input
                                      type="radio"
                                      name={`crm-merge-custom-${key}`}
                                      value={candidate.id}
                                      checked={
                                        (mergeCustomFieldWinners[key] ?? selectedContact.id) ===
                                        candidate.id
                                      }
                                      onChange={() => {
                                        setMergeCustomFieldWinners((current) => ({
                                          ...current,
                                          [key]: candidate.id,
                                        }));
                                        setMergeConfirmed(false);
                                      }}
                                    />
                                    <span>
                                      {candidate.id === selectedContact.id
                                        ? "Primary"
                                        : "Duplicate"}{" "}
                                      · {displayName(candidate)}:{" "}
                                      {mergeValueText(candidate.customFields[key])}
                                    </span>
                                  </label>
                                ))}
                            </fieldset>
                          ))}
                        </div>
                      ) : (
                        <p className={styles.muted}>
                          No conflicting values were found. The backend retains primary values and
                          fills blank primary fields from selected duplicates.
                        </p>
                      )}
                      <div className={styles.mergeRetention}>
                        <strong>What stays with the primary contact</strong>
                        <p>
                          The primary identity remains authoritative. Its tags and cross-event
                          history stay attached to it; selected duplicates are marked merged for
                          auditability.
                        </p>
                      </div>
                      <label className={styles.checkRow}>
                        <input
                          type="checkbox"
                          checked={mergeConfirmed}
                          onChange={(event) => setMergeConfirmed(event.currentTarget.checked)}
                          aria-describedby="crm-merge-confirmation"
                        />
                        <span id="crm-merge-confirmation">
                          I understand this is permanent and cannot be undone from this CRM.
                        </span>
                      </label>
                      <div className={styles.mergeActions}>
                        <button
                          className={styles.secondaryButton}
                          type="button"
                          onClick={closeMergeReview}
                          disabled={mergeSubmitting}
                        >
                          Back to duplicate list
                        </button>
                        <button
                          className={styles.dangerButton}
                          type="button"
                          onClick={() => void submitMerge()}
                          disabled={
                            busy ||
                            mergeSubmitting ||
                            !mergeConfirmed ||
                            onMerge === undefined ||
                            mergeCompleted
                          }
                        >
                          {mergeSubmitting ? "Merging…" : "Confirm permanent merge"}
                        </button>
                      </div>
                    </section>
                  ) : null}
                </section>
              ) : duplicates ? (
                <p className={styles.muted}>No eligible duplicates found.</p>
              ) : null}
            </div>
          </Card>
        ) : null}
        {selectedContact ? (
          <div className={styles.twoColumn}>
            <Card title="Pipeline transition" eyebrow="Every move is audited">
              <form
                className={styles.form}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (onSavePipeline) void onSavePipeline(pipelineStage, pipelineNote);
                }}
              >
                <label className={styles.field}>
                  <span>Current stage</span>
                  <select
                    value={pipelineStage}
                    onChange={(event) =>
                      setPipelineStage(event.currentTarget.value as CrmPipelineStage)
                    }
                  >
                    {CRM_PIPELINE_STAGES.map((stage) => (
                      <option key={stage} value={stage}>
                        {stage}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Transition note</span>
                  <input
                    value={pipelineNote}
                    onChange={(event) => setPipelineNote(event.currentTarget.value)}
                    placeholder="Why is this moving?"
                  />
                </label>
                <button
                  className={styles.primaryButton}
                  type="submit"
                  disabled={busy || pipelineStage === selectedContact.pipelineStage}
                >
                  Save pipeline stage
                </button>
              </form>
              <h3>Pipeline history</h3>
              {pipelineHistory.length === 0 ? (
                <p className={styles.muted}>No pipeline transitions recorded.</p>
              ) : (
                <ol className={styles.historyList}>
                  {pipelineHistory.map((entry) => (
                    <li key={entry.id}>
                      <strong>
                        {entry.fromStage ?? "—"} → {entry.toStage}
                      </strong>
                      <small>
                        {formatDate(entry.createdAt)}
                        {entry.note ? ` · ${entry.note}` : ""}
                      </small>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
            <Card title="Add to event" eyebrow="Organization event picker">
              <form className={styles.form} onSubmit={(event) => void saveEvent(event)}>
                <label className={styles.field}>
                  <span>Event</span>
                  <select
                    value={eventId}
                    onChange={(event) => setEventId(event.currentTarget.value)}
                    required
                  >
                    <option value="">Choose an event</option>
                    {events.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Relationship</span>
                  <select
                    value={eventRole}
                    onChange={(event) =>
                      setEventRole(event.currentTarget.value as typeof eventRole)
                    }
                  >
                    <option value="prospect">Prospect</option>
                    <option value="speaker">Speaker</option>
                    <option value="attendee">Attendee</option>
                    <option value="sponsor">Sponsor</option>
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Event note</span>
                  <input
                    value={eventNote}
                    onChange={(event) => setEventNote(event.currentTarget.value)}
                  />
                </label>
                <button className={styles.primaryButton} type="submit" disabled={busy || !eventId}>
                  Add contact to event
                </button>
              </form>
              {lastAddedEventId && lastEventResult ? (
                <p className={styles.success}>
                  Canonical relationship{" "}
                  {lastEventResult.outcome === "created" ? "created" : "already existed"} for{" "}
                  {selectedEvent?.name ?? lastAddedEventId}
                  {lastEventResult.idempotent ? " (idempotent)." : "."}{" "}
                  <Link
                    href={`/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(lastAddedEventId)}`}
                  >
                    Open event workspace
                  </Link>
                </p>
              ) : null}
            </Card>
            <Card title="Notes and cross-event history" eyebrow="A durable contact timeline">
              <form className={styles.form} onSubmit={(event) => void saveNote(event)}>
                <label className={styles.field}>
                  <span>New note</span>
                  <textarea
                    rows={3}
                    value={noteBody}
                    onChange={(event) => setNoteBody(event.currentTarget.value)}
                    placeholder="Record a relationship detail"
                    required
                  />
                </label>
                <button
                  className={styles.primaryButton}
                  type="submit"
                  disabled={busy || !noteBody.trim()}
                >
                  Save note
                </button>
                {noteError ? (
                  <p className={styles.error} role="alert">
                    {noteError}
                  </p>
                ) : null}
              </form>
              <div className={styles.timeline}>
                {notes.map((note) => (
                  <article key={note.id}>
                    <strong>Note</strong>
                    <p>{note.body}</p>
                    <small>{formatDate(note.createdAt)}</small>
                  </article>
                ))}
                {history.map((entry) => (
                  <article key={entry.id}>
                    <strong>{entry.title}</strong>
                    <p>
                      {entry.detail ?? entry.kind}
                      {entry.eventId ? ` · event ${entry.eventId}` : ""}
                    </p>
                    <small>{formatDate(entry.occurredAt)}</small>
                  </article>
                ))}
                {notes.length === 0 && history.length === 0 ? (
                  <p className={styles.muted}>No history has been recorded for this contact.</p>
                ) : null}
              </div>
            </Card>
          </div>
        ) : contacts.length > 0 ? (
          <div className={styles.callout}>
            Select a contact to view identity, history, pipeline, event relationships, and outreach
            controls.
          </div>
        ) : null}
        {selectedContact || selectedContactIds.length > 0 ? (
          <section
            id="crm-outreach-composer"
            ref={outreachComposerRef}
            tabIndex={-1}
            aria-label="Personalized outreach composer"
          >
            <Card
              title="Personalized outreach"
              eyebrow={
                outreachSegmentId === "__selected__" && selectedContactIds.length > 0
                  ? `Communicate with ${selectedContactIds.length} selected contacts`
                  : "Preview before sending"
              }
            >
              <form className={styles.form} onSubmit={(event) => void previewOutreach(event)}>
                <label className={styles.field}>
                  <span>Audience</span>
                  <select
                    aria-label="Outreach audience"
                    value={outreachSegmentId}
                    onChange={(event) => setOutreachSegmentId(event.currentTarget.value)}
                  >
                    <option value="">This contact</option>
                    {selectedContactIds.length > 0 ? (
                      <option value="__selected__">
                        Selected directory contacts ({selectedContactIds.length})
                      </option>
                    ) : null}
                    {segments.map((segment) => (
                      <option key={segment.id} value={segment.id}>
                        Segment: {segment.name}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedContactIds.length > 0 ? (
                  <label className={styles.field}>
                    <span>Segment context (optional)</span>
                    <select
                      aria-label="Outreach segment context"
                      value={outreachContextSegmentId}
                      onChange={(event) => setOutreachContextSegmentId(event.currentTarget.value)}
                    >
                      <option value="">No segment context</option>
                      {segments.map((segment) => (
                        <option key={segment.id} value={segment.id}>
                          {segment.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className={styles.field}>
                  <span>Event context (optional)</span>
                  <select
                    aria-label="Outreach event"
                    value={outreachEventId}
                    onChange={(event) => setOutreachEventId(event.currentTarget.value)}
                  >
                    <option value="">No event</option>
                    {events.map((event) => (
                      <option value={event.id} key={event.id}>
                        {event.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Subject</span>
                  <input
                    value={outreachSubject}
                    onChange={(event) => setOutreachSubject(event.currentTarget.value)}
                    required
                  />
                </label>
                <label className={styles.field}>
                  <span>Message</span>
                  <textarea
                    rows={5}
                    value={outreachBody}
                    onChange={(event) => setOutreachBody(event.currentTarget.value)}
                    required
                  />
                  <small className={styles.muted}>
                    Use <code>{"{{first_name}}"}</code> for safe per-contact personalization.
                  </small>
                </label>
                <button className={styles.primaryButton} type="submit" disabled={busy}>
                  {busy ? "Preparing…" : "Preview personalized outreach"}
                </button>
              </form>
              {outreachPreview ? (
                <div className={styles.previewBox}>
                  <h3>Outreach preview</h3>
                  <p>
                    <strong>{outreachPreview.count}</strong> recipient
                    {outreachPreview.count === 1 ? "" : "s"} will receive this message.
                  </p>
                  {outreachPreview.eventId ? <p>Event context: {outreachPreview.eventId}</p> : null}
                  {outreachPreview.segmentId ? (
                    <p>Segment context: {outreachPreview.segmentId}</p>
                  ) : null}
                  {outreachHasUnknownTags ? (
                    <p className={styles.error} role="alert">
                      Sending is blocked because one or more recipients have unknown merge tags.
                    </p>
                  ) : null}
                  <div className={styles.timeline}>
                    {outreachPreview.recipients.map((recipient) => (
                      <article key={recipient.contactId}>
                        <h4>
                          {recipient.displayName} · {recipient.email}
                        </h4>
                        <p>
                          <strong>Subject:</strong> {recipient.subject}
                        </p>
                        <pre>{recipient.body}</pre>
                        {recipient.unknownTags.length > 0 ? (
                          <p className={styles.error}>
                            Unknown merge tags: {recipient.unknownTags.join(", ")}
                          </p>
                        ) : null}
                      </article>
                    ))}
                  </div>
                  <button
                    className={styles.primaryButton}
                    aria-label="Send Now"
                    type="button"
                    onClick={() => onSendOutreach?.()}
                    disabled={
                      busy ||
                      outreachPreview.count === 0 ||
                      outreachHasUnknownTags ||
                      onSendOutreach === undefined
                    }
                  >
                    {busy
                      ? "Queueing…"
                      : `Queue outreach (Send Now to ${outreachPreview.count} contact${outreachPreview.count === 1 ? "" : "s"})`}
                  </button>
                </div>
              ) : null}
              {outreachResults.length > 0 ? (
                <section className={styles.previewBox} aria-labelledby="crm-outreach-result-title">
                  <h3 id="crm-outreach-result-title">Outreach delivery result</h3>
                  <p className={styles.resultCount}>
                    {outreachResults.reduce((count, result) => count + result.sentCount, 0)} sent ·{" "}
                    {outreachResults.reduce((count, result) => count + result.queuedCount, 0)}{" "}
                    queued ·{" "}
                    {outreachResults.reduce((count, result) => count + result.failedCount, 0)}{" "}
                    failed
                  </p>
                  <ol className={styles.historyList}>
                    {outreachResults.map((result) => (
                      <li key={result.id}>
                        <strong>
                          {result.recipientEmail}: {result.status}
                        </strong>
                        <small>
                          send {result.id}
                          {result.terminal ? " · terminal" : " · awaiting delivery"}
                          {result.failureReason ? ` · ${result.failureReason}` : ""}
                        </small>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}
            </Card>
          </section>
        ) : null}
        {contacts.length > 0 ? (
          <>
            <SegmentManager
              segments={segments}
              busy={busy}
              currentRules={currentFilterRules}
              onCreate={onCreateSegment ?? (async () => undefined)}
              onSelect={onSelectSegment ?? (() => undefined)}
            />
            <PipelineBoard
              contacts={contacts}
              onMove={onMovePipeline ?? (() => undefined)}
              onSelect={(id) => onSelectContact?.(id)}
              onEnroll={onEnrollPipeline ?? (async () => undefined)}
            />
            {analytics ? (
              <section id="crm-analytics" tabIndex={-1} aria-label="CRM analytics panel">
                <AnalyticsPanel
                  analytics={analytics}
                  events={events}
                  onEventDrillThrough={onAnalyticsEventDrillThrough ?? (() => undefined)}
                />
              </section>
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  );
}

type CrmWorkspaceContactFilter = NonNullable<Parameters<CrmApi["listContacts"]>[0]>;

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
export interface CrmWorkspaceProps {
  readonly organizationId: string;
  readonly api?: CrmApi;
  readonly initialContacts?: readonly CrmContact[];
  readonly initialSegments?: readonly CrmSegment[];
  readonly initialEvents?: readonly CrmEvent[];
  readonly initialAnalytics?: CrmAnalytics | null;
}

export function CrmWorkspace({
  organizationId,
  api: providedApi,
  initialContacts,
  initialSegments,
  initialEvents,
  initialAnalytics,
}: CrmWorkspaceProps) {
  const apiBaseUrl = "";
  const api = useMemo(
    () => providedApi ?? createCrmApi(apiBaseUrl, organizationId),
    [organizationId, providedApi],
  );
  const [contacts, setContacts] = useState<readonly CrmContact[]>(initialContacts ?? []);
  const [segments, setSegments] = useState<readonly CrmSegment[]>(initialSegments ?? []);
  const [events, setEvents] = useState<readonly CrmEvent[]>(initialEvents ?? []);
  const [analytics, setAnalytics] = useState<CrmAnalytics | null>(initialAnalytics ?? null);
  const [selectedContact, setSelectedContact] = useState<CrmContact | undefined>();
  const [selectedContactIds, setSelectedContactIds] = useState<readonly string[]>([]);
  const [history, setHistory] = useState<readonly CrmHistoryEntry[]>([]);
  const [pipelineHistory, setPipelineHistory] = useState<readonly CrmPipelineEntry[]>([]);
  const [notes, setNotes] = useState<readonly CrmNote[]>([]);
  const [duplicates, setDuplicates] = useState<CrmDuplicateReport | null>(null);
  const [importResult, setImportResult] = useState<CrmImportResult | null>(null);
  const [outreachRecipients, setOutreachRecipients] = useState<readonly CrmContact[]>([]);
  const [outreachPreview, setOutreachPreview] = useState<CrmOutreachPreview | null>(null);
  const [outreachResults, setOutreachResults] = useState<readonly CrmOutreachCommand[]>([]);
  const [lastAddedEventId, setLastAddedEventId] = useState<string | null>(null);
  const [lastEventResult, setLastEventResult] = useState<CrmEventProjectionResult | null>(null);
  const [query, setQuery] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [tagsFilter, setTagsFilter] = useState("");
  const [pipelineFilter, setPipelineFilter] = useState<CrmPipelineStage | "">("");
  const [statusFilter, setStatusFilter] = useState<CrmContactStatus | "">("active");
  const [contactsLoading, setContactsLoading] = useState(initialContacts === undefined);
  const [segmentsLoading, setSegmentsLoading] = useState(initialSegments === undefined);
  const [eventsLoading, setEventsLoading] = useState(initialEvents === undefined);
  const [analyticsLoading, setAnalyticsLoading] = useState(initialAnalytics === undefined);
  const loading = contactsLoading || segmentsLoading || eventsLoading || analyticsLoading;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const selectionGeneration = useRef(0);
  const initialContactsRead = useRef<{ api: CrmApi; filterKey: string } | null>(
    initialContacts === undefined
      ? null
      : {
          api,
          filterKey: JSON.stringify([
            query,
            companyFilter,
            tagsFilter,
            pipelineFilter,
            statusFilter,
          ]),
        },
  );
  const initialSegmentsRead = useRef<CrmApi | null>(initialSegments === undefined ? null : api);
  const initialEventsRead = useRef<CrmApi | null>(initialEvents === undefined ? null : api);
  const initialAnalyticsRead = useRef<CrmApi | null>(initialAnalytics === undefined ? null : api);
  const importIdentityRef = useRef<{ csv: string; key: string } | null>(null);
  const eventIdentityRef = useRef<{ fingerprint: string; key: string } | null>(null);

  const contactFilter = useMemo<CrmWorkspaceContactFilter>(
    () => ({
      query,
      company: companyFilter,
      tags: tagsFilter,
      pipelineStage: pipelineFilter,
      status: statusFilter,
    }),
    [companyFilter, pipelineFilter, query, statusFilter, tagsFilter],
  );
  const contactFilterRef = useRef(contactFilter);
  contactFilterRef.current = contactFilter;
  const contactFilterKey = useMemo(
    () => JSON.stringify([query, companyFilter, tagsFilter, pipelineFilter, statusFilter]),
    [companyFilter, pipelineFilter, query, statusFilter, tagsFilter],
  );
  const workspaceReadCoordinator = useMemo(
    () =>
      createCrmWorkspaceReadCoordinator(api, {
        setContacts,
        setSegments,
        setEvents,
        setAnalytics,
        setContactsLoading,
        setSegmentsLoading,
        setEventsLoading,
        setAnalyticsLoading,
        setError,
      }),
    [api],
  );

  const loadContacts = useCallback(
    () => workspaceReadCoordinator.loadContacts(contactFilterRef.current),
    [workspaceReadCoordinator],
  );
  const loadSegments = useCallback(
    () => workspaceReadCoordinator.loadSegments(),
    [workspaceReadCoordinator],
  );
  const loadEvents = useCallback(
    () => workspaceReadCoordinator.loadEvents(),
    [workspaceReadCoordinator],
  );
  const loadAnalytics = useCallback(
    () => workspaceReadCoordinator.loadAnalytics(),
    [workspaceReadCoordinator],
  );

  useEffect(() => {
    workspaceReadCoordinator.activate();
    return () => workspaceReadCoordinator.dispose();
  }, [workspaceReadCoordinator]);

  useEffect(() => {
    const previous = initialContactsRead.current;
    if (previous?.api === api && previous.filterKey === contactFilterKey) return;
    initialContactsRead.current = { api, filterKey: contactFilterKey };
    void loadContacts();
  }, [api, contactFilterKey, loadContacts]);

  useEffect(() => {
    if (initialSegmentsRead.current === api) return;
    initialSegmentsRead.current = api;
    void loadSegments();
  }, [api, loadSegments]);

  useEffect(() => {
    if (initialEventsRead.current === api) return;
    initialEventsRead.current = api;
    void loadEvents();
  }, [api, loadEvents]);

  useEffect(() => {
    if (initialAnalyticsRead.current === api) return;
    initialAnalyticsRead.current = api;
    void loadAnalytics();
  }, [api, loadAnalytics]);

  useEffect(() => {
    return () => {
      selectionGeneration.current += 1;
    };
  }, []);

  const refresh = useCallback(async () => {
    await workspaceReadCoordinator.refresh(contactFilterRef.current);
  }, [workspaceReadCoordinator]);

  const selectContact = useCallback(
    async (contactId: string, manageBusy = true) => {
      const generation = ++selectionGeneration.current;
      if (manageBusy) {
        setBusy(true);
        setError(null);
        setStatusMessage(null);
      }
      try {
        const [contact, nextHistory, nextPipelineHistory, nextNotes, nextDuplicates] =
          await Promise.all([
            api.getContact(contactId),
            api.getContactHistory(contactId),
            api.getPipelineHistory(contactId),
            api.listNotes(contactId),
            api.findDuplicates(contactId),
          ]);
        if (generation !== selectionGeneration.current) return;
        setSelectedContact(contact);
        setHistory(nextHistory);
        setPipelineHistory(nextPipelineHistory);
        setNotes(nextNotes);
        setDuplicates(nextDuplicates);
        setOutreachRecipients([contact]);
        setOutreachPreview(null);
        setOutreachResults([]);
        setLastAddedEventId(null);
        setLastEventResult(null);
      } catch (reason) {
        if (generation === selectionGeneration.current) setError(messageFromError(reason));
      } finally {
        if (manageBusy && generation === selectionGeneration.current) setBusy(false);
      }
    },
    [api],
  );

  async function saveContact(draft: ContactDraft): Promise<void> {
    const existingContact = selectedContact;
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const input = draftInput(draft);
      const next = existingContact
        ? await api.updateContact(existingContact.id, {
            ...input,
            expectedVersion: existingContact.version,
          })
        : await api.createContact(input);
      setSelectedContact(next);
      setContacts((current) => {
        const without = current.filter((contact) => contact.id !== next.id);
        return [...without, next].sort((left, right) =>
          displayName(left).localeCompare(displayName(right)),
        );
      });
      setOutreachRecipients([next]);
      setStatusMessage(
        existingContact ? "Contact changes saved." : "Contact added to the organization directory.",
      );
      await refreshCrmAnalyticsAfterContactSave(existingContact, loadAnalytics);
    } catch (reason) {
      setError(messageFromError(reason));
    } finally {
      setBusy(false);
    }
  }

  async function importContacts(csv: string): Promise<void> {
    setBusy(true);
    setError(null);
    const existingIdentity = importIdentityRef.current;
    const key = existingIdentity?.csv === csv ? existingIdentity.key : idempotencyKey("crm-import");
    importIdentityRef.current = { csv, key };
    try {
      const result = await api.importContacts(csv, key);
      setImportResult(result);
      setStatusMessage(
        `Import ${result.id}: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped${result.idempotent ? " (idempotent replay)" : ""}.`,
      );
      await Promise.all([loadContacts(), loadAnalytics()]);
    } catch (reason) {
      setError(messageFromError(reason));
    } finally {
      setBusy(false);
    }
  }

  async function createSegment(input: {
    name: string;
    description: string;
    rules: readonly CrmSegmentRule[];
  }): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const next = await api.createSegment(input);
      setSegments((current) => [...current, next]);
      setStatusMessage(`Saved dynamic segment “${next.name}”.`);
    } catch (reason) {
      setError(messageFromError(reason));
    } finally {
      setBusy(false);
    }
  }

  async function selectSegment(segmentId: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const segmentContacts = await api.listSegmentContacts(segmentId);
      setContacts(segmentContacts);
      setStatusMessage(
        `Showing ${segmentContacts.length} contact${segmentContacts.length === 1 ? "" : "s"} in this segment.`,
      );
      setOutreachRecipients(segmentContacts);
    } catch (reason) {
      setError(messageFromError(reason));
    } finally {
      setBusy(false);
    }
  }

  async function findDuplicates(): Promise<void> {
    if (!selectedContact) return;
    setBusy(true);
    try {
      setDuplicates(await api.findDuplicates(selectedContact.id));
    } catch (reason) {
      setError(messageFromError(reason));
    } finally {
      setBusy(false);
    }
  }

  async function mergeContacts(plan: CrmMergePlan): Promise<void> {
    if (!selectedContact || plan.duplicateContactIds.length === 0) return;
    if (selectedContact.organizationId !== organizationId || selectedContact.status !== "active") {
      const reason = new Error(
        "The selected primary contact is not an active organization contact.",
      );
      setError(reason.message);
      throw reason;
    }
    const allowedMatches =
      duplicates?.contactId === selectedContact.id
        ? duplicates.matches.filter(
            (match) =>
              match.contact.organizationId === organizationId &&
              match.contact.status === "active" &&
              match.contact.id !== selectedContact.id,
          )
        : [];
    const allowedIds = new Set(allowedMatches.map((match) => match.contact.id));
    const duplicateIds = [...new Set(plan.duplicateContactIds)].filter((id) => allowedIds.has(id));
    if (duplicateIds.length === 0) {
      const reason = new Error("Select an eligible duplicate from the current comparison.");
      setError(reason.message);
      throw reason;
    }
    const primaryContactId = selectedContact.id;
    const selectionIntent = selectionGeneration.current;
    setBusy(true);
    setError(null);
    try {
      await api.mergeContacts(primaryContactId, duplicateIds, idempotencyKey("crm-merge"), {
        fieldWinners: plan.fieldWinners,
        customFieldWinners: plan.customFieldWinners,
      });
      setStatusMessage(
        "Duplicate contacts merged into the selected primary contact. This CRM has no undo endpoint; review retained tags and history on the primary contact.",
      );
      await Promise.all([
        loadContacts(),
        loadAnalytics(),
        selectionGeneration.current === selectionIntent
          ? selectContact(primaryContactId, false)
          : Promise.resolve(),
      ]);
    } catch (reason) {
      setError(messageFromError(reason));
      throw reason;
    } finally {
      setBusy(false);
    }
  }

  async function movePipeline(contactId: string, stage: CrmPipelineStage): Promise<void> {
    const contact = contacts.find((candidate) => candidate.id === contactId);
    if (!contact || contact.pipelineStage === stage) return;
    setBusy(true);
    try {
      const next = await api.updatePipeline(contactId, stage);
      setContacts((current) =>
        current.map((candidate) => (candidate.id === next.id ? next : candidate)),
      );
      if (selectedContact?.id === next.id) setSelectedContact(next);
      const [, nextPipelineHistory] = await Promise.all([
        loadAnalytics(),
        selectedContact?.id === next.id ? api.getPipelineHistory(next.id) : Promise.resolve(null),
      ]);
      if (nextPipelineHistory !== null) setPipelineHistory(nextPipelineHistory);
      setStatusMessage(`${displayName(next)} moved to ${stage}.`);
    } catch (reason) {
      setError(messageFromError(reason));
    } finally {
      setBusy(false);
    }
  }
  async function enrollPipeline(input: {
    contactId: string;
    stage: CrmPipelineStage;
    score: string;
    rationale: string;
  }): Promise<void> {
    const contact = contacts.find((candidate) => candidate.id === input.contactId);
    if (!contact) return;
    setBusy(true);
    setError(null);
    const enrollmentNote = [
      input.score.trim() ? `Score: ${input.score.trim()}` : "",
      input.rationale.trim() ? `Rationale: ${input.rationale.trim()}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    try {
      const next =
        contact.pipelineStage === input.stage && enrollmentNote
          ? await api.updateContact(input.contactId, {
              customFields: {
                ...contact.customFields,
                ...(input.score.trim() ? { pipelineScore: input.score.trim() } : {}),
                ...(input.rationale.trim() ? { pipelineRationale: input.rationale.trim() } : {}),
              },
              expectedVersion: contact.version,
            })
          : await api.updatePipeline(input.contactId, input.stage, enrollmentNote);
      setContacts((current) =>
        current.map((candidate) => (candidate.id === next.id ? next : candidate)),
      );
      if (selectedContact?.id === next.id) setSelectedContact(next);
      const stageChanged = contact.pipelineStage !== next.pipelineStage;
      const [, nextPipelineHistory] = await Promise.all([
        stageChanged ? loadAnalytics() : Promise.resolve(),
        selectedContact?.id === next.id ? api.getPipelineHistory(next.id) : Promise.resolve(null),
      ]);
      if (nextPipelineHistory !== null) setPipelineHistory(nextPipelineHistory);
      setStatusMessage(`${displayName(next)} enrolled in the ${input.stage} pipeline stage.`);
    } catch (reason) {
      setError(messageFromError(reason));
    } finally {
      setBusy(false);
    }
  }

  async function savePipeline(stage: CrmPipelineStage, note: string): Promise<void> {
    if (!selectedContact) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api.updatePipeline(selectedContact.id, stage, note);
      setSelectedContact(next);
      setContacts((current) =>
        current.map((candidate) => (candidate.id === next.id ? next : candidate)),
      );
      const [nextPipelineHistory] = await Promise.all([
        api.getPipelineHistory(next.id),
        selectedContact.pipelineStage === next.pipelineStage ? Promise.resolve() : loadAnalytics(),
      ]);
      setPipelineHistory(nextPipelineHistory);
      setStatusMessage(`Pipeline stage saved as ${stage}.`);
    } catch (reason) {
      setError(messageFromError(reason));
    } finally {
      setBusy(false);
    }
  }

  async function addNote(body: string): Promise<void> {
    if (!selectedContact) return;
    setBusy(true);
    setError(null);
    try {
      const note = await api.addNote(selectedContact.id, body);
      setNotes((current) => [note, ...current]);
      setStatusMessage("Note saved to the contact timeline.");
    } catch (reason) {
      setError(messageFromError(reason));
    } finally {
      setBusy(false);
    }
  }

  async function addToEvent(input: {
    eventId: string;
    role: "speaker" | "prospect" | "attendee" | "sponsor";
    note: string;
  }): Promise<void> {
    if (!selectedContact) return;
    setBusy(true);
    setError(null);
    const fingerprint = JSON.stringify({ contactId: selectedContact.id, ...input });
    const existingIdentity = eventIdentityRef.current;
    const key =
      existingIdentity?.fingerprint === fingerprint
        ? existingIdentity.key
        : idempotencyKey("crm-event");
    eventIdentityRef.current = { fingerprint, key };
    try {
      const result = await api.addContactToEvent(selectedContact.id, input, key);
      setLastAddedEventId(input.eventId);
      setLastEventResult(result);
      setStatusMessage(
        result.outcome === "created"
          ? "Canonical event relationship created."
          : "The canonical event relationship already existed; no duplicate was created.",
      );
      const [nextHistory] = await Promise.all([
        api.getContactHistory(selectedContact.id),
        loadAnalytics(),
      ]);
      setHistory(nextHistory);
    } catch (reason) {
      setError(messageFromError(reason));
    } finally {
      setBusy(false);
    }
  }

  async function previewOutreach(input: {
    subject: string;
    body: string;
    contactIds?: readonly string[];
    segmentId?: string;
    eventId?: string;
  }): Promise<void> {
    let recipients = outreachRecipients;
    if (input.contactIds && input.contactIds.length > 0) {
      const selected = new Set(input.contactIds);
      recipients = contacts.filter((contact) => selected.has(contact.id));
      setOutreachRecipients(recipients);
    } else if (input.segmentId) {
      try {
        recipients = await api.listSegmentContacts(input.segmentId);
        setOutreachRecipients(recipients);
      } catch (reason) {
        setError(messageFromError(reason));
        return;
      }
    }
    if (recipients.length === 0) {
      setError("Choose a contact or a segment with at least one active contact.");
      return;
    }
    const recipientPreviews = recipients.map((contact) => {
      const subject = renderVariablePreview(input.subject, contact);
      const body = renderVariablePreview(input.body, contact);
      return {
        contactId: contact.id,
        email: contact.email ?? "Missing recipient email",
        displayName: displayName(contact),
        subject: subject.value,
        body: body.value,
        unknownTags: [
          ...new Set([
            ...subject.unknownTags,
            ...body.unknownTags,
            ...(contact.email === null ? ["recipient_email"] : []),
          ]),
        ].sort(),
        idempotencyKey: idempotencyKey("crm-outreach"),
      };
    });
    setOutreachResults([]);
    setOutreachPreview({
      subject: input.subject,
      body: input.body,
      count: recipientPreviews.length,
      recipients: recipientPreviews,
      ...(input.segmentId ? { segmentId: input.segmentId } : {}),
      ...(input.eventId ? { eventId: input.eventId } : {}),
    });
    const issueCount = recipientPreviews.filter(
      (recipient) => recipient.unknownTags.length > 0,
    ).length;
    setStatusMessage(
      issueCount === 0
        ? `Preview ready for ${recipients.length} personalized recipient${recipients.length === 1 ? "" : "s"}.`
        : `Preview found merge-tag or recipient issues for ${issueCount} recipient${issueCount === 1 ? "" : "s"}; sending is blocked.`,
    );
  }

  async function sendOutreach(): Promise<void> {
    if (
      !outreachPreview ||
      outreachPreview.recipients.length === 0 ||
      outreachPreview.recipients.some((recipient) => recipient.unknownTags.length > 0)
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const contactsById = new Map(outreachRecipients.map((contact) => [contact.id, contact]));
      const results = await Promise.all(
        outreachPreview.recipients.map((recipient) => {
          const contact = contactsById.get(recipient.contactId);
          if (contact === undefined) {
            throw new Error(`Preview recipient ${recipient.contactId} is no longer selected.`);
          }
          return api.sendOutreach(
            {
              contactId: contact.id,
              subject: outreachPreview.subject,
              body: outreachPreview.body,
              ...(outreachPreview.eventId ? { eventId: outreachPreview.eventId } : {}),
              ...(outreachPreview.segmentId ? { segmentId: outreachPreview.segmentId } : {}),
              variables: {
                first_name: contact.firstName ?? "",
                firstName: contact.firstName ?? "",
                last_name: contact.lastName ?? "",
                lastName: contact.lastName ?? "",
              },
            },
            recipient.idempotencyKey,
          );
        }),
      );
      setOutreachResults(results);
      const queuedCount = results.reduce((count, result) => count + result.queuedCount, 0);
      const sentCount = results.reduce((count, result) => count + result.sentCount, 0);
      const failedCount = results.reduce((count, result) => count + result.failedCount, 0);
      const terminal = results.every((result) => result.terminal);
      setStatusMessage(
        `Outreach result: ${sentCount} sent, ${queuedCount} queued, ${failedCount} failed; ${terminal ? "terminal" : "delivery still in progress"}.`,
      );
      const [, historyResult] = await Promise.allSettled([
        loadAnalytics(),
        selectedContact ? api.getContactHistory(selectedContact.id) : Promise.resolve(null),
      ]);
      if (historyResult.status === "fulfilled" && historyResult.value !== null) {
        setHistory(historyResult.value);
      }
    } catch (reason) {
      setError(messageFromError(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <CrmWorkspaceView
      organizationId={organizationId}
      contacts={contacts}
      selectedContact={selectedContact}
      segments={segments}
      events={events}
      history={history}
      pipelineHistory={pipelineHistory}
      notes={notes}
      duplicates={duplicates}
      analytics={analytics}
      loading={loading}
      busy={busy}
      error={error}
      statusMessage={statusMessage}
      query={query}
      companyFilter={companyFilter}
      tagsFilter={tagsFilter}
      pipelineFilter={pipelineFilter}
      statusFilter={statusFilter}
      selectedContactId={selectedContact?.id ?? null}
      selectedContactIds={selectedContactIds}
      onQueryChange={setQuery}
      onCompanyChange={setCompanyFilter}
      onTagsChange={setTagsFilter}
      onPipelineFilterChange={setPipelineFilter}
      onStatusFilterChange={setStatusFilter}
      onRefresh={() => void refresh()}
      onSelectContact={(contactId) => void selectContact(contactId)}
      onSelectionChange={(contactIds) => {
        setSelectedContactIds(contactIds);
        const selected = new Set(contactIds);
        setOutreachRecipients(contacts.filter((contact) => selected.has(contact.id)));
        setOutreachPreview(null);
        setOutreachResults([]);
      }}
      onStartAdd={() => {
        selectionGeneration.current += 1;
        setSelectedContactIds([]);
        setSelectedContact(undefined);
        setDuplicates(null);
      }}
      onSaveContact={saveContact}
      onCancelEdit={() => {
        selectionGeneration.current += 1;
        setSelectedContact(undefined);
      }}
      onImport={importContacts}
      importResult={importResult}
      onCreateSegment={createSegment}
      onSelectSegment={(segmentId) => void selectSegment(segmentId)}
      onFindDuplicates={() => void findDuplicates()}
      onMerge={mergeContacts}
      onMovePipeline={(contactId, stage) => void movePipeline(contactId, stage)}
      onEnrollPipeline={enrollPipeline}
      onSavePipeline={savePipeline}
      onAddNote={addNote}
      onAddToEvent={addToEvent}
      lastAddedEventId={lastAddedEventId}
      lastEventResult={lastEventResult}
      onPreviewOutreach={previewOutreach}
      outreachPreview={outreachPreview}
      outreachRecipients={outreachRecipients}
      onSendOutreach={sendOutreach}
      outreachResults={outreachResults}
      onAnalyticsEventDrillThrough={(eventId) => {
        setQuery(eventId);
        setStatusMessage(`Directory filter set to event ${eventId}.`);
      }}
    />
  );
}

export const CRMWorkspace = CrmWorkspace;
export const CRMWorkspaceView = CrmWorkspaceView;
