"use client";

import { apiScopes, webhookEventTypes, type ApiScope, type WebhookEventType } from "@open-sessionboard/contracts";
import { useState, type FormEvent } from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  Input,
} from "../../components/ui";
import styles from "./integrations.module.css";
import type {
  AcceleventsAdminPreview,
  AcceleventsPublishResult,
  ApiKeySummary,
  ConnectionState,
  IntegrationAdminSnapshot,
  OneTimeSecret,
  WebhookSubscriptionSummary,
} from "./types";

interface IntegrationActions {
  readonly busy: boolean;
  saveCredential(provider: "opensend" | "accelevents", secret: string): Promise<boolean>;
  createApiKey(input: {
    label: string;
    scopes: readonly ApiScope[];
    expiresAt: string | null;
  }): Promise<boolean>;
  revokeApiKey(apiKeyId: string): Promise<boolean>;
  createWebhook(input: {
    endpointUrl: string;
    events: readonly WebhookEventType[];
  }): Promise<boolean>;
  setWebhookActive(subscriptionId: string, active: boolean): Promise<boolean>;
  rotateWebhookSecret(subscriptionId: string): Promise<boolean>;
  deleteWebhook(subscriptionId: string): Promise<boolean>;
  previewAccelevents(): Promise<boolean>;
  publishAccelevents(preview: AcceleventsAdminPreview): Promise<boolean>;
  retryCalendarDelivery(deliveryId: string): Promise<boolean>;
}

const statusPresentation: Record<
  ConnectionState,
  { readonly label: string; readonly variant: "success" | "warning" | "outline" }
> = {
  connected: { label: "Connected", variant: "success" },
  degraded: { label: "Needs attention", variant: "warning" },
  not_configured: { label: "Not configured", variant: "outline" },
};

const operationPresentation = {
  create: { label: "Create", variant: "success" },
  update: { label: "Update", variant: "info" },
  unchanged: { label: "No change", variant: "outline" },
} as const;

function StatusBadge({ state }: Readonly<{ state: ConnectionState }>) {
  const presentation = statusPresentation[state];
  return <Badge variant={presentation.variant}>{presentation.label}</Badge>;
}

function formatDate(value: string | null): string {
  if (!value) {
    return "Not yet";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return "Unknown";
  }
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function secretEnding(lastFour: string | null): string {
  return lastFour ? `•••• ${lastFour}` : "No credential saved";
}

export function OneTimeSecretPanel({
  secret,
  label,
  onDismiss,
}: Readonly<{ secret: OneTimeSecret; label: string; onDismiss(): void }>) {
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  async function copySecret() {
    try {
      await navigator.clipboard.writeText(secret.secret);
      setCopyStatus("Copied to clipboard.");
    } catch {
      setCopyStatus("Copy failed. Select and copy the value manually.");
    }
  }

  return (
    <section className={styles.secretPanel} aria-labelledby="one-time-secret-heading">
      <div>
        <p className={styles.eyebrow}>Shown once</p>
        <h2 id="one-time-secret-heading">Save this {label} now</h2>
        <p>For security, Open Sessionboard will not display this value again.</p>
      </div>
      <code className={styles.secretValue}>{secret.secret}</code>
      <div className={styles.actionRow}>
        <Button type="button" variant="secondary" size="small" onClick={() => void copySecret()}>
          Copy secret
        </Button>
        <Button type="button" variant="ghost" size="small" onClick={onDismiss}>
          I saved it
        </Button>
      </div>
      {copyStatus ? (
        <p className={styles.muted} role="status" aria-live="polite">
          {copyStatus}
        </p>
      ) : null}
    </section>
  );
}

function CredentialForm({
  provider,
  label,
  hint,
  busy,
  onSave,
}: Readonly<{
  provider: "opensend" | "accelevents";
  label: string;
  hint: string;
  busy: boolean;
  onSave(provider: "opensend" | "accelevents", secret: string): Promise<boolean>;
}>) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const secret = String(new FormData(form).get("secret") ?? "");
    if (await onSave(provider, secret)) {
      form.reset();
    }
  }

  return (
    <form className={styles.formStack} onSubmit={(event) => void submit(event)}>
      <Field label={label} name={`${provider}-secret`} hint={hint} required>
        {(control) => (
          <Input
            {...control}
            name="secret"
            type="password"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        )}
      </Field>
      <p className={styles.securityNote}>
        Credentials are encrypted at rest. Existing values are never returned to this browser.
      </p>
      <Button type="submit" variant="secondary" disabled={busy}>
        {busy ? "Saving…" : "Save credential"}
      </Button>
    </form>
  );
}

