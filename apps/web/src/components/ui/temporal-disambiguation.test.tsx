import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TemporalDisambiguation } from "./temporal-disambiguation";

describe("temporal disambiguation", () => {
  it("requires an earlier or later choice for a repeated local time", () => {
    const markup = renderToStaticMarkup(
      createElement(TemporalDisambiguation, {
        id: "review-start",
        label: "Review opens",
        localDateTime: "2026-11-01T01:30",
        timeZone: "America/Los_Angeles",
        onChange: vi.fn(),
      }),
    );

    expect(markup).toContain('data-temporal-state="ambiguous"');
    expect(markup).toContain('value="earlier"');
    expect(markup).toContain('value="later"');
  });

  it("reports a nonexistent local time instead of shifting it", () => {
    const markup = renderToStaticMarkup(
      createElement(TemporalDisambiguation, {
        id: "event-start",
        label: "Event starts",
        localDateTime: "2026-03-08T02:30",
        timeZone: "America/Los_Angeles",
        onChange: vi.fn(),
      }),
    );

    expect(markup).toContain('data-temporal-state="nonexistent"');
    expect(markup).toContain('role="alert"');
  });
});
