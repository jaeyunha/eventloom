import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EventOverviewWorkspace } from "./event-overview-workspace";

describe("EventOverviewWorkspace", () => {
  it("renders workflow navigation and operational attention", () => {
    const markup = renderToStaticMarkup(
      createElement(EventOverviewWorkspace, {
        organizationId: "local-organization",
        eventId: "demo-event",
      }),
    );

    expect(markup).toContain("Open Sessionboard Conference");
    expect(markup).toContain("Needs attention");
    expect(markup).toContain("Review submissions");
    expect(markup).toContain("/admin/organizations/local-organization/events/demo-event/agenda");
  });
});
