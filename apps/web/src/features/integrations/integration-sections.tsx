"use client";

import {
  type ApiScope,
  apiScopes,
  type WebhookEventType,
  webhookEventTypes,
} from "@eventloom/contracts";
import Link from "next/link";
import { type FormEvent, useState } from "react";
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
  FieldDescription,
  FieldLabel,
  Input,
} from "../../components/ui";
import styles from "./integrations.module.css";
import type {
  ApiKeySummary,
  ConnectionState,
  IntegrationAdminSnapshot,
  OneTimeSecret,
  WebhookSubscriptionSummary,
} from "./types";

interface IntegrationActions {
  readonly busy: boolean;
  saveCredential(provider: "opensend", secret: string): Promise<boolean>;
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
  retryCalendarDelivery(deliveryId: string): Promise<boolean>;
}

const statusPresentation: Record<
  ConnectionState,
  { readonly label: string; readonly variant: "default" | "secondary" | "outline" }
> = {
  connected: { label: "Connected", variant: "default" },
  degraded: { label: "Needs attention", variant: "secondary" },
  not_configured: { label: "Not configured", variant: "outline" },
};

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
        <p>For security, Eventloom will not display this value again.</p>
      </div>
      <code className={styles.secretValue}>{secret.secret}</code>
      <div className={styles.actionRow}>
        <Button type="button" variant="secondary" size="sm" onClick={() => void copySecret()}>
          Copy secret
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
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

