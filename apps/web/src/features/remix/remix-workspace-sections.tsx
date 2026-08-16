"use client";

import type { FormEvent, MutableRefObject, RefObject } from "react";
import { useEffect } from "react";
import { StatusBadge, WorkspaceHeader } from "@/components/workspace/workspace-ui";
import type { NavigationDataCache } from "@/lib/navigation-data-cache";
import type {
  RemixApi,
  RemixAuditEntry,
  RemixCandidate,
  RemixField,
  RemixSourceRecord,
  RemixSourceType,
} from "./api";
import styles from "./remix-workspace.module.css";
import { RemixActivity } from "./workspace/remix-activity";
import { RemixApplyDialog } from "./workspace/remix-apply-dialog";
import { RemixComposer } from "./workspace/remix-composer";
import { RemixReview } from "./workspace/remix-review";
import type { RemixNavigationCacheSnapshot } from "./workspace/remix-workspace-model";

type RemixWorkspaceLoaderProps = Readonly<{
  api: RemixApi | null;
  scopeValid: boolean;
  capabilityUnavailable: boolean;
  eventId: string;
  sourceType: RemixSourceType;
  navigationCache: NavigationDataCache | null;
  cacheKey: string;
  cacheTags: readonly string[];
  loadGenerationRef: MutableRefObject<number>;
  onSnapshot: (snapshot: RemixNavigationCacheSnapshot) => void;
  onLoadingChange: (loading: boolean) => void;
  onLoadError: (reason: unknown) => void;
  onLoadStart: () => void;
}>;

