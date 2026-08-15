"use client";

import { isTaskBlocked } from "./model";
import { createParticipantDashboard } from "./participant-dashboard-model";
import { ParticipantEventsDashboard } from "./portal-dashboard";
import { usePortal } from "./portal-provider";
import { PortalContentState } from "./portal-ui";
import type { PortalTask } from "./types";

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
