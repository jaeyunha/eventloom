"use client";
import { useSearchParams } from "next/navigation";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import { type PortalApi, PortalApiError } from "./api";
import {
  classifyPortalProfileMutation,
  portalSelectedParticipantId,
  portalSubmissionIdsMatch,
  scopePortalContextToAuthorizedParticipants,
  scopePortalViewToAuthorizedParticipants,
} from "./model";
import {
  acceptedSubmissionId,
  assetBelongsToPortalContext,
  assetIdAuthorized,
  createPortalProviderApi,
  hasPortalCapability,
  isAbort,
  isPortalGenerationCurrent,
  loadPortalRosters,
  loadPortalStartup,
  messageFrom,
  normalizeCapabilities,
  type PortalPrefetchResult,
  portalContextResponseForTarget,
  portalViewAfterLoadFailure,
  portalViewMatchesSelection,
  profileAssetBelongsToPortalContext,
  submissionIdAuthorized,
  taskBelongsToPortalContext,
  taskIdAuthorized,
  taskMutationMatches,
  withUpdatedAsset,
  withUpdatedTask,
} from "./portal-provider-model";
import { PortalProviderBoundary } from "./portal-provider-sections";
import type {
  PortalAsset,
  PortalAssetComment,
  PortalAssetHistoryEntry,
  PortalCapability,
  PortalContext,
  PortalDownloadGrant,
  PortalFormAnswer,
  PortalProfile,
  PortalProfileMutationPhase,
  PortalResource,
  PortalRosterEnvelope,
  PortalRosterMember,
  PortalTask,
  PortalTaskForm,
  PortalTaskResponse,
  PortalTaskResponseEnvelope,
  PortalTaskStatus,
  PortalTravelLogistics,
  PortalView,
  PortalWikiPage,
} from "./types";

export interface PortalWorkspaceState {
  rosters: Record<string, PortalRosterEnvelope>;
  assets: PortalAsset[];
  assetHistories: Record<string, PortalAssetHistoryEntry[]>;
  assetComments: Record<string, PortalAssetComment[]>;
  taskForms: Record<string, PortalTaskForm>;
  taskResponses: Record<string, PortalTaskResponseEnvelope | null>;
  taskResponseHistories: Record<string, PortalTaskResponse[]>;
  resources: PortalResource[];
  wiki: PortalWikiPage[];
}

const emptyWorkspace: PortalWorkspaceState = {
  rosters: {},
  assets: [],
  assetHistories: {},
  assetComments: {},
  taskForms: {},
  taskResponses: {},
  taskResponseHistories: {},
  resources: [],
  wiki: [],
};
type PortalScopeState = {
  contexts: PortalContext[];
  context: PortalContext | null;
  selectedParticipantId: string | null;
  authoritativeView: PortalView | null;
  capabilities: PortalCapability[];
  view: PortalView | null;
  profileRevision: number | null;
};

type PortalScopeAction =
  | { type: "contexts-set"; contexts: PortalContext[] }
  | { type: "contexts-updated"; context: PortalContext }
  | { type: "context-set"; context: PortalContext | null }
  | { type: "selected-participant-set"; participantId: string | null }
  | { type: "authoritative-view-set"; view: PortalView | null }
  | { type: "capabilities-set"; capabilities: PortalCapability[] }
  | { type: "task-updated"; task: PortalTask }
  | { type: "task-asset-updated"; task: PortalTask; asset: PortalAsset }
  | { type: "view-set"; view: PortalView | null }
  | { type: "profile-revision-set"; revision: number | null }
  | {
      type: "hydrate-succeeded";
      authoritativeView: PortalView;
      context: PortalContext;
      selectedParticipantId: string | null;
      capabilities: PortalCapability[];
      view: PortalView;
      profileRevision: number | null;
    }
  | {
      type: "hydrate-failed";
      preserveCurrentView: boolean;
    }
  | {
      type: "profile-updated";
      profile: PortalProfile;
      asset?: PortalAsset;
      revision: number;
    };

function initialPortalScopeState(): PortalScopeState {
  return {
    contexts: [],
    context: null,
    selectedParticipantId: null,
    authoritativeView: null,
    capabilities: [],
    view: null,
    profileRevision: null,
  };
}

function portalViewWithUpdatedProfile(
  current: PortalView | null,
  profile: PortalProfile,
  asset: PortalAsset | undefined,
): PortalView | null {
  if (!current) return current;
  const updatedView = {
    ...current,
    profiles: current.profiles.map((candidate) =>
      candidate.participantId === profile.participantId && candidate.eventId === profile.eventId
        ? profile
        : candidate,
    ),
  };
  return asset === undefined ? updatedView : withUpdatedAsset(updatedView, asset);
}
function portalScopeReducer(state: PortalScopeState, action: PortalScopeAction): PortalScopeState {
  switch (action.type) {
    case "contexts-set":
      return { ...state, contexts: action.contexts };
    case "contexts-updated":
      return {
        ...state,
        contexts: state.contexts.map((candidate) =>
          candidate.id === action.context.id ? action.context : candidate,
        ),
      };
    case "context-set":
      return { ...state, context: action.context };
    case "selected-participant-set":
      return { ...state, selectedParticipantId: action.participantId };
    case "authoritative-view-set":
      return { ...state, authoritativeView: action.view };
    case "capabilities-set":
      return { ...state, capabilities: action.capabilities };
    case "view-set":
      return { ...state, view: action.view };
    case "task-updated":
      return {
        ...state,
        view: state.view ? withUpdatedTask(state.view, action.task) : null,
      };
    case "task-asset-updated":
      return {
        ...state,
        view: state.view
          ? withUpdatedAsset(withUpdatedTask(state.view, action.task), action.asset)
          : null,
      };
    case "profile-revision-set":
      return { ...state, profileRevision: action.revision };
    case "hydrate-succeeded":
      return {
        ...state,
        authoritativeView: action.authoritativeView,
        context: action.context,
        selectedParticipantId: action.selectedParticipantId,
        contexts: state.contexts.map((candidate) =>
          candidate.id === action.context.id ? action.context : candidate,
        ),
        capabilities: action.capabilities,
        view: action.view,
        profileRevision: action.profileRevision,
      };
    case "hydrate-failed":
      return {
        ...state,
        view: portalViewAfterLoadFailure(state.view, action.preserveCurrentView),
        authoritativeView: portalViewAfterLoadFailure(
          state.authoritativeView,
          action.preserveCurrentView,
        ),
      };
    case "profile-updated":
      return {
        ...state,
        view: portalViewWithUpdatedProfile(state.view, action.profile, action.asset),
        authoritativeView: portalViewWithUpdatedProfile(
          state.authoritativeView,
          action.profile,
          action.asset,
        ),
        profileRevision: action.revision,
      };
  }
}

type PortalWorkspaceReducerState = {
  workspace: PortalWorkspaceState;
  loading: boolean;
  error: string | null;
};

type PortalWorkspaceAction =
  | { type: "reset" }
  | { type: "loading-set"; loading: boolean }
  | { type: "error-set"; error: string | null }
  | { type: "workspace-set"; workspace: PortalWorkspaceState }
  | { type: "roster-set"; submissionId: string; roster: PortalRosterEnvelope }
  | { type: "asset-added"; asset: PortalAsset }
  | { type: "asset-upserted"; asset: PortalAsset }
  | { type: "asset-replaced"; asset: PortalAsset }
  | { type: "asset-history-set"; assetId: string; history: PortalAssetHistoryEntry[] }
  | { type: "asset-comments-set"; assetId: string; comments: PortalAssetComment[] }
  | { type: "asset-comment-added"; comment: PortalAssetComment }
  | { type: "task-form-set"; taskId: string; form: PortalTaskForm }
  | {
      type: "task-response-set";
      taskId: string;
      response: PortalTaskResponseEnvelope;
    };

function initialPortalWorkspaceState(): PortalWorkspaceReducerState {
  return { workspace: emptyWorkspace, loading: false, error: null };
}

