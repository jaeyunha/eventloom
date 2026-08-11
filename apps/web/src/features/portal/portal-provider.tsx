"use client";

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
import { createPortalApi, type PortalApi, PortalApiError } from "./api";
import type {
  PortalAsset,
  PortalAssetComment,
  PortalAssetHistoryEntry,
  PortalCapability,
  PortalContext,
  PortalDownloadGrant,
  PortalFormAnswer,
  PortalProfile,
  PortalResource,
  PortalRosterEnvelope,
  PortalRosterMember,
  PortalTask,
  PortalTaskForm,
  PortalTaskResponse,
  PortalTaskResponseEnvelope,
  PortalTaskStatus,
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
  /** Kept for existing page links; context selection is never derived from this value. */
  eventQuery: string;
  contexts: readonly PortalContext[];
  context: PortalContext | null;
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
  reload(): Promise<void>;
  loadWorkspace(): Promise<void>;
  saveBiography(profile: PortalProfile, biography: string): Promise<boolean>;
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
  finalizeAsset(input: {
    assetId: string;
    state: Extract<PortalAsset["state"], "ready" | "rejected">;
    rejectionReason?: string;
  }): Promise<boolean>;
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

function messageFrom(error: unknown): string {
  if (error instanceof PortalApiError || error instanceof Error) {
    return error.message;
  }
  return "The speaker portal request could not be completed.";
}

function withUpdatedTask(view: PortalView, task: PortalTask): PortalView {
  const tasks = view.tasks.map((candidate) => (candidate.id === task.id ? task : candidate));
  return {
    ...view,
    tasks,
    outstandingTaskCount: tasks.filter(
      (candidate) => candidate.status !== "completed" && candidate.status !== "waived",
    ).length,
  };
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function isPortalGenerationCurrent(
  startedGeneration: number,
  activeGeneration: number,
): boolean {
  return startedGeneration === activeGeneration;
}

function normalizeCapabilities(value: readonly PortalCapability[] | undefined): PortalCapability[] {
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

function contextName(context: PortalContext): string {
  return context.name.trim() || "Event";
}

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
  const configuredEventId = process.env.NEXT_PUBLIC_PORTAL_EVENT_ID?.trim();
  const apiBaseUrl = (providedApiBaseUrl ?? process.env.NEXT_PUBLIC_API_URL)?.trim();
  const api = useMemo<PortalApi | null>(
    () => providedApi ?? (apiBaseUrl ? createPortalApi(apiBaseUrl) : null),
    [apiBaseUrl, providedApi],
  );
  const [contexts, setContexts] = useState<PortalContext[]>([]);
  const [context, setContext] = useState<PortalContext | null>(null);
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
  const loadGeneration = useRef(0);

  const eventId = context?.eventId ?? "";
  const eventQuery = "";
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
      if (!api) {
        setWorkspaceLoading(false);
        return;
      }
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
      const submissions = nextView.submissions;
      const formTasks = nextView.tasks.filter((task) => task.type === "form");

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

      const rosterLoad = (async () => {
        const includedRoster = nextView.roster;
        if (includedRoster !== undefined) {
          const roster = await safely(
            async () => {
              if (
                includedRoster.eventId !== target.eventId ||
                !target.submissionIds.includes(includedRoster.submissionId)
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
          return roster === undefined ? [] : ([[roster.submissionId, roster]] as const);
        }
        const getRoster = api.getRoster;
        if (!getRoster) {
          return [] as readonly (readonly [string, PortalRosterEnvelope])[];
        }
        const rosterResults = await Promise.all(
          submissions.map(async (submission) => {
            const roster = await safely(async () => {
              const result = await getRoster(target.eventId, submission.id, signal);
              if (result.eventId !== target.eventId || result.submissionId !== submission.id) {
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
        return rosterResults.filter(
          (entry): entry is readonly [string, PortalRosterEnvelope] => entry[1] !== undefined,
        );
      })();

      const includedAssets = nextView.assets;
      const listAssets = api.listAssets;
      const assetsLoad =
        includedAssets !== undefined
          ? safely(async () => {
              if (includedAssets.some((asset) => asset.eventId !== target.eventId)) {
                throw new PortalApiError(
                  "CONTEXT_MISMATCH",
                  "The file response belongs to a different event.",
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
                if (assets.some((asset) => asset.eventId !== target.eventId)) {
                  throw new PortalApiError(
                    "CONTEXT_MISMATCH",
                    "The file response belongs to a different event.",
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
                            result.taskId !== task.id
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

      const [rosterResults, assets, resources, wiki, taskResults] = await Promise.all([
        rosterLoad,
        assetsLoad,
        resourcesLoad,
        wikiLoad,
        taskLoad,
      ]);
      for (const [submissionId, roster] of rosterResults) {
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
    async (target: PortalContext, signal?: AbortSignal): Promise<boolean> => {
      if (!api) {
        setLoading(false);
        setError("The speaker portal API URL is not configured.");
        return false;
      }
      const generation = ++loadGeneration.current;
      setContext(target);
      setCapabilities(normalizeCapabilities(target.capabilities));
      setView(null);
      clearWorkspace();
      setMutationError(null);
      setLoading(true);
      setError(null);
      try {
        const nextView = await api.getPortal(target.eventId, signal);
        if (signal?.aborted || generation !== loadGeneration.current) {
          return false;
        }
        const serverContext = nextView.context ?? target;
        const nextCapabilities = normalizeCapabilities(
          nextView.capabilities ?? serverContext.capabilities,
        );
        setContext(serverContext);
        setCapabilities(nextCapabilities);
        setView({
          ...nextView,
          context: serverContext,
          capabilities: nextCapabilities,
        });
        setLoading(false);
        await loadWorkspaceFor(
          { ...serverContext, capabilities: nextCapabilities },
          { ...nextView, context: serverContext, capabilities: nextCapabilities },
          signal,
        );
        return true;
      } catch (loadError) {
        if (isAbort(loadError)) {
          return false;
        }
        if (generation === loadGeneration.current) {
          setView(null);
          setError(messageFrom(loadError));
          setLoading(false);
          setWorkspaceLoading(false);
        }
        return false;
      }
    },
    [api, clearWorkspace, loadWorkspaceFor],
  );

  const loadInitial = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      if (!api) {
        setContexts([]);
        setContext(null);
        setView(null);
        clearWorkspace();
        setError("The speaker portal API URL is not configured.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        if (!api.listPortalContexts) {
          throw new PortalApiError(
            "NO_PORTAL_CONTEXT",
            "No authorized event context is available.",
            403,
          );
        }
        const authorizedContexts = await api.listPortalContexts(signal);
        if (signal?.aborted) {
          return;
        }
        setContexts(authorizedContexts);
        if (authorizedContexts.length === 0) {
          setContext(null);
          setCapabilities([]);
          setView(null);
          clearWorkspace();
          setMutationError(null);
          setError(null);
          setLoading(false);
          return;
        }
        const preferred =
          authorizedContexts.find((candidate) => candidate.id === configuredEventId) ??
          authorizedContexts.find((candidate) => candidate.eventId === configuredEventId) ??
          authorizedContexts[0];
        if (!preferred) {
          throw new PortalApiError(
            "NO_PORTAL_CONTEXT",
            "No authorized event context is available.",
            403,
          );
        }
        await hydrate(preferred, signal);
      } catch (loadError) {
        if (!isAbort(loadError)) {
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
      await hydrate(context);
    } else {
      await loadInitial();
    }
  }, [context, hydrate, loadInitial]);

  const switchContext = useCallback(
    async (contextId: string): Promise<boolean> => {
      const target = contexts.find((candidate) => candidate.id === contextId);
      if (!target || target.id === context?.id) {
        return target?.id === context?.id;
      }
      setView(null);
      clearWorkspace();
      setMutationError(null);
      setError(null);
      setLoading(true);
      return hydrate(target);
    },
    [clearWorkspace, context?.id, contexts, hydrate],
  );

  const loadWorkspace = useCallback(async () => {
    if (context && view) {
      await loadWorkspaceFor(context, view);
      return;
    }
    setWorkspaceLoading(false);
  }, [context, loadWorkspaceFor, view]);

  const saveBiography = useCallback(
    async (profile: PortalProfile, biography: string) => {
      if (!api || !context) {
        setMutationError("The speaker portal API URL is not configured.");
        return false;
      }
      if (!can("profile-self")) {
        setMutationError("You do not have permission to edit this profile.");
        return false;
      }
      const targetContext = context;
      const generation = loadGeneration.current;
      setSavingProfile(true);
      setMutationError(null);
      try {
        const updated = await api.updateBiography({
          eventId: targetContext.eventId,
          participantId: profile.participantId,
          biography,
          expectedVersion: profile.version,
        });
        if (!isPortalGenerationCurrent(generation, loadGeneration.current)) {
          return false;
        }
        setView((current) =>
          current
            ? {
                ...current,
                profiles: current.profiles.map((candidate) =>
                  candidate.participantId === updated.participantId ? updated : candidate,
                ),
              }
            : current,
        );
        return true;
      } catch (saveError) {
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          setMutationError(messageFrom(saveError));
        }
        return false;
      } finally {
        setSavingProfile(false);
      }
    },
    [api, can, context],
  );

  const transitionTask = useCallback(
    async (task: PortalTask, toStatus: PortalTaskStatus, note?: string) => {
      if (!api || !context) {
        setMutationError("The speaker portal API URL is not configured.");
        return false;
      }
      if (!can("task-response")) {
        setMutationError("You do not have permission to respond to this task.");
        return false;
      }
      const targetContext = context;
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
    [api, can, context],
  );

  const uploadTask = useCallback(
    async (task: PortalTask, file: File) => {
      if (!api || !context) {
        setMutationError("The speaker portal API URL is not configured.");
        return false;
      }
      if (!can("task-response") || !can("asset-write")) {
        setMutationError("You do not have permission to upload this task file.");
        return false;
      }
      if (!api.finalizeAsset) {
        setMutationError("File finalization is not available yet.");
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
          finalized.state !== "ready"
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
        if (!isPortalGenerationCurrent(generation, loadGeneration.current)) {
          return false;
        }
        setView((current) => (current ? withUpdatedTask(current, updated) : current));
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
    [api, can, context],
  );

  const addRosterEntry = useCallback(
    async (input: {
      submissionId: string;
      email: string;
      displayName: string;
      role: "co_speaker";
    }) => {
      if (!api || !context) {
        setMutationError("The speaker portal API URL is not configured.");
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
      const generation = loadGeneration.current;
      setBusyRoster(true);
      setMutationError(null);
      try {
        const roster = await api.addRosterEntry({ eventId: targetContext.eventId, ...input });
        if (
          roster.eventId !== targetContext.eventId ||
          roster.submissionId !== input.submissionId
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
          rosters: { ...current.rosters, [input.submissionId]: roster },
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
    [api, can, context],
  );

  const updateRosterEntry = useCallback(
    async (input: {
      submissionId: string;
      participantId: string;
      displayName?: string;
      email?: string;
      status?: PortalRosterMember["status"];
    }) => {
      if (!api || !context) {
        setMutationError("The speaker portal API URL is not configured.");
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
      const generation = loadGeneration.current;
      setBusyRoster(true);
      setMutationError(null);
      try {
        const roster = await api.updateRosterEntry({ eventId: targetContext.eventId, ...input });
        if (
          roster.eventId !== targetContext.eventId ||
          roster.submissionId !== input.submissionId
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
          rosters: { ...current.rosters, [input.submissionId]: roster },
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
    [api, can, context],
  );

  const removeRosterEntry = useCallback(
    async (input: { submissionId: string; participantId: string }) => {
      if (!api || !context) {
        setMutationError("The speaker portal API URL is not configured.");
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
      const generation = loadGeneration.current;
      setBusyRoster(true);
      setMutationError(null);
      try {
        const roster = await api.removeRosterEntry({ eventId: targetContext.eventId, ...input });
        if (
          roster.eventId !== targetContext.eventId ||
          roster.submissionId !== input.submissionId
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
          rosters: { ...current.rosters, [input.submissionId]: roster },
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
    [api, can, context],
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
      if (!api || !context) {
        setMutationError("The speaker portal API URL is not configured.");
        return false;
      }
      if (!can("asset-write")) {
        setMutationError("You do not have permission to upload files.");
        return false;
      }
      if (!api.uploadFile) {
        setMutationError("File uploads are not available yet.");
        return false;
      }
      const targetContext = context;
      const generation = loadGeneration.current;
      const busyKey = input.supersedesAssetId ?? `${input.kind}:${input.file.name}`;
      setBusyAssetIds((current) => new Set(current).add(busyKey));
      setMutationError(null);
      try {
        const asset = await api.uploadFile({ eventId: targetContext.eventId, ...input });
        if (asset.eventId !== targetContext.eventId) {
          throw new PortalApiError(
            "CONTEXT_MISMATCH",
            "The file response belongs to a different event.",
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
    [api, can, context],
  );

  const finalizeAsset = useCallback(
    async (input: {
      assetId: string;
      state: Extract<PortalAsset["state"], "ready" | "rejected">;
      rejectionReason?: string;
    }) => {
      if (!api || !context) {
        setMutationError("The speaker portal API URL is not configured.");
        return false;
      }
      if (!can("asset-write") || !api.finalizeAsset) {
        setMutationError("You do not have permission to finalize this file.");
        return false;
      }
      const targetContext = context;
      const generation = loadGeneration.current;
      setBusyAssetIds((current) => new Set(current).add(input.assetId));
      setMutationError(null);
      try {
        const asset = await api.finalizeAsset({ eventId: targetContext.eventId, ...input });
        if (asset.eventId !== targetContext.eventId) {
          throw new PortalApiError(
            "CONTEXT_MISMATCH",
            "The file response belongs to a different event.",
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
      } catch (finalizeError) {
        if (isPortalGenerationCurrent(generation, loadGeneration.current)) {
          setMutationError(messageFrom(finalizeError));
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
    [api, can, context],
  );

  const loadAssetHistory = useCallback(
    async (assetId: string) => {
      if (!api?.getAssetHistory || !context || !can("asset-read")) {
        return [];
      }
      const targetContext = context;
      const generation = loadGeneration.current;
      try {
        const history = await api.getAssetHistory(targetContext.eventId, assetId);
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
    [api, can, context],
  );

  const loadAssetComments = useCallback(
    async (assetId: string) => {
      if (!api?.listAssetComments || !context || !can("asset-read")) {
        return [];
      }
      const targetContext = context;
      const generation = loadGeneration.current;
      try {
        const comments = await api.listAssetComments(targetContext.eventId, assetId);
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
    [api, can, context],
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
      const generation = loadGeneration.current;
      setMutationError(null);
      try {
        const comment = await api.addAssetComment({ eventId: targetContext.eventId, ...input });
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
    [api, can, context],
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
    [api, can, context],
  );

  const loadTaskForm = useCallback(
    async (taskId: string): Promise<PortalTaskForm | null> => {
      if (!api?.getTaskForm || !context || !can("task-response")) {
        return null;
      }
      const targetContext = context;
      const generation = loadGeneration.current;
      try {
        const form = await api.getTaskForm({ eventId: targetContext.eventId, taskId });
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
    [api, can, context],
  );

  const loadTaskResponse = useCallback(
    async (taskId: string): Promise<PortalTaskResponseEnvelope | null> => {
      if (!api?.getTaskResponse || !context || !can("task-response")) {
        return null;
      }
      const targetContext = context;
      const generation = loadGeneration.current;
      try {
        const response = await api.getTaskResponse({ eventId: targetContext.eventId, taskId });
        if (
          response.eventId !== targetContext.eventId ||
          response.taskId !== taskId ||
          response.participantId.length === 0
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
    [api, can, context],
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
      const generation = loadGeneration.current;
      setBusyTaskIds((current) => new Set(current).add(input.taskId));
      setMutationError(null);
      try {
        const response = await api.saveTaskResponse({ eventId: targetContext.eventId, ...input });
        if (
          response.eventId !== targetContext.eventId ||
          response.taskId !== input.taskId ||
          response.participantId.length === 0
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
    [api, can, context],
  );

  const value = useMemo<PortalContextValue>(
    () => ({
      eventId,
      eventQuery,
      contexts,
      context,
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
      reload,
      loadWorkspace,
      saveBiography,
      transitionTask,
      uploadTask,
      addRosterEntry,
      updateRosterEntry,
      removeRosterEntry,
      uploadWorkspaceFile,
      finalizeAsset,
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
      error,
      eventId,
      downloadAsset,
      finalizeAsset,
      loadAssetComments,
      loadAssetHistory,
      loadTaskForm,
      loadTaskResponse,
      loadWorkspace,
      loading,
      mutationError,
      reload,
      removeRosterEntry,
      saveBiography,
      saveTaskResponse,
      savingProfile,
      switchContext,
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

export function hasPortalCapability(
  capabilities: readonly PortalCapability[] | undefined,
  capability: PortalCapability,
): boolean {
  return capabilities?.includes(capability) ?? false;
}

export function portalContextLabel(context: PortalContext): string {
  return contextName(context);
}
