import { describe, expect, it } from "vitest";
import { parseCommunicationIdentityEnvironment } from "./env";

describe("communication identity environment", () => {
  it("accepts self-hosted sender identities and a calendar UID domain", () => {
    const result = parseCommunicationIdentityEnvironment({
      AUTH_FROM_EMAIL: "login@mail.example.org",
      SPEAKERS_FROM_EMAIL: "program@mail.example.org",
      CALENDAR_FROM_EMAIL: "calendar@mail.example.org",
      CALENDAR_UID_DOMAIN: "calendar.example.org",
    });

    expect(result).toMatchObject({
      success: true,
      data: {
        AUTH_FROM_EMAIL: "login@mail.example.org",
        SPEAKERS_FROM_EMAIL: "program@mail.example.org",
        CALENDAR_FROM_EMAIL: "calendar@mail.example.org",
        CALENDAR_UID_DOMAIN: "calendar.example.org",
      },
    });
  });

  it.each([
    { CALENDAR_UID_DOMAIN: "https://calendar.example.org" },
    { CALENDAR_UID_DOMAIN: "calendar.example.org/path" },
    { CALENDAR_UID_DOMAIN: "calendar domain.example.org" },
    { CALENDAR_UID_DOMAIN: "" },
  ])("rejects an invalid calendar UID domain: $CALENDAR_UID_DOMAIN", (override) => {
    expect(
      parseCommunicationIdentityEnvironment({
        AUTH_FROM_EMAIL: "login@mail.example.org",
        SPEAKERS_FROM_EMAIL: "program@mail.example.org",
        CALENDAR_FROM_EMAIL: "calendar@mail.example.org",
        CALENDAR_UID_DOMAIN: override.CALENDAR_UID_DOMAIN,
      }).success,
    ).toBe(false);
  });
});
