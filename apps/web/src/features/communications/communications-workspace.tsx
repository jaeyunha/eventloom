"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useOrganizerEventId } from "@/features/admin/organizer-event-workspace";
import { useNavigationDataCache } from "@/lib/navigation-data-cache-provider";
import {
  COMMUNICATION_AUDIENCES,
  COMMUNICATION_TEMPLATE_PURPOSES,
  type CommunicationApi,
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
import {
  type CommunicationProviderState,
  type CommunicationTemplateSelection,
  communicationTemplateSelectionFromKey,
  communicationTemplateSelectionKey,
  createCommunicationTemplateReadCoordinator,
  invalidateCommunicationPreviewState,
  loadCommunicationTemplates,
  messageFromError,
  previewAudienceForTemplate,
  type ReminderRunActionInput,
  type ReminderTruthState,
  reminderTruthStateFromError,
  stateFromError,
  type TemplateDraft,
} from "./communications-workspace-model";

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
export type CommunicationNavigationCacheResource = "templates" | "reminder-truth";

export interface CommunicationReminderTruthSnapshot {
  readonly runs: readonly ReminderRun[];
  readonly dispatches: readonly ReminderDispatch[];
  readonly facts: ReminderFacts | null;
}

function normalizeCommunicationScopeId(value: string): string {
  return value.trim();
}

export function communicationNavigationCacheKey(
  resource: CommunicationNavigationCacheResource,
  organizationId: string,
  eventId: string,
): string {
  const organization = normalizeCommunicationScopeId(organizationId);
  const event = normalizeCommunicationScopeId(eventId);
  return `organization:${organization}:event:${event}:communications:${resource}`;
}

export function communicationNavigationCacheTags(
  resource: CommunicationNavigationCacheResource,
  organizationId: string,
  eventId: string,
): readonly string[] {
  const organization = normalizeCommunicationScopeId(organizationId);
  const event = normalizeCommunicationScopeId(eventId);
  return [
    `organization:${organization}`,
    `event:${event}`,
    `communications:${event}`,
    `communications:${resource}:${event}`,
  ];
}

export type CommunicationsWorkspaceSection = "broadcasts" | "templates" | "reminders";

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
  readonly view?: CommunicationsWorkspaceSection;
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
type CommunicationStateUpdate<T> = T | ((current: T) => T);

function resolveCommunicationStateUpdate<T>(current: T, update: CommunicationStateUpdate<T>): T {
  return typeof update === "function" ? (update as (current: T) => T)(current) : update;
}

type CommunicationsTemplateState = {
  readonly templates: readonly CommunicationTemplate[];
  readonly preview: CommunicationPreview | null;
  readonly send: CommunicationSend | null;
  readonly selectedTemplateId: string;
  readonly selectedTemplateVersion: number | undefined;
  readonly creatingTemplate: boolean;
  readonly selectedAudience: CommunicationAudience;
};

type CommunicationsTemplateAction =
  | {
      readonly type: "templates-loaded";
      readonly templates: readonly CommunicationTemplate[];
    }
  | {
      readonly type: "set-templates";
      readonly value: CommunicationStateUpdate<readonly CommunicationTemplate[]>;
    }
  | { readonly type: "template-replaced"; readonly template: CommunicationTemplate }
  | { readonly type: "set-preview"; readonly preview: CommunicationPreview | null }
  | { readonly type: "set-send"; readonly send: CommunicationSend | null }
  | {
      readonly type: "set-selected-template-id";
      readonly value: CommunicationStateUpdate<string>;
    }
  | {
      readonly type: "set-selected-template-version";
      readonly value: CommunicationStateUpdate<number | undefined>;
    }
  | {
      readonly type: "select-template";
      readonly templateId: string;
      readonly templateVersion: number | undefined;
    }
  | { readonly type: "set-creating-template"; readonly creating: boolean }
  | { readonly type: "set-audience"; readonly audience: CommunicationAudience }
  | { readonly type: "invalidate-preview" };

function sortCommunicationTemplates(
  templates: readonly CommunicationTemplate[],
): readonly CommunicationTemplate[] {
  return [...templates].sort(
    (left, right) => left.id.localeCompare(right.id) || left.version - right.version,
  );
}

function communicationsTemplateReducer(
  state: CommunicationsTemplateState,
  action: CommunicationsTemplateAction,
): CommunicationsTemplateState {
  switch (action.type) {
    case "templates-loaded": {
      const currentSelectionIsPresent =
        state.selectedTemplateId.length > 0 &&
        state.selectedTemplateVersion !== undefined &&
        action.templates.some(
          (template) =>
            template.id === state.selectedTemplateId &&
            template.version === state.selectedTemplateVersion,
        );
      const first = action.templates[0];
      return {
        ...state,
        templates: action.templates,
        ...(currentSelectionIsPresent
          ? {}
          : {
              selectedTemplateId: first?.id ?? "",
              selectedTemplateVersion: first?.version,
            }),
      };
    }
    case "set-templates":
      return {
        ...state,
        templates: resolveCommunicationStateUpdate(state.templates, action.value),
      };
    case "template-replaced":
      return {
        ...state,
        templates: sortCommunicationTemplates([
          ...state.templates.filter(
            (template) =>
              !(template.id === action.template.id && template.version === action.template.version),
          ),
          action.template,
        ]),
        preview: null,
        selectedTemplateId: action.template.id,
        selectedTemplateVersion: action.template.version,
        creatingTemplate: false,
      };
    case "set-preview":
      return { ...state, preview: action.preview };
    case "set-send":
      return { ...state, send: action.send };
    case "set-selected-template-id":
      return {
        ...state,
        selectedTemplateId: resolveCommunicationStateUpdate(state.selectedTemplateId, action.value),
      };
    case "set-selected-template-version":
      return {
        ...state,
        selectedTemplateVersion: resolveCommunicationStateUpdate(
          state.selectedTemplateVersion,
          action.value,
        ),
      };
    case "select-template":
      return {
        ...state,
        selectedTemplateId: action.templateId,
        selectedTemplateVersion: action.templateVersion,
        creatingTemplate: false,
      };
    case "set-creating-template":
      return { ...state, creatingTemplate: action.creating };
    case "set-audience":
      return { ...state, selectedAudience: action.audience };
    case "invalidate-preview":
      return { ...state, preview: null };
  }
}

type CommunicationsReminderState = {
  readonly runs: readonly ReminderRun[];
  readonly dispatches: readonly ReminderDispatch[];
  readonly facts: ReminderFacts | null;
  readonly state: ReminderTruthState;
  readonly error: string | null;
};

type CommunicationsReminderAction =
  | { readonly type: "refresh-start" }
  | {
      readonly type: "snapshot-loaded";
      readonly snapshot: CommunicationReminderTruthSnapshot;
    }
  | { readonly type: "load-failed"; readonly state: ReminderTruthState; readonly error: string }
  | { readonly type: "run-recorded"; readonly run: ReminderRun }
  | { readonly type: "set-runs"; readonly runs: readonly ReminderRun[] }
  | { readonly type: "set-dispatches"; readonly dispatches: readonly ReminderDispatch[] }
  | { readonly type: "set-facts"; readonly facts: ReminderFacts | null }
  | { readonly type: "set-state"; readonly state: ReminderTruthState }
  | { readonly type: "set-error"; readonly error: string | null };

function communicationsReminderReducer(
  state: CommunicationsReminderState,
  action: CommunicationsReminderAction,
): CommunicationsReminderState {
  switch (action.type) {
    case "refresh-start":
      return { ...state, state: "pending", error: null };
    case "snapshot-loaded":
      return {
        runs: action.snapshot.runs,
        dispatches: action.snapshot.dispatches,
        facts: action.snapshot.facts,
        state: "ready",
        error: null,
      };
    case "load-failed":
      return { ...state, state: action.state, error: action.error };
    case "run-recorded":
      return {
        ...state,
        runs: [...state.runs.filter((run) => run.id !== action.run.id), action.run],
        state: "ready",
        error: null,
      };
    case "set-runs":
      return { ...state, runs: action.runs };
    case "set-dispatches":
      return { ...state, dispatches: action.dispatches };
    case "set-facts":
      return { ...state, facts: action.facts };
    case "set-state":
      return { ...state, state: action.state };
    case "set-error":
      return { ...state, error: action.error };
  }
}

type CommunicationsUiState = {
  readonly loading: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly statusMessage: string | null;
  readonly providerState: CommunicationProviderState;
  readonly sendConfirmationOpen: boolean;
};

type CommunicationsUiAction =
  | { readonly type: "set-loading"; readonly value: CommunicationStateUpdate<boolean> }
  | { readonly type: "set-busy"; readonly value: CommunicationStateUpdate<boolean> }
  | { readonly type: "set-error"; readonly value: CommunicationStateUpdate<string | null> }
  | {
      readonly type: "set-status-message";
      readonly value: CommunicationStateUpdate<string | null>;
    }
  | {
      readonly type: "set-provider-state";
      readonly value: CommunicationStateUpdate<CommunicationProviderState>;
    }
  | {
      readonly type: "set-send-confirmation-open";
      readonly value: CommunicationStateUpdate<boolean>;
    };

function communicationsUiReducer(
  state: CommunicationsUiState,
  action: CommunicationsUiAction,
): CommunicationsUiState {
  switch (action.type) {
    case "set-loading":
      return { ...state, loading: resolveCommunicationStateUpdate(state.loading, action.value) };
    case "set-busy":
      return { ...state, busy: resolveCommunicationStateUpdate(state.busy, action.value) };
    case "set-error":
      return { ...state, error: resolveCommunicationStateUpdate(state.error, action.value) };
    case "set-status-message":
      return {
        ...state,
        statusMessage: resolveCommunicationStateUpdate(state.statusMessage, action.value),
      };
    case "set-provider-state":
      return {
        ...state,
        providerState: resolveCommunicationStateUpdate(state.providerState, action.value),
      };
    case "set-send-confirmation-open":
      return {
        ...state,
        sendConfirmationOpen: resolveCommunicationStateUpdate(
          state.sendConfirmationOpen,
          action.value,
        ),
      };
  }
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
                Saved version {selected.version} on{" "}
                <ClientFormattedTime value={selected.updatedAt} />.
              </>
            )}
          </span>
        </div>
        <form onSubmit={(event) => void submit(event)} className={styles.formStack}>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <Label htmlFor="communication-template-name">Internal name</Label>
              <Input
                id="communication-template-name"
                value={draft.name}
                onChange={(event) => update("name", event.currentTarget.value)}
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
            For a one-off send from this page, use Organizer Group Email. Decision emails target
            accepted, waitlisted, or rejected participants; other email types belong to their
            automated workflows.
          </p>
          <p className={styles.mutedText}>
            {selected === undefined ? (
              "The sender address is assigned when you save this draft; you cannot change it here."
            ) : (
              <>
                Sender address: <strong>{senderLabel(selected)}</strong>. It is set by email type
                and cannot be changed here.
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
              <Label htmlFor="communication-template-html">Email body (HTML)</Label>
              <Textarea
                id="communication-template-html"
                rows={8}
                value={draft.html}
                onChange={(event) => update("html", event.currentTarget.value)}
                required
              />
            </div>
            <div className={styles.field}>
              <Label htmlFor="communication-template-text">Plain-text email body</Label>
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
            <Label htmlFor="communication-template-variables">Personalization fields</Label>
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
        {effectiveState === "pending" ? (
          <Alert role="status">
            <AlertTitle>Reminder status is loading</AlertTitle>
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

export function CommunicationsWorkspaceView({
  eventId,
  view,
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
  const [activeView, setActiveView] = useState<CommunicationsWorkspaceSection>(
    view ?? "broadcasts",
  );
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
  const handleViewChange = (value: string): void => {
    if (value === "broadcasts" || value === "templates" || value === "reminders") {
      setActiveView(value);
    }
  };

  return (
    <div className={styles.page}>
      <a href="#communications-content" className={styles.skipLink}>
        Skip to event email workspace
      </a>
      <div className={styles.content}>
        <header className={styles.header}>
          <div className={styles.headerMain}>
            <p className={styles.eyebrow}>Communications</p>
            <h1>Event communications</h1>
            <p className={styles.lede}>
              Send one-off event broadcasts, manage reusable approved templates, and monitor
              automated task/review reminders. Each job has its own workspace. Every broadcast uses
              an approved email, a fixed server-generated recipient preview, and explicit human
              confirmation.
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
                <CardTitle>Loading saved emails</CardTitle>
                <CardDescription>Loading saved emails for this event.</CardDescription>
              </CardHeader>
            </Card>
          ) : null}
          <Tabs value={activeView} onValueChange={handleViewChange} className={styles.tabs}>
            <TabsList className={styles.tabList} aria-label="Communications views">
              <TabsTrigger value="broadcasts" className={styles.tabTrigger}>
                <span className={styles.tabTriggerLabel}>Broadcasts</span>
                <span className={styles.tabTriggerDescription}>Send one-off event email</span>
              </TabsTrigger>
              <TabsTrigger value="templates" className={styles.tabTrigger}>
                <span className={styles.tabTriggerLabel}>Templates</span>
                <span className={styles.tabTriggerDescription}>
                  Manage approved reusable content
                </span>
              </TabsTrigger>
              <TabsTrigger value="reminders" className={styles.tabTrigger}>
                <span className={styles.tabTriggerLabel}>Reminders</span>
                <span className={styles.tabTriggerDescription}>
                  Monitor task and review notices
                </span>
              </TabsTrigger>
            </TabsList>
            {!loading ? (
              <>
                <TabsContent value="broadcasts" className={styles.tabContent}>
                  <BroadcastReadiness
                    approvedTemplateCount={approvedGroupTemplates.length}
                    selectedPreviewKey={selectedPreviewKey}
                    preview={preview}
                    send={send}
                    onCreateTemplate={() => {
                      setActiveView("templates");
                      onStartNewTemplate?.();
                    }}
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
                            Select an approved email and authorized participant group. The server
                            fixes the recipient list and renders each email before send.
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
                            Approved email · exact version
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
                                ? "No approved email available"
                                : "Select exact approved email version"}
                            </option>
                            {approvedGroupTemplates.map((template) => (
                              <option
                                key={communicationTemplateSelectionKey(
                                  template.id,
                                  template.version,
                                )}
                                value={communicationTemplateSelectionKey(
                                  template.id,
                                  template.version,
                                )}
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
                          disabled={
                            busy || onPreview === undefined || selectedPreviewKey.length === 0
                          }
                          onClick={() => (onPreview === undefined ? undefined : void onPreview())}
                        >
                          {busy ? "Preparing preview…" : "Preview recipients and email"}
                        </Button>
                        {approvedGroupTemplates.length === 0 ? (
                          <span className={styles.mutedText}>
                            Create and approve an event email before choosing recipients and
                            previewing.
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
                              Confirm the approved email, recipient count, and rendered output
                              before opening the send confirmation.
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
                                Sending is blocked until you explicitly confirm this exact recipient
                                snapshot.
                              </p>
                            </div>
                            <Button
                              ref={sendConfirmationTriggerRef}
                              type="button"
                              disabled={
                                busy ||
                                preview.recipientCount === 0 ||
                                onOpenSendConfirmation === undefined
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
                          Choose an approved email and recipient group, then preview it before
                          sending.
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
                </TabsContent>
                <TabsContent value="templates" className={styles.tabContent}>
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
                            Select the exact saved email version to edit or review. This workspace
                            never chooses the latest version automatically.
                          </CardDescription>
                        </div>
                        {templates.length > 0 ? (
                          <Button
                            variant="outline"
                            type="button"
                            onClick={onStartNewTemplate}
                            disabled={busy}
                          >
                            Write a new email
                          </Button>
                        ) : null}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {templates.length === 0 ? (
                        <p>
                          No saved emails yet. Compose your first email below. Saving creates a
                          draft only; after review and approval, Broadcasts lets you choose
                          recipients, preview the exact email, confirm the send, and track delivery.
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
                                        onClick={() =>
                                          onSelectTemplate?.(template.id, template.version)
                                        }
                                        aria-label={`Select saved email ${template.name}, version ${template.version}`}
                                      >
                                        {template.name}
                                      </Button>
                                    </TableHead>
                                    <TableCell>
                                      {formatCommunicationPurpose(template.purpose)}
                                    </TableCell>
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
                    {...(onApprovalDialogOpenChange === undefined
                      ? {}
                      : { onApprovalDialogOpenChange })}
                  />
                </TabsContent>
                <TabsContent value="reminders" className={styles.tabContent}>
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
                </TabsContent>
              </>
            ) : null}
          </Tabs>
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

function CommunicationsWorkspaceForScope({
  eventId,
  organizationId,
  api: providedApi,
  initialTemplates,
  initialPreview = null,
  initialSend = null,
  initialReminderRuns,
  initialReminderDispatches,
  initialReminderFacts,
  providerState: initialProviderState = "unknown",
}: CommunicationsWorkspaceProps) {
  const api = useMemo(
    () => providedApi ?? createCommunicationApi("", organizationId),
    [organizationId, providedApi],
  );
  const navigationCache = useNavigationDataCache();
  const templateCacheKey = useMemo(
    () => communicationNavigationCacheKey("templates", organizationId, eventId),
    [eventId, organizationId],
  );
  const templateCacheTags = useMemo(
    () => communicationNavigationCacheTags("templates", organizationId, eventId),
    [eventId, organizationId],
  );
  const reminderTruthCacheKey = useMemo(
    () => communicationNavigationCacheKey("reminder-truth", organizationId, eventId),
    [eventId, organizationId],
  );
  const reminderTruthCacheTags = useMemo(
    () => communicationNavigationCacheTags("reminder-truth", organizationId, eventId),
    [eventId, organizationId],
  );
  const cachedTemplates = navigationCache?.peek<readonly CommunicationTemplate[]>(templateCacheKey);
  const hasExplicitReminderTruth =
    initialReminderRuns !== undefined ||
    initialReminderDispatches !== undefined ||
    initialReminderFacts !== undefined;
  const cachedReminderTruth = hasExplicitReminderTruth
    ? undefined
    : navigationCache?.peek<CommunicationReminderTruthSnapshot>(reminderTruthCacheKey);
  const initialTemplateValue = initialTemplates ?? cachedTemplates ?? [];
  const initialReminderTruthValue = useMemo<CommunicationReminderTruthSnapshot>(
    () =>
      hasExplicitReminderTruth
        ? {
            runs: initialReminderRuns ?? [],
            dispatches: initialReminderDispatches ?? [],
            facts: initialReminderFacts ?? null,
          }
        : (cachedReminderTruth ?? { runs: [], dispatches: [], facts: null }),
    [
      cachedReminderTruth,
      hasExplicitReminderTruth,
      initialReminderDispatches,
      initialReminderFacts,
      initialReminderRuns,
    ],
  );
  const initialReminderTruthRef = useRef(initialReminderTruthValue);
  const initialReminderTruth = initialReminderTruthRef.current;
  const hasImmediateTemplateData = useRef(
    initialTemplates !== undefined || cachedTemplates !== undefined,
  ).current;
  const hasImmediateReminderTruth = useRef(
    hasExplicitReminderTruth || cachedReminderTruth !== undefined,
  ).current;
  const [templateState, dispatchTemplate] = useReducer(communicationsTemplateReducer, {
    templates: initialTemplateValue,
    preview: initialPreview,
    send: initialSend,
    selectedTemplateId: initialTemplateValue[0]?.id ?? initialPreview?.templateId ?? "",
    selectedTemplateVersion: initialTemplateValue[0]?.version ?? initialPreview?.templateVersion,
    creatingTemplate: false,
    selectedAudience: initialPreview?.audience ?? "all_participants",
  });
  const {
    templates,
    preview,
    send,
    selectedTemplateId,
    selectedTemplateVersion,
    creatingTemplate,
    selectedAudience,
  } = templateState;
  const [reminderTruth, dispatchReminder] = useReducer(communicationsReminderReducer, {
    runs: initialReminderTruth.runs,
    dispatches: initialReminderTruth.dispatches,
    facts: initialReminderTruth.facts,
    state: hasImmediateReminderTruth ? "ready" : "idle",
    error: null,
  });
  const {
    runs: reminderRuns,
    dispatches: reminderDispatches,
    facts: reminderFacts,
  } = reminderTruth;
  const reminderState = reminderTruth.state;
  const reminderError = reminderTruth.error;
  const [uiState, dispatchUi] = useReducer(communicationsUiReducer, {
    loading: !hasImmediateTemplateData,
    busy: false,
    error: null,
    statusMessage: null,
    providerState: initialProviderState,
    sendConfirmationOpen: false,
  });
  const { loading, busy, error, statusMessage, providerState, sendConfirmationOpen } = uiState;
  const setPreview = (value: CommunicationPreview | null): void =>
    dispatchTemplate({ type: "set-preview", preview: value });
  const setSend = (value: CommunicationSend | null): void =>
    dispatchTemplate({ type: "set-send", send: value });
  const setReminderState = (value: ReminderTruthState): void =>
    dispatchReminder({ type: "set-state", state: value });
  const setReminderError = (value: string | null): void =>
    dispatchReminder({ type: "set-error", error: value });
  const setSelectedTemplateId = (value: CommunicationStateUpdate<string>): void =>
    dispatchTemplate({ type: "set-selected-template-id", value });
  const setSelectedTemplateVersion = (value: CommunicationStateUpdate<number | undefined>): void =>
    dispatchTemplate({ type: "set-selected-template-version", value });
  const setCreatingTemplate = (value: boolean): void =>
    dispatchTemplate({ type: "set-creating-template", creating: value });
  const setSelectedAudience = (value: CommunicationAudience): void =>
    dispatchTemplate({ type: "set-audience", audience: value });
  const setBusy = (value: CommunicationStateUpdate<boolean>): void =>
    dispatchUi({ type: "set-busy", value });
  const setError = (value: CommunicationStateUpdate<string | null>): void =>
    dispatchUi({ type: "set-error", value });
  const setStatusMessage = (value: CommunicationStateUpdate<string | null>): void =>
    dispatchUi({ type: "set-status-message", value });
  const setProviderState = (value: CommunicationStateUpdate<CommunicationProviderState>): void =>
    dispatchUi({ type: "set-provider-state", value });
  const setSendConfirmationOpen = (value: CommunicationStateUpdate<boolean>): void =>
    dispatchUi({ type: "set-send-confirmation-open", value });
  const idempotencyKeyRef = useRef<string | null>(null);
  const reminderIdempotencyKeyRef = useRef<string | null>(null);
  const templateLoadGenerationRef = useRef(0);
  const reminderTruthGenerationRef = useRef(0);
  const communicationScopeKey = `${normalizeCommunicationScopeId(organizationId)}:${normalizeCommunicationScopeId(eventId)}`;
  const reminderFactsRef = useRef<ReminderFacts | null>(reminderFacts);
  useLayoutEffect(() => {
    reminderFactsRef.current = reminderFacts;
  }, [reminderFacts]);
  const selectedTemplateSelectionRef = useRef<CommunicationTemplateSelection | undefined>(
    selectedTemplateId.length === 0 || selectedTemplateVersion === undefined
      ? undefined
      : { templateId: selectedTemplateId, templateVersion: selectedTemplateVersion },
  );
  useLayoutEffect(() => {
    selectedTemplateSelectionRef.current =
      selectedTemplateId.length === 0 || selectedTemplateVersion === undefined
        ? undefined
        : { templateId: selectedTemplateId, templateVersion: selectedTemplateVersion };
  }, [selectedTemplateId, selectedTemplateVersion]);
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
    dispatchTemplate({ type: "invalidate-preview" });
    dispatchUi({ type: "set-send-confirmation-open", value: next.sendConfirmationOpen });
    idempotencyKeyRef.current = next.idempotencyKey;
  }, []);

  const loadTemplates = useCallback(
    async (
      signal: AbortSignal | undefined,
      initialRead?: Promise<readonly CommunicationTemplate[]>,
      showLoading = true,
    ) => {
      const generation = templateLoadGenerationRef.current + 1;
      templateLoadGenerationRef.current = generation;
      if (showLoading) dispatchUi({ type: "set-loading", value: true });
      dispatchUi({ type: "set-error", value: null });
      await loadCommunicationTemplates({
        read: () =>
          initialRead ??
          initialReadKey.api.listTemplates(initialReadKey.eventId, undefined, signal),
        signal,
        isCurrent: () =>
          templateLoadGenerationRef.current === generation &&
          communicationScopeKey ===
            `${normalizeCommunicationScopeId(organizationId)}:${normalizeCommunicationScopeId(eventId)}`,
        onLoaded: (loaded) => {
          dispatchTemplate({ type: "templates-loaded", templates: loaded });
        },
        onError: (reason) => dispatchUi({ type: "set-error", value: reason }),
        onSettled: () => dispatchUi({ type: "set-loading", value: false }),
      });
    },
    [communicationScopeKey, eventId, initialReadKey, organizationId],
  );
  const refreshDeliveryTruth = useCallback(
    async (fresh = false, signal?: AbortSignal, showPending = true): Promise<void> => {
      const generation = reminderTruthGenerationRef.current + 1;
      reminderTruthGenerationRef.current = generation;
      const isCurrent = (): boolean =>
        reminderTruthGenerationRef.current === generation &&
        communicationScopeKey ===
          `${normalizeCommunicationScopeId(organizationId)}:${normalizeCommunicationScopeId(eventId)}` &&
        !signal?.aborted;
      if (showPending) dispatchReminder({ type: "refresh-start" });
      else dispatchReminder({ type: "set-error", error: null });
      const load = async (
        requestSignal?: AbortSignal,
      ): Promise<CommunicationReminderTruthSnapshot> => {
        if (
          typeof api.listReminderRuns !== "function" ||
          typeof api.listReminderDispatches !== "function"
        ) {
          throw new Error("Reminder delivery status is not exposed by this API surface.");
        }
        const [runs, dispatches] = await Promise.all([
          api.listReminderRuns(eventId, requestSignal),
          api.listReminderDispatches(eventId, requestSignal),
        ]);
        return { runs, dispatches, facts: reminderFactsRef.current };
      };
      try {
        const loaded =
          navigationCache === null
            ? await load(signal)
            : await navigationCache.read<CommunicationReminderTruthSnapshot>({
                key: reminderTruthCacheKey,
                tags: reminderTruthCacheTags,
                fresh,
                load: () => load(),
              });
        if (!isCurrent()) return;
        dispatchReminder({
          type: "snapshot-loaded",
          snapshot: loaded,
        });
      } catch (reason) {
        if (!isCurrent()) return;
        dispatchReminder({
          type: "load-failed",
          state: reminderTruthStateFromError(reason),
          error: messageFromError(reason),
        });
      }
    },
    [
      api,
      communicationScopeKey,
      eventId,
      navigationCache,
      organizationId,
      reminderTruthCacheKey,
      reminderTruthCacheTags,
    ],
  );

  useEffect(() => {
    if (initialTemplates !== undefined) {
      navigationCache?.write(templateCacheKey, initialTemplates, templateCacheTags);
      return;
    }
    dispatchTemplate({
      type: "set-templates",
      value: (current) => (hasImmediateTemplateData ? current : []),
    });
    dispatchTemplate({ type: "set-preview", preview: null });
    dispatchTemplate({ type: "set-send", send: null });
    dispatchTemplate({
      type: "set-selected-template-id",
      value: (current) => (hasImmediateTemplateData ? current : ""),
    });
    dispatchTemplate({
      type: "set-selected-template-version",
      value: (current) => (hasImmediateTemplateData ? current : undefined),
    });
    dispatchTemplate({ type: "set-creating-template", creating: false });
    dispatchTemplate({ type: "set-audience", audience: "all_participants" });
    dispatchUi({ type: "set-status-message", value: null });
    dispatchUi({ type: "set-send-confirmation-open", value: false });
    idempotencyKeyRef.current = null;
    if (navigationCache !== null) {
      const read = navigationCache.read<readonly CommunicationTemplate[]>({
        key: templateCacheKey,
        tags: templateCacheTags,
        load: () => initialReadKey.api.listTemplates(initialReadKey.eventId),
      });
      void loadTemplates(undefined, read, !hasImmediateTemplateData);
      return () => {
        templateLoadGenerationRef.current += 1;
      };
    }
    const lease = initialReadCoordinator.acquire(initialReadKey);
    void loadTemplates(lease.signal, lease.promise, !hasImmediateTemplateData);
    return () => {
      templateLoadGenerationRef.current += 1;
      lease.release();
    };
  }, [
    hasImmediateTemplateData,
    initialReadCoordinator,
    initialReadKey,
    initialTemplates,
    loadTemplates,
    navigationCache,
    templateCacheKey,
    templateCacheTags,
  ]);
  useEffect(() => {
    if (hasExplicitReminderTruth) {
      navigationCache?.write(reminderTruthCacheKey, initialReminderTruth, reminderTruthCacheTags);
      return;
    }
    const controller = new AbortController();
    void refreshDeliveryTruth(false, controller.signal, !hasImmediateReminderTruth);
    return () => {
      reminderTruthGenerationRef.current += 1;
      if (navigationCache === null) controller.abort();
    };
  }, [
    hasExplicitReminderTruth,
    hasImmediateReminderTruth,
    initialReminderTruth,
    navigationCache,
    refreshDeliveryTruth,
    reminderTruthCacheKey,
    reminderTruthCacheTags,
  ]);

  function replaceTemplate(next: CommunicationTemplate): void {
    const nextTemplates = sortCommunicationTemplates([
      ...templates.filter(
        (template) => !(template.id === next.id && template.version === next.version),
      ),
      next,
    ]);
    templateLoadGenerationRef.current += 1;
    navigationCache?.invalidate(templateCacheTags.slice(-1));
    navigationCache?.write(templateCacheKey, nextTemplates, templateCacheTags);
    dispatchTemplate({ type: "template-replaced", template: next });
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
      setStatusMessage(
        `Draft email ${next.name} v${next.version} saved. Saving a draft does not send an email.`,
      );
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
        `Email ${next.name} v${next.version} saved as a draft. Approve it before choosing recipients and previewing.`,
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
      setStatusMessage(`Email ${next.name} v${next.version} approved for event use.`);
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
        "Select one exact approved event email version before creating a recipient preview.",
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
        `Preview ready with ${next.recipientCount} fixed recipient snapshot${next.recipientCount === 1 ? "" : "s"}.`,
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
    const actionGeneration = reminderTruthGenerationRef.current + 1;
    reminderTruthGenerationRef.current = actionGeneration;
    const actionScopeKey = communicationScopeKey;
    const isCurrent = (): boolean =>
      reminderTruthGenerationRef.current === actionGeneration &&
      communicationScopeKey === actionScopeKey;
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
      if (!isCurrent()) return;
      const nextRuns = [...reminderRuns.filter((run) => run.id !== next.id), next];
      navigationCache?.invalidate(reminderTruthCacheTags.slice(-1));
      navigationCache?.write(
        reminderTruthCacheKey,
        {
          runs: nextRuns,
          dispatches: reminderDispatches,
          facts: reminderFactsRef.current,
        },
        reminderTruthCacheTags,
      );
      dispatchReminder({ type: "run-recorded", run: next });
      reminderIdempotencyKeyRef.current = null;
      setStatusMessage(`Manual reminder run ${next.id} is ${statusLabel(next.state)}.`);
      await refreshDeliveryTruth(true);
    } catch (reason) {
      if (!isCurrent()) return;
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
      onRefreshDeliveryTruth={() => refreshDeliveryTruth(true)}
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

export function CommunicationsWorkspace(props: CommunicationsWorkspaceProps) {
  const eventId = useOrganizerEventId(props.eventId);
  const scopeKey = `${normalizeCommunicationScopeId(props.organizationId)}:${normalizeCommunicationScopeId(eventId)}`;
  return <CommunicationsWorkspaceForScope key={scopeKey} {...props} eventId={eventId} />;
}
