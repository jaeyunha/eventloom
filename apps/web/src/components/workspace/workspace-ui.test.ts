import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CollectionToolbar,
  Inspector,
  InspectorSection,
  StatusBadge,
  WorkspaceBreadcrumb,
  WorkspaceEmptyState,
  WorkspaceHeader,
  WorkspaceSurface,
} from "./workspace-ui";

describe("workspace UI", () => {
  it("renders a consistent workspace hierarchy", () => {
    const markup = renderToStaticMarkup(
      createElement(
        Fragment,
        null,
        createElement(
          WorkspaceHeader,
          {
            breadcrumb: createElement(WorkspaceBreadcrumb, null, "Organization / Event"),
            title: "Program workspace",
            status: createElement(StatusBadge, { tone: "success" }, "Live"),
            description: "Run the program from intake through publication.",
            actions: createElement("button", { type: "button" }, "Create"),
          },
          createElement(CollectionToolbar, {
            label: "View",
            primary: createElement("button", { type: "button" }, "All work"),
          }),
        ),
        createElement(
          WorkspaceSurface,
          { title: "Needs attention" },
          createElement(WorkspaceEmptyState, {
            title: "Nothing is blocked",
            description: "New issues will appear here.",
          }),
        ),
        createElement(
          Inspector,
          null,
          createElement(InspectorSection, { title: "Details" }, "Owner"),
        ),
      ),
    );

    expect(markup).toContain("<h1");
    expect(markup).toContain("Program workspace");
    expect(markup).toContain("Needs attention");
    expect(markup).toContain("Details");
    expect(markup).toContain("Nothing is blocked");
  });

  it("supports semantic status tones without color-only text", () => {
    const markup = renderToStaticMarkup(
      createElement(
        StatusBadge,
        { tone: "warning", "aria-label": "Status: needs attention" },
        "Needs attention",
      ),
    );

    expect(markup).toContain('aria-label="Status: needs attention"');
    expect(markup).toContain("Needs attention");
  });
});
