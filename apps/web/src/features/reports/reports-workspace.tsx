"use client";

import { useCallback, useMemo, useReducer, useRef } from "react";
import { useOrganizerEventId } from "@/features/admin/organizer-event-workspace";
import { useNavigationDataCache } from "@/lib/navigation-data-cache-provider";
import {
  createReportsApi,
  type ReportDefinition,
  type ReportDefinitionInput,
  type ReportFilter,
  type ReportFormat,
  type ReportRelationship,
  type ReportRun,
  type ReportSort,
  type ReportsApi,
  ReportsApiError,
} from "./api";
import {
  draftFromReportTemplate,
  fieldsForRelationships,
  normalizeDraft,
  normalizeReportsScopeId,
  REPORT_FIELD_ALLOWLIST,
  type ReportsNavigationCacheSnapshot,
  type ReportTemplate,
  reportsNavigationCacheKey,
  reportsNavigationCacheTags,
} from "./reports-workspace-model";
import { ReportsWorkspaceContent } from "./reports-workspace-sections";

export {
  DeleteReportDialog,
  DirtySelectionDialog,
  ReportPreview,
  ReportsWorkspaceStatus,
  UnavailableState,
} from "./reports-workspace-sections";

export interface ReportsWorkspaceProps {
  readonly organizationId: string;
  readonly eventId: string;
  readonly baseUrl?: string;
}

