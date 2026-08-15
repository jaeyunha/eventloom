"use client";

import { useState } from "react";
import {
  WorkspaceListDetail,
  WorkspaceProgressSummary,
  WorkspaceState,
} from "../../components/workspace";
import { filterTasks } from "./model";
import { usePortal } from "./portal-provider";
import { PortalTaskDetail } from "./portal-task-detail";
import { PortalTaskInbox, type TaskFilter } from "./portal-task-list";
import { sortTasksByUrgency } from "./portal-task-model";
import styles from "./portal-tasks.module.css";
import { InlineMutationError, PageHeading, PortalContentState } from "./portal-ui";

export * from "./portal-task-assets";
export type { TaskFilter } from "./portal-task-list";
export * from "./portal-task-model";

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (!view) return null;

  const visible = sortTasksByUrgency(filterTasks(view.tasks, filter));
  const selected = visible.find((task) => task.id === selectedId) ?? visible[0] ?? null;
  const completed = view.tasks.filter(
    (task) => task.status === "completed" || task.status === "waived",
  ).length;

  return (
    <div className={styles.page}>
      <PageHeading
        eyebrow="Accepted speaker checklist"
        title="Requests & tasks"
        description="Work through organizer requests in urgency order, then open one task for its complete context and action."
      />
      <InlineMutationError />
      <WorkspaceProgressSummary
        className={styles.progress}
        label="Event preparation"
        value={completed}
        max={Math.max(view.tasks.length, 1)}
        detail={`${completed} of ${view.tasks.length} finished · ${view.outstandingTaskCount} still open`}
      />

      {view.tasks.length === 0 ? (
        <WorkspaceState
          variant="empty"
          title="No speaker tasks yet"
          description="Accepted-speaker requirements will appear here when organizers assign them."
        />
      ) : visible.length === 0 ? (
        <WorkspaceState
          variant="empty"
          title="No tasks in this view"
          description="Choose another filter to see your remaining event work."
        />
      ) : (
        <WorkspaceListDetail
          className={styles.workspace}
          listLabel="Task inbox"
          detailLabel={selected ? selected.title : "Task detail"}
          list={
            <PortalTaskInbox
              tasks={visible}
              profiles={view.profiles}
              submissions={view.submissions}
              selectedId={selected?.id ?? null}
              filter={filter}
              onFilter={setFilter}
              onSelect={setSelectedId}
            />
          }
          detail={
            selected ? (
              <PortalTaskDetail task={selected} />
            ) : (
              <WorkspaceState
                variant="empty"
                title="Select a task"
                description="Choose an inbox item to view its details."
              />
            )
          }
        />
      )}
    </div>
  );
}
