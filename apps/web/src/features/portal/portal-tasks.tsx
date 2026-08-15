"use client";

import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from "react";
import {
  filterTasks,
  isTaskBlocked,
  portalSubmissionIdsMatch,
  taskPrimaryAction,
  taskStatusPresentation,
} from "./model";
import styles from "./portal.module.css";
import {
  portalFileStatus,
  portalReviewStatus,
  resolveAssetPointers as resolveSharedAssetPointers,
  assetPointerLabels as sharedAssetPointerLabels,
} from "./portal-assets";
import { usePortal } from "./portal-provider";
import { PortalTaskResponseEditor } from "./portal-task-response";
import {
  EmptyState,
  formatPortalDate,
  formatPortalFileSize,
  InlineMutationError,
  PageHeading,
  PortalContentState,
  Progress,
  portalAssetStateLabel,
  TaskStatusBadge,
} from "./portal-ui";
import type {
  PortalAsset,
  PortalAssetComment,
  PortalProfile,
  PortalSubmission,
  PortalTask,
} from "./types";

const filters: readonly { value: TaskFilter; label: string }[] = [
  { value: "all", label: "All tasks" },
  { value: "attention", label: "Needs attention" },
  { value: "finished", label: "Finished" },
];

export type TaskFilter = "all" | "attention" | "finished";
export type PortalTaskGroup = "content-requests" | "other-event-tasks";

export function portalTaskGroup(task: PortalTask): PortalTaskGroup {
  return task.type === "action" ? "other-event-tasks" : "content-requests";
}

type RuntimeRecord = Record<string, unknown>;

function asRecord(value: unknown): RuntimeRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as RuntimeRecord;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function hasOwn(record: RuntimeRecord, key: string): boolean {
  return Object.hasOwn(record, key);
}

export type TaskSubject =
  | { type: "participant"; participantId: string }
  | { type: "session"; participantId: string; submissionId: string };

export type TaskSubjectResolution =
  | { subject: TaskSubject; error: null }
  | { subject: null; error: string };

/** Reads the frozen participant/session subject without widening PortalTask globally. */
export function resolveTaskSubject(task: PortalTask): TaskSubjectResolution {
  const taskRecord = asRecord(task);
  const participantId = nonEmptyString(taskRecord?.participantId);
  const submissionId = taskRecord?.submissionId;
  const explicitSubject = asRecord(taskRecord?.subject);

  if (!participantId) {
    return { subject: null, error: "Task subject metadata is missing a participant." };
  }

  if (explicitSubject !== null) {
    const subjectType = explicitSubject.type;
    const subjectParticipantId = nonEmptyString(explicitSubject.participantId);
    if (subjectParticipantId !== participantId) {
      return { subject: null, error: "Task subject metadata does not match its participant." };
    }
    if (subjectType === "participant" && submissionId === null) {
      return { subject: { type: "participant", participantId }, error: null };
    }
    const subjectSubmissionId = nonEmptyString(explicitSubject.submissionId);
    if (
      subjectType === "session" &&
      subjectSubmissionId !== null &&
      typeof submissionId === "string" &&
      portalSubmissionIdsMatch(subjectSubmissionId, submissionId)
    ) {
      return {
        subject: { type: "session", participantId, submissionId: subjectSubmissionId },
        error: null,
      };
    }
    return { subject: null, error: "Task subject metadata is invalid or inconsistent." };
  }

  if (submissionId === null) {
    return { subject: { type: "participant", participantId }, error: null };
  }
  const normalizedSubmissionId = nonEmptyString(submissionId);
  if (normalizedSubmissionId !== null) {
    return {
      subject: { type: "session", participantId, submissionId: normalizedSubmissionId },
      error: null,
    };
  }
  return {
    subject: null,
    error: "Task subject metadata is missing a session or participant scope.",
  };
}

export interface TaskSubjectPresentation {
  label: string;
  description: string;
  error: string | null;
}

