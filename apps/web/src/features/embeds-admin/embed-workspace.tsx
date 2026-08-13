"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import styles from "@/features/admin/admin-shell.module.css";
import {
  createOrganizerEventsApi,
  type OrganizerEventEmbedConfiguration,
  type OrganizerEventRecord,
  type OrganizerEventsApi,
} from "@/features/admin/organizer-overview";
import workspaceStyles from "./embed-workspace.module.css";

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
const EMPTY_EMBED_CONFIGURATIONS: readonly EmbedConfiguration[] = [];
const EMPTY_ORGANIZER_EVENT_EMBED_CONFIGURATIONS: readonly OrganizerEventEmbedConfiguration[] = [];

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
function eventEmbedConfigurations(
  configurations: readonly OrganizerEventEmbedConfiguration[] | undefined,
): readonly EmbedConfiguration[] {
  if (!configurations?.length) return EMPTY_EMBED_CONFIGURATIONS;
  const normalized = configurations
    .map((configuration) => normalizeEmbedConfiguration(configuration))
    .filter((configuration): configuration is EmbedConfiguration => configuration !== null);
  return normalized.length > 0 ? normalized : EMPTY_EMBED_CONFIGURATIONS;
}

function createEmbedConfigurationId(): string {
  const browserCrypto = typeof globalThis.crypto !== "undefined" ? globalThis.crypto : undefined;
  if (browserCrypto?.randomUUID) return browserCrypto.randomUUID();
  return `embed-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
  return widget.id === "agenda"
    ? "allow-downloads allow-same-origin allow-scripts"
    : "allow-same-origin allow-scripts";
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

export function normalizeEmbedSlug(value: string | null | undefined): string | null {
  const candidate = value?.trim() || "";
  return candidate ? candidate : null;
}
export type EmbedExpectedPublishedRevision = Readonly<{
  readonly id: string;
  readonly number: number;
}>;

export interface EmbedPublishedRevision extends EmbedExpectedPublishedRevision {
  readonly publishedAt: string;
}

type EmbedPublicationProjection = Readonly<{
  readonly event: Readonly<{ readonly slug: string }>;
  readonly revision: EmbedPublishedRevision;
}> &
  Record<string, unknown>;

export type EmbedPublicationFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface VerifyEmbedPublicationOptions {
  readonly eventSlug: string;
  readonly expectedPublishedRevision?: EmbedExpectedPublishedRevision | null;
  readonly fetcher?: EmbedPublicationFetcher;
}

export interface VerifiedEmbedPublication {
  readonly agenda: EmbedPublicationProjection;
  readonly speakers: EmbedPublicationProjection;
  readonly revision: EmbedPublishedRevision;
}

function projectionVerificationError(projection: "agenda" | "speakers", message: string): Error {
  return new Error(`The published ${projection} projection could not be verified: ${message}`);
}

async function parseEmbedProjection(
  response: Response,
  projection: "agenda" | "speakers",
): Promise<EmbedPublicationProjection> {
  if (!response.ok) {
    throw projectionVerificationError(projection, `the server returned HTTP ${response.status}.`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw projectionVerificationError(projection, "the response was not valid JSON.");
  }

  if (!isRecord(payload) || !isRecord(payload.data)) {
    throw projectionVerificationError(projection, "the response did not contain a data envelope.");
  }

  const data = payload.data;
  if (!isRecord(data.event) || !isRecord(data.revision)) {
    throw projectionVerificationError(
      projection,
      "the response omitted event or revision identity.",
    );
  }

  const eventSlug = nonEmptyString(data.event.slug);
  const revisionId = nonEmptyString(data.revision.id);
  const revisionNumber = data.revision.number;
  const publishedAt = nonEmptyString(data.revision.publishedAt);

  if (!eventSlug || !revisionId || !publishedAt) {
    throw projectionVerificationError(
      projection,
      "the event slug or revision identity is invalid.",
    );
  }
  if (typeof revisionNumber !== "number" || !Number.isInteger(revisionNumber)) {
    throw projectionVerificationError(projection, "the published revision number is invalid.");
  }

  return {
    ...data,
    event: { ...data.event, slug: eventSlug },
    revision: {
      ...data.revision,
      id: revisionId,
      number: revisionNumber,
      publishedAt,
    },
  };
}

export async function verifyEmbedPublication({
  eventSlug,
  expectedPublishedRevision = null,
  fetcher = fetch,
}: VerifyEmbedPublicationOptions): Promise<VerifiedEmbedPublication> {
  const expectedSlug = eventSlug.trim();
  if (!expectedSlug) {
    throw new Error("A public event slug is required before the preview can be refreshed.");
  }

  const encodedSlug = encodeURIComponent(expectedSlug);
  const requestInit: RequestInit = {
    cache: "no-store",
    credentials: "same-origin",
  };

  let agendaResponse: Response;
  let speakersResponse: Response;
  try {
    [agendaResponse, speakersResponse] = await Promise.all([
      fetcher(`/api/public/events/${encodedSlug}/agenda.json`, requestInit),
      fetcher(`/api/public/events/${encodedSlug}/speakers`, requestInit),
    ]);
  } catch (error) {
    const detail = error instanceof Error && error.message ? ` ${error.message}` : "";
    throw new Error(`The published agenda and speaker projections could not be reached.${detail}`);
  }

  const [agenda, speakers] = await Promise.all([
    parseEmbedProjection(agendaResponse, "agenda"),
    parseEmbedProjection(speakersResponse, "speakers"),
  ]);

  if (agenda.event.slug !== expectedSlug || speakers.event.slug !== expectedSlug) {
    throw new Error("The published projection event slug does not match this embed event.");
  }
  if (agenda.event.slug !== speakers.event.slug) {
    throw new Error("The published agenda and speaker event slugs do not match.");
  }

  if (
    agenda.revision.id !== speakers.revision.id ||
    agenda.revision.number !== speakers.revision.number ||
    agenda.revision.publishedAt !== speakers.revision.publishedAt
  ) {
    throw new Error("The published agenda and speaker projections are from different revisions.");
  }

  if (
    expectedPublishedRevision !== null &&
    (agenda.revision.id !== expectedPublishedRevision.id ||
      agenda.revision.number !== expectedPublishedRevision.number)
  ) {
    throw new Error("The published projections do not match the expected published revision.");
  }

  return { agenda, speakers, revision: agenda.revision };
}

function workspaceScopeKey(organizationId: string, eventId: string): string {
  return `${organizationId}\u0000${eventId}`;
}

export interface EmbedPublicRevision {
  readonly id: string;
  readonly number: number;
  readonly publishedAt: string;
}

export type EmbedPreviewAvailability = "checking" | "available" | "unavailable" | "failed";

export interface EmbedPublicationMetadata {
  readonly agendaDraftVersion: number | null;
  readonly publicRevision: EmbedPublicRevision | null;
  readonly previewAvailability: EmbedPreviewAvailability;
  readonly message?: string;
}

export interface EmbedWorkspaceViewProps {
  readonly organizationId: string;
  readonly eventId: string;
  readonly eventSlug: string | null;
  readonly publicOrigin?: string;
  readonly eventName?: string;
  readonly eventVersion?: number | null;
  readonly expectedPublishedRevision?: EmbedExpectedPublishedRevision | null;
  readonly initialConfigurations?: readonly OrganizerEventEmbedConfiguration[];
  readonly api?: Pick<OrganizerEventsApi, "updateEvent">;
  readonly publication?: EmbedPublicationMetadata;
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
  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a public widget</CardTitle>
        <CardDescription>
          Pick the public projection your visitors should see. This choice is saved with the
          configuration, not in browser-only state.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ToggleGroup
          type="single"
          value={selected}
          onValueChange={(value) => {
            if (value) onChange(value as EmbedWidgetId);
          }}
          orientation="vertical"
          className={workspaceStyles.optionGrid}
          aria-label="Public widget"
        >
          {EMBED_WIDGETS.map((widget) => (
            <ToggleGroupItem
              key={widget.id}
              value={widget.id}
              className={workspaceStyles.option}
              aria-label={widget.label}
            >
              <span className={workspaceStyles.optionCopy}>
                <strong>{widget.label}</strong>
                <span>{widget.description}</span>
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardContent>
    </Card>
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
    <Card>
      <CardHeader>
        <div className={workspaceStyles.cardHeadingRow}>
          <div>
            <CardTitle>Choose or save a configuration</CardTitle>
            <CardDescription>
              Saved configurations belong to this event and are persisted through the organizer API.
            </CardDescription>
          </div>
          <Badge variant={persistenceReady ? "outline" : "secondary"}>
            {persistenceReady ? "Ready to save" : "Read-only"}
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
          <p className={workspaceStyles.emptyNote}>No saved configurations yet.</p>
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
          <Button
            variant="destructive"
            type="button"
            onClick={onDeleteConfiguration}
            disabled={!persistenceReady || !selectedConfigurationId}
          >
            Delete configuration
          </Button>
        </div>

        <p role="status" aria-live="polite" className={workspaceStyles.statusMessage}>
          {statusMessage ||
            (persistenceReady
              ? "Save creates a configuration on the event. Select one to update or delete it."
              : "Loading event configurations…")}
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
  tracks,
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
  tracks: readonly string[];
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
  const [advancedOpen, setAdvancedOpen] = useState(true);
  const setListValue = (value: string, onChange: (next: readonly string[]) => void): void => {
    onChange(
      value
        .split(",")
        .map((item) => item.trim())
        .filter((item, index, items) => item.length > 0 && items.indexOf(item) === index),
    );
  };

  return (
    <div className={workspaceStyles.sectionStack}>
      <Card>
        <CardHeader>
          <CardTitle>Configure the public widget</CardTitle>
          <CardDescription>
            These controls are safe public options. They are encoded in links and snippets without
            exposing organizer-only fields.
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
        <Card>
          <CardHeader>
            <div className={workspaceStyles.cardHeadingRow}>
              <div>
                <CardTitle>Advanced public options</CardTitle>
                <CardDescription>
                  Optional filters, display fields, host CSS, and a local preview refresh.
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
                    value={tracks.join(", ")}
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
  const publicRevision = publication.publicRevision;
  const previewLabel =
    publication.previewAvailability === "available"
      ? "Available"
      : publication.previewAvailability === "checking"
        ? "Checking"
        : publication.previewAvailability === "failed"
          ? "Failed"
          : "Unavailable";

  return (
    <Card aria-labelledby="embed-publication-status-heading">
      <CardHeader>
        <div className={workspaceStyles.cardHeadingRow}>
          <div>
            <CardTitle id="embed-publication-status-heading">Publication truth</CardTitle>
            <CardDescription>
              The event record and public projection have separate lifecycles. A generic event
              status is never treated as proof of publication.
            </CardDescription>
          </div>
          <Badge
            variant={publication.previewAvailability === "available" ? "default" : "secondary"}
          >
            {previewLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className={workspaceStyles.statusGrid}>
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
          <span className={workspaceStyles.statusLabel}>Agenda draft</span>
          <strong>
            {publication.agendaDraftVersion === null
              ? "Draft version not loaded"
              : `Draft version ${publication.agendaDraftVersion}`}
          </strong>
          <span className={workspaceStyles.muted}>
            Validation and publication are managed in Agenda.
          </span>
        </div>
        <div className={workspaceStyles.statusItem}>
          <span className={workspaceStyles.statusLabel}>Public revision</span>
          <strong>
            {publicRevision ? `Revision ${publicRevision.number}` : "No public revision"}
          </strong>
          <span className={workspaceStyles.muted}>
            {publicRevision
              ? `Published ${publicRevision.publishedAt} · ID ${publicRevision.id}`
              : "No public projection is available yet."}
          </span>
        </div>
        <div className={workspaceStyles.statusItem}>
          <span className={workspaceStyles.statusLabel}>Preview availability</span>
          <strong>{previewLabel}</strong>
          <span className={workspaceStyles.muted}>
            {publication.message ??
              (publication.previewAvailability === "available"
                ? "Preview and code use the public revision shown above."
                : "Preview and code remain withheld until a public revision is confirmed.")}
          </span>
        </div>
      </CardContent>
    </Card>
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
  const revision = publication.publicRevision;
  const publicUrl = publicEmbedUrl(settings);

  return (
    <Card aria-labelledby="embed-code-heading">
      <CardHeader>
        <div className={workspaceStyles.cardHeadingRow}>
          <div>
            <p className={styles.panelEyebrow}>Step 4 · export</p>
            <CardTitle id="embed-code-heading">Share or embed</CardTitle>
            <CardDescription>
              Share the public URL now. Expand developer snippets only when a host needs embed code.
            </CardDescription>
          </div>
          {revision ? <Badge variant="outline">Revision {revision.number}</Badge> : null}
          {revision ? (
            <p className={workspaceStyles.muted}>
              Revision ID {revision.id} · Published {revision.publishedAt}
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
            <Badge variant="secondary">Revision {revision?.number}</Badge>
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
  const checking = publication.previewAvailability === "checking";
  const needsConfiguration = publication.previewAvailability === "available" && !settingsAvailable;
  const title = checking
    ? "Checking the public projection"
    : needsConfiguration
      ? "Preview needs a valid public URL"
      : publication.previewAvailability === "failed"
        ? "Public projection request failed"
        : "No published public projection";
  const description = checking
    ? "The preview waits for an authoritative public revision response."
    : needsConfiguration
      ? "A published revision is confirmed, but a valid public event slug and approved app URL are required before embedding."
      : (publication.message ??
        "The event may have a private draft, but no published revision is available to embed yet.");
  return (
    <Alert variant={publication.previewAvailability === "failed" ? "destructive" : "default"}>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        {description}
        {!checking && !needsConfiguration ? (
          <div className={workspaceStyles.alertAction}>
            <Button asChild variant="outline" size="sm">
              <a href={agendaValidationHref(organizationId, eventId)}>
                Open Agenda validation and publish
              </a>
            </Button>
          </div>
        ) : null}
      </AlertDescription>
    </Alert>
  );
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
  loading = false,
  errorMessage = null,
}: EmbedWorkspaceViewProps) {
  const scopeKey = workspaceScopeKey(organizationId, eventId);
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
  const [configurations, setConfigurations] =
    useState<readonly EmbedConfiguration[]>(serverConfigurationList);
  const [selectedConfigurationId, setSelectedConfigurationId] = useState<string | null>(
    initialConfiguration?.id ?? null,
  );
  const [configurationName, setConfigurationName] = useState(initialConfiguration?.name ?? "");
  const [configurationStatusMessage, setConfigurationStatusMessage] = useState("");
  const [eventVersionState, setEventVersionState] = useState<number | null>(eventVersion ?? null);
  const [persistenceBusy, setPersistenceBusy] = useState(false);
  const [snapshotScopeKey, setSnapshotScopeKey] = useState<string | null>(
    initialConfigurations === undefined ? null : scopeKey,
  );
  const activeScopeRef = useRef(scopeKey);
  const installedConfigurationScopeRef = useRef<string | null>(
    initialConfigurations === undefined ? null : scopeKey,
  );
  const currentScopeRef = useRef(scopeKey);
  currentScopeRef.current = scopeKey;

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
    if (activeScopeRef.current !== scopeKey) {
      activeScopeRef.current = scopeKey;
      installedConfigurationScopeRef.current = null;
      setConfigurations(EMPTY_EMBED_CONFIGURATIONS);
      setEventVersionState(null);
      setPersistenceBusy(false);
      setPreviewNonce(0);
      setCacheRefreshMessage("");
      setSnapshotScopeKey(null);
      resetBuilder();
      return;
    }
    if (
      initialConfigurations === undefined ||
      installedConfigurationScopeRef.current === scopeKey
    ) {
      return;
    }

    installedConfigurationScopeRef.current = scopeKey;
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
    setSnapshotScopeKey(scopeKey);
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
        setConfigurationStatusMessage("Event configuration transport is unavailable.");
        return false;
      }

      setPersistenceBusy(true);
      setConfigurationStatusMessage("Saving event configuration…");
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
        setConfigurations(authoritativeConfigurations);
        setEventVersionState(updatedEvent.version);
        setSnapshotScopeKey(requestScopeKey);
        return true;
      } catch (error) {
        if (currentScopeRef.current === requestScopeKey) {
          setConfigurationStatusMessage(messageFrom(error));
        }
        return false;
      } finally {
        setPersistenceBusy(false);
      }
    },
    [
      api,
      errorMessage,
      eventId,
      eventVersionState,
      loading,
      organizationId,
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
      tracks,
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
    tracks,
    widget,
  ]);
  const authoritativePublication =
    snapshotScopeKey === scopeKey && !loading && !errorMessage ? publication : undefined;
  const publicationState: EmbedPublicationMetadata = authoritativePublication ?? {
    agendaDraftVersion: null,
    publicRevision: null,
    previewAvailability: loading ? "checking" : "unavailable",
    message: loading
      ? "Checking the current public projection."
      : "No published public projection has been confirmed for this event.",
  };
  const canDistribute =
    settings !== null &&
    publicationState.previewAvailability === "available" &&
    publicationState.publicRevision !== null;
  const previewUrl = canDistribute && settings ? publicEmbedUrl(settings) : "";
  const refreshPreview = () => {
    setPreviewNonce((value) => value + 1);
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
            Build a public widget from the event&apos;s published projection without exposing
            organizer-only data.
          </p>
          <p className={workspaceStyles.muted}>
            Organization {organizationId} · Event {eventId}
            {eventName ? ` · ${eventName}` : ""}
          </p>
        </div>
      </header>

      <Alert className={workspaceStyles.boundaryAlert}>
        <AlertTitle>Public boundary</AlertTitle>
        <AlertDescription>
          These widgets read a confirmed published event projection. Draft sessions, reviewer notes,
          speaker contact details, private files, and other organizer-only fields never cross this
          boundary. Local refresh does not mutate a remote cache.
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

      <nav className={workspaceStyles.workflowSteps} aria-label="Embed workflow">
        <div className={workspaceStyles.workflowStep}>
          <Badge>1</Badge>
          <span>Choose/save configuration</span>
        </div>
        <div className={workspaceStyles.workflowStep}>
          <Badge variant="secondary">2</Badge>
          <span>Configure public widget</span>
        </div>
        <div className={workspaceStyles.workflowStep}>
          <Badge variant="secondary">3</Badge>
          <span>Live published preview</span>
        </div>
        <div className={workspaceStyles.workflowStep}>
          <Badge variant="secondary">4</Badge>
          <span>Copy code/export link</span>
        </div>
      </nav>

      <PublicationStatus eventVersion={scopedEventVersion} publication={publicationState} />

      <div className={workspaceStyles.workspaceGrid}>
        <section className={workspaceStyles.builderColumn} aria-label="Embed builder">
          <Tabs defaultValue="choose" className={workspaceStyles.builderTabs}>
            <TabsList className={workspaceStyles.tabsList}>
              <TabsTrigger value="choose">1 Choose and save</TabsTrigger>
              <TabsTrigger value="configure">2 Configure widget</TabsTrigger>
            </TabsList>
            <TabsContent value="choose" forceMount className={workspaceStyles.tabContent}>
              <div className={workspaceStyles.sectionStack}>
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
                  onDeleteConfiguration={deleteConfiguration}
                  onToggleConfiguration={toggleConfiguration}
                />
                <WidgetChooser selected={widgetId} onChange={changeWidget} />
              </div>
            </TabsContent>
            <TabsContent value="configure" forceMount className={workspaceStyles.tabContent}>
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
                onTracks={setTracks}
                onStatuses={setStatuses}
                onRefresh={refreshPreview}
              />
            </TabsContent>
          </Tabs>
        </section>

        <aside className={workspaceStyles.rail} aria-label="Live preview workspace">
          <div className={workspaceStyles.previewRail}>
            <Card aria-labelledby="embed-preview-heading">
              <CardHeader>
                <div className={workspaceStyles.cardHeadingRow}>
                  <div>
                    <p className={styles.panelEyebrow}>Step 3 · public revision</p>
                    <CardTitle id="embed-preview-heading">
                      {canDistribute ? "Live published preview" : "Preview unavailable"}
                    </CardTitle>
                    <CardDescription>
                      Preview is rendered only when the public projection and its revision metadata
                      are confirmed.
                    </CardDescription>
                    {publicationState.publicRevision ? (
                      <p className={workspaceStyles.muted}>
                        Revision ID {publicationState.publicRevision.id} · Published{" "}
                        {publicationState.publicRevision.publishedAt}
                      </p>
                    ) : null}
                  </div>
                  {publicationState.publicRevision ? (
                    <Badge variant="outline">
                      Revision {publicationState.publicRevision.number}
                    </Badge>
                  ) : null}
                </div>
                {canDistribute && previewUrl ? (
                  <div className={workspaceStyles.previewActions}>
                    <CopyButton label="public URL" value={previewUrl} />
                    <Button asChild variant="outline">
                      <a href={previewUrl} target="_blank" rel="noreferrer">
                        Open public view ↗
                      </a>
                    </Button>
                  </div>
                ) : null}
              </CardHeader>
              <CardContent>
                {canDistribute && settings ? (
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
                    settingsAvailable={settings !== null}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </aside>
      </div>

      {canDistribute && settings ? (
        <CodePanel settings={settings} publication={publicationState} />
      ) : (
        <Card aria-labelledby="embed-code-unavailable-heading">
          <CardHeader>
            <p className={styles.panelEyebrow}>Step 4 · export</p>
            <CardTitle id="embed-code-unavailable-heading">Copy code/export link</CardTitle>
            <CardDescription>
              Snippets and links are withheld until they can point at the same confirmed published
              revision as the preview.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MissingPublicProjection
              organizationId={organizationId}
              eventId={eventId}
              publication={publicationState}
              settingsAvailable={settings !== null}
            />
          </CardContent>
        </Card>
      )}
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
  | { readonly status: "loading"; readonly scopeKey: string }
  | {
      readonly status: "loaded";
      readonly scopeKey: string;
      readonly event: OrganizerEventRecord;
      readonly eventSlug: string;
      readonly eventName: string;
    }
  | { readonly status: "error"; readonly scopeKey: string; readonly message: string };

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : "The organizer event could not be loaded.";
}
type EmbedProjectionEnvelope = {
  readonly data?: {
    readonly revision?: {
      readonly id?: unknown;
      readonly number?: unknown;
      readonly publishedAt?: unknown;
    };
  };
  readonly error?: {
    readonly code?: unknown;
    readonly message?: unknown;
  };
};

function revisionFromProjection(value: unknown): EmbedPublicRevision | null {
  if (!isRecord(value)) return null;
  const id = nonEmptyString(value.id);
  const publishedAt = nonEmptyString(value.publishedAt);
  const revisionNumber = value.number;
  if (
    !id ||
    !publishedAt ||
    typeof revisionNumber !== "number" ||
    !Number.isFinite(revisionNumber)
  ) {
    return null;
  }
  return { id, number: revisionNumber, publishedAt };
}

async function loadEmbedPublication(
  origin: string,
  eventSlug: string,
  signal: AbortSignal,
): Promise<EmbedPublicationMetadata> {
  if (!origin) {
    return {
      agendaDraftVersion: null,
      publicRevision: null,
      previewAvailability: "unavailable",
      message: "The approved public app URL is not configured.",
    };
  }

  const projectionUrl = (projection: "agenda" | "speakers") =>
    `${origin}/api/public/events/${encodeURIComponent(eventSlug)}/${projection}`;
  const loadProjection = async (projection: "agenda" | "speakers") => {
    const response = await fetch(projectionUrl(projection), {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal,
    });
    const body = (await response.json().catch(() => undefined)) as
      | EmbedProjectionEnvelope
      | undefined;
    return { response, body };
  };

  const results = await Promise.allSettled([loadProjection("agenda"), loadProjection("speakers")]);
  if (signal.aborted) throw new DOMException("The request was aborted.", "AbortError");

  const responses = results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  if (responses.length !== results.length) {
    return {
      agendaDraftVersion: null,
      publicRevision: null,
      previewAvailability: "failed",
      message: "The public projection could not be checked. Try again after Agenda publication.",
    };
  }
  if (responses.every(({ response }) => response.status === 404)) {
    return {
      agendaDraftVersion: null,
      publicRevision: null,
      previewAvailability: "unavailable",
      message: "No published agenda and speaker projections exist for this event.",
    };
  }
  const failedResponse = responses.find(({ response }) => !response.ok);
  if (failedResponse) {
    const code = nonEmptyString(failedResponse.body?.error?.code);
    const message = nonEmptyString(failedResponse.body?.error?.message);
    return {
      agendaDraftVersion: null,
      publicRevision: null,
      previewAvailability: code === "PUBLICATION_NOT_FOUND" ? "unavailable" : "failed",
      message: message ?? "The public projection could not be checked.",
    };
  }

  const revisions = responses.map(({ body }) => revisionFromProjection(body?.data?.revision));
  const [agendaRevision, speakerRevision] = revisions;
  if (!agendaRevision || !speakerRevision) {
    return {
      agendaDraftVersion: null,
      publicRevision: null,
      previewAvailability: "failed",
      message: "The public projection did not include complete revision metadata.",
    };
  }
  if (
    agendaRevision.id !== speakerRevision.id ||
    agendaRevision.number !== speakerRevision.number ||
    agendaRevision.publishedAt !== speakerRevision.publishedAt
  ) {
    return {
      agendaDraftVersion: null,
      publicRevision: null,
      previewAvailability: "failed",
      message: "Agenda and speaker projections are from different published revisions.",
    };
  }
  return {
    agendaDraftVersion: null,
    publicRevision: agendaRevision,
    previewAvailability: "available",
    message: "Preview and code use this exact published revision.",
  };
}

export function EmbedWorkspace({
  organizationId,
  eventId,
  api: providedApi,
  publicOrigin,
}: EmbedWorkspaceProps) {
  const scopeKey = workspaceScopeKey(organizationId, eventId);
  const [state, setState] = useState<EmbedLoadState>({ status: "loading", scopeKey });
  const [loadedApi, setLoadedApi] = useState<Pick<
    OrganizerEventsApi,
    "getEvent" | "updateEvent"
  > | null>(providedApi ?? null);
  const [publication, setPublication] = useState<EmbedPublicationMetadata | undefined>();

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!organizationId.trim() || !eventId.trim()) {
        setState({
          status: "error",
          scopeKey,
          message: "An organization and event context are required.",
        });
        return;
      }
      let api = providedApi;
      if (!api) {
        try {
          api = createOrganizerEventsApi("", organizationId);
        } catch (error) {
          setState({ status: "error", scopeKey, message: messageFrom(error) });
          return;
        }
      }
      setLoadedApi(api);
      setState({ status: "loading", scopeKey });
      try {
        const event = await api.getEvent(eventId, signal);
        if (signal?.aborted) return;
        if (event.organizationId !== organizationId || event.id !== eventId) {
          throw new Error(
            "The organizer event response does not match this organization and event context.",
          );
        }
        const resolvedSlug = normalizeEmbedSlug(event.slug);
        if (!resolvedSlug) throw new Error("The organizer event has no public slug.");
        setState({
          status: "loaded",
          scopeKey,
          event,
          eventSlug: resolvedSlug,
          eventName: event.name,
        });
      } catch (error) {
        if (signal?.aborted) return;
        setState({ status: "error", scopeKey, message: messageFrom(error) });
      }
    },
    [eventId, organizationId, providedApi, scopeKey],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  useEffect(() => {
    if (state.scopeKey !== scopeKey) {
      setPublication(undefined);
      return;
    }
    if (state.status !== "loaded") {
      if (state.status === "loading") {
        setPublication({
          agendaDraftVersion: null,
          publicRevision: null,
          previewAvailability: "checking",
          message: "Checking the current public projection.",
        });
      } else {
        setPublication(undefined);
      }
      return;
    }

    const controller = new AbortController();
    setPublication({
      agendaDraftVersion: null,
      publicRevision: null,
      previewAvailability: "checking",
      message: "Checking the current public projection.",
    });
    void loadEmbedPublication(
      configuredPublicOrigin(publicOrigin),
      state.eventSlug,
      controller.signal,
    ).then(
      (nextPublication) => {
        if (!controller.signal.aborted) setPublication(nextPublication);
      },
      () => {
        if (!controller.signal.aborted) {
          setPublication({
            agendaDraftVersion: null,
            publicRevision: null,
            previewAvailability: "failed",
            message: "The public projection could not be checked.",
          });
        }
      },
    );
    return () => controller.abort();
  }, [publicOrigin, scopeKey, state]);

  const eventLoaded = state.scopeKey === scopeKey && state.status === "loaded" ? state : null;
  const isLoading = state.scopeKey !== scopeKey || state.status === "loading";
  const errorMessage =
    state.scopeKey === scopeKey && state.status === "error" ? state.message : null;

  return (
    <EmbedWorkspaceView
      key={scopeKey}
      organizationId={organizationId}
      eventId={eventId}
      eventSlug={eventLoaded?.eventSlug ?? null}
      eventName={eventLoaded?.eventName ?? ""}
      eventVersion={eventLoaded?.event.version ?? null}
      {...(eventLoaded
        ? {
            initialConfigurations:
              eventLoaded.event.embedConfigurations ?? EMPTY_ORGANIZER_EVENT_EMBED_CONFIGURATIONS,
          }
        : {})}
      {...(state.scopeKey === scopeKey && publication !== undefined ? { publication } : {})}
      {...(loadedApi === null ? {} : { api: loadedApi })}
      {...(publicOrigin === undefined ? {} : { publicOrigin })}
      loading={isLoading}
      errorMessage={errorMessage}
    />
  );
}
