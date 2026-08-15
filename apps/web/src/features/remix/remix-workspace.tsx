"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useOrganizerEventId } from "@/features/admin/organizer-event-workspace";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Checkbox } from "../../components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../components/ui/collapsible";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
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
  type RemixSourceRecord,
  type RemixSourceType,
  remixSessionFields,
  remixSpeakerFields,
} from "./api";
import styles from "./remix-workspace.module.css";

export interface RemixWorkspaceProps {
  organizationId: string;
  eventId: string;
  /** Inject the authoritative API in tests or a host application. `null` means unavailable. */
  api?: RemixApi | null;
}

const fieldLabels: Readonly<Record<RemixField, string>> = {
  title: "Title",
  description: "Description",
  tags: "Tags",
  tracks: "Tracks",
  biography: "Biography",
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

function isCapabilityUnavailable(error: unknown): boolean {
  return (
    error instanceof RemixApiError && (error.status === 404 || error.code === "REMIX_NOT_FOUND")
  );
}

function fieldsForSourceType(sourceType: RemixSourceType): readonly RemixField[] {
  return sourceType === "session" ? remixSessionFields : remixSpeakerFields;
}

function isSessionContent(content: RemixContent): content is RemixSessionContent {
  return "title" in content;
}

function valueForField(content: RemixContent, field: RemixField): string | readonly string[] {
  if (field === "biography") return !isSessionContent(content) ? content.biography : "";
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
 * Human edits cannot smuggle fields outside the generation request into apply.
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

function candidateSource(
  candidate: RemixCandidate | undefined,
  records: readonly RemixSourceRecord[],
): RemixSourceRecord | undefined {
  if (candidate === undefined) return undefined;
  return records.find(
    (record) => record.kind === candidate.sourceType && record.id === candidate.sourceId,
  );
}

/** A filtered-out source is not evidence of a source revision change. */
export function candidateIsStale(
  candidate: Pick<RemixCandidate, "status" | "sourceRevision">,
  source: Pick<RemixSourceRecord, "revision"> | undefined,
): boolean {
  return (
    candidate.status === "stale" ||
    (source !== undefined && source.revision !== candidate.sourceRevision)
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

function directRemixHref(organizationId: string, eventId: string): string {
  return `/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventId)}/remix`;
}

function ScopeStatus({
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
    <main className={styles.statusPage}>
      <p className={styles.eyebrow}>
        Organization {organizationId || "(missing)"} · Event {eventId || "(missing)"}
      </p>
      <h1>Content remix workspace unavailable</h1>
      <Card role={error ? "alert" : "status"} aria-live="polite">
        <CardHeader>
          <CardTitle>{error ? "Remix unavailable" : "Loading remix workspace"}</CardTitle>
        </CardHeader>
        <CardContent>
          <p>{message}</p>
        </CardContent>
      </Card>
    </main>
  );
}

function CapabilityUnavailable({
  organizationId,
  eventId,
  reason,
}: Readonly<{ organizationId: string; eventId: string; reason?: string | null }>) {
  return (
    <main className={styles.statusPage}>
      <p className={styles.eyebrow}>
        Organization {organizationId} · Event {eventId}
      </p>
      <Card className={styles.unavailableCard}>
        <CardHeader>
          <Badge variant="outline">Unavailable</Badge>
          <CardTitle>Content remix is unavailable</CardTitle>
          <CardDescription>
            {reason ?? "This event does not have an approved content remix capability."}
          </CardDescription>
        </CardHeader>
        <CardContent className={styles.stack}>
          <p>
            Content remix makes private draft suggestions for selected session or speaker copy. It
            never publishes automatically. An organizer reviews, edits, and applies an auditable
            revision.
          </p>
          <Alert>
            <AlertTitle>No local candidate was created</AlertTitle>
            <AlertDescription>
              Suggestions, rejection, application, and audit records require the authoritative
              capability. Nothing was inferred or saved in this browser.
            </AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter className={styles.unavailableFooter}>
          <a className={styles.directLink} href={directRemixHref(organizationId, eventId)}>
            Open Content remix directly
          </a>
        </CardFooter>
      </Card>
    </main>
  );
}

export function RemixWorkspace({
  organizationId,
  eventId: fallbackEventId,
  api: apiOverride,
}: RemixWorkspaceProps) {
  const eventId = useOrganizerEventId(fallbackEventId);
  const scopeValid = organizationId.trim().length > 0 && eventId.trim().length > 0;
  const api = useMemo<RemixApi | null>(() => {
    if (apiOverride !== undefined) return apiOverride;
    // Tests must inject an API; never manufacture candidates for the test environment.
    if (process.env.NODE_ENV === "test" || !scopeValid) return null;
    try {
      return createRemixApi("", organizationId);
    } catch {
      return null;
    }
  }, [apiOverride, organizationId, scopeValid]);
  const [capabilityUnavailable, setCapabilityUnavailable] = useState(api === null);
  const [capabilityMessage, setCapabilityMessage] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<RemixSourceType>("session");
  const sourceTypeInitialized = useRef(false);
  const [records, setRecords] = useState<readonly RemixSourceRecord[]>([]);
  const [candidates, setCandidates] = useState<readonly RemixCandidate[]>([]);
  const [audit, setAudit] = useState<readonly RemixAuditEntry[]>([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState<readonly string[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
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
  const [loading, setLoading] = useState(api !== null && scopeValid);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(() =>
    scopeValid ? null : "Organization and event scope are required.",
  );
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const applyButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setCapabilityUnavailable(api === null);
    setCapabilityMessage(null);
    if (api === null) {
      setLoading(false);
      setRecords([]);
      setCandidates([]);
      setAudit([]);
    }
  }, [api]);

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
    if (!scopeValid || api === null || capabilityUnavailable) {
      setLoading(false);
      return;
    }
    let active = true;
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
        if (!active || (reason instanceof DOMException && reason.name === "AbortError")) return;
        if (isCapabilityUnavailable(reason)) {
          setCapabilityUnavailable(true);
          setCapabilityMessage(reason instanceof Error ? reason.message : "Capability not found.");
          setRecords([]);
          setCandidates([]);
          setAudit([]);
          return;
        }
        setError(messageFrom(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [api, capabilityUnavailable, eventId, scopeValid, search, sourceType, tagFilter, trackFilter]);

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
  const staleCandidate =
    selectedCandidate !== undefined && candidateIsStale(selectedCandidate, selectedCandidateSource);
  const canApply =
    api !== null &&
    !loading &&
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
    if (api === null) {
      setActionError("Content remix is unavailable. No candidate was created.");
      return;
    }
    if (loading) {
      setActionError("Remix data is still loading. Try again when the capability is ready.");
      return;
    }
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
      const generated = await api.generate({
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
    if (api === null) {
      setActionError("Content remix is unavailable. No candidate was regenerated.");
      return;
    }
    if (selectedCandidate === undefined || selectedCandidate.status === "applied") return;
    setBusyAction("regenerate");
    setActionError(null);
    setActionMessage(null);
    try {
      const regenerated = await api.regenerate({
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
    if (api === null) {
      setActionError("Content remix is unavailable. No candidate was rejected.");
      return;
    }
    if (selectedCandidate === undefined || selectedCandidate.status === "applied") return;
    setBusyAction("reject");
    setActionError(null);
    setActionMessage(null);
    try {
      const rejected = await api.reject({
        eventId,
        candidateId: selectedCandidate.id,
        reason: "Rejected by the human organizer.",
      });
      setCandidates((current) =>
        current.map((candidate) => (candidate.id === rejected.id ? rejected : candidate)),
      );
      // The server is the audit authority; never synthesize a local audit entry.
      const nextAudit = await api.listAudit(eventId);
      setAudit(nextAudit.filter((entry) => entry.eventId === eventId));
      setActionMessage(
        "Candidate rejected by a human organizer and recorded by the server audit trail.",
      );
    } catch (reason: unknown) {
      setActionError(messageFrom(reason));
    } finally {
      setBusyAction(null);
    }
  }

  async function commitApply(): Promise<void> {
    if (api === null || selectedCandidate === undefined || !canApply) return;
    setBusyAction("apply");
    setActionError(null);
    setApplyError(null);
    setActionMessage(null);
    try {
      const content = allowedContentForApply(selectedCandidate, draftContent);
      const revision: RemixContentRevision = await api.apply({
        eventId,
        candidateId: selectedCandidate.id,
        expectedVersion: selectedCandidate.version,
        content,
      });
      setCandidates((current) =>
        current.map((candidate) =>
          candidate.id === selectedCandidate.id
            ? {
                ...candidate,
                status: "applied" as const,
                version: candidate.version + 1,
                candidate: revision.content,
                appliedAt: revision.appliedAt,
                appliedBy: revision.appliedBy,
                appliedRevisionId: revision.id,
              }
            : candidate,
        ),
      );
      // The server is the audit authority; never synthesize a local audit entry.
      const nextAudit = await api.listAudit(eventId);
      setAudit(nextAudit.filter((entry) => entry.eventId === eventId));
      setHumanConfirmed(false);
      setApplyDialogOpen(false);
      setApplyError(null);
      setActionMessage(
        "Applied to event content by a human organizer and recorded in the server audit trail. Public content changed only now.",
      );
    } catch (reason: unknown) {
      const message = messageFrom(reason);
      setActionError(message);
      setApplyError(message);
    } finally {
      setBusyAction(null);
    }
  }
  function openApplyDialog(): void {
    if (!canApply) return;
    setApplyError(null);
    setActionError(null);
    setApplyDialogOpen(true);
  }

  function jumpToSection(section: string): void {
    if (typeof document === "undefined") return;
    document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (!scopeValid) {
    return (
      <ScopeStatus
        organizationId={organizationId}
        eventId={eventId}
        message="Organization and event scope are required."
        error
      />
    );
  }
  if (capabilityUnavailable) {
    return (
      <CapabilityUnavailable
        organizationId={organizationId}
        eventId={eventId}
        reason={capabilityMessage}
      />
    );
  }

  return (
    <main className={styles.workspace} id="remix-workspace">
      <a className={styles.skipLink} href="#remix-choose">
        Skip to remix workspace content
      </a>
      <header className={styles.header}>
        <p className={styles.eyebrow}>
          Organization {organizationId} · Event {eventId}
        </p>
        <h1>Human-governed content remix</h1>
        <p>
          Prepare private session or speaker copy with an advisory provider, compare it to the
          source, and apply only the fields an authorized human approves.
        </p>
      </header>

      <Alert className={styles.authorityAlert}>
        <AlertTitle>Candidates are private until a human applies them</AlertTitle>
        <AlertDescription>
          AI-generated candidates cannot affect public content, published sessions, or speaker
          profiles. The provider is advisory: it cannot apply, publish, reject, or decide content on
          behalf of a human organizer. Only an authorized human organizer can apply a reviewed
          candidate.
        </AlertDescription>
      </Alert>

      <nav className={styles.sectionNav} aria-label="Remix workspace sections">
        <a href="#remix-choose">Choose content</a>
        <a href="#remix-instructions">Instructions</a>
        <a href="#remix-review">Review</a>
        <a href="#remix-audit">Audit</a>
      </nav>
      <div className={styles.mobileSectionSwitcher}>
        <Label htmlFor="remix-section-switcher">Jump to section</Label>
        <select
          id="remix-section-switcher"
          defaultValue="remix-choose"
          onChange={(event) => jumpToSection(event.currentTarget.value)}
        >
          <option value="remix-choose">Choose content</option>
          <option value="remix-instructions">Instructions</option>
          <option value="remix-review">Review</option>
          <option value="remix-audit">Audit</option>
        </select>
      </div>

      <div className={styles.content} id="remix-content" tabIndex={-1}>
        <Card id="remix-choose">
          <CardHeader>
            <Badge variant="outline">1 · Choose content</Badge>
            <h2 data-slot="card-title" className="font-heading text-base leading-snug font-medium">
              Choose content
            </h2>
            <CardDescription>
              Choose event content from sessions or speakers in this event only. Browse filters
              affect the list, not source revision truth.
            </CardDescription>
          </CardHeader>
          <CardContent className={styles.stack}>
            <div className={styles.formGrid}>
              <div className={styles.fieldLabel}>
                <Label htmlFor="remix-source-type">Source type</Label>
                <Select
                  value={sourceType}
                  onValueChange={(value) => setSourceType(value as RemixSourceType)}
                >
                  <SelectTrigger
                    id="remix-source-type"
                    className={styles.selectTrigger}
                    aria-label="Source type"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="session">Sessions</SelectItem>
                    <SelectItem value="speaker">Speakers</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className={styles.fieldLabel}>
                <Label htmlFor="remix-record-search">Search sessions or speakers</Label>
                <Input
                  id="remix-record-search"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.currentTarget.value)}
                  placeholder="Title, biography, or id"
                />
              </div>
              {sourceType === "session" ? (
                <>
                  <div className={styles.fieldLabel}>
                    <Label htmlFor="remix-tag-filter">Filter by tag</Label>
                    <Input
                      id="remix-tag-filter"
                      value={tagFilter}
                      onChange={(event) => setTagFilter(event.currentTarget.value)}
                      placeholder="design, operations"
                    />
                  </div>
                  <div className={styles.fieldLabel}>
                    <Label htmlFor="remix-track-filter">Filter by track</Label>
                    <Input
                      id="remix-track-filter"
                      value={trackFilter}
                      onChange={(event) => setTrackFilter(event.currentTarget.value)}
                      placeholder="Civic technology"
                    />
                  </div>
                </>
              ) : null}
            </div>
            <p className={styles.muted}>
              Comma-separated filters match every requested tag or track.
            </p>
            {loading ? <p role="status">Loading sessions, speakers, and candidates…</p> : null}
            {error !== null ? (
              <Alert variant="destructive">
                <AlertTitle>Workspace data unavailable</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <fieldset className={styles.sourceList}>
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
                      <li key={record.id} className={styles.sourceItem}>
                        <Label
                          className={styles.checkboxLabel}
                          htmlFor={`remix-source-${record.id}`}
                        >
                          <Checkbox
                            id={`remix-source-${record.id}`}
                            className={styles.checkboxControl}
                            checked={selectedSourceIds.includes(record.id)}
                            onCheckedChange={(checked) => {
                              if (checked === true || checked === false) toggleSource(record.id);
                            }}
                          />
                          <span>
                            <strong>{label}</strong>{" "}
                            <span className={styles.muted}>
                              ({record.id}, revision {record.revision})
                            </span>
                          </span>
                        </Label>
                        {record.kind === "session" ? (
                          <span className={styles.sourceMeta}>
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
          </CardContent>
        </Card>

        <Card id="remix-instructions">
          <CardHeader>
            <Badge variant="outline">2 · Instructions</Badge>
            <h2 data-slot="card-title" className="font-heading text-base leading-snug font-medium">
              Instructions
            </h2>
            <CardDescription>
              The provider receives only selected records and requested fields. Review every private
              result before any human apply.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className={styles.stack} onSubmit={(event) => void generate(event)}>
              <div className={styles.formGrid}>
                <div className={styles.fieldLabel}>
                  <Label htmlFor="remix-tone">
                    Tone <span aria-hidden="true">*</span>
                  </Label>
                  <Input
                    id="remix-tone"
                    required
                    maxLength={120}
                    value={tone}
                    onChange={(event) => setTone(event.currentTarget.value)}
                  />
                  <span className={styles.muted}>Up to 120 characters.</span>
                </div>
                <div className={styles.fieldLabel}>
                  <Label htmlFor="remix-guidance">Guidance</Label>
                  <textarea
                    id="remix-guidance"
                    className={styles.textarea}
                    maxLength={2000}
                    rows={4}
                    value={guidance}
                    onChange={(event) => setGuidance(event.currentTarget.value)}
                  />
                  <span className={styles.muted}>Optional, up to 2,000 characters.</span>
                </div>
              </div>
              <fieldset>
                <legend>Fields the provider may change</legend>
                <p className={styles.muted}>
                  Only these event content fields can be returned or applied; omitted fields remain
                  unchanged.
                </p>
                <div className={styles.checkboxGroup}>
                  {availableFields.map((field) => (
                    <Label
                      className={styles.checkboxLabel}
                      htmlFor={`remix-field-${field}`}
                      key={field}
                    >
                      <Checkbox
                        id={`remix-field-${field}`}
                        className={styles.checkboxControl}
                        checked={fields.includes(field)}
                        onCheckedChange={(checked) => {
                          if (checked === true || checked === false) toggleField(field);
                        }}
                      />
                      {fieldLabels[field]}
                    </Label>
                  ))}
                </div>
              </fieldset>
              {actionError ? (
                <Alert variant="destructive">
                  <AlertTitle>Action not completed</AlertTitle>
                  <AlertDescription>{actionError}</AlertDescription>
                </Alert>
              ) : null}
              {actionMessage ? <p role="status">{actionMessage}</p> : null}
              <Button type="submit" disabled={busyAction !== null || loading}>
                {busyAction === "generate"
                  ? "Generating private candidates…"
                  : "Generate private candidates"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card id="remix-review">
          <CardHeader>
            <div className={styles.headerRow}>
              <div>
                <Badge variant="outline">3 · Review</Badge>
                <h2
                  data-slot="card-title"
                  className="font-heading text-base leading-snug font-medium"
                >
                  Review
                </h2>
              </div>
              <div className={styles.filterLabel}>
                <Label htmlFor="remix-candidate-filter">Filter candidates</Label>
                <Select
                  value={candidateFilter}
                  onValueChange={(value) =>
                    setCandidateFilter(value as RemixCandidate["status"] | "all")
                  }
                >
                  <SelectTrigger
                    id="remix-candidate-filter"
                    className={styles.selectTrigger}
                    aria-label="Filter candidates"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="stale">Stale</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="applied">Applied</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <CardDescription>
              A candidate is a private proposal, not a publication. Stale candidates cannot be
              applied. The source versus candidate comparison, change summary, and provider
              provenance remain visible for human review.
            </CardDescription>
          </CardHeader>
          <CardContent className={styles.stack}>
            {visibleCandidates.length === 0 ? (
              <p role="status">
                No candidates match this filter. Generate a private candidate above.
              </p>
            ) : (
              <Table>
                <TableCaption>Private remix candidates available for human review</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleCandidates.map((candidate) => {
                    const stale = candidateIsStale(candidate, candidateSource(candidate, records));
                    return (
                      <TableRow
                        key={candidate.id}
                        data-state={selectedCandidateId === candidate.id ? "selected" : undefined}
                      >
                        <TableCell>
                          <strong>
                            {candidate.sourceType} · {candidate.sourceId}
                          </strong>
                          <br />
                          <span className={styles.muted}>Generation {candidate.generation}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={stale ? "destructive" : "outline"}>
                            {stale
                              ? "Stale — regenerate before applying"
                              : candidateStatusLabel(candidate)}
                          </Badge>
                          {stale && candidate.status !== "stale" ? (
                            <span className={styles.muted}> Source changed</span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            aria-pressed={selectedCandidateId === candidate.id}
                            onClick={() => selectCandidate(candidate.id)}
                          >
                            {selectedCandidateId === candidate.id ? "Selected" : "Review candidate"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}

            {selectedCandidate ? (
              <Card className={styles.comparisonCard}>
                <CardHeader>
                  <div className={styles.headerRow}>
                    <div>
                      <CardTitle>Source versus candidate</CardTitle>
                      <CardDescription>
                        {selectedCandidate.sourceType} {selectedCandidate.sourceId} · source
                        revision {selectedCandidate.sourceRevision} · candidate version{" "}
                        {selectedCandidate.version}
                      </CardDescription>
                    </div>
                    <Badge variant={staleCandidate ? "destructive" : "outline"}>
                      {staleCandidate
                        ? "Stale — regenerate before applying"
                        : candidateStatusLabel(selectedCandidate)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className={styles.stack}>
                  {staleCandidate ? (
                    <Alert variant="destructive">
                      <AlertTitle>Source revision requires a fresh candidate</AlertTitle>
                      <AlertDescription>
                        This candidate is stale because the source revision changed. Apply is
                        disabled; regenerate against the current source.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  <Table className={styles.comparisonTable}>
                    <TableCaption>
                      Requested fields, source provenance, and human edits
                    </TableCaption>
                    <TableHeader className={styles.comparisonTableHeader}>
                      <TableRow className={styles.comparisonTableRow}>
                        <TableHead className={styles.comparisonTableHead}>Field</TableHead>
                        <TableHead className={styles.comparisonTableHead}>
                          Original source
                        </TableHead>
                        <TableHead className={styles.comparisonTableHead}>
                          Candidate and human edit
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedCandidate.fields.map((field) => (
                        <TableRow className={styles.comparisonTableRow} key={field}>
                          <TableHead className={styles.comparisonTableHead} scope="row">
                            {fieldLabels[field]}
                          </TableHead>
                          <TableCell
                            className={styles.comparisonTableCell}
                            data-label="Original source"
                          >
                            {displayValue(valueForField(selectedCandidate.original, field))}
                          </TableCell>
                          <TableCell
                            className={styles.comparisonTableCell}
                            data-label="Candidate and human edit"
                          >
                            {selectedCandidate.status === "pending" && !staleCandidate ? (
                              field === "tags" || field === "tracks" ? (
                                <Input
                                  aria-label={`${fieldLabels[field]} candidate value`}
                                  value={
                                    draftContent[field] ??
                                    inputValue(valueForField(selectedCandidate.candidate, field))
                                  }
                                  onChange={(event) =>
                                    setDraftContent((current) => ({
                                      ...current,
                                      [field]: event.currentTarget.value,
                                    }))
                                  }
                                />
                              ) : field === "description" || field === "biography" ? (
                                <textarea
                                  className={styles.textarea}
                                  aria-label={`${fieldLabels[field]} candidate value`}
                                  rows={5}
                                  value={
                                    draftContent[field] ??
                                    inputValue(valueForField(selectedCandidate.candidate, field))
                                  }
                                  onChange={(event) =>
                                    setDraftContent((current) => ({
                                      ...current,
                                      [field]: event.currentTarget.value,
                                    }))
                                  }
                                />
                              ) : (
                                <Input
                                  aria-label={`${fieldLabels[field]} candidate value`}
                                  value={
                                    draftContent[field] ??
                                    inputValue(valueForField(selectedCandidate.candidate, field))
                                  }
                                  onChange={(event) =>
                                    setDraftContent((current) => ({
                                      ...current,
                                      [field]: event.currentTarget.value,
                                    }))
                                  }
                                />
                              )
                            ) : (
                              displayValue(valueForField(selectedCandidate.candidate, field))
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <Card className={styles.summaryCard}>
                    <CardHeader>
                      <CardTitle>Change summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p>{selectedCandidate.changeSummary}</p>
                      <p className={styles.muted}>
                        Changed fields:{" "}
                        {selectedCandidate.changedFields
                          .map((field) => fieldLabels[field])
                          .join(", ") || "None"}
                      </p>
                      {selectedCandidate.parentCandidateId ? (
                        <p>
                          Regeneration lineage: generation {selectedCandidate.generation} · parent
                          candidate {selectedCandidate.parentCandidateId}.
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                  <Collapsible defaultOpen>
                    <CollapsibleTrigger asChild>
                      <Button type="button" variant="ghost" size="sm">
                        Provider provenance
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <Provenance provenance={selectedCandidate.provenance} />
                    </CollapsibleContent>
                  </Collapsible>
                  <div className={styles.actionRow}>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void regenerate()}
                      disabled={
                        busyAction !== null ||
                        loading ||
                        selectedCandidate.status === "applied" ||
                        api === null
                      }
                    >
                      {busyAction === "regenerate" ? "Regenerating…" : "Regenerate candidate"}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => void reject()}
                      disabled={
                        busyAction !== null ||
                        loading ||
                        selectedCandidate.status === "applied" ||
                        selectedCandidate.status === "rejected" ||
                        api === null
                      }
                    >
                      {busyAction === "reject" ? "Rejecting…" : "Reject candidate"}
                    </Button>
                  </div>
                  <fieldset className={styles.confirmation}>
                    <legend>Human apply confirmation</legend>
                    <Label className={styles.checkboxLabel} htmlFor="remix-human-confirmation">
                      <Checkbox
                        id="remix-human-confirmation"
                        className={styles.checkboxControl}
                        checked={humanConfirmed}
                        onCheckedChange={(checked) => setHumanConfirmed(checked === true)}
                        disabled={
                          loading ||
                          selectedCandidate.status !== "pending" ||
                          staleCandidate ||
                          api === null
                        }
                      />
                      I reviewed the source, candidate, provenance, and change summary. Apply only
                      these allowlisted fields to this event.
                    </Label>
                    <p className={styles.muted}>
                      Only an authorized human organizer can apply. This action writes an auditable
                      content revision; it does not happen during generation.
                    </p>
                    <Button
                      ref={applyButtonRef}
                      type="button"
                      onClick={openApplyDialog}
                      disabled={!canApply}
                    >
                      Apply reviewed candidate to event content
                    </Button>
                  </fieldset>
                </CardContent>
              </Card>
            ) : null}
          </CardContent>
        </Card>

        <Card id="remix-audit">
          <CardHeader>
            <Badge variant="outline">4 · Audit</Badge>
            <h2 data-slot="card-title" className="font-heading text-base leading-snug font-medium">
              Audit
            </h2>
            <CardDescription>
              Generation, regeneration, stale-source detection, rejection, and application are
              recorded by the server for this organization and event.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Collapsible defaultOpen>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" size="sm">
                  Human audit trail
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                {audit.length === 0 ? (
                  <p>No remix audit entries yet.</p>
                ) : (
                  <Table>
                    <TableCaption>Authoritative audit events</TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Action</TableHead>
                        <TableHead>Candidate</TableHead>
                        <TableHead>When</TableHead>
                        <TableHead>Actor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {audit.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell>{auditActionLabel(entry.action)}</TableCell>
                          <TableCell>{entry.candidateId}</TableCell>
                          <TableCell>{formatTimestamp(entry.createdAt)}</TableCell>
                          <TableCell>{entry.actorId}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            applyButtonRef.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm human application</AlertDialogTitle>
            <AlertDialogDescription>
              This applies the reviewed allowlisted fields to event content and creates the server
              audit record. It does not publish anything automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {applyError !== null ? (
            <Alert variant="destructive">
              <AlertTitle>Apply failed</AlertTitle>
              <AlertDescription>{applyError}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyAction === "apply"}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busyAction === "apply"}
              onClick={(event) => {
                event.preventDefault();
                void commitApply();
              }}
            >
              {busyAction === "apply" ? "Applying revision…" : "Confirm and apply revision"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function Provenance({ provenance }: Readonly<{ provenance: RemixProvenance }>) {
  return (
    <dl className={styles.provenance}>
      <div>
        <dt>Provider</dt>
        <dd>{provenance.provider}</dd>
      </div>
      <div>
        <dt>Model</dt>
        <dd>{provenance.model}</dd>
      </div>
      <div>
        <dt>Prompt version</dt>
        <dd>{provenance.promptVersion}</dd>
      </div>
      <div>
        <dt>Generated</dt>
        <dd>{formatTimestamp(provenance.generatedAt)}</dd>
      </div>
      {provenance.requestId ? (
        <div>
          <dt>Request</dt>
          <dd>{provenance.requestId}</dd>
        </div>
      ) : null}
    </dl>
  );
}
