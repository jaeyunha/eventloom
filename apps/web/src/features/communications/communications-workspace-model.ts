import { createScopedReadFlightCoordinator } from "@/lib/scoped-read-flight";
import {
  type CommunicationApi,
  CommunicationApiError,
  type CommunicationAudience,
  type CommunicationPreview,
  type CommunicationTemplate,
  type CommunicationTemplatePurpose,
  type ReminderDispatch,
  type ReminderFacts,
  type ReminderRun,
} from "./api";

export type CommunicationProviderState =
  | "unknown"
  | "available"
  | "unavailable"
  | "domain-unverified";

export type CommunicationNavigationCacheResource = "templates" | "reminder-truth";

export interface CommunicationReminderTruthSnapshot {
  readonly runs: readonly ReminderRun[];
  readonly dispatches: readonly ReminderDispatch[];
  readonly facts: ReminderFacts | null;
}

export function normalizeCommunicationScopeId(value: string): string {
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

export interface CommunicationTemplateSelection {
  readonly templateId: string;
  readonly templateVersion: number;
}

export interface CommunicationPreviewActionState {
  readonly preview: CommunicationPreview | null;
  readonly sendConfirmationOpen: boolean;
  readonly idempotencyKey: string | null;
}

export interface CommunicationTemplateReadKey {
  readonly api: CommunicationApi;
  readonly organizationId: string;
  readonly eventId: string;
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

export function invalidateCommunicationPreviewState(
  _state: CommunicationPreviewActionState,
): CommunicationPreviewActionState {
  return {
    preview: null,
    sendConfirmationOpen: false,
    idempotencyKey: null,
  };
}

export function messageFromError(error: unknown): string {
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

export function stateFromError(error: unknown): CommunicationProviderState | undefined {
  if (!(error instanceof CommunicationApiError)) return undefined;
  if (error.code === "COMMUNICATION_UNAVAILABLE" || error.status === 503) {
    return /domain|verif/iu.test(error.message) ? "domain-unverified" : "unavailable";
  }
  return undefined;
}

export function reminderTruthStateFromError(error: unknown): ReminderTruthState {
  if (error instanceof CommunicationApiError) {
    if (error.code === "COMMUNICATION_CONFLICT" || error.status === 409) return "conflict";
    if (error.code === "COMMUNICATION_UNAVAILABLE" || error.status === 503) {
      return "unavailable";
    }
  }
  return "stale";
}
