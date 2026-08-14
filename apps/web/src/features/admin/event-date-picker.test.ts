import { describe, expect, it } from "vitest";
import { eventDatesBetween, toggleEventDate } from "./event-date-picker";

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
});
