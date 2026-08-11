"use client";

import {
  type CSSProperties,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createScopedReadFlightCoordinator } from "@/lib/scoped-read-flight";
import {
  approvedSenderForPurpose,
  COMMUNICATION_AUDIENCES,
  COMMUNICATION_SENDERS,
  COMMUNICATION_TEMPLATE_PURPOSES,
  type CommunicationApi,
  CommunicationApiError,
  type CommunicationAudience,
  type CommunicationAuditEntry,
  type CommunicationDelivery,
  type CommunicationPreview,
  type CommunicationSend,
  type CommunicationTemplate,
  type CommunicationTemplatePurpose,
  createCommunicationApi,
  escapeHtmlForPreview,
  formatCommunicationAudience,
  formatCommunicationPurpose,
} from "./api";

const pageStyle: CSSProperties = {
  minHeight: "100dvh",
  padding: "2rem 1rem 4rem",
  background: "var(--color-canvas, #f5f6f9)",
};
const contentStyle: CSSProperties = { width: "min(100%, 76rem)", margin: "0 auto" };
const cardStyle: CSSProperties = {
  padding: "1.25rem",
  border: "1px solid var(--color-border, #dfe2e8)",
  borderRadius: "0.875rem",
  background: "var(--color-surface, #fff)",
  boxShadow: "var(--shadow-card, 0 8px 24px rgb(29 34 51 / 6%))",
};
const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 24rem), 1fr))",
  gap: "1rem",
};
const fieldStyle: CSSProperties = { display: "grid", gap: "0.35rem" };
const inputStyle: CSSProperties = {
  width: "100%",
  padding: "0.6rem 0.7rem",
  border: "1px solid var(--color-border-strong, #cdd1da)",
  borderRadius: "0.5rem",
  font: "inherit",
};
const buttonStyle: CSSProperties = {
  padding: "0.62rem 0.9rem",
  border: "1px solid var(--color-brand, #5065e8)",
  borderRadius: "0.5rem",
  background: "var(--color-brand, #5065e8)",
  color: "white",
  font: "inherit",
  fontWeight: 700,
  cursor: "pointer",
};
const secondaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  borderColor: "var(--color-border-strong, #cdd1da)",
  background: "var(--color-surface, #fff)",
  color: "var(--color-ink, #25272d)",
};
const mutedStyle: CSSProperties = { color: "var(--color-muted, #697181)" };
const rowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.65rem",
  alignItems: "center",
};
const preStyle: CSSProperties = {
  maxHeight: "16rem",
  overflow: "auto",
  padding: "0.8rem",
  borderRadius: "0.5rem",
  background: "#20242d",
  color: "#f8f9fb",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
};

export type CommunicationProviderState =
  | "unknown"
  | "available"
  | "unavailable"
  | "domain-unverified";

export interface CommunicationsWorkspaceProps {
  readonly eventId: string;
  readonly organizationId: string;
  readonly api?: CommunicationApi;
  readonly initialTemplates?: readonly CommunicationTemplate[];
  readonly initialPreview?: CommunicationPreview | null;
  readonly initialSend?: CommunicationSend | null;
  readonly providerState?: CommunicationProviderState;
}

export interface CommunicationsWorkspaceViewProps {
  readonly eventId: string;
  readonly organizationId: string;
  readonly templates: readonly CommunicationTemplate[];
  readonly preview?: CommunicationPreview | null;
  readonly send?: CommunicationSend | null;
  readonly loading?: boolean;
  readonly busy?: boolean;
  readonly error?: string | null;
  readonly statusMessage?: string | null;
  readonly providerState?: CommunicationProviderState;
  readonly selectedTemplateId?: string;
  readonly creatingTemplate?: boolean;
  readonly selectedAudience?: CommunicationAudience;
  readonly onSelectTemplate?: (templateId: string) => void;
  readonly onStartNewTemplate?: () => void;
  readonly onSelectAudience?: (audience: CommunicationAudience) => void;
  readonly onCreateTemplate?: (input: TemplateDraft) => Promise<void>;
  readonly onCreateVersion?: (input: TemplateDraft) => Promise<void>;
  readonly onApproveTemplate?: (template: CommunicationTemplate) => Promise<void>;
  readonly onPreview?: () => Promise<void>;
  readonly onOpenSendConfirmation?: () => void;
  readonly onConfirmSend?: () => Promise<void>;
  readonly onCloseSendConfirmation?: () => void;
  readonly sendConfirmationOpen?: boolean;
  readonly onRetryFailed?: () => Promise<void>;
}

export interface TemplateDraft {
  readonly name: string;
  readonly purpose: CommunicationTemplatePurpose;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly variables: readonly string[];
  readonly templateId?: string;
}

