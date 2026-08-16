import { describe, expect, it } from "vitest";
import {
  type OrganizerEventFormValues,
  validateOrganizerEventForm,
} from "./organizer-overview-model";

function values(overrides: Partial<OrganizerEventFormValues> = {}): OrganizerEventFormValues {
  return {
    name: "DST event",
    slug: "dst-event",
    status: "draft",
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
