import type { OrganizationEntitlement } from "@eventloom/contracts";
import { describe, expect, it } from "vitest";
import {
  createOrganizationPolicy,
  InMemoryOrganizationEntitlementRepository,
  ManagedOrganizationPolicy,
  type OrganizationPolicyError,
  SelfHostedOrganizationPolicy,
} from "./policy";

const now = new Date("2026-08-17T12:00:00.000Z");

const entitlement = (
  overrides: Partial<OrganizationEntitlement> = {},
): OrganizationEntitlement => ({
  schemaVersion: 1,
  organizationId: "org-a",
  revision: 4,
  state: "active",
  capabilities: ["api"],
  limits: {
    activeEvents: 3,
  },
  notBefore: "2026-08-17T00:00:00.000Z",
  expiresAt: "2027-08-17T00:00:00.000Z",
  ...overrides,
});

describe("organization policy", () => {
  it("composes the policy from deployment mode without billing-provider knowledge", async () => {
    const repository = new InMemoryOrganizationEntitlementRepository([entitlement()]);

    await expect(
      createOrganizationPolicy({ deploymentMode: "managed", repository }).authorizeEventCreation(
        "org-a",
      ),
    ).resolves.toMatchObject({ kind: "entitled" });
    await expect(
      createOrganizationPolicy({
        deploymentMode: "self-hosted",
      }).authorizeEventCreation("org-a"),
    ).resolves.toEqual({ kind: "unrestricted" });
  });

  it("keeps self-hosted event creation independent from managed entitlements", async () => {
    await expect(
      new SelfHostedOrganizationPolicy().authorizeEventCreation("org-a"),
    ).resolves.toEqual({ kind: "unrestricted" });
  });

  it("returns the current managed entitlement for atomic event admission", async () => {
    const repository = new InMemoryOrganizationEntitlementRepository([entitlement()]);
    const policy = new ManagedOrganizationPolicy(repository, { clock: () => now });

    await expect(policy.authorizeEventCreation("org-a")).resolves.toEqual({
      kind: "entitled",
      entitlement: entitlement(),
    });
  });

  it.each([
    {
      name: "missing",
      records: [],
      expectedCode: "ENTITLEMENT_MISSING",
    },
    {
      name: "restricted",
      records: [entitlement({ state: "restricted" })],
      expectedCode: "ORGANIZATION_RESTRICTED",
    },
    {
      name: "not active yet",
      records: [entitlement({ notBefore: "2026-08-18T00:00:00.000Z" })],
      expectedCode: "ENTITLEMENT_NOT_ACTIVE",
    },
    {
      name: "expired",
      records: [entitlement({ expiresAt: "2026-08-17T11:59:59.000Z" })],
      expectedCode: "ENTITLEMENT_EXPIRED",
    },
  ] as const)("denies managed event creation when the entitlement is $name", async (scenario) => {
    const repository = new InMemoryOrganizationEntitlementRepository(scenario.records);
    const policy = new ManagedOrganizationPolicy(repository, { clock: () => now });

    await expect(policy.authorizeEventCreation("org-a")).rejects.toMatchObject({
      code: scenario.expectedCode,
    } satisfies Partial<OrganizationPolicyError>);
  });
});
