"use client";

import { isTaskBlocked, type PortalReadinessState } from "./model";
import { createParticipantDashboard } from "./participant-dashboard-model";
import { ParticipantEventsDashboard } from "./portal-dashboard";
import { usePortal } from "./portal-provider";
import { PortalContentState } from "./portal-ui";
import type { PortalTask } from "./types";

export function portalHomeReadinessPresentation(state: PortalReadinessState) {
  if (state === "ready") {
    return {
      label: "Ready",
      tone: "success" as const,
      nextHeading: "You are ready for the event",
      nextDescription: "Every assigned speaker task is complete.",
    };
  }
  if (state === "in-progress") {
    return {
      label: "In progress",
      tone: "info" as const,
      nextHeading: null,
      nextDescription: null,
    };
  }
  return {
    label: "No tasks",
    tone: "neutral" as const,
    nextHeading: "No speaker tasks assigned",
    nextDescription: "The event team has not assigned any speaker tasks yet.",
  };
}

export function selectNextOutstandingPortalTask(
  tasks: readonly PortalTask[],
): PortalTask | undefined {
  const outstanding = tasks.filter(
    (task) => task.status !== "completed" && task.status !== "waived",
  );
  return outstanding.find((task) => !isTaskBlocked(task, tasks)) ?? outstanding[0];
}

export function PortalHome() {
  return (
    <PortalContentState>
      <PortalHomeContent />
    </PortalContentState>
  );
}

function PortalHomeContent() {
  const { context, contexts, eventQuery, view } = usePortal();
  if (!view) return null;

  const dashboard = createParticipantDashboard({
    contexts,
    submissions: view.submissions,
    tasks: view.tasks,
    eventQuery,
  });

  return (
    <ParticipantEventsDashboard dashboard={dashboard} selectedContextId={context?.id ?? null} />
  );
}