export function RemixWorkspaceLoader({
  api,
  scopeValid,
  capabilityUnavailable,
  eventId,
  sourceType,
  navigationCache,
  cacheKey,
  cacheTags,
  loadGenerationRef,
  onSnapshot,
  onLoadingChange,
  onLoadStart,
  onLoadError,
}: RemixWorkspaceLoaderProps): null {
  useEffect(() => {
    if (!scopeValid || api === null || capabilityUnavailable) {
      onLoadingChange(false);
      return;
    }
    let active = true;
    const generation = ++loadGenerationRef.current;
    const immediateSnapshot = navigationCache?.peek<RemixNavigationCacheSnapshot>(cacheKey);
    const hasImmediateSnapshot = immediateSnapshot !== undefined;
    if (immediateSnapshot !== undefined) onSnapshot(immediateSnapshot);
    onLoadingChange(!hasImmediateSnapshot);
    onLoadStart();
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
          key: cacheKey,
          tags: cacheTags,
          load,
        })
      : load();
    void read
      .then((snapshot) => {
        if (!isCurrent()) return;
        onSnapshot(snapshot);
      })
      .catch((reason: unknown) => {
        if (!isCurrent() || (reason instanceof DOMException && reason.name === "AbortError"))
          return;
        onLoadError(reason);
      })
      .finally(() => {
        if (isCurrent()) onLoadingChange(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    api,
    cacheKey,
    cacheTags,
    capabilityUnavailable,
    eventId,
    loadGenerationRef,
    navigationCache,
    onLoadError,
    onLoadStart,
    onLoadingChange,
    onSnapshot,
    scopeValid,
    sourceType,
  ]);
  return null;
}

type RemixWorkspaceSectionsProps = Readonly<{
  sourceType: RemixSourceType;
  onSourceTypeChange: (sourceType: RemixSourceType) => void;
  search: string;
  onSearchChange: (value: string) => void;
  tagFilter: string;
  onTagFilterChange: (value: string) => void;
  trackFilter: string;
  onTrackFilterChange: (value: string) => void;
  records: readonly RemixSourceRecord[];
  selectedSourceIds: readonly string[];
  onToggleSource: (sourceId: string) => void;
  loading: boolean;
  error: string | null;
  availableFields: readonly RemixField[];
  fields: readonly RemixField[];
  onToggleField: (field: RemixField) => void;
  tone: string;
  onToneChange: (value: string) => void;
  guidance: string;
  onGuidanceChange: (value: string) => void;
  actionError: string | null;
  actionMessage: string | null;
  busyAction: string | null;
  onGenerate: (event: FormEvent<HTMLFormElement>) => void;
  candidates: readonly RemixCandidate[];
  candidateFilter: RemixCandidate["status"] | "all";
  onCandidateFilterChange: (filter: RemixCandidate["status"] | "all") => void;
  selectedCandidateId: string | null;
  onSelectCandidate: (candidateId: string) => void;
  selectedCandidate: RemixCandidate | undefined;
  staleCandidate: boolean;
  draftContent: Readonly<Record<string, string>>;
  onDraftChange: (field: string, value: string) => void;
  apiAvailable: boolean;
  onRegenerate: () => void;
  onReject: () => void;
  humanConfirmed: boolean;
  onHumanConfirmedChange: (value: boolean) => void;
  canApply: boolean;
  onOpenApply: () => void;
  applyButtonRef: RefObject<HTMLButtonElement | null>;
  audit: readonly RemixAuditEntry[];
  applyDialogOpen: boolean;
  onApplyDialogChange: (open: boolean) => void;
  applyError: string | null;
  onConfirmApply: () => void;
}>;

export function RemixWorkspaceSections({
  sourceType,
  onSourceTypeChange,
  search,
  onSearchChange,
  tagFilter,
  onTagFilterChange,
  trackFilter,
  onTrackFilterChange,
  records,
  selectedSourceIds,
  onToggleSource,
  loading,
  error,
  availableFields,
  fields,
  onToggleField,
  tone,
  onToneChange,
  guidance,
  onGuidanceChange,
  actionError,
  actionMessage,
  busyAction,
  onGenerate,
  candidates,
  candidateFilter,
  onCandidateFilterChange,
  selectedCandidateId,
  onSelectCandidate,
  selectedCandidate,
  staleCandidate,
  draftContent,
  onDraftChange,
  apiAvailable,
  onRegenerate,
  onReject,
  humanConfirmed,
  onHumanConfirmedChange,
  canApply,
  onOpenApply,
  applyButtonRef,
  audit,
  applyDialogOpen,
  onApplyDialogChange,
  applyError,
  onConfirmApply,
}: RemixWorkspaceSectionsProps) {
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
          onSourceTypeChange={onSourceTypeChange}
          search={search}
          onSearchChange={onSearchChange}
          tagFilter={tagFilter}
          onTagFilterChange={onTagFilterChange}
          trackFilter={trackFilter}
          onTrackFilterChange={onTrackFilterChange}
          records={records}
          selectedSourceIds={selectedSourceIds}
          onToggleSource={onToggleSource}
          loading={loading}
          error={error}
          availableFields={availableFields}
          fields={fields}
          onToggleField={onToggleField}
          tone={tone}
          onToneChange={onToneChange}
          guidance={guidance}
          onGuidanceChange={onGuidanceChange}
          actionError={actionError}
          actionMessage={actionMessage}
          busyAction={busyAction}
          onGenerate={onGenerate}
        />
        <RemixReview
          candidates={candidates}
          records={records}
          candidateFilter={candidateFilter}
          onCandidateFilterChange={onCandidateFilterChange}
          selectedCandidateId={selectedCandidateId}
          onSelectCandidate={onSelectCandidate}
          selectedCandidate={selectedCandidate}
          staleCandidate={staleCandidate}
          draftContent={draftContent}
          onDraftChange={onDraftChange}
          busyAction={busyAction}
          loading={loading}
          apiAvailable={apiAvailable}
          onRegenerate={onRegenerate}
          onReject={onReject}
          humanConfirmed={humanConfirmed}
          onHumanConfirmedChange={onHumanConfirmedChange}
          canApply={canApply}
          onOpenApply={onOpenApply}
          applyButtonRef={applyButtonRef}
        />
        <RemixActivity audit={audit} />
      </div>
      <RemixApplyDialog
        open={applyDialogOpen}
        onOpenChange={onApplyDialogChange}
        busy={busyAction === "apply"}
        error={applyError}
        onConfirm={onConfirmApply}
        returnFocusRef={applyButtonRef}
      />
    </main>
  );
}
