"use client";

// allow: SIZE_OK — this module owns one Remix client state machine; visual sections are extracted.
import { type FormEvent, useCallback, useEffect, useMemo, useReducer, useRef } from "react";
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
import { RemixWorkspaceLoader, RemixWorkspaceSections } from "./remix-workspace-sections";
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
  type RemixNavigationCacheSnapshot,
  recordMatches,
  remixNavigationCacheKey,
  remixNavigationCacheTags,
  valueForField,
} from "./workspace/remix-workspace-model";

export interface RemixWorkspaceProps {
  readonly organizationId: string;
  readonly eventId: string;
  /** Inject the authoritative API in tests or a host application. `null` means unavailable. */
  readonly api?: RemixApi | null;
}

function normalizeRemixScopeId(value: string): string {
  return value.trim();
}

type RemixWorkspaceState = {
  sourceType: RemixSourceType;
  capabilityUnavailable: boolean;
  capabilityMessage: string | null;
  records: readonly RemixSourceRecord[];
  candidates: readonly RemixCandidate[];
  audit: readonly RemixAuditEntry[];
  selectedSourceIds: readonly string[];
  selectedCandidateId: string | null;
  candidateFilter: RemixCandidate["status"] | "all";
  search: string;
  tagFilter: string;
  trackFilter: string;
  fields: readonly RemixField[];
  tone: string;
  guidance: string;
  humanConfirmed: boolean;
  draftContent: Readonly<Record<string, string>>;
  loading: boolean;
  busyAction: string | null;
  error: string | null;
  actionMessage: string | null;
  actionError: string | null;
  applyError: string | null;
  applyDialogOpen: boolean;
};

type RemixWorkspaceAction =
  | { type: "source-type-changed"; sourceType: RemixSourceType }
  | { type: "capability-synced"; available: boolean }
  | {
      type: "snapshot-applied";
      records: readonly RemixSourceRecord[];
      candidates: readonly RemixCandidate[];
      audit: readonly RemixAuditEntry[];
    }
  | { type: "loading-changed"; loading: boolean }
  | { type: "load-error"; unavailable: boolean; message: string | null }
  | { type: "source-toggled"; sourceId: string }
  | { type: "candidate-selected"; candidateId: string }
  | { type: "candidate-filter-changed"; filter: RemixCandidate["status"] | "all" }
  | { type: "search-changed"; value: string }
  | { type: "tag-filter-changed"; value: string }
  | { type: "track-filter-changed"; value: string }
  | { type: "field-toggled"; field: RemixField }
  | { type: "tone-changed"; value: string }
  | { type: "guidance-changed"; value: string }
  | { type: "draft-changed"; field: string; value: string }
  | { type: "human-confirmed"; value: boolean }
  | { type: "operation-started"; action: string; clearApplyError: boolean }
  | { type: "operation-finished" }
  | { type: "action-message"; message: string | null }
  | { type: "action-error"; message: string | null }
  | { type: "apply-error"; message: string | null }
  | { type: "generated"; candidates: readonly RemixCandidate[]; message: string }
  | {
      type: "regenerated";
      candidates: readonly RemixCandidate[];
      selectedCandidateId: string;
      message: string;
    }
  | {
      type: "candidate-rejected";
      candidates: readonly RemixCandidate[];
      audit: readonly RemixAuditEntry[];
      message: string;
    }
  | {
      type: "candidate-applied";
      candidates: readonly RemixCandidate[];
      audit: readonly RemixAuditEntry[];
      message: string;
    }
  | { type: "apply-dialog-changed"; open: boolean };

function remixDraftForCandidate(
  candidate: RemixCandidate | undefined,
): Readonly<Record<string, string>> {
  if (candidate === undefined) return {};
  const draft: Record<string, string> = {};
  for (const field of candidate.fields) {
    draft[field] = inputValue(valueForField(candidate.candidate, field));
  }
  return draft;
}