export function OverviewSection({
  snapshot,
  basePath,
}: Readonly<{ snapshot: IntegrationAdminSnapshot; basePath: string }>) {
  const activeKeys = snapshot.apiKeys.filter((key) => key.revokedAt === null).length;
  const activeWebhooks = snapshot.webhooks.filter((webhook) => webhook.active).length;
  const base = basePath;
  const deliveryStates = [snapshot.delivery.openSend.state, snapshot.delivery.calendar.state];
  const deliveryState: ConnectionState = deliveryStates.includes("degraded")
    ? "degraded"
    : deliveryStates.includes("not_configured")
      ? "not_configured"
      : "connected";

  return (
    <div className={styles.sectionStack}>
      <div className={styles.statusGrid}>
        <Link className={styles.statusCardLink} href={`${base}/delivery`}>
          <Card>
            <CardHeader>
              <div className={styles.cardTitleRow}>
                <CardTitle>Email &amp; calendar</CardTitle>
                <StatusBadge state={deliveryState} />
              </div>
              <CardDescription>
                Deployment-managed email delivery and provider-neutral calendar invitations.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className={styles.metric}>
                {snapshot.delivery.openSend.deliveredLast24Hours} delivered
              </p>
              <p className={styles.muted}>in the last 24 hours</p>
            </CardContent>
          </Card>
        </Link>
        <Link className={styles.statusCardLink} href={`${base}/api-keys`}>
          <Card>
            <CardHeader>
              <div className={styles.cardTitleRow}>
                <CardTitle>Organization API keys</CardTitle>
                <Badge variant={activeKeys > 0 ? "default" : "outline"}>
                  {activeKeys > 0 ? "Active" : "None"}
                </Badge>
              </div>
              <CardDescription>
                Organization-scoped credentials for public API access.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className={styles.metric}>{activeKeys}</p>
              <p className={styles.muted}>active key{activeKeys === 1 ? "" : "s"}</p>
            </CardContent>
          </Card>
        </Link>
        <Link className={styles.statusCardLink} href={`${base}/webhooks`}>
          <Card>
            <CardHeader>
              <div className={styles.cardTitleRow}>
                <CardTitle>Webhooks</CardTitle>
                <Badge variant={activeWebhooks > 0 ? "default" : "outline"}>
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
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Source-of-truth boundary</CardTitle>
          <CardDescription>
            D1 remains authoritative for event and program records. Airtable is an optional
            asynchronous projection and validated inbound adapter.
          </CardDescription>
        </CardHeader>
      </Card>
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
            Select only the permissions this client needs. The full key is displayed once after
            creation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className={styles.formStack} onSubmit={(event) => void submit(event)}>
            <div className={styles.formGrid}>
              <Field>
                <FieldLabel htmlFor="api-key-label">Key name</FieldLabel>
                <Input
                  id="api-key-label"
                  name="label"
                  maxLength={100}
                  placeholder="Agenda export"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="api-key-expiry">Expires</FieldLabel>
                <Input id="api-key-expiry" name="expiresAt" type="date" />
                <FieldDescription>
                  Leave blank only for long-running server integrations.
                </FieldDescription>
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

      <Card>
        <CardHeader>
          <CardTitle>API keys</CardTitle>
          <CardDescription>
            Key material is never displayed after the initial creation response.
          </CardDescription>
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
                    <th scope="col">
                      <span className={styles.srOnly}>Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((key) => (
                    <tr key={key.id}>
                      <td>
                        <strong>{key.label}</strong>
                        <small>
                          <code>{key.prefix}••••••••</code>
                        </small>
                      </td>
                      <td>{key.scopes.join(", ")}</td>
                      <td>{formatDate(key.lastUsedAt)}</td>
                      <td>
                        <Badge variant={key.revokedAt ? "outline" : "default"}>
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
                              size="sm"
                              variant="destructive"
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
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  if (!status) {
    return { label: "No attempts", variant: "outline" };
  }
  if (status.status === "succeeded") {
    return { label: "Delivered", variant: "default" };
  }
  if (status.status === "failed") {
    return { label: "Failed", variant: "destructive" };
  }
  return {
    label: status.status === "retrying" ? "Retrying" : "In progress",
    variant: "secondary",
  };
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
            HTTPS deliveries include a timestamped HMAC signature. The signing secret is displayed
            once.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className={styles.formStack} onSubmit={(event) => void submit(event)}>
            <Field>
              <FieldLabel htmlFor="webhook-endpoint">Endpoint URL</FieldLabel>
              <Input
                id="webhook-endpoint"
                name="endpointUrl"
                type="url"
                inputMode="url"
                placeholder="https://example.com/eventloom"
                pattern="https://.*"
                required
              />
              <FieldDescription>
                Use a public HTTPS endpoint. Redirects are not followed.
              </FieldDescription>
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
        <Card>
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
                    <CardTitle>
                      <code>{webhook.endpointUrl}</code>
                    </CardTitle>
                    <Badge variant={webhook.active ? "default" : "outline"}>
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
                      <dd>
                        <Badge variant={delivery.variant}>{delivery.label}</Badge>
                      </dd>
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
                    size="sm"
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
                      size="sm"
                      variant="destructive"
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
                      size="sm"
                      variant="destructive"
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
              <CardTitle>Email delivery provider</CardTitle>
              <StatusBadge state={openSend.state} />
            </div>
            <CardDescription>
              Delivery uses deployment-managed provider credentials and verified sender identities.
              Event organizers can inspect operations but cannot replace provider secrets here.
            </CardDescription>
          </CardHeader>
          <CardContent className={styles.formStack}>
            <dl className={styles.definitionList}>
              <div>
                <dt>Credential ownership</dt>
                <dd>Deployment managed</dd>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className={styles.cardTitleRow}>
              <CardTitle>Calendar delivery</CardTitle>
              <StatusBadge state={calendar.state} />
            </div>
            <CardDescription>
              RFC 5545 invitations are attached to email. Google or Microsoft Calendar OAuth is not
              required.
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

      <Card>
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
                      ? "default"
                      : sender.status === "failed"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {sender.status === "verified"
                    ? "Verified"
                    : sender.status === "failed"
                      ? "Failed"
                      : "Pending"}
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
              onClick={() => {
                const failure = calendar.lastFailure;
                if (failure) {
                  void actions.retryCalendarDelivery(failure.deliveryId);
                }
              }}
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
