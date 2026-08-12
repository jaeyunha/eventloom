"use client";

import {
  AlertCircle,
  CheckCircle2,
  Eye,
  FileText,
  ListTodo,
  Mail,
  RefreshCw,
  Search,
  Send,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Checkbox } from "../../components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../../components/ui/empty";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { Progress } from "../../components/ui/progress";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../../components/ui/sheet";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Textarea } from "../../components/ui/textarea";
import adminStyles from "../admin/admin-shell.module.css";
import {
  createSpeakerApi,
  ORGANIZER_HEADSHOT_ACCEPTED_TYPES,
  ORGANIZER_HEADSHOT_MAX_BYTES,
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
  type SpeakerTravelLogistics,
  type SpeakerUpdateInput,
  assertAdvancedSpeakerRevision,
  assertSpeakerHeadshotReplacement,
  assertSpeakerRosterScope,
  type SpeakerMutationStatus,
} from "./api";
import styles from "./speaker-workspace.module.css";

export interface SpeakerWorkspaceProps {
  readonly organizationId: string;
  readonly eventId: string;
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

function errorMessage(reason: unknown): string {
  if (reason instanceof SpeakerApiError) {
    if (reason.code === "CONFLICT" || reason.code === "VERSION_CONFLICT" || reason.status === 409) {
      if (
        reason.code === "VERSION_CONFLICT" &&
        /already|duplicate|verified email|canonical participant/iu.test(reason.message)
      ) {
        return reason.message;
      }
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
export type OrganizerHeadshotUploadStatus = "idle" | "busy" | "success" | "error";

export function validateOrganizerHeadshotFile(file: File): string | null {
  const contentType = file.type.trim().toLowerCase();
  if (
    !ORGANIZER_HEADSHOT_ACCEPTED_TYPES.includes(
      contentType as (typeof ORGANIZER_HEADSHOT_ACCEPTED_TYPES)[number],
    )
  ) {
    return "Choose a JPEG, PNG, or WebP image.";
  }
  if (file.size > ORGANIZER_HEADSHOT_MAX_BYTES) {
    return "Headshots must be 5 MB or smaller.";
  }
  return null;
}

export function taskComplete(status: string): boolean {
  return status === "completed" || status === "submitted" || status === "waived";
}

export function organizerHeadshotPreviewPath(value: string): string | null {
  const candidate = value.trim();
  if (!candidate.startsWith("/api/")) return null;
  try {
    const base = "https://same-origin.invalid";
    const resolved = new URL(candidate, base);
    return resolved.origin === base && resolved.pathname.startsWith("/api/") ? candidate : null;
  } catch {
    return null;
  }
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

export type SpeakerTaskStatusTone = "neutral" | "info" | "warning" | "success";

export function taskStatusTone(status: string): SpeakerTaskStatusTone {
  if (taskComplete(status)) return "success";
  if (status === "overdue") return "warning";
  if (status === "in_progress") return "info";
  return "neutral";
}
function taskStatusClassName(status: string): string {
  switch (taskStatusTone(status)) {
    case "info":
      return `${styles.taskStatus} ${styles.taskStatusInfo}`;
    case "warning":
      return `${styles.taskStatus} ${styles.taskStatusWarning}`;
    case "success":
      return `${styles.taskStatus} ${styles.taskStatusSuccess}`;
    default:
      return `${styles.taskStatus} ${styles.taskStatusNeutral}`;
  }
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
  return assertSpeakerRosterScope(roster, organizationId, eventId);
}
export function speakerSecondaryLoadKey(
  roster: SpeakerRosterEnvelope | null,
  organizationId: string,
  eventId: string,
  loading: boolean,
  visible = true,
): string | null {
  if (
    !visible ||
    loading ||
    roster === null ||
    roster.organizationId !== organizationId ||
    roster.eventId !== eventId
  ) {
    return null;
  }
  return `${organizationId}:${eventId}`;
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
export async function speakerProgressFor(
  api: Pick<SpeakerApi, "listTasks">,
  speakers: readonly SpeakerRecord[],
  organizationId: string,
  eventId: string,
  signal?: AbortSignal,
): Promise<SpeakerProgressEnvelope> {
  if (speakers.length === 0) {
    return { organizationId, eventId, rows: [] };
  }
  const envelope = await api.listTasks(signal);
  if (
    envelope.organizationId !== organizationId ||
    envelope.eventId !== eventId ||
    envelope.speakerProfileId !== ""
  ) {
    throw new TypeError(
      "The speaker task response belongs to a different organization, event, or profile.",
    );
  }

  const rosterParticipantIds = new Set(speakers.map((speaker) => speaker.participantId));
  const tasksByParticipant = new Map<string, SpeakerTask[]>();
  for (const task of envelope.tasks) {
    if (!rosterParticipantIds.has(task.participantId)) {
      throw new TypeError(
        "The speaker task response contains a task for a different speaker profile.",
      );
    }
    const tasks = tasksByParticipant.get(task.participantId);
    if (tasks === undefined) {
      tasksByParticipant.set(task.participantId, [task]);
    } else {
      tasks.push(task);
    }
  }

  return {
    organizationId,
    eventId,
    rows: speakers.map((speaker) => ({
      participantId: speaker.participantId,
      displayName: speaker.displayName,
      tasks: tasksByParticipant.get(speaker.participantId) ?? [],
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
  const variant =
    status === "declined" || status === "revoked"
      ? "destructive"
      : status === "confirmed" || status === "accepted"
        ? "default"
        : "secondary";
  return <Badge variant={variant}>{statusLabel(status)}</Badge>;
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
      <Button variant="outline" size="sm" asChild>
        <a
          href={downloadUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`Download ${asset.fileName}`}
        >
          <Eye data-icon="inline-start" />
          Download / view
        </a>
      </Button>
    );
  }
  if (asset.status !== "ready") {
    return <span className={styles.muted}>Download is not available for this asset.</span>;
  }
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        type="button"
        onClick={() => onRequest(asset)}
        disabled={disabled}
        aria-busy={busy}
        aria-label={`Download ${asset.fileName}`}
      >
        <Eye data-icon="inline-start" />
        {busy ? "Preparing download…" : "Download / view"}
      </Button>
      {error ? <FormMessage message={error} error /> : null}
    </>
  );
}
export function SpeakerAssetMetadata({ asset }: Readonly<{ asset: SpeakerAsset }>) {
  return (
    <span className={styles.muted}>
      {asset.contentType} · {assetSize(asset.byteSize)} · {statusLabel(asset.status)} · uploaded{" "}
      {dateLabel(asset.uploadedAt)}
    </span>
  );
}
export interface SpeakerHeadshotProps {
  readonly speakerName: string;
  readonly asset: SpeakerAsset | null;
  readonly imageUrl: string | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly revision: number;
  readonly onRetry?: () => void;
  readonly onImageError?: () => void;
}

export function SpeakerHeadshot({
  speakerName,
  asset,
  imageUrl,
  loading,
  error,
  revision,
  onRetry,
  onImageError,
}: SpeakerHeadshotProps) {
  const label = `${speakerName} headshot`;
  const safeImageUrl = imageUrl === null ? null : organizerHeadshotPreviewPath(imageUrl);
  const isReadyImage =
    asset !== null &&
    asset.status === "ready" &&
    safeImageUrl !== null &&
    ORGANIZER_HEADSHOT_ACCEPTED_TYPES.includes(
      asset.contentType.trim().toLowerCase() as (typeof ORGANIZER_HEADSHOT_ACCEPTED_TYPES)[number],
    );
  return (
    <div className={styles.headshot} role="img" aria-label={label}>
      {isReadyImage ? (
        <Image
          key={`${asset.assetId}:${revision}`}
          src={safeImageUrl}
          alt={`${speakerName} headshot`}
          width={640}
          height={360}
          unoptimized
          className={styles.headshotImage}
          onError={onImageError}
        />
      ) : (
        <div className={styles.headshotFallback}>
          <strong>
            {loading
              ? "Loading headshot…"
              : error
                ? "Headshot unavailable"
                : asset === null
                  ? "No headshot uploaded"
                  : asset.status !== "ready"
                    ? "Headshot is not ready"
                    : "Headshot preview unavailable"}
          </strong>
          <span className={styles.muted}>
            {error ??
              (loading
                ? "Requesting a secure preview from the organizer API."
                : "A secure preview is not available for this speaker.")}
          </span>
          {onRetry && !loading && (error !== null || asset !== null) ? (
            <Button variant="outline" size="sm" type="button" onClick={onRetry}>
              <RefreshCw data-icon="inline-start" />
              Retry headshot preview
            </Button>
          ) : null}
        </div>
      )}
    </div>
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
      <Button
        variant="outline"
        size="sm"
        type="button"
        onClick={onPreview}
        disabled={disabled || previewBusy || sendBusy}
      >
        <Eye data-icon="inline-start" />
        {previewBusy ? "Preparing invite…" : "Preview portal invite"}
      </Button>
      <Button
        variant="default"
        size="sm"
        type="button"
        onClick={onSend}
        disabled={disabled || sendBusy || previewBusy || !canSend}
      >
        <Send data-icon="inline-start" />
        {sendBusy ? "Sending invite…" : "Send portal invite"}
      </Button>
    </>
  );
}

function FormMessage({ message, error = false }: Readonly<{ message: string; error?: boolean }>) {
  return (
    <Alert
      variant={error ? "destructive" : "default"}
      role={error ? "alert" : "status"}
      aria-live="polite"
    >
      <AlertCircle />
      <AlertTitle>{error ? "Action needs attention" : "Workspace update"}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
function MutationStatusMessage({
  label,
  status,
  message,
}: Readonly<{
  label: string;
  status: SpeakerMutationStatus;
  message: string | null;
}>) {
  if (status === "idle" || message === null) return null;
  const error = status === "conflict" || status === "failure";
  return (
    <Alert
      variant={error ? "destructive" : "default"}
      role={error ? "alert" : "status"}
      aria-live="polite"
      data-mutation-status={status}
      className={styles.mutationStatus}
    >
      <AlertCircle />
      <AlertTitle>
        {label} · {statusLabel(status)}
      </AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
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
    <FieldGroup className={styles.actionsStack}>
      <div className={styles.fieldGrid}>
        <Field>
          <FieldLabel htmlFor="speaker-display-name">Name</FieldLabel>
          <Input
            id="speaker-display-name"
            value={draft.displayName}
            onChange={(event) => onChange("displayName", event.target.value)}
            required
            maxLength={200}
            disabled={disabled}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="speaker-email">Email</FieldLabel>
          <Input
            id="speaker-email"
            type="email"
            value={draft.email}
            onChange={(event) => onChange("email", event.target.value)}
            required
            maxLength={320}
            disabled={disabled}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="speaker-title">Title</FieldLabel>
          <Input
            id="speaker-title"
            value={draft.title}
            onChange={(event) => onChange("title", event.target.value)}
            placeholder="Principal Engineer"
            maxLength={160}
            disabled={disabled}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="speaker-company">Company</FieldLabel>
          <Input
            id="speaker-company"
            value={draft.company}
            onChange={(event) => onChange("company", event.target.value)}
            placeholder="Organization"
            maxLength={200}
            disabled={disabled}
          />
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="speaker-biography">Biography</FieldLabel>
        <Textarea
          id="speaker-biography"
          value={draft.biography}
          onChange={(event) => onChange("biography", event.target.value)}
          maxLength={20_000}
          disabled={disabled}
        />
      </Field>
      <div className={styles.fieldGrid}>
        <Field>
          <FieldLabel htmlFor="speaker-twitter">Twitter / X</FieldLabel>
          <Input
            id="speaker-twitter"
            value={draft.twitter}
            onChange={(event) => onChange("twitter", event.target.value)}
            placeholder="https://x.com/…"
            maxLength={500}
            disabled={disabled}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="speaker-linkedin">LinkedIn</FieldLabel>
          <Input
            id="speaker-linkedin"
            value={draft.linkedin}
            onChange={(event) => onChange("linkedin", event.target.value)}
            placeholder="https://linkedin.com/in/…"
            maxLength={500}
            disabled={disabled}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="speaker-website">Website</FieldLabel>
          <Input
            id="speaker-website"
            value={draft.website}
            onChange={(event) => onChange("website", event.target.value)}
            placeholder="https://…"
            maxLength={500}
            disabled={disabled}
          />
        </Field>
      </div>
      <FieldSet className={styles.detailBlock}>
        <FieldLegend variant="label">Travel and logistics</FieldLegend>
        <Field orientation="horizontal" className={styles.checkboxField}>
          <Checkbox
            id="speaker-travel-required"
            checked={draft.travelRequired}
            onCheckedChange={(checked) => onChange("travelRequired", checked === true)}
            disabled={disabled}
          />
          <FieldLabel htmlFor="speaker-travel-required">
            Speaker requires travel coordination
          </FieldLabel>
        </Field>
        <div className={styles.fieldGrid}>
          <Field>
            <FieldLabel htmlFor="speaker-arrival">Arrival date</FieldLabel>
            <Input
              id="speaker-arrival"
              type="date"
              value={draft.arrivalAt}
              onChange={(event) => onChange("arrivalAt", event.target.value)}
              disabled={disabled}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="speaker-departure">Departure date</FieldLabel>
            <Input
              id="speaker-departure"
              type="date"
              value={draft.departureAt}
              onChange={(event) => onChange("departureAt", event.target.value)}
              disabled={disabled}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="speaker-accommodation">Accommodation</FieldLabel>
            <Input
              id="speaker-accommodation"
              value={draft.accommodation}
              onChange={(event) => onChange("accommodation", event.target.value)}
              maxLength={500}
              disabled={disabled}
            />
          </Field>
        </div>
        <div className={styles.fieldGrid}>
          <Field>
            <FieldLabel htmlFor="speaker-dietary">Dietary requirements</FieldLabel>
            <Input
              id="speaker-dietary"
              value={draft.dietaryRequirements}
              onChange={(event) => onChange("dietaryRequirements", event.target.value)}
              maxLength={2_000}
              disabled={disabled}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="speaker-accessibility">Accessibility needs</FieldLabel>
            <Input
              id="speaker-accessibility"
              value={draft.accessibilityNeeds}
              onChange={(event) => onChange("accessibilityNeeds", event.target.value)}
              maxLength={2_000}
              disabled={disabled}
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="speaker-travel-notes">Travel notes</FieldLabel>
          <Textarea
            id="speaker-travel-notes"
            value={draft.travelNotes}
            onChange={(event) => onChange("travelNotes", event.target.value)}
            maxLength={5_000}
            disabled={disabled}
          />
        </Field>
      </FieldSet>
    </FieldGroup>
  );
}

export function SpeakerWorkspace({
  organizationId,
  eventId,
  api: providedApi,
}: SpeakerWorkspaceProps) {
  const [api, setApi] = useState<SpeakerApi | null>(providedApi ?? null);
  const [activeView, setActiveView] = useState<"roster" | "tasks" | "email">("roster");
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
  const [emailEditorMode, setEmailEditorMode] = useState<"visual" | "html" | "text">("visual");
  const [emailConfirmOpen, setEmailConfirmOpen] = useState(false);
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
  const [visibleSecondaryContext, setVisibleSecondaryContext] = useState<string | null>(null);
  const [visibleProgressContext, setVisibleProgressContext] = useState<string | null>(null);
  const [sessionFilter, setSessionFilter] = useState("all");
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [showCsv, setShowCsv] = useState(false);
  const [showSpeakerSheet, setShowSpeakerSheet] = useState(false);
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
  const [headshotUploadStatus, setHeadshotUploadStatus] =
    useState<OrganizerHeadshotUploadStatus>("idle");
  const [headshotUploadMessage, setHeadshotUploadMessage] = useState<string | null>(null);
  const [headshotPreviewUrl, setHeadshotPreviewUrl] = useState<string | null>(null);
  const [headshotPreviewError, setHeadshotPreviewError] = useState<string | null>(null);
  const [headshotPreviewLoading, setHeadshotPreviewLoading] = useState(false);
  const [headshotPreviewRevision, setHeadshotPreviewRevision] = useState(0);
  const [headshotPreviewRetry, setHeadshotPreviewRetry] = useState(0);
  const [headshotAssetsByParticipant, setHeadshotAssetsByParticipant] = useState<
    Readonly<Record<string, SpeakerAsset>>
  >({});
  const [downloadUrls, setDownloadUrls] = useState<Readonly<Record<string, string>>>({});
  const [downloadErrors, setDownloadErrors] = useState<Readonly<Record<string, string>>>({});
  const [downloadBusyAssetId, setDownloadBusyAssetId] = useState<string | null>(null);
  const [invitationPreviewBusy, setInvitationPreviewBusy] = useState(false);
  const [invitationSendBusy, setInvitationSendBusy] = useState(false);
  const [importPreviewBusy, setImportPreviewBusy] = useState(false);
  const [importCommitBusy, setImportCommitBusy] = useState(false);
  const [taskBusy, setTaskBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [profileMutationStatus, setProfileMutationStatus] =
    useState<SpeakerMutationStatus>("idle");
  const [profileMutationMessage, setProfileMutationMessage] = useState<string | null>(null);
  const [headshotMutationStatus, setHeadshotMutationStatus] =
    useState<SpeakerMutationStatus>("idle");
  const [headshotMutationMessage, setHeadshotMutationMessage] = useState<string | null>(null);
  const rosterRequestRef = useRef(0);
  const headshotRequestRef = useRef(0);
  const importRequestRef = useRef(0);
  const emailSelectionSnapshotRef = useRef<string | null>(null);
  useEffect(() => {
    rosterRequestRef.current += 1;
    setRoster(null);
    setProgress(null);
    setLoading(true);
    setError(null);
    setProgressError(null);
    setSelectedId(null);
    setSelectedSpeakerIds([]);
    setEditDraft(null);
    setEditError(null);
    setDetailNotice(null);
    setHeadshotAssetsByParticipant({});
    setDownloadUrls({});
    setDownloadErrors({});
    setProfileMutationStatus("idle");
    setProfileMutationMessage(null);
    setHeadshotMutationStatus("idle");
    setHeadshotMutationMessage(null);
    setHeadshotUploadStatus("idle");
    setHeadshotUploadMessage(null);
    secondaryLoadRef.current = null;
    progressLoadRef.current = null;
  }, [eventId, organizationId]);
  const emailPreviewRequestRef = useRef(0);
  const secondaryLoadRef = useRef<{ api: SpeakerApi; key: string } | null>(null);
  const progressLoadRef = useRef<{ api: SpeakerApi; key: string; requestId: number } | null>(null);
  const emailSectionRef = useRef<HTMLDivElement | null>(null);
  const reminderSectionRef = useRef<HTMLDivElement | null>(null);
  const importBusy = importPreviewBusy || importCommitBusy;

  useEffect(() => {
    if (providedApi !== undefined) {
      setApi(providedApi);
      return;
    }
    try {
      setApi(createSpeakerApi("", organizationId, eventId));
    } catch (reason: unknown) {
      setApi(null);
      setError(errorMessage(reason));
    }
  }, [eventId, organizationId, providedApi]);

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
      })
      .catch((reason: unknown) => {
        if (!active || requestId !== rosterRequestRef.current) return;
        setRoster(null);
        setProgress(null);
        setSelectedId(null);
        setSelectedSpeakerIds([]);
        setError(
          rosterTimedOut ? "Speaker roster refresh timed out. Try again." : errorMessage(reason),
        );
      })
      .finally(() => {
        clearTimeout(rosterTimeout);
        if (active && requestId === rosterRequestRef.current) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [api, eventId, organizationId]);
  const secondaryContextKey = `${organizationId}:${eventId}`;
  const progressSectionVisible =
    activeView === "tasks" || visibleProgressContext === secondaryContextKey;
  useEffect(() => {
    if (
      api === null ||
      roster === null ||
      loading ||
      !progressSectionVisible ||
      roster.organizationId !== organizationId ||
      roster.eventId !== eventId
    ) {
      return;
    }
    const requestId = rosterRequestRef.current;
    const currentRequest = progressLoadRef.current;
    if (
      currentRequest?.api === api &&
      currentRequest.key === secondaryContextKey &&
      currentRequest.requestId === requestId
    ) {
      return;
    }
    const request = { api, key: secondaryContextKey, requestId };
    progressLoadRef.current = request;
    const controller = new AbortController();
    let active = true;
    let settled = false;
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, ASYNC_ACTION_TIMEOUT_MS);
    setProgressError(null);
    void speakerProgressFor(api, roster.speakers, organizationId, eventId, controller.signal)
      .then((nextProgress) => {
        if (!active || requestId !== rosterRequestRef.current) return;
        setProgress(nextProgress);
        setRoster((current) =>
          current === null ? current : mergeProgressSummaries(current, nextProgress),
        );
      })
      .catch((reason: unknown) => {
        if (!active || requestId !== rosterRequestRef.current) return;
        setProgress(null);
        setProgressError(
          timedOut ? "Speaker progress refresh timed out. Try again." : errorMessage(reason),
        );
      })
      .finally(() => {
        settled = true;
        clearTimeout(timeoutId);
      });
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timeoutId);
      if (!settled && progressLoadRef.current === request) progressLoadRef.current = null;
    };
  }, [api, eventId, loading, organizationId, progressSectionVisible, roster, secondaryContextKey]);
  const secondarySectionsVisible =
    activeView === "tasks" ||
    activeView === "email" ||
    visibleSecondaryContext === secondaryContextKey;
  useEffect(() => {
    if (secondarySectionsVisible) return;
    const sections = [emailSectionRef.current, reminderSectionRef.current].filter(
      (section): section is HTMLDivElement => section !== null,
    );
    if (sections.length === 0) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisibleSecondaryContext(secondaryContextKey);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setVisibleSecondaryContext(secondaryContextKey);
        observer.disconnect();
      },
      { rootMargin: "240px" },
    );
    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [secondaryContextKey, secondarySectionsVisible]);
  const currentSecondaryLoadKey = speakerSecondaryLoadKey(
    roster,
    organizationId,
    eventId,
    loading,
    secondarySectionsVisible,
  );
  useEffect(() => {
    const loadKey = currentSecondaryLoadKey;
    if (api === null || loadKey === null) return;
    if (secondaryLoadRef.current?.api === api && secondaryLoadRef.current.key === loadKey) return;
    secondaryLoadRef.current = { api, key: loadKey };
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
  }, [api, currentSecondaryLoadKey]);

  const scopedRoster =
    roster !== null &&
    roster.organizationId === organizationId &&
    roster.eventId === eventId
      ? roster
      : null;
  const scopedProgress =
    progress !== null &&
    progress.organizationId === organizationId &&
    progress.eventId === eventId
      ? progress
      : null;
  const speakers = scopedRoster?.speakers ?? [];
  const selectedSpeaker = speakers.find((speaker) => speaker.participantId === selectedId) ?? null;
  const cachedHeadshotAsset =
    selectedSpeaker === null
      ? null
      : (headshotAssetsByParticipant[selectedSpeaker.participantId] ?? null);
  const selectedHeadshotAsset =
    selectedSpeaker === null || selectedSpeaker.headshotAssetId === null
      ? null
      : (selectedSpeaker.assets.find(
          (asset) => asset.assetId === selectedSpeaker.headshotAssetId,
        ) ??
        (cachedHeadshotAsset?.assetId === selectedSpeaker.headshotAssetId
          ? cachedHeadshotAsset
          : null));
  const duplicateEmailWarnings = useMemo(() => duplicateEmailConflicts(speakers), [speakers]);
  const emailAnyBusy = emailSaveBusy || emailPreviewBusy || emailSendBusy || emailHistoryBusy;
  const selectedEmailTemplate = emailTemplates.find(
    (template) => template.id === emailTemplateId && template.version === emailTemplateVersion,
  );
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
      filterSpeakerRoster(speakers, scopedProgress?.rows ?? [], {
        query,
        status: statusFilter,
        session: sessionFilter,
        progress: progressFilter,
      }),
    [scopedProgress?.rows, progressFilter, query, sessionFilter, speakers, statusFilter],
  );
  const progressRows = useMemo(
    () =>
      (scopedProgress?.rows ?? []).filter((row) => speakerProgressMatches(row.tasks, progressFilter)),
    [scopedProgress?.rows, progressFilter],
  );
  const onboardingTaskDefinitions = useMemo(
    () => speakerOnboardingTaskDefinitions(scopedProgress?.rows ?? []),
    [scopedProgress?.rows],
  );
  const eligibleReminderItems = useMemo(
    () => reminderEligibility?.items.filter((item) => item.eligible) ?? [],
    [reminderEligibility],
  );
  const ineligibleReminderItems = useMemo(
    () => reminderEligibility?.items.filter((item) => !item.eligible) ?? [],
    [reminderEligibility],
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
  const emailPreviewCurrent =
    emailPreview !== null &&
    emailPreview.organizationId === organizationId &&
    emailPreview.eventId === eventId &&
    emailPreview.templateId === emailTemplateId &&
    emailPreview.templateVersion === emailTemplateVersion &&
    emailPreview.recipientIds.length === selectedSpeakerIds.length &&
    selectedSpeakerIds.every((participantId) => emailPreview.recipientIds.includes(participantId));
  const invalidateEmailPreview = useCallback(() => {
    emailPreviewRequestRef.current += 1;
    setEmailPreview(null);
    setEmailSendIdempotencyKey(null);
    setEmailConfirmOpen(false);
    setEmailPreviewBusy(false);
  }, []);
  useEffect(() => {
    const snapshot = [...selectedSpeakerIds].sort().join("\u0000");
    const previous = emailSelectionSnapshotRef.current;
    if (previous !== null && previous !== snapshot) invalidateEmailPreview();
    emailSelectionSnapshotRef.current = snapshot;
  }, [invalidateEmailPreview, selectedSpeakerIds]);
  useEffect(() => {
    const participantId = selectedSpeaker?.participantId;
    const assetId = selectedSpeaker?.headshotAssetId;
    const requestId = headshotRequestRef.current + headshotPreviewRetry + 1;
    headshotRequestRef.current = requestId;
    let active = true;
    setHeadshotPreviewUrl(null);
    setHeadshotPreviewError(null);

    if (api === null || participantId === undefined || assetId === undefined || assetId === null) {
      setHeadshotPreviewLoading(false);
      return () => {
        active = false;
      };
    }

    setHeadshotPreviewLoading(true);
    void (async () => {
      try {
        if (selectedHeadshotAsset === null) {
          const assets = await withTimeout(
            (signal) => api.getAssets(participantId, signal),
            "Headshot metadata load",
          );
          if (!active || requestId !== headshotRequestRef.current) return;
          const linked = assets.find((asset) => asset.assetId === assetId);
          if (linked === undefined) {
            setHeadshotPreviewError("The linked headshot file is unavailable.");
            return;
          }
          setHeadshotAssetsByParticipant((current) => ({
            ...current,
            [participantId]: linked,
          }));
          return;
        }

        if (selectedHeadshotAsset.status !== "ready") {
          throw new Error("The linked headshot is not ready yet.");
        }
        const contentType = selectedHeadshotAsset.contentType.trim().toLowerCase();
        if (
          !ORGANIZER_HEADSHOT_ACCEPTED_TYPES.includes(
            contentType as (typeof ORGANIZER_HEADSHOT_ACCEPTED_TYPES)[number],
          )
        ) {
          throw new Error("The linked asset is not a supported headshot image.");
        }
        const grant = await withTimeout(
          (signal) => api.getDownloadGrant(selectedHeadshotAsset.assetId, signal),
          "Headshot preview",
        );
        const previewPath = organizerHeadshotPreviewPath(grant.url);
        if (previewPath === null) {
          throw new Error("The private headshot preview did not return a same-origin API path.");
        }
        if (!active || requestId !== headshotRequestRef.current) return;
        setHeadshotPreviewUrl(previewPath);
        setHeadshotPreviewRevision((current) => current + 1);
      } catch (reason: unknown) {
        if (active && requestId === headshotRequestRef.current) {
          setHeadshotPreviewError(errorMessage(reason));
        }
      } finally {
        if (active && requestId === headshotRequestRef.current) {
          setHeadshotPreviewLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [
    api,
    headshotPreviewRetry,
    selectedHeadshotAsset,
    selectedSpeaker?.headshotAssetId,
    selectedSpeaker?.participantId,
  ]);

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
    invalidateEmailPreview();
    setEmailNotice(null);
  }

  function toggleVisibleSpeakerSelection(): void {
    const visibleIds = filteredSpeakers.map((speaker) => speaker.participantId);
    setSelectedSpeakerIds((current) =>
      allVisibleSelected
        ? current.filter((participantId) => !visibleIds.includes(participantId))
        : [...new Set([...current, ...visibleIds])],
    );
    invalidateEmailPreview();
    setEmailNotice(null);
  }

  function clearSpeakerSelection(): void {
    setSelectedSpeakerIds([]);
    invalidateEmailPreview();
    setEmailNotice(null);
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
    setProfileMutationStatus("idle");
    setProfileMutationMessage(null);
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
        void speakerProgressFor(
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
      setRoster(null);
      setProgress(null);
      setSelectedId(null);
      setSelectedSpeakerIds([]);
      setError(errorMessage(reason));
    }
  }
  async function reload(message?: string): Promise<SpeakerRosterEnvelope | null> {
    if (api === null) {
      setError("The speaker API is unavailable.");
      return null;
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
      if (requestId !== rosterRequestRef.current) return null;
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
      void speakerProgressFor(
        api,
        nextRoster.speakers,
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
      return nextRoster;
    } catch (reason: unknown) {
      if (requestId === rosterRequestRef.current) {
        if (
          reason instanceof Error &&
          /different organization|different event|invalid|duplicate participant/iu.test(reason.message)
        ) {
          setRoster(null);
          setProgress(null);
          setSelectedId(null);
          setSelectedSpeakerIds([]);
        }
        setError(
          rosterTimedOut ? "Speaker roster refresh timed out. Try again." : errorMessage(reason),
        );
      }
      return null;
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
    setHeadshotUploadStatus("idle");
    setHeadshotUploadMessage(null);
    setHeadshotMutationStatus("idle");
    setHeadshotMutationMessage(null);
    setEditDraft(editDraftFor(speaker));
    setProfileMutationStatus("idle");
    setProfileMutationMessage(null);
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
    const participantId = selectedSpeaker.participantId;
    const expectedVersion = editDraft.expectedVersion;
    const input: SpeakerUpdateInput = {
      expectedVersion,
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
      setProfileMutationStatus("failure");
      setProfileMutationMessage("Name and email are required.");
      return;
    }
    setInvitationPreview(null);
    setInvitationResult(null);
    setInvitationResultParticipantId(null);
    setInvitationError(null);
    setInvitationSendIdempotencyKey(null);
    setSaveBusy(true);
    setProfileMutationStatus("saving");
    setProfileMutationMessage("Saving speaker profile…");
    setEditError(null);
    try {
      const updatedRoster = assertSpeakerRosterScope(
        await api.update(participantId, input),
        organizationId,
        eventId,
      );
      const updated = updatedRoster.speakers.find(
        (speaker) => speaker.participantId === participantId,
      );
      if (updated === undefined) {
        throw new TypeError("The saved speaker is missing from the roster.");
      }
      assertAdvancedSpeakerRevision(updated, participantId, expectedVersion, eventId);
      setProfileMutationStatus("pending");
      setProfileMutationMessage("Profile write accepted. Reloading authoritative speaker data…");
      const reloaded = await reload();
      const persisted = reloaded?.speakers.find(
        (speaker) => speaker.participantId === participantId,
      );
      if (persisted === undefined) {
        throw new TypeError("The reloaded speaker is missing from the roster.");
      }
      assertAdvancedSpeakerRevision(persisted, participantId, expectedVersion, eventId);
      setEditDraft(editDraftFor(persisted));
      setProfileMutationStatus("saved");
      setProfileMutationMessage(`Saved at revision ${persisted.version}.`);
      setNotice("Speaker profile saved and reloaded from the server.");
    } catch (reason: unknown) {
      const conflict =
        reason instanceof SpeakerApiError &&
        (reason.status === 409 ||
          reason.code === "CONFLICT" ||
          reason.code === "VERSION_CONFLICT");
      if (conflict) {
        setProfileMutationStatus("conflict");
        setProfileMutationMessage("Conflict detected. Authoritative speaker data was reloaded.");
        const reloaded = await reload();
        const current = reloaded?.speakers.find(
          (speaker) => speaker.participantId === participantId,
        );
        if (current !== undefined) setEditDraft(editDraftFor(current));
        setEditError("This speaker changed elsewhere. Review the reloaded values before saving.");
      } else {
        setProfileMutationStatus("failure");
        setProfileMutationMessage(errorMessage(reason));
        setEditError(errorMessage(reason));
      }
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
        const latestProgress = await speakerProgressFor(
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
    invalidateEmailPreview();
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
    invalidateEmailPreview();
    const requestId = emailPreviewRequestRef.current;
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
        if (requestId !== emailPreviewRequestRef.current) return;
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
      if (requestId !== emailPreviewRequestRef.current) return;
      if (preview.organizationId !== organizationId || preview.eventId !== eventId) {
        throw new Error("The email preview belongs to a different event. Create a new preview.");
      }
      setEmailPreview(preview);
      setEmailTemplateId(preview.templateId);
      setEmailCreateTemplateId(null);
      setEmailTemplateVersion(preview.templateVersion);
      setEmailSendIdempotencyKey(null);
      setEmailNotice(
        `Merge preview ready for ${preview.recipientIds.length} selected speaker${preview.recipientIds.length === 1 ? "" : "s"}.`,
      );
    } catch (reason: unknown) {
      if (requestId === emailPreviewRequestRef.current) setEmailNotice(errorMessage(reason));
    } finally {
      if (requestId === emailPreviewRequestRef.current) setEmailPreviewBusy(false);
    }
  }

  async function sendBulkEmail(): Promise<void> {
    if (api === null || !emailPreviewCurrent || emailPreview === null) {
      setEmailNotice("Create a current merge preview before queueing the email.");
      setEmailConfirmOpen(false);
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
  function retryHeadshotPreview(): void {
    setHeadshotPreviewRetry((current) => current + 1);
  }

  function markHeadshotPreviewFailed(): void {
    setHeadshotPreviewUrl(null);
    setHeadshotPreviewLoading(false);
    setHeadshotPreviewError("The secure headshot preview could not be rendered.");
  }

  async function uploadOrganizerHeadshot(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (file === undefined) return;
    const validationError = validateOrganizerHeadshotFile(file);
    if (validationError !== null) {
      setHeadshotUploadStatus("error");
      setHeadshotMutationStatus("failure");
      setHeadshotUploadMessage(validationError);
      setHeadshotMutationMessage(validationError);
      return;
    }
    if (api === null || selectedSpeaker === null || api.replaceHeadshot === undefined) {
      const message =
        "Organizer headshot upload is unavailable until the private upload API is provisioned.";
      setHeadshotUploadStatus("error");
      setHeadshotMutationStatus("failure");
      setHeadshotUploadMessage(message);
      setHeadshotMutationMessage(message);
      return;
    }

    const participantId = selectedSpeaker.participantId;
    const expectedVersion = selectedSpeaker.version;
    const supersedesAssetId = selectedSpeaker.headshotAssetId ?? undefined;
    setHeadshotUploadStatus("busy");
    setHeadshotMutationStatus("saving");
    setHeadshotMutationMessage(`Uploading ${file.name}…`);
    setHeadshotUploadMessage(`Uploading ${file.name}…`);
    try {
      const replacement = assertSpeakerHeadshotReplacement(
        await api.replaceHeadshot({
          participantId,
          file,
          expectedVersion,
          ...(supersedesAssetId === undefined ? {} : { supersedesAssetId }),
        }),
        eventId,
        participantId,
        expectedVersion,
      );
      setHeadshotMutationStatus("pending");
      setHeadshotMutationMessage("Headshot write accepted. Reloading authoritative speaker data…");
      setHeadshotUploadMessage("Upload accepted. Reloading speaker data…");
      const reloaded = await reload();
      const persisted = reloaded?.speakers.find(
        (speaker) => speaker.participantId === participantId,
      );
      if (persisted === undefined) {
        throw new TypeError("The reloaded speaker is missing from the roster.");
      }
      assertAdvancedSpeakerRevision(persisted, participantId, expectedVersion, eventId);
      if (persisted.headshotAssetId !== replacement.asset.id) {
        throw new TypeError("The reloaded speaker does not point to the uploaded headshot.");
      }
      setEditDraft((current) =>
        current === null ? current : editDraftFor(persisted),
      );
      setHeadshotPreviewUrl(null);
      setHeadshotPreviewError(null);
      setHeadshotPreviewRevision((current) => current + 1);
      setHeadshotUploadStatus("success");
      setHeadshotMutationStatus("saved");
      setHeadshotMutationMessage(`Saved at revision ${persisted.version}.`);
      setHeadshotUploadMessage(`Headshot uploaded for ${persisted.displayName}.`);
    } catch (reason: unknown) {
      const conflict =
        reason instanceof SpeakerApiError &&
        (reason.status === 409 ||
          reason.code === "CONFLICT" ||
          reason.code === "VERSION_CONFLICT");
      if (conflict) {
        setHeadshotMutationStatus("conflict");
        setHeadshotMutationMessage("Conflict detected. Authoritative speaker data was reloaded.");
        setHeadshotUploadStatus("error");
        setHeadshotUploadMessage("Headshot upload conflicted; review the reloaded speaker data.");
        await reload();
      } else {
        const message = errorMessage(reason);
        setHeadshotMutationStatus("failure");
        setHeadshotMutationMessage(message);
        setHeadshotUploadStatus("error");
        setHeadshotUploadMessage(message);
      }
    }
  }

  return (
    <div className={styles.workspace}>
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <p className={styles.eyebrow}>Event operations · Speakers</p>
          <h1 className={styles.title}>Speaker workspace</h1>
          <p className={styles.description}>
            Keep the event roster, speaker tasks, and communications in one focused workspace.
          </p>
          <p className={styles.muted}>
            Organization <strong>{organizationId}</strong> · Event <strong>{eventId}</strong>
          </p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="outline" type="button" onClick={() => void reload()} disabled={loading}>
            <RefreshCw data-icon="inline-start" />
            {loading ? "Refreshing…" : "Refresh roster"}
          </Button>
          <Button variant="default" type="button" onClick={() => setShowAdd(true)}>
            <UserPlus data-icon="inline-start" />
            Add speaker
          </Button>
        </div>
      </header>

      {error ? <FormMessage message={error} error /> : null}
      {notice ? <FormMessage message={notice} /> : null}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className={styles.dialogContent}>
          <DialogHeader>
            <DialogTitle>Add speaker</DialogTitle>
            <DialogDescription>
              Capture identity and profile details before sending an optional portal invitation.
            </DialogDescription>
          </DialogHeader>
          <form className={styles.actionsStack} onSubmit={(event) => void createSpeaker(event)}>
            <ProfileFields draft={createDraft} onChange={updateCreate} disabled={saveBusy} />
            <Field>
              <FieldLabel htmlFor="create-speaker-status">Workflow status</FieldLabel>
              <Select
                value={createDraft.status}
                onValueChange={(value) => updateCreate("status", value)}
                disabled={saveBusy}
              >
                <SelectTrigger id="create-speaker-status" className={styles.control}>
                  <SelectValue placeholder="Select workflow status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {statusOptions.map((status) => (
                      <SelectItem key={status} value={status}>
                        {statusLabel(status)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Button variant="default" type="submit" disabled={saveBusy || api === null}>
              <CheckCircle2 data-icon="inline-start" />
              {saveBusy ? "Saving…" : "Save speaker"}
            </Button>
            <p className={styles.muted} role="note">
              Headshot upload is completed by the speaker in their portal.{" "}
              {SPEAKER_CUSTOM_FIELDS_CONTRACT_GAP}
            </p>
          </form>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs
        value={activeView}
        onValueChange={(value) => setActiveView(value as "roster" | "tasks" | "email")}
        className={styles.tabs}
      >
        <TabsList variant="line" aria-label="Speaker workspace views">
          <TabsTrigger id="roster-tab" aria-controls="roster-view" value="roster">
            <Users data-icon="inline-start" />
            Roster
          </TabsTrigger>
          <TabsTrigger id="tasks-tab" aria-controls="tasks-view" value="tasks">
            <ListTodo data-icon="inline-start" />
            Tasks
          </TabsTrigger>
          <TabsTrigger id="email-tab" aria-controls="email-view" value="email">
            <Mail data-icon="inline-start" />
            Email
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="roster"
          id="roster-view"
          aria-labelledby="roster-tab"
          className={styles.view}
        >
          <section className={styles.summaryGrid} aria-label="Speaker roster summary">
            <Card size="sm" className={styles.summary}>
              <CardHeader>
                <CardDescription>Speakers</CardDescription>
                <CardTitle>{speakers.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card size="sm" className={styles.summary}>
              <CardHeader>
                <CardDescription>Visible</CardDescription>
                <CardTitle>{filteredSpeakers.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card size="sm" className={styles.summary}>
              <CardHeader>
                <CardDescription>Invited</CardDescription>
                <CardTitle>
                  {speakers.filter((speaker) => speaker.status === "invited").length}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card size="sm" className={styles.summary}>
              <CardHeader>
                <CardDescription>Needs work</CardDescription>
                <CardTitle>
                  {speakers.filter((speaker) => speaker.taskSummary.overdue > 0).length}
                </CardTitle>
              </CardHeader>
            </Card>
          </section>

          <Card className={styles.panel} aria-busy={loading}>
            <CardHeader className={styles.panelHeader}>
              <div>
                <CardTitle id="roster-heading">Roster</CardTitle>
                <CardDescription>
                  Search and filter this event roster, then open a speaker for profile and delivery
                  details.
                </CardDescription>
              </div>
              <Badge variant="outline">
                {scopedRoster ? `${filteredSpeakers.length} of ${speakers.length}` : "Loading"}
              </Badge>
            </CardHeader>
            <CardContent className={styles.actionsStack}>
              <div className={styles.toolbar}>
                <Field>
                  <FieldLabel className={adminStyles.srOnly} htmlFor="speaker-search">
                    Search speakers
                  </FieldLabel>
                  <div className={styles.inputWithIcon}>
                    <Search aria-hidden="true" />
                    <Input
                      id="speaker-search"
                      aria-label="Search speakers"
                      placeholder="Search by name, email, title, or company"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </div>
                </Field>
                <Field>
                  <FieldLabel className={adminStyles.srOnly} htmlFor="speaker-status-filter">
                    Filter by status
                  </FieldLabel>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger id="speaker-status-filter" aria-label="Filter by status">
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="all">All statuses</SelectItem>
                        {statusOptions.map((status) => (
                          <SelectItem key={status} value={status}>
                            {statusLabel(status)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel className={adminStyles.srOnly} htmlFor="speaker-session-filter">
                    Filter by session
                  </FieldLabel>
                  <Select value={sessionFilter} onValueChange={setSessionFilter}>
                    <SelectTrigger id="speaker-session-filter" aria-label="Filter by session">
                      <SelectValue placeholder="All sessions" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="all">All sessions</SelectItem>
                        {sessionOptions.map(([sessionId, title]) => (
                          <SelectItem key={sessionId} value={sessionId}>
                            {title}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel className={adminStyles.srOnly} htmlFor="speaker-progress-filter">
                    Filter by task progress
                  </FieldLabel>
                  <Select
                    value={progressFilter}
                    onValueChange={(value) => setProgressFilter(value as ProgressFilter)}
                  >
                    <SelectTrigger
                      id="speaker-progress-filter"
                      aria-label="Filter by task progress"
                    >
                      <SelectValue placeholder="All task progress" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="all">All task progress</SelectItem>
                        <SelectItem value="complete">Complete</SelectItem>
                        <SelectItem value="incomplete">Incomplete</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Button
                  variant="outline"
                  type="button"
                  onClick={clearRosterFilters}
                  disabled={!hasActiveRosterFilters}
                  aria-label="Clear speaker filters"
                >
                  Clear filters
                </Button>
              </div>

              {hasActiveRosterFilters ? (
                <p className={styles.muted} role="status" aria-live="polite">
                  Showing {filteredSpeakers.length} of {speakers.length} speakers after filters.
                </p>
              ) : null}
              <div className={styles.selectionBar}>
                <span>
                  {selectedSpeakerIds.length} speaker{selectedSpeakerIds.length === 1 ? "" : "s"}{" "}
                  selected
                </span>
                <div className={styles.actions}>
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={toggleVisibleSpeakerSelection}
                    disabled={filteredSpeakers.length === 0}
                  >
                    {allVisibleSelected ? "Deselect visible" : "Select visible"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={clearSpeakerSelection}
                    disabled={selectedSpeakerIds.length === 0}
                  >
                    Clear selection
                  </Button>
                </div>
              </div>

              {loading ? (
                <FormMessage
                  message={
                  scopedRoster
                    ? "Refreshing speaker roster…"
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

              <div className={styles.rosterGrid}>
                <div className={styles.rosterList}>
                  {!loading && scopedRoster && speakers.length === 0 ? (
                    <Empty className={styles.empty}>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Users />
                        </EmptyMedia>
                        <EmptyTitle>No speakers yet</EmptyTitle>
                        <EmptyDescription>
                          Add a speaker or use the Import CSV control below to start this event
                          roster.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : null}
                  {!loading && scopedRoster && speakers.length > 0 && filteredSpeakers.length === 0 ? (
                    <Empty className={styles.empty}>
                      <EmptyHeader>
                        <EmptyTitle>No matching speakers</EmptyTitle>
                        <EmptyDescription>
                          No speakers match the current search and filters. Clear them to restore
                          the roster.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : null}
                  {filteredSpeakers.length > 0 ? (
                    <ul className={styles.speakerList} aria-label="Event speaker roster">
                      {filteredSpeakers.map((speaker) => (
                        <li
                          className={`${styles.speakerRow}${selectedId === speaker.participantId ? ` ${styles.speakerRowSelected}` : ""}`}
                          key={speaker.participantId}
                        >
                          <Field orientation="horizontal" className={styles.checkboxField}>
                            <Checkbox
                              id={`roster-selection-${speaker.participantId}`}
                              aria-label={`Select ${speaker.displayName}`}
                              checked={selectedSpeakerIds.includes(speaker.participantId)}
                              onCheckedChange={() => toggleSpeakerSelection(speaker.participantId)}
                            />
                            <FieldLabel htmlFor={`roster-selection-${speaker.participantId}`}>
                              Select speaker
                            </FieldLabel>
                          </Field>
                          <div className={styles.speakerCopy}>
                            <Button
                              variant="link"
                              size="sm"
                              className={styles.speakerName}
                              type="button"
                              onClick={() => beginEdit(speaker)}
                            >
                              {speaker.displayName}
                            </Button>
                            <span className={styles.speakerMeta}>{speaker.email}</span>
                            <span className={styles.speakerMeta}>
                              {speaker.jobTitle || speaker.company
                                ? `${speaker.jobTitle ?? ""}${speaker.jobTitle && speaker.company ? " · " : ""}${speaker.company ?? ""}`
                                : "Profile details pending"}
                            </span>
                          </div>
                          <div className={styles.speakerStats}>
                            <SpeakerStatusBadge status={speaker.status} />
                            <span>
                              {speaker.sessions.length} session
                              {speaker.sessions.length === 1 ? "" : "s"}
                            </span>
                            <span>
                              {speaker.taskSummary.completed} / {speaker.taskSummary.total} tasks
                              {speaker.taskSummary.overdue > 0
                                ? ` · ${speaker.taskSummary.overdue} overdue`
                                : ""}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              type="button"
                              onClick={() => beginEdit(speaker)}
                            >
                              Open profile
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                {selectedSpeaker ? (
                  <Card className={styles.detail} aria-labelledby="speaker-detail-heading">
                    <CardHeader className={styles.detailHeader}>
                      <div>
                        <p className={styles.eyebrow}>Speaker record</p>
                        <CardTitle id="speaker-detail-heading">
                          {selectedSpeaker.displayName}
                        </CardTitle>
                        <CardDescription>
                          {selectedSpeaker.email} ·{" "}
                          <SpeakerStatusBadge status={selectedSpeaker.status} />
                        </CardDescription>
                      </div>
                      <div className={styles.actions}>
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          onClick={() => void refreshDetails()}
                          disabled={detailBusy || api === null}
                        >
                          <RefreshCw data-icon="inline-start" />
                          {detailBusy ? "Refreshing details…" : "Refresh details"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          onClick={() => setShowSpeakerSheet(true)}
                        >
                          <Eye data-icon="inline-start" />
                          Open drawer
                        </Button>
                        <SpeakerInvitationControls
                          previewBusy={invitationPreviewBusy}
                          sendBusy={invitationSendBusy}
                          disabled={api === null}
                          canSend={invitationReady}
                          onPreview={() => void previewSelectedSpeakerInvitation()}
                          onSend={() => void sendSelectedSpeakerInvitation()}
                        />
                      </div>
                    </CardHeader>
                    <CardContent className={styles.actionsStack}>
                      {invitationPreviewCount > 0 ? (
                        <Alert>
                          <Mail />
                          <AlertTitle>Invitation preview ready</AlertTitle>
                          <AlertDescription>
                            {invitationPreviewCount} speaker previewed.{" "}
                            {invitationReady ? "Eligible to send." : "Sending is blocked."} Sending
                            remains a separate explicit action.
                            <ul className={styles.list} aria-label="Portal invitation preview">
                              {selectedInvitationPreview.map((preview) => (
                                <li key={preview.participantId}>
                                  <strong>{statusLabel(preview.state)}</strong> ·{" "}
                                  {preview.recipientEmail || "No deliverable email"}
                                </li>
                              ))}
                            </ul>
                          </AlertDescription>
                        </Alert>
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
                        <div className={styles.detailBlock}>
                          <h3 className={styles.subheading}>Portal invitation send history</h3>
                          <ul className={styles.list} aria-label="Portal invitation send history">
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
                          <p className={styles.muted}>
                            History remains available while this workspace is open; the speaker API
                            does not expose a persistent invitation-history read endpoint.
                          </p>
                        </div>
                      ) : null}
                      {detailNotice ? (
                        <FormMessage
                          message={detailNotice}
                          error={
                            detailNotice.includes("unavailable") || detailNotice.includes("could")
                          }
                        />
                      ) : null}
                      <Card className={styles.uploadPanel}>
                        <CardHeader>
                          <CardTitle className={styles.subheading}>Headshot</CardTitle>
                          <CardDescription>
                            Secure event-scoped preview and organizer replacement.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className={styles.actionsStack}>
                          <SpeakerHeadshot
                            speakerName={selectedSpeaker.displayName}
                            asset={selectedHeadshotAsset}
                            imageUrl={headshotPreviewUrl}
                            loading={headshotPreviewLoading}
                            error={headshotPreviewError}
                            revision={headshotPreviewRevision}
                            onRetry={retryHeadshotPreview}
                            onImageError={markHeadshotPreviewFailed}
                          />
                          <Field>
                            <FieldLabel htmlFor="speaker-headshot-upload">
                              Upload or replace headshot
                            </FieldLabel>
                            <Input
                              id="speaker-headshot-upload"
                              type="file"
                              accept={ORGANIZER_HEADSHOT_ACCEPTED_TYPES.join(",")}
                              onChange={(event) => void uploadOrganizerHeadshot(event)}
                              disabled={
                                headshotUploadStatus === "busy" ||
                                api === null ||
                                api.replaceHeadshot === undefined
                              }
                            />
                          </Field>
                          <p className={styles.muted}>
                            Accepted headshot types: JPEG, PNG, or WebP; maximum size 5 MB. Uploads
                            use the event-scoped organizer private upload flow.
                          </p>
                          {headshotUploadMessage ? (
                            <FormMessage
                              message={headshotUploadMessage}
                              error={headshotUploadStatus === "error"}
                            />
                          ) : null}
                          <MutationStatusMessage
                            label="Headshot"
                            status={headshotMutationStatus}
                            message={headshotMutationMessage}
                          />
                        </CardContent>
                      </Card>

                      {editDraft ? (
                        <form
                          className={styles.detailBlock}
                          onSubmit={(event) => void saveSpeaker(event)}
                        >
                          <ProfileFields
                            draft={editDraft}
                            onChange={updateEdit}
                            disabled={saveBusy}
                          />
                          <Field>
                            <FieldLabel htmlFor="edit-speaker-status">Workflow status</FieldLabel>
                            <Select
                              value={editDraft.status}
                              onValueChange={(value) => updateEdit("status", value)}
                              disabled={saveBusy}
                            >
                              <SelectTrigger id="edit-speaker-status">
                                <SelectValue placeholder="Select workflow status" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  {statusOptions.map((status) => (
                                    <SelectItem key={status} value={status}>
                                      {statusLabel(status)}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          </Field>
                          <MutationStatusMessage
                            label="Profile"
                            status={profileMutationStatus}
                            message={profileMutationMessage}
                          />
                          {editError ? <FormMessage message={editError} error /> : null}
                          <div className={styles.actions}>
                            <Button
                              variant="default"
                              type="submit"
                              disabled={saveBusy || api === null}
                            >
                              <CheckCircle2 data-icon="inline-start" />
                              {profileMutationStatus === "pending"
                                ? "Pending…"
                                : saveBusy
                                  ? "Saving…"
                                  : "Save profile changes"}
                            </Button>
                            <Badge variant="outline">Version {editDraft.expectedVersion}</Badge>
                          </div>
                        </form>
                      ) : (
                        <Button
                          variant="outline"
                          type="button"
                          onClick={() => beginEdit(selectedSpeaker)}
                        >
                          Edit profile
                        </Button>
                      )}

                      <div className={styles.detailGrid}>
                        <Card size="sm">
                          <CardHeader>
                            <CardTitle className={styles.subheading}>Session assignments</CardTitle>
                            <CardDescription>Authoritative agenda links.</CardDescription>
                          </CardHeader>
                          <CardContent className={styles.actionsStack}>
                            {selectedSpeaker.sessions.length === 0 ? (
                              <Empty>
                                <EmptyTitle>No sessions linked</EmptyTitle>
                                <EmptyDescription>
                                  No sessions are linked to this speaker yet.
                                </EmptyDescription>
                              </Empty>
                            ) : (
                              <ul className={styles.list}>
                                {selectedSpeaker.sessions.map((session: SpeakerSession) => (
                                  <li key={session.submissionId} className={styles.preview}>
                                    <strong>{session.title}</strong>
                                    <Badge variant="outline">{statusLabel(session.status)}</Badge>
                                  </li>
                                ))}
                              </ul>
                            )}
                            <div className={styles.actions}>
                              <Button
                                variant="outline"
                                type="button"
                                disabled
                                title="Session linking is managed by the agenda service."
                              >
                                Assign a session
                              </Button>
                              <Button variant="outline" asChild>
                                <Link
                                  href={`/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventId)}/agenda`}
                                >
                                  Open Agenda
                                </Link>
                              </Button>
                            </div>
                            <p className={styles.muted}>
                              Session linking is managed in Agenda; this workspace shows the
                              authoritative assignments.
                            </p>
                          </CardContent>
                        </Card>
                        <Card size="sm">
                          <CardHeader>
                            <CardTitle className={styles.subheading}>
                              Uploaded deliverables
                            </CardTitle>
                            <CardDescription>Private event files and headshots.</CardDescription>
                          </CardHeader>
                          <CardContent>
                            {selectedSpeaker.assets.length === 0 ? (
                              <Empty>
                                <EmptyTitle>No deliverables</EmptyTitle>
                                <EmptyDescription>
                                  No uploaded headshot or deliverables are available.
                                </EmptyDescription>
                              </Empty>
                            ) : (
                              <ul className={styles.list}>
                                {selectedSpeaker.assets.map((asset: SpeakerAsset) => (
                                  <li key={asset.assetId} className={styles.preview}>
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
                          </CardContent>
                        </Card>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Empty className={styles.empty}>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Users />
                      </EmptyMedia>
                      <EmptyTitle>Select a speaker</EmptyTitle>
                      <EmptyDescription>
                        Select a speaker to see profile and delivery details.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </div>
            </CardContent>
          </Card>

          <Collapsible open={showCsv} onOpenChange={setShowCsv} className={styles.importDetails}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" type="button">
                <FileText data-icon="inline-start" />
                {showCsv ? "Hide CSV import" : "Import CSV"}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className={styles.importBody}>
              <Card aria-busy={importBusy}>
                <CardHeader>
                  <CardTitle>Import speaker roster</CardTitle>
                  <CardDescription>
                    Preview validation before committing rows. Invalid rows are never written to
                    this event.
                  </CardDescription>
                </CardHeader>
                <CardContent className={styles.actionsStack}>
                  <Field>
                    <FieldLabel htmlFor="speaker-csv">Speakers CSV</FieldLabel>
                    <Input
                      id="speaker-csv"
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(event) => void previewCsv(event)}
                      disabled={importCommitBusy || api === null}
                    />
                  </Field>
                  {importFileName ? (
                    <p className={styles.muted}>
                      Selected file: <strong>{importFileName}</strong>
                    </p>
                  ) : null}
                  {importBusy ? <FormMessage message="Validating CSV…" /> : null}
                  {importPreview ? (
                    <div className={styles.actionsStack}>
                      <div className={styles.actions}>
                        <Badge variant="secondary">{importPreview.validRows.length} valid</Badge>
                        <Badge variant="destructive">
                          {importPreview.invalidRows.length} invalid
                        </Badge>
                      </div>
                      {importPreview.invalidRows.length > 0 ? (
                        <ul className={styles.list} aria-label="CSV validation errors">
                          {importPreview.invalidRows.map((issue) => (
                            <li key={`${issue.rowNumber}-${issue.field ?? "row"}-${issue.message}`}>
                              Row {issue.rowNumber}
                              {issue.field ? ` · ${issue.field}` : ""}: {issue.message}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className={styles.muted}>
                          All previewed rows passed required identity validation.
                        </p>
                      )}
                      <Button
                        variant="default"
                        type="button"
                        onClick={() => void commitCsv()}
                        disabled={
                          importCommitBusy ||
                          importPreviewBusy ||
                          importPreview.validRows.length === 0 ||
                          api === null
                        }
                      >
                        <Upload data-icon="inline-start" />
                        {importCommitBusy
                          ? "Importing…"
                          : `Commit ${importPreview.validRows.length} valid row${importPreview.validRows.length === 1 ? "" : "s"}`}
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>

          <Sheet open={showSpeakerSheet} onOpenChange={setShowSpeakerSheet}>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>
                  {selectedSpeaker ? `${selectedSpeaker.displayName} context` : "Speaker context"}
                </SheetTitle>
                <SheetDescription>
                  The full profile remains adjacent to the roster. This drawer provides a compact
                  delivery summary.
                </SheetDescription>
              </SheetHeader>
              {selectedSpeaker ? (
                <div className={styles.sheetBody}>
                  <Badge variant="outline">{statusLabel(selectedSpeaker.status)}</Badge>
                  <p className={styles.muted}>{selectedSpeaker.email}</p>
                  <h3 className={styles.subheading}>Sessions</h3>
                  <ul className={styles.list}>
                    {selectedSpeaker.sessions.length === 0 ? (
                      <li className={styles.muted}>No sessions linked.</li>
                    ) : (
                      selectedSpeaker.sessions.map((session) => (
                        <li key={session.submissionId}>
                          <strong>{session.title}</strong> · {statusLabel(session.status)}
                        </li>
                      ))
                    )}
                  </ul>
                  <h3 className={styles.subheading}>Deliverables</h3>
                  <p className={styles.muted}>{selectedSpeaker.assets.length} uploaded file(s).</p>
                </div>
              ) : null}
            </SheetContent>
          </Sheet>
        </TabsContent>

        <TabsContent
          value="tasks"
          id="tasks-view"
          aria-labelledby="tasks-tab"
          className={styles.view}
        >
          <Card className={styles.panel}>
            <CardHeader className={styles.panelHeader}>
              <div>
                <CardTitle id="tasks-heading">Tasks</CardTitle>
                <CardDescription>
                  Create general mark-complete tasks and review API-backed onboarding progress in
                  one place.
                </CardDescription>
              </div>
              <Badge variant="outline">
                {onboardingTaskDefinitions.length} / {MAX_ORGANIZER_ONBOARDING_TASKS} task
                definitions
              </Badge>
            </CardHeader>
            <CardContent className={styles.actionsStack}>
              {!progressSectionVisible ? (
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setVisibleProgressContext(secondaryContextKey)}
                  disabled={api === null || loading || roster === null}
                >
                  <RefreshCw data-icon="inline-start" />
                  Load task progress
                </Button>
              ) : progress === null && progressError === null ? (
                <FormMessage message="Loading task progress…" />
              ) : null}
              <form className={styles.actionsStack} onSubmit={(event) => void assignTask(event)}>
                <div className={styles.fieldGrid}>
                  <Field>
                    <FieldLabel htmlFor="task-title">Task title</FieldLabel>
                    <Input
                      id="task-title"
                      value={taskTitle}
                      onChange={(event) => setTaskTitle(event.target.value)}
                      placeholder="Confirm participation"
                      required
                      disabled={taskBusy}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="task-due-date">Due date</FieldLabel>
                    <Input
                      id="task-due-date"
                      type="date"
                      value={taskDueAt}
                      onChange={(event) => setTaskDueAt(event.target.value)}
                      required
                      disabled={taskBusy}
                    />
                  </Field>
                </div>
                <FieldSet className={styles.detailBlock}>
                  <FieldLegend variant="label">Assign to speakers</FieldLegend>
                  {speakers.length === 0 ? (
                    <Empty>
                      <EmptyTitle>Add speakers first</EmptyTitle>
                      <EmptyDescription>Add speakers before assigning a task.</EmptyDescription>
                    </Empty>
                  ) : (
                    <div className={styles.checkboxGrid}>
                      {speakers.map((speaker) => (
                        <Field
                          key={speaker.participantId}
                          orientation="horizontal"
                          className={styles.checkboxField}
                        >
                          <Checkbox
                            id={`task-assignee-${speaker.participantId}`}
                            aria-label={`Assign task to ${speaker.displayName}`}
                            checked={taskAssignees.includes(speaker.participantId)}
                            onCheckedChange={() => toggleAssignee(speaker.participantId)}
                            disabled={taskBusy}
                          />
                          <FieldLabel htmlFor={`task-assignee-${speaker.participantId}`}>
                            Assign task to {speaker.displayName}
                          </FieldLabel>
                        </Field>
                      ))}
                    </div>
                  )}
                </FieldSet>
                <div className={styles.actions}>
                  <Button
                    variant="default"
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
                    <ListTodo data-icon="inline-start" />
                    {taskBusy
                      ? "Assigning…"
                      : onboardingTaskDefinitions.length >= MAX_ORGANIZER_ONBOARDING_TASKS
                        ? "Three onboarding tasks configured"
                        : "Assign onboarding task"}
                  </Button>
                  <Badge variant="outline">Task type: action / mark complete</Badge>
                </div>
              </form>

              {onboardingTaskDefinitions.length > 0 ? (
                <Table>
                  <TableCaption className={adminStyles.srOnly}>
                    API-loaded organizer onboarding task definitions
                  </TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Assignees</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {onboardingTaskDefinitions.map((definition) => (
                      <TableRow key={definition.definitionId}>
                        <TableHead scope="row">{definition.title}</TableHead>
                        <TableCell>{dateLabel(definition.dueAt)}</TableCell>
                        <TableCell>
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
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </CardContent>
          </Card>

          <Card className={styles.panel}>
            <CardHeader className={styles.panelHeader}>
              <div>
                <CardTitle id="progress-heading">Onboarding progress</CardTitle>
                <CardDescription>
                  List-level general-task completion, including changes speakers make in their
                  portal.
                </CardDescription>
              </div>
              <Field>
                <FieldLabel className={adminStyles.srOnly} htmlFor="task-progress-filter">
                  Filter task progress
                </FieldLabel>
                <Select
                  value={progressFilter}
                  onValueChange={(value) => setProgressFilter(value as ProgressFilter)}
                >
                  <SelectTrigger id="task-progress-filter" aria-label="Filter task progress">
                    <SelectValue placeholder="All progress" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="all">All progress</SelectItem>
                      <SelectItem value="complete">Complete</SelectItem>
                      <SelectItem value="incomplete">Incomplete</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </CardHeader>
            <CardContent>
              {progressError ? (
                <FormMessage message={`Progress unavailable: ${progressError}`} error />
              ) : null}
              {!progressError && progress && progressRows.length === 0 ? (
                <Empty>
                  <EmptyTitle>No progress matches</EmptyTitle>
                  <EmptyDescription>No speakers match this progress filter.</EmptyDescription>
                </Empty>
              ) : null}
              {!progressError && progress && progressRows.length > 0 ? (
                <Table>
                  <TableCaption className={adminStyles.srOnly}>
                    Speaker task completion progress
                  </TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Speaker</TableHead>
                      <TableHead>Tasks and due dates</TableHead>
                      <TableHead>Progress</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {progressRows.map((row) => {
                      const completed = row.tasks.filter((task) =>
                        taskComplete(task.status),
                      ).length;
                      const progressValue =
                        row.tasks.length === 0 ? 0 : (completed / row.tasks.length) * 100;
                      return (
                        <TableRow key={row.participantId}>
                          <TableHead scope="row">{row.displayName}</TableHead>
                          <TableCell>
                            <ul className={styles.list}>
                              {row.tasks.length === 0 ? (
                                <li className={styles.muted}>No general tasks assigned.</li>
                              ) : (
                                row.tasks.map((task) => (
                                  <li key={task.taskId}>
                                    <strong>{task.title}</strong> · {dateLabel(task.dueAt)} ·{" "}
                                    <span
                                      className={taskStatusClassName(task.status)}
                                      data-status={task.status}
                                    >
                                      {taskStatusLabel(task.status)}
                                    </span>
                                  </li>
                                ))
                              )}
                            </ul>
                          </TableCell>
                          <TableCell>
                            <div className={styles.progressCell}>
                              <Progress
                                value={progressValue}
                                aria-label={`${completed} of ${row.tasks.length} tasks complete`}
                              />
                              <span>
                                {completed} / {row.tasks.length} complete
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : null}
            </CardContent>
          </Card>

          <div ref={reminderSectionRef}>
            <Card className={styles.panel}>
              <CardHeader className={styles.panelHeader}>
                <div>
                  <CardTitle id="upcoming-reminders-heading">Upcoming reminders</CardTitle>
                  <CardDescription>
                    Only reminders that are currently eligible for delivery are shown here.
                  </CardDescription>
                </div>
                <Badge variant="outline">
                  {reminderEligibility === null ? "Loading" : `${eligibleReminderItems.length} due`}
                </Badge>
              </CardHeader>
              <CardContent className={styles.actionsStack}>
                {reminderEligibility === null ? (
                  <FormMessage message="Checking upcoming reminders…" />
                ) : eligibleReminderItems.length === 0 ? (
                  <Empty>
                    <EmptyTitle>No eligible reminders</EmptyTitle>
                    <EmptyDescription>
                      Eligible reminders will appear here when their delivery window opens.
                    </EmptyDescription>
                  </Empty>
                ) : (
                  <ul className={styles.list} aria-label="Upcoming reminders">
                    {eligibleReminderItems.map((item) => (
                      <li className={styles.reminderItem} key={item.taskId}>
                        <strong>{item.title}</strong>
                        <span>{dateLabel(item.dueAt)}</span>
                        <Badge variant="secondary">Ready to send</Badge>
                      </li>
                    ))}
                  </ul>
                )}
                {ineligibleReminderItems.length > 0 ? (
                  <Accordion type="single" collapsible defaultValue="">
                    <AccordionItem value="diagnostics">
                      <AccordionTrigger>Reminder diagnostics</AccordionTrigger>
                      <AccordionContent>
                        <p className={styles.muted}>
                          Internal eligibility reasons are available for operators who need to
                          investigate a reminder schedule.
                        </p>
                        <ul className={styles.list}>
                          {ineligibleReminderItems.map((item) => (
                            <li key={item.taskId}>
                              <strong>{item.title}</strong> · {item.reason}
                            </li>
                          ))}
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent
          value="email"
          id="email-view"
          aria-labelledby="email-tab"
          className={styles.view}
        >
          <div ref={emailSectionRef}>
            <Card className={styles.panel} aria-busy={emailAnyBusy}>
              <CardHeader className={styles.panelHeader}>
                <div>
                  <CardTitle id="bulk-email-heading">Speaker email</CardTitle>
                  <CardDescription>
                    Compose an event-scoped message for {selectedSpeakerIds.length} selected speaker
                    {selectedSpeakerIds.length === 1 ? "" : "s"}. Save a draft, preview selected
                    recipients, then confirm the send.
                  </CardDescription>
                </div>
                <Badge variant="outline">Preview required before send</Badge>
              </CardHeader>
              <CardContent className={styles.actionsStack}>
                <div className={styles.emailFlowGrid}>
                  <div className={styles.emailEditor}>
                    <div className={styles.emailTemplateRow}>
                      <Field>
                        <FieldLabel htmlFor="email-template">Template version</FieldLabel>
                        <Select
                          value={
                            emailTemplateId
                              ? `${emailTemplateId}:${emailTemplateVersion ?? ""}`
                              : "new"
                          }
                          onValueChange={(value) => {
                            invalidateEmailPreview();
                            if (value === "new") {
                              setEmailTemplateId("");
                              setEmailCreateTemplateId(null);
                              setEmailTemplateVersion(undefined);
                              return;
                            }
                            const separator = value.lastIndexOf(":");
                            const nextId = separator < 0 ? value : value.slice(0, separator);
                            const rawVersion = separator < 0 ? "" : value.slice(separator + 1);
                            const nextVersion = Number(rawVersion);
                            const template = emailTemplates.find(
                              (candidate) =>
                                candidate.id === nextId && candidate.version === nextVersion,
                            );
                            setEmailTemplateId(nextId);
                            setEmailCreateTemplateId(null);
                            setEmailTemplateVersion(
                              Number.isFinite(nextVersion) ? nextVersion : undefined,
                            );
                            if (template !== undefined) {
                              setEmailTemplateName(template.name);
                              setEmailSubject(template.subject);
                              setEmailHtml(template.html);
                              setEmailText(template.text);
                            }
                          }}
                          disabled={emailSaveBusy}
                        >
                          <SelectTrigger id="email-template">
                            <SelectValue placeholder="New template version" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="new">New template version</SelectItem>
                              {emailTemplates.map((template) => (
                                <SelectItem
                                  key={`${template.id}:${template.version}`}
                                  value={`${template.id}:${template.version}`}
                                >
                                  {template.name} · v{template.version} · {template.status}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                      <div className={styles.emailTemplateMeta} aria-live="polite">
                        <strong>{selectedEmailTemplate?.name ?? emailTemplateName}</strong>
                        <span className={styles.muted}>
                          {emailTemplateId
                            ? `Exact template ${emailTemplateId} · version ${emailTemplateVersion ?? "unsaved"}`
                            : "New draft · save to create an exact server version"}
                        </span>
                        {selectedEmailTemplate ? (
                          <span className={styles.muted}>
                            {statusLabel(selectedEmailTemplate.status)} · Sender{" "}
                            {selectedEmailTemplate.sender}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <Field>
                      <FieldLabel htmlFor="email-template-name">Template name</FieldLabel>
                      <Input
                        id="email-template-name"
                        value={emailTemplateName}
                        onChange={(event) => {
                          setEmailTemplateName(event.target.value);
                          invalidateEmailPreview();
                        }}
                        maxLength={200}
                        disabled={emailSaveBusy}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="email-subject">Subject</FieldLabel>
                      <Input
                        id="email-subject"
                        value={emailSubject}
                        onChange={(event) => {
                          setEmailSubject(event.target.value);
                          invalidateEmailPreview();
                        }}
                        placeholder="Update for {{first_name}}"
                        maxLength={500}
                        disabled={emailSaveBusy}
                      />
                    </Field>

                    <Tabs
                      value={emailEditorMode}
                      onValueChange={(value) =>
                        setEmailEditorMode(value as "visual" | "html" | "text")
                      }
                      className={styles.emailEditorTabs}
                    >
                      <TabsList
                        variant="line"
                        className={styles.emailEditorTabsList}
                        aria-label="Email editor mode"
                      >
                        <TabsTrigger value="visual">Visual preview</TabsTrigger>
                        <TabsTrigger value="html">HTML source</TabsTrigger>
                        <TabsTrigger value="text">Plain text</TabsTrigger>
                      </TabsList>
                      <TabsContent value="visual" className={styles.actionsStack}>
                        <p className={styles.muted}>
                          Visual mode uses the safe server preview. Raw HTML is never executed in
                          this workspace.
                        </p>
                        {emailPreviewCurrent && emailPreview ? (
                          <div className={styles.emailPreviewOutput}>
                            <p className={styles.muted}>Server-rendered text</p>
                            <pre>{emailPreview.text}</pre>
                            <p className={styles.muted}>Escaped HTML output</p>
                            <pre>{emailPreview.html}</pre>
                          </div>
                        ) : (
                          <p className={styles.muted} role="status">
                            Preview selected recipients to see the server-rendered result.
                          </p>
                        )}
                      </TabsContent>
                      <TabsContent value="html">
                        <Field>
                          <FieldLabel htmlFor="email-html">HTML source</FieldLabel>
                          <Textarea
                            id="email-html"
                            value={emailHtml}
                            onChange={(event) => {
                              setEmailHtml(event.target.value);
                              invalidateEmailPreview();
                            }}
                            maxLength={100_000}
                            disabled={emailSaveBusy}
                          />
                        </Field>
                      </TabsContent>
                      <TabsContent value="text">
                        <Field>
                          <FieldLabel htmlFor="email-text">Plain text body</FieldLabel>
                          <Textarea
                            id="email-text"
                            value={emailText}
                            onChange={(event) => {
                              setEmailText(event.target.value);
                              invalidateEmailPreview();
                            }}
                            maxLength={100_000}
                            disabled={emailSaveBusy}
                          />
                        </Field>
                      </TabsContent>
                    </Tabs>

                    <p className={styles.muted}>
                      Merge variables are resolved by the server:{" "}
                      <code className={styles.code}>{"{{first_name}}"}</code>,{" "}
                      <code className={styles.code}>{"{{display_name}}"}</code>,{" "}
                      <code className={styles.code}>{"{{email}}"}</code>.
                    </p>
                  </div>

                  <Card
                    size="sm"
                    className={styles.emailPreviewPanel}
                    aria-label="Selected speaker email preview"
                  >
                    <CardHeader>
                      <CardTitle>Preview selected recipients</CardTitle>
                      <CardDescription>
                        Exact server result; this panel never executes template HTML.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className={styles.actionsStack}>
                      {emailPreviewCurrent && emailPreview ? (
                        <>
                          <p className={styles.muted}>
                            {emailPreview.recipientIds.length} recipient
                            {emailPreview.recipientIds.length === 1 ? "" : "s"} · exact template{" "}
                            {emailPreview.templateId} · version {emailPreview.templateVersion}
                          </p>
                          <p>
                            <strong>Subject:</strong> {emailPreview.subject}
                          </p>
                          <ul
                            className={styles.list}
                            aria-label="Speaker email preview recipient names"
                          >
                            {emailPreview.recipients.map((recipient) => (
                              <li key={recipient.participantId}>
                                <strong>{recipient.displayName}</strong> · {recipient.email}
                              </li>
                            ))}
                          </ul>
                          <div className={styles.emailPreviewOutput}>
                            <p className={styles.muted}>Server-rendered text</p>
                            <pre>{emailPreview.text}</pre>
                            <p className={styles.muted}>Escaped HTML output</p>
                            <pre>{emailPreview.html}</pre>
                          </div>
                        </>
                      ) : (
                        <p className={styles.muted} role="status">
                          No current preview. Select recipients and preview before confirming a
                          send.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
              <CardFooter className={styles.actions}>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => void saveEmailTemplate()}
                  disabled={emailSaveBusy || api === null}
                >
                  <CheckCircle2 data-icon="inline-start" />
                  {emailSaveBusy ? "Saving…" : "Save draft"}
                </Button>
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => void previewBulkEmail()}
                  disabled={emailPreviewBusy || api === null || selectedSpeakerIds.length === 0}
                >
                  <Eye data-icon="inline-start" />
                  {emailPreviewBusy ? "Preparing…" : "Preview selected recipients"}
                </Button>
                <Button
                  variant="default"
                  type="button"
                  onClick={() => setEmailConfirmOpen(true)}
                  disabled={emailSendBusy || api === null || !emailPreviewCurrent}
                >
                  <Send data-icon="inline-start" />
                  {emailSendBusy ? "Queueing…" : "Confirm send"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => void refreshEmailHistory()}
                  disabled={emailHistoryBusy || api === null}
                  aria-label="Refresh speaker email history"
                >
                  <RefreshCw data-icon="inline-start" />
                  {emailHistoryBusy ? "Refreshing history…" : "Refresh history"}
                </Button>
              </CardFooter>
              <CardContent className={styles.actionsStack}>
                {emailNotice ? (
                  <FormMessage
                    message={emailNotice}
                    error={emailNotice.includes("unavailable") || emailNotice.includes("could")}
                  />
                ) : null}
                <Card size="sm" className={styles.emailHistory}>
                  <CardHeader>
                    <CardTitle>Email send history</CardTitle>
                    <CardDescription>
                      Completed send records stay here when you start a new draft or preview.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {emailSends.length === 0 ? (
                      <p className={styles.muted} role="status">
                        No email sends recorded for this event.
                      </p>
                    ) : (
                      <Table>
                        <TableCaption className={adminStyles.srOnly}>
                          Speaker email send history
                        </TableCaption>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Status</TableHead>
                            <TableHead>Template</TableHead>
                            <TableHead>Recipients</TableHead>
                            <TableHead>Updated</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {emailSends.map((send) => (
                            <TableRow key={send.id}>
                              <TableCell>
                                <Badge variant="outline">{send.status}</Badge>
                              </TableCell>
                              <TableCell>
                                {send.templateId} · v{send.templateVersion}
                              </TableCell>
                              <TableCell>{send.recipientIds.length}</TableCell>
                              <TableCell>{dateLabel(send.updatedAt)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </CardContent>
            </Card>

            <AlertDialog open={emailConfirmOpen} onOpenChange={setEmailConfirmOpen}>
              <AlertDialogContent className={styles.dialogContent}>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirm speaker email send</AlertDialogTitle>
                  <AlertDialogDescription>
                    Queue the current server preview for {emailPreview?.recipientIds.length ?? 0}{" "}
                    selected recipient
                    {(emailPreview?.recipientIds.length ?? 0) === 1 ? "" : "s"} using exact template
                    version {emailPreview?.templateVersion ?? "unavailable"}. This action uses the
                    current idempotency key and cannot be edited after queueing.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={emailSendBusy}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={emailSendBusy || !emailPreviewCurrent}
                    onClick={() => void sendBulkEmail()}
                  >
                    {emailSendBusy ? "Queueing…" : "Confirm send"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