function initialRemixWorkspaceState(input: {
  apiAvailable: boolean;
  scopeValid: boolean;
  hasSnapshot: boolean;
  records: readonly RemixSourceRecord[];
  candidates: readonly RemixCandidate[];
  audit: readonly RemixAuditEntry[];
}): RemixWorkspaceState {
  return {
    sourceType: "session",
    capabilityUnavailable: !input.apiAvailable,
    capabilityMessage: null,
    records: input.records,
    candidates: input.candidates,
    audit: input.audit,
    selectedSourceIds: [],
    selectedCandidateId: input.candidates[0]?.id ?? null,
    candidateFilter: "all",
    search: "",
    tagFilter: "",
    trackFilter: "",
    fields: ["title", "description"],
    tone: "Clear and practical",
    guidance: "Keep the author's meaning and make the outcome concrete.",
    humanConfirmed: false,
    draftContent: remixDraftForCandidate(input.candidates[0]),
    loading: input.apiAvailable && input.scopeValid && !input.hasSnapshot,
    busyAction: null,
    error: input.scopeValid ? null : "Organization and event scope are required.",
    actionMessage: null,
    actionError: null,
    applyError: null,
    applyDialogOpen: false,
  };
}

function remixWorkspaceReducer(
  state: RemixWorkspaceState,
  action: RemixWorkspaceAction,
): RemixWorkspaceState {
  switch (action.type) {
    case "source-type-changed":
      return {
        ...state,
        sourceType: action.sourceType,
        selectedSourceIds: [],
        fields: action.sourceType === "session" ? ["title", "description"] : ["biography"],
        search: "",
        tagFilter: "",
        trackFilter: "",
      };
    case "capability-synced":
      return action.available
        ? { ...state, capabilityUnavailable: false, capabilityMessage: null }
        : {
            ...state,
            capabilityUnavailable: true,
            capabilityMessage: null,
            loading: false,
            records: [],
            candidates: [],
            audit: [],
            selectedCandidateId: null,
            draftContent: {},
          };
    case "snapshot-applied": {
      const selectedCandidateId =
        state.selectedCandidateId !== null &&
        action.candidates.some((candidate) => candidate.id === state.selectedCandidateId)
          ? state.selectedCandidateId
          : (action.candidates[0]?.id ?? null);
      const selectionChanged = selectedCandidateId !== state.selectedCandidateId;
      return {
        ...state,
        records: action.records,
        candidates: action.candidates,
        audit: action.audit,
        selectedCandidateId,
        ...(selectionChanged
          ? {
              draftContent: remixDraftForCandidate(
                action.candidates.find((candidate) => candidate.id === selectedCandidateId),
              ),
              humanConfirmed: false,
            }
          : {}),
      };
    }
    case "loading-changed":
      return { ...state, loading: action.loading };
    case "load-error":
      return {
        ...state,
        capabilityUnavailable: action.unavailable,
        capabilityMessage: action.unavailable ? action.message : state.capabilityMessage,
        error: action.unavailable ? state.error : action.message,
        records: action.unavailable ? [] : state.records,
        candidates: action.unavailable ? [] : state.candidates,
        audit: action.unavailable ? [] : state.audit,
      };
    case "source-toggled":
      return {
        ...state,
        selectedSourceIds: state.selectedSourceIds.includes(action.sourceId)
          ? state.selectedSourceIds.filter((sourceId) => sourceId !== action.sourceId)
          : [...state.selectedSourceIds, action.sourceId],
      };
    case "candidate-selected": {
      const selectedCandidate = state.candidates.find(
        (candidate) => candidate.id === action.candidateId,
      );
      return {
        ...state,
        selectedCandidateId: action.candidateId,
        draftContent: remixDraftForCandidate(selectedCandidate),
        humanConfirmed: false,
        actionError: null,
        actionMessage: null,
      };
    }
    case "candidate-filter-changed":
      return { ...state, candidateFilter: action.filter };
    case "search-changed":
      return { ...state, search: action.value };
    case "tag-filter-changed":
      return { ...state, tagFilter: action.value };
    case "track-filter-changed":
      return { ...state, trackFilter: action.value };
    case "field-toggled":
      return {
        ...state,
        fields: state.fields.includes(action.field)
          ? state.fields.filter((field) => field !== action.field)
          : [...state.fields, action.field],
      };
    case "tone-changed":
      return { ...state, tone: action.value };
    case "guidance-changed":
      return { ...state, guidance: action.value };
    case "draft-changed":
      return { ...state, draftContent: { ...state.draftContent, [action.field]: action.value } };
    case "human-confirmed":
      return { ...state, humanConfirmed: action.value };
    case "operation-started":
      return {
        ...state,
        busyAction: action.action,
        actionError: null,
        actionMessage: null,
        ...(action.clearApplyError ? { applyError: null } : {}),
      };
    case "operation-finished":
      return { ...state, busyAction: null };
    case "action-message":
      return { ...state, actionMessage: action.message };
    case "action-error":
      return { ...state, actionError: action.message };
    case "apply-error":
      return { ...state, applyError: action.message };
    case "generated": {
      const first = action.candidates[0];
      return {
        ...state,
        candidates: [...action.candidates, ...state.candidates],
        ...(first === undefined
          ? {}
          : {
              selectedCandidateId: first.id,
              draftContent: remixDraftForCandidate(first),
              humanConfirmed: false,
            }),
        actionMessage: action.message,
      };
    }
    case "regenerated": {
      const selectedCandidate = action.candidates.find(
        (candidate) => candidate.id === action.selectedCandidateId,
      );
      return {
        ...state,
        candidates: action.candidates,
        selectedCandidateId: action.selectedCandidateId,
        draftContent: remixDraftForCandidate(selectedCandidate),
        humanConfirmed: false,
        actionMessage: action.message,
      };
    }
    case "candidate-rejected": {
      const selectedCandidate = action.candidates.find(
        (candidate) => candidate.id === state.selectedCandidateId,
      );
      return {
        ...state,
        candidates: action.candidates,
        audit: action.audit,
        draftContent: remixDraftForCandidate(selectedCandidate),
        humanConfirmed: false,
        actionMessage: action.message,
      };
    }
    case "candidate-applied": {
      const selectedCandidate = action.candidates.find(
        (candidate) => candidate.id === state.selectedCandidateId,
      );
      return {
        ...state,
        candidates: action.candidates,
        audit: action.audit,
        draftContent: remixDraftForCandidate(selectedCandidate),
        humanConfirmed: false,
        applyDialogOpen: false,
        applyError: null,
        actionMessage: action.message,
      };
    }
    case "apply-dialog-changed":
      return { ...state, applyDialogOpen: action.open };
  }
}
type RemixDispatch = (action: RemixWorkspaceAction) => void;

