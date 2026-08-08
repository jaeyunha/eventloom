import type {
  PortalProfile,
  PortalSubmission,
  PortalSubmissionStatus,
  PortalTask,
  PortalTaskStatus,
  PortalView,
} from "./types";

export interface StatusPresentation {
  label: string;
  tone: "neutral" | "info" | "success" | "warning" | "danger";
  description: string;
}

const submissionPresentations: Record<PortalSubmissionStatus, StatusPresentation> = {
  draft: {
    label: "Draft",
    tone: "neutral",
    description: "This proposal has not been submitted yet.",
  },
  submitted: {
    label: "Submitted",
    tone: "info",
    description: "Your proposal was received and is waiting for review.",
  },
  under_review: {
    label: "Under review",
    tone: "warning",
    description: "The program committee is reviewing your proposal.",
  },
  accepted: {
    label: "Accepted",
    tone: "success",
    description: "Congratulations! Complete your speaker tasks to prepare for the event.",
  },
  declined: {
    label: "Not selected",
    tone: "danger",
    description: "This proposal was not selected for the current program.",
  },
  withdrawn: {
    label: "Withdrawn",
    tone: "neutral",
    description: "This proposal has been withdrawn.",
  },
};

const taskPresentations: Record<PortalTaskStatus, StatusPresentation> = {
  not_started: {
    label: "Not started",
    tone: "neutral",
    description: "Ready when you are.",
  },
  in_progress: {
    label: "In progress",
    tone: "info",
    description: "Your changes are in progress.",
  },
  submitted: {
    label: "Submitted",
    tone: "info",
    description: "The event team will review this task.",
  },
  needs_changes: {
    label: "Needs changes",
    tone: "danger",
    description: "The event team requested an update.",
  },
  completed: {
    label: "Completed",
    tone: "success",
    description: "No further action is required.",
  },
  waived: {
    label: "Waived",
    tone: "neutral",
    description: "The event team waived this task.",
  },
  overdue: {
    label: "Overdue",
    tone: "danger",
    description: "This task is past its due date.",
  },
  reopened: {
    label: "Reopened",
    tone: "warning",
    description: "The event team reopened this task.",
  },
};

const finishedTaskStatuses = new Set<PortalTaskStatus>(["completed", "waived"]);
const attentionTaskStatuses = new Set<PortalTaskStatus>([
  "not_started",
  "in_progress",
  "needs_changes",
  "overdue",
  "reopened",
]);

export function submissionStatusPresentation(status: PortalSubmissionStatus): StatusPresentation {
  return submissionPresentations[status];
}

export function taskStatusPresentation(status: PortalTaskStatus): StatusPresentation {
  return taskPresentations[status];
}

export function isTaskFinished(task: PortalTask): boolean {
  return finishedTaskStatuses.has(task.status);
}

export function taskNeedsAttention(task: PortalTask): boolean {
  return attentionTaskStatuses.has(task.status);
}

export function isTaskBlocked(task: PortalTask, tasks: readonly PortalTask[]): boolean {
  if (task.dependencyIds.length === 0) {
    return false;
  }

  const byId = new Map(tasks.map((candidate) => [candidate.id, candidate]));
  return task.dependencyIds.some((dependencyId) => {
    const dependency = byId.get(dependencyId);
    return !dependency || !finishedTaskStatuses.has(dependency.status);
  });
}

export function taskPrimaryAction(
  task: PortalTask,
): "start" | "upload" | "submit" | "complete" | null {
  if (["completed", "waived", "submitted"].includes(task.status)) {
    return null;
  }
  if (["not_started", "overdue", "reopened"].includes(task.status)) {
    return task.type === "action" ? "complete" : "start";
  }
  if (task.type === "upload") {
    return "upload";
  }
  if (task.type === "action") {
    return "complete";
  }
  return "submit";
}

export function filterSubmissions(
  submissions: readonly PortalSubmission[],
  search: string,
): PortalSubmission[] {
  const query = search.trim().toLocaleLowerCase();
  if (!query) {
    return [...submissions];
  }
  return submissions.filter((submission) => submission.title.toLocaleLowerCase().includes(query));
}

export type TaskFilter = "all" | "attention" | "finished";

export function filterTasks(tasks: readonly PortalTask[], filter: TaskFilter): PortalTask[] {
  if (filter === "attention") {
    return tasks.filter(taskNeedsAttention);
  }
  if (filter === "finished") {
    return tasks.filter(isTaskFinished);
  }
  return [...tasks];
}

export function findProfileForTask(task: PortalTask, profiles: readonly PortalProfile[]) {
  return profiles.find((profile) => profile.participantId === task.participantId);
}

export function findSubmissionForTask(task: PortalTask, submissions: readonly PortalSubmission[]) {
  return submissions.find((submission) => submission.id === task.submissionId);
}

export interface PortalSummary {
  submissionCount: number;
  acceptedCount: number;
  outstandingTaskCount: number;
  completedTaskCount: number;
  completionPercent: number;
}

export function summarizePortal(view: PortalView): PortalSummary {
  const completedTaskCount = view.tasks.filter(isTaskFinished).length;
  return {
    submissionCount: view.submissions.length,
    acceptedCount: view.submissions.filter((submission) => submission.status === "accepted").length,
    outstandingTaskCount: view.tasks.length - completedTaskCount,
    completedTaskCount,
    completionPercent:
      view.tasks.length === 0 ? 100 : Math.round((completedTaskCount / view.tasks.length) * 100),
  };
}

export type BiographyValidation =
  | { success: true; biography: string }
  | { success: false; message: string };

export function validateBiography(value: string): BiographyValidation {
  const biography = value.replace(/\r\n?/g, "\n").normalize("NFC").trim();
  const hasDisallowedControl = [...biography].some((character) => {
    const codePoint = character.codePointAt(0);
    return (
      codePoint !== undefined &&
      (codePoint === 0x7f || (codePoint < 0x20 && codePoint !== 0x09 && codePoint !== 0x0a))
    );
  });

  if (biography.length > 5_000) {
    return { success: false, message: "Biography must be 5,000 characters or fewer." };
  }
  if (hasDisallowedControl) {
    return { success: false, message: "Biography contains an unsupported control character." };
  }
  return { success: true, biography };
}