function apiBaseUrl(explicit: string | undefined): string {
  return (explicit ?? "").trim().replace(/\/+$/u, "");
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
type SelectionRequest =
  | { readonly kind: "select"; readonly definition: ReportDefinition }
  | {
      readonly kind: "new";
      readonly draft?: ReportDefinitionInput;
    };
type ReportsWorkspaceState = {
  definitions: readonly ReportDefinition[];
  runs: readonly ReportRun[];
  selectedId: string | null;
  draft: ReportDefinitionInput;
  loading: boolean;
  loadState: "ready" | "empty" | "unavailable";
  loadError: string | null;
  busy: boolean;
  message: string | null;
  requestError: string | null;
  previewRun: ReportRun | null;
  format: ReportFormat;
  evaluationPlanId: string;
  evaluationPlanVersion: string;
  deleteCandidate: ReportDefinition | null;
  deleteError: string | null;
  retryToken: number;
  selectionRequest: SelectionRequest | null;
};

type ReportsWorkspaceAction =
  | {
      type: "snapshot-applied";
      definitions: readonly ReportDefinition[];
      runs: readonly ReportRun[];
    }
  | { type: "load-started"; hasImmediateSnapshot: boolean; retryFresh: boolean }
  | { type: "loading-changed"; loading: boolean }
  | { type: "load-failed"; unavailable: boolean; message: string }
  | { type: "definitions-created"; definition: ReportDefinition; message: string }
  | { type: "definition-updated"; definition: ReportDefinition; message: string }
  | {
      type: "definition-deleted";
      definitionId: string;
      selected: boolean;
      loadState: "ready" | "empty";
      message: string;
    }
  | { type: "selection-applied"; request: SelectionRequest }
  | { type: "selection-requested"; request: SelectionRequest }
  | { type: "selection-cleared" }
  | { type: "draft-replaced"; draft: ReportDefinitionInput }
  | { type: "message-changed"; message: string | null }
  | { type: "request-error-changed"; message: string | null }
  | { type: "load-error-changed"; message: string | null }
  | { type: "busy-changed"; busy: boolean }
  | { type: "preview-changed"; run: ReportRun | null }
  | { type: "format-changed"; format: ReportFormat }
  | { type: "evaluation-plan-id-changed"; value: string }
  | { type: "evaluation-plan-version-changed"; value: string }
  | { type: "delete-requested"; candidate: ReportDefinition }
  | { type: "delete-cleared" }
  | { type: "delete-error-changed"; message: string | null }
  | { type: "run-completed"; run: ReportRun; message: string }
  | { type: "retry" };

function initialReportsWorkspaceState(input: {
  definitions: readonly ReportDefinition[];
  runs: readonly ReportRun[];
  testMode: boolean;
  hasImmediateSnapshot: boolean;
}): ReportsWorkspaceState {
  const first = input.definitions[0];
  return {
    definitions: input.definitions,
    runs: input.runs,
    selectedId: first?.id ?? null,
    draft: first === undefined ? newDraft() : draftFromDefinition(first),
    loading: !input.testMode && !input.hasImmediateSnapshot,
    loadState: input.definitions.length === 0 && input.hasImmediateSnapshot ? "empty" : "ready",
    loadError: null,
    busy: false,
    message: null,
    requestError: null,
    previewRun: null,
    format: "csv",
    evaluationPlanId: "",
    evaluationPlanVersion: "",
    deleteCandidate: null,
    deleteError: null,
    retryToken: 0,
    selectionRequest: null,
  };
}

function reportsWorkspaceReducer(
  state: ReportsWorkspaceState,
  action: ReportsWorkspaceAction,
): ReportsWorkspaceState {
  switch (action.type) {
    case "snapshot-applied": {
      const first = action.definitions[0];
      return {
        ...state,
        definitions: action.definitions,
        runs: action.runs,
        loadState: action.definitions.length === 0 ? "empty" : "ready",
        selectedId: first?.id ?? null,
        draft: first === undefined ? newDraft() : draftFromDefinition(first),
      };
    }
    case "load-started":
      return {
        ...state,
        loading: !action.hasImmediateSnapshot,
        loadState: action.hasImmediateSnapshot ? state.loadState : "ready",
        loadError: null,
        ...(action.retryFresh ? { requestError: null } : {}),
      };
    case "loading-changed":
      return { ...state, loading: action.loading };
    case "load-failed":
      return {
        ...state,
        loadError: action.message,
        loadState: action.unavailable ? "unavailable" : "ready",
        requestError: action.unavailable ? null : action.message,
      };
    case "definitions-created":
      return {
        ...state,
        definitions: [...state.definitions, action.definition],
        selectedId: action.definition.id,
        draft: draftFromDefinition(action.definition),
        loadState: "ready",
        message: action.message,
      };
    case "definition-updated":
      return {
        ...state,
        definitions: state.definitions.map((definition) =>
          definition.id === action.definition.id ? action.definition : definition,
        ),
        draft: draftFromDefinition(action.definition),
        message: action.message,
      };
    case "definition-deleted":
      return {
        ...state,
        definitions: state.definitions.filter(
          (definition) => definition.id !== action.definitionId,
        ),
        ...(action.selected
          ? {
              selectedId: null,
              draft: newDraft(),
              previewRun: null,
              selectionRequest: null,
            }
          : {}),
        deleteCandidate: null,
        loadState: action.loadState,
        message: action.message,
      };
    case "selection-applied": {
      const request = action.request;
      return {
        ...state,
        selectedId: request.kind === "new" ? null : request.definition.id,
        draft:
          request.kind === "new"
            ? (request.draft ?? newDraft())
            : draftFromDefinition(request.definition),
        message: null,
        requestError: null,
        previewRun: null,
        selectionRequest: null,
      };
    }
    case "selection-requested":
      return { ...state, selectionRequest: action.request };
    case "selection-cleared":
      return { ...state, selectionRequest: null };
    case "draft-replaced":
      return { ...state, draft: action.draft, message: null };
    case "message-changed":
      return { ...state, message: action.message };
    case "request-error-changed":
      return { ...state, requestError: action.message };
    case "load-error-changed":
      return { ...state, loadError: action.message };
    case "busy-changed":
      return { ...state, busy: action.busy };
    case "preview-changed":
      return { ...state, previewRun: action.run };
    case "format-changed":
      return { ...state, format: action.format };
    case "evaluation-plan-id-changed":
      return { ...state, evaluationPlanId: action.value };
    case "evaluation-plan-version-changed":
      return { ...state, evaluationPlanVersion: action.value };
    case "delete-requested":
      return {
        ...state,
        deleteCandidate: action.candidate,
        deleteError: null,
        requestError: null,
      };
    case "delete-cleared":
      return { ...state, deleteCandidate: null, deleteError: null };
    case "delete-error-changed":
      return { ...state, deleteError: action.message };
    case "run-completed":
      return {
        ...state,
        runs: [action.run, ...state.runs.filter((candidate) => candidate.id !== action.run.id)],
        previewRun: action.run,
        message: action.message,
      };
    case "retry":
      return { ...state, retryToken: state.retryToken + 1 };
  }
}
async function saveReportDefinition(
  api: ReportsApi | null,
  testMode: boolean,
  draft: ReportDefinitionInput,
  selectedDefinition: ReportDefinition | null,
  definitions: readonly ReportDefinition[],
  eventId: string,
  dispatch: (action: ReportsWorkspaceAction) => void,
  invalidate: () => void,
): Promise<void> {
  if (draft.name.trim().length === 0) {
    dispatch({ type: "request-error-changed", message: "Enter a report name before saving." });
    return;
  }
  if (draft.fields.length === 0) {
    dispatch({
      type: "request-error-changed",
      message: "Select at least one report field before saving.",
    });
    return;
  }
  if (api === null && !testMode) {
    dispatch({ type: "request-error-changed", message: "The reports API is not configured." });
    return;
  }
  dispatch({ type: "busy-changed", busy: true });
  dispatch({ type: "request-error-changed", message: null });
  dispatch({ type: "message-changed", message: null });
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
        dispatch({
          type: "definitions-created",
          definition: created,
          message: "Report saved at version 1.",
        });
        invalidate();
        return;
      }
      const created = await api.createDefinition(draft);
      invalidate();
      dispatch({
        type: "definitions-created",
        definition: created,
        message: `Report saved at version ${created.version}.`,
      });
    } else {
      if (api === null) {
        const updated = {
          ...selectedDefinition,
          ...draft,
          version: selectedDefinition.version + 1,
          updatedAt: new Date().toISOString(),
        } satisfies ReportDefinition;
        dispatch({
          type: "definition-updated",
          definition: updated,
          message: `Report saved at version ${updated.version}.`,
        });
        invalidate();
        return;
      }
      const updated = await api.updateDefinition(selectedDefinition.id, {
        ...draft,
        expectedVersion: selectedDefinition.version,
      });
      invalidate();
      dispatch({
        type: "definition-updated",
        definition: updated,
        message: `Report saved at version ${updated.version}.`,
      });
    }
  } catch (reason: unknown) {
    dispatch({ type: "request-error-changed", message: errorMessage(reason) });
  } finally {
    dispatch({ type: "busy-changed", busy: false });
  }
}

