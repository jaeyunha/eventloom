"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useOrganizerEventId } from "@/features/admin/organizer-event-workspace";
import { useNavigationDataCache } from "@/lib/navigation-data-cache-provider";
import workspaceStyles from "./embed-workspace.module.css";
import type {
  EmbedAccent,
  EmbedConfiguration,
  EmbedEventRecord,
  EmbedExpectedPublishedRevision,
  EmbedFieldId,
  EmbedLayout,
  EmbedOutputFormat,
  EmbedPublicationMetadata,
  EmbedSnippetSettings,
  EmbedTheme,
  EmbedWidgetId,
  EmbedWorkspaceApi,
  EmbedWorkspaceLoadOptions,
  EmbedWorkspaceLoadState,
} from "./embed-workspace-model";
import {
  builderConfiguration,
  cachedEmbedWorkspaceSnapshot,
  configuredPublicOrigin,
  createEmbedConfigurationId,
  DEFAULT_EMBED_ACCENT,
  DEFAULT_EMBED_DISPLAY_FIELDS,
  EMPTY_EMBED_CONFIGURATIONS,
  embedWorkspaceCacheScope,
  embedWorkspaceEventSnapshot,
  embedWorkspaceLoadedState,
  eventEmbedConfigurations,
  loadEmbedPublication,
  loadEmbedWorkspace,
  messageFrom,
  normalizeEmbedSlug,
  publicationMetadataFromState,
  publicEmbedUrl,
  widgetFor,
  workspaceScopeKey,
} from "./embed-workspace-model";
import { EmbedConfigurationSetup } from "./embed-workspace-sections";
import { EmbedPreview, EmbedWorkspaceNotices } from "./embed-workspace-views";

export interface EmbedWorkspaceViewProps {
  readonly organizationId: string;
  readonly eventId: string;
  readonly eventSlug: string | null;
  readonly publicOrigin?: string;
  readonly eventName?: string;
  readonly eventVersion?: number | null;
  readonly expectedPublishedRevision?: EmbedExpectedPublishedRevision | null;
  readonly initialConfigurations?: readonly EmbedConfiguration[];
  readonly api?: Pick<EmbedWorkspaceApi, "updateEvent">;
  readonly publication?: EmbedPublicationMetadata;
  readonly publicationFresh?: boolean;
  readonly loading?: boolean;
  readonly errorMessage?: string | null;
  readonly onRetry?: () => void;
  readonly onEmbedMutation?: () => void;
}
type EmbedWorkspaceViewState = {
  readonly widgetId: EmbedWidgetId;
  readonly theme: EmbedTheme;
  readonly outputFormat: EmbedOutputFormat;
  readonly layout: EmbedLayout;
  readonly accent: EmbedAccent;
  readonly backgroundColor: string;
  readonly textColor: string;
  readonly customCss: string;
  readonly displayFields: readonly EmbedFieldId[];
  readonly trackIds: readonly string[];
  readonly statuses: readonly string[];
  readonly cacheRefreshMessage: string;
  readonly previewNonce: number;
  readonly configurations: readonly EmbedConfiguration[];
  readonly selectedConfigurationId: string | null;
  readonly configurationName: string;
  readonly configurationStatusMessage: string;
  readonly eventVersionState: number | null;
  readonly persistenceBusy: boolean;
  readonly snapshotScopeKey: string | null;
};

type EmbedWorkspaceViewAction =
  | { readonly type: "scope-reset" }
  | { readonly type: "reset-builder"; readonly message: string }
  | { readonly type: "apply-configuration"; readonly configuration: EmbedConfiguration }
  | { readonly type: "set-widget"; readonly value: EmbedWidgetId }
  | { readonly type: "set-theme"; readonly value: EmbedTheme }
  | { readonly type: "set-output-format"; readonly value: EmbedOutputFormat }
  | { readonly type: "set-layout"; readonly value: EmbedLayout }
  | { readonly type: "set-accent"; readonly value: EmbedAccent }
  | { readonly type: "set-background-color"; readonly value: string }
  | { readonly type: "set-text-color"; readonly value: string }
  | { readonly type: "set-custom-css"; readonly value: string }
  | { readonly type: "set-display-fields"; readonly value: readonly EmbedFieldId[] }
  | { readonly type: "set-track-ids"; readonly value: readonly string[] }
  | { readonly type: "set-statuses"; readonly value: readonly string[] }
  | { readonly type: "set-cache-refresh-message"; readonly value: string }
  | { readonly type: "increment-preview" }
  | { readonly type: "set-configurations"; readonly value: readonly EmbedConfiguration[] }
  | { readonly type: "set-selected-configuration-id"; readonly value: string | null }
  | { readonly type: "set-configuration-name"; readonly value: string }
  | { readonly type: "set-configuration-status-message"; readonly value: string }
  | { readonly type: "set-event-version"; readonly value: number | null }
  | { readonly type: "set-persistence-busy"; readonly value: boolean }
  | { readonly type: "set-snapshot-scope-key"; readonly value: string | null };

