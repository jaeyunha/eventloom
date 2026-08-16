import { createPortalApi, type PortalApi, PortalApiError } from "./api";
import { portalSubmissionIdsMatch, scopePortalContextToAuthorizedParticipants } from "./model";
import type {
  PortalAsset,
  PortalCapability,
  PortalContext,
  PortalRosterEnvelope,
  PortalTask,
  PortalTaskStatus,
  PortalView,
} from "./types";

export function messageFrom(error: unknown): string {
  if (error instanceof PortalApiError || error instanceof Error) {
    return error.message;
  }
  return "The speaker portal request could not be completed.";
}

export function withUpdatedTask(view: PortalView, task: PortalTask): PortalView {
  const tasks = view.tasks.map((candidate) => (candidate.id === task.id ? task : candidate));
  return {
    ...view,
    tasks,
    outstandingTaskCount: tasks.filter(
      (candidate) => candidate.status !== "completed" && candidate.status !== "waived",
    ).length,
  };
}

export function withUpdatedAsset(view: PortalView, asset: PortalAsset): PortalView {
  return {
    ...view,
    assets: [...(view.assets ?? []).filter((candidate) => candidate.id !== asset.id), asset],
  };
}

export function taskMutationMatches(
  updated: PortalTask,
  original: PortalTask,
  eventId: string,
  expectedStatus: PortalTaskStatus,
): boolean {
  const sameSubmission =
    updated.submissionId === null || original.submissionId === null
      ? updated.submissionId === original.submissionId
      : portalSubmissionIdsMatch(updated.submissionId, original.submissionId);
  return (
    updated.id === original.id &&
    updated.eventId === eventId &&
    sameSubmission &&
    updated.participantId === original.participantId &&
    updated.owner === "speaker" &&
    updated.status === expectedStatus &&
    updated.version > original.version
  );
}

export function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function isPortalGenerationCurrent(
  startedGeneration: number,
  activeGeneration: number,
): boolean {
  return startedGeneration === activeGeneration;
}

export function portalViewMatchesSelection(
  view: PortalView | null,
  target: PortalContext,
  selectedParticipantId: string | null,
): boolean {
  const viewContext = view?.context;
  return (
    viewContext !== undefined &&
    viewContext.id === target.id &&
    viewContext.eventId === target.eventId &&
    (viewContext.selectedParticipantId ?? viewContext.primaryParticipantId ?? null) ===
      selectedParticipantId
  );
}

export function portalViewAfterLoadFailure(
  previousView: PortalView | null,
  preserveCurrentView: boolean,
): PortalView | null {
  return preserveCurrentView ? previousView : null;
}

export function normalizeCapabilities(
  value: readonly PortalCapability[] | undefined,
): PortalCapability[] {
  if (!value) {
    return [];
  }
  const allowed = new Set<PortalCapability>([
    "profile-self",
    "submission-edit",
    "roster-manage",
    "task-response",
    "asset-read",
    "asset-write",
    "asset-comment",
    "resource-read",
  ]);
  return value.filter((capability): capability is PortalCapability => allowed.has(capability));
}

export type PortalPrefetchResult =
  | { status: "fulfilled"; value: PortalView }
  | { status: "rejected"; reason: unknown };

export interface PortalStartupResult {
  authorizedContexts: PortalContext[];
  preferredContext: PortalContext | null;
  prefetchedView?: PortalPrefetchResult;
}

function invokePortalRequest<T>(request: () => Promise<T>): Promise<T> {
  try {
    return Promise.resolve(request());
  } catch (error) {
    return Promise.reject(error);
  }
}

