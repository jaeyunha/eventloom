import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CfpEditor, summarizeRule } from "./cfp-editor";

describe("CFP editor", () => {
  it("renders an accessible organizer hierarchy and labeled seeded controls", () => {
    const markup = renderToStaticMarkup(createElement(CfpEditor, { eventId: "summit-2026" }));

    expect(markup).toContain("<h1>Configure your call for proposals</h1>");
    expect(markup).toContain('<h2 id="event-details-heading">Event details</h2>');
    expect(markup).toContain('aria-label="Event and CFP configuration"');
    expect(markup).toContain('for="event-name"');
    expect(markup).toContain('for="event-timezone"');
    expect(markup).toContain("Open Sessionboard Summit 2026");
    expect(markup).toContain("America/Los_Angeles");
    expect(markup).toContain("2026-03-31");
  });

  it("exposes useful limits and applicant-facing configuration controls", () => {
    const markup = renderToStaticMarkup(createElement(CfpEditor, { eventId: "summit-2026" }));

    expect(markup).toContain('id="participant-limit"');
    expect(markup).toContain('max="15"');
    expect(markup).toContain("Up to 15 participants");
    expect(markup).toContain('id="form-limit"');
    expect(markup).toContain('max="20"');
    expect(markup).toContain("between 1 and 20 forms");
    expect(markup).toContain("Send reminder emails");
    expect(markup).toContain("Notify admins of new submissions");
    expect(markup).toContain("Tracks");
    expect(markup).toContain("Helpful links");
    expect(markup).toContain("Required");
    expect(markup).toContain("Visible");
  });

  it("shows nested AND/OR condition logic in the rule preview", () => {
    const markup = renderToStaticMarkup(createElement(CfpEditor, { eventId: "summit-2026" }));

    expect(
      summarizeRule({
        type: "group",
        operator: "AND",
        conditions: [
          { type: "condition", field: "Format", operator: "is", value: "Workshop" },
          {
            type: "group",
            operator: "OR",
            conditions: [
              { type: "condition", field: "Track", operator: "is", value: "Community" },
              { type: "condition", field: "Level", operator: "is", value: "Introductory" },
            ],
          },
        ],
      }),
    ).toBe("(Format is Workshop AND (Track is Community OR Level is Introductory))");
    expect(markup).toContain("Nested condition preview");
    expect(markup).toContain("Format");
    expect(markup).toContain("Workshop · 60 minutes");
    expect(markup).toContain("AND");
    expect(markup).toContain("OR");
    expect(markup).toContain("Accessibility notes");
  });

  it("renders a semantic public form preview that mirrors seeded copy and options", () => {
    const markup = renderToStaticMarkup(createElement(CfpEditor, { eventId: "summit-2026" }));

    expect(markup).toContain('<h2 id="public-preview-heading">Public form preview</h2>');
    expect(markup).toContain('aria-label="Public CFP form preview"');
    expect(markup).toContain("Bring your best session to the Summit");
    expect(markup).toContain('id="preview-first-name"');
    expect(markup).toContain('id="preview-track"');
    expect(markup).toContain("Responsible AI");
    expect(markup).toContain("Your proposal is in");
    expect(markup).toContain("This preview uses the current editor state");
  });
});
