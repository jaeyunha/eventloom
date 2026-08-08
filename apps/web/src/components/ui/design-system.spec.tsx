import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppShell, SidebarNavigation } from "../layout";
import { DataTable } from "./data-table";
import { Field, Input } from "./field";
import { applyRichTextCommand } from "./rich-text";
import { filterOptions, SearchableSelect } from "./searchable-select";
import { getStepState, Stepper } from "./stepper";

describe("design system accessibility", () => {
  it("marks step progress with ordered, current, and completed semantics", () => {
    const markup = renderToStaticMarkup(
      createElement(Stepper, {
        currentStep: "submission",
        steps: [
          { id: "welcome", label: "Welcome" },
          { id: "submission", label: "Submission" },
          { id: "review", label: "Review" },
        ],
      }),
    );

    expect(markup).toContain("<ol");
    expect(markup).toContain('aria-current="step"');
    expect(markup).toContain("Complete");
    expect(getStepState(0, 1)).toBe("complete");
    expect(getStepState(1, 1)).toBe("current");
    expect(getStepState(2, 1)).toBe("upcoming");
  });

  it("connects labels, help, validation, and controls", () => {
    const markup = renderToStaticMarkup(
      <Field
        error="A title is required"
        hint="Use a concise title"
        label="Title"
        name="title"
        required
      >
        {(controlProps) => <Input {...controlProps} />}
      </Field>,
    );

    expect(markup).toContain('for="title"');
    expect(markup).toContain('id="title"');
    expect(markup).toContain('aria-describedby="title-hint title-error"');
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('role="alert"');
  });

  it("filters searchable options by labels and descriptions", () => {
    const options = [
      { value: "keynote", label: "Featured Keynote", description: "Main stage" },
      { value: "workshop", label: "Workshop", description: "Hands-on session" },
    ];

    expect(filterOptions(options, "hands-on")).toEqual([options[1]]);
    expect(filterOptions(options, "  KEYNOTE ")).toEqual([options[0]]);

    const markup = renderToStaticMarkup(
      createElement(SearchableSelect, {
        ariaLabel: "Format",
        defaultValue: "workshop",
        name: "format",
        options,
      }),
    );
    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('name="format"');
    expect(markup).toContain('value="workshop"');
  });

  it("applies deterministic rich-text formatting around selections", () => {
    expect(applyRichTextCommand("A useful title", 2, 8, "bold")).toEqual({
      value: "A **useful** title",
      selectionStart: 4,
      selectionEnd: 10,
    });
    expect(applyRichTextCommand("First\nSecond", 0, 12, "numbered-list").value).toBe(
      "1. First\n2. Second",
    );
  });

  it("renders table headers, mobile labels, and empty states", () => {
    const populated = renderToStaticMarkup(
      DataTable({
        caption: "Submission status",
        columns: [
          { id: "title", header: "Title", cell: (row: { title: string }) => row.title },
          { id: "status", header: "Status", cell: (row: { status: string }) => row.status },
        ],
        rows: [{ title: "Open systems", status: "Accepted" }],
        getRowKey: (row) => row.title,
      }),
    );
    expect(populated).toContain('<th scope="col">Title</th>');
    expect(populated).toContain('data-label="Status"');

    const empty = renderToStaticMarkup(
      DataTable({
        caption: "Submission status",
        columns: [{ id: "title", header: "Title", cell: () => null }],
        rows: [],
        getRowKey: () => "unused",
        emptyState: "No submissions yet",
      }),
    );
    expect(empty).toContain("No submissions yet");
  });

  it("provides skip navigation and current-page navigation", () => {
    const sidebar = createElement(SidebarNavigation, {
      sections: [
        {
          label: "Program",
          items: [
            { href: "/admin", label: "Overview", current: true },
            { href: "/admin/agenda", label: "Agenda" },
          ],
        },
      ],
    });
    const markup = renderToStaticMarkup(
      <AppShell sidebar={sidebar}>
        <p>Program content</p>
      </AppShell>,
    );

    expect(markup).toContain('href="#main-content"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('id="main-content"');
  });
});
