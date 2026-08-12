"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import styles from "@/features/admin/admin-shell.module.css";
import {
  createOrganizerEventsApi,
  type OrganizerEventEmbedConfiguration,
  type OrganizerEventRecord,
  type OrganizerEventsApi,
} from "@/features/admin/organizer-overview";

export type EmbedWidgetId = "sessions" | "speakers" | "agenda" | "itinerary" | "gallery";
export type EmbedTheme = "auto" | "light" | "dark";
export type EmbedAccent = string;
export type EmbedLayout = "comfortable" | "compact" | "list" | "grid" | "timeline";
export type EmbedOutputFormat = "styled-html" | "basic-html" | "json" | "xml" | "ical";
export type EmbedFieldId =
  | "title"
  | "date-time"
  | "room"
  | "speakers"
  | "format"
  | "track"
  | "summary"
  | "company"
  | "bio";

export const EMBED_OUTPUT_FORMATS: readonly {
  readonly value: EmbedOutputFormat;
  readonly label: string;
  readonly description: string;
}[] = [
  {
    value: "styled-html",
    label: "Styled HTML",
    description: "Responsive iframe markup using the published public view.",
  },
  {
    value: "basic-html",
    label: "Basic HTML",
    description: "A plain link to the published public view.",
  },
  {
    value: "json",
    label: "JSON",
    description: "Configuration preview for the published public URL.",
  },
  {
    value: "xml",
    label: "XML",
    description: "Configuration preview for the published public URL.",
  },
  {
    value: "ical",
    label: "iCal",
    description: "Link to the published calendar source when available.",
  },
] as const;

export interface EmbedFieldDefinition {
  readonly id: EmbedFieldId;
  readonly label: string;
  readonly required: boolean;
}

export const EMBED_DISPLAY_FIELDS: readonly EmbedFieldDefinition[] = [
  { id: "title", label: "Title", required: true },
  { id: "date-time", label: "Date and time", required: true },
  { id: "room", label: "Room", required: false },
  { id: "speakers", label: "Speakers", required: false },
  { id: "format", label: "Format", required: false },
  { id: "track", label: "Track", required: false },
  { id: "summary", label: "Description", required: false },
  { id: "company", label: "Company", required: false },
  { id: "bio", label: "Biography", required: false },
] as const;

export const DEFAULT_EMBED_DISPLAY_FIELDS: readonly EmbedFieldId[] = [
  "title",
  "date-time",
  "room",
  "speakers",
  "format",
  "track",
  "summary",
  "company",
  "bio",
];

export interface EmbedWidgetDefinition {
  readonly id: EmbedWidgetId;
  readonly label: string;
  readonly description: string;
  /** The anonymous public route. */
  readonly publicView: "sessions" | "speakers-list" | "speakers" | "agenda" | "itinerary";
  /** The existing script route only supports the Agenda and Speaker Gallery views. */
  readonly scriptView: "agenda" | "speakers" | null;
  readonly layouts: readonly EmbedLayout[];
  readonly defaultLayout: EmbedLayout;
  readonly minHeight: string;
}

export const EMBED_WIDGETS: readonly EmbedWidgetDefinition[] = [
  {
    id: "sessions",
    label: "Sessions List",
    description: "A searchable list of published sessions and speakers.",
    publicView: "sessions",
    scriptView: null,
    layouts: ["comfortable", "compact"],
    defaultLayout: "comfortable",
    minHeight: "720px",
  },
  {
    id: "speakers",
    label: "Speakers List",
    description: "A directory pairing published speakers with their sessions.",
    publicView: "speakers-list",
    scriptView: null,
    layouts: ["list"],
    defaultLayout: "list",
    minHeight: "720px",
  },
  {
    id: "agenda",
    label: "Agenda",
    description: "The published agenda with day and track filters.",
    publicView: "agenda",
    scriptView: "agenda",
    layouts: ["timeline", "list"],
    defaultLayout: "timeline",
    minHeight: "720px",
  },
  {
    id: "itinerary",
    label: "Schedule Itinerary",
    description: "A schedule view visitors can personalize and download.",
    publicView: "itinerary",
    scriptView: null,
    layouts: ["timeline", "compact"],
    defaultLayout: "timeline",
    minHeight: "720px",
  },
  {
    id: "gallery",
    label: "Speaker Gallery",
    description: "A visual gallery of the published speaker roster.",
    publicView: "speakers",
    scriptView: "speakers",
    layouts: ["grid", "list"],
    defaultLayout: "grid",
    minHeight: "760px",
  },
] as const;

export const EMBED_THEMES: readonly { readonly value: EmbedTheme; readonly label: string }[] = [
  { value: "auto", label: "Match visitor preference" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

export const DEFAULT_EMBED_ACCENT = "#4f5ee8";

export interface EmbedConfiguration {
  readonly id: string;
  readonly name: string;
  readonly widgetId: EmbedWidgetId;
  readonly enabled: boolean;
  readonly theme: EmbedTheme;
  readonly outputFormat: EmbedOutputFormat;
  readonly layout: EmbedLayout;
  readonly accent: EmbedAccent;
  readonly backgroundColor: string;
  readonly textColor: string;
  readonly customCss: string;
  readonly displayFields: readonly EmbedFieldId[];
  readonly tracks: readonly string[];
  readonly statuses: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  return candidate ? candidate : null;
}

function isEmbedWidgetId(value: unknown): value is EmbedWidgetId {
  return typeof value === "string" && EMBED_WIDGETS.some((widget) => widget.id === value);
}

function isEmbedTheme(value: unknown): value is EmbedTheme {
  return value === "auto" || value === "light" || value === "dark";
}

function isEmbedOutputFormat(value: unknown): value is EmbedOutputFormat {
  return EMBED_OUTPUT_FORMATS.some((format) => format.value === value);
}

function isEmbedLayout(value: unknown): value is EmbedLayout {
  return (
    value === "comfortable" ||
    value === "compact" ||
    value === "list" ||
    value === "grid" ||
    value === "timeline"
  );
}

function isEmbedFieldId(value: unknown): value is EmbedFieldId {
  return EMBED_DISPLAY_FIELDS.some((field) => field.id === value);
}

function normalizeStringList(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) return null;
  const unique: string[] = [];
  for (const item of value) {
    const normalized = item.trim();
    if (normalized && !unique.includes(normalized)) unique.push(normalized);
  }
  return unique;
}

function normalizeDisplayFields(value: unknown): readonly EmbedFieldId[] | null {
  if (!Array.isArray(value) || !value.every(isEmbedFieldId)) return null;
  const unique = [...new Set(value)];
  const required = EMBED_DISPLAY_FIELDS.filter((field) => field.required).map((field) => field.id);
  return [...required, ...unique.filter((field) => !required.includes(field))];
}

function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/u.test(candidate) ? candidate : null;
}

