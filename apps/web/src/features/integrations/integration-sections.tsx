"use client";

import {
  type ApiScope,
  apiScopes,
  type WebhookEventType,
  webhookEventTypes,
} from "@open-sessionboard/contracts";
import {
  ArrowUpRight,
  BookOpen,
  Braces,
  Check,
  KeyRound,
  Radio,
  ShieldCheck,
  Webhook,
} from "lucide-react";
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

const productionApiOrigin = "https://open-sessionboard-api-production.ashleyha0317.workers.dev";

interface ApiDocsSectionProps {
  readonly organizationId: string;
  readonly basePath: string;
}

function CodeBlock({ label, children }: Readonly<{ label: string; children: string }>) {
  return (
    <div className={styles.codeBlock}>
      <div className={styles.codeHeader}>
        <span>{label}</span>
      </div>
      <pre>
        <code>{children}</code>
      </pre>
    </div>
  );
}

export function ApiDocsSection({ organizationId, basePath }: ApiDocsSectionProps) {
  const encodedOrganizationId = encodeURIComponent(organizationId);
  const webhookCollectionPath = `/api/v1/organizations/${encodedOrganizationId}/webhooks`;
  const curlExample = `curl "${productionApiOrigin}${webhookCollectionPath}" \\
  --header "Authorization: Bearer <api-key>" \\
  --header "Accept: application/json"`;
  const errorExample = `{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The request body is invalid.",
    "traceId": "request-trace-id"
  }
}`;

  return (
    <div className={styles.docsLayout}>
      <aside className={styles.docsSidebar} aria-label="On this page">
        <p>API documentation</p>
        <nav>
          <a href="#introduction">Introduction</a>
          <a href="#authentication">Authentication</a>
          <a href="#quickstart">Quickstart</a>
          <a href="#endpoints">Endpoints</a>
          <a href="#webhook-security">Webhook security</a>
          <a href="#errors">Errors &amp; limits</a>
          <a href="#access">Who should use this</a>
        </nav>
      </aside>

      <article className={styles.docsArticle}>
        <section className={styles.docsHero} id="introduction">
          <div className={styles.docsIcon} aria-hidden="true">
            <BookOpen />
          </div>
          <p className={styles.docsKicker}>Developer platform</p>
          <h1>Open Sessionboard API</h1>
          <p className={styles.docsLead}>
            Connect organization-owned systems to signed webhook administration. The public API is
            deliberately small today: it exposes runtime discovery and webhook subscriptions without
            exposing private program records.
          </p>
          <div className={styles.docsActions}>
            <a className={styles.docsPrimaryAction} href={`${basePath}/api-keys`}>
              Create an API key
              <KeyRound aria-hidden="true" />
            </a>
            <a
              className={styles.docsSecondaryAction}
              href={`${productionApiOrigin}/api/v1/openapi.json`}
              target="_blank"
              rel="noreferrer"
            >
              OpenAPI JSON
              <ArrowUpRight aria-hidden="true" />
            </a>
          </div>
        </section>

        <section className={styles.docsSection}>
          <div className={styles.docsFeatureGrid}>
            <div>
              <Braces aria-hidden="true" />
              <h2>Stable contract</h2>
              <p>OpenAPI 3.1 discovery, predictable JSON, and one error envelope.</p>
            </div>
            <div>
              <ShieldCheck aria-hidden="true" />
              <h2>Tenant scoped</h2>
              <p>The bearer key and organization path must resolve to the same tenant.</p>
            </div>
            <div>
              <Webhook aria-hidden="true" />
              <h2>Signed delivery</h2>
              <p>Timestamped HMAC-SHA256 signatures protect outbound webhook payloads.</p>
            </div>
          </div>
        </section>

        <section className={styles.docsSection} id="authentication">
          <p className={styles.docsKicker}>Authentication</p>
          <h2>Use a server-side bearer key</h2>
          <p>
            Create the narrowest key your integration needs. Never place API keys in browser code,
            public repositories, screenshots, or client-side environment variables.
          </p>
          <CodeBlock label="HTTP header">Authorization: Bearer &lt;api-key&gt;</CodeBlock>
          <div className={styles.docsCallout}>
            <KeyRound aria-hidden="true" />
            <div>
              <strong>Available scopes</strong>
              <p>
                Mounted webhook operations require <code>webhooks:read</code> or{" "}
                <code>webhooks:write</code>. Other key scopes shown in the organizer UI belong to
                internal or future contracts and do not make unmounted public routes available.
              </p>
            </div>
          </div>
        </section>

        <section className={styles.docsSection} id="quickstart">
          <p className={styles.docsKicker}>Quickstart</p>
          <h2>List webhook subscriptions</h2>
          <ol className={styles.docsSteps}>
            <li>
              <span className={styles.docsStepNumber}>1</span>
              <div>
                <strong>Create a key</strong>
                <p>
                  Open <a href={`${basePath}/api-keys`}>API keys</a> and grant{" "}
                  <code>webhooks:read</code>.
                </p>
              </div>
            </li>
            <li>
              <span className={styles.docsStepNumber}>2</span>
              <div>
                <strong>Store it once</strong>
                <p>The full credential is only shown immediately after creation.</p>
              </div>
            </li>
            <li>
              <span className={styles.docsStepNumber}>3</span>
              <div>
                <strong>Call the API Worker</strong>
                <p>Use the canonical production origin for direct server integrations.</p>
              </div>
            </li>
          </ol>
          <CodeBlock label="cURL">{curlExample}</CodeBlock>
          <dl className={styles.docsDefinitionList}>
            <div>
              <dt>Production base URL</dt>
              <dd>
                <code>{productionApiOrigin}</code>
              </dd>
            </div>
            <div>
              <dt>Organization</dt>
              <dd>
                <code>{organizationId}</code>
              </dd>
            </div>
            <div>
              <dt>Runtime discovery</dt>
              <dd>
                <code>/api/v1/openapi.json</code>
              </dd>
            </div>
          </dl>
        </section>

        <section className={styles.docsSection} id="endpoints">
          <p className={styles.docsKicker}>API reference</p>
          <h2>Current public surface</h2>
          <p>
            These are the mounted tenant API operations. Event reads expose publication-safe event,
            accepted-session, and active-speaker projections. Agenda, CRM, files, reviews, and
            submissions are not public-v1 resources.
          </p>
          <div className={styles.endpointList}>
            <div>
              <span className={styles.methodGet}>GET</span>
              <code>/api/v1/organizations/{"{organizationId}"}/events</code>
              <p>List events.</p>
            </div>
            <div>
              <span className={styles.methodGet}>GET</span>
              <code>
                /api/v1/organizations/{"{organizationId}"}/events/{"{eventId}"}/sessions
              </code>
              <p>List accepted sessions.</p>
            </div>
            <div>
              <span className={styles.methodGet}>GET</span>
              <code>
                /api/v1/organizations/{"{organizationId}"}/events/{"{eventId}"}/speakers
              </code>
              <p>List active speakers.</p>
            </div>
            <div>
              <span className={styles.methodGet}>GET</span>
              <code>/api/v1/openapi.json</code>
              <p>Read the live runtime contract.</p>
            </div>
            <div>
              <span className={styles.methodGet}>GET</span>
              <code>{webhookCollectionPath}</code>
              <p>List subscriptions.</p>
            </div>
            <div>
              <span className={styles.methodPost}>POST</span>
              <code>{webhookCollectionPath}</code>
              <p>Create a subscription.</p>
            </div>
            {(["GET", "PATCH", "PUT", "DELETE"] as const).map((method) => (
              <div key={method}>
                <span
                  className={
                    method === "GET"
                      ? styles.methodGet
                      : method === "DELETE"
                        ? styles.methodDelete
                        : styles.methodWrite
                  }
                >
                  {method}
                </span>
                <code>
                  {webhookCollectionPath}/{"{subscriptionId}"}
                </code>
                <p>
                  {method === "GET"
                    ? "Read one subscription."
                    : method === "DELETE"
                      ? "Remove a subscription."
                      : "Update a subscription."}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.docsSection} id="webhook-security">
          <p className={styles.docsKicker}>Webhook security</p>
          <h2>Verify before you process</h2>
          <p>
            Deliveries include <code>webhook-id</code>, <code>webhook-timestamp</code>, and{" "}
            <code>webhook-signature</code>. Verify the HMAC-SHA256 signature against the canonical
            JSON payload before parsing or acting, then deduplicate by delivery ID.
          </p>
          <ul className={styles.docsChecklist}>
            <li>
              <Check aria-hidden="true" />
              Reject stale timestamps outside your tolerance window.
            </li>
            <li>
              <Check aria-hidden="true" />
              Compare signatures using a timing-safe function.
            </li>
            <li>
              <Check aria-hidden="true" />
              Store processed delivery IDs to make retries harmless.
            </li>
            <li>
              <Check aria-hidden="true" />
              Rotate a compromised signing secret from the Webhooks page.
            </li>
          </ul>
        </section>

        <section className={styles.docsSection} id="errors">
          <p className={styles.docsKicker}>Errors &amp; limits</p>
          <h2>One envelope, traceable requests</h2>
          <p>
            Send <code>X-Request-ID</code> when you need end-to-end correlation. Otherwise the API
            creates a trace ID. Respect numeric <code>Retry-After</code> values on HTTP 429.
          </p>
          <CodeBlock label="Error response">{errorExample}</CodeBlock>
          <div className={styles.statusList}>
            <span className={styles.statusItem}>
              <strong>400</strong> Invalid request
            </span>
            <span className={styles.statusItem}>
              <strong>401</strong> Missing authentication
            </span>
            <span className={styles.statusItem}>
              <strong>403</strong> Wrong tenant or scope
            </span>
            <span className={styles.statusItem}>
              <strong>404</strong> Missing or withheld resource
            </span>
            <span className={styles.statusItem}>
              <strong>429</strong> Rate limited
            </span>
            <span className={styles.statusItem}>
              <strong>503</strong> Integration unavailable
            </span>
          </div>
        </section>

        <section className={styles.docsSection} id="access">
          <p className={styles.docsKicker}>Access model</p>
          <h2>Built for organization operators</h2>
          <div className={styles.accessGrid}>
            <div>
              <Radio aria-hidden="true" />
              <strong>Organizer owners and admins</strong>
              <p>
                Can read these docs, create keys, and administer webhooks for their organization.
              </p>
            </div>
            <div>
              <ShieldCheck aria-hidden="true" />
              <strong>Reviewers</strong>
              <p>Do not need API access. Their reviewer workspace exposes only assigned reviews.</p>
            </div>
            <div>
              <BookOpen aria-hidden="true" />
              <strong>Speakers</strong>
              <p>
                Use the first-party speaker portal. Its protected internal endpoints are not a
                public integration contract and require no speaker-managed API key.
              </p>
            </div>
          </div>
        </section>
      </article>
    </div>
  );
}

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

function CredentialForm({
  provider,
  label,
  hint,
  busy,
  onSave,
}: Readonly<{
  provider: "opensend";
  label: string;
  hint: string;
  busy: boolean;
  onSave(provider: "opensend", secret: string): Promise<boolean>;
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
      <Field>
        <FieldLabel htmlFor={`${provider}-secret`}>{label}</FieldLabel>
        <Input
          id={`${provider}-secret`}
          name="secret"
          type="password"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
        <FieldDescription>{hint}</FieldDescription>
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
        <a className={styles.statusCardLink} href={`${base}/delivery`}>
          <Card>
            <CardHeader>
              <div className={styles.cardTitleRow}>
                <CardTitle>Email &amp; calendar</CardTitle>
                <StatusBadge state={deliveryState} />
              </div>
              <CardDescription>
                OpenSend delivery and provider-neutral calendar invitations.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className={styles.metric}>
                {snapshot.delivery.openSend.deliveredLast24Hours} delivered
              </p>
              <p className={styles.muted}>in the last 24 hours</p>
            </CardContent>
          </Card>
        </a>
        <a className={styles.statusCardLink} href={`${base}/api-keys`}>
          <Card>
            <CardHeader>
              <div className={styles.cardTitleRow}>
                <CardTitle>API keys</CardTitle>
                <Badge variant={activeKeys > 0 ? "default" : "outline"}>
                  {activeKeys > 0 ? "Active" : "None"}
                </Badge>
              </div>
              <CardDescription>
                Scoped credentials for tenant-owned public API access.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className={styles.metric}>{activeKeys}</p>
              <p className={styles.muted}>active key{activeKeys === 1 ? "" : "s"}</p>
            </CardContent>
          </Card>
        </a>
        <a className={styles.statusCardLink} href={`${base}/api-docs`}>
          <Card>
            <CardHeader>
              <div className={styles.cardTitleRow}>
                <CardTitle>API documentation</CardTitle>
                <Badge variant="secondary">Developer guide</Badge>
              </div>
              <CardDescription>
                Authentication, mounted endpoints, webhook verification, and errors.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className={styles.metric}>v1</p>
              <p className={styles.muted}>organization-scoped public contract</p>
            </CardContent>
          </Card>
        </a>
        <a className={styles.statusCardLink} href={`${base}/webhooks`}>
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
        </a>
      </div>
      <Card>
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
                placeholder="https://example.com/open-sessionboard"
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
