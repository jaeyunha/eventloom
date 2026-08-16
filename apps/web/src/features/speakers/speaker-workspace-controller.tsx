"use client";
import {
  CheckCircle2,
  Eye,
  FileText,
  ListTodo,
  Mail,
  RefreshCw,
  Search,
  Send,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import {
  StatusBadge,
  WorkspaceHeader,
  WorkspaceListDetail,
  WorkspaceMetaItem,
} from "@/components/workspace";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Checkbox } from "../../components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../../components/ui/empty";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { Progress } from "../../components/ui/progress";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Textarea } from "../../components/ui/textarea";
import adminStyles from "../admin/admin-shell.module.css";
import {
  assertAdvancedSpeakerRevision,
  assertSpeakerHeadshotReplacement,
  assertSpeakerRosterScope,
  createSpeakerApi,
  ORGANIZER_HEADSHOT_ACCEPTED_TYPES,
  type SpeakerApi,
  SpeakerApiError,
  type SpeakerAsset,
  type SpeakerCreateInput,
  type SpeakerEmailPreview,
  type SpeakerEmailSend,
  type SpeakerEmailTemplate,
  type SpeakerImportPreview,
  type SpeakerInvitationPreview,
  type SpeakerInvitationResult,
  type SpeakerMutationStatus,
  type SpeakerProgressEnvelope,
  type SpeakerRecord,
  type SpeakerReminderEligibilityEnvelope,
  type SpeakerRosterEnvelope,
  type SpeakerSession,
  type SpeakerTaskEnvelope,
  type SpeakerUpdateInput,
} from "./api";
import {
  SpeakerAssetDownload,
  SpeakerAssetMetadata,
  SpeakerHeadshot,
  SpeakerStatusBadge,
} from "./speaker-assets";
import {
  duplicateEmailConflicts,
  mergeProgressSummaries,
  mergeSpeaker,
  normalizeRoster,
  speakerProgressFor,
  speakerSecondaryLoadKey,
} from "./speaker-data-logic";
import {
  acceptedSpeakerSessions,
  type OrganizerHeadshotUploadStatus,
  organizerHeadshotPreviewPath,
  organizerHeadshotPreviewRequestKey,
  organizerHeadshotSubmissionId,
  validateOrganizerHeadshotFile,
} from "./speaker-headshot-logic";
import {
  FormMessage,
  MutationStatusMessage,
  SpeakerInvitationControls,
} from "./speaker-invitations";
import {
  dateLabel,
  dateTimeLabel,
  editDraftFor,
  emptyCreateDraft,
  errorMessage,
  filterSpeakerRoster,
  filterSpeakersByAttention,
  type SpeakerAttentionFilter,
  speakerProgressMatches,
  statusLabel,
  taskComplete,
  withTimeout,
} from "./speaker-roster-logic";
import {
  createSpeakerTaskAssignment,
  retainInvitationHistory,
  type SpeakerOnboardingTaskDraft,
  socialLinksFor,
  speakerInvitationReady,
  speakerOnboardingTaskDefinitions,
  taskStatusLabel,
  taskStatusTone,
  travelLogisticsFor,
  validateSpeakerTaskAssignment,
} from "./speaker-task-model";
import styles from "./speaker-workspace.module.css";
import {
  ASYNC_ACTION_TIMEOUT_MS,
  type CreateDraft,
  DEFAULT_STATUS_OPTIONS,
  type EditDraft,
  MAX_ORGANIZER_ONBOARDING_TASKS,
  type ProgressFilter,
  SPEAKER_CUSTOM_FIELDS_CONTRACT_GAP,
  SPEAKER_ROSTER_COLUMNS,
  SPEAKER_WELCOME_EMAIL_STARTER,
  type SpeakerInvitationHistoryEntry,
  type SpeakerWorkspaceProps,
} from "./speaker-workspace-types";

function ProfileFields({
  draft,
  onChange,
  disabled,
}: Readonly<{
  draft: CreateDraft | EditDraft;
  onChange: (field: keyof CreateDraft, value: string | boolean) => void;
  disabled: boolean;
}>) {
  return (
    <FieldGroup className={styles.actionsStack}>
      <div className={styles.fieldGrid}>
        <Field>
          <FieldLabel htmlFor="speaker-display-name">Name</FieldLabel>
          <Input
            id="speaker-display-name"
            value={draft.displayName}
            onChange={(event) => onChange("displayName", event.target.value)}
            required
            maxLength={200}
            disabled={disabled}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="speaker-email">Email</FieldLabel>
          <Input
            id="speaker-email"
            type="email"
            value={draft.email}
            onChange={(event) => onChange("email", event.target.value)}
            required
            maxLength={320}
            disabled={disabled}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="speaker-title">Title</FieldLabel>
          <Input
            id="speaker-title"
            value={draft.title}
            onChange={(event) => onChange("title", event.target.value)}
            placeholder="Principal Engineer"
            maxLength={160}
            disabled={disabled}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="speaker-company">Company</FieldLabel>
          <Input
            id="speaker-company"
            value={draft.company}
            onChange={(event) => onChange("company", event.target.value)}
            placeholder="Organization"
            maxLength={200}
            disabled={disabled}
          />
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="speaker-biography">Biography</FieldLabel>
        <Textarea
          id="speaker-biography"
          value={draft.biography}
          onChange={(event) => onChange("biography", event.target.value)}
          maxLength={20_000}
          disabled={disabled}
        />
      </Field>
      <div className={styles.fieldGrid}>
        <Field>
          <FieldLabel htmlFor="speaker-twitter">Twitter / X</FieldLabel>
          <Input
            id="speaker-twitter"
            value={draft.twitter}
            onChange={(event) => onChange("twitter", event.target.value)}
            placeholder="https://x.com/…"
            maxLength={500}
            disabled={disabled}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="speaker-linkedin">LinkedIn</FieldLabel>
          <Input
            id="speaker-linkedin"
            value={draft.linkedin}
            onChange={(event) => onChange("linkedin", event.target.value)}
            placeholder="https://linkedin.com/in/…"
            maxLength={500}
            disabled={disabled}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="speaker-website">Website</FieldLabel>
          <Input
            id="speaker-website"
            value={draft.website}
            onChange={(event) => onChange("website", event.target.value)}
            placeholder="https://…"
            maxLength={500}
            disabled={disabled}
          />
        </Field>
      </div>
      <FieldSet className={styles.detailBlock}>
        <FieldLegend variant="label">Travel and logistics</FieldLegend>
        <Field orientation="horizontal" className={styles.checkboxField}>
          <Checkbox
            id="speaker-travel-required"
            checked={draft.travelRequired}
            onCheckedChange={(checked) => onChange("travelRequired", checked === true)}
            disabled={disabled}
          />
          <FieldLabel htmlFor="speaker-travel-required">
            Speaker requires travel coordination
          </FieldLabel>
        </Field>
        <div className={styles.fieldGrid}>
          <Field>
            <FieldLabel htmlFor="speaker-arrival">Arrival date</FieldLabel>
            <Input
              id="speaker-arrival"
              type="date"
              value={draft.arrivalAt}
              onChange={(event) => onChange("arrivalAt", event.target.value)}
              disabled={disabled}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="speaker-departure">Departure date</FieldLabel>
            <Input
              id="speaker-departure"
              type="date"
              value={draft.departureAt}
              onChange={(event) => onChange("departureAt", event.target.value)}
              disabled={disabled}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="speaker-accommodation">Accommodation</FieldLabel>
            <Input
              id="speaker-accommodation"
              value={draft.accommodation}
              onChange={(event) => onChange("accommodation", event.target.value)}
              maxLength={500}
              disabled={disabled}
            />
          </Field>
        </div>
        <div className={styles.fieldGrid}>
          <Field>
            <FieldLabel htmlFor="speaker-dietary">Dietary requirements</FieldLabel>
            <Input
              id="speaker-dietary"
              value={draft.dietaryRequirements}
              onChange={(event) => onChange("dietaryRequirements", event.target.value)}
              maxLength={2_000}
              disabled={disabled}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="speaker-accessibility">Accessibility needs</FieldLabel>
            <Input
              id="speaker-accessibility"
              value={draft.accessibilityNeeds}
              onChange={(event) => onChange("accessibilityNeeds", event.target.value)}
              maxLength={2_000}
              disabled={disabled}
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="speaker-travel-notes">Travel notes</FieldLabel>
          <Textarea
            id="speaker-travel-notes"
            value={draft.travelNotes}
            onChange={(event) => onChange("travelNotes", event.target.value)}
            maxLength={5_000}
            disabled={disabled}
          />
        </Field>
      </FieldSet>
    </FieldGroup>
  );
}

function SpeakerTaskStatusBadge({ status }: Readonly<{ status: string }>) {
  return <StatusBadge tone={taskStatusTone(status)}>{taskStatusLabel(status)}</StatusBadge>;
}
type SpeakerWorkspaceView = "roster" | "tasks" | "email";

type RosterScopeState = {
  activeView: SpeakerWorkspaceView;
  roster: SpeakerRosterEnvelope | null;
  progress: SpeakerProgressEnvelope | null;
  loading: boolean;
  error: string | null;
  progressError: string | null;
  notice: string | null;
  selectedId: string | null;
  selectedSpeakerIds: readonly string[];
  reminderEligibility: SpeakerReminderEligibilityEnvelope | null;
  secondarySectionsReady: boolean;
  visibleProgressContext: string | null;
  query: string;
  statusFilter: string;
  sessionFilter: string;
  progressFilter: ProgressFilter;
  attentionFilter: SpeakerAttentionFilter;
  filtersOpen: boolean;
  showAdd: boolean;
  showCsv: boolean;
};

type RosterScopeAction =
  | { type: "view-changed"; view: SpeakerWorkspaceView }
  | { type: "roster-scope-reset" }
  | { type: "api-error-set"; message: string }
  | { type: "notice-set"; message: string | null }
  | { type: "roster-load-started" }
  | { type: "roster-loaded"; roster: SpeakerRosterEnvelope }
  | {
      type: "roster-authoritative-applied";
      roster: SpeakerRosterEnvelope;
      message: string | undefined;
    }
  | { type: "roster-load-failed"; message: string; clearRoster: boolean }
  | { type: "loading-changed"; loading: boolean }
  | { type: "progress-load-started" }
  | { type: "progress-loaded"; progress: SpeakerProgressEnvelope }
  | {
      type: "progress-and-roster-loaded";
      roster: SpeakerRosterEnvelope;
      progress: SpeakerProgressEnvelope;
    }
  | { type: "progress-load-failed"; message: string }
  | { type: "reminder-loaded"; eligibility: SpeakerReminderEligibilityEnvelope }
  | {
      type: "roster-details-refreshed";
      participantId: string;
      sessions: readonly SpeakerSession[];
      assets: readonly SpeakerAsset[];
      updatedAt: string;
    }
  | {
      type: "tasks-assigned";
      taskEnvelope: SpeakerTaskEnvelope;
      fallbackRows: SpeakerProgressEnvelope["rows"];
    }
  | { type: "selected-id-changed"; participantId: string | null }
  | { type: "selection-toggled"; participantId: string }
  | { type: "visible-selection-toggled"; participantIds: readonly string[] }
  | { type: "selection-set"; participantIds: readonly string[] }
  | { type: "query-changed"; query: string }
  | { type: "status-filter-changed"; status: string }
  | { type: "session-filter-changed"; session: string }
  | { type: "progress-filter-changed"; progress: ProgressFilter }
  | { type: "attention-filter-changed"; attention: SpeakerAttentionFilter }
  | { type: "filters-cleared" }
  | { type: "filters-toggled" }
  | { type: "add-dialog-changed"; open: boolean }
  | { type: "csv-dialog-changed"; open: boolean }
  | { type: "csv-dialog-toggled" }
  | { type: "secondary-ready" }
  | { type: "progress-context-changed"; context: string };

const INITIAL_ROSTER_SCOPE_STATE: RosterScopeState = {
  activeView: "roster",
  roster: null,
  progress: null,
  loading: true,
  error: null,
  progressError: null,
  notice: null,
  selectedId: null,
  selectedSpeakerIds: [],
  reminderEligibility: null,
  secondarySectionsReady: false,
  visibleProgressContext: null,
  query: "",
  statusFilter: "all",
  sessionFilter: "all",
  progressFilter: "all",
  attentionFilter: "all",
  filtersOpen: false,
  showAdd: false,
  showCsv: false,
};

function rosterSelectionFor(
  state: RosterScopeState,
  roster: SpeakerRosterEnvelope,
): Pick<RosterScopeState, "selectedId" | "selectedSpeakerIds"> {
  const participantIds = new Set(roster.speakers.map((speaker) => speaker.participantId));
  const selectedSpeakerIds = state.selectedSpeakerIds.filter((participantId) =>
    participantIds.has(participantId),
  );
  const selectedId =
    state.selectedId !== null && participantIds.has(state.selectedId)
      ? state.selectedId
      : (roster.speakers[0]?.participantId ?? null);
  return { selectedId, selectedSpeakerIds };
}

function rosterScopeReducer(state: RosterScopeState, action: RosterScopeAction): RosterScopeState {
  switch (action.type) {
    case "view-changed":
      return { ...state, activeView: action.view };
    case "roster-scope-reset":
      return {
        ...state,
        roster: null,
        progress: null,
        loading: true,
        error: null,
        progressError: null,
        selectedId: null,
        selectedSpeakerIds: [],
      };
    case "api-error-set":
      return { ...state, error: action.message };
    case "notice-set":
      return { ...state, notice: action.message };
    case "roster-load-started":
      return { ...state, loading: true, error: null, progressError: null, progress: null };
    case "roster-loaded":
      return {
        ...state,
        roster: action.roster,
        loading: false,
        ...rosterSelectionFor(state, action.roster),
      };
    case "roster-authoritative-applied":
      return {
        ...state,
        roster: action.roster,
        loading: false,
        error: null,
        progressError: null,
        progress: null,
        ...rosterSelectionFor(state, action.roster),
        notice: action.message ?? state.notice,
      };
    case "roster-load-failed":
      return action.clearRoster
        ? {
            ...state,
            roster: null,
            progress: null,
            selectedId: null,
            selectedSpeakerIds: [],
            error: action.message,
          }
        : { ...state, error: action.message };
    case "loading-changed":
      return { ...state, loading: action.loading };
    case "progress-load-started":
      return { ...state, progressError: null };
    case "progress-loaded":
      return {
        ...state,
        progress: action.progress,
        roster:
          state.roster === null ? null : mergeProgressSummaries(state.roster, action.progress),
      };
    case "progress-and-roster-loaded":
      return {
        ...state,
        roster: action.roster,
        progress: action.progress,
        progressError: null,
      };
    case "progress-load-failed":
      return { ...state, progress: null, progressError: action.message };
    case "reminder-loaded":
      return { ...state, reminderEligibility: action.eligibility };
    case "roster-details-refreshed":
      return {
        ...state,
        roster:
          state.roster === null
            ? null
            : mergeSpeaker(state.roster, action.participantId, {
                sessions: action.sessions,
                assets: action.assets,
                updatedAt: action.updatedAt,
              }),
      };
    case "tasks-assigned": {
      const tasks = action.taskEnvelope.tasks;
      const roster =
        state.roster === null
          ? null
          : {
              ...state.roster,
              speakers: state.roster.speakers.map((speaker) => {
                const added = tasks.filter(
                  (task) => task.participantId === speaker.participantId,
                ).length;
                return added === 0
                  ? speaker
                  : {
                      ...speaker,
                      taskSummary: {
                        ...speaker.taskSummary,
                        total: speaker.taskSummary.total + added,
                      },
                    };
              }),
            };
      const rows =
        state.progress?.rows ??
        action.fallbackRows.map((row) => ({
          participantId: row.participantId,
          displayName: row.displayName,
          tasks: row.tasks,
        }));
      const progress: SpeakerProgressEnvelope = {
        organizationId: action.taskEnvelope.organizationId,
        eventId: action.taskEnvelope.eventId,
        rows: rows.map((row) => {
          const assigned = tasks.filter((task) => task.participantId === row.participantId);
          return assigned.length === 0 ? row : { ...row, tasks: [...row.tasks, ...assigned] };
        }),
      };
      return { ...state, roster, progress };
    }
    case "selected-id-changed":
      return { ...state, selectedId: action.participantId };
    case "selection-toggled":
      return {
        ...state,
        selectedSpeakerIds: state.selectedSpeakerIds.includes(action.participantId)
          ? state.selectedSpeakerIds.filter((candidate) => candidate !== action.participantId)
          : [...state.selectedSpeakerIds, action.participantId],
      };
    case "visible-selection-toggled": {
      const visibleIdSet = new Set(action.participantIds);
      const selectedSpeakerIdSet = new Set(state.selectedSpeakerIds);
      const allVisibleSelected =
        action.participantIds.length > 0 &&
        action.participantIds.every((participantId) => selectedSpeakerIdSet.has(participantId));
      return {
        ...state,
        selectedSpeakerIds: allVisibleSelected
          ? state.selectedSpeakerIds.filter((participantId) => !visibleIdSet.has(participantId))
          : [...new Set([...state.selectedSpeakerIds, ...action.participantIds])],
      };
    }
    case "selection-set":
      return { ...state, selectedSpeakerIds: action.participantIds };
    case "query-changed":
      return { ...state, query: action.query };
    case "status-filter-changed":
      return { ...state, statusFilter: action.status };
    case "session-filter-changed":
      return { ...state, sessionFilter: action.session };
    case "progress-filter-changed":
      return { ...state, progressFilter: action.progress };
    case "attention-filter-changed":
      return { ...state, attentionFilter: action.attention };
    case "filters-cleared":
      return {
        ...state,
        query: "",
        statusFilter: "all",
        sessionFilter: "all",
        progressFilter: "all",
        attentionFilter: "all",
      };
    case "filters-toggled":
      return { ...state, filtersOpen: !state.filtersOpen };
    case "add-dialog-changed":
      return { ...state, showAdd: action.open };
    case "csv-dialog-changed":
      return { ...state, showCsv: action.open };
    case "csv-dialog-toggled":
      return { ...state, showCsv: !state.showCsv };
    case "secondary-ready":
      return { ...state, secondarySectionsReady: true };
    case "progress-context-changed":
      return { ...state, visibleProgressContext: action.context };
  }
}

