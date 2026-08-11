"use client";

import Link from "next/link";
import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import styles from "../admin/admin-shell.module.css";
import {
  createSpeakerApi,
  type SpeakerApi,
  SpeakerApiError,
  type SpeakerAsset,
  type SpeakerCreateInput,
  type SpeakerEmailPreview,
  type SpeakerEmailSend,
  type SpeakerEmailTemplate,
  type SpeakerImportPreview,
  type SpeakerInvitationPreview,
  type SpeakerInvitationResult,
  type SpeakerProgressEnvelope,
  type SpeakerProgressRow,
  type SpeakerRecord,
  type SpeakerReminderEligibilityEnvelope,
  type SpeakerRosterEnvelope,
  type SpeakerSession,
  type SpeakerStatus,
  type SpeakerTask,
  type SpeakerTaskAssignmentInput,
  type SpeakerTaskEnvelope,
  type SpeakerTravelLogistics,
  type SpeakerUpdateInput,
} from "./api";

export interface SpeakerWorkspaceProps {
  readonly organizationId: string;
  readonly eventId: string;
  readonly baseUrl?: string;
  readonly api?: SpeakerApi;
}

export type ProgressFilter = "all" | "complete" | "incomplete";

export interface SpeakerProfileDraft {
  displayName: string;
  email: string;
  title: string;
  company: string;
  biography: string;
  twitter: string;
  linkedin: string;
  website: string;
  status: SpeakerStatus;
  travelRequired: boolean;
  arrivalAt: string;
  departureAt: string;
  accommodation: string;
  dietaryRequirements: string;
  accessibilityNeeds: string;
  travelNotes: string;
}

interface EditDraft extends CreateDraft {
  headshotAssetId: string | null;
  expectedVersion: number;
}

type CreateDraft = SpeakerProfileDraft;

export const MAX_ORGANIZER_ONBOARDING_TASKS = 3;
export const ORGANIZER_ONBOARDING_TASK_DESCRIPTION = "General speaker onboarding task.";
export const SPEAKER_CUSTOM_FIELDS_CONTRACT_GAP =
  "Custom speaker fields are not available in the current speaker API contract. Travel and logistics are saved with the speaker profile; custom fields require a speaker API read/write contract.";

export interface SpeakerInvitationHistoryEntry {
  readonly preview: readonly SpeakerInvitationPreview[];
  readonly result: SpeakerInvitationResult;
  readonly occurredAt: string;
}

export interface SpeakerOnboardingTaskDefinition {
  readonly definitionId: string;
  readonly title: string;
  readonly dueAt: string | null;
  readonly participantIds: readonly string[];
}
const panelStyle = {
  display: "grid",
  gap: "1rem",
  padding: "1.2rem",
  border: "1px solid var(--admin-border)",
  borderRadius: "var(--admin-radius-md)",
  background: "var(--admin-surface)",
  boxShadow: "var(--admin-shadow)",
} as const;

const fieldGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(13rem, 1fr))",
  gap: "0.85rem",
} as const;

const fieldStyle = { display: "grid", gap: "0.35rem" } as const;
const labelStyle = {
  color: "var(--admin-ink)",
  fontSize: "0.76rem",
  fontWeight: 760,
} as const;
const inputStyle = {
  width: "100%",
  minHeight: "2.55rem",
  padding: "0.55rem 0.65rem",
  border: "1px solid var(--admin-border-strong)",
  borderRadius: "var(--admin-radius-sm)",
  background: "var(--admin-surface)",
  color: "var(--admin-ink)",
  font: "inherit",
  fontSize: "0.84rem",
} as const;
const textAreaStyle = { ...inputStyle, minHeight: "7rem", resize: "vertical" as const };
const mutedStyle = {
  margin: 0,
  color: "var(--admin-muted)",
  fontSize: "0.79rem",
  lineHeight: 1.55,
} as const;
const inlineStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: "0.55rem",
  alignItems: "center",
} as const;
const listStyle = {
  display: "grid",
  gap: "0.65rem",
  padding: 0,
  margin: 0,
  listStyle: "none",
} as const;
const badgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  width: "fit-content",
  padding: "0.2rem 0.5rem",
  borderRadius: 999,
  background: "var(--admin-brand-soft)",
  color: "var(--admin-brand-strong)",
  fontSize: "0.7rem",
  fontWeight: 800,
} as const;

const DEFAULT_STATUS_OPTIONS = ["pending", "invited", "confirmed", "accepted", "declined"] as const;
const ASYNC_ACTION_TIMEOUT_MS = 15_000;

function withTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, label: string): Promise<T> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`${label} timed out. Try again.`));
    }, ASYNC_ACTION_TIMEOUT_MS);
  });
  let operationPromise: Promise<T>;
  try {
    operationPromise = operation(controller.signal);
  } catch (reason: unknown) {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    return Promise.reject(reason);
  }
  return Promise.race([operationPromise, timeout]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  });
}

function emptyCreateDraft(): CreateDraft {
  return {
    displayName: "",
    email: "",
    title: "",
    company: "",
    biography: "",
    twitter: "",
    linkedin: "",
    website: "",
    status: "pending",
    travelRequired: false,
    arrivalAt: "",
    departureAt: "",
    accommodation: "",
    dietaryRequirements: "",
    accessibilityNeeds: "",
    travelNotes: "",
  };
}

function editDraftFor(speaker: SpeakerRecord): EditDraft {
  return {
    displayName: speaker.displayName,
    email: speaker.email,
    title: speaker.jobTitle ?? "",
    company: speaker.company ?? "",
    biography: speaker.biography,
    twitter: speaker.socialLinks.twitter ?? "",
    linkedin: speaker.socialLinks.linkedin ?? "",
    website: speaker.socialLinks.website ?? "",
    status: speaker.status,
    travelRequired: speaker.travelLogistics?.travelRequired ?? false,
    arrivalAt: speaker.travelLogistics?.arrivalAt?.slice(0, 10) ?? "",
    departureAt: speaker.travelLogistics?.departureAt?.slice(0, 10) ?? "",
    accommodation: speaker.travelLogistics?.accommodation ?? "",
    dietaryRequirements: speaker.travelLogistics?.dietaryRequirements ?? "",
    accessibilityNeeds: speaker.travelLogistics?.accessibilityNeeds ?? "",
    travelNotes: speaker.travelLogistics?.travelNotes ?? "",
    headshotAssetId: speaker.headshotAssetId,
    expectedVersion: speaker.version,
  };
}

function apiBaseUrl(explicit: string | undefined): string {
  const normalized = (explicit ?? "").trim().replace(/\/+$/u, "");
  return normalized;
}

function errorMessage(reason: unknown): string {
  if (reason instanceof SpeakerApiError) {
    if (
      reason.code === "VERSION_CONFLICT" &&
      /already|duplicate|verified email|canonical participant/iu.test(reason.message)
    ) {
      return reason.message;
    }
    if (reason.code === "CONFLICT" || reason.status === 409) {
      return "This speaker changed elsewhere. Refresh the roster and try again.";
    }
    if (reason.status === 404) {
      return "The organizer speaker service is not available for this event yet.";
    }
    return reason.message;
  }
  return reason instanceof Error ? reason.message : "The speaker request could not be completed.";
}

