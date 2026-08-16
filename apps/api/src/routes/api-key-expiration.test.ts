import { describe, expect, it } from "vitest";
import {
  ApiKeyExpirationError,
  normalizeApiKeyExpiration,
  normalizeStoredApiKeyExpiration,
} from "./api-key-expiration";

const now = new Date("2026-08-16T12:00:00.000Z");

describe("API-key expiration service", () => {
  it("preserves no-expiration and normalizes explicit offsets to UTC", () => {
    expect(normalizeApiKeyExpiration(null, now)).toBeNull();
    expect(normalizeApiKeyExpiration("2026-08-16T09:30:00-07:00", now)).toBe(
      "2026-08-16T16:30:00.000Z",
    );
  });

  it.each([
    "2026-08-17",
    "2026-08-17T12:00:00",
    "2026-08-17 12:00:00Z",
    "2027-02-30T12:00:00Z",
    "2026-08-17T12:00:00+14:01",
    "2026-08-17T12:00:00-15:00",
    "not-a-date",
  ])("rejects an invalid or ambiguous supplied instant: %s", (value) => {
    expect(() => normalizeApiKeyExpiration(value, now)).toThrow(ApiKeyExpirationError);
  });

  it.each(["2026-08-16T12:00:00Z", "2026-08-16T11:59:59.999Z"])(
    "requires expiration to be strictly later than the service clock: %s",
    (value) => {
      expect(() => normalizeApiKeyExpiration(value, now)).toThrowError(
        "API key expiration must be in the future.",
      );
    },
  );

  it("normalizes persisted values for API output even after they expire", () => {
    expect(normalizeStoredApiKeyExpiration("2026-08-16T09:30:00-07:00")).toBe(
      "2026-08-16T16:30:00.000Z",
    );
    expect(normalizeStoredApiKeyExpiration(null)).toBeNull();
  });
});
