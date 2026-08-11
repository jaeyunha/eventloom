"use client";

import { type CSSProperties, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  createRemixApi,
  type RemixApi,
  RemixApiError,
  type RemixAuditAction,
  type RemixAuditEntry,
  type RemixCandidate,
  type RemixContent,
  type RemixContentRevision,
  type RemixField,
  type RemixProvenance,
  type RemixSessionContent,
  type RemixSessionRecord,
  type RemixSourceRecord,
  type RemixSourceType,
  type RemixSpeakerRecord,
  remixSessionFields,
  remixSpeakerFields,
} from "./api";

export interface RemixWorkspaceProps {
  organizationId: string;
  eventId: string;
  /** Optional injection point for focused UI tests and host applications. */
  api?: RemixApi;
}

const fieldLabels: Readonly<Record<RemixField, string>> = {
  title: "Title",
  description: "Description",
  tags: "Tags",
  tracks: "Tracks",
  biography: "Biography",
};

const panelStyle: CSSProperties = {
  border: "1px solid #d6dbe3",
  borderRadius: 10,
  padding: "1.25rem",
  marginBlock: "1rem",
  background: "#fff",
};

const mutedStyle: CSSProperties = { color: "#52606d", fontSize: "0.9rem" };
const errorStyle: CSSProperties = { color: "#9b1c1c", fontWeight: 600 };
const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.6rem",
  alignItems: "center",
};
const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(15rem, 1fr))",
  gap: "1rem",
};

function messageFrom(error: unknown): string {
  if (
    error instanceof RemixApiError &&
    (error.code === "REMIX_PROVIDER_FAILURE" || error.code === "REMIX_DEPENDENCY_UNAVAILABLE")
  ) {
    return `The remix provider is unavailable. No candidate was created. ${error.message}`;
  }
  return error instanceof Error ? error.message : "The remix request could not be completed.";
}

function fieldsForSourceType(sourceType: RemixSourceType): readonly RemixField[] {
  return sourceType === "session" ? remixSessionFields : remixSpeakerFields;
}

function sourceContent(record: RemixSourceRecord): RemixContent {
  if (record.kind === "speaker") return { biography: record.biography };
  return {
    title: record.title,
    description: record.description,
    tags: record.tags ?? [],
    tracks: record.tracks ?? [],
  };
}

function isSessionContent(content: RemixContent): content is RemixSessionContent {
  return "title" in content;
}

function valueForField(content: RemixContent, field: RemixField): string | readonly string[] {
  if (field === "biography") {
    return !isSessionContent(content) ? content.biography : "";
  }
  if (!isSessionContent(content)) return "";
  if (field === "title") return content.title;
  if (field === "description") return content.description;
  if (field === "tags") return content.tags;
  return content.tracks;
}

function inputValue(value: string | readonly string[]): string {
  return typeof value === "string" ? value : value.join(", ");
}

function displayValue(value: string | readonly string[]): string {
  if (typeof value === "string") return value.length > 0 ? value : "—";
  return value.length > 0 ? value.join(", ") : "—";
}

function splitList(value: string): readonly string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function normalizeFilterInput(value: string): readonly string[] {
  return splitList(value).map((part) => part.toLocaleLowerCase());
}

/**
 * Return only fields requested by the candidate's server-issued allowlist.
 * This is deliberately exported so callers can test that human edits cannot
 * smuggle fields outside the generation request into an apply mutation.
 */
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