type EmailState = {
  emailTemplates: readonly SpeakerEmailTemplate[];
  emailTemplateId: string;
  emailTemplateVersion: number | undefined;
  emailTemplateName: string;
  emailSubject: string;
  emailHtml: string;
  emailText: string;
  emailPreview: SpeakerEmailPreview | null;
  emailEditorMode: "visual" | "html" | "text";
  emailConfirmOpen: boolean;
  emailSends: readonly SpeakerEmailSend[];
  emailSaveBusy: boolean;
  emailPreviewBusy: boolean;
  emailSendBusy: boolean;
  emailHistoryBusy: boolean;
  emailNotice: string | null;
};

type EmailAction =
  | { type: "email-templates-loaded"; templates: readonly SpeakerEmailTemplate[] }
  | {
      type: "email-template-selected";
      id: string;
      version: number | undefined;
      template: SpeakerEmailTemplate | null;
    }
  | { type: "email-template-created"; template: SpeakerEmailTemplate }
  | { type: "email-template-saved"; template: SpeakerEmailTemplate }
  | { type: "email-template-name-changed"; name: string }
  | { type: "email-subject-changed"; subject: string }
  | { type: "email-html-changed"; html: string }
  | { type: "email-text-changed"; text: string }
  | { type: "email-editor-mode-changed"; mode: "visual" | "html" | "text" }
  | { type: "email-preview-invalidated" }
  | { type: "email-preview-started" }
  | { type: "email-preview-set"; preview: SpeakerEmailPreview }
  | { type: "email-sends-loaded"; sends: readonly SpeakerEmailSend[] }
  | { type: "email-send-recorded"; send: SpeakerEmailSend }
  | { type: "email-save-busy-changed"; busy: boolean }
  | { type: "email-preview-busy-changed"; busy: boolean }
  | { type: "email-send-busy-changed"; busy: boolean }
  | { type: "email-history-busy-changed"; busy: boolean }
  | { type: "email-notice-set"; message: string | null }
  | { type: "email-confirm-changed"; open: boolean };

const INITIAL_EMAIL_STATE: EmailState = {
  emailTemplates: [],
  emailTemplateId: "",
  emailTemplateVersion: undefined,
  emailTemplateName: "New speaker message",
  emailSubject: "",
  emailHtml: "",
  emailText: "",
  emailPreview: null,
  emailEditorMode: "visual",
  emailConfirmOpen: false,
  emailSends: [],
  emailSaveBusy: false,
  emailPreviewBusy: false,
  emailSendBusy: false,
  emailHistoryBusy: false,
  emailNotice: null,
};

function emailReducer(state: EmailState, action: EmailAction): EmailState {
  switch (action.type) {
    case "email-templates-loaded": {
      const templates = action.templates;
      const latest = templates
        .slice()
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
      return latest === undefined
        ? { ...state, emailTemplates: templates }
        : {
            ...state,
            emailTemplates: templates,
            emailTemplateId: latest.id,
            emailTemplateVersion: latest.version,
            emailTemplateName: latest.name,
            emailSubject: latest.subject,
            emailHtml: latest.html,
            emailText: latest.text,
          };
    }
    case "email-template-selected":
      return action.template === null
        ? {
            ...state,
            emailTemplateId: action.id,
            emailTemplateVersion: action.version,
          }
        : {
            ...state,
            emailTemplateId: action.id,
            emailTemplateVersion: action.version,
            emailTemplateName: action.template.name,
            emailSubject: action.template.subject,
            emailHtml: action.template.html,
            emailText: action.template.text,
          };
    case "email-template-created":
    case "email-template-saved":
      return {
        ...state,
        emailTemplates: [
          ...state.emailTemplates.filter(
            (candidate) =>
              !(
                candidate.id === action.template.id && candidate.version === action.template.version
              ),
          ),
          action.template,
        ],
        emailTemplateId: action.template.id,
        emailTemplateVersion: action.template.version,
        emailTemplateName: action.template.name,
        emailSubject: action.template.subject,
        emailHtml: action.template.html,
        emailText: action.template.text,
      };
    case "email-template-name-changed":
      return { ...state, emailTemplateName: action.name };
    case "email-subject-changed":
      return { ...state, emailSubject: action.subject };
    case "email-html-changed":
      return { ...state, emailHtml: action.html };
    case "email-text-changed":
      return { ...state, emailText: action.text };
    case "email-editor-mode-changed":
      return { ...state, emailEditorMode: action.mode };
    case "email-preview-invalidated":
      return { ...state, emailPreview: null, emailConfirmOpen: false, emailPreviewBusy: false };
    case "email-preview-started":
      return { ...state, emailPreviewBusy: true };
    case "email-preview-set":
      return { ...state, emailPreview: action.preview };
    case "email-sends-loaded":
      return { ...state, emailSends: action.sends };
    case "email-send-recorded":
      return {
        ...state,
        emailSends: [
          action.send,
          ...state.emailSends.filter((candidate) => candidate.id !== action.send.id),
        ],
      };
    case "email-save-busy-changed":
      return { ...state, emailSaveBusy: action.busy };
    case "email-preview-busy-changed":
      return { ...state, emailPreviewBusy: action.busy };
    case "email-send-busy-changed":
      return { ...state, emailSendBusy: action.busy };
    case "email-history-busy-changed":
      return { ...state, emailHistoryBusy: action.busy };
    case "email-notice-set":
      return { ...state, emailNotice: action.message };
    case "email-confirm-changed":
      return { ...state, emailConfirmOpen: action.open };
  }
}

type ImportTaskInvitationState = {
  importPreview: SpeakerImportPreview | null;
  importFileName: string | null;
  taskTitle: string;
  taskDueAt: string;
  taskAssignees: readonly string[];
  invitationPreview: readonly SpeakerInvitationPreview[] | null;
  invitationResult: SpeakerInvitationResult | null;
  invitationResultParticipantId: string | null;
  invitationError: string | null;
  invitationHistory: readonly SpeakerInvitationHistoryEntry[];
  invitationPreviewBusy: boolean;
  invitationSendBusy: boolean;
  importPreviewBusy: boolean;
  importCommitBusy: boolean;
  taskBusy: boolean;
};

type ImportTaskInvitationAction =
  | { type: "invitation-cleared" }
  | { type: "invitation-preview-started" }
  | { type: "invitation-preview-loaded"; preview: readonly SpeakerInvitationPreview[] }
  | { type: "invitation-preview-failed"; message: string }
  | { type: "invitation-preview-busy-changed"; busy: boolean }
  | { type: "invitation-send-started" }
  | { type: "invitation-result-recorded"; participantId: string; result: SpeakerInvitationResult }
  | {
      type: "invitation-history-retained";
      preview: readonly SpeakerInvitationPreview[];
      result: SpeakerInvitationResult;
    }
  | { type: "invitation-send-busy-changed"; busy: boolean }
  | { type: "invitation-error-set"; message: string | null }
  | { type: "import-preview-started"; fileName: string }
  | { type: "import-preview-loaded"; preview: SpeakerImportPreview }
  | { type: "import-preview-cleared" }
  | { type: "import-preview-busy-changed"; busy: boolean }
  | { type: "import-committed" }
  | { type: "import-commit-busy-changed"; busy: boolean }
  | { type: "task-title-changed"; title: string }
  | { type: "task-due-changed"; dueAt: string }
  | { type: "task-assignee-toggled"; participantId: string }
  | { type: "task-fields-cleared" }
  | { type: "task-busy-changed"; busy: boolean };

const INITIAL_IMPORT_TASK_INVITATION_STATE: ImportTaskInvitationState = {
  importPreview: null,
  importFileName: null,
  taskTitle: "",
  taskDueAt: "",
  taskAssignees: [],
  invitationPreview: null,
  invitationResult: null,
  invitationResultParticipantId: null,
  invitationError: null,
  invitationHistory: [],
  invitationPreviewBusy: false,
  invitationSendBusy: false,
  importPreviewBusy: false,
  importCommitBusy: false,
  taskBusy: false,
};

function importTaskInvitationReducer(
  state: ImportTaskInvitationState,
  action: ImportTaskInvitationAction,
): ImportTaskInvitationState {
  switch (action.type) {
    case "invitation-cleared":
      return {
        ...state,
        invitationPreview: null,
        invitationResult: null,
        invitationResultParticipantId: null,
        invitationError: null,
      };
    case "invitation-preview-started":
      return {
        ...state,
        invitationPreview: null,
        invitationResult: null,
        invitationResultParticipantId: null,
        invitationError: null,
        invitationPreviewBusy: true,
      };
    case "invitation-preview-loaded":
      return { ...state, invitationPreview: action.preview };
    case "invitation-preview-failed":
      return { ...state, invitationError: action.message };
    case "invitation-preview-busy-changed":
      return { ...state, invitationPreviewBusy: action.busy };
    case "invitation-send-started":
      return {
        ...state,
        invitationResult: null,
        invitationResultParticipantId: null,
        invitationError: null,
        invitationSendBusy: true,
      };
    case "invitation-result-recorded":
      return {
        ...state,
        invitationResult: action.result,
        invitationResultParticipantId: action.participantId,
      };
    case "invitation-history-retained":
      return {
        ...state,
        invitationHistory: retainInvitationHistory(
          state.invitationHistory,
          action.preview,
          action.result,
        ),
      };
    case "invitation-send-busy-changed":
      return { ...state, invitationSendBusy: action.busy };
    case "invitation-error-set":
      return { ...state, invitationError: action.message };
    case "import-preview-started":
      return {
        ...state,
        importFileName: action.fileName,
        importPreview: null,
        importPreviewBusy: true,
      };
    case "import-preview-loaded":
      return { ...state, importPreview: action.preview };
    case "import-preview-cleared":
      return { ...state, importPreview: null, importFileName: null };
    case "import-preview-busy-changed":
      return { ...state, importPreviewBusy: action.busy };
    case "import-committed":
      return { ...state, importPreview: null, importFileName: null };
    case "import-commit-busy-changed":
      return { ...state, importCommitBusy: action.busy };
    case "task-title-changed":
      return { ...state, taskTitle: action.title };
    case "task-due-changed":
      return { ...state, taskDueAt: action.dueAt };
    case "task-assignee-toggled":
      return {
        ...state,
        taskAssignees: state.taskAssignees.includes(action.participantId)
          ? state.taskAssignees.filter((candidate) => candidate !== action.participantId)
          : [...state.taskAssignees, action.participantId],
      };
    case "task-fields-cleared":
      return { ...state, taskTitle: "", taskDueAt: "", taskAssignees: [] };
    case "task-busy-changed":
      return { ...state, taskBusy: action.busy };
  }
}

type ProfileHeadshotDetailsState = {
  createDraft: CreateDraft;
  editDraft: EditDraft | null;
  editError: string | null;
  detailBusy: boolean;
  detailNotice: string | null;
  headshotUploadStatus: OrganizerHeadshotUploadStatus;
  headshotUploadMessage: string | null;
  headshotSubmissionId: string | null;
  headshotPreviewUrl: string | null;
  headshotPreviewError: string | null;
  headshotPreviewLoading: boolean;
  headshotPreviewRevision: number;
  headshotPreviewRetry: number;
  headshotAssetsByParticipant: Readonly<Record<string, SpeakerAsset>>;
  downloadUrls: Readonly<Record<string, string>>;
  downloadErrors: Readonly<Record<string, string>>;
  downloadBusyAssetId: string | null;
  saveBusy: boolean;
  profileMutationStatus: SpeakerMutationStatus;
  profileMutationMessage: string | null;
  headshotMutationStatus: SpeakerMutationStatus;
  headshotMutationMessage: string | null;
};

type ProfileHeadshotDetailsAction =
  | { type: "profile-scope-reset" }
  | { type: "create-draft-updated"; field: keyof CreateDraft; value: string | boolean }
  | { type: "create-draft-reset" }
  | { type: "edit-started"; draft: EditDraft }
  | { type: "edit-draft-set"; draft: EditDraft }
  | { type: "edit-draft-updated"; field: keyof CreateDraft; value: string | boolean }
  | { type: "edit-error-set"; message: string | null }
  | { type: "detail-busy-changed"; busy: boolean }
  | { type: "detail-notice-set"; message: string | null }
  | { type: "headshot-session-selected"; submissionId: string | null }
  | {
      type: "headshot-upload-state-changed";
      status: OrganizerHeadshotUploadStatus;
      message: string | null;
    }
  | {
      type: "headshot-mutation-state-changed";
      status: SpeakerMutationStatus;
      message: string | null;
    }
  | {
      type: "profile-mutation-state-changed";
      status: SpeakerMutationStatus;
      message: string | null;
    }
  | { type: "headshot-preview-cleared" }
  | { type: "headshot-preview-started" }
  | { type: "headshot-preview-ready"; url: string }
  | { type: "headshot-preview-error"; message: string }
  | { type: "headshot-preview-finished" }
  | { type: "headshot-preview-retried" }
  | { type: "headshot-preview-marked-failed" }
  | { type: "headshot-asset-linked"; participantId: string; asset: SpeakerAsset }
  | { type: "download-started"; assetId: string }
  | { type: "download-succeeded"; assetId: string; url: string }
  | { type: "download-failed"; assetId: string; message: string }
  | { type: "download-finished"; assetId: string }
  | { type: "save-busy-changed"; busy: boolean }
  | { type: "profile-validation-failed"; message: string }
  | { type: "profile-save-started" }
  | { type: "profile-write-accepted" }
  | { type: "profile-saved"; speaker: SpeakerRecord }
  | { type: "profile-conflict" }
  | { type: "profile-failed"; message: string }
  | { type: "headshot-validation-failed"; message: string }
  | { type: "headshot-unavailable"; message: string }
  | { type: "headshot-session-required"; message: string }
  | { type: "headshot-upload-started"; fileName: string }
  | { type: "headshot-write-accepted" }
  | { type: "headshot-upload-succeeded"; speaker: SpeakerRecord }
  | { type: "headshot-conflict" }
  | { type: "headshot-failed"; message: string };

const INITIAL_PROFILE_HEADSHOT_DETAILS_STATE: ProfileHeadshotDetailsState = {
  createDraft: emptyCreateDraft(),
  editDraft: null,
  editError: null,
  detailBusy: false,
  detailNotice: null,
  headshotUploadStatus: "idle",
  headshotUploadMessage: null,
  headshotSubmissionId: null,
  headshotPreviewUrl: null,
  headshotPreviewError: null,
  headshotPreviewLoading: false,
  headshotPreviewRevision: 0,
  headshotPreviewRetry: 0,
  headshotAssetsByParticipant: {},
  downloadUrls: {},
  downloadErrors: {},
  downloadBusyAssetId: null,
  saveBusy: false,
  profileMutationStatus: "idle",
  profileMutationMessage: null,
  headshotMutationStatus: "idle",
  headshotMutationMessage: null,
};

function profileHeadshotDetailsReducer(
  state: ProfileHeadshotDetailsState,
  action: ProfileHeadshotDetailsAction,
): ProfileHeadshotDetailsState {
  switch (action.type) {
    case "profile-scope-reset":
      return {
        ...state,
        editDraft: null,
        editError: null,
        detailNotice: null,
        headshotAssetsByParticipant: {},
        downloadUrls: {},
        downloadErrors: {},
        profileMutationStatus: "idle",
        profileMutationMessage: null,
        headshotMutationStatus: "idle",
        headshotMutationMessage: null,
        headshotUploadStatus: "idle",
        headshotUploadMessage: null,
      };
    case "create-draft-updated":
      return {
        ...state,
        createDraft: { ...state.createDraft, [action.field]: action.value } as CreateDraft,
      };
    case "create-draft-reset":
      return { ...state, createDraft: emptyCreateDraft() };
    case "edit-started":
      return {
        ...state,
        editDraft: action.draft,
        editError: null,
        profileMutationStatus: "idle",
        profileMutationMessage: null,
        detailNotice: null,
      };
    case "edit-draft-set":
      return { ...state, editDraft: action.draft };
    case "edit-draft-updated":
      return {
        ...state,
        editDraft:
          state.editDraft === null
            ? null
            : ({ ...state.editDraft, [action.field]: action.value } as EditDraft),
      };
    case "edit-error-set":
      return { ...state, editError: action.message };
    case "detail-busy-changed":
      return { ...state, detailBusy: action.busy };
    case "detail-notice-set":
      return { ...state, detailNotice: action.message };
    case "headshot-session-selected":
      return {
        ...state,
        headshotSubmissionId: action.submissionId,
        headshotUploadStatus: "idle",
        headshotUploadMessage: null,
      };
    case "headshot-upload-state-changed":
      return {
        ...state,
        headshotUploadStatus: action.status,
        headshotUploadMessage: action.message,
      };
    case "headshot-mutation-state-changed":
      return {
        ...state,
        headshotMutationStatus: action.status,
        headshotMutationMessage: action.message,
      };
    case "profile-mutation-state-changed":
      return {
        ...state,
        profileMutationStatus: action.status,
        profileMutationMessage: action.message,
      };
    case "headshot-preview-cleared":
      return {
        ...state,
        headshotPreviewUrl: null,
        headshotPreviewError: null,
        headshotPreviewLoading: false,
      };
    case "headshot-preview-started":
      return {
        ...state,
        headshotPreviewUrl: null,
        headshotPreviewError: null,
        headshotPreviewLoading: true,
      };
    case "headshot-preview-ready":
      return {
        ...state,
        headshotPreviewUrl: action.url,
        headshotPreviewRevision: state.headshotPreviewRevision + 1,
      };
    case "headshot-preview-error":
      return { ...state, headshotPreviewError: action.message };
    case "headshot-preview-finished":
      return { ...state, headshotPreviewLoading: false };
    case "headshot-preview-retried":
      return { ...state, headshotPreviewRetry: state.headshotPreviewRetry + 1 };
    case "headshot-preview-marked-failed":
      return {
        ...state,
        headshotPreviewUrl: null,
        headshotPreviewLoading: false,
        headshotPreviewError: "The secure headshot preview could not be rendered.",
      };
    case "headshot-asset-linked":
      return {
        ...state,
        headshotAssetsByParticipant: {
          ...state.headshotAssetsByParticipant,
          [action.participantId]: action.asset,
        },
      };
    case "download-started": {
      const { [action.assetId]: _previousError, ...remaining } = state.downloadErrors;
      return { ...state, downloadBusyAssetId: action.assetId, downloadErrors: remaining };
    }
    case "download-succeeded":
      return {
        ...state,
        downloadUrls: { ...state.downloadUrls, [action.assetId]: action.url },
      };
    case "download-failed":
      return {
        ...state,
        downloadErrors: { ...state.downloadErrors, [action.assetId]: action.message },
      };
    case "download-finished":
      return {
        ...state,
        downloadBusyAssetId:
          state.downloadBusyAssetId === action.assetId ? null : state.downloadBusyAssetId,
      };
    case "save-busy-changed":
      return { ...state, saveBusy: action.busy };
    case "profile-validation-failed":
      return {
        ...state,
        editError: action.message,
        profileMutationStatus: "failure",
        profileMutationMessage: action.message,
      };
    case "profile-save-started":
      return {
        ...state,
        saveBusy: true,
        profileMutationStatus: "saving",
        profileMutationMessage: "Saving speaker profile…",
        editError: null,
      };
    case "profile-write-accepted":
      return {
        ...state,
        profileMutationStatus: "pending",
        profileMutationMessage: "Profile write accepted. Reloading authoritative speaker data…",
      };
    case "profile-saved":
      return {
        ...state,
        editDraft: editDraftFor(action.speaker),
        profileMutationStatus: "saved",
        profileMutationMessage: `Saved at revision ${action.speaker.version}.`,
      };
    case "profile-conflict":
      return {
        ...state,
        profileMutationStatus: "conflict",
        profileMutationMessage: "Conflict detected. Authoritative speaker data was reloaded.",
      };
    case "profile-failed":
      return {
        ...state,
        profileMutationStatus: "failure",
        profileMutationMessage: action.message,
        editError: action.message,
      };
    case "headshot-validation-failed":
    case "headshot-unavailable":
      return {
        ...state,
        headshotUploadStatus: "error",
        headshotUploadMessage: action.message,
        headshotMutationStatus: "failure",
        headshotMutationMessage: action.message,
      };
    case "headshot-session-required":
      return { ...state, headshotUploadStatus: "error", headshotUploadMessage: action.message };
    case "headshot-upload-started":
      return {
        ...state,
        headshotUploadStatus: "busy",
        headshotMutationStatus: "saving",
        headshotMutationMessage: `Uploading ${action.fileName}…`,
        headshotUploadMessage: `Uploading ${action.fileName}…`,
      };
    case "headshot-write-accepted":
      return {
        ...state,
        headshotMutationStatus: "pending",
        headshotMutationMessage: "Headshot write accepted. Reloading authoritative speaker data…",
        headshotUploadMessage: "Upload accepted. Reloading speaker data…",
      };
    case "headshot-upload-succeeded":
      return {
        ...state,
        editDraft: editDraftFor(action.speaker),
        headshotPreviewUrl: null,
        headshotPreviewError: null,
        headshotPreviewRevision: state.headshotPreviewRevision + 1,
        headshotUploadStatus: "success",
        headshotMutationStatus: "saved",
        headshotMutationMessage: `Saved at revision ${action.speaker.version}.`,
        headshotUploadMessage: `Headshot uploaded for ${action.speaker.displayName}.`,
      };
    case "headshot-conflict":
      return {
        ...state,
        headshotMutationStatus: "conflict",
        headshotMutationMessage: "Conflict detected. Authoritative speaker data was reloaded.",
        headshotUploadStatus: "error",
        headshotUploadMessage: "Headshot upload conflicted; review the reloaded speaker data.",
      };
    case "headshot-failed":
      return {
        ...state,
        headshotMutationStatus: "failure",
        headshotMutationMessage: action.message,
        headshotUploadStatus: "error",
        headshotUploadMessage: action.message,
      };
  }
}

