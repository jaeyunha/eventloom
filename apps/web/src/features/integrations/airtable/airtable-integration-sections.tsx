"use client";

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
import type {
  AirtableBaseMapping,
  AirtableConflict,
  AirtableConflictResolution,
  AirtableConnectionState,
  AirtableProjectionFailure,
  AirtableProjectionHealth,
  AirtableProjectionStatus,
  AirtableSyncDirection,
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

export function AirtableConnectionSection({
  state,
  busy,
  confirmDisconnect,
  onConfirmDisconnect,
  onConnect,
  onPause,
  onResume,
  onDisconnect,
}: Readonly<{
  state: AirtableConnectionState;
  busy: boolean;
  confirmDisconnect: boolean;
  onConfirmDisconnect(value: boolean): void;
  onConnect(): void;
  onPause(): void;
  onResume(): void;
  onDisconnect(): void;
}>) {
  const connection = stateCopy[state];
  const showDisconnect =
    state === "connected" || state === "paused" || state === "reauthorization_required";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connection</CardTitle>
        <CardDescription>{connection.description}</CardDescription>
        <CardAction>
          <Badge variant={stateBadgeVariant(state)}>{connection.label}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        {state === "authorizing" ? (
          <p className={styles.muted} role="status" aria-live="polite">
            <span className={styles.spinner} aria-hidden="true" /> Waiting for Airtable to complete
            the OAuth handshake in a separate tab.
          </p>
        ) : null}
        {state === "disconnected" ? (
          <>
            <p className={styles.securityNote}>
              You will finish authorization in a separate Airtable tab. This workspace keeps OAuth
              tokens server-side and encrypts them at rest.
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
        {state === "reauthorization_required" ? (
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
        {state === "connected" ? (
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
        {state === "paused" ? (
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
          <label className={styles.confirmation} htmlFor="airtable-confirm-disconnect">
            <input
              id="airtable-confirm-disconnect"
              type="checkbox"
              checked={confirmDisconnect}
              onChange={(event) => onConfirmDisconnect(event.target.checked)}
            />
            <span>
              I understand projection will stop and existing Airtable tables will keep their last
              values until I reconnect.
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
  );
}

export function AirtableProjectionHealthSection({
  projection,
  busy,
  onRetry,
}: Readonly<{
  projection: AirtableProjectionStatus;
  busy: boolean;
  onRetry(): void;
}>) {
  const failure: AirtableProjectionFailure | null = projection.lastFailure;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Projection health</CardTitle>
        <CardDescription>
          Projected {projection.projectedLast24Hours} records in the last 24 hours.
        </CardDescription>
        <CardAction>
          <Badge variant={healthBadgeVariant(projection.health)}>
            {healthCopy[projection.health].label}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
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
        {failure ? (
          <p className={styles.warningPanel}>
            <strong>Latest failure:</strong> {failure.summary} (
            {new Date(failure.occurredAt).toISOString()})
          </p>
        ) : null}
        {failure?.retryable ? (
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
  );
}

export function AirtableBaseMappingSection({
  baseMapping,
}: Readonly<{ baseMapping: AirtableBaseMapping | null }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Base mapping</CardTitle>
        {baseMapping ? (
          <CardDescription>
            {baseMapping.baseName} ({baseMapping.baseId})
          </CardDescription>
        ) : (
          <CardDescription>No Airtable base is mapped yet.</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {baseMapping ? (
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
                {baseMapping.tableMappings.map((mapping) => (
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
  );
}

export function AirtableConflictsSection({
  conflicts,
  busy,
  resolutionDraft,
  manualValueDraft,
  onResolutionChange,
  onManualValueChange,
  onApplyResolution,
}: Readonly<{
  conflicts: readonly AirtableConflict[];
  busy: boolean;
  resolutionDraft: Partial<Record<string, AirtableConflictResolution>>;
  manualValueDraft: Partial<Record<string, string>>;
  onResolutionChange(conflictId: string, resolution: AirtableConflictResolution): void;
  onManualValueChange(conflictId: string, value: string): void;
  onApplyResolution(conflictId: string): void | Promise<void>;
}>) {
  return (
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
                  const current = resolutionDraft[conflict.id] ?? conflict.resolution ?? null;
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
                          {(Object.keys(resolutionCopy) as AirtableConflictResolution[]).map(
                            (option) => (
                              <label key={option} style={{ display: "block" }}>
                                <input
                                  type="radio"
                                  name={`airtable-conflict-${conflict.id}`}
                                  value={option}
                                  checked={current === option}
                                  onChange={() => onResolutionChange(conflict.id, option)}
                                />
                                {resolutionCopy[option].label}
                              </label>
                            ),
                          )}
                          {current === "manual" ? (
                            <label style={{ display: "block" }}>
                              Manual JSON value
                              <textarea
                                value={manualValueDraft[conflict.id] ?? ""}
                                onChange={(event) =>
                                  onManualValueChange(conflict.id, event.target.value)
                                }
                                aria-label={`Manual JSON value for ${conflict.resource} conflict`}
                              />
                            </label>
                          ) : null}
                          <Button
                            type="button"
                            size="xs"
                            onClick={() => void onApplyResolution(conflict.id)}
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
  );
}
