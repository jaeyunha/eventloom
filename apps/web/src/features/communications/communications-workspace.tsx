"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef } from "react";
import { useOrganizerEventId } from "@/features/admin/organizer-event-workspace";
import { useNavigationDataCache } from "@/lib/navigation-data-cache-provider";
import {
  type CommunicationApi,
  type CommunicationAudience,
  type CommunicationPreview,
  type CommunicationSend,
  type CommunicationTemplate,
  createCommunicationApi,
  type ReminderDispatch,
  type ReminderFacts,
  type ReminderRun,
} from "./api";
import {
  type CommunicationProviderState,
  type CommunicationReminderTruthSnapshot,
  type CommunicationTemplateSelection,
  communicationNavigationCacheKey,
  communicationNavigationCacheTags,
  createCommunicationTemplateReadCoordinator,
  invalidateCommunicationPreviewState,
  loadCommunicationTemplates,
  messageFromError,
  normalizeCommunicationScopeId,
  previewAudienceForTemplate,
  type ReminderRunActionInput,
  type ReminderTruthState,
  reminderTruthStateFromError,
  stateFromError,
  type TemplateDraft,
} from "./communications-workspace-model";
import { CommunicationsWorkspaceView } from "./communications-workspace-views";

export { CommunicationsWorkspaceView };

interface CommunicationsWorkspaceProps {
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

function statusLabel(status: string): string {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

function useCommunicationsWorkspaceController({
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

function CommunicationsWorkspaceForScope(props: CommunicationsWorkspaceProps) {
  return useCommunicationsWorkspaceController(props);
}
export function CommunicationsWorkspace(props: CommunicationsWorkspaceProps) {
  const eventId = useOrganizerEventId(props.eventId);
  const scopeKey = `${normalizeCommunicationScopeId(props.organizationId)}:${normalizeCommunicationScopeId(eventId)}`;
  return <CommunicationsWorkspaceForScope key={scopeKey} {...props} eventId={eventId} />;
}
