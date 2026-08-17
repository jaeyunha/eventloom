import type { OrganizationEntitlement } from "@eventloom/contracts";
import { describe, expect, it } from "vitest";
import {
  InMemoryMemberAuthBoundary,
  InMemoryMemberIdentityRepository,
  InMemoryMemberInvitationDelivery,
  InMemoryReviewerPoolRepository,
  MemberService,
} from "../members/service";
import type { ReviewerEventInvitationLifecycle } from "../members/types";

const now = "2026-08-17T12:00:00.000Z";

const reviewerEventInvitations: ReviewerEventInvitationLifecycle = {
  async createReviewerInvitation() {},
  async revokeReviewerInvitationIfUnpooled() {},
  async revokeReviewerInvitationsForMember() {},
};

function fixture() {
  const identity = new InMemoryMemberIdentityRepository({
    users: [
      {
        userId: "customer-owner",
        email: "owner@example.test",
        name: "Customer Owner",
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
  });
  const service = new MemberService(
    {
      identity,
      auth: new InMemoryMemberAuthBoundary({
        baseUrl: "https://eventloom.test/setup",
        clock: () => new Date(now),
        generateToken: () => "unused-token",
      }),
      invitationDelivery: new InMemoryMemberInvitationDelivery(),
      reviewerPools: new InMemoryReviewerPoolRepository(),
      reviewerEventInvitations,
    },
    {
      clock: () => new Date(now),
      generateId: () => "generated-id",
    },
  );
  return { identity, service };
}

const entitlement: OrganizationEntitlement = {
  schemaVersion: 1,
  organizationId: "org-enterprise",
  revision: 1,
  state: "active",
  capabilities: ["api"],
  limits: {
    activeEvents: 1,
  },
  notBefore: now,
  expiresAt: null,
};

describe("organization provisioning", () => {
  it("replays self-hosted organization creation after the service is recreated", async () => {
    const { identity, service } = fixture();
    const actor = {
      kind: "user",
      organizationId: "org-self-hosted",
      userId: "customer-owner",
      role: "owner",
    } as const;
    const input = {
      organizationId: "org-self-hosted",
      slug: "self-hosted",
      name: "Self Hosted",
      idempotencyKey: "self-hosted-bootstrap",
    };
    const created = await service.createOrganization(actor, input, "first-organization");
    const recreatedService = new MemberService(
      {
        identity,
        auth: new InMemoryMemberAuthBoundary({
          baseUrl: "https://eventloom.test/setup",
          clock: () => new Date("2026-08-18T12:00:00.000Z"),
          generateToken: () => "unused-recreated-token",
        }),
        invitationDelivery: new InMemoryMemberInvitationDelivery(),
        reviewerPools: new InMemoryReviewerPoolRepository(),
        reviewerEventInvitations,
      },
      {
        clock: () => new Date("2026-08-18T12:00:00.000Z"),
        generateId: () => "recreated-id",
      },
    );

    await expect(
      recreatedService.createOrganization(actor, input, "existing-owner"),
    ).resolves.toEqual(created);
  });

  it("atomically creates the organization, owner membership, and entitlement", async () => {
    const { identity, service } = fixture();
    const input = {
      organizationId: "org-enterprise",
      slug: "enterprise",
      name: "Enterprise Customer",
      ownerUserId: "customer-owner",
      entitlement,
      idempotencyKey: "provision-customer-1",
    };

    const created = await service.provisionOrganization(input);
    const replay = await service.provisionOrganization(input);

    expect(replay).toEqual(created);
    await expect(identity.getMember("org-enterprise", "customer-owner")).resolves.toMatchObject({
      role: "owner",
    });
    await expect(identity.getEntitlement("org-enterprise")).resolves.toEqual(entitlement);
  });

  it("rejects an entitlement issued for a different organization", async () => {
    const { service } = fixture();

    await expect(
      service.provisionOrganization({
        organizationId: "org-enterprise",
        slug: "enterprise",
        name: "Enterprise Customer",
        ownerUserId: "customer-owner",
        entitlement: {
          ...entitlement,
          organizationId: "org-other",
        },
        idempotencyKey: "provision-mismatch",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
