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

  it("accepts structured conflict details inside the stable error envelope", () => {
    expect(
      apiErrorSchema.parse({
        error: {
          code: "CONFLICT",
          message: "The contact changed.",
          traceId,
          details: {
            current: {
              id: "contact-1",
              version: 2,
            },
          },
        },
      }),
    ).toMatchObject({
      error: {
        code: "CONFLICT",
        details: {
          current: {
            id: "contact-1",
            version: 2,
          },
        },
      },
    });
  });

  it("accepts coded validation issues inside the stable error envelope", () => {
    expect(
      apiErrorSchema.parse({
        error: {
          code: "VALIDATION_FAILED",
          message: "The CRM request is invalid.",
          traceId,
          details: [
            {
              path: ["body", "email"],
              code: "invalid_format",
              message: "Invalid email address",
            },
          ],
        },
      }),
    ).toMatchObject({
      error: {
        details: [
          {
            code: "invalid_format",
          },
        ],
      },
    });
  });
});