function statusLabel(
  status:
    | CommunicationTemplate["status"]
    | CommunicationSend["status"]
    | CommunicationDelivery["status"],
): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function senderLabel(template: CommunicationTemplate | CommunicationPreview["template"]): string {
  return COMMUNICATION_SENDERS.includes(template.sender)
    ? template.sender
    : "Unapproved sender identity";
}

function providerLabel(state: CommunicationProviderState): string {
  if (state === "available") return "Provider connected";
  if (state === "unavailable") return "Provider unavailable";
  if (state === "domain-unverified") return "Sender domain unverified";
  return "Provider readiness not confirmed";
}

function providerDescription(state: CommunicationProviderState): string {
  if (state === "available") {
    return "Operational email delivery is connected. Delivery statuses remain visible per recipient.";
  }
  if (state === "unavailable") {
    return "The email provider is unavailable. No send was attempted; resolve provider configuration before retrying.";
  }
  if (state === "domain-unverified") {
    return "The sender domain is not verified. No send was attempted; verify the approved sessionboard.namuh.co domain first.";
  }
  return "This workspace does not assume provider availability. A send can proceed only after an approved preview, and any provider failure is shown honestly.";
}

function messageFromError(error: unknown): string {
  if (error instanceof CommunicationApiError) {
    if (error.status === 403) return `Access denied: ${error.message}`;
    if (error.status === 404) return `Communication resource not found: ${error.message}`;
    if (error.code === "COMMUNICATION_UNAVAILABLE" || error.status === 503) {
      return `Provider unavailable: ${error.message}`;
    }
    return error.message;
  }
  return error instanceof Error
    ? error.message
    : "The communication request could not be completed.";
}
export async function loadCommunicationTemplates({
  read,
  signal,
  isCurrent,
  onLoaded,
  onError,
  onSettled,
}: Readonly<{
  read: () => Promise<readonly CommunicationTemplate[]>;
  signal: AbortSignal | undefined;
  isCurrent: () => boolean;
  onLoaded: (templates: readonly CommunicationTemplate[]) => void;
  onError: (message: string) => void;
  onSettled: () => void;
}>): Promise<void> {
  const canCommit = () => !signal?.aborted && isCurrent();
  try {
    const loaded = await read();
    if (canCommit()) onLoaded(loaded);
  } catch (reason) {
    if (canCommit() && !(reason instanceof DOMException && reason.name === "AbortError")) {
      onError(messageFromError(reason));
    }
  } finally {
    if (canCommit()) onSettled();
  }
}
export interface CommunicationTemplateReadKey {
  readonly api: CommunicationApi;
  readonly organizationId: string;
  readonly eventId: string;
}

export function createCommunicationTemplateReadCoordinator() {
  const coordinator = createScopedReadFlightCoordinator<
    CommunicationTemplateReadKey,
    readonly CommunicationTemplate[]
  >();
  return {
    acquire(key: CommunicationTemplateReadKey) {
      return coordinator.acquire(key, (signal) =>
        key.api.listTemplates(key.eventId, undefined, signal),
      );
    },
  };
}

function stateFromError(error: unknown): CommunicationProviderState | undefined {
  if (!(error instanceof CommunicationApiError)) return undefined;
  if (error.code === "COMMUNICATION_UNAVAILABLE" || error.status === 503) {
    return /domain|verif/iu.test(error.message) ? "domain-unverified" : "unavailable";
  }
  return undefined;
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : value;
}

function templateDraftFrom(template: CommunicationTemplate | undefined): TemplateDraft {
  return template === undefined
    ? {
        name: "",
        purpose: "organizer_group_email",
        subject: "",
        html: "<p>{{recipient.displayName}}</p>",
        text: "{{recipient.displayName}}",
        variables: [],
      }
    : {
        templateId: template.id,
        name: template.name,
        purpose: template.purpose,
        subject: template.subject,
        html: template.html,
        text: template.text,
        variables: template.variables,
      };
}

