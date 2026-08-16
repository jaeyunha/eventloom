"use client";
import { useSearchParams } from "next/navigation";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
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
  portalContextResponseForTarget,
  portalViewAfterLoadFailure,
  portalViewMatchesSelection,
  profileAssetBelongsToPortalContext,
  type PortalPrefetchResult,
  submissionIdAuthorized,
  taskBelongsToPortalContext,
  taskIdAuthorized,
  taskMutationMatches,
  withUpdatedAsset,
  withUpdatedTask,
} from "./portal-provider-model";
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

export function PortalProvider({
  children,
  api: providedApi,
  apiBaseUrl: providedApiBaseUrl,
}: Readonly<PortalProviderProps>) {
  const searchParams = useSearchParams();
  const requestedEventId =
    searchParams?.get("eventId")?.trim() || searchParams?.get("event")?.trim() || undefined;
  const configuredEventId = requestedEventId;
  const apiBaseUrl = providedApiBaseUrl?.trim() ?? "";
  const api = useMemo<PortalApi>(
    () => createPortalProviderApi(providedApi, apiBaseUrl),
    [apiBaseUrl, providedApi],
  );
  const [contexts, setContexts] = useState<PortalContext[]>([]);
  const [context, setContext] = useState<PortalContext | null>(null);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [authoritativeView, setAuthoritativeView] = useState<PortalView | null>(null);
  const authoritativeViewRef = useRef<PortalView | null>(null);
  const [capabilities, setCapabilities] = useState<PortalCapability[]>([]);
  const [view, setView] = useState<PortalView | null>(null);
  const [workspace, setWorkspace] = useState<PortalWorkspaceState>(emptyWorkspace);
  const [loading, setLoading] = useState(true);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [busyTaskIds, setBusyTaskIds] = useState<ReadonlySet<string>>(new Set());
  const [busyAssetIds, setBusyAssetIds] = useState<ReadonlySet<string>>(new Set());
  const [busyRoster, setBusyRoster] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMutationState, setProfileMutationState] =
    useState<PortalProfileMutationPhase>("idle");
  const [profileRevision, setProfileRevision] = useState<number | null>(null);
  const loadGeneration = useRef(0);

  const eventId = context?.eventId ?? "";
  const eventQuery = eventId ? `?event=${encodeURIComponent(eventId)}` : "";
  const authorizedParticipantIds =
    contexts.find((candidate) => candidate.id === context?.id)?.participantIds ?? [];
  const can = useCallback(
    (capability: PortalCapability) => capabilities.includes(capability),
    [capabilities],
  );

  const clearWorkspace = useCallback(() => {
    setWorkspace(emptyWorkspace);
    setWorkspaceError(null);
    setWorkspaceLoading(false);
  }, []);

  const loadWorkspaceFor = useCallback(
    async (target: PortalContext, nextView: PortalView, signal?: AbortSignal): Promise<void> => {
      const generation = ++loadGeneration.current;
      setWorkspaceLoading(true);
      setWorkspaceError(null);
      setWorkspace(emptyWorkspace);

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
          : listResources !== undefined && hasPortalCapability(target.capabilities, "resource-read")
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
        if (signal?.aborted && generation === loadGeneration.current) {
          setWorkspaceLoading(false);
        }
        return;
      }
      setWorkspace(nextWorkspace);
      if (failures.length > 0) {
        setWorkspaceError(messageFrom(failures[0]));
      }
      setWorkspaceLoading(false);
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
        setContext(target);
        setSelectedParticipantId(portalSelectedParticipantId(target, requestedSelection));
        setCapabilities(normalizeCapabilities(target.capabilities));
        setView(null);
        clearWorkspace();
      }
      setMutationError(null);
      setLoading(true);
      setError(null);
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
        setAuthoritativeView(authoritative);
        setContext(scopedContext);
        setSelectedParticipantId(selected);
        setContexts((current) =>
          current.map((candidate) =>
            candidate.id === authorizedContext.id ? authorizedContext : candidate,
          ),
        );
        setCapabilities(nextCapabilities);
        setView(scopedView);
        setProfileRevision(
          scopedView.profiles.find(
            (profile) =>
              profile.eventId === scopedContext.eventId && profile.participantId === selected,
          )?.version ?? null,
        );
        setWorkspace({ ...emptyWorkspace, assets: [...(scopedView.assets ?? [])] });
        setWorkspaceLoading(false);
        setLoading(false);
        return true;
      } catch (loadError) {
        if (isAbort(loadError)) {
          return false;
        }
        if (generation === loadGeneration.current) {
          setView((current) => portalViewAfterLoadFailure(current, preserveCurrentView));
          setAuthoritativeView((current) =>
            portalViewAfterLoadFailure(current, preserveCurrentView),
          );
          authoritativeViewRef.current = portalViewAfterLoadFailure(
            authoritativeViewRef.current,
            preserveCurrentView,
          );
          setError(messageFrom(loadError));
          setLoading(false);
          setWorkspaceLoading(false);
        }
        return false;
      }
    },
    [api, clearWorkspace],
  );

  const loadInitial = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      const generation = loadGeneration.current;
      setLoading(true);
      setError(null);
      try {
        const startup = await loadPortalStartup(api, configuredEventId, signal);
        if (signal?.aborted || generation !== loadGeneration.current) {
          return;
        }
        setContexts(startup.authorizedContexts);
        if (startup.authorizedContexts.length === 0) {
          setContext(null);
          setSelectedParticipantId(null);
          setCapabilities([]);
          setView(null);
          setAuthoritativeView(null);
          authoritativeViewRef.current = null;
          setProfileRevision(null);
          setProfileMutationState("idle");
          clearWorkspace();
          setMutationError(null);
          setError(null);
          setLoading(false);
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
          setContext(null);
          setView(null);
          clearWorkspace();
          setError(messageFrom(loadError));
          setLoading(false);
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
      setView(null);
      setAuthoritativeView(null);
      authoritativeViewRef.current = null;
      setSelectedParticipantId(null);
      setProfileRevision(null);
      setProfileMutationState("idle");
      setSavingProfile(false);
      clearWorkspace();
      setMutationError(null);
      setError(null);
      setLoading(true);
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
      const scopedContext = scopePortalContextToAuthorizedParticipants(target, selected);
      const scopedView = scopePortalViewToAuthorizedParticipants(source, target, selected);
      setContext(scopedContext);
      setSelectedParticipantId(selected);
      setView(scopedView);
      setProfileRevision(
        scopedView.profiles.find(
          (profile) =>
            profile.eventId === scopedContext.eventId && profile.participantId === selected,
        )?.version ?? null,
      );
      setProfileMutationState("idle");
      setSavingProfile(false);
      setMutationError(null);
      setWorkspace({ ...emptyWorkspace, assets: [...(scopedView.assets ?? [])] });
      void loadWorkspaceFor(scopedContext, scopedView);
      return true;
    },
    [authoritativeView, context, contexts, loadWorkspaceFor],
  );
  const loadWorkspace = useCallback(async () => {
    if (context && view) {
      await loadWorkspaceFor(context, view);
      return;
    }
    setWorkspaceLoading(false);
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
        setMutationError("No authorized portal context is available.");
        setProfileMutationState("failure");
        return false;
      }
      if (!can("profile-self")) {
        setMutationError("You do not have permission to edit this profile.");
        setProfileMutationState("failure");
        return false;
      }
      const activeParticipantId = selectedParticipantId ?? context.primaryParticipantId;
      if (
        !activeParticipantId ||
        input.profile.eventId !== context.eventId ||
        input.profile.participantId !== activeParticipantId
      ) {
        setMutationError("This profile does not belong to the active speaker.");
        setProfileMutationState("failure");
        return false;
      }
      if (!api.updateProfile) {
        setMutationError("The speaker profile API is not available yet.");
        setProfileMutationState("failure");
        return false;
      }
      if (input.headshot && (!can("asset-write") || !api.uploadFile || !api.finalizeAsset)) {
        setMutationError("Private headshot uploads are not available for this event.");
        setProfileMutationState("failure");
        return false;
      }

      const targetContext = context;
      const generation = loadGeneration.current;
      setSavingProfile(true);
      setProfileMutationState("saving");
      setMutationError(null);
      try {
        let finalizedHeadshot: PortalAsset | undefined;
        if (input.headshot && api.uploadFile && api.finalizeAsset) {
          setProfileMutationState("pending");
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

        setProfileMutationState("saving");
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
        const updateView = (current: PortalView | null): PortalView | null => {
          if (!current) return current;
          const updatedView = {
            ...current,
            profiles: current.profiles.map((candidate) =>
              candidate.participantId === updated.participantId &&
              candidate.eventId === updated.eventId
                ? updated
                : candidate,
            ),
          };
          return finalizedHeadshot === undefined
            ? updatedView
            : withUpdatedAsset(updatedView, finalizedHeadshot);
        };
        setView(updateView);
        const authoritative = authoritativeViewRef.current;
        if (authoritative) {
          const nextAuthoritative = updateView(authoritative);
          authoritativeViewRef.current = nextAuthoritative;
          setAuthoritativeView(nextAuthoritative);
        }
        setProfileRevision(updated.version);
        setProfileMutationState("saved");
        if (finalizedHeadshot !== undefined) {
          setWorkspace((current) => ({
            ...current,
            assets: [
              ...current.assets.filter((candidate) => candidate.id !== finalizedHeadshot.id),
              finalizedHeadshot,
            ],
          }));
        }
        return true;
      } catch (saveError) {
        const conflict =
          saveError instanceof PortalApiError && saveError.code === "VERSION_CONFLICT";
        if (conflict && isPortalGenerationCurrent(generation, loadGeneration.current)) {
          setSavingProfile(false);
          setProfileMutationState("conflict");
          setMutationError(messageFrom(saveError));
          const refreshTarget =
            contexts.find((candidate) => candidate.id === targetContext.id) ?? targetContext;
          await hydrate(refreshTarget, undefined, undefined, activeParticipantId);
          if (isPortalGenerationCurrent(generation + 1, loadGeneration.current)) {
            setProfileMutationState("conflict");
            setMutationError(messageFrom(saveError));
          }
          return false;
        }
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          setProfileMutationState("failure");
          setMutationError(messageFrom(saveError));
        }
        return false;
      } finally {
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          setSavingProfile(false);
        }
      }
    },
    [api, can, context, contexts, hydrate, selectedParticipantId],
  );

  const transitionTask = useCallback(
    async (task: PortalTask, toStatus: PortalTaskStatus, note?: string) => {
      if (!context) {
        setMutationError("No authorized portal context is available.");
        return false;
      }
      if (!can("task-response")) {
        setMutationError("You do not have permission to respond to this task.");
        return false;
      }
      const targetContext = context;
      if (
        !taskBelongsToPortalContext(task, context) ||
        !view?.tasks.some(
          (candidate) => candidate.id === task.id && taskBelongsToPortalContext(candidate, context),
        )
      ) {
        setMutationError("This task does not belong to the active speaker.");
        return false;
      }
      const generation = loadGeneration.current;
      setBusyTaskIds((current) => new Set(current).add(task.id));
      setMutationError(null);
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
        setView((current) =>
          isPortalGenerationCurrent(generation, loadGeneration.current)
            ? current
              ? withUpdatedTask(current, updated)
              : current
            : current,
        );
        return true;
      } catch (transitionError) {
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          setMutationError(messageFrom(transitionError));
        }
        return false;
      } finally {
        setBusyTaskIds((current) => {
          const next = new Set(current);
          next.delete(task.id);
          return next;
        });
      }
    },
    [api, can, context, view],
  );

  const uploadTask = useCallback(
    async (task: PortalTask, file: File) => {
      if (!context) {
        setMutationError("No authorized portal context is available.");
        return false;
      }
      if (!can("task-response") || !can("asset-write")) {
        setMutationError("You do not have permission to upload this task file.");
        return false;
      }
      if (!api.finalizeAsset) {
        setMutationError("Upload completion is not available yet.");
        return false;
      }
      if (
        !taskBelongsToPortalContext(task, context) ||
        !view?.tasks.some(
          (candidate) => candidate.id === task.id && taskBelongsToPortalContext(candidate, context),
        )
      ) {
        setMutationError("This task does not belong to the active speaker.");
        return false;
      }
      const kind = task.acceptedAssetKinds?.[0];
      if (!kind) {
        setMutationError("This upload task does not specify an accepted file kind.");
        return false;
      }
      const targetContext = context;
      const generation = loadGeneration.current;
      setBusyTaskIds((current) => new Set(current).add(task.id));
      setMutationError(null);
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
        setView((current) =>
          current ? withUpdatedAsset(withUpdatedTask(current, updated), finalized) : current,
        );
        setWorkspace((current) => ({
          ...current,
          assets: [
            ...current.assets.filter((candidate) => candidate.id !== finalized.id),
            finalized,
          ],
        }));
        return true;
      } catch (uploadError) {
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          setMutationError(messageFrom(uploadError));
        }
        return false;
      } finally {
        setBusyTaskIds((current) => {
          const next = new Set(current);
          next.delete(task.id);
          return next;
        });
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
        setMutationError("No authorized portal context is available.");
        return false;
      }
      if (!can("roster-manage")) {
        setMutationError("You do not have permission to manage co-speakers.");
        return false;
      }
      if (!api.addRosterEntry) {
        setMutationError("Co-speaker management is not available yet.");
        return false;
      }
      const targetContext = context;
      const rosterSubmissionId = acceptedSubmissionId(input.submissionId, context, view);
      if (rosterSubmissionId === null) {
        setMutationError("This roster does not belong to an active accepted session.");
        return false;
      }
      const generation = loadGeneration.current;
      setBusyRoster(true);
      setMutationError(null);
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
        setWorkspace((current) => ({
          ...current,
          rosters: { ...current.rosters, [rosterSubmissionId]: roster },
        }));
        return true;
      } catch (addError) {
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          setMutationError(messageFrom(addError));
        }
        return false;
      } finally {
        setBusyRoster(false);
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
        setMutationError("No authorized portal context is available.");
        return false;
      }
      if (!can("roster-manage")) {
        setMutationError("You do not have permission to manage co-speakers.");
        return false;
      }
      if (!api.updateRosterEntry) {
        setMutationError("Co-speaker management is not available yet.");
        return false;
      }
      const targetContext = context;
      const rosterSubmissionId = acceptedSubmissionId(input.submissionId, context, view);
      if (rosterSubmissionId === null) {
        setMutationError("This roster does not belong to an active accepted session.");
        return false;
      }
      const generation = loadGeneration.current;
      setBusyRoster(true);
      setMutationError(null);
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
        setWorkspace((current) => ({
          ...current,
          rosters: { ...current.rosters, [rosterSubmissionId]: roster },
        }));
        return true;
      } catch (updateError) {
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          setMutationError(messageFrom(updateError));
        }
        return false;
      } finally {
        setBusyRoster(false);
      }
    },
    [api, can, context, view],
  );

  const removeRosterEntry = useCallback(
    async (input: { submissionId: string; participantId: string }) => {
      if (!context) {
        setMutationError("No authorized portal context is available.");
        return false;
      }
      if (!can("roster-manage")) {
        setMutationError("You do not have permission to manage co-speakers.");
        return false;
      }
      if (!api.removeRosterEntry) {
        setMutationError("Co-speaker management is not available yet.");
        return false;
      }
      const targetContext = context;
      const rosterSubmissionId = acceptedSubmissionId(input.submissionId, context, view);
      if (rosterSubmissionId === null) {
        setMutationError("This roster does not belong to an active accepted session.");
        return false;
      }
      const generation = loadGeneration.current;
      setBusyRoster(true);
      setMutationError(null);
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
        setWorkspace((current) => ({
          ...current,
          rosters: { ...current.rosters, [rosterSubmissionId]: roster },
        }));
        return true;
      } catch (removeError) {
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          setMutationError(messageFrom(removeError));
        }
        return false;
      } finally {
        setBusyRoster(false);
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
        setMutationError("No authorized portal context is available.");
        return false;
      }
      if (!can("asset-write")) {
        setMutationError("You do not have permission to upload files.");
        return false;
      }
      if (!api.uploadFile || !api.finalizeAsset) {
        setMutationError("File uploads are not available yet.");
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
        setMutationError("This file does not belong to the active speaker.");
        return false;
      }
      const generation = loadGeneration.current;
      const busyKey = input.supersedesAssetId ?? `${input.kind}:${input.file.name}`;
      setBusyAssetIds((current) => new Set(current).add(busyKey));
      setMutationError(null);
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
        setWorkspace((current) => ({ ...current, assets: [asset, ...current.assets] }));
        return true;
      } catch (uploadError) {
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          setMutationError(messageFrom(uploadError));
        }
        return false;
      } finally {
        setBusyAssetIds((current) => {
          const next = new Set(current);
          next.delete(busyKey);
          return next;
        });
      }
    },
    [api, can, context, view, workspace.assets],
  );

  const retryAssetUpload = useCallback(
    async (input: { assetId: string; file: File }) => {
      if (!context) {
        setMutationError("No authorized portal context is available.");
        return false;
      }
      if (!can("asset-write") || !api.retryAssetUpload || !api.finalizeAsset) {
        setMutationError("Upload retry is not available yet.");
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
        setMutationError(
          "This upload is no longer pending or does not belong to the active speaker.",
        );
        return false;
      }
      const targetContext = context;
      const generation = loadGeneration.current;
      setBusyAssetIds((current) => new Set(current).add(input.assetId));
      setMutationError(null);
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
        setWorkspace((current) => ({
          ...current,
          assets: current.assets.map((candidate) =>
            candidate.id === asset.id ? asset : candidate,
          ),
        }));
        return true;
      } catch (retryError) {
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          setMutationError(messageFrom(retryError));
        }
        return false;
      } finally {
        setBusyAssetIds((current) => {
          const next = new Set(current);
          next.delete(input.assetId);
          return next;
        });
      }
    },
    [api, can, context, view, workspace.assets],
  );

  const completeAssetUpload = useCallback(
    async (input: { assetId: string }) => {
      if (!context) {
        setMutationError("No authorized portal context is available.");
        return false;
      }
      if (!can("asset-write") || !api.finalizeAsset) {
        setMutationError("You do not have permission to complete this upload.");
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
        setMutationError(
          "This upload is no longer pending or does not belong to the active speaker.",
        );
        return false;
      }
      const generation = loadGeneration.current;
      setBusyAssetIds((current) => new Set(current).add(input.assetId));
      setMutationError(null);
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
        setWorkspace((current) => ({
          ...current,
          assets: current.assets.map((candidate) =>
            candidate.id === asset.id ? asset : candidate,
          ),
        }));
        return true;
      } catch (completeError) {
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          setMutationError(messageFrom(completeError));
        }
        return false;
      } finally {
        setBusyAssetIds((current) => {
          const next = new Set(current);
          next.delete(input.assetId);
          return next;
        });
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
        setWorkspace((current) => ({
          ...current,
          assetHistories: { ...current.assetHistories, [assetId]: history },
        }));
        return history;
      } catch (historyError) {
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          setWorkspaceError(messageFrom(historyError));
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
        setWorkspace((current) => ({
          ...current,
          assetComments: { ...current.assetComments, [assetId]: comments },
        }));
        return comments;
      } catch (commentsError) {
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          setWorkspaceError(messageFrom(commentsError));
        }
        return [];
      }
    },
    [api, can, context, view, workspace.assets],
  );

  const addAssetComment = useCallback(
    async (input: { assetId: string; body: string; expectedVersion?: number }) => {
      if (!api?.addAssetComment || !context) {
        setMutationError("Comments are not available yet.");
        return false;
      }
      if (!can("asset-comment")) {
        setMutationError("You do not have permission to comment on files.");
        return false;
      }
      const targetContext = context;
      if (!assetIdAuthorized(input.assetId, context, view, workspace.assets)) {
        setMutationError("This file does not belong to the active speaker.");
        return false;
      }
      const generation = loadGeneration.current;
      setMutationError(null);
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
        setWorkspace((current) => ({
          ...current,
          assetComments: {
            ...current.assetComments,
            [input.assetId]: [...(current.assetComments[input.assetId] ?? []), comment],
          },
        }));
        return true;
      } catch (commentError) {
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          setMutationError(messageFrom(commentError));
        }
        return false;
      }
    },
    [api, can, context, view, workspace.assets],
  );

  const downloadAsset = useCallback(
    async (assetId: string): Promise<PortalDownloadGrant | null> => {
      if (!api?.getDownloadGrant || !context) {
        setMutationError("Downloads are not available yet.");
        return null;
      }
      if (!can("asset-read")) {
        setMutationError("You do not have permission to download this file.");
        return null;
      }
      const targetContext = context;
      if (!assetIdAuthorized(assetId, context, view, workspace.assets)) {
        setMutationError("This file does not belong to the active speaker.");
        return null;
      }
      const generation = loadGeneration.current;
      try {
        const grant = await api.getDownloadGrant(targetContext.eventId, assetId);
        return isPortalGenerationCurrent(generation, loadGeneration.current) ? grant : null;
      } catch (downloadError) {
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          setMutationError(
            downloadError instanceof PortalApiError && downloadError.status === 410
              ? "This secure download link has expired. Request a new download."
              : messageFrom(downloadError),
          );
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
        setWorkspace((current) => ({
          ...current,
          taskForms: { ...current.taskForms, [taskId]: form },
        }));
        return form;
      } catch (formError) {
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          setWorkspaceError(messageFrom(formError));
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
        setWorkspace((current) => ({
          ...current,
          taskResponses: { ...current.taskResponses, [taskId]: response },
          taskResponseHistories: {
            ...current.taskResponseHistories,
            [taskId]: [...response.history],
          },
        }));
        return response;
      } catch (responseError) {
        if (responseError instanceof PortalApiError && responseError.status === 404) {
          return null;
        }
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          setWorkspaceError(messageFrom(responseError));
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
        setMutationError("Task forms are not available yet.");
        return false;
      }
      if (!can("task-response")) {
        setMutationError("You do not have permission to submit this form.");
        return false;
      }
      const targetContext = context;
      if (!taskIdAuthorized(input.taskId, context, view)) {
        setMutationError("This task does not belong to the active speaker.");
        return false;
      }
      const generation = loadGeneration.current;
      setBusyTaskIds((current) => new Set(current).add(input.taskId));
      setMutationError(null);
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
        setWorkspace((current) => ({
          ...current,
          taskResponses: { ...current.taskResponses, [input.taskId]: response },
          taskResponseHistories: {
            ...current.taskResponseHistories,
            [input.taskId]: [...response.history],
          },
        }));
        return true;
      } catch (responseError) {
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          setMutationError(messageFrom(responseError));
        }
        return false;
      } finally {
        setBusyTaskIds((current) => {
          const next = new Set(current);
          next.delete(input.taskId);
          return next;
        });
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
      clearMutationError: () => setMutationError(null),
      clearWorkspaceError: () => setWorkspaceError(null),
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

  return (
    <PortalContextValueProvider.Provider value={value}>
      {children}
    </PortalContextValueProvider.Provider>
  );
}

export function usePortal(): PortalContextValue {
  const context = useContext(PortalContextValueProvider);
  if (!context) {
    throw new Error("usePortal must be used inside PortalProvider.");
  }
  return context;
}