export function taskSubjectPresentation(
  task: PortalTask,
  profiles: readonly PortalProfile[],
  submissions: readonly PortalSubmission[],
): TaskSubjectPresentation {
  const resolution = resolveTaskSubject(task);
  if (resolution.subject === null) {
    return {
      label: "Subject unavailable",
      description: "This task cannot be safely scoped.",
      error: resolution.error,
    };
  }
  if (resolution.subject.type === "participant") {
    const profile = profiles.find(
      (candidate) =>
        candidate.eventId === task.eventId &&
        candidate.participantId === resolution.subject.participantId,
    );
    const taskParticipantName = nonEmptyString(asRecord(task)?.participantName);
    const displayName =
      profile?.displayName ?? taskParticipantName ?? resolution.subject.participantId;
    return {
      label: `Participant · ${displayName}`,
      description: "This requirement applies to your participant profile across accepted sessions.",
      error: null,
    };
  }

  const sessionSubject = resolution.subject;
  const submission = submissions.find(
    (candidate) =>
      candidate.eventId === task.eventId &&
      candidate.status === "accepted" &&
      candidate.participantIds.includes(sessionSubject.participantId) &&
      portalSubmissionIdsMatch(candidate.id, sessionSubject.submissionId),
  );
  if (!submission) {
    return {
      label: "Session unavailable",
      description: "The accepted session for this task could not be found.",
      error: "This session-scoped task has no matching accepted submission.",
    };
  }
  return {
    label: `Session · ${submission.title}`,
    description: "This requirement applies only to this accepted session.",
    error: null,
  };
}

export type TaskUploadPolicy =
  | {
      valid: true;
      allowedMimeTypes: readonly string[];
      maxBytes: number;
      error: null;
    }
  | {
      valid: false;
      allowedMimeTypes: readonly string[];
      maxBytes: number | null;
      error: string;
    };

/** Only the server's canonical allowedMimeTypes/maxBytes fields are accepted. */
export function getTaskUploadPolicy(task: PortalTask): TaskUploadPolicy {
  const taskRecord = asRecord(task);
  const rawMimeTypes = taskRecord?.allowedMimeTypes;
  const allowedMimeTypes = Array.isArray(rawMimeTypes)
    ? rawMimeTypes
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    : [];
  const mimePolicyValid =
    Array.isArray(rawMimeTypes) &&
    rawMimeTypes.length > 0 &&
    allowedMimeTypes.length === rawMimeTypes.length;
  const rawMaxBytes = taskRecord?.maxBytes;
  const maxBytes =
    typeof rawMaxBytes === "number" && Number.isSafeInteger(rawMaxBytes) && rawMaxBytes > 0
      ? rawMaxBytes
      : null;

  if (!mimePolicyValid) {
    return {
      valid: false,
      allowedMimeTypes,
      maxBytes,
      error: "Upload policy unavailable: the server did not provide a valid MIME allowlist.",
    };
  }
  if (maxBytes === null) {
    return {
      valid: false,
      allowedMimeTypes,
      maxBytes,
      error: "Upload policy unavailable: the server did not provide a valid byte limit.",
    };
  }
  return { valid: true, allowedMimeTypes, maxBytes, error: null };
}

export function mimeTypeAllowed(contentType: string, allowedMimeTypes: readonly string[]): boolean {
  const normalizedType = contentType.trim().toLowerCase();
  if (!normalizedType) return false;
  return allowedMimeTypes.some((candidate) => {
    const normalizedCandidate = candidate.trim().toLowerCase();
    return (
      normalizedCandidate === normalizedType ||
      normalizedCandidate === "*/*" ||
      (normalizedCandidate.endsWith("/*") &&
        normalizedType.startsWith(normalizedCandidate.slice(0, -1)))
    );
  });
}

export type TaskUploadValidation = { valid: true } | { valid: false; error: string };

export function validateTaskUpload(
  file: Pick<File, "type" | "size">,
  policy: TaskUploadPolicy,
): TaskUploadValidation {
  if (!policy.valid) {
    return { valid: false, error: policy.error };
  }
  if (!mimeTypeAllowed(file.type, policy.allowedMimeTypes)) {
    return {
      valid: false,
      error: `This file type is not allowed. Accepted types: ${policy.allowedMimeTypes.join(", ")}.`,
    };
  }
  if (!Number.isFinite(file.size) || file.size < 0 || file.size > policy.maxBytes) {
    return {
      valid: false,
      error: `This file exceeds the ${formatPortalFileSize(policy.maxBytes)} task limit.`,
    };
  }
  return { valid: true };
}

const assetPointerFields = [
  "latestVersionId",
  "currentVersionId",
  "approvedVersionId",
  "releasedVersionId",
] as const;
type AssetPointerField = (typeof assetPointerFields)[number];