function normalizeEmbedConfiguration(value: unknown): EmbedConfiguration | null {
  if (!isRecord(value)) return null;
  const id = nonEmptyString(value.id);
  const name = nonEmptyString(value.name);
  const accent = normalizeHexColor(value.accent);
  const backgroundColor = normalizeHexColor(value.backgroundColor);
  const textColor = normalizeHexColor(value.textColor);
  const tracks = normalizeStringList(value.tracks);
  const statuses = normalizeStringList(value.statuses);
  const displayFields = normalizeDisplayFields(value.displayFields);

  if (
    !id ||
    !name ||
    !isEmbedWidgetId(value.widgetId) ||
    typeof value.enabled !== "boolean" ||
    !isEmbedTheme(value.theme) ||
    !isEmbedOutputFormat(value.outputFormat) ||
    !isEmbedLayout(value.layout) ||
    !accent ||
    !backgroundColor ||
    !textColor ||
    typeof value.customCss !== "string" ||
    !tracks ||
    !statuses ||
    !displayFields
  ) {
    return null;
  }

  return {
    id,
    name,
    widgetId: value.widgetId,
    enabled: value.enabled,
    theme: value.theme,
    outputFormat: value.outputFormat,
    layout: value.layout,
    accent,
    backgroundColor,
    textColor,
    customCss: value.customCss,
    displayFields,
    tracks,
    statuses,
  };
}

const compactCardStyle: CSSProperties = {
  display: "grid",
  gap: "0.7rem",
  padding: "1rem",
  border: "1px solid var(--admin-border)",
  borderRadius: "var(--admin-radius-sm)",
  background: "var(--admin-canvas)",
};
const fieldStyle: CSSProperties = { display: "grid", gap: "0.35rem" };
const fieldLabelStyle: CSSProperties = {
  color: "var(--admin-ink)",
  fontSize: "0.78rem",
  fontWeight: 750,
};
const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: "2.55rem",
  padding: "0.55rem 0.65rem",
  border: "1px solid var(--admin-border-strong)",
  borderRadius: "var(--admin-radius-sm)",
  background: "var(--admin-surface)",
  color: "var(--admin-ink)",
  font: "inherit",
  fontSize: "0.84rem",
};
const subtleTextStyle: CSSProperties = {
  margin: 0,
  color: "var(--admin-muted)",
  fontSize: "0.78rem",
  lineHeight: 1.5,
};

export type EmbedSnippetSettings = Readonly<{
  widget: EmbedWidgetDefinition;
  eventSlug: string;
  publicOrigin: string;
  theme: EmbedTheme;
  outputFormat?: EmbedOutputFormat;
  displayFields?: readonly EmbedFieldId[];
  accent?: EmbedAccent;
  backgroundColor?: string;
  textColor?: string;
  customCss?: string;
  tracks?: readonly string[];
  statuses?: readonly string[];
  layout?: EmbedLayout;
}>;

function widgetFor(id: EmbedWidgetId): EmbedWidgetDefinition {
  const widget = EMBED_WIDGETS.find((candidate) => candidate.id === id);
  if (widget) return widget;
  const first = EMBED_WIDGETS[0];
  if (!first) throw new Error("At least one public embed widget is required.");
  return first;
}

function normalizeOrigin(value: string): string {
  const candidate = value.trim().replace(/\/+$/u, "");
  if (!candidate) return "";
  try {
    const origin = new URL(candidate);
    if (
      (origin.protocol !== "https:" && origin.protocol !== "http:") ||
      origin.username ||
      origin.password ||
      origin.search ||
      origin.hash ||
      (origin.pathname !== "/" && origin.pathname !== "")
    ) {
      return "";
    }
    return origin.origin;
  } catch {
    return "";
  }
}

function configuredPublicOrigin(explicit?: string): string {
  return normalizeOrigin(explicit ?? process.env.NEXT_PUBLIC_APP_URL ?? "");
}

function queryForSettings(settings: EmbedSnippetSettings): string {
  const query = new URLSearchParams();
  query.set("theme", settings.theme);
  query.set("outputFormat", settings.outputFormat ?? "styled-html");
  query.set("layout", settings.layout ?? settings.widget.defaultLayout);
  query.set("displayFields", (settings.displayFields ?? DEFAULT_EMBED_DISPLAY_FIELDS).join(","));

  const accent = normalizeHexColor(settings.accent ?? DEFAULT_EMBED_ACCENT);
  const backgroundColor = normalizeHexColor(settings.backgroundColor ?? "#ffffff");
  const textColor = normalizeHexColor(settings.textColor ?? "#20232b");
  if (accent) query.set("accent", accent);
  if (backgroundColor) query.set("backgroundColor", backgroundColor);
  if (textColor) query.set("textColor", textColor);

  const tracks = normalizeStringList(settings.tracks ?? []);
  const statuses = normalizeStringList(settings.statuses ?? []);
  if (tracks?.length) query.set("tracks", tracks.join(","));
  if (statuses?.length) query.set("statuses", statuses.join(","));

  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}

export function publicEmbedUrl(settings: EmbedSnippetSettings): string {
  const origin = configuredPublicOrigin(settings.publicOrigin);
  const slug = encodeURIComponent(settings.eventSlug.trim());
  if (!origin || !slug) return "";
  return `${origin}/embed/${slug}/${settings.widget.publicView}${queryForSettings(settings)}`;
}

export function publicAgendaCalendarUrl(settings: EmbedSnippetSettings): string {
  const origin = configuredPublicOrigin(settings.publicOrigin);
  const slug = encodeURIComponent(settings.eventSlug.trim());
  if (!origin || !slug) return "";
  return `${origin}/api/public/events/${slug}/agenda.ics`;
}

function iframeSandbox(widget: EmbedWidgetDefinition): string {
  if (widget.id === "itinerary") {
    return "allow-downloads allow-same-origin allow-scripts";
  }
  return widget.id === "agenda" ? "allow-downloads allow-scripts" : "allow-scripts";
}

export function iframeSnippet(settings: EmbedSnippetSettings): string {
  const src = publicEmbedUrl(settings);
  if (!src) return "";
  const widget = settings.widget;
  return [
    "<iframe",
    `  src="${src}"`,
    `  title="Open Sessionboard ${widget.label}"`,
    '  loading="lazy"',
    '  referrerpolicy="no-referrer"',
    `  sandbox="${iframeSandbox(widget)}"`,
    `  style="width:100%;min-height:${widget.minHeight};border:0;display:block"`,
    "></iframe>",
  ].join("\n");
}

