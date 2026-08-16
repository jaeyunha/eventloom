import type {
  SpeakerApi,
  SpeakerInvitationPreview,
  SpeakerInvitationResult,
  SpeakerStatus,
} from "./api";

export interface SpeakerWorkspaceProps {
  readonly organizationId: string;
  readonly eventId: string;
  readonly api?: SpeakerApi;
}

export type ProgressFilter = "all" | "complete" | "incomplete";

export interface SpeakerProfileDraft {
  displayName: string;
  email: string;
  title: string;
  company: string;
  biography: string;
  twitter: string;
  linkedin: string;
  website: string;
  status: SpeakerStatus;
  travelRequired: boolean;
  arrivalAt: string;
  departureAt: string;
  accommodation: string;
  dietaryRequirements: string;
  accessibilityNeeds: string;
  travelNotes: string;
}

export interface EditDraft extends CreateDraft {
  headshotAssetId: string | null;
  expectedVersion: number;
}

export type CreateDraft = SpeakerProfileDraft;

export const MAX_ORGANIZER_ONBOARDING_TASKS = 3;
export const ORGANIZER_ONBOARDING_TASK_DESCRIPTION = "General speaker onboarding task.";
export const SPEAKER_CUSTOM_FIELDS_CONTRACT_GAP =
  "Custom speaker fields are not available in the current speaker API contract. Travel and logistics are saved with the speaker profile; custom fields require a speaker API read/write contract.";

export interface SpeakerInvitationHistoryEntry {
  readonly preview: readonly SpeakerInvitationPreview[];
  readonly result: SpeakerInvitationResult;
  readonly occurredAt: string;
}

export interface SpeakerOnboardingTaskDefinition {
  readonly definitionId: string;
  readonly title: string;
  readonly dueAt: string | null;
  readonly participantIds: readonly string[];
}

export const DEFAULT_STATUS_OPTIONS = [
  "pending",
  "invited",
  "confirmed",
  "accepted",
  "declined",
] as const;
export const ASYNC_ACTION_TIMEOUT_MS = 15_000;
export const SPEAKER_ROSTER_COLUMNS = ["Speaker", "Status", "Sessions", "Tasks", "Action"] as const;

export const SPEAKER_WELCOME_EMAIL_STARTER = {
  name: "Speaker welcome",
  subject: "Welcome to the speaker program, {{first_name}}",
  html: `<p>Hello {{first_name}},</p>
<p>Welcome to the speaker program. We’re excited to have you join us.</p>
<p>We’ll use this email address for important event updates, speaker tasks, and schedule information.</p>
<p>Please sign in to your speaker portal to review your profile and outstanding tasks.</p>
<p>Best,<br />The event team</p>`,
  text: `Hello {{first_name}},

Welcome to the speaker program. We’re excited to have you join us.

We’ll use this email address for important event updates, speaker tasks, and schedule information.

Please sign in to your speaker portal to review your profile and outstanding tasks.

Best,
The event team`,
} as const;
