import { portalSubmissionIdsMatch } from "./model";
import { formatPortalFileSize } from "./portal-ui";
import type { PortalProfile, PortalSubmission, PortalTask } from "./types";

type RuntimeRecord = Record<string, unknown>;

export function asTaskRecord(value: unknown): RuntimeRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as RuntimeRecord)
    : null;
}

export function taskString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export type TaskSubject =
  | { type: "participant"; participantId: string }
  | { type: "session"; participantId: string; submissionId: string };
export type TaskSubjectResolution =
  | { subject: TaskSubject; error: null }
  | { subject: null; error: string };

export function resolveTaskSubject(task: PortalTask): TaskSubjectResolution {
  const record = asTaskRecord(task);
  const participantId = taskString(record?.participantId);
  const submissionId = record?.submissionId;
  const explicit = asTaskRecord(record?.subject);
  if (!participantId) {
    return { subject: null, error: "Task subject metadata is missing a participant." };
  }
  if (explicit) {
    if (taskString(explicit.participantId) !== participantId) {
      return { subject: null, error: "Task subject metadata does not match its participant." };
    }
    if (explicit.type === "participant" && submissionId === null) {
      return { subject: { type: "participant", participantId }, error: null };
    }
    const explicitSubmissionId = taskString(explicit.submissionId);
    if (
      explicit.type === "session" &&
      explicitSubmissionId &&
      typeof submissionId === "string" &&
      portalSubmissionIdsMatch(explicitSubmissionId, submissionId)
    ) {
      return {
        subject: { type: "session", participantId, submissionId: explicitSubmissionId },
        error: null,
      };
    }
    return { subject: null, error: "Task subject metadata is invalid or inconsistent." };
  }
  if (submissionId === null) {
    return { subject: { type: "participant", participantId }, error: null };
  }
  const normalizedSubmissionId = taskString(submissionId);
  return normalizedSubmissionId
    ? {
        subject: { type: "session", participantId, submissionId: normalizedSubmissionId },
        error: null,
      }
    : { subject: null, error: "Task subject metadata is missing a session or participant scope." };
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
  if (!resolution.subject) {
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
    const name =
      profile?.displayName ??
      taskString(asTaskRecord(task)?.participantName) ??
      resolution.subject.participantId;
    return {
      label: `Participant · ${name}`,
      description: "Applies to your participant profile across accepted sessions.",
      error: null,
    };
  }
  const subject = resolution.subject;
  const submission = submissions.find(
    (candidate) =>
      candidate.eventId === task.eventId &&
      candidate.status === "accepted" &&
      candidate.participantIds.includes(subject.participantId) &&
      portalSubmissionIdsMatch(candidate.id, subject.submissionId),
  );
  return submission
    ? {
        label: `Session · ${submission.title}`,
        description: "Applies only to this accepted session.",
        error: null,
      }
    : {
        label: "Session unavailable",
        description: "The accepted session could not be found.",
        error: "This session-scoped task has no matching accepted submission.",
      };
}

export type TaskUploadPolicy =
  | { valid: true; allowedMimeTypes: readonly string[]; maxBytes: number; error: null }
  | { valid: false; allowedMimeTypes: readonly string[]; maxBytes: number | null; error: string };

export function getTaskUploadPolicy(task: PortalTask): TaskUploadPolicy {
  const record = asTaskRecord(task);
  const rawTypes = record?.allowedMimeTypes;
  const allowedMimeTypes = Array.isArray(rawTypes)
    ? rawTypes
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
  if (
    !Array.isArray(rawTypes) ||
    rawTypes.length === 0 ||
    allowedMimeTypes.length !== rawTypes.length
  ) {
    return {
      valid: false,
      allowedMimeTypes,
      maxBytes: null,
      error: "Upload policy unavailable: the server did not provide a valid MIME allowlist.",
    };
  }
  const maxBytes = record?.maxBytes;
  if (typeof maxBytes !== "number" || !Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    return {
      valid: false,
      allowedMimeTypes,
      maxBytes: null,
      error: "Upload policy unavailable: the server did not provide a valid byte limit.",
    };
  }
  return { valid: true, allowedMimeTypes, maxBytes, error: null };
}

export function mimeTypeAllowed(contentType: string, allowed: readonly string[]): boolean {
  const normalized = contentType.trim().toLowerCase();
  return (
    normalized.length > 0 &&
    allowed.some((value) => {
      const candidate = value.trim().toLowerCase();
      return (
        candidate === normalized ||
        candidate === "*/*" ||
        (candidate.endsWith("/*") && normalized.startsWith(candidate.slice(0, -1)))
      );
    })
  );
}

export function validateTaskUpload(
  file: Pick<File, "type" | "size">,
  policy: TaskUploadPolicy,
): { valid: true } | { valid: false; error: string } {
  if (!policy.valid) return { valid: false, error: policy.error };
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

const urgency: Record<PortalTask["status"], number> = {
  needs_changes: 0,
  reopened: 1,
  overdue: 2,
  not_started: 3,
  in_progress: 4,
  submitted: 5,
  completed: 6,
  waived: 7,
};

export function sortTasksByUrgency(tasks: readonly PortalTask[]): PortalTask[] {
  return [...tasks].sort((left, right) => {
    const status = urgency[left.status] - urgency[right.status];
    if (status !== 0) return status;
    const leftDue = left.dueAt ? Date.parse(left.dueAt) : Number.POSITIVE_INFINITY;
    const rightDue = right.dueAt ? Date.parse(right.dueAt) : Number.POSITIVE_INFINITY;
    if (leftDue !== rightDue) return leftDue - rightDue;
    return left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
  });
}

export function actionTaskPresentation(task: PortalTask) {
  return {
    content: task.description?.trim() || "Complete the organizer-provided action for this event.",
    actionLabel: "Confirm completion",
  } as const;
}

export function portalTaskGroup(task: PortalTask): "content-requests" | "other-event-tasks" {
  return task.type === "action" ? "other-event-tasks" : "content-requests";
}