async function generateRemixSuggestions(
  api: RemixApi | null,
  eventId: string,
  sourceType: RemixSourceType,
  selectedSourceIds: readonly string[],
  fields: readonly RemixField[],
  tone: string,
  guidance: string,
  loading: boolean,
  dispatch: RemixDispatch,
  invalidate: () => void,
): Promise<void> {
  dispatch({ type: "action-error", message: null });
  dispatch({ type: "action-message", message: null });
  if (api === null) {
    dispatch({
      type: "action-error",
      message: "Content remix is unavailable. No suggestion was created.",
    });
    return;
  }
  if (loading) {
    dispatch({
      type: "action-error",
      message: "Event content is still loading. Try again in a moment.",
    });
    return;
  }
  if (selectedSourceIds.length === 0) {
    dispatch({
      type: "action-error",
      message: "Select at least one session or speaker profile.",
    });
    return;
  }
  if (fields.length === 0) {
    dispatch({ type: "action-error", message: "Select at least one field to rewrite." });
    return;
  }
  if (tone.trim().length === 0) {
    dispatch({ type: "action-error", message: "Describe the tone before generating." });
    return;
  }
  dispatch({ type: "operation-started", action: "generate", clearApplyError: false });
  try {
    const generated = await api.generate({
      eventId,
      sourceType,
      sourceIds: selectedSourceIds,
      fields,
      tone: tone.trim(),
      ...(guidance.trim().length === 0 ? {} : { guidance: guidance.trim() }),
    });
    invalidate();
    dispatch({
      type: "generated",
      candidates: generated,
      message: `${generated.length} private suggestion${generated.length === 1 ? "" : "s"} ready for review.`,
    });
  } catch (reason: unknown) {
    dispatch({ type: "action-error", message: messageFrom(reason) });
  } finally {
    dispatch({ type: "operation-finished" });
  }
}