export type AssetPointerSnapshot = {
  status: "ready" | "missing-metadata" | "conflict";
  latestVersionId: string | null;
  currentVersionId: string | null;
  approvedVersionId: string | null;
  releasedVersionId: string | null;
  error: string | null;
};

/** Combines server pointer metadata without deriving state from ordering or timestamps. */
function authoritativePointerAssets(assets: readonly PortalAsset[]): readonly PortalAsset[] {
  if (assets.length <= 1) return assets;
  const supersededIds = new Set(
    assets.flatMap((asset) => {
      const supersededId = nonEmptyString(asRecord(asset)?.supersedesAssetId);
      return supersededId === null ? [] : [supersededId];
    }),
  );
  const terminalAssets = assets.filter((asset) => !supersededIds.has(asset.id));
  return terminalAssets.length === 1 ? terminalAssets : assets;
}

export function resolveAssetPointers(
  assets: readonly PortalAsset[],
  pointerSource?: unknown,
): AssetPointerSnapshot {
  const sourceRecords: RuntimeRecord[] = [];
  const sourceRecord = asRecord(pointerSource);
  if (sourceRecord !== null) {
    sourceRecords.push(sourceRecord);
    const nestedPointers = asRecord(sourceRecord.assetPointers);
    if (nestedPointers !== null) sourceRecords.push(nestedPointers);
  }
  for (const asset of authoritativePointerAssets(assets)) {
    const record = asRecord(asset);
    if (record !== null) sourceRecords.push(record);
  }

  const values: Record<AssetPointerField, string | null> = {
    latestVersionId: null,
    currentVersionId: null,
    approvedVersionId: null,
    releasedVersionId: null,
  };
  let conflict = false;
  let hasPointerMetadata = false;
  for (const field of assetPointerFields) {
    const candidates = new Set<string>();
    let invalid = false;
    for (const record of sourceRecords) {
      if (!hasOwn(record, field)) continue;
      hasPointerMetadata = true;
      const value = record[field];
      if (value === null || value === undefined) continue;
      if (typeof value !== "string" || value.trim().length === 0) {
        invalid = true;
        continue;
      }
      candidates.add(value.trim());
    }
    if (invalid || candidates.size > 1) {
      conflict = true;
    } else if (candidates.size === 1) {
      values[field] = [...candidates][0] ?? null;
    }
  }

  if (conflict) {
    return {
      status: "conflict",
      ...values,
      error: "The server returned conflicting asset pointer metadata.",
    };
  }
  if (!hasPointerMetadata || values.latestVersionId === null) {
    return {
      status: "missing-metadata",
      ...values,
      error: "Authoritative asset pointer metadata is missing.",
    };
  }
  return { status: "ready", ...values, error: null };
}

export function assetVersionId(asset: PortalAsset): string {
  const versionId = nonEmptyString(asRecord(asset)?.versionId);
  return versionId ?? asset.id;
}

function assetMatchesPointer(asset: PortalAsset, pointerId: string): boolean {
  return asset.id === pointerId || assetVersionId(asset) === pointerId;
}

export type TaskAssetResolution = {
  status: "empty" | "ready" | "pending" | "rejected" | "missing-metadata" | "conflict";
  assets: readonly PortalAsset[];
  pointers: AssetPointerSnapshot;
  latest: PortalAsset | undefined;
  current: PortalAsset | undefined;
  approved: PortalAsset | undefined;
  released: PortalAsset | undefined;
  error: string | null;
};

function assetsForTask(task: PortalTask, assets: readonly PortalAsset[]): PortalAsset[] {
  const subject = resolveTaskSubject(task).subject;
  return assets.filter((asset) => {
    if (
      asset.eventId !== task.eventId ||
      asset.taskId !== task.id ||
      asset.participantId !== task.participantId
    ) {
      return false;
    }
    if (subject === null) {
      return false;
    }
    if (subject.type === "participant") {
      return asset.submissionId === undefined || asset.submissionId === null;
    }
    return (
      asset.submissionId !== undefined &&
      asset.submissionId !== null &&
      portalSubmissionIdsMatch(asset.submissionId, subject.submissionId)
    );
  });
}

