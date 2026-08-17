import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EventDatePicker } from "./event-date-picker";
import { eventDatesBetween, isEventDateDisabled, toggleEventDate } from "./event-date-picker-model";

describe("event date selection", () => {
  it("expands a continuous range and supports non-consecutive individual days", () => {
    expect(eventDatesBetween("2026-09-17T09:00", "2026-09-20T17:00")).toEqual([
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
    ]);

    const individualDates = toggleEventDate(
      ["2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"],
      "2026-09-18",
    );
    expect(individualDates).toEqual(["2026-09-17", "2026-09-19", "2026-09-20"]);
    expect(toggleEventDate(individualDates, "2026-09-18")).toEqual([
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
    ]);
  });
  it("renders a range-only date-only calendar without event-only controls", () => {
    const markup = renderToStaticMarkup(
      createElement(EventDatePicker, {
        mode: "range",
        startsAt: "2026-08-20",
        endsAt: "2026-08-24",
        scheduleDates: [],
        minimumDateTime: "2026-08-16T00:00",
        minimumEndDate: "2026-08-20",
        dateOnly: true,
        showModeToggle: false,
        showTimeControls: false,
        eyebrow: "CFP schedule",
        title: "When is the CFP open?",
        description: "Choose when applicants can submit proposals.",
        startLabel: "Open",
        endLabel: "Close",
        onChange: () => undefined,
      }),
    );

    expect(markup).toContain("CFP schedule");
    expect(markup).toContain(">Open<");
    expect(markup).toContain(">Close<");
    expect(markup).toContain('data-details-hidden="true"');
    expect(markup).not.toContain("Individual days");
    expect(markup).not.toContain('type="time"');
  });

  it("places a compact clear action under the schedule copy", () => {
    const markup = renderToStaticMarkup(
      createElement(EventDatePicker, {
        mode: "single",
        startsAt: "2026-08-24T17:00",
        endsAt: "2026-08-24T17:00",
        scheduleDates: [],
        clearable: true,
        showModeToggle: false,
        eyebrow: "Plan schedule",
        title: "Overall review deadline",
        description: "Update the deadline without exposing browser-native date controls.",
        onChange: () => undefined,
      }),
    );

    expect(markup).toMatch(
      /headingCopy[\s\S]*Plan schedule[\s\S]*Overall review deadline[\s\S]*Clear date/,
    );
    expect(markup).toContain("clearDate");
    expect(markup).not.toMatch(/headingActions[\s\S]*Clear date/);
  });

  it("disables dates before the minimum and the selected open date while choosing close", () => {
    expect(isEventDateDisabled("2026-08-15", "2026-08-16")).toBe(true);
    expect(isEventDateDisabled("2026-08-16", "2026-08-16")).toBe(false);
    expect(isEventDateDisabled("2026-08-20", "2026-08-16", "2026-08-20", "end")).toBe(true);
    expect(isEventDateDisabled("2026-08-21", "2026-08-16", "2026-08-20", "end")).toBe(false);
    expect(isEventDateDisabled("2026-08-20", "2026-08-16", "2026-08-20", "start")).toBe(false);
  });
});