function portalWorkspaceReducer(
  state: PortalWorkspaceReducerState,
  action: PortalWorkspaceAction,
): PortalWorkspaceReducerState {
  switch (action.type) {
    case "reset":
      return initialPortalWorkspaceState();
    case "loading-set":
      return { ...state, loading: action.loading };
    case "error-set":
      return { ...state, error: action.error };
    case "workspace-set":
      return { ...state, workspace: action.workspace };
    case "roster-set":
      return {
        ...state,
        workspace: {
          ...state.workspace,
          rosters: { ...state.workspace.rosters, [action.submissionId]: action.roster },
        },
      };
    case "asset-added":
      return {
        ...state,
        workspace: { ...state.workspace, assets: [action.asset, ...state.workspace.assets] },
      };
    case "asset-upserted":
      return {
        ...state,
        workspace: {
          ...state.workspace,
          assets: [
            ...state.workspace.assets.filter((asset) => asset.id !== action.asset.id),
            action.asset,
          ],
        },
      };
    case "asset-replaced":
      return {
        ...state,
        workspace: {
          ...state.workspace,
          assets: state.workspace.assets.map((asset) =>
            asset.id === action.asset.id ? action.asset : asset,
          ),
        },
      };
    case "asset-history-set":
      return {
        ...state,
        workspace: {
          ...state.workspace,
          assetHistories: {
            ...state.workspace.assetHistories,
            [action.assetId]: action.history,
          },
        },
      };
    case "asset-comments-set":
      return {
        ...state,
        workspace: {
          ...state.workspace,
          assetComments: {
            ...state.workspace.assetComments,
            [action.assetId]: action.comments,
          },
        },
      };
    case "asset-comment-added":
      return {
        ...state,
        workspace: {
          ...state.workspace,
          assetComments: {
            ...state.workspace.assetComments,
            [action.comment.assetId]: [
              ...(state.workspace.assetComments[action.comment.assetId] ?? []),
              action.comment,
            ],
          },
        },
      };
    case "task-form-set":
      return {
        ...state,
        workspace: {
          ...state.workspace,
          taskForms: { ...state.workspace.taskForms, [action.taskId]: action.form },
        },
      };
    case "task-response-set":
      return {
        ...state,
        workspace: {
          ...state.workspace,
          taskResponses: { ...state.workspace.taskResponses, [action.taskId]: action.response },
          taskResponseHistories: {
            ...state.workspace.taskResponseHistories,
            [action.taskId]: [...action.response.history],
          },
        },
      };
  }
}

type PortalAsyncState = {
  loading: boolean;
  error: string | null;
  mutationError: string | null;
  busyTaskIds: ReadonlySet<string>;
  busyAssetIds: ReadonlySet<string>;
  busyRoster: boolean;
  savingProfile: boolean;
  profileMutationState: PortalProfileMutationPhase;
};

type PortalAsyncAction =
  | { type: "loading-set"; loading: boolean }
  | { type: "error-set"; error: string | null }
  | { type: "mutation-error-set"; error: string | null }
  | { type: "task-busy-set"; taskId: string; busy: boolean }
  | { type: "asset-busy-set"; assetId: string; busy: boolean }
  | { type: "roster-busy-set"; busy: boolean }
  | { type: "saving-profile-set"; saving: boolean }
  | { type: "profile-mutation-set"; phase: PortalProfileMutationPhase };

function initialPortalAsyncState(): PortalAsyncState {
  return {
    loading: true,
    error: null,
    mutationError: null,
    busyTaskIds: new Set(),
    busyAssetIds: new Set(),
    busyRoster: false,
    savingProfile: false,
    profileMutationState: "idle",
  };
}

function portalAsyncReducer(state: PortalAsyncState, action: PortalAsyncAction): PortalAsyncState {
  switch (action.type) {
    case "loading-set":
      return { ...state, loading: action.loading };
    case "error-set":
      return { ...state, error: action.error };
    case "mutation-error-set":
      return { ...state, mutationError: action.error };
    case "task-busy-set": {
      const busyTaskIds = new Set(state.busyTaskIds);
      if (action.busy) busyTaskIds.add(action.taskId);
      else busyTaskIds.delete(action.taskId);
      return { ...state, busyTaskIds };
    }
    case "asset-busy-set": {
      const busyAssetIds = new Set(state.busyAssetIds);
      if (action.busy) busyAssetIds.add(action.assetId);
      else busyAssetIds.delete(action.assetId);
      return { ...state, busyAssetIds };
    }
    case "roster-busy-set":
      return { ...state, busyRoster: action.busy };
    case "saving-profile-set":
      return { ...state, savingProfile: action.saving };
    case "profile-mutation-set":
      return { ...state, profileMutationState: action.phase };
  }
}
const EMPTY_PARTICIPANT_ID_LIST: readonly string[] = [];

interface PortalContextValue {
  eventId: string;
  /** The selected event query is a display/navigation hint, never an authority source. */
  eventQuery: string;
  contexts: readonly PortalContext[];
  context: PortalContext | null;
  authorizedParticipantIds: readonly string[];
  selectedParticipantId: string | null;
  switchParticipant(participantId: string): boolean;
  capabilities: readonly PortalCapability[];
  can(capability: PortalCapability): boolean;
  switchContext(contextId: string): Promise<boolean>;
  view: PortalView | null;
  workspace: PortalWorkspaceState;
  workspaceLoading: boolean;
  workspaceError: string | null;
  loading: boolean;
  error: string | null;
  mutationError: string | null;
  busyTaskIds: ReadonlySet<string>;
  busyAssetIds: ReadonlySet<string>;
  busyRoster: boolean;
  savingProfile: boolean;
  profileMutationState: PortalProfileMutationPhase;
  profileRevision: number | null;
  reload(): Promise<void>;
  loadWorkspace(): Promise<void>;
  saveProfile(input: {
    profile: PortalProfile;
    biography: string;
    jobTitle: string;
    company: string;
    socialLinks: Readonly<Record<string, string>>;
    travelLogistics?: PortalTravelLogistics;
    status?: string;
    headshot?: File;
  }): Promise<boolean>;
  transitionTask(task: PortalTask, toStatus: PortalTaskStatus, note?: string): Promise<boolean>;
  uploadTask(task: PortalTask, file: File): Promise<boolean>;
  addRosterEntry(input: {
    submissionId: string;
    email: string;
    displayName: string;
    role: "co_speaker";
  }): Promise<boolean>;
  updateRosterEntry(input: {
    submissionId: string;
    participantId: string;
    displayName?: string;
    email?: string;
    status?: PortalRosterMember["status"];
  }): Promise<boolean>;
  removeRosterEntry(input: { submissionId: string; participantId: string }): Promise<boolean>;
  uploadWorkspaceFile(input: {
    participantId: string;
    submissionId?: string;
    taskId?: string;
    kind: "headshot" | "slides" | "supporting_file";
    file: File;
    supersedesAssetId?: string;
  }): Promise<boolean>;
  retryAssetUpload(input: { assetId: string; file: File }): Promise<boolean>;
  completeAssetUpload(input: { assetId: string }): Promise<boolean>;
  loadAssetHistory(assetId: string): Promise<PortalAssetHistoryEntry[]>;
  loadAssetComments(assetId: string): Promise<PortalAssetComment[]>;
  addAssetComment(input: {
    assetId: string;
    body: string;
    expectedVersion?: number;
  }): Promise<boolean>;
  downloadAsset(assetId: string): Promise<PortalDownloadGrant | null>;
  loadTaskForm(taskId: string): Promise<PortalTaskForm | null>;
  loadTaskResponse(taskId: string): Promise<PortalTaskResponseEnvelope | null>;
  saveTaskResponse(input: {
    taskId: string;
    definitionVersion: number;
    answers: Readonly<Record<string, PortalFormAnswer>>;
    expectedVersion: number;
  }): Promise<boolean>;
  clearMutationError(): void;
  clearWorkspaceError(): void;
}

const PortalContextValueProvider = createContext<PortalContextValue | null>(null);

interface PortalProviderProps {
  children: ReactNode;
  api?: PortalApi;
  apiBaseUrl?: string;
}