/** Selects versions by authoritative pointer IDs; it never falls back to array order. */
export function resolveTaskAsset(
  task: PortalTask,
  assets: readonly PortalAsset[],
): TaskAssetResolution {
  const matchingAssets = assetsForTask(task, assets);
  const pointers = resolveSharedAssetPointers(matchingAssets, task);
  if (matchingAssets.length === 0) {
    return {
      status: "empty",
      assets: matchingAssets,
      pointers,
      latest: undefined,
      current: undefined,
      approved: undefined,
      released: undefined,
      error: null,
    };
  }
  if (pointers.status !== "ready") {
    return {
      status: pointers.status,
      assets: matchingAssets,
      pointers,
      latest: matchingAssets.length === 1 ? matchingAssets[0] : undefined,
      current: undefined,
      approved: undefined,
      released: undefined,
      error: pointers.error,
    };
  }

  const findPointerAsset = (pointerId: string | null): PortalAsset | undefined => {
    if (pointerId === null) return undefined;
    const matches = matchingAssets.filter((asset) => assetMatchesPointer(asset, pointerId));
    return matches.length === 1 ? matches[0] : undefined;
  };
  const latest = findPointerAsset(pointers.latestVersionId);
  const current = findPointerAsset(pointers.currentVersionId);
  const approved = findPointerAsset(pointers.approvedVersionId);
  const released = findPointerAsset(pointers.releasedVersionId);
  if (
    latest === undefined ||
    (pointers.currentVersionId !== null && current === undefined) ||
    (pointers.approvedVersionId !== null && approved === undefined) ||
    (pointers.releasedVersionId !== null && released === undefined)
  ) {
    return {
      status: "conflict",
      assets: matchingAssets,
      pointers,
      latest,
      current,
      approved,
      released,
      error: "The server asset pointers reference a version that is not available.",
    };
  }
  const status =
    latest.state === "pending_upload"
      ? "pending"
      : latest.state === "rejected"
        ? "rejected"
        : "ready";
  return {
    status,
    assets: matchingAssets,
    pointers,
    latest,
    current,
    approved,
    released,
    error: null,
  };
}

export function assetPointerLabels(
  asset: PortalAsset,
  pointers: AssetPointerSnapshot,
): readonly string[] {
  if (pointers.status !== "ready") return [];
  const labels: string[] = [];
  const matches = (pointerId: string | null) =>
    pointerId !== null && assetMatchesPointer(asset, pointerId);
  if (matches(pointers.latestVersionId)) labels.push("Latest");
  if (matches(pointers.currentVersionId)) labels.push("Current");
  if (matches(pointers.approvedVersionId)) labels.push("Approved");
  if (matches(pointers.releasedVersionId)) labels.push("Released");
  return labels;
}

/** Filters comments by immutable asset ID and, when present, immutable version ID. */
export function commentsForAsset(
  asset: PortalAsset,
  comments: readonly PortalAssetComment[],
): PortalAssetComment[] {
  const versionId = assetVersionId(asset);
  return comments.filter((comment) => {
    if (comment.assetId !== asset.id) return false;
    const commentVersionId = nonEmptyString(asRecord(comment)?.versionId);
    return (
      commentVersionId === null || commentVersionId === asset.id || commentVersionId === versionId
    );
  });
}

function mergePortalAssets(
  viewAssets: readonly PortalAsset[],
  workspaceAssets: readonly PortalAsset[],
): PortalAsset[] {
  const byId = new Map<string, PortalAsset>();
  for (const asset of viewAssets) byId.set(asset.id, asset);
  for (const asset of workspaceAssets) {
    if (!byId.has(asset.id)) byId.set(asset.id, asset);
  }
  return [...byId.values()];
}

export function PortalTasks() {
  return (
    <PortalContentState>
      <PortalTasksContent />
    </PortalContentState>
  );
}

