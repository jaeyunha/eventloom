import { healthResponseSchema } from "@eventloom/contracts";
import { describe, expect, it } from "vitest";
import { createWebHealthResponse } from "./route";

const validEnvironment = {
  APP_ENV: "local",
  NEXT_PUBLIC_APP_URL: "http://localhost:3015",
};

describe("web health endpoint", () => {
  it("reports a contract-valid response without a browser API origin", async () => {
    const response = createWebHealthResponse(validEnvironment);
    const body = healthResponseSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(body.service).toBe("web");
    expect(response.headers.get("x-request-id")).toBe(body.traceId);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("ignores an invalid browser API origin", async () => {
    const invalidApiOrigin = "a-secret-but-invalid-value";
    const response = createWebHealthResponse({
      ...validEnvironment,
      NEXT_PUBLIC_API_URL: invalidApiOrigin,
    });
    const body = healthResponseSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(body.service).toBe("web");
    expect(JSON.stringify(body)).not.toContain(invalidApiOrigin);
  });
});
