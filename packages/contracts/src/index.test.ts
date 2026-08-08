import { describe, expect, it } from "vitest";
import { apiErrorSchema, healthResponseSchema } from "./index";

const traceId = "65f8d9b5-6862-4bbc-973c-f728e9185c22";

describe("foundation contracts", () => {
  it("accepts a complete health response", () => {
    expect(
      healthResponseSchema.parse({
        status: "ok",
        service: "api",
        version: "0.1.0",
        environment: "local",
        timestamp: "2026-08-08T12:00:00.000Z",
        traceId,
      }),
    ).toMatchObject({ status: "ok", service: "api" });
  });

  it("rejects error payloads that can expose arbitrary error codes", () => {
    expect(() =>
      apiErrorSchema.parse({
        error: {
          code: "internal stack trace",
          message: "Unavailable",
          traceId,
        },
      }),
    ).toThrow();
  });
});