function PortalTasksContent() {
  const { view } = usePortal();
  const [filter, setFilter] = useState<TaskFilter>("all");
  if (!view) {
    return null;
  }
  const visibleTasks = filterTasks(view.tasks, filter);
  const contentRequests = visibleTasks.filter(
    (task) => portalTaskGroup(task) === "content-requests",
  );
  const otherEventTasks = visibleTasks.filter(
    (task) => portalTaskGroup(task) === "other-event-tasks",
  );
  const completed = view.tasks.filter(
    (task) => task.status === "completed" || task.status === "waived",
  ).length;
  const completionPercent =
    view.tasks.length === 0 ? 100 : Math.round((completed / view.tasks.length) * 100);

  return (
    <>
      <PageHeading
        eyebrow="Accepted speaker checklist"
        title="Requests & tasks"
        description="Respond to event-team content requests and complete other actions for your accepted sessions."
      />
      <InlineMutationError />

      <section className={`${styles.panel} ${styles.taskProgressPanel}`}>
        <div>
          <strong>
            {completed} of {view.tasks.length} complete
          </strong>
          <p>
            {view.outstandingTaskCount}{" "}
            {view.outstandingTaskCount === 1 ? "task still needs" : "tasks still need"} your
            attention.
          </p>
        </div>
        <Progress value={completionPercent} label="Request and task completion" />
      </section>

      <section className={styles.panel} aria-labelledby="task-list-heading">
        <div className={styles.listToolbar}>
          <div>
            <h2 id="task-list-heading">Your event work</h2>
            <p className={styles.toolbarDescription}>
              Requests and tasks appear after a proposal is accepted.
            </p>
          </div>
          <fieldset className={styles.segmentedControl}>
            <legend className={styles.srOnly}>Filter tasks</legend>
            {filters.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={filter === item.value}
                onClick={() => setFilter(item.value)}
              >
                {item.label}
              </button>
            ))}
          </fieldset>
        </div>

        {view.tasks.length === 0 ? (
          <EmptyState
            title="No speaker tasks yet"
            description="Accepted-speaker requirements will appear here when they are assigned."
          />
        ) : visibleTasks.length === 0 ? (
          <EmptyState
            title="No tasks in this view"
            description="Choose another filter to see your other tasks."
          />
        ) : (
          <div className={styles.taskGroups}>
            {contentRequests.length > 0 ? (
              <section className={styles.taskGroup} aria-labelledby="content-requests-heading">
                <div>
                  <h3 id="content-requests-heading">Content requests</h3>
                  <p>
                    Files and information requested by the event team. Submit each request for
                    review.
                  </p>
                </div>
                <div className={styles.taskWorkspace}>
                  {contentRequests.map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                </div>
              </section>
            ) : null}
            {otherEventTasks.length > 0 ? (
              <section className={styles.taskGroup} aria-labelledby="other-event-tasks-heading">
                <div>
                  <h3 id="other-event-tasks-heading">Other event tasks</h3>
                  <p>Agreements, confirmations, and actions that do not require content review.</p>
                </div>
                <div className={styles.taskWorkspace}>
                  {otherEventTasks.map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </section>
    </>
  );
}

function TaskCard({ task }: Readonly<{ task: PortalTask }>) {
  const {
    busyTaskIds,
    downloadAsset,
    transitionTask,
    uploadTask,
    view,
    workspace,
    workspaceError,
    loadAssetComments,
    addAssetComment,
    can,
    clearWorkspaceError,
  } = usePortal();
  const [note, setNote] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadingStatus, setUploadingStatus] = useState<
    "idle" | "pending" | "succeeded" | "failure"
  >("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentStatus, setCommentStatus] = useState<"idle" | "pending" | "succeeded" | "failure">(
    "idle",
  );
  const [commentError, setCommentError] = useState<string | null>(null);
  const commentLoadRef = useRef<string | null>(null);

  const availableAssets = view ? mergePortalAssets(view.assets ?? [], workspace.assets) : [];
  const candidateResolution = view ? resolveTaskAsset(task, availableAssets) : null;
  const candidateDefaultAssetId =
    candidateResolution?.latest?.id ??
    (candidateResolution?.assets.length === 1 ? candidateResolution.assets[0]?.id : null);
  const candidateSelectedAssetId = candidateResolution?.assets.some(
    (asset) => asset.id === selectedAssetId,
  )
    ? selectedAssetId
    : null;
  const activeCommentAssetId = candidateSelectedAssetId ?? candidateDefaultAssetId;

  useEffect(() => {
    if (!activeCommentAssetId || commentLoadRef.current === activeCommentAssetId) return;
    commentLoadRef.current = activeCommentAssetId;
    setCommentStatus("pending");
    setCommentError(null);
    clearWorkspaceError();
    void loadAssetComments(activeCommentAssetId).then(
      () => setCommentStatus("succeeded"),
      () => {
        setCommentStatus("failure");
        setCommentError("Comments could not be loaded for this version.");
      },
    );
  }, [activeCommentAssetId, clearWorkspaceError, loadAssetComments]);

  if (!view) {
    return null;
  }
  const subject = taskSubjectPresentation(task, view.profiles, view.submissions);
  const blockedBySubject = subject.error !== null;
  const blocked = isTaskBlocked(task, view.tasks) || blockedBySubject;
  const resolution = resolveTaskAsset(task, availableAssets);
  const selectedAsset =
    resolution.assets.find((asset) => asset.id === selectedAssetId) ?? resolution.latest;
  const presentation = taskStatusPresentation(task.status);
  const action = blocked ? null : taskPrimaryAction(task);
  const busy = busyTaskIds.has(task.id);
  const dependencyNames = task.dependencyIds.map(
    (dependencyId) =>
      view.tasks.find((candidate) => candidate.id === dependencyId)?.title ??
      "Another required task",
  );
  const uploadKind = task.acceptedAssetKinds?.[0];
  const policy = getTaskUploadPolicy(task);
  const assetMetadataMissing =
    task.type === "upload" &&
    ["submitted", "completed", "needs_changes", "reopened"].includes(task.status) &&
    (resolution.status === "empty" ||
      resolution.status === "missing-metadata" ||
      resolution.status === "conflict");
  const comments = selectedAsset
    ? commentsForAsset(selectedAsset, workspace.assetComments[selectedAsset.id] ?? [])
    : [];
  const commentProviderError = workspaceError;

  async function runPrimaryAction() {
    if (action === "start") {
      await transitionTask(task, "in_progress");
    } else if (action === "complete") {
      await transitionTask(task, "completed", note.trim() || undefined);
    } else if (action === "submit") {
      await transitionTask(task, "submitted", note.trim() || undefined);
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setUploadingStatus("idle");
    setUploadError(null);
    if (!policy.valid) {
      setUploadingStatus("failure");
      setUploadError(policy.error);
      input.value = "";
      return;
    }
    if (!uploadKind) {
      setUploadingStatus("failure");
      setUploadError("This upload task does not specify an accepted file kind.");
      input.value = "";
      return;
    }
    const validation = validateTaskUpload(file, policy);
    if (!validation.valid) {
      setUploadingStatus("failure");
      setUploadError(validation.error);
      input.value = "";
      return;
    }
    if (subject.error !== null) {
      setUploadingStatus("failure");
      setUploadError(subject.error);
      input.value = "";
      return;
    }
    setUploadingStatus("pending");
    try {
      const succeeded = await uploadTask(task, file);
      if (!succeeded) {
        setUploadingStatus("failure");
        setUploadError("The upload could not be completed. Try again.");
        return;
      }
      setUploadingStatus("succeeded");
      setUploadError(null);
      setSelectedAssetId(null);
    } catch {
      setUploadingStatus("failure");
      setUploadError("The upload could not be completed. Try again.");
    } finally {
      input.value = "";
    }
  }

  async function handleDownload() {
    if (selectedAsset?.state !== "ready") return;
    setDownloading(true);
    try {
      const grant = await downloadAsset(selectedAsset.id);
      if (grant) window.location.assign(grant.url);
    } finally {
      setDownloading(false);
    }
  }

  async function handleComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAsset || !commentDraft.trim()) return;
    setCommentStatus("pending");
    setCommentError(null);
    try {
      const succeeded = await addAssetComment({
        assetId: selectedAsset.id,
        body: commentDraft.trim(),
        ...(selectedAsset.version === undefined ? {} : { expectedVersion: selectedAsset.version }),
      });
      if (!succeeded) {
        setCommentStatus("failure");
        setCommentError("Your reply could not be posted.");
        return;
      }
      setCommentDraft("");
      setCommentStatus("succeeded");
    } catch {
      setCommentStatus("failure");
      setCommentError("Your reply could not be posted.");
    }
  }

  return (
    <article className={styles.taskCard} aria-labelledby={`task-${task.id}`}>
      <div className={styles.taskCardHeader}>
        <div className={styles.taskTypeIcon} aria-hidden="true">
          {task.type === "upload" ? "↑" : task.type === "form" ? "▤" : "✓"}
        </div>
        <div className={styles.taskTitle}>
          <p>{subject.label}</p>
          <h3 id={`task-${task.id}`}>{task.title}</h3>
        </div>
        <TaskStatusBadge status={task.status} />
      </div>
      <p className={styles.taskDescription}>{task.description || presentation.description}</p>
      {subject.error ? (
        <p className={styles.fieldError} role="alert">
          {subject.error}
        </p>
      ) : (
        <p className={styles.toolbarDescription}>{subject.description}</p>
      )}
      <div className={styles.taskMetadata}>
        <span>
          <strong>Type</strong>{" "}
          {task.type === "upload"
            ? "File request"
            : task.type === "form"
              ? "Form request"
              : "Event action"}
        </span>
        <span>
          <strong>Due</strong> {formatPortalDate(task.dueAt) ?? "No due date"}
        </span>
        <span>
          <strong>Request status</strong> {presentation.label}
        </span>
        {task.type === "upload" ? (
          <>
            <span>
              <strong>File status</strong> {portalFileStatus(resolution.latest)}
            </span>
            <span>
              <strong>Review status</strong> {portalReviewStatus(resolution.current)}
            </span>
          </>
        ) : null}
      </div>

      {selectedAsset ? (
        <div className={styles.taskActionArea}>
          <div className={styles.taskMetadata}>
            <span>
              <strong>File</strong> {selectedAsset.fileName}
            </span>
            <span>
              <strong>State</strong> {portalAssetStateLabel(selectedAsset.state)}
            </span>
            <span>
              <strong>Format</strong> {selectedAsset.contentType}
            </span>
            <span>
              <strong>Size</strong> {formatPortalFileSize(selectedAsset.sizeBytes)}
            </span>
            <span>
              <strong>Version</strong> {selectedAsset.version ?? assetVersionId(selectedAsset)}
            </span>
          </div>
          <fieldset className={styles.taskMetadata}>
            <legend className={styles.srOnly}>Authoritative asset pointers</legend>
            {sharedAssetPointerLabels(selectedAsset, resolution.pointers).map((label) => (
              <span key={label} className={styles.badge}>
                {label}
              </span>
            ))}
            {resolution.pointers.status !== "ready" ? (
              <span>
                <strong>Pointer state</strong> {resolution.pointers.status.replace("-", " ")}
              </span>
            ) : null}
          </fieldset>
          {resolution.pointers.status === "missing-metadata" ? (
            <p className={styles.blockedNotice} role="status">
              Authoritative version pointers are missing; the current version cannot be confirmed.
            </p>
          ) : null}
          {resolution.pointers.status === "conflict" ? (
            <p className={styles.fieldError} role="alert">
              {resolution.error ?? "Asset version pointers conflict; refresh before continuing."}
            </p>
          ) : null}
          {selectedAsset.state === "pending_upload" ? (
            <p className={styles.blockedNotice} role="status">
              This upload is pending server finalization.
            </p>
          ) : null}
          {selectedAsset.state === "rejected" ? (
            <p className={styles.fieldError} role="alert">
              {selectedAsset.rejectionReason ?? "The server rejected this upload."}
            </p>
          ) : null}
          {resolution.assets.length > 1 ? (
            <fieldset className={styles.taskMetadata}>
              <legend className={styles.srOnly}>Select asset version</legend>
              {resolution.assets.map((candidate) => (
                <button
                  key={candidate.id}
                  className={styles.tertiaryButton}
                  type="button"
                  aria-pressed={candidate.id === selectedAsset.id}
                  onClick={() => {
                    setSelectedAssetId(candidate.id);
                    setCommentStatus("idle");
                  }}
                >
                  {candidate.id === selectedAsset.id ? "Viewing" : "View"} version{" "}
                  {candidate.version ?? assetVersionId(candidate)}
                </button>
              ))}
            </fieldset>
          ) : null}
          {selectedAsset.state === "ready" ? (
            <button
              className={styles.secondaryButton}
              type="button"
              disabled={downloading}
              onClick={() => void handleDownload()}
            >
              {downloading ? "Preparing download…" : "Download selected version"}
            </button>
          ) : null}
          <section className={styles.taskActionArea} aria-labelledby={`comments-${task.id}`}>
            <h4 id={`comments-${task.id}`}>
              Comments for version {selectedAsset.version ?? assetVersionId(selectedAsset)}
            </h4>
            {commentStatus === "pending" ? (
              <p className={styles.toolbarDescription} role="status">
                Loading comments for this immutable version…
              </p>
            ) : null}
            {commentStatus === "failure" || commentProviderError !== null ? (
              <p className={styles.fieldError} role="alert">
                {commentError ??
                  commentProviderError ??
                  "Comments are unavailable for this version."}
              </p>
            ) : null}
            {commentStatus === "succeeded" &&
            commentProviderError === null &&
            comments.length === 0 ? (
              <p className={styles.toolbarDescription}>No comments on this version yet.</p>
            ) : null}
            {comments.length > 0 ? (
              <ul>
                {comments.map((comment) => (
                  <li key={comment.id}>
                    <strong>{comment.authorLabel}</strong>{" "}
                    <time dateTime={comment.createdAt}>
                      {formatPortalDate(comment.createdAt) ?? ""}
                    </time>
                    <p>{comment.body}</p>
                  </li>
                ))}
              </ul>
            ) : null}
            {can("asset-comment") ? (
              <form onSubmit={(event) => void handleComment(event)}>
                <label className={styles.fileField}>
                  <span>Reply on this version</span>
                  <textarea
                    rows={3}
                    maxLength={10_000}
                    value={commentDraft}
                    onChange={(event) => setCommentDraft(event.currentTarget.value)}
                  />
                </label>
                <button
                  className={styles.secondaryButton}
                  type="submit"
                  disabled={commentStatus === "pending" || !commentDraft.trim()}
                >
                  {commentStatus === "pending" ? "Posting…" : "Post reply"}
                </button>
              </form>
            ) : null}
          </section>
        </div>
      ) : assetMetadataMissing ? (
        <p className={styles.blockedNotice} role="status">
          File metadata or authoritative version pointers are not available for this upload.
        </p>
      ) : null}

      {blocked && !subject.error ? (
        <div className={styles.blockedNotice}>
          <strong>Complete a prerequisite first</strong>
          <p>{dependencyNames.join(", ")}</p>
        </div>
      ) : null}

      {!blocked && task.type === "form" ? <PortalTaskResponseEditor task={task} /> : null}

      {!blocked && action === "upload" ? (
        <div className={styles.taskActionArea}>
          <label className={styles.fileField}>
            <span>Choose {uploadKind ? uploadKind.replace("_", " ") : "a task file"}</span>
            <input
              type="file"
              accept={policy.valid ? policy.allowedMimeTypes.join(",") : undefined}
              disabled={busy || !policy.valid || !uploadKind}
              onChange={(event) => void handleFile(event)}
            />
            <small>
              {!uploadKind
                ? "Upload unavailable: the server did not specify an accepted file kind."
                : policy.valid
                  ? `Accepted types: ${policy.allowedMimeTypes.join(", ")}. Maximum: ${formatPortalFileSize(policy.maxBytes)}.`
                  : policy.error}
            </small>
          </label>
          {uploadingStatus === "pending" ? (
            <p className={styles.toolbarDescription} role="status">
              Upload pending…
            </p>
          ) : null}
          {uploadingStatus === "succeeded" ? (
            <p className={styles.saveConfirmation} role="status">
              Upload complete. This request is awaiting event-team review.
            </p>
          ) : null}
          {uploadingStatus === "failure" ? (
            <p className={styles.fieldError} role="alert">
              {uploadError ?? "The selected file could not be uploaded."}
            </p>
          ) : null}
          {fileName && uploadingStatus !== "failure" ? (
            <p className={styles.toolbarDescription}>Selected: {fileName}</p>
          ) : null}
        </div>
      ) : null}

      {!blocked && (action === "submit" || action === "complete") ? (
        <label className={styles.taskNoteField}>
          <span>
            {action === "complete"
              ? "Completion note (optional)"
              : "Message to organizers (optional)"}
          </span>
          <textarea
            rows={3}
            maxLength={1_000}
            value={note}
            onChange={(event) => setNote(event.currentTarget.value)}
          />
        </label>
      ) : null}

      <footer className={styles.taskCardFooter}>
        <p>{presentation.description}</p>
        {action && action !== "upload" ? (
          <button
            className={styles.primaryButton}
            type="button"
            disabled={busy}
            onClick={() => void runPrimaryAction()}
          >
            {busy
              ? "Saving…"
              : action === "start"
                ? "Start task"
                : action === "complete"
                  ? "Mark complete"
                  : "Submit for review"}
          </button>
        ) : null}
      </footer>
    </article>
  );
}