function embedWorkspaceViewDraftDefaults(): Pick<
  EmbedWorkspaceViewState,
  | "widgetId"
  | "theme"
  | "outputFormat"
  | "layout"
  | "accent"
  | "backgroundColor"
  | "textColor"
  | "customCss"
  | "displayFields"
  | "trackIds"
  | "statuses"
  | "selectedConfigurationId"
  | "configurationName"
  | "configurationStatusMessage"
> {
  return {
    widgetId: "sessions",
    theme: "auto",
    outputFormat: "styled-html",
    layout: widgetFor("sessions").defaultLayout,
    accent: DEFAULT_EMBED_ACCENT,
    backgroundColor: "#ffffff",
    textColor: "#20232b",
    customCss: "",
    displayFields: DEFAULT_EMBED_DISPLAY_FIELDS,
    trackIds: [],
    statuses: ["Approved"],
    selectedConfigurationId: null,
    configurationName: "",
    configurationStatusMessage: "",
  };
}

function initialEmbedWorkspaceViewState(
  initialConfiguration: EmbedConfiguration | undefined,
  initialLayout: EmbedLayout,
  eventVersion: number | null | undefined,
  configurations: readonly EmbedConfiguration[],
  snapshotScopeKey: string | null,
): EmbedWorkspaceViewState {
  const defaults = embedWorkspaceViewDraftDefaults();
  return {
    ...defaults,
    widgetId: initialConfiguration?.widgetId ?? defaults.widgetId,
    theme: initialConfiguration?.theme ?? defaults.theme,
    outputFormat: initialConfiguration?.outputFormat ?? defaults.outputFormat,
    layout: initialLayout,
    accent: initialConfiguration?.accent ?? defaults.accent,
    backgroundColor: initialConfiguration?.backgroundColor ?? defaults.backgroundColor,
    textColor: initialConfiguration?.textColor ?? defaults.textColor,
    customCss: initialConfiguration?.customCss ?? defaults.customCss,
    displayFields: initialConfiguration?.displayFields ?? defaults.displayFields,
    trackIds: initialConfiguration?.trackIds ?? defaults.trackIds,
    statuses: initialConfiguration?.statuses ?? defaults.statuses,
    selectedConfigurationId: initialConfiguration?.id ?? defaults.selectedConfigurationId,
    configurationName: initialConfiguration?.name ?? defaults.configurationName,
    configurations,
    cacheRefreshMessage: "",
    previewNonce: 0,
    configurationStatusMessage: "",
    eventVersionState: eventVersion ?? null,
    persistenceBusy: false,
    snapshotScopeKey,
  };
}

