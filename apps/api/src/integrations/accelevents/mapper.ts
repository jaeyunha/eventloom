import {
  type AcceleventsSessionPayload,
  type AcceleventsSpeakerPayload,
  acceleventsSessionPayloadSchema,
  acceleventsSpeakerPayloadSchema,
  type IntegrationFieldMapping,
  type IntegrationRecordError,
} from "@open-sessionboard/contracts";
import type {
  AcceleventsDiffRecord,
  AcceleventsMappedProgram,
  AcceleventsPreviewDiff,
  AcceleventsProgramSource,
  AcceleventsProviderSnapshot,
  AcceleventsRecordKind,
} from "./types";

export const ACCELEVENTS_FIELD_MAPPINGS: readonly IntegrationFieldMapping[] = [
  { sourceField: "participant.biography", destinationField: "speaker.biography", required: false },
  { sourceField: "participant.company", destinationField: "speaker.company", required: false },
  { sourceField: "participant.email", destinationField: "speaker.email", required: true },
  { sourceField: "participant.firstName", destinationField: "speaker.firstName", required: true },
  {
    sourceField: "participant.headshotUrl",
    destinationField: "speaker.headshotUrl",
    required: false,
  },
  { sourceField: "participant.id", destinationField: "speaker.externalId", required: true },
  { sourceField: "participant.jobTitle", destinationField: "speaker.jobTitle", required: false },
  { sourceField: "participant.lastName", destinationField: "speaker.lastName", required: true },
  { sourceField: "session.description", destinationField: "session.description", required: false },
  { sourceField: "session.endsAt", destinationField: "session.endsAt", required: true },
  { sourceField: "session.id", destinationField: "session.externalId", required: true },
  { sourceField: "session.location", destinationField: "session.location", required: false },
  { sourceField: "session.room", destinationField: "session.room", required: true },
  {
    sourceField: "session.speakerParticipantIds",
    destinationField: "session.speakerExternalIds",
    required: true,
  },
  { sourceField: "session.startsAt", destinationField: "session.startsAt", required: true },
  { sourceField: "session.tags", destinationField: "session.tags", required: false },
  { sourceField: "session.timeZone", destinationField: "session.timeZone", required: true },
  { sourceField: "session.title", destinationField: "session.title", required: true },
  { sourceField: "session.track", destinationField: "session.track", required: false },
];

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export async function sha256Hex(
  value: unknown,
  subtle: SubtleCrypto = crypto.subtle,
): Promise<string> {
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function mapAcceptedProgram(source: AcceleventsProgramSource): AcceleventsMappedProgram {
  const validationErrors: IntegrationRecordError[] = [];
  const acceptedSpeakers = source.speakers
    .filter(({ decision }) => decision === "accepted")
    .map<AcceleventsSpeakerPayload>((speaker) => ({
      externalId: speaker.participantId,
      email: speaker.email.trim().toLowerCase(),
      firstName: speaker.firstName.trim(),
      lastName: speaker.lastName.trim(),
      biography: speaker.biography.trim(),
      company: nullableTrim(speaker.company),
      jobTitle: nullableTrim(speaker.jobTitle),
      headshotUrl: nullableTrim(speaker.headshotUrl),
    }));
  const speakers = uniqueRecords("speaker", acceptedSpeakers, validationErrors);
  const acceptedSpeakerIds = new Set(speakers.map(({ externalId }) => externalId));

  const acceptedSessions = source.sessions
    .filter(({ decision }) => decision === "accepted")
    .map<AcceleventsSessionPayload>((session) => ({
      externalId: session.sessionId,
      title: session.title.trim(),
      description: session.description.trim(),
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      timeZone: session.timeZone.trim(),
      location: nullableTrim(session.location),
      room: session.room.trim(),
      track: nullableTrim(session.track),
      tags: uniqueSorted(session.tags.map((tag) => tag.trim()).filter(Boolean)),
      speakerExternalIds: uniqueSorted(session.speakerParticipantIds),
    }));
  const sessions = uniqueRecords("session", acceptedSessions, validationErrors);

  for (const speaker of speakers) {
    const parsed = acceleventsSpeakerPayloadSchema.safeParse(speaker);
    if (!parsed.success) {
      validationErrors.push({
        externalId: speaker.externalId,
        code: "INVALID_SPEAKER",
        message: issueMessage(parsed.error.issues),
        retryable: false,
      });
    }
  }

  for (const session of sessions) {
    const parsed = acceleventsSessionPayloadSchema.safeParse(session);
    if (!parsed.success) {
      validationErrors.push({
        externalId: session.externalId,
        code: "INVALID_SESSION",
        message: issueMessage(parsed.error.issues),
        retryable: false,
      });
    }
    const missingSpeakerIds = session.speakerExternalIds.filter(
      (externalId) => !acceptedSpeakerIds.has(externalId),
    );
    if (missingSpeakerIds.length > 0) {
      validationErrors.push({
        externalId: session.externalId,
        code: "MISSING_SPEAKER",
        message: `Accepted session references unavailable accepted speakers: ${missingSpeakerIds.join(", ")}.`,
        retryable: false,
      });
    }
  }

  validationErrors.sort(compareErrors);
  return {
    eventId: source.eventId,
    agendaRevisionId: source.agendaRevisionId,
    speakers,
    sessions,
    mappings: ACCELEVENTS_FIELD_MAPPINGS,
    validationErrors,
  };
}

export function diffAcceleventsProgram(
  desired: Pick<AcceleventsMappedProgram, "sessions" | "speakers">,
  current: AcceleventsProviderSnapshot,
): AcceleventsPreviewDiff {
  const records = [
    ...diffKind("speaker", desired.speakers, current.speakers),
    ...diffKind("session", desired.sessions, current.sessions),
  ];
  records.sort(compareDiffRecords);
  const summary: { create: number; unchanged: number; update: number } = {
    create: 0,
    unchanged: 0,
    update: 0,
  };
  for (const record of records) {
    summary[record.operation] += 1;
  }
  return { records, summary };
}

export function unexpectedExternalIds(
  desired: Pick<AcceleventsMappedProgram, "sessions" | "speakers">,
  current: AcceleventsProviderSnapshot,
): { readonly sessions: readonly string[]; readonly speakers: readonly string[] } {
  const desiredSpeakers = new Set(desired.speakers.map(({ externalId }) => externalId));
  const desiredSessions = new Set(desired.sessions.map(({ externalId }) => externalId));
  return {
    speakers: uniqueSorted(
      current.speakers
        .map(({ externalId }) => externalId)
        .filter((externalId) => !desiredSpeakers.has(externalId)),
    ),
    sessions: uniqueSorted(
      current.sessions
        .map(({ externalId }) => externalId)
        .filter((externalId) => !desiredSessions.has(externalId)),
    ),
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).filter(([, entryValue]) => entryValue !== undefined);
    entries.sort(([left], [right]) => left.localeCompare(right));
    return Object.fromEntries(entries.map(([key, entryValue]) => [key, canonicalize(entryValue)]));
  }
  return value;
}