async function deleteReportDefinition(
  api: ReportsApi | null,
  testMode: boolean,
  candidate: ReportDefinition | null,
  selectedId: string | null,
  definitionCount: number,
  deleteInFlightRef: { current: boolean },
  dispatch: (action: ReportsWorkspaceAction) => void,
  invalidate: () => void,
): Promise<void> {
  if (deleteInFlightRef.current) return;
  if (candidate === null) return;
  if (api === null && !testMode) {
    dispatch({ type: "delete-error-changed", message: "The reports API is not configured." });
    return;
  }
  deleteInFlightRef.current = true;
  dispatch({ type: "busy-changed", busy: true });
  dispatch({ type: "delete-error-changed", message: null });
  dispatch({ type: "request-error-changed", message: null });
  try {
    if (api !== null) await api.deleteDefinition(candidate.id, candidate.version);
    invalidate();
    dispatch({
      type: "definition-deleted",
      definitionId: candidate.id,
      selected: selectedId === candidate.id,
      loadState: definitionCount > 1 ? "ready" : "empty",
      message: "Saved report deleted. Existing immutable run audit records remain available.",
    });
  } catch (reason: unknown) {
    dispatch({ type: "delete-error-changed", message: errorMessage(reason) });
  } finally {
    dispatch({ type: "busy-changed", busy: false });
    deleteInFlightRef.current = false;
  }
}

