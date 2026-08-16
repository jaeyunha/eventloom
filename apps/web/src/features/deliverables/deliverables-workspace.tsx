"use client";

import { standardFileRequestMimeTypes } from "@eventloom/contracts";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useOrganizerEventId } from "@/features/admin/organizer-event-workspace";
import {
  createDeliverablesApi,
  type DeliverableAsset,
  type DeliverableAssetHistoryEntry,
  type DeliverableAssetKind,
  type DeliverableComment,
  type DeliverableContentHistoryEntry,
  type DeliverableDownloadGrant,
  type DeliverableExportDownload,
  type DeliverableExportInput,
  type DeliverableMatrixItem,
  type DeliverableMatrixStatus,
  type DeliverableReviewInput,
  type DeliverableReviewState,
  type DeliverableSession,
  type DeliverableSpeakerContentHistoryEntry,
  type DeliverableSpeakerContentRecord,
  type DeliverableSpeakerProfile,
  type DeliverablesApi,
  DeliverablesApiError,
  type DeliverableTask,
  type DeliverableTaskInput,
  type DeliverableTaskMatrix,
  deliverableAssetKinds,
} from "./api";
import styles from "./deliverables-workspace.module.css";
import {
  type FileFamilyProjection,
  fileFamilyPointers,
  projectFileFamilies,
} from "./file-family-model";
import { FileLibrary } from "./file-library";
import { FileReviewDrawer } from "./file-review-drawer";

const pageClass = styles.workspace;
const sectionClass = styles.section;
const fieldClass = styles.field;
const mutedClass = styles.muted;
const stackClass = styles.stack;
const clusterClass = styles.cluster;
const gridClass = styles.grid;
const dangerClass = styles.danger;
const tableWrapClass = styles.tableWrap;
const statusClass = styles.status;

export type DeliverablesWorkspaceMode = "deliverables" | "files";

export type DeliverablesExportUiStatus =
  | "idle"
  | "queued"
  | "preparing"
  | "generating"
  | "ready"
  | "download-started"
  | "failure";
export const deliverablesExportStatusLabels: Readonly<Record<DeliverablesExportUiStatus, string>> =
  {
    idle: "",
    queued: "The browser queued the authorized ZIP request.",
    preparing: "The browser is preparing the scoped export request.",
    generating:
      "The export request is generating no fabricated progress; the API exposes no server job ID.",
    ready: "The server returned a ZIP with a validated authoritative manifest.",
    "download-started": "The browser download has started.",
    failure: "The authorized ZIP request failed.",
  };
export const deliverablesExportActionLabels: Readonly<Record<DeliverablesExportUiStatus, string>> =
  {
    idle: "Download selected files ZIP",
    queued: "ZIP export queued",
    preparing: "Preparing ZIP…",
    generating: "Generating ZIP…",
    ready: "Inspect authoritative manifest",
    "download-started": "Download started",
    failure: "Retry ZIP export",
  };

export type DeliverablesOperationKey =
  | "task-create"
  | "asset-comment"
  | "asset-download"
  | "asset-review"
  | "reminder-send"
  | "biography-save"
  | "speaker-content-restore"
  | "headshot-replace"
  | "deliverables-export"
  | "files-export";
export type DeliverablesOperationPhase = "pending" | "succeeded" | "failed";
export interface DeliverablesOperationState {
  readonly key: DeliverablesOperationKey;
  readonly label: string;
  readonly phase: DeliverablesOperationPhase;
  readonly message: string;
}

export type DeliverableSpeakerContentHistoryStatus = "loading" | "empty" | "success" | "error";

export interface DeliverableSpeakerContentHistoryState {
  readonly status: DeliverableSpeakerContentHistoryStatus;
  readonly entries: readonly DeliverableSpeakerContentHistoryEntry[];
  readonly error?: string;
}

export interface DeliverablesSnapshot {
  readonly sessions: readonly DeliverableSession[];
  readonly tasks: readonly DeliverableTask[];
  readonly assets: readonly DeliverableAsset[];
  readonly profiles: readonly DeliverableSpeakerProfile[];
  readonly matrix?: DeliverableTaskMatrix;
  readonly speakerContentHistory?: Readonly<Record<string, DeliverableSpeakerContentHistoryState>>;
}

export interface DeliverablesWorkspaceProps {
  readonly eventId: string;
  readonly organizationId: string;
  readonly mode?: DeliverablesWorkspaceMode;
  readonly api?: DeliverablesApi;
  readonly initialData?: DeliverablesSnapshot;
}

export interface DeliverableRow {
  readonly task: DeliverableTask;
  readonly session: DeliverableSession | undefined;
  readonly sessionLabel: string;
  readonly speaker: DeliverableSpeakerProfile | undefined;
  readonly speakerLabel: string;
  readonly assets: readonly DeliverableAsset[];
  readonly currentAsset: DeliverableAsset | undefined;
  readonly status: DeliverableMatrixStatus;
}

export interface DeliverablesWorkspaceViewProps {
  readonly eventId: string;
  readonly organizationId: string;
  readonly mode?: DeliverablesWorkspaceMode;
  readonly sessions: readonly DeliverableSession[];
  readonly tasks: readonly DeliverableTask[];
  readonly assets: readonly DeliverableAsset[];
  readonly profiles: readonly DeliverableSpeakerProfile[];
  readonly speakerContentHistory?: Readonly<Record<string, DeliverableSpeakerContentHistoryState>>;
  readonly matrixItems?: readonly DeliverableMatrixItem[];
  readonly loading?: boolean;
  readonly busy?: boolean;
  readonly error?: string | null;
  readonly statusMessage?: string | null;
  readonly capabilityMessages?: readonly string[];
  readonly operationStates?: readonly DeliverablesOperationState[];
  readonly selectedSessionId?: string;
  readonly sessionHistory?: readonly DeliverableContentHistoryEntry[];
  readonly sessionHistoryError?: string | null;
  readonly onSelectSession?: (sessionId: string) => void;
  readonly onCreateTask?: (input: DeliverableTaskInput) => Promise<void>;
  readonly onInspectAsset?: (assetId: string) => void;
  readonly onCloseAsset?: () => void;
  readonly selectedAssetId?: string | null;
  readonly assetHistory?: readonly DeliverableAssetHistoryEntry[];
  readonly comments?: readonly DeliverableComment[];
  readonly loadingAssetDetails?: boolean;
  readonly assetHistoryError?: string | null;
  readonly commentsError?: string | null;
  readonly loadingSessionHistories?: boolean;
  readonly onAddComment?: (input: {
    readonly assetId: string;
    readonly body: string;
    readonly expectedVersion: number;
  }) => Promise<void>;
  readonly onDownloadVersion?: (assetId: string) => Promise<void>;
  readonly onExportDeliverables?: (input: DeliverableExportInput) => Promise<void>;
  readonly onExportFiles?: (
    input: DeliverableExportInput,
  ) => Promise<DeliverableExportDownload | undefined>;
  readonly onReviewAsset?: (input: DeliverableReviewInput) => Promise<void>;
  readonly onSendBulkReminder?: (input: {
    readonly taskIds: readonly string[];
    readonly recipientIds: readonly string[];
  }) => Promise<void>;
  readonly onSaveSession?: (input: {
    readonly sessionId: string;
    readonly expectedVersion: number;
    readonly title: string;
    readonly description: string;
  }) => Promise<void>;
  readonly onApproveSession?: (
    session: DeliverableSession,
    contentStatus: "Approved" | "Needs changes",
  ) => Promise<void>;
  readonly onRestoreSessionVersion?: (input: {
    readonly sessionId: string;
    readonly version: number;
    readonly expectedVersion: number;
  }) => Promise<void>;
  readonly onRestoreSpeakerContentVersion?: (input: {
    readonly participantId: string;
    readonly version: number;
    readonly expectedVersion: number;
  }) => Promise<void>;
  readonly onSaveBiography?: (input: {
    readonly participantId: string;
    readonly biography: string;
    readonly expectedVersion: number;
  }) => Promise<void>;
  readonly onReplaceHeadshot?: (input: {
    readonly submissionId: string;
    readonly participantId: string;
    readonly file: File;
    readonly supersedesAssetId?: string;
  }) => Promise<void>;
  readonly onRetry?: () => void;
}

function formatTime(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) return "Not recorded";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : value;
}

function formatDate(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) return "No due date";
  const parsed = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString() : value;
}

