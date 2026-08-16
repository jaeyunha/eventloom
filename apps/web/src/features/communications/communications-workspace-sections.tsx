"use client";

import {
  type FormEvent,
  type RefObject,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  COMMUNICATION_TEMPLATE_PURPOSES,
  type CommunicationAudience,
  type CommunicationAuditEntry,
  type CommunicationDelivery,
  type CommunicationPreview,
  type CommunicationSend,
  type CommunicationTemplate,
  type CommunicationTemplatePurpose,
  escapeHtmlForPreview,
  formatCommunicationAudience,
  formatCommunicationPurpose,
  type ReminderDispatch,
  type ReminderDispatchStatus,
  type ReminderFacts,
  type ReminderRun,
} from "./api";
import styles from "./communications-workspace.module.css";
import {
  communicationTemplateSelectionFromKey,
  communicationTemplateSelectionKey,
  messageFromError,
  type ReminderRunActionInput,
  type ReminderTruthState,
  type TemplateDraft,
} from "./communications-workspace-model";

function statusLabel(status: string): string {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function statusVariant(
  status:
    | CommunicationTemplate["status"]
    | CommunicationSend["status"]
    | CommunicationDelivery["status"]
    | ReminderDispatchStatus,
): "default" | "secondary" | "outline" | "destructive" {
  if (status === "failed" || status === "bounced" || status === "complained") return "destructive";
  if (status === "approved" || status === "provider_accepted" || status === "delivered") {
    return "secondary";
  }
  return "outline";
}

function StatusBadge({
  status,
}: Readonly<{
  status:
    | CommunicationTemplate["status"]
    | CommunicationSend["status"]
    | CommunicationDelivery["status"];
}>) {
  return <Badge variant={statusVariant(status)}>{statusLabel(status)}</Badge>;
}
function ReminderStatusBadge({ status }: Readonly<{ status: ReminderDispatchStatus }>) {
  return <Badge variant={statusVariant(status)}>{statusLabel(status)}</Badge>;
}

function senderLabel(template: CommunicationTemplate | CommunicationPreview["template"]): string {
  return template.sender;
}

function subscribeToCommunicationTime(): () => void {
  return () => undefined;
}

function browserCommunicationTime(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : value;
}

function ClientFormattedTime({ value }: Readonly<{ value: string }>) {
  return useSyncExternalStore(
    subscribeToCommunicationTime,
    () => browserCommunicationTime(value),
    () => value,
  );
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

function draftEqual(left: TemplateDraft, right: TemplateDraft): boolean {
  return (
    left.templateId === right.templateId &&
    left.name === right.name &&
    left.purpose === right.purpose &&
    left.subject === right.subject &&
    left.html === right.html &&
    left.text === right.text &&
    left.variables.join("\u0000") === right.variables.join("\u0000")
  );
}
type TemplateDraftChange = <K extends keyof TemplateDraft>(key: K, value: TemplateDraft[K]) => void;

function TemplateEditorForm({
  selected,
  draft,
  dirty,
  busy,
  formError,
  onDraftChange,
  onSubmit,
}: Readonly<{
  selected: CommunicationTemplate | undefined;
  draft: TemplateDraft;
  dirty: boolean;
  busy: boolean;
  formError: string | null;
  onDraftChange: TemplateDraftChange;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}>) {
  return (
    <CardContent>
      <div className={styles.persistedState} role="status" aria-live="polite">
        <span
          className={dirty ? styles.statusDotDirty : styles.statusDotPersisted}
          aria-hidden="true"
        />
        <strong>
          {dirty ? "Unsaved changes" : selected === undefined ? "New draft" : "Saved version"}
        </strong>
        <span className={styles.mutedText}>
          {dirty ? (
            "Save a new version before review."
          ) : selected === undefined ? (
            "Nothing has been saved yet."
          ) : (
            <>
              Saved version {selected.version} on <ClientFormattedTime value={selected.updatedAt} />
              .
            </>
          )}
        </span>
      </div>
      <form onSubmit={(event) => void onSubmit(event)} className={styles.formStack}>
        <div className={styles.formGrid}>
          <div className={styles.field}>
            <Label htmlFor="communication-template-name">Internal name</Label>
            <Input
              id="communication-template-name"
              value={draft.name}
              onChange={(event) => onDraftChange("name", event.currentTarget.value)}
              required
            />
          </div>
          <div className={styles.field}>
            <Label htmlFor="communication-template-purpose">Email type</Label>
            <select
              id="communication-template-purpose"
              className={styles.select}
              value={draft.purpose}
              disabled={selected !== undefined}
              onChange={(event) =>
                onDraftChange("purpose", event.currentTarget.value as CommunicationTemplatePurpose)
              }
            >
              {COMMUNICATION_TEMPLATE_PURPOSES.map((purpose) => (
                <option key={purpose} value={purpose}>
                  {formatCommunicationPurpose(purpose)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className={styles.mutedText}>
          For a one-off send from this page, use Organizer Group Email. Decision emails target
          accepted, waitlisted, or rejected participants; other email types belong to their
          automated workflows.
        </p>
        <p className={styles.mutedText}>
          {selected === undefined ? (
            "The sender address is assigned when you save this draft; you cannot change it here."
          ) : (
            <>
              Sender address: <strong>{senderLabel(selected)}</strong>. It is set by email type and
              cannot be changed here.
            </>
          )}
        </p>
        <div className={styles.field}>
          <Label htmlFor="communication-template-subject">Subject</Label>
          <Input
            id="communication-template-subject"
            value={draft.subject}
            onChange={(event) => onDraftChange("subject", event.currentTarget.value)}
            required
          />
        </div>
        <div className={styles.formGrid}>
          <div className={styles.field}>
            <Label htmlFor="communication-template-html">Email body (HTML)</Label>
            <Textarea
              id="communication-template-html"
              rows={8}
              value={draft.html}
              onChange={(event) => onDraftChange("html", event.currentTarget.value)}
              required
            />
          </div>
          <div className={styles.field}>
            <Label htmlFor="communication-template-text">Plain-text email body</Label>
            <Textarea
              id="communication-template-text"
              rows={8}
              value={draft.text}
              onChange={(event) => onDraftChange("text", event.currentTarget.value)}
              required
            />
          </div>
        </div>
        <div className={styles.field}>
          <Label htmlFor="communication-template-variables">Personalization fields</Label>
          <Input
            id="communication-template-variables"
            value={draft.variables.join(", ")}
            onChange={(event) =>
              onDraftChange(
                "variables",
                event.currentTarget.value
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean),
              )
            }
            placeholder="recipient.displayName, event.name"
          />
        </div>
        {formError !== null ? (
          <p className={styles.inlineError} role="alert">
            {formError}
          </p>
        ) : null}
        <div className={styles.actionRow}>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : selected === undefined ? "Save email draft" : "Save new version"}
          </Button>
          {selected !== undefined ? (
            <span className={styles.mutedText}>
              Saving creates a new version; it does not overwrite v{selected.version}.
            </span>
          ) : null}
        </div>
      </form>
    </CardContent>
  );
}

function TemplateApproval({
  selected,
  approvalDialogOpen,
  approvalError,
  approvalBusy,
  approvalTriggerRef,
  busy,
  onApproveTemplate,
  onApprovalDialogOpenChange,
  onConfirmApproval,
}: Readonly<{
  selected: CommunicationTemplate | undefined;
  approvalDialogOpen: boolean;
  approvalError: string | null;
  approvalBusy: boolean;
  busy: boolean;
  onApproveTemplate?: (template: CommunicationTemplate) => Promise<void>;
  approvalTriggerRef: RefObject<HTMLButtonElement | null>;
  onApprovalDialogOpenChange: (open: boolean) => void;
  onConfirmApproval: () => Promise<void>;
}>) {
  return (
    <>
      <span
        id="review-approve"
        className={styles.anchorTarget}
        aria-hidden="true"
        data-approval-dialog-state={approvalDialogOpen ? "open" : "closed"}
      />
      {selected !== undefined ? (
        <CardFooter className={styles.reviewFooter}>
          <div>
            <div className={styles.cardEyebrow}>Step 2 · Review and approve</div>
            <p className={styles.footerDescription}>
              Approval is a human gate. Review the sender, email type, subject, personalization
              fields, rendered sample, and what sending will do before approving this exact version.
            </p>
          </div>
          <Button
            ref={approvalTriggerRef}
            type="button"
            variant="outline"
            disabled={busy || onApproveTemplate === undefined || selected.status === "approved"}
            onClick={() => onApprovalDialogOpenChange(true)}
            data-template-id={selected.id}
            data-template-version={selected.version}
          >
            {selected.status === "approved"
              ? `Version ${selected.version} approved`
              : `Approve version ${selected.version}`}
          </Button>
        </CardFooter>
      ) : null}
      {selected !== undefined ? (
        <Dialog open={approvalDialogOpen} onOpenChange={onApprovalDialogOpenChange}>
          <DialogContent
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              approvalTriggerRef.current?.focus();
            }}
            className={styles.reviewDialog}
            aria-describedby="template-approval-description"
            data-approval-dialog="exact-version"
          >
            <DialogHeader>
              <DialogTitle>Review and approve exact email version {selected.version}</DialogTitle>
              <DialogDescription id="template-approval-description">
                Approval applies only to saved email <strong>{selected.id}</strong> version{" "}
                <strong>{selected.version}</strong>. The server requires this exact version for
                recipient preview and send.
              </DialogDescription>
            </DialogHeader>
            <dl className={styles.detailGrid}>
              <div>
                <dt>Saved email</dt>
                <dd>{selected.name}</dd>
              </div>
              <div>
                <dt>Exact version</dt>
                <dd>
                  {selected.id} · v{selected.version}
                </dd>
              </div>
              <div>
                <dt>Sender address</dt>
                <dd>{senderLabel(selected)}</dd>
              </div>
              <div>
                <dt>Email type</dt>
                <dd>{formatCommunicationPurpose(selected.purpose)}</dd>
              </div>
              <div>
                <dt>Subject</dt>
                <dd>{selected.subject}</dd>
              </div>
              <div>
                <dt>Personalization fields</dt>
                <dd>{selected.variables.length === 0 ? "None" : selected.variables.join(", ")}</dd>
              </div>
            </dl>
            <div className={styles.sampleGrid}>
              <div>
                <h3>Rendered HTML sample (escaped source)</h3>
                <pre className={styles.codeBlock}>{escapeHtmlForPreview(selected.html)}</pre>
              </div>
              <div>
                <h3>Rendered plain-text sample</h3>
                <pre className={styles.textBlock}>{selected.text}</pre>
              </div>
            </div>
            <Alert>
              <AlertTitle>Effect of approval</AlertTitle>
              <AlertDescription>
                Approving v{selected.version} makes this exact sender address, email type, subject,
                and body eligible for a server-generated recipient preview. It does not send email.
              </AlertDescription>
            </Alert>
            {approvalError !== null ? (
              <p className={styles.inlineError} role="alert">
                {approvalError}
              </p>
            ) : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={approvalBusy}>
                  Cancel review
                </Button>
              </DialogClose>
              <Button
                type="button"
                disabled={approvalBusy}
                onClick={() => void onConfirmApproval()}
              >
                {approvalBusy ? "Approving…" : `Approve exact version ${selected.version}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

function TemplateEditor({
  selected,
  busy,
  onCreateTemplate,
  onCreateVersion,
  onApproveTemplate,
  approvalDialogOpen: controlledApprovalDialogOpen,
  onApprovalDialogOpenChange,
}: Readonly<{
  selected: CommunicationTemplate | undefined;
  busy: boolean;
  onCreateTemplate?: (input: TemplateDraft) => Promise<void>;
  onCreateVersion?: (input: TemplateDraft) => Promise<void>;
  onApproveTemplate?: (template: CommunicationTemplate) => Promise<void>;
  approvalDialogOpen?: boolean;
  onApprovalDialogOpenChange?: (open: boolean) => void;
}>) {
  const approvalTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [draft, setDraft] = useState<TemplateDraft>(() => templateDraftFrom(selected));
  const [formError, setFormError] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [internalApprovalDialogOpen, setInternalApprovalDialogOpen] = useState(false);

  const persistedDraft = useMemo(() => templateDraftFrom(selected), [selected]);
  const dirty = !draftEqual(draft, persistedDraft);
  const approvalDialogOpen = controlledApprovalDialogOpen ?? internalApprovalDialogOpen;
  const setApprovalDialogOpen = (open: boolean) => {
    if (controlledApprovalDialogOpen === undefined) setInternalApprovalDialogOpen(open);
    onApprovalDialogOpenChange?.(open);
    if (!open) setApprovalError(null);
  };

  function update<K extends keyof TemplateDraft>(key: K, value: TemplateDraft[K]): void {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (draft.name.trim().length === 0 || draft.subject.trim().length === 0) {
      setFormError("Internal name and subject are required.");
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

  async function confirmApproval(): Promise<void> {
    if (selected === undefined || onApproveTemplate === undefined) return;
    setApprovalBusy(true);
    setApprovalError(null);
    try {
      await onApproveTemplate(selected);
      setApprovalDialogOpen(false);
    } catch (reason) {
      setApprovalError(messageFromError(reason));
    } finally {
      setApprovalBusy(false);
    }
  }

  return (
    <Card id="draft-template" className={styles.workflowCard}>
      <CardHeader>
        <div className={styles.cardEyebrow}>Step 1 · Write email</div>
        <div className={styles.cardHeadingRow}>
          <div>
            <CardTitle>
              {selected === undefined ? "Compose email" : "Create a new email version"}
            </CardTitle>
            <CardDescription>
              Write the subject and email content for this event. Saved emails are versioned so an
              approved version cannot change underneath a send. HTML and plain text are kept
              separate; HTML is shown as escaped source and is never executed here.
            </CardDescription>
          </div>
          {selected !== undefined ? (
            <div className={styles.versionSummary}>
              <span>Selected version</span>
              <strong>v{selected.version}</strong>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <TemplateEditorForm
        selected={selected}
        draft={draft}
        dirty={dirty}
        busy={busy}
        formError={formError}
        onDraftChange={update}
        onSubmit={submit}
      />
      <TemplateApproval
        selected={selected}
        approvalDialogOpen={approvalDialogOpen}
        approvalError={approvalError}
        approvalBusy={approvalBusy}
        busy={busy}
        {...(onApproveTemplate === undefined ? {} : { onApproveTemplate })}
        approvalTriggerRef={approvalTriggerRef}
        onApprovalDialogOpenChange={setApprovalDialogOpen}
        onConfirmApproval={confirmApproval}
      />
    </Card>
  );
}
function RecipientPreview({ preview }: Readonly<{ preview: CommunicationPreview }>) {
  return (
    <div className={styles.previewBody}>
      <div className={styles.detailGrid}>
        <div>
          <span className={styles.detailLabel}>Recipient group</span>
          <strong>{formatCommunicationAudience(preview.audience)}</strong>
        </div>
        <div>
          <span className={styles.detailLabel}>Approved email version</span>
          <strong>
            {preview.template.name} · v{preview.templateVersion}
          </strong>
          <span className={styles.mutedText}>{preview.templateId}</span>
        </div>
        <div>
          <span className={styles.detailLabel}>Sender address</span>
          <strong>{senderLabel(preview.template)}</strong>
        </div>
        <div>
          <span className={styles.detailLabel}>Recipient snapshot (fixed)</span>
          <strong>
            {preview.recipientCount} recipient{preview.recipientCount === 1 ? "" : "s"}
          </strong>
        </div>
        <div>
          <span className={styles.detailLabel}>Preview artifact</span>
          <strong>{preview.id}</strong>
        </div>
        <div>
          <span className={styles.detailLabel}>Generated</span>
          <strong>
            <ClientFormattedTime value={preview.createdAt} />
          </strong>
        </div>
        <div>
          <span className={styles.detailLabel}>Preview expires</span>
          <strong>
            <ClientFormattedTime value={preview.expiresAt} />
          </strong>
        </div>
      </div>
      <Alert>
        <AlertTitle>Server-generated preview</AlertTitle>
        <AlertDescription>
          The sender, recipient list, and rendered email below came from the server for exact
          version {preview.templateId} v{preview.templateVersion}. Sending uses this fixed snapshot,
          not a live audience query.
        </AlertDescription>
      </Alert>
      {preview.recipientCount === 0 ? (
        <Alert variant="destructive">
          <AlertTitle>No recipients</AlertTitle>
          <AlertDescription>
            This approved audience has no recipients. Sending is disabled.
          </AlertDescription>
        </Alert>
      ) : null}
      <details className={styles.disclosure} open>
        <summary>Recipient snapshot details ({preview.recipientCount})</summary>
        <div className={styles.tableWrap}>
          <Table>
            <TableCaption>Recipients captured for this immutable preview</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Name</TableHead>
                <TableHead scope="col">Email</TableHead>
                <TableHead scope="col">Participant id</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.recipients.map((recipient) => (
                <TableRow key={recipient.id}>
                  <TableHead scope="row">{recipient.displayName}</TableHead>
                  <TableCell>{recipient.email}</TableCell>
                  <TableCell>{recipient.participantId}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </details>
      <div className={styles.renderedOutput}>
        <div className={styles.sectionHeadingRow}>
          <h3>Rendered output · Per-recipient email previews</h3>
          <span className={styles.mutedText}>Server artifact · read only</span>
        </div>
        {preview.recipientPreviews.map((recipient) => (
          <Card key={recipient.recipientId} size="sm">
            <CardHeader>
              <CardTitle>
                {recipient.displayName} · {recipient.email}
              </CardTitle>
              <CardDescription>
                <strong>Subject:</strong> {recipient.subject}
              </CardDescription>
            </CardHeader>
            <CardContent className={styles.sampleGrid}>
              <div>
                <h4>Escaped HTML source (not executed)</h4>
                <pre className={styles.codeBlock}>{escapeHtmlForPreview(recipient.html)}</pre>
              </div>
              <div>
                <h4>Plain-text body</h4>
                <pre className={styles.textBlock}>{recipient.text}</pre>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function DeliveryHistory({
  send,
  onRetryFailed,
  busy,
}: Readonly<{ send: CommunicationSend; onRetryFailed?: () => Promise<void>; busy: boolean }>) {
  const recipientById = new Map(send.recipients.map((recipient) => [recipient.id, recipient]));
  const retryable =
    send.terminal &&
    send.deliveries.some(
      (delivery) => delivery.status === "failed" || delivery.status === "bounced",
    );
  const providerAcceptedCount = send.deliveries.filter(
    (delivery) => delivery.status === "provider_accepted",
  ).length;
  const bouncedCount = send.deliveries.filter((delivery) => delivery.status === "bounced").length;
  return (
    <Card className={styles.workflowCard}>
      <CardHeader>
        <div className={styles.cardEyebrow}>Step 4 · Track delivery</div>
        <div className={styles.cardHeadingRow}>
          <div>
            <CardTitle>Delivery status and send history</CardTitle>
            <CardDescription>
              See whether each recipient's email was accepted, delivered, failed, or bounced.
              Completed sends remain visible when a new email or recipient group invalidates an
              actionable preview.
            </CardDescription>
          </div>
          <StatusBadge status={send.status} />
        </div>
      </CardHeader>
      <CardContent className={styles.formStack}>
        <p>
          Send <code>{send.id}</code> · {send.recipientCount} recipient
          {send.recipientCount === 1 ? "" : "s"} · exact email {send.templateId} v
          {send.templateVersion} · preview artifact {send.previewId ?? "not recorded"} · sender
          address <strong>{senderLabel(send.template)}</strong>
        </p>
        <div className={styles.metricRow} role="status">
          <span>{send.terminal ? "Terminal" : "In progress"}</span>
          <span>{send.queuedCount} queued</span>
          <span>{send.deliveredCount} delivered</span>
          <span>{send.failedCount} failed</span>
          <span>{bouncedCount} bounced</span>
          {providerAcceptedCount > 0 ? (
            <span>{providerAcceptedCount} provider accepted</span>
          ) : null}
        </div>
        <details className={styles.disclosure} open>
          <summary>Recipient delivery details</summary>
          <div className={styles.tableWrap}>
            <Table>
              <TableCaption>Delivery status for every recipient</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Recipient</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col">Attempts</TableHead>
                  <TableHead scope="col">Provider id</TableHead>
                  <TableHead scope="col">Failure</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {send.deliveries.map((delivery) => {
                  const recipient = recipientById.get(delivery.recipientId);
                  return (
                    <TableRow key={delivery.recipientId}>
                      <TableHead scope="row">
                        {recipient?.displayName ?? delivery.email}
                        <br />
                        <small>{delivery.email}</small>
                      </TableHead>
                      <TableCell>
                        <StatusBadge status={delivery.status} />
                      </TableCell>
                      <TableCell>{delivery.attempts}</TableCell>
                      <TableCell>{delivery.providerMessageId ?? "—"}</TableCell>
                      <TableCell>{delivery.failureReason ?? "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </details>
        {retryable && onRetryFailed !== undefined ? (
          <Button
            variant="outline"
            type="button"
            disabled={busy}
            onClick={() => void onRetryFailed()}
          >
            {busy ? "Retrying…" : "Retry failed or bounced recipients"}
          </Button>
        ) : null}
        <div>
          <h3>Audit history</h3>
          {send.history.length === 0 ? (
            <p className={styles.mutedText}>No audit history has been returned.</p>
          ) : (
            <ol className={styles.auditList}>
              {send.history.map((entry: CommunicationAuditEntry) => {
                const auditAnchor = `audit-${entry.id}`;
                return (
                  <li key={entry.id} id={auditAnchor}>
                    <a href={`#${auditAnchor}`}>Audit {entry.id}</a> ·{" "}
                    <ClientFormattedTime value={entry.occurredAt} /> · {entry.action}
                    {entry.recipientId === null ? "" : ` · ${entry.recipientId}`}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
        <details className={styles.disclosure}>
          <summary>View provider delivery events</summary>
          {send.deliveries.map((delivery) => (
            <div key={`${delivery.recipientId}-history`} className={styles.providerEvents}>
              <h4>{recipientById.get(delivery.recipientId)?.displayName ?? delivery.email}</h4>
              {delivery.history.length === 0 ? (
                <p className={styles.mutedText}>No provider events.</p>
              ) : (
                <ul>
                  {delivery.history.map((entry) => (
                    <li key={entry.id}>
                      <ClientFormattedTime value={entry.occurredAt} /> · {statusLabel(entry.status)}
                      {entry.reason === null ? "" : ` · ${entry.reason}`}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </details>
      </CardContent>
    </Card>
  );
}
function reminderSubjectLabel(subject: ReminderDispatch["subject"]): string {
  return subject.type === "task"
    ? `Task ${subject.taskId}`
    : `Review assignment ${subject.reviewAssignmentId}`;
}

function reminderRunVariant(
  state: ReminderRun["state"],
): "default" | "secondary" | "outline" | "destructive" {
  if (state === "failed") return "destructive";
  if (state === "completed") return "secondary";
  return "outline";
}

function latestReminderRun(runs: readonly ReminderRun[]): ReminderRun | undefined {
  return runs.reduce<ReminderRun | undefined>(
    (latest, candidate) =>
      latest === undefined || candidate.updatedAt > latest.updatedAt ? candidate : latest,
    undefined,
  );
}

function ReminderStatusPanel({
  effectiveState,
  error,
  loading,
  busy,
  expectedAudienceRevision,
  manualDisabled,
  facts,
  onRunManualReminders,
  onRefreshDeliveryTruth,
}: Readonly<{
  effectiveState: ReminderTruthState;
  error: string | null;
  loading: boolean;
  busy: boolean;
  expectedAudienceRevision: string;
  manualDisabled: boolean;
  facts: ReminderFacts | null;
  onRunManualReminders?: (input: ReminderRunActionInput) => Promise<void>;
  onRefreshDeliveryTruth?: () => Promise<void>;
}>) {
  return (
    <>
      {effectiveState === "pending" ? (
        <Alert role="status">
          <AlertTitle>Reminder status is loading</AlertTitle>
          <AlertDescription>
            Loading event-scoped runs and dispatches. No provider outcome is assumed while this read
            is pending.
          </AlertDescription>
        </Alert>
      ) : null}
      {effectiveState === "conflict" ? (
        <Alert variant="destructive">
          <AlertTitle>Reminder audience conflict</AlertTitle>
          <AlertDescription>
            The audience revision changed before the reminder run could be confirmed. Reconcile the
            current audience revision before running manual reminders.
            {error === null ? null : ` ${error}`}
          </AlertDescription>
        </Alert>
      ) : null}
      {effectiveState === "stale" ? (
        <Alert>
          <AlertTitle>Reminder status is stale</AlertTitle>
          <AlertDescription>
            These facts may have changed in the provider or outbox. Refresh reminder status before
            treating a queued or provider-accepted state as terminal.
            {error === null ? null : ` ${error}`}
          </AlertDescription>
        </Alert>
      ) : null}
      {effectiveState === "unavailable" ? (
        <Alert variant="destructive">
          <AlertTitle>Reminder delivery status unavailable</AlertTitle>
          <AlertDescription>
            The reminder repository or delivery provider did not return authoritative facts. No
            delivery success is shown.
            {error === null ? null : ` ${error}`}
          </AlertDescription>
        </Alert>
      ) : null}
      {(effectiveState === "conflict" ||
        effectiveState === "stale" ||
        effectiveState === "unavailable") &&
      onRefreshDeliveryTruth !== undefined ? (
        <div className={styles.actionRow}>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void onRefreshDeliveryTruth()}
          >
            Refresh reminder status
          </Button>
        </div>
      ) : null}
      {effectiveState !== "pending" &&
      effectiveState !== "conflict" &&
      effectiveState !== "stale" &&
      effectiveState !== "unavailable" ? (
        <>
          <div className={styles.actionRow}>
            <Button
              type="button"
              variant="outline"
              disabled={busy || onRefreshDeliveryTruth === undefined}
              onClick={() =>
                onRefreshDeliveryTruth === undefined ? undefined : void onRefreshDeliveryTruth()
              }
            >
              {loading ? "Refreshing reminder status…" : "Refresh reminder status"}
            </Button>
            <Button
              type="button"
              disabled={manualDisabled}
              onClick={() =>
                onRunManualReminders === undefined
                  ? undefined
                  : void onRunManualReminders({ expectedAudienceRevision })
              }
            >
              {busy ? "Running manual reminders…" : "Run manual reminders"}
            </Button>
            {expectedAudienceRevision.length === 0 ? (
              <span className={styles.mutedText}>
                A server audience revision is required before a manual run.
              </span>
            ) : null}
          </div>
          {facts === null ? (
            <Alert>
              <AlertTitle>No reminder facts returned</AlertTitle>
              <AlertDescription>
                Select a task or review subject to fetch automatic and manual reminder facts.
              </AlertDescription>
            </Alert>
          ) : (
            <div className={styles.detailGrid}>
              <div>
                <span className={styles.detailLabel}>Last automatic reminder</span>
                <strong>
                  {facts.lastAutomatic === null
                    ? "No automatic run returned"
                    : `${facts.lastAutomatic.id} · ${statusLabel(facts.lastAutomatic.state)}`}
                </strong>
                {facts.lastAutomatic !== null ? (
                  <span className={styles.mutedText}>
                    <ClientFormattedTime value={facts.lastAutomatic.updatedAt} />
                  </span>
                ) : null}
              </div>
              <div>
                <span className={styles.detailLabel}>Last manual reminder</span>
                <strong>
                  {facts.lastManual === null
                    ? "No manual run returned"
                    : `${facts.lastManual.id} · ${statusLabel(facts.lastManual.state)}`}
                </strong>
                {facts.lastManual !== null ? (
                  <span className={styles.mutedText}>
                    <ClientFormattedTime value={facts.lastManual.updatedAt} />
                  </span>
                ) : null}
              </div>
              <div>
                <span className={styles.detailLabel}>Next eligible time</span>
                <strong>
                  {facts.nextEligibleAt === null ? (
                    "No next eligible time returned"
                  ) : (
                    <ClientFormattedTime value={facts.nextEligibleAt} />
                  )}
                </strong>
              </div>
              <div>
                <span className={styles.detailLabel}>Last outcome</span>
                <strong>
                  {facts.lastOutcome === null
                    ? "No dispatch outcome returned"
                    : statusLabel(facts.lastOutcome.status)}
                </strong>
                {facts.lastOutcome !== null ? (
                  <span className={styles.mutedText}>
                    {facts.lastOutcome.id} · {reminderSubjectLabel(facts.lastOutcome.subject)}
                  </span>
                ) : null}
              </div>
            </div>
          )}
          <p className={styles.mutedText}>
            Historical recipient and task/review subject snapshots are immutable. A new audience
            revision requires a new run and does not rewrite prior dispatches.
          </p>
        </>
      ) : null}
    </>
  );
}

function ReminderHistoryTables({
  eventId,
  runs,
  dispatches,
}: Readonly<{
  eventId: string;
  runs: readonly ReminderRun[];
  dispatches: readonly ReminderDispatch[];
}>) {
  return (
    <>
      {runs.length > 0 ? (
        <details className={styles.disclosure} open>
          <summary>Reminder runs ({runs.length})</summary>
          <div className={styles.tableWrap}>
            <Table>
              <TableCaption>Event-scoped automatic and manual reminder runs</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Run</TableHead>
                  <TableHead scope="col">Trigger</TableHead>
                  <TableHead scope="col">State</TableHead>
                  <TableHead scope="col">Candidates</TableHead>
                  <TableHead scope="col">Eligible</TableHead>
                  <TableHead scope="col">Queued</TableHead>
                  <TableHead scope="col">Skipped</TableHead>
                  <TableHead scope="col">Failed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableHead scope="row">
                      <a href={`#reminder-run-${run.id}`}>{run.id}</a>
                      <div className={styles.mutedText}>{run.audienceRevision}</div>
                    </TableHead>
                    <TableCell>{statusLabel(run.triggerType)}</TableCell>
                    <TableCell>
                      <Badge variant={reminderRunVariant(run.state)}>
                        {statusLabel(run.state)}
                      </Badge>
                    </TableCell>
                    <TableCell>{run.candidateCount}</TableCell>
                    <TableCell>{run.eligibleCount}</TableCell>
                    <TableCell>{run.queuedCount}</TableCell>
                    <TableCell>{run.skippedCount}</TableCell>
                    <TableCell>{run.failedCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </details>
      ) : null}
      {dispatches.length > 0 ? (
        <details className={styles.disclosure} open>
          <summary>Reminder dispatches ({dispatches.length})</summary>
          <div className={styles.tableWrap}>
            <Table>
              <TableCaption>
                Historical recipient snapshots and provider delivery states for event {eventId}
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Dispatch</TableHead>
                  <TableHead scope="col">Recipient snapshot</TableHead>
                  <TableHead scope="col">Subject snapshot</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col">Provider id</TableHead>
                  <TableHead scope="col">Cadence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dispatches.map((dispatch) => (
                  <TableRow key={dispatch.id} id={`reminder-dispatch-${dispatch.id}`}>
                    <TableHead scope="row">
                      <a href={`#reminder-dispatch-${dispatch.id}`}>{dispatch.id}</a>
                      <div className={styles.mutedText}>Run {dispatch.runId}</div>
                    </TableHead>
                    <TableCell>{dispatch.recipient}</TableCell>
                    <TableCell>{reminderSubjectLabel(dispatch.subject)}</TableCell>
                    <TableCell>
                      <ReminderStatusBadge status={dispatch.status} />
                    </TableCell>
                    <TableCell>{dispatch.providerMessageId ?? "—"}</TableCell>
                    <TableCell>{dispatch.cadenceWindow}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </details>
      ) : null}
    </>
  );
}

export function ReminderTruth({
  eventId,
  runs,
  dispatches,
  facts,
  state,
  error,
  loading,
  busy,
  onRunManualReminders,
  onRefreshDeliveryTruth,
}: Readonly<{
  eventId: string;
  runs: readonly ReminderRun[];
  dispatches: readonly ReminderDispatch[];
  facts: ReminderFacts | null;
  state: ReminderTruthState;
  error: string | null;
  loading: boolean;
  busy: boolean;
  onRunManualReminders?: (input: ReminderRunActionInput) => Promise<void>;
  onRefreshDeliveryTruth?: () => Promise<void>;
}>) {
  const effectiveState = loading ? "pending" : state;
  const latestRun = latestReminderRun(runs);
  const expectedAudienceRevision =
    latestRun?.audienceRevision ??
    facts?.lastAutomatic?.audienceRevision ??
    facts?.lastManual?.audienceRevision ??
    "";
  const manualDisabled =
    busy ||
    onRunManualReminders === undefined ||
    expectedAudienceRevision.length === 0 ||
    effectiveState === "pending" ||
    effectiveState === "conflict" ||
    effectiveState === "stale" ||
    effectiveState === "unavailable";

  return (
    <Card
      id="reminder-truth"
      className={styles.workflowCard}
      role="region"
      aria-labelledby="reminder-truth-heading"
    >
      <CardHeader>
        <div className={styles.cardEyebrow}>Reminders and delivery status</div>
        <div className={styles.cardHeadingRow}>
          <div>
            <CardTitle id="reminder-truth-heading">Automatic and manual reminders</CardTitle>
            <CardDescription>
              Automated operational workflows for event tasks and review assignments—not general
              marketing automations—report their provider delivery facts here. A queued reminder is
              not proof of delivery. Provider-accepted, delivered, failed, and bounced states come
              only from the reminder delivery record.
            </CardDescription>
          </div>
          <Badge
            variant={
              effectiveState === "unavailable" || effectiveState === "conflict"
                ? "destructive"
                : effectiveState === "ready"
                  ? "secondary"
                  : "outline"
            }
          >
            {effectiveState === "idle"
              ? "Not loaded"
              : effectiveState === "ready"
                ? "Status current"
                : effectiveState.charAt(0).toUpperCase() + effectiveState.slice(1)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className={styles.formStack}>
        <ReminderStatusPanel
          effectiveState={effectiveState}
          error={error}
          loading={loading}
          busy={busy}
          expectedAudienceRevision={expectedAudienceRevision}
          manualDisabled={manualDisabled}
          facts={facts}
          {...(onRunManualReminders === undefined ? {} : { onRunManualReminders })}
          {...(onRefreshDeliveryTruth === undefined ? {} : { onRefreshDeliveryTruth })}
        />
        <ReminderHistoryTables eventId={eventId} runs={runs} dispatches={dispatches} />
      </CardContent>
    </Card>
  );
}
function ReadinessItem({
  label,
  detail,
  ready,
}: Readonly<{ label: string; detail: string; ready: boolean }>) {
  return (
    <li className={styles.readinessItem}>
      <span
        className={ready ? styles.readinessIndicatorReady : styles.readinessIndicatorPending}
        aria-hidden="true"
      />
      <span>
        <strong>{label}</strong>
        <span className={styles.readinessDetail}>{detail}</span>
      </span>
      <Badge variant={ready ? "secondary" : "outline"}>{ready ? "Ready" : "Needed"}</Badge>
    </li>
  );
}

function BroadcastReadiness({
  approvedTemplateCount,
  selectedPreviewKey,
  preview,
  send,
  onCreateTemplate,
}: Readonly<{
  approvedTemplateCount: number;
  selectedPreviewKey: string;
  preview: CommunicationPreview | null;
  send: CommunicationSend | null;
  onCreateTemplate: () => void;
}>) {
  const approvedEmailReady = approvedTemplateCount > 0;
  const selectedEmailReady = selectedPreviewKey.length > 0;
  const previewReady = preview !== null;
  const deliveryRecorded = send !== null;
  const confirmationDetail =
    send !== null
      ? `Recorded · ${statusLabel(send.status)}`
      : previewReady
        ? "Outstanding · explicit confirmation is required"
        : "Outstanding · create a fixed preview first";

  return (
    <section className={styles.readiness} aria-labelledby="broadcast-readiness-heading">
      <div className={styles.readinessHeading}>
        <div>
          <div className={styles.cardEyebrow}>Send readiness</div>
          <h3 id="broadcast-readiness-heading">Ready to send?</h3>
          <p className={styles.mutedText}>
            Check the approved email, fixed recipient snapshot, and human confirmation before the
            irreversible send.
          </p>
        </div>
        {!approvedEmailReady ? (
          <Button type="button" onClick={onCreateTemplate}>
            Create email template
          </Button>
        ) : null}
      </div>
      <ul className={styles.readinessList}>
        <ReadinessItem
          label="Approved email"
          detail={
            approvedEmailReady
              ? `${approvedTemplateCount} approved version${approvedTemplateCount === 1 ? "" : "s"} available`
              : "No approved event email exists yet"
          }
          ready={approvedEmailReady}
        />
        <ReadinessItem
          label="Exact email selected"
          detail={
            selectedEmailReady
              ? "An approved version is selected for this send"
              : "Choose one approved version below"
          }
          ready={selectedEmailReady}
        />
        <ReadinessItem
          label="Fixed recipient preview"
          detail={
            previewReady
              ? `${preview.recipientCount} recipient${preview.recipientCount === 1 ? "" : "s"} captured by the server`
              : "Not generated yet"
          }
          ready={previewReady}
        />
        <ReadinessItem
          label="Send confirmation / delivery"
          detail={confirmationDetail}
          ready={deliveryRecorded}
        />
      </ul>
    </section>
  );
}

export function BroadcastComposer({
  approvedGroupTemplates,
  selectedPreviewKey,
  preview,
  send,
  selectedAudience,
  previewAudienceOptions,
  busy,
  sendConfirmationOpen,
  sendConfirmationTriggerRef,
  onSelectTemplate,
  onSelectAudience,
  onPreview,
  onOpenSendConfirmation,
  onRetryFailed,
  onCreateTemplate,
}: Readonly<{
  approvedGroupTemplates: readonly CommunicationTemplate[];
  selectedPreviewKey: string;
  preview: CommunicationPreview | null;
  send: CommunicationSend | null;
  selectedAudience: CommunicationAudience;
  previewAudienceOptions: readonly CommunicationAudience[];
  busy: boolean;
  sendConfirmationOpen: boolean;
  sendConfirmationTriggerRef: RefObject<HTMLButtonElement | null>;
  onSelectTemplate?: (templateId: string, templateVersion?: number) => void;
  onSelectAudience?: (audience: CommunicationAudience) => void;
  onPreview?: () => Promise<void>;
  onOpenSendConfirmation?: () => void;
  onRetryFailed?: () => Promise<void>;
  onCreateTemplate: () => void;
}>) {
  return (
    <>
      <BroadcastReadiness
        approvedTemplateCount={approvedGroupTemplates.length}
        selectedPreviewKey={selectedPreviewKey}
        preview={preview}
        send={send}
        onCreateTemplate={onCreateTemplate}
      />
      <Card
        id="preview-snapshot"
        className={styles.workflowCard}
        role="region"
        aria-labelledby="broadcast-heading"
      >
        <CardHeader>
          <div className={styles.cardEyebrow}>Step 1 · Choose email and recipients</div>
          <div className={styles.cardHeadingRow}>
            <div>
              <CardTitle id="broadcast-heading">Send a broadcast</CardTitle>
              <CardDescription>
                Select an approved email and authorized participant group. The server fixes the
                recipient list and renders each email before send.
              </CardDescription>
            </div>
            <Badge variant={preview === null ? "outline" : "secondary"}>
              {preview === null ? "Not generated" : "Snapshot ready"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className={styles.formStack}>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <Label htmlFor="approved-group-template">Approved email · exact version</Label>
              <select
                id="approved-group-template"
                className={styles.select}
                value={selectedPreviewKey}
                onChange={(event) => {
                  const selection = communicationTemplateSelectionFromKey(
                    event.currentTarget.value,
                  );
                  if (selection !== undefined)
                    onSelectTemplate?.(selection.templateId, selection.templateVersion);
                }}
                disabled={approvedGroupTemplates.length === 0 || busy}
              >
                <option value="">
                  {approvedGroupTemplates.length === 0
                    ? "No approved email available"
                    : "Select exact approved email version"}
                </option>
                {approvedGroupTemplates.map((template) => (
                  <option
                    key={communicationTemplateSelectionKey(template.id, template.version)}
                    value={communicationTemplateSelectionKey(template.id, template.version)}
                  >
                    {template.name} · v{template.version}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <Label htmlFor="authorized-recipient-group">Recipient group</Label>
              <select
                id="authorized-recipient-group"
                className={styles.select}
                value={selectedAudience}
                onChange={(event) =>
                  onSelectAudience?.(event.currentTarget.value as CommunicationAudience)
                }
                disabled={busy}
              >
                {previewAudienceOptions.map((audience) => (
                  <option key={audience} value={audience}>
                    {formatCommunicationAudience(audience)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className={styles.actionRow}>
            <Button
              type="button"
              disabled={busy || onPreview === undefined || selectedPreviewKey.length === 0}
              onClick={() => (onPreview === undefined ? undefined : void onPreview())}
            >
              {busy ? "Preparing preview…" : "Preview recipients and email"}
            </Button>
            {approvedGroupTemplates.length === 0 ? (
              <span className={styles.mutedText}>
                Create and approve an event email before choosing recipients and previewing.
              </span>
            ) : selectedPreviewKey.length === 0 ? (
              <span className={styles.mutedText}>
                Select one exact approved email version before previewing.
              </span>
            ) : null}
          </div>
          <span id="confirm-send" className={styles.anchorTarget} aria-hidden="true" />
          {preview !== null ? (
            <div className={styles.previewStack}>
              <div>
                <div className={styles.cardEyebrow}>Step 2 · Preview and review</div>
                <h3>Review the fixed recipient preview</h3>
                <p className={styles.mutedText}>
                  Confirm the approved email, recipient count, and rendered output before opening
                  the send confirmation.
                </p>
              </div>
              <RecipientPreview preview={preview} />
              <div
                className={styles.confirmPanel}
                data-confirmation-open={sendConfirmationOpen ? "true" : "false"}
              >
                <div>
                  <div className={styles.cardEyebrow}>Step 3 · Confirm send</div>
                  <p>
                    Sending is blocked until you explicitly confirm this exact recipient snapshot.
                  </p>
                </div>
                <Button
                  ref={sendConfirmationTriggerRef}
                  type="button"
                  disabled={
                    busy || preview.recipientCount === 0 || onOpenSendConfirmation === undefined
                  }
                  onClick={onOpenSendConfirmation}
                >
                  Send to {preview.recipientCount} recipient
                  {preview.recipientCount === 1 ? "" : "s"}
                </Button>
              </div>
            </div>
          ) : (
            <p className={styles.mutedText}>
              Choose an approved email and recipient group, then preview it before sending.
            </p>
          )}
        </CardContent>
      </Card>
      <span id="delivery-history" className={styles.anchorTarget} aria-hidden="true" />
      {send !== null ? (
        <DeliveryHistory
          send={send}
          busy={busy}
          {...(onRetryFailed === undefined ? {} : { onRetryFailed })}
        />
      ) : null}
    </>
  );
}

export function TemplateLibrary({
  templates,
  selectedForEditor,
  selectedTemplateId,
  selectedTemplateVersion,
  busy,
  onStartNewTemplate,
  onSelectTemplate,
  onCreateTemplate,
  onCreateVersion,
  onApproveTemplate,
  approvalDialogOpen,
  onApprovalDialogOpenChange,
}: Readonly<{
  templates: readonly CommunicationTemplate[];
  selectedForEditor: CommunicationTemplate | undefined;
  selectedTemplateId: string;
  selectedTemplateVersion: number | undefined;
  busy: boolean;
  onStartNewTemplate?: () => void;
  onSelectTemplate?: (templateId: string, templateVersion?: number) => void;
  onCreateTemplate?: (input: TemplateDraft) => Promise<void>;
  onCreateVersion?: (input: TemplateDraft) => Promise<void>;
  onApproveTemplate?: (template: CommunicationTemplate) => Promise<void>;
  approvalDialogOpen?: boolean;
  onApprovalDialogOpenChange?: (open: boolean) => void;
}>) {
  return (
    <>
      <Card
        className={styles.workflowCard}
        role="region"
        aria-labelledby="template-library-heading"
      >
        <CardHeader>
          <div className={styles.cardHeadingRow}>
            <div>
              <div className={styles.cardEyebrow}>Email library</div>
              <CardTitle id="template-library-heading">Saved emails</CardTitle>
              <CardDescription>
                Select the exact saved email version to edit or review. This workspace never chooses
                the latest version automatically.
              </CardDescription>
            </div>
            {templates.length > 0 ? (
              <Button variant="outline" type="button" onClick={onStartNewTemplate} disabled={busy}>
                Write a new email
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {templates.length === 0 ? (
            <p>
              No saved emails yet. Compose your first email below. Saving creates a draft only;
              after review and approval, Broadcasts lets you choose recipients, preview the exact
              email, confirm the send, and track delivery.
            </p>
          ) : (
            <div className={styles.tableWrap}>
              <Table>
                <TableCaption>Saved event email versions</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Saved email</TableHead>
                    <TableHead scope="col">Email type</TableHead>
                    <TableHead scope="col">Exact version</TableHead>
                    <TableHead scope="col">Status</TableHead>
                    <TableHead scope="col">Approved sender address</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((template) => {
                    const key = communicationTemplateSelectionKey(template.id, template.version);
                    const selectedKey = communicationTemplateSelectionKey(
                      selectedTemplateId,
                      selectedTemplateVersion ?? 0,
                    );
                    return (
                      <TableRow
                        key={key}
                        data-template-selection={key}
                        data-selected={selectedKey === key ? "true" : "false"}
                      >
                        <TableHead scope="row">
                          <Button
                            variant="link"
                            size="sm"
                            type="button"
                            onClick={() => onSelectTemplate?.(template.id, template.version)}
                            aria-label={`Select saved email ${template.name}, version ${template.version}`}
                          >
                            {template.name}
                          </Button>
                        </TableHead>
                        <TableCell>{formatCommunicationPurpose(template.purpose)}</TableCell>
                        <TableCell>v{template.version}</TableCell>
                        <TableCell>
                          <StatusBadge status={template.status} />
                        </TableCell>
                        <TableCell>{senderLabel(template)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      <TemplateEditor
        key={
          selectedForEditor === undefined
            ? "new"
            : `${selectedForEditor.id}:${selectedForEditor.version}`
        }
        selected={selectedForEditor}
        busy={busy}
        {...(onCreateTemplate === undefined ? {} : { onCreateTemplate })}
        {...(onCreateVersion === undefined ? {} : { onCreateVersion })}
        {...(onApproveTemplate === undefined ? {} : { onApproveTemplate })}
        {...(approvalDialogOpen === undefined ? {} : { approvalDialogOpen })}
        {...(onApprovalDialogOpenChange === undefined ? {} : { onApprovalDialogOpenChange })}
      />
    </>
  );
}

export function SendConfirmationDialog({
  preview,
  error,
  busy,
  sendConfirmationOpen,
  sendConfirmationTriggerRef,
  onCloseSendConfirmation,
  onConfirmSend,
}: Readonly<{
  preview: CommunicationPreview | null;
  error: string | null;
  busy: boolean;
  sendConfirmationOpen: boolean;
  sendConfirmationTriggerRef: RefObject<HTMLButtonElement | null>;
  onCloseSendConfirmation?: () => void;
  onConfirmSend?: () => Promise<boolean | undefined>;
}>) {
  return (
    <AlertDialog
      open={sendConfirmationOpen && preview !== null}
      onOpenChange={(open) => {
        if (!open) onCloseSendConfirmation?.();
      }}
    >
      {preview !== null ? (
        <AlertDialogContent
          className={styles.confirmDialog}
          data-confirmation-dialog="alert-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            sendConfirmationTriggerRef.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm event email send</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to send the server-rendered email subject{" "}
              <strong>{preview.subject}</strong> to the fixed{" "}
              {formatCommunicationAudience(preview.audience)} recipient group snapshot of{" "}
              <strong>{preview.recipientCount}</strong> recipient
              {preview.recipientCount === 1 ? "" : "s"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error !== null ? (
            <Alert variant="destructive">
              <AlertTitle>Send was not completed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <dl className={styles.detailGrid}>
            <div>
              <dt>Exact email version</dt>
              <dd>
                {preview.templateId} · v{preview.templateVersion}
              </dd>
            </div>
            <div>
              <dt>Approved sender address</dt>
              <dd>{senderLabel(preview.template)}</dd>
            </div>
            <div>
              <dt>Preview expiry</dt>
              <dd>
                <ClientFormattedTime value={preview.expiresAt} />
              </dd>
            </div>
          </dl>
          <p className={styles.mutedText}>
            This action sends email only. Confirming repeats the same idempotent operation safely if
            the provider response is interrupted. Provider failures remain visible; confirmation
            does not create fake success.
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep preview</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                if (onConfirmSend !== undefined) void onConfirmSend();
              }}
            >
              {busy ? "Sending…" : "Confirm and send"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      ) : null}
    </AlertDialog>
  );
}