async function runReportRequest(
  api: ReportsApi | null,
  testMode: boolean,
  eventId: string,
  selectedDefinition: ReportDefinition | null,
  format: ReportFormat,
  evaluationPlanId: string,
  evaluationPlanVersion: string,
  preview: boolean,
  dispatch: (action: ReportsWorkspaceAction) => void,
  invalidate: () => void,
): Promise<void> {
  if (selectedDefinition === null) {
    dispatch({ type: "request-error-changed", message: "Save the report before running it." });
    return;
  }
  if (api === null && !testMode) {
    dispatch({ type: "request-error-changed", message: "The reports API is not configured." });
    return;
  }
  const planVersion = evaluationPlanVersion.trim();
  const numericPlanVersion = planVersion.length > 0 ? Number(planVersion) : undefined;
  if (
    numericPlanVersion !== undefined &&
    (!Number.isSafeInteger(numericPlanVersion) || numericPlanVersion < 1)
  ) {
    dispatch({
      type: "request-error-changed",
      message: "Evaluation plan version must be a positive integer.",
    });
    return;
  }
  dispatch({ type: "busy-changed", busy: true });
  dispatch({ type: "request-error-changed", message: null });
  dispatch({ type: "message-changed", message: null });
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
    invalidate();
    dispatch({
      type: "run-completed",
      run,
      message: preview
        ? `Preview generated from report version ${run.definitionVersion}.`
        : `Report run ${run.id} completed with ${run.audit.rowCount} row${run.audit.rowCount === 1 ? "" : "s"}.`,
    });
  } catch (reason: unknown) {
    dispatch({ type: "request-error-changed", message: errorMessage(reason) });
  } finally {
    dispatch({ type: "busy-changed", busy: false });
  }
}

async function downloadReportRun(
  api: ReportsApi | null,
  testMode: boolean,
  run: ReportRun,
  dispatch: (action: ReportsWorkspaceAction) => void,
): Promise<void> {
  if (api === null && !testMode) {
    dispatch({ type: "request-error-changed", message: "The reports API is not configured." });
    return;
  }
  if (typeof document === "undefined") {
    dispatch({ type: "request-error-changed", message: "Report downloads require a browser." });
    return;
  }
  dispatch({ type: "busy-changed", busy: true });
  dispatch({ type: "request-error-changed", message: null });
  dispatch({ type: "message-changed", message: null });
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
    dispatch({ type: "message-changed", message: `${download.fileName} is ready to download.` });
  } catch (reason: unknown) {
    dispatch({ type: "request-error-changed", message: errorMessage(reason) });
  } finally {
    dispatch({ type: "busy-changed", busy: false });
  }
}
function restoreDeleteReportFocus(deleteRestoreRef: { current: HTMLElement | null }): void {
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

function restoreSelectionReportFocus(selectionRestoreRef: { current: HTMLElement | null }): void {
  const trigger = selectionRestoreRef.current;
  selectionRestoreRef.current = null;
  if (trigger?.isConnected) trigger.focus();
}

function applyReportSelection(
  request: SelectionRequest,
  dispatch: (action: ReportsWorkspaceAction) => void,
): void {
  dispatch({ type: "selection-applied", request });
}

function requestReportDefinitionSelection(
  definition: ReportDefinition,
  selectedId: string | null,
  isDirty: boolean,
  trigger: HTMLElement,
  selectionRestoreRef: { current: HTMLElement | null },
  dispatch: (action: ReportsWorkspaceAction) => void,
): void {
  const request: SelectionRequest = { kind: "select", definition };
  if (definition.id === selectedId) return;
  if (isDirty) {
    selectionRestoreRef.current = trigger;
    dispatch({ type: "selection-requested", request });
    return;
  }
  selectionRestoreRef.current = null;
  applyReportSelection(request, dispatch);
}

function requestNewReportDefinition(
  trigger: HTMLElement,
  template: ReportTemplate | undefined,
  selectedId: string | null,
  isDirty: boolean,
  draft: ReportDefinitionInput,
  selectionRestoreRef: { current: HTMLElement | null },
  dispatch: (action: ReportsWorkspaceAction) => void,
): void {
  const nextDraft = template === undefined ? newDraft() : draftFromReportTemplate(template);
  if (selectedId === null && !isDirty && equalDraft(draft, nextDraft)) return;
  const request: SelectionRequest = { kind: "new", draft: nextDraft };
  if (isDirty) {
    selectionRestoreRef.current = trigger;
    dispatch({ type: "selection-requested", request });
    return;
  }
  selectionRestoreRef.current = null;
  applyReportSelection(request, dispatch);
}

function requestReportDelete(
  candidate: ReportDefinition,
  trigger: HTMLElement,
  deleteInFlightRef: { current: boolean },
  deleteRestoreRef: { current: HTMLElement | null },
  dispatch: (action: ReportsWorkspaceAction) => void,
): void {
  if (deleteInFlightRef.current) return;
  deleteRestoreRef.current = trigger;
  dispatch({ type: "delete-requested", candidate });
}

function replaceReportDraft(
  draft: ReportDefinitionInput,
  update: (current: ReportDefinitionInput) => ReportDefinitionInput,
  dispatch: (action: ReportsWorkspaceAction) => void,
): void {
  dispatch({ type: "draft-replaced", draft: normalizeDraft(update(draft)) });
}

function toggleReportRelationship(
  draft: ReportDefinitionInput,
  relationship: ReportRelationship,
  checked: boolean,
  dispatch: (action: ReportsWorkspaceAction) => void,
): void {
  replaceReportDraft(
    draft,
    (current) => {
      const relationships = checked
        ? [...current.relationships, relationship]
        : current.relationships.filter((candidate) => candidate !== relationship);
      const nextFields = checked
        ? [...current.fields, REPORT_FIELD_ALLOWLIST[relationship][0]?.key].filter(
            (field): field is string => field !== undefined,
          )
        : current.fields;
      return { ...current, relationships, fields: nextFields };
    },
    dispatch,
  );
}

function toggleReportField(
  draft: ReportDefinitionInput,
  field: string,
  checked: boolean,
  dispatch: (action: ReportsWorkspaceAction) => void,
): void {
  replaceReportDraft(
    draft,
    (current) => ({
      ...current,
      fields: checked
        ? [...current.fields, field]
        : current.fields.filter((candidate) => candidate !== field),
    }),
    dispatch,
  );
}

function moveReportField(
  draft: ReportDefinitionInput,
  field: string,
  direction: -1 | 1,
  dispatch: (action: ReportsWorkspaceAction) => void,
): void {
  replaceReportDraft(
    draft,
    (current) => {
      const index = current.order.indexOf(field);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.order.length) return current;
      const order = [...current.order];
      const other = order[target];
      if (other === undefined) return current;
      order[index] = other;
      order[target] = field;
      return { ...current, order };
    },
    dispatch,
  );
}

