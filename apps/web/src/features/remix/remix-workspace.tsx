"use client";

// allow: SIZE_OK — this module owns one Remix client state machine; visual sections are extracted.
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatusBadge, WorkspaceHeader } from "@/components/workspace/workspace-ui";
import { useOrganizerEventId } from "@/features/admin/organizer-event-workspace";
import { useNavigationDataCache } from "@/lib/navigation-data-cache-provider";
import {
  createRemixApi,
  type RemixApi,
  type RemixAuditEntry,
  type RemixCandidate,
  type RemixContentRevision,
  type RemixField,
  type RemixSourceRecord,
  type RemixSourceType,
} from "./api";
import styles from "./remix-workspace.module.css";
import { RemixActivity } from "./workspace/remix-activity";
import { RemixApplyDialog } from "./workspace/remix-apply-dialog";
import { RemixComposer } from "./workspace/remix-composer";
import { RemixReview } from "./workspace/remix-review";
import { CapabilityUnavailable, ScopeStatus } from "./workspace/remix-status";
import {
  allowedContentForApply,
  candidateIsStale,
  candidateSource,
  fieldsForSourceType,
  inputValue,
  isCapabilityUnavailable,
  messageFrom,
  normalizeFilterInput,
  recordMatches,
  valueForField,
} from "./workspace/remix-workspace-model";

export { allowedContentForApply, candidateIsStale } from "./workspace/remix-workspace-model";

export interface RemixWorkspaceProps {
  readonly organizationId: string;
  readonly eventId: string;
  /** Inject the authoritative API in tests or a host application. `null` means unavailable. */
  readonly api?: RemixApi | null;
}

export interface RemixNavigationCacheSnapshot {
  readonly records: readonly RemixSourceRecord[];
  readonly candidates: readonly RemixCandidate[];
  readonly audit: readonly RemixAuditEntry[];
}

function normalizeRemixScopeId(value: string): string {
  return value.trim();
}

export function remixNavigationCacheKey(
  organizationId: string,
  eventId: string,
  sourceType: RemixSourceType,
): string {
  const organization = normalizeRemixScopeId(organizationId);
  const event = normalizeRemixScopeId(eventId);
  return `organization:${organization}:event:${event}:remix:workspace:${sourceType}`;
}

export function remixNavigationCacheTags(
  organizationId: string,
  eventId: string,
): readonly string[] {
  const organization = normalizeRemixScopeId(organizationId);
  const event = normalizeRemixScopeId(eventId);
  return [`organization:${organization}`, `event:${event}`, `remix:${event}`];
}

