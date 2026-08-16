import { describe, expect, it } from "vitest";
import {
  isTemporalDateDisabled,
  rangeBoundaryTimeBounds,
  temporalConstraintViolation,
  temporalTimeBounds,
} from "./temporal-picker-model";

describe("temporal picker constraints", () => {
  it("enforces full minimum and maximum boundary times", () => {
    const constraints = {
      minimum: "2026-08-16T09:30",
      maximum: "2026-08-20T17:30",
    };

    expect(temporalConstraintViolation("2026-08-16T09:29", constraints)).toBe("before-minimum");
    expect(temporalConstraintViolation("2026-08-16T09:30", constraints)).toBeNull();
    expect(temporalConstraintViolation("2026-08-20T17:30", constraints)).toBeNull();
    expect(temporalConstraintViolation("2026-08-20T17:31", constraints)).toBe("after-maximum");
    expect(temporalTimeBounds("2026-08-16", constraints)).toEqual({
      minimum: "09:30",
    });
    expect(temporalTimeBounds("2026-08-20", constraints)).toEqual({
      maximum: "17:30",
    });
  });

  it("disables dates outside an authoritative non-consecutive schedule", () => {
    const constraints = {
      allowedDates: ["2026-09-01", "2026-09-08", "2026-09-15"],
    };

    expect(isTemporalDateDisabled("2026-09-01", constraints)).toBe(false);
    expect(isTemporalDateDisabled("2026-09-02", constraints)).toBe(true);
    expect(temporalConstraintViolation("2026-09-02T10:00", constraints)).toBe("date-not-allowed");
  });

  it("preserves only the exact unchanged historical value", () => {
    const constraints = {
      minimum: "2026-08-16T00:00",
      unchangedValues: ["2026-08-10T09:00"],
    };

    expect(temporalConstraintViolation("2026-08-10T09:00", constraints)).toBeNull();
    expect(temporalConstraintViolation("2026-08-10T10:00", constraints)).toBe("before-minimum");
    expect(isTemporalDateDisabled("2026-08-10", constraints)).toBe(false);
    expect(isTemporalDateDisabled("2026-08-11", constraints)).toBe(true);
  });

  it("prevents same-day range boundaries from crossing each other", () => {
    const constraints = {
      minimum: "2026-08-16T09:30",
      maximum: "2026-08-16T17:30",
    };

    expect(
      rangeBoundaryTimeBounds(
        "start",
        "2026-08-16",
        "2026-08-16T10:00",
        "2026-08-16T11:00",
        constraints,
      ),
    ).toEqual({ minimum: "09:30", maximum: "10:59" });
    expect(
      rangeBoundaryTimeBounds(
        "end",
        "2026-08-16",
        "2026-08-16T10:00",
        "2026-08-16T11:00",
        constraints,
      ),
    ).toEqual({ minimum: "10:01", maximum: "17:30" });
  });
});
