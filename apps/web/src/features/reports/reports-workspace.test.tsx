import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createReportsApi, type ReportDefinition, type ReportRun } from "./api";
import {
  DeleteReportDialog,
  DirtySelectionDialog,
  ReportPreview,
  ReportsWorkspace,
  ReportsWorkspaceStatus,
  reportsNavigationCacheKey,
  reportsNavigationCacheTags,
  UnavailableState,
} from "./reports-workspace";
import {
  draftFromReportTemplate,
  normalizeDraft,
  REPORT_DIALOG_COPY,
  REPORT_FIELD_ALLOWLIST,
  REPORT_TEMPLATES,
} from "./reports-workspace-model";

const definition: ReportDefinition = {
  id: "definition-1",
  eventId: "event-1",
  name: "Progress report",
  description: "Coverage",
  relationships: ["sessions", "evaluationProgress"],
  fields: ["sessions.id", "sessions.title", "evaluationProgress.completionPercent"],
  order: ["sessions.id", "sessions.title", "evaluationProgress.completionPercent"],
  filters: [],
  sort: [{ field: "sessions.id", direction: "asc" }],
  version: 4,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
};

const run: ReportRun = {
  id: "run-1",
  eventId: "event-1",
  definitionId: "definition-1",
  definitionVersion: 4,
  requesterId: "organizer-1",
  requestedAt: "2026-08-02T01:00:00.000Z",
  completedAt: "2026-08-02T01:00:01.000Z",
  parameters: {
    format: "csv",
    expectedVersion: 4,
    definitionId: "definition-1",
    definitionVersion: 4,
    requestedFilters: [],
    requestedSort: [{ field: "sessions.id", direction: "asc" }],
    evaluationPlanId: "plan-1",
    evaluationPlanVersion: 7,
  },
  export: {
    format: "csv",
    fileName: "progress-report-v4.csv",
    contentType: "text/csv",
    body: "sessions.id,sessions.title,evaluationProgress.completionPercent\nsession-1,Opening session,100",
    columns: ["sessions.id", "sessions.title", "evaluationProgress.completionPercent"],
    rowCount: 1,
    outputDigest: "digest-1",
  },
  audit: {
    requesterId: "organizer-1",
    tenantId: "org-1",
    eventId: "event-1",
    definitionId: "definition-1",
    definitionVersion: 4,
    parameters: {
      format: "csv",
      expectedVersion: 4,
      definitionId: "definition-1",
      definitionVersion: 4,
      requestedFilters: [],
      requestedSort: [],
      evaluationPlanId: "plan-1",
      evaluationPlanVersion: 7,
    },
    requestedAt: "2026-08-02T01:00:00.000Z",
    completedAt: "2026-08-02T01:00:01.000Z",
    outputDigest: "digest-1",
    rowCount: 1,
  },
};
const xlsxRun: ReportRun = {
  ...run,
  id: "run-xlsx",
  parameters: {
    ...run.parameters,
    format: "xlsx",
  },
  export: {
    ...run.export,
    format: "xlsx",
    fileName: "progress-report-v4.xlsx",
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    body: '<?xml version="1.0"?><worksheet><row><c>SpreadsheetML must not be tabulated</c></row></worksheet>',
  },
  audit: {
    ...run.audit,
    parameters: {
      ...run.audit.parameters,
      format: "xlsx",
    },
  },
};