export function SpeakerWorkspaceController({
  organizationId,
  eventId,
  api: providedApi,
}: SpeakerWorkspaceProps) {
  const apiResolution = useMemo(() => {
    if (providedApi !== undefined) return { api: providedApi, error: null };
    try {
      return { api: createSpeakerApi("", organizationId, eventId), error: null };
    } catch (reason: unknown) {
      return { api: null, error: errorMessage(reason) };
    }
  }, [eventId, organizationId, providedApi]);
  const api = apiResolution.api;
  const [rosterState, dispatchRoster] = useReducer(rosterScopeReducer, INITIAL_ROSTER_SCOPE_STATE);
  const {
    activeView,
    roster,
    progress,
    loading,
    error,
    progressError,
    notice,
    selectedId,
    selectedSpeakerIds,
    reminderEligibility,
    secondarySectionsReady,
    visibleProgressContext,
    query,
    statusFilter,
    sessionFilter,
    progressFilter,
    attentionFilter,
    filtersOpen,
    showAdd,
    showCsv,
  } = rosterState;
  const [emailState, dispatchEmail] = useReducer(emailReducer, INITIAL_EMAIL_STATE);
  const {
    emailTemplates,
    emailTemplateId,
    emailTemplateVersion,
    emailTemplateName,
    emailSubject,
    emailHtml,
    emailText,
    emailPreview,
    emailEditorMode,
    emailConfirmOpen,
    emailSends,
    emailSaveBusy,
    emailPreviewBusy,
    emailSendBusy,
    emailHistoryBusy,
    emailNotice,
  } = emailState;
  const [importTaskInvitationState, dispatchImportTaskInvitation] = useReducer(
    importTaskInvitationReducer,
    INITIAL_IMPORT_TASK_INVITATION_STATE,
  );
  const {
    importPreview,
    importFileName,
    taskTitle,
    taskDueAt,
    taskAssignees,
    invitationPreview,
    invitationResult,
    invitationResultParticipantId,
    invitationError,
    invitationHistory,
    invitationPreviewBusy,
    invitationSendBusy,
    importPreviewBusy,
    importCommitBusy,
    taskBusy,
  } = importTaskInvitationState;
  const [profileHeadshotDetailsState, dispatchProfileHeadshotDetails] = useReducer(
    profileHeadshotDetailsReducer,
    INITIAL_PROFILE_HEADSHOT_DETAILS_STATE,
  );
  const {
    createDraft,
    editDraft,
    editError,
    detailBusy,
    detailNotice,
    headshotUploadStatus,
    headshotUploadMessage,
    headshotSubmissionId,
    headshotPreviewUrl,
    headshotPreviewError,
    headshotPreviewLoading,
    headshotPreviewRevision,
    headshotPreviewRetry,
    headshotAssetsByParticipant,
    downloadUrls,
    downloadErrors,
    downloadBusyAssetId,
    saveBusy,
    profileMutationStatus,
    profileMutationMessage,
    headshotMutationStatus,
    headshotMutationMessage,
  } = profileHeadshotDetailsState;
  const emailSendIdempotencyKeyRef = useRef<string | null>(null);
  const emailCreateTemplateIdRef = useRef<string | null>(null);
  const createIdempotencyKeyRef = useRef<string | null>(null);
  const importIdempotencyKeyRef = useRef<string | null>(null);
  const invitationSendIdempotencyKeyRef = useRef<string | null>(null);
  const rosterRequestRef = useRef(0);
  const headshotRequestRef = useRef(0);
  const headshotPreviewKeyRef = useRef<string | null>(null);
  const headshotPreviewApiRef = useRef<SpeakerApi | null>(null);
  const headshotPreviewRequestDataRef = useRef<{
    participantId: string | undefined;
    assetId: string | null | undefined;
    asset: SpeakerAsset | null;
  }>({ participantId: undefined, assetId: undefined, asset: null });
  const secondarySectionsReadyKeyRef = useRef<string | null>(null);
  const importRequestRef = useRef(0);
  const emailSelectionSnapshotRef = useRef<string | null>(null);
  useEffect(() => {
    if (organizationId.length === 0 || eventId.length === 0) return;
    rosterRequestRef.current += 1;
    dispatchRoster({ type: "roster-scope-reset" });
    dispatchProfileHeadshotDetails({ type: "profile-scope-reset" });
    secondaryLoadRef.current = null;
    progressLoadRef.current = null;
  }, [eventId, organizationId]);
  const emailPreviewRequestRef = useRef(0);
  const secondaryLoadRef = useRef<{ api: SpeakerApi; key: string } | null>(null);
  const progressLoadRef = useRef<{ api: SpeakerApi; key: string; requestId: number } | null>(null);
  const emailSectionRef = useRef<HTMLDivElement | null>(null);
  const reminderSectionRef = useRef<HTMLDivElement | null>(null);
  const importBusy = importPreviewBusy || importCommitBusy;
  useEffect(() => {
    if (apiResolution.error !== null) {
      dispatchRoster({ type: "api-error-set", message: apiResolution.error });
    }
  }, [apiResolution.error]);
  useEffect(() => {
    if (api === null) {
      dispatchRoster({ type: "loading-changed", loading: false });
      return;
    }
    const requestId = rosterRequestRef.current + 1;
    rosterRequestRef.current = requestId;
    const controller = new AbortController();
    let active = true;
    let rosterTimedOut = false;
    const rosterTimeout = setTimeout(() => {
      rosterTimedOut = true;
      controller.abort();
    }, ASYNC_ACTION_TIMEOUT_MS);
    dispatchRoster({ type: "roster-load-started" });
    dispatchImportTaskInvitation({ type: "invitation-cleared" });
    invitationSendIdempotencyKeyRef.current = null;
    void api
      .list(controller.signal)
      .then((nextRoster) => {
        const normalizedRoster = normalizeRoster(nextRoster, organizationId, eventId);
        if (!active || requestId !== rosterRequestRef.current) return;
        dispatchRoster({ type: "roster-loaded", roster: normalizedRoster });
      })
      .catch((reason: unknown) => {
        if (!active || requestId !== rosterRequestRef.current) return;
        dispatchRoster({
          type: "roster-load-failed",
          message: rosterTimedOut
            ? "Speaker roster refresh timed out. Try again."
            : errorMessage(reason),
          clearRoster: true,
        });
      })
      .finally(() => {
        clearTimeout(rosterTimeout);
        if (active && requestId === rosterRequestRef.current) {
          dispatchRoster({ type: "loading-changed", loading: false });
        }
      });
    return () => {
      active = false;
      controller.abort();
      clearTimeout(rosterTimeout);
    };
  }, [api, eventId, organizationId]);
  const secondaryContextKey = `${organizationId}:${eventId}`;
  const progressSectionVisible =
    activeView === "tasks" || visibleProgressContext === secondaryContextKey;
  useEffect(() => {
    if (
      api === null ||
      roster === null ||
      loading ||
      !progressSectionVisible ||
      roster.organizationId !== organizationId ||
      roster.eventId !== eventId
    ) {
      return;
    }
    const requestId = rosterRequestRef.current;
    const currentRequest = progressLoadRef.current;
    if (
      currentRequest?.api === api &&
      currentRequest.key === secondaryContextKey &&
      currentRequest.requestId === requestId
    ) {
      return;
    }
    const request = { api, key: secondaryContextKey, requestId };
    progressLoadRef.current = request;
    const controller = new AbortController();
    let active = true;
    let settled = false;
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, ASYNC_ACTION_TIMEOUT_MS);
    dispatchRoster({ type: "progress-load-started" });
    void speakerProgressFor(api, roster.speakers, organizationId, eventId, controller.signal)
      .then((nextProgress) => {
        if (!active || requestId !== rosterRequestRef.current) return;
        dispatchRoster({ type: "progress-loaded", progress: nextProgress });
      })
      .catch((reason: unknown) => {
        if (!active || requestId !== rosterRequestRef.current) return;
        dispatchRoster({
          type: "progress-load-failed",
          message: timedOut
            ? "Speaker progress refresh timed out. Try again."
            : errorMessage(reason),
        });
      })
      .finally(() => {
        settled = true;
        clearTimeout(timeoutId);
      });
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timeoutId);
      if (!settled && progressLoadRef.current === request) progressLoadRef.current = null;
    };
  }, [api, eventId, loading, organizationId, progressSectionVisible, roster, secondaryContextKey]);
  const secondarySectionsVisible =
    activeView === "tasks" ||
    activeView === "email" ||
    (secondarySectionsReady && secondarySectionsReadyKeyRef.current === secondaryContextKey);
  useEffect(() => {
    if (secondarySectionsVisible) return;
    const sections = [emailSectionRef.current, reminderSectionRef.current].filter(
      (section): section is HTMLDivElement => section !== null,
    );
    if (sections.length === 0) return;
    if (typeof IntersectionObserver === "undefined") {
      secondarySectionsReadyKeyRef.current = secondaryContextKey;
      dispatchRoster({ type: "secondary-ready" });
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        secondarySectionsReadyKeyRef.current = secondaryContextKey;
        dispatchRoster({ type: "secondary-ready" });
        observer.disconnect();
      },
      { rootMargin: "240px" },
    );
    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [secondaryContextKey, secondarySectionsVisible]);
  const currentSecondaryLoadKey = speakerSecondaryLoadKey(
    roster,
    organizationId,
    eventId,
    loading,
    secondarySectionsVisible,
  );
  useEffect(() => {
    const loadKey = currentSecondaryLoadKey;
    if (api === null || loadKey === null) return;
    if (secondaryLoadRef.current?.api === api && secondaryLoadRef.current.key === loadKey) return;
    secondaryLoadRef.current = { api, key: loadKey };
    let active = true;
    void withTimeout((signal) => api.listEmailTemplates(signal), "Email template load")
      .then((templates) => {
        if (!active) return;
        dispatchEmail({ type: "email-templates-loaded", templates });
      })
      .catch(() => undefined);
    void withTimeout((signal) => api.listEmailHistory(signal), "Email history load")
      .then((history) => {
        if (active) dispatchEmail({ type: "email-sends-loaded", sends: history });
      })
      .catch(() => undefined);
    void withTimeout(
      (signal) => api.getReminderEligibility({}, signal),
      "Reminder eligibility load",
    )
      .then((eligibility) => {
        if (active) dispatchRoster({ type: "reminder-loaded", eligibility });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api, currentSecondaryLoadKey]);
  const scopedRoster =
    roster !== null && roster.organizationId === organizationId && roster.eventId === eventId
      ? roster
      : null;
  const scopedProgress =
    progress !== null && progress.organizationId === organizationId && progress.eventId === eventId
      ? progress
      : null;
  const speakers = useMemo(() => scopedRoster?.speakers ?? [], [scopedRoster]);
  const rosterEmpty = !loading && scopedRoster !== null && speakers.length === 0;
  const selectedSpeakerIdSet = useMemo(() => new Set(selectedSpeakerIds), [selectedSpeakerIds]);
  const emailPreviewRecipientIdSet = useMemo(
    () => new Set(emailPreview?.recipientIds ?? []),
    [emailPreview?.recipientIds],
  );
  const taskAssigneeIdSet = useMemo(() => new Set(taskAssignees), [taskAssignees]);
  const selectedSpeaker = speakers.find((speaker) => speaker.participantId === selectedId) ?? null;
  const eligibleHeadshotSessions = useMemo(
    () => (selectedSpeaker === null ? [] : acceptedSpeakerSessions(selectedSpeaker.sessions)),
    [selectedSpeaker],
  );
  const selectedHeadshotSubmissionId = organizerHeadshotSubmissionId(
    selectedSpeaker?.sessions ?? [],
    headshotSubmissionId,
  );
  const cachedHeadshotAsset =
    selectedSpeaker === null
      ? null
      : (headshotAssetsByParticipant[selectedSpeaker.participantId] ?? null);
  const selectedHeadshotAsset =
    selectedSpeaker === null || selectedSpeaker.headshotAssetId === null
      ? null
      : (selectedSpeaker.assets.find(
          (asset) => asset.assetId === selectedSpeaker.headshotAssetId,
        ) ??
        (cachedHeadshotAsset?.assetId === selectedSpeaker.headshotAssetId
          ? cachedHeadshotAsset
          : null));
  const duplicateEmailWarnings = useMemo(() => duplicateEmailConflicts(speakers), [speakers]);
  const emailAnyBusy = emailSaveBusy || emailPreviewBusy || emailSendBusy || emailHistoryBusy;
  const selectedEmailTemplate = emailTemplates.find(
    (template) => template.id === emailTemplateId && template.version === emailTemplateVersion,
  );
  const statusOptions = useMemo(() => {
    const values = new Set<string>([
      ...DEFAULT_STATUS_OPTIONS,
      ...speakers.map((speaker) => speaker.status),
    ]);
    return [...values];
  }, [speakers]);
  const sessionOptions = useMemo(() => {
    const values = new Map<string, string>();
    for (const speaker of speakers) {
      for (const session of speaker.sessions) {
        values.set(session.submissionId, session.title);
      }
    }
    return [...values.entries()].sort((left, right) => left[1].localeCompare(right[1]));
  }, [speakers]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredSpeakers = useMemo(
    () =>
      filterSpeakerRoster(
        filterSpeakersByAttention(speakers, attentionFilter),
        scopedProgress?.rows ?? [],
        { query, status: statusFilter, session: sessionFilter, progress: progressFilter },
      ),
    [
      attentionFilter,
      progressFilter,
      query,
      scopedProgress?.rows,
      sessionFilter,
      speakers,
      statusFilter,
    ],
  );
  const attentionCounts = useMemo(
    () => ({
      all: speakers.length,
      overdue: filterSpeakersByAttention(speakers, "overdue").length,
      "awaiting-invite": filterSpeakersByAttention(speakers, "awaiting-invite").length,
      "duplicate-email": filterSpeakersByAttention(speakers, "duplicate-email").length,
      inactive: filterSpeakersByAttention(speakers, "inactive").length,
    }),
    [speakers],
  );
  const progressRows = useMemo(
    () =>
      (scopedProgress?.rows ?? []).filter((row) =>
        speakerProgressMatches(row.tasks, progressFilter),
      ),
    [scopedProgress?.rows, progressFilter],
  );
  const onboardingTaskDefinitions = useMemo(
    () => speakerOnboardingTaskDefinitions(scopedProgress?.rows ?? []),
    [scopedProgress?.rows],
  );
  const eligibleReminderItems = useMemo(
    () => reminderEligibility?.items.filter((item) => item.eligible) ?? [],
    [reminderEligibility],
  );
  const ineligibleReminderItems = useMemo(
    () => reminderEligibility?.items.filter((item) => !item.eligible) ?? [],
    [reminderEligibility],
  );
  const selectedInvitationPreview =
    selectedSpeaker === null
      ? []
      : (invitationPreview ?? []).filter(
          (preview) => preview.participantId === selectedSpeaker.participantId,
        );
  const invitationPreviewCount = selectedInvitationPreview.length;
  const invitationReady =
    selectedSpeaker !== null && speakerInvitationReady(invitationPreview ?? [], selectedSpeaker);
  const selectedInvitationResultRecipient =
    selectedSpeaker === null ||
    invitationResult === null ||
    invitationResultParticipantId !== selectedSpeaker.participantId
      ? null
      : (invitationResult.recipients.find(
          (recipient) => recipient.participantId === selectedSpeaker.participantId,
        ) ?? null);
  const hasActiveRosterFilters =
    normalizedQuery.length > 0 ||
    statusFilter !== "all" ||
    sessionFilter !== "all" ||
    progressFilter !== "all";
  const selectedVisibleSpeakerIds = filteredSpeakers.reduce<string[]>((selected, speaker) => {
    if (selectedSpeakerIdSet.has(speaker.participantId)) selected.push(speaker.participantId);
    return selected;
  }, []);
  const allVisibleSelected =
    filteredSpeakers.length > 0 && selectedVisibleSpeakerIds.length === filteredSpeakers.length;
  const emailPreviewCurrent =
    emailPreview !== null &&
    emailPreview.organizationId === organizationId &&
    emailPreview.eventId === eventId &&
    emailPreview.templateId === emailTemplateId &&
    emailPreview.templateVersion === emailTemplateVersion &&
    emailPreview.recipientIds.length === selectedSpeakerIds.length &&
    selectedSpeakerIds.every((participantId) => emailPreviewRecipientIdSet.has(participantId));
  const invalidateEmailPreview = useCallback(() => {
    emailPreviewRequestRef.current += 1;
    dispatchEmail({ type: "email-preview-invalidated" });
  }, []);
  useEffect(() => {
    const snapshot = [...selectedSpeakerIds].sort().join("\u0000");
    const previous = emailSelectionSnapshotRef.current;
    if (previous !== null && previous !== snapshot) invalidateEmailPreview();
    emailSelectionSnapshotRef.current = snapshot;
  }, [invalidateEmailPreview, selectedSpeakerIds]);
  useEffect(() => {
    if (headshotPreviewApiRef.current === api) return;
    headshotPreviewApiRef.current = api;
    headshotPreviewKeyRef.current = null;
  }, [api]);
  const headshotPreviewRequestKey = organizerHeadshotPreviewRequestKey(
    0,
    headshotPreviewRetry,
    selectedSpeaker?.participantId,
    selectedSpeaker?.headshotAssetId,
    selectedHeadshotAsset,
  );
  useLayoutEffect(() => {
    headshotPreviewRequestDataRef.current = {
      participantId: selectedSpeaker?.participantId,
      assetId: selectedSpeaker?.headshotAssetId,
      asset: selectedHeadshotAsset,
    };
  }, [selectedHeadshotAsset, selectedSpeaker?.headshotAssetId, selectedSpeaker?.participantId]);
  useEffect(() => {
    const {
      participantId,
      assetId,
      asset: selectedHeadshotAsset,
    } = headshotPreviewRequestDataRef.current;
    const requestKey = headshotPreviewRequestKey;
    const requestId = headshotRequestRef.current + 1;
    headshotRequestRef.current = requestId;
    let active = true;
    if (api === null || participantId === undefined || assetId === undefined || assetId === null) {
      headshotPreviewKeyRef.current = null;
      dispatchProfileHeadshotDetails({ type: "headshot-preview-cleared" });
      return () => {
        active = false;
      };
    }
    if (requestKey !== null && requestKey === headshotPreviewKeyRef.current) {
      return () => {
        active = false;
      };
    }
    headshotPreviewKeyRef.current = requestKey;
    dispatchProfileHeadshotDetails({ type: "headshot-preview-started" });
    void (async () => {
      try {
        if (selectedHeadshotAsset === null) {
          const assets = await withTimeout(
            (signal) => api.getAssets(participantId, signal),
            "Headshot metadata load",
          );
          if (!active || requestId !== headshotRequestRef.current) return;
          const linked = assets.find((asset) => asset.assetId === assetId);
          if (linked === undefined) {
            dispatchProfileHeadshotDetails({
              type: "headshot-preview-error",
              message: "The linked headshot file is unavailable.",
            });
            return;
          }
          dispatchProfileHeadshotDetails({
            type: "headshot-asset-linked",
            participantId,
            asset: linked,
          });
          return;
        }
        if (selectedHeadshotAsset.status !== "ready") {
          throw new Error("The linked headshot is not ready yet.");
        }
        const contentType = selectedHeadshotAsset.contentType.trim().toLowerCase();
        if (
          !ORGANIZER_HEADSHOT_ACCEPTED_TYPES.includes(
            contentType as (typeof ORGANIZER_HEADSHOT_ACCEPTED_TYPES)[number],
          )
        ) {
          throw new Error("The linked asset is not a supported headshot image.");
        }
        const grant = await withTimeout(
          (signal) => api.getDownloadGrant(selectedHeadshotAsset.assetId, signal),
          "Headshot preview",
        );
        const previewPath = organizerHeadshotPreviewPath(grant.url);
        if (previewPath === null) {
          throw new Error("The private headshot preview did not return a same-origin API path.");
        }
        if (!active || requestId !== headshotRequestRef.current) return;
        dispatchProfileHeadshotDetails({ type: "headshot-preview-ready", url: previewPath });
      } catch (reason: unknown) {
        if (active && requestId === headshotRequestRef.current) {
          dispatchProfileHeadshotDetails({
            type: "headshot-preview-error",
            message: errorMessage(reason),
          });
        }
      } finally {
        if (active && requestId === headshotRequestRef.current) {
          dispatchProfileHeadshotDetails({ type: "headshot-preview-finished" });
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [api, headshotPreviewRequestKey]);
  function clearRosterFilters(): void {
    dispatchRoster({ type: "filters-cleared" });
  }
  function openSelectedEmail(): void {
    dispatchRoster({ type: "view-changed", view: "email" });
  }
  function toggleSpeakerSelection(participantId: string): void {
    dispatchRoster({ type: "selection-toggled", participantId });
    invalidateEmailPreview();
    dispatchEmail({ type: "email-notice-set", message: null });
  }
  function toggleVisibleSpeakerSelection(): void {
    const visibleIds = filteredSpeakers.map((speaker) => speaker.participantId);
    dispatchRoster({ type: "visible-selection-toggled", participantIds: visibleIds });
    invalidateEmailPreview();
    dispatchEmail({ type: "email-notice-set", message: null });
  }
  function clearSpeakerSelection(): void {
    dispatchRoster({ type: "selection-set", participantIds: [] });
    invalidateEmailPreview();
    dispatchEmail({ type: "email-notice-set", message: null });
  }
  function updateCreate(field: keyof CreateDraft, value: string | boolean): void {
    dispatchProfileHeadshotDetails({ type: "create-draft-updated", field, value });
    createIdempotencyKeyRef.current = null;
    dispatchRoster({ type: "notice-set", message: null });
  }
  function updateEdit(field: keyof CreateDraft, value: string | boolean): void {
    dispatchProfileHeadshotDetails({ type: "edit-draft-updated", field, value });
    dispatchProfileHeadshotDetails({ type: "edit-error-set", message: null });
    dispatchProfileHeadshotDetails({
      type: "profile-mutation-state-changed",
      status: "idle",
      message: null,
    });
    dispatchRoster({ type: "notice-set", message: null });
    dispatchImportTaskInvitation({ type: "invitation-cleared" });
    invitationSendIdempotencyKeyRef.current = null;
  }
  function applyAuthoritativeRoster(nextRoster: SpeakerRosterEnvelope, message?: string): void {
    try {
      const normalizedRoster = normalizeRoster(nextRoster, organizationId, eventId);
      const requestId = rosterRequestRef.current + 1;
      rosterRequestRef.current = requestId;
      dispatchRoster({ type: "roster-authoritative-applied", roster: normalizedRoster, message });
      dispatchImportTaskInvitation({ type: "invitation-cleared" });
      if (api !== null) {
        const progressController = new AbortController();
        let progressTimedOut = false;
        const progressTimeout = setTimeout(() => {
          progressTimedOut = true;
          progressController.abort();
        }, ASYNC_ACTION_TIMEOUT_MS);
        void speakerProgressFor(
          api,
          normalizedRoster.speakers,
          organizationId,
          eventId,
          progressController.signal,
        )
          .then((nextProgress) => {
            if (requestId !== rosterRequestRef.current) return;
            dispatchRoster({ type: "progress-loaded", progress: nextProgress });
          })
          .catch((reason: unknown) => {
            if (requestId !== rosterRequestRef.current) return;
            dispatchRoster({
              type: "progress-load-failed",
              message: progressTimedOut
                ? "Speaker progress refresh timed out. Try again."
                : errorMessage(reason),
            });
          })
          .finally(() => {
            clearTimeout(progressTimeout);
          });
      }
    } catch (reason: unknown) {
      dispatchRoster({
        type: "roster-load-failed",
        message: errorMessage(reason),
        clearRoster: true,
      });
    }
  }
  async function reload(message?: string): Promise<SpeakerRosterEnvelope | null> {
    if (api === null) {
      dispatchRoster({ type: "api-error-set", message: "The speaker API is unavailable." });
      return null;
    }
    const requestId = rosterRequestRef.current + 1;
    rosterRequestRef.current = requestId;
    const controller = new AbortController();
    let rosterTimedOut = false;
    const rosterTimeout = setTimeout(() => {
      rosterTimedOut = true;
      controller.abort();
    }, ASYNC_ACTION_TIMEOUT_MS);
    dispatchRoster({ type: "roster-load-started" });
    dispatchImportTaskInvitation({ type: "invitation-cleared" });
    invitationSendIdempotencyKeyRef.current = null;
    try {
      const nextRoster = normalizeRoster(
        await api.list(controller.signal),
        organizationId,
        eventId,
      );
      if (requestId !== rosterRequestRef.current) return null;
      dispatchRoster({ type: "roster-loaded", roster: nextRoster });
      if (message) dispatchRoster({ type: "notice-set", message });
      const progressController = new AbortController();
      let progressTimedOut = false;
      const progressTimeout = setTimeout(() => {
        progressTimedOut = true;
        progressController.abort();
      }, ASYNC_ACTION_TIMEOUT_MS);
      void speakerProgressFor(
        api,
        nextRoster.speakers,
        organizationId,
        eventId,
        progressController.signal,
      )
        .then((nextProgress) => {
          if (requestId !== rosterRequestRef.current) return;
          dispatchRoster({ type: "progress-loaded", progress: nextProgress });
        })
        .catch((reason: unknown) => {
          if (requestId !== rosterRequestRef.current) return;
          dispatchRoster({
            type: "progress-load-failed",
            message: progressTimedOut
              ? "Speaker progress refresh timed out. Try again."
              : errorMessage(reason),
          });
        })
        .finally(() => {
          clearTimeout(progressTimeout);
        });
      return nextRoster;
    } catch (reason: unknown) {
      if (requestId === rosterRequestRef.current) {
        if (
          reason instanceof Error &&
          /different organization|different event|invalid|duplicate participant/iu.test(
            reason.message,
          )
        ) {
          dispatchRoster({
            type: "roster-load-failed",
            message: rosterTimedOut
              ? "Speaker roster refresh timed out. Try again."
              : errorMessage(reason),
            clearRoster:
              reason instanceof Error &&
              /different organization|different event|invalid|duplicate participant/iu.test(
                reason.message,
              ),
          });
        }
      }
      return null;
    } finally {
      clearTimeout(rosterTimeout);
      if (requestId === rosterRequestRef.current) {
        dispatchRoster({ type: "loading-changed", loading: false });
      }
    }
  }
  async function createSpeaker(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (api === null) {
      dispatchRoster({
        type: "notice-set",
        message: "Speaker creation is unavailable until the organizer speaker API is configured.",
      });
      return;
    }
    const idempotencyKey = createIdempotencyKeyRef.current ?? crypto.randomUUID();
    createIdempotencyKeyRef.current = idempotencyKey;
    const input: SpeakerCreateInput = {
      idempotencyKey,
      displayName: createDraft.displayName.trim(),
      email: createDraft.email.trim(),
      jobTitle: createDraft.title.trim(),
      company: createDraft.company.trim(),
      biography: createDraft.biography.trim(),
      socialLinks: socialLinksFor(createDraft),
      travelLogistics: travelLogisticsFor(createDraft),
      status: createDraft.status,
    };
    if (!input.displayName || !input.email) {
      dispatchRoster({ type: "notice-set", message: "Name and email are required." });
      return;
    }
    dispatchProfileHeadshotDetails({ type: "save-busy-changed", busy: true });
    dispatchRoster({ type: "notice-set", message: null });
    try {
      const created = await api.create(input);
      dispatchProfileHeadshotDetails({ type: "create-draft-reset" });
      createIdempotencyKeyRef.current = null;
      dispatchRoster({ type: "add-dialog-changed", open: false });
      applyAuthoritativeRoster(created, "Speaker added to the roster.");
    } catch (reason: unknown) {
      dispatchRoster({ type: "notice-set", message: errorMessage(reason) });
    } finally {
      dispatchProfileHeadshotDetails({ type: "save-busy-changed", busy: false });
    }
  }
  function beginEdit(speaker: SpeakerRecord): void {
    dispatchRoster({ type: "selected-id-changed", participantId: speaker.participantId });
    dispatchProfileHeadshotDetails({ type: "headshot-session-selected", submissionId: null });
    dispatchProfileHeadshotDetails({
      type: "headshot-upload-state-changed",
      status: "idle",
      message: null,
    });
    dispatchProfileHeadshotDetails({
      type: "headshot-mutation-state-changed",
      status: "idle",
      message: null,
    });
    dispatchProfileHeadshotDetails({ type: "edit-started", draft: editDraftFor(speaker) });
    dispatchImportTaskInvitation({ type: "invitation-cleared" });
    invitationSendIdempotencyKeyRef.current = null;
  }
  async function saveSpeaker(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (api === null || editDraft === null || selectedSpeaker === null) return;
    const participantId = selectedSpeaker.participantId;
    const expectedVersion = editDraft.expectedVersion;
    const input: SpeakerUpdateInput = {
      expectedVersion,
      displayName: editDraft.displayName.trim(),
      email: editDraft.email.trim(),
      jobTitle: editDraft.title.trim(),
      company: editDraft.company.trim(),
      biography: editDraft.biography.trim(),
      socialLinks: socialLinksFor(editDraft),
      travelLogistics: travelLogisticsFor(editDraft),
      status: editDraft.status,
    };
    if (!input.displayName || !input.email) {
      dispatchProfileHeadshotDetails({
        type: "profile-validation-failed",
        message: "Name and email are required.",
      });
      return;
    }
    dispatchImportTaskInvitation({ type: "invitation-cleared" });
    invitationSendIdempotencyKeyRef.current = null;
    dispatchProfileHeadshotDetails({ type: "profile-save-started" });
    try {
      const updatedRoster = assertSpeakerRosterScope(
        await api.update(participantId, input),
        organizationId,
        eventId,
      );
      const updated = updatedRoster.speakers.find(
        (speaker) => speaker.participantId === participantId,
      );
      if (updated === undefined) {
        throw new TypeError("The saved speaker is missing from the roster.");
      }
      assertAdvancedSpeakerRevision(updated, participantId, expectedVersion, eventId);
      dispatchProfileHeadshotDetails({ type: "profile-write-accepted" });
      const reloaded = await reload();
      const persisted = reloaded?.speakers.find(
        (speaker) => speaker.participantId === participantId,
      );
      if (persisted === undefined) {
        throw new TypeError("The reloaded speaker is missing from the roster.");
      }
      assertAdvancedSpeakerRevision(persisted, participantId, expectedVersion, eventId);
      dispatchProfileHeadshotDetails({ type: "profile-saved", speaker: persisted });
      dispatchRoster({
        type: "notice-set",
        message: "Speaker profile saved and reloaded from the server.",
      });
    } catch (reason: unknown) {
      const conflict =
        reason instanceof SpeakerApiError &&
        (reason.status === 409 || reason.code === "CONFLICT" || reason.code === "VERSION_CONFLICT");
      if (conflict) {
        dispatchProfileHeadshotDetails({ type: "profile-conflict" });
        const reloaded = await reload();
        const current = reloaded?.speakers.find(
          (speaker) => speaker.participantId === participantId,
        );
        if (current !== undefined) {
          dispatchProfileHeadshotDetails({ type: "edit-draft-set", draft: editDraftFor(current) });
        }
        dispatchProfileHeadshotDetails({
          type: "edit-error-set",
          message: "This speaker changed elsewhere. Review the reloaded values before saving.",
        });
      } else {
        dispatchProfileHeadshotDetails({ type: "profile-failed", message: errorMessage(reason) });
      }
    } finally {
      dispatchProfileHeadshotDetails({ type: "save-busy-changed", busy: false });
    }
  }
  async function previewCsv(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) {
      input.value = "";
      return;
    }
    const requestId = importRequestRef.current + 1;
    importRequestRef.current = requestId;
    input.value = "";
    dispatchImportTaskInvitation({ type: "import-preview-started", fileName: file.name });
    importIdempotencyKeyRef.current = null;
    dispatchRoster({ type: "notice-set", message: null });
    try {
      if (api === null) {
        throw new Error("CSV import is unavailable until the organizer speaker API is configured.");
      }
      const preview = await withTimeout(
        (signal) => api.previewImport(file, signal),
        "CSV validation",
      );
      if (requestId !== importRequestRef.current) return;
      dispatchImportTaskInvitation({ type: "import-preview-loaded", preview });
      importIdempotencyKeyRef.current = crypto.randomUUID();
      dispatchRoster({
        type: "notice-set",
        message: `CSV preview ready: ${preview.validRows.length} valid row${preview.validRows.length === 1 ? "" : "s"}.`,
      });
    } catch (reason: unknown) {
      if (requestId === importRequestRef.current) {
        dispatchRoster({ type: "notice-set", message: errorMessage(reason) });
      }
    } finally {
      if (requestId === importRequestRef.current) {
        dispatchImportTaskInvitation({ type: "import-preview-busy-changed", busy: false });
      }
      if (requestId === importRequestRef.current) input.value = "";
    }
  }
  async function commitCsv(): Promise<void> {
    if (api === null || importPreview === null || importPreview.validRows.length === 0) return;
    const idempotencyKey = importIdempotencyKeyRef.current ?? crypto.randomUUID();
    importIdempotencyKeyRef.current = idempotencyKey;
    dispatchImportTaskInvitation({ type: "import-commit-busy-changed", busy: true });
    dispatchRoster({ type: "notice-set", message: null });
    try {
      const rowCount = importPreview.validRows.length;
      const imported = await withTimeout(
        (signal) => api.commitImport({ rows: importPreview.validRows, idempotencyKey }, signal),
        "CSV import",
      );
      dispatchImportTaskInvitation({ type: "import-committed" });
      importIdempotencyKeyRef.current = null;
      applyAuthoritativeRoster(
        imported,
        `CSV import committed: ${rowCount} valid row${rowCount === 1 ? "" : "s"}.`,
      );
    } catch (reason: unknown) {
      dispatchRoster({ type: "notice-set", message: errorMessage(reason) });
    } finally {
      dispatchImportTaskInvitation({ type: "import-commit-busy-changed", busy: false });
    }
  }
  function toggleAssignee(participantId: string): void {
    dispatchImportTaskInvitation({ type: "task-assignee-toggled", participantId });
  }
  async function assignTask(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (api === null) {
      dispatchRoster({
        type: "notice-set",
        message: "Task assignment is unavailable until the organizer speaker API is configured.",
      });
      return;
    }
    if (progress === null || progressError !== null) {
      dispatchRoster({
        type: "notice-set",
        message: "Wait for API-backed onboarding progress to load before assigning another task.",
      });
      return;
    }
    const draft = {
      title: taskTitle,
      dueAt: taskDueAt,
      participantIds: taskAssignees,
    } satisfies SpeakerOnboardingTaskDraft;
    const validationError = validateSpeakerTaskAssignment(draft, onboardingTaskDefinitions.length);
    if (validationError !== null) {
      dispatchRoster({ type: "notice-set", message: validationError });
      return;
    }
    const input = createSpeakerTaskAssignment(draft);
    dispatchImportTaskInvitation({ type: "task-busy-changed", busy: true });
    dispatchRoster({ type: "notice-set", message: null });
    try {
      const latest = await withTimeout(async (signal) => {
        const latestRoster = normalizeRoster(await api.list(signal), organizationId, eventId);
        const latestProgress = await speakerProgressFor(
          api,
          latestRoster.speakers,
          organizationId,
          eventId,
          signal,
        );
        return { latestRoster, latestProgress };
      }, "Onboarding task preflight");
      dispatchRoster({
        type: "progress-and-roster-loaded",
        roster: mergeProgressSummaries(latest.latestRoster, latest.latestProgress),
        progress: latest.latestProgress,
      });
      dispatchImportTaskInvitation({ type: "invitation-cleared" });
      invitationSendIdempotencyKeyRef.current = null;
      const latestValidationError = validateSpeakerTaskAssignment(
        draft,
        speakerOnboardingTaskDefinitions(latest.latestProgress.rows).length,
      );
      if (latestValidationError !== null) {
        dispatchRoster({ type: "notice-set", message: latestValidationError });
        return;
      }
      const taskEnvelope = await api.assignTasks(input);
      if (taskEnvelope.organizationId !== organizationId || taskEnvelope.eventId !== eventId) {
        throw new TypeError(
          "The speaker task response belongs to a different organization or event.",
        );
      }
      const returnedAssignees = new Set(taskEnvelope.tasks.map((task) => task.participantId));
      if (
        taskEnvelope.tasks.length !== input.participantIds.length ||
        returnedAssignees.size !== input.participantIds.length ||
        input.participantIds.some((participantId) => !returnedAssignees.has(participantId)) ||
        taskEnvelope.tasks.some(
          (task) =>
            task.title !== input.title ||
            task.description !== input.description ||
            task.dueAt !== input.dueAt ||
            task.type !== "general",
        )
      ) {
        throw new TypeError("The speaker task response does not match the selected assignees.");
      }
      dispatchRoster({
        type: "tasks-assigned",
        taskEnvelope,
        fallbackRows: latest.latestProgress.rows,
      });
      dispatchImportTaskInvitation({ type: "task-fields-cleared" });
      void api
        .getReminderEligibility()
        .then((eligibility) => dispatchRoster({ type: "reminder-loaded", eligibility }))
        .catch(() => undefined);
      dispatchRoster({
        type: "notice-set",
        message: "General action task assigned to selected speakers.",
      });
    } catch (reason: unknown) {
      dispatchRoster({ type: "notice-set", message: errorMessage(reason) });
    } finally {
      dispatchImportTaskInvitation({ type: "task-busy-changed", busy: false });
    }
  }
  async function refreshEmailHistory(): Promise<void> {
    if (api === null) {
      dispatchEmail({
        type: "email-notice-set",
        message: "Email history is unavailable until the organizer speaker API is configured.",
      });
      return;
    }
    dispatchEmail({ type: "email-history-busy-changed", busy: true });
    dispatchEmail({ type: "email-notice-set", message: null });
    try {
      const history = await withTimeout(
        (signal) => api.listEmailHistory(signal),
        "Email history refresh",
      );
      dispatchEmail({ type: "email-sends-loaded", sends: history });
      dispatchEmail({
        type: "email-notice-set",
        message: `Email history refreshed: ${history.length} send${history.length === 1 ? "" : "s"}.`,
      });
    } catch (reason: unknown) {
      dispatchEmail({ type: "email-notice-set", message: errorMessage(reason) });
    } finally {
      dispatchEmail({ type: "email-history-busy-changed", busy: false });
    }
  }
  async function saveEmailTemplate(): Promise<SpeakerEmailTemplate | null> {
    if (api === null) {
      dispatchEmail({
        type: "email-notice-set",
        message: "Email templates are unavailable until the organizer speaker API is configured.",
      });
      return null;
    }
    invalidateEmailPreview();
    dispatchEmail({ type: "email-save-busy-changed", busy: true });
    dispatchEmail({ type: "email-notice-set", message: null });
    try {
      const newTemplateId =
        emailCreateTemplateIdRef.current ?? `speaker-email-draft:${crypto.randomUUID()}`;
      if (emailTemplateId.length === 0) emailCreateTemplateIdRef.current = newTemplateId;
      const template = emailTemplateId
        ? await withTimeout(
            (signal) =>
              api.createEmailTemplateVersion(
                {
                  templateId: emailTemplateId,
                  subject: emailSubject,
                  html: emailHtml,
                  text: emailText,
                },
                signal,
              ),
            "Email template save",
          )
        : await withTimeout(
            (signal) =>
              api.createEmailTemplate(
                {
                  templateId: newTemplateId,
                  name: emailTemplateName,
                  subject: emailSubject,
                  html: emailHtml,
                  text: emailText,
                },
                signal,
              ),
            "Email template save",
          );
      dispatchEmail({ type: "email-template-saved", template });
      dispatchEmail({
        type: "email-notice-set",
        message: `Template version ${template.version} saved.`,
      });
      emailSendIdempotencyKeyRef.current = null;
      return template;
    } catch (reason: unknown) {
      dispatchEmail({ type: "email-notice-set", message: errorMessage(reason) });
      return null;
    } finally {
      dispatchEmail({ type: "email-save-busy-changed", busy: false });
    }
  }
  async function previewBulkEmail(): Promise<void> {
    if (api === null) {
      dispatchEmail({
        type: "email-notice-set",
        message: "Bulk email is unavailable until the organizer speaker API is configured.",
      });
      return;
    }
    if (selectedSpeakerIds.length === 0) {
      dispatchEmail({
        type: "email-notice-set",
        message: "Select at least one speaker before previewing an email.",
      });
      return;
    }
    invalidateEmailPreview();
    const requestId = emailPreviewRequestRef.current;
    dispatchEmail({ type: "email-preview-started" });
    dispatchEmail({ type: "email-notice-set", message: null });
    try {
      const recipientIds = [...selectedSpeakerIds];
      let templateId = emailTemplateId;
      let templateVersion = emailTemplateVersion;
      const newTemplateId =
        emailCreateTemplateIdRef.current ?? `speaker-email-draft:${crypto.randomUUID()}`;
      if (templateId.length === 0) emailCreateTemplateIdRef.current = newTemplateId;
      if (templateId.length === 0) {
        const created = await withTimeout(
          (signal) =>
            api.createEmailTemplate(
              {
                templateId: newTemplateId,
                name: emailTemplateName,
                subject: emailSubject,
                html: emailHtml,
                text: emailText,
              },
              signal,
            ),
          "Email template preparation",
        );
        if (requestId !== emailPreviewRequestRef.current) return;
        templateId = created.id;
        templateVersion = created.version;
        dispatchEmail({ type: "email-template-created", template: created });
      }
      const preview = await withTimeout(
        (signal) =>
          api.previewEmails(
            {
              participantIds: recipientIds,
              templateId,
              ...(templateVersion === undefined ? {} : { templateVersion }),
            },
            signal,
          ),
        "Email merge preview",
      );
      if (requestId !== emailPreviewRequestRef.current) return;
      if (preview.organizationId !== organizationId || preview.eventId !== eventId) {
        throw new Error("The email preview belongs to a different event. Create a new preview.");
      }
      dispatchEmail({ type: "email-preview-set", preview });
      dispatchEmail({
        type: "email-template-selected",
        id: preview.templateId,
        version: preview.templateVersion,
        template: null,
      });
      emailCreateTemplateIdRef.current = null;
      emailSendIdempotencyKeyRef.current = null;
      dispatchEmail({
        type: "email-notice-set",
        message: `Merge preview ready for ${preview.recipientIds.length} selected speaker${preview.recipientIds.length === 1 ? "" : "s"}.`,
      });
    } catch (reason: unknown) {
      if (requestId === emailPreviewRequestRef.current) {
        dispatchEmail({ type: "email-notice-set", message: errorMessage(reason) });
      }
    } finally {
      if (requestId === emailPreviewRequestRef.current) {
        dispatchEmail({ type: "email-preview-busy-changed", busy: false });
      }
    }
  }
  async function sendBulkEmail(): Promise<void> {
    if (api === null || !emailPreviewCurrent || emailPreview === null) {
      dispatchEmail({
        type: "email-notice-set",
        message: "Create a current merge preview before queueing the email.",
      });
      dispatchEmail({ type: "email-confirm-changed", open: false });
      return;
    }
    const preview = emailPreview;
    const idempotencyKey = emailSendIdempotencyKeyRef.current ?? crypto.randomUUID();
    emailSendIdempotencyKeyRef.current = idempotencyKey;
    dispatchEmail({ type: "email-send-busy-changed", busy: true });
    dispatchEmail({ type: "email-notice-set", message: null });
    try {
      const send = await withTimeout(
        (signal) => api.sendEmails({ previewId: preview.id, idempotencyKey }, signal),
        "Speaker email queue",
      );
      dispatchEmail({ type: "email-send-recorded", send });
      dispatchEmail({
        type: "email-notice-set",
        message: `Speaker email ${send.status} for ${send.recipientIds.length} recipient${send.recipientIds.length === 1 ? "" : "s"}. Queue history is retained below.`,
      });
    } catch (reason: unknown) {
      dispatchEmail({ type: "email-notice-set", message: errorMessage(reason) });
    } finally {
      dispatchEmail({ type: "email-send-busy-changed", busy: false });
    }
  }
  async function previewSelectedSpeakerInvitation(): Promise<void> {
    if (api === null || selectedSpeaker === null) {
      dispatchImportTaskInvitation({
        type: "invitation-error-set",
        message:
          "Portal invitations are unavailable until the organizer speaker API is configured.",
      });
      return;
    }
    const participantId = selectedSpeaker.participantId;
    dispatchImportTaskInvitation({ type: "invitation-preview-started" });
    invitationSendIdempotencyKeyRef.current = null;
    try {
      const preview = await withTimeout(
        () => api.previewInvitations({ participantIds: [participantId] }),
        "Portal invitation preview",
      );
      if (preview.length !== 1 || preview[0]?.participantId !== participantId) {
        throw new TypeError("The invitation preview does not match the selected speaker.");
      }
      dispatchImportTaskInvitation({ type: "invitation-preview-loaded", preview });
    } catch (reason: unknown) {
      dispatchImportTaskInvitation({
        type: "invitation-preview-failed",
        message: errorMessage(reason),
      });
    } finally {
      dispatchImportTaskInvitation({ type: "invitation-preview-busy-changed", busy: false });
    }
  }
  async function sendSelectedSpeakerInvitation(): Promise<void> {
    if (api === null || selectedSpeaker === null || !invitationReady) {
      dispatchImportTaskInvitation({
        type: "invitation-error-set",
        message: "Preview an eligible portal invitation before sending it.",
      });
      return;
    }
    const participantId = selectedSpeaker.participantId;
    const preview = selectedInvitationPreview;
    const idempotencyKey = invitationSendIdempotencyKeyRef.current ?? crypto.randomUUID();
    invitationSendIdempotencyKeyRef.current = idempotencyKey;
    dispatchImportTaskInvitation({ type: "invitation-send-started" });
    try {
      const result = await withTimeout(
        () =>
          api.sendInvitations({
            participantIds: [participantId],
            templateId: "speaker-welcome",
            idempotencyKey,
          }),
        "Portal invitation send",
      );
      const selectedRecipient = result.recipients.find(
        (recipient) => recipient.participantId === participantId,
      );
      if (selectedRecipient === undefined) {
        throw new TypeError("The invitation result does not include the selected speaker.");
      }
      dispatchImportTaskInvitation({ type: "invitation-result-recorded", participantId, result });
      dispatchImportTaskInvitation({
        type: "invitation-history-retained",
        preview,
        result,
      });
      invitationSendIdempotencyKeyRef.current = null;
    } catch (reason: unknown) {
      dispatchImportTaskInvitation({ type: "invitation-error-set", message: errorMessage(reason) });
    } finally {
      dispatchImportTaskInvitation({ type: "invitation-send-busy-changed", busy: false });
    }
  }
  async function refreshDetails(): Promise<void> {
    if (api === null || selectedSpeaker === null) {
      dispatchProfileHeadshotDetails({
        type: "detail-notice-set",
        message:
          "Session and deliverable details are unavailable until the organizer speaker API is configured.",
      });
      return;
    }
    dispatchProfileHeadshotDetails({ type: "detail-busy-changed", busy: true });
    dispatchProfileHeadshotDetails({ type: "detail-notice-set", message: null });
    try {
      const [sessions, assets] = await Promise.all([
        api.getSessions(selectedSpeaker.participantId),
        api.getAssets(selectedSpeaker.participantId),
      ]);
      dispatchRoster({
        type: "roster-details-refreshed",
        participantId: selectedSpeaker.participantId,
        sessions,
        assets,
        updatedAt: new Date().toISOString(),
      });
      dispatchProfileHeadshotDetails({
        type: "detail-notice-set",
        message: "Session assignments and deliverables refreshed.",
      });
    } catch (reason: unknown) {
      dispatchProfileHeadshotDetails({ type: "detail-notice-set", message: errorMessage(reason) });
    } finally {
      dispatchProfileHeadshotDetails({ type: "detail-busy-changed", busy: false });
    }
  }
  async function requestAssetDownload(asset: SpeakerAsset): Promise<void> {
    if (api === null || asset.status !== "ready" || downloadBusyAssetId !== null) return;
    const assetId = asset.assetId;
    dispatchProfileHeadshotDetails({ type: "download-started", assetId });
    try {
      const grant = await withTimeout(
        (signal) => api.getDownloadGrant(assetId, signal),
        "Asset download",
      );
      if (grant.url.trim().length === 0) {
        throw new Error("The private download capability returned an empty URL.");
      }
      dispatchProfileHeadshotDetails({ type: "download-succeeded", assetId, url: grant.url });
    } catch (reason: unknown) {
      dispatchProfileHeadshotDetails({
        type: "download-failed",
        assetId,
        message: errorMessage(reason),
      });
    } finally {
      dispatchProfileHeadshotDetails({ type: "download-finished", assetId });
    }
  }
  function retryHeadshotPreview(): void {
    dispatchProfileHeadshotDetails({ type: "headshot-preview-retried" });
  }
  function markHeadshotPreviewFailed(): void {
    dispatchProfileHeadshotDetails({ type: "headshot-preview-marked-failed" });
  }
  async function uploadOrganizerHeadshot(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (file === undefined) return;
    const validationError = validateOrganizerHeadshotFile(file);
    if (validationError !== null) {
      dispatchProfileHeadshotDetails({
        type: "headshot-validation-failed",
        message: validationError,
      });
      return;
    }
    if (api === null || selectedSpeaker === null || api.replaceHeadshot === undefined) {
      const message =
        "Organizer headshot upload is unavailable until the private upload API is provisioned.";
      dispatchProfileHeadshotDetails({ type: "headshot-unavailable", message });
      return;
    }
    if (selectedHeadshotSubmissionId === null) {
      dispatchProfileHeadshotDetails({
        type: "headshot-session-required",
        message:
          eligibleHeadshotSessions.length > 1
            ? "Choose an accepted session before replacing this headshot."
            : "Headshot replacement requires an accepted session owned by this speaker.",
      });
      return;
    }
    const participantId = selectedSpeaker.participantId;
    const expectedVersion = selectedSpeaker.version;
    const supersedesAssetId = selectedSpeaker.headshotAssetId ?? undefined;
    dispatchProfileHeadshotDetails({ type: "headshot-upload-started", fileName: file.name });
    try {
      const replacement = assertSpeakerHeadshotReplacement(
        await api.replaceHeadshot({
          participantId,
          submissionId: selectedHeadshotSubmissionId,
          file,
          expectedVersion,
          ...(supersedesAssetId === undefined ? {} : { supersedesAssetId }),
        }),
        eventId,
        participantId,
        expectedVersion,
      );
      dispatchProfileHeadshotDetails({ type: "headshot-write-accepted" });
      const reloaded = await reload();
      const persisted = reloaded?.speakers.find(
        (speaker) => speaker.participantId === participantId,
      );
      if (persisted === undefined) {
        throw new TypeError("The reloaded speaker is missing from the roster.");
      }
      assertAdvancedSpeakerRevision(persisted, participantId, expectedVersion, eventId);
      if (persisted.headshotAssetId !== replacement.asset.id) {
        throw new TypeError("The reloaded speaker does not point to the uploaded headshot.");
      }
      dispatchProfileHeadshotDetails({ type: "headshot-upload-succeeded", speaker: persisted });
    } catch (reason: unknown) {
      const conflict =
        reason instanceof SpeakerApiError &&
        (reason.status === 409 || reason.code === "CONFLICT" || reason.code === "VERSION_CONFLICT");
      if (conflict) {
        dispatchProfileHeadshotDetails({ type: "headshot-conflict" });
        await reload();
      } else {
        const message = errorMessage(reason);
        dispatchProfileHeadshotDetails({ type: "headshot-failed", message });
      }
    }
  }
  return (
    <div className={styles.workspace}>
      <WorkspaceHeader
        eyebrow="Event operations / Speakers"
        title="Speaker operations"
        description="Manage people and profiles in Roster, assign onboarding action items for speakers to complete in their portal, and use Email for speaker-only outreach; broader announcements belong in Communications."
        status={<StatusBadge tone="neutral">{speakers.length} speakers</StatusBadge>}
        metadata={
          <>
            <WorkspaceMetaItem>Organization {organizationId}</WorkspaceMetaItem>
            <WorkspaceMetaItem>Event {eventId}</WorkspaceMetaItem>
          </>
        }
        actions={
          <>
            <Button
              variant="outline"
              type="button"
              onClick={() => void reload()}
              disabled={loading}
            >
              <RefreshCw data-icon="inline-start" />
              {loading ? "Refreshing…" : "Refresh roster"}
            </Button>
            {!rosterEmpty ? (
              <Button
                variant="default"
                type="button"
                onClick={() => dispatchRoster({ type: "add-dialog-changed", open: true })}
              >
                <UserPlus data-icon="inline-start" />
                Add speaker
              </Button>
            ) : null}
          </>
        }
      />
      {error ? <FormMessage message={error} error /> : null}
      {notice ? <FormMessage message={notice} /> : null}
      <Dialog
        open={showAdd}
        onOpenChange={(open) => dispatchRoster({ type: "add-dialog-changed", open })}
      >
        <DialogContent className={styles.dialogContent}>
          <DialogHeader>
            <DialogTitle>Add speaker</DialogTitle>
            <DialogDescription>
              Capture identity and profile details before sending an optional portal invitation.
            </DialogDescription>
          </DialogHeader>
          <form className={styles.actionsStack} onSubmit={(event) => void createSpeaker(event)}>
            <ProfileFields draft={createDraft} onChange={updateCreate} disabled={saveBusy} />
            <Field>
              <FieldLabel htmlFor="create-speaker-status">Workflow status</FieldLabel>
              <Select
                value={createDraft.status}
                onValueChange={(value) => updateCreate("status", value)}
                disabled={saveBusy}
              >
                <SelectTrigger id="create-speaker-status" className={styles.control}>
                  <SelectValue placeholder="Select workflow status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {statusOptions.map((status) => (
                      <SelectItem key={status} value={status}>
                        {statusLabel(status)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Button variant="default" type="submit" disabled={saveBusy || api === null}>
              <CheckCircle2 data-icon="inline-start" />
              {saveBusy ? "Saving…" : "Save speaker"}
            </Button>
            <p className={styles.muted} role="note">
              Headshot upload is completed by the speaker in their portal.{" "}
              {SPEAKER_CUSTOM_FIELDS_CONTRACT_GAP}
            </p>
          </form>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => dispatchRoster({ type: "add-dialog-changed", open: false })}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Tabs
        value={activeView}
        onValueChange={(value) =>
          dispatchRoster({ type: "view-changed", view: value as SpeakerWorkspaceView })
        }
        className={styles.tabs}
      >
        <TabsList variant="line" aria-label="Speaker workspace views">
          <TabsTrigger id="roster-tab" aria-controls="roster-view" value="roster">
            <Users data-icon="inline-start" />
            Roster
          </TabsTrigger>
          <TabsTrigger id="tasks-tab" aria-controls="tasks-view" value="tasks">
            <ListTodo data-icon="inline-start" />
            Onboarding
          </TabsTrigger>
          <TabsTrigger id="email-tab" aria-controls="email-view" value="email">
            <Mail data-icon="inline-start" />
            Email
          </TabsTrigger>
        </TabsList>
        <TabsContent
          value="roster"
          id="roster-view"
          aria-labelledby="roster-tab"
          className={styles.view}
        >
          {rosterEmpty ? (
            <Card className={styles.firstRunCard}>
              <CardHeader>
                <CardTitle id="roster-empty-heading">Start your speaker roster</CardTitle>
                <CardDescription>
                  Add speakers one at a time or import a CSV to give this event a clear home for
                  profiles, sessions, and delivery details.
                </CardDescription>
              </CardHeader>
              <CardContent className={styles.actionsStack}>
                <Empty className={styles.empty}>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Users />
                    </EmptyMedia>
                    <EmptyTitle>No speakers added yet</EmptyTitle>
                    <EmptyDescription>
                      Start with a speaker profile or bring in your existing roster. You can invite
                      speakers to their portal and assign onboarding after people are here.
                    </EmptyDescription>
                  </EmptyHeader>
                  <div className={styles.actions}>
                    <Button
                      variant="default"
                      type="button"
                      onClick={() => dispatchRoster({ type: "add-dialog-changed", open: true })}
                    >
                      <UserPlus data-icon="inline-start" />
                      Add speaker
                    </Button>
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => dispatchRoster({ type: "csv-dialog-toggled" })}
                      aria-expanded={showCsv}
                      aria-controls="speaker-csv-import"
                    >
                      <FileText data-icon="inline-start" />
                      {showCsv ? "Hide CSV import" : "Import CSV"}
                    </Button>
                  </div>
                </Empty>
              </CardContent>
            </Card>
          ) : (
            <>
              <section className={styles.attentionStrip} aria-label="Speaker attention filters">
                {(
                  [
                    ["all", "All speakers"],
                    ["overdue", "Overdue tasks"],
                    ["awaiting-invite", "Awaiting invite"],
                    ["duplicate-email", "Duplicate emails"],
                    ["inactive", "Inactive"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    className={styles.attentionFilter}
                    type="button"
                    aria-pressed={attentionFilter === value}
                    onClick={() =>
                      dispatchRoster({ type: "attention-filter-changed", attention: value })
                    }
                  >
                    <span>{label}</span>
                    <strong>{attentionCounts[value]}</strong>
                  </button>
                ))}
              </section>
              <Card className={styles.panel} aria-busy={loading}>
                <CardHeader className={styles.panelHeader}>
                  <div>
                    <CardTitle id="roster-heading">Roster</CardTitle>
                    <CardDescription>
                      Manage people and profile/delivery records for this event, then open a speaker
                      for details.
                    </CardDescription>
                  </div>
                  <Badge variant="outline">
                    {scopedRoster ? `${filteredSpeakers.length} of ${speakers.length}` : "Loading"}
                  </Badge>
                </CardHeader>
                <CardContent className={styles.actionsStack}>
                  <div className={styles.rosterToolbar}>
                    <Field className={styles.searchField}>
                      <FieldLabel className={adminStyles.srOnly} htmlFor="speaker-search">
                        Search speakers
                      </FieldLabel>
                      <div className={styles.inputWithIcon}>
                        <Search aria-hidden="true" />
                        <Input
                          id="speaker-search"
                          aria-label="Search speakers"
                          placeholder="Search speakers"
                          value={query}
                          onChange={(event) =>
                            dispatchRoster({ type: "query-changed", query: event.target.value })
                          }
                        />
                      </div>
                    </Field>
                    <Button
                      variant="outline"
                      type="button"
                      aria-expanded={filtersOpen}
                      onClick={() => dispatchRoster({ type: "filters-toggled" })}
                    >
                      Filters
                    </Button>
                    {hasActiveRosterFilters || attentionFilter !== "all" ? (
                      <Button variant="ghost" type="button" onClick={clearRosterFilters}>
                        Clear
                      </Button>
                    ) : null}
                  </div>
                  {filtersOpen ? (
                    <div className={styles.filterPanel}>
                      <Field>
                        <FieldLabel className={adminStyles.srOnly} htmlFor="speaker-status-filter">
                          Filter by status
                        </FieldLabel>
                        <Select
                          value={statusFilter}
                          onValueChange={(value) =>
                            dispatchRoster({ type: "status-filter-changed", status: value })
                          }
                        >
                          <SelectTrigger id="speaker-status-filter" aria-label="Filter by status">
                            <SelectValue placeholder="All statuses" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="all">All statuses</SelectItem>
                              {statusOptions.map((status) => (
                                <SelectItem key={status} value={status}>
                                  {statusLabel(status)}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field>
                        <FieldLabel className={adminStyles.srOnly} htmlFor="speaker-session-filter">
                          Filter by session
                        </FieldLabel>
                        <Select
                          value={sessionFilter}
                          onValueChange={(value) =>
                            dispatchRoster({ type: "session-filter-changed", session: value })
                          }
                        >
                          <SelectTrigger id="speaker-session-filter" aria-label="Filter by session">
                            <SelectValue placeholder="All sessions" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="all">All sessions</SelectItem>
                              {sessionOptions.map(([sessionId, title]) => (
                                <SelectItem key={sessionId} value={sessionId}>
                                  {title}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field>
                        <FieldLabel
                          className={adminStyles.srOnly}
                          htmlFor="speaker-progress-filter"
                        >
                          Filter by task progress
                        </FieldLabel>
                        <Select
                          value={progressFilter}
                          onValueChange={(value) =>
                            dispatchRoster({
                              type: "progress-filter-changed",
                              progress: value as ProgressFilter,
                            })
                          }
                        >
                          <SelectTrigger
                            id="speaker-progress-filter"
                            aria-label="Filter by task progress"
                          >
                            <SelectValue placeholder="All task progress" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="all">All task progress</SelectItem>
                              <SelectItem value="complete">Complete</SelectItem>
                              <SelectItem value="incomplete">Incomplete</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                  ) : null}
                  {hasActiveRosterFilters ? (
                    <p className={styles.muted} role="status" aria-live="polite">
                      Showing {filteredSpeakers.length} of {speakers.length} speakers after filters.
                    </p>
                  ) : null}
                  {selectedSpeakerIds.length > 0 ? (
                    <div className={styles.selectionBar} role="status">
                      <span>
                        <strong>{selectedSpeakerIds.length}</strong> selected for email
                      </span>
                      <div className={styles.actions}>
                        <Button size="sm" type="button" onClick={openSelectedEmail}>
                          <Mail data-icon="inline-start" />
                          Compose email
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          onClick={toggleVisibleSpeakerSelection}
                          disabled={filteredSpeakers.length === 0}
                        >
                          {allVisibleSelected ? "Deselect visible" : "Select visible"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          onClick={clearSpeakerSelection}
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  {loading ? (
                    <FormMessage
                      message={
                        scopedRoster ? "Refreshing speaker roster…" : "Loading speaker roster…"
                      }
                    />
                  ) : null}
                  {duplicateEmailWarnings.length > 0 ? (
                    <FormMessage
                      error
                      message={`Duplicate speaker email conflict: ${duplicateEmailWarnings
                        .map(
                          (conflict) =>
                            `${conflict.email} (${conflict.speakers.map((speaker) => speaker.displayName).join(", ")})`,
                        )
                        .join("; ")}. Each authoritative speaker remains visible.`}
                    />
                  ) : null}
                  <WorkspaceListDetail
                    className={styles.rosterGrid}
                    listLabel="Speaker roster"
                    detailLabel="Selected speaker record"
                    list={
                      <div className={styles.rosterList}>
                        {!loading && scopedRoster && speakers.length === 0 ? (
                          <Empty className={styles.empty}>
                            <EmptyHeader>
                              <EmptyMedia variant="icon">
                                <Users />
                              </EmptyMedia>
                              <EmptyTitle>No speakers yet</EmptyTitle>
                              <EmptyDescription>
                                Add a speaker or use the Import CSV control below to start this
                                event roster.
                              </EmptyDescription>
                            </EmptyHeader>
                          </Empty>
                        ) : null}
                        {!loading &&
                        scopedRoster &&
                        speakers.length > 0 &&
                        filteredSpeakers.length === 0 ? (
                          <Empty className={styles.empty}>
                            <EmptyHeader>
                              <EmptyTitle>No matching speakers</EmptyTitle>
                              <EmptyDescription>
                                No speakers match the current search and filters. Clear them to
                                restore the roster.
                              </EmptyDescription>
                            </EmptyHeader>
                          </Empty>
                        ) : null}
                        {filteredSpeakers.length > 0 ? (
                          <div className={styles.speakerTableViewport}>
                            <Table className={styles.speakerTable}>
                              <TableCaption className={styles.srOnly}>
                                Event speaker roster
                              </TableCaption>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>
                                    <span className={styles.srOnly}>Select</span>
                                  </TableHead>
                                  {SPEAKER_ROSTER_COLUMNS.map((column) => (
                                    <TableHead key={column}>{column}</TableHead>
                                  ))}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {filteredSpeakers.map((speaker) => (
                                  <TableRow
                                    className={styles.speakerRow}
                                    key={speaker.participantId}
                                    aria-current={
                                      selectedId === speaker.participantId ? "true" : undefined
                                    }
                                    data-state={
                                      selectedId === speaker.participantId ? "selected" : undefined
                                    }
                                  >
                                    <TableCell className={styles.checkboxCell}>
                                      <Checkbox
                                        id={`roster-selection-${speaker.participantId}`}
                                        aria-label={`Select ${speaker.displayName}`}
                                        checked={selectedSpeakerIdSet.has(speaker.participantId)}
                                        onCheckedChange={() =>
                                          toggleSpeakerSelection(speaker.participantId)
                                        }
                                      />
                                    </TableCell>
                                    <TableHead scope="row" className={styles.speakerIdentityCell}>
                                      <div className={styles.speakerCopy}>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className={styles.speakerName}
                                          type="button"
                                          onClick={() => beginEdit(speaker)}
                                        >
                                          {speaker.displayName}
                                        </Button>
                                        <span className={styles.speakerMeta}>{speaker.email}</span>
                                        <span className={styles.speakerMeta}>
                                          {speaker.jobTitle || speaker.company
                                            ? `${speaker.jobTitle ?? ""}${speaker.jobTitle && speaker.company ? " · " : ""}${speaker.company ?? ""}`
                                            : "Profile details pending"}
                                        </span>
                                      </div>
                                    </TableHead>
                                    <TableCell>
                                      <SpeakerStatusBadge status={speaker.status} />
                                    </TableCell>
                                    <TableCell className={styles.numericCell}>
                                      {speaker.sessions.length} session
                                      {speaker.sessions.length === 1 ? "" : "s"}
                                    </TableCell>
                                    <TableCell className={styles.taskCell}>
                                      {speaker.taskSummary.completed} / {speaker.taskSummary.total}{" "}
                                      tasks
                                      {speaker.taskSummary.overdue > 0
                                        ? ` · ${speaker.taskSummary.overdue} overdue`
                                        : ""}
                                    </TableCell>
                                    <TableCell className={styles.actionCell}>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        type="button"
                                        onClick={() => beginEdit(speaker)}
                                      >
                                        Open
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        ) : null}
                      </div>
                    }
                    detail={
                      selectedSpeaker ? (
                        <Card className={styles.detail} aria-labelledby="speaker-detail-heading">
                          <CardHeader className={styles.detailHeader}>
                            <div>
                              <p className={styles.eyebrow}>Speaker record</p>
                              <CardTitle id="speaker-detail-heading">
                                {selectedSpeaker.displayName}
                              </CardTitle>
                              <CardDescription>
                                {selectedSpeaker.email} ·{" "}
                                <SpeakerStatusBadge status={selectedSpeaker.status} />
                              </CardDescription>
                            </div>
                            <div className={styles.actions}>
                              <Button
                                variant="outline"
                                size="sm"
                                type="button"
                                onClick={() => void refreshDetails()}
                                disabled={detailBusy || api === null}
                              >
                                <RefreshCw data-icon="inline-start" />
                                {detailBusy ? "Refreshing details…" : "Refresh details"}
                              </Button>
                              <SpeakerInvitationControls
                                previewBusy={invitationPreviewBusy}
                                sendBusy={invitationSendBusy}
                                disabled={api === null}
                                canSend={invitationReady}
                                onPreview={() => void previewSelectedSpeakerInvitation()}
                                onSend={() => void sendSelectedSpeakerInvitation()}
                              />
                            </div>
                          </CardHeader>
                          <CardContent className={styles.actionsStack}>
                            {invitationPreviewCount > 0 ? (
                              <Alert>
                                <Mail />
                                <AlertTitle>Invitation preview ready</AlertTitle>
                                <AlertDescription>
                                  {invitationPreviewCount} speaker previewed.{" "}
                                  {invitationReady ? "Eligible to send." : "Sending is blocked."}{" "}
                                  Sending remains a separate explicit action.
                                  <ul
                                    className={styles.list}
                                    aria-label="Portal invitation preview"
                                  >
                                    {selectedInvitationPreview.map((preview) => (
                                      <li key={preview.participantId}>
                                        <strong>{statusLabel(preview.state)}</strong> ·{" "}
                                        {preview.recipientEmail || "No deliverable email"}
                                      </li>
                                    ))}
                                  </ul>
                                </AlertDescription>
                              </Alert>
                            ) : null}
                            {invitationResult &&
                            selectedInvitationResultRecipient &&
                            invitationResultParticipantId === selectedSpeaker.participantId ? (
                              <FormMessage
                                message={`Invitation ${selectedInvitationResultRecipient.status} for ${selectedInvitationResultRecipient.recipientEmail}.`}
                                error={selectedInvitationResultRecipient.status === "failed"}
                              />
                            ) : null}
                            {invitationError ? (
                              <FormMessage message={invitationError} error />
                            ) : null}
                            {invitationHistory.length > 0 ? (
                              <div className={styles.detailBlock}>
                                <h3 className={styles.subheading}>
                                  Portal invitation send history
                                </h3>
                                <ul
                                  className={styles.list}
                                  aria-label="Portal invitation send history"
                                >
                                  {invitationHistory.map((entry) => (
                                    <li key={`${entry.result.idempotencyKey}:${entry.occurredAt}`}>
                                      <strong>{statusLabel(entry.result.status)}</strong> ·{" "}
                                      {entry.preview
                                        .map(
                                          (preview) =>
                                            preview.recipientEmail || preview.participantId,
                                        )
                                        .join(", ")}{" "}
                                      · {dateTimeLabel(entry.occurredAt)} UTC
                                    </li>
                                  ))}
                                </ul>
                                <p className={styles.muted}>
                                  Sent invitations persist in the durable server email history; use
                                  Refresh history in the Email view to reload the authoritative
                                  record.
                                </p>
                              </div>
                            ) : null}
                            {detailNotice ? (
                              <FormMessage
                                message={detailNotice}
                                error={
                                  detailNotice.includes("unavailable") ||
                                  detailNotice.includes("could")
                                }
                              />
                            ) : null}
                            <Card className={styles.uploadPanel}>
                              <CardHeader>
                                <CardTitle className={styles.subheading}>Headshot</CardTitle>
                                <CardDescription>
                                  Secure event-scoped preview and organizer replacement.
                                </CardDescription>
                              </CardHeader>
                              <CardContent className={styles.actionsStack}>
                                <SpeakerHeadshot
                                  speakerName={selectedSpeaker.displayName}
                                  asset={selectedHeadshotAsset}
                                  imageUrl={headshotPreviewUrl}
                                  loading={headshotPreviewLoading}
                                  error={headshotPreviewError}
                                  revision={headshotPreviewRevision}
                                  onRetry={retryHeadshotPreview}
                                  onImageError={markHeadshotPreviewFailed}
                                />
                                {eligibleHeadshotSessions.length > 1 ? (
                                  <Field>
                                    <FieldLabel htmlFor="speaker-headshot-session">
                                      Session for headshot replacement
                                    </FieldLabel>
                                    <Select
                                      value={headshotSubmissionId ?? ""}
                                      onValueChange={(value) => {
                                        dispatchProfileHeadshotDetails({
                                          type: "headshot-session-selected",
                                          submissionId: value,
                                        });
                                      }}
                                    >
                                      <SelectTrigger id="speaker-headshot-session">
                                        <SelectValue placeholder="Choose an accepted session" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {eligibleHeadshotSessions.map((session) => (
                                          <SelectItem
                                            key={session.submissionId}
                                            value={session.submissionId}
                                          >
                                            {session.title}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </Field>
                                ) : eligibleHeadshotSessions.length === 0 ? (
                                  <p className={styles.muted} role="status">
                                    Headshot replacement requires an accepted session owned by this
                                    speaker.
                                  </p>
                                ) : null}
                                <Field>
                                  <FieldLabel htmlFor="speaker-headshot-upload">
                                    Upload or replace headshot
                                  </FieldLabel>
                                  <Input
                                    id="speaker-headshot-upload"
                                    type="file"
                                    accept={ORGANIZER_HEADSHOT_ACCEPTED_TYPES.join(",")}
                                    onChange={(event) => void uploadOrganizerHeadshot(event)}
                                    disabled={
                                      headshotUploadStatus === "busy" ||
                                      api === null ||
                                      api.replaceHeadshot === undefined ||
                                      selectedHeadshotSubmissionId === null
                                    }
                                  />
                                </Field>
                                <p className={styles.muted}>
                                  Accepted headshot types: JPEG, PNG, or WebP; maximum size 5
                                  MB.Uploads use the event-scoped organizer private upload flow.
                                </p>
                                {headshotUploadMessage ? (
                                  <FormMessage
                                    message={headshotUploadMessage}
                                    error={headshotUploadStatus === "error"}
                                  />
                                ) : null}
                                <MutationStatusMessage
                                  label="Headshot"
                                  status={headshotMutationStatus}
                                  message={headshotMutationMessage}
                                />
                              </CardContent>
                            </Card>
                            {editDraft ? (
                              <form
                                className={styles.detailBlock}
                                onSubmit={(event) => void saveSpeaker(event)}
                              >
                                <ProfileFields
                                  draft={editDraft}
                                  onChange={updateEdit}
                                  disabled={saveBusy}
                                />
                                <Field>
                                  <FieldLabel htmlFor="edit-speaker-status">
                                    Workflow status
                                  </FieldLabel>
                                  <Select
                                    value={editDraft.status}
                                    onValueChange={(value) => updateEdit("status", value)}
                                    disabled={saveBusy}
                                  >
                                    <SelectTrigger id="edit-speaker-status">
                                      <SelectValue placeholder="Select workflow status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectGroup>
                                        {statusOptions.map((status) => (
                                          <SelectItem key={status} value={status}>
                                            {statusLabel(status)}
                                          </SelectItem>
                                        ))}
                                      </SelectGroup>
                                    </SelectContent>
                                  </Select>
                                </Field>
                                <MutationStatusMessage
                                  label="Profile"
                                  status={profileMutationStatus}
                                  message={profileMutationMessage}
                                />
                                {editError ? <FormMessage message={editError} error /> : null}
                                <div className={styles.actions}>
                                  <Button
                                    variant="default"
                                    type="submit"
                                    disabled={saveBusy || api === null}
                                  >
                                    <CheckCircle2 data-icon="inline-start" />
                                    {profileMutationStatus === "pending"
                                      ? "Pending…"
                                      : saveBusy
                                        ? "Saving…"
                                        : "Save profile changes"}
                                  </Button>
                                  <Badge variant="outline">
                                    Version {editDraft.expectedVersion}
                                  </Badge>
                                </div>
                              </form>
                            ) : (
                              <Button
                                variant="outline"
                                type="button"
                                onClick={() => beginEdit(selectedSpeaker)}
                              >
                                Edit profile
                              </Button>
                            )}
                            <div className={styles.detailGrid}>
                              <Card size="sm">
                                <CardHeader>
                                  <CardTitle className={styles.subheading}>
                                    Session assignments
                                  </CardTitle>
                                  <CardDescription>Authoritative agenda links.</CardDescription>
                                </CardHeader>
                                <CardContent className={styles.actionsStack}>
                                  {selectedSpeaker.sessions.length === 0 ? (
                                    <Empty>
                                      <EmptyTitle>No sessions linked</EmptyTitle>
                                      <EmptyDescription>
                                        No sessions are linked to this speaker yet.
                                      </EmptyDescription>
                                    </Empty>
                                  ) : (
                                    <ul className={styles.list}>
                                      {selectedSpeaker.sessions.map((session: SpeakerSession) => (
                                        <li key={session.submissionId} className={styles.preview}>
                                          <strong>{session.title}</strong>
                                          <Badge variant="outline">
                                            {statusLabel(session.status)}
                                          </Badge>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                  <div className={styles.actions}>
                                    <Button
                                      variant="outline"
                                      type="button"
                                      disabled
                                      title="Session linking is managed by the agenda service."
                                    >
                                      Assign a session
                                    </Button>
                                    <Button variant="outline" asChild>
                                      <Link
                                        href={`/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventId)}/agenda`}
                                      >
                                        Open Agenda
                                      </Link>
                                    </Button>
                                  </div>
                                  <p className={styles.muted}>
                                    Session linking is managed in Agenda; this workspace shows the
                                    authoritative assignments.
                                  </p>
                                </CardContent>
                              </Card>
                              <Card size="sm">
                                <CardHeader>
                                  <CardTitle className={styles.subheading}>
                                    Uploaded deliverables
                                  </CardTitle>
                                  <CardDescription>
                                    Private event files and headshots.
                                  </CardDescription>
                                </CardHeader>
                                <CardContent>
                                  {selectedSpeaker.assets.length === 0 ? (
                                    <Empty>
                                      <EmptyTitle>No deliverables</EmptyTitle>
                                      <EmptyDescription>
                                        No uploaded headshot or deliverables are available.
                                      </EmptyDescription>
                                    </Empty>
                                  ) : (
                                    <ul className={styles.list}>
                                      {selectedSpeaker.assets.map((asset: SpeakerAsset) => (
                                        <li key={asset.assetId} className={styles.preview}>
                                          <strong>{asset.fileName}</strong>
                                          <SpeakerAssetMetadata asset={asset} />
                                          <SpeakerAssetDownload
                                            asset={asset}
                                            downloadUrl={downloadUrls[asset.assetId] ?? null}
                                            busy={downloadBusyAssetId === asset.assetId}
                                            disabled={api === null || downloadBusyAssetId !== null}
                                            error={downloadErrors[asset.assetId] ?? null}
                                            onRequest={requestAssetDownload}
                                          />
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </CardContent>
                              </Card>
                            </div>
                          </CardContent>
                        </Card>
                      ) : (
                        <Empty className={styles.empty}>
                          <EmptyHeader>
                            <EmptyMedia variant="icon">
                              <Users />
                            </EmptyMedia>
                            <EmptyTitle>Select a speaker</EmptyTitle>
                            <EmptyDescription>
                              Select a speaker to see profile and delivery details.
                            </EmptyDescription>
                          </EmptyHeader>
                        </Empty>
                      )
                    }
                  />
                </CardContent>
              </Card>
            </>
          )}
          <Collapsible
            open={showCsv}
            onOpenChange={(open) => dispatchRoster({ type: "csv-dialog-changed", open })}
            className={styles.importDetails}
          >
            {!rosterEmpty ? (
              <CollapsibleTrigger asChild>
                <Button variant="outline" type="button">
                  <FileText data-icon="inline-start" />
                  {showCsv ? "Hide CSV import" : "Import CSV"}
                </Button>
              </CollapsibleTrigger>
            ) : null}
            <CollapsibleContent id="speaker-csv-import" className={styles.importBody}>
              <Card aria-busy={importBusy}>
                <CardHeader>
                  <CardTitle>Import speaker roster</CardTitle>
                  <CardDescription>
                    Preview validation before committing rows. Invalid rows are never written to
                    this event.
                  </CardDescription>
                </CardHeader>
                <CardContent className={styles.actionsStack}>
                  <Field>
                    <FieldLabel htmlFor="speaker-csv">Speakers CSV</FieldLabel>
                    <Input
                      id="speaker-csv"
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(event) => void previewCsv(event)}
                      disabled={importCommitBusy || api === null}
                    />
                  </Field>
                  {importFileName ? (
                    <p className={styles.muted}>
                      Selected file: <strong>{importFileName}</strong>
                    </p>
                  ) : null}
                  {importBusy ? <FormMessage message="Validating CSV…" /> : null}
                  {importPreview ? (
                    <div className={styles.actionsStack}>
                      <div className={styles.actions}>
                        <Badge variant="secondary">{importPreview.validRows.length} valid</Badge>
                        <Badge variant="destructive">
                          {importPreview.invalidRows.length} invalid
                        </Badge>
                      </div>
                      {importPreview.invalidRows.length > 0 ? (
                        <ul className={styles.list} aria-label="CSV validation errors">
                          {importPreview.invalidRows.map((issue) => (
                            <li key={`${issue.rowNumber}-${issue.field ?? "row"}-${issue.message}`}>
                              Row {issue.rowNumber}
                              {issue.field ? ` · ${issue.field}` : ""}: {issue.message}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className={styles.muted}>
                          All previewed rows passed required identity validation.
                        </p>
                      )}
                      <Button
                        variant="default"
                        type="button"
                        onClick={() => void commitCsv()}
                        disabled={
                          importCommitBusy ||
                          importPreviewBusy ||
                          importPreview.validRows.length === 0 ||
                          api === null
                        }
                      >
                        <Upload data-icon="inline-start" />
                        {importCommitBusy
                          ? "Importing…"
                          : `Commit ${importPreview.validRows.length} valid row${importPreview.validRows.length === 1 ? "" : "s"}`}
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>
        </TabsContent>
        <TabsContent
          value="tasks"
          id="tasks-view"
          aria-labelledby="tasks-tab"
          className={styles.view}
        >
          <Card className={styles.panel}>
            <CardHeader className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Assign a new action</p>
                <CardTitle id="tasks-heading">Speaker onboarding</CardTitle>
                <CardDescription>
                  Organizers assign action items that speakers complete in their portal. Email is
                  for messages that do not require task completion.
                </CardDescription>
              </div>
              <Badge variant="outline">
                {onboardingTaskDefinitions.length} / {MAX_ORGANIZER_ONBOARDING_TASKS} task
                definitions
              </Badge>
            </CardHeader>
            <CardContent className={styles.actionsStack}>
              {rosterEmpty ? (
                <Empty className={styles.empty}>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <ListTodo />
                    </EmptyMedia>
                    <EmptyTitle>Add speakers to start onboarding</EmptyTitle>
                    <EmptyDescription>
                      Add or import speakers before assigning action items they can complete in
                      their portal.
                    </EmptyDescription>
                  </EmptyHeader>
                  <div className={styles.actions}>
                    <Button
                      variant="default"
                      type="button"
                      onClick={() => {
                        dispatchRoster({ type: "view-changed", view: "roster" });
                        dispatchRoster({ type: "add-dialog-changed", open: true });
                      }}
                    >
                      <UserPlus data-icon="inline-start" />
                      Add speaker
                    </Button>
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => {
                        dispatchRoster({ type: "view-changed", view: "roster" });
                        dispatchRoster({ type: "csv-dialog-changed", open: true });
                      }}
                    >
                      <FileText data-icon="inline-start" />
                      Import CSV
                    </Button>
                  </div>
                </Empty>
              ) : (
                <>
                  {!progressSectionVisible ? (
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() =>
                        dispatchRoster({
                          type: "progress-context-changed",
                          context: secondaryContextKey,
                        })
                      }
                      disabled={api === null || loading || roster === null}
                    >
                      <RefreshCw data-icon="inline-start" />
                      Load task progress
                    </Button>
                  ) : progress === null && progressError === null ? (
                    <FormMessage message="Loading task progress…" />
                  ) : null}
                  <form
                    className={styles.actionsStack}
                    onSubmit={(event) => void assignTask(event)}
                  >
                    <div className={styles.fieldGrid}>
                      <Field>
                        <FieldLabel htmlFor="task-title">Task title</FieldLabel>
                        <Input
                          id="task-title"
                          value={taskTitle}
                          onChange={(event) =>
                            dispatchImportTaskInvitation({
                              type: "task-title-changed",
                              title: event.target.value,
                            })
                          }
                          placeholder="Confirm participation"
                          required
                          disabled={taskBusy}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="task-due-date">Due date</FieldLabel>
                        <Input
                          id="task-due-date"
                          type="date"
                          value={taskDueAt}
                          onChange={(event) =>
                            dispatchImportTaskInvitation({
                              type: "task-due-changed",
                              dueAt: event.target.value,
                            })
                          }
                          required
                          disabled={taskBusy}
                        />
                      </Field>
                    </div>
                    <FieldSet className={styles.detailBlock}>
                      <FieldLegend variant="label">Assign to speakers</FieldLegend>
                      {speakers.length === 0 ? (
                        <Empty>
                          <EmptyTitle>Add speakers first</EmptyTitle>
                          <EmptyDescription>Add speakers before assigning a task.</EmptyDescription>
                        </Empty>
                      ) : (
                        <div className={styles.checkboxGrid}>
                          {speakers.map((speaker) => (
                            <Field
                              key={speaker.participantId}
                              orientation="horizontal"
                              className={styles.checkboxField}
                            >
                              <Checkbox
                                id={`task-assignee-${speaker.participantId}`}
                                aria-label={`Assign task to ${speaker.displayName}`}
                                checked={taskAssigneeIdSet.has(speaker.participantId)}
                                onCheckedChange={() => toggleAssignee(speaker.participantId)}
                                disabled={taskBusy}
                              />
                              <FieldLabel htmlFor={`task-assignee-${speaker.participantId}`}>
                                Assign task to {speaker.displayName}
                              </FieldLabel>
                            </Field>
                          ))}
                        </div>
                      )}
                    </FieldSet>
                    <div className={styles.actions}>
                      <Button
                        variant="default"
                        type="submit"
                        disabled={
                          taskBusy ||
                          api === null ||
                          speakers.length === 0 ||
                          progress === null ||
                          progressError !== null ||
                          onboardingTaskDefinitions.length >= MAX_ORGANIZER_ONBOARDING_TASKS
                        }
                      >
                        <ListTodo data-icon="inline-start" />
                        {taskBusy
                          ? "Assigning…"
                          : onboardingTaskDefinitions.length >= MAX_ORGANIZER_ONBOARDING_TASKS
                            ? "Three onboarding tasks configured"
                            : "Assign onboarding task"}
                      </Button>
                      <Badge variant="outline">Task type: action / mark complete</Badge>
                    </div>
                  </form>
                  {onboardingTaskDefinitions.length > 0 ? (
                    <Table>
                      <TableCaption className={adminStyles.srOnly}>
                        API-loaded organizer onboarding task definitions
                      </TableCaption>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Task</TableHead>
                          <TableHead>Due</TableHead>
                          <TableHead>Assignees</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {onboardingTaskDefinitions.map((definition) => (
                          <TableRow key={definition.definitionId}>
                            <TableHead scope="row">{definition.title}</TableHead>
                            <TableCell>{dateLabel(definition.dueAt)}</TableCell>
                            <TableCell>
                              {definition.participantIds
                                .map((participantId) => {
                                  const assignee = speakers.find(
                                    (speaker) => speaker.participantId === participantId,
                                  );
                                  return assignee === undefined
                                    ? participantId
                                    : `${assignee.displayName} (${participantId})`;
                                })
                                .join(", ")}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
          {!rosterEmpty ? (
            <>
              <Card className={styles.panel}>
                <CardHeader className={styles.panelHeader}>
                  <div>
                    <CardTitle id="progress-heading">Onboarding progress</CardTitle>
                    <CardDescription>
                      List-level general-task completion, including changes speakers make in their
                      portal.
                    </CardDescription>
                  </div>
                  <Field>
                    <FieldLabel className={adminStyles.srOnly} htmlFor="task-progress-filter">
                      Filter task progress
                    </FieldLabel>
                    <Select
                      value={progressFilter}
                      onValueChange={(value) =>
                        dispatchRoster({
                          type: "progress-filter-changed",
                          progress: value as ProgressFilter,
                        })
                      }
                    >
                      <SelectTrigger id="task-progress-filter" aria-label="Filter task progress">
                        <SelectValue placeholder="All progress" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="all">All progress</SelectItem>
                          <SelectItem value="complete">Complete</SelectItem>
                          <SelectItem value="incomplete">Incomplete</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                </CardHeader>
                <CardContent>
                  {progressError ? (
                    <FormMessage message={`Progress unavailable: ${progressError}`} error />
                  ) : null}
                  {!progressError && progress && progressRows.length === 0 ? (
                    <Empty>
                      <EmptyTitle>No progress matches</EmptyTitle>
                      <EmptyDescription>No speakers match this progress filter.</EmptyDescription>
                    </Empty>
                  ) : null}
                  {!progressError && progress && progressRows.length > 0 ? (
                    <Table>
                      <TableCaption className={adminStyles.srOnly}>
                        Speaker task completion progress
                      </TableCaption>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Speaker</TableHead>
                          <TableHead>Tasks and due dates</TableHead>
                          <TableHead>Progress</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {progressRows.map((row) => {
                          const completed = row.tasks.filter((task) =>
                            taskComplete(task.status),
                          ).length;
                          const progressValue =
                            row.tasks.length === 0 ? 0 : (completed / row.tasks.length) * 100;
                          return (
                            <TableRow key={row.participantId}>
                              <TableHead scope="row">{row.displayName}</TableHead>
                              <TableCell>
                                <ul className={styles.list}>
                                  {row.tasks.length === 0 ? (
                                    <li className={styles.muted}>No general tasks assigned.</li>
                                  ) : (
                                    row.tasks.map((task) => (
                                      <li key={task.taskId}>
                                        <strong>{task.title}</strong> · {dateLabel(task.dueAt)} ·{" "}
                                        <SpeakerTaskStatusBadge status={task.status} />
                                      </li>
                                    ))
                                  )}
                                </ul>
                              </TableCell>
                              <TableCell>
                                <div className={styles.progressCell}>
                                  <Progress
                                    value={progressValue}
                                    aria-label={`${completed} of ${row.tasks.length} tasks complete`}
                                  />
                                  <span>
                                    {completed} / {row.tasks.length} complete
                                  </span>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  ) : null}
                </CardContent>
              </Card>
              <div ref={reminderSectionRef}>
                <Card className={styles.panel}>
                  <CardHeader className={styles.panelHeader}>
                    <div>
                      <CardTitle id="upcoming-reminders-heading">Upcoming reminders</CardTitle>
                      <CardDescription>
                        Only reminders that are currently eligible for delivery are shown here.
                      </CardDescription>
                    </div>
                    <Badge variant="outline">
                      {reminderEligibility === null
                        ? "Loading"
                        : `${eligibleReminderItems.length} due`}
                    </Badge>
                  </CardHeader>
                  <CardContent className={styles.actionsStack}>
                    {reminderEligibility === null ? (
                      <FormMessage message="Checking upcoming reminders…" />
                    ) : eligibleReminderItems.length === 0 ? (
                      <Empty>
                        <EmptyTitle>No eligible reminders</EmptyTitle>
                        <EmptyDescription>
                          Eligible reminders will appear here when their delivery window opens.
                        </EmptyDescription>
                      </Empty>
                    ) : (
                      <ul className={styles.list} aria-label="Upcoming reminders">
                        {eligibleReminderItems.map((item) => (
                          <li className={styles.reminderItem} key={item.taskId}>
                            <strong>{item.title}</strong>
                            <span>{dateLabel(item.dueAt)}</span>
                            <Badge variant="secondary">Ready to send</Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                    {ineligibleReminderItems.length > 0 ? (
                      <Accordion type="single" collapsible defaultValue="">
                        <AccordionItem value="diagnostics">
                          <AccordionTrigger>Reminder diagnostics</AccordionTrigger>
                          <AccordionContent>
                            <p className={styles.muted}>
                              Internal eligibility reasons are available for operators who need to
                              investigate a reminder schedule.
                            </p>
                            <ul className={styles.list}>
                              {ineligibleReminderItems.map((item) => (
                                <li key={item.taskId}>
                                  <strong>{item.title}</strong> · {item.reason}
                                </li>
                              ))}
                            </ul>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    ) : null}
                  </CardContent>
                </Card>
              </div>
            </>
          ) : null}
        </TabsContent>
        <TabsContent
          value="email"
          id="email-view"
          aria-labelledby="email-tab"
          className={styles.view}
        >
          <div ref={emailSectionRef}>
            {rosterEmpty ? (
              <Empty className={styles.empty}>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Mail />
                  </EmptyMedia>
                  <EmptyTitle>Add speakers before emailing</EmptyTitle>
                  <EmptyDescription>
                    Add or import speakers before sending speaker-only outreach for this event.
                  </EmptyDescription>
                </EmptyHeader>
                <div className={styles.actions}>
                  <Button
                    variant="default"
                    type="button"
                    onClick={() => {
                      dispatchRoster({ type: "view-changed", view: "roster" });
                      dispatchRoster({ type: "add-dialog-changed", open: true });
                    }}
                  >
                    <UserPlus data-icon="inline-start" />
                    Add speaker
                  </Button>
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => {
                      dispatchRoster({ type: "view-changed", view: "roster" });
                      dispatchRoster({ type: "csv-dialog-changed", open: true });
                    }}
                  >
                    <FileText data-icon="inline-start" />
                    Import CSV
                  </Button>
                </div>
              </Empty>
            ) : scopedRoster !== null && selectedSpeakerIds.length === 0 ? (
              <Empty className={styles.empty}>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Users />
                  </EmptyMedia>
                  <EmptyTitle>Choose recipients</EmptyTitle>
                  <EmptyDescription>
                    Select speakers in Roster before composing speaker-only outreach. Broader
                    announcements belong in Communications.
                  </EmptyDescription>
                </EmptyHeader>
                <Button
                  variant="default"
                  type="button"
                  onClick={() => dispatchRoster({ type: "view-changed", view: "roster" })}
                >
                  <Users data-icon="inline-start" />
                  Choose recipients
                </Button>
              </Empty>
            ) : (
              <>
                <Card className={styles.panel} aria-busy={emailAnyBusy}>
                  <CardHeader className={styles.panelHeader}>
                    <div>
                      <CardTitle id="bulk-email-heading">Speaker email</CardTitle>
                      <CardDescription>
                        Use this event-scoped Email workspace for speaker-only outreach; broader
                        announcements belong in Communications. Compose a message for{" "}
                        {selectedSpeakerIds.length} selected speaker
                        {selectedSpeakerIds.length === 1 ? "" : "s"}, save a draft, preview selected
                        recipients, then confirm the send. Start with a blank message or apply an
                        editable starter.
                      </CardDescription>
                    </div>
                    <Badge variant="outline">Preview required before send</Badge>
                  </CardHeader>
                  <CardContent className={styles.actionsStack}>
                    <div className={styles.emailFlowGrid}>
                      <div className={styles.emailEditor}>
                        <div className={styles.emailTemplateRow}>
                          <Field>
                            <FieldLabel htmlFor="email-template">Template version</FieldLabel>
                            <Select
                              value={
                                emailTemplateId
                                  ? `${emailTemplateId}:${emailTemplateVersion ?? ""}`
                                  : "new"
                              }
                              onValueChange={(value) => {
                                invalidateEmailPreview();
                                if (value === "new") {
                                  dispatchEmail({
                                    type: "email-template-selected",
                                    id: "",
                                    version: undefined,
                                    template: null,
                                  });
                                  emailCreateTemplateIdRef.current = null;
                                  return;
                                }
                                const separator = value.lastIndexOf(":");
                                const nextId = separator < 0 ? value : value.slice(0, separator);
                                const rawVersion = separator < 0 ? "" : value.slice(separator + 1);
                                const nextVersion = Number(rawVersion);
                                const template = emailTemplates.find(
                                  (candidate) =>
                                    candidate.id === nextId && candidate.version === nextVersion,
                                );
                                dispatchEmail({
                                  type: "email-template-selected",
                                  id: nextId,
                                  version: Number.isFinite(nextVersion) ? nextVersion : undefined,
                                  template: template ?? null,
                                });
                                emailCreateTemplateIdRef.current = null;
                              }}
                              disabled={emailSaveBusy}
                            >
                              <SelectTrigger id="email-template">
                                <SelectValue placeholder="New template version" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  <SelectItem value="new">New template version</SelectItem>
                                  {emailTemplates.map((template) => (
                                    <SelectItem
                                      key={`${template.id}:${template.version}`}
                                      value={`${template.id}:${template.version}`}
                                    >
                                      {template.name} · v{template.version} · {template.status}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          </Field>
                          <div className={styles.emailTemplateMeta} aria-live="polite">
                            <strong>{selectedEmailTemplate?.name ?? emailTemplateName}</strong>
                            <span className={styles.muted}>
                              {emailTemplateId
                                ? `Exact template ${emailTemplateId} · version ${emailTemplateVersion ?? "unsaved"}`
                                : "New draft · save to create an exact server version"}
                            </span>
                            {selectedEmailTemplate ? (
                              <span className={styles.muted}>
                                {statusLabel(selectedEmailTemplate.status)} · Sender{" "}
                                {selectedEmailTemplate.sender}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <Field>
                          <div className={styles.actions}>
                            <FieldLabel htmlFor="email-template-name">Template name</FieldLabel>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={emailSaveBusy}
                              onClick={() => {
                                dispatchEmail({
                                  type: "email-template-selected",
                                  id: "",
                                  version: undefined,
                                  template: null,
                                });
                                emailCreateTemplateIdRef.current = null;
                                dispatchEmail({
                                  type: "email-template-name-changed",
                                  name: SPEAKER_WELCOME_EMAIL_STARTER.name,
                                });
                                dispatchEmail({
                                  type: "email-subject-changed",
                                  subject: SPEAKER_WELCOME_EMAIL_STARTER.subject,
                                });
                                dispatchEmail({
                                  type: "email-html-changed",
                                  html: SPEAKER_WELCOME_EMAIL_STARTER.html,
                                });
                                dispatchEmail({
                                  type: "email-text-changed",
                                  text: SPEAKER_WELCOME_EMAIL_STARTER.text,
                                });
                                dispatchEmail({
                                  type: "email-editor-mode-changed",
                                  mode: "visual",
                                });
                                invalidateEmailPreview();
                              }}
                            >
                              Use welcome starter
                            </Button>
                          </div>
                          <Input
                            id="email-template-name"
                            value={emailTemplateName}
                            onChange={(event) => {
                              dispatchEmail({
                                type: "email-template-name-changed",
                                name: event.target.value,
                              });
                              invalidateEmailPreview();
                            }}
                            maxLength={200}
                            disabled={emailSaveBusy}
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="email-subject">Subject</FieldLabel>
                          <Input
                            id="email-subject"
                            value={emailSubject}
                            onChange={(event) => {
                              dispatchEmail({
                                type: "email-subject-changed",
                                subject: event.target.value,
                              });
                              invalidateEmailPreview();
                            }}
                            placeholder="Add a clear subject for {{first_name}}"
                            maxLength={500}
                            disabled={emailSaveBusy}
                          />
                        </Field>
                        <Tabs
                          value={emailEditorMode}
                          onValueChange={(value) =>
                            dispatchEmail({
                              type: "email-editor-mode-changed",
                              mode: value as "visual" | "html" | "text",
                            })
                          }
                          className={styles.emailEditorTabs}
                        >
                          <TabsList
                            variant="line"
                            className={styles.emailEditorTabsList}
                            aria-label="Email editor mode"
                          >
                            <TabsTrigger value="visual">Visual preview</TabsTrigger>
                            <TabsTrigger value="html">HTML source</TabsTrigger>
                            <TabsTrigger value="text">Plain text</TabsTrigger>
                          </TabsList>
                          <TabsContent value="visual" className={styles.actionsStack}>
                            <p className={styles.muted}>
                              Visual mode uses the safe server preview. Raw HTML is never executed
                              in this workspace.
                            </p>
                            {emailPreviewCurrent && emailPreview ? (
                              <div className={styles.emailPreviewOutput}>
                                <p className={styles.muted}>Server-rendered text</p>
                                <pre>{emailPreview.text}</pre>
                                <p className={styles.muted}>Escaped HTML output</p>
                                <pre>{emailPreview.html}</pre>
                              </div>
                            ) : (
                              <p className={styles.muted} role="status">
                                Preview selected recipients to see the server-rendered result.
                              </p>
                            )}
                          </TabsContent>
                          <TabsContent value="html">
                            <Field>
                              <FieldLabel htmlFor="email-html">HTML source</FieldLabel>
                              <Textarea
                                id="email-html"
                                value={emailHtml}
                                onChange={(event) => {
                                  dispatchEmail({
                                    type: "email-html-changed",
                                    html: event.target.value,
                                  });
                                  invalidateEmailPreview();
                                }}
                                placeholder="<p>Hello {{first_name}},</p><p>Add your message here.</p>"
                                maxLength={100_000}
                                disabled={emailSaveBusy}
                              />
                            </Field>
                          </TabsContent>
                          <TabsContent value="text">
                            <Field>
                              <FieldLabel htmlFor="email-text">Plain text body</FieldLabel>
                              <Textarea
                                id="email-text"
                                value={emailText}
                                onChange={(event) => {
                                  dispatchEmail({
                                    type: "email-text-changed",
                                    text: event.target.value,
                                  });
                                  invalidateEmailPreview();
                                }}
                                placeholder={"Hello {{first_name}},\n\nAdd your message here."}
                                maxLength={100_000}
                                disabled={emailSaveBusy}
                              />
                            </Field>
                          </TabsContent>
                        </Tabs>
                        <p className={styles.muted}>
                          Merge variables are resolved by the server:{" "}
                          <code className={styles.code}>{"{{first_name}}"}</code>,{" "}
                          <code className={styles.code}>{"{{display_name}}"}</code>,{" "}
                          <code className={styles.code}>{"{{email}}"}</code>.
                        </p>
                      </div>
                      <Card
                        size="sm"
                        className={styles.emailPreviewPanel}
                        aria-label="Selected speaker email preview"
                      >
                        <CardHeader>
                          <CardTitle>Preview selected recipients</CardTitle>
                          <CardDescription>
                            Exact server result; this panel never executes template HTML.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className={styles.actionsStack}>
                          {emailPreviewCurrent && emailPreview ? (
                            <>
                              <p className={styles.muted}>
                                {emailPreview.recipientIds.length} recipient
                                {emailPreview.recipientIds.length === 1 ? "" : "s"} · exact template{" "}
                                {emailPreview.templateId} · version {emailPreview.templateVersion}
                              </p>
                              <p>
                                <strong>Subject:</strong> {emailPreview.subject}
                              </p>
                              <ul
                                className={styles.list}
                                aria-label="Speaker email preview recipient names"
                              >
                                {emailPreview.recipients.map((recipient) => (
                                  <li key={recipient.participantId}>
                                    <strong>{recipient.displayName}</strong> · {recipient.email}
                                  </li>
                                ))}
                              </ul>
                              <div className={styles.emailPreviewOutput}>
                                <p className={styles.muted}>Server-rendered text</p>
                                <pre>{emailPreview.text}</pre>
                                <p className={styles.muted}>Escaped HTML output</p>
                                <pre>{emailPreview.html}</pre>
                              </div>
                            </>
                          ) : (
                            <p className={styles.muted} role="status">
                              No current preview. Select recipients and preview before confirming a
                              send.
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </CardContent>
                  <CardFooter className={styles.actions}>
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => void saveEmailTemplate()}
                      disabled={emailSaveBusy || api === null}
                    >
                      <CheckCircle2 data-icon="inline-start" />
                      {emailSaveBusy ? "Saving…" : "Save draft"}
                    </Button>
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={() => void previewBulkEmail()}
                      disabled={emailPreviewBusy || api === null || selectedSpeakerIds.length === 0}
                    >
                      <Eye data-icon="inline-start" />
                      {emailPreviewBusy ? "Preparing…" : "Preview selected recipients"}
                    </Button>
                    <Button
                      variant="default"
                      type="button"
                      onClick={() => dispatchEmail({ type: "email-confirm-changed", open: true })}
                      disabled={emailSendBusy || api === null || !emailPreviewCurrent}
                    >
                      <Send data-icon="inline-start" />
                      {emailSendBusy ? "Queueing…" : "Confirm send"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => void refreshEmailHistory()}
                      disabled={emailHistoryBusy || api === null}
                      aria-label="Refresh speaker email history"
                    >
                      <RefreshCw data-icon="inline-start" />
                      {emailHistoryBusy ? "Refreshing history…" : "Refresh history"}
                    </Button>
                  </CardFooter>
                  <CardContent className={styles.actionsStack}>
                    {emailNotice ? (
                      <FormMessage
                        message={emailNotice}
                        error={emailNotice.includes("unavailable") || emailNotice.includes("could")}
                      />
                    ) : null}
                    <Card size="sm" className={styles.emailHistory}>
                      <CardHeader>
                        <CardTitle>Email send history</CardTitle>
                        <CardDescription>
                          Completed send records stay here when you start a new draft or preview.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {emailSends.length === 0 ? (
                          <p className={styles.muted} role="status">
                            No email sends recorded for this event.
                          </p>
                        ) : (
                          <Table>
                            <TableCaption className={adminStyles.srOnly}>
                              Speaker email send history
                            </TableCaption>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Status</TableHead>
                                <TableHead>Template</TableHead>
                                <TableHead>Recipients</TableHead>
                                <TableHead>Updated</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {emailSends.map((send) => (
                                <TableRow key={send.id}>
                                  <TableCell>
                                    <Badge variant="outline">{send.status}</Badge>
                                  </TableCell>
                                  <TableCell>
                                    {send.templateId} · v{send.templateVersion}
                                  </TableCell>
                                  <TableCell>{send.recipientIds.length}</TableCell>
                                  <TableCell>{dateLabel(send.updatedAt)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </CardContent>
                    </Card>
                  </CardContent>
                </Card>
                <AlertDialog
                  open={emailConfirmOpen}
                  onOpenChange={(open) => dispatchEmail({ type: "email-confirm-changed", open })}
                >
                  <AlertDialogContent className={styles.dialogContent}>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Confirm speaker email send</AlertDialogTitle>
                      <AlertDialogDescription>
                        Queue the current server preview for{" "}
                        {emailPreview?.recipientIds.length ?? 0} selected recipient
                        {(emailPreview?.recipientIds.length ?? 0) === 1 ? "" : "s"} using exact
                        template version {emailPreview?.templateVersion ?? "unavailable"}. This
                        action uses the current idempotency key and cannot be edited after queueing.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={emailSendBusy}>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        disabled={emailSendBusy || !emailPreviewCurrent}
                        onClick={() => void sendBulkEmail()}
                      >
                        {emailSendBusy ? "Queueing…" : "Confirm send"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