function usePortalProviderValue({
  api: providedApi,
  apiBaseUrl: providedApiBaseUrl,
}: Readonly<{
  readonly api?: PortalApi | undefined;
  readonly apiBaseUrl?: string | undefined;
}>) {
  const searchParams = useSearchParams();
  const requestedEventId =
    searchParams?.get("eventId")?.trim() || searchParams?.get("event")?.trim() || undefined;
  const configuredEventId = requestedEventId;
  const apiBaseUrl = providedApiBaseUrl?.trim() ?? "";
  const api = useMemo<PortalApi>(
    () => createPortalProviderApi(providedApi, apiBaseUrl),
    [apiBaseUrl, providedApi],
  );
  const [scopeState, scopeDispatch] = useReducer(
    portalScopeReducer,
    undefined,
    initialPortalScopeState,
  );
  const [workspaceState, workspaceDispatch] = useReducer(
    portalWorkspaceReducer,
    undefined,
    initialPortalWorkspaceState,
  );
  const [asyncState, asyncDispatch] = useReducer(
    portalAsyncReducer,
    undefined,
    initialPortalAsyncState,
  );
  const {
    contexts,
    context,
    selectedParticipantId,
    authoritativeView,
    capabilities,
    view,
    profileRevision,
  } = scopeState;
  const { workspace, loading: workspaceLoading, error: workspaceError } = workspaceState;
  const {
    loading,
    error,
    mutationError,
    busyTaskIds,
    busyAssetIds,
    busyRoster,
    savingProfile,
    profileMutationState,
  } = asyncState;
  const authoritativeViewRef = useRef<PortalView | null>(null);
  const loadGeneration = useRef(0);
  const profileMutationIdRef = useRef(0);

  const eventId = context?.eventId ?? "";
  const eventQuery = eventId ? `?event=${encodeURIComponent(eventId)}` : "";
  const authorizedParticipantIds =
    contexts.find((candidate) => candidate.id === context?.id)?.participantIds ??
    EMPTY_PARTICIPANT_ID_LIST;
  const can = useCallback(
    (capability: PortalCapability) => capabilities.includes(capability),
    [capabilities],
  );

  const clearWorkspace = useCallback(() => {
    workspaceDispatch({ type: "reset" });
  }, []);

  const loadWorkspaceFor = useCallback(
    async (target: PortalContext, nextView: PortalView, signal?: AbortSignal): Promise<void> => {
      const generation = ++loadGeneration.current;
      workspaceDispatch({ type: "loading-set", loading: true });
      workspaceDispatch({ type: "error-set", error: null });
      workspaceDispatch({ type: "workspace-set", workspace: emptyWorkspace });
      try {
        const nextWorkspace: PortalWorkspaceState = {
          rosters: {},
          assets: [],
          assetHistories: {},
          assetComments: {},
          taskForms: {},
          taskResponses: {},
          taskResponseHistories: {},
          resources: [],
          wiki: [],
        };
        const failures: unknown[] = [];
        const formTasks = nextView.tasks.filter(
          (task) => task.type === "form" && taskBelongsToPortalContext(task, target),
        );

        const safely = async <T,>(operation: () => Promise<T>, fallback: T): Promise<T> => {
          try {
            return await operation();
          } catch (operationError) {
            if (!isAbort(operationError)) {
              failures.push(operationError);
            }
            return fallback;
          }
        };

        const rosterLoad = loadPortalRosters(api, target, nextView, signal);
        const includedAssets = nextView.assets;
        const listAssets = api.listAssets;
        const assetsLoad =
          includedAssets !== undefined
            ? safely(async () => {
                if (
                  includedAssets.some(
                    (asset) => !assetBelongsToPortalContext(asset, target, nextView.tasks),
                  )
                ) {
                  throw new PortalApiError(
                    "CONTEXT_MISMATCH",
                    "The file response belongs to a different event, speaker, or session.",
                    409,
                  );
                }
                return [...includedAssets];
              }, [] as PortalAsset[])
            : listAssets !== undefined && hasPortalCapability(target.capabilities, "asset-read")
              ? safely(async () => {
                  const assets = await listAssets(
                    target.eventId,
                    signal === undefined ? undefined : { signal },
                  );
                  if (
                    assets.some(
                      (asset) => !assetBelongsToPortalContext(asset, target, nextView.tasks),
                    )
                  ) {
                    throw new PortalApiError(
                      "CONTEXT_MISMATCH",
                      "The file response belongs to a different event, speaker, or session.",
                      409,
                    );
                  }
                  return assets;
                }, [] as PortalAsset[])
              : Promise.resolve([] as PortalAsset[]);

        const listResources = api.listResources;
        const resourcesLoad =
          nextView.resources !== undefined
            ? Promise.resolve([...nextView.resources])
            : listResources !== undefined &&
                hasPortalCapability(target.capabilities, "resource-read")
              ? safely(() => listResources(target.eventId, signal), [] as PortalResource[])
              : Promise.resolve([] as PortalResource[]);

        const listWiki = api.listWiki;
        const wikiLoad =
          nextView.wiki !== undefined
            ? Promise.resolve([...nextView.wiki])
            : listWiki !== undefined && hasPortalCapability(target.capabilities, "resource-read")
              ? safely(() => listWiki(target.eventId, signal), [] as PortalWikiPage[])
              : Promise.resolve([] as PortalWikiPage[]);

        const taskLoad =
          hasPortalCapability(target.capabilities, "task-response") &&
          (api.getTaskForm !== undefined || api.getTaskResponse !== undefined)
            ? Promise.all(
                formTasks.map(async (task) => {
                  const taskInput =
                    signal === undefined
                      ? { eventId: target.eventId, taskId: task.id }
                      : { eventId: target.eventId, taskId: task.id, signal };
                  const [form, response] = await Promise.all([
                    api.getTaskForm
                      ? safely(
                          async () => {
                            const result = await api.getTaskForm?.(taskInput);
                            if (result === undefined || result.taskId !== task.id) {
                              throw new PortalApiError(
                                "CONTEXT_MISMATCH",
                                "The task form belongs to a different task.",
                                409,
                              );
                            }
                            return result;
                          },
                          undefined as PortalTaskForm | undefined,
                        )
                      : Promise.resolve(undefined as PortalTaskForm | undefined),
                    api.getTaskResponse
                      ? safely(
                          async () => {
                            const result = await api.getTaskResponse?.(taskInput);
                            if (
                              result === undefined ||
                              result.eventId !== target.eventId ||
                              result.taskId !== task.id ||
                              result.participantId !== target.primaryParticipantId
                            ) {
                              throw new PortalApiError(
                                "CONTEXT_MISMATCH",
                                "The task response belongs to a different event or task.",
                                409,
                              );
                            }
                            return result;
                          },
                          null as PortalTaskResponseEnvelope | null,
                        )
                      : Promise.resolve(null as PortalTaskResponseEnvelope | null),
                  ]);
                  return { taskId: task.id, form, response };
                }),
              )
            : Promise.resolve(
                [] as readonly {
                  taskId: string;
                  form: PortalTaskForm | undefined;
                  response: PortalTaskResponseEnvelope | null;
                }[],
              );

        const [rosterLoadResult, assets, resources, wiki, taskResults] = await Promise.all([
          rosterLoad,
          assetsLoad,
          resourcesLoad,
          wikiLoad,
          taskLoad,
        ]);
        failures.push(...rosterLoadResult.failures);
        for (const [submissionId, roster] of rosterLoadResult.entries) {
          nextWorkspace.rosters[submissionId] = roster;
        }
        nextWorkspace.assets = assets;
        nextWorkspace.resources = resources;
        nextWorkspace.wiki = wiki;
        for (const { taskId, form, response } of taskResults) {
          if (form !== undefined) {
            nextWorkspace.taskForms[taskId] = form;
          }
          if (response !== null) {
            nextWorkspace.taskResponses[taskId] = response;
            nextWorkspace.taskResponseHistories[taskId] = [...response.history];
          }
        }

        if (signal?.aborted || generation !== loadGeneration.current) {
          return;
        }
        workspaceDispatch({ type: "workspace-set", workspace: nextWorkspace });
        if (failures.length > 0) {
          workspaceDispatch({ type: "error-set", error: messageFrom(failures[0]) });
        }
      } finally {
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          workspaceDispatch({ type: "loading-set", loading: false });
        }
      }
    },
    [api],
  );

  const hydrate = useCallback(
    async (
      target: PortalContext,
      signal?: AbortSignal,
      prefetchedView?: PortalPrefetchResult,
      requestedParticipantId?: string | null,
      preserveCurrentView = false,
    ): Promise<boolean> => {
      const generation = ++loadGeneration.current;
      const requestedSelection = requestedParticipantId ?? target.primaryParticipantId ?? null;
      if (!preserveCurrentView) {
        scopeDispatch({ type: "context-set", context: target });
        scopeDispatch({
          type: "selected-participant-set",
          participantId: portalSelectedParticipantId(target, requestedSelection),
        });
        scopeDispatch({
          type: "capabilities-set",
          capabilities: normalizeCapabilities(target.capabilities),
        });
        scopeDispatch({ type: "view-set", view: null });
        clearWorkspace();
      }
      asyncDispatch({ type: "mutation-error-set", error: null });
      asyncDispatch({ type: "loading-set", loading: true });
      asyncDispatch({ type: "error-set", error: null });
      try {
        if (prefetchedView?.status === "rejected") {
          if (signal?.aborted || generation !== loadGeneration.current) {
            return false;
          }
          throw prefetchedView.reason;
        }
        const nextView =
          prefetchedView?.status === "fulfilled"
            ? prefetchedView.value
            : await api.getPortal(target.eventId, signal);
        if (signal?.aborted || generation !== loadGeneration.current) {
          return false;
        }
        const serverContext = portalContextResponseForTarget(target, nextView.context);
        const nextCapabilities = normalizeCapabilities(
          nextView.capabilities ?? serverContext.capabilities,
        );
        const authorizedContext = scopePortalContextToAuthorizedParticipants(serverContext);
        const selected = portalSelectedParticipantId(authorizedContext, requestedSelection);
        const scopedView = scopePortalViewToAuthorizedParticipants(
          { ...nextView, context: serverContext, capabilities: nextCapabilities },
          authorizedContext,
          selected,
        );
        const scopedContext =
          scopedView.context ??
          scopePortalContextToAuthorizedParticipants(authorizedContext, selected);
        const authoritative = {
          ...nextView,
          context: serverContext,
          capabilities: nextCapabilities,
        };
        authoritativeViewRef.current = authoritative;
        scopeDispatch({
          type: "hydrate-succeeded",
          authoritativeView: authoritative,
          context: scopedContext,
          selectedParticipantId: selected,
          capabilities: nextCapabilities,
          view: scopedView,
          profileRevision:
            scopedView.profiles.find(
              (profile) =>
                profile.eventId === scopedContext.eventId && profile.participantId === selected,
            )?.version ?? null,
        });
        workspaceDispatch({
          type: "workspace-set",
          workspace: { ...emptyWorkspace, assets: [...(scopedView.assets ?? [])] },
        });
        return true;
      } catch (loadError) {
        if (isAbort(loadError)) {
          return false;
        }
        if (generation === loadGeneration.current) {
          const failedAuthoritativeView = portalViewAfterLoadFailure(
            authoritativeViewRef.current,
            preserveCurrentView,
          );
          scopeDispatch({
            type: "hydrate-failed",
            preserveCurrentView,
          });
          authoritativeViewRef.current = failedAuthoritativeView;
          asyncDispatch({ type: "error-set", error: messageFrom(loadError) });
        }
        return false;
      } finally {
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          asyncDispatch({ type: "loading-set", loading: false });
          workspaceDispatch({ type: "loading-set", loading: false });
        }
      }
    },
    [api, clearWorkspace],
  );

  const loadInitial = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      const generation = ++loadGeneration.current;
      asyncDispatch({ type: "loading-set", loading: true });
      asyncDispatch({ type: "error-set", error: null });
      try {
        const startup = await loadPortalStartup(api, configuredEventId, signal);
        if (signal?.aborted || generation !== loadGeneration.current) {
          return;
        }
        scopeDispatch({ type: "contexts-set", contexts: startup.authorizedContexts });
        if (startup.authorizedContexts.length === 0) {
          scopeDispatch({ type: "context-set", context: null });
          scopeDispatch({ type: "selected-participant-set", participantId: null });
          scopeDispatch({ type: "capabilities-set", capabilities: [] });
          scopeDispatch({ type: "view-set", view: null });
          scopeDispatch({ type: "authoritative-view-set", view: null });
          authoritativeViewRef.current = null;
          scopeDispatch({ type: "profile-revision-set", revision: null });
          asyncDispatch({ type: "profile-mutation-set", phase: "idle" });
          clearWorkspace();
          asyncDispatch({ type: "mutation-error-set", error: null });
          asyncDispatch({ type: "error-set", error: null });
          return;
        }
        const preferred = startup.preferredContext;
        if (!preferred) {
          throw new PortalApiError(
            "NO_PORTAL_CONTEXT",
            "No authorized event context is available.",
            403,
          );
        }
        await hydrate(preferred, signal, startup.prefetchedView);
      } catch (loadError) {
        if (!isAbort(loadError) && generation === loadGeneration.current) {
          scopeDispatch({ type: "context-set", context: null });
          scopeDispatch({ type: "view-set", view: null });
          clearWorkspace();
          asyncDispatch({ type: "error-set", error: messageFrom(loadError) });
        }
      } finally {
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          asyncDispatch({ type: "loading-set", loading: false });
        }
      }
    },
    [api, clearWorkspace, configuredEventId, hydrate],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadInitial(controller.signal);
    return () => {
      controller.abort();
      loadGeneration.current += 1;
    };
  }, [loadInitial]);

  const reload = useCallback(async () => {
    if (context) {
      const target = contexts.find((candidate) => candidate.id === context.id) ?? context;
      await hydrate(
        target,
        undefined,
        undefined,
        selectedParticipantId,
        portalViewMatchesSelection(view, target, selectedParticipantId),
      );
    } else {
      await loadInitial();
    }
  }, [context, contexts, hydrate, loadInitial, selectedParticipantId, view]);

  const switchContext = useCallback(
    async (contextId: string): Promise<boolean> => {
      const target = contexts.find((candidate) => candidate.id === contextId);
      if (!target || target.id === context?.id) {
        return target?.id === context?.id;
      }
      scopeDispatch({ type: "view-set", view: null });
      scopeDispatch({ type: "authoritative-view-set", view: null });
      authoritativeViewRef.current = null;
      scopeDispatch({ type: "selected-participant-set", participantId: null });
      scopeDispatch({ type: "profile-revision-set", revision: null });
      asyncDispatch({ type: "profile-mutation-set", phase: "idle" });
      asyncDispatch({ type: "saving-profile-set", saving: false });
      clearWorkspace();
      asyncDispatch({ type: "mutation-error-set", error: null });
      asyncDispatch({ type: "error-set", error: null });
      asyncDispatch({ type: "loading-set", loading: true });
      return hydrate(target);
    },
    [clearWorkspace, context?.id, contexts, hydrate],
  );

  const switchParticipant = useCallback(
    (participantId: string): boolean => {
      const target =
        (context === null
          ? undefined
          : contexts.find((candidate) => candidate.id === context.id)) ?? context;
      if (!target) {
        return false;
      }
      const selected = portalSelectedParticipantId(target, participantId);
      if (selected === null) {
        return false;
      }
      const source = authoritativeViewRef.current ?? authoritativeView;
      if (!source) {
        return false;
      }
      loadGeneration.current += 1;
      const scopedContext = scopePortalContextToAuthorizedParticipants(target, selected);
      const scopedView = scopePortalViewToAuthorizedParticipants(source, target, selected);
      scopeDispatch({ type: "context-set", context: scopedContext });
      scopeDispatch({ type: "selected-participant-set", participantId: selected });
      scopeDispatch({ type: "view-set", view: scopedView });
      scopeDispatch({
        type: "profile-revision-set",
        revision:
          scopedView.profiles.find(
            (profile) =>
              profile.eventId === scopedContext.eventId && profile.participantId === selected,
          )?.version ?? null,
      });
      asyncDispatch({ type: "profile-mutation-set", phase: "idle" });
      asyncDispatch({ type: "saving-profile-set", saving: false });
      asyncDispatch({ type: "mutation-error-set", error: null });
      workspaceDispatch({
        type: "workspace-set",
        workspace: { ...emptyWorkspace, assets: [...(scopedView.assets ?? [])] },
      });
      return true;
    },
    [authoritativeView, context, contexts],
  );
  const loadWorkspace = useCallback(async () => {
    if (context && view) {
      await loadWorkspaceFor(context, view);
      return;
    }
    workspaceDispatch({ type: "loading-set", loading: false });
  }, [context, loadWorkspaceFor, view]);

  const saveProfile = useCallback(
    async (input: {
      profile: PortalProfile;
      biography: string;
      jobTitle: string;
      company: string;
      socialLinks: Readonly<Record<string, string>>;
      travelLogistics?: PortalTravelLogistics;
      status?: string;
      headshot?: File;
    }) => {
      if (!context) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "No authorized portal context is available.",
        });
        asyncDispatch({ type: "profile-mutation-set", phase: "failure" });
        return false;
      }
      if (!can("profile-self")) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "You do not have permission to edit this profile.",
        });
        asyncDispatch({ type: "profile-mutation-set", phase: "failure" });
        return false;
      }
      const activeParticipantId = selectedParticipantId ?? context.primaryParticipantId;
      if (
        !activeParticipantId ||
        input.profile.eventId !== context.eventId ||
        input.profile.participantId !== activeParticipantId
      ) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "This profile does not belong to the active speaker.",
        });
        asyncDispatch({ type: "profile-mutation-set", phase: "failure" });
        return false;
      }
      if (!api.updateProfile) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "The speaker profile API is not available yet.",
        });
        asyncDispatch({ type: "profile-mutation-set", phase: "failure" });
        return false;
      }
      if (input.headshot && (!can("asset-write") || !api.uploadFile || !api.finalizeAsset)) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "Private headshot uploads are not available for this event.",
        });
        asyncDispatch({ type: "profile-mutation-set", phase: "failure" });
        return false;
      }

      const targetContext = context;
      const generation = loadGeneration.current;
      const mutationId = profileMutationIdRef.current + 1;
      profileMutationIdRef.current = mutationId;
      asyncDispatch({ type: "saving-profile-set", saving: true });
      asyncDispatch({ type: "profile-mutation-set", phase: "saving" });
      asyncDispatch({ type: "mutation-error-set", error: null });
      try {
        let finalizedHeadshot: PortalAsset | undefined;
        if (input.headshot && api.uploadFile && api.finalizeAsset) {
          asyncDispatch({ type: "profile-mutation-set", phase: "pending" });
          const pending = await api.uploadFile({
            eventId: targetContext.eventId,
            participantId: activeParticipantId,
            kind: "headshot",
            file: input.headshot,
            ...(input.profile.headshotAssetId
              ? { supersedesAssetId: input.profile.headshotAssetId }
              : {}),
          });
          if (!profileAssetBelongsToPortalContext(pending, targetContext)) {
            throw new PortalApiError(
              "CONTEXT_MISMATCH",
              "The headshot upload belongs to a different event or participant.",
              409,
            );
          }
          finalizedHeadshot = await api.finalizeAsset({
            eventId: targetContext.eventId,
            assetId: pending.id,
            state: "ready",
          });
          if (
            finalizedHeadshot.id !== pending.id ||
            !profileAssetBelongsToPortalContext(finalizedHeadshot, targetContext) ||
            finalizedHeadshot.state !== "ready"
          ) {
            throw new PortalApiError(
              "CONTEXT_MISMATCH",
              "The finalized headshot belongs to a different event or participant.",
              409,
            );
          }
        }

        asyncDispatch({ type: "profile-mutation-set", phase: "saving" });
        const updated = await api.updateProfile({
          eventId: targetContext.eventId,
          participantId: activeParticipantId,
          biography: input.biography,
          jobTitle: input.jobTitle,
          company: input.company,
          socialLinks: input.socialLinks,
          ...(input.status === undefined ? {} : { status: input.status }),
          ...(input.travelLogistics === undefined
            ? {}
            : { travelLogistics: input.travelLogistics }),
          ...(finalizedHeadshot === undefined ? {} : { headshotAssetId: finalizedHeadshot.id }),
          expectedVersion: input.profile.version,
        });
        const classification = classifyPortalProfileMutation(updated, {
          eventId: targetContext.eventId,
          participantId: activeParticipantId,
          version: input.profile.version,
        });
        if (classification.state !== "saved") {
          throw new PortalApiError("PROFILE_NOT_AUTHORITATIVE", classification.message, 502);
        }
        if (finalizedHeadshot !== undefined && updated.headshotAssetId !== finalizedHeadshot.id) {
          throw new PortalApiError(
            "CONTEXT_MISMATCH",
            "The saved profile does not reference the finalized headshot.",
            409,
          );
        }
        if (!isPortalGenerationCurrent(generation, loadGeneration.current)) {
          return false;
        }
        const nextAuthoritative = portalViewWithUpdatedProfile(
          authoritativeViewRef.current,
          updated,
          finalizedHeadshot,
        );
        authoritativeViewRef.current = nextAuthoritative;
        scopeDispatch({
          type: "profile-updated",
          profile: updated,
          ...(finalizedHeadshot === undefined ? {} : { asset: finalizedHeadshot }),
          revision: updated.version,
        });
        asyncDispatch({ type: "profile-mutation-set", phase: "saved" });
        if (finalizedHeadshot !== undefined) {
          workspaceDispatch({ type: "asset-upserted", asset: finalizedHeadshot });
        }
        return true;
      } catch (saveError) {
        const conflict =
          saveError instanceof PortalApiError && saveError.code === "VERSION_CONFLICT";
        if (conflict && isPortalGenerationCurrent(generation, loadGeneration.current)) {
          asyncDispatch({ type: "profile-mutation-set", phase: "conflict" });
          asyncDispatch({ type: "mutation-error-set", error: messageFrom(saveError) });
          const refreshTarget =
            contexts.find((candidate) => candidate.id === targetContext.id) ?? targetContext;
          await hydrate(refreshTarget, undefined, undefined, activeParticipantId);
          if (isPortalGenerationCurrent(generation + 1, loadGeneration.current)) {
            asyncDispatch({ type: "profile-mutation-set", phase: "conflict" });
            asyncDispatch({ type: "mutation-error-set", error: messageFrom(saveError) });
          }
          return false;
        }
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          asyncDispatch({ type: "profile-mutation-set", phase: "failure" });
          asyncDispatch({ type: "mutation-error-set", error: messageFrom(saveError) });
        }
        return false;
      } finally {
        if (mutationId === profileMutationIdRef.current) {
          asyncDispatch({ type: "saving-profile-set", saving: false });
        }
      }
    },
    [api, can, context, contexts, hydrate, selectedParticipantId],
  );

  const transitionTask = useCallback(
    async (task: PortalTask, toStatus: PortalTaskStatus, note?: string) => {
      if (!context) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "No authorized portal context is available.",
        });
        return false;
      }
      if (!can("task-response")) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "You do not have permission to respond to this task.",
        });
        return false;
      }
      const targetContext = context;
      if (
        !taskBelongsToPortalContext(task, context) ||
        !view?.tasks.some(
          (candidate) => candidate.id === task.id && taskBelongsToPortalContext(candidate, context),
        )
      ) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "This task does not belong to the active speaker.",
        });
        return false;
      }
      const generation = loadGeneration.current;
      asyncDispatch({ type: "task-busy-set", taskId: task.id, busy: true });
      asyncDispatch({ type: "mutation-error-set", error: null });
      try {
        const updated = await api.transitionTask({
          eventId: targetContext.eventId,
          taskId: task.id,
          toStatus,
          expectedVersion: task.version,
          ...(note === undefined ? {} : { note }),
        });
        if (!taskMutationMatches(updated, task, targetContext.eventId, toStatus)) {
          throw new PortalApiError(
            "CONTEXT_MISMATCH",
            "The saved task does not match the active speaker or requested status.",
            409,
          );
        }
        if (!isPortalGenerationCurrent(generation, loadGeneration.current)) {
          return false;
        }
        scopeDispatch({ type: "task-updated", task: updated });
        return true;
      } catch (transitionError) {
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          asyncDispatch({ type: "mutation-error-set", error: messageFrom(transitionError) });
        }
        return false;
      } finally {
        asyncDispatch({ type: "task-busy-set", taskId: task.id, busy: false });
      }
    },
    [api, can, context, view],
  );

  const uploadTask = useCallback(
    async (task: PortalTask, file: File) => {
      if (!context) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "No authorized portal context is available.",
        });
        return false;
      }
      if (!can("task-response") || !can("asset-write")) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "You do not have permission to upload this task file.",
        });
        return false;
      }
      if (!api.finalizeAsset) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "Upload completion is not available yet.",
        });
        return false;
      }
      if (
        !taskBelongsToPortalContext(task, context) ||
        !view?.tasks.some(
          (candidate) => candidate.id === task.id && taskBelongsToPortalContext(candidate, context),
        )
      ) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "This task does not belong to the active speaker.",
        });
        return false;
      }
      const kind = task.acceptedAssetKinds?.[0];
      if (!kind) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "This upload task does not specify an accepted file kind.",
        });
        return false;
      }
      const targetContext = context;
      const generation = loadGeneration.current;
      asyncDispatch({ type: "task-busy-set", taskId: task.id, busy: true });
      asyncDispatch({ type: "mutation-error-set", error: null });
      try {
        const uploaded = await api.uploadTaskFile({
          eventId: targetContext.eventId,
          participantId: task.participantId,
          taskId: task.id,
          kind,
          file,
        });
        const finalized = await api.finalizeAsset({
          eventId: targetContext.eventId,
          assetId: uploaded.assetId,
          state: "ready",
        });
        if (
          finalized.eventId !== targetContext.eventId ||
          finalized.participantId !== task.participantId ||
          finalized.taskId !== task.id ||
          finalized.state !== "ready" ||
          !assetBelongsToPortalContext(finalized, targetContext, view?.tasks ?? [])
        ) {
          throw new PortalApiError(
            "CONTEXT_MISMATCH",
            "The finalized task file belongs to a different event, participant, or task.",
            409,
          );
        }
        const updated = await api.transitionTask({
          eventId: targetContext.eventId,
          taskId: task.id,
          toStatus: "submitted",
          expectedVersion: task.version,
          note: `Uploaded ${file.name}`,
        });
        if (!taskMutationMatches(updated, task, targetContext.eventId, "submitted")) {
          throw new PortalApiError(
            "CONTEXT_MISMATCH",
            "The saved upload task does not match the active speaker or submitted status.",
            409,
          );
        }
        if (!isPortalGenerationCurrent(generation, loadGeneration.current)) {
          return false;
        }
        scopeDispatch({ type: "task-asset-updated", task: updated, asset: finalized });
        workspaceDispatch({ type: "asset-upserted", asset: finalized });
        return true;
      } catch (uploadError) {
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          asyncDispatch({ type: "mutation-error-set", error: messageFrom(uploadError) });
        }
        return false;
      } finally {
        asyncDispatch({ type: "task-busy-set", taskId: task.id, busy: false });
      }
    },
    [api, can, context, view],
  );

  const addRosterEntry = useCallback(
    async (input: {
      submissionId: string;
      email: string;
      displayName: string;
      role: "co_speaker";
    }) => {
      if (!context) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "No authorized portal context is available.",
        });
        return false;
      }
      if (!can("roster-manage")) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "You do not have permission to manage co-speakers.",
        });
        return false;
      }
      if (!api.addRosterEntry) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "Co-speaker management is not available yet.",
        });
        return false;
      }
      const targetContext = context;
      const rosterSubmissionId = acceptedSubmissionId(input.submissionId, context, view);
      if (rosterSubmissionId === null) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "This roster does not belong to an active accepted session.",
        });
        return false;
      }
      const generation = loadGeneration.current;
      asyncDispatch({ type: "roster-busy-set", busy: true });
      asyncDispatch({ type: "mutation-error-set", error: null });
      try {
        const roster = await api.addRosterEntry({
          eventId: targetContext.eventId,
          ...input,
          submissionId: rosterSubmissionId,
        });
        if (
          roster.eventId !== targetContext.eventId ||
          !portalSubmissionIdsMatch(roster.submissionId, rosterSubmissionId)
        ) {
          throw new PortalApiError(
            "CONTEXT_MISMATCH",
            "The roster response belongs to a different event or session.",
            409,
          );
        }
        if (!isPortalGenerationCurrent(generation, loadGeneration.current)) {
          return false;
        }
        workspaceDispatch({
          type: "roster-set",
          submissionId: rosterSubmissionId,
          roster,
        });
        return true;
      } catch (addError) {
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          asyncDispatch({ type: "mutation-error-set", error: messageFrom(addError) });
        }
        return false;
      } finally {
        asyncDispatch({ type: "roster-busy-set", busy: false });
      }
    },
    [api, can, context, view],
  );

  const updateRosterEntry = useCallback(
    async (input: {
      submissionId: string;
      participantId: string;
      displayName?: string;
      email?: string;
      status?: PortalRosterMember["status"];
    }) => {
      if (!context) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "No authorized portal context is available.",
        });
        return false;
      }
      if (!can("roster-manage")) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "You do not have permission to manage co-speakers.",
        });
        return false;
      }
      if (!api.updateRosterEntry) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "Co-speaker management is not available yet.",
        });
        return false;
      }
      const targetContext = context;
      const rosterSubmissionId = acceptedSubmissionId(input.submissionId, context, view);
      if (rosterSubmissionId === null) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "This roster does not belong to an active accepted session.",
        });
        return false;
      }
      const generation = loadGeneration.current;
      asyncDispatch({ type: "roster-busy-set", busy: true });
      asyncDispatch({ type: "mutation-error-set", error: null });
      try {
        const roster = await api.updateRosterEntry({
          eventId: targetContext.eventId,
          ...input,
          submissionId: rosterSubmissionId,
        });
        if (
          roster.eventId !== targetContext.eventId ||
          !portalSubmissionIdsMatch(roster.submissionId, rosterSubmissionId) ||
          !submissionIdAuthorized(targetContext, roster.submissionId)
        ) {
          throw new PortalApiError(
            "CONTEXT_MISMATCH",
            "The roster response belongs to a different event or session.",
            409,
          );
        }
        if (!isPortalGenerationCurrent(generation, loadGeneration.current)) {
          return false;
        }
        workspaceDispatch({
          type: "roster-set",
          submissionId: rosterSubmissionId,
          roster,
        });
        return true;
      } catch (updateError) {
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          asyncDispatch({ type: "mutation-error-set", error: messageFrom(updateError) });
        }
        return false;
      } finally {
        asyncDispatch({ type: "roster-busy-set", busy: false });
      }
    },
    [api, can, context, view],
  );

  const removeRosterEntry = useCallback(
    async (input: { submissionId: string; participantId: string }) => {
      if (!context) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "No authorized portal context is available.",
        });
        return false;
      }
      if (!can("roster-manage")) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "You do not have permission to manage co-speakers.",
        });
        return false;
      }
      if (!api.removeRosterEntry) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "Co-speaker management is not available yet.",
        });
        return false;
      }
      const targetContext = context;
      const rosterSubmissionId = acceptedSubmissionId(input.submissionId, context, view);
      if (rosterSubmissionId === null) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "This roster does not belong to an active accepted session.",
        });
        return false;
      }
      const generation = loadGeneration.current;
      asyncDispatch({ type: "roster-busy-set", busy: true });
      asyncDispatch({ type: "mutation-error-set", error: null });
      try {
        const roster = await api.removeRosterEntry({
          eventId: targetContext.eventId,
          ...input,
          submissionId: rosterSubmissionId,
        });
        if (
          roster.eventId !== targetContext.eventId ||
          !portalSubmissionIdsMatch(roster.submissionId, rosterSubmissionId) ||
          !submissionIdAuthorized(targetContext, roster.submissionId)
        ) {
          throw new PortalApiError(
            "CONTEXT_MISMATCH",
            "The roster response belongs to a different event or session.",
            409,
          );
        }
        if (!isPortalGenerationCurrent(generation, loadGeneration.current)) {
          return false;
        }
        workspaceDispatch({
          type: "roster-set",
          submissionId: rosterSubmissionId,
          roster,
        });
        return true;
      } catch (removeError) {
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          asyncDispatch({ type: "mutation-error-set", error: messageFrom(removeError) });
        }
        return false;
      } finally {
        asyncDispatch({ type: "roster-busy-set", busy: false });
      }
    },
    [api, can, context, view],
  );

  const uploadWorkspaceFile = useCallback(
    async (input: {
      participantId: string;
      submissionId?: string;
      taskId?: string;
      kind: "headshot" | "slides" | "supporting_file";
      file: File;
      supersedesAssetId?: string;
    }) => {
      if (!context) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "No authorized portal context is available.",
        });
        return false;
      }
      if (!can("asset-write")) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "You do not have permission to upload files.",
        });
        return false;
      }
      if (!api.uploadFile || !api.finalizeAsset) {
        asyncDispatch({ type: "mutation-error-set", error: "File uploads are not available yet." });
        return false;
      }
      const targetContext = context;
      const uploadSubmissionId =
        input.submissionId === undefined
          ? null
          : acceptedSubmissionId(input.submissionId, context, view);
      const inputTask =
        input.taskId === undefined
          ? undefined
          : view?.tasks.find((task) => task.id === input.taskId);
      const supersededAsset =
        input.supersedesAssetId === undefined
          ? undefined
          : (workspace.assets.find((asset) => asset.id === input.supersedesAssetId) ??
            view?.assets?.find((asset) => asset.id === input.supersedesAssetId));
      if (
        input.participantId !== context.primaryParticipantId ||
        uploadSubmissionId === null ||
        (input.taskId !== undefined &&
          (inputTask === undefined || !taskBelongsToPortalContext(inputTask, context))) ||
        (inputTask !== undefined &&
          (inputTask.submissionId === null ||
            !portalSubmissionIdsMatch(uploadSubmissionId, inputTask.submissionId))) ||
        (input.supersedesAssetId !== undefined &&
          (supersededAsset === undefined ||
            !assetBelongsToPortalContext(supersededAsset, context, view?.tasks ?? []) ||
            supersededAsset.submissionId === undefined ||
            !portalSubmissionIdsMatch(uploadSubmissionId, supersededAsset.submissionId) ||
            supersededAsset.kind !== input.kind))
      ) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "This file does not belong to the active speaker.",
        });
        return false;
      }
      const generation = loadGeneration.current;
      const busyKey = input.supersedesAssetId ?? `${input.kind}:${input.file.name}`;
      asyncDispatch({ type: "asset-busy-set", assetId: busyKey, busy: true });
      asyncDispatch({ type: "mutation-error-set", error: null });
      try {
        const pendingAsset = await api.uploadFile({
          eventId: targetContext.eventId,
          ...input,
          submissionId: uploadSubmissionId,
        });
        if (
          pendingAsset.state !== "pending_upload" ||
          !assetBelongsToPortalContext(pendingAsset, targetContext, view?.tasks ?? []) ||
          pendingAsset.participantId !== input.participantId ||
          pendingAsset.submissionId === undefined ||
          !portalSubmissionIdsMatch(pendingAsset.submissionId, uploadSubmissionId) ||
          (input.taskId !== undefined && pendingAsset.taskId !== input.taskId) ||
          pendingAsset.supersedesAssetId !== input.supersedesAssetId
        ) {
          throw new PortalApiError(
            "CONTEXT_MISMATCH",
            "The file response belongs to a different speaker or session.",
            409,
          );
        }
        const asset = await api.finalizeAsset({
          eventId: targetContext.eventId,
          assetId: pendingAsset.id,
          state: "ready",
        });
        if (
          asset.id !== pendingAsset.id ||
          asset.state !== "ready" ||
          !assetBelongsToPortalContext(asset, targetContext, view?.tasks ?? [])
        ) {
          throw new PortalApiError(
            "CONTEXT_MISMATCH",
            "The finalized file belongs to a different speaker or session.",
            409,
          );
        }
        if (!isPortalGenerationCurrent(generation, loadGeneration.current)) {
          return false;
        }
        workspaceDispatch({ type: "asset-added", asset });
        return true;
      } catch (uploadError) {
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          asyncDispatch({ type: "mutation-error-set", error: messageFrom(uploadError) });
        }
        return false;
      } finally {
        asyncDispatch({ type: "asset-busy-set", assetId: busyKey, busy: false });
      }
    },
    [api, can, context, view, workspace.assets],
  );

  const retryAssetUpload = useCallback(
    async (input: { assetId: string; file: File }) => {
      if (!context) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "No authorized portal context is available.",
        });
        return false;
      }
      if (!can("asset-write") || !api.retryAssetUpload || !api.finalizeAsset) {
        asyncDispatch({ type: "mutation-error-set", error: "Upload retry is not available yet." });
        return false;
      }
      const knownAsset =
        workspace.assets.find((candidate) => candidate.id === input.assetId) ??
        view?.assets?.find((candidate) => candidate.id === input.assetId);
      if (
        knownAsset === undefined ||
        knownAsset.state !== "pending_upload" ||
        !assetBelongsToPortalContext(knownAsset, context, view?.tasks ?? [])
      ) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "This upload is no longer pending or does not belong to the active speaker.",
        });
        return false;
      }
      const targetContext = context;
      const generation = loadGeneration.current;
      asyncDispatch({ type: "asset-busy-set", assetId: input.assetId, busy: true });
      asyncDispatch({ type: "mutation-error-set", error: null });
      try {
        const pendingAsset = await api.retryAssetUpload({
          eventId: targetContext.eventId,
          assetId: input.assetId,
          file: input.file,
        });
        if (
          pendingAsset.id !== knownAsset.id ||
          pendingAsset.state !== "pending_upload" ||
          pendingAsset.fileName !== knownAsset.fileName ||
          pendingAsset.contentType !== knownAsset.contentType ||
          pendingAsset.sizeBytes !== knownAsset.sizeBytes ||
          !assetBelongsToPortalContext(pendingAsset, targetContext, view?.tasks ?? [])
        ) {
          throw new PortalApiError(
            "CONTEXT_MISMATCH",
            "The retried upload does not match the pending file.",
            409,
          );
        }
        const asset = await api.finalizeAsset({
          eventId: targetContext.eventId,
          assetId: pendingAsset.id,
          state: "ready",
        });
        if (
          asset.id !== knownAsset.id ||
          asset.state !== "ready" ||
          !assetBelongsToPortalContext(asset, targetContext, view?.tasks ?? [])
        ) {
          throw new PortalApiError(
            "CONTEXT_MISMATCH",
            "The retried upload finalized in a different speaker context.",
            409,
          );
        }
        if (!isPortalGenerationCurrent(generation, loadGeneration.current)) return false;
        workspaceDispatch({ type: "asset-replaced", asset });
        return true;
      } catch (retryError) {
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          asyncDispatch({ type: "mutation-error-set", error: messageFrom(retryError) });
        }
        return false;
      } finally {
        asyncDispatch({ type: "asset-busy-set", assetId: input.assetId, busy: false });
      }
    },
    [api, can, context, view, workspace.assets],
  );

  const completeAssetUpload = useCallback(
    async (input: { assetId: string }) => {
      if (!context) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "No authorized portal context is available.",
        });
        return false;
      }
      if (!can("asset-write") || !api.finalizeAsset) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "You do not have permission to complete this upload.",
        });
        return false;
      }
      const targetContext = context;
      const knownAsset =
        workspace.assets.find((candidate) => candidate.id === input.assetId) ??
        view?.assets?.find((candidate) => candidate.id === input.assetId);
      if (
        knownAsset === undefined ||
        knownAsset.state !== "pending_upload" ||
        !assetBelongsToPortalContext(knownAsset, context, view?.tasks ?? [])
      ) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "This upload is no longer pending or does not belong to the active speaker.",
        });
        return false;
      }
      const generation = loadGeneration.current;
      asyncDispatch({ type: "asset-busy-set", assetId: input.assetId, busy: true });
      asyncDispatch({ type: "mutation-error-set", error: null });
      try {
        const asset = await api.finalizeAsset({
          eventId: targetContext.eventId,
          assetId: input.assetId,
          state: "ready",
        });
        if (
          asset.id !== input.assetId ||
          asset.state !== "ready" ||
          !assetBelongsToPortalContext(asset, targetContext, view?.tasks ?? [])
        ) {
          throw new PortalApiError(
            "CONTEXT_MISMATCH",
            "The completed upload belongs to a different speaker or session.",
            409,
          );
        }
        if (!isPortalGenerationCurrent(generation, loadGeneration.current)) {
          return false;
        }
        workspaceDispatch({ type: "asset-replaced", asset });
        return true;
      } catch (completeError) {
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          asyncDispatch({ type: "mutation-error-set", error: messageFrom(completeError) });
        }
        return false;
      } finally {
        asyncDispatch({ type: "asset-busy-set", assetId: input.assetId, busy: false });
      }
    },
    [api, can, context, view, workspace.assets],
  );

  const loadAssetHistory = useCallback(
    async (assetId: string) => {
      if (!api?.getAssetHistory || !context || !can("asset-read")) {
        return [];
      }
      const targetContext = context;
      if (!assetIdAuthorized(assetId, context, view, workspace.assets)) {
        return [];
      }
      const generation = loadGeneration.current;
      try {
        const history = await api.getAssetHistory(targetContext.eventId, assetId);
        if (
          history.some(
            (entry) => !assetBelongsToPortalContext(entry, targetContext, view?.tasks ?? []),
          )
        ) {
          throw new PortalApiError(
            "CONTEXT_MISMATCH",
            "The file history belongs to a different speaker or session.",
            409,
          );
        }
        if (!isPortalGenerationCurrent(generation, loadGeneration.current)) {
          return [];
        }
        workspaceDispatch({ type: "asset-history-set", assetId, history });
        return history;
      } catch (historyError) {
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          workspaceDispatch({ type: "error-set", error: messageFrom(historyError) });
        }
        return [];
      }
    },
    [api, can, context, view, workspace.assets],
  );

  const loadAssetComments = useCallback(
    async (assetId: string) => {
      if (!api?.listAssetComments || !context || !can("asset-read")) {
        return [];
      }
      const targetContext = context;
      if (!assetIdAuthorized(assetId, context, view, workspace.assets)) {
        return [];
      }
      const generation = loadGeneration.current;
      try {
        const comments = await api.listAssetComments(targetContext.eventId, assetId);
        if (comments.some((comment) => comment.assetId !== assetId)) {
          throw new PortalApiError(
            "CONTEXT_MISMATCH",
            "The file comments belong to a different file.",
            409,
          );
        }
        if (!isPortalGenerationCurrent(generation, loadGeneration.current)) {
          return [];
        }
        workspaceDispatch({ type: "asset-comments-set", assetId, comments });
        return comments;
      } catch (commentsError) {
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          workspaceDispatch({ type: "error-set", error: messageFrom(commentsError) });
        }
        return [];
      }
    },
    [api, can, context, view, workspace.assets],
  );

  const addAssetComment = useCallback(
    async (input: { assetId: string; body: string; expectedVersion?: number }) => {
      if (!api?.addAssetComment || !context) {
        asyncDispatch({ type: "mutation-error-set", error: "Comments are not available yet." });
        return false;
      }
      if (!can("asset-comment")) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "You do not have permission to comment on files.",
        });
        return false;
      }
      const targetContext = context;
      if (!assetIdAuthorized(input.assetId, context, view, workspace.assets)) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "This file does not belong to the active speaker.",
        });
        return false;
      }
      const generation = loadGeneration.current;
      asyncDispatch({ type: "mutation-error-set", error: null });
      try {
        const comment = await api.addAssetComment({ eventId: targetContext.eventId, ...input });
        if (comment.assetId !== input.assetId) {
          throw new PortalApiError(
            "CONTEXT_MISMATCH",
            "The file comment belongs to a different file.",
            409,
          );
        }
        if (!isPortalGenerationCurrent(generation, loadGeneration.current)) {
          return false;
        }
        workspaceDispatch({ type: "asset-comment-added", comment });
        return true;
      } catch (commentError) {
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          asyncDispatch({ type: "mutation-error-set", error: messageFrom(commentError) });
        }
        return false;
      }
    },
    [api, can, context, view, workspace.assets],
  );

  const downloadAsset = useCallback(
    async (assetId: string): Promise<PortalDownloadGrant | null> => {
      if (!api?.getDownloadGrant || !context) {
        asyncDispatch({ type: "mutation-error-set", error: "Downloads are not available yet." });
        return null;
      }
      if (!can("asset-read")) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "You do not have permission to download this file.",
        });
        return null;
      }
      const targetContext = context;
      if (!assetIdAuthorized(assetId, context, view, workspace.assets)) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "This file does not belong to the active speaker.",
        });
        return null;
      }
      const generation = loadGeneration.current;
      try {
        const grant = await api.getDownloadGrant(targetContext.eventId, assetId);
        return isPortalGenerationCurrent(generation, loadGeneration.current) ? grant : null;
      } catch (downloadError) {
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          asyncDispatch({
            type: "mutation-error-set",
            error:
              downloadError instanceof PortalApiError && downloadError.status === 410
                ? "This secure download link has expired. Request a new download."
                : messageFrom(downloadError),
          });
        }
        return null;
      }
    },
    [api, can, context, view, workspace.assets],
  );

  const loadTaskForm = useCallback(
    async (taskId: string): Promise<PortalTaskForm | null> => {
      if (!api?.getTaskForm || !context || !can("task-response")) {
        return null;
      }
      const targetContext = context;
      if (!taskIdAuthorized(taskId, context, view)) {
        return null;
      }
      const generation = loadGeneration.current;
      try {
        const form = await api.getTaskForm({ eventId: targetContext.eventId, taskId });
        if (form.taskId !== taskId) {
          throw new PortalApiError(
            "CONTEXT_MISMATCH",
            "The task form belongs to a different task.",
            409,
          );
        }
        if (!isPortalGenerationCurrent(generation, loadGeneration.current)) {
          return null;
        }
        workspaceDispatch({ type: "task-form-set", taskId, form });
        return form;
      } catch (formError) {
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          workspaceDispatch({ type: "error-set", error: messageFrom(formError) });
        }
        return null;
      }
    },
    [api, can, context, view],
  );

  const loadTaskResponse = useCallback(
    async (taskId: string): Promise<PortalTaskResponseEnvelope | null> => {
      if (!api?.getTaskResponse || !context || !can("task-response")) {
        return null;
      }
      const targetContext = context;
      if (!taskIdAuthorized(taskId, context, view)) {
        return null;
      }
      const generation = loadGeneration.current;
      try {
        const response = await api.getTaskResponse({ eventId: targetContext.eventId, taskId });
        if (
          response.eventId !== targetContext.eventId ||
          response.taskId !== taskId ||
          response.participantId !== targetContext.primaryParticipantId
        ) {
          throw new PortalApiError(
            "CONTEXT_MISMATCH",
            "The task response belongs to a different event or task.",
            409,
          );
        }
        if (!isPortalGenerationCurrent(generation, loadGeneration.current)) {
          return null;
        }
        workspaceDispatch({ type: "task-response-set", taskId, response });
        return response;
      } catch (responseError) {
        if (responseError instanceof PortalApiError && responseError.status === 404) {
          return null;
        }
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          workspaceDispatch({ type: "error-set", error: messageFrom(responseError) });
        }
        return null;
      }
    },
    [api, can, context, view],
  );

  const saveTaskResponse = useCallback(
    async (input: {
      taskId: string;
      definitionVersion: number;
      answers: Readonly<Record<string, PortalFormAnswer>>;
      expectedVersion: number;
    }) => {
      if (!api?.saveTaskResponse || !context) {
        asyncDispatch({ type: "mutation-error-set", error: "Task forms are not available yet." });
        return false;
      }
      if (!can("task-response")) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "You do not have permission to submit this form.",
        });
        return false;
      }
      const targetContext = context;
      if (!taskIdAuthorized(input.taskId, context, view)) {
        asyncDispatch({
          type: "mutation-error-set",
          error: "This task does not belong to the active speaker.",
        });
        return false;
      }
      const generation = loadGeneration.current;
      asyncDispatch({ type: "task-busy-set", taskId: input.taskId, busy: true });
      asyncDispatch({ type: "mutation-error-set", error: null });
      try {
        const response = await api.saveTaskResponse({ eventId: targetContext.eventId, ...input });
        if (
          response.eventId !== targetContext.eventId ||
          response.taskId !== input.taskId ||
          response.participantId !== targetContext.primaryParticipantId
        ) {
          throw new PortalApiError(
            "CONTEXT_MISMATCH",
            "The task response belongs to a different event or task.",
            409,
          );
        }
        if (!isPortalGenerationCurrent(generation, loadGeneration.current)) {
          return false;
        }
        workspaceDispatch({ type: "task-response-set", taskId: input.taskId, response });
        return true;
      } catch (responseError) {
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          asyncDispatch({ type: "mutation-error-set", error: messageFrom(responseError) });
        }
        return false;
      } finally {
        asyncDispatch({ type: "task-busy-set", taskId: input.taskId, busy: false });
      }
    },
    [api, can, context, view],
  );

  const value = useMemo<PortalContextValue>(
    () => ({
      eventId,
      eventQuery,
      contexts,
      context,
      authorizedParticipantIds,
      selectedParticipantId,
      capabilities,
      can,
      switchContext,
      view,
      workspace,
      workspaceLoading,
      workspaceError,
      loading,
      error,
      mutationError,
      busyTaskIds,
      busyAssetIds,
      busyRoster,
      savingProfile,
      profileMutationState,
      profileRevision,
      switchParticipant,
      reload,
      loadWorkspace,
      saveProfile,
      transitionTask,
      uploadTask,
      addRosterEntry,
      updateRosterEntry,
      removeRosterEntry,
      uploadWorkspaceFile,
      retryAssetUpload,
      completeAssetUpload,
      loadAssetHistory,
      loadAssetComments,
      addAssetComment,
      downloadAsset,
      loadTaskForm,
      loadTaskResponse,
      saveTaskResponse,
      clearMutationError: () => asyncDispatch({ type: "mutation-error-set", error: null }),
      clearWorkspaceError: () => workspaceDispatch({ type: "error-set", error: null }),
    }),
    [
      addAssetComment,
      addRosterEntry,
      busyAssetIds,
      busyRoster,
      busyTaskIds,
      can,
      capabilities,
      context,
      contexts,
      authorizedParticipantIds,
      selectedParticipantId,
      error,
      eventId,
      eventQuery,
      downloadAsset,
      completeAssetUpload,
      loadAssetComments,
      loadAssetHistory,
      loadTaskForm,
      loadTaskResponse,
      loadWorkspace,
      loading,
      mutationError,
      reload,
      retryAssetUpload,
      removeRosterEntry,
      saveProfile,
      profileMutationState,
      profileRevision,
      savingProfile,
      saveTaskResponse,
      switchContext,
      switchParticipant,
      transitionTask,
      updateRosterEntry,
      uploadTask,
      uploadWorkspaceFile,
      view,
      workspace,
      workspaceError,
      workspaceLoading,
    ],
  );

  return value;
}

export function PortalProvider({ children, api, apiBaseUrl }: Readonly<PortalProviderProps>) {
  const value = usePortalProviderValue({ api, apiBaseUrl });
  return (
    <PortalProviderBoundary
      render={(runtimeChildren) => (
        <PortalContextValueProvider.Provider value={value}>
          {runtimeChildren}
        </PortalContextValueProvider.Provider>
      )}
    >
      {children}
    </PortalProviderBoundary>
  );
}

export function usePortal(): PortalContextValue {
  const context = useContext(PortalContextValueProvider);
  if (!context) {
    throw new Error("usePortal must be used inside PortalProvider.");
  }
  return context;
}
