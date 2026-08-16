"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../../components/layout/page-header";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import styles from "../integrations.module.css";
import {
  type AirtableConflictResolution,
  type AirtableConflictResolutionInput,
  type AirtableConnectionState,
  type AirtableIntegrationApi,
  AirtableIntegrationApiError,
  type AirtableIntegrationSnapshot,
  type AirtableProjectionHealth,
  type AirtableSyncDirection,
  createAirtableIntegrationApi,
} from "./api";

const stateCopy: Record<
  AirtableConnectionState,
  { readonly label: string; readonly description: string }
> = {
  disconnected: {
    label: "Disconnected",
    description:
      "Airtable is not linked to this organization. Connect to start projecting records on the configured schedule.",
  },
  authorizing: {
    label: "Authorizing",
    description:
      "Waiting for Airtable to complete the OAuth handshake in a separate tab. Keep this page open.",
  },
  connected: {
    label: "Connected",
    description: "Records are projecting to Airtable on the configured schedule.",
  },
  paused: {
    label: "Paused",
    description:
      "Projection is paused. Existing Airtable tables keep their last projected values until you resume.",
  },
  reauthorization_required: {
    label: "Reauthorization required",
    description:
      "Airtable access expired or was revoked. Reauthorize to resume projecting records.",
  },
};

const healthCopy: Record<AirtableProjectionHealth, { readonly label: string }> = {
  healthy: { label: "Healthy" },
  degraded: { label: "Degraded" },
  failed: { label: "Failed" },
};

const syncDirectionLabel: Record<AirtableSyncDirection, string> = {
  to_airtable: "To Airtable",
  from_airtable: "From Airtable",
  bidirectional: "Two-way",
};

const resolutionCopy: Record<
  AirtableConflictResolution,
  { readonly label: string; readonly summary: string }
> = {
  use_d1: { label: "Keep D1 value", summary: "Keep D1 value" },
  use_airtable: { label: "Keep Airtable value", summary: "Keep Airtable value" },
  manual: { label: "Resolve manually", summary: "Resolve manually" },
};

function messageFrom(error: unknown): string {
  if (error instanceof AirtableIntegrationApiError || error instanceof Error) {
    return error.message;
  }
  return "The Airtable request could not be completed.";
}

function stateBadgeVariant(
  state: AirtableConnectionState,
): "default" | "secondary" | "destructive" | "outline" {
  switch (state) {
    case "connected":
      return "default";
    case "paused":
      return "secondary";
    case "reauthorization_required":
      return "destructive";
    default:
      return "outline";
  }
}

