"use client";

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
const speakerContentHistoryFields = [
  ["title", "Title"],
  ["description", "Description"],
  ["abstract", "Abstract"],
  ["biography", "Biography"],
  ["socialLinks", "Social profiles"],
  ["headshotAssetId", "Headshot"],
  ["status", "Status"],
] as const;

type SpeakerContentHistoryField = (typeof speakerContentHistoryFields)[number][0];

function speakerContentValue(
  snapshot: DeliverableSpeakerContentHistoryEntry["snapshot"],
  field: SpeakerContentHistoryField,
): unknown {
  return snapshot[field];
}

function speakerContentValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function formatSpeakerContentValue(value: unknown): string {
  if (value === undefined) return "Not provided";
  if (value === null) return "None";
  if (typeof value === "string") return value.length === 0 ? "Empty" : value;
  return JSON.stringify(value);
}

function speakerContentChangedFields(
  entry: DeliverableSpeakerContentHistoryEntry,
  previous: DeliverableSpeakerContentHistoryEntry | undefined,
): readonly {
  readonly label: string;
  readonly previous: string;
  readonly current: string;
}[] {
  return speakerContentHistoryFields.flatMap(([field, label]) => {
    const currentValue = speakerContentValue(entry.snapshot, field);
    const previousValue =
      previous === undefined ? undefined : speakerContentValue(previous.snapshot, field);
    if (previous !== undefined && speakerContentValuesEqual(previousValue, currentValue)) return [];
    return [
      {
        label,
        previous: formatSpeakerContentValue(previousValue),
        current: formatSpeakerContentValue(currentValue),
      },
    ];
  });
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

function statusMatches(status: DeliverableMatrixStatus, filter: string): boolean {
  if (filter === "all") return true;
  if (filter === "pending" || filter === "incomplete") return isOutstanding(status);
  if (filter === "uploaded") return ["uploaded", "completed", "waived"].includes(status);
  return status === filter;
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
function authoritativeAssetPointerIds(versions: readonly DeliverableAsset[]): Readonly<{
  latest?: string;
  current?: string;
  approved?: string;
  released?: string;
}> {
  const pointerSources = versions.filter(
    (version) =>
      version.latestVersionId !== undefined ||
      version.currentVersionId !== undefined ||
      version.approvedVersionId !== undefined ||
      version.releasedVersionId !== undefined,
  );
  const source =
    pointerSources.find((version) => version.latestVersionId === version.id) ??
    (pointerSources.length === 1 ? pointerSources[0] : undefined);
  return source === undefined
    ? {}
    : {
        ...(source.latestVersionId === undefined ? {} : { latest: source.latestVersionId }),
        ...(source.currentVersionId === undefined ? {} : { current: source.currentVersionId }),
        ...(source.approvedVersionId === undefined ? {} : { approved: source.approvedVersionId }),
        ...(source.releasedVersionId === undefined ? {} : { released: source.releasedVersionId }),
      };
}

function authoritativeAssetBadges(
  asset: DeliverableAsset,
  versions: readonly DeliverableAsset[],
): readonly string[] {
  const pointers = authoritativeAssetPointerIds(versions);
  return [
    ...(pointers.latest === asset.id ? ["Latest"] : []),
    ...(pointers.current === asset.id ? ["Current"] : []),
    ...(pointers.approved === asset.id ? ["Approved"] : []),
    ...(pointers.released === asset.id ? ["Released"] : []),
  ];
}

function assetSessionId(
  asset: DeliverableAsset,
  tasksById: ReadonlyMap<string, DeliverableTask>,
): string {
  return asset.submissionId ?? tasksById.get(asset.taskId ?? "")?.submissionId ?? "";
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
  const [mimeTypes, setMimeTypes] = useState("application/pdf");
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
    setMimeTypes("application/pdf");
    setMaxSizeMb("100");
    setAcceptedAssetKinds(["slides"]);
    setSubjectType("session");
    setAssigneeIds([]);
    setSessionByParticipant({});
    setOpen(false);
  }

  return (
    <Card className={sectionClass} aria-labelledby="create-task-heading">
      <CardHeader className={clusterClass}>
        <div>
          <p className={mutedClass}>Organizer-created speaker requests and follow-up</p>
          <CardTitle id="create-task-heading">Requests &amp; tracking</CardTitle>
          <CardDescription>
            Create a subject-scoped file request with policy enforced again by the private upload
            service.
          </CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button type="button" disabled={onCreateTask === undefined}>
              {onCreateTask === undefined ? "Task creation unavailable" : "New file request"}
            </Button>
          </DialogTrigger>
          <DialogContent className={styles.dialogContent}>
            <DialogHeader>
              <DialogTitle>New file request</DialogTitle>
              <DialogDescription>
                Choose whether this request belongs to each participant or to one explicit accepted
                session, then set the upload policy.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={(event) => void submit(event)} className={stackClass}>
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
                  placeholder="Final slide deck as a PDF, 16:9 aspect ratio."
                  required
                />
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
                  Session requests require an explicit session for every assignee. Participant
                  requests are profile-wide and intentionally have no session.
                </small>
              </div>
              <fieldset className={styles.fieldset} aria-describedby="asset-kind-help">
                <legend>Accepted asset kinds (required)</legend>
                <div className={stackClass}>
                  {deliverableAssetKinds.map((kind) => (
                    <div key={kind} className={clusterClass}>
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
                    ? "None — choose at least one."
                    : acceptedAssetKinds.map(formatStatus).join(", ")}
                  .
                </small>
              </fieldset>
              <div className={gridClass}>
                <div className={fieldClass}>
                  <Label htmlFor="task-mime-types">Allowed MIME types</Label>
                  <Input
                    id="task-mime-types"
                    value={mimeTypes}
                    onChange={(event) => setMimeTypes(event.currentTarget.value)}
                    aria-describedby="mime-help"
                  />
                  <small id="mime-help" className={mutedClass}>
                    Comma-separated values, for example application/pdf.
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
              <fieldset className={styles.fieldset}>
                <legend>Assignees and subjects</legend>
                {participants.length === 0 ? (
                  <p className={mutedClass}>
                    No authorized speaker records were returned. Task creation cannot be assigned
                    safely.
                  </p>
                ) : (
                  <div className={stackClass}>
                    {participants.map((participant) => {
                      const selected = assigneeIds.includes(participant.id);
                      return (
                        <div key={participant.id} className={stackClass}>
                          <div className={clusterClass}>
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
                                  No accepted session is available for this participant. Remove the
                                  assignee or choose participant scope.
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
                    ? "Saving task…"
                    : onCreateTask === undefined
                      ? "Task creation unavailable"
                      : "Save file-request task"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className={stackClass}>
        <p className={mutedClass}>
          Tasks stay separate from Files: this view assigns subject-scoped speaker work, records
          status, and provides follow-up. Uploaded assets are reviewed in Files.
        </p>
        <p className={mutedClass}>
          Request controls: Request subject, one accepted session per speaker when session-scoped,
          Allowed MIME types, Maximum file size (MB), Accepted asset kinds (required), and
          Assignees.
        </p>
      </CardContent>
    </Card>
  );
}

function DeliverablesTable({
  rows,
  selectedTaskIds,
  selectedExportTaskIds,
  onToggleTask,
  onToggleExportTask,
  onInspectAsset,
  onPreviewReminders,
  speakerFilter,
  taskFilter,
  statusFilter,
  outstandingOnly,
  onSpeakerFilter,
  onTaskFilter,
  onStatusFilter,
  onOutstandingOnly,
  busy,
  exportAvailable,
  exportableCount,
  onExport,
}: Readonly<{
  rows: readonly DeliverableRow[];
  selectedTaskIds: readonly string[];
  selectedExportTaskIds: readonly string[];
  onToggleTask: (taskId: string) => void;
  onToggleExportTask: (taskId: string) => void;
  onInspectAsset?: (assetId: string) => void;
  onPreviewReminders: () => void;
  speakerFilter: string;
  taskFilter: string;
  statusFilter: string;
  outstandingOnly: boolean;
  onSpeakerFilter: (value: string) => void;
  onTaskFilter: (value: string) => void;
  onStatusFilter: (value: string) => void;
  onOutstandingOnly: (value: boolean) => void;
  busy: boolean;
  exportAvailable: boolean;
  exportableCount: number;
  onExport?: () => void;
}>) {
  const speakers = [
    ...new Map(rows.map((row) => [row.task.participantId, row.speakerLabel])).entries(),
  ];
  const tasks = [...new Map(rows.map((row) => [row.task.id, row.task.title])).entries()];
  const visibleRows = rows.filter(
    (row) =>
      (speakerFilter === "all" || row.task.participantId === speakerFilter) &&
      (taskFilter === "all" || row.task.id === taskFilter) &&
      statusMatches(row.status, statusFilter) &&
      (!outstandingOnly || isOutstanding(row.status)),
  );
  const incompleteCount = rows.filter((row) => isOutstanding(row.status)).length;
  return (
    <Card className={sectionClass} aria-labelledby="tracking-heading">
      <CardHeader className={clusterClass}>
        <div>
          <p className={mutedClass}>Organizer follow-up</p>
          <CardTitle id="tracking-heading">Requests &amp; tracking</CardTitle>
          <CardDescription>
            Select tasks <strong>For reminder</strong>. ZIP export has a separate selection intent
            so reminder recipients can never be exported accidentally.
          </CardDescription>
        </div>
        <Badge variant="outline">{visibleRows.length} visible</Badge>
      </CardHeader>
      <CardContent className={stackClass}>
        <div className={gridClass}>
          <div className={fieldClass}>
            <Label htmlFor="deliverables-filter-speaker">Filter by speaker</Label>
            <Select value={speakerFilter} onValueChange={onSpeakerFilter}>
              <SelectTrigger id="deliverables-filter-speaker">
                <SelectValue placeholder="All speakers" />
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
          </div>
          <div className={fieldClass}>
            <Label htmlFor="deliverables-filter-task">Filter by task</Label>
            <Select value={taskFilter} onValueChange={onTaskFilter}>
              <SelectTrigger id="deliverables-filter-task">
                <SelectValue placeholder="All tasks" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tasks</SelectItem>
                {tasks.map(([id, label]) => (
                  <SelectItem key={id} value={id}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className={fieldClass}>
            <Label htmlFor="deliverables-filter-status">Filter by status</Label>
            <Select value={statusFilter} onValueChange={onStatusFilter}>
              <SelectTrigger id="deliverables-filter-status">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Incomplete / pending</SelectItem>
                <SelectItem value="uploaded">Uploaded / complete</SelectItem>
                <SelectItem value="needs_changes">Needs changes</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className={clusterClass}>
            <Checkbox
              id="deliverables-outstanding-only"
              checked={outstandingOnly}
              onCheckedChange={(checked) => onOutstandingOnly(checked === true)}
            />
            <Label htmlFor="deliverables-outstanding-only">Outstanding only</Label>
          </div>
        </div>
        <div className={clusterClass}>
          <Button
            variant="outline"
            type="button"
            onClick={onPreviewReminders}
            disabled={incompleteCount === 0}
          >
            Preview reminder recipients ({incompleteCount})
          </Button>
          <Button
            variant="outline"
            type="button"
            aria-describedby="deliverables-export-help"
            disabled={busy || onExport === undefined || !exportAvailable || exportableCount === 0}
            onClick={onExport}
          >
            {busy ? "Preparing ZIP…" : "Download selected deliverables ZIP"}
          </Button>
          <span id="deliverables-export-help" className={mutedClass}>
            {!exportAvailable
              ? "ZIP export is unavailable because the organizer export capability is not provisioned."
              : exportableCount === 0
                ? "Select at least one uploaded deliverable under “For ZIP export”."
                : `${exportableCount} selected deliverable${exportableCount === 1 ? "" : "s"} eligible for export.`}
          </span>
        </div>
        {visibleRows.length === 0 ? (
          <p className={mutedClass}>No speaker-task pairs match these filters.</p>
        ) : (
          <div className={tableWrapClass}>
            <Table>
              <TableCaption>Per-speaker file-request status and due dates</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">For reminder</TableHead>
                  <TableHead scope="col">For ZIP export</TableHead>
                  <TableHead scope="col">Speaker</TableHead>
                  <TableHead scope="col">Session</TableHead>
                  <TableHead scope="col">Task</TableHead>
                  <TableHead scope="col">Due date</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col">Versions</TableHead>
                  <TableHead scope="col">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((row) => {
                  const status = row.status;
                  const versionCount =
                    row.currentAsset === undefined
                      ? 0
                      : row.assets.filter(
                          (asset) =>
                            assetFamily(asset) ===
                            assetFamily(row.currentAsset as DeliverableAsset),
                        ).length;
                  const zipEligible =
                    row.currentAsset?.state === "ready" &&
                    row.currentAsset.currentVersionId === row.currentAsset.id;
                  return (
                    <TableRow key={row.task.id}>
                      <TableCell>
                        <Checkbox
                          id={`deliverables-reminder-${row.task.id}`}
                          checked={selectedTaskIds.includes(row.task.id)}
                          onCheckedChange={() => onToggleTask(row.task.id)}
                        />
                        <Label className="sr-only" htmlFor={`deliverables-reminder-${row.task.id}`}>
                          {`For reminder: ${row.speakerLabel} ${row.task.title}`}
                        </Label>
                      </TableCell>
                      <TableCell>
                        <Checkbox
                          id={`deliverables-export-${row.task.id}`}
                          checked={selectedExportTaskIds.includes(row.task.id)}
                          disabled={!zipEligible}
                          onCheckedChange={() => onToggleExportTask(row.task.id)}
                        />
                        <Label className="sr-only" htmlFor={`deliverables-export-${row.task.id}`}>
                          {`For ZIP export: ${row.speakerLabel} ${row.task.title}`}
                        </Label>
                      </TableCell>
                      <TableHead scope="row">{row.speakerLabel}</TableHead>
                      <TableCell>{row.sessionLabel}</TableCell>
                      <TableCell>
                        {row.task.title}
                        <small className={mutedClass}>
                          {row.task.description ?? "No instructions returned"}
                        </small>
                      </TableCell>
                      <TableCell>{formatDate(row.task.dueAt)}</TableCell>
                      <TableCell>
                        <Badge variant={isOutstanding(status) ? "secondary" : "outline"}>
                          {formatStatus(status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {versionCount === 0
                          ? "—"
                          : `${versionCount} version${versionCount === 1 ? "" : "s"}`}
                      </TableCell>
                      <TableCell>
                        {row.currentAsset === undefined ? (
                          <span className={mutedClass}>No upload</span>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            disabled={onInspectAsset === undefined}
                            onClick={() => onInspectAsset?.(row.currentAsset?.id ?? "")}
                          >
                            Inspect versions
                          </Button>
                        )}
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

function FileLibrary({
  assets,
  sessions,
  tasks,
  profiles,
  matrixItems,
  busy,
  onInspectAsset,
  onExport,
}: Readonly<{
  assets: readonly DeliverableAsset[];
  sessions: readonly DeliverableSession[];
  tasks: readonly DeliverableTask[];
  profiles: readonly DeliverableSpeakerProfile[];
  matrixItems?: readonly DeliverableMatrixItem[];
  busy: boolean;
  onInspectAsset?: (assetId: string) => void;
  onExport?: (input: DeliverableExportInput) => Promise<DeliverableExportDownload | undefined>;
}>) {
  const [selectedAssetIds, setSelectedAssetIds] = useState<readonly string[]>([]);
  const [search, setSearch] = useState("");
  const [speakerFilter, setSpeakerFilter] = useState("all");
  const [sessionFilter, setSessionFilter] = useState("all");
  const [reviewFilter, setReviewFilter] = useState("all");
  const [sessionToAdd, setSessionToAdd] = useState("all");
  const [exportStatus, setExportStatus] = useState<DeliverablesExportUiStatus>("idle");
  const [exportStatusHistory, setExportStatusHistory] = useState<
    readonly DeliverablesExportUiStatus[]
  >([]);
  const [exportError, setExportError] = useState<string | null>(null);
  const [readyDownload, setReadyDownload] = useState<DeliverableExportDownload | null>(null);

  const sessionsById = useMemo(
    () => new Map(sessions.map((session) => [session.id, session])),
    [sessions],
  );
  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const profilesById = useMemo(
    () => new Map(profiles.map((profile) => [profile.participantId, profile])),
    [profiles],
  );
  const families = useMemo(() => {
    const authoritativeCurrentByFamily = new Map(
      (matrixItems ?? []).flatMap((item) =>
        item.currentAsset === undefined
          ? []
          : [[assetFamily(item.currentAsset), item.currentAsset.id] as const],
      ),
    );
    const sourceAssets = new Map<string, DeliverableAsset>();
    for (const asset of [
      ...assets,
      ...(matrixItems ?? []).flatMap((item) => [
        ...item.assets,
        ...(item.currentAsset === undefined ? [] : [item.currentAsset]),
      ]),
    ]) {
      sourceAssets.set(asset.id, asset);
    }
    const grouped = new Map<string, DeliverableAsset[]>();
    for (const asset of sourceAssets.values()) {
      const family = grouped.get(assetFamily(asset));
      if (family === undefined) grouped.set(assetFamily(asset), [asset]);
      else family.push(asset);
    }
    return [...grouped.entries()]
      .map(([familyId, versions]) => {
        const pointers = authoritativeAssetPointerIds(versions);
        const authoritativeId = authoritativeCurrentByFamily.get(familyId) ?? pointers.current;
        const current =
          versions.find((asset) => asset.id === authoritativeId) ??
          versions.find((asset) => asset.id === pointers.latest);
        return current === undefined
          ? null
          : { current, versions, authoritative: current.id === authoritativeId };
      })
      .filter(
        (
          family,
        ): family is {
          current: DeliverableAsset;
          versions: DeliverableAsset[];
          authoritative: boolean;
        } => Boolean(family),
      )
      .sort((left, right) => compareAssetVersions(left.current, right.current));
  }, [assets, matrixItems]);

  const rows = useMemo(
    () =>
      families.map(({ current, versions, authoritative }) => {
        const sessionId = assetSessionId(current, tasksById);
        return {
          current,
          versions,
          authoritative,
          sessionId,
          sessionTitle:
            sessionsById.get(sessionId)?.title ??
            current.sessionTitle ??
            tasksById.get(current.taskId ?? "")?.sessionTitle ??
            (current.kind === "headshot" ? "Speaker profile" : "Session unavailable"),
          speaker:
            current.participantName ??
            profilesById.get(current.participantId)?.displayName ??
            current.participantId,
        };
      }),
    [families, profilesById, sessionsById, tasksById],
  );
  const visibleRows = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return rows.filter((row) => {
      const reviewValue =
        row.current.reviewState ?? (row.current.state === "ready" ? "pending" : row.current.state);
      return (
        (normalizedSearch.length === 0 ||
          [row.current.fileName, row.speaker, row.sessionTitle].some((value) =>
            value.toLocaleLowerCase().includes(normalizedSearch),
          )) &&
        (speakerFilter === "all" || row.current.participantId === speakerFilter) &&
        (sessionFilter === "all" || row.sessionId === sessionFilter) &&
        (reviewFilter === "all" || reviewValue === reviewFilter)
      );
    });
  }, [reviewFilter, rows, search, sessionFilter, speakerFilter]);
  const currentById = useMemo(() => new Map(rows.map((row) => [row.current.id, row])), [rows]);
  const selectedReadyIds = selectedAssetIds.filter((assetId) => {
    const row = currentById.get(assetId);
    return row?.authoritative === true && row.current.state === "ready";
  });
  const sessionOptions = useMemo(
    () =>
      [
        ...new Map(
          rows.filter((row) => row.sessionId).map((row) => [row.sessionId, row.sessionTitle]),
        ).entries(),
      ].sort((left, right) => left[1].localeCompare(right[1])),
    [rows],
  );
  const eligibleSessionOptions = useMemo(
    () =>
      [
        ...new Map(
          rows
            .filter((row) => row.authoritative && row.current.state === "ready" && row.sessionId)
            .map((row) => [row.sessionId, row.sessionTitle]),
        ).entries(),
      ].sort((left, right) => left[1].localeCompare(right[1])),
    [rows],
  );
  const exportInFlight =
    exportStatus === "queued" || exportStatus === "preparing" || exportStatus === "generating";
  const downloadReady = exportStatus === "ready" && readyDownload !== null;

  useEffect(() => {
    const currentIds = new Set(
      rows.filter((row) => row.authoritative).map((row) => row.current.id),
    );
    setSelectedAssetIds((current) => current.filter((assetId) => currentIds.has(assetId)));
  }, [rows]);

  function setExportStage(stage: DeliverablesExportUiStatus, resetHistory = false): void {
    setExportStatus(stage);
    setExportStatusHistory((current) => (resetHistory ? [stage] : [...current, stage]));
  }

  function toggleAsset(assetId: string): void {
    setSelectedAssetIds((current) =>
      current.includes(assetId)
        ? current.filter((candidate) => candidate !== assetId)
        : [...current, assetId],
    );
  }

  function addEligibleFilesBySession(): void {
    if (sessionToAdd === "all") return;
    const eligibleIds = rows
      .filter(
        (row) =>
          row.sessionId === sessionToAdd && row.authoritative && row.current.state === "ready",
      )
      .map((row) => row.current.id);
    setSelectedAssetIds((current) => [...new Set([...current, ...eligibleIds])]);
  }

  async function exportSelected(): Promise<void> {
    if (onExport === undefined || selectedReadyIds.length === 0 || exportInFlight) return;
    setExportError(null);
    setReadyDownload(null);
    setExportStage("queued", true);
    await Promise.resolve();
    setExportStage("preparing");
    try {
      setExportStage("generating");
      const download = await onExport({ assetIds: [...selectedReadyIds] });
      if (download === undefined) throw new Error("The ZIP export returned no download response.");
      setReadyDownload(download);
      setExportStage("ready");
    } catch (reason) {
      setReadyDownload(null);
      setExportError(messageFromError(reason));
      setExportStage("failure");
    }
  }

  function startReadyDownload(): void {
    if (readyDownload === null) return;
    try {
      triggerDeliverablesDownload(readyDownload);
      setReadyDownload(null);
      setExportStage("download-started");
    } catch (reason) {
      setReadyDownload(null);
      setExportError(messageFromError(reason));
      setExportStage("failure");
    }
  }

  const statusDescription: Record<DeliverablesExportUiStatus, string> = {
    ...deliverablesExportStatusLabels,
    failure: exportError ?? deliverablesExportStatusLabels.failure,
  };

  return (
    <Card className={sectionClass} aria-labelledby="file-library-heading" data-files-library>
      <CardHeader className={clusterClass}>
        <div>
          <p className={mutedClass}>Organizer-side authorized uploaded-asset library</p>
          <CardTitle id="file-library-heading">Files</CardTitle>
          <CardDescription>
            {families.length} version famil{families.length === 1 ? "y" : "ies"} · asset history,
            comments, review, and downloads remain event-scoped.
          </CardDescription>
        </div>
        <Badge variant="outline">Authorized files only</Badge>
      </CardHeader>
      <CardContent className={stackClass}>
        <Alert>
          <AlertTitle>Server-authoritative eligibility</AlertTitle>
          <AlertDescription>
            Only a server-authoritative current version in <strong>ready</strong> state is eligible
            for ZIP export. A latest projection without a confirmed current version stays visible
            but cannot be selected.
          </AlertDescription>
        </Alert>
        <p className={mutedClass}>
          View version history opens authorized controls for each immutable version. Object keys are
          never shown; private authorization and short-lived download grants remain enforced.
        </p>
        <div className={gridClass}>
          <div className={fieldClass}>
            <Label htmlFor="files-filter-search">Filter files</Label>
            <Input
              id="files-filter-search"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              placeholder="Filename, speaker, or session"
            />
          </div>
          <div className={fieldClass}>
            <Label htmlFor="files-filter-speaker">Filter by speaker</Label>
            <Select value={speakerFilter} onValueChange={setSpeakerFilter}>
              <SelectTrigger id="files-filter-speaker">
                <SelectValue placeholder="All speakers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All speakers</SelectItem>
                {[...new Map(rows.map((row) => [row.current.participantId, row.speaker])).entries()]
                  .sort((left, right) => left[1].localeCompare(right[1]))
                  .map(([id, label]) => (
                    <SelectItem key={id} value={id}>
                      {label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className={fieldClass}>
            <Label htmlFor="files-filter-session">Filter by session</Label>
            <Select value={sessionFilter} onValueChange={setSessionFilter}>
              <SelectTrigger id="files-filter-session">
                <SelectValue placeholder="All sessions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sessions</SelectItem>
                {sessionOptions.map(([id, label]) => (
                  <SelectItem key={id} value={id}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className={fieldClass}>
            <Label htmlFor="files-filter-review">Filter by review state</Label>
            <Select value={reviewFilter} onValueChange={setReviewFilter}>
              <SelectTrigger id="files-filter-review">
                <SelectValue placeholder="All review states" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All review states</SelectItem>
                <SelectItem value="pending">Pending review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="needs_changes">Needs changes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className={clusterClass}>
          <Label className="sr-only" htmlFor="files-session-to-add">
            Session for eligible files
          </Label>
          <Select value={sessionToAdd} onValueChange={setSessionToAdd}>
            <SelectTrigger id="files-session-to-add">
              <SelectValue placeholder="Choose a session" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Choose a session</SelectItem>
              {eligibleSessionOptions.map(([id, label]) => (
                <SelectItem key={id} value={id}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            disabled={sessionToAdd === "all"}
            onClick={addEligibleFilesBySession}
          >
            Add eligible files by session
          </Button>
          <span className={mutedClass}>
            {selectedReadyIds.length} selected file{selectedReadyIds.length === 1 ? "" : "s"}
          </span>
          <Button
            type="button"
            variant="ghost"
            disabled={selectedAssetIds.length === 0}
            onClick={() => setSelectedAssetIds([])}
          >
            Clear
          </Button>
          <Button
            type="button"
            disabled={
              busy ||
              exportInFlight ||
              (!downloadReady && (onExport === undefined || selectedReadyIds.length === 0))
            }
            onClick={() => (downloadReady ? undefined : void exportSelected())}
          >
            {deliverablesExportActionLabels[exportStatus]}
          </Button>
        </div>
        <p className={mutedClass}>
          {onExport === undefined
            ? "Bulk ZIP export is unavailable because the authorized export capability is not provisioned."
            : selectedReadyIds.length === 0
              ? "Select row-level ready current files."
              : `${selectedReadyIds.length} server-authoritative current file${selectedReadyIds.length === 1 ? "" : "s"} selected.`}
        </p>
        {exportStatus !== "idle" ? (
          <Alert
            variant={exportStatus === "failure" ? "destructive" : "default"}
            role={exportStatus === "failure" ? "alert" : "status"}
            aria-live="polite"
            data-export-status={exportStatus}
          >
            <AlertTitle>ZIP export request state: {exportStatus}</AlertTitle>
            <AlertDescription>
              {statusDescription[exportStatus]}
              {exportStatusHistory.length > 1 ? (
                <small className={mutedClass}> Progress: {exportStatusHistory.join(" → ")}</small>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
        {downloadReady && readyDownload !== null ? (
          <Card aria-labelledby="export-manifest-heading">
            <CardHeader>
              <CardTitle id="export-manifest-heading">Latest authorized export manifest</CardTitle>
              <CardDescription>
                Validated manifest.json for organization {readyDownload.manifest.organizationId} and
                event {readyDownload.manifest.eventId}.
              </CardDescription>
            </CardHeader>
            <CardContent className={stackClass}>
              <p className={mutedClass}>
                {readyDownload.manifest.entries.length} authoritative file{" "}
                {readyDownload.manifest.entries.length === 1 ? "entry" : "entries"}.
              </p>
              <div className={tableWrapClass}>
                <Table>
                  <TableCaption>Files recorded in manifest.json</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Path</TableHead>
                      <TableHead scope="col">Speaker / session</TableHead>
                      <TableHead scope="col">Task</TableHead>
                      <TableHead scope="col">Version</TableHead>
                      <TableHead scope="col">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {readyDownload.manifest.entries.map((entry) => (
                      <TableRow key={`${entry.assetId}:${entry.path}`}>
                        <TableHead scope="row">{entry.path}</TableHead>
                        <TableCell>
                          {entry.participantName ?? entry.participantId}
                          <small className={mutedClass}>
                            {entry.sessionTitle ?? entry.sessionId ?? "Participant scope"}
                          </small>
                        </TableCell>
                        <TableCell>{entry.taskTitle ?? entry.taskId ?? "No task"}</TableCell>
                        <TableCell>v{entry.version}</TableCell>
                        <TableCell>{formatStatus(entry.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Button type="button" onClick={startReadyDownload}>
                Download validated ZIP
              </Button>
            </CardContent>
          </Card>
        ) : null}
        {families.length === 0 ? (
          <p className={mutedClass}>No private speaker files have been uploaded.</p>
        ) : visibleRows.length === 0 ? (
          <p className={mutedClass}>No files match these filters.</p>
        ) : (
          <div className={tableWrapClass}>
            <Table>
              <TableCaption>Latest authorized file metadata across every speaker</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Ready current file</TableHead>
                  <TableHead scope="col">Filename</TableHead>
                  <TableHead scope="col">Speaker</TableHead>
                  <TableHead scope="col">Session</TableHead>
                  <TableHead scope="col">Upload date</TableHead>
                  <TableHead scope="col">Review state</TableHead>
                  <TableHead scope="col">Versions / history</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map(({ current, versions, sessionTitle, speaker, authoritative }) => (
                  <TableRow
                    key={assetFamily(current)}
                    data-current-version={authoritative ? current.id : undefined}
                  >
                    <TableCell>
                      <Checkbox
                        id={`files-ready-current-${current.id}`}
                        checked={selectedAssetIds.includes(current.id)}
                        disabled={!authoritative || current.state !== "ready"}
                        onCheckedChange={() => toggleAsset(current.id)}
                      />
                      <Label className="sr-only" htmlFor={`files-ready-current-${current.id}`}>
                        {`Select ready current file ${current.fileName}`}
                      </Label>
                    </TableCell>
                    <TableHead scope="row">
                      {current.fileName}
                      <small className={mutedClass}>
                        {formatStatus(current.kind)} · {current.contentType} · {current.sizeBytes}{" "}
                        bytes
                        <br />
                        Asset {current.id} · family {current.versionFamilyId ?? current.id}
                      </small>
                    </TableHead>
                    <TableCell>{speaker}</TableCell>
                    <TableCell>{sessionTitle}</TableCell>
                    <TableCell>{formatTime(current.createdAt)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          reviewStateForAsset(current) === "Approved" ? "default" : "outline"
                        }
                      >
                        {reviewStateForAsset(current)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className={clusterClass}>
                        {authoritativeAssetBadges(current, versions).map((badge) => (
                          <Badge key={badge} variant={badge === "Released" ? "default" : "outline"}>
                            {badge}
                          </Badge>
                        ))}
                        <strong>
                          {authoritative
                            ? `Authoritative current v${current.version ?? 1}`
                            : `Authoritative current version unavailable`}{" "}
                          · {versions.length} version{versions.length === 1 ? "" : "s"}
                        </strong>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        disabled={onInspectAsset === undefined}
                        onClick={() => onInspectAsset?.(current.id)}
                      >
                        {onInspectAsset === undefined
                          ? "History unavailable"
                          : "View version history"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
export function ReminderPreview({
  rows,
  selectedTaskIds,
  busy,
  onSend,
  sendAvailable,
}: Readonly<{
  rows: readonly DeliverableRow[];
  selectedTaskIds: readonly string[];
  busy: boolean;
  onSend: () => void;
  sendAvailable: boolean;
}>) {
  const selected = rows.filter(
    (row) => selectedTaskIds.includes(row.task.id) && isOutstanding(row.status),
  );
  const effective =
    selectedTaskIds.length > 0 ? selected : rows.filter((row) => isOutstanding(row.status));
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
            Only the outstanding task snapshot below will be sent. No email is sent until you
            confirm this recipient list.
          </CardDescription>
        </div>
        <Badge variant="outline">
          {recipients.length} recipient{recipients.length === 1 ? "" : "s"}
        </Badge>
      </CardHeader>
      <CardContent className={stackClass}>
        {recipients.length === 0 ? (
          <p className={mutedClass}>No outstanding tasks are available for a reminder.</p>
        ) : (
          <div className={tableWrapClass}>
            <Table>
              <TableCaption>Explicit reminder recipients and outstanding tasks</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Recipient</TableHead>
                  <TableHead scope="col">Outstanding task</TableHead>
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
            I confirm this exact outstanding recipient and task snapshot.
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

function SessionEditor({
  sessions,
  loadingHistory,
  busy,
  onSave,
  onApprove,
  onRestore,
  selectedSessionId,
  sessionHistory,
  sessionHistoryError,
  onSelectSession,
}: Readonly<{
  sessions: readonly DeliverableSession[];
  loadingHistory: boolean;
  busy: boolean;
  onSave?: (input: {
    readonly sessionId: string;
    readonly expectedVersion: number;
    readonly title: string;
    readonly description: string;
  }) => Promise<void>;
  selectedSessionId?: string;
  sessionHistory?: readonly DeliverableContentHistoryEntry[];
  sessionHistoryError?: string | null;
  onSelectSession?: (sessionId: string) => void;
  onApprove?: (
    session: DeliverableSession,
    contentStatus: "Approved" | "Needs changes",
  ) => Promise<void>;
  onRestore?: (input: {
    readonly sessionId: string;
    readonly version: number;
    readonly expectedVersion: number;
  }) => Promise<void>;
}>) {
  const [localSessionId, setLocalSessionId] = useState(sessions[0]?.id ?? "");
  const effectiveSessionId = selectedSessionId ?? localSessionId;
  const selected = sessions.find((session) => session.id === effectiveSessionId) ?? sessions[0];
  const [title, setTitle] = useState(selected?.title ?? "");
  const [description, setDescription] = useState(selected?.description ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const history =
    sessionHistoryError !== null && sessionHistoryError !== undefined
      ? []
      : selected?.contentHistory !== undefined
        ? selected.contentHistory
        : selected?.id === effectiveSessionId
          ? (sessionHistory ?? selected.history ?? [])
          : (selected?.history ?? []);
  const priorVersions = useMemo(
    () =>
      [...history]
        .filter((entry) => selected !== undefined && entry.version < selected.version)
        .sort((left, right) => right.version - left.version),
    [history, selected],
  );
  const [restoreVersion, setRestoreVersion] = useState<number | null>(
    priorVersions[0]?.version ?? null,
  );

  useEffect(() => {
    setRestoreVersion((current) =>
      current !== null && priorVersions.some((entry) => entry.version === current)
        ? current
        : (priorVersions[0]?.version ?? null),
    );
  }, [priorVersions]);

  useEffect(() => {
    setTitle(selected?.title ?? "");
    setDescription(selected?.description ?? "");
    setFormError(null);
  }, [selected?.description, selected?.title]);

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (selected === undefined || onSave === undefined) {
      setFormError(
        "Session editing is unavailable because the admin session API is not configured.",
      );
      return;
    }
    if (title.trim().length === 0) {
      setFormError("A session title is required.");
      return;
    }
    setFormError(null);
    await onSave({
      sessionId: selected.id,
      expectedVersion: selected.version,
      title: title.trim(),
      description,
    });
  }

  return (
    <Card className={sectionClass} aria-labelledby="session-content-heading">
      <CardHeader className={clusterClass}>
        <div>
          <p className={mutedClass}>Secondary Content section</p>
          <CardTitle id="session-content-heading">Session title and abstract</CardTitle>
          <CardDescription>Versioned admin session API</CardDescription>
        </div>
        <Badge variant="outline">Public eligibility gate</Badge>
      </CardHeader>
      <CardContent className={stackClass}>
        {sessions.length === 0 ? (
          <>
            <p className={mutedClass}>No sessions are available for this event.</p>
            {onSave === undefined ? (
              <p className={mutedClass}>
                Session editing unavailable until the admin session API returns an event-qualified
                session.
              </p>
            ) : null}
          </>
        ) : (
          <>
            <Alert>
              <AlertTitle>Public approval gate</AlertTitle>
              <AlertDescription>
                Only content marked Approved is eligible for public publication. Unapproved content
                is excluded from the public agenda and embeds. Approving changes public eligibility;
                it does not publish immediately.
                <br />
                Review status: <strong>{selected?.contentStatus ?? "Not approved"}</strong>
              </AlertDescription>
            </Alert>
            <div className={fieldClass}>
              <Label htmlFor="session-selector">Session</Label>
              <Select
                value={selected?.id ?? ""}
                onValueChange={(nextSessionId) => {
                  setLocalSessionId(nextSessionId);
                  onSelectSession?.(nextSessionId);
                }}
              >
                <SelectTrigger id="session-selector">
                  <SelectValue placeholder="Choose a session" />
                </SelectTrigger>
                <SelectContent>
                  {sessions.map((session) => (
                    <SelectItem key={session.id} value={session.id}>
                      {session.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <form onSubmit={(event) => void save(event)} className={stackClass}>
              <div className={fieldClass}>
                <Label htmlFor="session-title">Title</Label>
                <Input
                  id="session-title"
                  value={title}
                  onChange={(event) => setTitle(event.currentTarget.value)}
                />
              </div>
              <div className={fieldClass}>
                <Label htmlFor="session-abstract">Abstract</Label>
                <Textarea
                  id="session-abstract"
                  rows={6}
                  value={description}
                  onChange={(event) => setDescription(event.currentTarget.value)}
                />
              </div>
              {formError !== null ? (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              ) : null}
              <div className={clusterClass}>
                <Button type="submit" disabled={busy || onSave === undefined}>
                  {busy
                    ? "Saving content…"
                    : onSave === undefined
                      ? "Session editing unavailable"
                      : "Save session content"}
                </Button>
                {selected !== undefined && onApprove !== undefined ? (
                  <>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" type="button" disabled={busy}>
                          Approve content
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Confirm public eligibility change</AlertDialogTitle>
                          <AlertDialogDescription>
                            Approving this session changes public eligibility. It does not publish
                            the session immediately. Confirm the current version and approve?
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => void onApprove(selected, "Approved")}>
                            Confirm approval
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <Button
                      variant="outline"
                      type="button"
                      disabled={busy}
                      onClick={() => void onApprove(selected, "Needs changes")}
                    >
                      Mark needs changes
                    </Button>
                  </>
                ) : null}
              </div>
            </form>
            <section aria-labelledby="session-history-heading" className={stackClass}>
              <h3 id="session-history-heading">Change history</h3>
              {sessionHistoryError !== null && sessionHistoryError !== undefined ? (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>
                    Session change history unavailable: {sessionHistoryError}
                  </AlertDescription>
                </Alert>
              ) : loadingHistory ? (
                <p role="status" className={mutedClass}>
                  Loading session change history…
                </p>
              ) : history.length === 0 ? (
                <p className={mutedClass}>
                  No session history was returned. Restore is unavailable without an immutable prior
                  version.
                </p>
              ) : (
                <ol>
                  {history.map((entry) => (
                    <li key={entry.id}>
                      {formatTime(entry.occurredAt)} · {entry.actorLabel ?? entry.actorId} · version{" "}
                      {entry.version}
                      {entry.action === undefined ? "" : ` · ${formatStatus(entry.action)}`}
                      {entry.title === undefined ? "" : ` · ${entry.title}`}
                    </li>
                  ))}
                </ol>
              )}
              <div className={clusterClass}>
                {priorVersions.length > 0 ? (
                  <div className={fieldClass}>
                    <Label htmlFor="session-restore-version">Prior version to restore</Label>
                    <Select
                      value={restoreVersion === null ? "" : String(restoreVersion)}
                      disabled={busy || onRestore === undefined}
                      onValueChange={(value) => {
                        const next = Number(value);
                        setRestoreVersion(Number.isSafeInteger(next) ? next : null);
                      }}
                    >
                      <SelectTrigger id="session-restore-version">
                        <SelectValue placeholder="Choose a version" />
                      </SelectTrigger>
                      <SelectContent>
                        {priorVersions.map((entry) => (
                          <SelectItem
                            key={`${entry.id}-${entry.version}`}
                            value={String(entry.version)}
                          >
                            Version {entry.version} · {formatTime(entry.occurredAt)} ·{" "}
                            {entry.actorLabel ?? entry.actorId}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                <Button
                  variant="outline"
                  type="button"
                  disabled={
                    busy ||
                    onRestore === undefined ||
                    selected === undefined ||
                    restoreVersion === null
                  }
                  onClick={() => {
                    if (
                      selected !== undefined &&
                      restoreVersion !== null &&
                      onRestore !== undefined
                    )
                      void onRestore({
                        sessionId: selected.id,
                        version: restoreVersion,
                        expectedVersion: selected.version,
                      });
                  }}
                >
                  Restore selected prior version
                </Button>
                {onRestore === undefined ? (
                  <span className={mutedClass}>
                    Version restore is not supported by the current API.
                  </span>
                ) : null}
              </div>
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SpeakerEditor({
  eventId,
  sessions,
  profiles,
  assets,
  busy,
  speakerContentHistory,
  onSaveBiography,
  onReplaceHeadshot,
  onRestoreSpeakerContentVersion,
}: Readonly<{
  readonly eventId: string;
  readonly sessions: readonly DeliverableSession[];
  profiles: readonly DeliverableSpeakerProfile[];
  assets: readonly DeliverableAsset[];
  busy: boolean;
  speakerContentHistory?: Readonly<Record<string, DeliverableSpeakerContentHistoryState>>;
  onSaveBiography?: (input: {
    readonly participantId: string;
    readonly biography: string;
    readonly expectedVersion: number;
  }) => Promise<void>;
  onReplaceHeadshot?: (input: {
    readonly submissionId: string;
    readonly participantId: string;
    readonly file: File;
    readonly supersedesAssetId?: string;
  }) => Promise<void>;
  onRestoreSpeakerContentVersion?: (input: {
    readonly participantId: string;
    readonly version: number;
    readonly expectedVersion: number;
  }) => Promise<void>;
}>) {
  const [participantId, setParticipantId] = useState(profiles[0]?.participantId ?? "");
  const selected =
    profiles.find((profile) => profile.participantId === participantId) ?? profiles[0];
  const [headshotSubmissionId, setHeadshotSubmissionId] = useState<string | null>(null);
  const eligibleHeadshotSessions = useMemo(
    () =>
      selected === undefined
        ? []
        : eligibleSpeakerHeadshotSessions(sessions, eventId, selected.participantId),
    [eventId, selected, sessions],
  );
  const selectedHeadshotSubmissionId = resolveSpeakerHeadshotSubmissionId(
    sessions,
    eventId,
    selected?.participantId ?? "",
    headshotSubmissionId,
  );
  const [biography, setBiography] = useState(selected?.biography ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const historyState =
    speakerContentHistory?.[selected?.participantId ?? ""] ?? speakerContentHistoryEmpty();
  const history = sortedSpeakerContentHistory(historyState.entries);
  const priorVersions = history
    .filter((entry) => selected !== undefined && entry.version < selected.version)
    .sort((left, right) => right.version - left.version);
  const [restoreVersion, setRestoreVersion] = useState<number | null>(
    priorVersions[0]?.version ?? null,
  );

  useEffect(() => {
    setBiography(selected?.biography ?? "");
    setFormError(null);
    setRestoreVersion(priorVersions[0]?.version ?? null);
  }, [selected, priorVersions[0]?.version]);

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (selected === undefined || onSaveBiography === undefined) {
      setFormError(
        "Speaker editing is unavailable because the private profile API does not grant organizer access.",
      );
      return;
    }
    setFormError(null);
    await onSaveBiography({
      participantId: selected.participantId,
      biography,
      expectedVersion: selected.version,
    });
  }

  const headshot =
    selected === undefined
      ? undefined
      : assets.find((asset) => asset.id === selected.headshotAssetId);

  return (
    <Card className={sectionClass} aria-labelledby="speaker-content-heading">
      <CardHeader className={clusterClass}>
        <div>
          <p className={mutedClass}>Secondary Content section</p>
          <CardTitle id="speaker-content-heading">Speaker bio and headshot</CardTitle>
          <CardDescription>Profile changes remain event-scoped.</CardDescription>
        </div>
        <Badge variant="outline">Authorized profiles</Badge>
      </CardHeader>
      <CardContent className={stackClass}>
        {profiles.length === 0 ? (
          <p className={mutedClass}>No authorized speaker profiles were returned.</p>
        ) : (
          <>
            <div className={fieldClass}>
              <Label htmlFor="speaker-selector">Speaker</Label>
              <Select value={selected?.participantId ?? ""} onValueChange={setParticipantId}>
                <SelectTrigger id="speaker-selector">
                  <SelectValue placeholder="Choose a speaker" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((profile) => (
                    <SelectItem key={profile.participantId} value={profile.participantId}>
                      {profile.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selected === undefined ? null : (
              <dl aria-label="Organizer speaker profile metadata" className={gridClass}>
                <div>
                  <dt>Job title</dt>
                  <dd>{selected.jobTitle ?? "Not provided"}</dd>
                </div>
                <div>
                  <dt>Company</dt>
                  <dd>{selected.company ?? "Not provided"}</dd>
                </div>
                <div>
                  <dt>Profile status</dt>
                  <dd>
                    {selected.status === undefined ? "Not recorded" : formatStatus(selected.status)}
                  </dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{selected.email ?? "Not provided"}</dd>
                </div>
                <div>
                  <dt>Social profiles</dt>
                  <dd>
                    {Object.entries(selected.socialLinks ?? selected.social ?? {}).length === 0
                      ? "Not provided"
                      : Object.entries(selected.socialLinks ?? selected.social ?? {})
                          .map(([network, value]) => `${formatStatus(network)}: ${value}`)
                          .join(" · ")}
                  </dd>
                </div>
                <div>
                  <dt>Travel metadata</dt>
                  <dd>
                    {selected.travelLogistics === undefined
                      ? "Not recorded"
                      : `${selected.travelLogistics.travelRequired ? "Travel required" : "No travel required"} · arrival ${selected.travelLogistics.arrivalAt ?? "not recorded"} · departure ${selected.travelLogistics.departureAt ?? "not recorded"}`}
                  </dd>
                </div>
                <div>
                  <dt>Profile version</dt>
                  <dd>
                    v{selected.version} · updated {formatTime(selected.updatedAt)}
                  </dd>
                </div>
              </dl>
            )}
            <form onSubmit={(event) => void save(event)} className={stackClass}>
              <div className={fieldClass}>
                <Label htmlFor="speaker-biography">Biography</Label>
                <Textarea
                  id="speaker-biography"
                  rows={6}
                  value={biography}
                  onChange={(event) => setBiography(event.currentTarget.value)}
                />
              </div>
              {eligibleHeadshotSessions.length > 1 ? (
                <div className={fieldClass}>
                  <Label htmlFor="speaker-headshot-session">Session for headshot replacement</Label>
                  <Select
                    value={headshotSubmissionId ?? ""}
                    onValueChange={(value) => {
                      setHeadshotSubmissionId(value);
                      setFormError(null);
                    }}
                  >
                    <SelectTrigger id="speaker-headshot-session">
                      <SelectValue placeholder="Choose an accepted session" />
                    </SelectTrigger>
                    <SelectContent>
                      {eligibleHeadshotSessions.map((session) => (
                        <SelectItem key={session.id} value={session.id}>
                          {session.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : eligibleHeadshotSessions.length === 0 ? (
                <p className={mutedClass} role="status">
                  Headshot replacement requires an accepted session owned by this speaker.
                </p>
              ) : null}
              <div className={fieldClass}>
                <Label htmlFor="speaker-headshot">Replace headshot</Label>
                <Input
                  id="speaker-headshot"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={
                    onReplaceHeadshot === undefined || busy || selectedHeadshotSubmissionId === null
                  }
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (
                      file === undefined ||
                      selected === undefined ||
                      onReplaceHeadshot === undefined
                    )
                      return;
                    if (selectedHeadshotSubmissionId === null) {
                      setFormError(
                        eligibleHeadshotSessions.length > 1
                          ? "Choose an accepted session before replacing this headshot."
                          : "Headshot replacement requires an accepted session owned by this speaker.",
                      );
                      return;
                    }
                    setFormError(null);
                    void onReplaceHeadshot({
                      submissionId: selectedHeadshotSubmissionId,
                      participantId: selected.participantId,
                      file,
                      ...(headshot === undefined ? {} : { supersedesAssetId: headshot.id }),
                    });
                  }}
                />
              </div>
              <small className={mutedClass}>
                Accepted headshot types: JPEG, PNG, or WebP; maximum size 5 MB.{" "}
                {onReplaceHeadshot === undefined
                  ? "Organizer headshot replacement is unavailable because the private staged-upload endpoint is not provisioned."
                  : "The replacement is staged through a private upload grant, uploaded, finalized as ready, and linked to this event-scoped speaker profile."}
              </small>
              {formError !== null ? (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              ) : null}
              <Button type="submit" disabled={busy || onSaveBiography === undefined}>
                {busy
                  ? "Saving speaker…"
                  : onSaveBiography === undefined
                    ? "Speaker editing unavailable"
                    : "Save speaker biography"}
              </Button>
            </form>
            <p className={mutedClass}>
              Current headshot: {headshot?.fileName ?? "No headshot returned"}
              {headshot === undefined
                ? ""
                : ` · ${formatStatus(headshot.kind)} · ${headshot.contentType} · ${headshot.sizeBytes} bytes · v${headshot.version ?? 1}`}
            </p>
            <section aria-labelledby="speaker-content-history-heading" className={stackClass}>
              <h3 id="speaker-content-history-heading">Speaker content history</h3>
              {historyState.status === "loading" ? (
                <p role="status">Loading speaker content history…</p>
              ) : historyState.status === "error" ? (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>
                    Speaker content history could not be loaded.{" "}
                    {historyState.error ?? "The history request failed."}
                  </AlertDescription>
                </Alert>
              ) : historyState.status === "empty" ? (
                <p className={mutedClass}>
                  No speaker content history was returned. Restore is unavailable without an
                  immutable prior version.
                </p>
              ) : (
                <ol aria-label="Speaker content history">
                  {history.map((entry, index) => {
                    const previous = index === 0 ? undefined : history[index - 1];
                    const changedFields = speakerContentChangedFields(entry, previous);
                    return (
                      <li key={entry.id}>
                        <div>
                          <strong>Version {entry.version}</strong> ·{" "}
                          {entry.action === undefined ? "Changed" : formatStatus(entry.action)} ·{" "}
                          {formatTime(entry.occurredAt)} · {entry.actorLabel ?? entry.actorId}
                        </div>
                        <div>
                          <strong>Changed fields:</strong>{" "}
                          {changedFields.length === 0
                            ? "No field differences returned."
                            : changedFields.map((field) => field.label).join(", ")}
                        </div>
                        {changedFields.length > 0 ? (
                          <ul>
                            {changedFields.map((field) => (
                              <li key={`${entry.id}-${field.label}`}>
                                <strong>{field.label}:</strong>{" "}
                                {previous === undefined
                                  ? field.current
                                  : `${field.previous} → ${field.current}`}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              )}
              <div className={clusterClass}>
                {priorVersions.length === 0 ? (
                  <span className={mutedClass}>
                    Restore is unavailable without an immutable prior speaker content version.
                  </span>
                ) : (
                  <>
                    <div className={fieldClass}>
                      <Label htmlFor="speaker-restore-version">Prior version to restore</Label>
                      <Select
                        value={restoreVersion === null ? "" : String(restoreVersion)}
                        disabled={busy || onRestoreSpeakerContentVersion === undefined}
                        onValueChange={(value) => {
                          const next = Number(value);
                          setRestoreVersion(Number.isSafeInteger(next) ? next : null);
                        }}
                      >
                        <SelectTrigger id="speaker-restore-version">
                          <SelectValue placeholder="Choose a version" />
                        </SelectTrigger>
                        <SelectContent>
                          {priorVersions.map((entry) => (
                            <SelectItem
                              key={`${entry.id}-${entry.version}`}
                              value={String(entry.version)}
                            >
                              Version {entry.version} · {formatTime(entry.occurredAt)} ·{" "}
                              {entry.actorLabel ?? entry.actorId}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      variant="outline"
                      type="button"
                      disabled={
                        busy ||
                        onRestoreSpeakerContentVersion === undefined ||
                        selected === undefined ||
                        restoreVersion === null
                      }
                      onClick={() => {
                        if (
                          selected !== undefined &&
                          restoreVersion !== null &&
                          onRestoreSpeakerContentVersion !== undefined
                        )
                          void onRestoreSpeakerContentVersion({
                            participantId: selected.participantId,
                            version: restoreVersion,
                            expectedVersion: selected.version,
                          });
                      }}
                    >
                      {busy ? "Restoring speaker content…" : "Restore selected speaker version"}
                    </Button>
                    {onRestoreSpeakerContentVersion === undefined ? (
                      <span className={mutedClass}>
                        Speaker content restore is not supported by the current API.
                      </span>
                    ) : null}
                  </>
                )}
              </div>
            </section>
          </>
        )}
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
  onExportDeliverables,
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
  const [selectedExportTaskIds, setSelectedExportTaskIds] = useState<readonly string[]>([]);
  const [speakerFilter, setSpeakerFilter] = useState("all");
  const [taskFilter, setTaskFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [outstandingOnly, setOutstandingOnly] = useState(false);
  const [reminderPreviewOpen, setReminderPreviewOpen] = useState(false);

  useEffect(() => {
    const taskIds = new Set(rows.map((row) => row.task.id));
    setSelectedTaskIds((current) => current.filter((taskId) => taskIds.has(taskId)));
    setSelectedExportTaskIds((current) => current.filter((taskId) => taskIds.has(taskId)));
  }, [rows]);

  useEffect(() => {
    if (speakerFilter !== "all" && !rows.some((row) => row.task.participantId === speakerFilter))
      setSpeakerFilter("all");
    if (taskFilter !== "all" && !rows.some((row) => row.task.id === taskFilter))
      setTaskFilter("all");
  }, [rows, speakerFilter, taskFilter]);

  const exportableRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          selectedExportTaskIds.includes(row.task.id) &&
          (speakerFilter === "all" || row.task.participantId === speakerFilter) &&
          (taskFilter === "all" || row.task.id === taskFilter) &&
          row.currentAsset?.state === "ready" &&
          row.currentAsset.currentVersionId === row.currentAsset.id &&
          statusMatches(row.status, statusFilter) &&
          (!outstandingOnly || isOutstanding(row.status)),
      ),
    [outstandingOnly, rows, selectedExportTaskIds, speakerFilter, statusFilter, taskFilter],
  );
  const exportSelection = useMemo<DeliverableExportInput | null>(() => {
    const assetIds = exportableRows.flatMap((row) =>
      row.currentAsset === undefined ? [] : [row.currentAsset.id],
    );
    if (assetIds.length === 0) return null;
    return {
      assetIds,
      taskIds: exportableRows.map((row) => row.task.id),
      participantIds: [...new Set(exportableRows.map((row) => row.task.participantId))],
    };
  }, [exportableRows]);

  const selectedAsset =
    selectedAssetId === null
      ? undefined
      : matrixAssetsForView.find((asset) => asset.id === selectedAssetId);
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
        Skip to {filesMode ? "Files library" : "deliverables workspace"}
      </a>
      <div className={styles.content}>
        <Card className={styles.header}>
          <CardHeader className={clusterClass}>
            <div>
              <p className={styles.eyebrow}>Organizer event workspace</p>
              <h1>{filesMode ? "Files" : "Deliverables"}</h1>
              <p className={styles.lede}>
                {filesMode
                  ? "Authorized uploaded-asset library for review, history, comments, and downloads."
                  : "Organizer-created speaker requests, task status, and follow-up tracking."}
              </p>
            </div>
            <Badge variant="outline">
              {filesMode
                ? `${matrixAssetsForView.length} asset projection${matrixAssetsForView.length === 1 ? "" : "s"}`
                : `${rows.length} task${rows.length === 1 ? "" : "s"}`}
            </Badge>
          </CardHeader>
          <CardContent className={styles.switcherWrap}>
            <nav
              className={styles.modeNav}
              aria-label="Deliverables and Files mode switcher"
              data-mode-switcher
            >
              <a href={deliverablesHref} aria-current={!filesMode ? "page" : undefined}>
                Deliverables <span>Requests &amp; tracking</span>
              </a>
              <a href={filesHref} aria-current={filesMode ? "page" : undefined}>
                Files <span>Authorized uploaded assets</span>
              </a>
            </nav>
            <details className={styles.mobileSwitcher}>
              <summary>Switch section: {filesMode ? "Files" : "Deliverables"}</summary>
              <nav aria-label="Mobile section switcher">
                <a href={deliverablesHref}>Deliverables — Requests &amp; tracking</a>
                <a href={filesHref}>Files — Authorized uploaded assets</a>
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
                  : "Deliverables action was not completed."}
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
          {capabilityMessages.length > 0 ? (
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
                  {filesMode ? "Loading Files library" : "Loading deliverables"}
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
              <TaskComposer
                participants={participants}
                busy={busy}
                {...(onCreateTask === undefined ? {} : { onCreateTask })}
              />
              <DeliverablesTable
                rows={rows}
                selectedTaskIds={selectedTaskIds}
                selectedExportTaskIds={selectedExportTaskIds}
                onToggleTask={(taskId) =>
                  setSelectedTaskIds((current) =>
                    current.includes(taskId)
                      ? current.filter((candidate) => candidate !== taskId)
                      : [...current, taskId],
                  )
                }
                onToggleExportTask={(taskId) =>
                  setSelectedExportTaskIds((current) =>
                    current.includes(taskId)
                      ? current.filter((candidate) => candidate !== taskId)
                      : [...current, taskId],
                  )
                }
                onInspectAsset={(assetId) => onInspectAsset?.(assetId)}
                onPreviewReminders={() => setReminderPreviewOpen(true)}
                speakerFilter={speakerFilter}
                taskFilter={taskFilter}
                statusFilter={statusFilter}
                outstandingOnly={outstandingOnly}
                onSpeakerFilter={setSpeakerFilter}
                onTaskFilter={setTaskFilter}
                onStatusFilter={setStatusFilter}
                onOutstandingOnly={setOutstandingOnly}
                busy={busy}
                exportAvailable={onExportDeliverables !== undefined}
                exportableCount={exportableRows.length}
                onExport={() => {
                  if (onExportDeliverables !== undefined && exportSelection !== null)
                    void onExportDeliverables(exportSelection);
                }}
              />
            </>
          ) : null}
          {filesMode ? (
            <FileLibrary
              assets={assets}
              sessions={sessions}
              tasks={tasks}
              profiles={profiles}
              {...(matrixItems === undefined ? {} : { matrixItems })}
              busy={busy}
              {...(onInspectAsset === undefined ? {} : { onInspectAsset })}
              {...(onExportFiles === undefined ? {} : { onExport: onExportFiles })}
            />
          ) : null}
          {!filesMode ? (
            <Dialog open={reminderPreviewOpen} onOpenChange={setReminderPreviewOpen}>
              <DialogContent className={styles.dialogContent}>
                <DialogHeader>
                  <DialogTitle>Reminder recipient preview</DialogTitle>
                  <DialogDescription>
                    Review the exact outstanding task snapshot before sending.
                  </DialogDescription>
                </DialogHeader>
                <ReminderPreview
                  rows={rows}
                  selectedTaskIds={selectedTaskIds}
                  busy={busy}
                  sendAvailable={onSendBulkReminder !== undefined}
                  onSend={() => {
                    const selected = rows.filter(
                      (row) => selectedTaskIds.includes(row.task.id) && isOutstanding(row.status),
                    );
                    const effective =
                      selectedTaskIds.length > 0
                        ? selected
                        : rows.filter((row) => isOutstanding(row.status));
                    const recipientIds = [
                      ...new Set(effective.map((row) => row.task.participantId)),
                    ];
                    void onSendBulkReminder?.({
                      taskIds: effective.map((row) => row.task.id),
                      recipientIds,
                    });
                    setReminderPreviewOpen(false);
                  }}
                />
              </DialogContent>
            </Dialog>
          ) : null}
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
                    {...(onDownloadVersion === undefined ? {} : { onDownload: onDownloadVersion })}
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
          {selectedAssetId !== null ? (
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
              <h2 id="secondary-content-heading">Content</h2>
              <p className={mutedClass}>
                Session content and speaker profiles live in this secondary section, below request
                tracking.
              </p>
              <SessionEditor
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
              <SpeakerEditor
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
  eventId,
  organizationId,
  mode = "deliverables",
  api: providedApi,
  initialData,
}: DeliverablesWorkspaceProps) {
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