function addReportFilter(
  draft: ReportDefinitionInput,
  dispatch: (action: ReportsWorkspaceAction) => void,
): void {
  const field = draft.fields[0];
  if (field === undefined) return;
  replaceReportDraft(
    draft,
    (current) => ({
      ...current,
      filters: [...current.filters, { field, operator: "eq", value: "" }],
    }),
    dispatch,
  );
}

function updateReportFilter(
  draft: ReportDefinitionInput,
  index: number,
  update: Partial<ReportFilter>,
  filterKeyState: RowKeyState<ReportFilter>,
  dispatch: (action: ReportsWorkspaceAction) => void,
): void {
  replaceReportDraft(
    draft,
    (current) => {
      const currentFilter = current.filters[index];
      if (currentFilter === undefined) return current;
      const nextFilter = { ...currentFilter, ...update };
      carryRowKey(filterKeyState, currentFilter, nextFilter);
      return {
        ...current,
        filters: current.filters.map((filter, filterIndex) =>
          filterIndex === index ? nextFilter : filter,
        ),
      };
    },
    dispatch,
  );
}

function removeReportFilter(
  draft: ReportDefinitionInput,
  index: number,
  dispatch: (action: ReportsWorkspaceAction) => void,
): void {
  replaceReportDraft(
    draft,
    (current) => ({
      ...current,
      filters: current.filters.filter((_, filterIndex) => filterIndex !== index),
    }),
    dispatch,
  );
}

function addReportSort(
  draft: ReportDefinitionInput,
  dispatch: (action: ReportsWorkspaceAction) => void,
): void {
  const field = draft.fields[0];
  if (field === undefined) return;
  replaceReportDraft(
    draft,
    (current) => ({ ...current, sort: [...current.sort, { field, direction: "asc" }] }),
    dispatch,
  );
}

function updateReportSort(
  draft: ReportDefinitionInput,
  index: number,
  update: Partial<ReportSort>,
  sortKeyState: RowKeyState<ReportSort>,
  dispatch: (action: ReportsWorkspaceAction) => void,
): void {
  replaceReportDraft(
    draft,
    (current) => {
      const currentSort = current.sort[index];
      if (currentSort === undefined) return current;
      const nextSort = { ...currentSort, ...update };
      carryRowKey(sortKeyState, currentSort, nextSort);
      return {
        ...current,
        sort: current.sort.map((sort, sortIndex) => (sortIndex === index ? nextSort : sort)),
      };
    },
    dispatch,
  );
}

