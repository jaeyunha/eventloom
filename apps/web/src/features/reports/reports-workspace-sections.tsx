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
import { type MutableRefObject, useEffect, useMemo, useReducer, useRef } from "react";
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
import type { NavigationDataCache } from "@/lib/navigation-data-cache";
import type {
  ReportDefinition,
  ReportDefinitionInput,
  ReportFilter,
  ReportFilterOperator,
  ReportFormat,
  ReportRelationship,
  ReportRun,
  ReportSort,
  ReportsApi,
} from "./api";
import styles from "./reports-workspace.module.css";
import {
  type FieldOption,
  REPORT_DIALOG_COPY,
  REPORT_FIELD_ALLOWLIST,
  REPORT_TEMPLATES,
  type ReportsNavigationCacheSnapshot,
  type ReportTemplate,
  type ReportTemplateId,
  SOURCE_ORDER,
} from "./reports-workspace-model";

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

const REPORT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function optionForField(key: string): FieldOption | undefined {
  for (const relationship of SOURCE_ORDER) {
    const option = REPORT_FIELD_ALLOWLIST[relationship].find((candidate) => candidate.key === key);
    if (option !== undefined) return option;
  }
  return undefined;
}

function dateLabel(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return REPORT_DATE_FORMATTER.format(parsed);
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

type ReportsWorkspaceLoaderProps = Readonly<{
  api: ReportsApi | null;
  testMode: boolean;
  eventId: string;
  navigationCache: NavigationDataCache | null;
  reportsCacheKey: string;
  reportsCacheTags: readonly string[];
  retryToken: number;
  loadGenerationRef: MutableRefObject<number>;
  onSnapshot: (snapshot: ReportsNavigationCacheSnapshot) => void;
  onLoadStarted: (hasImmediateSnapshot: boolean, retryFresh: boolean) => void;
  onLoadingChange: (loading: boolean) => void;
  onLoadFailed: (reason: unknown) => void;
}>;

function ReportsWorkspaceLoader({
  api,
  testMode,
  eventId,
  navigationCache,
  reportsCacheKey,
  reportsCacheTags,
  retryToken,
  loadGenerationRef,
  onSnapshot,
  onLoadStarted,
  onLoadingChange,
  onLoadFailed,
}: ReportsWorkspaceLoaderProps): null {
  const retrySeenRef = useRef(0);
  useEffect(() => {
    if (testMode || api === null) {
      onLoadingChange(false);
      return;
    }
    let active = true;
    const generation = ++loadGenerationRef.current;
    const immediateSnapshot =
      navigationCache?.peek<ReportsNavigationCacheSnapshot>(reportsCacheKey);
    if (immediateSnapshot !== undefined) onSnapshot(immediateSnapshot);
    const controller = new AbortController();
    const retryFresh = retryToken !== retrySeenRef.current;
    onLoadStarted(immediateSnapshot !== undefined, retryFresh);
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
        onSnapshot(snapshot);
      })
      .catch((reason: unknown) => {
        if (!isCurrent() || (reason instanceof DOMException && reason.name === "AbortError"))
          return;
        onLoadFailed(reason);
      })
      .finally(() => {
        if (isCurrent()) onLoadingChange(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    api,
    eventId,
    loadGenerationRef,
    navigationCache,
    onLoadFailed,
    onLoadStarted,
    onLoadingChange,
    onSnapshot,
    reportsCacheKey,
    reportsCacheTags,
    retryToken,
    testMode,
  ]);
  return null;
}
const REPORT_TEMPLATE_ICON_PROPS = {
  "aria-hidden": true,
  size: 20,
  strokeWidth: 1.8,
} as const;

function ReportTemplateIcon({ id }: Readonly<{ id: ReportTemplateId }>) {
  switch (id) {
    case "program-schedule":
      return <CalendarDays {...REPORT_TEMPLATE_ICON_PROPS} />;
    case "speaker-directory":
      return <Mic2 {...REPORT_TEMPLATE_ICON_PROPS} />;
    case "participant-directory":
      return <Users {...REPORT_TEMPLATE_ICON_PROPS} />;
    case "evaluation-progress":
      return <ListChecks {...REPORT_TEMPLATE_ICON_PROPS} />;
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
  eventId?: string;
  definitions: readonly ReportDefinition[];
  runs: readonly ReportRun[];
  selectedId: string | null;
  onSelect: (definition: ReportDefinition, trigger: HTMLElement) => void;
  onDelete: (definition: ReportDefinition, trigger: HTMLElement) => void;
  busy: boolean;
}>;

function SavedReportList({
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
type ReportBuilderIdentityProps = Readonly<{
  draft: ReportDefinitionInput;
  onDraftText: (field: "name" | "description", value: string) => void;
}>;

function ReportBuilderIdentity({ draft, onDraftText }: ReportBuilderIdentityProps) {
  return (
    <Card className={styles.innerCard} data-report-builder-step="identity">
      <CardHeader>
        <CardTitle>1. Name this report</CardTitle>
        <CardDescription>Name the export so other organizers know when to use it.</CardDescription>
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
  );
}

type ReportBuilderSourcesProps = Readonly<{
  relationships: readonly ReportRelationship[];
  onToggleRelationship: (relationship: ReportRelationship, checked: boolean) => void;
}>;

function ReportBuilderSources({ relationships, onToggleRelationship }: ReportBuilderSourcesProps) {
  const relationshipSet = useMemo(() => new Set(relationships), [relationships]);
  return (
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
              checked={relationshipSet.has(relationship)}
              onCheckedChange={(checked) => onToggleRelationship(relationship, checked === true)}
            />
            <span>{RELATIONSHIP_LABELS[relationship]}</span>
          </Label>
        ))}
      </CardContent>
    </Card>
  );
}

type ReportBuilderColumnsProps = Readonly<{
  draft: ReportDefinitionInput;
  availableFields: readonly FieldOption[];
  busy: boolean;
  onToggleField: (field: string, checked: boolean) => void;
  onMoveField: (field: string, direction: -1 | 1) => void;
}>;

function ReportBuilderColumns({
  draft,
  availableFields,
  busy,
  onToggleField,
  onMoveField,
}: ReportBuilderColumnsProps) {
  const fieldSet = useMemo(() => new Set(draft.fields), [draft.fields]);
  return (
    <Card className={styles.innerCard} data-report-builder-step="columns">
      <CardHeader>
        <CardTitle>2. Choose columns</CardTitle>
        <CardDescription>Select the information to include in each exported row.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className={styles.checkGrid}>
          {availableFields.map((field) => (
            <Label className={styles.checkItem} key={field.key}>
              <Checkbox
                checked={fieldSet.has(field.key)}
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
  );
}

type ReportFilterRowProps = Readonly<{
  filter: ReportFilter;
  index: number;
  fields: readonly string[];
  onUpdate: (index: number, update: Partial<ReportFilter>) => void;
  onRemove: (index: number) => void;
  busy: boolean;
}>;

function ReportFilterRow({
  filter,
  index,
  fields,
  onUpdate,
  onRemove,
  busy,
}: ReportFilterRowProps) {
  return (
    <div className={styles.ruleRow} key={reportViewKey("filter", filter)}>
      <div className={styles.field}>
        <Label htmlFor={`report-filter-field-${index}`}>Filter field {index + 1}</Label>
        <Select value={filter.field} onValueChange={(value) => onUpdate(index, { field: value })}>
          <SelectTrigger id={`report-filter-field-${index}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {fields.map((field) => (
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
            onUpdate(index, {
              operator: value as ReportFilterOperator,
              ...(value === "isNull" || value === "isNotNull" ? { value: undefined } : {}),
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
            onChange={(event) => onUpdate(index, { value: event.currentTarget.value })}
          />
        </div>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onRemove(index)}
        disabled={busy}
      >
        Remove filter
      </Button>
    </div>
  );
}

type ReportSortRowProps = Readonly<{
  sort: ReportSort;
  index: number;
  fields: readonly string[];
  onUpdate: (index: number, update: Partial<ReportSort>) => void;
  onRemove: (index: number) => void;
  busy: boolean;
}>;

function ReportSortRow({ sort, index, fields, onUpdate, onRemove, busy }: ReportSortRowProps) {
  return (
    <div className={styles.ruleRow} key={reportViewKey("sort", sort)}>
      <div className={styles.field}>
        <Label htmlFor={`report-sort-field-${index}`}>Sort field {index + 1}</Label>
        <Select value={sort.field} onValueChange={(value) => onUpdate(index, { field: value })}>
          <SelectTrigger id={`report-sort-field-${index}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {fields.map((field) => (
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
          onValueChange={(value) => onUpdate(index, { direction: value as "asc" | "desc" })}
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
        onClick={() => onRemove(index)}
        disabled={busy}
      >
        Remove sort
      </Button>
    </div>
  );
}
type ReportBuilderRefinementsProps = Readonly<{
  draft: ReportDefinitionInput;
  evaluationPlanId: string;
  evaluationPlanVersion: string;
  busy: boolean;
  onAddFilter: () => void;
  onUpdateFilter: (index: number, update: Partial<ReportFilter>) => void;
  onRemoveFilter: (index: number) => void;
  onAddSort: () => void;
  onUpdateSort: (index: number, update: Partial<ReportSort>) => void;
  onRemoveSort: (index: number) => void;
  onEvaluationPlanId: (value: string) => void;
  onEvaluationPlanVersion: (value: string) => void;
}>;

function ReportBuilderRefinements({
  draft,
  evaluationPlanId,
  evaluationPlanVersion,
  busy,
  onAddFilter,
  onUpdateFilter,
  onRemoveFilter,
  onAddSort,
  onUpdateSort,
  onRemoveSort,
  onEvaluationPlanId,
  onEvaluationPlanVersion,
}: ReportBuilderRefinementsProps) {
  return (
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
            <ReportFilterRow
              key={reportViewKey("filter", filter)}
              filter={filter}
              index={index}
              fields={draft.fields}
              onUpdate={onUpdateFilter}
              onRemove={onRemoveFilter}
              busy={busy}
            />
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
          {draft.sort.length === 0 ? <p className={styles.muted}>No sorting configured.</p> : null}
          {draft.sort.map((sort, index) => (
            <ReportSortRow
              key={reportViewKey("sort", sort)}
              sort={sort}
              index={index}
              fields={draft.fields}
              onUpdate={onUpdateSort}
              onRemove={onRemoveSort}
              busy={busy}
            />
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
              Pin an export to a saved review-plan version only when an audit workflow requires it.
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

function ReportDefinitionEditor({
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

      <ReportBuilderIdentity draft={draft} onDraftText={onDraftText} />
      <div className={styles.editorGrid}>
        <ReportBuilderSources
          relationships={draft.relationships}
          onToggleRelationship={onToggleRelationship}
        />
        <ReportBuilderColumns
          draft={draft}
          availableFields={availableFields}
          busy={busy}
          onToggleField={onToggleField}
          onMoveField={onMoveField}
        />
      </div>
      <ReportBuilderRefinements
        draft={draft}
        evaluationPlanId={evaluationPlanId}
        evaluationPlanVersion={evaluationPlanVersion}
        busy={busy}
        onAddFilter={onAddFilter}
        onUpdateFilter={onUpdateFilter}
        onRemoveFilter={onRemoveFilter}
        onAddSort={onAddSort}
        onUpdateSort={onUpdateSort}
        onRemoveSort={onRemoveSort}
        onEvaluationPlanId={onEvaluationPlanId}
        onEvaluationPlanVersion={onEvaluationPlanVersion}
      />
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

function ReportRunControls({
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

type RunHistoryAction = { type: "audit-open"; run: ReportRun } | { type: "audit-close" };

function runHistoryReducer(_state: ReportRun | null, action: RunHistoryAction): ReportRun | null {
  return action.type === "audit-open" ? action.run : null;
}

function RunHistory({ runs, busy, onDownload }: RunHistoryProps) {
  const [auditRun, dispatchAuditRun] = useReducer(runHistoryReducer, null);
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
                    onClick={() => dispatchAuditRun({ type: "audit-open", run })}
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
      <Dialog
        open={auditRun !== null}
        onOpenChange={(open) => !open && dispatchAuditRun({ type: "audit-close" })}
      >
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

type ReportsSelectionRequest =
  | { readonly kind: "select"; readonly definition: ReportDefinition }
  | { readonly kind: "new"; readonly draft?: ReportDefinitionInput };

type DirtySelectionDialogProps = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
  onRestoreFocus?: () => void;
}>;

export function DirtySelectionDialog({
  open,
  onOpenChange,
  onDiscard,
  onRestoreFocus,
}: DirtySelectionDialogProps) {
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

export type ReportsWorkspaceSectionsProps = Readonly<{
  organizationId: string;
  eventId: string;
  definitions: readonly ReportDefinition[];
  runs: readonly ReportRun[];
  selectedId: string | null;
  selectedDefinition: ReportDefinition | null;
  draft: ReportDefinitionInput;
  availableFields: readonly FieldOption[];
  busy: boolean;
  message: string | null;
  requestError: string | null;
  previewRun: ReportRun | null;
  format: ReportFormat;
  evaluationPlanId: string;
  evaluationPlanVersion: string;
  deleteCandidate: ReportDefinition | null;
  deleteError: string | null;
  selectionRequest: ReportsSelectionRequest | null;
  onUseTemplate: (template: ReportTemplate, trigger: HTMLElement) => void;
  onNewDefinition: (trigger: HTMLElement) => void;
  onSelectDefinition: (definition: ReportDefinition, trigger: HTMLElement) => void;
  onDeleteCandidate: (definition: ReportDefinition, trigger: HTMLElement) => void;
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
  onDeleteSelected: (trigger: HTMLElement) => void;
  onFormat: (format: ReportFormat) => void;
  onPreview: () => void;
  onRun: () => void;
  onDownloadPreview: () => void;
  onDownloadRun: (run: ReportRun) => void;
  onRestoreDeleteFocus: () => void;
  onDeleteOpenChange: (open: boolean) => void;
  onConfirmDelete: () => void;
  onSelectionOpenChange: (open: boolean) => void;
  onRestoreSelectionFocus: () => void;
  onDiscardSelection: () => void;
}>;

function ReportsWorkspaceSections({
  organizationId,
  eventId,
  definitions,
  runs,
  selectedId,
  selectedDefinition,
  draft,
  availableFields,
  busy,
  message,
  requestError,
  previewRun,
  format,
  evaluationPlanId,
  evaluationPlanVersion,
  deleteCandidate,
  deleteError,
  selectionRequest,
  onUseTemplate,
  onNewDefinition,
  onSelectDefinition,
  onDeleteCandidate,
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
  onDeleteSelected,
  onFormat,
  onPreview,
  onRun,
  onDownloadPreview,
  onDownloadRun,
  onRestoreDeleteFocus,
  onDeleteOpenChange,
  onConfirmDelete,
  onSelectionOpenChange,
  onRestoreSelectionFocus,
  onDiscardSelection,
}: ReportsWorkspaceSectionsProps) {
  const visibleRuns =
    selectedDefinition === null
      ? runs
      : runs.filter((run) => run.definitionId === selectedDefinition.id);
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
              onClick={(event) => onNewDefinition(event.currentTarget)}
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
          onUseTemplate={onUseTemplate}
        />

        <div className={styles.workspaceMain}>
          <SavedReportList
            eventId={eventId}
            definitions={definitions}
            runs={runs}
            selectedId={selectedId}
            onSelect={onSelectDefinition}
            onDelete={onDeleteCandidate}
            busy={busy}
          />
          <ReportDefinitionEditor
            selectedDefinition={selectedDefinition}
            draft={draft}
            availableFields={availableFields}
            evaluationPlanId={evaluationPlanId}
            evaluationPlanVersion={evaluationPlanVersion}
            busy={busy}
            onDraftText={onDraftText}
            onToggleRelationship={onToggleRelationship}
            onToggleField={onToggleField}
            onMoveField={onMoveField}
            onAddFilter={onAddFilter}
            onUpdateFilter={onUpdateFilter}
            onRemoveFilter={onRemoveFilter}
            onAddSort={onAddSort}
            onUpdateSort={onUpdateSort}
            onRemoveSort={onRemoveSort}
            onEvaluationPlanId={onEvaluationPlanId}
            onEvaluationPlanVersion={onEvaluationPlanVersion}
            onSave={onSave}
            onDelete={onDeleteSelected}
          />
          <ReportRunControls
            selectedDefinition={selectedDefinition}
            format={format}
            busy={busy}
            onFormat={onFormat}
            onPreview={onPreview}
            onRun={onRun}
          />
          {previewRun !== null ? (
            <ReportPreview run={previewRun} onDownload={onDownloadPreview} busy={busy} />
          ) : null}
          <RunHistory runs={visibleRuns} busy={busy} onDownload={onDownloadRun} />
        </div>
      </div>

      <DeleteReportDialog
        candidate={deleteCandidate}
        busy={busy}
        error={deleteError}
        onRestoreFocus={onRestoreDeleteFocus}
        onOpenChange={onDeleteOpenChange}
        onConfirm={onConfirmDelete}
      />
      <DirtySelectionDialog
        open={selectionRequest !== null}
        onOpenChange={onSelectionOpenChange}
        onRestoreFocus={onRestoreSelectionFocus}
        onDiscard={onDiscardSelection}
      />
    </main>
  );
}
type ReportsWorkspaceContentProps = ReportsWorkspaceSectionsProps &
  Readonly<{
    api: ReportsApi | null;
    testMode: boolean;
    loading: boolean;
    loadState: "ready" | "empty" | "unavailable";
    loadError: string | null;
    navigationCache: NavigationDataCache | null;
    reportsCacheKey: string;
    reportsCacheTags: readonly string[];
    retryToken: number;
    loadGenerationRef: MutableRefObject<number>;
    onSnapshot: (snapshot: ReportsNavigationCacheSnapshot) => void;
    onLoadStarted: (hasImmediateSnapshot: boolean, retryFresh: boolean) => void;
    onLoadingChange: (loading: boolean) => void;
    onLoadFailed: (reason: unknown) => void;
    onRetry: () => void;
  }>;

export function ReportsWorkspaceContent(props: ReportsWorkspaceContentProps) {
  const {
    api,
    testMode,
    loading,
    loadState,
    loadError,
    navigationCache,
    reportsCacheKey,
    reportsCacheTags,
    retryToken,
    loadGenerationRef,
    onSnapshot,
    onLoadStarted,
    onLoadingChange,
    onLoadFailed,
    onRetry,
    ...sectionProps
  } = props;
  if (loading)
    return <ReportsWorkspaceStatus eventId={props.eventId} message="Loading saved reports…" />;
  if (loadState === "unavailable") {
    return (
      <main className={styles.page}>
        <UnavailableState
          eventId={props.eventId}
          message={loadError ?? "The reports capability is unavailable."}
          onRetry={onRetry}
        />
      </main>
    );
  }
  return (
    <>
      <ReportsWorkspaceLoader
        api={api}
        testMode={testMode}
        eventId={props.eventId}
        navigationCache={navigationCache}
        reportsCacheKey={reportsCacheKey}
        reportsCacheTags={reportsCacheTags}
        retryToken={retryToken}
        loadGenerationRef={loadGenerationRef}
        onSnapshot={onSnapshot}
        onLoadStarted={onLoadStarted}
        onLoadingChange={onLoadingChange}
        onLoadFailed={onLoadFailed}
      />
      <ReportsWorkspaceSections {...sectionProps} />
    </>
  );
}