function statusLabel(value: string): string {
  return value.replace(/[_-]+/gu, " ").replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function dateLabel(value: string | null | undefined): string {
  if (!value) return "No due date";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(parsed);
}

function dateTimeLabel(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(parsed);
}

function assetSize(value: number): string {
  if (!Number.isFinite(value) || value < 1) return "Unknown size";
  if (value < 1_024) return `${value} B`;
  if (value < 1_048_576) return `${Math.round(value / 102.4) / 10} KB`;
  return `${Math.round(value / 104_857.6) / 10} MB`;
}

export function taskComplete(status: string): boolean {
  return status === "completed" || status === "submitted" || status === "waived";
}

function taskSummaryFor(tasks: readonly SpeakerTask[]): SpeakerRecord["taskSummary"] {
  return {
    total: tasks.length,
    completed: tasks.filter((task) => taskComplete(task.status)).length,
    overdue: tasks.filter((task) => task.status === "overdue").length,
  };
}
export function speakerProgressComplete(tasks: readonly SpeakerTask[]): boolean {
  return tasks.length > 0 && tasks.every((task) => taskComplete(task.status));
}

export function speakerProgressMatches(
  tasks: readonly SpeakerTask[],
  filter: ProgressFilter,
): boolean {
  if (filter === "all") return true;
  const complete = speakerProgressComplete(tasks);
  return filter === "complete" ? complete : !complete;
}

export interface SpeakerRosterFilterState {
  readonly query: string;
  readonly status: string;
  readonly session: string;
  readonly progress: ProgressFilter;
}

export function filterSpeakerRoster(
  speakers: readonly SpeakerRecord[],
  progressRows: readonly SpeakerProgressRow[],
  filters: SpeakerRosterFilterState,
): readonly SpeakerRecord[] {
  const normalizedQuery = filters.query.trim().toLocaleLowerCase();
  const progressByParticipant = new Map(
    progressRows.map((row) => [row.participantId, row] as const),
  );
  return speakers.filter((speaker) => {
    const matchesQuery =
      normalizedQuery.length === 0 ||
      [
        speaker.displayName,
        speaker.email,
        speaker.jobTitle ?? "",
        speaker.company ?? "",
        speaker.biography,
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedQuery);
    const matchesStatus = filters.status === "all" || speaker.status === filters.status;
    const matchesSession =
      filters.session === "all" ||
      speaker.sessions.some((session) => session.submissionId === filters.session);
    const progressRow = progressByParticipant.get(speaker.participantId);
    const matchesProgress =
      filters.progress === "all" ||
      speakerProgressMatches(progressRow?.tasks ?? [], filters.progress);
    return matchesQuery && matchesStatus && matchesSession && matchesProgress;
  });
}

export interface SpeakerOnboardingTaskDraft {
  readonly title: string;
  readonly dueAt: string;
  readonly participantIds: readonly string[];
}

export function createSpeakerTaskAssignment(
  draft: SpeakerOnboardingTaskDraft,
): SpeakerTaskAssignmentInput {
  return {
    title: draft.title.trim(),
    description: ORGANIZER_ONBOARDING_TASK_DESCRIPTION,
    dueAt: draft.dueAt.trim(),
    participantIds: [...new Set(draft.participantIds.map((id) => id.trim()).filter(Boolean))],
  };
}

export function speakerTaskDefinitionId(task: SpeakerTask): string {
  const participantSuffix = `:${task.participantId}`;
  return task.taskId.endsWith(participantSuffix)
    ? task.taskId.slice(0, -participantSuffix.length)
    : task.taskId;
}

export function speakerOnboardingTaskDefinitions(
  rows: readonly SpeakerProgressRow[],
): readonly SpeakerOnboardingTaskDefinition[] {
  const definitions = new Map<string, SpeakerOnboardingTaskDefinition>();
  for (const row of rows) {
    for (const task of row.tasks) {
      if (task.type !== "general" || task.description !== ORGANIZER_ONBOARDING_TASK_DESCRIPTION) {
        continue;
      }
      const definitionId = speakerTaskDefinitionId(task);
      const current = definitions.get(definitionId);
      definitions.set(definitionId, {
        definitionId,
        title: current?.title ?? task.title,
        dueAt: current?.dueAt ?? task.dueAt,
        participantIds: [...new Set([...(current?.participantIds ?? []), task.participantId])],
      });
    }
  }
  return [...definitions.values()].sort((left, right) =>
    left.definitionId.localeCompare(right.definitionId),
  );
}

export function validateSpeakerTaskAssignment(
  draft: SpeakerOnboardingTaskDraft,
  existingTaskCount: number,
): string | null {
  if (existingTaskCount >= MAX_ORGANIZER_ONBOARDING_TASKS) {
    return `Exactly ${MAX_ORGANIZER_ONBOARDING_TASKS} organizer onboarding tasks are supported.`;
  }
  const input = createSpeakerTaskAssignment(draft);
  if (input.title.length === 0 || input.dueAt.length === 0 || input.participantIds.length === 0) {
    return "Enter a task title, due date, and select at least one speaker.";
  }
  return null;
}

export function retainInvitationHistory(
  current: readonly SpeakerInvitationHistoryEntry[],
  preview: readonly SpeakerInvitationPreview[],
  result: SpeakerInvitationResult,
  occurredAt = new Date().toISOString(),
): readonly SpeakerInvitationHistoryEntry[] {
  return [{ preview: [...preview], result, occurredAt }, ...current];
}

export function speakerInvitationReady(
  previews: readonly SpeakerInvitationPreview[],
  speaker: Pick<SpeakerRecord, "participantId" | "email" | "status">,
): boolean {
  const matching = previews.filter((preview) => preview.participantId === speaker.participantId);
  return (
    speaker.status !== "revoked" &&
    matching.length === 1 &&
    matching[0]?.state === "ready" &&
    normalizedEmail(matching[0].recipientEmail) === normalizedEmail(speaker.email)
  );
}

function taskStatusLabel(status: string): string {
  if (status === "not_started") return "Not started";
  return statusLabel(status);
}

function socialLinksFor(draft: CreateDraft | EditDraft) {
  return {
    ...(draft.twitter.trim() ? { twitter: draft.twitter.trim() } : {}),
    ...(draft.linkedin.trim() ? { linkedin: draft.linkedin.trim() } : {}),
    ...(draft.website.trim() ? { website: draft.website.trim() } : {}),
  };
}
export function travelLogisticsFor(
  draft: CreateDraft | EditDraft,
): Partial<SpeakerTravelLogistics> {
  return {
    travelRequired: draft.travelRequired === true,
    arrivalAt: draft.arrivalAt.trim() || null,
    departureAt: draft.departureAt.trim() || null,
    accommodation: draft.accommodation.trim(),
    dietaryRequirements: draft.dietaryRequirements.trim(),
    accessibilityNeeds: draft.accessibilityNeeds.trim(),
    travelNotes: draft.travelNotes.trim(),
  };
}

function normalizeRoster(
  roster: SpeakerRosterEnvelope,
  organizationId: string,
  eventId: string,
): SpeakerRosterEnvelope {
  if (roster.organizationId !== organizationId || roster.eventId !== eventId) {
    throw new TypeError(
      "The speaker roster response belongs to a different organization or event.",
    );
  }
  return { ...roster, speakers: [...roster.speakers] };
}
function normalizedEmail(value: string): string {
  return value.trim().toLowerCase();
}

export interface DuplicateEmailConflict {
  readonly email: string;
  readonly speakers: readonly SpeakerRecord[];
}

export function duplicateEmailConflicts(
  speakers: readonly SpeakerRecord[],
): readonly DuplicateEmailConflict[] {
  const speakersByEmail = new Map<string, SpeakerRecord[]>();
  for (const speaker of speakers) {
    const email = normalizedEmail(speaker.email);
    if (email.length === 0) continue;
    const entries = speakersByEmail.get(email);
    if (entries === undefined) {
      speakersByEmail.set(email, [speaker]);
    } else {
      entries.push(speaker);
    }
  }
  return [...speakersByEmail.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([email, entries]) => ({ email, speakers: entries }));
}
async function progressFor(
  api: SpeakerApi,
  speakers: readonly SpeakerRecord[],
  organizationId: string,
  eventId: string,
  signal?: AbortSignal,
): Promise<SpeakerProgressEnvelope> {
  const envelopes: SpeakerTaskEnvelope[] = [];
  for (const speaker of speakers) {
    const envelope = await api.listTasks(speaker.participantId, signal);
    if (envelope.tasks.some((task) => task.participantId !== speaker.participantId)) {
      throw new TypeError(
        "The speaker task response contains a task for a different speaker profile.",
      );
    }
    if (
      envelope.organizationId !== organizationId ||
      envelope.eventId !== eventId ||
      envelope.speakerProfileId !== speaker.participantId
    ) {
      throw new TypeError(
        "The speaker task response belongs to a different organization, event, or profile.",
      );
    }
    envelopes.push(envelope);
  }
  return {
    organizationId,
    eventId,
    rows: speakers.map((speaker, index) => ({
      participantId: speaker.participantId,
      displayName: speaker.displayName,
      tasks: envelopes[index]?.tasks ?? [],
    })),
  };
}
function mergeProgressSummaries(
  roster: SpeakerRosterEnvelope,
  progress: SpeakerProgressEnvelope,
): SpeakerRosterEnvelope {
  if (roster.organizationId !== progress.organizationId || roster.eventId !== progress.eventId) {
    throw new TypeError(
      "The speaker progress response belongs to a different organization or event.",
    );
  }
  const rowsByParticipant = new Map(progress.rows.map((row) => [row.participantId, row]));
  return {
    ...roster,
    speakers: roster.speakers.map((speaker) => {
      const row = rowsByParticipant.get(speaker.participantId);
      return row === undefined ? speaker : { ...speaker, taskSummary: taskSummaryFor(row.tasks) };
    }),
  };
}

function mergeSpeaker(
  roster: SpeakerRosterEnvelope,
  participantId: string,
  update: Partial<SpeakerRecord>,
): SpeakerRosterEnvelope {
  return {
    ...roster,
    speakers: roster.speakers.map((speaker) =>
      speaker.participantId === participantId ? { ...speaker, ...update } : speaker,
    ),
  };
}

function SpeakerStatusBadge({ status }: Readonly<{ status: string }>) {
  return <span style={badgeStyle}>{statusLabel(status)}</span>;
}
export interface SpeakerAssetDownloadProps {
  readonly asset: SpeakerAsset;
  readonly downloadUrl: string | null;
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly error: string | null;
  readonly onRequest: (asset: SpeakerAsset) => void;
}

export function SpeakerAssetDownload({
  asset,
  downloadUrl,
  busy,
  disabled,
  error,
  onRequest,
}: SpeakerAssetDownloadProps) {
  if (asset.status === "ready" && downloadUrl !== null) {
    return (
      <a
        className={styles.secondaryButton}
        style={{ marginTop: "0.5rem", width: "fit-content" }}
        href={downloadUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={`Download ${asset.fileName}`}
      >
        Download / view
      </a>
    );
  }
  if (asset.status !== "ready") {
    return (
      <span
        style={{
          display: "block",
          marginTop: "0.5rem",
          color: "var(--admin-muted)",
          fontSize: "0.74rem",
        }}
      >
        Download is not available for this asset.
      </span>
    );
  }
  return (
    <>
      <button
        className={styles.secondaryButton}
        type="button"
        style={{ marginTop: "0.5rem", width: "fit-content" }}
        onClick={() => onRequest(asset)}
        disabled={disabled}
        aria-busy={busy}
        aria-label={`Download ${asset.fileName}`}
      >
        {busy ? "Preparing download…" : "Download / view"}
      </button>
      {error ? (
        <p
          role="alert"
          aria-live="polite"
          style={{
            ...mutedStyle,
            color: "var(--admin-danger)",
            marginTop: "0.35rem",
          }}
        >
          {error}
        </p>
      ) : null}
    </>
  );
}
export function SpeakerAssetMetadata({ asset }: Readonly<{ asset: SpeakerAsset }>) {
  return (
    <span
      style={{
        display: "block",
        marginTop: "0.2rem",
        color: "var(--admin-muted)",
        fontSize: "0.74rem",
      }}
    >
      {asset.contentType} · {assetSize(asset.byteSize)} · {statusLabel(asset.status)} · uploaded{" "}
      {dateLabel(asset.uploadedAt)}
    </span>
  );
}

export interface SpeakerInvitationControlsProps {
  readonly previewBusy: boolean;
  readonly sendBusy: boolean;
  readonly disabled: boolean;
  readonly canSend: boolean;
  readonly onPreview: () => void;
  readonly onSend: () => void;
}

export function SpeakerInvitationControls({
  previewBusy,
  sendBusy,
  disabled,
  canSend,
  onPreview,
  onSend,
}: SpeakerInvitationControlsProps) {
  return (
    <>
      <button
        className={styles.secondaryButton}
        type="button"
        onClick={onPreview}
        disabled={disabled || previewBusy || sendBusy}
      >
        {previewBusy ? "Preparing invite…" : "Preview portal invite"}
      </button>
      <button
        className={styles.primaryButton}
        type="button"
        onClick={onSend}
        disabled={disabled || sendBusy || previewBusy || !canSend}
      >
        {sendBusy ? "Sending invite…" : "Send portal invite"}
      </button>
    </>
  );
}

function FormMessage({ message, error = false }: Readonly<{ message: string; error?: boolean }>) {
  return (
    <p
      role={error ? "alert" : "status"}
      aria-live="polite"
      style={{ ...mutedStyle, color: error ? "var(--admin-danger)" : undefined }}
    >
      {message}
    </p>
  );
}

function ProfileFields({
  draft,
  onChange,
  disabled,
}: Readonly<{
  draft: CreateDraft | EditDraft;
  onChange: (field: keyof CreateDraft, value: string | boolean) => void;
  disabled: boolean;
}>) {
  return (
    <>
      <div style={fieldGridStyle}>
        <label style={fieldStyle}>
          <span style={labelStyle}>Name</span>
          <input
            style={inputStyle}
            value={draft.displayName}
            onChange={(event) => onChange("displayName", event.target.value)}
            required
            maxLength={200}
            disabled={disabled}
          />
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>Email</span>
          <input
            style={inputStyle}
            type="email"
            value={draft.email}
            onChange={(event) => onChange("email", event.target.value)}
            required
            maxLength={320}
            disabled={disabled}
          />
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>Title</span>
          <input
            style={inputStyle}
            value={draft.title}
            onChange={(event) => onChange("title", event.target.value)}
            placeholder="Principal Engineer"
            maxLength={160}
            disabled={disabled}
          />
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>Company</span>
          <input
            style={inputStyle}
            value={draft.company}
            onChange={(event) => onChange("company", event.target.value)}
            placeholder="Organization"
            maxLength={200}
            disabled={disabled}
          />
        </label>
      </div>
      <label style={fieldStyle}>
        <span style={labelStyle}>Biography</span>
        <textarea
          style={textAreaStyle}
          value={draft.biography}
          onChange={(event) => onChange("biography", event.target.value)}
          maxLength={20_000}
          disabled={disabled}
        />
      </label>
      <div style={fieldGridStyle}>
        <label style={fieldStyle}>
          <span style={labelStyle}>Twitter / X</span>
          <input
            style={inputStyle}
            value={draft.twitter}
            onChange={(event) => onChange("twitter", event.target.value)}
            placeholder="https://x.com/…"
            maxLength={500}
            disabled={disabled}
          />
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>LinkedIn</span>
          <input
            style={inputStyle}
            value={draft.linkedin}
            onChange={(event) => onChange("linkedin", event.target.value)}
            placeholder="https://linkedin.com/in/…"
            maxLength={500}
            disabled={disabled}
          />
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>Website</span>
          <input
            style={inputStyle}
            value={draft.website}
            onChange={(event) => onChange("website", event.target.value)}
            placeholder="https://…"
            maxLength={500}
            disabled={disabled}
          />
        </label>
      </div>
      <fieldset
        style={{
          display: "grid",
          gap: "0.75rem",
          margin: 0,
          padding: "0.85rem",
          border: "1px solid var(--admin-border)",
          borderRadius: "var(--admin-radius-sm)",
        }}
      >
        <legend style={{ padding: "0 0.35rem", ...labelStyle }}>Travel and logistics</legend>
        <label style={{ ...fieldStyle, display: "flex", alignItems: "center", gap: "0.45rem" }}>
          <input
            type="checkbox"
            checked={draft.travelRequired}
            onChange={(event) => onChange("travelRequired", event.target.checked)}
            disabled={disabled}
          />
          Speaker requires travel coordination
        </label>
        <div style={fieldGridStyle}>
          <label style={fieldStyle}>
            <span style={labelStyle}>Arrival date</span>
            <input
              style={inputStyle}
              type="date"
              value={draft.arrivalAt}
              onChange={(event) => onChange("arrivalAt", event.target.value)}
              disabled={disabled}
            />
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>Departure date</span>
            <input
              style={inputStyle}
              type="date"
              value={draft.departureAt}
              onChange={(event) => onChange("departureAt", event.target.value)}
              disabled={disabled}
            />
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>Accommodation</span>
            <input
              style={inputStyle}
              value={draft.accommodation}
              onChange={(event) => onChange("accommodation", event.target.value)}
              maxLength={500}
              disabled={disabled}
            />
          </label>
        </div>
        <div style={fieldGridStyle}>
          <label style={fieldStyle}>
            <span style={labelStyle}>Dietary requirements</span>
            <input
              style={inputStyle}
              value={draft.dietaryRequirements}
              onChange={(event) => onChange("dietaryRequirements", event.target.value)}
              maxLength={2_000}
              disabled={disabled}
            />
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>Accessibility needs</span>
            <input
              style={inputStyle}
              value={draft.accessibilityNeeds}
              onChange={(event) => onChange("accessibilityNeeds", event.target.value)}
              maxLength={2_000}
              disabled={disabled}
            />
          </label>
        </div>
        <label style={fieldStyle}>
          <span style={labelStyle}>Travel notes</span>
          <textarea
            style={{ ...textAreaStyle, minHeight: "4.5rem" }}
            value={draft.travelNotes}
            onChange={(event) => onChange("travelNotes", event.target.value)}
            maxLength={5_000}
            disabled={disabled}
          />
        </label>
      </fieldset>
    </>
  );
}

export function SpeakerWorkspace({
  organizationId,
  eventId,
  baseUrl: explicitBaseUrl,
  api: providedApi,
}: SpeakerWorkspaceProps) {
  const baseUrl = apiBaseUrl(explicitBaseUrl);
  const [api, setApi] = useState<SpeakerApi | null>(providedApi ?? null);
  const [roster, setRoster] = useState<SpeakerRosterEnvelope | null>(null);
  const [progress, setProgress] = useState<SpeakerProgressEnvelope | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedSpeakerIds, setSelectedSpeakerIds] = useState<readonly string[]>([]);
  const [emailTemplates, setEmailTemplates] = useState<readonly SpeakerEmailTemplate[]>([]);
  const [emailTemplateId, setEmailTemplateId] = useState("");
  const [emailTemplateVersion, setEmailTemplateVersion] = useState<number | undefined>(undefined);
  const [emailTemplateName, setEmailTemplateName] = useState("Speaker update");
  const [emailSubject, setEmailSubject] = useState("Update for {{first_name}}");
  const [emailHtml, setEmailHtml] = useState("<p>Hello {{first_name}},</p>");
  const [emailText, setEmailText] = useState("Hello {{first_name}},");
  const [emailPreview, setEmailPreview] = useState<SpeakerEmailPreview | null>(null);
  const [emailSends, setEmailSends] = useState<readonly SpeakerEmailSend[]>([]);
  const [emailSaveBusy, setEmailSaveBusy] = useState(false);
  const [emailPreviewBusy, setEmailPreviewBusy] = useState(false);
  const [emailSendBusy, setEmailSendBusy] = useState(false);
  const [emailHistoryBusy, setEmailHistoryBusy] = useState(false);
  const [emailSendIdempotencyKey, setEmailSendIdempotencyKey] = useState<string | null>(null);
  const [emailCreateTemplateId, setEmailCreateTemplateId] = useState<string | null>(null);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);
  const [reminderEligibility, setReminderEligibility] =
    useState<SpeakerReminderEligibilityEnvelope | null>(null);
  const [sessionFilter, setSessionFilter] = useState("all");
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [createDraft, setCreateDraft] = useState<CreateDraft>(emptyCreateDraft);
  const [createIdempotencyKey, setCreateIdempotencyKey] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<SpeakerImportPreview | null>(null);
  const [importIdempotencyKey, setImportIdempotencyKey] = useState<string | null>(null);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueAt, setTaskDueAt] = useState("");
  const [taskAssignees, setTaskAssignees] = useState<readonly string[]>([]);
  const [invitationPreview, setInvitationPreview] = useState<
    readonly SpeakerInvitationPreview[] | null
  >(null);
  const [invitationResult, setInvitationResult] = useState<SpeakerInvitationResult | null>(null);
  const [invitationResultParticipantId, setInvitationResultParticipantId] = useState<string | null>(
    null,
  );
  const [invitationError, setInvitationError] = useState<string | null>(null);
  const [invitationSendIdempotencyKey, setInvitationSendIdempotencyKey] = useState<string | null>(
    null,
  );
  const [invitationHistory, setInvitationHistory] = useState<
    readonly SpeakerInvitationHistoryEntry[]
  >([]);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailNotice, setDetailNotice] = useState<string | null>(null);
  const [downloadUrls, setDownloadUrls] = useState<Readonly<Record<string, string>>>({});
  const [downloadErrors, setDownloadErrors] = useState<Readonly<Record<string, string>>>({});
  const [downloadBusyAssetId, setDownloadBusyAssetId] = useState<string | null>(null);
  const [invitationPreviewBusy, setInvitationPreviewBusy] = useState(false);
  const [invitationSendBusy, setInvitationSendBusy] = useState(false);
  const [importPreviewBusy, setImportPreviewBusy] = useState(false);
  const [importCommitBusy, setImportCommitBusy] = useState(false);
  const [taskBusy, setTaskBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const rosterRequestRef = useRef(0);
  const importRequestRef = useRef(0);
  const importBusy = importPreviewBusy || importCommitBusy;

  useEffect(() => {
    if (providedApi !== undefined) {
      setApi(providedApi);
      return;
    }
    try {
      setApi(createSpeakerApi(baseUrl, organizationId, eventId));
    } catch (reason: unknown) {
      setApi(null);
      setError(errorMessage(reason));
    }
  }, [baseUrl, eventId, organizationId, providedApi]);

  useEffect(() => {
    if (api === null) {
      setLoading(false);
      return;
    }
    const requestId = rosterRequestRef.current + 1;
    rosterRequestRef.current = requestId;
    const controller = new AbortController();
    let active = true;
    let rosterTimedOut = false;
    const rosterTimeout = setTimeout(() => {
      rosterTimedOut = true;
      controller.abort();
    }, ASYNC_ACTION_TIMEOUT_MS);
    let progressController: AbortController | null = null;
    setLoading(true);
    setError(null);
    setProgressError(null);
    setProgress(null);
    setInvitationPreview(null);
    setInvitationResult(null);
    setInvitationResultParticipantId(null);
    setInvitationError(null);
    setInvitationSendIdempotencyKey(null);
    void api
      .list(controller.signal)
      .then((nextRoster) => {
        const normalizedRoster = normalizeRoster(nextRoster, organizationId, eventId);
        if (!active || requestId !== rosterRequestRef.current) return;
        setRoster(normalizedRoster);
        setSelectedSpeakerIds((current) =>
          current.filter((participantId) =>
            normalizedRoster.speakers.some((speaker) => speaker.participantId === participantId),
          ),
        );
        setSelectedId((current) =>
          current !== null &&
          normalizedRoster.speakers.some((speaker) => speaker.participantId === current)
            ? current
            : (normalizedRoster.speakers[0]?.participantId ?? null),
        );
        setLoading(false);

        const nextProgressController = new AbortController();
        progressController = nextProgressController;
        let progressTimedOut = false;
        const progressTimeout = setTimeout(() => {
          progressTimedOut = true;
          nextProgressController.abort();
        }, ASYNC_ACTION_TIMEOUT_MS);
        void progressFor(
          api,
          normalizedRoster.speakers,
          organizationId,
          eventId,
          nextProgressController.signal,
        )
          .then((nextProgress) => {
            if (!active || requestId !== rosterRequestRef.current) return;
            setProgress(nextProgress);
            setRoster((current) =>
              current === null ? current : mergeProgressSummaries(current, nextProgress),
            );
          })
          .catch((reason: unknown) => {
            if (!active || requestId !== rosterRequestRef.current) return;
            setProgressError(
              progressTimedOut
                ? "Speaker progress refresh timed out. Try again."
                : errorMessage(reason),
            );
          })
          .finally(() => {
            clearTimeout(progressTimeout);
          });
      })
      .catch((reason: unknown) => {
        if (!active || requestId !== rosterRequestRef.current) return;
        setError(
          rosterTimedOut
            ? "Speaker roster refresh timed out. The last loaded roster is still shown."
            : errorMessage(reason),
        );
      })
      .finally(() => {
        clearTimeout(rosterTimeout);
        if (active && requestId === rosterRequestRef.current) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
      progressController?.abort();
    };
  }, [api, baseUrl, eventId, organizationId]);
  useEffect(() => {
    if (api === null) return;
    let active = true;
    void withTimeout((signal) => api.listEmailTemplates(signal), "Email template load")
      .then((templates) => {
        if (!active) return;
        setEmailTemplates(templates);
        const latest = templates
          .slice()
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
        if (latest !== undefined) {
          setEmailTemplateId(latest.id);
          setEmailTemplateVersion(latest.version);
          setEmailTemplateName(latest.name);
          setEmailSubject(latest.subject);
          setEmailHtml(latest.html);
          setEmailText(latest.text);
        }
      })
      .catch(() => undefined);
    void withTimeout((signal) => api.listEmailHistory(signal), "Email history load")
      .then((history) => {
        if (active) setEmailSends(history);
      })
      .catch(() => undefined);
    void withTimeout(
      (signal) => api.getReminderEligibility({}, signal),
      "Reminder eligibility load",
    )
      .then((eligibility) => {
        if (active) setReminderEligibility(eligibility);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api]);

  const speakers = roster?.speakers ?? [];
  const selectedSpeaker = speakers.find((speaker) => speaker.participantId === selectedId) ?? null;
  const duplicateEmailWarnings = useMemo(() => duplicateEmailConflicts(speakers), [speakers]);
  const emailAnyBusy = emailSaveBusy || emailPreviewBusy || emailSendBusy || emailHistoryBusy;
  const statusOptions = useMemo(() => {
    const values = new Set<string>([
      ...DEFAULT_STATUS_OPTIONS,
      ...speakers.map((speaker) => speaker.status),
    ]);
    return [...values];
  }, [speakers]);
  const sessionOptions = useMemo(() => {
    const values = new Map<string, string>();
    for (const speaker of speakers) {
      for (const session of speaker.sessions) {
        values.set(session.submissionId, session.title);
      }
    }
    return [...values.entries()].sort((left, right) => left[1].localeCompare(right[1]));
  }, [speakers]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredSpeakers = useMemo(
    () =>
      filterSpeakerRoster(speakers, progress?.rows ?? [], {
        query,
        status: statusFilter,
        session: sessionFilter,
        progress: progressFilter,
      }),
    [progress?.rows, progressFilter, query, sessionFilter, speakers, statusFilter],
  );
  const progressRows = useMemo(
    () => (progress?.rows ?? []).filter((row) => speakerProgressMatches(row.tasks, progressFilter)),
    [progress?.rows, progressFilter],
  );
  const onboardingTaskDefinitions = useMemo(
    () => speakerOnboardingTaskDefinitions(progress?.rows ?? []),
    [progress?.rows],
  );
  const selectedInvitationPreview =
    selectedSpeaker === null
      ? []
      : (invitationPreview ?? []).filter(
          (preview) => preview.participantId === selectedSpeaker.participantId,
        );
  const invitationPreviewCount = selectedInvitationPreview.length;
  const invitationReady =
    selectedSpeaker !== null && speakerInvitationReady(invitationPreview ?? [], selectedSpeaker);
  const selectedInvitationResultRecipient =
    selectedSpeaker === null ||
    invitationResult === null ||
    invitationResultParticipantId !== selectedSpeaker.participantId
      ? null
      : (invitationResult.recipients.find(
          (recipient) => recipient.participantId === selectedSpeaker.participantId,
        ) ?? null);
  const hasActiveRosterFilters =
    normalizedQuery.length > 0 ||
    statusFilter !== "all" ||
    sessionFilter !== "all" ||
    progressFilter !== "all";
  const selectedVisibleSpeakerIds = filteredSpeakers
    .map((speaker) => speaker.participantId)
    .filter((participantId) => selectedSpeakerIds.includes(participantId));
  const allVisibleSelected =
    filteredSpeakers.length > 0 && selectedVisibleSpeakerIds.length === filteredSpeakers.length;

  function clearRosterFilters(): void {
    setQuery("");
    setStatusFilter("all");
    setSessionFilter("all");
    setProgressFilter("all");
  }

  function toggleSpeakerSelection(participantId: string): void {
    setSelectedSpeakerIds((current) =>
      current.includes(participantId)
        ? current.filter((candidate) => candidate !== participantId)
        : [...current, participantId],
    );
    setEmailPreview(null);
    setEmailNotice(null);
    setEmailSendIdempotencyKey(null);
  }

  function toggleVisibleSpeakerSelection(): void {
    const visibleIds = filteredSpeakers.map((speaker) => speaker.participantId);
    setSelectedSpeakerIds((current) =>
      allVisibleSelected
        ? current.filter((participantId) => !visibleIds.includes(participantId))
        : [...new Set([...current, ...visibleIds])],
    );
    setEmailPreview(null);
    setEmailNotice(null);
    setEmailSendIdempotencyKey(null);
  }

  function clearSpeakerSelection(): void {
    setSelectedSpeakerIds([]);
    setEmailPreview(null);
    setEmailNotice(null);
    setEmailSendIdempotencyKey(null);
  }

  function updateCreate(field: keyof CreateDraft, value: string | boolean): void {
    setCreateDraft((current) => ({ ...current, [field]: value }) as CreateDraft);
    setCreateIdempotencyKey(null);
    setNotice(null);
  }

  function updateEdit(field: keyof CreateDraft, value: string | boolean): void {
    setEditDraft((current) =>
      current === null ? current : ({ ...current, [field]: value } as EditDraft),
    );
    setEditError(null);
    setNotice(null);
    setInvitationPreview(null);
    setInvitationResult(null);
    setInvitationResultParticipantId(null);
    setInvitationError(null);
    setInvitationSendIdempotencyKey(null);
  }

  function applyAuthoritativeRoster(nextRoster: SpeakerRosterEnvelope, message?: string): void {
    try {
      const normalizedRoster = normalizeRoster(nextRoster, organizationId, eventId);
      const requestId = rosterRequestRef.current + 1;
      rosterRequestRef.current = requestId;
      setRoster(normalizedRoster);
      setLoading(false);
      setSelectedSpeakerIds((current) =>
        current.filter((participantId) =>
          normalizedRoster.speakers.some((speaker) => speaker.participantId === participantId),
        ),
      );
      setSelectedId((current) =>
        current !== null &&
        normalizedRoster.speakers.some((speaker) => speaker.participantId === current)
          ? current
          : (normalizedRoster.speakers[0]?.participantId ?? null),
      );
      setError(null);
      setProgressError(null);
      setProgress(null);
      setInvitationPreview(null);
      setInvitationResult(null);
      setInvitationResultParticipantId(null);
      setInvitationError(null);
      setInvitationSendIdempotencyKey(null);
      if (message) setNotice(message);
      if (api !== null) {
        const progressController = new AbortController();
        let progressTimedOut = false;
        const progressTimeout = setTimeout(() => {
          progressTimedOut = true;
          progressController.abort();
        }, ASYNC_ACTION_TIMEOUT_MS);
        void progressFor(
          api,
          normalizedRoster.speakers,
          organizationId,
          eventId,
          progressController.signal,
        )
          .then((nextProgress) => {
            if (requestId !== rosterRequestRef.current) return;
            setProgress(nextProgress);
            setRoster((current) =>
              current === null ? current : mergeProgressSummaries(current, nextProgress),
            );
          })
          .catch((reason: unknown) => {
            if (requestId !== rosterRequestRef.current) return;
            setProgressError(
              progressTimedOut
                ? "Speaker progress refresh timed out. Try again."
                : errorMessage(reason),
            );
          })
          .finally(() => {
            clearTimeout(progressTimeout);
          });
      }
    } catch (reason: unknown) {
      setError(errorMessage(reason));
    }
  }
  async function reload(message?: string): Promise<void> {
    if (api === null) {
      setError("The speaker API is unavailable.");
      return;
    }
    const requestId = rosterRequestRef.current + 1;
    rosterRequestRef.current = requestId;
    const controller = new AbortController();
    let rosterTimedOut = false;
    const rosterTimeout = setTimeout(() => {
      rosterTimedOut = true;
      controller.abort();
    }, ASYNC_ACTION_TIMEOUT_MS);
    setLoading(true);
    setError(null);
    setProgressError(null);
    setProgress(null);
    setInvitationPreview(null);
    setInvitationResult(null);
    setInvitationResultParticipantId(null);
    setInvitationError(null);
    setInvitationSendIdempotencyKey(null);
    try {
      const nextRoster = normalizeRoster(
        await api.list(controller.signal),
        organizationId,
        eventId,
      );
      if (requestId !== rosterRequestRef.current) return;
      setRoster(nextRoster);
      setSelectedSpeakerIds((current) =>
        current.filter((participantId) =>
          nextRoster.speakers.some((speaker) => speaker.participantId === participantId),
        ),
      );
      setSelectedId((current) =>
        current !== null && nextRoster.speakers.some((speaker) => speaker.participantId === current)
          ? current
          : (nextRoster.speakers[0]?.participantId ?? null),
      );
      setLoading(false);
      if (message) setNotice(message);

      const progressController = new AbortController();
      let progressTimedOut = false;
      const progressTimeout = setTimeout(() => {
        progressTimedOut = true;
        progressController.abort();
      }, ASYNC_ACTION_TIMEOUT_MS);
      void progressFor(api, nextRoster.speakers, organizationId, eventId, progressController.signal)
        .then((nextProgress) => {
          if (requestId !== rosterRequestRef.current) return;
          setProgress(nextProgress);
          setRoster((current) =>
            current === null ? current : mergeProgressSummaries(current, nextProgress),
          );
          setProgressError(null);
        })
        .catch((reason: unknown) => {
          if (requestId !== rosterRequestRef.current) return;
          setProgressError(
            progressTimedOut
              ? "Speaker progress refresh timed out. Try again."
              : errorMessage(reason),
          );
        })
        .finally(() => {
          clearTimeout(progressTimeout);
        });
    } catch (reason: unknown) {
      if (requestId === rosterRequestRef.current) {
        setError(
          rosterTimedOut
            ? "Speaker roster refresh timed out. The last loaded roster is still shown."
            : errorMessage(reason),
        );
      }
    } finally {
      clearTimeout(rosterTimeout);
      if (requestId === rosterRequestRef.current) setLoading(false);
    }
  }

  async function createSpeaker(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (api === null) {
      setNotice("Speaker creation is unavailable until the organizer speaker API is configured.");
      return;
    }
    const idempotencyKey = createIdempotencyKey ?? crypto.randomUUID();
    setCreateIdempotencyKey(idempotencyKey);
    const input: SpeakerCreateInput = {
      idempotencyKey,
      displayName: createDraft.displayName.trim(),
      email: createDraft.email.trim(),
      jobTitle: createDraft.title.trim(),
      company: createDraft.company.trim(),
      biography: createDraft.biography.trim(),
      socialLinks: socialLinksFor(createDraft),
      travelLogistics: travelLogisticsFor(createDraft),
      status: createDraft.status,
    };
    if (!input.displayName || !input.email) {
      setNotice("Name and email are required.");
      return;
    }
    setSaveBusy(true);
    setNotice(null);
    try {
      const created = await api.create(input);
      setCreateDraft(emptyCreateDraft());
      setCreateIdempotencyKey(null);
      setShowAdd(false);
      applyAuthoritativeRoster(created, "Speaker added to the roster.");
    } catch (reason: unknown) {
      setNotice(errorMessage(reason));
    } finally {
      setSaveBusy(false);
    }
  }

  function beginEdit(speaker: SpeakerRecord): void {
    setSelectedId(speaker.participantId);
    setEditDraft(editDraftFor(speaker));
    setEditError(null);
    setInvitationPreview(null);
    setInvitationResult(null);
    setInvitationResultParticipantId(null);
    setInvitationError(null);
    setInvitationSendIdempotencyKey(null);
    setDetailNotice(null);
  }

  async function saveSpeaker(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (api === null || editDraft === null || selectedSpeaker === null) return;
    const input: SpeakerUpdateInput = {
      expectedVersion: editDraft.expectedVersion,
      displayName: editDraft.displayName.trim(),
      email: editDraft.email.trim(),
      jobTitle: editDraft.title.trim(),
      company: editDraft.company.trim(),
      biography: editDraft.biography.trim(),
      socialLinks: socialLinksFor(editDraft),
      travelLogistics: travelLogisticsFor(editDraft),
      status: editDraft.status,
    };
    if (!input.displayName || !input.email) {
      setEditError("Name and email are required.");
      return;
    }
    setInvitationPreview(null);
    setInvitationResult(null);
    setInvitationResultParticipantId(null);
    setInvitationError(null);
    setInvitationSendIdempotencyKey(null);
    setSaveBusy(true);
    setEditError(null);
    try {
      const updatedRoster = await api.update(selectedSpeaker.participantId, input);
      const updated = updatedRoster.speakers.find(
        (speaker) => speaker.participantId === selectedSpeaker.participantId,
      );
      if (updated === undefined)
        throw new TypeError("The saved speaker is missing from the roster.");
      setEditDraft(editDraftFor(updated));
      applyAuthoritativeRoster(updatedRoster, "Speaker profile saved.");
    } catch (reason: unknown) {
      setEditError(errorMessage(reason));
    } finally {
      setSaveBusy(false);
    }
  }

  async function previewCsv(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) {
      input.value = "";
      return;
    }
    const requestId = importRequestRef.current + 1;
    importRequestRef.current = requestId;
    input.value = "";
    setImportFileName(file.name);
    setImportPreview(null);
    setImportIdempotencyKey(null);
    setImportPreviewBusy(true);
    setNotice(null);
    try {
      if (api === null) {
        throw new Error("CSV import is unavailable until the organizer speaker API is configured.");
      }
      const preview = await withTimeout(
        (signal) => api.previewImport(file, signal),
        "CSV validation",
      );
      if (requestId !== importRequestRef.current) return;
      setImportPreview(preview);
      setImportIdempotencyKey(crypto.randomUUID());
      setNotice(
        `CSV preview ready: ${preview.validRows.length} valid row${preview.validRows.length === 1 ? "" : "s"}.`,
      );
    } catch (reason: unknown) {
      if (requestId === importRequestRef.current) setNotice(errorMessage(reason));
    } finally {
      if (requestId === importRequestRef.current) {
        setImportPreviewBusy(false);
        input.value = "";
      }
    }
  }

  async function commitCsv(): Promise<void> {
    if (api === null || importPreview === null || importPreview.validRows.length === 0) return;
    const idempotencyKey = importIdempotencyKey ?? crypto.randomUUID();
    setImportIdempotencyKey(idempotencyKey);
    setImportCommitBusy(true);
    setNotice(null);
    try {
      const rowCount = importPreview.validRows.length;
      const imported = await withTimeout(
        (signal) =>
          api.commitImport(
            {
              rows: importPreview.validRows,
              idempotencyKey,
            },
            signal,
          ),
        "CSV import",
      );
      setImportPreview(null);
      setImportFileName(null);
      setImportIdempotencyKey(null);
      applyAuthoritativeRoster(
        imported,
        `CSV import committed: ${rowCount} valid row${rowCount === 1 ? "" : "s"}.`,
      );
    } catch (reason: unknown) {
      setNotice(errorMessage(reason));
    } finally {
      setImportCommitBusy(false);
    }
  }

  function toggleAssignee(participantId: string): void {
    setTaskAssignees((current) =>
      current.includes(participantId)
        ? current.filter((candidate) => candidate !== participantId)
        : [...current, participantId],
    );
  }

  async function assignTask(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (api === null) {
      setNotice("Task assignment is unavailable until the organizer speaker API is configured.");
      return;
    }
    if (progress === null || progressError !== null) {
      setNotice("Wait for API-backed onboarding progress to load before assigning another task.");
      return;
    }
    const draft = {
      title: taskTitle,
      dueAt: taskDueAt,
      participantIds: taskAssignees,
    } satisfies SpeakerOnboardingTaskDraft;
    const validationError = validateSpeakerTaskAssignment(draft, onboardingTaskDefinitions.length);
    if (validationError !== null) {
      setNotice(validationError);
      return;
    }
    const input = createSpeakerTaskAssignment(draft);
    setTaskBusy(true);
    setNotice(null);
    try {
      const latest = await withTimeout(async (signal) => {
        const latestRoster = normalizeRoster(await api.list(signal), organizationId, eventId);
        const latestProgress = await progressFor(
          api,
          latestRoster.speakers,
          organizationId,
          eventId,
          signal,
        );
        return { latestRoster, latestProgress };
      }, "Onboarding task preflight");
      setProgress(latest.latestProgress);
      setRoster(mergeProgressSummaries(latest.latestRoster, latest.latestProgress));
      setInvitationPreview(null);
      setInvitationResult(null);
      setInvitationResultParticipantId(null);
      setInvitationError(null);
      setInvitationSendIdempotencyKey(null);
      const latestValidationError = validateSpeakerTaskAssignment(
        draft,
        speakerOnboardingTaskDefinitions(latest.latestProgress.rows).length,
      );
      if (latestValidationError !== null) {
        setNotice(latestValidationError);
        return;
      }
      const taskEnvelope = await api.assignTasks(input);
      if (taskEnvelope.organizationId !== organizationId || taskEnvelope.eventId !== eventId) {
        throw new TypeError(
          "The speaker task response belongs to a different organization or event.",
        );
      }
      const returnedAssignees = new Set(taskEnvelope.tasks.map((task) => task.participantId));
      if (
        taskEnvelope.tasks.length !== input.participantIds.length ||
        returnedAssignees.size !== input.participantIds.length ||
        input.participantIds.some((participantId) => !returnedAssignees.has(participantId)) ||
        taskEnvelope.tasks.some(
          (task) =>
            task.title !== input.title ||
            task.description !== input.description ||
            task.dueAt !== input.dueAt ||
            task.type !== "general",
        )
      ) {
        throw new TypeError("The speaker task response does not match the selected assignees.");
      }
      setRoster((current) =>
        current === null
          ? current
          : {
              ...current,
              speakers: current.speakers.map((speaker) => {
                const added = taskEnvelope.tasks.filter(
                  (task) => task.participantId === speaker.participantId,
                ).length;
                return added === 0
                  ? speaker
                  : {
                      ...speaker,
                      taskSummary: {
                        ...speaker.taskSummary,
                        total: speaker.taskSummary.total + added,
                      },
                    };
              }),
            },
      );
      setProgress((current) => {
        const rows =
          current?.rows ??
          speakers.map((speaker) => ({
            participantId: speaker.participantId,
            displayName: speaker.displayName,
            tasks: [],
          }));
        return {
          organizationId,
          eventId,
          rows: rows.map((row) => {
            const assigned = taskEnvelope.tasks.filter(
              (task) => task.participantId === row.participantId,
            );
            return assigned.length === 0 ? row : { ...row, tasks: [...row.tasks, ...assigned] };
          }),
        };
      });
      setTaskTitle("");
      setTaskDueAt("");
      setTaskAssignees([]);
      void api
        .getReminderEligibility()
        .then(setReminderEligibility)
        .catch(() => undefined);
      setNotice("General action task assigned to selected speakers.");
    } catch (reason: unknown) {
      setNotice(errorMessage(reason));
    } finally {
      setTaskBusy(false);
    }
  }

  async function refreshEmailHistory(): Promise<void> {
    if (api === null) {
      setEmailNotice("Email history is unavailable until the organizer speaker API is configured.");
      return;
    }
    setEmailHistoryBusy(true);
    setEmailNotice(null);
    try {
      const history = await withTimeout(
        (signal) => api.listEmailHistory(signal),
        "Email history refresh",
      );
      setEmailSends(history);
      setEmailNotice(
        `Email history refreshed: ${history.length} send${history.length === 1 ? "" : "s"}.`,
      );
    } catch (reason: unknown) {
      setEmailNotice(errorMessage(reason));
    } finally {
      setEmailHistoryBusy(false);
    }
  }

  async function saveEmailTemplate(): Promise<SpeakerEmailTemplate | null> {
    if (api === null) {
      setEmailNotice(
        "Email templates are unavailable until the organizer speaker API is configured.",
      );
      return null;
    }
    setEmailSaveBusy(true);
    setEmailNotice(null);
    try {
      const newTemplateId = emailCreateTemplateId ?? `speaker-email-draft:${crypto.randomUUID()}`;
      if (emailTemplateId.length === 0) setEmailCreateTemplateId(newTemplateId);
      const template = emailTemplateId
        ? await withTimeout(
            (signal) =>
              api.createEmailTemplateVersion(
                {
                  templateId: emailTemplateId,
                  subject: emailSubject,
                  html: emailHtml,
                  text: emailText,
                },
                signal,
              ),
            "Email template save",
          )
        : await withTimeout(
            (signal) =>
              api.createEmailTemplate(
                {
                  templateId: newTemplateId,
                  name: emailTemplateName,
                  subject: emailSubject,
                  html: emailHtml,
                  text: emailText,
                },
                signal,
              ),
            "Email template save",
          );
      setEmailTemplates((current) => [
        ...current.filter(
          (candidate) => !(candidate.id === template.id && candidate.version === template.version),
        ),
        template,
      ]);
      setEmailTemplateId(template.id);
      setEmailCreateTemplateId(null);
      setEmailTemplateVersion(template.version);
      setEmailTemplateName(template.name);
      setEmailSubject(template.subject);
      setEmailHtml(template.html);
      setEmailText(template.text);
      setEmailNotice(`Template version ${template.version} saved.`);
      setEmailPreview(null);
      setEmailSendIdempotencyKey(null);
      return template;
    } catch (reason: unknown) {
      setEmailNotice(errorMessage(reason));
      return null;
    } finally {
      setEmailSaveBusy(false);
    }
  }

  async function previewBulkEmail(): Promise<void> {
    if (api === null) {
      setEmailNotice("Bulk email is unavailable until the organizer speaker API is configured.");
      return;
    }
    if (selectedSpeakerIds.length === 0) {
      setEmailNotice("Select at least one speaker before previewing an email.");
      return;
    }
    setEmailPreviewBusy(true);
    setEmailNotice(null);
    try {
      const recipientIds = [...selectedSpeakerIds];
      let templateId = emailTemplateId;
      let templateVersion = emailTemplateVersion;
      const newTemplateId = emailCreateTemplateId ?? `speaker-email-draft:${crypto.randomUUID()}`;
      if (templateId.length === 0) setEmailCreateTemplateId(newTemplateId);
      if (templateId.length === 0) {
        const created = await withTimeout(
          (signal) =>
            api.createEmailTemplate(
              {
                templateId: newTemplateId,
                name: emailTemplateName,
                subject: emailSubject,
                html: emailHtml,
                text: emailText,
              },
              signal,
            ),
          "Email template preparation",
        );
        templateId = created.id;
        templateVersion = created.version;
        setEmailTemplateId(created.id);
        setEmailTemplateVersion(created.version);
        setEmailTemplateName(created.name);
        setEmailSubject(created.subject);
        setEmailHtml(created.html);
        setEmailText(created.text);
        setEmailTemplates((current) => [
          ...current.filter(
            (candidate) => !(candidate.id === created.id && candidate.version === created.version),
          ),
          created,
        ]);
      }
      const preview = await withTimeout(
        (signal) =>
          api.previewEmails(
            {
              participantIds: recipientIds,
              templateId,
              ...(templateVersion === undefined ? {} : { templateVersion }),
            },
            signal,
          ),
        "Email merge preview",
      );
      setEmailPreview(preview);
      setEmailTemplateId(preview.templateId);
      setEmailCreateTemplateId(null);
      setEmailTemplateVersion(preview.templateVersion);
      setEmailSendIdempotencyKey(null);
      setEmailNotice(
        `Merge preview ready for ${preview.recipientIds.length} selected speaker${preview.recipientIds.length === 1 ? "" : "s"}.`,
      );
    } catch (reason: unknown) {
      setEmailNotice(errorMessage(reason));
    } finally {
      setEmailPreviewBusy(false);
    }
  }

  async function sendBulkEmail(): Promise<void> {
    if (api === null || emailPreview === null) {
      setEmailNotice("Create a merge preview before queueing the email.");
      return;
    }
    const preview = emailPreview;
    const idempotencyKey = emailSendIdempotencyKey ?? crypto.randomUUID();
    setEmailSendIdempotencyKey(idempotencyKey);
    setEmailSendBusy(true);
    setEmailNotice(null);
    try {
      const send = await withTimeout(
        (signal) =>
          api.sendEmails(
            {
              previewId: preview.id,
              idempotencyKey,
            },
            signal,
          ),
        "Speaker email queue",
      );
      setEmailSends((current) => [
        send,
        ...current.filter((candidate) => candidate.id !== send.id),
      ]);
      setEmailNotice(
        `Speaker email ${send.status} for ${send.recipientIds.length} recipient${send.recipientIds.length === 1 ? "" : "s"}. Queue history is retained below.`,
      );
    } catch (reason: unknown) {
      setEmailNotice(errorMessage(reason));
    } finally {
      setEmailSendBusy(false);
    }
  }
  async function previewSelectedSpeakerInvitation(): Promise<void> {
    if (api === null || selectedSpeaker === null) {
      setInvitationError(
        "Portal invitations are unavailable until the organizer speaker API is configured.",
      );
      return;
    }
    const participantId = selectedSpeaker.participantId;
    setInvitationPreviewBusy(true);
    setInvitationPreview(null);
    setInvitationResult(null);
    setInvitationResultParticipantId(null);
    setInvitationError(null);
    setInvitationSendIdempotencyKey(null);
    try {
      const preview = await withTimeout(
        () => api.previewInvitations({ participantIds: [participantId] }),
        "Portal invitation preview",
      );
      if (preview.length !== 1 || preview[0]?.participantId !== participantId) {
        throw new TypeError("The invitation preview does not match the selected speaker.");
      }
      setInvitationPreview(preview);
    } catch (reason: unknown) {
      setInvitationError(errorMessage(reason));
    } finally {
      setInvitationPreviewBusy(false);
    }
  }

  async function sendSelectedSpeakerInvitation(): Promise<void> {
    if (api === null || selectedSpeaker === null || !invitationReady) {
      setInvitationError("Preview an eligible portal invitation before sending it.");
      return;
    }
    const participantId = selectedSpeaker.participantId;
    const preview = selectedInvitationPreview;
    const idempotencyKey = invitationSendIdempotencyKey ?? crypto.randomUUID();
    setInvitationSendIdempotencyKey(idempotencyKey);
    setInvitationSendBusy(true);
    setInvitationResult(null);
    setInvitationResultParticipantId(null);
    setInvitationError(null);
    try {
      const result = await withTimeout(
        () =>
          api.sendInvitations({
            participantIds: [participantId],
            templateId: "speaker-welcome",
            idempotencyKey,
          }),
        "Portal invitation send",
      );
      const selectedRecipient = result.recipients.find(
        (recipient) => recipient.participantId === participantId,
      );
      if (selectedRecipient === undefined) {
        throw new TypeError("The invitation result does not include the selected speaker.");
      }
      setInvitationResult(result);
      setInvitationResultParticipantId(participantId);
      setInvitationHistory((current) => retainInvitationHistory(current, preview, result));
      setInvitationSendIdempotencyKey(null);
    } catch (reason: unknown) {
      setInvitationError(errorMessage(reason));
    } finally {
      setInvitationSendBusy(false);
    }
  }

  async function refreshDetails(): Promise<void> {
    if (api === null || selectedSpeaker === null) {
      setDetailNotice(
        "Session and deliverable details are unavailable until the organizer speaker API is configured.",
      );
      return;
    }
    setDetailBusy(true);
    setDetailNotice(null);
    try {
      const [sessions, assets] = await Promise.all([
        api.getSessions(selectedSpeaker.participantId),
        api.getAssets(selectedSpeaker.participantId),
      ]);
      setRoster((current) =>
        current === null
          ? current
          : mergeSpeaker(current, selectedSpeaker.participantId, {
              sessions,
              assets,
              updatedAt: new Date().toISOString(),
            }),
      );
      setDetailNotice("Session assignments and deliverables refreshed.");
    } catch (reason: unknown) {
      setDetailNotice(errorMessage(reason));
    } finally {
      setDetailBusy(false);
    }
  }
  async function requestAssetDownload(asset: SpeakerAsset): Promise<void> {
    if (api === null || asset.status !== "ready" || downloadBusyAssetId !== null) return;
    const assetId = asset.assetId;
    setDownloadBusyAssetId(assetId);
    setDownloadErrors((current) => {
      const { [assetId]: _previousError, ...remaining } = current;
      return remaining;
    });
    try {
      const grant = await withTimeout(
        (signal) => api.getDownloadGrant(assetId, signal),
        "Asset download",
      );
      if (grant.url.trim().length === 0) {
        throw new Error("The private download capability returned an empty URL.");
      }
      setDownloadUrls((current) => ({ ...current, [assetId]: grant.url }));
    } catch (reason: unknown) {
      setDownloadErrors((current) => ({ ...current, [assetId]: errorMessage(reason) }));
    } finally {
      setDownloadBusyAssetId((current) => (current === assetId ? null : current));
    }
  }

  return (
    <div>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeaderCopy}>
          <p className={styles.eyebrow}>Event operations · Speakers</p>
          <h1 className={styles.pageTitle}>Speaker roster</h1>
          <p className={styles.pageDescription}>
            Keep speaker identity, onboarding tasks, session assignments, and portal progress in one
            event-scoped workspace.
          </p>
          <p style={mutedStyle}>
            Organization <strong>{organizationId}</strong> · Event <strong>{eventId}</strong>
          </p>
          <p style={mutedStyle} role="note">
            {SPEAKER_CUSTOM_FIELDS_CONTRACT_GAP}
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => void reload()}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh roster"}
          </button>
          <button
            className={styles.primaryButton}
            type="button"
            onClick={() => setShowAdd((current) => !current)}
          >
            {showAdd ? "Close add form" : "Add speaker"}
          </button>
        </div>
      </header>

      {error ? <FormMessage message={error} error /> : null}
      {notice ? <FormMessage message={notice} /> : null}

      {showAdd ? (
        <section
          style={{ ...panelStyle, marginBottom: "1rem" }}
          aria-labelledby="add-speaker-heading"
        >
          <div>
            <h2 id="add-speaker-heading" style={{ margin: 0, fontSize: "1.05rem" }}>
              Add speaker
            </h2>
            <p style={mutedStyle}>
              Capture identity and profile details before sending an optional portal invitation.
            </p>
          </div>
          <form
            onSubmit={(event) => void createSpeaker(event)}
            style={{ display: "grid", gap: "0.9rem" }}
          >
            <ProfileFields draft={createDraft} onChange={updateCreate} disabled={saveBusy} />
            <label style={fieldStyle}>
              <span style={labelStyle}>Workflow status</span>
              <select
                style={inputStyle}
                value={createDraft.status}
                onChange={(event) => updateCreate("status", event.target.value)}
                disabled={saveBusy}
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(status)}
                  </option>
                ))}
              </select>
            </label>
            <div style={inlineStyle}>
              <button
                className={styles.primaryButton}
                type="submit"
                disabled={saveBusy || api === null}
              >
                {saveBusy ? "Saving…" : "Save speaker"}
              </button>
              <span style={mutedStyle}>
                Headshot upload is completed by the speaker in their portal.
              </span>
            </div>
          </form>
        </section>
      ) : null}

      <section
        style={{ ...panelStyle, marginBottom: "1rem" }}
        aria-labelledby="roster-heading"
        aria-busy={loading}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            gap: "0.8rem",
            alignItems: "end",
          }}
        >
          <div>
            <h2 id="roster-heading" style={{ margin: 0, fontSize: "1.1rem" }}>
              Speakers {roster ? `(${filteredSpeakers.length} of ${speakers.length})` : ""}
            </h2>
            <p style={mutedStyle}>
              Search by name, email, title, company, or biography. Filters are limited to this
              event.
            </p>
          </div>
          <div style={inlineStyle}>
            <label style={fieldStyle}>
              <span className={styles.srOnly}>Search speakers</span>
              <input
                style={{ ...inputStyle, minWidth: "15rem" }}
                aria-label="Search speakers"
                placeholder="Search speakers"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label style={fieldStyle}>
              <span className={styles.srOnly}>Filter by status</span>
              <select
                aria-label="Filter by status"
                style={inputStyle}
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">All statuses</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(status)}
                  </option>
                ))}
              </select>
            </label>
            <label style={fieldStyle}>
              <span className={styles.srOnly}>Filter by session</span>
              <select
                aria-label="Filter by session"
                style={inputStyle}
                value={sessionFilter}
                onChange={(event) => setSessionFilter(event.target.value)}
              >
                <option value="all">All sessions</option>
                {sessionOptions.map(([sessionId, title]) => (
                  <option key={sessionId} value={sessionId}>
                    {title}
                  </option>
                ))}
              </select>
            </label>
            <label style={fieldStyle}>
              <span className={styles.srOnly}>Filter by task progress</span>
              <select
                aria-label="Filter by task progress"
                style={inputStyle}
                value={progressFilter}
                onChange={(event) => setProgressFilter(event.target.value as ProgressFilter)}
              >
                <option value="all">All task progress</option>
                <option value="complete">Complete</option>
                <option value="incomplete">Incomplete</option>
              </select>
            </label>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={clearRosterFilters}
              disabled={!hasActiveRosterFilters}
              aria-label="Clear speaker filters"
            >
              Clear filters
            </button>
          </div>
        </div>
        {hasActiveRosterFilters ? (
          <p style={mutedStyle} role="status" aria-live="polite">
            Showing {filteredSpeakers.length} of {speakers.length} speakers after filters.
          </p>
        ) : null}
        <div style={{ ...inlineStyle, justifyContent: "space-between" }}>
          <span style={mutedStyle}>
            {selectedSpeakerIds.length} speaker{selectedSpeakerIds.length === 1 ? "" : "s"} selected
          </span>
          <div style={inlineStyle}>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={toggleVisibleSpeakerSelection}
              disabled={filteredSpeakers.length === 0}
            >
              {allVisibleSelected ? "Deselect visible" : "Select visible"}
            </button>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={clearSpeakerSelection}
              disabled={selectedSpeakerIds.length === 0}
            >
              Clear selection
            </button>
          </div>
        </div>

        {loading ? (
          <FormMessage
            message={
              roster
                ? "Refreshing speaker roster… Showing the last loaded roster while it updates."
                : "Loading speaker roster…"
            }
          />
        ) : null}
        {duplicateEmailWarnings.length > 0 ? (
          <FormMessage
            error
            message={`Duplicate speaker email conflict: ${duplicateEmailWarnings
              .map(
                (conflict) =>
                  `${conflict.email} (${conflict.speakers.map((speaker) => speaker.displayName).join(", ")})`,
              )
              .join("; ")}. Each authoritative speaker remains visible.`}
          />
        ) : null}
        {!loading && roster && speakers.length === 0 ? (
          <div
            style={{
              padding: "1.2rem",
              border: "1px dashed var(--admin-border-strong)",
              borderRadius: "var(--admin-radius-sm)",
            }}
          >
            <strong>No speakers yet.</strong>
            <p style={mutedStyle}>
              Add a speaker manually or use CSV import below to start this event roster.
            </p>
          </div>
        ) : null}
        {!loading && roster && speakers.length > 0 && filteredSpeakers.length === 0 ? (
          <FormMessage message="No speakers match the current search and filters. Clear them to restore the roster." />
        ) : null}
        {filteredSpeakers.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <caption
                style={{
                  position: "absolute",
                  width: 1,
                  height: 1,
                  overflow: "hidden",
                  clip: "rect(0 0 0 0)",
                }}
              >
                Event speaker roster
              </caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    style={{
                      padding: "0.65rem",
                      borderBottom: "2px solid var(--admin-border)",
                    }}
                  >
                    <input
                      type="checkbox"
                      aria-label="Select visible speakers"
                      checked={allVisibleSelected}
                      onChange={toggleVisibleSpeakerSelection}
                      disabled={filteredSpeakers.length === 0}
                    />
                  </th>
                  {[
                    "Speaker",
                    "Title / company",
                    "Status",
                    "Sessions",
                    "General task progress",
                    "Actions",
                  ].map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      style={{
                        padding: "0.65rem",
                        textAlign: "left",
                        borderBottom: "2px solid var(--admin-border)",
                        color: "var(--admin-muted)",
                        fontSize: "0.7rem",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredSpeakers.map((speaker) => (
                  <tr
                    key={speaker.participantId}
                    style={{
                      background:
                        selectedId === speaker.participantId
                          ? "var(--admin-brand-soft)"
                          : undefined,
                    }}
                  >
                    <td
                      style={{
                        padding: "0.75rem 0.65rem",
                        borderBottom: "1px solid var(--admin-border)",
                      }}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Select ${speaker.displayName}`}
                        checked={selectedSpeakerIds.includes(speaker.participantId)}
                        onChange={() => toggleSpeakerSelection(speaker.participantId)}
                      />
                    </td>
                    <th
                      scope="row"
                      style={{
                        padding: "0.75rem 0.65rem",
                        textAlign: "left",
                        borderBottom: "1px solid var(--admin-border)",
                        minWidth: "12rem",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => beginEdit(speaker)}
                        style={{
                          padding: 0,
                          border: 0,
                          background: "transparent",
                          color: "var(--admin-brand-strong)",
                          font: "inherit",
                          fontWeight: 800,
                          textAlign: "left",
                          cursor: "pointer",
                        }}
                      >
                        {speaker.displayName}
                      </button>
                      <span
                        style={{
                          display: "block",
                          marginTop: "0.2rem",
                          color: "var(--admin-muted)",
                          fontSize: "0.75rem",
                          fontWeight: 500,
                        }}
                      >
                        {speaker.email}
                      </span>
                    </th>
                    <td
                      style={{
                        padding: "0.75rem 0.65rem",
                        borderBottom: "1px solid var(--admin-border)",
                      }}
                    >
                      {speaker.jobTitle || speaker.company
                        ? `${speaker.jobTitle ?? ""}${speaker.jobTitle && speaker.company ? " · " : ""}${speaker.company ?? ""}`
                        : "Profile details pending"}
                    </td>
                    <td
                      style={{
                        padding: "0.75rem 0.65rem",
                        borderBottom: "1px solid var(--admin-border)",
                      }}
                    >
                      <SpeakerStatusBadge status={speaker.status} />
                    </td>
                    <td
                      style={{
                        padding: "0.75rem 0.65rem",
                        borderBottom: "1px solid var(--admin-border)",
                      }}
                    >
                      {speaker.sessions.length}
                    </td>
                    <td
                      style={{
                        padding: "0.75rem 0.65rem",
                        borderBottom: "1px solid var(--admin-border)",
                      }}
                    >
                      {speaker.taskSummary.completed} / {speaker.taskSummary.total} complete
                      {speaker.taskSummary.overdue > 0 ? (
                        <span
                          style={{
                            display: "block",
                            color: "var(--admin-danger)",
                            fontSize: "0.72rem",
                          }}
                        >
                          {speaker.taskSummary.overdue} overdue
                        </span>
                      ) : null}
                    </td>
                    <td
                      style={{
                        padding: "0.75rem 0.65rem",
                        borderBottom: "1px solid var(--admin-border)",
                      }}
                    >
                      <button
                        className={styles.secondaryButton}
                        type="button"
                        onClick={() => beginEdit(speaker)}
                      >
                        Open profile
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section
        style={{ ...panelStyle, marginBottom: "1rem" }}
        aria-labelledby="import-heading"
        aria-busy={importBusy}
      >
        <div>
          <h2 id="import-heading" style={{ margin: 0, fontSize: "1.05rem" }}>
            Import speakers from CSV
          </h2>
          <p style={mutedStyle}>
            Preview validation before committing rows. Invalid rows are never written to this event.
          </p>
        </div>
        <label style={fieldStyle}>
          <span style={labelStyle}>Speakers CSV</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => void previewCsv(event)}
            disabled={importCommitBusy || api === null}
          />
        </label>
        {importFileName ? (
          <p style={mutedStyle}>
            Selected file: <strong>{importFileName}</strong>
          </p>
        ) : null}
        {importBusy ? <FormMessage message="Validating CSV…" /> : null}
        {importPreview ? (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            <div style={inlineStyle}>
              <span style={badgeStyle}>{importPreview.validRows.length} valid</span>
              <span
                style={{
                  ...badgeStyle,
                  background: "var(--admin-danger-soft)",
                  color: "var(--admin-danger)",
                }}
              >
                {importPreview.invalidRows.length} invalid
              </span>
            </div>
            {importPreview.invalidRows.length > 0 ? (
              <ul aria-label="CSV validation errors" style={listStyle}>
                {importPreview.invalidRows.map((issue) => (
                  <li
                    key={`${issue.rowNumber}-${issue.field ?? "row"}-${issue.message}`}
                    style={{ color: "var(--admin-danger)", fontSize: "0.78rem" }}
                  >
                    Row {issue.rowNumber}
                    {issue.field ? ` · ${issue.field}` : ""}: {issue.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={mutedStyle}>All previewed rows passed required identity validation.</p>
            )}
            <button
              className={styles.primaryButton}
              type="button"
              onClick={() => void commitCsv()}
              disabled={
                importCommitBusy ||
                importPreviewBusy ||
                importPreview.validRows.length === 0 ||
                api === null
              }
            >
              {importCommitBusy
                ? "Importing…"
                : `Commit ${importPreview.validRows.length} valid row${importPreview.validRows.length === 1 ? "" : "s"}`}
            </button>
          </div>
        ) : null}
      </section>

      <section style={{ ...panelStyle, marginBottom: "1rem" }} aria-labelledby="tasks-heading">
        <div>
          <h2 id="tasks-heading" style={{ margin: 0, fontSize: "1.05rem" }}>
            General speaker tasks
          </h2>
          <p style={mutedStyle}>
            Create plain mark-complete onboarding tasks for multiple speakers. File requests and
            deliverables belong in Content.
          </p>
          <p style={mutedStyle} role="status">
            {onboardingTaskDefinitions.length} of {MAX_ORGANIZER_ONBOARDING_TASKS} onboarding task
            definitions configured. The API-loaded definitions and their assignees remain visible
            after a roster refresh.
          </p>
        </div>
        <form
          onSubmit={(event) => void assignTask(event)}
          style={{ display: "grid", gap: "0.85rem" }}
        >
          <div style={fieldGridStyle}>
            <label style={fieldStyle}>
              <span style={labelStyle}>Task title</span>
              <input
                style={inputStyle}
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                placeholder="Confirm participation"
                required
                disabled={taskBusy}
              />
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>Due date</span>
              <input
                style={inputStyle}
                type="date"
                value={taskDueAt}
                onChange={(event) => setTaskDueAt(event.target.value)}
                required
                disabled={taskBusy}
              />
            </label>
          </div>
          <fieldset
            style={{
              margin: 0,
              padding: "0.75rem",
              border: "1px solid var(--admin-border)",
              borderRadius: "var(--admin-radius-sm)",
            }}
          >
            <legend style={{ padding: "0 0.35rem", ...labelStyle }}>Assign to speakers</legend>
            {speakers.length === 0 ? (
              <p style={mutedStyle}>Add speakers before assigning a task.</p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(13rem, 1fr))",
                  gap: "0.45rem",
                }}
              >
                {speakers.map((speaker) => (
                  <label
                    key={speaker.participantId}
                    style={{
                      display: "flex",
                      gap: "0.45rem",
                      alignItems: "center",
                      fontSize: "0.82rem",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={taskAssignees.includes(speaker.participantId)}
                      onChange={() => toggleAssignee(speaker.participantId)}
                      disabled={taskBusy}
                    />
                    {speaker.displayName}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <div style={inlineStyle}>
            <button
              className={styles.primaryButton}
              type="submit"
              disabled={
                taskBusy ||
                api === null ||
                speakers.length === 0 ||
                progress === null ||
                progressError !== null ||
                onboardingTaskDefinitions.length >= MAX_ORGANIZER_ONBOARDING_TASKS
              }
            >
              {taskBusy
                ? "Assigning…"
                : onboardingTaskDefinitions.length >= MAX_ORGANIZER_ONBOARDING_TASKS
                  ? "Three onboarding tasks configured"
                  : "Assign onboarding task"}
            </button>
            <span style={mutedStyle}>Task type: action / mark complete</span>
          </div>
        </form>
        {onboardingTaskDefinitions.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <caption
                style={{
                  position: "absolute",
                  width: 1,
                  height: 1,
                  overflow: "hidden",
                  clip: "rect(0 0 0 0)",
                }}
              >
                API-loaded organizer onboarding task definitions
              </caption>
              <thead>
                <tr>
                  {["Task", "Due", "Assignees"].map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      style={{
                        padding: "0.55rem",
                        borderBottom: "2px solid var(--admin-border)",
                        textAlign: "left",
                        color: "var(--admin-muted)",
                        fontSize: "0.7rem",
                        textTransform: "uppercase",
                      }}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {onboardingTaskDefinitions.map((definition) => (
                  <tr key={definition.definitionId}>
                    <th
                      scope="row"
                      style={{
                        padding: "0.65rem 0.55rem",
                        borderBottom: "1px solid var(--admin-border)",
                        textAlign: "left",
                      }}
                    >
                      {definition.title}
                    </th>
                    <td
                      style={{
                        padding: "0.65rem 0.55rem",
                        borderBottom: "1px solid var(--admin-border)",
                      }}
                    >
                      {dateLabel(definition.dueAt)}
                    </td>
                    <td
                      style={{
                        padding: "0.65rem 0.55rem",
                        borderBottom: "1px solid var(--admin-border)",
                      }}
                    >
                      {definition.participantIds
                        .map((participantId) => {
                          const assignee = speakers.find(
                            (speaker) => speaker.participantId === participantId,
                          );
                          return assignee === undefined
                            ? participantId
                            : `${assignee.displayName} (${participantId})`;
                        })
                        .join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section
        style={{ ...panelStyle, marginBottom: "1rem" }}
        aria-labelledby="bulk-email-heading"
        aria-busy={emailAnyBusy}
      >
        <div>
          <h2 id="bulk-email-heading" style={{ margin: 0, fontSize: "1.05rem" }}>
            Bulk speaker email
          </h2>
          <p style={mutedStyle}>
            Compose an event-scoped message for the {selectedSpeakerIds.length} selected speaker
            {selectedSpeakerIds.length === 1 ? "" : "s"}. Approved templates are versioned and
            preview merge tokens such as <code>{"{{first_name}}"}</code> before queueing.
          </p>
        </div>
        <div style={fieldGridStyle}>
          <label style={fieldStyle}>
            <span style={labelStyle}>Template version</span>
            <select
              style={inputStyle}
              aria-label="Speaker email template version"
              value={emailTemplateId ? `${emailTemplateId}:${emailTemplateVersion ?? ""}` : ""}
              onChange={(event) => {
                const separator = event.target.value.lastIndexOf(":");
                const nextId =
                  separator < 0 ? event.target.value : event.target.value.slice(0, separator);
                const rawVersion = separator < 0 ? "" : event.target.value.slice(separator + 1);
                const nextVersion = Number(rawVersion);
                const template = emailTemplates.find(
                  (candidate) => candidate.id === nextId && candidate.version === nextVersion,
                );
                setEmailTemplateId(nextId ?? "");
                setEmailCreateTemplateId(null);
                setEmailTemplateVersion(Number.isFinite(nextVersion) ? nextVersion : undefined);
                if (template !== undefined) {
                  setEmailTemplateName(template.name);
                  setEmailSubject(template.subject);
                  setEmailHtml(template.html);
                  setEmailText(template.text);
                }
              }}
              disabled={emailSaveBusy}
            >
              <option value="">New template version</option>
              {emailTemplates.map((template) => (
                <option
                  key={`${template.id}:${template.version}`}
                  value={`${template.id}:${template.version}`}
                >
                  {template.name} · v{template.version} · {template.status}
                </option>
              ))}
            </select>
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>Template name</span>
            <input
              style={inputStyle}
              value={emailTemplateName}
              onChange={(event) => setEmailTemplateName(event.target.value)}
              maxLength={200}
              disabled={emailSaveBusy}
            />
          </label>
        </div>
        <label style={fieldStyle}>
          <span style={labelStyle}>Subject</span>
          <input
            style={inputStyle}
            value={emailSubject}
            onChange={(event) => setEmailSubject(event.target.value)}
            placeholder="Update for {{first_name}}"
            maxLength={500}
            disabled={emailSaveBusy}
          />
        </label>
        <div style={fieldGridStyle}>
          <label style={fieldStyle}>
            <span style={labelStyle}>HTML body</span>
            <textarea
              style={textAreaStyle}
              value={emailHtml}
              onChange={(event) => setEmailHtml(event.target.value)}
              maxLength={100_000}
              disabled={emailSaveBusy}
            />
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>Text body</span>
            <textarea
              style={textAreaStyle}
              value={emailText}
              onChange={(event) => setEmailText(event.target.value)}
              maxLength={100_000}
              disabled={emailSaveBusy}
            />
          </label>
        </div>
        <div style={inlineStyle}>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => void saveEmailTemplate()}
            disabled={emailSaveBusy || api === null}
          >
            {emailSaveBusy ? "Saving…" : "Save template version"}
          </button>
          <button
            className={styles.primaryButton}
            type="button"
            onClick={() => void previewBulkEmail()}
            disabled={emailPreviewBusy || api === null || selectedSpeakerIds.length === 0}
          >
            {emailPreviewBusy ? "Preparing…" : "Preview merge"}
          </button>
          <button
            className={styles.primaryButton}
            type="button"
            onClick={() => void sendBulkEmail()}
            disabled={emailSendBusy || api === null || emailPreview === null}
          >
            {emailSendBusy ? "Queueing…" : "Queue speaker email"}
          </button>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => void refreshEmailHistory()}
            disabled={emailHistoryBusy || api === null}
            aria-label="Refresh speaker email history"
          >
            {emailHistoryBusy ? "Refreshing history…" : "Refresh email history"}
          </button>
          <span style={mutedStyle}>
            Available merge tokens: <code>{"{{first_name}}"}</code>,{" "}
            <code>{"{{display_name}}"}</code>, <code>{"{{email}}"}</code>.
          </span>
        </div>
        {emailNotice ? (
          <FormMessage
            message={emailNotice}
            error={emailNotice.includes("unavailable") || emailNotice.includes("could")}
          />
        ) : null}
        {emailPreview ? (
          <div
            style={{
              display: "grid",
              gap: "0.55rem",
              padding: "0.8rem",
              border: "1px solid var(--admin-border)",
              borderRadius: "var(--admin-radius-sm)",
            }}
          >
            <strong>
              Merge preview · {emailPreview.recipientIds.length} recipient
              {emailPreview.recipientIds.length === 1 ? "" : "s"} · template v
              {emailPreview.templateVersion}
            </strong>
            <p style={mutedStyle}>{emailPreview.subject}</p>
            <ul aria-label="Speaker email merge preview recipients" style={listStyle}>
              {emailPreview.recipients.map((recipient) => (
                <li key={recipient.participantId}>
                  <strong>{recipient.firstName}</strong> · {recipient.email} · {recipient.subject}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {emailSends.length > 0 ? (
          <div>
            <h3 style={{ margin: 0, fontSize: "0.9rem" }}>Email queue history</h3>
            <ul aria-label="Speaker email queue history" style={listStyle}>
              {emailSends.map((send) => (
                <li key={send.id}>
                  <strong>{send.status}</strong> · template v{send.templateVersion} ·{" "}
                  {send.recipientIds.length} recipient{send.recipientIds.length === 1 ? "" : "s"} ·{" "}
                  {dateLabel(send.updatedAt)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
      <section style={{ ...panelStyle, marginBottom: "1rem" }} aria-labelledby="progress-heading">
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            gap: "0.8rem",
            alignItems: "end",
          }}
        >
          <div>
            <h2 id="progress-heading" style={{ margin: 0, fontSize: "1.05rem" }}>
              Onboarding progress
            </h2>
            <p style={mutedStyle}>
              List-level general-task completion, including changes speakers make in their portal.
            </p>
          </div>
          <label style={fieldStyle}>
            <span className={styles.srOnly}>Filter task progress</span>
            <select
              aria-label="Filter task progress"
              style={inputStyle}
              value={progressFilter}
              onChange={(event) => setProgressFilter(event.target.value as ProgressFilter)}
            >
              <option value="all">All progress</option>
              <option value="complete">Complete</option>
              <option value="incomplete">Incomplete</option>
            </select>
          </label>
        </div>
        {progressError ? (
          <FormMessage message={`Progress unavailable: ${progressError}`} error />
        ) : null}
        {!progressError && progress && progressRows.length === 0 ? (
          <FormMessage message="No speakers match this progress filter." />
        ) : null}
        {!progressError && progress && progressRows.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <caption
                style={{
                  position: "absolute",
                  width: 1,
                  height: 1,
                  overflow: "hidden",
                  clip: "rect(0 0 0 0)",
                }}
              >
                Speaker task completion progress
              </caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    style={{
                      padding: "0.55rem",
                      borderBottom: "2px solid var(--admin-border)",
                      textAlign: "left",
                    }}
                  >
                    Speaker
                  </th>
                  <th
                    scope="col"
                    style={{
                      padding: "0.55rem",
                      borderBottom: "2px solid var(--admin-border)",
                      textAlign: "left",
                    }}
                  >
                    Tasks and due dates
                  </th>
                  <th
                    scope="col"
                    style={{
                      padding: "0.55rem",
                      borderBottom: "2px solid var(--admin-border)",
                      textAlign: "left",
                    }}
                  >
                    Progress
                  </th>
                </tr>
              </thead>
              <tbody>
                {progressRows.map((row) => {
                  const completed = row.tasks.filter((task) => taskComplete(task.status)).length;
                  return (
                    <tr key={row.participantId}>
                      <th
                        scope="row"
                        style={{
                          padding: "0.65rem 0.55rem",
                          borderBottom: "1px solid var(--admin-border)",
                          textAlign: "left",
                          verticalAlign: "top",
                        }}
                      >
                        {row.displayName}
                      </th>
                      <td
                        style={{
                          padding: "0.65rem 0.55rem",
                          borderBottom: "1px solid var(--admin-border)",
                        }}
                      >
                        <ul style={listStyle}>
                          {row.tasks.length === 0 ? (
                            <li style={mutedStyle}>No general tasks assigned.</li>
                          ) : (
                            row.tasks.map((task) => (
                              <li key={task.taskId}>
                                <span style={{ fontWeight: 700 }}>{task.title}</span> ·{" "}
                                {dateLabel(task.dueAt)} ·{" "}
                                <span
                                  style={{
                                    color: taskComplete(task.status)
                                      ? "var(--admin-accent)"
                                      : "var(--admin-muted)",
                                  }}
                                >
                                  {taskStatusLabel(task.status)}
                                </span>
                              </li>
                            ))
                          )}
                        </ul>
                      </td>
                      <td
                        style={{
                          padding: "0.65rem 0.55rem",
                          borderBottom: "1px solid var(--admin-border)",
                          verticalAlign: "top",
                        }}
                      >
                        {completed} / {row.tasks.length} complete
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      <section
        style={{ ...panelStyle, marginBottom: "1rem" }}
        aria-labelledby="reminder-eligibility-heading"
      >
        <div>
          <h2 id="reminder-eligibility-heading" style={{ margin: 0, fontSize: "1.05rem" }}>
            Automated reminder eligibility
          </h2>
          <p style={mutedStyle}>
            Server-calculated due-date windows are observable here before any reminder is queued.
          </p>
        </div>
        {reminderEligibility === null ? (
          <FormMessage message="Reminder eligibility is unavailable for this event adapter." />
        ) : (
          <>
            <p style={mutedStyle}>
              {reminderEligibility.eligibleTaskIds.length} task
              {reminderEligibility.eligibleTaskIds.length === 1 ? "" : "s"} currently eligible for
              automated delivery across {reminderEligibility.eligibleRecipientIds.length} speaker
              {reminderEligibility.eligibleRecipientIds.length === 1 ? "" : "s"}.
            </p>
            <ul aria-label="Automated reminder eligibility list" style={listStyle}>
              {reminderEligibility.items.map((item) => (
                <li key={item.taskId}>
                  <strong>{item.title}</strong> ·{" "}
                  {item.dueAt ? dateLabel(item.dueAt) : "No due date"} ·{" "}
                  <span
                    style={{ color: item.eligible ? "var(--admin-accent)" : "var(--admin-muted)" }}
                  >
                    {item.eligible ? `Eligible (${item.reason})` : `Not eligible (${item.reason})`}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {selectedSpeaker ? (
        <section
          style={{ ...panelStyle, marginBottom: "1rem" }}
          aria-labelledby="speaker-detail-heading"
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "space-between",
              gap: "0.8rem",
              alignItems: "start",
            }}
          >
            <div>
              <p className={styles.eyebrow} style={{ marginBottom: "0.35rem" }}>
                Speaker record
              </p>
              <h2 id="speaker-detail-heading" style={{ margin: 0, fontSize: "1.3rem" }}>
                {selectedSpeaker.displayName}
              </h2>
              <p style={mutedStyle}>
                {selectedSpeaker.email} · <SpeakerStatusBadge status={selectedSpeaker.status} />
              </p>
            </div>
            <div style={inlineStyle}>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => void refreshDetails()}
                disabled={detailBusy || api === null}
              >
                {detailBusy ? "Refreshing details…" : "Refresh sessions and files"}
              </button>
              <SpeakerInvitationControls
                previewBusy={invitationPreviewBusy}
                sendBusy={invitationSendBusy}
                disabled={api === null}
                canSend={invitationReady}
                onPreview={() => void previewSelectedSpeakerInvitation()}
                onSend={() => void sendSelectedSpeakerInvitation()}
              />
            </div>
          </div>
          {invitationPreviewCount > 0 ? (
            <div style={{ display: "grid", gap: "0.35rem" }}>
              <FormMessage
                message={`Invitation preview completed for ${invitationPreviewCount} speaker. ${invitationReady ? "Eligible to send." : "Sending is blocked."} Sending remains a separate explicit action.`}
              />
              <ul aria-label="Portal invitation preview" style={listStyle}>
                {selectedInvitationPreview.map((preview) => (
                  <li key={preview.participantId}>
                    <strong>{statusLabel(preview.state)}</strong> ·{" "}
                    {preview.recipientEmail || "No deliverable email"}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {invitationResult &&
          selectedInvitationResultRecipient &&
          invitationResultParticipantId === selectedSpeaker.participantId ? (
            <FormMessage
              message={`Invitation ${selectedInvitationResultRecipient.status} for ${selectedInvitationResultRecipient.recipientEmail}.`}
              error={selectedInvitationResultRecipient.status === "failed"}
            />
          ) : null}
          {invitationError ? <FormMessage message={invitationError} error /> : null}
          {invitationHistory.length > 0 ? (
            <div style={{ display: "grid", gap: "0.4rem" }}>
              <h3 style={{ margin: 0, fontSize: "0.9rem" }}>Portal invitation send history</h3>
              <ul aria-label="Portal invitation send history" style={listStyle}>
                {invitationHistory.map((entry) => (
                  <li key={`${entry.result.idempotencyKey}:${entry.occurredAt}`}>
                    <strong>{statusLabel(entry.result.status)}</strong> ·{" "}
                    {entry.preview
                      .map((preview) => preview.recipientEmail || preview.participantId)
                      .join(", ")}{" "}
                    · {dateTimeLabel(entry.occurredAt)} UTC
                  </li>
                ))}
              </ul>
              <p style={mutedStyle}>
                History above is retained only while this speaker-workspace view remains open. The
                speaker API does not expose a persistent portal-invitation history read endpoint;
                delivery must be confirmed through the communications provider handoff.
              </p>
            </div>
          ) : null}
          {detailNotice ? (
            <FormMessage
              message={detailNotice}
              error={detailNotice.includes("unavailable") || detailNotice.includes("could not")}
            />
          ) : null}
          {editDraft ? (
            <form
              onSubmit={(event) => void saveSpeaker(event)}
              style={{ display: "grid", gap: "0.9rem" }}
            >
              <ProfileFields draft={editDraft} onChange={updateEdit} disabled={saveBusy} />
              <label style={fieldStyle}>
                <span style={labelStyle}>Workflow status</span>
                <select
                  style={inputStyle}
                  value={editDraft.status}
                  onChange={(event) => updateEdit("status", event.target.value)}
                  disabled={saveBusy}
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {statusLabel(status)}
                    </option>
                  ))}
                </select>
              </label>
              <div style={{ ...panelStyle, boxShadow: "none", padding: "0.85rem" }}>
                <h3 style={{ margin: 0, fontSize: "0.9rem" }}>Headshot</h3>
                {selectedSpeaker.headshotAssetId ? (
                  <p style={mutedStyle}>
                    A headshot is linked to this profile. View the uploaded asset below.
                  </p>
                ) : (
                  <p style={mutedStyle}>No headshot has been uploaded yet.</p>
                )}
                <button
                  className={styles.secondaryButton}
                  type="button"
                  disabled
                  title="Headshot upload is provided by the speaker portal."
                >
                  Upload or replace headshot
                </button>
                <p style={mutedStyle}>
                  Headshot upload and replacement are speaker-portal actions; organizer upload is
                  not available from this API.
                </p>
              </div>
              {editError ? <FormMessage message={editError} error /> : null}
              <div style={inlineStyle}>
                <button
                  className={styles.primaryButton}
                  type="submit"
                  disabled={saveBusy || api === null}
                >
                  {saveBusy ? "Saving…" : "Save profile changes"}
                </button>
                <span style={mutedStyle}>Version {editDraft.expectedVersion}</span>
              </div>
            </form>
          ) : null}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(17rem, 1fr))",
              gap: "1rem",
            }}
          >
            <section
              aria-labelledby="session-assignments-heading"
              style={{ display: "grid", gap: "0.55rem" }}
            >
              <h3 id="session-assignments-heading" style={{ margin: 0, fontSize: "0.95rem" }}>
                Session assignments
              </h3>
              {selectedSpeaker.sessions.length === 0 ? (
                <p style={mutedStyle}>No sessions are linked to this speaker yet.</p>
              ) : (
                <ul style={listStyle}>
                  {selectedSpeaker.sessions.map((session: SpeakerSession) => (
                    <li
                      key={session.submissionId}
                      style={{
                        padding: "0.65rem",
                        border: "1px solid var(--admin-border)",
                        borderRadius: "var(--admin-radius-sm)",
                      }}
                    >
                      <strong>{session.title}</strong>
                      <span
                        style={{
                          display: "block",
                          marginTop: "0.2rem",
                          color: "var(--admin-muted)",
                          fontSize: "0.74rem",
                        }}
                      >
                        {statusLabel(session.status)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div style={inlineStyle}>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  disabled
                  title="Session linking is managed by the agenda service."
                >
                  Assign a session
                </button>
                <Link
                  className={styles.secondaryButton}
                  href={`/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventId)}/agenda`}
                >
                  Open Agenda
                </Link>
              </div>
              <p style={mutedStyle}>
                This organizer speaker API exposes read-only assignments; session linking is managed
                in Agenda.
              </p>
            </section>
            <section
              aria-labelledby="speaker-assets-heading"
              style={{ display: "grid", gap: "0.55rem" }}
            >
              <h3 id="speaker-assets-heading" style={{ margin: 0, fontSize: "0.95rem" }}>
                Uploaded deliverables
              </h3>
              {selectedSpeaker.assets.length === 0 ? (
                <p style={mutedStyle}>No uploaded headshot or deliverables are available.</p>
              ) : (
                <ul style={listStyle}>
                  {selectedSpeaker.assets.map((asset: SpeakerAsset) => (
                    <li
                      key={asset.assetId}
                      style={{
                        padding: "0.65rem",
                        border: "1px solid var(--admin-border)",
                        borderRadius: "var(--admin-radius-sm)",
                      }}
                    >
                      <strong>{asset.fileName}</strong>
                      <SpeakerAssetMetadata asset={asset} />
                      <SpeakerAssetDownload
                        asset={asset}
                        downloadUrl={downloadUrls[asset.assetId] ?? null}
                        busy={downloadBusyAssetId === asset.assetId}
                        disabled={api === null || downloadBusyAssetId !== null}
                        error={downloadErrors[asset.assetId] ?? null}
                        onRequest={requestAssetDownload}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </section>
      ) : null}

      {!loading && roster && speakers.length === 0 ? (
        <section
          style={{ ...panelStyle, marginBottom: "1rem" }}
          aria-labelledby="unavailable-heading"
        >
          <h2 id="unavailable-heading" style={{ margin: 0, fontSize: "1rem" }}>
            Organizer actions
          </h2>
          <p style={mutedStyle}>
            Session assignments, portal invitations, task assignment, and deliverable downloads
            become available after the organizer speaker service is mounted for this event.
          </p>
        </section>
      ) : null}
    </div>
  );
}