export async function loadPortalStartup(
  api: Pick<PortalApi, "getPortal"> & {
    listPortalContexts?: PortalApi["listPortalContexts"];
  },
  configuredEventId?: string,
  signal?: AbortSignal,
): Promise<PortalStartupResult> {
  const listPortalContexts = api.listPortalContexts;
  if (!listPortalContexts) {
    throw new PortalApiError("NO_PORTAL_CONTEXT", "No authorized event context is available.", 403);
  }

  const normalizedConfiguredEventId = configuredEventId?.trim() || undefined;
  const authorizedContexts = (await invokePortalRequest(() => listPortalContexts(signal)))
    .map((candidate) => scopePortalContextToAuthorizedParticipants(candidate))
    .filter(
      (candidate) =>
        candidate.eventId.length > 0 &&
        (candidate.submissionIds.length > 0 || candidate.participantIds.length > 0),
    );
  if (signal?.aborted) {
    return { authorizedContexts, preferredContext: null };
  }

  const preferredContext =
    authorizedContexts.find((candidate) => candidate.id === normalizedConfiguredEventId) ??
    authorizedContexts.find((candidate) => candidate.eventId === normalizedConfiguredEventId) ??
    authorizedContexts[0] ??
    null;
  const shouldPrefetch =
    normalizedConfiguredEventId !== undefined &&
    !normalizedConfiguredEventId.startsWith("portal:") &&
    preferredContext !== null;
  if (!shouldPrefetch || signal?.aborted) {
    return { authorizedContexts, preferredContext };
  }

  const prefetchedView = await invokePortalRequest(() =>
    api.getPortal(preferredContext.eventId, signal),
  ).then(
    (value) => ({ status: "fulfilled", value }) as const,
    (reason) => ({ status: "rejected", reason }) as const,
  );
  if (signal?.aborted) {
    return { authorizedContexts, preferredContext };
  }

  return {
    authorizedContexts,
    preferredContext,
    prefetchedView,
  };
}

function contextName(context: PortalContext): string {
  return context.name.trim() || "Event";
}
function portalContextOrganizationId(context: PortalContext): string | null {
  const explicit = context.organizationId?.trim();
  if (explicit) return explicit;
  const parts = context.id.split(":");
  return parts.length >= 3 && parts[0] === "portal" ? parts[1]?.trim() || null : null;
}
export function submissionIdAuthorized(target: PortalContext, submissionId: string): boolean {
  return target.submissionIds.some((authorizedId) =>
    portalSubmissionIdsMatch(authorizedId, submissionId),
  );
}

function submissionBelongsToPortalContext(
  submission: PortalView["submissions"][number],
  target: PortalContext,
): boolean {
  return (
    submission.eventId === target.eventId &&
    submissionIdAuthorized(target, submission.id) &&
    (target.primaryParticipantId === undefined ||
      submission.participantIds.includes(target.primaryParticipantId))
  );
}

export function portalContextResponseForTarget(
  target: PortalContext,
  candidate: PortalContext | undefined,
): PortalContext {
  if (
    candidate === undefined ||
    candidate.id !== target.id ||
    candidate.eventId !== target.eventId ||
    (portalContextOrganizationId(target) !== null &&
      portalContextOrganizationId(candidate) !== portalContextOrganizationId(target)) ||
    (target.primaryParticipantId !== undefined &&
      candidate.primaryParticipantId !== target.primaryParticipantId)
  ) {
    throw new PortalApiError(
      "CONTEXT_MISMATCH",
      "The portal response does not match the selected organization, event, or speaker.",
      409,
    );
  }
  return candidate;
}

export function createPortalProviderApi(
  providedApi?: PortalApi,
  providedApiBaseUrl?: string,
): PortalApi {
  return providedApi ?? createPortalApi(providedApiBaseUrl?.trim() ?? "");
}
export function taskBelongsToPortalContext(task: PortalTask, target: PortalContext): boolean {
  return (
    task.eventId === target.eventId &&
    target.primaryParticipantId !== undefined &&
    task.owner === "speaker" &&
    task.participantId === target.primaryParticipantId &&
    (task.submissionId === null || submissionIdAuthorized(target, task.submissionId))
  );
}

export function assetBelongsToPortalContext(
  asset: PortalAsset,
  target: PortalContext,
  tasks: readonly PortalTask[],
): boolean {
  if (
    asset.eventId !== target.eventId ||
    target.primaryParticipantId === undefined ||
    asset.participantId !== target.primaryParticipantId ||
    (asset.submissionId !== undefined && !submissionIdAuthorized(target, asset.submissionId))
  ) {
    return false;
  }
  if (asset.taskId === undefined) {
    return true;
  }
  const task = tasks.find((candidate) => candidate.id === asset.taskId);
  return (
    task !== undefined &&
    taskBelongsToPortalContext(task, target) &&
    (task.submissionId === null ||
      asset.submissionId === undefined ||
      portalSubmissionIdsMatch(asset.submissionId, task.submissionId))
  );
}

