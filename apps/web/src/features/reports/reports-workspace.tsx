"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

export interface ReportsWorkspaceProps {
  readonly organizationId: string;
  readonly eventId: string;
  readonly baseUrl?: string;
}

interface FieldOption {
  readonly key: string;
  readonly label: string;
}

/**
 * This is deliberately narrower than the server's complete registry. The UI only offers fields
 * that are useful to organizers and never offers evaluator-only values, assets, or personal
 * identity data. The server remains the final authorization boundary for every request.
 */
export const REPORT_FIELD_ALLOWLIST: Readonly<Record<ReportRelationship, readonly FieldOption[]>> =
  {
    sessions: [
      { key: "sessions.id", label: "Session ID" },
      { key: "sessions.title", label: "Session title" },
      { key: "sessions.description", label: "Session description" },
      { key: "sessions.abstract", label: "Session abstract" },
      { key: "sessions.status", label: "Session status" },
      { key: "sessions.startsAt", label: "Starts at" },
      { key: "sessions.endsAt", label: "Ends at" },
      { key: "sessions.room", label: "Room" },
      { key: "sessions.track", label: "Track" },
    ],
    participants: [
      { key: "participants.id", label: "Participant ID" },
      { key: "participants.displayName", label: "Participant name" },
      { key: "participants.biography", label: "Participant biography" },
    ],
    speakers: [
      { key: "speakers.id", label: "Speaker ID" },
      { key: "speakers.displayName", label: "Speaker name" },
      { key: "speakers.biography", label: "Speaker biography" },
    ],
    evaluationProgress: [
      { key: "evaluationProgress.planId", label: "Evaluation plan ID" },
      { key: "evaluationProgress.planName", label: "Evaluation plan name" },
      { key: "evaluationProgress.planVersion", label: "Evaluation plan version" },
      { key: "evaluationProgress.total", label: "Total assignments" },
      { key: "evaluationProgress.assigned", label: "Assigned" },
      { key: "evaluationProgress.inProgress", label: "In progress" },
      { key: "evaluationProgress.submitted", label: "Submitted" },
      { key: "evaluationProgress.abstained", label: "Abstained" },
      { key: "evaluationProgress.completionPercent", label: "Completion percent" },
      { key: "evaluationProgress.averageScore", label: "Average score" },
      { key: "evaluationProgress.possibleScore", label: "Possible score" },
      { key: "evaluationProgress.scoreCount", label: "Counted scores" },
    ],
  };

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

const SOURCE_ORDER: readonly ReportRelationship[] = [
  "sessions",
  "participants",
  "speakers",
  "evaluationProgress",
];

function apiBaseUrl(explicit: string | undefined): string | null {
  const value = explicit ?? process.env.NEXT_PUBLIC_API_URL;
  const normalized = value?.trim().replace(/\/+$/u, "");
  return normalized && normalized.length > 0 ? normalized : null;
}

function optionForField(key: string): FieldOption | undefined {
  for (const relationship of SOURCE_ORDER) {
    const option = REPORT_FIELD_ALLOWLIST[relationship].find((candidate) => candidate.key === key);
    if (option !== undefined) return option;
  }
  return undefined;
}

function fieldsForRelationships(
  relationships: readonly ReportRelationship[],
): readonly FieldOption[] {
  return SOURCE_ORDER.flatMap((relationship) =>
    relationships.includes(relationship) ? REPORT_FIELD_ALLOWLIST[relationship] : [],
  );
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
    if (reason.code === "REPORT_INVALID_RESPONSE") {
      return reason.message;
    }
    return reason.message;
  }
  return reason instanceof Error ? reason.message : "The report request could not be completed.";
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

function sourceFieldKeys(relationships: readonly ReportRelationship[]): readonly string[] {
  return fieldsForRelationships(relationships).map((field) => field.key);
}

