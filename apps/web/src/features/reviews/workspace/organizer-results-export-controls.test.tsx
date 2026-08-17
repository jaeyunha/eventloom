import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OrganizerResultsExportControls } from "./organizer-results-export-controls";

describe("organizer results export controls", () => {
  it("disables export while the initial request has not returned a run", () => {
    const markup = renderToStaticMarkup(
      createElement(OrganizerResultsExportControls, {
        run: null,
        creating: true,
        requestError: null,
        onExport: vi.fn(),
      }),
    );

    expect(markup).toContain('data-export-state="creating"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("disabled");
  });

  it("marks queued exports busy and prevents duplicate starts", () => {
    const markup = renderToStaticMarkup(
      createElement(OrganizerResultsExportControls, {
        run: {
          id: "export-1",
          status: "queued",
          fileName: "evaluation-plan-1.csv",
          createdAt: "2026-08-16T20:00:00.000Z",
        },
        requestError: null,
        onExport: vi.fn(),
      }),
    );

    expect(markup).toContain('data-export-state="queued"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("disabled");
  });

  it("exposes the durable download only for ready exports", () => {
    const markup = renderToStaticMarkup(
      createElement(OrganizerResultsExportControls, {
        run: {
          id: "export-1",
          status: "ready",
          fileName: "evaluation-plan-1.csv",
          createdAt: "2026-08-16T20:00:00.000Z",
          startedAt: "2026-08-16T20:00:00.500Z",
          completedAt: "2026-08-16T20:00:01.000Z",
          downloadUrl: "/api/admin/evaluations/plans/plan-1/exports/export-1/download",
          rowCount: 1,
        },
        requestError: null,
        onExport: vi.fn(),
      }),
    );

    expect(markup).toContain('data-export-state="ready"');
    expect(markup).toContain(
      'href="/api/admin/evaluations/plans/plan-1/exports/export-1/download"',
    );
    expect(markup).toContain('download="evaluation-plan-1.csv"');
  });

  it("announces failures and exposes an explicit retry action", () => {
    const markup = renderToStaticMarkup(
      createElement(OrganizerResultsExportControls, {
        run: {
          id: "export-1",
          status: "failed",
          fileName: "evaluation-plan-1.csv",
          createdAt: "2026-08-16T20:00:00.000Z",
          startedAt: "2026-08-16T20:00:00.500Z",
          completedAt: "2026-08-16T20:00:01.000Z",
          error: {
            code: "EVALUATION_EXPORT_GENERATION_FAILED",
            message: "Review export source unavailable.",
            retryable: true,
          },
        },
        requestError: null,
        onExport: vi.fn(),
      }),
    );

    expect(markup).toContain('data-export-state="failed"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('data-export-action="retry"');
  });

  it("keeps retry actionable after a queued run status request fails", () => {
    const markup = renderToStaticMarkup(
      createElement(OrganizerResultsExportControls, {
        run: {
          id: "export-1",
          status: "queued",
          fileName: "evaluation-plan-1.csv",
          createdAt: "2026-08-16T20:00:00.000Z",
        },
        creating: false,
        requestError: "The export status request failed.",
        onExport: vi.fn(),
      }),
    );

    expect(markup).toContain('data-export-state="failed"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('data-export-action="retry"');
    expect(markup).not.toMatch(/\sdisabled(?:=|>)/);
  });
});