function embedWorkspaceViewReducer(
  state: EmbedWorkspaceViewState,
  action: EmbedWorkspaceViewAction,
): EmbedWorkspaceViewState {
  switch (action.type) {
    case "scope-reset":
      return initialEmbedWorkspaceViewState(
        undefined,
        widgetFor("sessions").defaultLayout,
        null,
        EMPTY_EMBED_CONFIGURATIONS,
        null,
      );
    case "reset-builder":
      return {
        ...state,
        ...embedWorkspaceViewDraftDefaults(),
        configurationStatusMessage: action.message,
      };
    case "apply-configuration": {
      const configurationWidget = widgetFor(action.configuration.widgetId);
      return {
        ...state,
        selectedConfigurationId: action.configuration.id,
        configurationName: action.configuration.name,
        widgetId: action.configuration.widgetId,
        theme: action.configuration.theme,
        outputFormat: action.configuration.outputFormat,
        layout: configurationWidget.layouts.includes(action.configuration.layout)
          ? action.configuration.layout
          : configurationWidget.defaultLayout,
        accent: action.configuration.accent,
        backgroundColor: action.configuration.backgroundColor,
        textColor: action.configuration.textColor,
        customCss: action.configuration.customCss,
        displayFields: action.configuration.displayFields,
        trackIds: action.configuration.trackIds,
        statuses: action.configuration.statuses,
      };
    }
    case "set-widget":
      return { ...state, widgetId: action.value };
    case "set-theme":
      return { ...state, theme: action.value };
    case "set-output-format":
      return { ...state, outputFormat: action.value };
    case "set-layout":
      return { ...state, layout: action.value };
    case "set-accent":
      return { ...state, accent: action.value };
    case "set-background-color":
      return { ...state, backgroundColor: action.value };
    case "set-text-color":
      return { ...state, textColor: action.value };
    case "set-custom-css":
      return { ...state, customCss: action.value };
    case "set-display-fields":
      return { ...state, displayFields: action.value };
    case "set-track-ids":
      return { ...state, trackIds: action.value };
    case "set-statuses":
      return { ...state, statuses: action.value };
    case "set-cache-refresh-message":
      return { ...state, cacheRefreshMessage: action.value };
    case "increment-preview":
      return { ...state, previewNonce: state.previewNonce + 1 };
    case "set-configurations":
      return { ...state, configurations: action.value };
    case "set-selected-configuration-id":
      return { ...state, selectedConfigurationId: action.value };
    case "set-configuration-name":
      return { ...state, configurationName: action.value };
    case "set-configuration-status-message":
      return { ...state, configurationStatusMessage: action.value };
    case "set-event-version":
      return { ...state, eventVersionState: action.value };
    case "set-persistence-busy":
      return { ...state, persistenceBusy: action.value };
    case "set-snapshot-scope-key":
      return { ...state, snapshotScopeKey: action.value };
  }
  return state;
}
function useEmbedWorkspaceViewController({
  organizationId,
  eventId,
  eventSlug,
  publicOrigin,
  eventName,
  eventVersion,
  expectedPublishedRevision: _expectedPublishedRevision = null,
  initialConfigurations,
  api,
  publication,
  publicationFresh = true,
  loading = false,
  errorMessage = null,
  onRetry,
  onEmbedMutation,
}: EmbedWorkspaceViewProps) {
  const scopeKey = workspaceScopeKey(organizationId, eventId);
  const navigationCache = useNavigationDataCache();
  const cacheScope = useMemo(
    () => embedWorkspaceCacheScope(organizationId, eventId),
    [eventId, organizationId],
  );
  const serverConfigurationList = useMemo(
    () => eventEmbedConfigurations(initialConfigurations),
    [initialConfigurations],
  );
  const initialConfiguration =
    serverConfigurationList.find((configuration) => configuration.enabled) ??
    serverConfigurationList[0];
  const initialWidget = widgetFor(initialConfiguration?.widgetId ?? "sessions");
  const initialLayout =
    initialConfiguration && initialWidget.layouts.includes(initialConfiguration.layout)
      ? initialConfiguration.layout
      : initialWidget.defaultLayout;
  const [viewState, dispatch] = useReducer(
    embedWorkspaceViewReducer,
    initialEmbedWorkspaceViewState(
      initialConfiguration,
      initialLayout,
      eventVersion,
      serverConfigurationList,
      initialConfigurations === undefined ? null : scopeKey,
    ),
  );
  const {
    widgetId,
    theme,
    outputFormat,
    layout,
    accent,
    backgroundColor,
    textColor,
    customCss,
    displayFields,
    trackIds,
    statuses,
    cacheRefreshMessage,
    previewNonce,
    configurations,
    selectedConfigurationId,
    configurationName,
    configurationStatusMessage,
    eventVersionState,
    persistenceBusy,
    snapshotScopeKey,
  } = viewState;
  const setTheme = useCallback((value: EmbedTheme) => dispatch({ type: "set-theme", value }), []);
  const setOutputFormat = useCallback(
    (value: EmbedOutputFormat) => dispatch({ type: "set-output-format", value }),
    [],
  );
  const setLayout = useCallback(
    (value: EmbedLayout) => dispatch({ type: "set-layout", value }),
    [],
  );
  const setAccent = useCallback(
    (value: EmbedAccent) => dispatch({ type: "set-accent", value }),
    [],
  );
  const setBackgroundColor = useCallback(
    (value: string) => dispatch({ type: "set-background-color", value }),
    [],
  );
  const setTextColor = useCallback(
    (value: string) => dispatch({ type: "set-text-color", value }),
    [],
  );
  const setCustomCss = useCallback(
    (value: string) => dispatch({ type: "set-custom-css", value }),
    [],
  );
  const setDisplayFields = useCallback(
    (value: readonly EmbedFieldId[]) => dispatch({ type: "set-display-fields", value }),
    [],
  );
  const setTrackIds = useCallback(
    (value: readonly string[]) => dispatch({ type: "set-track-ids", value }),
    [],
  );
  const setStatuses = useCallback(
    (value: readonly string[]) => dispatch({ type: "set-statuses", value }),
    [],
  );
  const setCacheRefreshMessage = useCallback(
    (value: string) => dispatch({ type: "set-cache-refresh-message", value }),
    [],
  );
  const setConfigurationName = useCallback(
    (value: string) => dispatch({ type: "set-configuration-name", value }),
    [],
  );
  const activeScopeRef = useRef(scopeKey);
  const installedConfigurationScopeRef = useRef<string | null>(
    initialConfigurations === undefined ? null : scopeKey,
  );
  const currentScopeRef = useRef(scopeKey);
  useLayoutEffect(() => {
    currentScopeRef.current = scopeKey;
  }, [scopeKey]);

  const resetBuilder = useCallback((message = "") => {
    dispatch({ type: "reset-builder", message });
  }, []);

  const applyConfiguration = useCallback((configuration: EmbedConfiguration) => {
    dispatch({ type: "apply-configuration", configuration });
  }, []);

  useEffect(() => {
    if (activeScopeRef.current !== scopeKey) {
      activeScopeRef.current = scopeKey;
      installedConfigurationScopeRef.current = null;
      dispatch({ type: "scope-reset" });
      return;
    }
    if (
      initialConfigurations === undefined ||
      installedConfigurationScopeRef.current === scopeKey
    ) {
      return;
    }

    installedConfigurationScopeRef.current = scopeKey;
    dispatch({ type: "set-configurations", value: serverConfigurationList });
    dispatch({ type: "set-event-version", value: eventVersion ?? null });
    const activeConfiguration =
      serverConfigurationList.find((configuration) => configuration.enabled) ??
      serverConfigurationList[0];
    if (activeConfiguration) {
      applyConfiguration(activeConfiguration);
      dispatch({
        type: "set-configuration-status-message",
        value: `Loaded "${activeConfiguration.name}" from the event.`,
      });
    } else {
      resetBuilder();
    }
    dispatch({ type: "set-snapshot-scope-key", value: scopeKey });
  }, [
    applyConfiguration,
    eventVersion,
    initialConfigurations,
    resetBuilder,
    scopeKey,
    serverConfigurationList,
  ]);

  const persistConfigurations = useCallback(
    async (nextConfigurations: readonly EmbedConfiguration[]): Promise<boolean> => {
      const requestScopeKey = scopeKey;
      const expectedVersion = eventVersionState;
      if (
        !api ||
        expectedVersion === null ||
        snapshotScopeKey !== requestScopeKey ||
        loading ||
        errorMessage
      ) {
        dispatch({
          type: "set-configuration-status-message",
          value: "Event configuration transport is unavailable.",
        });
        return false;
      }
      navigationCache?.invalidate(cacheScope?.invalidationTags ?? []);
      onEmbedMutation?.();

      dispatch({ type: "set-persistence-busy", value: true });
      dispatch({
        type: "set-configuration-status-message",
        value: "Saving event configuration…",
      });
      try {
        const updatedEvent = await api.updateEvent(eventId, {
          expectedVersion,
          embedConfigurations: nextConfigurations,
        });
        if (currentScopeRef.current !== requestScopeKey) return false;
        if (
          updatedEvent.organizationId !== organizationId ||
          updatedEvent.id !== eventId ||
          updatedEvent.embedConfigurations === undefined
        ) {
          throw new Error("The event configuration response does not match this event context.");
        }
        const authoritativeConfigurations = eventEmbedConfigurations(
          updatedEvent.embedConfigurations,
        );
        installedConfigurationScopeRef.current = requestScopeKey;
        dispatch({ type: "set-configurations", value: authoritativeConfigurations });
        dispatch({ type: "set-event-version", value: updatedEvent.version });
        if (navigationCache !== null && cacheScope !== null) {
          navigationCache.write(
            cacheScope.key,
            { event: embedWorkspaceEventSnapshot(updatedEvent) },
            cacheScope.tags,
          );
        }
        dispatch({ type: "set-snapshot-scope-key", value: requestScopeKey });
        return true;
      } catch (error) {
        if (currentScopeRef.current === requestScopeKey) {
          dispatch({
            type: "set-configuration-status-message",
            value: messageFrom(error),
          });
        }
        return false;
      } finally {
        dispatch({ type: "set-persistence-busy", value: false });
      }
    },
    [
      api,
      cacheScope,
      errorMessage,
      eventId,
      eventVersionState,
      loading,
      organizationId,
      navigationCache,
      onEmbedMutation,
      scopeKey,
      snapshotScopeKey,
    ],
  );

  const startNewConfiguration = useCallback(() => {
    resetBuilder("New widget configuration ready. Saved configurations remain on the event.");
  }, [resetBuilder]);

  const selectConfiguration = useCallback(
    (id: string) => {
      if (!id) {
        startNewConfiguration();
        return;
      }
      const configuration = configurations.find((candidate) => candidate.id === id);
      if (!configuration) {
        resetBuilder("That saved configuration is no longer available.");
        return;
      }
      applyConfiguration(configuration);
      dispatch({
        type: "set-configuration-status-message",
        value: `Loaded "${configuration.name}".`,
      });
    },
    [applyConfiguration, configurations, resetBuilder, startNewConfiguration],
  );

  const saveConfiguration = useCallback(async () => {
    const name = configurationName.trim();
    if (!name) {
      dispatch({
        type: "set-configuration-status-message",
        value: "Enter a configuration name before saving.",
      });
      return;
    }

    const existing = selectedConfigurationId
      ? configurations.find((configuration) => configuration.id === selectedConfigurationId)
      : undefined;
    const configurationId = existing?.id ?? createEmbedConfigurationId();
    const nextConfiguration = builderConfiguration(configurationId, name, {
      widgetId,
      enabled: existing?.enabled ?? true,
      theme,
      outputFormat,
      layout,
      accent,
      backgroundColor,
      textColor,
      customCss,
      displayFields,
      trackIds,
      statuses,
      revision: existing?.revision ?? null,
    });
    const nextConfigurations = existing
      ? configurations.map((configuration) =>
          configuration.id === existing.id ? nextConfiguration : configuration,
        )
      : [...configurations, nextConfiguration];

    if (!(await persistConfigurations(nextConfigurations))) return;
    dispatch({ type: "set-selected-configuration-id", value: configurationId });
    dispatch({ type: "set-configuration-name", value: name });
    dispatch({
      type: "set-configuration-status-message",
      value: existing ? `Updated "${name}" successfully.` : `Saved "${name}" successfully.`,
    });
  }, [
    accent,
    backgroundColor,
    configurationName,
    configurations,
    customCss,
    displayFields,
    layout,
    outputFormat,
    persistConfigurations,
    selectedConfigurationId,
    statuses,
    textColor,
    theme,
    trackIds,
    widgetId,
  ]);

  const toggleConfiguration = useCallback(
    async (id: string, enabled: boolean) => {
      const configuration = configurations.find((candidate) => candidate.id === id);
      if (!configuration) return;
      const nextConfigurations = configurations.map((candidate) =>
        candidate.id === id ? { ...candidate, enabled } : candidate,
      );
      if (!(await persistConfigurations(nextConfigurations))) return;
      dispatch({
        type: "set-configuration-status-message",
        value: `${enabled ? "Enabled" : "Disabled"} "${configuration.name}" successfully.`,
      });
    },
    [configurations, persistConfigurations],
  );

  const changeWidget = useCallback((nextWidgetId: EmbedWidgetId) => {
    dispatch({ type: "set-widget", value: nextWidgetId });
    dispatch({ type: "set-layout", value: widgetFor(nextWidgetId).defaultLayout });
  }, []);

  const widget = widgetFor(widgetId);
  const origin = configuredPublicOrigin(publicOrigin);
  const normalizedSlug = normalizeEmbedSlug(eventSlug ?? undefined);
  const selectedConfiguration =
    snapshotScopeKey === scopeKey && selectedConfigurationId !== null
      ? (configurations.find((configuration) => configuration.id === selectedConfigurationId) ??
        null)
      : null;
  const settings = useMemo<EmbedSnippetSettings | null>(() => {
    if (loading || errorMessage || snapshotScopeKey !== scopeKey || !normalizedSlug || !origin) {
      return null;
    }
    return {
      widget,
      eventSlug: normalizedSlug,
      publicOrigin: origin,
      theme,
      outputFormat,
      layout,
      accent,
      backgroundColor,
      textColor,
      customCss,
      displayFields,
      trackIds,
      statuses,
    };
  }, [
    accent,
    backgroundColor,
    customCss,
    displayFields,
    errorMessage,
    layout,
    loading,
    normalizedSlug,
    origin,
    outputFormat,
    scopeKey,
    snapshotScopeKey,
    statuses,
    textColor,
    theme,
    trackIds,
    widget,
  ]);
  const publicationIsChecking = loading || !publicationFresh;
  const authoritativePublication =
    snapshotScopeKey === scopeKey && !loading && !errorMessage && publicationFresh
      ? publication
      : undefined;
  const publicationState: EmbedPublicationMetadata = authoritativePublication ?? {
    state: null,
    status: publicationIsChecking ? "loading" : "none",
    servedRevision: null,
    pendingRevision: null,
    failedReason: null,
    agendaDraftVersion: null,
    publicRevision: null,
    previewAvailability: publicationIsChecking ? "checking" : "unavailable",
    message: publicationIsChecking
      ? "Loading the current organizer publication state."
      : "No publication has been confirmed for this event.",
  };
  const settingsWithIdentity =
    settings !== null &&
    selectedConfiguration !== null &&
    selectedConfiguration.revision !== null &&
    publicationState.servedRevision !== null
      ? {
          ...settings,
          configurationId: selectedConfiguration.id,
          configurationRevision: selectedConfiguration.revision,
          programRevision: publicationState.servedRevision,
        }
      : null;
  const canDistribute = settingsWithIdentity !== null && selectedConfiguration?.enabled === true;
  const previewUrl = canDistribute ? publicEmbedUrl(settingsWithIdentity) : "";
  const refreshPreview = () => {
    dispatch({ type: "increment-preview" });
    setCacheRefreshMessage(
      `Local preview refreshed at ${new Date().toLocaleTimeString()}. No remote cache was changed.`,
    );
  };
  const persistenceReady =
    api !== undefined &&
    eventVersionState !== null &&
    snapshotScopeKey === scopeKey &&
    !loading &&
    !errorMessage &&
    !persistenceBusy;
  const scopedConfigurations =
    snapshotScopeKey === scopeKey && !loading && !errorMessage
      ? configurations
      : EMPTY_EMBED_CONFIGURATIONS;
  const scopedEventVersion =
    snapshotScopeKey === scopeKey && !loading && !errorMessage ? eventVersionState : null;

  return {
    organizationId,
    eventId,
    eventName,
    loading,
    errorMessage,
    normalizedSlug,
    origin,
    onRetry,
    scopedConfigurations,
    selectedConfigurationId,
    configurationName,
    configurationStatusMessage,
    persistenceReady,
    setConfigurationName,
    selectConfiguration,
    startNewConfiguration,
    saveConfiguration,
    toggleConfiguration,
    widget,
    theme,
    outputFormat,
    layout,
    accent,
    backgroundColor,
    textColor,
    customCss,
    displayFields,
    trackIds,
    statuses,
    cacheRefreshMessage,
    setTheme,
    setOutputFormat,
    setLayout,
    setAccent,
    setBackgroundColor,
    setTextColor,
    setCustomCss,
    setDisplayFields,
    setTrackIds,
    setStatuses,
    refreshPreview,
    scopedEventVersion,
    publicationState,
    settings,
    previewUrl,
    previewNonce,
    canDistribute,
    changeWidget,
  };
}