async function regenerateRemixSuggestion(
  api: RemixApi | null,
  eventId: string,
  selectedCandidate: RemixCandidate | undefined,
  candidates: readonly RemixCandidate[],
  tone: string,
  guidance: string,
  dispatch: RemixDispatch,
  invalidate: () => void,
): Promise<void> {
  if (api === null) {
    dispatch({
      type: "action-error",
      message: "Content remix is unavailable. No suggestion was regenerated.",
    });
    return;
  }
  if (selectedCandidate === undefined || selectedCandidate.status === "applied") return;
  dispatch({ type: "operation-started", action: "regenerate", clearApplyError: false });
  try {
    const regenerated = await api.regenerate({
      eventId,
      candidateId: selectedCandidate.id,
      ...(tone.trim().length === 0 ? {} : { tone: tone.trim() }),
      ...(guidance.trim().length === 0 ? {} : { guidance: guidance.trim() }),
    });
    invalidate();
    dispatch({
      type: "regenerated",
      candidates: [
        regenerated,
        ...candidates.map((candidate) =>
          candidate.id === selectedCandidate.id && candidate.status === "pending"
            ? {
                ...candidate,
                status: "rejected" as const,
                version: candidate.version + 1,
                rejectionReason: "Superseded by regeneration.",
              }
            : candidate,
        ),
      ],
      selectedCandidateId: regenerated.id,
      message: "A fresh suggestion is ready. The previous version remains in activity.",
    });
  } catch (reason: unknown) {
    dispatch({ type: "action-error", message: messageFrom(reason) });
  } finally {
    dispatch({ type: "operation-finished" });
  }
}

async function rejectRemixSuggestion(
  api: RemixApi | null,
  eventId: string,
  selectedCandidate: RemixCandidate | undefined,
  candidates: readonly RemixCandidate[],
  dispatch: RemixDispatch,
  invalidate: () => void,
): Promise<void> {
  if (api === null) {
    dispatch({
      type: "action-error",
      message: "Content remix is unavailable. No suggestion was rejected.",
    });
    return;
  }
  if (selectedCandidate === undefined || selectedCandidate.status === "applied") return;
  dispatch({ type: "operation-started", action: "reject", clearApplyError: false });
  try {
    const rejected = await api.reject({
      eventId,
      candidateId: selectedCandidate.id,
      reason: "Rejected by the human organizer.",
    });
    invalidate();
    const nextCandidates = candidates.map((candidate) =>
      candidate.id === rejected.id ? rejected : candidate,
    );
    const nextAudit = await api.listAudit(eventId);
    dispatch({
      type: "candidate-rejected",
      candidates: nextCandidates,
      audit: nextAudit.filter((entry) => entry.eventId === eventId),
      message: "Suggestion rejected and recorded in activity.",
    });
  } catch (reason: unknown) {
    dispatch({ type: "action-error", message: messageFrom(reason) });
  } finally {
    dispatch({ type: "operation-finished" });
  }
}

