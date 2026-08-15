"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import { useOrganizerEventId } from "@/features/admin/organizer-event-workspace";
import { createScopedReadFlightCoordinator } from "@/lib/scoped-read-flight";
import {
  COMMUNICATION_AUDIENCES,
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
  type ReminderDispatch,
  type ReminderDispatchStatus,
  type ReminderFacts,
  type ReminderRun,
} from "./api";
import styles from "./communications-workspace.module.css";

export type CommunicationProviderState =
  | "unknown"
  | "available"
  | "unavailable"
  | "domain-unverified";
export type ReminderTruthState =
  | "idle"
  | "ready"
  | "pending"
  | "conflict"
  | "stale"
  | "unavailable";

export interface ReminderRunActionInput {
  readonly expectedAudienceRevision: string;
}

export interface CommunicationsWorkspaceProps {
  readonly eventId: string;
  readonly organizationId: string;
  readonly api?: CommunicationApi;
  readonly initialTemplates?: readonly CommunicationTemplate[];
  readonly initialPreview?: CommunicationPreview | null;
  readonly initialSend?: CommunicationSend | null;
  readonly providerState?: CommunicationProviderState;
  readonly initialReminderRuns?: readonly ReminderRun[];
  readonly initialReminderDispatches?: readonly ReminderDispatch[];
  readonly initialReminderFacts?: ReminderFacts | null;
}

export interface CommunicationTemplateSelection {
  readonly templateId: string;
  readonly templateVersion: number;
}

