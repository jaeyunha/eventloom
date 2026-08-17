import { describe, expect, it } from "vitest";
import {
  getInvalidEnvironmentFields,
  isManagedWebDeployment,
  organizationRequestUrl,
  readWebEnvironment,
  resolveWebDeploymentMode,
} from "./env";

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

  it("treats local as self-hosted and production as managed unless overridden", () => {
    expect(resolveWebDeploymentMode(validEnvironment)).toBe("self-hosted");
    expect(isManagedWebDeployment(validEnvironment)).toBe(false);
    expect(
      isManagedWebDeployment({
        ...validEnvironment,
        APP_ENV: "production",
      }),
    ).toBe(true);
    expect(
      isManagedWebDeployment({
        ...validEnvironment,
        APP_ENV: "production",
        DEPLOYMENT_MODE: "self-hosted",
      }),
    ).toBe(false);
  });

  it("exposes an optional hosted organization-request contact URL", () => {
    expect(organizationRequestUrl(validEnvironment)).toBeNull();
    expect(
      organizationRequestUrl({
        ...validEnvironment,
        ORGANIZATION_REQUEST_URL: "mailto:hello@eventloom.example",
      }),
    ).toBe("mailto:hello@eventloom.example");
  });
});
