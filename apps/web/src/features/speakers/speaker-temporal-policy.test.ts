import { describe, expect, it } from "vitest";
import {
  deadlineTemporalPolicy,
  normalizeEventDateValue,
  travelDateWarnings,
} from "./speaker-temporal-policy";

const event = {
  timeZone: "America/Los_Angeles",
  startsAt: "2026-09-10T16:00:00.000Z",
  endsAt: "2026-09-13T23:00:00.000Z",
};

describe("speaker temporal policy", () => {
  it("uses event-local today as the deadline minimum and preserves an exact historical edit value", () => {
    expect(
      deadlineTemporalPolicy(event, new Date("2026-09-09T06:30:00.000Z"), "2026-09-07"),
    ).toEqual({
      minimumDate: "2026-09-08",
      eventEndDate: "2026-09-13",
      unchangedValues: ["2026-09-07"],
    });
  });

  it("converts legacy timestamps to calendar dates in the event timezone", () => {
    expect(normalizeEventDateValue("2026-09-10T06:30:00.000Z", event.timeZone)).toBe("2026-09-09");
    expect(normalizeEventDateValue("2026-09-10", event.timeZone)).toBe("2026-09-10");
  });

  it("warns without blocking travel before or after the event", () => {
    expect(travelDateWarnings("2026-09-09", "2026-09-14", event)).toEqual([
      "Arrival is before the event starts on 2026-09-10.",
      "Departure is after the event ends on 2026-09-13.",
    ]);
    expect(travelDateWarnings("2026-09-10", "2026-09-13", event)).toEqual([]);
  });
});
