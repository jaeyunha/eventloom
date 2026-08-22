import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Input } from "./input";
import { TemporalPicker } from "./temporal-picker";

describe("TemporalPicker", () => {
  it("renders one styled date-time selection without a native date dropdown", () => {
    const markup = renderToStaticMarkup(
      createElement(TemporalPicker, {
        id: "review-deadline",
        mode: "single",
        precision: "date-time",
        value: "2026-08-24T17:00",
        label: "Overall review deadline",
        name: "closesAt",
        clearable: true,
        onChange: () => undefined,
      }),
    );

    expect(markup).toContain('data-temporal-picker="single"');
    expect(markup).toContain('name="closesAt"');
    expect(markup).toContain('type="hidden"');
    expect(markup).toContain('id="review-deadline-time"');
    expect(markup).toContain('type="time"');
    expect(markup).not.toContain('type="date"');
    expect(markup).not.toContain('type="datetime-local"');
  });

  it("renders an inline range calendar with distinct boundary controls", () => {
    const markup = renderToStaticMarkup(
      createElement(TemporalPicker, {
        id: "review-round-window",
        mode: "range",
        precision: "date-time",
        startValue: "2026-08-20T09:00",
        endValue: "2026-08-24T17:00",
        startLabel: "Round opens",
        endLabel: "Round closes",
        onChange: () => undefined,
      }),
    );

    expect(markup).toContain('data-temporal-picker="range"');
    expect(markup).toContain('data-boundary-control="start"');
    expect(markup).toContain('data-boundary-control="end"');
    expect(markup).toContain('data-calendar-grid=""');
    expect(markup).not.toContain('type="datetime-local"');
  });

  it("routes shared date inputs through the styled calendar", () => {
    const markup = renderToStaticMarkup(
      createElement(Input, {
        id: "task-due-date",
        type: "date",
        value: "2026-08-24",
        onChange: () => undefined,
      }),
    );

    expect(markup).toContain('data-temporal-picker="single"');
    expect(markup).not.toContain('type="date"');
  });

  it("surfaces an explicit choice for an ambiguous event-local time", () => {
    const markup = renderToStaticMarkup(
      createElement(TemporalPicker, {
        id: "review-fold",
        mode: "single",
        precision: "date-time",
        value: "2026-11-01T01:30",
        label: "Review deadline",
        timeZone: "America/Los_Angeles",
        onChange: () => undefined,
        onDisambiguationChange: () => undefined,
      }),
    );

    expect(markup).toContain('data-temporal-state="ambiguous"');
  });

  it("renders an authoritative instant in the supplied event timezone", () => {
    const markup = renderToStaticMarkup(
      createElement(TemporalPicker, {
        id: "review-later-fold",
        mode: "single",
        precision: "date-time",
        value: "2026-11-01T09:30:00.000Z",
        label: "Review deadline",
        valueTimeZone: "America/Los_Angeles",
        onChange: () => undefined,
      }),
    );

    expect(markup).toContain('value="01:30"');
    expect(markup).toContain('value="later"');
    expect(markup).toContain('aria-pressed="true"');
  });

  it("keeps the configured timezone date in both the field and summary", () => {
    const markup = renderToStaticMarkup(
      createElement(TemporalPicker, {
        id: "review-local-deadline",
        mode: "single",
        precision: "date-time",
        value: "2026-12-01T07:30:00.000Z",
        label: "Review deadline",
        valueTimeZone: "America/Los_Angeles",
        onChange: () => undefined,
      }),
    );

    expect(markup).toContain('value="23:30"');
    expect(markup).toMatch(/Review deadline<\/span><strong>Nov 30<\/strong>/u);
  });
});
