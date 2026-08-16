import { describe, expect, it } from "vitest";
import { apiKeyExpirationInstant, minimumApiKeyExpirationLocal } from "./api-key-expiration-model";

describe("API-key expiration model", () => {
  it("preserves an unset expiration", () => {
    expect(apiKeyExpirationInstant("", new Date("2026-08-16T12:00:00.000Z"))).toBeNull();
  });

  it("converts a local date-time selection in the browser zone into an explicit UTC instant", () => {
    const result = apiKeyExpirationInstant(
      "2099-08-17T12:30",
      new Date("2026-08-16T12:00:00.000Z"),
      "America/Los_Angeles",
    );

    expect(result).toBe("2099-08-17T19:30:00.000Z");
  });

  it("rejects a repeated fall-back local time instead of silently choosing an occurrence", () => {
    expect(() =>
      apiKeyExpirationInstant(
        "2026-11-01T01:30",
        new Date("2026-08-16T12:00:00.000Z"),
        "America/Los_Angeles",
      ),
    ).toThrowError(
      "The selected local expiration occurs twice in America/Los_Angeles when clocks move back. Choose a different date or time.",
    );
  });

  it("rejects a nonexistent spring-forward local time", () => {
    expect(() =>
      apiKeyExpirationInstant(
        "2026-03-08T02:30",
        new Date("2026-01-01T00:00:00.000Z"),
        "America/Los_Angeles",
      ),
    ).toThrowError(
      "The selected local expiration does not exist in America/Los_Angeles when clocks move forward. Choose a different date or time.",
    );
  });

  it("keeps repeated-looking wall times normal in UTC", () => {
    expect(
      apiKeyExpirationInstant("2026-11-01T01:30", new Date("2026-08-16T12:00:00.000Z"), "UTC"),
    ).toBe("2026-11-01T01:30:00.000Z");
  });

  it.each(["2026-08-17", "not-a-date", "2026-02-30T12:00"])(
    "rejects invalid local date-time input: %s",
    (value) => {
      expect(() =>
        apiKeyExpirationInstant(value, new Date("2026-08-16T12:00:00.000Z"), "UTC"),
      ).toThrowError("Choose a valid expiration date and time.");
    },
  );

  it("rejects an expiration that is not strictly in the future", () => {
    const now = new Date("2026-08-16T12:00:00.000Z");
    expect(() => apiKeyExpirationInstant("2026-08-16T12:00", now, "UTC")).toThrowError(
      "API key expiration must be in the future.",
    );
  });

  it("provides the next whole minute as the picker minimum", () => {
    const now = new Date(2026, 7, 16, 12, 0, 1, 0);
    expect(minimumApiKeyExpirationLocal(now)).toBe("2026-08-16T12:01");
  });
});
