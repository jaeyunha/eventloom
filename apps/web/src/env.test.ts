import { describe, expect, it } from "vitest";
import { getInvalidEnvironmentFields, readWebEnvironment } from "./env";

const validEnvironment = {
  APP_ENV: "local",
  NEXT_PUBLIC_APP_URL: "http://localhost:3015",
  NEXT_PUBLIC_API_URL: "http://localhost:8787",
};

describe("web environment", () => {
  it("accepts isolated application URLs", () => {
    expect(readWebEnvironment(validEnvironment).success).toBe(true);
  });

  it("reports field names without returning invalid values", () => {
    const invalid = {
      ...validEnvironment,
      NEXT_PUBLIC_API_URL: "secret-invalid-value",
      NEXT_PUBLIC_APP_URL: undefined,
    };
    const fields = getInvalidEnvironmentFields(invalid);

    expect(fields).toEqual(["NEXT_PUBLIC_API_URL", "NEXT_PUBLIC_APP_URL"]);
    expect(JSON.stringify(fields)).not.toContain("secret-invalid-value");
  });
});
