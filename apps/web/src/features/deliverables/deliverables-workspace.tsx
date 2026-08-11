"use client";

import {
  type CSSProperties,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createDeliverablesApi,
  type DeliverableAsset,
  type DeliverableAssetHistoryEntry,
  type DeliverableAssetKind,
  type DeliverableComment,
  type DeliverableDownloadGrant,
  type DeliverableExportDownload,
  type DeliverableExportInput,
  type DeliverableMatrixItem,
  type DeliverableMatrixStatus,
  type DeliverableReviewInput,
  type DeliverableReviewState,
  type DeliverableSession,
  type DeliverableSpeakerProfile,
  type DeliverablesApi,
  type DeliverableTask,
  type DeliverableTaskInput,
  type DeliverableTaskMatrix,
  DeliverablesApiError,
  deliverableAssetKinds,
} from "./api";

const pageStyle: CSSProperties = {
  minHeight: "100dvh",
  padding: "2rem 1rem 4rem",
  background: "var(--color-canvas, #f5f6f9)",
};
const contentStyle: CSSProperties = { width: "min(100%, 86rem)", margin: "0 auto" };
const cardStyle: CSSProperties = {
  padding: "1.25rem",
  border: "1px solid var(--color-border, #dfe2e8)",
  borderRadius: "0.875rem",
  background: "var(--color-surface, #fff)",
  boxShadow: "var(--shadow-card, 0 8px 24px rgb(29 34 51 / 6%))",
};
const fieldStyle: CSSProperties = { display: "grid", gap: "0.35rem" };
const inputStyle: CSSProperties = {
  width: "100%",
  padding: "0.6rem 0.7rem",
  border: "1px solid var(--color-border-strong, #cdd1da)",
  borderRadius: "0.5rem",
  font: "inherit",
};
const buttonStyle: CSSProperties = {
  padding: "0.62rem 0.9rem",
  border: "1px solid var(--color-brand, #5065e8)",
  borderRadius: "0.5rem",
  background: "var(--color-brand, #5065e8)",
  color: "white",
  font: "inherit",
  fontWeight: 700,
  cursor: "pointer",
};
const secondaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  borderColor: "var(--color-border-strong, #cdd1da)",
  background: "var(--color-surface, #fff)",
  color: "var(--color-ink, #25272d)",
};
const mutedStyle: CSSProperties = { color: "var(--color-muted, #697181)" };
const rowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.65rem",
  alignItems: "center",
};
const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 17rem), 1fr))",
  gap: "0.9rem",
};
const dangerStyle: CSSProperties = { ...cardStyle, borderColor: "#b42318" };

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
    queued: "The authorized ZIP request is queued.",
    preparing: "The server request is being prepared.",
    generating: "The server is generating the ZIP from selected latest assets.",
    ready: "The server returned a validated ZIP response.",
    "download-started": "The browser download has started.",
    failure: "The authorized ZIP request failed.",
  };