describe("reports API adapter", () => {
  it("lists saved definitions and creates a version-one definition with ordered fields", async () => {
    const calls: Array<{ input: RequestInfo | URL; init: RequestInit | undefined }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return new Response(JSON.stringify({ data: { definitions: [definition] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const api = createReportsApi("https://api.example.test", "org-1", "event-1", fetcher);
    await expect(api.listDefinitions()).resolves.toEqual([definition]);
    await api.createDefinition({
      name: definition.name,
      description: definition.description,
      relationships: definition.relationships,
      fields: definition.fields,
      order: definition.order,
      filters: definition.filters,
      sort: definition.sort,
    });
    expect(String(calls[0]?.input)).toContain("/events/event-1/reports");
    expect(String(calls[1]?.input)).toContain("/events/event-1/reports");
    expect(calls[1]?.init).toMatchObject({ method: "POST", credentials: "include" });
    expect(JSON.parse(String(calls[1]?.init?.body))).toMatchObject({
      fields: definition.fields,
      order: definition.order,
    });
  });
  it("scopes every request to the organization and event and sends field order", async () => {
    const calls: Array<{ input: RequestInfo | URL; init: RequestInit | undefined }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return new Response(JSON.stringify({ data: definition }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const api = createReportsApi("https://api.example.test/", "org/1", "event/1", fetcher);

    await api.updateDefinition("definition/1", {
      expectedVersion: 4,
      name: "Progress report",
      relationships: definition.relationships,
      fields: definition.fields,
      order: definition.order,
      filters: definition.filters,
      sort: definition.sort,
    });

    expect(String(calls[0]?.input)).toBe(
      "https://api.example.test/api/admin/organizations/org%2F1/events/event%2F1/reports/definition%2F1",
    );
    expect(calls[0]?.init).toMatchObject({ method: "PUT", credentials: "include" });
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
      expectedVersion: 4,
      order: definition.order,
    });
  });

  it("preserves version conflicts, run plan version, export, and delete operations", async () => {
    const calls: Array<{ input: RequestInfo | URL; init: RequestInit | undefined }> = [];
    let index = 0;
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      index += 1;
      if (index === 1) {
        return new Response(
          JSON.stringify({ error: { code: "REPORT_CONFLICT", message: "stale version" } }),
          { status: 409, headers: { "content-type": "application/json" } },
        );
      }
      if (index === 2) {
        return new Response(JSON.stringify({ data: run }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      }
      if (index === 3) {
        return new Response("sessions.id\nsession-1", {
          status: 200,
          headers: {
            "content-type": "text/csv",
            "content-disposition": 'attachment; filename="progress.csv"',
            "x-report-run-id": "run-1",
          },
        });
      }
      return new Response(null, { status: 204 });
    };
    const api = createReportsApi("https://api.example.test", "org-1", "event-1", fetcher);

    await expect(
      api.updateDefinition("definition-1", {
        expectedVersion: 3,
        name: "stale",
        relationships: definition.relationships,
        fields: definition.fields,
        order: definition.order,
        filters: [],
        sort: [],
      }),
    ).rejects.toMatchObject({ code: "REPORT_CONFLICT", status: 409 });

    const completed = await api.runDefinition("definition-1", {
      format: "xlsx",
      expectedVersion: 4,
      evaluationPlanId: "plan-1",
      evaluationPlanVersion: 7,
    });
    expect(completed.audit.parameters.evaluationPlanVersion).toBe(7);
    expect(JSON.parse(String(calls[1]?.init?.body))).toMatchObject({
      format: "xlsx",
      expectedVersion: 4,
      evaluationPlanId: "plan-1",
      evaluationPlanVersion: 7,
    });

    const downloaded = await api.download("run-1");
    expect(downloaded).toMatchObject({ fileName: "progress.csv", runId: "run-1" });
    await api.deleteDefinition("definition-1", 4);
    expect(String(calls[3]?.input)).toContain("/reports/definition-1?expectedVersion=4");
    expect(calls[3]?.init).toMatchObject({ method: "DELETE" });
  });

  it("rejects missing event or organization scope instead of guessing it", () => {
    expect(() => createReportsApi("https://api.example.test", " ", "event-1")).toThrow(
      "organization ID is required",
    );
    expect(() => createReportsApi("https://api.example.test", "org-1", " ")).toThrow(
      "event ID is required",
    );
  });
  it("keeps controlled name/source edits safe while CSV and XLSX runs use server responses", async () => {
    const draft = normalizeDraft({
      name: "Evaluation progress",
      description: "",
      relationships: ["sessions", "evaluationProgress"],
      fields: ["sessions.id", "evaluationProgress.completionPercent"],
      order: ["sessions.id", "evaluationProgress.completionPercent"],
      filters: [],
      sort: [],
    });
    expect(draft.name).toBe("Evaluation progress");
    expect(draft.relationships).toEqual(["sessions", "evaluationProgress"]);
    expect(draft.fields).toContain("evaluationProgress.completionPercent");
    const normalized = normalizeDraft({
      name: "Only approved fields survive",
      description: "",
      relationships: ["sessions"],
      fields: ["sessions.id", "evaluationProgress.individualGrade"],
      order: ["evaluationProgress.individualGrade", "sessions.id"],
      filters: [
        { field: "evaluationProgress.individualGrade", operator: "gte", value: 80 },
        { field: "sessions.id", operator: "eq", value: "session-1" },
      ],
      sort: [
        { field: "evaluationProgress.individualGrade", direction: "desc" },
        { field: "sessions.id", direction: "asc" },
      ],
    });
    expect(normalized.fields).toEqual(["sessions.id"]);
    expect(normalized.order).toEqual(["sessions.id"]);
    expect(normalized.filters).toEqual([
      { field: "sessions.id", operator: "eq", value: "session-1" },
    ]);
    expect(normalized.sort).toEqual([{ field: "sessions.id", direction: "asc" }]);

    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (init?.method === "POST") {
        const request = JSON.parse(String(init.body)) as { format: "csv" | "xlsx" };
        const authoritative: ReportRun = {
          ...run,
          parameters: { ...run.parameters, format: request.format },
          export: {
            ...run.export,
            format: request.format,
            fileName: `progress.${request.format}`,
            body: `${request.format}-server-body`,
          },
          output: {
            ...run.export,
            format: request.format,
            fileName: `progress.${request.format}`,
            body: `${request.format}-server-body`,
          },
          audit: {
            ...run.audit,
            parameters: { ...run.audit.parameters, format: request.format },
            outputDigest: `${request.format}-digest`,
          },
        };
        return new Response(JSON.stringify({ data: authoritative }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      }
      const format = url.includes("run-xlsx") ? "xlsx" : "csv";
      return new Response(`${format}-download-body`, {
        status: 200,
        headers: {
          "content-type": format === "xlsx" ? "application/vnd.ms-excel" : "text/csv",
          "content-disposition": `attachment; filename="progress.${format}"`,
          "x-report-run-id": `run-${format}`,
        },
      });
    };

    const api = createReportsApi("https://api.example.test", "org-1", "event-1", fetcher);
    for (const format of ["csv", "xlsx"] as const) {
      const authoritative = await api.runDefinition("definition-1", {
        format,
        expectedVersion: 4,
        evaluationPlanId: "plan-1",
        evaluationPlanVersion: 7,
      });
      expect(authoritative.export.body).toBe(`${format}-server-body`);
      expect(authoritative.parameters.format).toBe(format);
      const downloaded = await api.download(`run-${format}`);
      expect(downloaded.body).toBe(`${format}-download-body`);
      expect(downloaded.fileName).toBe(`progress.${format}`);
    }
    expect(calls.filter((call) => call.init?.method === "POST")).toHaveLength(2);
    expect(calls.filter((call) => call.url.includes("/download"))).toHaveLength(2);
  });

  it("turns nullable report list responses into actionable API errors", async () => {
    const api = createReportsApi(
      "https://api.example.test",
      "org-1",
      "event-1",
      async () =>
        new Response(JSON.stringify({ data: { definitions: null } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    await expect(api.listDefinitions()).rejects.toMatchObject({
      code: "REPORT_INVALID_RESPONSE",
      status: 502,
    });
  });
  it("preserves actionable export failures from the server", async () => {
    const api = createReportsApi(
      "https://api.example.test",
      "org-1",
      "event-1",
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "REPORT_EXPORT_UNAVAILABLE",
              message: "The evaluation data source is unavailable.",
            },
          }),
          { status: 503, headers: { "content-type": "application/json" } },
        ),
    );
    await expect(
      api.runDefinition("definition-1", {
        format: "csv",
        expectedVersion: 4,
      }),
    ).rejects.toMatchObject({
      code: "REPORT_EXPORT_UNAVAILABLE",
      status: 503,
      message: "The evaluation data source is unavailable.",
    });
  });
});

describe("reports workspace", () => {
  it("renders an outcome-first export launchpad with safe builder and audit controls", () => {
    const markup = renderToStaticMarkup(
      createElement(ReportsWorkspace, { organizationId: "org-1", eventId: "event-1" }),
    );

    expect(markup).toContain('data-report-workspace-mode="outcome-first"');
    expect(markup).toContain('data-report-surface="common-exports"');
    expect(markup).toContain('data-report-template-id="program-schedule"');
    expect(markup).toContain('data-report-template-id="speaker-directory"');
    expect(markup).toContain('data-report-template-id="participant-directory"');
    expect(markup).toContain('data-report-template-id="evaluation-progress"');
    expect(markup).toContain('href="/admin/organizations/org-1/events/event-1/reviews"');
    expect(markup).toContain('data-report-builder-step="identity"');
    expect(markup).toContain('data-report-builder-step="sources"');
    expect(markup).toContain('data-report-builder-step="columns"');
    expect(markup).toContain('data-report-builder-step="refinements"');
    expect(markup).toContain('data-report-action="preview"');
    expect(markup).toContain('data-report-action="export"');
    expect(markup).toContain('data-report-audit="output-digest"');
    expect(markup.match(/data-report-action="new"/g)).toHaveLength(1);
    expect(markup).toContain("<caption ");
    expect(markup).toContain('scope="col"');
    expect(markup).toContain('scope="row"');
    expect(markup).not.toContain('aria-label="Reports workspace navigator"');
    expect(markup).not.toContain('aria-label="Switch section"');
    expect(markup).not.toContain("privateNotes");
    expect(markup).not.toContain("individualGrade");
    expect(markup).not.toContain("fileIds");
    expect(markup).not.toContain("email");
  });

  it("builds normalized organizer-safe drafts from every report template", () => {
    expect(REPORT_TEMPLATES.map((template) => template.id)).toEqual([
      "program-schedule",
      "speaker-directory",
      "participant-directory",
      "evaluation-progress",
    ]);

    for (const template of REPORT_TEMPLATES) {
      const draft = draftFromReportTemplate(template);
      const allowedFields = new Set(
        draft.relationships.flatMap((relationship) =>
          REPORT_FIELD_ALLOWLIST[relationship].map((field) => field.key),
        ),
      );

      expect(draft.fields.every((field) => allowedFields.has(field))).toBe(true);
      expect(draft.order.every((field) => allowedFields.has(field))).toBe(true);
      expect(Object.keys(draft).sort()).toEqual([
        "description",
        "fields",
        "filters",
        "name",
        "order",
        "relationships",
        "sort",
      ]);
    }
  });
  it("normalizes reports cache scope keys and isolates event resources", () => {
    expect(reportsNavigationCacheKey(" org-1 ", " event-1 ")).toBe(
      "organization:org-1:event:event-1:reports:workspace",
    );
    expect(reportsNavigationCacheKey("org-1", "event-2")).not.toBe(
      reportsNavigationCacheKey("org-1", "event-1"),
    );
    expect(reportsNavigationCacheTags(" org-1 ", " event-1 ")).toEqual([
      "organization:org-1",
      "event:event-1",
      "reports:event-1",
    ]);
  });

  it("keeps the UI field registry allowlisted and exposes no private evaluator assets", () => {
    const allFields = Object.values(REPORT_FIELD_ALLOWLIST)
      .flat()
      .map((field) => field.key);
    expect(allFields).toContain("sessions.title");
    expect(allFields).toContain("evaluationProgress.completionPercent");
    expect(allFields).not.toContain("participants.email");
    expect(allFields).not.toContain("speakers.email");
    expect(allFields).not.toContain("evaluationProgress.individualGrade");
    expect(allFields.some((field) => field.includes("asset") || field.includes("file"))).toBe(
      false,
    );
  });
  it("renders distinct empty and unavailable states with honest retry semantics", () => {
    const empty = renderToStaticMarkup(
      createElement(ReportsWorkspaceStatus, {
        eventId: "event-empty",
        message: "No saved reports yet.",
      }),
    );
    const unavailable = renderToStaticMarkup(
      createElement(UnavailableState, {
        eventId: "event-error",
        message: "Reports API unavailable.",
        onRetry: () => undefined,
      }),
    );
    const error = renderToStaticMarkup(
      createElement(ReportsWorkspaceStatus, {
        eventId: "event-error",
        message: "Reports API unavailable.",
        error: true,
      }),
    );
    expect(empty).toContain('role="status"');
    expect(empty).toContain("No saved reports yet.");
    expect(unavailable).toContain('role="alert"');
    expect(unavailable).toContain("Reports are unavailable");
    expect(unavailable).toContain("Retry loading reports");
    expect(error).toContain('role="alert"');
    expect(error).toContain("Reports API unavailable.");
  });

  it("keeps saved report definitions and generated export artifacts structurally distinct", () => {
    const workspaceMarkup = renderToStaticMarkup(
      createElement(ReportsWorkspace, { organizationId: "org-1", eventId: "event-1" }),
    );
    const previewMarkup = renderToStaticMarkup(
      createElement(ReportPreview, {
        run,
        busy: false,
        onDownload: () => undefined,
      }),
    );
    expect(workspaceMarkup).toContain('id="saved-reports"');
    expect(workspaceMarkup).toContain('id="report-run-controls"');
    expect(workspaceMarkup).toContain('id="report-history"');
    expect(previewMarkup).toContain('id="report-preview"');
    expect(previewMarkup).toContain('data-report-audit="output-digest"');
    expect(previewMarkup).toContain("<table");
    expect(previewMarkup).toContain("Session ID");
    expect(previewMarkup).toContain("Session title");
    expect(previewMarkup).not.toContain(">sessions.id<");
  });
  it("keeps XLSX runs download-only instead of parsing SpreadsheetML as CSV", () => {
    const markup = renderToStaticMarkup(
      createElement(ReportPreview, {
        run: xlsxRun,
        busy: false,
        onDownload: () => undefined,
      }),
    );
    expect(markup).toContain("Download XLSX");
    expect(markup).toContain("Download only");
    expect(markup).toContain("XLSX previews are download-only");
    expect(markup).not.toContain("<table");
    expect(markup).not.toContain("SpreadsheetML must not be tabulated");
  });

  it("keeps delete failures inside the active gate and wires close focus restoration", () => {
    expect(String(DeleteReportDialog)).toContain("Delete failed");
    expect(String(DeleteReportDialog)).toContain("AlertDescription");
    expect(String(DeleteReportDialog)).toContain("Deleting");
    expect(String(DeleteReportDialog)).toContain("onCloseAutoFocus");
    expect(String(DirtySelectionDialog)).toContain("onCloseAutoFocus");
  });
  it("keeps delete and dirty-selection actions focus-managed and explicit", () => {
    const workspaceMarkup = renderToStaticMarkup(
      createElement(ReportsWorkspace, { organizationId: "org-1", eventId: "event-1" }),
    );
    expect(workspaceMarkup).toContain("Delete");
    expect(REPORT_DIALOG_COPY.deleteTitle).toBe("Delete saved report?");
    expect(REPORT_DIALOG_COPY.deleteCancel).toBe("Keep report");
    expect(REPORT_DIALOG_COPY.deleteAction).toBe("Delete saved report");
    expect(REPORT_DIALOG_COPY.dirtyTitle).toBe("Discard unsaved recipe changes?");
    expect(REPORT_DIALOG_COPY.dirtyCancel).toBe("Keep editing");
    expect(REPORT_DIALOG_COPY.dirtyAction).toBe("Discard changes");
    expect(DeleteReportDialog).toBeTypeOf("function");
    expect(DirtySelectionDialog).toBeTypeOf("function");
    expect(String(DeleteReportDialog)).toContain("AlertDialog");
    expect(String(DirtySelectionDialog)).toContain("AlertDialog");
  });
});
