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
  useSyncExternalStore,
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
import { createCrmApi, idempotencyKey } from "./crm-workspace-api";
import {
  type ContactDraft,
  CRM_PIPELINE_STAGES,
  type CrmAnalytics,
  type CrmApi,
  type CrmContact,
  type CrmContactStatus,
  type CrmDuplicateReport,
  type CrmEvent,
  type CrmEventProjectionResult,
  type CrmHistoryEntry,
  type CrmImportPreviewResult,
  type CrmImportResult,
  type CrmMergePlan,
  type CrmMergePreview,
  type CrmMergeResult,
  type CrmMergeScalarField,
  type CrmNote,
  type CrmOutreachCommand,
  type CrmOutreachPreview,
  type CrmPipelineEntry,
  type CrmPipelineStage,
  type CrmSegment,
  type CrmSegmentOperator,
  type CrmSegmentRule,
  type CrmWorkspaceContactFilter,
  createCrmWorkspaceReadCoordinator,
  mergePlanKey,
  messageFromError,
  refreshCrmAnalyticsAfterContactSave,
  refreshCrmDuplicatesAfterContactSave,
} from "./crm-workspace-model";

function displayName(contact: Pick<CrmContact, "displayName" | "email" | "id">): string {
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

function subscribeToCrmDate(): () => void {
  return () => undefined;
}

function browserCrmDate(value: string | undefined): string {
  if (value === undefined || value.length === 0) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function crmDateFallback(value: string | undefined): string {
  return value === undefined || value.length === 0 ? "—" : value;
}

function ClientFormattedDate({ value }: Readonly<{ value: string | undefined }>) {
  return useSyncExternalStore(
    subscribeToCrmDate,
    () => browserCrmDate(value),
    () => crmDateFallback(value),
  );
}
function focusAndScroll(target: HTMLElement | null): void {
  if (target === null) return;
  if (typeof target.scrollIntoView === "function") {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  target.focus({ preventScroll: true });
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

function renderVariablePreview(
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
      actions={
        <span className={styles.muted}>
          Updated <ClientFormattedDate value={analytics.generatedAt} />
        </span>
      }
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
  readonly onPreviewImport?: (csv: string) => Promise<void>;
  readonly importPreviewResult?: CrmImportPreviewResult | null;
  readonly importPreviewLoading?: boolean;
  readonly importPreviewError?: string | null;
  readonly importPreviewSource?: string | null;
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
  readonly onPreviewMerge?: (plan: CrmMergePlan) => Promise<void>;
  readonly mergePreview?: CrmMergePreview | null;
  readonly mergePreviewLoading?: boolean;
  readonly mergePreviewError?: string | null;
  readonly mergePreviewPlanKey?: string | null;
  readonly mergeResult?: CrmMergeResult | null;
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
  onPreviewImport,
  importPreviewResult = null,
  importPreviewLoading = false,
  importPreviewError = null,
  importPreviewSource = null,
  importResult = null,
  onCreateSegment,
  onSelectSegment,
  onFindDuplicates,
  onMerge,
  onPreviewMerge,
  mergePreview = null,
  mergePreviewLoading = false,
  mergePreviewError = null,
  mergePreviewPlanKey = null,
  mergeResult = null,
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
  const [mergeReviewPlanKey, setMergeReviewPlanKey] = useState<string | null>(null);
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
  const initialImportPreviewRequested = useRef(false);
  useEffect(() => {
    if (
      !initialImportPreviewRequested.current &&
      initialImportCsv.trim() &&
      onPreviewImport !== undefined
    ) {
      initialImportPreviewRequested.current = true;
      void onPreviewImport(initialImportCsv);
    }
  }, [initialImportCsv, onPreviewImport]);
  useEffect(() => {
    if (selectedContact) setPipelineStage(selectedContact.pipelineStage);
    setMergeSelection([]);
    setMergeReviewPlanKey(null);
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
      if (csv.trim() && onPreviewImport !== undefined) void onPreviewImport(csv);
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
  function updateImportCsv(csv: string): void {
    setImportCsv(csv);
    setImportFileName("");
    setImportPreview(csv.trim() ? parseCsvPreview(csv) : null);
    if (csv.trim() && onPreviewImport !== undefined) void onPreviewImport(csv);
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
  const noteIds = new Set(notes.map((note) => note.id));
  const timelineHistory = history.filter((entry) => {
    if (entry.kind !== "note") return true;
    const noteId = entry.metadata.noteId;
    return typeof noteId !== "string" || !noteIds.has(noteId);
  });
  const importPreviewCurrent =
    importPreviewResult !== null &&
    importPreviewResult.preview === true &&
    importPreviewSource === importCsv;
  const importPreviewHasErrors =
    (importPreviewResult?.errors ?? 0) > 0 ||
    (importPreviewResult?.rows.some((row) => row.status === "error") ?? false);
  const mergePreviewCurrent =
    mergePreview !== null &&
    mergePreview.preview === true &&
    mergePreviewPlanKey !== null &&
    mergePreviewPlanKey === mergeReviewPlanKey;
  const mergePreviewHasConflicts = (mergePreview?.participantConflicts.length ?? 0) > 0;
  const mergeCommitReady =
    mergePreviewCurrent &&
    mergePreview?.canCommit === true &&
    !mergePreviewHasConflicts &&
    !mergePreviewLoading &&
    mergePreviewError === null;

  function requestMergePreview(
    fieldWinners: Partial<Record<CrmMergeScalarField, string>>,
    customFieldWinners: Readonly<Record<string, string>>,
  ): void {
    if (!selectedContact || selectedMergeContacts.length === 0 || onPreviewMerge === undefined) {
      setMergeReviewPlanKey(null);
      return;
    }
    const plan: CrmMergePlan = {
      duplicateContactIds: selectedMergeContacts.map((match) => match.contact.id),
      fieldWinners: Object.fromEntries(
        CRM_MERGE_SCALAR_FIELDS.map(({ key }) => [key, fieldWinners[key] ?? selectedContact.id]),
      ) as Record<CrmMergeScalarField, string>,
      customFieldWinners: { ...customFieldWinners },
    };
    setMergeReviewPlanKey(mergePlanKey(plan));
    void onPreviewMerge(plan);
  }

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
    requestMergePreview(nextFieldWinners, nextCustomFieldWinners);
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
      !mergeCommitReady ||
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
                  importPreviewCurrent &&
                  !importPreviewHasErrors &&
                  !importPreviewLoading &&
                  importPreviewError === null &&
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
                  onChange={(event) => updateImportCsv(event.currentTarget.value)}
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
              {importCsv.trim() ? (
                <section className={styles.previewBox} aria-live="polite">
                  <h3>Authoritative CRM import preview</h3>
                  {importPreviewLoading ? (
                    <p className={styles.muted} role="status" aria-busy="true">
                      Checking this CSV against the organization CRM…
                    </p>
                  ) : importPreviewError ? (
                    <Alert variant="destructive">
                      <AlertTitle>Authoritative preview unavailable</AlertTitle>
                      <AlertDescription>
                        <p>{humanErrorSummary(importPreviewError)}</p>
                        <details className={styles.errorDetails}>
                          <summary>Show preview error details</summary>
                          <pre>{importPreviewError}</pre>
                        </details>
                      </AlertDescription>
                    </Alert>
                  ) : !importPreviewCurrent ? (
                    <p className={styles.muted} role="status">
                      Preview pending. The server must classify this exact CSV before it can be
                      committed.
                    </p>
                  ) : importPreviewHasErrors ? (
                    <Alert variant="destructive">
                      <AlertTitle>Import preview contains row errors</AlertTitle>
                      <AlertDescription>
                        <p>
                          Resolve the authoritative error rows before committing. No local parse
                          result can override server classification.
                        </p>
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <p className={styles.success} role="status">
                      Authoritative preview ready. Commit uses this exact normalized CSV plan.
                    </p>
                  )}
                  {importPreviewCurrent && importPreviewResult ? (
                    <>
                      <p className={styles.resultCount}>
                        {importPreviewResult.created} created · {importPreviewResult.updated}{" "}
                        updated · {importPreviewResult.skipped} skipped ·{" "}
                        {importPreviewResult.errors} errors
                      </p>
                      <p className={styles.muted}>
                        {importPreviewResult.preview ? "Preview" : "Receipt"}{" "}
                        {importPreviewResult.id}
                        {importPreviewResult.planFingerprint
                          ? ` · plan ${importPreviewResult.planFingerprint}`
                          : ""}
                        {" · generated "}
                        <ClientFormattedDate value={importPreviewResult.createdAt} /> ·{" "}
                        {importPreviewResult.contacts.length} authoritative contact
                        {importPreviewResult.contacts.length === 1 ? "" : "s"} ·{" "}
                        {importPreviewResult.mapping.length} mapped column
                        {importPreviewResult.mapping.length === 1 ? "" : "s"}
                      </p>
                      <ol className={styles.historyList}>
                        {importPreviewResult.rows.map((row) => (
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
                    </>
                  ) : null}
                </section>
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
                  !importPreviewCurrent ||
                  importPreviewHasErrors ||
                  importPreviewLoading ||
                  importPreviewError !== null ||
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
                {importResult.skipped} skipped · {importResult.errors} errors
                {importResult.idempotent ? " · idempotent replay" : ""}
              </p>
              <p className={styles.muted}>
                Receipt {importResult.id} · organization {importResult.organizationId} · generated{" "}
                <ClientFormattedDate value={importResult.createdAt} />
                {importResult.planFingerprint ? ` · plan ${importResult.planFingerprint}` : ""} ·{" "}
                {importResult.contacts.length} authoritative contact
                {importResult.contacts.length === 1 ? "" : "s"}
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
                    <dd>
                      <ClientFormattedDate value={selectedContact.updatedAt} />
                    </dd>
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
                          setMergeReviewPlanKey(null);
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
                  {mergeReviewOpen ||
                  mergePreview !== null ||
                  mergePreviewLoading ||
                  mergePreviewError ? (
                    <section className={styles.previewBox} aria-live="polite">
                      <h3>Authoritative relationship-aware merge preview</h3>
                      <p className={styles.muted}>
                        CRM contact merge rewires CRM relationships only. It never merges
                        participant identity, authorization, portal grants, task ownership, asset
                        ownership, roster membership, reviewer access, or historical recipient
                        snapshots.
                      </p>
                      {mergePreviewLoading ? (
                        <p className={styles.muted} role="status" aria-busy="true">
                          Checking relationship links and participant conflicts…
                        </p>
                      ) : mergePreviewError ? (
                        <Alert variant="destructive">
                          <AlertTitle>Merge preview unavailable</AlertTitle>
                          <AlertDescription>
                            <p>{humanErrorSummary(mergePreviewError)}</p>
                            <details className={styles.errorDetails}>
                              <summary>Show preview error details</summary>
                              <pre>{mergePreviewError}</pre>
                            </details>
                          </AlertDescription>
                        </Alert>
                      ) : !mergePreviewCurrent ? (
                        <p className={styles.muted} role="status">
                          Preview pending or stale. A current server preview is required before this
                          merge can be committed.
                        </p>
                      ) : mergePreview ? (
                        <>
                          <p className={styles.resultCount}>
                            Survivor{" "}
                            <strong>
                              {displayName(mergePreview.survivor)} ({mergePreview.survivorId})
                            </strong>{" "}
                            · retired {mergePreview.retiredIds.length} contact
                            {mergePreview.retiredIds.length === 1 ? "" : "s"}
                          </p>
                          <p className={styles.muted}>
                            Retired contacts:{" "}
                            {mergePreview.tombstones
                              .map((candidate) => `${displayName(candidate)} (${candidate.id})`)
                              .join(", ") || "—"}
                          </p>
                          <ul className={styles.metricList}>
                            <li>
                              <span>Participant CRM links rewired</span>
                              <strong>{mergePreview.rewired.participantContactLinks}</strong>
                            </li>
                            <li>
                              <span>Notes rewired</span>
                              <strong>{mergePreview.rewired.notes}</strong>
                            </li>
                            <li>
                              <span>Segments rewired</span>
                              <strong>{mergePreview.rewired.segments}</strong>
                            </li>
                            <li>
                              <span>Pipeline history rewired</span>
                              <strong>{mergePreview.rewired.pipelineHistory}</strong>
                            </li>
                          </ul>
                          <p className={styles.muted}>
                            Stable audit reference <strong>{mergePreview.auditId}</strong> · plan{" "}
                            {mergePreview.planFingerprint}
                          </p>
                          {mergePreviewHasConflicts ? (
                            <Alert variant="destructive">
                              <AlertTitle>
                                Participant conflict blocks this merge (
                                {mergePreview.participantConflicts.length})
                              </AlertTitle>
                              <AlertDescription>
                                <p>
                                  Distinct participants are linked to contacts in this merge. CRM
                                  merge cannot choose a participant identity or change
                                  authorization.
                                </p>
                                <ul>
                                  {mergePreview.participantConflicts.map((conflict) => (
                                    <li
                                      key={`${conflict.eventId}-${conflict.participantIds.join(",")}`}
                                    >
                                      Event {conflict.eventId}: participants{" "}
                                      {conflict.participantIds.join(", ")} share CRM contacts{" "}
                                      {conflict.crmContactIds.join(", ")}.
                                    </li>
                                  ))}
                                </ul>
                              </AlertDescription>
                            </Alert>
                          ) : mergePreview.canCommit ? (
                            <p className={styles.success} role="status">
                              Relationship preview is clear and current. The commit remains
                              idempotent and will use this plan.
                            </p>
                          ) : (
                            <Alert variant="destructive">
                              <AlertTitle>Merge preview conflict</AlertTitle>
                              <AlertDescription>
                                The server marked this relationship plan as non-committable.
                              </AlertDescription>
                            </Alert>
                          )}
                        </>
                      ) : null}
                      {mergeResult ? (
                        <div className={styles.success} role="status">
                          <strong>
                            Merge committed{mergeResult.idempotent ? " (idempotent replay)" : ""}.
                          </strong>
                          <p>
                            Audit {mergeResult.auditId}: survivor {mergeResult.survivorId}; retired{" "}
                            {mergeResult.retiredIds.length} contact
                            {mergeResult.retiredIds.length === 1 ? "" : "s"}.
                          </p>
                          <p>
                            Rewired {mergeResult.rewired.participantContactLinks} participant CRM
                            link{mergeResult.rewired.participantContactLinks === 1 ? "" : "s"},{" "}
                            {mergeResult.rewired.notes} note
                            {mergeResult.rewired.notes === 1 ? "" : "s"},{" "}
                            {mergeResult.rewired.segments} segment
                            {mergeResult.rewired.segments === 1 ? "" : "s"}, and{" "}
                            {mergeResult.rewired.pipelineHistory} pipeline history record
                            {mergeResult.rewired.pipelineHistory === 1 ? "" : "s"}.
                          </p>
                        </div>
                      ) : null}
                    </section>
                  ) : null}
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
                                        const nextFieldWinners = {
                                          ...mergeFieldWinners,
                                          [field]: candidate.id,
                                        };
                                        setMergeFieldWinners(nextFieldWinners);
                                        setMergeConfirmed(false);
                                        requestMergePreview(
                                          nextFieldWinners,
                                          mergeCustomFieldWinners,
                                        );
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
                                        const nextCustomFieldWinners = {
                                          ...mergeCustomFieldWinners,
                                          [key]: candidate.id,
                                        };
                                        setMergeCustomFieldWinners(nextCustomFieldWinners);
                                        setMergeConfirmed(false);
                                        requestMergePreview(
                                          mergeFieldWinners,
                                          nextCustomFieldWinners,
                                        );
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
                            !mergeCommitReady ||
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
                        <ClientFormattedDate value={entry.createdAt} />
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
                    href={`/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(selectedEvent?.id ?? lastAddedEventId)}`}
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
                    <small>
                      <ClientFormattedDate value={note.createdAt} />
                    </small>
                  </article>
                ))}
                {timelineHistory.map((entry) => (
                  <article key={entry.id}>
                    <strong>{entry.title}</strong>
                    <p>
                      {entry.detail ?? entry.kind}
                      {entry.eventId ? ` · event ${entry.eventId}` : ""}
                    </p>
                    <small>
                      <ClientFormattedDate value={entry.occurredAt} />
                    </small>
                  </article>
                ))}
                {notes.length === 0 && timelineHistory.length === 0 ? (
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
                  : "Preview before queueing"
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
                    {outreachPreview.count === 1 ? "" : "s"} will be queued for delivery.
                  </p>
                  {outreachPreview.eventId ? <p>Event context: {outreachPreview.eventId}</p> : null}
                  {outreachPreview.segmentId ? (
                    <p>Segment context: {outreachPreview.segmentId}</p>
                  ) : null}
                  {outreachHasUnknownTags ? (
                    <p className={styles.error} role="alert">
                      Queueing is blocked because one or more recipients have unknown merge tags.
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
                    aria-label="Queue outreach for delivery"
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
                      : `Queue outreach for delivery to ${outreachPreview.count} contact${outreachPreview.count === 1 ? "" : "s"}`}
                  </button>
                </div>
              ) : null}
              {outreachResults.length > 0 ? (
                <section className={styles.previewBox} aria-labelledby="crm-outreach-result-title">
                  <h3 id="crm-outreach-result-title">Outreach queue result</h3>
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
                          queue {result.id}
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
  const [importPreviewResult, setImportPreviewResult] = useState<CrmImportPreviewResult | null>(
    null,
  );
  const [importPreviewLoading, setImportPreviewLoading] = useState(false);
  const [importPreviewError, setImportPreviewError] = useState<string | null>(null);
  const [importPreviewSource, setImportPreviewSource] = useState<string | null>(null);
  const [outreachRecipients, setOutreachRecipients] = useState<readonly CrmContact[]>([]);
  const [outreachPreview, setOutreachPreview] = useState<CrmOutreachPreview | null>(null);
  const [outreachResults, setOutreachResults] = useState<readonly CrmOutreachCommand[]>([]);
  const [lastAddedEventId, setLastAddedEventId] = useState<string | null>(null);
  const [lastEventResult, setLastEventResult] = useState<CrmEventProjectionResult | null>(null);
  const [mergePreview, setMergePreview] = useState<CrmMergePreview | null>(null);
  const [mergePreviewLoading, setMergePreviewLoading] = useState(false);
  const [mergePreviewError, setMergePreviewError] = useState<string | null>(null);
  const [mergePreviewPlanKey, setMergePreviewPlanKey] = useState<string | null>(null);
  const [mergeResult, setMergeResult] = useState<CrmMergeResult | null>(null);
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
  const busyLeaseRef = useRef(0);

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
  const importPreviewRequestRef = useRef<string | null>(null);
  const importPreviewLeaseRef = useRef(0);
  const mergePreviewRequestRef = useRef<string | null>(null);
  const mergePreviewLeaseRef = useRef(0);
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
    () => workspaceReadCoordinator.loadContacts(contactFilter),
    [contactFilter, workspaceReadCoordinator],
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
      busyLeaseRef.current += 1;
      importPreviewLeaseRef.current += 1;
      mergePreviewLeaseRef.current += 1;
    };
  }, []);

  const refresh = useCallback(async () => {
    await workspaceReadCoordinator.refresh(contactFilter);
  }, [contactFilter, workspaceReadCoordinator]);

  const selectContact = useCallback(
    async (contactId: string, manageBusy = true) => {
      const generation = ++selectionGeneration.current;
      let busyLease: number | null = null;
      if (manageBusy) {
        busyLease = ++busyLeaseRef.current;
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
        setBusy((current) =>
          manageBusy && busyLease !== null && busyLease === busyLeaseRef.current ? false : current,
        );
      }
    },
    [api],
  );

  async function saveContact(draft: ContactDraft): Promise<void> {
    const existingContact = selectedContact;
    const busyLease = ++busyLeaseRef.current;
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
      const [nextDuplicates] = await Promise.all([
        refreshCrmDuplicatesAfterContactSave(existingContact, next, (contactId) =>
          api.findDuplicates(contactId),
        ),
        refreshCrmAnalyticsAfterContactSave(existingContact, loadAnalytics),
      ]);
      if (nextDuplicates !== null) setDuplicates(nextDuplicates);
    } catch (reason) {
      setError(messageFromError(reason));
    } finally {
      setBusy((current) => (busyLease === busyLeaseRef.current ? false : current));
    }
  }
  async function previewImport(csv: string): Promise<void> {
    const requestLease = ++importPreviewLeaseRef.current;
    importPreviewRequestRef.current = csv;
    const requestIsCurrent = () =>
      importPreviewRequestRef.current === csv && importPreviewLeaseRef.current === requestLease;
    setImportPreviewResult(null);
    setImportPreviewSource(null);
    setImportPreviewError(null);
    setImportPreviewLoading(true);
    try {
      const result = await api.previewImport(csv);
      if (!requestIsCurrent()) return;
      setImportPreviewResult(result);
      setImportPreviewSource(csv);
    } catch (reason) {
      if (requestIsCurrent()) {
        setImportPreviewError(messageFromError(reason));
      }
    } finally {
      setImportPreviewLoading((current) => (requestIsCurrent() ? false : current));
    }
  }

  async function importContacts(csv: string): Promise<void> {
    const authoritativePreview =
      importPreviewRequestRef.current === csv &&
      importPreviewSource === csv &&
      importPreviewResult?.preview === true
        ? importPreviewResult
        : null;
    if (authoritativePreview === null) {
      setError("Import commit is blocked until a current authoritative CSV preview is ready.");
      return;
    }
    if (authoritativePreview.errors > 0) {
      setError("Import commit is blocked because the authoritative preview contains row errors.");
      return;
    }
    const busyLease = ++busyLeaseRef.current;
    setBusy(true);
    setError(null);
    const existingIdentity = importIdentityRef.current;
    const key = existingIdentity?.csv === csv ? existingIdentity.key : idempotencyKey("crm-import");
    importIdentityRef.current = { csv, key };
    try {
      const result = await api.importContacts(csv, key);
      setImportResult(result);
      setStatusMessage(
        `Import ${result.id}: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.errors} errors${result.idempotent ? " (idempotent replay)" : ""}.`,
      );
      await Promise.all([loadContacts(), loadAnalytics()]);
    } catch (reason) {
      setError(messageFromError(reason));
    } finally {
      setBusy((current) => (busyLease === busyLeaseRef.current ? false : current));
    }
  }

  async function previewMerge(plan: CrmMergePlan): Promise<void> {
    if (!selectedContact || plan.duplicateContactIds.length === 0) return;
    const key = mergePlanKey(plan);
    const requestLease = ++mergePreviewLeaseRef.current;
    mergePreviewRequestRef.current = key;
    const requestIsCurrent = () =>
      mergePreviewRequestRef.current === key && mergePreviewLeaseRef.current === requestLease;
    setMergePreview(null);
    setMergePreviewPlanKey(null);
    setMergePreviewError(null);
    setMergePreviewLoading(true);
    try {
      const result = await api.previewMerge(selectedContact.id, plan.duplicateContactIds, {
        fieldWinners: plan.fieldWinners,
        customFieldWinners: plan.customFieldWinners,
      });
      if (!requestIsCurrent()) return;
      setMergePreview(result);
      setMergePreviewPlanKey(key);
    } catch (reason) {
      if (requestIsCurrent()) setMergePreviewError(messageFromError(reason));
    } finally {
      setMergePreviewLoading((current) => (requestIsCurrent() ? false : current));
    }
  }

  async function createSegment(input: {
    name: string;
    description: string;
    rules: readonly CrmSegmentRule[];
  }): Promise<void> {
    const busyLease = ++busyLeaseRef.current;
    setBusy(true);
    setError(null);
    try {
      const next = await api.createSegment(input);
      setSegments((current) => [...current, next]);
      setStatusMessage(`Saved dynamic segment “${next.name}”.`);
    } catch (reason) {
      setError(messageFromError(reason));
    } finally {
      setBusy((current) => (busyLease === busyLeaseRef.current ? false : current));
    }
  }

  async function selectSegment(segmentId: string): Promise<void> {
    const busyLease = ++busyLeaseRef.current;
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
      setBusy((current) => (busyLease === busyLeaseRef.current ? false : current));
    }
  }

  async function findDuplicates(): Promise<void> {
    if (!selectedContact) return;
    const busyLease = ++busyLeaseRef.current;
    setBusy(true);
    try {
      setDuplicates(await api.findDuplicates(selectedContact.id));
    } catch (reason) {
      setError(messageFromError(reason));
    } finally {
      setBusy((current) => (busyLease === busyLeaseRef.current ? false : current));
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
    const planKey = mergePlanKey(plan);
    if (
      mergePreview === null ||
      mergePreviewPlanKey !== planKey ||
      !mergePreview.canCommit ||
      mergePreview.participantConflicts.length > 0 ||
      mergePreview.planFingerprint.length === 0
    ) {
      const reason = new Error(
        "Merge commit is blocked until a current authoritative relationship preview is ready.",
      );
      setError(reason.message);
      throw reason;
    }
    const primaryContactId = selectedContact.id;
    const selectionIntent = selectionGeneration.current;
    const busyLease = ++busyLeaseRef.current;
    setBusy(true);
    setError(null);
    try {
      const result = await api.mergeContacts(
        primaryContactId,
        duplicateIds,
        idempotencyKey("crm-merge"),
        {
          fieldWinners: plan.fieldWinners,
          customFieldWinners: plan.customFieldWinners,
        },
      );
      setMergeResult(result);
      setStatusMessage(
        `Merge committed: survivor ${result.survivorId}; audit ${result.auditId}${result.idempotent ? " (idempotent replay)" : ""}.`,
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
      setBusy((current) => (busyLease === busyLeaseRef.current ? false : current));
    }
  }

  async function movePipeline(contactId: string, stage: CrmPipelineStage): Promise<void> {
    const contact = contacts.find((candidate) => candidate.id === contactId);
    if (!contact || contact.pipelineStage === stage) return;
    const busyLease = ++busyLeaseRef.current;
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
      setBusy((current) => (busyLease === busyLeaseRef.current ? false : current));
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
    const busyLease = ++busyLeaseRef.current;
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
      setBusy((current) => (busyLease === busyLeaseRef.current ? false : current));
    }
  }

  async function savePipeline(stage: CrmPipelineStage, note: string): Promise<void> {
    if (!selectedContact) return;
    const busyLease = ++busyLeaseRef.current;
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
      setBusy((current) => (busyLease === busyLeaseRef.current ? false : current));
    }
  }

  async function addNote(body: string): Promise<void> {
    if (!selectedContact) return;
    const busyLease = ++busyLeaseRef.current;
    setBusy(true);
    setError(null);
    try {
      const note = await api.addNote(selectedContact.id, body);
      setNotes((current) => [note, ...current]);
      setStatusMessage("Note saved to the contact timeline.");
    } catch (reason) {
      setError(messageFromError(reason));
    } finally {
      setBusy((current) => (busyLease === busyLeaseRef.current ? false : current));
    }
  }

  async function addToEvent(input: {
    eventId: string;
    role: "speaker" | "prospect" | "attendee" | "sponsor";
    note: string;
  }): Promise<void> {
    if (!selectedContact) return;
    const busyLease = ++busyLeaseRef.current;
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
      setBusy((current) => (busyLease === busyLeaseRef.current ? false : current));
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
        : `Preview found merge-tag or recipient issues for ${issueCount} recipient${issueCount === 1 ? "" : "s"}; queueing is blocked.`,
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
    const busyLease = ++busyLeaseRef.current;
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
          const { firstName, lastName } = outreachNameParts(contact);
          return api.sendOutreach(
            {
              contactId: contact.id,
              subject: outreachPreview.subject,
              body: outreachPreview.body,
              ...(outreachPreview.eventId ? { eventId: outreachPreview.eventId } : {}),
              ...(outreachPreview.segmentId ? { segmentId: outreachPreview.segmentId } : {}),
              variables: {
                first_name: firstName,
                firstName,
                last_name: lastName,
                lastName,
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
        `Outreach queue result: ${sentCount} sent, ${queuedCount} queued, ${failedCount} failed; ${terminal ? "terminal" : "delivery still in progress"}.`,
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
      setBusy((current) => (busyLease === busyLeaseRef.current ? false : current));
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
      onPreviewImport={previewImport}
      importPreviewResult={importPreviewResult}
      importPreviewLoading={importPreviewLoading}
      importPreviewError={importPreviewError}
      importPreviewSource={importPreviewSource}
      importResult={importResult}
      onCreateSegment={createSegment}
      onSelectSegment={(segmentId) => void selectSegment(segmentId)}
      onFindDuplicates={() => void findDuplicates()}
      onPreviewMerge={previewMerge}
      mergePreview={mergePreview}
      mergePreviewLoading={mergePreviewLoading}
      mergePreviewError={mergePreviewError}
      mergePreviewPlanKey={mergePreviewPlanKey}
      mergeResult={mergeResult}
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
