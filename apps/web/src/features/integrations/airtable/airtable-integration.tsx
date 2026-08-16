"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../../components/layout/page-header";
import { Button } from "../../../components/ui/button";
import styles from "../integrations.module.css";
import {
  AirtableBaseMappingSection,
  AirtableConflictsSection,
  AirtableConnectionSection,
  AirtableProjectionHealthSection,
} from "./airtable-integration-sections";
import {
  type AirtableConflictResolution,
  type AirtableConflictResolutionInput,
  type AirtableIntegrationApi,
  AirtableIntegrationApiError,
  type AirtableIntegrationSnapshot,
  createAirtableIntegrationApi,
} from "./api";

function messageFrom(error: unknown): string {
  if (error instanceof AirtableIntegrationApiError || error instanceof Error) {
    return error.message;
  }
  return "The Airtable request could not be completed.";
}

const resolutionSummary: Record<AirtableConflictResolution, string> = {
  use_d1: "Keep D1 value",
  use_airtable: "Keep Airtable value",
  manual: "Resolve manually",
};

export interface AirtableIntegrationProps {
  readonly organizationId: string;
  readonly organizationName?: string;
  readonly initialSnapshot?: AirtableIntegrationSnapshot;
  readonly api?: AirtableIntegrationApi;
}

export function AirtableIntegration({
  organizationId,
  organizationName,
  initialSnapshot,
  api: injectedApi,
}: AirtableIntegrationProps) {
  const api = useMemo(() => injectedApi ?? createAirtableIntegrationApi(""), [injectedApi]);
  const [snapshot, setSnapshot] = useState<AirtableIntegrationSnapshot | null>(
    initialSnapshot ?? null,
  );
  const [loading, setLoading] = useState(initialSnapshot === undefined);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [resolutionDraft, setResolutionDraft] = useState<
    Partial<Record<string, AirtableConflictResolution>>
  >({});
  const [manualValueDraft, setManualValueDraft] = useState<Partial<Record<string, string>>>({});

  const loadSnapshot = useCallback(
    async (signal?: AbortSignal) => {
      setLoadError(null);
      try {
        setSnapshot(await api.getSnapshot(organizationId, signal));
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setLoadError(messageFrom(error));
        }
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [api, organizationId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadSnapshot(controller.signal);
    return () => controller.abort();
  }, [loadSnapshot]);

  useEffect(() => {
    setConfirmDisconnect(false);
  }, []);

  const mutate = useCallback(
    async <T,>(operation: () => Promise<T>, successMessage: string): Promise<T | null> => {
      setBusy(true);
      setMutationError(null);
      setNotice(null);
      try {
        const result = await operation();
        setNotice(successMessage);
        return result;
      } catch (error) {
        setMutationError(messageFrom(error));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const refreshAfter = useCallback(async () => {
    try {
      setSnapshot(await api.getSnapshot(organizationId));
    } catch (error) {
      setMutationError(`The change was saved, but status could not refresh: ${messageFrom(error)}`);
    }
  }, [api, organizationId]);

  const run = useCallback(
    async (operation: () => Promise<unknown>, successMessage: string) => {
      const ok = await mutate(operation, successMessage);
      if (ok === null) {
        return;
      }
      await refreshAfter();
    },
    [mutate, refreshAfter],
  );

  const onConnect = useCallback(() => {
    void (async () => {
      const authorization = await mutate(
        () => api.startOAuth(organizationId),
        "Airtable authorization started. Complete it in the Airtable tab.",
      );
      if (authorization === null) return;
      window.open(authorization.authorizationUrl, "_blank", "noopener,noreferrer");
      await refreshAfter();
    })();
  }, [api, mutate, organizationId, refreshAfter]);

  const onPause = useCallback(() => {
    void run(() => api.pause(organizationId), "Airtable projection paused.");
  }, [api, organizationId, run]);

  const onResume = useCallback(() => {
    void run(() => api.resume(organizationId), "Airtable projection resumed.");
  }, [api, organizationId, run]);

  const onDisconnect = useCallback(() => {
    void run(() => api.disconnect(organizationId), "Airtable disconnected.");
  }, [api, organizationId, run]);

  const onRetry = useCallback(() => {
    const failure = snapshot?.projection.lastFailure;
    if (!failure) {
      return;
    }
    void run(() => api.retry(organizationId), "Projection retry queued.");
  }, [api, organizationId, run, snapshot?.projection.lastFailure]);

  const applyResolution = useCallback(
    async (conflictId: string) => {
      const resolution =
        resolutionDraft[conflictId] ??
        snapshot?.conflicts.find((conflict) => conflict.id === conflictId)?.resolution ??
        null;
      if (resolution === null) {
        return;
      }
      const input: AirtableConflictResolutionInput =
        resolution === "manual"
          ? {
              resolution,
              manualValue: { valueJson: manualValueDraft[conflictId]?.trim() ?? "" },
            }
          : { resolution };
      if (input.resolution === "manual") {
        try {
          JSON.parse(input.manualValue.valueJson);
        } catch {
          setMutationError("Enter a valid JSON value for manual conflict resolution.");
          return;
        }
      }
      const ok = await mutate(
        () => api.resolveConflict(organizationId, conflictId, input),
        `Conflict resolved using "${resolutionSummary[resolution]}".`,
      );
      if (ok === null) {
        return;
      }
      setResolutionDraft((prev) => {
        const next = { ...prev };
        delete next[conflictId];
        return next;
      });
      setManualValueDraft((prev) => {
        const next = { ...prev };
        delete next[conflictId];
        return next;
      });
      await refreshAfter();
    },
    [
      api,
      manualValueDraft,
      mutate,
      organizationId,
      refreshAfter,
      resolutionDraft,
      snapshot?.conflicts,
    ],
  );

  const updateResolution = useCallback(
    (conflictId: string, resolution: AirtableConflictResolution) => {
      setResolutionDraft((prev) => ({ ...prev, [conflictId]: resolution }));
    },
    [],
  );

  const updateManualValue = useCallback((conflictId: string, value: string) => {
    setManualValueDraft((prev) => ({ ...prev, [conflictId]: value }));
  }, []);

  return (
    <div className={styles.integrationPage}>
      <Link className={styles.skipLink} href="#airtable-content">
        Skip to Airtable settings
      </Link>
      <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
        <Link href="/admin">Organizations</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/admin/organizations/${encodeURIComponent(organizationId)}`}>
          {organizationName ?? "Organization"}
        </Link>
        <span aria-hidden="true">/</span>
        <span>Airtable</span>
      </nav>
      <PageHeader
        eyebrow={<span className={styles.eyebrow}>Organizer workspace</span>}
        title="Airtable"
        description="Link an Airtable base, monitor projection health, and resolve conflicts between D1 and Airtable records."
      />

      <div
        id="airtable-content"
        className={styles.integrationContent}
        tabIndex={-1}
        aria-busy={busy ? true : undefined}
      >
        {notice ? (
          <div className={styles.successPanel} role="status" aria-live="polite">
            <p>{notice}</p>
          </div>
        ) : null}
        {mutationError ? (
          <div className={styles.errorPanel} role="alert">
            <div>
              <h2>Could not save the change</h2>
              <p>{mutationError}</p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setMutationError(null)}>
              Dismiss
            </Button>
          </div>
        ) : null}

        {loading && !snapshot ? (
          <div className={styles.statePanel} role="status" aria-live="polite">
            <span className={styles.spinner} aria-hidden="true" />
            <h2>Loading Airtable settings</h2>
            <p>Retrieving the organization Airtable connection and projection status.</p>
          </div>
        ) : null}
        {loadError && !snapshot ? (
          <div className={styles.statePanel} role="alert">
            <h2>Airtable settings are unavailable</h2>
            <p>{loadError}</p>
            <Button type="button" onClick={() => void loadSnapshot()}>
              Try again
            </Button>
          </div>
        ) : null}

        {snapshot ? (
          <div className={styles.sectionStack}>
            <div className={styles.statusGrid}>
              <AirtableConnectionSection
                state={snapshot.state}
                busy={busy}
                confirmDisconnect={confirmDisconnect}
                onConfirmDisconnect={setConfirmDisconnect}
                onConnect={onConnect}
                onPause={onPause}
                onResume={onResume}
                onDisconnect={onDisconnect}
              />
              <AirtableProjectionHealthSection
                projection={snapshot.projection}
                busy={busy}
                onRetry={onRetry}
              />
            </div>
            <AirtableBaseMappingSection baseMapping={snapshot.baseMapping} />
            <AirtableConflictsSection
              conflicts={snapshot.conflicts}
              busy={busy}
              resolutionDraft={resolutionDraft}
              manualValueDraft={manualValueDraft}
              onResolutionChange={updateResolution}
              onManualValueChange={updateManualValue}
              onApplyResolution={(conflictId) => void applyResolution(conflictId)}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
