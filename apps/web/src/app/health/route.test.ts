import { apiErrorSchema, healthResponseSchema } from "@open-sessionboard/contracts";
import { describe, expect, it } from "vitest";
import { createWebHealthResponse } from "./route";

const validEnvironment = {
  APP_ENV: "local",
  NEXT_PUBLIC_APP_URL: "http://localhost:3015",
  NEXT_PUBLIC_API_URL: "http://localhost:8787",
};

describe("web health endpoint", () => {
  it("reports a contract-valid response for a configured deployment", async () => {
    const response = createWebHealthResponse(validEnvironment);
    const body = healthResponseSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(body.service).toBe("web");
    expect(response.headers.get("x-request-id")).toBe(body.traceId);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("fails closed without leaking invalid environment values", async () => {
    const response = createWebHealthResponse({
      ...validEnvironment,
      NEXT_PUBLIC_API_URL: "a-secret-but-invalid-value",
    });
    const body = apiErrorSchema.parse(await response.json());

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("CONFIGURATION_ERROR");
    expect(JSON.stringify(body)).not.toContain("a-secret-but-invalid-value");
  });
});