export function OverviewSection({ snapshot }: Readonly<{ snapshot: IntegrationAdminSnapshot }>) {
  const activeKeys = snapshot.apiKeys.filter((key) => key.revokedAt === null).length;
  const activeWebhooks = snapshot.webhooks.filter((webhook) => webhook.active).length;
  const base = `/admin/events/${encodeURIComponent(snapshot.event.id)}/integrations`;
  const deliveryStates = [snapshot.delivery.openSend.state, snapshot.delivery.calendar.state];
  const deliveryState: ConnectionState = deliveryStates.includes("degraded")
    ? "degraded"
    : deliveryStates.includes("not_configured")
      ? "not_configured"
      : "connected";

  return (
    <div className={styles.sectionStack}>
      <div className={styles.statusGrid}>
        <a className={styles.statusCardLink} href={`${base}/accelevents`}>
          <Card interactive>
            <CardHeader>
              <div className={styles.cardTitleRow}>
                <CardTitle>Accelevents</CardTitle>
                <StatusBadge state={snapshot.accelevents.state} />
              </div>
              <CardDescription>Preview and explicitly publish accepted program records.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className={styles.metric}>{snapshot.accelevents.accountLabel ?? "No account selected"}</p>
              <p className={styles.muted}>
                Last publication: {formatDate(snapshot.accelevents.lastPublication?.completedAt ?? null)}
              </p>
            </CardContent>
          </Card>
        </a>
        <a className={styles.statusCardLink} href={`${base}/delivery`}>
          <Card interactive>
            <CardHeader>
              <div className={styles.cardTitleRow}>
                <CardTitle>Email &amp; calendar</CardTitle>
                <StatusBadge state={deliveryState} />
              </div>
              <CardDescription>OpenSend delivery and provider-neutral calendar invitations.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className={styles.metric}>{snapshot.delivery.openSend.deliveredLast24Hours} delivered</p>
              <p className={styles.muted}>in the last 24 hours</p>
            </CardContent>
          </Card>
        </a>
        <a className={styles.statusCardLink} href={`${base}/api-keys`}>
          <Card interactive>
            <CardHeader>
              <div className={styles.cardTitleRow}>
                <CardTitle>API keys</CardTitle>
                <Badge variant={activeKeys > 0 ? "success" : "outline"}>
                  {activeKeys > 0 ? "Active" : "None"}
                </Badge>
              </div>
              <CardDescription>Scoped credentials for tenant-owned public API access.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className={styles.metric}>{activeKeys}</p>
              <p className={styles.muted}>active key{activeKeys === 1 ? "" : "s"}</p>
            </CardContent>
          </Card>
        </a>
        <a className={styles.statusCardLink} href={`${base}/webhooks`}>
          <Card interactive>
            <CardHeader>
              <div className={styles.cardTitleRow}>
                <CardTitle>Webhooks</CardTitle>
                <Badge variant={activeWebhooks > 0 ? "success" : "outline"}>
                  {activeWebhooks > 0 ? "Delivering" : "None"}
                </Badge>
              </div>
              <CardDescription>Signed event delivery with observable attempts.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className={styles.metric}>{activeWebhooks}</p>
              <p className={styles.muted}>active endpoint{activeWebhooks === 1 ? "" : "s"}</p>
            </CardContent>
          </Card>
        </a>
      </div>
      <Card flat>
        <CardHeader>
          <CardTitle>Source-of-truth boundary</CardTitle>
          <CardDescription>
            Airtable remains authoritative for event and program records. Integrations may publish
            outward, but they cannot overwrite source records.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

export function AcceleventsSection({
  snapshot,
  preview,
  publishResult,
  actions,
}: Readonly<{
  snapshot: IntegrationAdminSnapshot;
  preview: AcceleventsAdminPreview | null;
  publishResult: AcceleventsPublishResult | null;
  actions: IntegrationActions;
}>) {
  const [confirmed, setConfirmed] = useState(false);
  const validationBlocked = (preview?.validationErrors.length ?? 0) > 0;

  return (
    <div className={styles.sectionStack}>
      <div className={styles.twoColumn}>
        <Card>
          <CardHeader>
            <div className={styles.cardTitleRow}>
              <CardTitle>Accelevents connection</CardTitle>
              <StatusBadge state={snapshot.accelevents.state} />
            </div>
            <CardDescription>
              Outbound only. Accelevents data is read for diffing and never copied back into Airtable.
            </CardDescription>
          </CardHeader>
          <CardContent className={styles.formStack}>
            <dl className={styles.definitionList}>
              <div>
                <dt>Account</dt>
                <dd>{snapshot.accelevents.accountLabel ?? "Not selected"}</dd>
              </div>
              <div>
                <dt>Credential</dt>
                <dd>{secretEnding(snapshot.accelevents.credentialLastFour)}</dd>
              </div>
            </dl>
            <CredentialForm
              provider="accelevents"
              label="Replace Accelevents API key"
              hint="Use an event-scoped key with the minimum required write permissions."
              busy={actions.busy}
              onSave={actions.saveCredential}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Publication guardrail</CardTitle>
            <CardDescription>Every publication is tied to one immutable agenda revision.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className={styles.definitionList}>
              <div>
                <dt>Published agenda revision</dt>
                <dd>{snapshot.event.publishedAgendaRevisionId ?? "Publish an agenda first"}</dd>
              </div>
              <div>
                <dt>Last result</dt>
                <dd>{snapshot.accelevents.lastPublication?.status.replace("_", " ") ?? "Not yet"}</dd>
              </div>
              <div>
                <dt>Record errors</dt>
                <dd>{snapshot.accelevents.lastPublication?.errorCount ?? 0}</dd>
              </div>
            </dl>
          </CardContent>
          <CardFooter>
            <Button
              type="button"
              onClick={() => void actions.previewAccelevents()}
              disabled={actions.busy || !snapshot.event.publishedAgendaRevisionId}
            >
              {actions.busy ? "Preparing preview…" : "Preview publication"}
            </Button>
          </CardFooter>
        </Card>
      </div>

      {preview ? (
        <Card>
          <CardHeader>
            <div className={styles.cardTitleRow}>
              <div>
                <p className={styles.eyebrow}>Required preview</p>
                <CardTitle>Review outbound changes</CardTitle>
              </div>
              <Badge variant={validationBlocked ? "danger" : "success"}>
                {validationBlocked ? "Blocked" : "Ready to publish"}
              </Badge>
            </div>
            <CardDescription>
              Snapshot {preview.snapshotHash.slice(0, 12)}… from {formatDate(preview.createdAt)}. A fresh
              preview is required if the agenda changes.
            </CardDescription>
          </CardHeader>
          <CardContent className={styles.sectionStack}>
            <div className={styles.previewMetrics}>
              <div>
                <strong>{preview.diff.summary.create}</strong>
                <span>Create</span>
              </div>
              <div>
                <strong>{preview.diff.summary.update}</strong>
                <span>Update</span>
              </div>
              <div>
                <strong>{preview.diff.summary.unchanged}</strong>
                <span>Unchanged</span>
              </div>
              <div>
                <strong>{preview.speakers.length + preview.sessions.length}</strong>
                <span>Total records</span>
              </div>
            </div>

            {preview.validationErrors.length > 0 ? (
              <div className={styles.errorPanel} role="alert">
                <h3>Resolve {preview.validationErrors.length} validation error(s)</h3>
                <ul>
                  {preview.validationErrors.map((error) => (
                    <li key={`${error.externalId}-${error.code}`}>
                      <code>{error.externalId}</code>: {error.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className={styles.tableFrame}>
              <table>
                <caption>Accelevents speaker and session changes</caption>
                <thead>
                  <tr>
                    <th scope="col">Record</th>
                    <th scope="col">Type</th>
                    <th scope="col">Action</th>
                    <th scope="col">Changed fields</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.diff.records.map((record) => (
                    <tr key={`${record.kind}-${record.externalId}`}>
                      <td>
                        <strong>{record.label}</strong>
                        <small>{record.externalId}</small>
                      </td>
                      <td>{record.kind === "speaker" ? "Speaker" : "Session"}</td>
                      <td>
                        <Badge variant={operationPresentation[record.operation].variant}>
                          {operationPresentation[record.operation].label}
                        </Badge>
                      </td>
                      <td>{record.changedFields.length > 0 ? record.changedFields.join(", ") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <label className={styles.confirmation}>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.currentTarget.checked)}
              />
              <span>
                I reviewed this immutable preview and authorize outbound upserts to Accelevents.
                Airtable records will not be changed.
              </span>
            </label>
          </CardContent>
          <CardFooter>
            <Button
              type="button"
              disabled={!confirmed || validationBlocked || actions.busy}
              onClick={() => void actions.publishAccelevents(preview)}
            >
              {actions.busy ? "Publishing…" : "Confirm and publish"}
            </Button>
          </CardFooter>
        </Card>
      ) : null}

      {publishResult ? (
        <div
          className={publishResult.status === "succeeded" ? styles.successPanel : styles.warningPanel}
          role="status"
          aria-live="polite"
        >
          <h2>
            {publishResult.status === "succeeded"
              ? "Accelevents publication complete"
              : "Publication completed with errors"}
          </h2>
          <p>
            {publishResult.created} created, {publishResult.updated} updated, and {publishResult.unchanged}{" "}
            unchanged at {formatDate(publishResult.completedAt)}.
          </p>
          {publishResult.errors.length > 0 ? (
            <>
              <ul>
                {publishResult.errors.map((error) => (
                  <li key={error.externalId}>
                    {error.externalId}: {error.message}
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                variant="secondary"
                disabled={actions.busy || !preview}
                onClick={() => (preview ? void actions.publishAccelevents(preview) : undefined)}
              >
                Retry failed records
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ApiKeysSection({
  keys,
  actions,
}: Readonly<{ keys: readonly ApiKeySummary[]; actions: IntegrationActions }>) {
  const [selectedScopes, setSelectedScopes] = useState<ReadonlySet<ApiScope>>(new Set());

  function toggleScope(scope: ApiScope) {
    setSelectedScopes((current) => {
      const next = new Set(current);
      if (next.has(scope)) {
        next.delete(scope);
      } else {
        next.add(scope);
      }
      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const created = await actions.createApiKey({
      label: String(data.get("label") ?? ""),
      scopes: [...selectedScopes],
      expiresAt: String(data.get("expiresAt") ?? "").trim() || null,
    });
    if (created) {
      form.reset();
      setSelectedScopes(new Set());
    }
  }

  return (
    <div className={styles.sectionStack}>
      <Card>
        <CardHeader>
          <CardTitle>Create a scoped API key</CardTitle>
          <CardDescription>
            Select only the permissions this client needs. The full key is displayed once after creation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className={styles.formStack} onSubmit={(event) => void submit(event)}>
            <div className={styles.formGrid}>
              <Field label="Key name" name="api-key-label" required>
                {(control) => (
                  <Input {...control} name="label" maxLength={100} placeholder="Agenda export" required />
                )}
              </Field>
              <Field
                label="Expires"
                name="api-key-expiry"
                hint="Leave blank only for long-running server integrations."
              >
                {(control) => <Input {...control} name="expiresAt" type="date" />}
              </Field>
            </div>
            <fieldset className={styles.checkboxFieldset}>
              <legend>Permissions</legend>
              <div className={styles.checkboxGrid}>
                {apiScopes.map((scope) => (
                  <label key={scope}>
                    <input
                      type="checkbox"
                      checked={selectedScopes.has(scope)}
                      onChange={() => toggleScope(scope)}
                    />
                    <span>{scope}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Button type="submit" disabled={actions.busy || selectedScopes.size === 0}>
              {actions.busy ? "Creating…" : "Create API key"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card flat>
        <CardHeader>
          <CardTitle>API keys</CardTitle>
          <CardDescription>Key material is never displayed after the initial creation response.</CardDescription>
        </CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <p className={styles.empty}>No API keys have been created for this event.</p>
          ) : (
            <div className={styles.tableFrame}>
              <table>
                <caption>API key access for this event</caption>
                <thead>
                  <tr>
                    <th scope="col">Key</th>
                    <th scope="col">Permissions</th>
                    <th scope="col">Last used</th>
                    <th scope="col">Status</th>
                    <th scope="col"><span className={styles.srOnly}>Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((key) => (
                    <tr key={key.id}>
                      <td>
                        <strong>{key.label}</strong>
                        <small><code>{key.prefix}••••••••</code></small>
                      </td>
                      <td>{key.scopes.join(", ")}</td>
                      <td>{formatDate(key.lastUsedAt)}</td>
                      <td>
                        <Badge variant={key.revokedAt ? "outline" : "success"}>
                          {key.revokedAt ? "Revoked" : "Active"}
                        </Badge>
                      </td>
                      <td>
                        {key.revokedAt ? null : (
                          <details className={styles.confirmDetails}>
                            <summary>Revoke</summary>
                            <p>Requests using this key will immediately fail.</p>
                            <Button
                              type="button"
                              size="small"
                              variant="danger"
                              disabled={actions.busy}
                              onClick={() => void actions.revokeApiKey(key.id)}
                            >
                              Confirm revoke
                            </Button>
                          </details>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function deliveryBadge(status: WebhookSubscriptionSummary["lastDelivery"]): {
  label: string;
  variant: "success" | "warning" | "danger" | "outline";
} {
  if (!status) {
    return { label: "No attempts", variant: "outline" };
  }
  if (status.status === "succeeded") {
    return { label: "Delivered", variant: "success" };
  }
  if (status.status === "failed") {
    return { label: "Failed", variant: "danger" };
  }
  return { label: status.status === "retrying" ? "Retrying" : "In progress", variant: "warning" };
}

export function WebhooksSection({
  webhooks,
  actions,
}: Readonly<{ webhooks: readonly WebhookSubscriptionSummary[]; actions: IntegrationActions }>) {
  const [selectedEvents, setSelectedEvents] = useState<ReadonlySet<WebhookEventType>>(new Set());

  function toggleEvent(eventType: WebhookEventType) {
    setSelectedEvents((current) => {
      const next = new Set(current);
      if (next.has(eventType)) {
        next.delete(eventType);
      } else {
        next.add(eventType);
      }
      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const endpointUrl = String(new FormData(form).get("endpointUrl") ?? "");
    if (await actions.createWebhook({ endpointUrl, events: [...selectedEvents] })) {
      form.reset();
      setSelectedEvents(new Set());
    }
  }

  return (
    <div className={styles.sectionStack}>
      <Card>
        <CardHeader>
          <CardTitle>Add a webhook endpoint</CardTitle>
          <CardDescription>
            HTTPS deliveries include a timestamped HMAC signature. The signing secret is displayed once.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className={styles.formStack} onSubmit={(event) => void submit(event)}>
            <Field
              label="Endpoint URL"
              name="webhook-endpoint"
              hint="Use a public HTTPS endpoint. Redirects are not followed."
              required
            >
              {(control) => (
                <Input
                  {...control}
                  name="endpointUrl"
                  type="url"
                  inputMode="url"
                  placeholder="https://example.com/open-sessionboard"
                  pattern="https://.*"
                  required
                />
              )}
            </Field>
            <fieldset className={styles.checkboxFieldset}>
              <legend>Events</legend>
              <div className={styles.checkboxGrid}>
                {webhookEventTypes.map((eventType) => (
                  <label key={eventType}>
                    <input
                      type="checkbox"
                      checked={selectedEvents.has(eventType)}
                      onChange={() => toggleEvent(eventType)}
                    />
                    <span>{eventType}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Button type="submit" disabled={actions.busy || selectedEvents.size === 0}>
              {actions.busy ? "Creating…" : "Create endpoint"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {webhooks.length === 0 ? (
        <Card flat>
          <CardContent>
            <p className={styles.empty}>No webhook endpoints are configured for this event.</p>
          </CardContent>
        </Card>
      ) : (
        <div className={styles.cardList}>
          {webhooks.map((webhook) => {
            const delivery = deliveryBadge(webhook.lastDelivery);
            return (
              <Card key={webhook.id}>
                <CardHeader>
                  <div className={styles.cardTitleRow}>
                    <CardTitle><code>{webhook.endpointUrl}</code></CardTitle>
                    <Badge variant={webhook.active ? "success" : "outline"}>
                      {webhook.active ? "Active" : "Paused"}
                    </Badge>
                  </div>
                  <CardDescription>{webhook.events.join(", ")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className={styles.definitionList}>
                    <div>
                      <dt>Signing secret</dt>
                      <dd>•••• {webhook.signingSecretLastFour}</dd>
                    </div>
                    <div>
                      <dt>Last attempt</dt>
                      <dd>{formatDate(webhook.lastDelivery?.attemptedAt ?? null)}</dd>
                    </div>
                    <div>
                      <dt>Delivery</dt>
                      <dd><Badge variant={delivery.variant}>{delivery.label}</Badge></dd>
                    </div>
                    {webhook.lastDelivery?.responseStatus ? (
                      <div>
                        <dt>Last response</dt>
                        <dd>HTTP {webhook.lastDelivery.responseStatus}</dd>
                      </div>
                    ) : null}
                  </dl>
                </CardContent>
                <CardFooter>
                  <Button
                    type="button"
                    size="small"
                    variant="secondary"
                    disabled={actions.busy}
                    onClick={() => void actions.setWebhookActive(webhook.id, !webhook.active)}
                  >
                    {webhook.active ? "Pause deliveries" : "Resume deliveries"}
                  </Button>
                  <details className={styles.confirmDetails}>
                    <summary>Rotate secret</summary>
                    <p>The current signing secret stops working immediately.</p>
                    <Button
                      type="button"
                      size="small"
                      variant="danger"
                      disabled={actions.busy}
                      onClick={() => void actions.rotateWebhookSecret(webhook.id)}
                    >
                      Confirm rotation
                    </Button>
                  </details>
                  <details className={styles.confirmDetails}>
                    <summary>Remove endpoint</summary>
                    <p>Pending deliveries stop and this endpoint is permanently removed.</p>
                    <Button
                      type="button"
                      size="small"
                      variant="danger"
                      disabled={actions.busy}
                      onClick={() => void actions.deleteWebhook(webhook.id)}
                    >
                      Confirm removal
                    </Button>
                  </details>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function DeliverySection({
  snapshot,
  actions,
}: Readonly<{ snapshot: IntegrationAdminSnapshot; actions: IntegrationActions }>) {
  const { openSend, calendar } = snapshot.delivery;

  return (
    <div className={styles.sectionStack}>
      <div className={styles.twoColumn}>
        <Card>
          <CardHeader>
            <div className={styles.cardTitleRow}>
              <CardTitle>OpenSend</CardTitle>
              <StatusBadge state={openSend.state} />
            </div>
            <CardDescription>
              Transactional delivery through sending-scoped credentials and approved identities.
            </CardDescription>
          </CardHeader>
          <CardContent className={styles.formStack}>
            <dl className={styles.definitionList}>
              <div>
                <dt>Credential</dt>
                <dd>{secretEnding(openSend.credentialLastFour)}</dd>
              </div>
              <div>
                <dt>Delivered, 24 hours</dt>
                <dd>{openSend.deliveredLast24Hours}</dd>
              </div>
              <div>
                <dt>Failed, 24 hours</dt>
                <dd>{openSend.failedLast24Hours}</dd>
              </div>
            </dl>
            <CredentialForm
              provider="opensend"
              label="Replace OpenSend sending key"
              hint="Sending-scoped keys only. Account administration keys are rejected."
              busy={actions.busy}
              onSave={actions.saveCredential}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className={styles.cardTitleRow}>
              <CardTitle>Calendar delivery</CardTitle>
              <StatusBadge state={calendar.state} />
            </div>
            <CardDescription>
              RFC 5545 invitations are attached to email. Google or Microsoft Calendar OAuth is not required.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className={styles.definitionList}>
              <div>
                <dt>Event timezone</dt>
                <dd>{snapshot.event.timeZone}</dd>
              </div>
              <div>
                <dt>Sent, 24 hours</dt>
                <dd>{calendar.sentLast24Hours}</dd>
              </div>
              <div>
                <dt>Failed, 24 hours</dt>
                <dd>{calendar.failedLast24Hours}</dd>
              </div>
              <div>
                <dt>Last invitation</dt>
                <dd>{formatDate(calendar.lastInvitationAt)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card flat>
        <CardHeader>
          <CardTitle>Verified sender identities</CardTitle>
          <CardDescription>
            SPF, DKIM, and DMARC must pass before production delivery is enabled.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className={styles.senderList}>
            {openSend.senderChecks.map((sender) => (
              <li key={sender.address}>
                <code>{sender.address}</code>
                <Badge
                  variant={
                    sender.status === "verified"
                      ? "success"
                      : sender.status === "failed"
                        ? "danger"
                        : "warning"
                  }
                >
                  {sender.status === "verified" ? "Verified" : sender.status === "failed" ? "Failed" : "Pending"}
                </Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {calendar.lastFailure ? (
        <div className={styles.errorPanel} role="alert">
          <h2>Calendar delivery failed</h2>
          <p>
            {calendar.lastFailure.summary} · {formatDate(calendar.lastFailure.occurredAt)}
          </p>
          {calendar.lastFailure.retryable ? (
            <Button
              type="button"
              variant="secondary"
              disabled={actions.busy}
              onClick={() => void actions.retryCalendarDelivery(calendar.lastFailure!.deliveryId)}
            >
              Retry delivery
            </Button>
          ) : (
            <p>Correct the invitation data before sending again.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
