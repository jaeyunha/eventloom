import { describe, expect, it } from "vitest";
import {
  analyzeLocalDateTime,
  calendarDateDeadline,
  disambiguationForInstant,
  formatInstantInTimeZone,
  resolveLocalDateTime,
  ZonedDateTimeError,
} from "./temporal";

describe("zoned local date-time resolution", () => {
  it("rejects a nonexistent spring-forward wall time", () => {
    const analysis = analyzeLocalDateTime("2026-03-08T02:30", "America/Los_Angeles");

    expect(analysis.state).toBe("nonexistent");
    expect(() => resolveLocalDateTime("2026-03-08T02:30", "America/Los_Angeles")).toThrowError(
      ZonedDateTimeError,
    );
  });

  it("requires an explicit choice for a repeated fall-back wall time", () => {
    const analysis = analyzeLocalDateTime("2026-11-01T01:30", "America/Los_Angeles");

    expect(analysis.state).toBe("ambiguous");
    if (analysis.state !== "ambiguous") {
      throw new Error("Expected an ambiguous local time.");
    }
    expect(Date.parse(analysis.later.instant) - Date.parse(analysis.earlier.instant)).toBe(
      60 * 60 * 1000,
    );
    expect(() => resolveLocalDateTime("2026-11-01T01:30", "America/Los_Angeles")).toThrowError(
      ZonedDateTimeError,
    );
  });

  it("round-trips explicit earlier and later occurrences without mutation", () => {
    const earlier = resolveLocalDateTime("2026-11-01T01:30", "America/Los_Angeles", "earlier");
    const later = resolveLocalDateTime("2026-11-01T01:30", "America/Los_Angeles", "later");

    expect(formatInstantInTimeZone(earlier.instant, earlier.timeZone)).toBe("2026-11-01T01:30:00");
    expect(formatInstantInTimeZone(later.instant, later.timeZone)).toBe("2026-11-01T01:30:00");
    expect(
      disambiguationForInstant("2026-11-01T01:30", "America/Los_Angeles", earlier.instant),
    ).toBe("earlier");
    expect(disambiguationForInstant("2026-11-01T01:30", "America/Los_Angeles", later.instant)).toBe(
      "later",
    );
  });
});

describe("event-local calendar-date deadlines", () => {
  it.each([
    ["2026-03-08", "2026-03-09T07:00:00.000Z"],
    ["2026-11-01", "2026-11-02T08:00:00.000Z"],
    ["2026-08-08", "2026-08-09T07:00:00.000Z"],
  ])("keeps %s inclusive through local end-of-day", (calendarDate, expectedInstant) => {
    const deadline = calendarDateDeadline(calendarDate, "America/Los_Angeles");

    expect(deadline.instant).toBe(expectedInstant);
    expect(deadline.epochMilliseconds).toBe(new Date(expectedInstant).getTime());
  });

  it.each([
    {
      calendarDate: "2019-09-07",
      timeZone: "America/Santiago",
      expectedInstant: "2019-09-08T04:00:00.000Z",
      expectedLocalDateTime: "2019-09-08T01:00:00",
      expectedPreviousLocalDateTime: "2019-09-07T23:59:59",
    },
    {
      calendarDate: "2011-12-29",
      timeZone: "Pacific/Apia",
      expectedInstant: "2011-12-30T10:00:00.000Z",
      expectedLocalDateTime: "2011-12-31T00:00:00",
      expectedPreviousLocalDateTime: "2011-12-29T23:59:59",
    },
  ])(
    "returns the earliest real instant after $calendarDate in $timeZone",
    ({
      calendarDate,
      timeZone,
      expectedInstant,
      expectedLocalDateTime,
      expectedPreviousLocalDateTime,
    }) => {
      const deadline = calendarDateDeadline(calendarDate, timeZone);

      expect(deadline).toEqual({
        instant: expectedInstant,
        epochMilliseconds: new Date(expectedInstant).getTime(),
      });
      expect(formatInstantInTimeZone(deadline.instant, timeZone)).toBe(expectedLocalDateTime);
      expect(
        formatInstantInTimeZone(new Date(deadline.epochMilliseconds - 1).toISOString(), timeZone),
      ).toBe(expectedPreviousLocalDateTime);
    },
  );

  it.each(["2026-02-30", "2026-8-08", "2026-08-08T00:00:00.000Z"])(
    "rejects a non-strict calendar date: %s",
    (calendarDate) => {
      expect(() => calendarDateDeadline(calendarDate, "America/Los_Angeles")).toThrowError(
        ZonedDateTimeError,
      );
    },
  );
});