export function scriptSnippet(settings: EmbedSnippetSettings): string {
  if (!settings.widget.scriptView) return "";
  const origin = configuredPublicOrigin(settings.publicOrigin);
  const slug = encodeURIComponent(settings.eventSlug.trim());
  if (!origin || !slug) return "";
  return [
    `<script src="${origin}/embed/${slug}/script${queryForSettings(settings)}"`,
    `  data-view="${settings.widget.scriptView}"`,
    `  data-theme="${settings.theme}"`,
    "  defer>",
    "</script>",
  ].join("\n");
}

function outputFormatLabel(value: EmbedOutputFormat): string {
  return EMBED_OUTPUT_FORMATS.find((option) => option.value === value)?.label ?? "Styled HTML";
}

function embedCodePreview(settings: EmbedSnippetSettings): string {
  const source = publicEmbedUrl(settings);
  if (!source) return "";
  const format = settings.outputFormat ?? "styled-html";
  const fields = settings.displayFields ?? DEFAULT_EMBED_DISPLAY_FIELDS;
  const metadata = [
    `<!-- ${outputFormatLabel(format)} preview for ${settings.widget.label}. -->`,
    "<!-- Selected safe options are encoded in the live URL. Custom CSS is not sent to the public URL. -->",
    `<!-- Display fields: ${fields.join(", ")} -->`,
    `<!-- Tracks: ${settings.tracks?.join(", ") || "all"}; statuses: ${settings.statuses?.join(", ") || "all"} -->`,
    `<!-- Accent: ${settings.accent ?? DEFAULT_EMBED_ACCENT}; custom CSS: ${settings.customCss?.trim() ? "provided for host markup" : "none"} -->`,
    `<!-- Surface: ${settings.backgroundColor ?? "#ffffff"}; text: ${settings.textColor ?? "#20232b"} -->`,
  ].join("\n");

  switch (format) {
    case "styled-html":
      return [
        metadata,
        settings.widget.scriptView ? scriptSnippet(settings) : iframeSnippet(settings),
      ]
        .filter(Boolean)
        .join("\n");
    case "basic-html":
      return [metadata, `<a href="${source}">Open ${settings.widget.label}</a>`].join("\n");
    case "json":
      return JSON.stringify(
        {
          source,
          theme: settings.theme,
          format,
          widget: settings.widget.id,
          layout: settings.layout ?? settings.widget.defaultLayout,
          displayFields: fields,
          tracks: settings.tracks ?? [],
          accent: settings.accent ?? DEFAULT_EMBED_ACCENT,
          backgroundColor: settings.backgroundColor ?? "#ffffff",
          textColor: settings.textColor ?? "#20232b",
          customCss: settings.customCss ?? "",
          statuses: settings.statuses ?? [],
        },
        null,
        2,
      );
    case "xml":
      return [
        `<!-- ${outputFormatLabel(format)} configuration preview. -->`,
        `<embed widget="${settings.widget.id}" source="${source}" format="${format}">`,
        `  <display-fields>${fields.join(", ")}</display-fields>`,
        "</embed>",
      ].join("\n");
    case "ical": {
      const calendarSource = publicAgendaCalendarUrl(settings);
      return [
        `# ${outputFormatLabel(format)} source preview`,
        "# Published calendar feed for the current agenda revision.",
        calendarSource,
      ].join("\n");
    }
  }
}

export function normalizeEmbedSlug(value: string | undefined, fallback?: string): string | null {
  const candidate = value?.trim() || fallback?.trim() || "";
  return candidate ? candidate : null;
}