export function profileAssetBelongsToPortalContext(
  asset: PortalAsset,
  target: PortalContext,
): boolean {
  return (
    asset.eventId === target.eventId &&
    asset.participantId === target.primaryParticipantId &&
    asset.kind === "headshot" &&
    asset.taskId === undefined &&
    (asset.submissionId === undefined || submissionIdAuthorized(target, asset.submissionId))
  );
}
export function acceptedSubmissionId(
  submissionId: string,
  target: PortalContext,
  view: PortalView | null,
): string | null {
  return (
    view?.submissions.find(
      (submission) =>
        submission.status === "accepted" &&
        submissionBelongsToPortalContext(submission, target) &&
        portalSubmissionIdsMatch(submission.id, submissionId),
    )?.id ?? null
  );
}
export function assetIdAuthorized(
  assetId: string,
  target: PortalContext,
  view: PortalView | null,
  workspaceAssets: readonly PortalAsset[],
): boolean {
  const asset =
    workspaceAssets.find((candidate) => candidate.id === assetId) ??
    view?.assets?.find((candidate) => candidate.id === assetId);
  return asset !== undefined && assetBelongsToPortalContext(asset, target, view?.tasks ?? []);
}
export function taskIdAuthorized(
  taskId: string,
  target: PortalContext,
  view: PortalView | null,
): boolean {
  const task = view?.tasks.find((candidate) => candidate.id === taskId);
  return task !== undefined && taskBelongsToPortalContext(task, target);
}
interface PortalRosterLoadResult {
  entries: readonly (readonly [string, PortalRosterEnvelope])[];
  failures: readonly unknown[];
}

export async function loadPortalRosters(
  api: PortalApi,
  target: PortalContext,
  nextView: PortalView,
  signal?: AbortSignal,
): Promise<PortalRosterLoadResult> {
  const failures: unknown[] = [];
  const safely = async <T>(operation: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await operation();
    } catch (operationError) {
      if (!isAbort(operationError)) {
        failures.push(operationError);
      }
      return fallback;
    }
  };
  const acceptedSubmissions = nextView.submissions.filter(
    (submission) =>
      submission.status === "accepted" && submissionBelongsToPortalContext(submission, target),
  );
  const includedRoster = nextView.roster;
  if (includedRoster !== undefined && !hasPortalCapability(target.capabilities, "roster-manage")) {
    const matchingSubmission = acceptedSubmissions.find((submission) =>
      portalSubmissionIdsMatch(submission.id, includedRoster.submissionId),
    );
    const roster = await safely(
      async () => {
        const organizationId = portalContextOrganizationId(target);
        if (
          (organizationId !== null && includedRoster.organizationId !== organizationId) ||
          includedRoster.eventId !== target.eventId ||
          matchingSubmission === undefined ||
          !target.submissionIds.some((authorizedId) =>
            portalSubmissionIdsMatch(authorizedId, includedRoster.submissionId),
          )
        ) {
          throw new PortalApiError(
            "CONTEXT_MISMATCH",
            "The roster response belongs to a different event or session.",
            409,
          );
        }
        return includedRoster;
      },
      undefined as PortalRosterEnvelope | undefined,
    );
    return {
      entries:
        roster === undefined || matchingSubmission === undefined
          ? []
          : ([[matchingSubmission.id, roster]] as const),
      failures,
    };
  }

  const getRoster = api.getRoster;
  if (!getRoster) {
    return { entries: [], failures };
  }
  const rosterResults = await Promise.all(
    acceptedSubmissions.map(async (submission) => {
      const roster = await safely(async () => {
        const result = await getRoster(target.eventId, submission.id, signal);
        const organizationId = portalContextOrganizationId(target);
        if (
          (organizationId !== null && result.organizationId !== organizationId) ||
          result.eventId !== target.eventId ||
          !portalSubmissionIdsMatch(result.submissionId, submission.id) ||
          !target.submissionIds.some((authorizedId) =>
            portalSubmissionIdsMatch(authorizedId, result.submissionId),
          )
        ) {
          throw new PortalApiError(
            "CONTEXT_MISMATCH",
            "The roster response belongs to a different event or session.",
            409,
          );
        }
        return result;
      }, undefined);
      return [submission.id, roster] as const;
    }),
  );
  return {
    entries: rosterResults.filter(
      (entry): entry is readonly [string, PortalRosterEnvelope] => entry[1] !== undefined,
    ),
    failures,
  };
}
export function hasPortalCapability(
  capabilities: readonly PortalCapability[] | undefined,
  capability: PortalCapability,
): boolean {
  return capabilities?.includes(capability) ?? false;
}

export function portalContextLabel(context: PortalContext): string {
  return contextName(context);
}
