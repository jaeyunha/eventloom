"use client";

import { type ReactNode, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  COMMUNICATION_AUDIENCES,
  type CommunicationAudience,
  type CommunicationPreview,
  type CommunicationSend,
  type CommunicationTemplate,
  type ReminderDispatch,
  type ReminderFacts,
  type ReminderRun,
} from "./api";
import styles from "./communications-workspace.module.css";
import type {
  CommunicationProviderState,
  ReminderRunActionInput,
  ReminderTruthState,
  TemplateDraft,
} from "./communications-workspace-model";
import { communicationTemplateSelectionKey } from "./communications-workspace-model";
import {
  BroadcastComposer,
  ReminderTruth,
  SendConfirmationDialog,
  TemplateLibrary,
} from "./communications-workspace-sections";

type CommunicationsWorkspaceSection = "broadcasts" | "templates" | "reminders";
const EMPTY_REMINDER_RUNS: readonly ReminderRun[] = [];
const EMPTY_REMINDER_DISPATCHES: readonly ReminderDispatch[] = [];

interface CommunicationsWorkspaceViewProps {
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
  readonly approvalDialogOpen?: boolean;
  readonly onApprovalDialogOpenChange?: (open: boolean) => void;
  readonly view?: CommunicationsWorkspaceSection;
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

function resolveEditorTemplate(
  templates: readonly CommunicationTemplate[],
  templateId: string,
  templateVersion: number | undefined,
): CommunicationTemplate | undefined {
  if (templateId.length === 0) return undefined;
  const candidates = templates.filter((template) => template.id === templateId);
  if (templateVersion !== undefined) {
    return candidates.find((template) => template.version === templateVersion);
  }
  return candidates.length === 1 ? candidates[0] : undefined;
}

function CommunicationsWorkspaceHeader({
  providerState,
}: Readonly<{ providerState: CommunicationProviderState }>) {
  return (
    <header className={styles.header}>
      <div className={styles.headerMain}>
        <p className={styles.eyebrow}>Communications</p>
        <h1>Event communications</h1>
        <p className={styles.lede}>
          Send one-off event broadcasts, manage reusable approved templates, and monitor automated
          task/review reminders. Each job has its own workspace. Every broadcast uses an approved
          email, a fixed server-generated recipient preview, and explicit human confirmation.
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
  );
}

function CommunicationsWorkspaceTabs({
  activeView,
  loading,
  onViewChange,
  children,
}: Readonly<{
  activeView: CommunicationsWorkspaceSection;
  loading: boolean;
  onViewChange: (value: string) => void;
  children: ReactNode;
}>) {
  return (
    <Tabs value={activeView} onValueChange={onViewChange} className={styles.tabs}>
      <TabsList className={styles.tabList} aria-label="Communications views">
        <TabsTrigger value="broadcasts" className={styles.tabTrigger}>
          <span className={styles.tabTriggerLabel}>Broadcasts</span>
          <span className={styles.tabTriggerDescription}>Send one-off event email</span>
        </TabsTrigger>
        <TabsTrigger value="templates" className={styles.tabTrigger}>
          <span className={styles.tabTriggerLabel}>Templates</span>
          <span className={styles.tabTriggerDescription}>Manage approved reusable content</span>
        </TabsTrigger>
        <TabsTrigger value="reminders" className={styles.tabTrigger}>
          <span className={styles.tabTriggerLabel}>Reminders</span>
          <span className={styles.tabTriggerDescription}>Monitor task and review notices</span>
        </TabsTrigger>
      </TabsList>
      {!loading ? children : null}
    </Tabs>
  );
}

export function CommunicationsWorkspaceView({
  eventId,
  view,
  templates,
  preview = null,
  send = null,
  reminderRuns = EMPTY_REMINDER_RUNS,
  reminderDispatches = EMPTY_REMINDER_DISPATCHES,
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
  const previewAudienceOptions: readonly CommunicationAudience[] =
    selected?.purpose === "decision"
      ? ["accepted_participants", "waitlisted_participants", "rejected_participants"]
      : COMMUNICATION_AUDIENCES;
  const handleViewChange = (value: string): void => {
    if (value === "broadcasts" || value === "templates" || value === "reminders") {
      setActiveView(value);
    }
  };
  const selectedForEditor = creatingTemplate ? undefined : selected;

  return (
    <div className={styles.page}>
      <a href="#communications-content" className={styles.skipLink}>
        Skip to event email workspace
      </a>
      <div className={styles.content}>
        <CommunicationsWorkspaceHeader providerState={providerState} />
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
          <CommunicationsWorkspaceTabs
            activeView={activeView}
            loading={loading}
            onViewChange={handleViewChange}
          >
            <TabsContent value="broadcasts" className={styles.tabContent}>
              <BroadcastComposer
                approvedGroupTemplates={approvedGroupTemplates}
                selectedPreviewKey={selectedPreviewKey}
                preview={preview}
                send={send}
                selectedAudience={selectedAudience}
                previewAudienceOptions={previewAudienceOptions}
                busy={busy}
                sendConfirmationOpen={sendConfirmationOpen}
                sendConfirmationTriggerRef={sendConfirmationTriggerRef}
                {...(onSelectTemplate === undefined ? {} : { onSelectTemplate })}
                {...(onSelectAudience === undefined ? {} : { onSelectAudience })}
                {...(onPreview === undefined ? {} : { onPreview })}
                {...(onOpenSendConfirmation === undefined ? {} : { onOpenSendConfirmation })}
                {...(onRetryFailed === undefined ? {} : { onRetryFailed })}
                onCreateTemplate={() => {
                  setActiveView("templates");
                  onStartNewTemplate?.();
                }}
              />
            </TabsContent>
            <TabsContent value="templates" className={styles.tabContent}>
              <TemplateLibrary
                templates={templates}
                selectedForEditor={selectedForEditor}
                selectedTemplateId={selectedTemplateId}
                selectedTemplateVersion={selectedTemplateVersion}
                busy={busy}
                {...(onStartNewTemplate === undefined ? {} : { onStartNewTemplate })}
                {...(onSelectTemplate === undefined ? {} : { onSelectTemplate })}
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
          </CommunicationsWorkspaceTabs>
        </main>
        <SendConfirmationDialog
          preview={preview}
          error={error}
          busy={busy}
          sendConfirmationOpen={sendConfirmationOpen}
          sendConfirmationTriggerRef={sendConfirmationTriggerRef}
          {...(onCloseSendConfirmation === undefined ? {} : { onCloseSendConfirmation })}
          {...(onConfirmSend === undefined ? {} : { onConfirmSend })}
        />
      </div>
    </div>
  );
}
