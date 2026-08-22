import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EventDatePicker } from "./event-date-picker";
import { nextRangeSelection } from "./event-date-picker-fields";
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
        mode: "range",
        selectionMode: "single",
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

    expect(markup).toMatch(/Plan schedule[\s\S]*Overall review deadline[\s\S]*Clear date/);
  });

  it("disables dates before the minimum and the selected open date while choosing close", () => {
    expect(isEventDateDisabled("2026-08-15", "2026-08-16")).toBe(true);
    expect(isEventDateDisabled("2026-08-16", "2026-08-16")).toBe(false);
    expect(isEventDateDisabled("2026-08-20", "2026-08-16", "2026-08-20", "end")).toBe(true);
    expect(isEventDateDisabled("2026-08-21", "2026-08-16", "2026-08-20", "end")).toBe(false);
    expect(isEventDateDisabled("2026-08-20", "2026-08-16", "2026-08-20", "start")).toBe(false);
  });
  it("keeps distinct range endpoints across the controlled selection transition", () => {
    const first = nextRangeSelection({
      activeBoundary: "start",
      date: "2026-11-30",
      mode: "range",
      startsAt: "",
      endsAt: "",
      startDate: "",
      endDate: "",
      dateOnly: false,
      defaultStartTime: "09:00",
      defaultEndTime: "17:00",
    });
    expect(first.nextBoundary).toBe("end");
    expect(first.selection.startsAt).toBe("2026-11-30T09:00");
    expect(first.selection.endsAt).toBe("2026-11-30T17:00");

    const controlledRerender = first.selection;
    const second = nextRangeSelection({
      activeBoundary: first.nextBoundary,
      date: "2026-12-01",
      mode: controlledRerender.mode,
      startsAt: controlledRerender.startsAt,
      endsAt: controlledRerender.endsAt,
      startDate: controlledRerender.startsAt.slice(0, 10),
      endDate: controlledRerender.endsAt.slice(0, 10),
      dateOnly: false,
      defaultStartTime: "09:00",
      defaultEndTime: "17:00",
    });
    expect(second.selection.startsAt).toBe("2026-11-30T09:00");
    expect(second.selection.endsAt).toBe("2026-12-01T17:00");
    expect(second.nextBoundary).toBe("start");
  });

  it("preserves the opposite endpoint when editing an existing range", () => {
    const nextStart = nextRangeSelection({
      activeBoundary: "start",
      date: "2026-08-21",
      mode: "range",
      startsAt: "2026-08-20T09:00",
      endsAt: "2026-08-24T17:00",
      startDate: "2026-08-20",
      endDate: "2026-08-24",
      dateOnly: false,
      defaultStartTime: "09:00",
      defaultEndTime: "17:00",
    });
    expect(nextStart.selection.startsAt).toBe("2026-08-21T09:00");
    expect(nextStart.selection.endsAt).toBe("2026-08-24T17:00");

    const nextEnd = nextRangeSelection({
      activeBoundary: "end",
      date: "2026-08-26",
      mode: "range",
      startsAt: nextStart.selection.startsAt,
      endsAt: nextStart.selection.endsAt,
      startDate: "2026-08-21",
      endDate: "2026-08-24",
      dateOnly: false,
      defaultStartTime: "09:00",
      defaultEndTime: "17:00",
    });
    expect(nextEnd.selection.startsAt).toBe("2026-08-21T09:00");
    expect(nextEnd.selection.endsAt).toBe("2026-08-26T17:00");
  });
});