export function RemixWorkspace({
  organizationId,
  eventId: fallbackEventId,
  api: apiOverride,
}: RemixWorkspaceProps) {
  const eventId = normalizeRemixScopeId(useOrganizerEventId(fallbackEventId));
  const normalizedOrganizationId = normalizeRemixScopeId(organizationId);
  const scopeValid = normalizedOrganizationId.length > 0 && eventId.length > 0;
  const api = useMemo<RemixApi | null>(() => {
    if (apiOverride !== undefined) return apiOverride;
    if (process.env.NODE_ENV === "test" || !scopeValid) return null;
    try {
      return createRemixApi("", normalizedOrganizationId);
    } catch {
      return null;
    }
  }, [apiOverride, normalizedOrganizationId, scopeValid]);
  const navigationCache = useNavigationDataCache();
  const [sourceType, setSourceType] = useState<RemixSourceType>("session");
  const remixCacheKey = useMemo(
    () => remixNavigationCacheKey(normalizedOrganizationId, eventId, sourceType),
    [eventId, normalizedOrganizationId, sourceType],
  );
  const remixCacheTags = useMemo(
    () => remixNavigationCacheTags(normalizedOrganizationId, eventId),
    [eventId, normalizedOrganizationId],
  );
  const cachedSnapshot = navigationCache?.peek<RemixNavigationCacheSnapshot>(remixCacheKey);
  const initialRecords =
    cachedSnapshot?.records.filter(
      (record) => record.eventId === eventId && record.kind === sourceType,
    ) ?? [];
  const initialCandidates =
    cachedSnapshot?.candidates.filter((candidate) => candidate.eventId === eventId) ?? [];
  const initialAudit = cachedSnapshot?.audit.filter((entry) => entry.eventId === eventId) ?? [];
  const [capabilityUnavailable, setCapabilityUnavailable] = useState(api === null);
  const [capabilityMessage, setCapabilityMessage] = useState<string | null>(null);
  const sourceTypeInitialized = useRef(false);
  const [records, setRecords] = useState<readonly RemixSourceRecord[]>(() => initialRecords);
  const [candidates, setCandidates] = useState<readonly RemixCandidate[]>(() => initialCandidates);
  const [audit, setAudit] = useState<readonly RemixAuditEntry[]>(() => initialAudit);
  const [selectedSourceIds, setSelectedSourceIds] = useState<readonly string[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    () => initialCandidates[0]?.id ?? null,
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
  const [loading, setLoading] = useState(
    api !== null && scopeValid && cachedSnapshot === undefined,
  );
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(() =>
    scopeValid ? null : "Organization and event scope are required.",
  );
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const applyButtonRef = useRef<HTMLButtonElement | null>(null);
  const loadGenerationRef = useRef(0);

  const applySnapshot = useCallback(
    (snapshot: RemixNavigationCacheSnapshot): void => {
      const nextRecords = snapshot.records.filter(
        (record) => record.eventId === eventId && record.kind === sourceType,
      );
      const nextCandidates = snapshot.candidates.filter(
        (candidate) => candidate.eventId === eventId,
      );
      const nextAudit = snapshot.audit.filter((entry) => entry.eventId === eventId);
      setRecords(nextRecords);
      setCandidates(nextCandidates);
      setAudit(nextAudit);
      setSelectedCandidateId((current) =>
        current !== null && nextCandidates.some((candidate) => candidate.id === current)
          ? current
          : (nextCandidates[0]?.id ?? null),
      );
    },
    [eventId, sourceType],
  );

  function invalidateRemixCache(): void {
    loadGenerationRef.current += 1;
    navigationCache?.invalidate(remixCacheTags);
  }

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
    const generation = ++loadGenerationRef.current;
    const immediateSnapshot = navigationCache?.peek<RemixNavigationCacheSnapshot>(remixCacheKey);
    const hasImmediateSnapshot = immediateSnapshot !== undefined;
    if (immediateSnapshot !== undefined) applySnapshot(immediateSnapshot);
    setLoading(!hasImmediateSnapshot);
    setError(null);
    const controller = new AbortController();
    const load = async (): Promise<RemixNavigationCacheSnapshot> => {
      const signal = navigationCache === null ? controller.signal : undefined;
      const [nextRecords, nextCandidates, nextAudit] = await Promise.all([
        api.listRecords({ eventId, sourceType, ...(signal === undefined ? {} : { signal }) }),
        api.listCandidates({ eventId, ...(signal === undefined ? {} : { signal }) }),
        api.listAudit(eventId, signal),
      ]);
      return {
        records: nextRecords.filter(
          (record) => record.eventId === eventId && record.kind === sourceType,
        ),
        candidates: nextCandidates.filter((candidate) => candidate.eventId === eventId),
        audit: nextAudit.filter((entry) => entry.eventId === eventId),
      };
    };
    const isCurrent = (): boolean =>
      active && generation === loadGenerationRef.current && !controller.signal.aborted;
    const read = navigationCache
      ? navigationCache.read<RemixNavigationCacheSnapshot>({
          key: remixCacheKey,
          tags: remixCacheTags,
          load,
        })
      : load();
    void read
      .then((snapshot) => {
        if (!isCurrent()) return;
        applySnapshot(snapshot);
      })
      .catch((reason: unknown) => {
        if (!isCurrent() || (reason instanceof DOMException && reason.name === "AbortError"))
          return;
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
        if (isCurrent()) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    api,
    applySnapshot,
    capabilityUnavailable,
    eventId,
    navigationCache,
    remixCacheKey,
    remixCacheTags,
    scopeValid,
    sourceType,
  ]);

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
      setActionError("Content remix is unavailable. No suggestion was created.");
      return;
    }
    if (loading) {
      setActionError("Event content is still loading. Try again in a moment.");
      return;
    }
    if (selectedSourceIds.length === 0) {
      setActionError("Select at least one session or speaker profile.");
      return;
    }
    if (fields.length === 0) {
      setActionError("Select at least one field to rewrite.");
      return;
    }
    if (tone.trim().length === 0) {
      setActionError("Describe the tone before generating.");
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
      invalidateRemixCache();
      setCandidates((current) => [...generated, ...current]);
      const first = generated[0];
      if (first !== undefined) setSelectedCandidateId(first.id);
      setActionMessage(
        `${generated.length} private suggestion${generated.length === 1 ? "" : "s"} ready for review.`,
      );
    } catch (reason: unknown) {
      setActionError(messageFrom(reason));
    } finally {
      setBusyAction(null);
    }
  }

  async function regenerate(): Promise<void> {
    if (api === null) {
      setActionError("Content remix is unavailable. No suggestion was regenerated.");
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
      invalidateRemixCache();
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
      setActionMessage("A fresh suggestion is ready. The previous version remains in activity.");
    } catch (reason: unknown) {
      setActionError(messageFrom(reason));
    } finally {
      setBusyAction(null);
    }
  }

  async function reject(): Promise<void> {
    if (api === null) {
      setActionError("Content remix is unavailable. No suggestion was rejected.");
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
      invalidateRemixCache();
      setCandidates((current) =>
        current.map((candidate) => (candidate.id === rejected.id ? rejected : candidate)),
      );
      const nextAudit = await api.listAudit(eventId);
      setAudit(nextAudit.filter((entry) => entry.eventId === eventId));
      setActionMessage("Suggestion rejected and recorded in activity.");
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
      invalidateRemixCache();
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
      const nextAudit = await api.listAudit(eventId);
      setAudit(nextAudit.filter((entry) => entry.eventId === eventId));
      setHumanConfirmed(false);
      setApplyDialogOpen(false);
      setApplyError(null);
      setActionMessage("Approved changes were applied and recorded in activity.");
    } catch (reason: unknown) {
      const message = messageFrom(reason);
      setActionError(message);
      setApplyError(message);
    } finally {
      setBusyAction(null);
    }
  }


  if (!scopeValid) {
    return <ScopeStatus message="Organization and event scope are required." error />;
  }
  if (capabilityUnavailable) {
    return <CapabilityUnavailable reason={capabilityMessage} />;
  }

  return (
    <main className={styles.workspace} id="remix-workspace">
      <a className={styles.skipLink} href="#remix-composer">
        Skip to content remix controls
      </a>
      <WorkspaceHeader
        eyebrow="Content remix"
        title="Polish event content"
        description="Select sessions or speaker profiles, generate private rewrite suggestions, then review and apply only the changes you approve."
        status={<StatusBadge tone="info">Private until applied</StatusBadge>}
      />
      <div className={styles.pageBody}>
        <RemixComposer
          sourceType={sourceType}
          onSourceTypeChange={setSourceType}
          search={search}
          onSearchChange={setSearch}
          tagFilter={tagFilter}
          onTagFilterChange={setTagFilter}
          trackFilter={trackFilter}
          onTrackFilterChange={setTrackFilter}
          records={visibleRecords}
          selectedSourceIds={selectedSourceIds}
          onToggleSource={toggleSource}
          loading={loading}
          error={error}
          availableFields={availableFields}
          fields={fields}
          onToggleField={toggleField}
          tone={tone}
          onToneChange={setTone}
          guidance={guidance}
          onGuidanceChange={setGuidance}
          actionError={actionError}
          actionMessage={actionMessage}
          busyAction={busyAction}
          onGenerate={(event) => void generate(event)}
        />
        <RemixReview
          candidates={visibleCandidates}
          records={records}
          candidateFilter={candidateFilter}
          onCandidateFilterChange={setCandidateFilter}
          selectedCandidateId={selectedCandidateId}
          onSelectCandidate={selectCandidate}
          selectedCandidate={selectedCandidate}
          staleCandidate={staleCandidate}
          draftContent={draftContent}
          onDraftChange={(field, value) =>
            setDraftContent((current) => ({ ...current, [field]: value }))
          }
          busyAction={busyAction}
          loading={loading}
          apiAvailable={api !== null}
          onRegenerate={() => void regenerate()}
          onReject={() => void reject()}
          humanConfirmed={humanConfirmed}
          onHumanConfirmedChange={setHumanConfirmed}
          canApply={canApply}
          onOpenApply={() => {
            if (!canApply) return;
            setApplyError(null);
            setActionError(null);
            setApplyDialogOpen(true);
          }}
          applyButtonRef={applyButtonRef}
        />
        <RemixActivity audit={audit} />
      </div>
      <RemixApplyDialog
        open={applyDialogOpen}
        onOpenChange={setApplyDialogOpen}
        busy={busyAction === "apply"}
        error={applyError}
        onConfirm={() => void commitApply()}
        returnFocusRef={applyButtonRef}
      />
    </main>
  );
}