export interface EmbedWorkspaceViewProps {
  readonly organizationId: string;
  readonly eventId: string;
  readonly eventSlug: string | null;
  readonly publicOrigin?: string;
  readonly eventName?: string;
  readonly eventVersion?: number | null;
  readonly initialConfigurations?: readonly OrganizerEventEmbedConfiguration[];
  readonly api?: Pick<OrganizerEventsApi, "updateEvent">;
  readonly loading?: boolean;
  readonly errorMessage?: string | null;
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
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.55rem", alignItems: "center" }}>
      <button
        className={styles.secondaryButton}
        type="button"
        onClick={() => void copy()}
        disabled={!value}
      >
        {copied ? "Copied" : `Copy ${label}`}
      </button>
      <span role="status" aria-live="polite" style={subtleTextStyle}>
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
  return (
    <fieldset style={{ ...compactCardStyle, margin: 0 }}>
      <legend
        style={{
          padding: "0 0.35rem",
          color: "var(--admin-ink)",
          fontSize: "0.86rem",
          fontWeight: 800,
        }}
      >
        Public widget
      </legend>
      <div style={{ display: "grid", gap: "0.45rem" }}>
        {EMBED_WIDGETS.map((widget) => (
          <Label
            key={widget.id}
            htmlFor={`embed-widget-${widget.id}`}
            style={{ display: "flex", gap: "0.55rem", alignItems: "flex-start", cursor: "pointer" }}
          >
            <input
              id={`embed-widget-${widget.id}`}
              type="radio"
              name="embed-widget"
              value={widget.id}
              checked={selected === widget.id}
              onChange={() => onChange(widget.id)}
            />
            <span>
              <strong style={{ display: "block", color: "var(--admin-ink)", fontSize: "0.82rem" }}>
                {widget.label}
              </strong>
              <span style={subtleTextStyle}>{widget.description}</span>
            </span>
          </Label>
        ))}
      </div>
    </fieldset>
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
  onDeleteConfiguration,
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
  onDeleteConfiguration: () => void;
  onToggleConfiguration: (id: string, enabled: boolean) => void;
}>) {
  return (
    <section
      style={{ ...compactCardStyle, margin: 0 }}
      aria-labelledby="embed-configurations-heading"
    >
      <div>
        <h2
          id="embed-configurations-heading"
          style={{ margin: 0, color: "var(--admin-ink)", fontSize: "0.92rem" }}
        >
          Widget configurations
        </h2>
        <p style={{ ...subtleTextStyle, marginTop: "0.35rem" }}>
          Save named widget setups to this event so the whole organizer team can use the same
          configuration. Generated links and snippets contain the selected safe options.
        </p>
      </div>

      <label style={fieldStyle} htmlFor="embed-saved-configurations">
        <span style={fieldLabelStyle}>Saved configurations</span>
        <select
          id="embed-saved-configurations"
          aria-label="Saved widget configurations"
          style={inputStyle}
          value={selectedConfigurationId ?? ""}
          onChange={(event) => onSelectConfiguration(event.target.value)}
        >
          <option value="">New widget configuration</option>
          {configurations.map((configuration) => (
            <option key={configuration.id} value={configuration.id}>
              {configuration.name} · {widgetFor(configuration.widgetId).label}
            </option>
          ))}
        </select>
      </label>
      <div
        role="group"
        aria-label="Saved configuration availability"
        style={{ display: "grid", gap: "0.4rem", marginTop: "0.7rem" }}
      >
        {configurations.map((configuration) => (
          <Label
            key={`${configuration.id}-enabled`}
            htmlFor={`embed-configuration-${configuration.id}-enabled`}
            style={{ display: "flex", gap: "0.5rem", alignItems: "center", cursor: "pointer" }}
          >
            <input
              id={`embed-configuration-${configuration.id}-enabled`}
              type="checkbox"
              aria-label={`${configuration.enabled ? "Disable" : "Enable"} ${configuration.name}`}
              checked={configuration.enabled}
              disabled={!persistenceReady}
              onChange={(event) => onToggleConfiguration(configuration.id, event.target.checked)}
            />
            <span style={fieldLabelStyle}>
              {configuration.enabled ? "Enabled" : "Disabled"} · {configuration.name}
            </span>
          </Label>
        ))}
      </div>

      <label style={{ ...fieldStyle, marginTop: "0.7rem" }} htmlFor="embed-configuration-name">
        <span style={fieldLabelStyle}>Configuration name</span>
        <input
          id="embed-configuration-name"
          aria-label="Configuration name"
          style={inputStyle}
          value={configurationName}
          onChange={(event) => onConfigurationName(event.target.value)}
          placeholder="e.g. Main schedule"
          maxLength={120}
        />
      </label>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.55rem", marginTop: "0.7rem" }}>
        <button className={styles.primaryButton} type="button" onClick={onNewConfiguration}>
          New Widget
        </button>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={onSaveConfiguration}
          disabled={!persistenceReady}
        >
          {selectedConfigurationId ? "Update configuration" : "Save configuration"}
        </button>
        <button
          className={styles.dangerButton}
          type="button"
          onClick={onDeleteConfiguration}
          disabled={!persistenceReady || !selectedConfigurationId}
        >
          Delete configuration
        </button>
      </div>

      <p role="status" aria-live="polite" style={{ ...subtleTextStyle, marginTop: "0.55rem" }}>
        {statusMessage ||
          (persistenceReady
            ? "Choose New Widget to start another saved setup. Save creates a configuration; selecting one changes the action to Update configuration."
            : "Loading event configurations…")}
      </p>
    </section>
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
  tracks,
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
  tracks: readonly string[];
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
  const setListValue = (value: string, onChange: (next: readonly string[]) => void): void => {
    onChange(
      value
        .split(",")
        .map((item) => item.trim())
        .filter((item, index, items) => item.length > 0 && items.indexOf(item) === index),
    );
  };

  return (
    <>
      <fieldset style={{ ...compactCardStyle, margin: 0 }}>
        <legend
          style={{
            padding: "0 0.35rem",
            color: "var(--admin-ink)",
            fontSize: "0.86rem",
            fontWeight: 800,
          }}
        >
          Output format
        </legend>
        <div style={{ display: "grid", gap: "0.45rem" }}>
          {EMBED_OUTPUT_FORMATS.map((option) => (
            <Label
              key={option.value}
              htmlFor={`embed-output-format-${option.value}`}
              style={{
                display: "flex",
                gap: "0.55rem",
                alignItems: "flex-start",
                cursor: "pointer",
              }}
            >
              <input
                id={`embed-output-format-${option.value}`}
                type="radio"
                name="embed-output-format"
                value={option.value}
                checked={outputFormat === option.value}
                onChange={() => onOutputFormat(option.value)}
              />
              <span>
                <strong
                  style={{ display: "block", color: "var(--admin-ink)", fontSize: "0.82rem" }}
                >
                  {option.label}
                </strong>
                <span style={subtleTextStyle}>{option.description}</span>
              </span>
            </Label>
          ))}
        </div>
      </fieldset>
      <fieldset style={{ ...compactCardStyle, margin: 0 }}>
        <legend
          style={{
            padding: "0 0.35rem",
            color: "var(--admin-ink)",
            fontSize: "0.86rem",
            fontWeight: 800,
          }}
        >
          Layout
        </legend>
        <label style={fieldStyle} htmlFor="embed-layout">
          <span style={fieldLabelStyle}>Layout</span>
          <select
            id="embed-layout"
            style={inputStyle}
            value={layout}
            onChange={(event) => onLayout(event.target.value as EmbedLayout)}
          >
            {widget.layouts.map((option) => (
              <option key={option} value={option}>
                {option.charAt(0).toUpperCase() + option.slice(1)}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset style={{ ...compactCardStyle, margin: 0 }}>
        <legend
          style={{
            padding: "0 0.35rem",
            color: "var(--admin-ink)",
            fontSize: "0.86rem",
            fontWeight: 800,
          }}
        >
          Appearance and colors
        </legend>
        <label style={fieldStyle} htmlFor="embed-theme">
          <span style={fieldLabelStyle}>Theme</span>
          <select
            id="embed-theme"
            style={inputStyle}
            value={theme}
            onChange={(event) => onTheme(event.target.value as EmbedTheme)}
          >
            {EMBED_THEMES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ ...fieldStyle, marginTop: "0.7rem" }} htmlFor="embed-accent">
          <span style={fieldLabelStyle}>Accent color</span>
          <input
            id="embed-accent"
            aria-label="Accent color"
            type="color"
            value={accent}
            onChange={(event) => onAccent(event.target.value)}
            style={{ ...inputStyle, width: "5rem", padding: "0.2rem" }}
          />
        </label>
        <label style={{ ...fieldStyle, marginTop: "0.7rem" }} htmlFor="embed-background-color">
          <span style={fieldLabelStyle}>Background color</span>
          <input
            id="embed-background-color"
            aria-label="Background color"
            type="color"
            value={backgroundColor}
            onChange={(event) => onBackgroundColor(event.target.value)}
            style={{ ...inputStyle, width: "5rem", padding: "0.2rem" }}
          />
        </label>
        <label style={{ ...fieldStyle, marginTop: "0.7rem" }} htmlFor="embed-text-color">
          <span style={fieldLabelStyle}>Text color</span>
          <input
            id="embed-text-color"
            aria-label="Text color"
            type="color"
            value={textColor}
            onChange={(event) => onTextColor(event.target.value)}
            style={{ ...inputStyle, width: "5rem", padding: "0.2rem" }}
          />
        </label>
        <label style={{ ...fieldStyle, marginTop: "0.7rem" }} htmlFor="embed-custom-css">
          <span style={fieldLabelStyle}>Custom CSS</span>
          <textarea
            id="embed-custom-css"
            aria-label="Custom CSS"
            value={customCss}
            onChange={(event) => onCustomCss(event.target.value)}
            placeholder="Optional CSS for your host page"
            rows={4}
            style={{ ...inputStyle, minHeight: "6rem", resize: "vertical" }}
          />
        </label>
        <p style={{ ...subtleTextStyle, marginTop: "0.7rem" }}>
          Safe theme, layout, output, field, filter, and color choices are encoded in copied live
          URLs. Custom CSS stays in the host markup and is never sent as executable URL content.
        </p>
        <p style={{ ...subtleTextStyle, marginTop: "0.4rem" }}>
          {widget.label} uses its documented public presentation.
        </p>
      </fieldset>

      <fieldset style={{ ...compactCardStyle, margin: 0 }}>
        <legend
          style={{
            padding: "0 0.35rem",
            color: "var(--admin-ink)",
            fontSize: "0.86rem",
            fontWeight: 800,
          }}
        >
          Display fields
        </legend>
        <p style={subtleTextStyle}>
          Required fields stay enabled; optional fields are included in the copied live URL.
        </p>
        <div style={{ display: "grid", gap: "0.45rem" }}>
          {EMBED_DISPLAY_FIELDS.map((field) => {
            const checked = field.required || displayFields.includes(field.id);
            return (
              <Label
                key={field.id}
                htmlFor={`embed-field-${field.id}`}
                style={{
                  display: "flex",
                  gap: "0.55rem",
                  alignItems: "center",
                  cursor: field.required ? "not-allowed" : "pointer",
                  opacity: field.required ? 0.7 : 1,
                }}
              >
                <input
                  id={`embed-field-${field.id}`}
                  type="checkbox"
                  name={`embed-field-${field.id}`}
                  value={field.id}
                  checked={checked}
                  disabled={field.required}
                  onChange={(event) => {
                    const next = displayFields.filter((value) => value !== field.id);
                    onDisplayFields(event.target.checked ? [...next, field.id] : next);
                  }}
                />
                <span style={fieldLabelStyle}>
                  {field.label}
                  {field.required ? " (required)" : ""}
                </span>
              </Label>
            );
          })}
        </div>
      </fieldset>

      <fieldset style={{ ...compactCardStyle, margin: 0 }}>
        <legend
          style={{
            padding: "0 0.35rem",
            color: "var(--admin-ink)",
            fontSize: "0.86rem",
            fontWeight: 800,
          }}
        >
          Content filters
        </legend>
        <label style={fieldStyle} htmlFor="embed-track-filter">
          <span style={fieldLabelStyle}>Track filters</span>
          <input
            id="embed-track-filter"
            aria-label="Track filters"
            style={inputStyle}
            value={tracks.join(", ")}
            placeholder="All tracks"
            onChange={(event) => setListValue(event.target.value, onTracks)}
          />
        </label>
        <label style={{ ...fieldStyle, marginTop: "0.7rem" }} htmlFor="embed-status-filter">
          <span style={fieldLabelStyle}>Session status filters</span>
          <input
            id="embed-status-filter"
            aria-label="Session status filters"
            style={inputStyle}
            value={statuses.join(", ")}
            placeholder="Approved"
            onChange={(event) => setListValue(event.target.value, onStatuses)}
          />
        </label>
        <p style={{ ...subtleTextStyle, marginTop: "0.7rem" }}>
          Track and status filters are included in copied live URLs and remain within the public
          event projection boundary.
        </p>
      </fieldset>

      <fieldset style={{ ...compactCardStyle, margin: 0 }}>
        <legend
          style={{
            padding: "0 0.35rem",
            color: "var(--admin-ink)",
            fontSize: "0.86rem",
            fontWeight: 800,
          }}
        >
          Cache and preview
        </legend>
        <button className={styles.secondaryButton} type="button" onClick={onRefresh}>
          Refresh cache
        </button>
        <p role="status" aria-live="polite" style={{ ...subtleTextStyle, marginTop: "0.55rem" }}>
          {cacheRefreshMessage ||
            "Manual cache refresh is available for this preview; no remote cache mutation is claimed."}
        </p>
      </fieldset>
    </>
  );
}

function CodePanel({ settings }: Readonly<{ settings: EmbedSnippetSettings }>) {
  const iframe = iframeSnippet(settings);
  const script = scriptSnippet(settings);
  const preview = embedCodePreview(settings);
  const format = outputFormatLabel(settings.outputFormat ?? "styled-html");
  const codeAreaStyle: CSSProperties = {
    ...inputStyle,
    minHeight: "10rem",
    resize: "vertical",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: "0.72rem",
    lineHeight: 1.45,
  };

  return (
    <section className={styles.panel} aria-labelledby="embed-code-heading">
      <header className={styles.panelHeader}>
        <div className={styles.panelHeading}>
          <p className={styles.panelEyebrow}>Distribution</p>
          <h2 id="embed-code-heading" className={styles.panelTitle}>
            Embed code
          </h2>
        </div>
      </header>
      <div className={styles.panelContent} style={{ display: "grid", gap: "1rem" }}>
        <div style={compactCardStyle}>
          <div>
            <h3 style={{ margin: 0, fontSize: "0.92rem" }}>Live public URL</h3>
            <p style={{ ...subtleTextStyle, marginTop: "0.25rem" }}>
              Share this URL when a host cannot accept embed markup. It always reads the current
              published event projection.
            </p>
          </div>
          <input
            aria-label="Live public embed URL"
            readOnly
            value={publicEmbedUrl(settings)}
            style={inputStyle}
          />
          <CopyButton label="live URL" value={publicEmbedUrl(settings)} />
        </div>

        <div style={compactCardStyle}>
          <div>
            <h3 style={{ margin: 0, fontSize: "0.92rem" }}>Code preview · {format}</h3>
            <p style={{ ...subtleTextStyle, marginTop: "0.25rem" }}>
              Preview uses the live published event projection URL with the selected safe options.
              Custom CSS is kept out of executable URLs and must be applied by the host page.
            </p>
          </div>
          <textarea
            aria-label="Embed code preview"
            readOnly
            value={preview}
            rows={10}
            style={codeAreaStyle}
          />
          <CopyButton label="code preview" value={preview} />
        </div>

        <div style={compactCardStyle}>
          <div>
            <h3 style={{ margin: 0, fontSize: "0.92rem" }}>Iframe snippet</h3>
            <p style={{ ...subtleTextStyle, marginTop: "0.25rem" }}>
              Paste this safe, responsive iframe into a page that accepts HTML.
            </p>
          </div>
          <textarea
            aria-label="Iframe embed snippet"
            readOnly
            value={iframe}
            rows={7}
            style={codeAreaStyle}
          />
          <CopyButton label="iframe code" value={iframe} />
        </div>

        {settings.widget.scriptView ? (
          <div style={compactCardStyle}>
            <div>
              <h3 style={{ margin: 0, fontSize: "0.92rem" }}>Script snippet</h3>
              <p style={{ ...subtleTextStyle, marginTop: "0.25rem" }}>
                Use the fixed Open Sessionboard loader when your host does not allow inline iframe
                markup.
              </p>
            </div>
            <textarea
              aria-label="Script embed snippet"
              readOnly
              value={script}
              rows={7}
              style={codeAreaStyle}
            />
            <CopyButton label="script code" value={script} />
          </div>
        ) : (
          <div
            role="note"
            style={{
              ...compactCardStyle,
              borderColor: "#f2d7a0",
              background: "var(--admin-warning-soft)",
            }}
          >
            <strong style={{ color: "var(--admin-ink)", fontSize: "0.82rem" }}>
              Iframe mode is the supported option for this widget.
            </strong>
            <p style={subtleTextStyle}>
              The fixed script loader currently supports the Agenda and Speaker Gallery widgets. Use
              the generated iframe for this view instead of adding an arbitrary script source.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function createEmbedConfigurationId(): string {
  const browserCrypto = typeof globalThis.crypto !== "undefined" ? globalThis.crypto : undefined;
  if (browserCrypto?.randomUUID) return browserCrypto.randomUUID();
  return `embed-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function eventEmbedConfigurations(
  configurations: readonly OrganizerEventEmbedConfiguration[] | undefined,
): readonly EmbedConfiguration[] {
  if (!configurations) return [];
  return configurations
    .map((configuration) => normalizeEmbedConfiguration(configuration))
    .filter((configuration): configuration is EmbedConfiguration => configuration !== null);
}

function builderConfiguration(
  id: string,
  name: string,
  values: Readonly<{
    widgetId: EmbedWidgetId;
    enabled: boolean;
    theme: EmbedTheme;
    outputFormat: EmbedOutputFormat;
    layout: EmbedLayout;
    accent: EmbedAccent;
    backgroundColor: string;
    textColor: string;
    customCss: string;
    displayFields: readonly EmbedFieldId[];
    tracks: readonly string[];
    statuses: readonly string[];
  }>,
): EmbedConfiguration {
  return {
    id,
    name,
    widgetId: values.widgetId,
    enabled: values.enabled,
    theme: values.theme,
    outputFormat: values.outputFormat,
    layout: values.layout,
    accent: values.accent,
    backgroundColor: values.backgroundColor,
    textColor: values.textColor,
    customCss: values.customCss,
    displayFields: values.displayFields,
    tracks: values.tracks,
    statuses: values.statuses,
  };
}
export function EmbedWorkspaceView({
  organizationId,
  eventId,
  eventSlug,
  publicOrigin,
  eventName,
  eventVersion,
  initialConfigurations,
  api,
  loading = false,
  errorMessage = null,
}: EmbedWorkspaceViewProps) {
  const serverConfigurationList = useMemo<readonly EmbedConfiguration[] | null>(
    () =>
      initialConfigurations === undefined
        ? null
        : eventEmbedConfigurations(initialConfigurations),
    [initialConfigurations],
  );
  const initialServerConfigurations = serverConfigurationList ?? [];
  const initialConfiguration =
    initialServerConfigurations.find((configuration) => configuration.enabled) ??
    initialServerConfigurations[0];
  const initialWidget = widgetFor(initialConfiguration?.widgetId ?? "sessions");
  const initialLayout =
    initialConfiguration && initialWidget.layouts.includes(initialConfiguration.layout)
      ? initialConfiguration.layout
      : initialWidget.defaultLayout;
  const [widgetId, setWidgetId] = useState<EmbedWidgetId>(
    initialConfiguration?.widgetId ?? "sessions",
  );
  const [theme, setTheme] = useState<EmbedTheme>(initialConfiguration?.theme ?? "auto");
  const [outputFormat, setOutputFormat] = useState<EmbedOutputFormat>(
    initialConfiguration?.outputFormat ?? "styled-html",
  );
  const [layout, setLayout] = useState<EmbedLayout>(initialLayout);
  const [accent, setAccent] = useState<EmbedAccent>(
    initialConfiguration?.accent ?? DEFAULT_EMBED_ACCENT,
  );
  const [backgroundColor, setBackgroundColor] = useState(
    initialConfiguration?.backgroundColor ?? "#ffffff",
  );
  const [textColor, setTextColor] = useState(initialConfiguration?.textColor ?? "#20232b");
  const [customCss, setCustomCss] = useState(initialConfiguration?.customCss ?? "");
  const [displayFields, setDisplayFields] = useState<readonly EmbedFieldId[]>(
    initialConfiguration?.displayFields ?? DEFAULT_EMBED_DISPLAY_FIELDS,
  );
  const [tracks, setTracks] = useState<readonly string[]>(initialConfiguration?.tracks ?? []);
  const [statuses, setStatuses] = useState<readonly string[]>(
    initialConfiguration?.statuses ?? ["Approved"],
  );
  const [cacheRefreshMessage, setCacheRefreshMessage] = useState("");
  const [previewNonce, setPreviewNonce] = useState(0);
  const [configurations, setConfigurations] = useState<readonly EmbedConfiguration[]>(
    initialServerConfigurations,
  );
  const [selectedConfigurationId, setSelectedConfigurationId] = useState<string | null>(
    initialConfiguration?.id ?? null,
  );
  const [configurationName, setConfigurationName] = useState(initialConfiguration?.name ?? "");
  const [configurationStatusMessage, setConfigurationStatusMessage] = useState("");
  const [eventVersionState, setEventVersionState] = useState<number | null>(eventVersion ?? null);
  const [persistenceBusy, setPersistenceBusy] = useState(false);

  const resetBuilder = useCallback((message = "") => {
    setSelectedConfigurationId(null);
    setConfigurationName("");
    setWidgetId("sessions");
    setTheme("auto");
    setOutputFormat("styled-html");
    setLayout(widgetFor("sessions").defaultLayout);
    setAccent(DEFAULT_EMBED_ACCENT);
    setBackgroundColor("#ffffff");
    setTextColor("#20232b");
    setCustomCss("");
    setDisplayFields(DEFAULT_EMBED_DISPLAY_FIELDS);
    setTracks([]);
    setStatuses(["Approved"]);
    setConfigurationStatusMessage(message);
  }, []);

  const applyConfiguration = useCallback((configuration: EmbedConfiguration) => {
    const configurationWidget = widgetFor(configuration.widgetId);
    setSelectedConfigurationId(configuration.id);
    setConfigurationName(configuration.name);
    setWidgetId(configuration.widgetId);
    setTheme(configuration.theme);
    setOutputFormat(configuration.outputFormat);
    setLayout(
      configurationWidget.layouts.includes(configuration.layout)
        ? configuration.layout
        : configurationWidget.defaultLayout,
    );
    setAccent(configuration.accent);
    setBackgroundColor(configuration.backgroundColor);
    setTextColor(configuration.textColor);
    setCustomCss(configuration.customCss);
    setDisplayFields(configuration.displayFields);
    setTracks(configuration.tracks);
    setStatuses(configuration.statuses);
  }, []);


  useEffect(() => {
    if (serverConfigurationList === null) return;
    setConfigurations(serverConfigurationList);
    setEventVersionState(eventVersion ?? null);
    const activeConfiguration =
      serverConfigurationList.find((configuration) => configuration.enabled) ??
      serverConfigurationList[0];
    if (activeConfiguration) {
      applyConfiguration(activeConfiguration);
      setConfigurationStatusMessage(`Loaded "${activeConfiguration.name}" from the event.`);
    } else {
      resetBuilder();
    }
  }, [applyConfiguration, eventVersion, resetBuilder, serverConfigurationList]);

  const persistConfigurations = useCallback(
    async (nextConfigurations: readonly EmbedConfiguration[]): Promise<boolean> => {
      if (!api || eventVersionState === null) {
        setConfigurationStatusMessage("Event configuration transport is unavailable.");
        return false;
      }

      setPersistenceBusy(true);
      setConfigurationStatusMessage("Saving event configuration…");
      try {
        const updatedEvent = await api.updateEvent(eventId, {
          expectedVersion: eventVersionState,
          embedConfigurations: nextConfigurations,
        });
        if (
          updatedEvent.organizationId !== organizationId ||
          updatedEvent.id !== eventId ||
          updatedEvent.embedConfigurations === undefined
        ) {
          throw new Error("The event configuration response does not match this event context.");
        }
        setConfigurations(eventEmbedConfigurations(updatedEvent.embedConfigurations));
        setEventVersionState(updatedEvent.version);
        return true;
      } catch (error) {
        setConfigurationStatusMessage(messageFrom(error));
        return false;
      } finally {
        setPersistenceBusy(false);
      }
    },
    [api, eventId, eventVersionState, organizationId],
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
      setConfigurationStatusMessage(`Loaded "${configuration.name}".`);
    },
    [applyConfiguration, configurations, resetBuilder, startNewConfiguration],
  );

  const saveConfiguration = useCallback(async () => {
    const name = configurationName.trim();
    if (!name) {
      setConfigurationStatusMessage("Enter a configuration name before saving.");
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
      tracks,
      statuses,
    });
    const nextConfigurations = existing
      ? configurations.map((configuration) =>
          configuration.id === existing.id ? nextConfiguration : configuration,
        )
      : [...configurations, nextConfiguration];

    if (!(await persistConfigurations(nextConfigurations))) return;
    setSelectedConfigurationId(configurationId);
    setConfigurationName(name);
    setConfigurationStatusMessage(
      existing ? `Updated "${name}" successfully.` : `Saved "${name}" successfully.`,
    );
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
    tracks,
    widgetId,
  ]);

  const deleteConfiguration = useCallback(async () => {
    if (!selectedConfigurationId) {
      setConfigurationStatusMessage("Select a saved configuration before deleting.");
      return;
    }
    const configuration = configurations.find(
      (candidate) => candidate.id === selectedConfigurationId,
    );
    if (!configuration) {
      resetBuilder("That saved configuration is no longer available.");
      return;
    }
    const nextConfigurations = configurations.filter(
      (candidate) => candidate.id !== selectedConfigurationId,
    );
    if (!(await persistConfigurations(nextConfigurations))) return;
    resetBuilder(`Deleted "${configuration.name}" successfully.`);
  }, [configurations, persistConfigurations, resetBuilder, selectedConfigurationId]);

  const toggleConfiguration = useCallback(
    async (id: string, enabled: boolean) => {
      const configuration = configurations.find((candidate) => candidate.id === id);
      if (!configuration) return;
      const nextConfigurations = configurations.map((candidate) =>
        candidate.id === id ? { ...candidate, enabled } : candidate,
      );
      if (!(await persistConfigurations(nextConfigurations))) return;
      setConfigurationStatusMessage(
        `${enabled ? "Enabled" : "Disabled"} "${configuration.name}" successfully.`,
      );
    },
    [configurations, persistConfigurations],
  );

  const changeWidget = useCallback((nextWidgetId: EmbedWidgetId) => {
    setWidgetId(nextWidgetId);
    setLayout(widgetFor(nextWidgetId).defaultLayout);
  }, []);

  const widget = widgetFor(widgetId);
  const origin = configuredPublicOrigin(publicOrigin);
  const normalizedSlug = normalizeEmbedSlug(eventSlug ?? undefined);
  const settings = useMemo<EmbedSnippetSettings | null>(() => {
    if (!normalizedSlug || !origin) return null;
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
      tracks,
      statuses,
    };
  }, [
    accent,
    backgroundColor,
    customCss,
    displayFields,
    layout,
    normalizedSlug,
    origin,
    outputFormat,
    statuses,
    textColor,
    theme,
    tracks,
    widget,
  ]);
  const previewUrl = settings ? publicEmbedUrl(settings) : "";
  const refreshPreview = () => {
    setPreviewNonce((value) => value + 1);
    setCacheRefreshMessage(
      `Local preview refreshed at ${new Date().toLocaleTimeString()}. No remote cache was changed.`,
    );
  };
  const persistenceReady = api !== undefined && eventVersionState !== null && !persistenceBusy;

  return (
    <main id="embeds-content" tabIndex={-1}>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeaderCopy}>
          <p className={styles.eyebrow}>Public distribution</p>
          <h1 className={styles.pageTitle}>Embed widgets</h1>
          <p className={styles.pageDescription}>
            Generate an accessible public widget for your event without exposing organizer-only data
            or adding custom JavaScript.
          </p>
          <p style={{ ...subtleTextStyle, marginTop: "0.7rem" }}>
            Organization {organizationId} · Event {eventId}
            {eventName ? ` · ${eventName}` : ""}
          </p>
        </div>
      </header>

      <div className={styles.callout} style={{ marginBottom: "1.25rem" }}>
        <span className={styles.calloutIcon} aria-hidden="true">
          ↗
        </span>
        <div>
          <strong>Public and self-updating</strong>
          <p>
            These widgets read the current published event projection and refresh roughly every 60
            minutes. The manual refresh control updates this local preview only because no remote
            cache mutation endpoint is available. Draft sessions, reviewer notes, speaker contact
            details, private files, and other organizer-only fields never cross this boundary.
          </p>
        </div>
      </div>

      {loading ? (
        <div role="status" className={styles.callout}>
          <div>
            <strong>Loading event slug</strong>
            <p>
              Embed code is generated only after the organizer event record confirms the public
              slug.
            </p>
          </div>
        </div>
      ) : null}
      {errorMessage ? (
        <div
          role="alert"
          className={styles.callout}
          style={{
            borderColor: "#f2c9c7",
            background: "var(--admin-danger-soft)",
            marginBottom: "1.25rem",
          }}
        >
          <div>
            <strong>Embed generation unavailable</strong>
            <p>{errorMessage}</p>
          </div>
        </div>
      ) : null}

      {!loading && !errorMessage && !normalizedSlug ? (
        <div
          role="alert"
          className={styles.callout}
          style={{
            borderColor: "#f2c9c7",
            background: "var(--admin-danger-soft)",
            marginBottom: "1.25rem",
          }}
        >
          <div>
            <strong>No public event slug</strong>
            <p>
              Publish or configure an event slug before generating public embed code. The event ID
              is not used as a guessed public URL.
            </p>
          </div>
        </div>
      ) : null}
      {!loading && !errorMessage && normalizedSlug && !origin ? (
        <div
          role="alert"
          className={styles.callout}
          style={{
            borderColor: "#f2c9c7",
            background: "var(--admin-danger-soft)",
            marginBottom: "1.25rem",
          }}
        >
          <div>
            <strong>Public app URL is not configured</strong>
            <p>Set NEXT_PUBLIC_APP_URL to the approved web origin before copying embed code.</p>
          </div>
        </div>
      ) : null}

      <div
        className={styles.dashboardGrid}
        style={{ gridTemplateColumns: "minmax(14rem, 0.38fr) minmax(0, 1fr)" }}
      >
        <div style={{ display: "grid", gap: "1rem", alignSelf: "start" }}>
          <EmbedConfigurationLibrary
            configurations={configurations}
            selectedConfigurationId={selectedConfigurationId}
            configurationName={configurationName}
            statusMessage={configurationStatusMessage}
            persistenceReady={persistenceReady}
            onConfigurationName={setConfigurationName}
            onSelectConfiguration={selectConfiguration}
            onNewConfiguration={startNewConfiguration}
            onSaveConfiguration={saveConfiguration}
            onDeleteConfiguration={deleteConfiguration}
            onToggleConfiguration={toggleConfiguration}
          />
          <WidgetChooser selected={widgetId} onChange={changeWidget} />
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
            tracks={tracks}
            statuses={statuses}
            cacheRefreshMessage={cacheRefreshMessage}
            onTheme={setTheme}
            onOutputFormat={setOutputFormat}
            onAccent={setAccent}
            onLayout={setLayout}
            onBackgroundColor={setBackgroundColor}
            onTextColor={setTextColor}
            onCustomCss={setCustomCss}
            onDisplayFields={setDisplayFields}
            onTracks={setTracks}
            onStatuses={setStatuses}
            onRefresh={refreshPreview}
          />
        </div>

        <div style={{ display: "grid", gap: "1.5rem" }}>
          <section className={styles.panel} aria-labelledby="embed-preview-heading">
            <header className={styles.panelHeader}>
              <div className={styles.panelHeading}>
                <p className={styles.panelEyebrow}>Preview</p>
                <h2 id="embed-preview-heading" className={styles.panelTitle}>
                  Live public preview
                </h2>
              </div>
              {settings ? (
                <a className={styles.panelLink} href={previewUrl} target="_blank" rel="noreferrer">
                  Open public view ↗
                </a>
              ) : null}
            </header>
            <div className={styles.panelContent}>
              {settings ? (
                <iframe
                  key={`${previewUrl}-${previewNonce}`}
                  src={previewUrl}
                  title={`Live preview: ${widget.label}`}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  sandbox={iframeSandbox(widget)}
                  style={{
                    display: "block",
                    width: "100%",
                    minHeight: widget.minHeight,
                    border: "1px solid var(--admin-border)",
                    borderRadius: "var(--admin-radius-sm)",
                    background: "var(--admin-surface)",
                  }}
                />
              ) : (
                <p style={subtleTextStyle}>
                  A preview appears after a valid public event slug and approved public app URL are
                  available.
                </p>
              )}
            </div>
          </section>
          {settings ? <CodePanel settings={settings} /> : null}
        </div>
      </div>
    </main>
  );
}

export interface EmbedWorkspaceProps {
  readonly organizationId: string;
  readonly eventId: string;
  readonly eventSlug?: string;
  readonly initialEvent?: Pick<OrganizerEventRecord, "id" | "organizationId" | "slug" | "name">;
  readonly api?: Pick<OrganizerEventsApi, "getEvent" | "updateEvent">;
  readonly publicOrigin?: string;
}

type EmbedLoadState =
  | { readonly status: "loading" }
  | {
      readonly status: "loaded";
      readonly event: OrganizerEventRecord;
      readonly eventSlug: string;
      readonly eventName: string;
    }
  | { readonly status: "error"; readonly message: string };

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : "The organizer event could not be loaded.";
}

export function EmbedWorkspace({
  organizationId,
  eventId,
  eventSlug,
  initialEvent,
  api: providedApi,
  publicOrigin,
}: EmbedWorkspaceProps) {
  const suppliedSlug = normalizeEmbedSlug(initialEvent?.slug ?? eventSlug);
  const [state, setState] = useState<EmbedLoadState>({ status: "loading" });
  const [loadedApi, setLoadedApi] = useState<Pick<
    OrganizerEventsApi,
    "getEvent" | "updateEvent"
  > | null>(providedApi ?? null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!organizationId.trim() || !eventId.trim()) {
        setState({ status: "error", message: "An organization and event context are required." });
        return;
      }
      let api = providedApi;
      if (!api) {
        try {
          api = createOrganizerEventsApi("", organizationId);
        } catch (error) {
          setState({ status: "error", message: messageFrom(error) });
          return;
        }
      }
      setLoadedApi(api);
      setState({ status: "loading" });
      try {
        const event = await api.getEvent(eventId, signal);
        if (signal?.aborted) return;
        if (event.organizationId !== organizationId || event.id !== eventId) {
          throw new Error(
            "The organizer event response does not match this organization and event context.",
          );
        }
        const resolvedSlug = normalizeEmbedSlug(event.slug, suppliedSlug ?? undefined);
        if (!resolvedSlug) throw new Error("The organizer event has no public slug.");
        setState({ status: "loaded", event, eventSlug: resolvedSlug, eventName: event.name });
      } catch (error) {
        if (signal?.aborted) return;
        setState({ status: "error", message: messageFrom(error) });
      }
    },
    [eventId, organizationId, providedApi, suppliedSlug],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return (
    <EmbedWorkspaceView
      organizationId={organizationId}
      eventId={eventId}
      eventSlug={state.status === "loaded" ? state.eventSlug : null}
      eventName={state.status === "loaded" ? state.eventName : ""}
      eventVersion={state.status === "loaded" ? state.event.version : null}
      {...(state.status === "loaded"
        ? { initialConfigurations: state.event.embedConfigurations ?? [] }
        : {})}
      {...(loadedApi === null ? {} : { api: loadedApi })}
      {...(publicOrigin === undefined ? {} : { publicOrigin })}
      loading={state.status === "loading"}
      errorMessage={state.status === "error" ? state.message : null}
    />
  );
}