function removeReportSort(
  draft: ReportDefinitionInput,
  index: number,
  dispatch: (action: ReportsWorkspaceAction) => void,
): void {
  replaceReportDraft(
    draft,
    (current) => ({
      ...current,
      sort: current.sort.filter((_, sortIndex) => sortIndex !== index),
    }),
    dispatch,
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
  const [workspaceState, dispatch] = useReducer(
    reportsWorkspaceReducer,
    {
      definitions: initialDefinitions,
      runs: initialRuns,
      testMode,
      hasImmediateSnapshot,
    },
    initialReportsWorkspaceState,
  );
  const {
    definitions,
    runs,
    selectedId,
    draft,
    loading,
    loadState,
    loadError,
    busy,
    message,
    requestError,
    previewRun,
    format,
    evaluationPlanId,
    evaluationPlanVersion,
    deleteCandidate,
    deleteError,
    retryToken,
    selectionRequest,
  } = workspaceState;
  const deleteRestoreRef = useRef<HTMLElement | null>(null);
  const selectionRestoreRef = useRef<HTMLElement | null>(null);
  const deleteInFlightRef = useRef(false);
  const loadGenerationRef = useRef(0);
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
  const isDirty =
    selectedDefinition === null
      ? !equalDraft(draft, newDraft())
      : !equalDraft(draft, draftFromDefinition(selectedDefinition));

  const applySnapshot = useCallback(
    (snapshot: ReportsNavigationCacheSnapshot): void => {
      dispatch({
        type: "snapshot-applied",
        definitions: snapshot.definitions.filter((definition) => definition.eventId === eventId),
        runs: snapshot.runs.filter((run) => run.eventId === eventId),
      });
    },
    [eventId],
  );

  function invalidateReportsCache(): void {
    loadGenerationRef.current += 1;
    navigationCache?.invalidate(reportsCacheTags);
  }

  function requestSelectDefinition(definition: ReportDefinition, trigger: HTMLElement): void {
    requestReportDefinitionSelection(
      definition,
      selectedId,
      isDirty,
      trigger,
      selectionRestoreRef,
      dispatch,
    );
  }

  function requestNewDefinition(trigger: HTMLElement, template?: ReportTemplate): void {
    requestNewReportDefinition(
      trigger,
      template,
      selectedId,
      isDirty,
      draft,
      selectionRestoreRef,
      dispatch,
    );
  }

  function requestDeleteCandidate(candidate: ReportDefinition, trigger: HTMLElement): void {
    requestReportDelete(candidate, trigger, deleteInFlightRef, deleteRestoreRef, dispatch);
  }

  function updateDraft(update: (current: ReportDefinitionInput) => ReportDefinitionInput): void {
    replaceReportDraft(draft, update, dispatch);
  }

  function toggleRelationship(relationship: ReportRelationship, checked: boolean): void {
    toggleReportRelationship(draft, relationship, checked, dispatch);
  }

  function toggleField(field: string, checked: boolean): void {
    toggleReportField(draft, field, checked, dispatch);
  }

  function moveField(field: string, direction: -1 | 1): void {
    moveReportField(draft, field, direction, dispatch);
  }

  function addFilter(): void {
    addReportFilter(draft, dispatch);
  }

  function updateFilter(index: number, update: Partial<ReportFilter>): void {
    updateReportFilter(draft, index, update, filterKeyState.current, dispatch);
  }

  function removeFilter(index: number): void {
    removeReportFilter(draft, index, dispatch);
  }

  function addSort(): void {
    addReportSort(draft, dispatch);
  }

  function updateSort(index: number, update: Partial<ReportSort>): void {
    updateReportSort(draft, index, update, sortKeyState.current, dispatch);
  }

  function removeSort(index: number): void {
    removeReportSort(draft, index, dispatch);
  }

  async function saveDefinition(): Promise<void> {
    return saveReportDefinition(
      api,
      testMode,
      draft,
      selectedDefinition,
      definitions,
      eventId,
      dispatch,
      invalidateReportsCache,
    );
  }

  async function confirmDelete(): Promise<void> {
    return deleteReportDefinition(
      api,
      testMode,
      deleteCandidate,
      selectedId,
      definitions.length,
      deleteInFlightRef,
      dispatch,
      invalidateReportsCache,
    );
  }

  async function runReport(preview: boolean): Promise<void> {
    return runReportRequest(
      api,
      testMode,
      eventId,
      selectedDefinition,
      format,
      evaluationPlanId,
      evaluationPlanVersion,
      preview,
      dispatch,
      invalidateReportsCache,
    );
  }

  async function downloadRun(run: ReportRun): Promise<void> {
    return downloadReportRun(api, testMode, run, dispatch);
  }

  return (
    <ReportsWorkspaceContent
      api={api}
      testMode={testMode}
      loading={loading}
      loadState={loadState}
      loadError={loadError}
      navigationCache={navigationCache}
      reportsCacheKey={reportsCacheKey}
      reportsCacheTags={reportsCacheTags}
      retryToken={retryToken}
      loadGenerationRef={loadGenerationRef}
      onSnapshot={applySnapshot}
      onLoadStarted={(hasImmediateSnapshot, retryFresh) =>
        dispatch({ type: "load-started", hasImmediateSnapshot, retryFresh })
      }
      onLoadingChange={(nextLoading) => dispatch({ type: "loading-changed", loading: nextLoading })}
      onLoadFailed={(reason) =>
        dispatch({
          type: "load-failed",
          unavailable: isUnavailableError(reason),
          message: errorMessage(reason),
        })
      }
      onRetry={() => dispatch({ type: "retry" })}
      organizationId={organizationId}
      eventId={eventId}
      definitions={definitions}
      runs={runs}
      selectedId={selectedId}
      selectedDefinition={selectedDefinition}
      draft={draft}
      availableFields={availableFields}
      busy={busy}
      message={message}
      requestError={requestError}
      previewRun={previewRun}
      format={format}
      evaluationPlanId={evaluationPlanId}
      evaluationPlanVersion={evaluationPlanVersion}
      deleteCandidate={deleteCandidate}
      deleteError={deleteError}
      selectionRequest={selectionRequest}
      onUseTemplate={(template, trigger) => requestNewDefinition(trigger, template)}
      onNewDefinition={(trigger) => requestNewDefinition(trigger)}
      onSelectDefinition={requestSelectDefinition}
      onDeleteCandidate={requestDeleteCandidate}
      onDraftText={(field, value) => updateDraft((current) => ({ ...current, [field]: value }))}
      onToggleRelationship={toggleRelationship}
      onToggleField={toggleField}
      onMoveField={moveField}
      onAddFilter={addFilter}
      onUpdateFilter={updateFilter}
      onRemoveFilter={removeFilter}
      onAddSort={addSort}
      onUpdateSort={updateSort}
      onRemoveSort={removeSort}
      onEvaluationPlanId={(value) => dispatch({ type: "evaluation-plan-id-changed", value })}
      onEvaluationPlanVersion={(value) =>
        dispatch({ type: "evaluation-plan-version-changed", value })
      }
      onSave={() => void saveDefinition()}
      onDeleteSelected={(trigger) =>
        selectedDefinition && requestDeleteCandidate(selectedDefinition, trigger)
      }
      onFormat={(value) => dispatch({ type: "format-changed", format: value })}
      onPreview={() => void runReport(true)}
      onRun={() => void runReport(false)}
      onDownloadPreview={() => previewRun && void downloadRun(previewRun)}
      onDownloadRun={(run) => void downloadRun(run)}
      onRestoreDeleteFocus={() => restoreDeleteReportFocus(deleteRestoreRef)}
      onDeleteOpenChange={(open) => {
        if (open || busy) return;
        dispatch({ type: "delete-cleared" });
      }}
      onConfirmDelete={() => void confirmDelete()}
      onSelectionOpenChange={(open) => !open && dispatch({ type: "selection-cleared" })}
      onRestoreSelectionFocus={() => restoreSelectionReportFocus(selectionRestoreRef)}
      onDiscardSelection={() =>
        selectionRequest && applyReportSelection(selectionRequest, dispatch)
      }
    />
  );
}
