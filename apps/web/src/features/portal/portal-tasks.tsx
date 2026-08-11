"use client";

import { type ChangeEvent, useState } from "react";
import {
  filterTasks,
  findSubmissionForTask,
  isTaskBlocked,
  portalTaskAsset,
  type TaskFilter,
  taskPrimaryAction,
  taskStatusPresentation,
} from "./model";
import styles from "./portal.module.css";
import { usePortal } from "./portal-provider";
import {
  EmptyState,
  formatPortalDate,
  formatPortalFileSize,
  InlineMutationError,
  PageHeading,
  portalAssetStateLabel,
  PortalContentState,
  Progress,
  TaskStatusBadge,
} from "./portal-ui";
import type { PortalAssetKind, PortalTask } from "./types";

const filters: readonly { value: TaskFilter; label: string }[] = [
  { value: "all", label: "All tasks" },
  { value: "attention", label: "Needs attention" },
  { value: "finished", label: "Finished" },
];

const acceptByKind: Record<PortalAssetKind, string> = {
  headshot: "image/jpeg,image/png,image/webp",
  slides:
    "application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation",
  supporting_file: "application/pdf,image/jpeg,image/png,text/plain",
};

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
  const completed = view.tasks.filter(
    (task) => task.status === "completed" || task.status === "waived",
  ).length;
  const completionPercent =
    view.tasks.length === 0 ? 100 : Math.round((completed / view.tasks.length) * 100);

  return (
    <>
      <PageHeading
        eyebrow="Accepted speaker checklist"
        title="Tasks"
        description="Complete forms, uploads, and event actions assigned to your accepted sessions."
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
        <Progress value={completionPercent} label="Task completion" />
      </section>

      <section className={styles.panel} aria-labelledby="task-list-heading">
        <div className={styles.listToolbar}>
          <div>
            <h2 id="task-list-heading">Your tasks</h2>
            <p className={styles.toolbarDescription}>Tasks appear after a proposal is accepted.</p>
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
          <div className={styles.taskWorkspace}>
            {visibleTasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function TaskCard({ task }: Readonly<{ task: PortalTask }>) {
  const { busyTaskIds, downloadAsset, transitionTask, uploadTask, view } = usePortal();
  const [note, setNote] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  if (!view) {
    return null;
  }
  const blocked = isTaskBlocked(task, view.tasks);
  const submission = findSubmissionForTask(task, view.submissions);
  const asset = portalTaskAsset(task, view.assets ?? []);
  const presentation = taskStatusPresentation(task.status);
  const action = blocked ? null : taskPrimaryAction(task);
  const busy = busyTaskIds.has(task.id);
  const dependencyNames = task.dependencyIds.map(
    (dependencyId) =>
      view.tasks.find((candidate) => candidate.id === dependencyId)?.title ??
      "Another required task",
  );
  const uploadKind = task.acceptedAssetKinds?.[0];
  const assetMetadataMissing =
    task.type === "upload" &&
    ["submitted", "completed", "needs_changes", "reopened"].includes(task.status) &&
    asset === undefined;

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
    if (!file) {
      return;
    }
    setFileName(file.name);
    try {
      await uploadTask(task, file);
    } finally {
      setFileName(null);
      input.value = "";
    }
  }

  async function handleDownload() {
    if (!asset || asset.state !== "ready") return;
    setDownloading(true);
    try {
      const grant = await downloadAsset(asset.id);
      if (grant) window.location.assign(grant.url);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <article className={styles.taskCard} aria-labelledby={`task-${task.id}`}>
      <div className={styles.taskCardHeader}>
        <div className={styles.taskTypeIcon} aria-hidden="true">
          {task.type === "upload" ? "↑" : task.type === "form" ? "▤" : "✓"}
        </div>
        <div className={styles.taskTitle}>
          <p>
            {submission?.title ?? "Accepted session"}
          </p>
          <h3 id={`task-${task.id}`}>{task.title}</h3>
        </div>
        <TaskStatusBadge status={task.status} />
      </div>
      <p className={styles.taskDescription}>{task.description || presentation.description}</p>
      <div className={styles.taskMetadata}>
        <span>
          <strong>Type</strong> {task.type === "upload" ? "File upload" : task.type}
        </span>
        <span>
          <strong>Due</strong> {formatPortalDate(task.dueAt) ?? "No due date"}
        </span>
      </div>

      {asset ? (
        <div className={styles.taskActionArea} aria-label={`File details for ${task.title}`}>
          <div className={styles.taskMetadata}>
            <span>
              <strong>File</strong> {asset.fileName}
            </span>
            <span>
              <strong>State</strong> {portalAssetStateLabel(asset.state)}
            </span>
            <span>
              <strong>Format</strong> {asset.contentType}
            </span>
            <span>
              <strong>Size</strong> {formatPortalFileSize(asset.sizeBytes)}
            </span>
            {asset.version === undefined ? null : (
              <span>
                <strong>Version</strong> {asset.version}
              </span>
            )}
          </div>
          {asset.state === "rejected" && asset.rejectionReason ? (
            <p className={styles.fieldError} role="status">
              {asset.rejectionReason}
            </p>
          ) : null}
          {asset.state === "ready" ? (
            <button
              className={styles.secondaryButton}
              type="button"
              disabled={downloading}
              onClick={() => void handleDownload()}
            >
              {downloading ? "Preparing download…" : "Download file"}
            </button>
          ) : null}
        </div>
      ) : assetMetadataMissing ? (
        <p className={styles.blockedNotice} role="status">
          File metadata is not available for this upload.
        </p>
      ) : null}

      {blocked ? (
        <div className={styles.blockedNotice}>
          <strong>Complete a prerequisite first</strong>
          <p>{dependencyNames.join(", ")}</p>
        </div>
      ) : null}

      {!blocked && action === "upload" && uploadKind ? (
        <div className={styles.taskActionArea}>
          <label className={styles.fileField}>
            <span>Choose {uploadKind.replace("_", " ")}</span>
            <input
              type="file"
              accept={acceptByKind[uploadKind]}
              disabled={busy}
              onChange={(event) => void handleFile(event)}
            />
            <small>
              {busy
                ? "Uploading privately…"
                : fileName
                  ? `Selected: ${fileName}`
                  : "The selected file will be uploaded privately."}
            </small>
          </label>
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
