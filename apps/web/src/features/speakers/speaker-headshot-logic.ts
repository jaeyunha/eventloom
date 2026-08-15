import {
  ORGANIZER_HEADSHOT_ACCEPTED_TYPES,
  ORGANIZER_HEADSHOT_MAX_BYTES,
  type SpeakerSession,
} from "./api";

export type OrganizerHeadshotUploadStatus = "idle" | "busy" | "success" | "error";

export function acceptedSpeakerSessions(
  sessions: readonly SpeakerSession[],
): readonly SpeakerSession[] {
  return sessions.filter((session) => session.status.trim().toLowerCase() === "accepted");
}

export function organizerHeadshotSubmissionId(
  sessions: readonly SpeakerSession[],
  requestedSubmissionId: string | null | undefined,
): string | null {
  const eligibleSessions = acceptedSpeakerSessions(sessions);
  if (eligibleSessions.length === 1) return eligibleSessions.at(0)?.submissionId ?? null;
  return requestedSubmissionId !== null &&
    requestedSubmissionId !== undefined &&
    eligibleSessions.some((session) => session.submissionId === requestedSubmissionId)
    ? requestedSubmissionId
    : null;
}

export function validateOrganizerHeadshotFile(file: File): string | null {
  const contentType = file.type.trim().toLowerCase();
  if (
    !ORGANIZER_HEADSHOT_ACCEPTED_TYPES.includes(
      contentType as (typeof ORGANIZER_HEADSHOT_ACCEPTED_TYPES)[number],
    )
  ) {
    return "Choose a JPEG, PNG, or WebP image.";
  }
  if (file.size > ORGANIZER_HEADSHOT_MAX_BYTES) {
    return "Headshots must be 5 MB or smaller.";
  }
  return null;
}

export function organizerHeadshotPreviewPath(value: string): string | null {
  const candidate = value.trim();
  if (!candidate.startsWith("/api/")) return null;
  try {
    const base = "https://same-origin.invalid";
    const resolved = new URL(candidate, base);
    return resolved.origin === base && resolved.pathname.startsWith("/api/") ? candidate : null;
  } catch {
    return null;
  }
}