export interface CommunicationsWorkspaceViewProps {
  readonly eventId: string;
  readonly organizationId: string;
  readonly templates: readonly CommunicationTemplate[];
  readonly preview?: CommunicationPreview | null;
  readonly send?: CommunicationSend | null;
  readonly reminderRuns?: readonly ReminderRun[];
  readonly reminderDispatches?: readonly ReminderDispatch[];
  readonly reminderFacts?: ReminderFacts | null;
  readonly reminderState?: ReminderTruthState;
  readonly reminderError?: string | null;
  readonly reminderLoading?: boolean;
  readonly onRunManualReminders?: (input: ReminderRunActionInput) => Promise<void>;
  readonly onRefreshDeliveryTruth?: () => Promise<void>;
  readonly loading?: boolean;
  readonly busy?: boolean;
  readonly error?: string | null;
  readonly statusMessage?: string | null;
  readonly providerState?: CommunicationProviderState;
  readonly selectedTemplateId?: string;
  readonly selectedTemplateVersion?: number;
  readonly creatingTemplate?: boolean;
  readonly selectedAudience?: CommunicationAudience;
  readonly onSelectTemplate?: (templateId: string, templateVersion?: number) => void;
  readonly onStartNewTemplate?: () => void;
  readonly onSelectAudience?: (audience: CommunicationAudience) => void;
  readonly onCreateTemplate?: (input: TemplateDraft) => Promise<void>;
  readonly onCreateVersion?: (input: TemplateDraft) => Promise<void>;
  readonly onApproveTemplate?: (template: CommunicationTemplate) => Promise<void>;
  readonly onPreview?: () => Promise<void>;
  readonly onOpenSendConfirmation?: () => void;
  readonly onConfirmSend?: () => Promise<boolean | undefined>;
  readonly onCloseSendConfirmation?: () => void;
  readonly sendConfirmationOpen?: boolean;
  readonly onRetryFailed?: () => Promise<void>;
  /** Exposed for deterministic component tests; production uses the local dialog state. */
  readonly approvalDialogOpen?: boolean;
  readonly onApprovalDialogOpenChange?: (open: boolean) => void;
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

export function communicationTemplateSelectionKey(
  templateId: string,
  templateVersion: number,
): string {
  return `${encodeURIComponent(templateId)}:${templateVersion}`;
}

export function previewAudienceForTemplate(template: CommunicationTemplate): CommunicationAudience {
  if (template.purpose !== "decision") return "all_participants";
  const value = `${template.name} ${template.subject}`.toLowerCase();
  if (value.includes("waitlist")) return "waitlisted_participants";
  if (value.includes("reject") || value.includes("declin")) return "rejected_participants";
  return "accepted_participants";
}

export function communicationTemplateSelectionFromKey(
  value: string,
): CommunicationTemplateSelection | undefined {
  const separator = value.lastIndexOf(":");
  if (separator <= 0) return undefined;
  let templateId: string;
  try {
    templateId = decodeURIComponent(value.slice(0, separator));
  } catch {
    return undefined;
  }
  const templateVersion = Number(value.slice(separator + 1));
  if (
    templateId.trim().length === 0 ||
    !Number.isSafeInteger(templateVersion) ||
    templateVersion <= 0
  ) {
    return undefined;
  }
  return { templateId, templateVersion };
}

export function findCommunicationTemplate(
  templates: readonly CommunicationTemplate[],
  selection: CommunicationTemplateSelection | undefined,
): CommunicationTemplate | undefined {
  if (selection === undefined) return undefined;
  return templates.find(
    (template) =>
      template.id === selection.templateId && template.version === selection.templateVersion,
  );
}
export interface CommunicationPreviewActionState {
  readonly preview: CommunicationPreview | null;
  readonly sendConfirmationOpen: boolean;
  readonly idempotencyKey: string | null;
}

export function invalidateCommunicationPreviewState(
  _state: CommunicationPreviewActionState,
): CommunicationPreviewActionState {
  return {
    preview: null,
    sendConfirmationOpen: false,
    idempotencyKey: null,
  };
}

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
    return "The configured sender domain is not verified. No send was attempted; verify the server-configured sender domain first.";
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
function reminderTruthStateFromError(error: unknown): ReminderTruthState {
  if (error instanceof CommunicationApiError) {
    if (error.code === "COMMUNICATION_CONFLICT" || error.status === 409) return "conflict";
    if (error.code === "COMMUNICATION_UNAVAILABLE" || error.status === 503) {
      return "unavailable";
    }
  }
  return "stale";
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

function resolveEditorTemplate(
  templates: readonly CommunicationTemplate[],
  templateId: string | undefined,
  templateVersion: number | undefined,
): CommunicationTemplate | undefined {
  if (templateId === undefined || templateId.length === 0) return undefined;
  const candidates = templates.filter((template) => template.id === templateId);
  if (templateVersion !== undefined) {
    return candidates.find((template) => template.version === templateVersion);
  }
  // A missing version is only safe when the id has one version; never silently pick latest.
  return candidates.length === 1 ? candidates[0] : undefined;
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

  useEffect(() => {
    setDraft(templateDraftFrom(selected));
    setFormError(null);
    setApprovalError(null);
  }, [selected]);

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
        <div className={styles.cardEyebrow}>Step 1 · Draft template</div>
        <div className={styles.cardHeadingRow}>
          <div>
            <CardTitle>
              {selected === undefined
                ? "Create an email template"
                : "Create a new template version"}
            </CardTitle>
            <CardDescription>
              Event-scoped content is versioned. The editor keeps HTML and plain text separate; HTML
              is shown as escaped source and is never executed here.
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
      <CardContent>
        <div className={styles.persistedState} role="status" aria-live="polite">
          <span
            className={dirty ? styles.statusDotDirty : styles.statusDotPersisted}
            aria-hidden="true"
          />
          <strong>
            {dirty ? "Unsaved changes" : selected === undefined ? "New draft" : "Persisted version"}
          </strong>
          <span className={styles.mutedText}>
            {dirty
              ? "Save a new version before review."
              : selected === undefined
                ? "Nothing has been saved yet."
                : `Saved event version ${selected.version} on ${formatTime(selected.updatedAt)}.`}
          </span>
        </div>
        <form onSubmit={(event) => void submit(event)} className={styles.formStack}>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <Label htmlFor="communication-template-name">Template name</Label>
              <Input
                id="communication-template-name"
                value={draft.name}
                onChange={(event) => update("name", event.currentTarget.value)}
                required
              />
            </div>
            <div className={styles.field}>
              <Label htmlFor="communication-template-purpose">Purpose</Label>
              <select
                id="communication-template-purpose"
                className={styles.select}
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
            </div>
          </div>
          <p className={styles.mutedText}>
            {selected === undefined ? (
              "The server assigns the sender identity when this draft is saved."
            ) : (
              <>
                Server-assigned sender identity: <strong>{senderLabel(selected)}</strong>. Sender
                identities are controlled by purpose and cannot be entered manually.
              </>
            )}
          </p>
          <div className={styles.field}>
            <Label htmlFor="communication-template-subject">Subject</Label>
            <Input
              id="communication-template-subject"
              value={draft.subject}
              onChange={(event) => update("subject", event.currentTarget.value)}
              required
            />
          </div>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <Label htmlFor="communication-template-html">HTML body</Label>
              <Textarea
                id="communication-template-html"
                rows={8}
                value={draft.html}
                onChange={(event) => update("html", event.currentTarget.value)}
                required
              />
            </div>
            <div className={styles.field}>
              <Label htmlFor="communication-template-text">Plain-text body</Label>
              <Textarea
                id="communication-template-text"
                rows={8}
                value={draft.text}
                onChange={(event) => update("text", event.currentTarget.value)}
                required
              />
            </div>
          </div>
          <div className={styles.field}>
            <Label htmlFor="communication-template-variables">Required variables</Label>
            <Input
              id="communication-template-variables"
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
          </div>
          {formError !== null ? (
            <p className={styles.inlineError} role="alert">
              {formError}
            </p>
          ) : null}
          <div className={styles.actionRow}>
            <Button type="submit" disabled={busy}>
              {busy
                ? "Saving…"
                : selected === undefined
                  ? "Save draft template"
                  : "Save new version"}
            </Button>
            {selected !== undefined ? (
              <span className={styles.mutedText}>
                Saving creates a new version; it does not overwrite v{selected.version}.
              </span>
            ) : null}
          </div>
        </form>
      </CardContent>
      <span
        id="review-approve"
        className={styles.anchorTarget}
        aria-hidden="true"
        data-approval-dialog-state={approvalDialogOpen ? "open" : "closed"}
      />
      {selected !== undefined ? (
        <CardFooter className={styles.reviewFooter}>
          <div>
            <div className={styles.cardEyebrow}>Step 2 · Review and approve exact version</div>
            <p className={styles.footerDescription}>
              Approval is a human gate. Review sender, purpose, subject, required variables,
              rendered sample, and effect before approving this exact version.
            </p>
          </div>
          <Button
            ref={approvalTriggerRef}
            type="button"
            variant="outline"
            disabled={busy || onApproveTemplate === undefined || selected.status === "approved"}
            onClick={() => setApprovalDialogOpen(true)}
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
        <Dialog open={approvalDialogOpen} onOpenChange={setApprovalDialogOpen}>
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
              <DialogTitle>
                Review and approve exact template version {selected.version}
              </DialogTitle>
              <DialogDescription id="template-approval-description">
                Approval applies only to template <strong>{selected.id}</strong> version{" "}
                <strong>{selected.version}</strong>. The server will require this exact version for
                preview and send.
              </DialogDescription>
            </DialogHeader>
            <dl className={styles.detailGrid}>
              <div>
                <dt>Template</dt>
                <dd>{selected.name}</dd>
              </div>
              <div>
                <dt>Exact version</dt>
                <dd>
                  {selected.id} · v{selected.version}
                </dd>
              </div>
              <div>
                <dt>Sender</dt>
                <dd>{senderLabel(selected)}</dd>
              </div>
              <div>
                <dt>Purpose</dt>
                <dd>{formatCommunicationPurpose(selected.purpose)}</dd>
              </div>
              <div>
                <dt>Subject</dt>
                <dd>{selected.subject}</dd>
              </div>
              <div>
                <dt>Required variables</dt>
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
                Approving v{selected.version} makes this exact sender, purpose, subject, and body
                eligible for a server-generated recipient preview. It does not send email.
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
              <Button type="button" disabled={approvalBusy} onClick={() => void confirmApproval()}>
                {approvalBusy ? "Approving…" : `Approve exact version ${selected.version}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </Card>
  );
}

function RecipientPreview({ preview }: Readonly<{ preview: CommunicationPreview }>) {
  return (
    <div className={styles.previewBody}>
      <div className={styles.detailGrid}>
        <div>
          <span className={styles.detailLabel}>Audience</span>
          <strong>{formatCommunicationAudience(preview.audience)}</strong>
        </div>
        <div>
          <span className={styles.detailLabel}>Exact approved template</span>
          <strong>
            {preview.template.name} · v{preview.templateVersion}
          </strong>
          <span className={styles.mutedText}>{preview.templateId}</span>
        </div>
        <div>
          <span className={styles.detailLabel}>Sender</span>
          <strong>{senderLabel(preview.template)}</strong>
        </div>
        <div>
          <span className={styles.detailLabel}>Immutable recipient snapshot</span>
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
          <strong>{formatTime(preview.createdAt)}</strong>
        </div>
        <div>
          <span className={styles.detailLabel}>Preview expires</span>
          <strong>{formatTime(preview.expiresAt)}</strong>
        </div>
      </div>
      <Alert>
        <AlertTitle>Server-authoritative preview</AlertTitle>
        <AlertDescription>
          Sender, recipients, and rendered output below came from the server for exact version{" "}
          {preview.templateId} v{preview.templateVersion}. Sending uses this immutable snapshot, not
          a live audience query.
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
        <div className={styles.cardEyebrow}>Step 5 · Delivery history</div>
        <div className={styles.cardHeadingRow}>
          <div>
            <CardTitle>Per-recipient status and audit history</CardTitle>
            <CardDescription>
              Completed sends remain visible when a new template or audience invalidates an
              actionable preview.
            </CardDescription>
          </div>
          <StatusBadge status={send.status} />
        </div>
      </CardHeader>
      <CardContent className={styles.formStack}>
        <p>
          Send <code>{send.id}</code> · {send.recipientCount} recipient
          {send.recipientCount === 1 ? "" : "s"} · exact template {send.templateId} v
          {send.templateVersion} · preview artifact {send.previewId ?? "not recorded"} · sender{" "}
          <strong>{senderLabel(send.template)}</strong>
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
                    {formatTime(entry.occurredAt)} · {entry.action}
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
                      {formatTime(entry.occurredAt)} · {statusLabel(entry.status)}
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

function ReminderTruth({
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
        <div className={styles.cardEyebrow}>Reminder and delivery truth</div>
        <div className={styles.cardHeadingRow}>
          <div>
            <CardTitle id="reminder-truth-heading">Automatic and manual reminders</CardTitle>
            <CardDescription>
              Queue insertion is not delivery success. Provider-accepted, delivered, failed, and
              bounced states come only from the reminder delivery ledger.
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
                ? "Truth current"
                : effectiveState.charAt(0).toUpperCase() + effectiveState.slice(1)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className={styles.formStack}>
        {effectiveState === "pending" ? (
          <Alert role="status">
            <AlertTitle>Reminder truth pending</AlertTitle>
            <AlertDescription>
              Loading event-scoped runs and dispatches. No provider outcome is assumed while this
              read is pending.
            </AlertDescription>
          </Alert>
        ) : null}
        {effectiveState === "conflict" ? (
          <Alert variant="destructive">
            <AlertTitle>Reminder audience conflict</AlertTitle>
            <AlertDescription>
              The audience revision changed before the reminder run could be confirmed. Reconcile
              the current audience revision before running manual reminders.
              {error === null ? null : ` ${error}`}
            </AlertDescription>
          </Alert>
        ) : null}
        {effectiveState === "stale" ? (
          <Alert>
            <AlertTitle>Reminder truth is stale</AlertTitle>
            <AlertDescription>
              These facts may have changed in the provider or outbox. Refresh delivery truth before
              treating a queued or provider-accepted state as terminal.
              {error === null ? null : ` ${error}`}
            </AlertDescription>
          </Alert>
        ) : null}
        {effectiveState === "unavailable" ? (
          <Alert variant="destructive">
            <AlertTitle>Reminder delivery truth unavailable</AlertTitle>
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
              Refresh delivery truth
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
                {loading ? "Refreshing delivery truth…" : "Refresh delivery truth"}
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
                      {formatTime(facts.lastAutomatic.updatedAt)}
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
                      {formatTime(facts.lastManual.updatedAt)}
                    </span>
                  ) : null}
                </div>
                <div>
                  <span className={styles.detailLabel}>Next eligible time</span>
                  <strong>
                    {facts.nextEligibleAt === null
                      ? "No next eligible time returned"
                      : formatTime(facts.nextEligibleAt)}
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
      </CardContent>
    </Card>
  );
}

const workflowSteps = [
  ["draft-template", "Draft template"],
  ["review-approve", "Review and approve"],
  ["preview-snapshot", "Preview snapshot"],
  ["confirm-send", "Confirm send"],
  ["delivery-history", "Delivery history"],
  ["reminder-truth", "Reminder truth"],
] as const;

function WorkflowNavigation({
  hasPreview,
  hasSend,
}: Readonly<{ hasPreview: boolean; hasSend: boolean }>) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className={styles.workflowNavigation}>
      <nav className={styles.desktopWorkflow} aria-label="Communications workflow">
        <p className={styles.navEyebrow}>Workflow</p>
        <ol>
          {workflowSteps.map(([id, label], index) => (
            <li key={id}>
              <a href={`#${id}`}>
                <span>{index + 1}</span>
                {label}
              </a>
              {id === "preview-snapshot" && hasPreview ? (
                <Badge variant="secondary">Ready</Badge>
              ) : null}
              {id === "delivery-history" && hasSend ? (
                <Badge variant="secondary">Recorded</Badge>
              ) : null}
            </li>
          ))}
        </ol>
      </nav>
      <Collapsible open={mobileOpen} onOpenChange={setMobileOpen} className={styles.mobileWorkflow}>
        <CollapsibleTrigger asChild>
          <Button
            variant="outline"
            type="button"
            className={styles.mobileWorkflowTrigger}
            aria-label="Choose communications workflow section"
          >
            <span>Communications workflow</span>
            <span aria-hidden="true">{mobileOpen ? "−" : "+"}</span>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <nav aria-label="Mobile communications workflow">
            <ol className={styles.mobileWorkflowList}>
              {workflowSteps.map(([id, label], index) => (
                <li key={id}>
                  <a href={`#${id}`} onClick={() => setMobileOpen(false)}>
                    <span>{index + 1}</span>
                    {label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export function CommunicationsWorkspaceView({
  eventId,
  organizationId,
  templates,
  preview = null,
  send = null,
  reminderRuns = [],
  reminderDispatches = [],
  reminderFacts = null,
  reminderState = "idle",
  reminderError = null,
  reminderLoading = false,
  onRunManualReminders,
  onRefreshDeliveryTruth,
  loading = false,
  busy = false,
  error = null,
  statusMessage = null,
  providerState = "unknown",
  selectedTemplateId = "",
  selectedTemplateVersion,
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
  approvalDialogOpen,
  onApprovalDialogOpenChange,
}: CommunicationsWorkspaceViewProps) {
  const sendConfirmationTriggerRef = useRef<HTMLButtonElement | null>(null);
  const selected = creatingTemplate
    ? undefined
    : resolveEditorTemplate(templates, selectedTemplateId, selectedTemplateVersion);
  const selectedForEditor = creatingTemplate ? undefined : selected;
  const approvedGroupTemplates = templates
    .filter(
      (template) =>
        (template.purpose === "organizer_group_email" || template.purpose === "decision") &&
        template.status === "approved",
    )
    .sort((left, right) => left.id.localeCompare(right.id) || left.version - right.version);
  const selectedPreviewKey =
    selected !== undefined &&
    selected.status === "approved" &&
    (selected.purpose === "organizer_group_email" || selected.purpose === "decision")
      ? communicationTemplateSelectionKey(selected.id, selected.version)
      : "";
  const previewAudienceOptions =
    selected?.purpose === "decision"
      ? (["accepted_participants", "waitlisted_participants", "rejected_participants"] as const)
      : COMMUNICATION_AUDIENCES;

  return (
    <div className={styles.page}>
      <a href="#communications-content" className={styles.skipLink}>
        Skip to communications workspace
      </a>
      <div className={styles.content}>
        <header className={styles.header}>
          <div className={styles.headerMain}>
            <p className={styles.eyebrow}>
              Organizer · {organizationId} · event {eventId}
            </p>
            <h1>Operational communications</h1>
            <p className={styles.lede}>
              One explicit workflow for versioned email: draft, review and approve, preview the
              immutable recipient snapshot, confirm the send, and inspect delivery history. This
              workspace does not send SMS, CRM, marketing campaigns, or analytics.
            </p>
          </div>
          <details className={styles.providerDetails}>
            <summary>
              <span>Email provider</span>
              <Badge
                variant={
                  providerState === "available"
                    ? "secondary"
                    : providerState === "unavailable" || providerState === "domain-unverified"
                      ? "destructive"
                      : "outline"
                }
              >
                {providerLabel(providerState)}
              </Badge>
            </summary>
            <strong>{providerLabel(providerState)}</strong>
            <p>{providerDescription(providerState)}</p>
          </details>
        </header>
        <WorkflowNavigation hasPreview={preview !== null} hasSend={send !== null} />
        <main id="communications-content" tabIndex={-1} className={styles.main}>
          {error !== null ? (
            <Alert variant="destructive">
              <AlertTitle>Communication action was not completed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {statusMessage !== null ? (
            <div role="status" aria-live="polite" className={styles.statusMessage}>
              {statusMessage}
            </div>
          ) : null}
          {loading ? (
            <Card>
              <CardHeader>
                <CardTitle>Loading communication templates</CardTitle>
                <CardDescription>
                  Retrieving event-scoped approved and draft versions.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : null}
          {!loading ? (
            <Card
              className={styles.workflowCard}
              role="region"
              aria-labelledby="template-library-heading"
            >
              <CardHeader>
                <div className={styles.cardHeadingRow}>
                  <div>
                    <div className={styles.cardEyebrow}>Event-scoped content</div>
                    <CardTitle id="template-library-heading">Template versions</CardTitle>
                    <CardDescription>
                      Select a specific id and version. No control resolves a template id to latest
                      implicitly.
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    type="button"
                    onClick={onStartNewTemplate}
                    disabled={busy}
                  >
                    New template
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {templates.length === 0 ? (
                  <p>No communication templates exist for this event. Create a draft to begin.</p>
                ) : (
                  <div className={styles.tableWrap}>
                    <Table>
                      <TableCaption>Event email template versions</TableCaption>
                      <TableHeader>
                        <TableRow>
                          <TableHead scope="col">Template</TableHead>
                          <TableHead scope="col">Purpose</TableHead>
                          <TableHead scope="col">Exact version</TableHead>
                          <TableHead scope="col">Status</TableHead>
                          <TableHead scope="col">Approved sender</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {templates.map((template) => {
                          const key = communicationTemplateSelectionKey(
                            template.id,
                            template.version,
                          );
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
                                  aria-label={`Select ${template.name} version ${template.version}`}
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
          ) : null}
          {!loading ? (
            <TemplateEditor
              selected={selectedForEditor}
              busy={busy}
              {...(onCreateTemplate === undefined ? {} : { onCreateTemplate })}
              {...(onCreateVersion === undefined ? {} : { onCreateVersion })}
              {...(onApproveTemplate === undefined ? {} : { onApproveTemplate })}
              {...(approvalDialogOpen === undefined ? {} : { approvalDialogOpen })}
              {...(onApprovalDialogOpenChange === undefined ? {} : { onApprovalDialogOpenChange })}
            />
          ) : null}
          <Card
            id="preview-snapshot"
            className={styles.workflowCard}
            role="region"
            aria-labelledby="preview-heading"
          >
            <CardHeader>
              <div className={styles.cardEyebrow}>
                Step 3 · Preview immutable recipient snapshot
              </div>
              <div className={styles.cardHeadingRow}>
                <div>
                  <CardTitle id="preview-heading">Preview before send</CardTitle>
                  <CardDescription>
                    Only an approved organizer group email can use this audience workflow. The
                    server snapshots authorized recipients and renders variables with escaping.
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
                  <Label htmlFor="approved-group-template">
                    Approved group template · exact version
                  </Label>
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
                        ? "No approved group template"
                        : "Select exact approved version"}
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
                  <Label htmlFor="authorized-recipient-group">Authorized recipient group</Label>
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
                    Create and approve a group or decision template before previewing.
                  </span>
                ) : selectedPreviewKey.length === 0 ? (
                  <span className={styles.mutedText}>
                    Select one exact approved template version before previewing.
                  </span>
                ) : null}
              </div>
              <span id="confirm-send" className={styles.anchorTarget} aria-hidden="true" />
              {preview !== null ? (
                <div className={styles.previewStack}>
                  <RecipientPreview preview={preview} />
                  <div
                    className={styles.confirmPanel}
                    data-confirmation-open={sendConfirmationOpen ? "true" : "false"}
                  >
                    <div>
                      <div className={styles.cardEyebrow}>Step 4 · Confirm send</div>
                      <p>Sending is blocked until you explicitly confirm this exact snapshot.</p>
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
                <p className={styles.mutedText}>No preview has been created for this event.</p>
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
          <ReminderTruth
            eventId={eventId}
            runs={reminderRuns}
            dispatches={reminderDispatches}
            facts={reminderFacts}
            state={reminderState}
            error={reminderError}
            loading={reminderLoading}
            busy={busy}
            {...(onRunManualReminders === undefined ? {} : { onRunManualReminders })}
            {...(onRefreshDeliveryTruth === undefined ? {} : { onRefreshDeliveryTruth })}
          />
        </main>
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
                <AlertDialogTitle>Confirm operational email send</AlertDialogTitle>
                <AlertDialogDescription>
                  You are about to send the server-rendered subject{" "}
                  <strong>{preview.subject}</strong> to the immutable{" "}
                  {formatCommunicationAudience(preview.audience)} snapshot of{" "}
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
                  <dt>Exact template</dt>
                  <dd>
                    {preview.templateId} · v{preview.templateVersion}
                  </dd>
                </div>
                <div>
                  <dt>Approved sender</dt>
                  <dd>{senderLabel(preview.template)}</dd>
                </div>
                <div>
                  <dt>Preview expiry</dt>
                  <dd>{formatTime(preview.expiresAt)}</dd>
                </div>
              </dl>
              <p className={styles.mutedText}>
                This action sends email only. Confirming repeats the same idempotent operation
                safely if the provider response is interrupted. Provider failures remain visible;
                confirmation does not create fake success.
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
      </div>
    </div>
  );
}

export function CommunicationsWorkspace({
  eventId: fallbackEventId,
  organizationId,
  api: providedApi,
  initialTemplates,
  initialPreview = null,
  initialSend = null,
  initialReminderRuns,
  initialReminderDispatches,
  initialReminderFacts = null,
  providerState: initialProviderState = "unknown",
}: CommunicationsWorkspaceProps) {
  const eventId = useOrganizerEventId(fallbackEventId);
  const api = useMemo(
    () => providedApi ?? createCommunicationApi("", organizationId),
    [organizationId, providedApi],
  );
  const [templates, setTemplates] = useState<readonly CommunicationTemplate[]>(
    initialTemplates ?? [],
  );
  const [preview, setPreview] = useState<CommunicationPreview | null>(initialPreview);
  const [send, setSend] = useState<CommunicationSend | null>(initialSend);
  const [reminderRuns, setReminderRuns] = useState<readonly ReminderRun[]>(
    initialReminderRuns ?? [],
  );
  const [reminderDispatches, setReminderDispatches] = useState<readonly ReminderDispatch[]>(
    initialReminderDispatches ?? [],
  );
  const [reminderFacts, setReminderFacts] = useState<ReminderFacts | null>(initialReminderFacts);
  const [reminderState, setReminderState] = useState<ReminderTruthState>(
    initialReminderRuns !== undefined || initialReminderDispatches !== undefined ? "ready" : "idle",
  );
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    initialTemplates?.[0]?.id ?? initialPreview?.templateId ?? "",
  );
  const [selectedTemplateVersion, setSelectedTemplateVersion] = useState<number | undefined>(
    initialTemplates?.[0]?.version ?? initialPreview?.templateVersion,
  );
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [selectedAudience, setSelectedAudience] = useState<CommunicationAudience>(
    initialPreview?.audience ?? "all_participants",
  );
  const [loading, setLoading] = useState(initialTemplates === undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [providerState, setProviderState] =
    useState<CommunicationProviderState>(initialProviderState);
  const [sendConfirmationOpen, setSendConfirmationOpen] = useState(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const reminderIdempotencyKeyRef = useRef<string | null>(null);
  const templateLoadGenerationRef = useRef(0);
  const selectedTemplateSelectionRef = useRef<CommunicationTemplateSelection | undefined>(
    selectedTemplateId.length === 0 || selectedTemplateVersion === undefined
      ? undefined
      : { templateId: selectedTemplateId, templateVersion: selectedTemplateVersion },
  );
  selectedTemplateSelectionRef.current =
    selectedTemplateId.length === 0 || selectedTemplateVersion === undefined
      ? undefined
      : { templateId: selectedTemplateId, templateVersion: selectedTemplateVersion };
  const initialReadKey = useMemo(
    () => ({ api, organizationId, eventId }),
    [api, eventId, organizationId],
  );
  const initialReadCoordinatorRef = useRef<ReturnType<
    typeof createCommunicationTemplateReadCoordinator
  > | null>(null);
  if (initialReadCoordinatorRef.current === null)
    initialReadCoordinatorRef.current = createCommunicationTemplateReadCoordinator();
  const initialReadCoordinator = initialReadCoordinatorRef.current;

  const invalidatePreview = useCallback(() => {
    const next = invalidateCommunicationPreviewState({
      preview: null,
      sendConfirmationOpen: false,
      idempotencyKey: null,
    });
    setPreview(next.preview);
    setSendConfirmationOpen(next.sendConfirmationOpen);
    idempotencyKeyRef.current = next.idempotencyKey;
  }, []);

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
          const currentSelection = selectedTemplateSelectionRef.current;
          const exactCurrent =
            currentSelection !== undefined &&
            loaded.some(
              (template) =>
                template.id === currentSelection.templateId &&
                template.version === currentSelection.templateVersion,
            );
          if (!exactCurrent) {
            const first = loaded[0];
            setSelectedTemplateId(first?.id ?? "");
            setSelectedTemplateVersion(first?.version);
          }
        },
        onError: setError,
        onSettled: () => setLoading(false),
      });
    },
    [initialReadKey],
  );
  const refreshDeliveryTruth = useCallback(async () => {
    if (
      typeof api.listReminderRuns !== "function" ||
      typeof api.listReminderDispatches !== "function"
    ) {
      setReminderState("unavailable");
      setReminderError("Reminder delivery truth is not exposed by this API surface.");
      return;
    }
    setReminderState("pending");
    setReminderError(null);
    try {
      const [runs, dispatches] = await Promise.all([
        api.listReminderRuns(eventId),
        api.listReminderDispatches(eventId),
      ]);
      setReminderRuns(runs);
      setReminderDispatches(dispatches);
      setReminderState("ready");
    } catch (reason) {
      setReminderState(reminderTruthStateFromError(reason));
      setReminderError(messageFromError(reason));
    }
  }, [api, eventId]);

  useEffect(() => {
    if (initialTemplates !== undefined) return;
    setTemplates([]);
    setPreview(null);
    setSend(null);
    setSelectedTemplateId("");
    setSelectedTemplateVersion(undefined);
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
  useEffect(() => {
    if (initialReminderRuns !== undefined || initialReminderDispatches !== undefined) return;
    setReminderRuns([]);
    setReminderDispatches([]);
    void refreshDeliveryTruth();
  }, [initialReminderDispatches, initialReminderRuns, refreshDeliveryTruth]);

  function replaceTemplate(next: CommunicationTemplate): void {
    setTemplates((current) =>
      [
        ...current.filter(
          (template) => !(template.id === next.id && template.version === next.version),
        ),
        next,
      ].sort((left, right) => left.id.localeCompare(right.id) || left.version - right.version),
    );
    setSelectedTemplateId(next.id);
    setSelectedTemplateVersion(next.version);
    setCreatingTemplate(false);
    invalidatePreview();
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
      throw reason;
    } finally {
      setBusy(false);
    }
  }

  async function createPreview(): Promise<void> {
    const template = resolveEditorTemplate(templates, selectedTemplateId, selectedTemplateVersion);
    if (
      template === undefined ||
      (template.purpose !== "organizer_group_email" && template.purpose !== "decision") ||
      template.status !== "approved"
    ) {
      setError(
        "Select one exact approved group or decision template version before creating a recipient preview.",
      );
      return;
    }
    invalidatePreview();
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const audience =
        template.purpose === "decision" &&
        selectedAudience !== "accepted_participants" &&
        selectedAudience !== "waitlisted_participants" &&
        selectedAudience !== "rejected_participants"
          ? previewAudienceForTemplate(template)
          : selectedAudience;
      const next = await api.preview({
        eventId,
        purpose: template.purpose,
        templateId: template.id,
        templateVersion: template.version,
        audience,
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

  async function confirmSend(): Promise<boolean> {
    if (preview === null || preview.recipientCount === 0) return false;
    const idempotencyKey = idempotencyKeyRef.current;
    if (idempotencyKey === null) {
      setError(
        "A send confirmation key could not be created. Reopen the confirmation and try again.",
      );
      return false;
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
      return true;
    } catch (reason) {
      setError(messageFromError(reason));
      const state = stateFromError(reason);
      if (state !== undefined) setProviderState(state);
      return false;
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
  async function runManualReminders(input: ReminderRunActionInput): Promise<void> {
    if (typeof api.runManualReminders !== "function") {
      setReminderState("unavailable");
      setReminderError("Manual reminder runs are not exposed by this API surface.");
      return;
    }
    const expectedAudienceRevision = input.expectedAudienceRevision.trim();
    if (expectedAudienceRevision.length === 0) {
      setReminderState("conflict");
      setReminderError("A current audience revision is required before a manual run.");
      return;
    }
    reminderIdempotencyKeyRef.current ??= `web-reminder-${
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`
    }`;
    const idempotencyKey = reminderIdempotencyKeyRef.current;
    if (idempotencyKey === null) {
      setReminderState("unavailable");
      setReminderError("A reminder idempotency key could not be created.");
      return;
    }
    setBusy(true);
    setReminderState("pending");
    setReminderError(null);
    setStatusMessage(null);
    try {
      const next = await api.runManualReminders({
        eventId,
        idempotencyKey,
        expectedAudienceRevision,
      });
      setReminderRuns((current) => [...current.filter((run) => run.id !== next.id), next]);
      reminderIdempotencyKeyRef.current = null;
      setReminderState("ready");
      setStatusMessage(`Manual reminder run ${next.id} is ${statusLabel(next.state)}.`);
      await refreshDeliveryTruth();
    } catch (reason) {
      setReminderState(reminderTruthStateFromError(reason));
      setReminderError(messageFromError(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <CommunicationsWorkspaceView
      eventId={eventId}
      organizationId={organizationId}
      templates={templates}
      preview={preview}
      send={send}
      reminderRuns={reminderRuns}
      reminderDispatches={reminderDispatches}
      reminderFacts={reminderFacts}
      reminderState={reminderState}
      reminderError={reminderError}
      reminderLoading={reminderState === "pending"}
      onRunManualReminders={runManualReminders}
      onRefreshDeliveryTruth={refreshDeliveryTruth}
      loading={loading}
      busy={busy}
      error={error}
      statusMessage={statusMessage}
      providerState={providerState}
      creatingTemplate={creatingTemplate}
      selectedTemplateId={selectedTemplateId}
      {...(selectedTemplateVersion === undefined ? {} : { selectedTemplateVersion })}
      selectedAudience={selectedAudience}
      onSelectTemplate={(templateId, templateVersion) => {
        const selectionChanged =
          templateId !== selectedTemplateId || templateVersion !== selectedTemplateVersion;
        const template = templates.find(
          (candidate) => candidate.id === templateId && candidate.version === templateVersion,
        );
        setCreatingTemplate(false);
        setSelectedTemplateId(templateId);
        setSelectedTemplateVersion(templateVersion);
        if (template !== undefined) setSelectedAudience(previewAudienceForTemplate(template));
        if (selectionChanged) invalidatePreview();
      }}
      onSelectAudience={(audience) => {
        if (audience !== selectedAudience) invalidatePreview();
        setSelectedAudience(audience);
      }}
      onStartNewTemplate={() => {
        setCreatingTemplate(true);
        invalidatePreview();
      }}
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