function healthBadgeVariant(
  health: AirtableProjectionHealth,
): "default" | "secondary" | "destructive" {
  switch (health) {
    case "healthy":
      return "default";
    case "degraded":
      return "secondary";
    case "failed":
      return "destructive";
  }
}

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
        `Conflict resolved using "${resolutionCopy[resolution].summary}".`,
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

  const connection = snapshot ? stateCopy[snapshot.state] : null;
  const projection = snapshot?.projection ?? null;
  const failures = snapshot?.projection.lastFailure ?? null;
  const conflicts = snapshot?.conflicts ?? [];
  const showDisconnect = snapshot
    ? snapshot.state === "connected" ||
      snapshot.state === "paused" ||
      snapshot.state === "reauthorization_required"
    : false;

  return (
    <div className={styles.integrationPage}>
      <a className={styles.skipLink} href="#airtable-content">
        Skip to Airtable settings
      </a>
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

        {snapshot && connection ? (
          <div className={styles.sectionStack}>
            <div className={styles.statusGrid}>
              <Card>
                <CardHeader>
                  <CardTitle>Connection</CardTitle>
                  <CardDescription>{connection.description}</CardDescription>
                  <CardAction>
                    <Badge variant={stateBadgeVariant(snapshot.state)}>{connection.label}</Badge>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  {snapshot.state === "authorizing" ? (
                    <p className={styles.muted} role="status" aria-live="polite">
                      <span className={styles.spinner} aria-hidden="true" /> Waiting for Airtable to
                      complete the OAuth handshake in a separate tab.
                    </p>
                  ) : null}
                  {snapshot.state === "disconnected" ? (
                    <>
                      <p className={styles.securityNote}>
                        You will finish authorization in a separate Airtable tab. This workspace
                        keeps OAuth tokens server-side and encrypts them at rest.
                      </p>
                      <div className={styles.actionRow}>
                        <Button
                          type="button"
                          onClick={onConnect}
                          disabled={busy}
                          aria-label="Connect Airtable for this organization"
                        >
                          Connect Airtable
                        </Button>
                      </div>
                    </>
                  ) : null}
                  {snapshot.state === "reauthorization_required" ? (
                    <div className={styles.actionRow}>
                      <Button
                        type="button"
                        onClick={onConnect}
                        disabled={busy}
                        aria-label="Reauthorize Airtable for this organization"
                      >
                        Reauthorize
                      </Button>
                    </div>
                  ) : null}
                  {snapshot.state === "connected" ? (
                    <div className={styles.actionRow}>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={onPause}
                        disabled={busy}
                        aria-label="Pause Airtable projection"
                      >
                        Pause
                      </Button>
                    </div>
                  ) : null}
                  {snapshot.state === "paused" ? (
                    <div className={styles.actionRow}>
                      <Button
                        type="button"
                        onClick={onResume}
                        disabled={busy}
                        aria-label="Resume Airtable projection"
                      >
                        Resume
                      </Button>
                    </div>
                  ) : null}
                  {showDisconnect ? (
                    <label className={styles.confirmation}>
                      <input
                        id="airtable-confirm-disconnect"
                        type="checkbox"
                        checked={confirmDisconnect}
                        onChange={(event) => setConfirmDisconnect(event.target.checked)}
                      />
                      <span>
                        I understand projection will stop and existing Airtable tables will keep
                        their last values until I reconnect.
                      </span>
                    </label>
                  ) : null}
                  {showDisconnect ? (
                    <div className={styles.actionRow}>
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={onDisconnect}
                        disabled={!confirmDisconnect || busy}
                        aria-label="Disconnect Airtable from this organization"
                      >
                        Disconnect
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Projection health</CardTitle>
                  {projection ? (
                    <CardDescription>
                      Projected {projection.projectedLast24Hours} records in the last 24 hours.
                    </CardDescription>
                  ) : null}
                  {projection ? (
                    <CardAction>
                      <Badge variant={healthBadgeVariant(projection.health)}>
                        {healthCopy[projection.health].label}
                      </Badge>
                    </CardAction>
                  ) : null}
                </CardHeader>
                <CardContent>
                  {projection ? (
                    <dl className={styles.definitionList}>
                      <div>
                        <dt>Failed (24h)</dt>
                        <dd>{projection.failedLast24Hours}</dd>
                      </div>
                      <div>
                        <dt>Last projection</dt>
                        <dd>{projection.lastProjectedAt ?? "Not yet projected"}</dd>
                      </div>
                    </dl>
                  ) : null}
                  {failures ? (
                    <p className={styles.warningPanel}>
                      <strong>Latest failure:</strong> {failures.summary} (
                      {new Date(failures.occurredAt).toISOString()})
                    </p>
                  ) : null}
                  {failures?.retryable ? (
                    <div className={styles.actionRow}>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={onRetry}
                        disabled={busy}
                        aria-label="Retry the latest Airtable projection"
                      >
                        Retry projection
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Base mapping</CardTitle>
                {snapshot.baseMapping ? (
                  <CardDescription>
                    {snapshot.baseMapping.baseName} ({snapshot.baseMapping.baseId})
                  </CardDescription>
                ) : (
                  <CardDescription>No Airtable base is mapped yet.</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                {snapshot.baseMapping ? (
                  <div className={styles.tableFrame}>
                    <table>
                      <caption>Mapped Airtable tables</caption>
                      <thead>
                        <tr>
                          <th scope="col">Airtable table</th>
                          <th scope="col">Local resource</th>
                          <th scope="col">Key field</th>
                          <th scope="col">Direction</th>
                        </tr>
                      </thead>
                      <tbody>
                        {snapshot.baseMapping.tableMappings.map((mapping) => (
                          <tr key={mapping.tableId}>
                            <td>
                              <strong>{mapping.tableName}</strong>
                              <small>
                                <code>{mapping.tableId}</code>
                              </small>
                            </td>
                            <td>{mapping.localResource}</td>
                            <td>
                              <code>{mapping.keyField}</code>
                            </td>
                            <td>{syncDirectionLabel[mapping.syncDirection]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className={styles.empty}>
                    Connect Airtable and select a base to map local resources to Airtable tables.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Conflicts</CardTitle>
                <CardDescription>
                  {conflicts.length === 0
                    ? "No conflicting records. Projection is in sync."
                    : conflicts.length === 1
                      ? "1 record needs resolution."
                      : `${conflicts.length} records need resolution.`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {conflicts.length === 0 ? (
                  <p className={styles.empty}>No conflicting records. Projection is in sync.</p>
                ) : (
                  <div className={styles.tableFrame}>
                    <table>
                      <caption>Unresolved Airtable projection conflicts</caption>
                      <thead>
                        <tr>
                          <th scope="col">Resource</th>
                          <th scope="col">Record</th>
                          <th scope="col">D1 updated</th>
                          <th scope="col">Airtable updated</th>
                          <th scope="col">Summary</th>
                          <th scope="col">Resolution</th>
                        </tr>
                      </thead>
                      <tbody>
                        {conflicts.map((conflict) => {
                          const current =
                            resolutionDraft[conflict.id] ?? conflict.resolution ?? null;
                          return (
                            <tr key={conflict.id}>
                              <td>
                                <strong>{conflict.resource}</strong>
                              </td>
                              <td>
                                <code>{conflict.recordId}</code>
                              </td>
                              <td>{conflict.localUpdatedAt}</td>
                              <td>{conflict.remoteUpdatedAt}</td>
                              <td>{conflict.summary}</td>
                              <td>
                                <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                                  <legend className={styles.srOnly}>
                                    Resolve conflict for {conflict.resource} {conflict.recordId}
                                  </legend>
                                  {(
                                    Object.keys(resolutionCopy) as AirtableConflictResolution[]
                                  ).map((option) => (
                                    <label key={option} style={{ display: "block" }}>
                                      <input
                                        type="radio"
                                        name={`airtable-conflict-${conflict.id}`}
                                        value={option}
                                        defaultChecked={current === option}
                                        onChange={() =>
                                          setResolutionDraft((prev) => ({
                                            ...prev,
                                            [conflict.id]: option,
                                          }))
                                        }
                                      />
                                      {resolutionCopy[option].label}
                                    </label>
                                  ))}
                                  {current === "manual" ? (
                                    <label style={{ display: "block" }}>
                                      Manual JSON value
                                      <textarea
                                        value={manualValueDraft[conflict.id] ?? ""}
                                        onChange={(event) =>
                                          setManualValueDraft((prev) => ({
                                            ...prev,
                                            [conflict.id]: event.target.value,
                                          }))
                                        }
                                        aria-label={`Manual JSON value for ${conflict.resource} conflict`}
                                      />
                                    </label>
                                  ) : null}
                                  <Button
                                    type="button"
                                    size="xs"
                                    onClick={() => void applyResolution(conflict.id)}
                                    disabled={
                                      current === null ||
                                      busy ||
                                      (current === "manual" &&
                                        (manualValueDraft[conflict.id]?.trim().length ?? 0) === 0)
                                    }
                                    aria-label={`Apply resolution for ${conflict.resource} conflict`}
                                  >
                                    Apply
                                  </Button>
                                </fieldset>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}
