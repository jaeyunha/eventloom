import { describe, expect, it } from "vitest";
import { eventCfpFromRow } from "./cfp";

const eventRow = {
  id: "event-1",
  organizationId: "organization-1",
  version: 1,
  slug: "future-conf",
  name: "Future Conf",
  timeZone: "UTC",
  startsAt: "2026-11-05T09:00:00.000Z",
  endsAt: "2026-11-07T17:00:00.000Z",
  cfpOpensAt: null,
  cfpClosesAt: null,
};

describe("D1 CFP event mapping", () => {
  it("uses event dates when a new event has no CFP window yet", () => {
    expect(eventCfpFromRow(eventRow)).toMatchObject({
      opensAt: eventRow.startsAt,
      closesAt: eventRow.endsAt,
    });
  });

  it("preserves an explicitly configured CFP window", () => {
    expect(
      eventCfpFromRow({
        ...eventRow,
        cfpOpensAt: "2026-09-01T00:00:00.000Z",
        cfpClosesAt: "2026-10-01T00:00:00.000Z",
      }),
    ).toMatchObject({
      opensAt: "2026-09-01T00:00:00.000Z",
      closesAt: "2026-10-01T00:00:00.000Z",
    });
  });
});