export const deliverablesExportActionLabels: Readonly<Record<DeliverablesExportUiStatus, string>> =
  {
    idle: "Download selected files ZIP",
    queued: "ZIP export queued",
    preparing: "Preparing ZIP…",
    generating: "Generating ZIP…",
    ready: "Download ready ZIP",
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

export interface DeliverablesSnapshot {
  readonly sessions: readonly DeliverableSession[];
  readonly tasks: readonly DeliverableTask[];
  readonly assets: readonly DeliverableAsset[];
  readonly profiles: readonly DeliverableSpeakerProfile[];
  readonly matrix?: DeliverableTaskMatrix;
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
  readonly matrixItems?: readonly DeliverableMatrixItem[];
  readonly loading?: boolean;
  readonly busy?: boolean;
  readonly error?: string | null;
  readonly statusMessage?: string | null;
  readonly capabilityMessages?: readonly string[];
  readonly operationStates?: readonly DeliverablesOperationState[];
  readonly apiConfigured?: boolean;
  readonly onCreateTask?: (input: DeliverableTaskInput) => Promise<void>;
  readonly onInspectAsset?: (assetId: string) => void;
  readonly selectedAssetId?: string | null;
  readonly assetHistory?: readonly DeliverableAssetHistoryEntry[];
  readonly comments?: readonly DeliverableComment[];
  readonly loadingAssetDetails?: boolean;
  readonly onAddComment?: (input: {
    readonly assetId: string;
    readonly body: string;
  }) => Promise<void>;
  readonly onDownloadVersion?: (assetId: string) => Promise<void>;
  readonly onExportDeliverables?: (input: DeliverableExportInput) => Promise<void>;
  readonly onExportFiles?: (
    input: DeliverableExportInput,
  ) => Promise<DeliverableExportDownload | undefined>;
  readonly onReviewAsset?: (input: {
    readonly assetId: string;
    readonly state: DeliverableReviewState;
    readonly note?: string;
  }) => Promise<void>;
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
  readonly onSaveBiography?: (input: {
    readonly participantId: string;
    readonly biography: string;
    readonly expectedVersion: number;
  }) => Promise<void>;
  readonly onReplaceHeadshot?: (input: {
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

function assetSessionId(
  asset: DeliverableAsset,
  tasksById: ReadonlyMap<string, DeliverableTask>,
): string {
  return asset.submissionId ?? tasksById.get(asset.taskId ?? "")?.submissionId ?? "";
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
    const session = sessionBySubmission.get(task.submissionId);
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
    const session = sessionBySubmission.get(task.submissionId);
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

function TaskComposer({
  participants,
  busy,
  onCreateTask,
}: Readonly<{
  participants: readonly { readonly id: string; readonly label: string }[];
  busy: boolean;
  onCreateTask?: (input: DeliverableTaskInput) => Promise<void>;
}>) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [mimeTypes, setMimeTypes] = useState("application/pdf");
  const [maxSizeMb, setMaxSizeMb] = useState("100");
  const [acceptedAssetKinds, setAcceptedAssetKinds] = useState<readonly DeliverableAssetKind[]>([
    "slides",
  ]);
  const [assigneeIds, setAssigneeIds] = useState<readonly string[]>([]);
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
    if (onCreateTask === undefined) {
      setFormError(
        "Task creation is unavailable because no organizer task endpoint is provisioned.",
      );
      return;
    }
    setFormError(null);
    await onCreateTask({
      title: normalizedTitle,
      description: normalizedDescription,
      dueAt: normalizedDueAt,
      allowedMimeTypes: normalizedMimeTypes,
      maxSizeBytes: maxSize * 1024 * 1024,
      assigneeIds,
      acceptedAssetKinds,
    });
    setTitle("");
    setDescription("");
    setDueAt("");
  }

  return (
    <section style={cardStyle} aria-labelledby="create-task-heading">
      <div style={rowStyle}>
        <div style={{ flex: "1 1 28rem" }}>
          <p style={mutedStyle}>Collection setup</p>
          <h2 id="create-task-heading">Create a file-request task</h2>
        </div>
        <span style={mutedStyle}>Speaker assignments are event-scoped.</span>
      </div>
      <p style={mutedStyle}>
        Define the request before saving. Speakers can upload only the selected asset kinds, MIME
        types, and maximum size; the private asset service enforces this policy again at upload
        time.
      </p>
      <form onSubmit={(event) => void submit(event)} style={{ display: "grid", gap: "0.9rem" }}>
        <div style={gridStyle}>
          <label style={fieldStyle}>
            <span>Task name</span>
            <input
              style={inputStyle}
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
              placeholder="Upload Session Presentation"
              required
            />
          </label>
          <label style={fieldStyle}>
            <span>Due date</span>
            <input
              style={inputStyle}
              type="date"
              value={dueAt}
              onChange={(event) => setDueAt(event.currentTarget.value)}
              required
            />
          </label>
        </div>
        <label style={fieldStyle}>
          <span>Instructions</span>
          <textarea
            style={inputStyle}
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.currentTarget.value)}
            placeholder="Final slide deck as a PDF, 16:9 aspect ratio."
            required
          />
        </label>
        <fieldset
          style={{
            border: "1px solid var(--color-border, #dfe2e8)",
            borderRadius: "0.5rem",
            padding: "0.75rem",
          }}
          aria-describedby="asset-kind-help"
        >
          <legend>Accepted asset kinds (required)</legend>
          <div style={{ display: "grid", gap: "0.45rem" }}>
            {deliverableAssetKinds.map((kind) => (
              <label key={kind} style={rowStyle}>
                <input
                  type="checkbox"
                  checked={acceptedAssetKinds.includes(kind)}
                  onChange={() => toggleAssetKind(kind)}
                />
                <span>{formatStatus(kind)}</span>
              </label>
            ))}
          </div>
          <small id="asset-kind-help" style={mutedStyle}>
            Select one or more kinds. Selected:{" "}
            {acceptedAssetKinds.length === 0
              ? "None — choose at least one."
              : acceptedAssetKinds.map(formatStatus).join(", ")}
            .
          </small>
        </fieldset>
        <div style={gridStyle}>
          <label style={fieldStyle}>
            <span>Allowed MIME types</span>
            <input
              style={inputStyle}
              value={mimeTypes}
              onChange={(event) => setMimeTypes(event.currentTarget.value)}
              aria-describedby="mime-help"
            />
            <small id="mime-help" style={mutedStyle}>
              Comma-separated values, for example application/pdf.
            </small>
          </label>
          <label style={fieldStyle}>
            <span>Maximum file size (MB)</span>
            <input
              style={inputStyle}
              type="number"
              min={1}
              step={1}
              value={maxSizeMb}
              onChange={(event) => setMaxSizeMb(event.currentTarget.value)}
            />
          </label>
        </div>
        <fieldset
          style={{
            border: "1px solid var(--color-border, #dfe2e8)",
            borderRadius: "0.5rem",
            padding: "0.75rem",
          }}
        >
          <legend>Assignees</legend>
          {participants.length === 0 ? (
            <p style={mutedStyle}>
              No authorized speaker records were returned. Task creation cannot be assigned safely.
            </p>
          ) : (
            <div style={{ display: "grid", gap: "0.45rem" }}>
              {participants.map((participant) => (
                <label key={participant.id} style={rowStyle}>
                  <input
                    type="checkbox"
                    checked={assigneeIds.includes(participant.id)}
                    onChange={() => toggleAssignee(participant.id)}
                  />
                  <span>{participant.label}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
        {formError !== null ? <p role="alert">{formError}</p> : null}
        <button style={buttonStyle} type="submit" disabled={busy || onCreateTask === undefined}>
          {busy
            ? "Saving task…"
            : onCreateTask === undefined
              ? "Task creation unavailable"
              : "Save file-request task"}
        </button>
      </form>
    </section>
  );
}

function DeliverablesTable({
  rows,
  selectedTaskIds,
  onToggleTask,
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
  onToggleTask: (taskId: string) => void;
  onInspectAsset: (assetId: string) => void;
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
    <section style={cardStyle} aria-labelledby="tracking-heading">
      <div style={rowStyle}>
        <div style={{ flex: "1 1 28rem" }}>
          <p style={mutedStyle}>Organizer tracking</p>
          <h2 id="tracking-heading">Deliverables dashboard</h2>
        </div>
        <span>{visibleRows.length} visible</span>
      </div>
      <div style={{ ...gridStyle, margin: "1rem 0" }}>
        <label style={fieldStyle}>
          <span>Filter by speaker</span>
          <select
            style={inputStyle}
            value={speakerFilter}
            onChange={(event) => onSpeakerFilter(event.currentTarget.value)}
          >
            <option value="all">All speakers</option>
            {speakers.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label style={fieldStyle}>
          <span>Filter by task</span>
          <select
            style={inputStyle}
            value={taskFilter}
            onChange={(event) => onTaskFilter(event.currentTarget.value)}
          >
            <option value="all">All tasks</option>
            {tasks.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label style={fieldStyle}>
          <span>Filter by status</span>
          <select
            style={inputStyle}
            value={statusFilter}
            onChange={(event) => onStatusFilter(event.currentTarget.value)}
          >
            <option value="all">All statuses</option>
            <option value="pending">Incomplete / pending</option>
            <option value="uploaded">Uploaded / complete</option>
            <option value="needs_changes">Needs changes</option>
            <option value="overdue">Overdue</option>
          </select>
        </label>
        <label style={{ ...fieldStyle, alignContent: "end" }}>
          <span>Outstanding filter</span>
          <span style={rowStyle}>
            <input
              type="checkbox"
              checked={outstandingOnly}
              onChange={(event) => onOutstandingOnly(event.currentTarget.checked)}
            />
            Outstanding only
          </span>
        </label>
      </div>
      <div style={{ ...rowStyle, marginBottom: "0.8rem" }}>
        <button
          style={secondaryButtonStyle}
          type="button"
          onClick={onPreviewReminders}
          disabled={incompleteCount === 0}
        >
          Preview reminder recipients ({incompleteCount})
        </button>
        <button
          style={secondaryButtonStyle}
          type="button"
          aria-describedby="deliverables-export-help"
          disabled={busy || onExport === undefined || !exportAvailable || exportableCount === 0}
          onClick={onExport}
        >
          {busy ? "Preparing ZIP…" : "Download selected deliverables ZIP"}
        </button>
        <span id="deliverables-export-help" style={mutedStyle}>
          {!exportAvailable
            ? "ZIP export is unavailable because the organizer export capability is not provisioned."
            : exportableCount === 0
              ? "Select at least one uploaded deliverable to download a ZIP."
              : `${exportableCount} selected deliverable${exportableCount === 1 ? "" : "s"} eligible for export.`}
        </span>
        <span style={mutedStyle}>Select rows below to narrow the preview.</span>
      </div>
      {visibleRows.length === 0 ? (
        <p style={mutedStyle}>No speaker-task pairs match these filters.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <caption>Per-speaker file-request status and due dates</caption>
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Select</span>
                </th>
                <th scope="col">Speaker</th>
                <th scope="col">Session</th>
                <th scope="col">Task</th>
                <th scope="col">Due date</th>
                <th scope="col">Status</th>
                <th scope="col">Versions</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const status = row.status;
                const versionCount =
                  row.currentAsset === undefined
                    ? 0
                    : row.assets.filter(
                        (asset) =>
                          assetFamily(asset) === assetFamily(row.currentAsset as DeliverableAsset),
                      ).length;
                return (
                  <tr key={row.task.id}>
                    <td>
                      <input
                        aria-label={`Select ${row.speakerLabel} ${row.task.title}`}
                        type="checkbox"
                        checked={selectedTaskIds.includes(row.task.id)}
                        onChange={() => onToggleTask(row.task.id)}
                      />
                    </td>
                    <th scope="row">{row.speakerLabel}</th>
                    <td>{row.sessionLabel}</td>
                    <td>
                      {row.task.title}
                      <br />
                      <small style={mutedStyle}>
                        {row.task.description ?? "No instructions returned"}
                      </small>
                    </td>
                    <td>{formatDate(row.task.dueAt)}</td>
                    <td>
                      <span>{formatStatus(status)}</span>
                    </td>
                    <td>
                      {versionCount === 0
                        ? "—"
                        : `${versionCount} version${versionCount === 1 ? "" : "s"}`}
                    </td>
                    <td>
                      {row.currentAsset === undefined ? (
                        <span style={mutedStyle}>No upload</span>
                      ) : (
                        <button
                          style={{ ...secondaryButtonStyle, padding: "0.35rem 0.5rem" }}
                          type="button"
                          onClick={() => onInspectAsset(row.currentAsset?.id ?? "")}
                        >
                          Inspect versions
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
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
        const authoritativeId = authoritativeCurrentByFamily.get(familyId);
        const current =
          versions.find((asset) => asset.id === authoritativeId) ?? latestAsset(versions);
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
  const sessionGroups = useMemo(() => {
    const grouped = new Map<string, typeof visibleRows>();
    for (const row of visibleRows) {
      const group = grouped.get(row.sessionId);
      if (group === undefined) grouped.set(row.sessionId, [row]);
      else group.push(row);
    }
    return [...grouped.entries()].sort((left, right) =>
      (left[1][0]?.sessionTitle ?? "").localeCompare(right[1][0]?.sessionTitle ?? ""),
    );
  }, [visibleRows]);
  const currentById = useMemo(() => new Map(rows.map((row) => [row.current.id, row])), [rows]);
  const selectableVisibleIds = visibleRows
    .filter((row) => row.authoritative && row.current.state === "ready")
    .map((row) => row.current.id);
  const selectedReadyIds = selectedAssetIds.filter((assetId) => {
    const row = currentById.get(assetId);
    return row?.authoritative === true && row.current.state === "ready";
  });
  const allVisibleSelected =
    selectableVisibleIds.length > 0 &&
    selectableVisibleIds.every((assetId) => selectedAssetIds.includes(assetId));
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

  function toggleAssets(assetIds: readonly string[]): void {
    if (assetIds.length === 0) return;
    const allSelected = assetIds.every((assetId) => selectedAssetIds.includes(assetId));
    setSelectedAssetIds((current) =>
      allSelected
        ? current.filter((assetId) => !assetIds.includes(assetId))
        : [...new Set([...current, ...assetIds])],
    );
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
      if (download === undefined) {
        throw new Error("The ZIP export returned no download response.");
      }
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
    <section style={cardStyle} aria-labelledby="file-library-heading" data-files-library>
      <div style={rowStyle}>
        <div style={{ flex: "1 1 28rem" }}>
          <p style={mutedStyle}>Asset-centric Files library</p>
          <h2 id="file-library-heading">All authorized speaker files</h2>
        </div>
        <span>{families.length} version families</span>
      </div>
      <p style={mutedStyle}>
        Rows use the server-authoritative current version when the matrix returns one. Families
        without a confirmed current version remain visible but cannot be selected for ZIP export.
        Filename, session, speaker, upload date, review state, history, downloads, and comments stay
        event-scoped.
      </p>
      <p style={mutedStyle}>
        Choose View version history to open authorized Download version controls for each immutable
        version and the Add a comment thread for this asset family.
      </p>
      <div style={{ ...gridStyle, margin: "1rem 0" }}>
        <label style={fieldStyle}>
          <span>Filter files</span>
          <input
            style={inputStyle}
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="Filename, speaker, or session"
          />
        </label>
        <label style={fieldStyle}>
          <span>Filter by speaker</span>
          <select
            style={inputStyle}
            value={speakerFilter}
            onChange={(event) => setSpeakerFilter(event.currentTarget.value)}
          >
            <option value="all">All speakers</option>
            {[...new Map(rows.map((row) => [row.current.participantId, row.speaker])).entries()]
              .sort((left, right) => left[1].localeCompare(right[1]))
              .map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
          </select>
        </label>
        <label style={fieldStyle}>
          <span>Filter by session</span>
          <select
            style={inputStyle}
            value={sessionFilter}
            onChange={(event) => setSessionFilter(event.currentTarget.value)}
          >
            <option value="all">All sessions</option>
            {[...new Map(rows.map((row) => [row.sessionId, row.sessionTitle])).entries()]
              .sort((left, right) => left[1].localeCompare(right[1]))
              .map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
          </select>
        </label>
        <label style={fieldStyle}>
          <span>Filter by review state</span>
          <select
            style={inputStyle}
            value={reviewFilter}
            onChange={(event) => setReviewFilter(event.currentTarget.value)}
          >
            <option value="all">All review states</option>
            <option value="pending">Pending review</option>
            <option value="approved">Approved</option>
            <option value="needs_changes">Needs changes</option>
          </select>
        </label>
      </div>
      <section aria-labelledby="file-session-selection-heading" style={{ marginBottom: "1rem" }}>
        <h3 id="file-session-selection-heading">Select sessions</h3>
        {sessionGroups.length === 0 ? (
          <p style={mutedStyle}>No sessions match the current file filters.</p>
        ) : (
          <div style={{ display: "grid", gap: "0.35rem" }}>
            {sessionGroups.map(([sessionId, group]) => {
              const selectableIds = group
                .filter((row) => row.authoritative && row.current.state === "ready")
                .map((row) => row.current.id);
              const checked =
                selectableIds.length > 0 &&
                selectableIds.every((assetId) => selectedAssetIds.includes(assetId));
              return (
                <label key={sessionId || `unassigned-${group[0]?.current.id}`} style={rowStyle}>
                  <input
                    type="checkbox"
                    aria-label={`Select session ${group[0]?.sessionTitle ?? "Session unavailable"}`}
                    checked={checked}
                    disabled={selectableIds.length === 0}
                    onChange={() => toggleAssets(selectableIds)}
                  />
                  <span>
                    {group[0]?.sessionTitle ?? "Session unavailable"} · {selectableIds.length}{" "}
                    latest ready asset{selectableIds.length === 1 ? "" : "s"}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </section>
      <div style={{ ...rowStyle, marginBottom: "0.8rem" }}>
        <button
          style={secondaryButtonStyle}
          type="button"
          disabled={selectableVisibleIds.length === 0}
          onClick={() => toggleAssets(selectableVisibleIds)}
        >
          {allVisibleSelected ? "Clear visible selection" : "Select all visible latest files"}
        </button>
        <button
          style={secondaryButtonStyle}
          type="button"
          disabled={
            busy ||
            exportInFlight ||
            (!downloadReady && (onExport === undefined || selectedReadyIds.length === 0))
          }
          onClick={() => (downloadReady ? startReadyDownload() : void exportSelected())}
        >
          {deliverablesExportActionLabels[exportStatus]}
        </button>
        <span style={mutedStyle}>
          {onExport === undefined
            ? "Bulk ZIP export is unavailable because the authorized export capability is not provisioned."
            : selectedReadyIds.length === 0
              ? "Select at least one latest ready asset."
              : `${selectedReadyIds.length} latest asset${selectedReadyIds.length === 1 ? "" : "s"} selected.`}
        </span>
      </div>
      {exportStatus !== "idle" ? (
        <div
          role={exportStatus === "failure" ? "alert" : "status"}
          aria-live="polite"
          data-export-status={exportStatus}
          style={{ ...cardStyle, marginBottom: "1rem" }}
        >
          <strong>ZIP export status: {exportStatus}</strong>
          <p>{statusDescription[exportStatus]}</p>
          {exportStatusHistory.length > 1 ? (
            <small style={mutedStyle}>Progress: {exportStatusHistory.join(" → ")}</small>
          ) : null}
        </div>
      ) : null}
      {families.length === 0 ? (
        <p style={mutedStyle}>No private speaker files have been uploaded.</p>
      ) : visibleRows.length === 0 ? (
        <p style={mutedStyle}>No files match these filters.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <caption>Latest authorized file metadata across every speaker</caption>
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Select</span>
                  <input
                    type="checkbox"
                    aria-label="Select all visible latest files"
                    checked={allVisibleSelected}
                    disabled={selectableVisibleIds.length === 0}
                    onChange={() => toggleAssets(selectableVisibleIds)}
                  />
                </th>
                <th scope="col">Filename</th>
                <th scope="col">Speaker</th>
                <th scope="col">Session</th>
                <th scope="col">Upload date</th>
                <th scope="col">Review state</th>
                <th scope="col">Versions / history</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(({ current, versions, sessionTitle, speaker, authoritative }) => (
                <tr
                  key={assetFamily(current)}
                  data-current-version={authoritative ? current.id : undefined}
                >
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${current.fileName}`}
                      checked={selectedAssetIds.includes(current.id)}
                      disabled={!authoritative || current.state !== "ready"}
                      onChange={() => toggleAsset(current.id)}
                    />
                  </td>
                  <th scope="row">
                    {current.fileName}
                    <br />
                    <small style={mutedStyle}>
                      {formatStatus(current.kind)} · {current.contentType} · {current.sizeBytes}{" "}
                      bytes
                      <br />
                      Asset {current.id} · family {current.versionFamilyId ?? current.id}
                    </small>
                  </th>
                  <td>{speaker}</td>
                  <td>{sessionTitle}</td>
                  <td>{formatTime(current.createdAt)}</td>
                  <td>{reviewStateForAsset(current)}</td>
                  <td>
                    <strong>
                      {authoritative
                        ? `Authoritative current v${current.version ?? 1}`
                        : `Latest projection v${current.version ?? 1}; current version unavailable`}{" "}
                      · {versions.length} version{versions.length === 1 ? "" : "s"}
                    </strong>
                    <br />
                    <button
                      style={{ ...secondaryButtonStyle, padding: "0.35rem 0.5rem" }}
                      type="button"
                      disabled={onInspectAsset === undefined}
                      onClick={() => onInspectAsset?.(current.id)}
                    >
                      {onInspectAsset === undefined
                        ? "History unavailable"
                        : "View version history"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
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
    <section style={cardStyle} aria-labelledby="reminder-preview-heading">
      <div style={rowStyle}>
        <div style={{ flex: "1 1 28rem" }}>
          <p style={mutedStyle}>Human review required</p>
          <h2 id="reminder-preview-heading">Reminder recipient preview</h2>
        </div>
        <span>
          {recipients.length} recipient{recipients.length === 1 ? "" : "s"}
        </span>
      </div>
      <p>
        Only the outstanding task snapshot below will be sent. No email is sent until you confirm
        this recipient list.
      </p>
      {recipients.length === 0 ? (
        <p style={mutedStyle}>No outstanding tasks are available for a reminder.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <caption>Explicit reminder recipients and outstanding tasks</caption>
            <thead>
              <tr>
                <th scope="col">Recipient</th>
                <th scope="col">Outstanding task</th>
                <th scope="col">Due date</th>
              </tr>
            </thead>
            <tbody>
              {effective.map((row) => (
                <tr key={`preview-${row.task.id}`}>
                  <th scope="row">{row.speakerLabel}</th>
                  <td>{row.task.title}</td>
                  <td>{formatDate(row.task.dueAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <label style={{ ...rowStyle, marginTop: "0.8rem" }}>
        <input
          type="checkbox"
          checked={confirmed}
          disabled={effective.length === 0 || !sendAvailable || busy}
          onChange={(event) =>
            setConfirmedSnapshotKey(event.currentTarget.checked ? snapshotKey : null)
          }
        />
        I confirm this exact outstanding recipient and task snapshot.
      </label>
      <div style={{ ...rowStyle, marginTop: "0.8rem" }}>
        <button
          style={buttonStyle}
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
        </button>
        {!sendAvailable ? (
          <span style={mutedStyle}>
            The transactional reminder endpoint is not provisioned; no send was attempted.
          </span>
        ) : null}
      </div>
    </section>
  );
}

function AssetDetail({
  asset,
  allAssets,
  history,
  comments,
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
  comments: readonly DeliverableComment[];
  authoritativeCurrentAssetId?: string;
  matrixAuthoritative: boolean;
  loading: boolean;
  busy: boolean;
  onDownload?: (assetId: string) => Promise<void>;
  onAddComment?: (body: string) => Promise<void>;
  onReview?: (state: DeliverableReviewState, note?: string) => Promise<void>;
  reviewAvailable: boolean;
}>) {
  const family = assetFamily(asset);
  const fallbackHistory = allAssets
    .filter((candidate) => assetFamily(candidate) === family)
    .sort((left, right) => (left.version ?? 0) - (right.version ?? 0));
  const versions = history.length > 0 ? history : fallbackHistory;
  const [commentBody, setCommentBody] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const thread = [...comments].sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) ||
      (left.version ?? 0) - (right.version ?? 0) ||
      left.id.localeCompare(right.id),
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
    await onAddComment(body);
    setCommentBody("");
  }

  return (
    <section style={cardStyle} aria-labelledby="asset-detail-heading">
      <div style={rowStyle}>
        <div style={{ flex: "1 1 24rem" }}>
          <p style={mutedStyle}>Private asset review</p>
          <h2 id="asset-detail-heading">{asset.fileName}</h2>
        </div>
        <span>
          {asset.contentType} · {Math.ceil(asset.sizeBytes / 1024)} KB
        </span>
      </div>
      <p style={mutedStyle}>
        Asset metadata is immutable. Each version remains independently accessible through a
        short-lived server capability; object keys are never shown here.
      </p>
      <h3>Version history</h3>
      {loading ? (
        <p role="status">Loading immutable versions and comments…</p>
      ) : versions.length === 0 ? (
        <p style={mutedStyle}>No version history was returned.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <caption>Immutable asset versions</caption>
            <thead>
              <tr>
                <th scope="col">Version</th>
                <th scope="col">Uploaded</th>
                <th scope="col">State</th>
                <th scope="col">Review state</th>
                <th scope="col">Current</th>
                <th scope="col">Download</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((version) => {
                const current =
                  authoritativeCurrentAssetId === undefined
                    ? !matrixAuthoritative && isCurrentAsset(version, versions)
                    : version.id === authoritativeCurrentAssetId;
                return (
                  <tr key={version.id}>
                    <th scope="row">v{version.version ?? 1}</th>
                    <td>{formatTime(version.createdAt)}</td>
                    <td>{formatStatus(version.state)}</td>
                    <td>{reviewStateForAsset(version)}</td>
                    <td>
                      {current ? (
                        <strong>Current</strong>
                      ) : matrixAuthoritative ? (
                        "Not current"
                      ) : (
                        "Previous"
                      )}
                    </td>
                    <td>
                      <button
                        style={{ ...secondaryButtonStyle, padding: "0.35rem 0.5rem" }}
                        type="button"
                        disabled={busy || onDownload === undefined}
                        onClick={() =>
                          onDownload === undefined ? undefined : void onDownload(version.id)
                        }
                      >
                        {onDownload === undefined ? "Download unavailable" : "Download version"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <h3>Cross-role comment thread</h3>
      <p style={mutedStyle}>
        Speaker and organizer replies are displayed together in the asset-family conversation using
        the author labels returned by the server.
      </p>
      {thread.length === 0 ? (
        <p style={mutedStyle}>No comments have been returned for this asset family.</p>
      ) : (
        <ol aria-label="Asset family comment thread">
          {thread.map((comment) => (
            <li key={comment.id}>
              <strong>{comment.authorLabel}</strong> ·{" "}
              <time dateTime={comment.createdAt}>{formatTime(comment.createdAt)}</time>
              <p>{comment.body}</p>
            </li>
          ))}
        </ol>
      )}
      <form
        onSubmit={(event) => void submitComment(event)}
        style={{ display: "grid", gap: "0.55rem" }}
      >
        <label style={fieldStyle}>
          <span>Reply to this asset-family thread</span>
          <textarea
            style={inputStyle}
            rows={3}
            value={commentBody}
            onChange={(event) => setCommentBody(event.currentTarget.value)}
            placeholder="Reply to the speaker…"
          />
        </label>
        {commentError !== null ? <p role="alert">{commentError}</p> : null}
        <button
          style={secondaryButtonStyle}
          type="submit"
          disabled={busy || onAddComment === undefined}
        >
          {onAddComment === undefined ? "Comments unavailable" : "Post organizer reply"}
        </button>
      </form>
      <h3>Review decision</h3>
      {reviewAvailable ? (
        <div style={{ display: "grid", gap: "0.55rem" }}>
          <label style={fieldStyle}>
            <span>Review note (optional)</span>
            <textarea
              style={inputStyle}
              rows={2}
              value={reviewNote}
              onChange={(event) => setReviewNote(event.currentTarget.value)}
            />
          </label>
          <div style={rowStyle}>
            <button
              style={buttonStyle}
              type="button"
              disabled={busy}
              onClick={() =>
                onReview === undefined
                  ? undefined
                  : void onReview("approved", reviewNote.trim() || undefined)
              }
            >
              Approve
            </button>
            <button
              style={secondaryButtonStyle}
              type="button"
              disabled={busy}
              onClick={() =>
                onReview === undefined
                  ? undefined
                  : void onReview("needs_changes", reviewNote.trim() || undefined)
              }
            >
              Needs changes
            </button>
          </div>
        </div>
      ) : (
        <p style={mutedStyle}>
          Organizer asset approval is unavailable because the private asset API exposes no review
          endpoint. No decision was fabricated.
        </p>
      )}
    </section>
  );
}

function SessionEditor({
  sessions,
  busy,
  onSave,
  onApprove,
  onRestore,
}: Readonly<{
  sessions: readonly DeliverableSession[];
  busy: boolean;
  onSave?: (input: {
    readonly sessionId: string;
    readonly expectedVersion: number;
    readonly title: string;
    readonly description: string;
  }) => Promise<void>;
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
  const [sessionId, setSessionId] = useState(sessions[0]?.id ?? "");
  const selected = sessions.find((session) => session.id === sessionId) ?? sessions[0];
  const [title, setTitle] = useState(selected?.title ?? "");
  const [description, setDescription] = useState(selected?.description ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const history =
    selected?.contentHistory !== undefined && selected.contentHistory.length > 0
      ? selected.contentHistory
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
    setRestoreVersion(priorVersions[0]?.version ?? null);
  }, [priorVersions]);

  useEffect(() => {
    setTitle(selected?.title ?? "");
    setDescription(selected?.description ?? "");
    setFormError(null);
  }, [selected]);

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
    <section style={cardStyle} aria-labelledby="session-content-heading">
      <div style={rowStyle}>
        <div style={{ flex: "1 1 28rem" }}>
          <p style={mutedStyle}>Central content</p>
          <h2 id="session-content-heading">Session title and abstract</h2>
        </div>
        <span style={mutedStyle}>Versioned admin session API</span>
      </div>
      {sessions.length === 0 ? (
        <>
          <p style={mutedStyle}>No sessions are available for this event.</p>
          {onSave === undefined ? (
            <p style={mutedStyle}>
              Session editing unavailable until the admin session API returns an event-qualified
              session.
            </p>
          ) : null}
        </>
      ) : (
        <>
          <div role="note" style={{ ...cardStyle, padding: "0.8rem" }}>
            <strong>Public approval gate</strong>
            <p style={{ margin: "0.35rem 0 0" }}>
              Only content marked Approved is eligible for public publication. Unapproved content is
              excluded from the public agenda and embeds.
            </p>
            <p style={{ margin: "0.35rem 0 0" }}>
              Review status: <strong>{selected?.contentStatus ?? "Not approved"}</strong>
            </p>
          </div>
          <label style={fieldStyle}>
            <span>Session</span>
            <select
              style={inputStyle}
              value={selected?.id ?? ""}
              onChange={(event) => setSessionId(event.currentTarget.value)}
            >
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.title}
                </option>
              ))}
            </select>
          </label>
          <form
            onSubmit={(event) => void save(event)}
            style={{ display: "grid", gap: "0.8rem", marginTop: "0.8rem" }}
          >
            <label style={fieldStyle}>
              <span>Title</span>
              <input
                style={inputStyle}
                value={title}
                onChange={(event) => setTitle(event.currentTarget.value)}
              />
            </label>
            <label style={fieldStyle}>
              <span>Abstract</span>
              <textarea
                style={inputStyle}
                rows={6}
                value={description}
                onChange={(event) => setDescription(event.currentTarget.value)}
              />
            </label>
            {formError !== null ? <p role="alert">{formError}</p> : null}
            <div style={rowStyle}>
              <button style={buttonStyle} type="submit" disabled={busy || onSave === undefined}>
                {busy
                  ? "Saving content…"
                  : onSave === undefined
                    ? "Session editing unavailable"
                    : "Save session content"}
              </button>
              {selected !== undefined && onApprove !== undefined ? (
                <>
                  <button
                    style={secondaryButtonStyle}
                    type="button"
                    disabled={busy}
                    onClick={() => void onApprove(selected, "Approved")}
                  >
                    Approve content
                  </button>
                  <button
                    style={secondaryButtonStyle}
                    type="button"
                    disabled={busy}
                    onClick={() => void onApprove(selected, "Needs changes")}
                  >
                    Mark needs changes
                  </button>
                </>
              ) : null}
            </div>
          </form>
          <h3>Change history</h3>
          {history.length === 0 ? (
            <p style={mutedStyle}>
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
          <div style={rowStyle}>
            {priorVersions.length > 0 ? (
              <label style={fieldStyle}>
                <span>Prior version to restore</span>
                <select
                  style={inputStyle}
                  value={restoreVersion ?? ""}
                  disabled={busy || onRestore === undefined}
                  onChange={(event) => {
                    const value = Number(event.currentTarget.value);
                    setRestoreVersion(Number.isSafeInteger(value) ? value : null);
                  }}
                >
                  {priorVersions.map((entry) => (
                    <option key={`${entry.id}-${entry.version}`} value={entry.version}>
                      Version {entry.version} · {formatTime(entry.occurredAt)} ·{" "}
                      {entry.actorLabel ?? entry.actorId}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <button
              style={secondaryButtonStyle}
              type="button"
              disabled={
                busy || onRestore === undefined || selected === undefined || restoreVersion === null
              }
              onClick={() => {
                if (selected !== undefined && restoreVersion !== null && onRestore !== undefined)
                  void onRestore({
                    sessionId: selected.id,
                    version: restoreVersion,
                    expectedVersion: selected.version,
                  });
              }}
            >
              Restore selected prior version
            </button>
            {onRestore === undefined ? (
              <span style={mutedStyle}>Version restore is not supported by the current API.</span>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

function SpeakerEditor({
  profiles,
  assets,
  busy,
  onSaveBiography,
  onReplaceHeadshot,
}: Readonly<{
  profiles: readonly DeliverableSpeakerProfile[];
  assets: readonly DeliverableAsset[];
  busy: boolean;
  onSaveBiography?: (input: {
    readonly participantId: string;
    readonly biography: string;
    readonly expectedVersion: number;
  }) => Promise<void>;
  onReplaceHeadshot?: (input: {
    readonly participantId: string;
    readonly file: File;
    readonly supersedesAssetId?: string;
  }) => Promise<void>;
}>) {
  const [participantId, setParticipantId] = useState(profiles[0]?.participantId ?? "");
  const selected =
    profiles.find((profile) => profile.participantId === participantId) ?? profiles[0];
  const [biography, setBiography] = useState(selected?.biography ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setBiography(selected?.biography ?? "");
    setFormError(null);
  }, [selected]);

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
    <section style={cardStyle} aria-labelledby="speaker-content-heading">
      <div style={rowStyle}>
        <div style={{ flex: "1 1 28rem" }}>
          <p style={mutedStyle}>Central content</p>
          <h2 id="speaker-content-heading">Speaker bio and headshot</h2>
        </div>
        <span style={mutedStyle}>Profile changes remain event-scoped</span>
      </div>
      {profiles.length === 0 ? (
        <p style={mutedStyle}>No authorized speaker profiles were returned.</p>
      ) : (
        <>
          <label style={fieldStyle}>
            <span>Speaker</span>
            <select
              style={inputStyle}
              value={selected?.participantId ?? ""}
              onChange={(event) => setParticipantId(event.currentTarget.value)}
            >
              {profiles.map((profile) => (
                <option key={profile.participantId} value={profile.participantId}>
                  {profile.displayName}
                </option>
              ))}
            </select>
          </label>
          {selected === undefined ? null : (
            <dl
              aria-label="Organizer speaker profile metadata"
              style={{ ...gridStyle, margin: "0.8rem 0" }}
            >
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
          <form
            onSubmit={(event) => void save(event)}
            style={{ display: "grid", gap: "0.8rem", marginTop: "0.8rem" }}
          >
            <label style={fieldStyle}>
              <span>Biography</span>
              <textarea
                style={inputStyle}
                rows={6}
                value={biography}
                onChange={(event) => setBiography(event.currentTarget.value)}
              />
            </label>
            <label style={fieldStyle}>
              <span>Replace headshot</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={onReplaceHeadshot === undefined || busy}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (
                    file !== undefined &&
                    selected !== undefined &&
                    onReplaceHeadshot !== undefined
                  )
                    void onReplaceHeadshot({
                      participantId: selected.participantId,
                      file,
                      ...(headshot === undefined ? {} : { supersedesAssetId: headshot.id }),
                    });
                }}
              />
            </label>
            <small style={mutedStyle}>
              Accepted headshot types: JPEG, PNG, or WebP; maximum size 5 MB.{" "}
              {onReplaceHeadshot === undefined
                ? "Organizer headshot replacement is unavailable because the private staged-upload endpoint is not provisioned."
                : "The replacement is staged through a private upload grant, uploaded, finalized as ready, and linked to this event-scoped speaker profile."}
            </small>
            {formError !== null ? <p role="alert">{formError}</p> : null}
            <button
              style={buttonStyle}
              type="submit"
              disabled={busy || onSaveBiography === undefined}
            >
              {busy
                ? "Saving speaker…"
                : onSaveBiography === undefined
                  ? "Speaker editing unavailable"
                  : "Save speaker biography"}
            </button>
          </form>
          <p style={mutedStyle}>
            Current headshot: {headshot?.fileName ?? "No headshot returned"}
            {headshot === undefined
              ? ""
              : ` · ${formatStatus(headshot.kind)} · ${headshot.contentType} · ${headshot.sizeBytes} bytes · v${headshot.version ?? 1}`}
            . Biography history and restore are unavailable until the profile version-history
            endpoint is provisioned.
          </p>
        </>
      )}
    </section>
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
  matrixItems,
  loading = false,
  busy = false,
  error = null,
  statusMessage = null,
  capabilityMessages = [],
  operationStates = [],
  apiConfigured = true,
  onCreateTask,
  onInspectAsset,
  selectedAssetId = null,
  assetHistory = [],
  comments = [],
  loadingAssetDetails = false,
  onAddComment,
  onDownloadVersion,
  onReviewAsset,
  onExportDeliverables,
  onExportFiles,
  onSendBulkReminder,
  onSaveSession,
  onApproveSession,
  onRestoreSessionVersion,
  onSaveBiography,
  onReplaceHeadshot,
  onRetry,
}: DeliverablesWorkspaceViewProps) {
  const filesMode = mode === "files";
  const rows = useMemo(
    () =>
      matrixItems === undefined
        ? taskRows(tasks, sessions, assets, profiles)
        : matrixRows(matrixItems, sessions, profiles),
    [assets, matrixItems, profiles, sessions, tasks],
  );
  const participants = useMemo(() => {
    const byId = new Map<string, string>();
    for (const profile of profiles) {
      byId.set(profile.participantId, profile.displayName);
    }
    for (const row of rows) {
      byId.set(row.task.participantId, row.speakerLabel);
    }
    return [...byId.entries()].map(([id, label]) => ({ id, label }));
  }, [profiles, rows]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<readonly string[]>([]);
  const [speakerFilter, setSpeakerFilter] = useState("all");
  const [taskFilter, setTaskFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [outstandingOnly, setOutstandingOnly] = useState(false);
  const [reminderPreviewOpen, setReminderPreviewOpen] = useState(false);
  useEffect(() => {
    const taskIds = new Set(rows.map((row) => row.task.id));
    setSelectedTaskIds((current) => current.filter((taskId) => taskIds.has(taskId)));
  }, [rows]);

  useEffect(() => {
    if (speakerFilter !== "all" && !rows.some((row) => row.task.participantId === speakerFilter)) {
      setSpeakerFilter("all");
    }
    if (taskFilter !== "all" && !rows.some((row) => row.task.id === taskFilter)) {
      setTaskFilter("all");
    }
  }, [rows, speakerFilter, taskFilter]);
  const exportableRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          selectedTaskIds.includes(row.task.id) &&
          (speakerFilter === "all" || row.task.participantId === speakerFilter) &&
          (taskFilter === "all" || row.task.id === taskFilter) &&
          row.currentAsset?.state === "ready" &&
          statusMatches(row.status, statusFilter) &&
          (!outstandingOnly || isOutstanding(row.status)),
      ),
    [outstandingOnly, rows, selectedTaskIds, speakerFilter, statusFilter, taskFilter],
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

  return (
    <div style={pageStyle} data-workspace-mode={mode}>
      <a
        href={filesMode ? "#files-content" : "#deliverables-content"}
        style={{ position: "absolute", left: "-10000px" }}
      >
        Skip to {filesMode ? "Files library" : "deliverables workspace"}
      </a>
      <div style={contentStyle}>
        <header style={{ ...cardStyle, marginBottom: "1rem" }}>
          <div style={rowStyle}>
            <div style={{ flex: "1 1 34rem" }}>
              <p style={mutedStyle}>
                Organizer · {organizationId} · event {eventId}
              </p>
              <h1>{filesMode ? "Files library" : "Content management and deliverables"}</h1>
              <p style={mutedStyle}>
                {filesMode
                  ? "Aggregate the latest authorized asset family versions for this event. Inspect immutable history, review state, comments, and short-lived per-version downloads without opening task management."
                  : "Collect speaker files, review immutable versions and comments, track every speaker-task pair, and edit approved session content from one event-qualified workspace."}
              </p>
            </div>
            <div>
              <strong>
                {filesMode
                  ? `${assets.length} asset projection${assets.length === 1 ? "" : "s"}`
                  : `${tasks.length} task${tasks.length === 1 ? "" : "s"}`}
              </strong>
              <br />
              <span style={mutedStyle}>
                {filesMode
                  ? `${new Set(assets.map(assetFamily)).size} version famil${new Set(assets.map(assetFamily)).size === 1 ? "y" : "ies"}`
                  : `${assets.length} private asset projection${assets.length === 1 ? "" : "s"}`}
              </span>
            </div>
          </div>
        </header>
        <main
          id={filesMode ? "files-content" : "deliverables-content"}
          tabIndex={-1}
          style={{ display: "grid", gap: "1rem" }}
        >
          {!apiConfigured ? (
            <div role="alert" style={dangerStyle}>
              <strong>
                {filesMode ? "Files API is not configured." : "Deliverables API is not configured."}
              </strong>
              <p>
                Set the event-scoped API URL before organizer data can be loaded. No task or asset
                action was attempted.
              </p>
            </div>
          ) : null}
          {error !== null ? (
            <div role="alert" style={dangerStyle}>
              <strong>
                {filesMode
                  ? "Files action was not completed."
                  : "Deliverables action was not completed."}
              </strong>
              <p>{error}</p>
              {onRetry !== undefined ? (
                <button style={secondaryButtonStyle} type="button" onClick={onRetry}>
                  Retry
                </button>
              ) : null}
            </div>
          ) : null}
          {capabilityMessages.length > 0 ? (
            <section style={cardStyle} aria-labelledby="capability-heading">
              <h2 id="capability-heading">Capability status</h2>
              <ul>
                {capabilityMessages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </section>
          ) : null}
          <div role="status" aria-live="polite">
            {statusMessage}
          </div>
          {operationStates.length > 0 ? (
            <section style={cardStyle} aria-labelledby="operation-status-heading">
              <h2 id="operation-status-heading">Organizer operation status</h2>
              <ul aria-live="polite">
                {operationStates.map((operation) => (
                  <li key={operation.key} data-operation-phase={operation.phase}>
                    <strong>{operation.label}</strong>: {formatStatus(operation.phase)} —{" "}
                    {operation.message}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {loading ? (
            <section style={cardStyle} role="status">
              <h2>{filesMode ? "Loading Files library" : "Loading deliverables"}</h2>
              <p>
                {filesMode
                  ? "Retrieving authorized event sessions, private asset projections, and speaker records."
                  : "Retrieving organization- and event-qualified sessions, tasks, private asset projections, and speaker records."}
              </p>
            </section>
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
                onToggleTask={(taskId) =>
                  setSelectedTaskIds((current) =>
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
                onOutstandingOnly={setOutstandingOnly}
                busy={busy}
                exportAvailable={onExportDeliverables !== undefined}
                exportableCount={exportableRows.length}
                onExport={() => {
                  if (onExportDeliverables !== undefined && exportSelection !== null) {
                    void onExportDeliverables(exportSelection);
                  }
                }}
                onTaskFilter={setTaskFilter}
                onStatusFilter={setStatusFilter}
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
          {!filesMode && reminderPreviewOpen ? (
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
                const recipientIds = [...new Set(effective.map((row) => row.task.participantId))];
                void onSendBulkReminder?.({
                  taskIds: effective.map((row) => row.task.id),
                  recipientIds,
                });
              }}
            />
          ) : null}
          {selectedAssetId !== null
            ? (() => {
                const selectedAsset = assets.find((asset) => asset.id === selectedAssetId);
                const authoritativeCurrentAsset =
                  selectedAsset === undefined
                    ? undefined
                    : matrixItems
                        ?.filter((item) =>
                          item.assets.some(
                            (candidate) => assetFamily(candidate) === assetFamily(selectedAsset),
                          ),
                        )
                        .flatMap((item) =>
                          item.currentAsset === undefined ? [] : [item.currentAsset],
                        )[0];
                return selectedAsset === undefined ? (
                  <section style={cardStyle} role="alert">
                    <p>The selected private asset is no longer present in this event projection.</p>
                  </section>
                ) : (
                  <AssetDetail
                    asset={selectedAsset}
                    allAssets={assets}
                    history={assetHistory}
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
                          onAddComment: async (body) =>
                            onAddComment({ assetId: selectedAsset.id, body }),
                        })}
                    {...(onReviewAsset === undefined
                      ? {}
                      : {
                          onReview: async (state, note) =>
                            onReviewAsset({
                              assetId: selectedAsset.id,
                              state,
                              ...(note === undefined ? {} : { note }),
                            }),
                        })}
                  />
                );
              })()
            : null}
          {!filesMode ? (
            <>
              <SessionEditor
                sessions={sessions}
                busy={busy}
                {...(onSaveSession === undefined ? {} : { onSave: onSaveSession })}
                {...(onApproveSession === undefined ? {} : { onApprove: onApproveSession })}
                {...(onRestoreSessionVersion === undefined
                  ? {}
                  : { onRestore: onRestoreSessionVersion })}
              />
              <SpeakerEditor
                profiles={profiles}
                assets={assets}
                busy={busy}
                {...(onSaveBiography === undefined ? {} : { onSaveBiography })}
                {...(onReplaceHeadshot === undefined ? {} : { onReplaceHeadshot })}
              />
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}

export function DeliverablesWorkspace({
  eventId,
  organizationId,
  mode = "deliverables",
  api: providedApi,
  initialData,
}: DeliverablesWorkspaceProps) {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  const api = useMemo(
    () =>
      providedApi ??
      (apiBaseUrl === undefined || apiBaseUrl.length === 0
        ? null
        : createDeliverablesApi(apiBaseUrl, organizationId, eventId)),
    [apiBaseUrl, eventId, organizationId, providedApi],
  );
  const [sessions, setSessions] = useState<readonly DeliverableSession[]>(
    initialData?.sessions ?? [],
  );
  const [tasks, setTasks] = useState<readonly DeliverableTask[]>(initialData?.tasks ?? []);
  const [assets, setAssets] = useState<readonly DeliverableAsset[]>(initialData?.assets ?? []);
  const [profiles, setProfiles] = useState<readonly DeliverableSpeakerProfile[]>(
    initialData?.profiles ?? [],
  );
  const [matrix, setMatrix] = useState<DeliverableTaskMatrix | undefined>(initialData?.matrix);
  const [loading, setLoading] = useState(initialData === undefined && api !== null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    api === null
      ? `The organizer ${mode === "files" ? "Files" : "deliverables"} API is not configured.`
      : null,
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [capabilityMessages, setCapabilityMessages] = useState<readonly string[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const selectedAssetIdRef = useRef<string | null>(selectedAssetId);
  selectedAssetIdRef.current = selectedAssetId;
  const [assetHistory, setAssetHistory] = useState<readonly DeliverableAssetHistoryEntry[]>([]);
  const [comments, setComments] = useState<readonly DeliverableComment[]>([]);
  const [loadingAssetDetails, setLoadingAssetDetails] = useState(false);
  const [operationStates, setOperationStates] = useState<
    Partial<Record<DeliverablesOperationKey, DeliverablesOperationState>>
  >({});

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

  async function refreshMatrix(): Promise<void> {
    if (api?.listDeliverableMatrix === undefined) return;
    try {
      const next = await api.listDeliverableMatrix();
      setMatrix(next);
      setTasks(next.items.map((item) => item.task));
    } catch (reason) {
      setError(
        `The operation succeeded, but the exact deliverables matrix could not be refreshed. ${messageFromError(reason)}`,
      );
    }
  }

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (api === null || initialData !== undefined) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const messages: string[] = [];
        const sessionsResult = await api
          .listSessions(signal)
          .then((value) => ({ ok: true as const, value }))
          .catch((reason: unknown) => ({ ok: false as const, reason }));
        if (sessionsResult.ok) {
          const listSessionContentHistory = api.listSessionContentHistory;
          if (mode === "files" || listSessionContentHistory === undefined) {
            setSessions(sessionsResult.value);
          } else {
            const sessionsWithHistory = await Promise.all(
              sessionsResult.value.map(async (session) => {
                try {
                  const contentHistory = await listSessionContentHistory(session.id, signal);
                  return { ...session, contentHistory };
                } catch {
                  return session;
                }
              }),
            );
            if (!signal?.aborted) setSessions(sessionsWithHistory);
          }
        } else setError(messageFromError(sessionsResult.reason));
        if (api.listDeliverableMatrix === undefined) {
          messages.push(
            "Exact task status and current-version tracking are unavailable: the organizer deliverables matrix endpoint is not provisioned.",
          );
          if (mode !== "files" && api.listTasks !== undefined) {
            const result = await api
              .listTasks(signal)
              .then((value) => ({ ok: true as const, value }))
              .catch((reason: unknown) => ({ ok: false as const, reason }));
            if (result.ok) setTasks(result.value);
            else messages.push(`Task tracking unavailable: ${messageFromError(result.reason)}`);
          }
        } else {
          const result = await api
            .listDeliverableMatrix(signal === undefined ? undefined : { signal })
            .then((value) => ({ ok: true as const, value }))
            .catch((reason: unknown) => ({ ok: false as const, reason }));
          if (result.ok) {
            setMatrix(result.value);
            setTasks(result.value.items.map((item) => item.task));
            const matrixAssets = new Map<string, DeliverableAsset>();
            for (const item of result.value.items) {
              for (const asset of item.assets) matrixAssets.set(asset.id, asset);
              if (item.currentAsset !== undefined)
                matrixAssets.set(item.currentAsset.id, item.currentAsset);
            }
            setAssets([...matrixAssets.values()]);
          } else {
            messages.push(
              `Exact deliverables matrix unavailable: ${messageFromError(result.reason)}`,
            );
          }
        }
        if (api.listAssets === undefined)
          messages.push(
            "Private asset library unavailable: no asset projection endpoint is provisioned.",
          );
        else {
          const result = await (signal === undefined
            ? api.listAssets()
            : api.listAssets({ signal })
          )
            .then((value) => ({ ok: true as const, value }))
            .catch((reason: unknown) => ({ ok: false as const, reason }));
          if (result.ok) setAssets(result.value);
          else
            messages.push(`Private asset library unavailable: ${messageFromError(result.reason)}`);
        }
        if (api.listProfiles === undefined) {
          messages.push(
            mode === "files"
              ? "Speaker labels are unavailable: the private profile endpoint is not provisioned for organizer access."
              : "Speaker profile editing unavailable: the private profile endpoint is not provisioned for organizer access.",
          );
        } else {
          const result = await api
            .listProfiles(signal)
            .then((value) => ({ ok: true as const, value }))
            .catch((reason: unknown) => ({ ok: false as const, reason }));
          if (result.ok) setProfiles(result.value);
          else
            messages.push(
              mode === "files"
                ? `Speaker labels unavailable: ${messageFromError(result.reason)}`
                : `Speaker profile editing unavailable: ${messageFromError(result.reason)}`,
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
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [api, initialData, mode],
  );

  useEffect(() => {
    if (initialData !== undefined) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [initialData, load]);

  useEffect(() => {
    if (selectedAssetId === null || api === null) return;
    const selected = assets.find((asset) => asset.id === selectedAssetId);
    if (selected === undefined) return;
    const controller = new AbortController();
    setLoadingAssetDetails(true);
    setAssetHistory([]);
    setComments([]);
    const historyPromise =
      api.getAssetHistory === undefined
        ? Promise.resolve<readonly DeliverableAssetHistoryEntry[]>([])
        : api
            .getAssetHistory(selected.id, controller.signal)
            .catch(() => [] as readonly DeliverableAssetHistoryEntry[]);
    const commentsPromise =
      api.listAssetComments === undefined
        ? Promise.resolve<readonly DeliverableComment[]>([])
        : api
            .listAssetComments(selected.id, controller.signal)
            .catch(() => [] as readonly DeliverableComment[]);
    void Promise.all([historyPromise, commentsPromise])
      .then(([history, nextComments]) => {
        if (controller.signal.aborted) return;
        setAssetHistory(history);
        setComments(nextComments);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingAssetDetails(false);
      });
    return () => controller.abort();
  }, [api, assets, selectedAssetId]);

  async function createTask(input: DeliverableTaskInput): Promise<void> {
    if (api?.createTask === undefined) {
      setError("Task creation is unavailable because no organizer task endpoint is provisioned.");
      return;
    }
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    recordOperation("task-create", "Create file-request task", "pending", "Request in progress.");
    try {
      const next = await api.createTask(input);
      setTasks((current) => [...current, next]);
      await refreshMatrix();
      setStatusMessage(
        `Task ${next.title} created for ${input.assigneeIds.length} speaker${input.assigneeIds.length === 1 ? "" : "s"}.`,
      );
      recordOperation(
        "task-create",
        "Create file-request task",
        "succeeded",
        `Created ${next.title}.`,
      );
    } catch (reason) {
      const message = messageFromError(reason);
      setError(message);
      recordOperation("task-create", "Create file-request task", "failed", message);
    } finally {
      setBusy(false);
    }
  }

  async function addComment(input: {
    readonly assetId: string;
    readonly body: string;
  }): Promise<void> {
    if (api?.addAssetComment === undefined) {
      setError(
        "Cross-role comments are unavailable because the private asset comment endpoint is not provisioned.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    recordOperation("asset-comment", "Reply to asset thread", "pending", "Reply in progress.");
    try {
      const next = await api.addAssetComment(input);
      if (selectedAssetIdRef.current === input.assetId) {
        setComments((current) => [...current, next]);
      }
      setStatusMessage("Comment added to the immutable asset thread.");
      recordOperation(
        "asset-comment",
        "Reply to asset thread",
        "succeeded",
        "Organizer reply added to the asset-family thread.",
      );
    } catch (reason) {
      const message = messageFromError(reason);
      setError(message);
      recordOperation("asset-comment", "Reply to asset thread", "failed", message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadVersion(assetId: string): Promise<void> {
    if (api?.getDownloadGrant === undefined) {
      setError(
        "Asset download is unavailable because no private download capability endpoint is provisioned.",
      );
      return;
    }
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
      const message = messageFromError(reason);
      setError(message);
      recordOperation("asset-download", "Download asset version", "failed", message);
    } finally {
      setBusy(false);
    }
  }
  async function requestExport(input: DeliverableExportInput): Promise<DeliverableExportDownload> {
    if (api?.exportDeliverables === undefined) {
      throw new Error("The authorized ZIP export capability is not provisioned for this event.");
    }
    const download = await api.exportDeliverables(input);
    if (download === undefined) {
      throw new Error("The ZIP export returned no download response.");
    }
    return download;
  }

  async function exportDeliverables(input: DeliverableExportInput): Promise<void> {
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
      triggerDeliverablesDownload(download);
      setStatusMessage(`${download.fileName} is ready to download.`);
      recordOperation(
        "deliverables-export",
        "Export deliverables ZIP",
        "succeeded",
        `${download.fileName} was validated and the browser download started.`,
      );
    } catch (reason) {
      const message = messageFromError(reason);
      setError(message);
      recordOperation("deliverables-export", "Export deliverables ZIP", "failed", message);
    } finally {
      setBusy(false);
    }
  }

  async function exportFiles(
    input: DeliverableExportInput,
  ): Promise<DeliverableExportDownload | undefined> {
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    recordOperation("files-export", "Export files ZIP", "pending", "ZIP request in progress.");
    try {
      const download = await requestExport(input);
      setStatusMessage(`${download.fileName} is ready for browser download.`);
      recordOperation(
        "files-export",
        "Export files ZIP",
        "succeeded",
        `${download.fileName} is ready for browser download.`,
      );
      return download;
    } catch (reason) {
      const message = messageFromError(reason);
      setError(message);
      recordOperation("files-export", "Export files ZIP", "failed", message);
      throw reason;
    } finally {
      setBusy(false);
    }
  }

  async function saveSession(input: {
    readonly sessionId: string;
    readonly expectedVersion: number;
    readonly title: string;
    readonly description: string;
  }): Promise<void> {
    if (api === null) return;
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const next = await api.updateSession(input);
      setSessions((current) => current.map((session) => (session.id === next.id ? next : session)));
      setStatusMessage(`Session content saved at version ${next.version}.`);
    } catch (reason) {
      setError(messageFromError(reason));
    } finally {
      setBusy(false);
    }
  }

  async function approveSession(
    session: DeliverableSession,
    contentStatus: "Approved" | "Needs changes",
  ): Promise<void> {
    if (api === null) return;
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const next = await api.updateSession({
        sessionId: session.id,
        expectedVersion: session.version,
        contentStatus,
      });
      setSessions((current) =>
        current.map((candidate) => (candidate.id === next.id ? next : candidate)),
      );
      setStatusMessage(`Session content status changed to ${contentStatus}.`);
    } catch (reason) {
      setError(messageFromError(reason));
    } finally {
      setBusy(false);
    }
  }

  async function saveBiography(input: {
    readonly participantId: string;
    readonly biography: string;
    readonly expectedVersion: number;
  }): Promise<void> {
    if (api?.updateBiography === undefined) {
      setError(
        "Speaker profile editing is unavailable because organizer profile access is not provisioned.",
      );
      return;
    }
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
    } catch (reason) {
      const message = messageFromError(reason);
      setError(message);
      recordOperation("biography-save", "Save speaker biography", "failed", message);
    } finally {
      setBusy(false);
    }
  }
  async function replaceHeadshot(input: {
    readonly participantId: string;
    readonly file: File;
    readonly supersedesAssetId?: string;
  }): Promise<void> {
    if (api?.replaceHeadshot === undefined) {
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
    } catch (reason) {
      const message = messageFromError(reason);
      setError(message);
      recordOperation("headshot-replace", "Replace speaker headshot", "failed", message);
    } finally {
      setBusy(false);
    }
  }

  async function sendBulkReminder(input: {
    readonly taskIds: readonly string[];
    readonly recipientIds: readonly string[];
  }): Promise<void> {
    if (api?.sendBulkReminder === undefined) {
      setError(
        "Bulk reminder sending is unavailable because no transactional reminder endpoint is provisioned.",
      );
      return;
    }
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
      const message = messageFromError(reason);
      setError(message);
      recordOperation("reminder-send", "Send outstanding reminders", "failed", message);
    } finally {
      setBusy(false);
    }
  }

  async function restoreSessionVersion(input: {
    readonly sessionId: string;
    readonly version: number;
    readonly expectedVersion: number;
  }): Promise<void> {
    if (api?.restoreSessionVersion === undefined) {
      setError("Session restore is unavailable because no restore endpoint is provisioned.");
      return;
    }
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const next = await api.restoreSessionVersion(input);
      setSessions((current) => current.map((session) => (session.id === next.id ? next : session)));
      setStatusMessage(`Session content restored to version ${input.version}.`);
    } catch (reason) {
      setError(messageFromError(reason));
    } finally {
      setBusy(false);
    }
  }

  const reviewAsset = api?.reviewAsset;
  const reviewAssetHandler =
    reviewAsset === undefined
      ? undefined
      : async (input: DeliverableReviewInput): Promise<void> => {
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
            setAssets((current) => current.map((asset) => (asset.id === next.id ? next : asset)));
            await refreshMatrix();
            setStatusMessage(`Asset review recorded as ${input.state}.`);
            recordOperation(
              "asset-review",
              "Review current asset",
              "succeeded",
              `Review recorded as ${formatStatus(input.state)}.`,
            );
          } catch (reason) {
            const message = messageFromError(reason);
            setError(message);
            recordOperation("asset-review", "Review current asset", "failed", message);
          } finally {
            setBusy(false);
          }
        };
  return (
    <DeliverablesWorkspaceView
      eventId={eventId}
      organizationId={organizationId}
      mode={mode}
      sessions={sessions}
      tasks={tasks}
      assets={assets}
      profiles={profiles}
      {...(matrix === undefined ? {} : { matrixItems: matrix.items })}
      loading={loading}
      busy={busy}
      error={error}
      statusMessage={statusMessage}
      capabilityMessages={capabilityMessages}
      operationStates={Object.values(operationStates).filter(
        (state): state is DeliverablesOperationState => state !== undefined,
      )}
      apiConfigured={api !== null}
      {...(api?.createTask === undefined ? {} : { onCreateTask: createTask })}
      onInspectAsset={setSelectedAssetId}
      selectedAssetId={selectedAssetId}
      assetHistory={assetHistory}
      comments={comments}
      loadingAssetDetails={loadingAssetDetails}
      {...(api?.addAssetComment === undefined ? {} : { onAddComment: addComment })}
      {...(api?.getDownloadGrant === undefined ? {} : { onDownloadVersion: downloadVersion })}
      {...(api?.exportDeliverables === undefined
        ? {}
        : mode === "files"
          ? { onExportFiles: exportFiles }
          : { onExportDeliverables: exportDeliverables })}
      {...(reviewAssetHandler === undefined ? {} : { onReviewAsset: reviewAssetHandler })}
      {...(api?.sendBulkReminder === undefined ? {} : { onSendBulkReminder: sendBulkReminder })}
      {...(api === null ? {} : { onSaveSession: saveSession, onApproveSession: approveSession })}
      {...(api?.restoreSessionVersion === undefined
        ? {}
        : { onRestoreSessionVersion: restoreSessionVersion })}
      {...(api?.updateBiography === undefined ? {} : { onSaveBiography: saveBiography })}
      {...(api?.replaceHeadshot === undefined ? {} : { onReplaceHeadshot: replaceHeadshot })}
    />
  );
}

export const DeliverablesDashboard = DeliverablesWorkspace;
export const DeliverablesDashboardView = DeliverablesWorkspaceView;