function formatStatus(status: string): string {
  return status.replace(/[_-]+/gu, " ").replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function compareSpeakerContentHistoryEntries(
  left: DeliverableSpeakerContentHistoryEntry,
  right: DeliverableSpeakerContentHistoryEntry,
): number {
  return (
    left.version - right.version ||
    left.occurredAt.localeCompare(right.occurredAt) ||
    left.id.localeCompare(right.id)
  );
}

function sortedSpeakerContentHistory(
  entries: readonly DeliverableSpeakerContentHistoryEntry[],
): readonly DeliverableSpeakerContentHistoryEntry[] {
  return [...entries].sort(compareSpeakerContentHistoryEntries);
}

function speakerContentHistoryLoading(): DeliverableSpeakerContentHistoryState {
  return { status: "loading", entries: [] };
}

function speakerContentHistoryEmpty(): DeliverableSpeakerContentHistoryState {
  return { status: "empty", entries: [] };
}

function speakerContentHistorySuccess(
  entries: readonly DeliverableSpeakerContentHistoryEntry[],
): DeliverableSpeakerContentHistoryState {
  const sorted = sortedSpeakerContentHistory(entries);
  return sorted.length === 0
    ? speakerContentHistoryEmpty()
    : { status: "success", entries: sorted };
}

function speakerContentHistoryError(reason: unknown): DeliverableSpeakerContentHistoryState {
  return {
    status: "error",
    entries: [],
    error: messageFromError(reason),
  };
}
function speakerContentHistoryStatesForProfiles(
  profiles: readonly DeliverableSpeakerProfile[],
  provided: Readonly<Record<string, DeliverableSpeakerContentHistoryState>> | undefined,
): Readonly<Record<string, DeliverableSpeakerContentHistoryState>> {
  return Object.fromEntries(
    profiles.map((profile) => [
      profile.participantId,
      provided?.[profile.participantId] ?? speakerContentHistoryEmpty(),
    ]),
  );
}
function profileWithSpeakerContentRecord(
  profile: DeliverableSpeakerProfile,
  content: DeliverableSpeakerContentRecord,
): DeliverableSpeakerProfile {
  const {
    socialLinks: _socialLinks,
    social: _social,
    status: _status,
    headshotAssetId: _headshotAssetId,
    ...profileWithoutContent
  } = profile;
  return {
    ...profileWithoutContent,
    biography: content.biography ?? "",
    ...(content.socialLinks === undefined ? {} : { socialLinks: content.socialLinks }),
    ...(content.status === undefined ? {} : { status: content.status }),
    ...(content.headshotAssetId === undefined || content.headshotAssetId === null
      ? {}
      : { headshotAssetId: content.headshotAssetId }),
    version: content.version,
    updatedAt: content.updatedAt,
  };
}

function statusForTask(
  task: DeliverableTask,
  assets: readonly DeliverableAsset[],
): DeliverableMatrixStatus {
  const latest = assets.find((asset) => isCurrentAsset(asset, assets));
  if (latest?.reviewState === "needs_changes") return "needs_changes";
  if (latest?.state === "ready") {
    return task.status === "completed" || task.status === "waived" ? task.status : "uploaded";
  }
  return task.status;
}

function isOutstanding(status: DeliverableMatrixStatus): boolean {
  return !["completed", "waived", "uploaded"].includes(status);
}

export type ContentRequestStatusFilter =
  | "all"
  | "outstanding"
  | "attention"
  | "review"
  | "complete"
  | DeliverableMatrixStatus;

export interface ContentRequestFilters {
  readonly query: string;
  readonly speakerId: string;
  readonly sessionId: string;
  readonly taskId: string;
  readonly status: ContentRequestStatusFilter;
}

export interface ContentRequestMetrics {
  readonly all: number;
  readonly outstanding: number;
  readonly attention: number;
  readonly review: number;
  readonly complete: number;
}

function statusMatches(status: DeliverableMatrixStatus, filter: string): boolean {
  if (filter === "all") return true;
  if (filter === "pending" || filter === "incomplete" || filter === "outstanding") {
    return isOutstanding(status);
  }
  if (filter === "attention") return status === "overdue" || status === "needs_changes";
  if (filter === "review") return status === "submitted" || status === "uploaded";
  if (filter === "complete") return status === "completed" || status === "waived";
  if (filter === "uploaded") return ["uploaded", "completed", "waived"].includes(status);
  return status === filter;
}

export function contentRequestMetrics(rows: readonly DeliverableRow[]): ContentRequestMetrics {
  return rows.reduce<ContentRequestMetrics>(
    (metrics, row) => ({
      all: metrics.all + 1,
      outstanding: metrics.outstanding + (isOutstanding(row.status) ? 1 : 0),
      attention:
        metrics.attention + (row.status === "overdue" || row.status === "needs_changes" ? 1 : 0),
      review: metrics.review + (row.status === "submitted" || row.status === "uploaded" ? 1 : 0),
      complete: metrics.complete + (row.status === "completed" || row.status === "waived" ? 1 : 0),
    }),
    { all: 0, outstanding: 0, attention: 0, review: 0, complete: 0 },
  );
}

export function filterContentRequestRows(
  rows: readonly DeliverableRow[],
  filters: ContentRequestFilters,
): readonly DeliverableRow[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return rows.filter((row) => {
    const searchable = [
      row.task.title,
      row.task.description ?? row.task.instructions ?? "",
      row.speakerLabel,
      row.sessionLabel,
      row.currentAsset?.fileName ?? "",
    ]
      .join(" ")
      .toLocaleLowerCase();
    return (
      (query.length === 0 || searchable.includes(query)) &&
      (filters.speakerId === "all" || row.task.participantId === filters.speakerId) &&
      (filters.sessionId === "all" ||
        (row.task.submissionId ?? "participant") === filters.sessionId) &&
      (filters.taskId === "all" || row.task.id === filters.taskId) &&
      statusMatches(row.status, filters.status)
    );
  });
}

function assetFamily(asset: DeliverableAsset): string {
  return `${asset.participantId}\u0000${asset.taskId ?? ""}\u0000${asset.versionFamilyId ?? asset.id}`;
}

function compareAssetVersions(left: DeliverableAsset, right: DeliverableAsset): number {
  return (
    (right.version ?? 0) - (left.version ?? 0) ||
    right.createdAt.localeCompare(left.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

function latestAsset(assets: readonly DeliverableAsset[]): DeliverableAsset | undefined {
  return assets.reduce<DeliverableAsset | undefined>(
    (current, candidate) =>
      current === undefined || compareAssetVersions(candidate, current) < 0 ? candidate : current,
    undefined,
  );
}

function reviewStateForAsset(asset: DeliverableAsset): string {
  if (asset.reviewState !== undefined) return formatStatus(asset.reviewState);
  return asset.state === "ready" ? "Pending review" : formatStatus(asset.state);
}
function authoritativeAssetBadges(
  asset: DeliverableAsset,
  versions: readonly DeliverableAsset[],
): readonly string[] {
  const pointers = fileFamilyPointers(versions);
  return [
    ...(pointers.latest === asset.id ? ["Latest"] : []),
    ...(pointers.current === asset.id ? ["Current"] : []),
    ...(pointers.approved === asset.id ? ["Approved"] : []),
    ...(pointers.released === asset.id ? ["Released"] : []),
  ];
}

export function eligibleSpeakerHeadshotSessions(
  sessions: readonly DeliverableSession[],
  eventId: string,
  participantId: string,
): readonly DeliverableSession[] {
  return sessions.filter(
    (session) =>
      session.eventId === eventId &&
      session.status.trim().toLowerCase() === "accepted" &&
      session.speakerIds.includes(participantId),
  );
}

export function resolveSpeakerHeadshotSubmissionId(
  sessions: readonly DeliverableSession[],
  eventId: string,
  participantId: string,
  requestedSubmissionId: string | null | undefined,
): string | null {
  const eligibleSessions = eligibleSpeakerHeadshotSessions(sessions, eventId, participantId);
  if (eligibleSessions.length === 1) return eligibleSessions.at(0)?.id ?? null;
  return requestedSubmissionId !== null &&
    requestedSubmissionId !== undefined &&
    eligibleSessions.some((session) => session.id === requestedSubmissionId)
    ? requestedSubmissionId
    : null;
}

function isCurrentAsset(asset: DeliverableAsset, assets: readonly DeliverableAsset[]): boolean {
  const family = assetFamily(asset);
  const siblings = assets.filter((candidate) => assetFamily(candidate) === family);
  return latestAsset(siblings)?.id === asset.id;
}

function taskRows(
  tasks: readonly DeliverableTask[],
  sessions: readonly DeliverableSession[],
  assets: readonly DeliverableAsset[],
  profiles: readonly DeliverableSpeakerProfile[],
): readonly DeliverableRow[] {
  const sessionBySubmission = new Map(sessions.map((session) => [session.id, session]));
  const profileByParticipant = new Map(profiles.map((profile) => [profile.participantId, profile]));
  return tasks.map((task) => {
    const session =
      task.submissionId === null ? undefined : sessionBySubmission.get(task.submissionId);
    const sessionLabel = session?.title ?? task.sessionTitle ?? "Session unavailable";
    const speaker = profileByParticipant.get(task.participantId);
    const relatedAssets = assets.filter(
      (asset) =>
        asset.participantId === task.participantId &&
        (asset.taskId === task.id ||
          (asset.taskId === undefined && asset.submissionId === task.submissionId)),
    );
    return {
      task,
      session,
      sessionLabel,
      speaker,
      speakerLabel: task.participantName ?? speaker?.displayName ?? "Speaker",
      assets: relatedAssets,
      currentAsset: relatedAssets.find((asset) => isCurrentAsset(asset, relatedAssets)),
      status: statusForTask(task, relatedAssets),
    };
  });
}

function matrixRows(
  items: readonly DeliverableMatrixItem[],
  sessions: readonly DeliverableSession[],
  profiles: readonly DeliverableSpeakerProfile[],
): readonly DeliverableRow[] {
  const sessionBySubmission = new Map(sessions.map((session) => [session.id, session]));
  const profileByParticipant = new Map(profiles.map((profile) => [profile.participantId, profile]));
  return items.map((item) => {
    const task = item.task;
    const session =
      task.submissionId === null ? undefined : sessionBySubmission.get(task.submissionId);
    const speaker = profileByParticipant.get(item.participantId);
    return {
      task,
      session,
      sessionLabel: session?.title ?? task.sessionTitle ?? "Session unavailable",
      speaker,
      speakerLabel:
        item.participantName ?? task.participantName ?? speaker?.displayName ?? "Speaker",
      assets: item.assets,
      currentAsset: item.currentAsset,
      status: item.status,
    };
  });
}

function messageFromError(error: unknown): string {
  if (error instanceof DeliverablesApiError) {
    if (error.status === 401 || error.status === 403) return `Access denied: ${error.message}`;
    if (error.status === 409 || error.code === "CONFLICT" || error.code === "VERSION_CONFLICT")
      return `This content changed elsewhere. Reload before trying again. ${error.message}`;
    if (error.status === 404) return `Deliverables resource not found: ${error.message}`;
    return error.message;
  }
  return error instanceof Error
    ? error.message
    : "The deliverables request could not be completed.";
}

function safeDownloadUrl(value: string): string | null {
  try {
    const parsed = new URL(
      value,
      typeof window === "undefined" ? "https://invalid.local" : window.location.origin,
    );
    const browserAllowsHttp = typeof window !== "undefined" && window.location.protocol === "http:";
    return parsed.protocol === "https:" || (browserAllowsHttp && parsed.protocol === "http:")
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}
export function triggerDeliverablesDownload(download: DeliverableExportDownload): void {
  if (
    typeof document === "undefined" ||
    typeof URL.createObjectURL !== "function" ||
    typeof URL.revokeObjectURL !== "function"
  ) {
    throw new Error("Deliverables downloads are unavailable in this environment.");
  }
  const objectUrl = URL.createObjectURL(new Blob([download.body], { type: download.contentType }));
  try {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = download.fileName;
    link.rel = "noreferrer";
    link.style.display = "none";
    document.body?.appendChild(link);
    try {
      link.click();
    } finally {
      link.remove();
    }
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

interface DeliverableSubjectParticipant {
  readonly id: string;
  readonly label: string;
  readonly sessions: readonly { readonly id: string; readonly label: string }[];
}

function DeliverablesSummary({
  rows,
  activeFilter,
  onFilter,
  participants,
  busy,
  onCreateTask,
}: {
  readonly rows: readonly DeliverableRow[];
  readonly activeFilter: ContentRequestStatusFilter;
  readonly onFilter: (filter: ContentRequestStatusFilter) => void;
  readonly participants: readonly DeliverableSubjectParticipant[];
  readonly busy: boolean;
  readonly onCreateTask?: (input: DeliverableTaskInput) => Promise<void>;
}) {
  const metrics = contentRequestMetrics(rows);
  const items = [
    ["All requests", metrics.all, "all"],
    ["Outstanding", metrics.outstanding, "outstanding"],
    ["Needs attention", metrics.attention, "attention"],
    ["Ready for review", metrics.review, "review"],
    ["Complete", metrics.complete, "complete"],
  ] as const;

  return (
    <section className={styles.overviewPanel} aria-labelledby="content-requests-overview-heading">
      <div className={styles.overviewHeader}>
        <div>
          <p className={styles.eyebrow}>Collection pulse</p>
          <h2 id="content-requests-overview-heading">Request status</h2>
          <p className={mutedClass}>Use a metric to focus the assignment collection.</p>
        </div>
        <TaskComposer
          participants={participants}
          busy={busy}
          {...(onCreateTask === undefined ? {} : { onCreateTask })}
        />
      </div>
      <div className={styles.summaryGrid}>
        {items.map(([label, value, filter]) => (
          <button
            key={filter}
            type="button"
            className={styles.summaryMetric}
            aria-pressed={activeFilter === filter}
            onClick={() => onFilter(activeFilter === filter && filter !== "all" ? "all" : filter)}
          >
            <strong>{value}</strong>
            <span>{label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function TaskComposer({
  participants,
  busy,
  onCreateTask,
}: Readonly<{
  participants: readonly DeliverableSubjectParticipant[];
  busy: boolean;
  onCreateTask?: (input: DeliverableTaskInput) => Promise<void>;
}>) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [mimeTypes, setMimeTypes] = useState(standardFileRequestMimeTypes.join(", "));
  const [maxSizeMb, setMaxSizeMb] = useState("100");
  const [acceptedAssetKinds, setAcceptedAssetKinds] = useState<readonly DeliverableAssetKind[]>([
    "slides",
  ]);
  const [subjectType, setSubjectType] = useState<"participant" | "session">("session");
  const [assigneeIds, setAssigneeIds] = useState<readonly string[]>([]);
  const [sessionByParticipant, setSessionByParticipant] = useState<
    Readonly<Record<string, string>>
  >({});
  const [formError, setFormError] = useState<string | null>(null);
  const assignmentCount = assigneeIds.length;

  function toggleAssignee(id: string): void {
    setAssigneeIds((current) =>
      current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id],
    );
  }

  function toggleAssetKind(kind: DeliverableAssetKind): void {
    setAcceptedAssetKinds((current) =>
      current.includes(kind)
        ? current.filter((candidate) => candidate !== kind)
        : [...current, kind],
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const normalizedTitle = title.trim();
    const normalizedDescription = description.trim();
    const normalizedDueAt = dueAt.trim();
    const normalizedMimeTypes = mimeTypes
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    const maxSize = Number(maxSizeMb);
    if (
      normalizedTitle.length === 0 ||
      normalizedDescription.length === 0 ||
      normalizedDueAt.length === 0
    ) {
      setFormError("Task name, instructions, and due date are required.");
      return;
    }
    if (normalizedMimeTypes.length === 0 || !Number.isSafeInteger(maxSize) || maxSize <= 0) {
      setFormError("Provide at least one MIME type and a positive maximum size in MB.");
      return;
    }
    if (acceptedAssetKinds.length === 0) {
      setFormError("Choose at least one accepted asset kind.");
      return;
    }
    if (assigneeIds.length === 0) {
      setFormError("Choose at least one speaker assignee.");
      return;
    }
    if (
      subjectType === "session" &&
      assigneeIds.some((participantId) => !sessionByParticipant[participantId])
    ) {
      setFormError("Choose an explicit accepted session for every selected speaker.");
      return;
    }
    if (onCreateTask === undefined) {
      setFormError(
        "Task creation is unavailable because no organizer task endpoint is provisioned.",
      );
      return;
    }
    setFormError(null);
    try {
      await onCreateTask({
        title: normalizedTitle,
        description: normalizedDescription,
        dueAt: normalizedDueAt,
        allowedMimeTypes: normalizedMimeTypes,
        maxSizeBytes: maxSize * 1024 * 1024,
        assignments: assigneeIds.map((participantId) => ({
          participantId,
          submissionId:
            subjectType === "participant" ? null : (sessionByParticipant[participantId] ?? null),
        })),
        acceptedAssetKinds,
      });
    } catch (reason) {
      setFormError(messageFromError(reason));
      return;
    }
    setTitle("");
    setDescription("");
    setDueAt("");
    setMimeTypes(standardFileRequestMimeTypes.join(", "));
    setMaxSizeMb("100");
    setAcceptedAssetKinds(["slides"]);
    setSubjectType("session");
    setAssigneeIds([]);
    setSessionByParticipant({});
    setOpen(false);
  }

  return (
    <div className={styles.createTaskAction}>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button" disabled={onCreateTask === undefined}>
            {onCreateTask === undefined ? "Task creation unavailable" : "New content request"}
          </Button>
        </DialogTrigger>
        <DialogContent className={styles.composerDialog}>
          <DialogHeader>
            <DialogTitle>New content request</DialogTitle>
            <DialogDescription>
              Define the request, file policy, and exact speaker assignments.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void submit(event)} className={styles.composerForm}>
            <section className={styles.composerSection} aria-labelledby="request-section-heading">
              <div className={styles.composerSectionHeading}>
                <span>1</span>
                <div>
                  <h3 id="request-section-heading">Request</h3>
                  <p>Give speakers clear instructions and a deadline.</p>
                </div>
              </div>
              <div className={gridClass}>
                <div className={fieldClass}>
                  <Label htmlFor="task-name">Task name</Label>
                  <Input
                    id="task-name"
                    value={title}
                    onChange={(event) => setTitle(event.currentTarget.value)}
                    placeholder="Upload Session Presentation"
                    required
                  />
                </div>
                <div className={fieldClass}>
                  <Label htmlFor="task-due-date">Due date</Label>
                  <Input
                    id="task-due-date"
                    type="date"
                    value={dueAt}
                    onChange={(event) => setDueAt(event.currentTarget.value)}
                    required
                  />
                </div>
              </div>
              <div className={fieldClass}>
                <Label htmlFor="task-instructions">Instructions</Label>
                <Textarea
                  id="task-instructions"
                  rows={3}
                  value={description}
                  onChange={(event) => setDescription(event.currentTarget.value)}
                  placeholder="Final slide deck as a PDF or PowerPoint file, 16:9 aspect ratio."
                  required
                />
              </div>
            </section>

            <section className={styles.composerSection} aria-labelledby="files-section-heading">
              <div className={styles.composerSectionHeading}>
                <span>2</span>
                <div>
                  <h3 id="files-section-heading">Files</h3>
                  <p>Set the accepted asset kinds, types, and size limit.</p>
                </div>
              </div>
              <fieldset className={styles.fieldset} aria-describedby="asset-kind-help">
                <legend>Accepted asset kinds (required)</legend>
                <div className={styles.optionGrid}>
                  {deliverableAssetKinds.map((kind) => (
                    <div key={kind} className={styles.optionRow}>
                      <Checkbox
                        id={`task-asset-kind-${kind}`}
                        checked={acceptedAssetKinds.includes(kind)}
                        onCheckedChange={() => toggleAssetKind(kind)}
                      />
                      <Label htmlFor={`task-asset-kind-${kind}`}>{formatStatus(kind)}</Label>
                    </div>
                  ))}
                </div>
                <small id="asset-kind-help" className={mutedClass}>
                  Selected:{" "}
                  {acceptedAssetKinds.length === 0
                    ? "None"
                    : acceptedAssetKinds.map(formatStatus).join(", ")}
                  .
                </small>
              </fieldset>
              <div className={gridClass}>
                <div className={fieldClass}>
                  <Label htmlFor="task-mime-types">Allowed MIME types</Label>
                  <Textarea
                    id="task-mime-types"
                    rows={3}
                    value={mimeTypes}
                    onChange={(event) => setMimeTypes(event.currentTarget.value)}
                    aria-describedby="mime-help"
                  />
                  <small id="mime-help" className={mutedClass}>
                    Defaults to PDF, Word, PowerPoint, JPG, PNG, WebP, and plain text.
                  </small>
                </div>
                <div className={fieldClass}>
                  <Label htmlFor="task-max-size-mb">Maximum file size (MB)</Label>
                  <Input
                    id="task-max-size-mb"
                    type="number"
                    min={1}
                    step={1}
                    value={maxSizeMb}
                    onChange={(event) => setMaxSizeMb(event.currentTarget.value)}
                  />
                </div>
              </div>
            </section>

            <section
              className={styles.composerSection}
              aria-labelledby="assignments-section-heading"
            >
              <div className={styles.composerSectionHeading}>
                <span>3</span>
                <div>
                  <h3 id="assignments-section-heading">Assignments</h3>
                  <p>Choose the speakers and the exact subject for each request.</p>
                </div>
              </div>
              <div className={fieldClass}>
                <Label htmlFor="task-subject-type">Request subject</Label>
                <Select
                  value={subjectType}
                  onValueChange={(value) => setSubjectType(value as "participant" | "session")}
                >
                  <SelectTrigger id="task-subject-type" aria-describedby="task-subject-help">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="session">One accepted session per speaker</SelectItem>
                    <SelectItem value="participant">Participant profile (all sessions)</SelectItem>
                  </SelectContent>
                </Select>
                <small id="task-subject-help" className={mutedClass}>
                  Session requests require an explicit accepted session for every assignee.
                </small>
              </div>
              <fieldset className={styles.fieldset}>
                <legend>Assignees and subjects</legend>
                {participants.length === 0 ? (
                  <p className={mutedClass}>
                    No authorized speaker records were returned. Task creation cannot be assigned
                    safely.
                  </p>
                ) : (
                  <div className={styles.assigneeList}>
                    {participants.map((participant) => {
                      const selected = assigneeIds.includes(participant.id);
                      return (
                        <div key={participant.id} className={styles.assigneeRow}>
                          <div className={styles.optionRow}>
                            <Checkbox
                              id={`task-assignee-${participant.id}`}
                              checked={selected}
                              onCheckedChange={() => toggleAssignee(participant.id)}
                            />
                            <Label htmlFor={`task-assignee-${participant.id}`}>
                              {participant.label}
                            </Label>
                            {participant.sessions.length > 1 ? (
                              <Badge variant="outline">
                                {participant.sessions.length} accepted sessions
                              </Badge>
                            ) : null}
                          </div>
                          {selected && subjectType === "session" ? (
                            participant.sessions.length === 0 ? (
                              <Alert variant="destructive">
                                <AlertDescription>
                                  No accepted session is available for this participant.
                                </AlertDescription>
                              </Alert>
                            ) : (
                              <div className={fieldClass}>
                                <Label htmlFor={`task-session-${participant.id}`}>
                                  Accepted session for {participant.label}
                                </Label>
                                <Select
                                  {...(sessionByParticipant[participant.id] === undefined
                                    ? {}
                                    : { value: sessionByParticipant[participant.id] })}
                                  onValueChange={(submissionId) =>
                                    setSessionByParticipant((current) => ({
                                      ...current,
                                      [participant.id]: submissionId,
                                    }))
                                  }
                                >
                                  <SelectTrigger id={`task-session-${participant.id}`}>
                                    <SelectValue placeholder="Choose an accepted session" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {participant.sessions.map((session) => (
                                      <SelectItem key={session.id} value={session.id}>
                                        {session.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </fieldset>
              <div className={styles.assignmentCount} role="status" aria-live="polite">
                <strong>{assignmentCount}</strong> assignment{assignmentCount === 1 ? "" : "s"} will
                be created.
              </div>
            </section>

            {formError !== null ? (
              <Alert variant="destructive">
                <AlertTitle>Request not saved</AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || onCreateTask === undefined}>
                {busy
                  ? "Saving request…"
                  : onCreateTask === undefined
                    ? "Task creation unavailable"
                    : `Create ${assignmentCount} assignment${assignmentCount === 1 ? "" : "s"}`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DeliverablesTable({
  rows,
  selectedTaskIds,
  selectedAssignmentId,
  onToggleTask,
  onSetVisibleSelection,
  onOpenAssignment,
  onPreviewSelectedReminders,
  onPreviewAllReminders,
  filters,
  onFiltersChange,
  busy,
}: Readonly<{
  rows: readonly DeliverableRow[];
  selectedTaskIds: readonly string[];
  selectedAssignmentId: string | null;
  onToggleTask: (taskId: string) => void;
  onSetVisibleSelection: (taskIds: readonly string[]) => void;
  onOpenAssignment: (taskId: string) => void;
  onPreviewSelectedReminders: () => void;
  onPreviewAllReminders: () => void;
  filters: ContentRequestFilters;
  onFiltersChange: (filters: ContentRequestFilters) => void;
  busy: boolean;
}>) {
  const speakers = [
    ...new Map(rows.map((row) => [row.task.participantId, row.speakerLabel])).entries(),
  ].sort((left, right) => left[1].localeCompare(right[1]));
  const sessions = [
    ...new Map(
      rows.map((row) => [row.task.submissionId ?? "participant", row.sessionLabel]),
    ).entries(),
  ].sort((left, right) => left[1].localeCompare(right[1]));
  const tasks = [...new Map(rows.map((row) => [row.task.id, row.task.title])).entries()].sort(
    (left, right) => left[1].localeCompare(right[1]),
  );
  const visibleRows = filterContentRequestRows(rows, filters);
  const visibleOutstandingIds = visibleRows
    .filter((row) => isOutstanding(row.status))
    .map((row) => row.task.id);
  const allOutstandingIds = rows
    .filter((row) => isOutstanding(row.status))
    .map((row) => row.task.id);
  const selectedOutstandingIds = selectedTaskIds.filter((taskId) =>
    allOutstandingIds.includes(taskId),
  );
  const allVisibleSelected =
    visibleOutstandingIds.length > 0 &&
    visibleOutstandingIds.every((taskId) => selectedTaskIds.includes(taskId));
  const someVisibleSelected = visibleOutstandingIds.some((taskId) =>
    selectedTaskIds.includes(taskId),
  );
  const hasActiveFilters =
    filters.query.length > 0 ||
    filters.speakerId !== "all" ||
    filters.sessionId !== "all" ||
    filters.taskId !== "all" ||
    filters.status !== "all";

  return (
    <Card className={sectionClass} aria-labelledby="tracking-heading">
      <CardHeader className={clusterClass}>
        <div>
          <p className={mutedClass}>Speaker follow-up</p>
          <CardTitle id="tracking-heading">Assignments</CardTitle>
          <CardDescription>
            One row per speaker request. Select outstanding rows for reminders or open any
            assignment for detail.
          </CardDescription>
        </div>
        <Badge variant="outline">
          {visibleRows.length} of {rows.length}
        </Badge>
      </CardHeader>
      <CardContent className={stackClass}>
        <fieldset className={styles.collectionToolbar}>
          <legend className="sr-only">Content request filters</legend>
          <div className={styles.searchField}>
            <Label className="sr-only" htmlFor="content-requests-search">
              Search assignments
            </Label>
            <Input
              id="content-requests-search"
              type="search"
              value={filters.query}
              onChange={(event) =>
                onFiltersChange({ ...filters, query: event.currentTarget.value })
              }
              placeholder="Search request, speaker, session, or file"
            />
          </div>
          <Select
            value={filters.status}
            onValueChange={(status) =>
              onFiltersChange({ ...filters, status: status as ContentRequestStatusFilter })
            }
          >
            <SelectTrigger aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="outstanding">Outstanding</SelectItem>
              <SelectItem value="attention">Needs attention</SelectItem>
              <SelectItem value="review">Ready for review</SelectItem>
              <SelectItem value="complete">Complete</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.speakerId}
            onValueChange={(speakerId) => onFiltersChange({ ...filters, speakerId })}
          >
            <SelectTrigger aria-label="Filter by speaker">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All speakers</SelectItem>
              {speakers.map(([id, label]) => (
                <SelectItem key={id} value={id}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.sessionId}
            onValueChange={(sessionId) => onFiltersChange({ ...filters, sessionId })}
          >
            <SelectTrigger aria-label="Filter by session">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sessions</SelectItem>
              {sessions.map(([id, label]) => (
                <SelectItem key={id} value={id}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.taskId}
            onValueChange={(taskId) => onFiltersChange({ ...filters, taskId })}
          >
            <SelectTrigger aria-label="Filter by request">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All requests</SelectItem>
              {tasks.map(([id, label]) => (
                <SelectItem key={id} value={id}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasActiveFilters ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                onFiltersChange({
                  query: "",
                  speakerId: "all",
                  sessionId: "all",
                  taskId: "all",
                  status: "all",
                })
              }
            >
              Clear filters
            </Button>
          ) : null}
        </fieldset>

        {selectedOutstandingIds.length > 0 ? (
          <div className={styles.bulkBar} role="status">
            <strong>
              {selectedOutstandingIds.length} outstanding assignment
              {selectedOutstandingIds.length === 1 ? "" : "s"} selected
            </strong>
            <div className={styles.bulkActions}>
              <Button type="button" onClick={onPreviewSelectedReminders} disabled={busy}>
                Send reminders
              </Button>
              <Button type="button" variant="ghost" onClick={() => onSetVisibleSelection([])}>
                Clear selection
              </Button>
            </div>
          </div>
        ) : (
          <div className={styles.collectionActions}>
            <span className={mutedClass}>
              {allOutstandingIds.length} outstanding assignment
              {allOutstandingIds.length === 1 ? "" : "s"}
            </span>
            <Button
              variant="outline"
              type="button"
              onClick={onPreviewAllReminders}
              disabled={allOutstandingIds.length === 0 || busy}
            >
              Remind all outstanding ({allOutstandingIds.length})
            </Button>
          </div>
        )}

        {visibleRows.length === 0 ? (
          <p className={mutedClass}>No assignments match these filters.</p>
        ) : (
          <div className={`${tableWrapClass} ${styles.assignmentTable}`}>
            <Table>
              <TableCaption>Per-speaker content request assignments and due dates</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">
                    <Checkbox
                      aria-label="Select all visible outstanding assignments"
                      checked={
                        allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false
                      }
                      disabled={visibleOutstandingIds.length === 0}
                      onCheckedChange={(checked) =>
                        onSetVisibleSelection(checked === true ? visibleOutstandingIds : [])
                      }
                    />
                  </TableHead>
                  <TableHead scope="col">Request</TableHead>
                  <TableHead scope="col">Speaker</TableHead>
                  <TableHead scope="col">Session</TableHead>
                  <TableHead scope="col">Due</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col">Current file</TableHead>
                  <TableHead scope="col">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((row) => {
                  const outstanding = isOutstanding(row.status);
                  const versionCount =
                    row.currentAsset === undefined
                      ? 0
                      : row.assets.filter(
                          (asset) =>
                            assetFamily(asset) ===
                            assetFamily(row.currentAsset as DeliverableAsset),
                        ).length;
                  return (
                    <TableRow
                      key={row.task.id}
                      data-selected={selectedAssignmentId === row.task.id || undefined}
                    >
                      <TableCell>
                        <Checkbox
                          id={`content-request-reminder-${row.task.id}`}
                          checked={selectedTaskIds.includes(row.task.id)}
                          disabled={!outstanding}
                          onCheckedChange={() => onToggleTask(row.task.id)}
                        />
                        <Label
                          className="sr-only"
                          htmlFor={`content-request-reminder-${row.task.id}`}
                        >
                          {`Select outstanding assignment: ${row.speakerLabel} ${row.task.title}`}
                        </Label>
                      </TableCell>
                      <TableHead scope="row">
                        <strong>{row.task.title}</strong>
                        <small className={mutedClass}>
                          {row.task.description ??
                            row.task.instructions ??
                            "No instructions returned"}
                        </small>
                      </TableHead>
                      <TableCell>{row.speakerLabel}</TableCell>
                      <TableCell>{row.sessionLabel}</TableCell>
                      <TableCell>{formatDate(row.task.dueAt)}</TableCell>
                      <TableCell>
                        <Badge variant={outstanding ? "secondary" : "outline"}>
                          {formatStatus(row.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {row.currentAsset === undefined ? (
                          <span className={mutedClass}>Waiting for upload</span>
                        ) : (
                          <span>
                            {row.currentAsset.fileName}
                            <small className={mutedClass}>
                              v{row.currentAsset.version ?? 1} · {versionCount} version
                              {versionCount === 1 ? "" : "s"}
                            </small>
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          onClick={() => onOpenAssignment(row.task.id)}
                        >
                          Open request
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ContentRequestInspector({
  row,
  onInspectAsset,
}: Readonly<{
  row: DeliverableRow;
  onInspectAsset?: (assetId: string) => void;
}>) {
  const task = row.task;
  const policy = [
    ...(task.acceptedAssetKinds ?? []).map(formatStatus),
    ...(task.allowedMimeTypes ?? []),
    ...(task.maxBytes === undefined
      ? []
      : [`Maximum ${Math.ceil(task.maxBytes / 1024 / 1024)} MB`]),
  ];
  return (
    <div className={styles.assignmentInspector}>
      <section>
        <div className={styles.inspectorHeading}>
          <div>
            <p className={styles.eyebrow}>Content request</p>
            <h2>{task.title}</h2>
          </div>
          <Badge variant={isOutstanding(row.status) ? "secondary" : "outline"}>
            {formatStatus(row.status)}
          </Badge>
        </div>
        <dl className={styles.inspectorFacts}>
          <div>
            <dt>Speaker</dt>
            <dd>{row.speakerLabel}</dd>
          </div>
          <div>
            <dt>Session</dt>
            <dd>{row.sessionLabel}</dd>
          </div>
          <div>
            <dt>Due</dt>
            <dd>{formatDate(task.dueAt)}</dd>
          </div>
          <div>
            <dt>Scope</dt>
            <dd>
              {task.subject?.type === "participant" ? "Participant profile" : "Accepted session"}
            </dd>
          </div>
        </dl>
      </section>
      <section>
        <h3>Instructions</h3>
        <p>{task.description ?? task.instructions ?? "No instructions were returned."}</p>
      </section>
      <section>
        <h3>File policy</h3>
        {policy.length === 0 ? (
          <p className={mutedClass}>No upload policy was returned.</p>
        ) : (
          <div className={styles.policyList}>
            {policy.map((item) => (
              <Badge key={item} variant="outline">
                {item}
              </Badge>
            ))}
          </div>
        )}
      </section>
      <section>
        <h3>Submission</h3>
        {row.currentAsset === undefined ? (
          <div className={styles.noUploadState}>
            <strong>Waiting for upload</strong>
            <p>The speaker has not submitted a current file for this assignment.</p>
          </div>
        ) : (
          <div className={styles.currentSubmission}>
            <div>
              <strong>{row.currentAsset.fileName}</strong>
              <p>
                Version {row.currentAsset.version ?? 1} · uploaded{" "}
                {formatTime(row.currentAsset.createdAt)} · {reviewStateForAsset(row.currentAsset)}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => onInspectAsset?.(row.currentAsset?.id ?? "")}
              disabled={onInspectAsset === undefined}
            >
              Inspect file versions
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

export function ReminderPreview({
  rows,
  busy,
  onSend,
  sendAvailable,
}: Readonly<{
  rows: readonly DeliverableRow[];
  busy: boolean;
  onSend: () => void;
  sendAvailable: boolean;
}>) {
  const effective = rows.filter((row) => isOutstanding(row.status));
  const recipients = [
    ...new Map(effective.map((row) => [row.task.participantId, row.speakerLabel])).entries(),
  ];
  const snapshotKey = effective
    .map(
      (row) =>
        `${row.task.id}\u0000${row.task.version}\u0000${row.task.participantId}\u0000${row.task.dueAt ?? ""}\u0000${row.status}`,
    )
    .join("\u0001");
  const [confirmedSnapshotKey, setConfirmedSnapshotKey] = useState<string | null>(null);
  const confirmed = confirmedSnapshotKey === snapshotKey;
  return (
    <Card className={sectionClass} aria-labelledby="reminder-preview-heading">
      <CardHeader className={clusterClass}>
        <div>
          <p className={mutedClass}>Human review required</p>
          <CardTitle id="reminder-preview-heading">Reminder recipient preview</CardTitle>
          <CardDescription>
            Only the outstanding assignment snapshot below will be sent. No email is sent until you
            confirm this recipient list.
          </CardDescription>
        </div>
        <div className={styles.previewCounts}>
          <Badge variant="outline">
            {effective.length} assignment{effective.length === 1 ? "" : "s"}
          </Badge>
          <Badge variant="outline">
            {recipients.length} recipient{recipients.length === 1 ? "" : "s"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className={stackClass}>
        {recipients.length === 0 ? (
          <p className={mutedClass}>No outstanding assignments are available for a reminder.</p>
        ) : (
          <div className={tableWrapClass}>
            <Table>
              <TableCaption>Recipient and assignment snapshot</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Recipient</TableHead>
                  <TableHead scope="col">Outstanding assignment</TableHead>
                  <TableHead scope="col">Due date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {effective.map((row) => (
                  <TableRow key={`preview-${row.task.id}`}>
                    <TableHead scope="row">{row.speakerLabel}</TableHead>
                    <TableCell>{row.task.title}</TableCell>
                    <TableCell>{formatDate(row.task.dueAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <div className={clusterClass}>
          <Checkbox
            id="reminder-confirm"
            checked={confirmed}
            disabled={effective.length === 0 || !sendAvailable || busy}
            onCheckedChange={(checked) =>
              setConfirmedSnapshotKey(checked === true ? snapshotKey : null)
            }
          />
          <Label htmlFor="reminder-confirm">
            I confirm this exact outstanding recipient and assignment snapshot.
          </Label>
        </div>
        <div className={clusterClass}>
          <Button
            type="button"
            disabled={busy || !sendAvailable || effective.length === 0 || !confirmed}
            onClick={() => {
              onSend();
              setConfirmedSnapshotKey(null);
            }}
          >
            {busy
              ? "Sending reminders…"
              : sendAvailable
                ? "Confirm and send reminders"
                : "Reminder sending unavailable"}
          </Button>
          {!sendAvailable ? (
            <span className={mutedClass}>
              The transactional reminder endpoint is not provisioned; no send was attempted.
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function AssetDetail({
  asset,
  allAssets,
  history,
  assetHistoryError,
  comments,
  commentsError,
  authoritativeCurrentAssetId,
  matrixAuthoritative,
  loading,
  busy,
  onDownload,
  onAddComment,
  onReview,
  reviewAvailable,
}: Readonly<{
  asset: DeliverableAsset;
  allAssets: readonly DeliverableAsset[];
  history: readonly DeliverableAssetHistoryEntry[];
  readonly assetHistoryError: string | null;
  readonly commentsError: string | null;
  comments: readonly DeliverableComment[];
  authoritativeCurrentAssetId?: string;
  matrixAuthoritative: boolean;
  loading: boolean;
  busy: boolean;
  onDownload?: (assetId: string) => Promise<void>;
  onAddComment?: (body: string, expectedVersion: number) => Promise<void>;
  onReview?: (
    state: DeliverableReviewState,
    note: string | undefined,
    release: boolean,
  ) => Promise<void>;
  reviewAvailable: boolean;
}>) {
  const family = assetFamily(asset);
  const fallbackHistory = allAssets
    .filter((candidate) => assetFamily(candidate) === family)
    .sort((left, right) => (left.version ?? 0) - (right.version ?? 0));
  const scopedHistory = history.filter((candidate) => assetFamily(candidate) === family);
  const versions =
    assetHistoryError === null && scopedHistory.length === 0 ? fallbackHistory : scopedHistory;
  const [commentBody, setCommentBody] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const thread = [...comments]
    .filter(
      (comment) =>
        comment.assetId === asset.id && comment.versionId === (asset.versionId ?? asset.id),
    )
    .sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        (left.version ?? 0) - (right.version ?? 0) ||
        left.id.localeCompare(right.id),
    );
  const pointerBadges = authoritativeAssetBadges(asset, versions);
  const latestCommentVersion = thread.reduce(
    (current, comment) => Math.max(current, comment.version ?? 0),
    0,
  );

  async function submitComment(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const body = commentBody.trim();
    if (body.length === 0) {
      setCommentError("Enter a comment before posting.");
      return;
    }
    setCommentError(null);
    if (onAddComment === undefined) {
      setCommentError(
        "Cross-role comments are unavailable because the private asset comment endpoint is not provisioned.",
      );
      return;
    }
    await onAddComment(body, latestCommentVersion);
    setCommentBody("");
  }

  return (
    <div className={stackClass}>
      <div className={clusterClass}>
        <div>
          <p className={mutedClass}>Private asset review</p>
          <h2 id="asset-detail-heading">{asset.fileName}</h2>
          <p className={mutedClass}>
            {asset.contentType} · {Math.ceil(asset.sizeBytes / 1024)} KB
          </p>
        </div>
        <div className={clusterClass}>
          <Badge variant="outline">Authorized detail</Badge>
          {pointerBadges.map((badge) => (
            <Badge key={badge} variant={badge === "Released" ? "default" : "outline"}>
              {badge}
            </Badge>
          ))}
        </div>
      </div>
      <p className={mutedClass}>
        Asset metadata is immutable. Each version remains independently accessible through a
        short-lived server capability; object keys are never shown here.
      </p>
      <section aria-labelledby="asset-version-history-heading" className={stackClass}>
        <h3 id="asset-version-history-heading">Version history</h3>
        {assetHistoryError !== null ? (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Version history unavailable</AlertTitle>
            <AlertDescription>Version history unavailable: {assetHistoryError}</AlertDescription>
          </Alert>
        ) : versions.length === 0 ? (
          loading ? (
            <p role="status">Loading immutable versions and comments…</p>
          ) : (
            <p className={mutedClass}>No version history was returned.</p>
          )
        ) : (
          <div className={tableWrapClass}>
            <Table>
              <TableCaption>Immutable asset versions</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Version</TableHead>
                  <TableHead scope="col">Uploaded</TableHead>
                  <TableHead scope="col">State</TableHead>
                  <TableHead scope="col">Review state</TableHead>
                  <TableHead scope="col">Authoritative pointers</TableHead>
                  <TableHead scope="col">Download</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {versions.map((version) => {
                  const badges = authoritativeAssetBadges(version, versions);
                  const current =
                    authoritativeCurrentAssetId === undefined
                      ? badges.includes("Current")
                      : version.id === authoritativeCurrentAssetId;
                  return (
                    <TableRow key={version.id}>
                      <TableHead scope="row">v{version.version ?? 1}</TableHead>
                      <TableCell>{formatTime(version.createdAt)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{formatStatus(version.state)}</Badge>
                      </TableCell>
                      <TableCell>{reviewStateForAsset(version)}</TableCell>
                      <TableCell>
                        <div className={clusterClass}>
                          {badges.length === 0
                            ? matrixAuthoritative
                              ? "No pointer"
                              : "Pointer unavailable"
                            : badges.map((badge) => (
                                <Badge
                                  key={badge}
                                  variant={badge === "Released" ? "default" : "outline"}
                                >
                                  {badge}
                                </Badge>
                              ))}
                          {current && !badges.includes("Current") ? (
                            <Badge variant="outline">Current</Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          disabled={busy || onDownload === undefined}
                          onClick={() =>
                            onDownload === undefined ? undefined : void onDownload(version.id)
                          }
                        >
                          {onDownload === undefined ? "Download unavailable" : "Download version"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
      <section aria-labelledby="asset-comments-heading" className={stackClass}>
        <h3 id="asset-comments-heading">Version-specific comments</h3>
        <p className={mutedClass}>
          Replies below belong only to immutable asset v{asset.version ?? 1} ({asset.id}). Selecting
          another version loads its separate thread.
        </p>
        {commentsError !== null ? (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Comments unavailable</AlertTitle>
            <AlertDescription>{commentsError}</AlertDescription>
          </Alert>
        ) : thread.length === 0 ? (
          loading ? (
            <p role="status">Loading comments…</p>
          ) : (
            <p className={mutedClass}>No comments have been returned for this asset version.</p>
          )
        ) : (
          <ol aria-label={`Comments for asset version ${asset.id}`}>
            {thread.map((comment) => (
              <li key={comment.id}>
                <strong>{comment.authorLabel}</strong> ·{" "}
                <time dateTime={comment.createdAt}>{formatTime(comment.createdAt)}</time>
                <p>{comment.body}</p>
              </li>
            ))}
          </ol>
        )}
        <form onSubmit={(event) => void submitComment(event)} className={stackClass}>
          <div className={fieldClass}>
            <Label htmlFor="asset-comment-body">Reply to asset v{asset.version ?? 1}</Label>
            <Textarea
              id="asset-comment-body"
              rows={3}
              value={commentBody}
              onChange={(event) => setCommentBody(event.currentTarget.value)}
              placeholder="Reply to the speaker…"
            />
          </div>
          {commentError !== null ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{commentError}</AlertDescription>
            </Alert>
          ) : null}
          <Button variant="outline" type="submit" disabled={busy || onAddComment === undefined}>
            {onAddComment === undefined ? "Comments unavailable" : "Post organizer reply"}
          </Button>
        </form>
      </section>
      <section aria-labelledby="asset-review-heading" className={stackClass}>
        <h3 id="asset-review-heading">Review decision</h3>
        {reviewAvailable ? (
          <>
            <div className={fieldClass}>
              <Label htmlFor="asset-review-note">Review note (optional)</Label>
              <Textarea
                id="asset-review-note"
                rows={2}
                value={reviewNote}
                onChange={(event) => setReviewNote(event.currentTarget.value)}
              />
            </div>
            <p className={mutedClass}>
              Approve records this exact version as approved. Approve and release additionally moves
              the authoritative released pointer to this version.
            </p>
            <div className={clusterClass}>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" disabled={busy}>
                    Approve
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirm asset approval</AlertDialogTitle>
                    <AlertDialogDescription>
                      Approve this exact asset version? This records the review decision and does
                      not publish the file immediately.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        void onReview?.("approved", reviewNote.trim() || undefined, false)
                      }
                    >
                      Confirm approval
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" type="button" disabled={busy}>
                    Approve and release
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirm asset release</AlertDialogTitle>
                    <AlertDialogDescription>
                      Approve and release this exact asset version? This changes the authoritative
                      approved and released pointers.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        void onReview?.("approved", reviewNote.trim() || undefined, true)
                      }
                    >
                      Confirm release
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button
                variant="outline"
                type="button"
                disabled={busy}
                onClick={() =>
                  onReview === undefined
                    ? undefined
                    : void onReview("needs_changes", reviewNote.trim() || undefined, false)
                }
              >
                Needs changes
              </Button>
            </div>
          </>
        ) : (
          <p className={mutedClass}>
            Organizer asset approval is unavailable because the private asset API exposes no review
            endpoint. No decision was fabricated.
          </p>
        )}
      </section>
    </div>
  );
}

function SessionEditor(
  props: Readonly<{
    readonly organizationId: string;
    readonly eventId: string;
    readonly sessions: readonly DeliverableSession[];
    readonly loadingHistory: boolean;
    readonly busy: boolean;
    readonly onSave?: (input: {
      readonly sessionId: string;
      readonly expectedVersion: number;
      readonly title: string;
      readonly description: string;
    }) => Promise<void>;
    readonly selectedSessionId?: string;
    readonly sessionHistory?: readonly DeliverableContentHistoryEntry[];
    readonly sessionHistoryError?: string | null;
    readonly onSelectSession?: (sessionId: string) => void;
    readonly onApprove?: (
      session: DeliverableSession,
      contentStatus: "Approved" | "Needs changes",
    ) => Promise<void>;
    readonly onRestore?: (input: {
      readonly sessionId: string;
      readonly version: number;
      readonly expectedVersion: number;
    }) => Promise<void>;
  }>,
) {
  const selectedSessionId = props.selectedSessionId ?? props.sessions[0]?.id;
  const href = `/admin/organizations/${encodeURIComponent(
    props.organizationId,
  )}/events/${encodeURIComponent(props.eventId)}/sessions${
    selectedSessionId === undefined ? "" : `?session=${encodeURIComponent(selectedSessionId)}`
  }`;

  return (
    <Card className={styles.contentCard} aria-labelledby="session-content-heading">
      <CardHeader>
        <CardTitle id="session-content-heading">Session content lives in Sessions</CardTitle>
        <CardDescription>
          Edit titles and abstracts, review attributed history, restore prior versions, and approve
          public content from the canonical session record.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <Link href={href}>Open Sessions</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function SpeakerEditor(
  props: Readonly<{
    readonly organizationId: string;
    readonly eventId: string;
    readonly sessions: readonly DeliverableSession[];
    readonly profiles: readonly DeliverableSpeakerProfile[];
    readonly assets: readonly DeliverableAsset[];
    readonly busy: boolean;
    readonly speakerContentHistory?: Readonly<
      Record<string, DeliverableSpeakerContentHistoryState>
    >;
    readonly onSaveBiography?: (input: {
      readonly participantId: string;
      readonly biography: string;
      readonly expectedVersion: number;
    }) => Promise<void>;
    readonly onReplaceHeadshot?: (input: {
      readonly submissionId: string;
      readonly participantId: string;
      readonly file: File;
      readonly supersedesAssetId?: string;
    }) => Promise<void>;
    readonly onRestoreSpeakerContentVersion?: (input: {
      readonly participantId: string;
      readonly version: number;
      readonly expectedVersion: number;
    }) => Promise<void>;
  }>,
) {
  const href = `/admin/organizations/${encodeURIComponent(
    props.organizationId,
  )}/events/${encodeURIComponent(props.eventId)}/speakers`;

  return (
    <Card className={styles.contentCard} aria-labelledby="speaker-content-heading">
      <CardHeader>
        <CardTitle id="speaker-content-heading">Speaker profiles live in Speakers</CardTitle>
        <CardDescription>
          Manage event biographies, selected headshots, onboarding, and speaker-specific
          communication from the canonical speaker record.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <Link href={href}>Open Speakers</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function DeliverablesWorkspaceView({
  eventId,
  organizationId,
  mode = "deliverables",
  sessions,
  tasks,
  assets,
  profiles,
  speakerContentHistory,
  matrixItems,
  loading = false,
  busy = false,
  error = null,
  statusMessage = null,
  capabilityMessages = [],
  operationStates = [],
  onCreateTask,
  onInspectAsset,
  onCloseAsset,
  selectedAssetId = null,
  selectedSessionId,
  sessionHistory,
  sessionHistoryError,
  onSelectSession,
  assetHistory = [],
  comments = [],
  loadingAssetDetails = false,
  assetHistoryError,
  commentsError,
  loadingSessionHistories = false,
  onAddComment,
  onDownloadVersion,
  onReviewAsset,
  onExportFiles,
  onSendBulkReminder,
  onSaveSession,
  onApproveSession,
  onRestoreSessionVersion,
  onRestoreSpeakerContentVersion,
  onSaveBiography,
  onReplaceHeadshot,
  onRetry,
}: DeliverablesWorkspaceViewProps) {
  const filesMode = mode === "files";
  const matrixAssetsForView = useMemo(
    () =>
      filesMode || matrixItems === undefined
        ? [...assets, ...(matrixItems === undefined ? [] : matrixAssetsFromItems(matrixItems))]
        : matrixAssetsFromItems(matrixItems),
    [assets, filesMode, matrixItems],
  );
  const rows = useMemo(
    () =>
      matrixItems === undefined
        ? taskRows(tasks, sessions, assets, profiles)
        : matrixRows(matrixItems, sessions, profiles),
    [assets, matrixItems, profiles, sessions, tasks],
  );
  const participants = useMemo(() => {
    const byId = new Map<string, string>();
    for (const profile of profiles) byId.set(profile.participantId, profile.displayName);
    for (const row of rows) byId.set(row.task.participantId, row.speakerLabel);
    return [...byId.entries()]
      .map(([id, label]) => ({
        id,
        label,
        sessions: sessions
          .filter(
            (session) =>
              session.status.toLocaleLowerCase() === "accepted" &&
              (session.speakerIds.includes(id) ||
                session.speakerRoster.some((member) => member.id === id)),
          )
          .map((session) => ({ id: session.id, label: session.title }))
          .sort((left, right) => left.label.localeCompare(right.label)),
      }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [profiles, rows, sessions]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<readonly string[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [filters, setFilters] = useState<ContentRequestFilters>({
    query: "",
    speakerId: "all",
    sessionId: "all",
    taskId: "all",
    status: "all",
  });
  const [reminderPreviewMode, setReminderPreviewMode] = useState<"selected" | "all" | null>(null);

  useEffect(() => {
    const visibleOutstandingIds = new Set(
      filterContentRequestRows(rows, filters)
        .filter((row) => isOutstanding(row.status))
        .map((row) => row.task.id),
    );
    setSelectedTaskIds((current) => current.filter((taskId) => visibleOutstandingIds.has(taskId)));
    setSelectedAssignmentId((current) =>
      current !== null && rows.some((row) => row.task.id === current) ? current : null,
    );
  }, [filters, rows]);

  useEffect(() => {
    setFilters((current) => ({
      ...current,
      speakerId:
        current.speakerId !== "all" &&
        !rows.some((row) => row.task.participantId === current.speakerId)
          ? "all"
          : current.speakerId,
      sessionId:
        current.sessionId !== "all" &&
        !rows.some((row) => (row.task.submissionId ?? "participant") === current.sessionId)
          ? "all"
          : current.sessionId,
      taskId:
        current.taskId !== "all" && !rows.some((row) => row.task.id === current.taskId)
          ? "all"
          : current.taskId,
    }));
  }, [rows]);

  const selectedAssignment =
    selectedAssignmentId === null
      ? undefined
      : rows.find((row) => row.task.id === selectedAssignmentId);
  const reminderPreviewRows = rows.filter(
    (row) =>
      isOutstanding(row.status) &&
      (reminderPreviewMode === "all" || selectedTaskIds.includes(row.task.id)),
  );

  const selectedAsset =
    selectedAssetId === null
      ? undefined
      : matrixAssetsForView.find((asset) => asset.id === selectedAssetId);
  const fileFamilies = useMemo(
    () => projectFileFamilies([...matrixAssetsForView, ...assetHistory], matrixItems ?? []),
    [assetHistory, matrixAssetsForView, matrixItems],
  );
  const activeFileFamily: FileFamilyProjection | undefined =
    selectedAsset === undefined
      ? undefined
      : fileFamilies.find((family) =>
          family.versions.some((version) => version.id === selectedAsset.id),
        );
  const authoritativeCurrentAsset =
    selectedAsset === undefined
      ? undefined
      : matrixItems
          ?.filter((item) =>
            item.assets.some((candidate) => assetFamily(candidate) === assetFamily(selectedAsset)),
          )
          .flatMap((item) => (item.currentAsset === undefined ? [] : [item.currentAsset]))[0];
  const selectedAssetVersions =
    selectedAsset === undefined
      ? []
      : matrixAssetsForView.filter(
          (candidate) => assetFamily(candidate) === assetFamily(selectedAsset),
        );
  const selectedAssetCurrentLabel =
    selectedAsset === undefined
      ? null
      : authoritativeCurrentAsset !== undefined
        ? authoritativeCurrentAsset.id === selectedAsset.id
          ? "Current"
          : "Not current"
        : isCurrentAsset(selectedAsset, selectedAssetVersions)
          ? "Current"
          : "Previous";
  const encodedOrganizationId = encodeURIComponent(organizationId);
  const encodedEventId = encodeURIComponent(eventId);
  const deliverablesHref = `/admin/organizations/${encodedOrganizationId}/events/${encodedEventId}/deliverables`;
  const filesHref = `/admin/organizations/${encodedOrganizationId}/events/${encodedEventId}/files`;

  return (
    <div className={pageClass} data-workspace-mode={mode}>
      <a href={filesMode ? "#files-content" : "#deliverables-content"} className={styles.skipLink}>
        Skip to {filesMode ? "Files library" : "Content requests"}
      </a>
      <div className={styles.content}>
        <Card className={styles.header}>
          <CardHeader className={clusterClass}>
            <div>
              <p className={styles.eyebrow}>
                {filesMode ? "Speaker materials" : "Speaker operations"}
              </p>
              <h1>{filesMode ? "Uploaded files" : "Content requests"}</h1>
              <p className={styles.lede}>
                {filesMode
                  ? "Review files submitted by speakers, request changes, and download final versions."
                  : "Collect speaker files, track every assignment, and follow up on outstanding requests."}
              </p>
            </div>
            <Badge variant="outline">
              {filesMode
                ? `${fileFamilies.length} uploaded file${fileFamilies.length === 1 ? "" : "s"}`
                : `${rows.length} assignment${rows.length === 1 ? "" : "s"}`}
            </Badge>
          </CardHeader>
          <CardContent className={styles.switcherWrap}>
            <nav
              className={styles.modeNav}
              aria-label="Content requests and uploaded files"
              data-mode-switcher
            >
              <Link href={deliverablesHref} aria-current={!filesMode ? "page" : undefined}>
                Requests <span>Assign &amp; track</span>
              </Link>
              <Link href={filesHref} aria-current={filesMode ? "page" : undefined}>
                Uploaded files <span>Review &amp; download</span>
              </Link>
            </nav>
            <details className={styles.mobileSwitcher}>
              <summary>Switch section: {filesMode ? "Uploaded files" : "Requests"}</summary>
              <nav aria-label="Mobile section switcher">
                <Link href={deliverablesHref}>Requests — Assign &amp; track</Link>
                <Link href={filesHref}>Uploaded files — Review &amp; download</Link>
              </nav>
            </details>
          </CardContent>
        </Card>
        <main
          id={filesMode ? "files-content" : "deliverables-content"}
          tabIndex={-1}
          className={styles.main}
        >
          {error !== null ? (
            <Alert variant="destructive" role="alert" className={dangerClass}>
              <AlertTitle>
                {filesMode
                  ? "Files action was not completed."
                  : "Content requests action was not completed."}
              </AlertTitle>
              <AlertDescription>
                {error}
                {onRetry !== undefined ? (
                  <Button variant="outline" type="button" onClick={onRetry}>
                    Retry
                  </Button>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}
          {capabilityMessages.length > 0 && !filesMode ? (
            <Card className={sectionClass} aria-labelledby="capability-heading">
              <CardHeader>
                <CardTitle id="capability-heading">Capability status</CardTitle>
              </CardHeader>
              <CardContent>
                <ul>
                  {capabilityMessages.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
          {statusMessage !== null ? (
            <div role="status" aria-live="polite" className={statusClass}>
              {statusMessage}
            </div>
          ) : null}
          {operationStates.length > 0 ? (
            <Card className={sectionClass} aria-labelledby="operation-status-heading">
              <CardHeader>
                <CardTitle id="operation-status-heading">Organizer operation status</CardTitle>
              </CardHeader>
              <CardContent>
                <ul aria-live="polite">
                  {operationStates.map((operation) => (
                    <li key={operation.key} data-operation-phase={operation.phase}>
                      <strong>{operation.label}</strong>: {formatStatus(operation.phase)} —{" "}
                      {operation.message}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
          {loading ? (
            <Card className={sectionClass} role="status">
              <CardHeader>
                <CardTitle>
                  {filesMode ? "Loading Files library" : "Loading content requests"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p>
                  {filesMode
                    ? "Retrieving authorized event sessions, private asset projections, and speaker records."
                    : "Retrieving organization- and event-qualified sessions plus the authoritative deliverables matrix."}
                </p>
              </CardContent>
            </Card>
          ) : null}
          {!filesMode ? (
            <>
              <DeliverablesSummary
                rows={rows}
                activeFilter={filters.status}
                onFilter={(status) => setFilters((current) => ({ ...current, status }))}
                participants={participants}
                busy={busy}
                {...(onCreateTask === undefined ? {} : { onCreateTask })}
              />
              <DeliverablesTable
                rows={rows}
                selectedTaskIds={selectedTaskIds}
                selectedAssignmentId={selectedAssignmentId}
                onToggleTask={(taskId) =>
                  setSelectedTaskIds((current) =>
                    current.includes(taskId)
                      ? current.filter((candidate) => candidate !== taskId)
                      : [...current, taskId],
                  )
                }
                onSetVisibleSelection={(taskIds) => setSelectedTaskIds([...taskIds])}
                onOpenAssignment={setSelectedAssignmentId}
                onPreviewSelectedReminders={() => setReminderPreviewMode("selected")}
                onPreviewAllReminders={() => setReminderPreviewMode("all")}
                filters={filters}
                onFiltersChange={setFilters}
                busy={busy}
              />
            </>
          ) : null}
          {filesMode ? (
            <FileLibrary
              organizationId={organizationId}
              eventId={eventId}
              families={fileFamilies}
              sessions={sessions}
              tasks={tasks}
              profiles={profiles}
              busy={busy}
              loadFailed={error !== null}
              onStartDownload={triggerDeliverablesDownload}
              {...(activeFileFamily === undefined
                ? {}
                : { activeFamilyId: activeFileFamily.familyId })}
              {...(onInspectAsset === undefined ? {} : { onInspectAsset })}
              {...(onExportFiles === undefined ? {} : { onExport: onExportFiles })}
              {...(onRetry === undefined ? {} : { onRetry })}
            />
          ) : null}
          {!filesMode ? (
            <Dialog
              open={reminderPreviewMode !== null}
              onOpenChange={(open) => {
                if (!open) setReminderPreviewMode(null);
              }}
            >
              <DialogContent className={styles.dialogContent}>
                <DialogHeader>
                  <DialogTitle>Reminder recipient preview</DialogTitle>
                  <DialogDescription>
                    Review the exact outstanding assignment snapshot before sending.
                  </DialogDescription>
                </DialogHeader>
                <ReminderPreview
                  rows={reminderPreviewRows}
                  busy={busy}
                  sendAvailable={onSendBulkReminder !== undefined}
                  onSend={() => {
                    const recipientIds = [
                      ...new Set(reminderPreviewRows.map((row) => row.task.participantId)),
                    ];
                    void onSendBulkReminder?.({
                      taskIds: reminderPreviewRows.map((row) => row.task.id),
                      recipientIds,
                    });
                    setSelectedTaskIds([]);
                    setReminderPreviewMode(null);
                  }}
                />
              </DialogContent>
            </Dialog>
          ) : null}
          {!filesMode ? (
            <Sheet
              open={selectedAssignment !== undefined}
              onOpenChange={(open) => {
                if (!open) setSelectedAssignmentId(null);
              }}
            >
              <SheetContent className={styles.assignmentSheet}>
                <SheetHeader>
                  <SheetTitle>Request detail</SheetTitle>
                  <SheetDescription>
                    Assignment context, upload policy, and current submission state.
                  </SheetDescription>
                </SheetHeader>
                <ScrollArea className={styles.assetScroll}>
                  {selectedAssignment === undefined ? null : (
                    <ContentRequestInspector
                      row={selectedAssignment}
                      {...(onInspectAsset === undefined
                        ? {}
                        : {
                            onInspectAsset: (assetId) => {
                              setSelectedAssignmentId(null);
                              onInspectAsset(assetId);
                            },
                          })}
                    />
                  )}
                </ScrollArea>
              </SheetContent>
            </Sheet>
          ) : null}
          {filesMode ? (
            <FileReviewDrawer
              open={selectedAssetId !== null}
              family={activeFileFamily}
              asset={selectedAsset}
              sessions={sessions}
              tasks={tasks}
              profiles={profiles}
              history={assetHistory}
              comments={comments}
              loading={loadingAssetDetails}
              busy={busy}
              assetHistoryError={assetHistoryError ?? null}
              commentsError={commentsError ?? null}
              reviewAvailable={onReviewAsset !== undefined}
              onOpenChange={(open) => {
                if (!open) onCloseAsset?.();
              }}
              {...(onInspectAsset === undefined ? {} : { onSelectVersion: onInspectAsset })}
              {...(onDownloadVersion === undefined ? {} : { onDownload: onDownloadVersion })}
              {...(onAddComment === undefined || selectedAsset === undefined
                ? {}
                : {
                    onAddComment: (body: string, expectedVersion: number) =>
                      onAddComment({
                        assetId: selectedAsset.id,
                        body,
                        expectedVersion,
                      }),
                  })}
              {...(onReviewAsset === undefined || selectedAsset === undefined
                ? {}
                : {
                    onReview: (
                      state: DeliverableReviewState,
                      note: string | undefined,
                      release: boolean,
                    ) =>
                      onReviewAsset({
                        assetId: selectedAsset.id,
                        state,
                        expectedVersion: selectedAsset.reviewVersion ?? 0,
                        release,
                        ...(note === undefined ? {} : { note }),
                      }),
                  })}
            />
          ) : null}
          {!filesMode ? (
            <Sheet
              open={selectedAssetId !== null}
              onOpenChange={(open) => {
                if (!open) onCloseAsset?.();
              }}
            >
              <SheetContent className={styles.assetSheet}>
                <SheetHeader>
                  <SheetTitle>Asset detail</SheetTitle>
                  <SheetDescription>
                    Authorized immutable history, comments, review, and version downloads.
                  </SheetDescription>
                </SheetHeader>
                <ScrollArea className={styles.assetScroll}>
                  {selectedAsset === undefined ? (
                    <Alert variant="destructive" role="alert">
                      <AlertDescription>
                        The selected private asset is no longer present in this event projection.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <AssetDetail
                      asset={selectedAsset}
                      allAssets={matrixAssetsForView}
                      history={assetHistory}
                      assetHistoryError={assetHistoryError ?? null}
                      commentsError={commentsError ?? null}
                      comments={comments}
                      matrixAuthoritative={matrixItems !== undefined}
                      {...(authoritativeCurrentAsset === undefined
                        ? {}
                        : { authoritativeCurrentAssetId: authoritativeCurrentAsset.id })}
                      loading={loadingAssetDetails}
                      busy={busy}
                      reviewAvailable={onReviewAsset !== undefined}
                      {...(onDownloadVersion === undefined
                        ? {}
                        : { onDownload: onDownloadVersion })}
                      {...(onAddComment === undefined
                        ? {}
                        : {
                            onAddComment: async (body, expectedVersion) =>
                              onAddComment({
                                assetId: selectedAsset.id,
                                body,
                                expectedVersion,
                              }),
                          })}
                      {...(onReviewAsset === undefined
                        ? {}
                        : {
                            onReview: async (state, note, release) =>
                              onReviewAsset({
                                assetId: selectedAsset.id,
                                state,
                                expectedVersion: selectedAsset.reviewVersion ?? 0,
                                release,
                                ...(note === undefined ? {} : { note }),
                              }),
                          })}
                    />
                  )}
                </ScrollArea>
              </SheetContent>
            </Sheet>
          ) : null}
          {!filesMode && selectedAssetId !== null ? (
            <Card className={sectionClass} aria-label="Selected asset evidence">
              <CardHeader>
                <CardTitle>Selected file: {selectedAsset?.fileName ?? "Unavailable"}</CardTitle>
                <CardDescription>
                  Asset detail is open in the focus-managed detail sheet.
                </CardDescription>
              </CardHeader>
              <CardContent className={stackClass}>
                {selectedAsset === undefined ? (
                  <Alert variant="destructive" role="alert">
                    <AlertDescription>
                      The selected private asset is no longer present in this event projection.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <p className={mutedClass}>
                      {selectedAssetCurrentLabel} · {selectedAssetVersions.length} version
                      {selectedAssetVersions.length === 1 ? "" : "s"}
                    </p>
                    {assetHistoryError !== null && assetHistoryError !== undefined ? (
                      <Alert variant="destructive" role="alert">
                        <AlertTitle>Version history unavailable</AlertTitle>
                        <AlertDescription>
                          Version history unavailable: {assetHistoryError}
                        </AlertDescription>
                      </Alert>
                    ) : null}
                    {comments.length > 0 ? (
                      <ul aria-label="Selected asset comment evidence">
                        {comments.map((comment) => (
                          <li key={comment.id}>{comment.body}</li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>
          ) : null}
          {!filesMode ? (
            <section className={styles.contentSection} aria-labelledby="secondary-content-heading">
              <div className={styles.contentSectionHeader}>
                <div>
                  <p className={styles.eyebrow}>Related records</p>
                  <h2 id="secondary-content-heading">Continue in Sessions or Speakers</h2>
                </div>
                <p className={mutedClass}>
                  Requests tracks what speakers owe. Canonical content and profiles stay with their
                  source records.
                </p>
              </div>
              <div>
                <SessionEditor
                  organizationId={organizationId}
                  eventId={eventId}
                  {...(selectedSessionId === undefined ? {} : { selectedSessionId })}
                  {...(sessionHistory === undefined ? {} : { sessionHistory })}
                  {...(sessionHistoryError === undefined ? {} : { sessionHistoryError })}
                  {...(onSelectSession === undefined ? {} : { onSelectSession })}
                  sessions={sessions}
                  loadingHistory={loadingSessionHistories}
                  busy={busy}
                  {...(onSaveSession === undefined ? {} : { onSave: onSaveSession })}
                  {...(onApproveSession === undefined ? {} : { onApprove: onApproveSession })}
                  {...(onRestoreSessionVersion === undefined
                    ? {}
                    : { onRestore: onRestoreSessionVersion })}
                />
              </div>
              <div>
                <SpeakerEditor
                  organizationId={organizationId}
                  eventId={eventId}
                  sessions={sessions}
                  profiles={profiles}
                  assets={assets}
                  busy={busy}
                  {...(speakerContentHistory === undefined ? {} : { speakerContentHistory })}
                  {...(onSaveBiography === undefined ? {} : { onSaveBiography })}
                  {...(onReplaceHeadshot === undefined ? {} : { onReplaceHeadshot })}
                  {...(onRestoreSpeakerContentVersion === undefined
                    ? {}
                    : { onRestoreSpeakerContentVersion })}
                />
              </div>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}
export interface DeliverablesCoreRequestHandles {
  readonly sessions: Promise<readonly DeliverableSession[]>;
  readonly matrix?: Promise<DeliverableTaskMatrix>;
  readonly tasks?: Promise<readonly DeliverableTask[]>;
  readonly assets?: Promise<readonly DeliverableAsset[]>;
  readonly profiles?: Promise<readonly DeliverableSpeakerProfile[]>;
}
type MutableDeliverablesCoreRequestHandles = {
  -readonly [Key in keyof DeliverablesCoreRequestHandles]: DeliverablesCoreRequestHandles[Key];
};

function startDeliverablesRequest<T>(request: () => Promise<T>): Promise<T> {
  try {
    return Promise.resolve(request());
  } catch (reason) {
    return Promise.reject(reason);
  }
}

/**
 * Start every independent core request synchronously. The workspace attaches
 * settlement handlers after this function returns so one rejection cannot
 * prevent the other resources from starting.
 */
export function startDeliverablesCoreRequests(
  api: DeliverablesApi,
  mode: DeliverablesWorkspaceMode,
  signal?: AbortSignal,
): DeliverablesCoreRequestHandles {
  const requests: MutableDeliverablesCoreRequestHandles = {
    sessions: startDeliverablesRequest(() => api.listSessions(signal)),
  };
  const listDeliverableMatrix = api.listDeliverableMatrix;
  if (listDeliverableMatrix !== undefined) {
    requests.matrix = startDeliverablesRequest(() =>
      listDeliverableMatrix(signal === undefined ? undefined : { signal }),
    );
  }

  const needsProjectionFallback = mode === "deliverables" && listDeliverableMatrix === undefined;
  if (needsProjectionFallback) {
    const listTasks = api.listTasks;
    if (listTasks !== undefined) {
      requests.tasks = startDeliverablesRequest(() => listTasks(signal));
    }
  }

  if (mode === "files" || needsProjectionFallback) {
    const listAssets = api.listAssets;
    if (listAssets !== undefined) {
      requests.assets = startDeliverablesRequest(() =>
        signal === undefined ? listAssets() : listAssets({ signal }),
      );
    }
    const listProfiles = api.listProfiles;
    if (listProfiles !== undefined) {
      requests.profiles = startDeliverablesRequest(() => listProfiles(signal));
    }
  }
  return requests;
}

type DeliverablesSettledResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: unknown };

function settleDeliverablesRequest<T>(
  request: Promise<T> | undefined,
): Promise<DeliverablesSettledResult<T> | undefined> {
  return request === undefined
    ? Promise.resolve(undefined)
    : request.then(
        (value) => ({ ok: true as const, value }),
        (reason: unknown) => ({ ok: false as const, reason }),
      );
}
export interface DeliverablesWorkspaceScope {
  readonly api: DeliverablesApi;
  readonly eventId: string;
  readonly organizationId: string;
  readonly epoch: number;
}

export function isDeliverablesWorkspaceScopeCurrent(
  expected: DeliverablesWorkspaceScope,
  current: DeliverablesWorkspaceScope,
): boolean {
  return (
    expected.epoch === current.epoch &&
    expected.api === current.api &&
    expected.eventId === current.eventId &&
    expected.organizationId === current.organizationId
  );
}

export function deliverablesSessionHistoryKey(sessionId: string, sessionVersion: number): string {
  return `${sessionId}\u0000${sessionVersion}`;
}

export type DeliverablesSessionHistoryCacheEntry =
  | {
      readonly status: "pending";
      readonly promise: Promise<readonly DeliverableContentHistoryEntry[]>;
    }
  | {
      readonly status: "fulfilled";
      readonly value: readonly DeliverableContentHistoryEntry[];
    };

export type DeliverablesSessionHistoryCache = Map<string, DeliverablesSessionHistoryCacheEntry>;

export function loadDeliverablesSessionHistory(
  api: DeliverablesApi,
  session: DeliverableSession,
  cache: DeliverablesSessionHistoryCache,
  signal?: AbortSignal,
): Promise<readonly DeliverableContentHistoryEntry[]> {
  const key = deliverablesSessionHistoryKey(session.id, session.version);
  if (session.contentHistory !== undefined) {
    cache.set(key, { status: "fulfilled", value: session.contentHistory });
    return Promise.resolve(session.contentHistory);
  }

  const cached = cache.get(key);
  if (cached?.status === "fulfilled") return Promise.resolve(cached.value);
  if (cached?.status === "pending") return cached.promise;

  const request = startDeliverablesRequest(() => {
    if (api.listSessionContentHistory === undefined) {
      throw new Error("The session content history endpoint is not provisioned.");
    }
    return signal === undefined
      ? api.listSessionContentHistory(session.id)
      : api.listSessionContentHistory(session.id, signal);
  });
  let tracked!: Promise<readonly DeliverableContentHistoryEntry[]>;
  tracked = request.then(
    (value) => {
      const current = cache.get(key);
      if (current?.status === "pending" && current.promise === tracked) {
        cache.set(key, { status: "fulfilled", value });
      }
      return value;
    },
    (reason: unknown) => {
      const current = cache.get(key);
      if (current?.status === "pending" && current.promise === tracked) {
        cache.delete(key);
      }
      throw reason;
    },
  );
  cache.set(key, { status: "pending", promise: tracked });
  return tracked;
}

export interface DeliverablesAssetDetailSettled {
  readonly history: DeliverablesSettledResult<readonly DeliverableAssetHistoryEntry[]>;
  readonly comments: DeliverablesSettledResult<readonly DeliverableComment[]>;
}

export function settleDeliverablesAssetDetailRequests(
  historyRequest: Promise<readonly DeliverableAssetHistoryEntry[]>,
  commentsRequest: Promise<readonly DeliverableComment[]>,
): Promise<DeliverablesAssetDetailSettled> {
  return Promise.all([
    settleDeliverablesRequest(historyRequest),
    settleDeliverablesRequest(commentsRequest),
  ]).then(([history, comments]) => ({
    history: history as DeliverablesSettledResult<readonly DeliverableAssetHistoryEntry[]>,
    comments: comments as DeliverablesSettledResult<readonly DeliverableComment[]>,
  }));
}

function matrixAssetsFromItems(
  items: readonly DeliverableMatrixItem[],
): readonly DeliverableAsset[] {
  const byId = new Map<string, DeliverableAsset>();
  for (const item of items) {
    for (const asset of item.assets) byId.set(asset.id, asset);
    if (item.currentAsset !== undefined) byId.set(item.currentAsset.id, item.currentAsset);
  }
  return [...byId.values()];
}

function matrixAssets(matrixValue: DeliverableTaskMatrix): readonly DeliverableAsset[] {
  return matrixAssetsFromItems(matrixValue.items);
}

export function DeliverablesWorkspace({
  eventId: fallbackEventId,
  organizationId,
  mode = "deliverables",
  api: providedApi,
  initialData,
}: DeliverablesWorkspaceProps) {
  const eventId = useOrganizerEventId(fallbackEventId);
  const api = useMemo(
    () => providedApi ?? createDeliverablesApi("", organizationId, eventId),
    [eventId, organizationId, providedApi],
  );
  const scopeRef = useRef<DeliverablesWorkspaceScope>({
    api,
    eventId,
    organizationId,
    epoch: 0,
  });
  if (
    scopeRef.current.api !== api ||
    scopeRef.current.eventId !== eventId ||
    scopeRef.current.organizationId !== organizationId
  ) {
    scopeRef.current = {
      api,
      eventId,
      organizationId,
      epoch: scopeRef.current.epoch + 1,
    };
  }
  const currentScope = scopeRef.current;
  const [sessions, setSessions] = useState<readonly DeliverableSession[]>(
    initialData?.sessions ?? [],
  );
  const [tasks, setTasks] = useState<readonly DeliverableTask[]>(initialData?.tasks ?? []);
  const [assets, setAssets] = useState<readonly DeliverableAsset[]>(initialData?.assets ?? []);
  const [profiles, setProfiles] = useState<readonly DeliverableSpeakerProfile[]>(
    initialData?.profiles ?? [],
  );
  const [speakerContentHistory, setSpeakerContentHistory] = useState<
    Readonly<Record<string, DeliverableSpeakerContentHistoryState>>
  >(() =>
    speakerContentHistoryStatesForProfiles(
      initialData?.profiles ?? [],
      initialData?.speakerContentHistory,
    ),
  );
  const [matrix, setMatrix] = useState<DeliverableTaskMatrix | undefined>(initialData?.matrix);
  const [loading, setLoading] = useState(initialData === undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [capabilityMessages, setCapabilityMessages] = useState<readonly string[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    initialData?.sessions[0]?.id ?? null,
  );
  const [sessionHistory, setSessionHistory] = useState<
    readonly DeliverableContentHistoryEntry[] | undefined
  >(undefined);
  const [sessionHistoryError, setSessionHistoryError] = useState<string | null>(null);
  const [sessionHistoryKey, setSessionHistoryKey] = useState<string | null>(null);
  const sessionHistoryCacheRef = useRef<DeliverablesSessionHistoryCache>(new Map());
  const selectedAssetIdRef = useRef<string | null>(selectedAssetId);
  selectedAssetIdRef.current = selectedAssetId;
  const [assetHistory, setAssetHistory] = useState<readonly DeliverableAssetHistoryEntry[]>([]);
  const [comments, setComments] = useState<readonly DeliverableComment[]>([]);
  const [loadingAssetDetails, setLoadingAssetDetails] = useState(false);
  const [assetHistoryError, setAssetHistoryError] = useState<string | null>(null);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [loadingSessionHistories, setLoadingSessionHistories] = useState(false);
  const [operationStates, setOperationStates] = useState<
    Partial<Record<DeliverablesOperationKey, DeliverablesOperationState>>
  >({});
  const loadGenerationRef = useRef(0);
  const stateScopeRef = useRef(currentScope);
  useEffect(() => {
    if (isDeliverablesWorkspaceScopeCurrent(stateScopeRef.current, currentScope)) return;
    stateScopeRef.current = currentScope;
    setSessions(initialData?.sessions ?? []);
    setTasks(initialData?.tasks ?? []);
    setAssets(initialData?.assets ?? []);
    setProfiles(initialData?.profiles ?? []);
    setSpeakerContentHistory(
      speakerContentHistoryStatesForProfiles(
        initialData?.profiles ?? [],
        initialData?.speakerContentHistory,
      ),
    );
    setMatrix(initialData?.matrix);
    setLoading(initialData === undefined);
    setError(null);
    setCapabilityMessages([]);
    sessionHistoryCacheRef.current.clear();
    setSelectedSessionId(null);
    setSessionHistory(undefined);
    setSessionHistoryError(null);
    setSessionHistoryKey(null);
    setLoadingSessionHistories(false);
    setSelectedAssetId(null);
    setAssetHistory([]);
    setComments([]);
    setAssetHistoryError(null);
    setCommentsError(null);
    setLoadingAssetDetails(false);
    setBusy(false);
    setStatusMessage(null);
    setOperationStates({});
  }, [currentScope, initialData]);

  function recordOperation(
    key: DeliverablesOperationKey,
    label: string,
    phase: DeliverablesOperationPhase,
    message: string,
  ): void {
    setOperationStates((current) => ({
      ...current,
      [key]: { key, label, phase, message },
    }));
  }
  const refreshSpeakerContentHistory = useCallback(
    async (participantId: string, signal?: AbortSignal): Promise<void> => {
      const scope = scopeRef.current;
      const isCurrent = (): boolean =>
        !signal?.aborted && isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current);
      if (!isCurrent()) return;
      setSpeakerContentHistory((current) => ({
        ...current,
        [participantId]: speakerContentHistoryLoading(),
      }));
      const listSpeakerContentHistory = api?.listSpeakerContentHistory;
      if (listSpeakerContentHistory === undefined) {
        if (!isCurrent()) return;
        setSpeakerContentHistory((current) => ({
          ...current,
          [participantId]: speakerContentHistoryError(
            new Error("The speaker content history endpoint is not provisioned."),
          ),
        }));
        return;
      }
      try {
        const entries = await listSpeakerContentHistory(participantId, signal);
        if (!isCurrent()) return;
        setSpeakerContentHistory((current) => ({
          ...current,
          [participantId]: speakerContentHistorySuccess(entries),
        }));
      } catch (reason) {
        if (!isCurrent()) return;
        setSpeakerContentHistory((current) => ({
          ...current,
          [participantId]: speakerContentHistoryError(reason),
        }));
      }
    },
    [api],
  );

  async function refreshMatrix(scope: DeliverablesWorkspaceScope = currentScope): Promise<boolean> {
    if (api.listDeliverableMatrix === undefined) return true;
    try {
      const next = await api.listDeliverableMatrix();
      if (!isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) return false;
      setMatrix(next);
      setTasks(next.items.map((item) => item.task));
      if (mode === "deliverables") setAssets(matrixAssets(next));
      return true;
    } catch (reason) {
      if (!isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) return false;
      setError(
        `The operation succeeded, but the exact deliverables matrix could not be refreshed. ${messageFromError(reason)}`,
      );
      return false;
    }
  }

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const scope: DeliverablesWorkspaceScope = {
        api,
        eventId,
        organizationId,
        epoch: scopeRef.current.epoch,
      };
      const generation = loadGenerationRef.current + 1;
      loadGenerationRef.current = generation;
      const isCurrent = (): boolean =>
        !signal?.aborted &&
        loadGenerationRef.current === generation &&
        isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current);
      if (initialData !== undefined) {
        if (isCurrent()) setLoading(false);
        return;
      }
      if (!isCurrent()) return;
      setLoading(true);
      setError(null);
      setLoadingSessionHistories(false);
      const messages: string[] = [];
      try {
        const requests = startDeliverablesCoreRequests(api, mode, signal);
        const [sessionsResult, matrixResult, tasksResult, assetsResult, profilesResult] =
          await Promise.all([
            settleDeliverablesRequest(requests.sessions),
            settleDeliverablesRequest(requests.matrix),
            settleDeliverablesRequest(requests.tasks),
            settleDeliverablesRequest(requests.assets),
            settleDeliverablesRequest(requests.profiles),
          ]);
        if (!isCurrent()) return;

        if (sessionsResult?.ok === true) {
          const coreSessions = sessionsResult.value;
          setSessions(coreSessions);
        } else if (sessionsResult !== undefined) {
          setError(messageFromError(sessionsResult.reason));
        }

        if (requests.matrix === undefined) {
          messages.push(
            "Exact task status and current-version tracking are unavailable: the organizer deliverables matrix endpoint is not provisioned.",
          );
          if (mode !== "files" && requests.tasks === undefined) {
            messages.push(
              "Task tracking unavailable: no organizer task projection endpoint is provisioned.",
            );
          } else if (tasksResult?.ok === true) {
            setTasks(tasksResult.value);
          } else if (tasksResult !== undefined) {
            messages.push(`Task tracking unavailable: ${messageFromError(tasksResult.reason)}`);
          }
        } else if (matrixResult?.ok === true) {
          const nextMatrix = matrixResult.value;
          setMatrix(nextMatrix);
          setTasks(nextMatrix.items.map((item) => item.task));
          if (mode === "deliverables") setAssets(matrixAssets(nextMatrix));
        } else if (matrixResult !== undefined) {
          messages.push(
            `Exact deliverables matrix unavailable: ${messageFromError(matrixResult.reason)}`,
          );
        }

        if (requests.assets !== undefined) {
          if (assetsResult?.ok === true) {
            setAssets(assetsResult.value);
          } else if (assetsResult !== undefined) {
            messages.push(
              `Private asset library unavailable: ${messageFromError(assetsResult.reason)}`,
            );
          }
        } else if (mode === "files" || requests.matrix === undefined) {
          messages.push(
            "Private asset library unavailable: no asset projection endpoint is provisioned.",
          );
        }

        if (requests.profiles !== undefined) {
          if (profilesResult?.ok === true) {
            const loadedProfiles = profilesResult.value;
            setProfiles(loadedProfiles);
            if (mode === "deliverables") {
              setSpeakerContentHistory(
                speakerContentHistoryStatesForProfiles(
                  loadedProfiles,
                  Object.fromEntries(
                    loadedProfiles.map((profile) => [
                      profile.participantId,
                      speakerContentHistoryLoading(),
                    ]),
                  ),
                ),
              );
              void Promise.all(
                loadedProfiles.map((profile) =>
                  refreshSpeakerContentHistory(profile.participantId, signal),
                ),
              );
            }
          } else if (profilesResult !== undefined) {
            setSpeakerContentHistory({});
            messages.push(
              mode === "files"
                ? `Speaker labels unavailable: ${messageFromError(profilesResult.reason)}`
                : `Speaker profile editing unavailable: ${messageFromError(profilesResult.reason)}`,
            );
          }
        } else if (mode === "files" || requests.matrix === undefined) {
          setSpeakerContentHistory({});
          messages.push(
            mode === "files"
              ? "Speaker labels are unavailable: the private profile endpoint is not provisioned for organizer access."
              : "Speaker profile editing unavailable: the private profile endpoint is not provisioned for organizer access.",
          );
        } else if (api.listProfiles !== undefined) {
          const listProfiles = api.listProfiles;
          const result = await startDeliverablesRequest(() => listProfiles(signal))
            .then((value) => ({ ok: true as const, value }))
            .catch((reason: unknown) => ({ ok: false as const, reason }));
          if (result.ok) {
            const loadedProfiles = result.value;
            setProfiles(loadedProfiles);
            setSpeakerContentHistory(
              speakerContentHistoryStatesForProfiles(
                loadedProfiles,
                Object.fromEntries(
                  loadedProfiles.map((profile) => [
                    profile.participantId,
                    speakerContentHistoryLoading(),
                  ]),
                ),
              ),
            );
            void Promise.all(
              loadedProfiles.map((profile) =>
                refreshSpeakerContentHistory(profile.participantId, signal),
              ),
            );
          } else {
            setSpeakerContentHistory({});
            messages.push(
              `Speaker profile editing unavailable: ${messageFromError(result.reason)}`,
            );
          }
        } else {
          setSpeakerContentHistory({});
          messages.push(
            "Speaker profile editing unavailable: the private profile endpoint is not provisioned for organizer access.",
          );
        }

        if (mode === "deliverables") {
          if (api.replaceHeadshot === undefined)
            messages.push(
              "Organizer headshot replacement is unavailable until the private staged-upload endpoint is provisioned.",
            );
          if (api.createTask === undefined)
            messages.push(
              "Create file-request task is unavailable until an organizer task-management endpoint is provisioned.",
            );
          if (api.listSpeakerContentHistory === undefined)
            messages.push(
              "Speaker content history is unavailable until the organizer content history endpoint is provisioned.",
            );
          if (api.sendBulkReminder === undefined)
            messages.push(
              "Bulk reminder sending is unavailable until a transactional reminder endpoint is provisioned.",
            );
          if (api.restoreSessionVersion === undefined)
            messages.push(
              "Session content restore is unavailable until the version restore endpoint is provisioned.",
            );
        }
        if (api.reviewAsset === undefined)
          messages.push(
            "Asset approval and needs-changes decisions are unavailable until organizer asset review is provisioned.",
          );
        if (api.exportDeliverables === undefined)
          messages.push(
            `${mode === "files" ? "Files" : "Deliverables"} ZIP export is unavailable until the organizer export capability is provisioned.`,
          );
        setCapabilityMessages(messages);
        setLoading(false);
      } finally {
        if (isCurrent()) setLoading(false);
      }
    },
    [api, eventId, initialData, mode, organizationId, refreshSpeakerContentHistory],
  );

  useEffect(() => {
    if (initialData !== undefined) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [initialData, load]);

  const effectiveSelectedSessionId =
    selectedSessionId ?? sessions.find((session) => session.eventId === eventId)?.id ?? null;
  useEffect(() => {
    if (mode === "files") return;
    setSelectedSessionId((current) => {
      if (
        current !== null &&
        sessions.some((session) => session.eventId === eventId && session.id === current)
      ) {
        return current;
      }
      return sessions.find((session) => session.eventId === eventId)?.id ?? null;
    });
  }, [eventId, mode, sessions]);

  useEffect(() => {
    if (mode === "files") {
      setLoadingSessionHistories(false);
      return;
    }
    const selected =
      sessions.find(
        (session) => session.eventId === eventId && session.id === effectiveSelectedSessionId,
      ) ?? sessions.find((session) => session.eventId === eventId);
    if (selected === undefined) {
      setSessionHistory(undefined);
      setSessionHistoryError(null);
      setSessionHistoryKey(null);
      setLoadingSessionHistories(false);
      return;
    }
    const key = deliverablesSessionHistoryKey(selected.id, selected.version);
    setSessionHistoryKey(key);
    const scope = scopeRef.current;
    const controller = new AbortController();
    setSessionHistoryError(null);
    if (selected.contentHistory !== undefined) {
      sessionHistoryCacheRef.current.set(key, {
        status: "fulfilled",
        value: selected.contentHistory,
      });
      setSessionHistory(selected.contentHistory);
      setLoadingSessionHistories(false);
      return;
    }
    setSessionHistory(undefined);
    setLoadingSessionHistories(true);
    void loadDeliverablesSessionHistory(
      api,
      selected,
      sessionHistoryCacheRef.current,
      controller.signal,
    )
      .then((history) => {
        if (
          controller.signal.aborted ||
          !isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)
        )
          return;
        setSessionHistory(history);
      })
      .catch((reason: unknown) => {
        if (
          controller.signal.aborted ||
          !isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)
        )
          return;
        setSessionHistoryError(messageFromError(reason));
      })
      .finally(() => {
        if (
          !controller.signal.aborted &&
          isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)
        )
          setLoadingSessionHistories(false);
      });
    return () => {
      controller.abort();
      const cached = sessionHistoryCacheRef.current.get(key);
      if (cached?.status === "pending") sessionHistoryCacheRef.current.delete(key);
    };
  }, [api, eventId, mode, effectiveSelectedSessionId, sessions]);
  useEffect(() => {
    if (selectedAssetId === null) {
      setLoadingAssetDetails(false);
      return;
    }
    const selected = assets.find((asset) => asset.id === selectedAssetId);
    if (selected === undefined) {
      setLoadingAssetDetails(false);
      return;
    }
    if (selected.eventId !== eventId) {
      setLoadingAssetDetails(false);
      return;
    }
    const controller = new AbortController();
    setLoadingAssetDetails(true);
    setAssetHistory([]);
    setComments([]);
    setAssetHistoryError(null);
    setCommentsError(null);
    const getAssetHistory = api.getAssetHistory;
    const listAssetComments = api.listAssetComments;
    const historyPromise =
      getAssetHistory === undefined
        ? Promise.resolve<readonly DeliverableAssetHistoryEntry[]>([])
        : startDeliverablesRequest(() => getAssetHistory(selected.id, controller.signal));
    const commentsPromise =
      listAssetComments === undefined
        ? Promise.resolve<readonly DeliverableComment[]>([])
        : startDeliverablesRequest(() => listAssetComments(selected.id, controller.signal));
    let settledCount = 0;
    const markSettled = (): void => {
      settledCount += 1;
      if (settledCount === 2 && !controller.signal.aborted) setLoadingAssetDetails(false);
    };
    void settleDeliverablesRequest(historyPromise)
      .then((result) => {
        if (controller.signal.aborted || result === undefined) return;
        if (result.ok) setAssetHistory(result.value);
        else setAssetHistoryError(messageFromError(result.reason));
      })
      .finally(markSettled);
    void settleDeliverablesRequest(commentsPromise)
      .then((result) => {
        if (controller.signal.aborted || result === undefined) return;
        if (result.ok) setComments(result.value);
        else setCommentsError(messageFromError(result.reason));
      })
      .finally(markSettled);
    return () => controller.abort();
  }, [api, assets, eventId, selectedAssetId]);

  async function createTask(input: DeliverableTaskInput): Promise<void> {
    if (api.createTask === undefined) {
      setError("Task creation is unavailable because no organizer task endpoint is provisioned.");
      return;
    }
    const scope = scopeRef.current;
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    recordOperation("task-create", "Create file-request task", "pending", "Request in progress.");
    try {
      const next = await api.createTask(input);
      if (!isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) return;
      setTasks((current) => [...current, next]);
      await refreshMatrix(scope);
      if (!isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) return;
      setStatusMessage(
        `Task ${next.title} created for ${input.assignments.length} speaker${input.assignments.length === 1 ? "" : "s"}.`,
      );
      recordOperation(
        "task-create",
        "Create file-request task",
        "succeeded",
        `Created ${next.title}.`,
      );
    } catch (reason) {
      if (!isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) return;
      const message = messageFromError(reason);
      setError(message);
      recordOperation("task-create", "Create file-request task", "failed", message);
      throw reason;
    } finally {
      if (isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) setBusy(false);
    }
  }

  async function addComment(input: {
    readonly assetId: string;
    readonly body: string;
    readonly expectedVersion: number;
  }): Promise<void> {
    if (api.addAssetComment === undefined) {
      setError(
        "Cross-role comments are unavailable because the private asset comment endpoint is not provisioned.",
      );
      return;
    }
    const scope = scopeRef.current;
    setBusy(true);
    setError(null);
    recordOperation("asset-comment", "Reply to asset version", "pending", "Reply in progress.");
    try {
      const next = await api.addAssetComment(input);
      if (!isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) return;
      if (selectedAssetIdRef.current === input.assetId) {
        setComments((current) => [...current, next]);
      }
      setStatusMessage("Comment added to the immutable asset version.");
      recordOperation(
        "asset-comment",
        "Reply to asset version",
        "succeeded",
        `Organizer reply added to asset version ${input.assetId}.`,
      );
    } catch (reason) {
      if (!isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) return;
      const message = messageFromError(reason);
      setError(message);
      recordOperation("asset-comment", "Reply to asset version", "failed", message);
    } finally {
      if (isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) setBusy(false);
    }
  }

  async function downloadVersion(assetId: string): Promise<void> {
    if (api.getDownloadGrant === undefined) {
      setError(
        "Asset download is unavailable because no private download capability endpoint is provisioned.",
      );
      return;
    }
    const scope = scopeRef.current;
    setBusy(true);
    setError(null);
    recordOperation(
      "asset-download",
      "Download asset version",
      "pending",
      "Capability request in progress.",
    );
    try {
      const grant: DeliverableDownloadGrant = await api.getDownloadGrant(assetId);
      if (!isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) return;
      const safeUrl = safeDownloadUrl(grant.url);
      if (safeUrl === null)
        throw new Error(
          "The private download capability returned an unsafe URL; no navigation was attempted.",
        );
      if (typeof window !== "undefined") {
        const link = document.createElement("a");
        link.href = safeUrl;
        link.rel = "noreferrer";
        link.download = "";
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      setStatusMessage(
        "A short-lived private download capability was issued for the selected version.",
      );
      recordOperation(
        "asset-download",
        "Download asset version",
        "succeeded",
        "Authorized version download started.",
      );
    } catch (reason) {
      if (!isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) return;
      const message = messageFromError(reason);
      setError(message);
      recordOperation("asset-download", "Download asset version", "failed", message);
    } finally {
      if (isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) setBusy(false);
    }
  }
  async function requestExport(input: DeliverableExportInput): Promise<DeliverableExportDownload> {
    if (api.exportDeliverables === undefined) {
      throw new Error("The authorized ZIP export capability is not provisioned for this event.");
    }
    const download = await api.exportDeliverables(input);
    if (download === undefined) {
      throw new Error("The ZIP export returned no download response.");
    }
    return download;
  }

  async function exportDeliverables(input: DeliverableExportInput): Promise<void> {
    const scope = scopeRef.current;
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    recordOperation(
      "deliverables-export",
      "Export deliverables ZIP",
      "pending",
      "ZIP request in progress.",
    );
    try {
      const download = await requestExport(input);
      if (!isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) return;
      triggerDeliverablesDownload(download);
      setStatusMessage(`${download.fileName} is ready to download.`);
      recordOperation(
        "deliverables-export",
        "Export deliverables ZIP",
        "succeeded",
        `${download.fileName} was validated and the browser download started.`,
      );
    } catch (reason) {
      if (!isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) return;
      const message = messageFromError(reason);
      setError(message);
      recordOperation("deliverables-export", "Export deliverables ZIP", "failed", message);
    } finally {
      if (isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) setBusy(false);
    }
  }

  async function exportFiles(
    input: DeliverableExportInput,
  ): Promise<DeliverableExportDownload | undefined> {
    const scope = scopeRef.current;
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    recordOperation("files-export", "Export files ZIP", "pending", "ZIP request in progress.");
    try {
      const download = await requestExport(input);
      if (!isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) return undefined;
      setStatusMessage(`${download.fileName} is ready for browser download.`);
      recordOperation(
        "files-export",
        "Export files ZIP",
        "succeeded",
        `${download.fileName} is ready for browser download.`,
      );
      return download;
    } catch (reason) {
      if (!isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) return undefined;
      const message = messageFromError(reason);
      setError(message);
      recordOperation("files-export", "Export files ZIP", "failed", message);
      throw reason;
    } finally {
      if (isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) setBusy(false);
    }
  }

  async function saveSession(input: {
    readonly sessionId: string;
    readonly expectedVersion: number;
    readonly title: string;
    readonly description: string;
  }): Promise<void> {
    const scope = scopeRef.current;
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const next = await api.updateSession(input);
      if (!isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) return;
      setSessions((current) => current.map((session) => (session.id === next.id ? next : session)));
      setStatusMessage(`Session content saved at version ${next.version}.`);
    } catch (reason) {
      if (!isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) return;
      setError(messageFromError(reason));
    } finally {
      if (isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) setBusy(false);
    }
  }

  async function approveSession(
    session: DeliverableSession,
    contentStatus: "Approved" | "Needs changes",
  ): Promise<void> {
    const scope = scopeRef.current;
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const next = await api.updateSession({
        sessionId: session.id,
        expectedVersion: session.version,
        contentStatus,
      });
      if (!isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) return;
      setSessions((current) =>
        current.map((candidate) => (candidate.id === next.id ? next : candidate)),
      );
      setStatusMessage(`Session content status changed to ${contentStatus}.`);
    } catch (reason) {
      if (!isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) return;
      setError(messageFromError(reason));
    } finally {
      if (isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) setBusy(false);
    }
  }

  async function saveBiography(input: {
    readonly participantId: string;
    readonly biography: string;
    readonly expectedVersion: number;
  }): Promise<void> {
    if (api.updateBiography === undefined) {
      setError(
        "Speaker profile editing is unavailable because organizer profile access is not provisioned.",
      );
      return;
    }
    const scope = scopeRef.current;
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    recordOperation(
      "biography-save",
      "Save speaker biography",
      "pending",
      "Profile update in progress.",
    );
    try {
      const next = await api.updateBiography(input);
      if (!isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) return;
      setProfiles((current) =>
        current.map((profile) => (profile.participantId === next.participantId ? next : profile)),
      );
      setStatusMessage(`Biography saved for ${next.displayName}.`);
      recordOperation(
        "biography-save",
        "Save speaker biography",
        "succeeded",
        `Biography saved for ${next.displayName}.`,
      );
      void refreshSpeakerContentHistory(input.participantId);
    } catch (reason) {
      if (!isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) return;
      const message = messageFromError(reason);
      setError(message);
      recordOperation("biography-save", "Save speaker biography", "failed", message);
    } finally {
      if (isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) setBusy(false);
    }
  }
  async function replaceHeadshot(input: {
    readonly participantId: string;
    readonly submissionId: string;
    readonly file: File;
    readonly supersedesAssetId?: string;
  }): Promise<void> {
    if (api.replaceHeadshot === undefined) {
      setError(
        "Headshot replacement is unavailable because organizer private upload access is not provisioned.",
      );
      return;
    }
    const currentProfile = profiles.find(
      (profile) => profile.participantId === input.participantId,
    );
    if (currentProfile === undefined) {
      setError("The selected speaker profile is no longer available; reload before replacing it.");
      return;
    }
    const eligibleSessions = eligibleSpeakerHeadshotSessions(
      sessions,
      eventId,
      input.participantId,
    );
    if (!eligibleSessions.some((session) => session.id === input.submissionId)) {
      setError("Choose an accepted session owned by this speaker before replacing the headshot.");
      return;
    }
    const scope = scopeRef.current;
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    recordOperation(
      "headshot-replace",
      "Replace speaker headshot",
      "pending",
      "Private upload in progress.",
    );
    try {
      const next = await api.replaceHeadshot({
        ...input,
        expectedVersion: currentProfile.version,
      });
      if (!isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) return;
      setProfiles((current) =>
        current.map((profile) =>
          profile.participantId === next.profile.participantId ? next.profile : profile,
        ),
      );
      setAssets((current) => {
        const existing = current.some((asset) => asset.id === next.asset.id);
        return existing
          ? current.map((asset) => (asset.id === next.asset.id ? next.asset : asset))
          : [...current, next.asset];
      });
      setStatusMessage(`Headshot replaced for ${next.profile.displayName}.`);
      recordOperation(
        "headshot-replace",
        "Replace speaker headshot",
        "succeeded",
        `Headshot replaced for ${next.profile.displayName}.`,
      );
      void refreshSpeakerContentHistory(input.participantId);
    } catch (reason) {
      if (!isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) return;
      const message = messageFromError(reason);
      setError(message);
      recordOperation("headshot-replace", "Replace speaker headshot", "failed", message);
    } finally {
      if (isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) setBusy(false);
    }
  }

  async function sendBulkReminder(input: {
    readonly taskIds: readonly string[];
    readonly recipientIds: readonly string[];
  }): Promise<void> {
    if (api.sendBulkReminder === undefined) {
      setError(
        "Bulk reminder sending is unavailable because no transactional reminder endpoint is provisioned.",
      );
      return;
    }
    const scope = scopeRef.current;
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    recordOperation(
      "reminder-send",
      "Send outstanding reminders",
      "pending",
      "Confirmed send in progress.",
    );
    try {
      const result = await api.sendBulkReminder(input);
      if (!isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) return;
      setStatusMessage(
        `Reminder send recorded for ${result.sentCount} recipient${result.sentCount === 1 ? "" : "s"}.`,
      );
      recordOperation(
        "reminder-send",
        "Send outstanding reminders",
        "succeeded",
        `Send recorded for ${result.sentCount} recipient${result.sentCount === 1 ? "" : "s"}.`,
      );
    } catch (reason) {
      if (!isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) return;
      const message = messageFromError(reason);
      setError(message);
      recordOperation("reminder-send", "Send outstanding reminders", "failed", message);
    } finally {
      if (isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) setBusy(false);
    }
  }

  async function restoreSessionVersion(input: {
    readonly sessionId: string;
    readonly version: number;
    readonly expectedVersion: number;
  }): Promise<void> {
    if (api.restoreSessionVersion === undefined) {
      setError("Session restore is unavailable because no restore endpoint is provisioned.");
      return;
    }
    const scope = scopeRef.current;
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const next = await api.restoreSessionVersion(input);
      if (!isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) return;
      setSessions((current) => current.map((session) => (session.id === next.id ? next : session)));
      setStatusMessage(`Session content restored to version ${input.version}.`);
    } catch (reason) {
      if (!isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) return;
      setError(messageFromError(reason));
    } finally {
      if (isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) setBusy(false);
    }
  }
  async function restoreSpeakerContentVersion(input: {
    readonly participantId: string;
    readonly version: number;
    readonly expectedVersion: number;
  }): Promise<void> {
    if (api?.restoreSpeakerContentVersion === undefined) {
      const message =
        "Speaker content restore is unavailable because no restore endpoint is provisioned.";
      setError(message);
      recordOperation("speaker-content-restore", "Restore speaker content", "failed", message);
      return;
    }
    const scope = scopeRef.current;
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    recordOperation(
      "speaker-content-restore",
      "Restore speaker content",
      "pending",
      "Speaker content restore in progress.",
    );
    try {
      const next = await api.restoreSpeakerContentVersion(input);
      if (!isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) return;
      setProfiles((current) =>
        current.map((profile) =>
          profile.participantId === input.participantId
            ? profileWithSpeakerContentRecord(profile, next)
            : profile,
        ),
      );
      setStatusMessage(`Speaker content restored to version ${input.version}.`);
      recordOperation(
        "speaker-content-restore",
        "Restore speaker content",
        "succeeded",
        `Speaker content restored to version ${input.version}.`,
      );
      void refreshSpeakerContentHistory(input.participantId);
    } catch (reason) {
      if (!isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) return;
      const message = messageFromError(reason);
      setError(message);
      recordOperation("speaker-content-restore", "Restore speaker content", "failed", message);
    } finally {
      if (isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) setBusy(false);
    }
  }

  const reviewAsset = api?.reviewAsset;
  const reviewAssetHandler =
    reviewAsset === undefined
      ? undefined
      : async (input: DeliverableReviewInput): Promise<void> => {
          const scope = scopeRef.current;
          setBusy(true);
          setError(null);
          recordOperation(
            "asset-review",
            "Review current asset",
            "pending",
            "Review update in progress.",
          );
          try {
            const next = await reviewAsset(input);
            if (!isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) return;
            setAssets((current) => current.map((asset) => (asset.id === next.id ? next : asset)));
            await refreshMatrix(scope);
            if (!isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) return;
            setStatusMessage(`Asset review recorded as ${input.state}.`);
            recordOperation(
              "asset-review",
              "Review current asset",
              "succeeded",
              `Review recorded as ${formatStatus(input.state)}.`,
            );
          } catch (reason) {
            if (!isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) return;
            const message = messageFromError(reason);
            setError(message);
            recordOperation("asset-review", "Review current asset", "failed", message);
          } finally {
            if (isDeliverablesWorkspaceScopeCurrent(scope, scopeRef.current)) setBusy(false);
          }
        };
  const renderedStateIsCurrent = isDeliverablesWorkspaceScopeCurrent(
    stateScopeRef.current,
    currentScope,
  );
  const renderedSessions = renderedStateIsCurrent ? sessions : (initialData?.sessions ?? []);
  const renderedTasks = renderedStateIsCurrent ? tasks : (initialData?.tasks ?? []);
  const renderedAssets = renderedStateIsCurrent ? assets : (initialData?.assets ?? []);
  const renderedProfiles = renderedStateIsCurrent ? profiles : (initialData?.profiles ?? []);
  const renderedSpeakerContentHistory = renderedStateIsCurrent
    ? speakerContentHistory
    : speakerContentHistoryStatesForProfiles(
        initialData?.profiles ?? [],
        initialData?.speakerContentHistory,
      );
  const renderedMatrix = renderedStateIsCurrent ? matrix : initialData?.matrix;
  const selectedSessionForHistory =
    renderedSessions.find(
      (session) => session.eventId === eventId && session.id === effectiveSelectedSessionId,
    ) ?? renderedSessions.find((session) => session.eventId === eventId);
  const visibleSessionHistoryKey =
    selectedSessionForHistory === undefined
      ? null
      : deliverablesSessionHistoryKey(
          selectedSessionForHistory.id,
          selectedSessionForHistory.version,
        );
  const visibleSessionHistory =
    renderedStateIsCurrent && sessionHistoryKey === visibleSessionHistoryKey
      ? sessionHistory
      : undefined;
  const visibleSessionHistoryError =
    renderedStateIsCurrent && sessionHistoryKey === visibleSessionHistoryKey
      ? sessionHistoryError
      : null;
  return (
    <DeliverablesWorkspaceView
      eventId={eventId}
      organizationId={organizationId}
      mode={mode}
      sessions={renderedSessions}
      tasks={renderedTasks}
      assets={renderedAssets}
      profiles={renderedProfiles}
      {...(renderedMatrix === undefined ? {} : { matrixItems: renderedMatrix.items })}
      loading={renderedStateIsCurrent ? loading : initialData === undefined}
      loadingSessionHistories={renderedStateIsCurrent && loadingSessionHistories}
      busy={renderedStateIsCurrent && busy}
      error={renderedStateIsCurrent ? error : null}
      statusMessage={renderedStateIsCurrent ? statusMessage : null}
      capabilityMessages={renderedStateIsCurrent ? capabilityMessages : []}
      operationStates={
        renderedStateIsCurrent
          ? Object.values(operationStates).filter(
              (state): state is DeliverablesOperationState => state !== undefined,
            )
          : []
      }
      speakerContentHistory={renderedSpeakerContentHistory}
      {...(api?.createTask === undefined ? {} : { onCreateTask: createTask })}
      onInspectAsset={(assetId) => {
        setAssetHistory([]);
        setComments([]);
        setAssetHistoryError(null);
        setCommentsError(null);
        setSelectedAssetId(assetId);
      }}
      {...(!renderedStateIsCurrent || selectedSessionId === null ? {} : { selectedSessionId })}
      {...(visibleSessionHistory === undefined ? {} : { sessionHistory: visibleSessionHistory })}
      {...(visibleSessionHistoryError === null
        ? {}
        : { sessionHistoryError: visibleSessionHistoryError })}
      onSelectSession={setSelectedSessionId}
      selectedAssetId={renderedStateIsCurrent ? selectedAssetId : null}
      onCloseAsset={() => setSelectedAssetId(null)}
      assetHistory={renderedStateIsCurrent ? assetHistory : []}
      comments={renderedStateIsCurrent ? comments : []}
      loadingAssetDetails={renderedStateIsCurrent && loadingAssetDetails}
      assetHistoryError={renderedStateIsCurrent ? assetHistoryError : null}
      commentsError={renderedStateIsCurrent ? commentsError : null}
      {...(api?.addAssetComment === undefined ? {} : { onAddComment: addComment })}
      {...(api?.getDownloadGrant === undefined ? {} : { onDownloadVersion: downloadVersion })}
      {...(api?.exportDeliverables === undefined
        ? {}
        : mode === "files"
          ? { onExportFiles: exportFiles }
          : { onExportDeliverables: exportDeliverables })}
      {...(reviewAssetHandler === undefined ? {} : { onReviewAsset: reviewAssetHandler })}
      {...(api?.sendBulkReminder === undefined ? {} : { onSendBulkReminder: sendBulkReminder })}
      onSaveSession={saveSession}
      onApproveSession={approveSession}
      {...(api?.restoreSessionVersion === undefined
        ? {}
        : { onRestoreSessionVersion: restoreSessionVersion })}
      {...(api?.restoreSpeakerContentVersion === undefined
        ? {}
        : { onRestoreSpeakerContentVersion: restoreSpeakerContentVersion })}
      {...(api?.updateBiography === undefined ? {} : { onSaveBiography: saveBiography })}
      {...(api?.replaceHeadshot === undefined ? {} : { onReplaceHeadshot: replaceHeadshot })}
    />
  );
}

export const DeliverablesDashboard = DeliverablesWorkspace;
export const DeliverablesDashboardView = DeliverablesWorkspaceView;
