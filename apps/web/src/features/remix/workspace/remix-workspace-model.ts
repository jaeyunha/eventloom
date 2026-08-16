import {
  RemixApiError,
  type RemixAuditAction,
  type RemixCandidate,
  type RemixContent,
  type RemixField,
  type RemixSessionContent,
  type RemixSourceRecord,
  type RemixSourceType,
  remixSessionFields,
  remixSpeakerFields,
} from "../api";

export const fieldLabels: Readonly<Record<RemixField, string>> = {
  title: "Title",
  description: "Description",
  tags: "Tags",
  tracks: "Tracks",
  biography: "Biography",
};

export function messageFrom(error: unknown): string {
  if (
    error instanceof RemixApiError &&
    (error.code === "REMIX_PROVIDER_FAILURE" || error.code === "REMIX_DEPENDENCY_UNAVAILABLE")
  ) {
    return `The remix provider is unavailable. No suggestion was created. ${error.message}`;
  }
  return error instanceof Error ? error.message : "The remix request could not be completed.";
}

export function isCapabilityUnavailable(error: unknown): boolean {
  return (
    error instanceof RemixApiError && (error.status === 404 || error.code === "REMIX_NOT_FOUND")
  );
}

export function fieldsForSourceType(sourceType: RemixSourceType): readonly RemixField[] {
  return sourceType === "session" ? remixSessionFields : remixSpeakerFields;
}

function isSessionContent(content: RemixContent): content is RemixSessionContent {
  return "title" in content;
}

export function valueForField(
  content: RemixContent,
  field: RemixField,
): string | readonly string[] {
  if (field === "biography") return !isSessionContent(content) ? content.biography : "";
  if (!isSessionContent(content)) return "";
  if (field === "title") return content.title;
  if (field === "description") return content.description;
  if (field === "tags") return content.tags;
  return content.tracks;
}

export function inputValue(value: string | readonly string[]): string {
  return typeof value === "string" ? value : value.join(", ");
}

export function displayValue(value: string | readonly string[]): string {
  if (typeof value === "string") return value.length > 0 ? value : "—";
  return value.length > 0 ? value.join(", ") : "—";
}

function splitList(value: string): readonly string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function normalizeFilterInput(value: string): readonly string[] {
  return splitList(value).map((part) => part.toLocaleLowerCase());
}

export function allowedContentForApply(
  candidate: Pick<RemixCandidate, "sourceType" | "fields" | "candidate">,
  draft: Readonly<Record<string, string>> = {},
): Readonly<Record<string, unknown>> {
  const allowed = new Set<RemixField>(fieldsForSourceType(candidate.sourceType));
  const content: Record<string, unknown> = {};
  for (const field of candidate.fields) {
    if (!allowed.has(field)) continue;
    const raw = draft[field] ?? inputValue(valueForField(candidate.candidate, field));
    content[field] = field === "tags" || field === "tracks" ? splitList(raw) : raw;
  }
  return content;
}

export function recordMatches(
  record: RemixSourceRecord,
  search: string,
  tags: readonly string[],
  tracks: readonly string[],
): boolean {
  const sessionTags = record.kind === "session" ? (record.tags ?? []) : [];
  const sessionTracks = record.kind === "session" ? (record.tracks ?? []) : [];
  const haystack =
    record.kind === "session"
      ? [record.id, record.title, record.description, ...sessionTags, ...sessionTracks]
      : [record.id, record.biography];
  if (
    search.trim().length > 0 &&
    !haystack.join(" ").toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  ) {
    return false;
  }
  if (record.kind === "speaker") return tags.length === 0 && tracks.length === 0;
  const normalizedTags = sessionTags.map((tag) => tag.toLocaleLowerCase());
  const normalizedTracks = sessionTracks.map((track) => track.toLocaleLowerCase());
  return (
    tags.every((tag) => normalizedTags.includes(tag)) &&
    tracks.every((track) => normalizedTracks.includes(track))
  );
}

export function candidateSource(
  candidate: RemixCandidate | undefined,
  records: readonly RemixSourceRecord[],
): RemixSourceRecord | undefined {
  if (candidate === undefined) return undefined;
  return records.find(
    (record) => record.kind === candidate.sourceType && record.id === candidate.sourceId,
  );
}

export function candidateIsStale(
  candidate: Pick<RemixCandidate, "status" | "sourceRevision">,
  source: Pick<RemixSourceRecord, "revision"> | undefined,
): boolean {
  return (
    candidate.status === "stale" ||
    (source !== undefined && source.revision !== candidate.sourceRevision)
  );
}

export function sourceLabel(record: RemixSourceRecord | undefined): string {
  if (record === undefined) return "Content suggestion";
  if (record.kind === "session") return record.title.trim() || "Untitled session";
  const biography = record.biography.trim();
  if (biography.length === 0) return "Speaker profile";
  return biography.length > 96 ? `${biography.slice(0, 93)}…` : biography;
}

export function candidateStatusLabel(candidate: RemixCandidate): string {
  if (candidate.status === "pending") return "Ready for review";
  if (candidate.status === "applied") return "Applied";
  if (candidate.status === "rejected") return "Rejected";
  return "Source changed";
}

export function auditActionLabel(action: RemixAuditAction): string {
  if (action === "candidate.generated") return "Generated";
  if (action === "candidate.regenerated") return "Regenerated";
  if (action === "candidate.stale") return "Marked stale";
  if (action === "candidate.rejected") return "Rejected";
  return "Applied";
}

export function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}
