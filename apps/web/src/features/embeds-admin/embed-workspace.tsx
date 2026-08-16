"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import styles from "@/features/admin/admin-shell.module.css";
import { useOrganizerEventId } from "@/features/admin/organizer-event-workspace";
import type { NavigationDataCache } from "@/lib/navigation-data-cache";
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
  EmbedWidgetDefinition,
  EmbedWidgetId,
  EmbedWorkspaceApi,
} from "./embed-workspace-model";
import {
  builderConfiguration,
  configuredPublicOrigin,
  createEmbedConfigurationId,
  createEmbedWorkspaceApi,
  DEFAULT_EMBED_ACCENT,
  DEFAULT_EMBED_DISPLAY_FIELDS,
  EMBED_DISPLAY_FIELDS,
  EMBED_OUTPUT_FORMATS,
  EMBED_THEMES,
  EMBED_WIDGETS,
  EMPTY_EMBED_CONFIGURATIONS,
  embedCodePreview,
  eventEmbedConfigurations,
  iframeSandbox,
  iframeSnippet,
  loadEmbedPublication,
  messageFrom,
  normalizeEmbedSlug,
  outputFormatLabel,
  publicAgendaCalendarUrl,
  publicAgendaJsonUrl,
  publicationMetadataFromState,
  publicEmbedUrl,
  scriptSnippet,
  widgetFor,
  workspaceScopeKey,
} from "./embed-workspace-model";

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

function CopyButton({ label, value }: Readonly<{ label: string; value: string }>) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  async function copy() {
    if (!value || typeof navigator === "undefined" || !navigator.clipboard) {
      setError(true);
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setError(false);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(true);
      setCopied(false);
    }
  }

  return (
    <div className={workspaceStyles.copyRow}>
      <Button
        variant="outline"
        size="sm"
        type="button"
        onClick={() => void copy()}
        disabled={!value}
      >
        {copied ? "Copied" : `Copy ${label}`}
      </Button>
      <span role="status" aria-live="polite" className={workspaceStyles.muted}>
        {copied
          ? `${label} copied to clipboard.`
          : error
            ? "Clipboard access is unavailable. Select the code to copy it."
            : ""}
      </span>
    </div>
  );
}