export function EmbedWorkspaceView(props: EmbedWorkspaceViewProps) {
  const {
    organizationId,
    eventId,
    eventName,
    loading,
    errorMessage,
    normalizedSlug,
    origin,
    onRetry,
    scopedConfigurations,
    selectedConfigurationId,
    configurationName,
    configurationStatusMessage,
    persistenceReady,
    setConfigurationName,
    selectConfiguration,
    startNewConfiguration,
    saveConfiguration,
    toggleConfiguration,
    widget,
    theme,
    outputFormat,
    layout,
    accent,
    backgroundColor,
    textColor,
    customCss,
    displayFields,
    trackIds,
    statuses,
    cacheRefreshMessage,
    setTheme,
    setOutputFormat,
    setLayout,
    setAccent,
    setBackgroundColor,
    setTextColor,
    setCustomCss,
    setDisplayFields,
    setTrackIds,
    setStatuses,
    refreshPreview,
    scopedEventVersion,
    publicationState,
    settings,
    previewUrl,
    previewNonce,
    canDistribute,
    changeWidget,
  } = useEmbedWorkspaceViewController(props);
  return (
    <main id="embeds-content" tabIndex={-1} className={workspaceStyles.root}>
      <EmbedWorkspaceNotices
        eventName={eventName}
        loading={loading}
        errorMessage={errorMessage}
        normalizedSlug={normalizedSlug}
        origin={origin}
        onRetry={onRetry}
      />

      <EmbedConfigurationSetup
        configurations={scopedConfigurations}
        selectedConfigurationId={selectedConfigurationId}
        configurationName={configurationName}
        statusMessage={configurationStatusMessage}
        persistenceReady={persistenceReady}
        onConfigurationName={setConfigurationName}
        onSelectConfiguration={selectConfiguration}
        onNewConfiguration={startNewConfiguration}
        onSaveConfiguration={saveConfiguration}
        onToggleConfiguration={toggleConfiguration}
        widget={widget}
        theme={theme}
        outputFormat={outputFormat}
        layout={layout}
        accent={accent}
        backgroundColor={backgroundColor}
        textColor={textColor}
        customCss={customCss}
        displayFields={displayFields}
        trackIds={trackIds}
        statuses={statuses}
        cacheRefreshMessage={cacheRefreshMessage}
        onTheme={setTheme}
        onOutputFormat={setOutputFormat}
        onLayout={setLayout}
        onAccent={setAccent}
        onBackgroundColor={setBackgroundColor}
        onTextColor={setTextColor}
        onCustomCss={setCustomCss}
        onDisplayFields={setDisplayFields}
        onTracks={setTrackIds}
        onStatuses={setStatuses}
        onRefresh={refreshPreview}
      />

      <EmbedPreview
        organizationId={organizationId}
        eventId={eventId}
        eventVersion={scopedEventVersion}
        publication={publicationState}
        widget={widget}
        settings={settings}
        previewUrl={previewUrl}
        previewNonce={previewNonce}
        canDistribute={canDistribute}
        onWidgetChange={changeWidget}
      />
    </main>
  );
}