function nullableTrim(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function uniqueRecords<T extends { readonly externalId: string }>(
  kind: AcceleventsRecordKind,
  records: readonly T[],
  errors: IntegrationRecordError[],
): T[] {
  const sorted = [...records].sort(
    (left, right) =>
      left.externalId.localeCompare(right.externalId) ||
      canonicalJson(left).localeCompare(canonicalJson(right)),
  );
  const unique: T[] = [];
  let previousId: string | null = null;
  for (const record of sorted) {
    if (record.externalId === previousId) {
      errors.push({
        externalId: record.externalId,
        code: "DUPLICATE_EXTERNAL_ID",
        message: `Multiple accepted ${kind} records use the same external ID.`,
        retryable: false,
      });
      continue;
    }
    unique.push(record);
    previousId = record.externalId;
  }
  return unique;
}

function issueMessage(
  issues: readonly { readonly message: string; readonly path: PropertyKey[] }[],
): string {
  return issues
    .map((issue) => `${issue.path.join(".") || "record"}: ${issue.message}`)
    .sort()
    .join("; ");
}

function compareErrors(left: IntegrationRecordError, right: IntegrationRecordError): number {
  return (
    left.externalId.localeCompare(right.externalId) ||
    left.code.localeCompare(right.code) ||
    left.message.localeCompare(right.message)
  );
}

function diffKind<T extends { readonly externalId: string }>(
  kind: AcceleventsRecordKind,
  desiredRecords: readonly T[],
  currentRecords: readonly T[],
): AcceleventsDiffRecord[] {
  const sortedCurrent = [...currentRecords].sort(
    (left, right) =>
      left.externalId.localeCompare(right.externalId) ||
      canonicalJson(left).localeCompare(canonicalJson(right)),
  );
  const currentById = new Map(sortedCurrent.map((record) => [record.externalId, record]));
  return desiredRecords.map((desired) => {
    const current = currentById.get(desired.externalId);
    if (current === undefined) {
      return { kind, externalId: desired.externalId, operation: "create", changedFields: [] };
    }
    const changedFields = Object.keys(desired)
      .filter(
        (field) =>
          canonicalJson(desired[field as keyof T]) !== canonicalJson(current[field as keyof T]),
      )
      .sort();
    return {
      kind,
      externalId: desired.externalId,
      operation: changedFields.length === 0 ? "unchanged" : "update",
      changedFields,
    };
  });
}

function compareDiffRecords(left: AcceleventsDiffRecord, right: AcceleventsDiffRecord): number {
  return left.kind.localeCompare(right.kind) || left.externalId.localeCompare(right.externalId);
}
