import { describe, expect, it } from "vitest";
import {
  deploymentModeSchema,
  organizationEntitlementSchema,
  resolveDeploymentMode,
} from "../index";

const entitlement = {
  schemaVersion: 1,
  organizationId: "org-enterprise",
  revision: 3,
  state: "active",
  capabilities: ["api", "webhooks"],
  limits: {
    activeEvents: 12,
  },
  notBefore: "2026-08-17T00:00:00.000Z",
  expiresAt: "2027-08-17T00:00:00.000Z",
} as const;

describe("organization entitlements", () => {
  it("keeps deployment mode independent from the runtime environment", () => {
    expect(deploymentModeSchema.parse("managed")).toBe("managed");
    expect(deploymentModeSchema.parse("self-hosted")).toBe("self-hosted");
    expect(() => deploymentModeSchema.parse("production")).toThrow();
  });

  it("defaults local deployments to self-hosted and hosted environments to managed", () => {
    expect(resolveDeploymentMode("local")).toBe("self-hosted");
    expect(resolveDeploymentMode("staging")).toBe("managed");
    expect(resolveDeploymentMode("production")).toBe("managed");
    expect(resolveDeploymentMode("production", "self-hosted")).toBe("self-hosted");
  });

  it("accepts provider-neutral capabilities and bounded resource limits", () => {
    expect(organizationEntitlementSchema.parse(entitlement)).toEqual(entitlement);
    expect(
      organizationEntitlementSchema.parse({
        ...entitlement,
        limits: { activeEvents: null },
        expiresAt: null,
      }).limits,
    ).toEqual({ activeEvents: null });
  });

  it("rejects billing-provider data and invalid entitlement windows", () => {
    expect(() =>
      organizationEntitlementSchema.parse({
        ...entitlement,
        stripeCustomerId: "cus_123",
      }),
    ).toThrow();
    expect(() =>
      organizationEntitlementSchema.parse({
        ...entitlement,
        limits: { ...entitlement.limits, activeEvents: -1 },
      }),
    ).toThrow();
    expect(() =>
      organizationEntitlementSchema.parse({
        ...entitlement,
        expiresAt: entitlement.notBefore,
      }),
    ).toThrow();
  });
});