function latestTemplateForId(
  templates: readonly CommunicationTemplate[],
  templateId: string | undefined,
): CommunicationTemplate | undefined {
  if (templateId === undefined) return undefined;
  return templates
    .filter((template) => template.id === templateId)
    .reduce<CommunicationTemplate | undefined>(
      (latest, template) =>
        latest === undefined || template.version > latest.version ? template : latest,
      undefined,
    );
}
function TemplateEditor({
  selected,
  busy,
  onCreateTemplate,
  onCreateVersion,
  onApproveTemplate,
}: Readonly<{
  selected: CommunicationTemplate | undefined;
  busy: boolean;
  onCreateTemplate?: (input: TemplateDraft) => Promise<void>;
  onCreateVersion?: (input: TemplateDraft) => Promise<void>;
  onApproveTemplate?: (template: CommunicationTemplate) => Promise<void>;
}>) {
  const [draft, setDraft] = useState<TemplateDraft>(() => templateDraftFrom(selected));
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(templateDraftFrom(selected));
    setFormError(null);
  }, [selected]);

  function update<K extends keyof TemplateDraft>(key: K, value: TemplateDraft[K]): void {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (draft.name.trim().length === 0 || draft.subject.trim().length === 0) {
      setFormError("Template name and subject are required.");
      return;
    }
    if (draft.html.trim().length === 0 || draft.text.trim().length === 0) {
      setFormError("Provide both an HTML and a plain-text body.");
      return;
    }
    setFormError(null);
    if (draft.templateId === undefined) {
      if (onCreateTemplate !== undefined) await onCreateTemplate(draft);
    } else if (onCreateVersion !== undefined) {
      await onCreateVersion(draft);
    }
  }

  const sender = approvedSenderForPurpose(draft.purpose);
  return (
    <section style={cardStyle} aria-labelledby="template-editor-heading">
      <div style={rowStyle}>
        <div style={{ flex: "1 1 20rem" }}>
          <p style={mutedStyle}>Template authoring</p>
          <h2 id="template-editor-heading">
            {selected === undefined ? "Create an email template" : "Create a new template version"}
          </h2>
        </div>
        {selected !== undefined ? <span>Version {selected.version}</span> : null}
      </div>
      <p style={mutedStyle}>
        Templates are event-scoped and versioned. Only approved versions can be previewed or sent.
        HTML is rendered by the email provider; this workspace never executes it.
      </p>
      <form onSubmit={(event) => void submit(event)} style={{ display: "grid", gap: "0.9rem" }}>
        <div style={gridStyle}>
          <label style={fieldStyle}>
            <span>Template name</span>
            <input
              style={inputStyle}
              value={draft.name}
              onChange={(event) => update("name", event.currentTarget.value)}
              required
            />
          </label>
          <label style={fieldStyle}>
            <span>Purpose</span>
            <select
              style={inputStyle}
              value={draft.purpose}
              disabled={selected !== undefined}
              onChange={(event) =>
                update("purpose", event.currentTarget.value as CommunicationTemplatePurpose)
              }
            >
              {COMMUNICATION_TEMPLATE_PURPOSES.map((purpose) => (
                <option key={purpose} value={purpose}>
                  {formatCommunicationPurpose(purpose)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p style={mutedStyle}>
          Approved sender identity: <strong>{sender}</strong>. Sender identities cannot be entered
          manually.
        </p>
        <label style={fieldStyle}>
          <span>Subject</span>
          <input
            style={inputStyle}
            value={draft.subject}
            onChange={(event) => update("subject", event.currentTarget.value)}
            required
          />
        </label>
        <label style={fieldStyle}>
          <span>HTML body</span>
          <textarea
            style={inputStyle}
            rows={7}
            value={draft.html}
            onChange={(event) => update("html", event.currentTarget.value)}
            required
          />
        </label>
        <label style={fieldStyle}>
          <span>Plain-text body</span>
          <textarea
            style={inputStyle}
            rows={6}
            value={draft.text}
            onChange={(event) => update("text", event.currentTarget.value)}
            required
          />
        </label>
        <label style={fieldStyle}>
          <span>Variables (comma-separated)</span>
          <input
            style={inputStyle}
            value={draft.variables.join(", ")}
            onChange={(event) =>
              update(
                "variables",
                event.currentTarget.value
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean),
              )
            }
            placeholder="recipient.displayName, event.name"
          />
        </label>
        {formError !== null ? <p role="alert">{formError}</p> : null}
        <div style={rowStyle}>
          <button style={buttonStyle} type="submit" disabled={busy}>
            {busy ? "Saving…" : selected === undefined ? "Save draft template" : "Save new version"}
          </button>
          {selected !== undefined && selected.status !== "approved" ? (
            <button
              style={secondaryButtonStyle}
              type="button"
              disabled={busy}
              onClick={() =>
                onApproveTemplate === undefined ? undefined : void onApproveTemplate(selected)
              }
            >
              Approve version {selected.version}
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}

function RecipientPreview({ preview }: Readonly<{ preview: CommunicationPreview }>) {
  return (
    <>
      <div style={gridStyle}>
        <div>
          <span style={mutedStyle}>Audience</span>
          <strong style={{ display: "block" }}>
            {formatCommunicationAudience(preview.audience)}
          </strong>
        </div>
        <div>
          <span style={mutedStyle}>Approved template</span>
          <strong style={{ display: "block" }}>
            {preview.template.name} · v{preview.templateVersion}
          </strong>
        </div>
        <div>
          <span style={mutedStyle}>Recipient snapshot</span>
          <strong style={{ display: "block" }}>
            {preview.recipientCount} recipient{preview.recipientCount === 1 ? "" : "s"}
          </strong>
        </div>
        <div>
          <span style={mutedStyle}>Preview expires</span>
          <strong style={{ display: "block" }}>{formatTime(preview.expiresAt)}</strong>
        </div>
      </div>
      <p>
        Sender: <strong>{senderLabel(preview.template)}</strong>. The send uses this immutable
        recipient snapshot, not a live audience query.
      </p>
      {preview.recipientCount === 0 ? (
        <p role="alert">This approved audience has no recipients. Sending is disabled.</p>
      ) : null}
      <div style={{ overflowX: "auto" }}>
        <table>
          <caption>Recipients captured for this preview</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">Participant id</th>
            </tr>
          </thead>
          <tbody>
            {preview.recipients.map((recipient) => (
              <tr key={recipient.id}>
                <th scope="row">{recipient.displayName}</th>
                <td>{recipient.email}</td>
                <td>{recipient.participantId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: "grid", gap: "0.75rem" }}>
        <h3>Per-recipient email previews</h3>
        {preview.recipientPreviews.map((recipient) => (
          <article key={recipient.recipientId} style={cardStyle}>
            <h4>
              {recipient.displayName} · {recipient.email}
            </h4>
            <p>
              <strong>Subject:</strong> {recipient.subject}
            </p>
            <p style={mutedStyle}>Escaped HTML source (not executed):</p>
            <pre style={preStyle}>{escapeHtmlForPreview(recipient.html)}</pre>
            <p style={mutedStyle}>Plain-text body:</p>
            <pre
              style={{
                ...preStyle,
                background: "var(--color-canvas, #f5f6f9)",
                color: "inherit",
              }}
            >
              {recipient.text}
            </pre>
          </article>
        ))}
      </div>
    </>
  );
}

function DeliveryHistory({
  send,
  onRetryFailed,
  busy,
}: Readonly<{ send: CommunicationSend; onRetryFailed?: () => Promise<void>; busy: boolean }>) {
  const recipientById = new Map(send.recipients.map((recipient) => [recipient.id, recipient]));
  const failed = send.terminal && send.deliveries.some((delivery) => delivery.status === "failed");
  return (
    <section style={cardStyle} aria-labelledby="delivery-history-heading">
      <div style={rowStyle}>
        <div style={{ flex: "1 1 20rem" }}>
          <p style={mutedStyle}>Delivery record</p>
          <h2 id="delivery-history-heading">Per-recipient status and history</h2>
        </div>
        <span>{statusLabel(send.status)}</span>
      </div>
      <p>
        Send <code>{send.id}</code> · {send.recipientCount} recipient
        {send.recipientCount === 1 ? "" : "s"} · sender{" "}
        <strong>{senderLabel(send.template)}</strong>
      </p>
      <p role="status">
        {send.terminal ? "Terminal" : "In progress"} · {send.queuedCount} queued ·{" "}
        {send.deliveredCount} delivered · {send.failedCount} failed
      </p>
      <div style={{ overflowX: "auto" }}>
        <table>
          <caption>Delivery status for every recipient</caption>
          <thead>
            <tr>
              <th scope="col">Recipient</th>
              <th scope="col">Status</th>
              <th scope="col">Attempts</th>
              <th scope="col">Provider id</th>
              <th scope="col">Failure</th>
            </tr>
          </thead>
          <tbody>
            {send.deliveries.map((delivery) => {
              const recipient = recipientById.get(delivery.recipientId);
              return (
                <tr key={delivery.recipientId}>
                  <th scope="row">
                    {recipient?.displayName ?? delivery.email}
                    <br />
                    <small>{delivery.email}</small>
                  </th>
                  <td>{statusLabel(delivery.status)}</td>
                  <td>{delivery.attempts}</td>
                  <td>{delivery.providerMessageId ?? "—"}</td>
                  <td>{delivery.failureReason ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {failed && onRetryFailed !== undefined ? (
        <button
          style={secondaryButtonStyle}
          type="button"
          disabled={busy}
          onClick={() => void onRetryFailed()}
        >
          {busy ? "Retrying…" : "Retry failed recipients"}
        </button>
      ) : null}
      <h3>Audit history</h3>
      {send.history.length === 0 ? (
        <p style={mutedStyle}>No audit history has been returned.</p>
      ) : (
        <ol>
          {send.history.map((entry: CommunicationAuditEntry) => (
            <li key={entry.id}>
              {formatTime(entry.occurredAt)} · {entry.action}
              {entry.recipientId === null ? "" : ` · ${entry.recipientId}`}
            </li>
          ))}
        </ol>
      )}
      <details>
        <summary>View provider delivery events</summary>
        {send.deliveries.map((delivery: CommunicationDelivery) => (
          <div key={`${delivery.recipientId}-history`}>
            <h4>{recipientById.get(delivery.recipientId)?.displayName ?? delivery.email}</h4>
            {delivery.history.length === 0 ? (
              <p style={mutedStyle}>No provider events.</p>
            ) : (
              <ul>
                {delivery.history.map((entry) => (
                  <li key={entry.id}>
                    {formatTime(entry.occurredAt)} · {statusLabel(entry.status)}
                    {entry.reason === null ? "" : ` · ${entry.reason}`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </details>
    </section>
  );
}

export function CommunicationsWorkspaceView({
  eventId,
  organizationId,
  templates,
  preview = null,
  send = null,
  loading = false,
  busy = false,
  error = null,
  statusMessage = null,
  providerState = "unknown",
  selectedTemplateId = "",
  creatingTemplate = false,
  selectedAudience = "all_participants",
  onSelectTemplate,
  onStartNewTemplate,
  onSelectAudience,
  onCreateTemplate,
  onCreateVersion,
  onApproveTemplate,
  onPreview,
  onOpenSendConfirmation,
  onConfirmSend,
  onCloseSendConfirmation,
  sendConfirmationOpen = false,
  onRetryFailed,
}: CommunicationsWorkspaceViewProps) {
  const selected = latestTemplateForId(templates, selectedTemplateId) ?? templates[0];
  const selectedForEditor = creatingTemplate ? undefined : selected;
  const approvedGroupTemplates = templates
    .filter(
      (template) => template.purpose === "organizer_group_email" && template.status === "approved",
    )
    .reduce<CommunicationTemplate[]>((latest, template) => {
      const existingIndex = latest.findIndex((candidate) => candidate.id === template.id);
      const existing = existingIndex < 0 ? undefined : latest[existingIndex];
      if (existing === undefined) {
        latest.push(template);
        return latest;
      }
      if (template.version <= existing.version) return latest;
      latest[existingIndex] = template;
      return latest;
    }, []);

  const selectedPreviewTemplate =
    approvedGroupTemplates.find((template) => template.id === selectedTemplateId) ??
    approvedGroupTemplates[0];
  const effectivePreviewTemplateId = selectedPreviewTemplate?.id ?? "";
  return (
    <div style={pageStyle}>
      <a href="#communications-content" style={{ position: "absolute", left: "-10000px" }}>
        Skip to communications workspace
      </a>
      <div style={contentStyle}>
        <header style={{ ...cardStyle, marginBottom: "1rem" }}>
          <div style={rowStyle}>
            <div style={{ flex: "1 1 28rem" }}>
              <p style={mutedStyle}>
                Organizer · {organizationId} · event {eventId}
              </p>
              <h1>Operational communications</h1>
              <p style={mutedStyle}>
                Manage approved event email templates, preview a recipient snapshot, confirm the
                send, and inspect delivery history. This workspace does not send SMS, CRM, marketing
                campaigns, or analytics.
              </p>
            </div>
            <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
              <legend style={{ padding: 0, fontWeight: 700 }}>Email provider status</legend>
              <strong>{providerLabel(providerState)}</strong>
              <p style={mutedStyle}>{providerDescription(providerState)}</p>
            </fieldset>
          </div>
        </header>
        <main id="communications-content" tabIndex={-1} style={{ display: "grid", gap: "1rem" }}>
          {error !== null ? (
            <div role="alert" style={{ ...cardStyle, borderColor: "#b42318" }}>
              <strong>Communication action was not completed</strong>
              <p>{error}</p>
            </div>
          ) : null}
          <div role="status" aria-live="polite">
            {statusMessage}
          </div>
          {loading ? (
            <section style={cardStyle} role="status">
              <h2>Loading communication templates</h2>
              <p>Retrieving event-scoped approved and draft versions.</p>
            </section>
          ) : null}
          {!loading ? (
            <section style={cardStyle} aria-labelledby="templates-heading">
              <div style={rowStyle}>
                <div style={{ flex: "1 1 20rem" }}>
                  <p style={mutedStyle}>Event-scoped content</p>
                  <h2 id="templates-heading">Email templates</h2>
                </div>
                <span>
                  {templates.length} version{templates.length === 1 ? "" : "s"}
                </span>
                <button
                  style={secondaryButtonStyle}
                  type="button"
                  onClick={() => onStartNewTemplate?.()}
                  disabled={busy}
                >
                  New template
                </button>
              </div>
              {templates.length === 0 ? (
                <p>No communication templates exist for this event. Create a draft to begin.</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <caption>Event email template versions</caption>
                    <thead>
                      <tr>
                        <th scope="col">Template</th>
                        <th scope="col">Purpose</th>
                        <th scope="col">Version</th>
                        <th scope="col">Status</th>
                        <th scope="col">Approved sender</th>
                      </tr>
                    </thead>
                    <tbody>
                      {templates.map((template) => (
                        <tr key={`${template.id}-${template.version}`}>
                          <th scope="row">
                            <button
                              style={{ ...secondaryButtonStyle, padding: "0.3rem 0.45rem" }}
                              type="button"
                              onClick={() => onSelectTemplate?.(template.id)}
                            >
                              {template.name}
                            </button>
                          </th>
                          <td>{formatCommunicationPurpose(template.purpose)}</td>
                          <td>v{template.version}</td>
                          <td>{statusLabel(template.status)}</td>
                          <td>{senderLabel(template)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : null}
          {!loading ? (
            <TemplateEditor
              selected={selectedForEditor}
              busy={busy}
              {...(onCreateTemplate === undefined ? {} : { onCreateTemplate })}
              {...(onCreateVersion === undefined ? {} : { onCreateVersion })}
              {...(onApproveTemplate === undefined ? {} : { onApproveTemplate })}
            />
          ) : null}
          <section style={cardStyle} aria-labelledby="preview-heading">
            <div style={rowStyle}>
              <div style={{ flex: "1 1 20rem" }}>
                <p style={mutedStyle}>Human review required</p>
                <h2 id="preview-heading">Preview an approved event-recipient group</h2>
              </div>
              <span>Preview before send</span>
            </div>
            <p style={mutedStyle}>
              Only the approved organizer group email purpose can use this audience workflow. The
              server snapshots authorized event recipients and renders template variables with
              escaping.
            </p>
            <div style={gridStyle}>
              <label style={fieldStyle}>
                <span>Approved group template</span>
                <select
                  style={inputStyle}
                  value={effectivePreviewTemplateId}
                  onChange={(event) => onSelectTemplate?.(event.currentTarget.value)}
                  disabled={approvedGroupTemplates.length === 0 || busy}
                >
                  {approvedGroupTemplates.length === 0 ? (
                    <option value="">No approved group template</option>
                  ) : (
                    approvedGroupTemplates.map((template) => (
                      <option key={`${template.id}-${template.version}`} value={template.id}>
                        {template.name} · v{template.version}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label style={fieldStyle}>
                <span>Authorized recipient group</span>
                <select
                  style={inputStyle}
                  value={selectedAudience}
                  onChange={(event) =>
                    onSelectAudience?.(event.currentTarget.value as CommunicationAudience)
                  }
                  disabled={busy}
                >
                  {COMMUNICATION_AUDIENCES.map((audience) => (
                    <option key={audience} value={audience}>
                      {formatCommunicationAudience(audience)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ ...rowStyle, marginTop: "0.9rem" }}>
              <button
                style={buttonStyle}
                type="button"
                disabled={
                  busy || onPreview === undefined || effectivePreviewTemplateId.length === 0
                }
                onClick={() => (onPreview === undefined ? undefined : void onPreview())}
              >
                {busy ? "Preparing preview…" : "Preview recipients and email"}
              </button>
              {approvedGroupTemplates.length === 0 ? (
                <span style={mutedStyle}>
                  Create and approve an organizer group email template before previewing.
                </span>
              ) : null}
            </div>
            {preview !== null ? (
              <div style={{ display: "grid", gap: "1rem", marginTop: "1rem" }}>
                <RecipientPreview preview={preview} />
                <div style={rowStyle}>
                  <button
                    style={buttonStyle}
                    type="button"
                    disabled={
                      busy || preview.recipientCount === 0 || onOpenSendConfirmation === undefined
                    }
                    onClick={onOpenSendConfirmation}
                  >
                    Send to {preview.recipientCount} recipient
                    {preview.recipientCount === 1 ? "" : "s"}
                  </button>
                  <span style={mutedStyle}>
                    Sending is blocked until you explicitly confirm this snapshot.
                  </span>
                </div>
              </div>
            ) : (
              <p style={mutedStyle}>No preview has been created for this event.</p>
            )}
          </section>
          {send !== null ? (
            <DeliveryHistory
              send={send}
              busy={busy}
              {...(onRetryFailed === undefined ? {} : { onRetryFailed })}
            />
          ) : null}
        </main>
        {sendConfirmationOpen && preview !== null ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="send-confirmation-heading"
            style={{
              ...cardStyle,
              maxWidth: "42rem",
              margin: "1rem auto 0",
              borderColor: "var(--color-brand, #5065e8)",
            }}
          >
            <h2 id="send-confirmation-heading">Confirm operational email send</h2>
            <p>
              You are about to send <strong>{preview.subject}</strong> to the{" "}
              {formatCommunicationAudience(preview.audience)} snapshot of{" "}
              <strong>{preview.recipientCount}</strong> recipient
              {preview.recipientCount === 1 ? "" : "s"}.
            </p>
            <p>
              Approved sender: <strong>{senderLabel(preview.template)}</strong>. This action sends
              email only. Confirming repeats the same idempotent operation safely if the provider
              response is interrupted.
            </p>
            <div style={rowStyle}>
              <button
                style={secondaryButtonStyle}
                type="button"
                disabled={busy}
                onClick={onCloseSendConfirmation}
              >
                Keep preview
              </button>
              <button
                style={buttonStyle}
                type="button"
                disabled={busy}
                onClick={() => (onConfirmSend === undefined ? undefined : void onConfirmSend())}
              >
                {busy ? "Sending…" : "Confirm and send"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function CommunicationsWorkspace({
  eventId,
  organizationId,
  api: providedApi,
  initialTemplates,
  initialPreview = null,
  initialSend = null,
  providerState: initialProviderState = "unknown",
}: CommunicationsWorkspaceProps) {
  const api = useMemo(
    () => providedApi ?? createCommunicationApi("", organizationId),
    [organizationId, providedApi],
  );
  const [templates, setTemplates] = useState<readonly CommunicationTemplate[]>(
    initialTemplates ?? [],
  );
  const [preview, setPreview] = useState<CommunicationPreview | null>(initialPreview);
  const [send, setSend] = useState<CommunicationSend | null>(initialSend);
  const [selectedTemplateId, setSelectedTemplateId] = useState(initialTemplates?.[0]?.id ?? "");
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [selectedAudience, setSelectedAudience] =
    useState<CommunicationAudience>("all_participants");
  const [loading, setLoading] = useState(initialTemplates === undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [providerState, setProviderState] =
    useState<CommunicationProviderState>(initialProviderState);
  const [sendConfirmationOpen, setSendConfirmationOpen] = useState(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const templateLoadGenerationRef = useRef(0);
  const initialReadKey = useMemo(
    () => ({ api, organizationId, eventId }),
    [api, eventId, organizationId],
  );
  const initialReadCoordinatorRef = useRef<ReturnType<
    typeof createCommunicationTemplateReadCoordinator
  > | null>(null);
  if (initialReadCoordinatorRef.current === null) {
    initialReadCoordinatorRef.current = createCommunicationTemplateReadCoordinator();
  }
  const initialReadCoordinator = initialReadCoordinatorRef.current;

  const loadTemplates = useCallback(
    async (
      signal: AbortSignal | undefined,
      initialRead?: Promise<readonly CommunicationTemplate[]>,
    ) => {
      const generation = templateLoadGenerationRef.current + 1;
      templateLoadGenerationRef.current = generation;
      setLoading(true);
      setError(null);
      await loadCommunicationTemplates({
        read: () =>
          initialRead ??
          initialReadKey.api.listTemplates(initialReadKey.eventId, undefined, signal),
        signal,
        isCurrent: () => templateLoadGenerationRef.current === generation,
        onLoaded: (loaded) => {
          setTemplates(loaded);
          setSelectedTemplateId((current) =>
            loaded.some((template) => template.id === current) ? current : (loaded[0]?.id ?? ""),
          );
        },
        onError: setError,
        onSettled: () => setLoading(false),
      });
    },
    [initialReadKey],
  );

  useEffect(() => {
    if (initialTemplates !== undefined) return;
    setTemplates([]);
    setPreview(null);
    setSend(null);
    setSelectedTemplateId("");
    setCreatingTemplate(false);
    setSelectedAudience("all_participants");
    setStatusMessage(null);
    setSendConfirmationOpen(false);
    idempotencyKeyRef.current = null;

    const lease = initialReadCoordinator.acquire(initialReadKey);
    void loadTemplates(lease.signal, lease.promise);
    return () => {
      templateLoadGenerationRef.current += 1;
      lease.release();
    };
  }, [initialReadCoordinator, initialReadKey, initialTemplates, loadTemplates]);

  function replaceTemplate(next: CommunicationTemplate): void {
    setTemplates((current) => {
      const withoutVersion = current.filter(
        (template) => !(template.id === next.id && template.version === next.version),
      );
      return [...withoutVersion, next].sort(
        (left, right) => left.id.localeCompare(right.id) || left.version - right.version,
      );
    });
    setSelectedTemplateId(next.id);
    setCreatingTemplate(false);
  }

  async function saveTemplate(draft: TemplateDraft): Promise<void> {
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const next = await api.createTemplate({
        eventId,
        name: draft.name.trim(),
        purpose: draft.purpose,
        subject: draft.subject,
        html: draft.html,
        text: draft.text,
        variables: draft.variables,
      });
      replaceTemplate(next);
      setStatusMessage(`Draft template ${next.name} v${next.version} saved.`);
    } catch (reason) {
      setError(messageFromError(reason));
    } finally {
      setBusy(false);
    }
  }

  async function saveVersion(draft: TemplateDraft): Promise<void> {
    if (draft.templateId === undefined) return;
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const next = await api.createTemplateVersion({
        eventId,
        templateId: draft.templateId,
        subject: draft.subject,
        html: draft.html,
        text: draft.text,
        variables: draft.variables,
      });
      replaceTemplate(next);
      setStatusMessage(
        `Template ${next.name} v${next.version} saved as a draft. Approve it before previewing.`,
      );
    } catch (reason) {
      setError(messageFromError(reason));
    } finally {
      setBusy(false);
    }
  }

  async function approveTemplate(template: CommunicationTemplate): Promise<void> {
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const next = await api.approveTemplate({
        eventId,
        templateId: template.id,
        version: template.version,
      });
      replaceTemplate(next);
      setStatusMessage(`Template ${next.name} v${next.version} approved for event use.`);
    } catch (reason) {
      setError(messageFromError(reason));
    } finally {
      setBusy(false);
    }
  }

  async function createPreview(): Promise<void> {
    const approvedGroupTemplates = templates.filter(
      (candidate) =>
        candidate.purpose === "organizer_group_email" && candidate.status === "approved",
    );
    const template =
      latestTemplateForId(approvedGroupTemplates, selectedTemplateId) ??
      approvedGroupTemplates.reduce<CommunicationTemplate | undefined>(
        (latest, candidate) =>
          latest === undefined || candidate.version > latest.version ? candidate : latest,
        undefined,
      );
    if (template === undefined) {
      setError("Approve an organizer group email template before creating a recipient preview.");
      return;
    }
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    setSend(null);
    try {
      const next = await api.preview({
        eventId,
        purpose: "organizer_group_email",
        templateId: template.id,
        templateVersion: template.version,
        audience: selectedAudience,
        data: {},
      });
      setPreview(next);
      setStatusMessage(
        `Preview created with ${next.recipientCount} authorized recipient snapshot${next.recipientCount === 1 ? "" : "s"}.`,
      );
    } catch (reason) {
      setError(messageFromError(reason));
      const state = stateFromError(reason);
      if (state !== undefined) setProviderState(state);
    } finally {
      setBusy(false);
    }
  }

  function openSendConfirmation(): void {
    if (preview === null || preview.recipientCount === 0) return;
    idempotencyKeyRef.current ??= `web-${typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`;
    setSendConfirmationOpen(true);
    setError(null);
  }

  async function confirmSend(): Promise<void> {
    if (preview === null || preview.recipientCount === 0) return;
    const idempotencyKey = idempotencyKeyRef.current;
    if (idempotencyKey === null) {
      setError(
        "A send confirmation key could not be created. Reopen the confirmation and try again.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const next = await api.sendGroup({ eventId, previewId: preview.id, idempotencyKey });
      setSend(next);
      setSendConfirmationOpen(false);
      idempotencyKeyRef.current = null;
      setProviderState("available");
      setStatusMessage(
        `Send ${next.id}: ${next.deliveredCount} delivered, ${next.failedCount} failed, ${next.queuedCount} queued; ${next.terminal ? "terminal" : "still in progress"}.`,
      );
    } catch (reason) {
      setError(messageFromError(reason));
      const state = stateFromError(reason);
      if (state !== undefined) setProviderState(state);
    } finally {
      setBusy(false);
    }
  }

  async function retryFailed(): Promise<void> {
    if (send === null) return;
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const next = await api.retryFailed(eventId, send.id);
      setSend(next);
      setProviderState("available");
      setStatusMessage(
        `Retry result: ${next.deliveredCount} delivered, ${next.failedCount} failed, ${next.queuedCount} queued; ${next.terminal ? "terminal" : "still in progress"}.`,
      );
    } catch (reason) {
      setError(messageFromError(reason));
      const state = stateFromError(reason);
      if (state !== undefined) setProviderState(state);
    } finally {
      setBusy(false);
    }
  }

  const selectedTemplate = latestTemplateForId(templates, selectedTemplateId);
  return (
    <CommunicationsWorkspaceView
      eventId={eventId}
      organizationId={organizationId}
      templates={templates}
      preview={preview}
      send={send}
      loading={loading}
      busy={busy}
      error={error}
      statusMessage={statusMessage}
      providerState={providerState}
      creatingTemplate={creatingTemplate}
      selectedTemplateId={selectedTemplate?.id ?? selectedTemplateId}
      selectedAudience={selectedAudience}
      onSelectTemplate={(templateId) => {
        setCreatingTemplate(false);
        setSelectedTemplateId(templateId);
      }}
      onSelectAudience={setSelectedAudience}
      onStartNewTemplate={() => setCreatingTemplate(true)}
      onCreateTemplate={saveTemplate}
      onCreateVersion={saveVersion}
      onApproveTemplate={approveTemplate}
      onPreview={createPreview}
      onOpenSendConfirmation={openSendConfirmation}
      onConfirmSend={confirmSend}
      onCloseSendConfirmation={() => setSendConfirmationOpen(false)}
      sendConfirmationOpen={sendConfirmationOpen}
      onRetryFailed={retryFailed}
    />
  );
}
export const CommunicationWorkspace = CommunicationsWorkspace;
export const CommunicationWorkspaceView = CommunicationsWorkspaceView;
