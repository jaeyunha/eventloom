"use client";

import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import workspaceStyles from "./embed-workspace.module.css";
import type {
  EmbedAccent,
  EmbedConfiguration,
  EmbedFieldId,
  EmbedLayout,
  EmbedOutputFormat,
  EmbedTheme,
  EmbedWidgetDefinition,
  EmbedWidgetId,
} from "./embed-workspace-model";
import {
  EMBED_DISPLAY_FIELDS,
  EMBED_OUTPUT_FORMATS,
  EMBED_THEMES,
  EMBED_WIDGETS,
  widgetFor,
} from "./embed-workspace-model";

function setListValue(value: string, onChange: (next: readonly string[]) => void): void {
  onChange(
    value
      .split(",")
      .map((item) => item.trim())
      .filter((item, index, items) => item.length > 0 && items.indexOf(item) === index),
  );
}

export function WidgetChooser({
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
export function EmbedConfigurationSetup({
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
  return (
    <Card aria-label="Widget setup">
      <CardHeader>
        <CardTitle>Widget setup</CardTitle>
        <CardDescription>
          Choose a saved configuration, adjust its public appearance, and save when you are ready to
          preview it.
        </CardDescription>
      </CardHeader>
      <CardContent className={workspaceStyles.setupGrid}>
        <EmbedConfigurationLibrary
          configurations={configurations}
          selectedConfigurationId={selectedConfigurationId}
          configurationName={configurationName}
          statusMessage={statusMessage}
          persistenceReady={persistenceReady}
          onConfigurationName={onConfigurationName}
          onSelectConfiguration={onSelectConfiguration}
          onNewConfiguration={onNewConfiguration}
          onSaveConfiguration={onSaveConfiguration}
          onToggleConfiguration={onToggleConfiguration}
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
          onTheme={onTheme}
          onOutputFormat={onOutputFormat}
          onLayout={onLayout}
          onAccent={onAccent}
          onBackgroundColor={onBackgroundColor}
          onTextColor={onTextColor}
          onCustomCss={onCustomCss}
          onDisplayFields={onDisplayFields}
          onTracks={onTracks}
          onStatuses={onStatuses}
          onRefresh={onRefresh}
        />
      </CardContent>
    </Card>
  );
}
