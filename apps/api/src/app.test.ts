import { apiErrorSchema, healthResponseSchema } from "@open-sessionboard/contracts";
import { describe, expect, it } from "vitest";
import { type ApiBindings, createApp } from "./app";

const environment: ApiBindings = {
  APP_ENV: "local",
  WEB_ORIGIN: "http://localhost:3015",
};

const requestId = "65f8d9b5-6862-4bbc-973c-f728e9185c22";

describe("API foundation", () => {
  it("serves a contract-valid health response with a stable trace ID", async () => {
    const response = await createApp().request(
      "/api/health",
      { headers: { "x-request-id": requestId } },
      environment,
    );
    const body = healthResponseSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({ service: "api", environment: "local", traceId: requestId });
  });

  it("returns a safe structured error when required configuration is invalid", async () => {
    const response = await createApp().request(
      "/api/health",
      { headers: { "x-request-id": requestId } },
      { APP_ENV: "production", WEB_ORIGIN: "not a URL" },
    );
    const body = apiErrorSchema.parse(await response.json());

    expect(response.status).toBe(503);
    expect(body).toEqual({
      error: {
        code: "CONFIGURATION_ERROR",
        message: "The API environment is not configured.",
        traceId: requestId,
      },
    });
    expect(JSON.stringify(body)).not.toContain("not a URL");
  });

  it("allows credentialed CORS only for the configured web origin", async () => {
    const app = createApp();
    const allowed = await app.request(
      "/api/health",
      { headers: { Origin: environment.WEB_ORIGIN } },
      environment,
    );
    const rejected = await app.request(
      "/api/health",
      { headers: { Origin: "https://attacker.example" } },
      environment,
    );

    expect(allowed.headers.get("access-control-allow-origin")).toBe(environment.WEB_ORIGIN);
    expect(allowed.headers.get("access-control-allow-credentials")).toBe("true");
    expect(rejected.headers.has("access-control-allow-origin")).toBe(false);
  });

  it("uses the same safe error envelope for unknown routes", async () => {
    const response = await createApp().request("/unknown", {}, environment);
    const body = apiErrorSchema.parse(await response.json());

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(response.headers.get("x-request-id")).toBe(body.error.traceId);
  });
});