export interface EmbedWorkspaceProps {
  readonly organizationId: string;
  readonly eventId: string;
  readonly eventSlug?: string;
  readonly initialEvent?: Pick<EmbedEventRecord, "id" | "organizationId" | "slug" | "name">;
  readonly api?: Pick<EmbedWorkspaceApi, "getEvent" | "updateEvent" | "getPublication">;
  readonly publicOrigin?: string;
}

export function EmbedWorkspace({
  organizationId,
  eventId: fallbackEventId,
  api: providedApi,
  publicOrigin,
}: EmbedWorkspaceProps) {
  const eventId = useOrganizerEventId(fallbackEventId);
  const normalizedOrganizationId = organizationId.trim();
  const normalizedEventId = eventId.trim();
  const scopeKey = workspaceScopeKey(normalizedOrganizationId, normalizedEventId);
  const navigationCache = useNavigationDataCache();
  const cacheScope = useMemo(
    () => embedWorkspaceCacheScope(normalizedOrganizationId, normalizedEventId),
    [normalizedEventId, normalizedOrganizationId],
  );
  const cachedSnapshot = cachedEmbedWorkspaceSnapshot(navigationCache, cacheScope);
  const [state, setState] = useState<EmbedWorkspaceLoadState>(() => {
    const cachedState =
      cachedSnapshot === undefined ? null : embedWorkspaceLoadedState(scopeKey, cachedSnapshot);
    return cachedState ?? { status: "loading", scopeKey };
  });
  const [loadedApi, setLoadedApi] = useState<Pick<
    EmbedWorkspaceApi,
    "getEvent" | "updateEvent" | "getPublication"
  > | null>(providedApi ?? null);
  const [publication, setPublication] = useState<EmbedPublicationMetadata | undefined>(
    () => cachedSnapshot?.publication,
  );
  const [reloadNonce, setReloadNonce] = useState(0);
  const [publicationFresh, setPublicationFresh] = useState(false);
  const [publicationRefreshNonce, setPublicationRefreshNonce] = useState(0);
  const publicationCacheGenerationRef = useRef(0);
  const currentScopeRef = useRef(scopeKey);
  useLayoutEffect(() => {
    currentScopeRef.current = scopeKey;
  }, [scopeKey]);
  const loadOptions = useMemo<Omit<EmbedWorkspaceLoadOptions, "signal">>(
    () => ({
      organizationId: normalizedOrganizationId,
      eventId: normalizedEventId,
      scopeKey,
      providedApi,
      navigationCache,
      cacheScope,
      fresh: reloadNonce > 0,
      isCurrentScope: () => currentScopeRef.current === scopeKey,
      callbacks: {
        setState,
        setLoadedApi,
        setPublication,
        setPublicationFresh,
      },
    }),
    [
      cacheScope,
      navigationCache,
      normalizedEventId,
      normalizedOrganizationId,
      providedApi,
      reloadNonce,
      scopeKey,
    ],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadEmbedWorkspace({ ...loadOptions, signal: controller.signal });
    return () => controller.abort();
  }, [loadOptions]);

  const retry = useCallback(() => {
    setReloadNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    void publicationRefreshNonce;
    if (state.scopeKey !== scopeKey) {
      setPublicationFresh(false);
      setPublication(undefined);
      return;
    }
    if (state.status !== "loaded") {
      setPublicationFresh(false);
      if (state.status === "loading") {
        setPublication(
          publicationMetadataFromState(
            null,
            "loading",
            "Loading the current organizer publication state.",
          ),
        );
      } else {
        setPublication(undefined);
      }
      return;
    }

    const controller = new AbortController();
    const cacheGeneration = publicationCacheGenerationRef.current;
    setPublicationFresh(false);
    setPublication(
      publicationMetadataFromState(
        null,
        "loading",
        "Loading the current organizer publication state.",
      ),
    );
    if (loadedApi === null) return () => controller.abort();
    void loadEmbedPublication(loadedApi, normalizedEventId, controller.signal).then(
      (nextPublication) => {
        if (
          controller.signal.aborted ||
          currentScopeRef.current !== scopeKey ||
          publicationCacheGenerationRef.current !== cacheGeneration
        ) {
          return;
        }
        setPublication(nextPublication);
        setPublicationFresh(true);
        if (
          navigationCache !== null &&
          cacheScope !== null &&
          nextPublication.status !== "unavailable"
        ) {
          navigationCache.write(
            cacheScope.key,
            {
              event:
                cachedEmbedWorkspaceSnapshot(navigationCache, cacheScope)?.event ?? state.event,
              publication: nextPublication,
            },
            cacheScope.tags,
          );
        }
      },
      () => {
        if (
          !controller.signal.aborted &&
          currentScopeRef.current === scopeKey &&
          publicationCacheGenerationRef.current === cacheGeneration
        ) {
          setPublicationFresh(true);
          setPublication(
            publicationMetadataFromState(
              null,
              "unavailable",
              "The publication API could not be checked.",
            ),
          );
        }
      },
    );
    return () => controller.abort();
  }, [
    cacheScope,
    loadedApi,
    navigationCache,
    normalizedEventId,
    publicationRefreshNonce,
    scopeKey,
    state,
  ]);

  const eventLoaded =
    state.scopeKey === scopeKey && state.status === "loaded"
      ? state
      : cachedSnapshot === undefined
        ? null
        : embedWorkspaceLoadedState(scopeKey, cachedSnapshot);
  const scopedPublication = state.scopeKey === scopeKey ? publication : cachedSnapshot?.publication;
  const isLoading =
    eventLoaded === null && state.scopeKey === scopeKey
      ? true
      : state.scopeKey !== scopeKey
        ? cachedSnapshot === undefined
        : state.status === "loading";
  const errorMessage =
    state.scopeKey === scopeKey && state.status === "error" ? state.message : null;
  const onEmbedMutation = useCallback(() => {
    publicationCacheGenerationRef.current += 1;
    setPublicationRefreshNonce((value) => value + 1);
  }, []);

  return (
    <EmbedWorkspaceView
      key={scopeKey}
      organizationId={normalizedOrganizationId}
      eventId={normalizedEventId}
      eventSlug={eventLoaded?.eventSlug ?? null}
      eventName={eventLoaded?.eventName ?? ""}
      eventVersion={eventLoaded?.event.version ?? null}
      {...(eventLoaded
        ? {
            initialConfigurations: eventLoaded.event.embedConfigurations,
          }
        : {})}
      publicationFresh={publicationFresh}
      {...(scopedPublication !== undefined ? { publication: scopedPublication } : {})}
      {...(loadedApi === null ? {} : { api: loadedApi })}
      {...(publicOrigin === undefined ? {} : { publicOrigin })}
      loading={isLoading}
      errorMessage={errorMessage}
      onRetry={retry}
      onEmbedMutation={onEmbedMutation}
    />
  );
}
