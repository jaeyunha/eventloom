"use client";

import {
  ArrowRight,
  CalendarDays,
  FileSpreadsheet,
  ListChecks,
  Mic2,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { WorkspaceBreadcrumb, WorkspaceHeader, WorkspaceSurface } from "@/components/workspace";
import { useOrganizerEventId } from "@/features/admin/organizer-event-workspace";
import { useNavigationDataCache } from "@/lib/navigation-data-cache-provider";
import {
  createReportsApi,
  type ReportDefinition,
  type ReportDefinitionInput,
  type ReportFilter,
  type ReportFilterOperator,
  type ReportFormat,
  type ReportRelationship,
  type ReportRun,
  type ReportSort,
  type ReportsApi,
  ReportsApiError,
} from "./api";
import styles from "./reports-workspace.module.css";
import {
  draftFromReportTemplate,
  type FieldOption,
  fieldsForRelationships,
  normalizeDraft,
  REPORT_DIALOG_COPY,
  REPORT_FIELD_ALLOWLIST,
  REPORT_TEMPLATES,
  type ReportTemplate,
  type ReportTemplateId,
  SOURCE_ORDER,
} from "./reports-workspace-model";

export interface ReportsWorkspaceProps {
  readonly organizationId: string;
  readonly eventId: string;
  readonly baseUrl?: string;
}

export interface ReportsNavigationCacheSnapshot {
  readonly definitions: readonly ReportDefinition[];
  readonly runs: readonly ReportRun[];
}

function normalizeReportsScopeId(value: string): string {
  return value.trim();
}

export function reportsNavigationCacheKey(organizationId: string, eventId: string): string {
  const organization = normalizeReportsScopeId(organizationId);
  const event = normalizeReportsScopeId(eventId);
  return `organization:${organization}:event:${event}:reports:workspace`;
}

export function reportsNavigationCacheTags(
  organizationId: string,
  eventId: string,
): readonly string[] {
  const organization = normalizeReportsScopeId(organizationId);
  const event = normalizeReportsScopeId(eventId);
  return [`organization:${organization}`, `event:${event}`, `reports:${event}`];
}

const RELATIONSHIP_LABELS: Readonly<Record<ReportRelationship, string>> = {
  sessions: "Sessions",
  participants: "Participants",
  speakers: "Speakers",
  evaluationProgress: "Evaluation progress",
};

const FILTER_OPERATORS: readonly {
  readonly value: ReportFilterOperator;
  readonly label: string;
}[] = [
  { value: "eq", label: "equals" },
  { value: "neq", label: "does not equal" },
  { value: "contains", label: "contains" },
  { value: "startsWith", label: "starts with" },
  { value: "endsWith", label: "ends with" },
  { value: "in", label: "is one of" },
  { value: "gt", label: "greater than" },
  { value: "gte", label: "at least" },
  { value: "lt", label: "less than" },
  { value: "lte", label: "at most" },
  { value: "isNull", label: "is empty" },
  { value: "isNotNull", label: "is not empty" },
];

function apiBaseUrl(explicit: string | undefined): string {
  return (explicit ?? "").trim().replace(/\/+$/u, "");
}

function optionForField(key: string): FieldOption | undefined {
  for (const relationship of SOURCE_ORDER) {
    const option = REPORT_FIELD_ALLOWLIST[relationship].find((candidate) => candidate.key === key);
    if (option !== undefined) return option;
  }
  return undefined;
}

function newDraft(): ReportDefinitionInput {
  return {
    name: "",
    description: "",
    relationships: ["sessions"],
    fields: ["sessions.id", "sessions.title"],
    order: ["sessions.id", "sessions.title"],
    filters: [],
    sort: [],
  };
}

function arrayValue<T>(value: readonly T[] | null | undefined): readonly T[] {
  return Array.isArray(value) ? value : [];
}

function draftFromDefinition(definition: ReportDefinition): ReportDefinitionInput {
  return {
    name: typeof definition.name === "string" ? definition.name : "",
    description: typeof definition.description === "string" ? definition.description : "",
    relationships: [...arrayValue(definition.relationships)],
    fields: [...arrayValue(definition.fields)],
    order: [...arrayValue(definition.order)],
    filters: arrayValue(definition.filters).map((filter) => ({ ...filter })),
    sort: arrayValue(definition.sort).map((sort) => ({ ...sort })),
  };
}

function seededDefinition(eventId: string): ReportDefinition {
  return {
    id: "report-session-progress",
    eventId,
    name: "Session and evaluation progress",
    description: "A saved organizer report for program coverage.",
    relationships: ["sessions", "evaluationProgress"],
    fields: [
      "sessions.id",
      "sessions.title",
      "sessions.status",
      "evaluationProgress.completionPercent",
    ],
    order: [
      "sessions.id",
      "sessions.title",
      "sessions.status",
      "evaluationProgress.completionPercent",
    ],
    filters: [{ field: "evaluationProgress.completionPercent", operator: "gte", value: 50 }],
    sort: [{ field: "sessions.id", direction: "asc" }],
    version: 2,
    createdBy: "organizer",
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: "2026-08-08T09:00:00.000Z",
  };
}

function seededRun(eventId: string, definition: ReportDefinition): ReportRun {
  const columns = [...definition.order];
  const body = `${columns.join(",")}\r\nsession-1,Opening session,scheduled,100`;
  const parameters = {
    format: "csv" as const,
    expectedVersion: definition.version,
    definitionId: definition.id,
    definitionVersion: definition.version,
    requestedFilters: definition.filters,
    requestedSort: definition.sort,
    evaluationPlanId: "plan-2026",
    evaluationPlanVersion: 3,
  };
  const audit = {
    requesterId: "organizer",
    tenantId: "organization",
    eventId,
    definitionId: definition.id,
    definitionVersion: definition.version,
    parameters,
    requestedAt: "2026-08-08T10:00:00.000Z",
    completedAt: "2026-08-08T10:00:01.000Z",
    outputDigest: "demo-digest",
    rowCount: 1,
  };
  const exportValue = {
    format: "csv" as const,
    fileName: "session-and-evaluation-progress-v2.csv",
    contentType: "text/csv; charset=utf-8",
    body,
    content: body,
    columns,
    rowCount: 1,
    outputDigest: "demo-digest",
  };
  return {
    id: "run-session-progress",
    eventId,
    definitionId: definition.id,
    definitionVersion: definition.version,
    requesterId: "organizer",
    parameters,
    requestedAt: audit.requestedAt,
    completedAt: audit.completedAt,
    export: exportValue,
    output: exportValue,
    audit,
  };
}

function dateLabel(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(parsed);
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
let nextReportViewKey = 0;
const reportViewKeys = new WeakMap<object, string>();

function reportViewKey(prefix: string, value: object): string {
  const existing = reportViewKeys.get(value);
  if (existing !== undefined) return existing;
  const created = `${prefix}-${++nextReportViewKey}`;
  reportViewKeys.set(value, created);
  return created;
}

function errorMessage(reason: unknown): string {
  if (reason instanceof ReportsApiError) {
    if (reason.code === "REPORT_CONFLICT") {
      return "This report changed elsewhere. Refresh the saved report before saving, running, or deleting it.";
    }
    if (reason.code === "REPORT_EXPORT_UNAVAILABLE") {
      return `The server could not generate this export. ${reason.message} Check the selected fields and try again.`;
    }
    if (reason.code === "REPORT_INVALID_INPUT") {
      return `The report request was rejected. ${reason.message} Check the report format and evaluation plan values.`;
    }
    if (reason.code === "REPORT_INVALID_RESPONSE") return reason.message;
    return reason.message;
  }
  return reason instanceof Error ? reason.message : "The report request could not be completed.";
}

function isUnavailableError(reason: unknown): boolean {
  return (
    reason instanceof TypeError ||
    (reason instanceof ReportsApiError &&
      (reason.status === 404 ||
        reason.status === 502 ||
        reason.status === 503 ||
        reason.status === 504 ||
        reason.code.includes("UNAVAILABLE") ||
        reason.code.includes("CAPABILITY")))
  );
}

function csvRows(run: ReportRun): readonly string[][] {
  const content = run.export.body;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (character === '"') {
      if (quoted && content[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && content[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

interface RowKeyState<T extends object> {
  readonly map: WeakMap<T, string>;
  nextId: number;
}

function carryRowKey<T extends object>(state: RowKeyState<T>, previous: T, next: T): void {
  const existing = state.map.get(previous);
  if (existing !== undefined) state.map.set(next, existing);
}

function equalDraft(left: ReportDefinitionInput, right: ReportDefinitionInput): boolean {
  return JSON.stringify(normalizeDraft(left)) === JSON.stringify(normalizeDraft(right));
}

function ReportTemplateIcon({ id }: Readonly<{ id: ReportTemplateId }>) {
  const iconProps = { "aria-hidden": true, size: 20, strokeWidth: 1.8 } as const;
  switch (id) {
    case "program-schedule":
      return <CalendarDays {...iconProps} />;
    case "speaker-directory":
      return <Mic2 {...iconProps} />;
    case "participant-directory":
      return <Users {...iconProps} />;
    case "evaluation-progress":
      return <ListChecks {...iconProps} />;
  }
}

type CommonExportsProps = Readonly<{
  organizationId: string;
  eventId: string;
  onUseTemplate: (template: ReportTemplate, trigger: HTMLElement) => void;
}>;

function CommonExports({ organizationId, eventId, onUseTemplate }: CommonExportsProps) {
  const reviewsHref = `/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventId)}/reviews`;
  return (
    <WorkspaceSurface
      id="report-templates"
      className={styles.commonExports}
      data-report-surface="common-exports"
      title="Common exports"
      description="Start with an organizer-ready setup, then adjust fields or filters before saving."
      actions={
        <Badge variant="outline" className={styles.safeBadge}>
          <ShieldCheck aria-hidden="true" size={14} />
          This event only
        </Badge>
      }
    >
      <div className={styles.quickExportGrid}>
        <Card className={`${styles.exportTemplateCard} ${styles.featuredExportCard}`}>
          <CardHeader className={styles.exportTemplateHeader}>
            <div className={styles.templateIcon}>
              <FileSpreadsheet aria-hidden="true" size={20} strokeWidth={1.8} />
            </div>
            <Badge className={styles.recommendedBadge}>Recommended</Badge>
            <CardTitle>Review scores & decisions</CardTitle>
            <CardDescription>
              Open review results and export submission scores, review counts, and organizer
              decisions.
            </CardDescription>
          </CardHeader>
          <CardFooter className={styles.exportTemplateFooter}>
            <Button asChild>
              <Link href={reviewsHref}>
                Open review results
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
            </Button>
            <span className={styles.templateMeta}>Use the Export CSV action in Reviews.</span>
          </CardFooter>
        </Card>

        {REPORT_TEMPLATES.map((template) => (
          <Card
            key={template.id}
            className={styles.exportTemplateCard}
            data-report-template-id={template.id}
          >
            <CardHeader className={styles.exportTemplateHeader}>
              <div className={styles.templateIcon}>
                <ReportTemplateIcon id={template.id} />
              </div>
              <CardTitle>{template.name}</CardTitle>
              <CardDescription>{template.description}</CardDescription>
            </CardHeader>
            <CardFooter className={styles.exportTemplateFooter}>
              <Button
                type="button"
                variant="outline"
                onClick={(event) => onUseTemplate(template, event.currentTarget)}
              >
                Use template
                <ArrowRight aria-hidden="true" size={16} />
              </Button>
              <span className={styles.templateMeta}>{template.fields.length} columns included</span>
            </CardFooter>
          </Card>
        ))}
      </div>
      <div className={styles.trustNote}>
        <ShieldCheck aria-hidden="true" size={18} />
        <p>
          Only fields intended for organizers are available here. Access is checked again whenever
          an export is generated.
        </p>
      </div>
    </WorkspaceSurface>
  );
}

function FormMessage({ message, error = false }: Readonly<{ message: string; error?: boolean }>) {
  return (
    <Alert variant={error ? "destructive" : "default"} className={styles.message}>
      <AlertTitle>{error ? "Report request failed" : "Reports update"}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export function UnavailableState({
  eventId,
  message,
  onRetry,
}: Readonly<{ eventId: string; message: string; onRetry?: () => void }>) {
  return (
    <Card className={styles.statusCard} role="alert" aria-labelledby="reports-unavailable-heading">
      <CardHeader>
        <Badge variant="destructive">Unavailable</Badge>
        <CardTitle id="reports-unavailable-heading">Reports are unavailable</CardTitle>
        <CardDescription>{eventId} could not provide saved report data yet.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className={styles.muted}>{message}</p>
        <p className={styles.muted}>
          No report was assumed or created locally. Retry after the event reports capability is
          available.
        </p>
      </CardContent>
      {onRetry ? (
        <CardFooter>
          <Button type="button" variant="outline" onClick={onRetry}>
            Retry loading reports
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}

export function ReportsWorkspaceStatus({
  eventId,
  message,
  error = false,
}: Readonly<{ eventId: string; message: string; error?: boolean }>) {
  return (
    <main className={styles.statusPage}>
      <p className={styles.eyebrow}>{eventId}</p>
      <h1>Reports workspace</h1>
      <Card
        className={styles.statusCard}
        role={error ? "alert" : "status"}
        aria-labelledby="reports-status-heading"
      >
        <CardHeader>
          <CardTitle id="reports-status-heading">
            {error ? "Reports unavailable" : "Reports data"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p>{message}</p>
        </CardContent>
      </Card>
    </main>
  );
}

type SavedReportListProps = Readonly<{
  readonly eventId?: string;
  readonly definitions: readonly ReportDefinition[];
  readonly runs: readonly ReportRun[];
  readonly selectedId: string | null;
  readonly onSelect: (definition: ReportDefinition, trigger: HTMLElement) => void;
  readonly onDelete: (definition: ReportDefinition, trigger: HTMLElement) => void;
  readonly busy: boolean;
}>;

export function SavedReportList({
  eventId,
  definitions,
  runs,
  selectedId,
  onSelect,
  onDelete,
  busy,
}: SavedReportListProps) {
  return (
    <Card className={styles.savedList} id="saved-reports">
      <CardHeader className={styles.sectionHeader}>
        <div>
          <p className={styles.sectionEyebrow}>Reusable exports</p>
          <CardTitle>Saved reports</CardTitle>
          <CardDescription>
            Reuse the same data, columns, filters, and sorting whenever you need another file.
          </CardDescription>
          {eventId ? (
            <span className={styles.srOnly}>Saved report definitions for {eventId}</span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {definitions.length === 0 ? (
          <div className={styles.emptyState} role="status">
            <Badge variant="outline">Empty</Badge>
            <p>Use a common export above or save a custom report for repeat use.</p>
          </div>
        ) : (
          <div className={styles.savedItems}>
            {definitions.map((definition) => {
              const latestRun = runs
                .filter((run) => run.definitionId === definition.id)
                .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt))[0];
              const selected = selectedId === definition.id;
              return (
                <article
                  className={`${styles.savedItem} ${selected ? styles.savedItemSelected : ""}`}
                  key={definition.id}
                >
                  <Button
                    className={styles.savedItemButton}
                    type="button"
                    variant="ghost"
                    aria-pressed={selected}
                    onClick={(event) => onSelect(definition, event.currentTarget)}
                    disabled={busy}
                  >
                    <span className={styles.savedItemTitle}>{definition.name}</span>
                    <span className={styles.savedItemPurpose}>
                      {definition.description || "No purpose provided."}
                    </span>
                    <span className={styles.savedItemMeta}>
                      <Badge variant="outline">
                        {definition.relationships
                          .map((relationship) => RELATIONSHIP_LABELS[relationship])
                          .join(", ")}
                      </Badge>
                      <Badge variant="outline">{definition.order.length} columns</Badge>
                      <Badge variant="outline">Version {definition.version}</Badge>
                    </span>
                    <span className={styles.savedItemLatest}>
                      Last export:{" "}
                      {latestRun
                        ? `${dateLabel(latestRun.requestedAt)} · ${latestRun.audit.rowCount} rows`
                        : "Never exported"}
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(event) => onDelete(definition, event.currentTarget)}
                    disabled={busy}
                    aria-label={`Delete ${definition.name}`}
                  >
                    Delete
                  </Button>
                </article>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type ReportDefinitionEditorProps = Readonly<{
  selectedDefinition: ReportDefinition | null;
  draft: ReportDefinitionInput;
  availableFields: readonly FieldOption[];
  evaluationPlanId: string;
  evaluationPlanVersion: string;
  busy: boolean;
  onDraftText: (field: "name" | "description", value: string) => void;
  onToggleRelationship: (relationship: ReportRelationship, checked: boolean) => void;
  onToggleField: (field: string, checked: boolean) => void;
  onMoveField: (field: string, direction: -1 | 1) => void;
  onAddFilter: () => void;
  onUpdateFilter: (index: number, update: Partial<ReportFilter>) => void;
  onRemoveFilter: (index: number) => void;
  onAddSort: () => void;
  onUpdateSort: (index: number, update: Partial<ReportSort>) => void;
  onRemoveSort: (index: number) => void;
  onEvaluationPlanId: (value: string) => void;
  onEvaluationPlanVersion: (value: string) => void;
  onSave: () => void;
  onDelete: (trigger: HTMLElement) => void;
}>;

export function ReportDefinitionEditor({
  selectedDefinition,
  draft,
  availableFields,
  evaluationPlanId,
  evaluationPlanVersion,
  busy,
  onDraftText,
  onToggleRelationship,
  onToggleField,
  onMoveField,
  onAddFilter,
  onUpdateFilter,
  onRemoveFilter,
  onAddSort,
  onUpdateSort,
  onRemoveSort,
  onEvaluationPlanId,
  onEvaluationPlanVersion,
  onSave,
  onDelete,
}: ReportDefinitionEditorProps) {
  return (
    <section
      className={styles.section}
      id="reports-editor"
      aria-labelledby="definition-editor-heading"
    >
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.sectionEyebrow}>Report builder</p>
          <h2 id="definition-editor-heading">
            {selectedDefinition === null
              ? "Create custom report"
              : `Edit ${selectedDefinition.name}`}
          </h2>
          <p className={styles.muted}>
            Choose the event data and spreadsheet columns you need, then save the report before
            previewing or exporting it.
          </p>
        </div>
        <Badge variant={selectedDefinition === null ? "secondary" : "outline"}>
          {selectedDefinition === null ? "Draft" : `Version ${selectedDefinition.version}`}
        </Badge>
      </div>

      <Card className={styles.innerCard} data-report-builder-step="identity">
        <CardHeader>
          <CardTitle>1. Name this report</CardTitle>
          <CardDescription>
            Name the export so other organizers know when to use it.
          </CardDescription>
        </CardHeader>
        <CardContent className={styles.formGrid}>
          <div className={styles.field}>
            <Label htmlFor="report-name">Report name</Label>
            <Input
              id="report-name"
              value={draft.name}
              onChange={(event) => onDraftText("name", event.currentTarget.value)}
              required
              maxLength={200}
            />
          </div>
          <div className={styles.field}>
            <Label htmlFor="report-description">Description</Label>
            <Textarea
              id="report-description"
              value={draft.description ?? ""}
              onChange={(event) => onDraftText("description", event.currentTarget.value)}
              rows={2}
              maxLength={2000}
            />
          </div>
        </CardContent>
      </Card>

      <div className={styles.editorGrid}>
        <Card className={styles.innerCard} data-report-builder-step="sources">
          <CardHeader>
            <CardTitle>Choose data</CardTitle>
            <CardDescription>
              Select the event areas this spreadsheet should include. Only organizer-safe fields are
              available.
            </CardDescription>
          </CardHeader>
          <CardContent className={styles.checkGrid}>
            {SOURCE_ORDER.map((relationship) => (
              <Label className={styles.checkItem} key={relationship}>
                <Checkbox
                  checked={draft.relationships.includes(relationship)}
                  onCheckedChange={(checked) =>
                    onToggleRelationship(relationship, checked === true)
                  }
                />
                <span>{RELATIONSHIP_LABELS[relationship]}</span>
              </Label>
            ))}
          </CardContent>
        </Card>

        <Card className={styles.innerCard} data-report-builder-step="columns">
          <CardHeader>
            <CardTitle>2. Choose columns</CardTitle>
            <CardDescription>
              Select the information to include in each exported row.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className={styles.checkGrid}>
              {availableFields.map((field) => (
                <Label className={styles.checkItem} key={field.key}>
                  <Checkbox
                    checked={draft.fields.includes(field.key)}
                    onCheckedChange={(checked) => onToggleField(field.key, checked === true)}
                  />
                  <span>{field.label}</span>
                </Label>
              ))}
            </div>
            <div className={styles.orderBlock}>
              <h3>Export column order</h3>
              <p className={styles.muted}>The first item becomes the first column in the file.</p>
              {draft.order.length === 0 ? (
                <p className={styles.emptyState} role="status">
                  Select at least one field to set the output order.
                </p>
              ) : (
                <ol className={styles.orderList}>
                  {draft.order.map((field, index) => (
                    <li className={styles.orderItem} key={field}>
                      <span>{optionForField(field)?.label ?? field}</span>
                      <span className={styles.inlineActions}>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => onMoveField(field, -1)}
                          disabled={index === 0 || busy}
                          aria-label={`Move ${optionForField(field)?.label ?? field} up`}
                        >
                          Move up
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => onMoveField(field, 1)}
                          disabled={index === draft.order.length - 1 || busy}
                          aria-label={`Move ${optionForField(field)?.label ?? field} down`}
                        >
                          Move down
                        </Button>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Collapsible
        className={styles.refine}
        data-report-builder-step="refinements"
        defaultOpen={draft.filters.length > 0 || draft.sort.length > 0}
      >
        <div className={styles.refineHeader}>
          <div>
            <h3>3. Filters and sorting</h3>
            <p className={styles.muted}>Optional rules help narrow and order the exported rows.</p>
          </div>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              Show or hide refinements
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className={styles.refineContent}>
          <div className={styles.refineGroup}>
            <div className={styles.subsectionHeader}>
              <div>
                <h4>Filters</h4>
                <p className={styles.muted}>
                  The selected event projection is filtered by the server.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onAddFilter}
                disabled={draft.fields.length === 0 || busy}
              >
                Add filter
              </Button>
            </div>
            {draft.filters.length === 0 ? (
              <p className={styles.muted}>No filters configured.</p>
            ) : null}
            {draft.filters.map((filter, index) => (
              <div className={styles.ruleRow} key={reportViewKey("filter", filter)}>
                <div className={styles.field}>
                  <Label htmlFor={`report-filter-field-${index}`}>Filter field {index + 1}</Label>
                  <Select
                    value={filter.field}
                    onValueChange={(value) => onUpdateFilter(index, { field: value })}
                  >
                    <SelectTrigger id={`report-filter-field-${index}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {draft.fields.map((field) => (
                        <SelectItem value={field} key={field}>
                          {optionForField(field)?.label ?? field}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className={styles.field}>
                  <Label htmlFor={`report-filter-operator-${index}`}>Operator</Label>
                  <Select
                    value={filter.operator}
                    onValueChange={(value) =>
                      onUpdateFilter(index, {
                        operator: value as ReportFilterOperator,
                        ...(value === "isNull" || value === "isNotNull"
                          ? { value: undefined }
                          : {}),
                      })
                    }
                  >
                    <SelectTrigger id={`report-filter-operator-${index}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FILTER_OPERATORS.map((operator) => (
                        <SelectItem value={operator.value} key={operator.value}>
                          {operator.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {filter.operator !== "isNull" && filter.operator !== "isNotNull" ? (
                  <div className={styles.field}>
                    <Label htmlFor={`report-filter-value-${index}`}>Value</Label>
                    <Input
                      id={`report-filter-value-${index}`}
                      value={
                        typeof filter.value === "string" || typeof filter.value === "number"
                          ? String(filter.value)
                          : ""
                      }
                      onChange={(event) =>
                        onUpdateFilter(index, { value: event.currentTarget.value })
                      }
                    />
                  </div>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemoveFilter(index)}
                  disabled={busy}
                >
                  Remove filter
                </Button>
              </div>
            ))}
          </div>

          <div className={styles.refineGroup}>
            <div className={styles.subsectionHeader}>
              <div>
                <h4>Sorting</h4>
                <p className={styles.muted}>Sort order is recorded with each immutable run.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onAddSort}
                disabled={draft.fields.length === 0 || busy}
              >
                Add sort
              </Button>
            </div>
            {draft.sort.length === 0 ? (
              <p className={styles.muted}>No sorting configured.</p>
            ) : null}
            {draft.sort.map((sort, index) => (
              <div className={styles.ruleRow} key={reportViewKey("sort", sort)}>
                <div className={styles.field}>
                  <Label htmlFor={`report-sort-field-${index}`}>Sort field {index + 1}</Label>
                  <Select
                    value={sort.field}
                    onValueChange={(value) => onUpdateSort(index, { field: value })}
                  >
                    <SelectTrigger id={`report-sort-field-${index}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {draft.fields.map((field) => (
                        <SelectItem value={field} key={field}>
                          {optionForField(field)?.label ?? field}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className={styles.field}>
                  <Label htmlFor={`report-sort-direction-${index}`}>Direction</Label>
                  <Select
                    value={sort.direction}
                    onValueChange={(value) =>
                      onUpdateSort(index, { direction: value as "asc" | "desc" })
                    }
                  >
                    <SelectTrigger id={`report-sort-direction-${index}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc">Ascending</SelectItem>
                      <SelectItem value="desc">Descending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemoveSort(index)}
                  disabled={busy}
                >
                  Remove sort
                </Button>
              </div>
            ))}
          </div>

          <Collapsible
            className={styles.advancedDisclosure}
            defaultOpen={evaluationPlanId.length > 0 || evaluationPlanVersion.length > 0}
          >
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" size="sm">
                Advanced audit settings
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className={styles.advancedDisclosureContent}>
              <p className={styles.muted}>
                Pin an export to a saved review-plan version only when an audit workflow requires
                it.
              </p>
              <div className={styles.formGrid}>
                <div className={styles.field}>
                  <Label htmlFor="evaluation-plan-id">Review plan ID (optional)</Label>
                  <Input
                    id="evaluation-plan-id"
                    value={evaluationPlanId}
                    onChange={(event) => onEvaluationPlanId(event.currentTarget.value)}
                    placeholder="plan-2026"
                  />
                </div>
                <div className={styles.field}>
                  <Label htmlFor="evaluation-plan-version">Review plan version (optional)</Label>
                  <Input
                    id="evaluation-plan-version"
                    type="number"
                    min={1}
                    step={1}
                    value={evaluationPlanVersion}
                    onChange={(event) => onEvaluationPlanVersion(event.currentTarget.value)}
                  />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CollapsibleContent>
      </Collapsible>

      <div className={styles.actionRow}>
        <Button type="button" onClick={onSave} disabled={busy}>
          {busy ? "Saving…" : selectedDefinition === null ? "Save report" : "Save changes"}
        </Button>
        {selectedDefinition !== null ? (
          <Button
            type="button"
            variant="ghost"
            className={styles.deleteButton}
            onClick={(event) => onDelete(event.currentTarget)}
            disabled={busy}
          >
            Delete report
          </Button>
        ) : null}
      </div>
    </section>
  );
}

type ReportRunControlsProps = Readonly<{
  selectedDefinition: ReportDefinition | null;
  format: ReportFormat;
  busy: boolean;
  onFormat: (format: ReportFormat) => void;
  onPreview: () => void;
  onRun: () => void;
}>;

export function ReportRunControls({
  selectedDefinition,
  format,
  busy,
  onFormat,
  onPreview,
  onRun,
}: ReportRunControlsProps) {
  return (
    <section className={styles.section} id="report-run-controls" aria-labelledby="run-heading">
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.sectionEyebrow}>Export</p>
          <h2 id="run-heading">Preview and export</h2>
          <p className={styles.muted}>
            Preview the first rows, then generate a CSV or Excel file and record it in export
            history.
          </p>
        </div>
        <Badge variant={selectedDefinition === null ? "secondary" : "outline"}>
          {selectedDefinition === null
            ? "Save first"
            : `Saved report · v${selectedDefinition.version}`}
        </Badge>
      </div>
      <CardContent className={styles.runControls}>
        <div className={styles.field}>
          <Label htmlFor="report-format">Export format</Label>
          <Select value={format} onValueChange={(value) => onFormat(value as ReportFormat)}>
            <SelectTrigger id="report-format">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="csv">CSV</SelectItem>
              <SelectItem value="xlsx">XLSX</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className={styles.actionRow}>
          <Button
            type="button"
            variant="outline"
            data-report-action="preview"
            onClick={onPreview}
            disabled={busy || selectedDefinition === null}
          >
            Preview rows
          </Button>
          <Button
            type="button"
            data-report-action="export"
            onClick={onRun}
            disabled={busy || selectedDefinition === null}
          >
            {busy ? "Generating…" : `Generate and download ${format === "csv" ? "CSV" : "Excel"}`}
          </Button>
        </div>
      </CardContent>
    </section>
  );
}

type ReportPreviewProps = Readonly<{ run: ReportRun; onDownload: () => void; busy: boolean }>;

export function ReportPreview({ run, onDownload, busy }: ReportPreviewProps) {
  const isCsv = run.export.format === "csv";
  const rows = useMemo(() => (isCsv ? csvRows(run) : []), [isCsv, run]);
  const header = rows[0] ?? run.export.columns.map(String);
  const values = rows.slice(1).slice(0, 20);
  return (
    <Card className={styles.section} id="report-preview" aria-labelledby="preview-heading">
      <CardHeader className={styles.sectionHeader}>
        <div>
          <p className={styles.sectionEyebrow}>Generated preview</p>
          <CardTitle id="preview-heading">Preview</CardTitle>
          <CardDescription>
            {run.audit.rowCount} rows · report version {run.definitionVersion} · generated{" "}
            {dateLabel(run.requestedAt)}
          </CardDescription>
        </div>
        <Button type="button" onClick={onDownload} disabled={busy}>
          {busy ? "Preparing download…" : `Download ${run.export.format.toUpperCase()}`}
        </Button>
      </CardHeader>
      <CardContent>
        {isCsv ? (
          <>
            <p className={styles.muted}>
              {run.audit.rowCount} rows available. Showing the first {values.length} row
              {values.length === 1 ? "" : "s"}.
            </p>
            <Table>
              <TableCaption>Preview of {run.export.fileName}</TableCaption>
              <TableHeader>
                <TableRow>
                  {header.map((column) => (
                    <TableHead scope="col" key={column}>
                      {optionForField(column)?.label ?? column}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {values.map((row) => (
                  <TableRow key={reportViewKey("preview", row)}>
                    {header.map((column, columnIndex) => (
                      <TableCell key={column}>{displayValue(row[columnIndex])}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        ) : (
          <div className={styles.emptyState} role="status">
            <Badge variant="outline">Download only</Badge>
            <p>
              XLSX previews are download-only. Download the workbook to view its spreadsheet
              contents.
            </p>
          </div>
        )}
        <details className={styles.auditDisclosure}>
          <summary>View audit details</summary>
          <p className={styles.auditNote} data-report-audit="output-digest">
            Output digest: {run.audit.outputDigest}
          </p>
        </details>
      </CardContent>
    </Card>
  );
}

type RunHistoryProps = Readonly<{
  runs: readonly ReportRun[];
  busy: boolean;
  onDownload: (run: ReportRun) => void;
}>;

export function RunHistory({ runs, busy, onDownload }: RunHistoryProps) {
  const [auditRun, setAuditRun] = useState<ReportRun | null>(null);
  return (
    <section className={styles.section} id="report-history" aria-labelledby="run-history-heading">
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.sectionEyebrow}>Audit trail</p>
          <h2 id="run-history-heading">Export history</h2>
          <p className={styles.muted}>
            Re-download previous server-generated files or inspect how an export was produced.
          </p>
        </div>
        <Badge variant="outline">
          {runs.length} export{runs.length === 1 ? "" : "s"}
        </Badge>
      </div>
      {runs.length === 0 ? (
        <div className={styles.emptyState} role="status">
          <Badge variant="outline">No exports</Badge>
          <p>No exports for this saved report yet.</p>
        </div>
      ) : (
        <Table>
          <TableCaption>Completed exports and audit metadata</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Export</TableHead>
              <TableHead scope="col">Report version</TableHead>
              <TableHead scope="col">Exported</TableHead>
              <TableHead scope="col">Rows</TableHead>
              <TableHead scope="col">Audit</TableHead>
              <TableHead scope="col">Export</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run) => (
              <TableRow key={run.id}>
                <TableHead scope="row">{run.id}</TableHead>
                <TableCell>{run.definitionVersion}</TableCell>
                <TableCell>{dateLabel(run.audit.requestedAt)}</TableCell>
                <TableCell>{run.audit.rowCount}</TableCell>
                <TableCell>
                  <span className={styles.auditDigest} data-report-audit="output-digest">
                    Output digest: {run.audit.outputDigest}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setAuditRun(run)}
                  >
                    Audit details
                  </Button>
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onDownload(run)}
                    disabled={busy}
                  >
                    {busy ? "Preparing download…" : `Download ${run.export.format.toUpperCase()}`}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Dialog open={auditRun !== null} onOpenChange={(open) => !open && setAuditRun(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export audit details</DialogTitle>
            <DialogDescription>
              The server records when this file was generated and which saved report produced it.
            </DialogDescription>
          </DialogHeader>
          {auditRun ? (
            <dl className={styles.auditList}>
              <div>
                <dt>Run</dt>
                <dd>{auditRun.id}</dd>
              </div>
              <div>
                <dt>Requester</dt>
                <dd>{auditRun.audit.requesterId}</dd>
              </div>
              <div>
                <dt>Event</dt>
                <dd>{auditRun.audit.eventId}</dd>
              </div>
              <div>
                <dt>Completed</dt>
                <dd>{dateLabel(auditRun.audit.completedAt)}</dd>
              </div>
              <div>
                <dt>Output digest</dt>
                <dd>{auditRun.audit.outputDigest}</dd>
              </div>
              {auditRun.audit.parameters.evaluationPlanId !== undefined ? (
                <div>
                  <dt>Evaluation plan</dt>
                  <dd>
                    {auditRun.audit.parameters.evaluationPlanId} · version{" "}
                    {auditRun.audit.parameters.evaluationPlanVersion ?? "—"}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

type DeleteReportDialogProps = Readonly<{
  candidate: ReportDefinition | null;
  busy: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onRestoreFocus?: () => void;
}>;

export function DeleteReportDialog({
  candidate,
  busy,
  error,
  onOpenChange,
  onConfirm,
  onRestoreFocus,
}: DeleteReportDialogProps) {
  return (
    <AlertDialog
      open={candidate !== null}
      onOpenChange={(open) => {
        if (!open && busy) return;
        onOpenChange(open);
      }}
    >
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          if (!onRestoreFocus) return;
          event.preventDefault();
          onRestoreFocus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{REPORT_DIALOG_COPY.deleteTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {candidate
              ? `This removes “${candidate.name}” for this event. Existing run audit records remain available.`
              : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Delete failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{REPORT_DIALOG_COPY.deleteCancel}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
            disabled={busy}
          >
            {busy ? "Deleting…" : REPORT_DIALOG_COPY.deleteAction}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type SelectionRequest =
  | { readonly kind: "select"; readonly definition: ReportDefinition }
  | {
      readonly kind: "new";
      readonly draft?: ReportDefinitionInput;
    };

export function DirtySelectionDialog({
  open,
  onOpenChange,
  onDiscard,
  onRestoreFocus,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
  onRestoreFocus?: () => void;
}>) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          if (!onRestoreFocus) return;
          event.preventDefault();
          onRestoreFocus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{REPORT_DIALOG_COPY.dirtyTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            Switching saved recipes or starting a new report will discard the current unsaved edits.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{REPORT_DIALOG_COPY.dirtyCancel}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onDiscard}>
            {REPORT_DIALOG_COPY.dirtyAction}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ReportsWorkspace({
  organizationId,
  eventId: fallbackEventId,
  baseUrl: explicitBaseUrl,
}: ReportsWorkspaceProps) {
  const eventId = normalizeReportsScopeId(useOrganizerEventId(fallbackEventId));
  const normalizedOrganizationId = normalizeReportsScopeId(organizationId);
  const baseUrl = apiBaseUrl(explicitBaseUrl);
  const testMode = process.env.APP_ENV !== "production" && process.env.NODE_ENV === "test";
  const navigationCache = useNavigationDataCache();
  const reportsCacheKey = useMemo(
    () => reportsNavigationCacheKey(normalizedOrganizationId, eventId),
    [eventId, normalizedOrganizationId],
  );
  const reportsCacheTags = useMemo(
    () => reportsNavigationCacheTags(normalizedOrganizationId, eventId),
    [eventId, normalizedOrganizationId],
  );
  const cachedSnapshot = navigationCache?.peek<ReportsNavigationCacheSnapshot>(reportsCacheKey);
  const initialDefinition = seededDefinition(eventId);
  const initialDefinitions =
    cachedSnapshot?.definitions.filter((definition) => definition.eventId === eventId) ??
    (testMode ? [initialDefinition] : []);
  const initialRuns =
    cachedSnapshot?.runs.filter((run) => run.eventId === eventId) ??
    (testMode ? [seededRun(eventId, initialDefinition)] : []);
  const hasImmediateSnapshot = cachedSnapshot !== undefined;
  const api = useMemo<ReportsApi | null>(() => {
    if (testMode || normalizedOrganizationId.length === 0 || eventId.length === 0) return null;
    try {
      return createReportsApi(baseUrl, normalizedOrganizationId, eventId);
    } catch {
      return null;
    }
  }, [baseUrl, eventId, normalizedOrganizationId, testMode]);
  const [definitions, setDefinitions] = useState<readonly ReportDefinition[]>(initialDefinitions);
  const [runs, setRuns] = useState<readonly ReportRun[]>(initialRuns);
  const [selectedId, setSelectedId] = useState<string | null>(initialDefinitions[0]?.id ?? null);
  const [draft, setDraft] = useState<ReportDefinitionInput>(() =>
    initialDefinitions[0] === undefined ? newDraft() : draftFromDefinition(initialDefinitions[0]),
  );
  const [loading, setLoading] = useState(!testMode && !hasImmediateSnapshot);
  const [loadState, setLoadState] = useState<"ready" | "empty" | "unavailable">(
    initialDefinitions.length === 0 && hasImmediateSnapshot ? "empty" : "ready",
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [previewRun, setPreviewRun] = useState<ReportRun | null>(null);
  const [format, setFormat] = useState<ReportFormat>("csv");
  const [evaluationPlanId, setEvaluationPlanId] = useState("");
  const [evaluationPlanVersion, setEvaluationPlanVersion] = useState("");
  const [deleteCandidate, setDeleteCandidate] = useState<ReportDefinition | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteRestoreRef = useRef<HTMLElement | null>(null);
  const selectionRestoreRef = useRef<HTMLElement | null>(null);
  const deleteInFlightRef = useRef(false);
  const [retryToken, setRetryToken] = useState(0);
  const retrySeenRef = useRef(0);
  const loadGenerationRef = useRef(0);
  const [selectionRequest, setSelectionRequest] = useState<SelectionRequest | null>(null);
  const filterKeyState = useRef<RowKeyState<ReportFilter>>({
    map: new WeakMap(),
    nextId: 0,
  });
  const sortKeyState = useRef<RowKeyState<ReportSort>>({
    map: new WeakMap(),
    nextId: 0,
  });

  const selectedDefinition = definitions.find((definition) => definition.id === selectedId) ?? null;
  const availableFields = useMemo(
    () => fieldsForRelationships(draft.relationships),
    [draft.relationships],
  );
  const visibleRuns =
    selectedDefinition === null
      ? runs
      : runs.filter((run) => run.definitionId === selectedDefinition.id);
  const isDirty =
    selectedDefinition === null
      ? !equalDraft(draft, newDraft())
      : !equalDraft(draft, draftFromDefinition(selectedDefinition));
  function restoreDeleteFocus(): void {
    const trigger = deleteRestoreRef.current;
    deleteRestoreRef.current = null;
    if (trigger?.isConnected) {
      trigger.focus();
      return;
    }
    if (typeof window !== "undefined") {
      const focusFallback = () => {
        document.querySelector<HTMLElement>("#saved-reports button:not([disabled])")?.focus();
      };
      if (typeof window.requestAnimationFrame === "function")
        window.requestAnimationFrame(focusFallback);
      else window.setTimeout(focusFallback, 0);
    }
  }

  function restoreSelectionFocus(): void {
    const trigger = selectionRestoreRef.current;
    selectionRestoreRef.current = null;
    if (trigger?.isConnected) trigger.focus();
  }

  const applySnapshot = useCallback(
    (snapshot: ReportsNavigationCacheSnapshot): void => {
      const nextDefinitions = snapshot.definitions.filter(
        (definition) => definition.eventId === eventId,
      );
      const nextRuns = snapshot.runs.filter((run) => run.eventId === eventId);
      setDefinitions(nextDefinitions);
      setRuns(nextRuns);
      setLoadState(nextDefinitions.length === 0 ? "empty" : "ready");
      const first = nextDefinitions[0];
      setSelectedId(first?.id ?? null);
      setDraft(first === undefined ? newDraft() : draftFromDefinition(first));
    },
    [eventId],
  );

  function invalidateReportsCache(): void {
    loadGenerationRef.current += 1;
    navigationCache?.invalidate(reportsCacheTags);
  }

  useEffect(() => {
    if (testMode || api === null) {
      setLoading(false);
      return;
    }
    let active = true;
    const generation = ++loadGenerationRef.current;
    const immediateSnapshot =
      navigationCache?.peek<ReportsNavigationCacheSnapshot>(reportsCacheKey);
    if (immediateSnapshot !== undefined) applySnapshot(immediateSnapshot);
    setLoading(immediateSnapshot === undefined);
    if (immediateSnapshot === undefined) setLoadState("ready");
    setLoadError(null);
    if (retryToken > 0) setRequestError(null);
    const controller = new AbortController();
    const retryFresh = retryToken !== retrySeenRef.current;
    retrySeenRef.current = retryToken;
    const load = async (): Promise<ReportsNavigationCacheSnapshot> => {
      const [definitions, runs] = await Promise.all([
        api.listDefinitions(navigationCache === null ? controller.signal : undefined),
        api.listRuns(),
      ]);
      return {
        definitions: definitions.filter((definition) => definition.eventId === eventId),
        runs: runs.filter((run) => run.eventId === eventId),
      };
    };
    const isCurrent = (): boolean =>
      active && generation === loadGenerationRef.current && !controller.signal.aborted;
    const read = navigationCache
      ? navigationCache.read<ReportsNavigationCacheSnapshot>({
          key: reportsCacheKey,
          tags: reportsCacheTags,
          fresh: retryFresh,
          load,
        })
      : load();
    void read
      .then((snapshot) => {
        if (!isCurrent()) return;
        applySnapshot(snapshot);
      })
      .catch((reason: unknown) => {
        if (!isCurrent() || (reason instanceof DOMException && reason.name === "AbortError"))
          return;
        const unavailable = isUnavailableError(reason);
        setLoadError(errorMessage(reason));
        setLoadState(unavailable ? "unavailable" : "ready");
        setRequestError(unavailable ? null : errorMessage(reason));
      })
      .finally(() => {
        if (isCurrent()) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    api,
    applySnapshot,
    eventId,
    navigationCache,
    reportsCacheKey,
    reportsCacheTags,
    retryToken,
    testMode,
  ]);

  function applySelection(request: SelectionRequest): void {
    if (request.kind === "new") {
      setSelectedId(null);
      setDraft(request.draft ?? newDraft());
    } else {
      setSelectedId(request.definition.id);
      setDraft(draftFromDefinition(request.definition));
    }
    setMessage(null);
    setRequestError(null);
    setPreviewRun(null);
    setSelectionRequest(null);
  }

  function requestSelectDefinition(definition: ReportDefinition, trigger: HTMLElement): void {
    const request: SelectionRequest = { kind: "select", definition };
    if (definition.id === selectedId) return;
    if (isDirty) {
      selectionRestoreRef.current = trigger;
      setSelectionRequest(request);
      return;
    }
    selectionRestoreRef.current = null;
    applySelection(request);
  }

  function requestNewDefinition(trigger: HTMLElement, template?: ReportTemplate): void {
    const nextDraft = template === undefined ? newDraft() : draftFromReportTemplate(template);
    if (selectedId === null && !isDirty && equalDraft(draft, nextDraft)) return;
    const request: SelectionRequest = {
      kind: "new",
      draft: nextDraft,
    };
    if (isDirty) {
      selectionRestoreRef.current = trigger;
      setSelectionRequest(request);
      return;
    }
    selectionRestoreRef.current = null;
    applySelection(request);
  }
  function requestDeleteCandidate(candidate: ReportDefinition, trigger: HTMLElement): void {
    if (deleteInFlightRef.current) return;
    deleteRestoreRef.current = trigger;
    setDeleteError(null);
    setRequestError(null);
    setDeleteCandidate(candidate);
  }

  function updateDraft(update: (current: ReportDefinitionInput) => ReportDefinitionInput): void {
    setDraft((current) => normalizeDraft(update(current)));
    setMessage(null);
  }

  function toggleRelationship(relationship: ReportRelationship, checked: boolean): void {
    updateDraft((current) => {
      const relationships = checked
        ? [...current.relationships, relationship]
        : current.relationships.filter((candidate) => candidate !== relationship);
      const nextFields = checked
        ? [...current.fields, REPORT_FIELD_ALLOWLIST[relationship][0]?.key].filter(
            (field): field is string => field !== undefined,
          )
        : current.fields;
      return { ...current, relationships, fields: nextFields };
    });
  }

  function toggleField(field: string, checked: boolean): void {
    updateDraft((current) => ({
      ...current,
      fields: checked
        ? [...current.fields, field]
        : current.fields.filter((candidate) => candidate !== field),
    }));
  }

  function moveField(field: string, direction: -1 | 1): void {
    updateDraft((current) => {
      const index = current.order.indexOf(field);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.order.length) return current;
      const order = [...current.order];
      const other = order[target];
      if (other === undefined) return current;
      order[index] = other;
      order[target] = field;
      return { ...current, order };
    });
  }

  function addFilter(): void {
    const field = draft.fields[0];
    if (field === undefined) return;
    updateDraft((current) => ({
      ...current,
      filters: [...current.filters, { field, operator: "eq", value: "" }],
    }));
  }

  function updateFilter(index: number, update: Partial<ReportFilter>): void {
    updateDraft((current) => {
      const currentFilter = current.filters[index];
      if (currentFilter === undefined) return current;
      const nextFilter = { ...currentFilter, ...update };
      carryRowKey(filterKeyState.current, currentFilter, nextFilter);
      return {
        ...current,
        filters: current.filters.map((filter, filterIndex) =>
          filterIndex === index ? nextFilter : filter,
        ),
      };
    });
  }

  function removeFilter(index: number): void {
    updateDraft((current) => ({
      ...current,
      filters: current.filters.filter((_, filterIndex) => filterIndex !== index),
    }));
  }

  function addSort(): void {
    const field = draft.fields[0];
    if (field === undefined) return;
    updateDraft((current) => ({
      ...current,
      sort: [...current.sort, { field, direction: "asc" }],
    }));
  }

  function updateSort(index: number, update: Partial<ReportSort>): void {
    updateDraft((current) => {
      const currentSort = current.sort[index];
      if (currentSort === undefined) return current;
      const nextSort = { ...currentSort, ...update };
      carryRowKey(sortKeyState.current, currentSort, nextSort);
      return {
        ...current,
        sort: current.sort.map((sort, sortIndex) => (sortIndex === index ? nextSort : sort)),
      };
    });
  }

  function removeSort(index: number): void {
    updateDraft((current) => ({
      ...current,
      sort: current.sort.filter((_, sortIndex) => sortIndex !== index),
    }));
  }

  async function saveDefinition(): Promise<void> {
    if (draft.name.trim().length === 0) {
      setRequestError("Enter a report name before saving.");
      return;
    }
    if (draft.fields.length === 0) {
      setRequestError("Select at least one report field before saving.");
      return;
    }
    if (api === null && !testMode) {
      setRequestError("The reports API is not configured.");
      return;
    }
    setBusy(true);
    setRequestError(null);
    setMessage(null);
    try {
      if (selectedDefinition === null) {
        if (api === null) {
          const seeded = seededDefinition(eventId);
          const created: ReportDefinition = {
            id: `report-${definitions.length + 1}`,
            eventId,
            name: draft.name,
            description: draft.description ?? "",
            relationships: draft.relationships,
            fields: draft.fields,
            order: draft.order,
            filters: draft.filters,
            sort: draft.sort,
            version: 1,
            ...(seeded.createdBy === undefined ? {} : { createdBy: seeded.createdBy }),
            createdAt: seeded.createdAt,
            updatedAt: seeded.updatedAt,
          };
          setDefinitions((current) => [...current, created]);
          setSelectedId(created.id);
          setDraft(draftFromDefinition(created));
          setLoadState("ready");
          setMessage("Report saved at version 1.");
          invalidateReportsCache();
          return;
        }
        const created = await api.createDefinition(draft);
        invalidateReportsCache();
        setDefinitions((current) => [...current, created]);
        setSelectedId(created.id);
        setDraft(draftFromDefinition(created));
        setLoadState("ready");
        setMessage(`Report saved at version ${created.version}.`);
      } else {
        if (api === null) {
          const updated = {
            ...selectedDefinition,
            ...draft,
            version: selectedDefinition.version + 1,
            updatedAt: new Date().toISOString(),
          } satisfies ReportDefinition;
          setDefinitions((current) =>
            current.map((item) => (item.id === updated.id ? updated : item)),
          );
          setDraft(draftFromDefinition(updated));
          setMessage(`Report saved at version ${updated.version}.`);
          invalidateReportsCache();
          return;
        }
        const updated = await api.updateDefinition(selectedDefinition.id, {
          ...draft,
          expectedVersion: selectedDefinition.version,
        });
        invalidateReportsCache();
        setDefinitions((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        );
        setDraft(draftFromDefinition(updated));
        setMessage(`Report saved at version ${updated.version}.`);
      }
    } catch (reason: unknown) {
      setRequestError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete(): Promise<void> {
    if (deleteInFlightRef.current) return;
    const candidate = deleteCandidate;
    if (candidate === null) return;
    if (api === null && !testMode) {
      setDeleteError("The reports API is not configured.");
      return;
    }
    deleteInFlightRef.current = true;
    setBusy(true);
    setDeleteError(null);
    setRequestError(null);
    try {
      if (api !== null) await api.deleteDefinition(candidate.id, candidate.version);
      invalidateReportsCache();
      setDefinitions((current) => current.filter((definition) => definition.id !== candidate.id));
      if (selectedId === candidate.id) applySelection({ kind: "new" });
      setDeleteCandidate(null);
      setLoadState(definitions.length > 1 ? "ready" : "empty");
      setMessage("Saved report deleted. Existing immutable run audit records remain available.");
    } catch (reason: unknown) {
      setDeleteError(errorMessage(reason));
    } finally {
      setBusy(false);
      deleteInFlightRef.current = false;
    }
  }

  async function runReport(preview: boolean): Promise<void> {
    if (selectedDefinition === null) {
      setRequestError("Save the report before running it.");
      return;
    }
    if (api === null && !testMode) {
      setRequestError("The reports API is not configured.");
      return;
    }
    const planVersion = evaluationPlanVersion.trim();
    const numericPlanVersion = planVersion.length > 0 ? Number(planVersion) : undefined;
    if (
      numericPlanVersion !== undefined &&
      (!Number.isSafeInteger(numericPlanVersion) || numericPlanVersion < 1)
    ) {
      setRequestError("Evaluation plan version must be a positive integer.");
      return;
    }
    setBusy(true);
    setRequestError(null);
    setMessage(null);
    try {
      const run =
        api === null
          ? seededRun(eventId, selectedDefinition)
          : await api.runDefinition(selectedDefinition.id, {
              format: preview ? "csv" : format,
              expectedVersion: selectedDefinition.version,
              ...(evaluationPlanId.trim().length === 0
                ? {}
                : { evaluationPlanId: evaluationPlanId.trim() }),
              ...(numericPlanVersion === undefined
                ? {}
                : { evaluationPlanVersion: numericPlanVersion }),
            });
      invalidateReportsCache();
      setRuns((current) => [run, ...current.filter((candidate) => candidate.id !== run.id)]);
      setPreviewRun(run);
      setMessage(
        preview
          ? `Preview generated from report version ${run.definitionVersion}.`
          : `Report run ${run.id} completed with ${run.audit.rowCount} row${run.audit.rowCount === 1 ? "" : "s"}.`,
      );
    } catch (reason: unknown) {
      setRequestError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function downloadRun(run: ReportRun): Promise<void> {
    if (api === null && !testMode) {
      setRequestError("The reports API is not configured.");
      return;
    }
    if (typeof document === "undefined") {
      setRequestError("Report downloads require a browser.");
      return;
    }
    setBusy(true);
    setRequestError(null);
    setMessage(null);
    try {
      const download =
        api === null
          ? {
              body: run.export.body,
              fileName: run.export.fileName,
              contentType: run.export.contentType,
            }
          : await api.download(run.id);
      const blob = new Blob([download.body], { type: download.contentType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = download.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage(`${download.fileName} is ready to download.`);
    } catch (reason: unknown) {
      setRequestError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <ReportsWorkspaceStatus eventId={eventId} message="Loading saved reports…" />;
  if (loadState === "unavailable") {
    return (
      <main className={styles.page}>
        <UnavailableState
          eventId={eventId}
          message={loadError ?? "The reports capability is unavailable."}
          onRetry={() => setRetryToken((value) => value + 1)}
        />
      </main>
    );
  }

  return (
    <main className={styles.page} data-report-workspace-mode="outcome-first">
      <a className={styles.skipLink} href="#reports-content">
        Skip to reports workspace content
      </a>
      <WorkspaceHeader
        breadcrumb={
          <WorkspaceBreadcrumb>
            <Link
              href={`/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventId)}`}
            >
              Event workspace
            </Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Reports & exports</span>
          </WorkspaceBreadcrumb>
        }
        title="Reports & exports"
        description="Download common event data now, or save a custom report when you need the same export again."
        actions={
          <>
            <Button asChild variant="outline">
              <Link
                href={`/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventId)}`}
              >
                Event overview
              </Link>
            </Button>
            <Button
              type="button"
              data-report-action="new"
              onClick={(event) => requestNewDefinition(event.currentTarget)}
            >
              Create custom report
            </Button>
          </>
        }
      />

      <div id="reports-content" className={styles.reportsContent} tabIndex={-1}>
        {requestError !== null ? <FormMessage message={requestError} error /> : null}
        {message !== null ? <FormMessage message={message} /> : null}
        <CommonExports
          organizationId={organizationId}
          eventId={eventId}
          onUseTemplate={(template, trigger) => requestNewDefinition(trigger, template)}
        />

        <div className={styles.workspaceMain}>
          <SavedReportList
            eventId={eventId}
            definitions={definitions}
            runs={runs}
            selectedId={selectedId}
            onSelect={requestSelectDefinition}
            onDelete={requestDeleteCandidate}
            busy={busy}
          />
          <ReportDefinitionEditor
            selectedDefinition={selectedDefinition}
            draft={draft}
            availableFields={availableFields}
            evaluationPlanId={evaluationPlanId}
            evaluationPlanVersion={evaluationPlanVersion}
            busy={busy}
            onDraftText={(field, value) =>
              updateDraft((current) => ({ ...current, [field]: value }))
            }
            onToggleRelationship={toggleRelationship}
            onToggleField={toggleField}
            onMoveField={moveField}
            onAddFilter={addFilter}
            onUpdateFilter={updateFilter}
            onRemoveFilter={removeFilter}
            onAddSort={addSort}
            onUpdateSort={updateSort}
            onRemoveSort={removeSort}
            onEvaluationPlanId={setEvaluationPlanId}
            onEvaluationPlanVersion={setEvaluationPlanVersion}
            onSave={() => void saveDefinition()}
            onDelete={(trigger) =>
              selectedDefinition && requestDeleteCandidate(selectedDefinition, trigger)
            }
          />
          <ReportRunControls
            selectedDefinition={selectedDefinition}
            format={format}
            busy={busy}
            onFormat={setFormat}
            onPreview={() => void runReport(true)}
            onRun={() => void runReport(false)}
          />
          {previewRun !== null ? (
            <ReportPreview
              run={previewRun}
              onDownload={() => void downloadRun(previewRun)}
              busy={busy}
            />
          ) : null}
          <RunHistory runs={visibleRuns} busy={busy} onDownload={(run) => void downloadRun(run)} />
        </div>
      </div>

      <DeleteReportDialog
        candidate={deleteCandidate}
        busy={busy}
        error={deleteError}
        onRestoreFocus={restoreDeleteFocus}
        onOpenChange={(open) => {
          if (open || busy) return;
          setDeleteCandidate(null);
          setDeleteError(null);
        }}
        onConfirm={() => void confirmDelete()}
      />
      <DirtySelectionDialog
        open={selectionRequest !== null}
        onOpenChange={(open) => !open && setSelectionRequest(null)}
        onRestoreFocus={restoreSelectionFocus}
        onDiscard={() => selectionRequest && applySelection(selectionRequest)}
      />
    </main>
  );
}