function recordMatches(
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
  const normalizedHaystack = haystack.join(" ").toLocaleLowerCase();
  if (search.trim().length > 0 && !normalizedHaystack.includes(search.trim().toLocaleLowerCase())) {
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

function candidateSource(
  candidate: RemixCandidate | undefined,
  records: readonly RemixSourceRecord[],
): RemixSourceRecord | undefined {
  if (candidate === undefined) return undefined;
  return records.find(
    (record) => record.kind === candidate.sourceType && record.id === candidate.sourceId,
  );
}

function candidateStatusLabel(candidate: RemixCandidate): string {
  if (candidate.status === "pending") return "Pending human review";
  if (candidate.status === "applied") return "Applied by a human organizer";
  if (candidate.status === "rejected") return "Rejected";
  return "Stale — regenerate before applying";
}

function auditActionLabel(action: RemixAuditAction): string {
  if (action === "candidate.generated") return "Generated";
  if (action === "candidate.regenerated") return "Regenerated";
  if (action === "candidate.stale") return "Marked stale";
  if (action === "candidate.rejected") return "Rejected";
  return "Applied";
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

function demoSession(
  eventId: string,
  id: string,
  revision: number,
  title: string,
  description: string,
  tags: readonly string[],
  tracks: readonly string[],
): RemixSessionRecord {
  return { kind: "session", id, eventId, revision, title, description, tags, tracks };
}

function demoCandidate(
  source: RemixSourceRecord,
  status: RemixCandidate["status"],
  sourceRevision: number,
  id: string,
  generation: number,
  parentCandidateId: string | null,
): RemixCandidate {
  const original = sourceContent(source);
  const candidate: RemixContent =
    source.kind === "session"
      ? {
          ...original,
          title: `${source.title} — a practical guide`,
          description: `${source.description} Organised for a clear, practical event conversation.`,
        }
      : {
          biography: `${source.biography} Known for making complex ideas useful to practitioners.`,
        };
  const fields: readonly RemixField[] =
    source.kind === "session" ? ["title", "description"] : ["biography"];
  const provenance: RemixProvenance = {
    provider: "demo-remix-provider",
    model: "demo-model",
    promptVersion: "remix-v1",
    generatedAt: "2026-08-09T12:00:00.000Z",
    requestId: `request-${id}`,
  };
  return {
    id,
    tenantId: "tenant-demo",
    eventId: source.eventId,
    sourceType: source.kind,
    sourceId: source.id,
    sourceRevision,
    fields,
    tone: "Clear and practical",
    guidance: "Keep the author's meaning and make the outcome concrete.",
    original,
    candidate,
    changedFields: fields,
    changeSummary: "Clarifies the promise and makes the audience outcome easier to scan.",
    provenance,
    status,
    version: 1,
    generation,
    parentCandidateId,
    createdAt: "2026-08-09T12:00:00.000Z",
    createdBy: "organizer-demo",
    ...(status === "stale"
      ? {
          staleAt: "2026-08-09T12:05:00.000Z",
          staleReason: "Source content changed after generation.",
        }
      : {}),
  };
}

interface DemoWorkspaceData {
  records: readonly RemixSourceRecord[];
  candidates: readonly RemixCandidate[];
  audit: readonly RemixAuditEntry[];
}

function demoWorkspaceData(eventId: string): DemoWorkspaceData {
  const session = demoSession(
    eventId,
    "session-1",
    2,
    "Designing resilient public services",
    "A practical session for resilient public services.",
    ["public-service", "design"],
    ["Civic technology"],
  );
  const secondSession = demoSession(
    eventId,
    "session-2",
    3,
    "Calm incident response",
    "A field guide to making incident response calmer and clearer.",
    ["operations"],
    ["Engineering"],
  );
  const speaker: RemixSpeakerRecord = {
    kind: "speaker",
    id: "speaker-1",
    eventId,
    revision: 1,
    biography: "Riley helps public-interest teams build reliable services.",
  };
  const pending = demoCandidate(session, "pending", session.revision, "candidate-1", 1, null);
  const stale = demoCandidate(secondSession, "stale", 2, "candidate-stale", 1, null);
  return {
    records: [session, secondSession, speaker],
    candidates: [pending, stale],
    audit: [
      {
        id: "audit-generated",
        tenantId: "tenant-demo",
        eventId,
        candidateId: pending.id,
        actorId: pending.createdBy,
        action: "candidate.generated",
        createdAt: pending.createdAt,
        details: { generation: 1, sourceRevision: pending.sourceRevision },
      },
      {
        id: "audit-stale",
        tenantId: "tenant-demo",
        eventId,
        candidateId: stale.id,
        actorId: "system",
        action: "candidate.stale",
        createdAt: stale.staleAt ?? stale.createdAt,
        details: {
          previousSourceRevision: stale.sourceRevision,
          currentSourceRevision: secondSession.revision,
        },
      },
    ],
  };
}

function localCandidate(
  source: RemixSourceRecord,
  fields: readonly RemixField[],
  tone: string,
  guidance: string,
  parent: RemixCandidate | undefined,
): RemixCandidate {
  const original = sourceContent(source);
  const candidate: RemixContent =
    source.kind === "session"
      ? {
          ...original,
          ...(fields.includes("title") ? { title: `${source.title} — in practice` } : {}),
          ...(fields.includes("description")
            ? {
                description: `${source.description} Written in a ${tone.toLocaleLowerCase()} tone.`,
              }
            : {}),
        }
      : {
          biography: fields.includes("biography")
            ? `${source.biography} Focused on useful lessons for this event audience.`
            : source.biography,
        };
  const changedFields = fields.filter(
    (field) =>
      inputValue(valueForField(original, field)) !== inputValue(valueForField(candidate, field)),
  );
  const generation = parent === undefined ? 1 : parent.generation + 1;
  return {
    id: `candidate-local-${generation}-${source.id}`,
    tenantId: "tenant-local",
    eventId: source.eventId,
    sourceType: source.kind,
    sourceId: source.id,
    sourceRevision: source.revision,
    fields: [...fields],
    tone,
    guidance,
    original,
    candidate,
    changedFields,
    changeSummary:
      changedFields.length === 0
        ? "The provider found no changes in the requested fields."
        : `Updated ${changedFields.map((field) => fieldLabels[field].toLocaleLowerCase()).join(", ")}.`,
    provenance: {
      provider: "local-demo-provider",
      model: "local-demo-model",
      promptVersion: "remix-demo-v1",
      generatedAt: new Date().toISOString(),
    },
    status: "pending",
    version: 1,
    generation,
    parentCandidateId: parent?.id ?? null,
    createdAt: new Date().toISOString(),
    createdBy: "organizer-demo",
  };
}

function WorkspaceStatus({
  organizationId,
  eventId,
  message,
  error = false,
}: Readonly<{
  organizationId: string;
  eventId: string;
  message: string;
  error?: boolean;
}>) {
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1rem" }}>
      <p style={mutedStyle}>
        Organization {organizationId || "(missing)"} · Event {eventId || "(missing)"}
      </p>
      <h1>Human-applied content remix</h1>
      <section style={panelStyle} role={error ? "alert" : "status"} aria-live="polite">
        <h2>{error ? "Remix unavailable" : "Loading remix workspace"}</h2>
        <p>{message}</p>
      </section>
    </main>
  );
}

export function RemixWorkspace({ organizationId, eventId, api: apiOverride }: RemixWorkspaceProps) {
  const scopeValid = organizationId.trim().length > 0 && eventId.trim().length > 0;
  const baseUrl = "";
  const testMode = apiOverride === undefined && process.env.NODE_ENV === "test";
  const api = useMemo(() => {
    if (apiOverride !== undefined) return apiOverride;
    if (testMode || !scopeValid) return null;
    try {
      return createRemixApi(baseUrl, organizationId);
    } catch {
      return null;
    }
  }, [apiOverride, organizationId, scopeValid, testMode]);
  const demo = useMemo(() => demoWorkspaceData(eventId), [eventId]);
  const [sourceType, setSourceType] = useState<RemixSourceType>("session");
  const sourceTypeInitialized = useRef(false);
  const [records, setRecords] = useState<readonly RemixSourceRecord[]>(() =>
    testMode ? demo.records : [],
  );
  const [candidates, setCandidates] = useState<readonly RemixCandidate[]>(() =>
    testMode ? demo.candidates : [],
  );
  const [audit, setAudit] = useState<readonly RemixAuditEntry[]>(() =>
    testMode ? demo.audit : [],
  );
  const [selectedSourceIds, setSelectedSourceIds] = useState<readonly string[]>(() =>
    testMode ? ["session-1"] : [],
  );
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(() =>
    testMode ? "candidate-1" : null,
  );
  const [candidateFilter, setCandidateFilter] = useState<RemixCandidate["status"] | "all">("all");
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [trackFilter, setTrackFilter] = useState("");
  const [fields, setFields] = useState<readonly RemixField[]>(["title", "description"]);
  const [tone, setTone] = useState("Clear and practical");
  const [guidance, setGuidance] = useState(
    "Keep the author's meaning and make the outcome concrete.",
  );
  const [humanConfirmed, setHumanConfirmed] = useState(false);
  const [draftContent, setDraftContent] = useState<Readonly<Record<string, string>>>({});
  const [loading, setLoading] = useState(!testMode && api !== null && scopeValid);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(() => {
    if (!scopeValid) return "Organization and event scope are required.";
    return null;
  });
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!sourceTypeInitialized.current) {
      sourceTypeInitialized.current = true;
      return;
    }
    setSelectedSourceIds([]);
    setFields(sourceType === "session" ? ["title", "description"] : ["biography"]);
    setSearch("");
    setTagFilter("");
    setTrackFilter("");
  }, [sourceType]);

  useEffect(() => {
    if (testMode) return;
    let active = true;
    if (!scopeValid) {
      setLoading(false);
      setError("Organization and event scope are required.");
      return () => {
        active = false;
      };
    }
    if (api === null) {
      setLoading(false);
      return () => {
        active = false;
      };
    }
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    void Promise.all([
      api.listRecords({
        eventId,
        sourceType,
        filter: {
          query: search,
          tags: normalizeFilterInput(tagFilter),
          tracks: normalizeFilterInput(trackFilter),
        },
        signal: controller.signal,
      }),
      api.listCandidates({ eventId, signal: controller.signal }),
      api.listAudit(eventId, controller.signal),
    ])
      .then(([nextRecords, nextCandidates, nextAudit]) => {
        if (!active) return;
        setRecords(nextRecords.filter((record) => record.eventId === eventId));
        setCandidates(nextCandidates.filter((candidate) => candidate.eventId === eventId));
        setAudit(nextAudit.filter((entry) => entry.eventId === eventId));
        setSelectedCandidateId((current) =>
          current !== null && nextCandidates.some((candidate) => candidate.id === current)
            ? current
            : (nextCandidates[0]?.id ?? null),
        );
      })
      .catch((reason: unknown) => {
        if (active && reason instanceof DOMException && reason.name === "AbortError") return;
        if (active) setError(messageFrom(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [api, eventId, scopeValid, search, sourceType, tagFilter, testMode, trackFilter]);

  const availableFields = fieldsForSourceType(sourceType);
  const visibleRecords = useMemo(() => {
    const tagValues = normalizeFilterInput(tagFilter);
    const trackValues = normalizeFilterInput(trackFilter);
    return records.filter(
      (record) =>
        record.eventId === eventId &&
        record.kind === sourceType &&
        recordMatches(record, search, tagValues, trackValues),
    );
  }, [eventId, records, search, sourceType, tagFilter, trackFilter]);
  const visibleCandidates = useMemo(
    () =>
      candidates.filter(
        (candidate) =>
          candidate.eventId === eventId &&
          (candidateFilter === "all" || candidate.status === candidateFilter),
      ),
    [candidateFilter, candidates, eventId],
  );
  const selectedCandidate = candidates.find((candidate) => candidate.id === selectedCandidateId);
  const selectedCandidateSource = candidateSource(selectedCandidate, records);
  const sourceChanged =
    selectedCandidate !== undefined &&
    (selectedCandidateSource === undefined ||
      selectedCandidateSource.revision !== selectedCandidate.sourceRevision);
  const staleCandidate = selectedCandidate?.status === "stale" || sourceChanged;
  const canApply =
    selectedCandidate !== undefined &&
    selectedCandidate.status === "pending" &&
    !staleCandidate &&
    humanConfirmed &&
    busyAction === null;

  useEffect(() => {
    if (selectedCandidate === undefined) {
      setDraftContent({});
      setHumanConfirmed(false);
      return;
    }
    const nextDraft: Record<string, string> = {};
    for (const field of selectedCandidate.fields) {
      nextDraft[field] = inputValue(valueForField(selectedCandidate.candidate, field));
    }
    setDraftContent(nextDraft);
    setHumanConfirmed(false);
  }, [selectedCandidate]);

  function toggleSource(sourceId: string): void {
    setSelectedSourceIds((current) =>
      current.includes(sourceId) ? current.filter((id) => id !== sourceId) : [...current, sourceId],
    );
  }

  function toggleField(field: RemixField): void {
    setFields((current) =>
      current.includes(field)
        ? current.filter((candidate) => candidate !== field)
        : [...current, field],
    );
  }

  function selectCandidate(candidateId: string): void {
    setSelectedCandidateId(candidateId);
    setActionError(null);
    setActionMessage(null);
  }

  async function generate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setActionError(null);
    setActionMessage(null);
    if (selectedSourceIds.length === 0) {
      setActionError("Choose at least one session or speaker before generating.");
      return;
    }
    if (fields.length === 0) {
      setActionError("Choose at least one field from the source-type allowlist.");
      return;
    }
    if (tone.trim().length === 0) {
      setActionError("Enter a tone before generating.");
      return;
    }
    setBusyAction("generate");
    try {
      const generated =
        api === null
          ? selectedSourceIds.flatMap((sourceId) => {
              const source = records.find(
                (record) => record.id === sourceId && record.kind === sourceType,
              );
              return source === undefined
                ? []
                : [localCandidate(source, fields, tone.trim(), guidance.trim(), undefined)];
            })
          : await api.generate({
              eventId,
              sourceType,
              sourceIds: selectedSourceIds,
              fields,
              tone: tone.trim(),
              ...(guidance.trim().length === 0 ? {} : { guidance: guidance.trim() }),
            });
      setCandidates((current) => [...generated, ...current]);
      const first = generated[0];
      if (first !== undefined) setSelectedCandidateId(first.id);
      setActionMessage(
        `${generated.length} private candidate${generated.length === 1 ? "" : "s"} generated. A human must review before apply.`,
      );
    } catch (reason: unknown) {
      setActionError(messageFrom(reason));
    } finally {
      setBusyAction(null);
    }
  }

  async function regenerate(): Promise<void> {
    if (selectedCandidate === undefined || selectedCandidate.status === "applied") return;
    setBusyAction("regenerate");
    setActionError(null);
    setActionMessage(null);
    try {
      const regenerated =
        api === null
          ? (() => {
              const source = selectedCandidateSource;
              if (source === undefined) throw new Error("The source is no longer available.");
              return localCandidate(
                source,
                selectedCandidate.fields,
                tone.trim(),
                guidance.trim(),
                selectedCandidate,
              );
            })()
          : await api.regenerate({
              eventId,
              candidateId: selectedCandidate.id,
              ...(tone.trim().length === 0 ? {} : { tone: tone.trim() }),
              ...(guidance.trim().length === 0 ? {} : { guidance: guidance.trim() }),
            });
      setCandidates((current) => [
        regenerated,
        ...current.map((candidate) =>
          candidate.id === selectedCandidate.id && candidate.status === "pending"
            ? {
                ...candidate,
                status: "rejected" as const,
                version: candidate.version + 1,
                rejectionReason: "Superseded by regeneration.",
              }
            : candidate,
        ),
      ]);
      setSelectedCandidateId(regenerated.id);
      setActionMessage(
        `Generation ${regenerated.generation} created from ${selectedCandidate.id}. The prior candidate remains in the audit lineage.`,
      );
    } catch (reason: unknown) {
      setActionError(messageFrom(reason));
    } finally {
      setBusyAction(null);
    }
  }

  async function reject(): Promise<void> {
    if (selectedCandidate === undefined || selectedCandidate.status === "applied") return;
    setBusyAction("reject");
    setActionError(null);
    setActionMessage(null);
    try {
      const rejected =
        api === null
          ? {
              ...selectedCandidate,
              status: "rejected" as const,
              version: selectedCandidate.version + 1,
              rejectedAt: new Date().toISOString(),
              rejectedBy: "organizer-demo",
              rejectionReason: "Rejected by the human organizer.",
            }
          : await api.reject({
              eventId,
              candidateId: selectedCandidate.id,
              reason: "Rejected by the human organizer.",
            });
      setCandidates((current) =>
        current.map((candidate) => (candidate.id === rejected.id ? rejected : candidate)),
      );
      setAudit((current) => [
        {
          id: `audit-local-rejected-${rejected.id}`,
          tenantId: rejected.tenantId,
          eventId: rejected.eventId,
          candidateId: rejected.id,
          actorId: rejected.rejectedBy ?? "organizer",
          action: "candidate.rejected",
          createdAt: rejected.rejectedAt ?? new Date().toISOString(),
          details: { reason: rejected.rejectionReason ?? "rejected" },
        },
        ...current,
      ]);
      setActionMessage("Candidate rejected and recorded in the human audit trail.");
    } catch (reason: unknown) {
      setActionError(messageFrom(reason));
    } finally {
      setBusyAction(null);
    }
  }

  async function apply(): Promise<void> {
    if (selectedCandidate === undefined || !canApply) return;
    setBusyAction("apply");
    setActionError(null);
    setActionMessage(null);
    try {
      const content = allowedContentForApply(selectedCandidate, draftContent);
      const revision: RemixContentRevision =
        api === null
          ? {
              id: `revision-local-${selectedCandidate.id}`,
              tenantId: selectedCandidate.tenantId,
              eventId: selectedCandidate.eventId,
              sourceType: selectedCandidate.sourceType,
              sourceId: selectedCandidate.sourceId,
              sourceRevision: selectedCandidate.sourceRevision,
              fields: selectedCandidate.fields,
              content: {
                ...(selectedCandidate.sourceType === "session"
                  ? selectedCandidate.candidate
                  : selectedCandidate.candidate),
                ...content,
              } as RemixContent,
              candidateId: selectedCandidate.id,
              appliedBy: "organizer-demo",
              appliedAt: new Date().toISOString(),
            }
          : await api.apply({
              eventId,
              candidateId: selectedCandidate.id,
              expectedVersion: selectedCandidate.version,
              content,
            });
      const appliedAt = revision.appliedAt;
      setCandidates((current) =>
        current.map((candidate) =>
          candidate.id === selectedCandidate.id
            ? {
                ...candidate,
                status: "applied" as const,
                version: candidate.version + 1,
                candidate: revision.content,
                appliedAt,
                appliedBy: revision.appliedBy,
                appliedRevisionId: revision.id,
              }
            : candidate,
        ),
      );
      setAudit((current) => [
        {
          id: `audit-local-applied-${selectedCandidate.id}`,
          tenantId: selectedCandidate.tenantId,
          eventId: selectedCandidate.eventId,
          candidateId: selectedCandidate.id,
          actorId: revision.appliedBy,
          action: "candidate.applied",
          createdAt: appliedAt,
          details: {
            contentRevisionId: revision.id,
            sourceRevision: selectedCandidate.sourceRevision,
            humanEdited: true,
          },
        },
        ...current,
      ]);
      setHumanConfirmed(false);
      setActionMessage(
        "Applied to event content by a human organizer and recorded in the audit trail. Public content changed only now.",
      );
    } catch (reason: unknown) {
      setActionError(messageFrom(reason));
    } finally {
      setBusyAction(null);
    }
  }

  if (!scopeValid) {
    return (
      <WorkspaceStatus
        organizationId={organizationId}
        eventId={eventId}
        message="Organization and event scope are required."
        error
      />
    );
  }
  if (loading) {
    return (
      <WorkspaceStatus
        organizationId={organizationId}
        eventId={eventId}
        message="Loading event-scoped sessions, speakers, and remix candidates…"
      />
    );
  }
  if (error !== null && records.length === 0 && !testMode) {
    return (
      <WorkspaceStatus organizationId={organizationId} eventId={eventId} message={error} error />
    );
  }

  return (
    <main
      style={{ maxWidth: 1200, margin: "0 auto", padding: "1.5rem 1rem 4rem" }}
      id="remix-workspace"
    >
      <a href="#remix-content" style={{ position: "absolute", left: -10000, top: "auto" }}>
        Skip to remix workspace content
      </a>
      <header style={{ borderBottom: "1px solid #d6dbe3", paddingBlockEnd: "1.25rem" }}>
        <p style={mutedStyle}>
          Organization {organizationId} · Event {eventId}
        </p>
        <h1>Human-applied content remix</h1>
        <p>
          Prepare private session or speaker copy with an advisory provider, compare it to the
          source, and apply only the fields an authorized human approves.
        </p>
      </header>

      <aside
        style={{ ...panelStyle, borderColor: "#9bb7d4", background: "#f4f8fc" }}
        role="note"
        aria-labelledby="remix-authority-title"
      >
        <h2 id="remix-authority-title">Candidates are private until a human applies them</h2>
        <p>
          AI-generated candidates cannot affect public content, published sessions, or speaker
          profiles. They remain private workspace data until a human organizer reviews the
          source-versus-candidate comparison, confirms the allowed fields, and applies the change.
        </p>
        <p style={mutedStyle}>
          AI is advisory; it cannot apply, publish, reject, or decide content on behalf of a human.
        </p>
      </aside>

      <div id="remix-content" tabIndex={-1}>
        <section style={panelStyle} aria-labelledby="source-heading">
          <h2 id="source-heading">1. Choose event content</h2>
          <p style={mutedStyle}>
            Both organization and event scope are enforced by every request. Select one or more
            records from this event only.
          </p>
          <div style={gridStyle}>
            <label>
              Source type
              <select
                id="remix-source-type"
                value={sourceType}
                onChange={(event) => setSourceType(event.currentTarget.value as RemixSourceType)}
              >
                <option value="session">Sessions</option>
                <option value="speaker">Speakers</option>
              </select>
            </label>
            <label>
              Search sessions or speakers
              <input
                id="remix-record-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                placeholder="Title, biography, or id"
              />
            </label>
            {sourceType === "session" ? (
              <>
                <label>
                  Filter by tag
                  <input
                    id="remix-tag-filter"
                    value={tagFilter}
                    onChange={(event) => setTagFilter(event.currentTarget.value)}
                    placeholder="design, operations"
                    aria-describedby="remix-filter-help"
                  />
                </label>
                <label>
                  Filter by track
                  <input
                    id="remix-track-filter"
                    value={trackFilter}
                    onChange={(event) => setTrackFilter(event.currentTarget.value)}
                    placeholder="Civic technology"
                    aria-describedby="remix-filter-help"
                  />
                </label>
              </>
            ) : null}
          </div>
          <p id="remix-filter-help" style={mutedStyle}>
            Comma-separated filters match every requested tag or track.
          </p>
          <fieldset>
            <legend>
              {sourceType === "session" ? "Sessions in this event" : "Speakers in this event"}
            </legend>
            {visibleRecords.length === 0 ? (
              <p role="status">No {sourceType} records match the current filters.</p>
            ) : (
              <ul>
                {visibleRecords.map((record) => {
                  const label = record.kind === "session" ? record.title : record.biography;
                  return (
                    <li key={record.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={selectedSourceIds.includes(record.id)}
                          onChange={() => toggleSource(record.id)}
                        />
                        <strong>{label}</strong>{" "}
                        <span style={mutedStyle}>
                          ({record.id}, revision {record.revision})
                        </span>
                      </label>
                      {record.kind === "session" ? (
                        <span
                          style={{ ...mutedStyle, display: "block", marginInlineStart: "1.5rem" }}
                        >
                          {(record.tags ?? []).join(", ") || "No tags"} ·{" "}
                          {(record.tracks ?? []).join(", ") || "No tracks"}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </fieldset>
        </section>

        <section style={panelStyle} aria-labelledby="instruction-heading">
          <h2 id="instruction-heading">2. Set tone and guidance</h2>
          <p style={mutedStyle}>
            The provider receives only the selected records and requested fields. Keep instructions
            factual and review the result.
          </p>
          <form onSubmit={(event) => void generate(event)}>
            <div style={gridStyle}>
              <label>
                Tone <span aria-hidden="true">*</span>
                <input
                  id="remix-tone"
                  required
                  maxLength={120}
                  value={tone}
                  onChange={(event) => setTone(event.currentTarget.value)}
                  aria-describedby="remix-tone-help"
                />
                <span id="remix-tone-help" style={mutedStyle}>
                  Up to 120 characters.
                </span>
              </label>
              <label>
                Guidance
                <textarea
                  id="remix-guidance"
                  maxLength={2000}
                  rows={4}
                  value={guidance}
                  onChange={(event) => setGuidance(event.currentTarget.value)}
                  aria-describedby="remix-guidance-help"
                />
                <span id="remix-guidance-help" style={mutedStyle}>
                  Optional, up to 2,000 characters.
                </span>
              </label>
            </div>
            <fieldset>
              <legend>Fields the provider may change</legend>
              <p style={mutedStyle}>
                Only these event content fields can be returned or applied; omitted fields remain
                unchanged.
              </p>
              <div style={actionRowStyle}>
                {availableFields.map((field) => (
                  <label key={field}>
                    <input
                      type="checkbox"
                      checked={fields.includes(field)}
                      onChange={() => toggleField(field)}
                    />
                    {fieldLabels[field]}
                  </label>
                ))}
              </div>
            </fieldset>
            {actionError ? (
              <p style={errorStyle} role="alert">
                {actionError}
              </p>
            ) : null}
            {actionMessage ? (
              <p role="status" aria-live="polite">
                {actionMessage}
              </p>
            ) : null}
            <button type="submit" disabled={busyAction !== null}>
              {busyAction === "generate"
                ? "Generating private candidates…"
                : "Generate private candidates"}
            </button>
          </form>
        </section>

        <section style={panelStyle} aria-labelledby="candidate-heading">
          <div style={actionRowStyle}>
            <div>
              <h2 id="candidate-heading">3. Review candidate comparison</h2>
              <p style={mutedStyle}>
                A candidate is a private proposal, not a publication. Stale candidates cannot be
                applied.
              </p>
            </div>
            <label>
              Filter candidates
              <select
                id="remix-candidate-filter"
                value={candidateFilter}
                onChange={(event) =>
                  setCandidateFilter(event.currentTarget.value as RemixCandidate["status"] | "all")
                }
              >
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="stale">Stale</option>
                <option value="rejected">Rejected</option>
                <option value="applied">Applied</option>
              </select>
            </label>
          </div>
          {visibleCandidates.length === 0 ? (
            <p role="status">
              No candidates match this filter. Generate a private candidate above.
            </p>
          ) : (
            <ul aria-label="Remix candidates">
              {visibleCandidates.map((candidate) => {
                const stale =
                  candidate.status === "stale" ||
                  (candidateSource(candidate, records)?.revision !== undefined &&
                    candidateSource(candidate, records)?.revision !== candidate.sourceRevision);
                return (
                  <li key={candidate.id} style={{ marginBlock: "0.5rem" }}>
                    <button
                      type="button"
                      aria-pressed={selectedCandidateId === candidate.id}
                      onClick={() => selectCandidate(candidate.id)}
                    >
                      {candidate.sourceType} · {candidate.sourceId} · generation{" "}
                      {candidate.generation} · {candidateStatusLabel(candidate)}
                      {stale ? " · source changed" : ""}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {selectedCandidate ? (
          <section style={panelStyle} aria-labelledby="comparison-heading">
            <div style={actionRowStyle}>
              <div>
                <h2 id="comparison-heading">Source versus candidate</h2>
                <p style={mutedStyle}>
                  {selectedCandidate.sourceType} {selectedCandidate.sourceId} · source revision{" "}
                  {selectedCandidate.sourceRevision} · candidate version {selectedCandidate.version}
                </p>
              </div>
              <span>{candidateStatusLabel(selectedCandidate)}</span>
            </div>
            {staleCandidate ? (
              <p style={errorStyle} role="alert">
                This candidate is stale because the source revision changed or was removed. Apply is
                disabled; regenerate against the current source.
              </p>
            ) : null}
            <table>
              <caption>Requested field comparison and human edits</caption>
              <thead>
                <tr>
                  <th scope="col">Field</th>
                  <th scope="col">Original source</th>
                  <th scope="col">Candidate and human edit</th>
                </tr>
              </thead>
              <tbody>
                {selectedCandidate.fields.map((field) => (
                  <tr key={field}>
                    <th scope="row">{fieldLabels[field]}</th>
                    <td>{displayValue(valueForField(selectedCandidate.original, field))}</td>
                    <td>
                      {selectedCandidate.status === "pending" && !staleCandidate ? (
                        field === "tags" || field === "tracks" ? (
                          <input
                            aria-label={`${fieldLabels[field]} candidate value`}
                            value={
                              draftContent[field] ??
                              inputValue(valueForField(selectedCandidate.candidate, field))
                            }
                            onChange={(event) => {
                              const value = event.currentTarget.value;
                              setDraftContent((current) => ({
                                ...current,
                                [field]: value,
                              }));
                            }}
                          />
                        ) : (
                          <textarea
                            aria-label={`${fieldLabels[field]} candidate value`}
                            rows={field === "description" || field === "biography" ? 5 : 2}
                            value={
                              draftContent[field] ??
                              inputValue(valueForField(selectedCandidate.candidate, field))
                            }
                            onChange={(event) => {
                              const value = event.currentTarget.value;
                              setDraftContent((current) => ({
                                ...current,
                                [field]: value,
                              }));
                            }}
                          />
                        )
                      ) : (
                        displayValue(valueForField(selectedCandidate.candidate, field))
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={panelStyle}>
              <h3>Change summary</h3>
              <p>{selectedCandidate.changeSummary}</p>
              <p style={mutedStyle}>
                Changed fields:{" "}
                {selectedCandidate.changedFields.map((field) => fieldLabels[field]).join(", ") ||
                  "None"}
              </p>
              {selectedCandidate.parentCandidateId ? (
                <p>
                  Regeneration lineage: generation {selectedCandidate.generation} · parent candidate{" "}
                  {selectedCandidate.parentCandidateId}.
                </p>
              ) : null}
            </div>
            <details>
              <summary>Provider provenance</summary>
              <dl>
                <div>
                  <dt>Provider</dt>
                  <dd>{selectedCandidate.provenance.provider}</dd>
                </div>
                <div>
                  <dt>Model</dt>
                  <dd>{selectedCandidate.provenance.model}</dd>
                </div>
                <div>
                  <dt>Prompt version</dt>
                  <dd>{selectedCandidate.provenance.promptVersion}</dd>
                </div>
                <div>
                  <dt>Generated</dt>
                  <dd>{formatTimestamp(selectedCandidate.provenance.generatedAt)}</dd>
                </div>
                {selectedCandidate.provenance.requestId ? (
                  <div>
                    <dt>Request</dt>
                    <dd>{selectedCandidate.provenance.requestId}</dd>
                  </div>
                ) : null}
              </dl>
            </details>
            <div style={{ ...actionRowStyle, marginBlockStart: "1rem" }}>
              <button
                type="button"
                onClick={() => void regenerate()}
                disabled={busyAction !== null || selectedCandidate.status === "applied"}
              >
                {busyAction === "regenerate" ? "Regenerating…" : "Regenerate candidate"}
              </button>
              <button
                type="button"
                onClick={() => void reject()}
                disabled={
                  busyAction !== null ||
                  selectedCandidate.status === "applied" ||
                  selectedCandidate.status === "rejected"
                }
              >
                {busyAction === "reject" ? "Rejecting…" : "Reject candidate"}
              </button>
            </div>
            <fieldset style={{ marginBlockStart: "1rem" }}>
              <legend>Human apply confirmation</legend>
              <label>
                <input
                  id="remix-human-confirmation"
                  type="checkbox"
                  checked={humanConfirmed}
                  onChange={(event) => setHumanConfirmed(event.currentTarget.checked)}
                  disabled={selectedCandidate.status !== "pending" || staleCandidate}
                />
                I reviewed the source, candidate, provenance, and change summary. Apply only these
                allowlisted fields to this event.
              </label>
              <p style={mutedStyle}>
                Only an authorized human organizer can apply. This action writes an auditable
                content revision; it does not happen during generation.
              </p>
              <button type="button" onClick={() => void apply()} disabled={!canApply}>
                {busyAction === "apply"
                  ? "Applying to event content…"
                  : "Apply reviewed candidate to event content"}
              </button>
            </fieldset>
          </section>
        ) : null}

        <section style={panelStyle} aria-labelledby="audit-heading">
          <h2 id="audit-heading">Human audit trail</h2>
          <p style={mutedStyle}>
            Generation, regeneration, stale-source detection, rejection, and application are
            recorded for this organization and event.
          </p>
          {audit.length === 0 ? (
            <p>No remix audit entries yet.</p>
          ) : (
            <ol>
              {audit.map((entry) => (
                <li key={entry.id}>
                  <strong>{auditActionLabel(entry.action)}</strong> · candidate {entry.candidateId}{" "}
                  · {formatTimestamp(entry.createdAt)} · actor {entry.actorId}
                </li>
              ))}
            </ol>
          )}
        </section>
        {error !== null ? (
          <p style={errorStyle} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );
}
