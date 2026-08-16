import { isTaskBlocked, type PortalReadinessState } from "./model";
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
