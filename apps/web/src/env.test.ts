import { describe, expect, it } from "vitest";
import { getInvalidEnvironmentFields, readWebEnvironment } from "./env";

const validEnvironment = {
  APP_ENV: "local",
  NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3015",
};

describe("web environment", () => {
  it("accepts application config without a browser API origin", () => {
    expect(readWebEnvironment(validEnvironment).success).toBe(true);
  });

  it("reports field names without returning invalid values", () => {
    const invalid = {
      ...validEnvironment,
      NEXT_PUBLIC_API_URL: "secret-invalid-value",
      NEXT_PUBLIC_APP_URL: undefined,
    };
    const fields = getInvalidEnvironmentFields(invalid);

    expect(fields).toEqual(["NEXT_PUBLIC_APP_URL"]);
    expect(JSON.stringify(fields)).not.toContain("secret-invalid-value");
  });
});