export function normalizeDraft(next: ReportDefinitionInput): ReportDefinitionInput {
  const relationships = arrayValue(next.relationships);
  const available = new Set(sourceFieldKeys(relationships));
  const fields = arrayValue(next.fields).filter((field) => available.has(field));
  const order = arrayValue(next.order).filter((field) => fields.includes(field));
  return {
    ...next,
    relationships,
    fields,
    order: [...order, ...fields.filter((field) => !order.includes(field))],
    filters: arrayValue(next.filters).filter(
      (filter) => filter !== null && typeof filter === "object" && available.has(filter.field),
    ),
    sort: arrayValue(next.sort).filter(
      (sort) => sort !== null && typeof sort === "object" && available.has(sort.field),
    ),
  };
}

function FormMessage({ message, error = false }: Readonly<{ message: string; error?: boolean }>) {
  return (
    <p role={error ? "alert" : "status"} aria-live="polite">
      {message}
    </p>
  );
}

export function ReportsWorkspace({
  organizationId,
  eventId,
  baseUrl: explicitBaseUrl,
}: ReportsWorkspaceProps) {
  const baseUrl = apiBaseUrl(explicitBaseUrl);
  const testMode = process.env.APP_ENV !== "production" && process.env.NODE_ENV === "test";
  const [definitions, setDefinitions] = useState<readonly ReportDefinition[]>(() =>
    testMode ? [seededDefinition(eventId)] : [],
  );
  const [runs, setRuns] = useState<readonly ReportRun[]>(() =>
    testMode ? [seededRun(eventId, seededDefinition(eventId))] : [],
  );
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    testMode ? seededDefinition(eventId).id : null,
  );
  const selectedDefinition = definitions.find((definition) => definition.id === selectedId) ?? null;
  const [draft, setDraft] = useState<ReportDefinitionInput>(() =>
    testMode ? draftFromDefinition(seededDefinition(eventId)) : newDraft(),
  );
  const [loading, setLoading] = useState(!testMode);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [previewRun, setPreviewRun] = useState<ReportRun | null>(null);
  const [format, setFormat] = useState<ReportFormat>("csv");
  const [evaluationPlanId, setEvaluationPlanId] = useState("plan-2026");
  const [evaluationPlanVersion, setEvaluationPlanVersion] = useState("3");
  const [deleteCandidate, setDeleteCandidate] = useState<ReportDefinition | null>(null);
  const [api, setApi] = useState<ReportsApi | null>(null);

  useEffect(() => {
    setApi(null);
    if (testMode) return;
    if (baseUrl === null) {
      setLoading(false);
      setRequestError("The reports API is not configured.");
      return;
    }
    const reportsApi = createReportsApi(baseUrl, organizationId, eventId);
    setApi(reportsApi);
    let active = true;
    setLoading(true);
    setRequestError(null);
    void Promise.all([reportsApi.listDefinitions(), reportsApi.listRuns()])
      .then(([nextDefinitions, nextRuns]) => {
        if (!active) return;
        setDefinitions(nextDefinitions);
        setRuns(nextRuns);
        const first = nextDefinitions[0];
        if (first === undefined) {
          setSelectedId(null);
          setDraft(newDraft());
        } else {
          setSelectedId(first.id);
          setDraft(draftFromDefinition(first));
        }
      })
      .catch((reason: unknown) => {
        if (active) setRequestError(errorMessage(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [baseUrl, eventId, organizationId, testMode]);

  function selectDefinition(definition: ReportDefinition): void {
    setSelectedId(definition.id);
    setDraft(draftFromDefinition(definition));
    setMessage(null);
    setRequestError(null);
    setPreviewRun(null);
  }

  function startNewDefinition(): void {
    setSelectedId(null);
    setDraft(newDraft());
    setMessage(null);
    setRequestError(null);
    setPreviewRun(null);
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
    updateDraft((current) => ({
      ...current,
      filters: current.filters.map((filter, filterIndex) =>
        filterIndex === index ? { ...filter, ...update } : filter,
      ),
    }));
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
    updateDraft((current) => ({
      ...current,
      sort: current.sort.map((sort, sortIndex) =>
        sortIndex === index ? { ...sort, ...update } : sort,
      ),
    }));
  }

  function removeSort(index: number): void {
    updateDraft((current) => ({
      ...current,
      sort: current.sort.filter((_, sortIndex) => sortIndex !== index),
    }));
  }

  async function refreshDefinitions(): Promise<void> {
    if (testMode) {
      const refreshed = seededDefinition(eventId);
      setDefinitions([refreshed]);
      selectDefinition(refreshed);
      setMessage("Saved reports refreshed.");
      return;
    }
    if (api === null) {
      setRequestError("The reports API is not configured.");
      return;
    }
    setBusy(true);
    try {
      const next = await api.listDefinitions();
      setDefinitions(next);
      const selected =
        selectedId === null
          ? next[0]
          : (next.find((definition) => definition.id === selectedId) ?? next[0]);
      if (selected === undefined) startNewDefinition();
      else selectDefinition(selected);
      setMessage("Saved reports refreshed.");
      setRequestError(null);
    } catch (reason: unknown) {
      setRequestError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
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
          setMessage("Report saved at version 1.");
          return;
        }
        const created = await api.createDefinition(draft);
        setDefinitions((current) => [...current, created]);
        setSelectedId(created.id);
        setDraft(draftFromDefinition(created));
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
          return;
        }
        const updated = await api.updateDefinition(selectedDefinition.id, {
          ...draft,
          expectedVersion: selectedDefinition.version,
        });
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
    const candidate = deleteCandidate;
    if (candidate === null) return;
    if (api === null && !testMode) {
      setRequestError("The reports API is not configured.");
      return;
    }
    setBusy(true);
    setRequestError(null);
    try {
      if (api !== null) await api.deleteDefinition(candidate.id, candidate.version);
      setDefinitions((current) => current.filter((definition) => definition.id !== candidate.id));
      setRuns((current) => current.filter((run) => run.definitionId !== candidate.id));
      if (selectedId === candidate.id) startNewDefinition();
      setDeleteCandidate(null);
      setMessage("Saved report deleted.");
    } catch (reason: unknown) {
      setRequestError(errorMessage(reason));
    } finally {
      setBusy(false);
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
      let run: ReportRun;
      if (api === null) {
        run = seededRun(eventId, selectedDefinition);
      } else {
        run = await api.runDefinition(selectedDefinition.id, {
          format: preview ? "csv" : format,
          expectedVersion: selectedDefinition.version,
          ...(evaluationPlanId.trim().length === 0
            ? {}
            : { evaluationPlanId: evaluationPlanId.trim() }),
          ...(numericPlanVersion === undefined
            ? {}
            : { evaluationPlanVersion: numericPlanVersion }),
        });
      }
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
      if (typeof document === "undefined") {
        throw new Error("Report downloads require a browser.");
      }
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

  const availableFields = useMemo(
    () => fieldsForRelationships(draft.relationships),
    [draft.relationships],
  );
  const visibleRuns =
    selectedDefinition === null
      ? runs
      : runs.filter((run) => run.definitionId === selectedDefinition.id);

  if (loading) {
    return <ReportsWorkspaceStatus eventId={eventId} message="Loading saved reports…" />;
  }

  return (
    <main style={{ maxWidth: 1120, margin: "0 auto", padding: "2rem 1rem", color: "#172033" }}>
      <a href="#reports-content" style={{ position: "absolute", left: "-9999px" }}>
        Skip to reports workspace content
      </a>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
          borderBottom: "1px solid #d6dae3",
          paddingBottom: "1.25rem",
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              fontSize: "0.8rem",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {organizationId} · {eventId}
          </p>
          <h1 style={{ margin: "0.4rem 0" }}>Reports workspace</h1>
          <p style={{ margin: 0, maxWidth: 720 }}>
            Save, preview, and run event-scoped program reports from approved sessions, participant
            and speaker profiles, and aggregate evaluation progress.
          </p>
        </div>
        <nav aria-label="Event administration">
          <Link
            href={`/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventId)}`}
          >
            Event overview
          </Link>
        </nav>
      </header>

      <div id="reports-content" tabIndex={-1}>
        {requestError !== null ? <FormMessage message={requestError} error /> : null}
        {message !== null ? <FormMessage message={message} /> : null}
        <p role="note">
          Report fields are allowlisted and event qualified. Evaluator-only values, assets, and
          identity fields outside your grant are not available here.
        </p>

        <section aria-labelledby="saved-reports-heading" style={{ marginTop: "2rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "1rem",
              alignItems: "baseline",
              flexWrap: "wrap",
            }}
          >
            <div>
              <p style={{ margin: 0, fontSize: "0.8rem", textTransform: "uppercase" }}>
                Saved definitions
              </p>
              <h2 id="saved-reports-heading">Reports for this event</h2>
            </div>
            <div>
              <button type="button" onClick={startNewDefinition} disabled={busy}>
                New report
              </button>{" "}
              <button type="button" onClick={() => void refreshDefinitions()} disabled={busy}>
                Refresh saved reports
              </button>
            </div>
          </div>
          {definitions.length === 0 ? (
            <p role="status">
              No saved reports yet. Create a report from the approved fields below.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table>
                <caption>Saved report definitions for {eventId}</caption>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Sources</th>
                    <th scope="col">Fields</th>
                    <th scope="col">Version</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {definitions.map((definition) => (
                    <tr key={definition.id}>
                      <th scope="row">{definition.name}</th>
                      <td>
                        {definition.relationships
                          .map((relationship) => RELATIONSHIP_LABELS[relationship])
                          .join(", ")}
                      </td>
                      <td>{definition.order.length}</td>
                      <td>{definition.version}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() => selectDefinition(definition)}
                          aria-label={`Edit ${definition.name}`}
                        >
                          Edit
                        </button>{" "}
                        <button
                          type="button"
                          onClick={() => setDeleteCandidate(definition)}
                          aria-label={`Delete ${definition.name}`}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="definition-editor-heading" style={{ marginTop: "2rem" }}>
          <h2 id="definition-editor-heading">
            {selectedDefinition === null
              ? "Create a saved report"
              : `Edit ${selectedDefinition.name}`}
          </h2>
          <p>
            Report version {selectedDefinition?.version ?? "new"}. Saving uses optimistic version
            checks.
          </p>
          <div
            style={{
              display: "grid",
              gap: "1rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(16rem, 1fr))",
            }}
          >
            <div>
              <label htmlFor="report-name">Report name</label>
              <input
                id="report-name"
                value={draft.name}
                onChange={(event) => {
                  const name = event.currentTarget.value;
                  updateDraft((current) => ({ ...current, name }));
                }}
                required
                maxLength={200}
              />
            </div>
            <div>
              <label htmlFor="report-description">Description</label>
              <textarea
                id="report-description"
                value={draft.description ?? ""}
                onChange={(event) => {
                  const description = event.currentTarget.value;
                  updateDraft((current) => ({ ...current, description }));
                }}
                rows={2}
                maxLength={2000}
              />
            </div>
          </div>

          <fieldset style={{ marginTop: "1.25rem" }}>
            <legend>Approved report sources</legend>
            <p id="source-help">
              Choose one or more event-scoped sources. Source changes remove fields that are no
              longer available.
            </p>
            <div
              aria-describedby="source-help"
              style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}
            >
              {SOURCE_ORDER.map((relationship) => (
                <label key={relationship}>
                  <input
                    type="checkbox"
                    checked={draft.relationships.includes(relationship)}
                    onChange={(event) =>
                      toggleRelationship(relationship, event.currentTarget.checked)
                    }
                  />{" "}
                  {RELATIONSHIP_LABELS[relationship]}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset style={{ marginTop: "1.25rem" }}>
            <legend>Allowlisted fields</legend>
            <p id="field-help">
              Only fields in this list can be saved. Personal identity data and evaluator-only
              values are intentionally omitted.
            </p>
            <div
              aria-describedby="field-help"
              style={{
                display: "grid",
                gap: "0.5rem",
                gridTemplateColumns: "repeat(auto-fit, minmax(16rem, 1fr))",
              }}
            >
              {availableFields.map((field) => (
                <label key={field.key}>
                  <input
                    type="checkbox"
                    checked={draft.fields.includes(field.key)}
                    onChange={(event) => toggleField(field.key, event.currentTarget.checked)}
                  />{" "}
                  {field.label}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset style={{ marginTop: "1.25rem" }}>
            <legend>Field order</legend>
            <p>Output columns follow this order. Move a field before running the report.</p>
            {draft.order.length === 0 ? (
              <p role="status">Select at least one field to set the output order.</p>
            ) : (
              <ol>
                {draft.order.map((field, index) => (
                  <li key={field} style={{ marginBottom: "0.5rem" }}>
                    <span>{optionForField(field)?.label ?? field}</span>{" "}
                    <button
                      type="button"
                      onClick={() => moveField(field, -1)}
                      disabled={index === 0}
                      aria-label={`Move ${optionForField(field)?.label ?? field} up`}
                    >
                      Move up
                    </button>{" "}
                    <button
                      type="button"
                      onClick={() => moveField(field, 1)}
                      disabled={index === draft.order.length - 1}
                      aria-label={`Move ${optionForField(field)?.label ?? field} down`}
                    >
                      Move down
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </fieldset>

          <fieldset style={{ marginTop: "1.25rem" }}>
            <legend>Filters</legend>
            <p>Filters are applied server-side to the selected event projection.</p>
            {draft.filters.map((filter, index) => (
              <div
                key={`filter-${filter.field}-${filter.operator}-${JSON.stringify(filter.value)}`}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                  alignItems: "end",
                  marginBottom: "0.75rem",
                }}
              >
                <div>
                  <label htmlFor={`report-filter-field-${index}`}>Filter field {index + 1}</label>
                  <select
                    id={`report-filter-field-${index}`}
                    value={filter.field}
                    onChange={(event) => updateFilter(index, { field: event.currentTarget.value })}
                  >
                    {draft.fields.map((field) => (
                      <option value={field} key={field}>
                        {optionForField(field)?.label ?? field}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={`report-filter-operator-${index}`}>Operator</label>
                  <select
                    id={`report-filter-operator-${index}`}
                    value={filter.operator}
                    onChange={(event) =>
                      updateFilter(index, {
                        operator: event.currentTarget.value as ReportFilterOperator,
                        ...(event.currentTarget.value === "isNull" ||
                        event.currentTarget.value === "isNotNull"
                          ? { value: undefined }
                          : {}),
                      })
                    }
                  >
                    {FILTER_OPERATORS.map((operator) => (
                      <option value={operator.value} key={operator.value}>
                        {operator.label}
                      </option>
                    ))}
                  </select>
                </div>
                {filter.operator !== "isNull" && filter.operator !== "isNotNull" ? (
                  <div>
                    <label htmlFor={`report-filter-value-${index}`}>Value</label>
                    <input
                      id={`report-filter-value-${index}`}
                      value={
                        typeof filter.value === "string" || typeof filter.value === "number"
                          ? String(filter.value)
                          : ""
                      }
                      onChange={(event) =>
                        updateFilter(index, { value: event.currentTarget.value })
                      }
                    />
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => removeFilter(index)}
                  aria-label={`Remove filter ${index + 1}`}
                >
                  Remove filter
                </button>
              </div>
            ))}
            <button type="button" onClick={addFilter} disabled={draft.fields.length === 0}>
              Add filter
            </button>
          </fieldset>

          <fieldset style={{ marginTop: "1.25rem" }}>
            <legend>Sorting</legend>
            {draft.sort.map((sort, index) => (
              <div
                key={`sort-${sort.field}-${sort.direction}`}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                  alignItems: "end",
                  marginBottom: "0.75rem",
                }}
              >
                <div>
                  <label htmlFor={`report-sort-field-${index}`}>Sort field {index + 1}</label>
                  <select
                    id={`report-sort-field-${index}`}
                    value={sort.field}
                    onChange={(event) => updateSort(index, { field: event.currentTarget.value })}
                  >
                    {draft.fields.map((field) => (
                      <option value={field} key={field}>
                        {optionForField(field)?.label ?? field}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={`report-sort-direction-${index}`}>Direction</label>
                  <select
                    id={`report-sort-direction-${index}`}
                    value={sort.direction}
                    onChange={(event) =>
                      updateSort(index, { direction: event.currentTarget.value as "asc" | "desc" })
                    }
                  >
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => removeSort(index)}
                  aria-label={`Remove sort ${index + 1}`}
                >
                  Remove sort
                </button>
              </div>
            ))}
            <button type="button" onClick={addSort} disabled={draft.fields.length === 0}>
              Add sort
            </button>
          </fieldset>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginTop: "1.25rem" }}>
            <button type="button" onClick={() => void saveDefinition()} disabled={busy}>
              {busy ? "Saving…" : selectedDefinition === null ? "Save report" : "Save changes"}
            </button>
            {selectedDefinition !== null ? (
              <button
                type="button"
                onClick={() => setDeleteCandidate(selectedDefinition)}
                disabled={busy}
              >
                Delete report
              </button>
            ) : null}
          </div>
        </section>

        <section aria-labelledby="run-heading" style={{ marginTop: "2rem" }}>
          <h2 id="run-heading">Preview and run</h2>
          <p>
            Run a saved definition at its current version. Evaluation plan filters are recorded in
            run audit metadata.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "end" }}>
            <div>
              <label htmlFor="report-format">Export format</label>
              <select
                id="report-format"
                value={format}
                onChange={(event) => setFormat(event.currentTarget.value as ReportFormat)}
              >
                <option value="csv">CSV</option>
                <option value="xlsx">XLSX</option>
              </select>
            </div>
            <div>
              <label htmlFor="evaluation-plan-id">Evaluation plan ID (optional)</label>
              <input
                id="evaluation-plan-id"
                value={evaluationPlanId}
                onChange={(event) => setEvaluationPlanId(event.currentTarget.value)}
                placeholder="plan-2026"
              />
            </div>
            <div>
              <label htmlFor="evaluation-plan-version">Evaluation plan version (optional)</label>
              <input
                id="evaluation-plan-version"
                type="number"
                min={1}
                step={1}
                value={evaluationPlanVersion}
                onChange={(event) => setEvaluationPlanVersion(event.currentTarget.value)}
              />
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginTop: "1rem" }}>
            <button
              type="button"
              onClick={() => void runReport(true)}
              disabled={busy || selectedDefinition === null}
            >
              Preview report
            </button>
            <button
              type="button"
              onClick={() => void runReport(false)}
              disabled={busy || selectedDefinition === null}
            >
              {busy ? "Running…" : "Run and export report"}
            </button>
          </div>
          {previewRun !== null ? (
            <PreviewPanel
              run={previewRun}
              onDownload={() => void downloadRun(previewRun)}
              busy={busy}
            />
          ) : null}
        </section>

        <section aria-labelledby="run-history-heading" style={{ marginTop: "2rem" }}>
          <h2 id="run-history-heading">Run history and audit metadata</h2>
          {visibleRuns.length === 0 ? (
            <p role="status">No runs for this saved report yet.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table>
                <caption>Completed report runs and audit metadata</caption>
                <thead>
                  <tr>
                    <th scope="col">Run</th>
                    <th scope="col">Definition version</th>
                    <th scope="col">Requested</th>
                    <th scope="col">Rows</th>
                    <th scope="col">Audit</th>
                    <th scope="col">Export</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRuns.map((run) => (
                    <tr key={run.id}>
                      <th scope="row">{run.id}</th>
                      <td>{run.definitionVersion}</td>
                      <td>{dateLabel(run.audit.requestedAt)}</td>
                      <td>{run.audit.rowCount}</td>
                      <td>
                        <details>
                          <summary>View audit metadata</summary>
                          <dl>
                            <div>
                              <dt>Requester</dt>
                              <dd>{run.audit.requesterId}</dd>
                            </div>
                            <div>
                              <dt>Event</dt>
                              <dd>{run.audit.eventId}</dd>
                            </div>
                            <div>
                              <dt>Completed</dt>
                              <dd>{dateLabel(run.audit.completedAt)}</dd>
                            </div>
                            <div>
                              <dt>Output digest</dt>
                              <dd>{run.audit.outputDigest}</dd>
                            </div>
                            {run.audit.parameters.evaluationPlanId !== undefined ? (
                              <div>
                                <dt>Evaluation plan</dt>
                                <dd>
                                  {run.audit.parameters.evaluationPlanId} · version{" "}
                                  {run.audit.parameters.evaluationPlanVersion ?? "—"}
                                </dd>
                              </div>
                            ) : null}
                          </dl>
                        </details>
                      </td>
                      <td>
                        <button type="button" onClick={() => void downloadRun(run)} disabled={busy}>
                          {busy
                            ? "Preparing download…"
                            : `Download ${run.export.format.toUpperCase()}`}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {deleteCandidate !== null ? (
        <section
          role="alertdialog"
          aria-labelledby="delete-report-heading"
          aria-describedby="delete-report-help"
          style={{ marginTop: "2rem", border: "2px solid #a33", padding: "1rem" }}
        >
          <h2 id="delete-report-heading">Delete saved report?</h2>
          <p id="delete-report-help">
            This removes “{deleteCandidate.name}” for this event. Existing run audit records remain
            available.
          </p>
          <button type="button" onClick={() => setDeleteCandidate(null)} disabled={busy}>
            Keep report
          </button>{" "}
          <button type="button" onClick={() => void confirmDelete()} disabled={busy}>
            {busy ? "Deleting…" : "Delete saved report"}
          </button>
        </section>
      ) : null}
    </main>
  );
}

function PreviewPanel({
  run,
  onDownload,
  busy,
}: Readonly<{ run: ReportRun; onDownload: () => void; busy: boolean }>) {
  const rows = csvRows(run);
  const header = rows[0] ?? run.export.columns.map(String);
  const values = rows.slice(1).slice(0, 20);
  return (
    <section aria-labelledby="preview-heading" style={{ marginTop: "1.25rem" }}>
      <h3 id="preview-heading">Report preview</h3>
      <p>
        {run.audit.rowCount} rows available. Showing the first {values.length} row
        {values.length === 1 ? "" : "s"}.
      </p>
      <button type="button" onClick={onDownload} disabled={busy}>
        {busy ? "Preparing download…" : `Download ${run.export.format.toUpperCase()}`}
      </button>
      <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
        <table>
          <caption>Preview of {run.export.fileName}</caption>
          <thead>
            <tr>
              {header.map((column) => (
                <th scope="col" key={column}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {values.map((row) => (
              <tr key={`preview-${JSON.stringify(row)}`}>
                {header.map((column, columnIndex) => (
                  <td key={column}>{displayValue(row[columnIndex])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p role="note">
        Run ID {run.id} · output digest {run.audit.outputDigest}
      </p>
    </section>
  );
}

export function ReportsWorkspaceStatus({
  eventId,
  message,
  error = false,
}: Readonly<{ eventId: string; message: string; error?: boolean }>) {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1rem" }}>
      <p style={{ margin: 0, fontSize: "0.8rem", textTransform: "uppercase" }}>{eventId}</p>
      <h1>Reports workspace</h1>
      <section role={error ? "alert" : "status"} aria-labelledby="reports-status-heading">
        <h2 id="reports-status-heading">{error ? "Reports unavailable" : "Reports data"}</h2>
        <p>{message}</p>
      </section>
    </main>
  );
}