function WidgetChooser({
  selected,
  onChange,
}: Readonly<{ selected: EmbedWidgetId; onChange: (value: EmbedWidgetId) => void }>) {
  const selectedWidget = widgetFor(selected);
  return (
    <div className={workspaceStyles.widgetMenu}>
      <div>
        <p className={workspaceStyles.label}>Preview widget</p>
        <p className={workspaceStyles.muted}>{selectedWidget.description}</p>
      </div>
      <ToggleGroup
        type="single"
        value={selected}
        variant="outline"
        size="sm"
        onValueChange={(value) => {
          if (value) onChange(value as EmbedWidgetId);
        }}
        className={workspaceStyles.widgetMenuOptions}
        aria-label="Public widget"
      >
        {EMBED_WIDGETS.map((widget) => (
          <ToggleGroupItem
            key={widget.id}
            value={widget.id}
            className={workspaceStyles.widgetMenuOption}
            aria-label={widget.label}
          >
            {widget.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

function EmbedConfigurationLibrary({
  configurations,
  selectedConfigurationId,
  configurationName,
  statusMessage,
  persistenceReady,
  onConfigurationName,
  onSelectConfiguration,
  onNewConfiguration,
  onSaveConfiguration,
  onToggleConfiguration,
}: Readonly<{
  configurations: readonly EmbedConfiguration[];
  selectedConfigurationId: string | null;
  configurationName: string;
  statusMessage: string;
  persistenceReady: boolean;
  onConfigurationName: (value: string) => void;
  onSelectConfiguration: (value: string) => void;
  onNewConfiguration: () => void;
  onSaveConfiguration: () => void;
  onToggleConfiguration: (id: string, enabled: boolean) => void;
}>) {
  return (
    <Card className={workspaceStyles.setupPanel}>
      <CardHeader>
        <div className={workspaceStyles.cardHeadingRow}>
          <div>
            <CardTitle>Saved configuration</CardTitle>
            <CardDescription>
              Load an existing widget or name this one before saving.
            </CardDescription>
          </div>
          <Badge variant={persistenceReady ? "outline" : "secondary"}>
            {persistenceReady ? "Ready" : "Read-only"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className={workspaceStyles.sectionStack}>
        <div className={workspaceStyles.field}>
          <label htmlFor="embed-saved-configurations" className={workspaceStyles.label}>
            Saved configurations
          </label>
          <Select
            {...(selectedConfigurationId === null ? {} : { value: selectedConfigurationId })}
            onValueChange={onSelectConfiguration}
          >
            <SelectTrigger id="embed-saved-configurations" aria-label="Saved widget configurations">
              <SelectValue placeholder="New widget configuration" />
            </SelectTrigger>
            <SelectContent>
              {configurations.map((configuration) => (
                <SelectItem key={configuration.id} value={configuration.id}>
                  {configuration.name} · {widgetFor(configuration.widgetId).label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {configurations.length > 0 ? (
          <fieldset className={workspaceStyles.savedList}>
            <legend className="sr-only">Saved configuration availability</legend>
            {configurations.map((configuration) => {
              const checkboxId = `embed-configuration-enabled-${configuration.id}`;
              return (
                <div key={`${configuration.id}-enabled`} className={workspaceStyles.checkRow}>
                  <Checkbox
                    id={checkboxId}
                    aria-label={`${configuration.enabled ? "Disable" : "Enable"} ${configuration.name}`}
                    checked={configuration.enabled}
                    disabled={!persistenceReady}
                    onCheckedChange={(checked) =>
                      onToggleConfiguration(configuration.id, checked === true)
                    }
                  />
                  <Label htmlFor={checkboxId}>
                    <strong>{configuration.name}</strong>
                    <span className={workspaceStyles.muted}>
                      {configuration.enabled ? "Enabled" : "Disabled"} ·{" "}
                      {widgetFor(configuration.widgetId).label}
                    </span>
                  </Label>
                </div>
              );
            })}
          </fieldset>
        ) : (
          <p className={workspaceStyles.emptyNote}>
            Your saved widgets will appear here after you create the first one.
          </p>
        )}

        <div className={workspaceStyles.field}>
          <label htmlFor="embed-configuration-name" className={workspaceStyles.label}>
            Configuration name
          </label>
          <Input
            id="embed-configuration-name"
            aria-label="Configuration name"
            value={configurationName}
            onChange={(event) => onConfigurationName(event.target.value)}
            placeholder="e.g. Main schedule"
            maxLength={120}
          />
        </div>

        <div className={workspaceStyles.actionRow}>
          <Button type="button" onClick={onNewConfiguration}>
            New widget
          </Button>
          <Button
            variant="secondary"
            type="button"
            onClick={onSaveConfiguration}
            disabled={!persistenceReady}
          >
            {selectedConfigurationId ? "Update configuration" : "Save configuration"}
          </Button>
          <span className={workspaceStyles.muted}>
            {selectedConfigurationId
              ? "Saving updates the selected widget without changing its public link."
              : "Save once to create a verified preview and sharing links."}
          </span>
        </div>

        <p role="status" aria-live="polite" className={workspaceStyles.statusMessage}>
          {statusMessage ||
            (persistenceReady
              ? "Choose a saved widget or create a new one."
              : "Loading saved widgets…")}
        </p>
      </CardContent>
    </Card>
  );
}
function setListValue(value: string, onChange: (next: readonly string[]) => void): void {
  onChange(
    value
      .split(",")
      .map((item) => item.trim())
      .filter((item, index, items) => item.length > 0 && items.indexOf(item) === index),
  );
}

function EmbedControls({
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
  cacheRefreshBusy: _cacheRefreshBusy,
  cacheRefreshError: _cacheRefreshError,
  onTheme,
  onOutputFormat,
  onLayout,
  onAccent,
  onBackgroundColor,
  onTextColor,
  onCustomCss,
  onDisplayFields,
  onTracks,
  onStatuses,
  onRefresh,
}: Readonly<{
  widget: EmbedWidgetDefinition;
  theme: EmbedTheme;
  outputFormat: EmbedOutputFormat;
  layout: EmbedLayout;
  accent: EmbedAccent;
  backgroundColor: string;
  textColor: string;
  customCss: string;
  displayFields: readonly EmbedFieldId[];
  trackIds: readonly string[];
  statuses: readonly string[];
  cacheRefreshMessage: string;
  cacheRefreshBusy: boolean;
  cacheRefreshError: boolean;
  onTheme: (value: EmbedTheme) => void;
  onOutputFormat: (value: EmbedOutputFormat) => void;
  onLayout: (value: EmbedLayout) => void;
  onAccent: (value: EmbedAccent) => void;
  onBackgroundColor: (value: string) => void;
  onTextColor: (value: string) => void;
  onCustomCss: (value: string) => void;
  onDisplayFields: (value: readonly EmbedFieldId[]) => void;
  onTracks: (value: readonly string[]) => void;
  onStatuses: (value: readonly string[]) => void;
  onRefresh: () => void;
}>) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <div className={workspaceStyles.setupControls}>
      <Card className={workspaceStyles.setupPanel}>
        <CardHeader>
          <CardTitle>Appearance and output</CardTitle>
          <CardDescription>
            Choose how this widget looks and which public format visitors can use.
          </CardDescription>
        </CardHeader>
        <CardContent className={workspaceStyles.fieldGrid}>
          <div className={workspaceStyles.field}>
            <label htmlFor="embed-output-format" className={workspaceStyles.label}>
              Output format
            </label>
            <Select
              value={outputFormat}
              onValueChange={(value) => onOutputFormat(value as EmbedOutputFormat)}
            >
              <SelectTrigger id="embed-output-format" aria-label="Output format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EMBED_OUTPUT_FORMATS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className={workspaceStyles.muted}>
              {EMBED_OUTPUT_FORMATS.find((option) => option.value === outputFormat)?.description}
            </p>
          </div>

          <div className={workspaceStyles.field}>
            <label htmlFor="embed-layout" className={workspaceStyles.label}>
              Layout
            </label>
            <Select value={layout} onValueChange={(value) => onLayout(value as EmbedLayout)}>
              <SelectTrigger id="embed-layout">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {widget.layouts.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className={workspaceStyles.field}>
            <label htmlFor="embed-theme" className={workspaceStyles.label}>
              Theme
            </label>
            <Select value={theme} onValueChange={(value) => onTheme(value as EmbedTheme)}>
              <SelectTrigger id="embed-theme">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EMBED_THEMES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className={workspaceStyles.colorGrid}>
            <label htmlFor="embed-accent" className={workspaceStyles.field}>
              <span className={workspaceStyles.label}>Accent color</span>
              <Input
                id="embed-accent"
                aria-label="Accent color"
                type="color"
                value={accent}
                onChange={(event) => onAccent(event.target.value)}
              />
            </label>
            <label htmlFor="embed-background-color" className={workspaceStyles.field}>
              <span className={workspaceStyles.label}>Background color</span>
              <Input
                id="embed-background-color"
                aria-label="Background color"
                type="color"
                value={backgroundColor}
                onChange={(event) => onBackgroundColor(event.target.value)}
              />
            </label>
            <label htmlFor="embed-text-color" className={workspaceStyles.field}>
              <span className={workspaceStyles.label}>Text color</span>
              <Input
                id="embed-text-color"
                aria-label="Text color"
                type="color"
                value={textColor}
                onChange={(event) => onTextColor(event.target.value)}
              />
            </label>
          </div>
        </CardContent>
      </Card>

      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <Card className={`${workspaceStyles.setupPanel} ${workspaceStyles.advancedPanel}`}>
          <CardHeader>
            <div className={workspaceStyles.cardHeadingRow}>
              <div>
                <CardTitle>Content and developer options</CardTitle>
                <CardDescription>
                  Fine-tune visible fields, filters, host CSS, and the local preview.
                </CardDescription>
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" type="button">
                  {advancedOpen ? "Collapse" : "Expand"}
                </Button>
              </CollapsibleTrigger>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className={workspaceStyles.sectionStack}>
              <fieldset className={workspaceStyles.fieldset}>
                <legend className={workspaceStyles.label}>Display fields</legend>
                <p className={workspaceStyles.muted}>
                  Required fields stay enabled; optional fields are included in copied links.
                </p>
                <div className={workspaceStyles.checkGrid}>
                  {EMBED_DISPLAY_FIELDS.map((field) => {
                    const checked = field.required || displayFields.includes(field.id);
                    return (
                      <div
                        key={field.id}
                        className={workspaceStyles.checkRow}
                        data-disabled={field.required ? "true" : undefined}
                      >
                        <Checkbox
                          id={`embed-field-${field.id}`}
                          name={`embed-field-${field.id}`}
                          checked={checked}
                          disabled={field.required}
                          onCheckedChange={(value) => {
                            const next = displayFields.filter((item) => item !== field.id);
                            onDisplayFields(value === true ? [...next, field.id] : next);
                          }}
                        />
                        <Label htmlFor={`embed-field-${field.id}`}>
                          {field.label}
                          {field.required ? " (required)" : ""}
                        </Label>
                      </div>
                    );
                  })}
                </div>
              </fieldset>

              <div className={workspaceStyles.fieldGrid}>
                <div className={workspaceStyles.field}>
                  <label htmlFor="embed-track-filter" className={workspaceStyles.label}>
                    Track filters
                  </label>
                  <Input
                    id="embed-track-filter"
                    aria-label="Track filters"
                    value={trackIds.join(", ")}
                    placeholder="All tracks"
                    onChange={(event) => setListValue(event.target.value, onTracks)}
                  />
                </div>
                <div className={workspaceStyles.field}>
                  <label htmlFor="embed-status-filter" className={workspaceStyles.label}>
                    Session status filters
                  </label>
                  <Input
                    id="embed-status-filter"
                    aria-label="Session status filters"
                    value={statuses.join(", ")}
                    placeholder="Approved"
                    onChange={(event) => setListValue(event.target.value, onStatuses)}
                  />
                </div>
              </div>

              <label htmlFor="embed-custom-css" className={workspaceStyles.field}>
                <span className={workspaceStyles.label}>Custom CSS for the host page</span>
                <textarea
                  id="embed-custom-css"
                  aria-label="Custom CSS"
                  value={customCss}
                  onChange={(event) => onCustomCss(event.target.value)}
                  placeholder="Optional CSS for your host page"
                  rows={4}
                  className={workspaceStyles.textarea}
                />
              </label>

              <Alert>
                <AlertTitle>Boundary and cache rules</AlertTitle>
                <AlertDescription>
                  Safe theme, layout, output, field, filter, and color choices are encoded in copied
                  URLs. Custom CSS stays in host markup and is never sent as executable URL content.
                  Refresh only updates this local preview; no remote cache mutation is claimed.
                </AlertDescription>
              </Alert>

              <Button variant="outline" type="button" onClick={onRefresh}>
                Refresh local preview
              </Button>
              <p role="status" aria-live="polite" className={workspaceStyles.muted}>
                {cacheRefreshMessage ||
                  "Manual cache refresh is available for this preview; no remote cache mutation is claimed."}
              </p>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}

function PublicationStatus({
  eventVersion,
  publication,
}: Readonly<{
  eventVersion: number | null | undefined;
  publication: EmbedPublicationMetadata;
}>) {
  const statusLabel =
    publication.status === "served"
      ? `Live · revision ${publication.servedRevision ?? "unknown"}`
      : publication.status === "pending"
        ? "Publishing update"
        : publication.status === "failed"
          ? "Update failed"
          : publication.status === "loading"
            ? "Checking publication"
            : publication.status === "unavailable"
              ? "Status unavailable"
              : "Not published";
  const servedRevision = publication.servedRevision;
  const headline =
    publication.status === "served"
      ? "Published preview ready"
      : publication.status === "pending"
        ? "Your previous version remains live"
        : publication.status === "failed" && servedRevision !== null
          ? "Your previous version remains live"
          : publication.status === "failed"
            ? "Publishing failed"
            : publication.status === "loading"
              ? "Checking publishing status"
              : publication.status === "unavailable"
                ? "Publishing status unavailable"
                : "Publish your agenda to preview";
  const summary =
    publication.status === "served"
      ? "This preview matches the program visitors can currently see."
      : publication.status === "pending"
        ? `Revision ${servedRevision ?? "none"} stays live while revision ${publication.pendingRevision ?? "the next revision"} is prepared.`
        : publication.status === "failed" && servedRevision !== null
          ? `Visitors still see revision ${servedRevision}. Review the agenda before publishing again.`
          : publication.status === "failed"
            ? "The latest program update could not be published."
            : publication.status === "loading"
              ? "Eventloom is confirming which program revision is live."
              : publication.status === "unavailable"
                ? "Preview and sharing are paused until the live revision can be confirmed."
                : "Publish the agenda to create a live preview and sharing links.";
  return (
    <Collapsible className={workspaceStyles.publicationSummary}>
      <div className={workspaceStyles.publicationSummaryRow}>
        <div
          className={workspaceStyles.publicationSummaryCopy}
          role="status"
          aria-label="Publication status"
        >
          <Badge variant={publication.status === "served" ? "default" : "secondary"}>
            {statusLabel}
          </Badge>
          <div>
            <strong>{headline}</strong>
            <p className={workspaceStyles.muted}>{summary}</p>
          </div>
        </div>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" type="button">
            Publication details
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent forceMount className={workspaceStyles.publicationDetailsContent}>
        <div className={workspaceStyles.statusGrid}>
          <div className={workspaceStyles.statusItem}>
            <span className={workspaceStyles.statusLabel}>Draft event</span>
            <strong>
              {eventVersion === null || eventVersion === undefined
                ? "Version not loaded"
                : `Event version ${eventVersion}`}
            </strong>
            <span className={workspaceStyles.muted}>Private organizer record.</span>
          </div>
          <div className={workspaceStyles.statusItem}>
            <span className={workspaceStyles.statusLabel}>Served program revision</span>
            <strong>
              {servedRevision === null ? "No served revision" : `Revision ${servedRevision}`}
            </strong>
            <span className={workspaceStyles.muted}>
              {publication.status === "pending"
                ? `Rebuild ${publication.pendingRevision ?? "pending"} is in progress; revision ${servedRevision ?? "none"} remains served.`
                : publication.status === "failed"
                  ? `${publication.failedReason ?? "The latest rebuild failed."} Previously served revision remains active.`
                  : (publication.message ?? "Public outputs use this served program release.")}
            </span>
          </div>
          <div className={workspaceStyles.statusItem}>
            <span className={workspaceStyles.statusLabel}>Publication state</span>
            <strong>{statusLabel}</strong>
            <span className={workspaceStyles.muted}>
              {publication.pendingRevision === null
                ? "No pending rebuild."
                : `Pending rebuild revision ${publication.pendingRevision}.`}
            </span>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function CodePanel({
  settings,
  publication,
}: Readonly<{
  settings: EmbedSnippetSettings;
  publication: EmbedPublicationMetadata;
}>) {
  const iframe = iframeSnippet(settings);
  const script = scriptSnippet(settings);
  const preview = embedCodePreview(settings);
  const format = outputFormatLabel(settings.outputFormat ?? "styled-html");
  const revision = publication.servedRevision;
  const publicUrl = publicEmbedUrl(settings);
  const jsonUrl = publicAgendaJsonUrl(settings);
  const calendarUrl = publicAgendaCalendarUrl(settings);

  return (
    <Card aria-labelledby="embed-code-heading">
      <CardHeader>
        <div className={workspaceStyles.cardHeadingRow}>
          <div>
            <p className={styles.panelEyebrow}>Sharing and exports</p>
            <CardTitle id="embed-code-heading">Share or embed</CardTitle>
            <CardDescription>
              Copy the public link, calendar feeds, or website embed code for this widget.
            </CardDescription>
          </div>
          {revision !== null ? <Badge variant="outline">Program revision {revision}</Badge> : null}
          {revision !== null ? (
            <p className={workspaceStyles.muted}>
              Served program revision {revision} is used by every output.
            </p>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className={workspaceStyles.sectionStack}>
        <div className={workspaceStyles.shareBlock}>
          <div className={workspaceStyles.cardHeadingRow}>
            <div>
              <h3 className={workspaceStyles.subheading}>Live public URL</h3>
              <p className={workspaceStyles.muted}>
                Anyone with this link can open the confirmed public revision.
              </p>
            </div>
            <Badge variant="secondary">Revision {revision}</Badge>
          </div>
          <Input aria-label="Live public embed URL" readOnly value={publicUrl} />
          <div className={workspaceStyles.actionRow}>
            <CopyButton label="public URL" value={publicUrl} />
            <Button asChild variant="outline">
              <a href={publicUrl} target="_blank" rel="noreferrer">
                Open public view ↗
              </a>
            </Button>
          </div>
        </div>

        <div className={workspaceStyles.codeBlock}>
          <div>
            <h3 className={workspaceStyles.subheading}>JSON feed</h3>
            <p className={workspaceStyles.muted}>
              Machine-readable published agenda using this configuration and program revision.
            </p>
          </div>
          <Input aria-label="JSON feed URL" readOnly value={jsonUrl} />
          <CopyButton label="JSON feed URL" value={jsonUrl} />
        </div>

        <div className={workspaceStyles.codeBlock}>
          <div>
            <h3 className={workspaceStyles.subheading}>iCal feed</h3>
            <p className={workspaceStyles.muted}>
              Calendar output using this configuration and program revision.
            </p>
          </div>
          <Input aria-label="iCal feed URL" readOnly value={calendarUrl} />
          <CopyButton label="iCal feed URL" value={calendarUrl} />
        </div>

        <Collapsible>
          <div className={workspaceStyles.developerDisclosure}>
            <div>
              <h3 className={workspaceStyles.subheading}>Developer embed code</h3>
              <p className={workspaceStyles.muted}>
                Iframe, script, and {format} output for websites that accept embed markup.
              </p>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="outline">Show code</Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent forceMount className={workspaceStyles.developerContent}>
            <div className={workspaceStyles.codeBlock}>
              <div>
                <h3 className={workspaceStyles.subheading}>Code preview · {format}</h3>
                <p className={workspaceStyles.muted}>
                  Safe options are encoded in the public URL; no private fields or executable custom
                  CSS are copied.
                </p>
              </div>
              <ScrollArea className={workspaceStyles.codeScroll}>
                <textarea
                  aria-label="Embed code preview"
                  readOnly
                  value={preview}
                  rows={8}
                  className={workspaceStyles.codeArea}
                />
              </ScrollArea>
              <CopyButton label="code preview" value={preview} />
            </div>

            <div className={workspaceStyles.codeBlock}>
              <div>
                <h3 className={workspaceStyles.subheading}>Iframe snippet</h3>
                <p className={workspaceStyles.muted}>
                  Paste this sandboxed, responsive iframe into a page that accepts HTML.
                </p>
              </div>
              <textarea
                aria-label="Iframe embed snippet"
                readOnly
                value={iframe}
                rows={6}
                className={workspaceStyles.codeArea}
              />
              <CopyButton label="iframe code" value={iframe} />
            </div>

            {settings.widget.scriptView ? (
              <div className={workspaceStyles.codeBlock}>
                <div>
                  <h3 className={workspaceStyles.subheading}>Script snippet</h3>
                  <p className={workspaceStyles.muted}>
                    Use the fixed loader for supported Agenda and Speaker Gallery views.
                  </p>
                </div>
                <textarea
                  aria-label="Script embed snippet"
                  readOnly
                  value={script}
                  rows={6}
                  className={workspaceStyles.codeArea}
                />
                <CopyButton label="script code" value={script} />
              </div>
            ) : (
              <Alert>
                <AlertTitle>Iframe mode is the supported option for this widget.</AlertTitle>
                <AlertDescription>
                  The script loader supports Agenda and Speaker Gallery. Use the generated iframe
                  for this view.
                </AlertDescription>
              </Alert>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

export type EmbedWorkspaceEventSnapshot = Pick<
  EmbedEventRecord,
  "id" | "organizationId" | "slug" | "name" | "version" | "embedConfigurations"
>;

export interface EmbedWorkspaceCacheSnapshot {
  readonly event: EmbedWorkspaceEventSnapshot;
  readonly publication?: EmbedPublicationMetadata;
}

type EmbedWorkspaceLoadState =
  | { readonly status: "loading"; readonly scopeKey: string }
  | {
      readonly status: "loaded";
      readonly scopeKey: string;
      readonly event: EmbedWorkspaceEventSnapshot;
      readonly eventSlug: string;
      readonly eventName: string;
    }
  | { readonly status: "error"; readonly scopeKey: string; readonly message: string };
type EmbedWorkspaceLoadedState = Extract<EmbedWorkspaceLoadState, { readonly status: "loaded" }>;

interface EmbedWorkspaceCacheScope {
  readonly organizationId: string;
  readonly eventId: string;
  readonly key: string;
  readonly tags: readonly string[];
  readonly invalidationTags: readonly string[];
}

export function embedWorkspaceCacheKey(organizationId: string, eventId: string): string {
  return `embeds:workspace:${organizationId.trim()}:${eventId.trim()}`;
}

export function embedWorkspaceCacheTags(
  organizationId: string,
  eventId: string,
): readonly string[] {
  const normalizedOrganizationId = organizationId.trim();
  const normalizedEventId = eventId.trim();
  return [
    `organization:${normalizedOrganizationId}`,
    `event:${normalizedEventId}`,
    `embeds:${normalizedEventId}`,
  ];
}

function embedWorkspaceCacheScope(
  organizationId: string,
  eventId: string,
): EmbedWorkspaceCacheScope | null {
  const normalizedOrganizationId = organizationId.trim();
  const normalizedEventId = eventId.trim();
  if (!normalizedOrganizationId || !normalizedEventId) return null;
  const tags = embedWorkspaceCacheTags(normalizedOrganizationId, normalizedEventId);
  return {
    organizationId: normalizedOrganizationId,
    eventId: normalizedEventId,
    key: embedWorkspaceCacheKey(normalizedOrganizationId, normalizedEventId),
    tags,
    invalidationTags: tags.slice(1),
  };
}

function embedWorkspaceEventSnapshot(event: EmbedEventRecord): EmbedWorkspaceEventSnapshot {
  return {
    id: event.id,
    organizationId: event.organizationId,
    slug: event.slug,
    name: event.name,
    version: event.version,
    embedConfigurations: eventEmbedConfigurations(event.embedConfigurations),
  };
}

function embedWorkspaceLoadedState(
  scopeKey: string,
  snapshot: EmbedWorkspaceCacheSnapshot,
): EmbedWorkspaceLoadedState | null {
  const eventSlug = normalizeEmbedSlug(snapshot.event.slug);
  if (
    snapshot.event.id.trim().length === 0 ||
    snapshot.event.organizationId.trim().length === 0 ||
    eventSlug === null
  ) {
    return null;
  }
  return {
    status: "loaded",
    scopeKey,
    event: snapshot.event,
    eventSlug,
    eventName: snapshot.event.name,
  };
}

function cachedEmbedWorkspaceSnapshot(
  cache: NavigationDataCache | null,
  scope: EmbedWorkspaceCacheScope | null,
): EmbedWorkspaceCacheSnapshot | undefined {
  if (cache === null || scope === null) return undefined;
  const snapshot = cache.peek<EmbedWorkspaceCacheSnapshot>(scope.key);
  if (
    snapshot === undefined ||
    snapshot.event.id.trim() !== scope.eventId ||
    snapshot.event.organizationId.trim() !== scope.organizationId ||
    embedWorkspaceLoadedState(scope.key, snapshot) === null
  ) {
    return undefined;
  }
  return snapshot;
}

type EmbedWorkspaceLoaderApi = Pick<
  EmbedWorkspaceApi,
  "getEvent" | "updateEvent" | "getPublication"
>;

interface EmbedWorkspaceLoadCallbacks {
  readonly setState: (value: EmbedWorkspaceLoadState) => void;
  readonly setLoadedApi: (value: EmbedWorkspaceLoaderApi) => void;
  readonly setPublication: (value: EmbedPublicationMetadata | undefined) => void;
  readonly setPublicationFresh: (value: boolean) => void;
}

interface EmbedWorkspaceLoadOptions {
  readonly organizationId: string;
  readonly eventId: string;
  readonly scopeKey: string;
  readonly providedApi: EmbedWorkspaceLoaderApi | undefined;
  readonly navigationCache: NavigationDataCache | null;
  readonly cacheScope: EmbedWorkspaceCacheScope | null;
  readonly fresh: boolean;
  readonly signal: AbortSignal;
  readonly isCurrentScope: () => boolean;
  readonly callbacks: EmbedWorkspaceLoadCallbacks;
}

async function loadEmbedWorkspace(options: EmbedWorkspaceLoadOptions): Promise<void> {
  const {
    organizationId,
    eventId,
    scopeKey,
    providedApi,
    navigationCache,
    cacheScope,
    fresh,
    signal,
    isCurrentScope,
    callbacks,
  } = options;
  const { setState, setLoadedApi, setPublication, setPublicationFresh } = callbacks;
  const requestScopeKey = scopeKey;
  if (!organizationId || !eventId) {
    setState({
      status: "error",
      scopeKey: requestScopeKey,
      message: "An organization and event context are required.",
    });
    return;
  }

  let api = providedApi;
  if (!api) {
    try {
      api = createEmbedWorkspaceApi(organizationId);
    } catch (error) {
      if (!signal.aborted && isCurrentScope()) {
        setState({ status: "error", scopeKey: requestScopeKey, message: messageFrom(error) });
      }
      return;
    }
  }
  setLoadedApi(api);

  const cachedAtStart = cachedEmbedWorkspaceSnapshot(navigationCache, cacheScope);
  if (fresh && navigationCache !== null && cacheScope !== null) {
    navigationCache.invalidate(cacheScope.invalidationTags);
  }
  if (fresh) {
    setPublicationFresh(false);
    setPublication(
      publicationMetadataFromState(
        null,
        "loading",
        "Loading the current organizer publication state.",
      ),
    );
  }
  if (fresh || cachedAtStart === undefined) {
    setState({ status: "loading", scopeKey: requestScopeKey });
  }

  const loadEvent = async (requestSignal?: AbortSignal): Promise<EmbedWorkspaceCacheSnapshot> => {
    const event = await api.getEvent(eventId, requestSignal);
    if (requestSignal?.aborted) {
      throw new DOMException("The request was aborted.", "AbortError");
    }
    if (event.organizationId !== organizationId || event.id !== eventId) {
      throw new Error(
        "The organizer event response does not match this organization and event context.",
      );
    }
    const eventSnapshot = embedWorkspaceEventSnapshot(event);
    const cachedPublication = fresh ? undefined : cachedAtStart?.publication;
    return cachedPublication === undefined
      ? { event: eventSnapshot }
      : { event: eventSnapshot, publication: cachedPublication };
  };

  try {
    const snapshot =
      navigationCache !== null && cacheScope !== null
        ? await navigationCache.read<EmbedWorkspaceCacheSnapshot>({
            key: cacheScope.key,
            tags: cacheScope.tags,
            load: () => loadEvent(),
            ...(fresh ? { fresh: true } : {}),
          })
        : await loadEvent(signal);
    if (signal.aborted || !isCurrentScope()) return;
    if (snapshot.event.organizationId !== organizationId || snapshot.event.id !== eventId) {
      throw new Error("The cached organizer event response does not match this context.");
    }
    const loadedState = embedWorkspaceLoadedState(requestScopeKey, snapshot);
    if (loadedState === null) {
      throw new Error("The organizer event has no public slug.");
    }
    setState(loadedState);
    if (snapshot.publication !== undefined) setPublication(snapshot.publication);
  } catch (error) {
    if (signal.aborted || !isCurrentScope()) return;
    setState({ status: "error", scopeKey: requestScopeKey, message: messageFrom(error) });
  }
}
function agendaValidationHref(organizationId: string, eventId: string): string {
  return `/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventId)}/agenda`;
}

function MissingPublicProjection({
  organizationId,
  eventId,
  publication,
  settingsAvailable = true,
}: Readonly<{
  organizationId: string;
  eventId: string;
  publication: EmbedPublicationMetadata;
  settingsAvailable?: boolean;
}>) {
  const checking = publication.status === "loading";
  const needsConfiguration =
    (publication.status === "served" ||
      publication.status === "pending" ||
      publication.status === "failed") &&
    !settingsAvailable;
  const title = checking
    ? "Checking publishing status"
    : needsConfiguration
      ? "Save and enable this widget to preview it"
      : publication.status === "failed"
        ? "The latest update could not be published"
        : publication.status === "pending"
          ? "Your previous version is still live"
          : publication.status === "unavailable"
            ? "Couldn’t check publishing status"
            : publication.status === "none"
              ? "Publish your agenda to preview this widget"
              : "Preview is not ready yet";
  const description = needsConfiguration
    ? "The public program is ready. Save this configuration and keep it enabled to generate its verified preview and embed code."
    : publication.status === "none"
      ? "Embeds use your published program, not the organizer draft. Review the agenda and publish it to create the public preview."
      : checking
        ? "Eventloom is confirming which program revision is live."
        : (publication.message ??
          publication.failedReason ??
          "Preview and sharing remain unavailable until the live program revision is confirmed.");
  const exceptional =
    !needsConfiguration &&
    (publication.status === "failed" || publication.status === "unavailable");

  if (exceptional) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{description}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Empty className={workspaceStyles.previewEmpty}>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {!checking && !needsConfiguration ? (
          <Button asChild size="sm">
            <Link href={agendaValidationHref(organizationId, eventId)}>
              Review and publish agenda
            </Link>
          </Button>
        ) : null}
        <p className={workspaceStyles.muted}>
          Sharing links and embed code will appear here when the widget is ready.
        </p>
      </EmptyContent>
    </Empty>
  );
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
export function EmbedWorkspaceView({
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

  return (
    <main id="embeds-content" tabIndex={-1} className={workspaceStyles.root}>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeaderCopy}>
          <p className={styles.eyebrow}>Public distribution</p>
          <h1 className={styles.pageTitle}>Embed widgets</h1>
          <p className={styles.pageDescription}>
            Create and preview public widgets from {eventName ? `${eventName}’s` : "this event’s"}{" "}
            latest published program.
          </p>
        </div>
      </header>

      <Alert className={workspaceStyles.boundaryAlert}>
        <AlertTitle>Published data only</AlertTitle>
        <AlertDescription>
          Embeds include the published agenda and speaker information you choose. Draft sessions,
          reviews, contact details, and private files stay private.
        </AlertDescription>
      </Alert>

      {loading ? (
        <Alert>
          <AlertTitle>Loading event context</AlertTitle>
          <AlertDescription>
            Embed configuration and publication metadata are loaded from the organizer event record
            and public projection.
          </AlertDescription>
        </Alert>
      ) : null}
      {errorMessage ? (
        <Alert variant="destructive">
          <AlertTitle>Embed workspace unavailable</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
          {onRetry !== undefined ? (
            <Button type="button" variant="outline" onClick={onRetry}>
              Retry loading event
            </Button>
          ) : null}
        </Alert>
      ) : null}
      {!loading && !errorMessage && !normalizedSlug ? (
        <Alert variant="destructive">
          <AlertTitle>No public event slug</AlertTitle>
          <AlertDescription>
            Configure a public event slug before generating a public URL. The event ID is never used
            as a guessed public path.
          </AlertDescription>
        </Alert>
      ) : null}
      {!loading && !errorMessage && normalizedSlug && !origin ? (
        <Alert variant="destructive">
          <AlertTitle>Public app URL is not configured</AlertTitle>
          <AlertDescription>
            Set NEXT_PUBLIC_APP_URL to the approved web origin before copying embed code.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card aria-label="Widget setup">
        <CardHeader>
          <CardTitle>Widget setup</CardTitle>
          <CardDescription>
            Choose a saved configuration, adjust its public appearance, and save when you are ready
            to preview it.
          </CardDescription>
        </CardHeader>
        <CardContent className={workspaceStyles.setupGrid}>
          <EmbedConfigurationLibrary
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
          />
          <EmbedControls
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
            cacheRefreshBusy={false}
            cacheRefreshError={false}
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
        </CardContent>
      </Card>

      <section className={workspaceStyles.widgetStudio} aria-label="Widget preview studio">
        <Card aria-labelledby="embed-preview-heading">
          <CardHeader className={workspaceStyles.previewHeader}>
            <div className={workspaceStyles.cardHeadingRow}>
              <div>
                <p className={styles.panelEyebrow}>Public widget preview</p>
                <CardTitle id="embed-preview-heading">{widget.label}</CardTitle>
                <CardDescription>
                  Select a widget below to use the full page width for its verified public preview.
                </CardDescription>
              </div>
              <fieldset className={workspaceStyles.previewActions} aria-label="Preview actions">
                <CopyButton label="public URL" value={previewUrl} />
                {canDistribute && previewUrl ? (
                  <>
                    <Button asChild variant="outline">
                      <a href={previewUrl} target="_blank" rel="noreferrer">
                        Open public view ↗
                      </a>
                    </Button>
                    <Button asChild variant="secondary">
                      <a href="#embed-code-heading">Get embed code</a>
                    </Button>
                  </>
                ) : (
                  <Button variant="secondary" type="button" disabled>
                    Get embed code
                  </Button>
                )}
              </fieldset>
            </div>

            <PublicationStatus eventVersion={scopedEventVersion} publication={publicationState} />
            <WidgetChooser selected={widgetId} onChange={changeWidget} />
          </CardHeader>
          <CardContent>
            {canDistribute && settingsWithIdentity ? (
              <iframe
                key={`${previewUrl}-${previewNonce}`}
                src={previewUrl}
                title={`Live preview: ${widget.label}`}
                loading="lazy"
                referrerPolicy="no-referrer"
                sandbox={iframeSandbox(widget)}
                className={workspaceStyles.previewFrame}
              />
            ) : (
              <MissingPublicProjection
                organizationId={organizationId}
                eventId={eventId}
                publication={publicationState}
                settingsAvailable={canDistribute}
              />
            )}
          </CardContent>
        </Card>

        {canDistribute && settings ? (
          <CodePanel settings={settings} publication={publicationState} />
        ) : null}
      </section>
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
