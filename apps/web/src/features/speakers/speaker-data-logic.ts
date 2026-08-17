import type {
  SpeakerApi,
  SpeakerProgressEnvelope,
  SpeakerRecord,
  SpeakerRosterEnvelope,
  SpeakerTask,
} from "./api";
import { assertSpeakerRosterScope, SpeakerApiError } from "./api";
import { taskSummaryFor } from "./speaker-roster-logic";

const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]*$/;
const SAFE_TRACE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function speakerMutationOutcomeUnknown(reason: unknown): boolean {
  if (!(reason instanceof SpeakerApiError)) return true;
  return reason.status === 408 || reason.status >= 500;
}

export function speakerErrorDiagnostic(reason: unknown): string | null {
  if (
    !(reason instanceof SpeakerApiError) ||
    !SAFE_ERROR_CODE.test(reason.code) ||
    !Number.isInteger(reason.status) ||
    reason.status < 400 ||
    reason.status > 599
  ) {
    return null;
  }
  const trace =
    typeof reason.traceId === "string" && SAFE_TRACE_ID.test(reason.traceId)
      ? ` · trace ${reason.traceId}`
      : "";
  return `${reason.code} · HTTP ${reason.status}${trace}`;
}

export function normalizeRoster(
  roster: SpeakerRosterEnvelope,
  organizationId: string,
  eventId: string,
): SpeakerRosterEnvelope {
  return assertSpeakerRosterScope(roster, organizationId, eventId);
}
export function speakerSecondaryLoadKey(
  roster: SpeakerRosterEnvelope | null,
  organizationId: string,
  eventId: string,
  loading: boolean,
  visible = true,
): string | null {
  if (
    !visible ||
    loading ||
    roster === null ||
    roster.organizationId !== organizationId ||
    roster.eventId !== eventId ||
    roster.speakers.length === 0
  ) {
    return null;
  }
  return `${organizationId}:${eventId}`;
}
export function normalizedEmail(value: string): string {
  return value.trim().toLowerCase();
}

export interface DuplicateEmailConflict {
  readonly email: string;
  readonly speakers: readonly SpeakerRecord[];
}

export function duplicateEmailConflicts(
  speakers: readonly SpeakerRecord[],
): readonly DuplicateEmailConflict[] {
  const speakersByEmail = new Map<string, SpeakerRecord[]>();
  for (const speaker of speakers) {
    const email = normalizedEmail(speaker.email);
    if (email.length === 0) continue;
    const entries = speakersByEmail.get(email);
    if (entries === undefined) {
      speakersByEmail.set(email, [speaker]);
    } else {
      entries.push(speaker);
    }
  }
  const conflicts: DuplicateEmailConflict[] = [];
  for (const [email, entries] of speakersByEmail) {
    if (entries.length > 1) {
      conflicts.push({ email, speakers: entries });
    }
  }
  return conflicts;
}
export async function speakerProgressFor(
  api: Pick<SpeakerApi, "listTasks">,
  speakers: readonly SpeakerRecord[],
  organizationId: string,
  eventId: string,
  signal?: AbortSignal,
): Promise<SpeakerProgressEnvelope> {
  if (speakers.length === 0) {
    return { organizationId, eventId, rows: [] };
  }
  const envelope = await api.listTasks(signal);
  if (
    envelope.organizationId !== organizationId ||
    envelope.eventId !== eventId ||
    envelope.speakerProfileId !== ""
  ) {
    throw new TypeError(
      "The speaker task response belongs to a different organization, event, or profile.",
    );
  }

  const rosterParticipantIds = new Set(speakers.map((speaker) => speaker.participantId));
  const tasksByParticipant = new Map<string, SpeakerTask[]>();
  for (const task of envelope.tasks) {
    if (!rosterParticipantIds.has(task.participantId)) {
      throw new TypeError(
        "The speaker task response contains a task for a different speaker profile.",
      );
    }
    const tasks = tasksByParticipant.get(task.participantId);
    if (tasks === undefined) {
      tasksByParticipant.set(task.participantId, [task]);
    } else {
      tasks.push(task);
    }
  }

  return {
    organizationId,
    eventId,
    rows: speakers.map((speaker) => ({
      participantId: speaker.participantId,
      displayName: speaker.displayName,
      tasks: tasksByParticipant.get(speaker.participantId) ?? [],
    })),
  };
}
export function mergeProgressSummaries(
  roster: SpeakerRosterEnvelope,
  progress: SpeakerProgressEnvelope,
): SpeakerRosterEnvelope {
  if (roster.organizationId !== progress.organizationId || roster.eventId !== progress.eventId) {
    throw new TypeError(
      "The speaker progress response belongs to a different organization or event.",
    );
  }
  const rowsByParticipant = new Map(progress.rows.map((row) => [row.participantId, row]));
  return {
    ...roster,
    speakers: roster.speakers.map((speaker) => {
      const row = rowsByParticipant.get(speaker.participantId);
      return row === undefined ? speaker : { ...speaker, taskSummary: taskSummaryFor(row.tasks) };
    }),
  };
}

export function mergeSpeaker(
  roster: SpeakerRosterEnvelope,
  participantId: string,
  update: Partial<SpeakerRecord>,
): SpeakerRosterEnvelope {
  return {
    ...roster,
    speakers: roster.speakers.map((speaker) =>
      speaker.participantId === participantId ? { ...speaker, ...update } : speaker,
    ),
  };
}
