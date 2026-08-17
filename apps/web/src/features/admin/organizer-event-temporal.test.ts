import { describe, expect, it } from "vitest";
import {
  initialCalendarMonth,
  organizerEventIntersectsCalendarDate,
  type OrganizerEventFormValues,
  validateOrganizerEventForm,
} from "./organizer-overview-model";

function values(overrides: Partial<OrganizerEventFormValues> = {}): OrganizerEventFormValues {
  return {
    name: "DST event",
    slug: "dst-event",
    timeZone: "America/Los_Angeles",
    startsAt: "2026-09-17T09:00",
    endsAt: "2026-09-17T17:00",
    dateMode: "range",
    scheduleDates: [],
    venue: "",
    cfpEnabled: false,
    cfpOpensAt: "",
    cfpClosesAt: "",
    defaultCalendarDurationMinutes: "30",
    defaultCalendarTimeZone: "America/Los_Angeles",
    defaultCalendarLocation: "",
    startDisambiguation: undefined,
    endDisambiguation: undefined,
    cfpOpenDisambiguation: undefined,
    cfpCloseDisambiguation: undefined,
    ...overrides,
  };
}

describe("organizer event timezone validation", () => {
  it("rejects a nonexistent event-local start time", () => {
    const result = validateOrganizerEventForm(
      values({
        startsAt: "2026-03-08T02:30",
        endsAt: "2026-03-08T04:00",
      }),
      { allowPastDates: true },
    );

    expect(result.error).toMatch(/does not exist/i);
  });

  it("requires and honors an explicit repeated-time occurrence", () => {
    const ambiguous = validateOrganizerEventForm(
      values({
        startsAt: "2026-11-01T01:30",
        endsAt: "2026-11-01T03:00",
      }),
      { allowPastDates: true },
    );
    const later = validateOrganizerEventForm(
      values({
        startsAt: "2026-11-01T01:30",
        endsAt: "2026-11-01T03:00",
        startDisambiguation: "later",
      }),
      { allowPastDates: true },
    );

    expect(ambiguous.error).toMatch(/occurs twice/i);
    expect(later.input?.startsAt).toBe("2026-11-01T09:30:00.000Z");
  });

  it("preserves exact historical values but rejects a different past date", () => {
    const historical = values({
      startsAt: "2026-08-10T09:00",
      endsAt: "2026-08-10T17:00",
    });
    const currentEvent = {
      startsAt: "2026-08-10T16:00:00.000Z",
      endsAt: "2026-08-11T00:00:00.000Z",
      cfpOpensAt: null,
      cfpClosesAt: null,
    };
    const now = new Date("2026-08-16T12:00:00.000Z");

    expect(validateOrganizerEventForm(historical, { now, currentEvent }).error).toBeUndefined();
    expect(
      validateOrganizerEventForm(
        { ...historical, startsAt: "2026-08-11T09:00" },
        { now, currentEvent },
      ).error,
    ).toMatch(/before today/i);
  });

  it("requires the CFP window to finish before the event begins", () => {
    const result = validateOrganizerEventForm(
      values({
        cfpEnabled: true,
        cfpOpensAt: "2026-09-01T09:00",
        cfpClosesAt: "2026-09-18T09:00",
      }),
    );

    expect(result.error).toMatch(/event begins/i);
  });
});

describe("organizer event calendar dates", () => {
  it.each([
    {
      browserTimeZone: "UTC",
      eventTimeZone: "Pacific/Auckland",
      startsAt: "2027-04-02T20:00:00.000Z",
      endsAt: "2027-04-05T04:00:00.000Z",
      probeDates: ["2027-04-02", "2027-04-03", "2027-04-04", "2027-04-05", "2027-04-06"],
      expectedDates: ["2027-04-03", "2027-04-04", "2027-04-05"],
    },
    {
      browserTimeZone: "Asia/Tokyo",
      eventTimeZone: "America/Los_Angeles",
      startsAt: "2027-05-12T16:00:00.000Z",
      endsAt: "2027-05-14T23:00:00.000Z",
      probeDates: [
        "2027-05-11",
        "2027-05-12",
        "2027-05-13",
        "2027-05-14",
        "2027-05-15",
        "2027-05-16",
      ],
      expectedDates: ["2027-05-12", "2027-05-13", "2027-05-14"],
    },
    {
      browserTimeZone: "Pacific/Honolulu",
      eventTimeZone: "Asia/Tokyo",
      startsAt: "2027-05-12T00:00:00.000Z",
      endsAt: "2027-05-14T07:00:00.000Z",
      probeDates: [
        "2027-05-10",
        "2027-05-11",
        "2027-05-12",
        "2027-05-13",
        "2027-05-14",
        "2027-05-15",
      ],
      expectedDates: ["2027-05-12", "2027-05-13", "2027-05-14"],
    },
    {
      browserTimeZone: "Asia/Tokyo",
      eventTimeZone: "America/Los_Angeles",
      startsAt: "2027-03-13T17:00:00.000Z",
      endsAt: "2027-03-15T23:00:00.000Z",
      probeDates: [
        "2027-03-12",
        "2027-03-13",
        "2027-03-14",
        "2027-03-15",
        "2027-03-16",
        "2027-03-17",
      ],
      expectedDates: ["2027-03-13", "2027-03-14", "2027-03-15"],
    },
  ])(
    "keeps $eventTimeZone dates fixed in a $browserTimeZone browser",
    ({ browserTimeZone, eventTimeZone, startsAt, endsAt, probeDates, expectedDates }) => {
      const originalTimeZone = process.env.TZ;
      process.env.TZ = browserTimeZone;
      try {
        const event = {
          startsAt,
          endsAt,
          timeZone: eventTimeZone,
          scheduleDates: [],
        };

        expect(
          probeDates.filter((date) => organizerEventIntersectsCalendarDate(event, date)),
        ).toEqual(expectedDates);
      } finally {
        if (originalTimeZone === undefined) {
          delete process.env.TZ;
        } else {
          process.env.TZ = originalTimeZone;
        }
      }
    },
  );

  it.each([
    {
      browserTimeZone: "Asia/Tokyo",
      eventTimeZone: "America/Los_Angeles",
      startsAt: "2027-07-01T03:00:00.000Z",
      expectedYear: 2027,
      expectedMonth: 5,
    },
    {
      browserTimeZone: "Pacific/Honolulu",
      eventTimeZone: "Asia/Tokyo",
      startsAt: "2027-01-01T00:00:00.000Z",
      expectedYear: 2027,
      expectedMonth: 0,
    },
  ])(
    "opens the event month for $eventTimeZone in a $browserTimeZone browser",
    ({ browserTimeZone, eventTimeZone, startsAt, expectedYear, expectedMonth }) => {
      const originalTimeZone = process.env.TZ;
      process.env.TZ = browserTimeZone;
      try {
        const event = {
          startsAt,
          status: "draft" as const,
          timeZone: eventTimeZone,
        };
        const month = initialCalendarMonth([event]);

        expect([month.getFullYear(), month.getMonth()]).toEqual([expectedYear, expectedMonth]);
      } finally {
        if (originalTimeZone === undefined) {
          delete process.env.TZ;
        } else {
          process.env.TZ = originalTimeZone;
        }
      }
    },
  );
});