async function applyRemixSuggestion(
  api: RemixApi | null,
  eventId: string,
  selectedCandidate: RemixCandidate | undefined,
  candidates: readonly RemixCandidate[],
  canApply: boolean,
  draftContent: Readonly<Record<string, string>>,
  dispatch: RemixDispatch,
  invalidate: () => void,
): Promise<void> {
  if (api === null || selectedCandidate === undefined || !canApply) return;
  dispatch({ type: "operation-started", action: "apply", clearApplyError: true });
  try {
    const content = allowedContentForApply(selectedCandidate, draftContent);
    const revision: RemixContentRevision = await api.apply({
      eventId,
      candidateId: selectedCandidate.id,
      expectedVersion: selectedCandidate.version,
      content,
    });
    invalidate();
    const nextCandidates = candidates.map((candidate) =>
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
    );
    const nextAudit = await api.listAudit(eventId);
    dispatch({
      type: "candidate-applied",
      candidates: nextCandidates,
      audit: nextAudit.filter((entry) => entry.eventId === eventId),
      message: "Approved changes were applied and recorded in activity.",
    });
  } catch (reason: unknown) {
    const message = messageFrom(reason);
    dispatch({ type: "action-error", message });
    dispatch({ type: "apply-error", message });
  } finally {
    dispatch({ type: "operation-finished" });
  }
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
  const initialSourceType: RemixSourceType = "session";
  const initialCacheKey = remixNavigationCacheKey(
    normalizedOrganizationId,
    eventId,
    initialSourceType,
  );
  const remixCacheTags = useMemo(
    () => remixNavigationCacheTags(normalizedOrganizationId, eventId),
    [eventId, normalizedOrganizationId],
  );
  const cachedSnapshot = navigationCache?.peek<RemixNavigationCacheSnapshot>(initialCacheKey);
  const initialRecords =
    cachedSnapshot?.records.filter(
      (record) => record.eventId === eventId && record.kind === initialSourceType,
    ) ?? [];
  const initialCandidates =
    cachedSnapshot?.candidates.filter((candidate) => candidate.eventId === eventId) ?? [];
  const initialAudit = cachedSnapshot?.audit.filter((entry) => entry.eventId === eventId) ?? [];
  const [remixState, dispatch] = useReducer(
    remixWorkspaceReducer,
    {
      apiAvailable: api !== null,
      scopeValid,
      hasSnapshot: cachedSnapshot !== undefined,
      records: initialRecords,
      candidates: initialCandidates,
      audit: initialAudit,
    },
    initialRemixWorkspaceState,
  );
  const {
    sourceType,
    capabilityUnavailable,
    capabilityMessage,
    records,
    candidates,
    audit,
    selectedSourceIds,
    selectedCandidateId,
    candidateFilter,
    search,
    tagFilter,
    trackFilter,
    fields,
    tone,
    guidance,
    humanConfirmed,
    draftContent,
    loading,
    busyAction,
    error,
    actionMessage,
    actionError,
    applyError,
    applyDialogOpen,
  } = remixState;
  const remixCacheKey = useMemo(
    () => remixNavigationCacheKey(normalizedOrganizationId, eventId, sourceType),
    [eventId, normalizedOrganizationId, sourceType],
  );
  const applyButtonRef = useRef<HTMLButtonElement | null>(null);
  const loadGenerationRef = useRef(0);

  const applySnapshot = useCallback(
    (snapshot: RemixNavigationCacheSnapshot): void => {
      dispatch({
        type: "snapshot-applied",
        records: snapshot.records.filter(
          (record) => record.eventId === eventId && record.kind === sourceType,
        ),
        candidates: snapshot.candidates.filter((candidate) => candidate.eventId === eventId),
        audit: snapshot.audit.filter((entry) => entry.eventId === eventId),
      });
    },
    [eventId, sourceType],
  );

  function invalidateRemixCache(): void {
    loadGenerationRef.current += 1;
    navigationCache?.invalidate(remixCacheTags);
  }

  useEffect(() => {
    dispatch({ type: "capability-synced", available: api !== null });
  }, [api]);

  const setLoading = useCallback((loading: boolean): void => {
    dispatch({ type: "loading-changed", loading });
  }, []);
  const clearLoadError = useCallback((): void => {
    dispatch({ type: "load-error", unavailable: false, message: null });
  }, []);
  const handleLoadError = useCallback((reason: unknown): void => {
    if (isCapabilityUnavailable(reason)) {
      dispatch({
        type: "load-error",
        unavailable: true,
        message: reason instanceof Error ? reason.message : "Capability not found.",
      });
      return;
    }
    dispatch({ type: "load-error", unavailable: false, message: messageFrom(reason) });
  }, []);

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

  async function generate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    return generateRemixSuggestions(
      api,
      eventId,
      sourceType,
      selectedSourceIds,
      fields,
      tone,
      guidance,
      loading,
      dispatch,
      invalidateRemixCache,
    );
  }

  async function regenerate(): Promise<void> {
    return regenerateRemixSuggestion(
      api,
      eventId,
      selectedCandidate,
      candidates,
      tone,
      guidance,
      dispatch,
      invalidateRemixCache,
    );
  }

  async function reject(): Promise<void> {
    return rejectRemixSuggestion(
      api,
      eventId,
      selectedCandidate,
      candidates,
      dispatch,
      invalidateRemixCache,
    );
  }

  async function commitApply(): Promise<void> {
    return applyRemixSuggestion(
      api,
      eventId,
      selectedCandidate,
      candidates,
      canApply,
      draftContent,
      dispatch,
      invalidateRemixCache,
    );
  }
  if (!scopeValid) {
    return <ScopeStatus message="Organization and event scope are required." error />;
  }
  if (capabilityUnavailable) {
    return <CapabilityUnavailable reason={capabilityMessage} />;
  }

  return (
    <>
      <RemixWorkspaceLoader
        api={api}
        scopeValid={scopeValid}
        capabilityUnavailable={capabilityUnavailable}
        eventId={eventId}
        sourceType={sourceType}
        navigationCache={navigationCache}
        cacheKey={remixCacheKey}
        cacheTags={remixCacheTags}
        loadGenerationRef={loadGenerationRef}
        onSnapshot={applySnapshot}
        onLoadingChange={setLoading}
        onLoadStart={clearLoadError}
        onLoadError={handleLoadError}
      />
      <RemixWorkspaceSections
        sourceType={sourceType}
        onSourceTypeChange={(nextSourceType) =>
          dispatch({ type: "source-type-changed", sourceType: nextSourceType })
        }
        search={search}
        onSearchChange={(value) => dispatch({ type: "search-changed", value })}
        tagFilter={tagFilter}
        onTagFilterChange={(value) => dispatch({ type: "tag-filter-changed", value })}
        trackFilter={trackFilter}
        onTrackFilterChange={(value) => dispatch({ type: "track-filter-changed", value })}
        records={visibleRecords}
        selectedSourceIds={selectedSourceIds}
        onToggleSource={(sourceId) => dispatch({ type: "source-toggled", sourceId })}
        loading={loading}
        error={error}
        availableFields={availableFields}
        fields={fields}
        onToggleField={(field) => dispatch({ type: "field-toggled", field })}
        tone={tone}
        onToneChange={(value) => dispatch({ type: "tone-changed", value })}
        guidance={guidance}
        onGuidanceChange={(value) => dispatch({ type: "guidance-changed", value })}
        actionError={actionError}
        actionMessage={actionMessage}
        busyAction={busyAction}
        onGenerate={(event) => void generate(event)}
        candidates={visibleCandidates}
        candidateFilter={candidateFilter}
        onCandidateFilterChange={(filter) => dispatch({ type: "candidate-filter-changed", filter })}
        selectedCandidateId={selectedCandidateId}
        onSelectCandidate={(candidateId) => dispatch({ type: "candidate-selected", candidateId })}
        selectedCandidate={selectedCandidate}
        staleCandidate={staleCandidate}
        draftContent={draftContent}
        onDraftChange={(field, value) => dispatch({ type: "draft-changed", field, value })}
        apiAvailable={api !== null}
        onRegenerate={() => void regenerate()}
        onReject={() => void reject()}
        humanConfirmed={humanConfirmed}
        onHumanConfirmedChange={(value) => dispatch({ type: "human-confirmed", value })}
        canApply={canApply}
        onOpenApply={() => {
          if (!canApply) return;
          dispatch({ type: "apply-error", message: null });
          dispatch({ type: "action-error", message: null });
          dispatch({ type: "apply-dialog-changed", open: true });
        }}
        applyButtonRef={applyButtonRef}
        audit={audit}
        applyDialogOpen={applyDialogOpen}
        onApplyDialogChange={(open) => dispatch({ type: "apply-dialog-changed", open })}
        applyError={applyError}
        onConfirmApply={() => void commitApply()}
      />
    </>
  );
}
