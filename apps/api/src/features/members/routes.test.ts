import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AuthPrincipal } from "../auth/types";
import { createMemberRoutes, type MemberRouteEnvironment } from "./routes";
import {
  InMemoryMemberAuthBoundary,
  InMemoryMemberIdentityRepository,
  InMemoryMemberInvitationDelivery,
  InMemoryReviewerPoolRepository,
  MemberService,
} from "./service";
import type {
  MemberActor,
  MemberAuthBoundary,
  MemberInvitationDelivery,
  MemberRepositorySeed,
  ReviewerEventInvitationLifecycle,
  ReviewerPoolRepository,
} from "./types";

const initialNow = new Date("2026-08-09T12:00:00.000Z");

function actor(
  organizationId = "org-a",
  role: MemberActor["role"] = "owner",
  userId = "owner-a",
): MemberActor {
  return { kind: "user", organizationId, role, userId };
}

function principal(
  organizationId = "org-a",
  role: MemberActor["role"] = "owner",
  userId = "owner-a",
): AuthPrincipal {
  return {
    kind: "user",
    sessionId: `session-${userId}`,
    userId,
    email: `${userId}@example.test`,
    memberships: [{ organizationId, role }],
    speakerGrants: [],
    reviewerGrants: [],
  };
}

function seed(): MemberRepositorySeed {
  return {
    users: [
      {
        userId: "owner-a",
        email: "owner@example.test",
        name: "Owner A",
        emailVerified: true,
        createdAt: initialNow.toISOString(),
        updatedAt: initialNow.toISOString(),
      },
      {
        userId: "owner-b",
        email: "owner-b@example.test",
        name: "Owner B",
        emailVerified: true,
        createdAt: initialNow.toISOString(),
        updatedAt: initialNow.toISOString(),
      },
      {
        userId: "owner-other",
        email: "owner@other.test",
        name: "Other Owner",
        emailVerified: true,
        createdAt: initialNow.toISOString(),
        updatedAt: initialNow.toISOString(),
      },
    ],
    memberships: [
      {
        organizationId: "org-a",
        userId: "owner-a",
        role: "owner",
        createdAt: initialNow.toISOString(),
        updatedAt: initialNow.toISOString(),
      },
      {
        organizationId: "org-a",
        userId: "owner-b",
        role: "owner",
        createdAt: initialNow.toISOString(),
        updatedAt: initialNow.toISOString(),
      },
      {
        organizationId: "org-b",
        userId: "owner-other",
        role: "owner",
        createdAt: initialNow.toISOString(),
        updatedAt: initialNow.toISOString(),
      },
    ],
  };
}

function invitationLifecycle() {
  const created: Parameters<ReviewerEventInvitationLifecycle["createReviewerInvitation"]>[0][] = [];
  const revokedIfUnpooled: Parameters<
    ReviewerEventInvitationLifecycle["revokeReviewerInvitationIfUnpooled"]
  >[0][] = [];
  const revokedForMembers: Parameters<
    ReviewerEventInvitationLifecycle["revokeReviewerInvitationsForMember"]
  >[0][] = [];
  const lifecycle: ReviewerEventInvitationLifecycle = {
    async createReviewerInvitation(input) {
      created.push(input);
    },
    async revokeReviewerInvitationIfUnpooled(input) {
      revokedIfUnpooled.push(input);
    },
    async revokeReviewerInvitationsForMember(input) {
      revokedForMembers.push(input);
    },
  };
  return { lifecycle, created, revokedIfUnpooled, revokedForMembers };
}

function fixture() {
  let id = 0;
  const identity = new InMemoryMemberIdentityRepository(seed());
  const auth = new InMemoryMemberAuthBoundary({
    baseUrl: "https://eventloom.test/member-setup",
    clock: () => new Date(initialNow),
    generateToken: () => `secret-token-${++id}`,
  });
  const delivery = new InMemoryMemberInvitationDelivery();
  const pools = new InMemoryReviewerPoolRepository();
  const reviewerEventInvitations = invitationLifecycle();
  const service = new MemberService(
    {
      identity,
      auth,
      invitationDelivery: delivery,
      reviewerPools: pools,
      reviewerEventInvitations: reviewerEventInvitations.lifecycle,
    },
    {
      clock: () => new Date(initialNow),
      generateId: () => `generated-${++id}`,
    },
  );
  return { identity, auth, delivery, pools, reviewerEventInvitations, service };
}

function appFor(
  service: MemberService,
  currentPrincipal: AuthPrincipal | null = principal(),
): Hono<MemberRouteEnvironment> {
  const app = new Hono<MemberRouteEnvironment>();
  app.use("*", async (context, next) => {
    context.set("traceId", "trace-members");
    context.set("authPrincipal", currentPrincipal);
    await next();
  });
  app.route("/api/admin/organizations/:organizationId/members", createMemberRoutes({ service }));
  return app;
}

async function data<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as { data: T };
  return payload.data;
}

async function error(response: Response): Promise<{ code: string; message: string }> {
  const payload = (await response.json()) as { error: { code: string; message: string } };
  return payload.error;
}

describe("member provisioning service", () => {
  it("issues one idempotent setup link without retaining the plaintext token", async () => {
    const { service, auth, delivery, identity } = fixture();
    const first = await service.inviteMember(actor(), {
      organizationId: "org-a",
      email: "Reviewer@Example.test",
      name: "Review Person",
      role: "reviewer",
      idempotencyKey: "reviewer-1",
    });
    expect(first.created).toBe(true);
    expect(delivery.messages).toHaveLength(1);
    const invitationId = first.invitation?.id;
    expect(invitationId).toBeDefined();
    const stored = auth.storedSetupLink(invitationId as string);
    expect(stored).toEqual(
      expect.objectContaining({ tokenDigest: expect.any(String), usedAt: null }),
    );
    const setupUrl = delivery.messages[0]?.setupUrl;
    expect(setupUrl).toContain("token=");
    const plaintextToken = new URL(setupUrl ?? "").searchParams.get("token");
    expect(plaintextToken).toBeTruthy();
    expect(stored?.tokenDigest).not.toBe(plaintextToken);
    expect(stored).not.toHaveProperty("token");
    const replay = await service.inviteMember(actor(), {
      organizationId: "org-a",
      email: "reviewer@example.test",
      name: "Review Person",
      role: "reviewer",
      idempotencyKey: "reviewer-1",
    });
    expect(replay.created).toBe(false);
    expect(replay).not.toHaveProperty("setupUrl");
    expect(delivery.messages).toHaveLength(1);
    expect(await identity.getMember("org-a", first.member.userId)).toBeNull();
    await expect(
      service.inviteMember(actor(), {
        organizationId: "org-a",
        email: "other@example.test",
        name: "Review Person",
        role: "reviewer",
        idempotencyKey: "reviewer-1",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
  });

  it("keeps an existing verified user out of the organization until activation", async () => {
    const verifiedUser = {
      userId: "verified-speaker",
      email: "verified-speaker@example.test",
      name: "Verified Speaker",
      emailVerified: true,
      createdAt: initialNow.toISOString(),
      updatedAt: initialNow.toISOString(),
    };
    const identity = new InMemoryMemberIdentityRepository({
      ...seed(),
      users: [...(seed().users ?? []), verifiedUser],
    });
    const auth = new InMemoryMemberAuthBoundary({
      baseUrl: "https://eventloom.test/member-setup",
      clock: () => new Date(initialNow),
      generateToken: () => "verified-user-token",
    });
    const delivery = new InMemoryMemberInvitationDelivery();
    const service = new MemberService({
      identity,
      auth,
      invitationDelivery: delivery,
      reviewerPools: new InMemoryReviewerPoolRepository(),
      reviewerEventInvitations: invitationLifecycle().lifecycle,
    });

    const invited = await service.inviteMember(actor(), {
      organizationId: "org-a",
      email: verifiedUser.email,
      name: verifiedUser.name,
      role: "reviewer",
      idempotencyKey: "verified-user-invite",
    });

    expect(invited.member).toMatchObject({ emailVerified: true, status: "pending" });
    expect(await identity.getMember("org-a", verifiedUser.userId)).toBeNull();

    await service.activateMember({
      organizationId: "org-a",
      token: delivery.messages[0]?.setupUrl ?? "",
      password: "StrongPass1!",
    });

    expect(await identity.getMember("org-a", verifiedUser.userId)).toMatchObject({
      role: "reviewer",
      status: "active",
    });
  });

  it("retries delivery with the same idempotency key after a transient send failure", async () => {
    const identity = new InMemoryMemberIdentityRepository(seed());
    const auth = new InMemoryMemberAuthBoundary({
      baseUrl: "https://eventloom.test/member-setup",
      clock: () => new Date(initialNow),
    });
    const delivered = new InMemoryMemberInvitationDelivery();
    let failDelivery = true;
    const delivery: MemberInvitationDelivery = {
      async sendMemberInvitation(input) {
        if (failDelivery) {
          failDelivery = false;
          throw new Error("transient delivery failure");
        }
        await delivered.sendMemberInvitation(input);
      },
    };
    const service = new MemberService({
      identity,
      auth,
      invitationDelivery: delivery,
      reviewerPools: new InMemoryReviewerPoolRepository(),
      reviewerEventInvitations: invitationLifecycle().lifecycle,
    });
    const input = {
      organizationId: "org-a",
      email: "retry-delivery@example.test",
      name: "Retry Delivery",
      role: "reviewer" as const,
      idempotencyKey: "retry-delivery-key",
    };

    await expect(service.inviteMember(actor(), input)).rejects.toThrow(
      "transient delivery failure",
    );
    const replay = await service.inviteMember(actor(), input);

    expect(replay.created).toBe(false);
    expect(replay).not.toHaveProperty("setupUrl");
    expect(delivered.messages).toHaveLength(1);
    expect(await identity.getMember("org-a", replay.member.userId)).toBeNull();
  });

  it("keeps the setup token retryable when activation fails before finalization", async () => {
    const identity = new InMemoryMemberIdentityRepository(seed());
    const underlyingAuth = new InMemoryMemberAuthBoundary({
      baseUrl: "https://eventloom.test/member-setup",
      clock: () => new Date(initialNow),
      generateToken: () => "resumable-activation-token",
    });
    let failSessionRevocation = true;
    const auth: MemberAuthBoundary = {
      issueSetupLink: (input) => underlyingAuth.issueSetupLink(input),
      consumeSetupLink: (token, organizationId) =>
        underlyingAuth.consumeSetupLink(token, organizationId),
      finalizeSetupLink: (claim) => underlyingAuth.finalizeSetupLink(claim),
      establishPassword: (userId, password) => underlyingAuth.establishPassword(userId, password),
      async revokeSessions(userId) {
        if (failSessionRevocation) {
          failSessionRevocation = false;
          throw new Error("transient session failure");
        }
        await underlyingAuth.revokeSessions(userId);
      },
    };
    const delivery = new InMemoryMemberInvitationDelivery();
    const service = new MemberService({
      identity,
      auth,
      invitationDelivery: delivery,
      reviewerPools: new InMemoryReviewerPoolRepository(),
      reviewerEventInvitations: invitationLifecycle().lifecycle,
    });
    const invited = await service.inviteMember(actor(), {
      organizationId: "org-a",
      email: "resumable@example.test",
      name: "Resumable Evaluator",
      role: "reviewer",
      idempotencyKey: "resumable-activation",
    });
    const setupUrl = delivery.messages[0]?.setupUrl ?? "";

    await expect(
      service.activateMember({
        organizationId: "org-a",
        token: setupUrl,
        password: "StrongPass1!",
      }),
    ).rejects.toThrow("transient session failure");
    expect(underlyingAuth.storedSetupLink(invited.invitation?.id ?? "")?.usedAt).toBeNull();
    await expect(
      service.activateMember({
        organizationId: "org-a",
        token: setupUrl,
        password: "DifferentStrong2!",
      }),
    ).rejects.toMatchObject({ code: "INVITATION_INVALID", status: 400 });
    expect(underlyingAuth.storedSetupLink(invited.invitation?.id ?? "")?.usedAt).toBeNull();

    const activated = await service.activateMember({
      organizationId: "org-a",
      token: setupUrl,
      password: "StrongPass1!",
    });

    expect(activated.member).toMatchObject({ role: "reviewer", status: "active" });
    expect(underlyingAuth.storedSetupLink(invited.invitation?.id ?? "")?.usedAt).not.toBeNull();
  });
  it("creates requested roles while preventing administrator escalation", async () => {
    const { service, delivery } = fixture();
    const invitedAdmin = await service.inviteMember(actor(), {
      organizationId: "org-a",
      email: "admin-member@example.test",
      name: "Admin Member",
      role: "admin",
      idempotencyKey: "role-admin-1",
    });
    expect(invitedAdmin.member.role).toBe("admin");
    expect(delivery.messages[0]?.role).toBe("admin");

    const invitedReviewer = await service.inviteMember(actor("org-a", "admin", "owner-a"), {
      organizationId: "org-a",
      email: "admin-reviewer@example.test",
      name: "Admin Reviewer",
      role: "reviewer",
      idempotencyKey: "role-reviewer-1",
    });
    expect(invitedReviewer.member.role).toBe("reviewer");
    expect(delivery.messages[1]?.role).toBe("reviewer");

    await expect(
      service.inviteMember(actor("org-a", "admin", "owner-a"), {
        organizationId: "org-a",
        email: "admin-owner@example.test",
        name: "Admin Owner",
        role: "owner",
        idempotencyKey: "role-owner-denied",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("saves an unverified pending reviewer pool without attempting a database invitation", async () => {
    const { auth, delivery, identity, pools } = fixture();
    let poolSaved = false;
    let invitationAttempted = false;
    const reviewerPools: ReviewerPoolRepository = {
      getReviewerPool: pools.getReviewerPool.bind(pools),
      async saveReviewerPool(pool, expectedVersion) {
        await pools.saveReviewerPool(pool, expectedVersion);
        poolSaved = true;
      },
    };
    const reviewerEventInvitations: ReviewerEventInvitationLifecycle = {
      async createReviewerInvitation() {
        invitationAttempted = true;
        throw new Error("An unverified account cannot have a database invitation yet.");
      },
      async revokeReviewerInvitationIfUnpooled() {},
      async revokeReviewerInvitationsForMember() {},
    };
    const service = new MemberService(
      {
        identity,
        auth,
        invitationDelivery: delivery,
        reviewerPools,
        reviewerEventInvitations,
      },
      {
        clock: () => new Date(initialNow),
        generateId: () => "generated-pending-reviewer",
      },
    );
    const invited = await service.inviteMember(actor(), {
      organizationId: "org-a",
      email: "reviewer@example.test",
      name: "Review Person",
      role: "reviewer",
      idempotencyKey: "pending-reviewer",
    });

    await expect(
      service.setReviewerPool(actor(), {
        organizationId: "org-a",
        eventId: "event-a",
        roundId: "round-1",
        reviewerIds: [invited.member.userId],
        maxAssignmentsPerReviewer: 2,
      }),
    ).resolves.toMatchObject({
      reviewerIds: [invited.member.userId],
      grants: [{ reviewerId: invited.member.userId, maxAssignments: 2, assignedCount: 0 }],
    });

    expect(poolSaved).toBe(true);
    expect(invitationAttempted).toBe(false);
    expect(await identity.getMember("org-a", invited.member.userId)).toBeNull();
    expect(auth.hasEstablishedPassword(invited.member.userId)).toBe(false);
    expect(auth.storedSetupLink(invited.invitation?.id ?? "")?.usedAt).toBeNull();
  });

  it("delegates multi-round invitation retention to exact-event lifecycle operations", async () => {
    const { service, delivery, pools, reviewerEventInvitations } = fixture();
    await service.inviteMember(actor(), {
      organizationId: "org-a",
      email: "multi-round-reviewer@example.test",
      name: "Multi Round Reviewer",
      role: "reviewer",
      idempotencyKey: "multi-round-reviewer",
    });
    const active = await service.activateMember({
      organizationId: "org-a",
      token: delivery.messages[0]?.setupUrl ?? "",
      password: "StrongPass1!",
    });
    const poolOne = await service.setReviewerPool(actor(), {
      organizationId: "org-a",
      eventId: "event-a",
      roundId: "round-1",
      reviewerIds: [active.member.userId],
      maxAssignmentsPerReviewer: 2,
    });
    await service.setReviewerPool(actor(), {
      organizationId: "org-a",
      eventId: "event-a",
      roundId: "round-2",
      reviewerIds: [active.member.userId],
      maxAssignmentsPerReviewer: 2,
    });
    const replayed = await service.setReviewerPool(actor(), {
      organizationId: "org-a",
      eventId: "event-a",
      roundId: "round-1",
      reviewerIds: [active.member.userId],
      maxAssignmentsPerReviewer: 2,
      expectedVersion: poolOne.version,
    });

    const removed = await service.setReviewerPool(actor(), {
      organizationId: "org-a",
      eventId: "event-a",
      roundId: "round-1",
      reviewerIds: [],
      expectedVersion: replayed.version,
    });
    const readded = await service.setReviewerPool(actor(), {
      organizationId: "org-a",
      eventId: "event-a",
      roundId: "round-1",
      reviewerIds: [active.member.userId],
      maxAssignmentsPerReviewer: 2,
      expectedVersion: removed.version,
    });

    expect(readded.version).toBe(4);
    expect(reviewerEventInvitations.created.map(({ idempotencyKey }) => idempotencyKey)).toEqual([
      `reviewer-event:org-a\u0000event-a\u0000round-1\u0000${active.member.userId}\u00001`,
      `reviewer-event:org-a\u0000event-a\u0000round-2\u0000${active.member.userId}\u00001`,
      `reviewer-event:org-a\u0000event-a\u0000round-1\u0000${active.member.userId}\u00004`,
    ]);
    expect(reviewerEventInvitations.revokedIfUnpooled).toEqual([
      {
        organizationId: "org-a",
        eventId: "event-a",
        excludedRoundId: "round-1",
        recipientUserId: active.member.userId,
        revokedByUserId: "owner-a",
        revokedAt: initialNow.toISOString(),
      },
    ]);
    expect(reviewerEventInvitations.revokedForMembers).toEqual([]);
    await expect(pools.getReviewerPool("org-a", "event-a", "round-2")).resolves.toMatchObject({
      reviewerIds: [active.member.userId],
    });
  });

  it("keeps the reviewer pool unchanged when invitation revocation fails", async () => {
    const { service, identity, auth, delivery, pools } = fixture();
    await service.inviteMember(actor(), {
      organizationId: "org-a",
      email: "pool-revocation-failure@example.test",
      name: "Pool Revocation Failure",
      role: "reviewer",
      idempotencyKey: "pool-revocation-failure",
    });
    const active = await service.activateMember({
      organizationId: "org-a",
      token: delivery.messages[0]?.setupUrl ?? "",
      password: "StrongPass1!",
    });
    const current = await service.setReviewerPool(actor(), {
      organizationId: "org-a",
      eventId: "event-a",
      roundId: "round-1",
      reviewerIds: [active.member.userId],
      maxAssignmentsPerReviewer: 2,
    });
    let saveAttempted = false;
    const reviewerPools: ReviewerPoolRepository = {
      getReviewerPool: pools.getReviewerPool.bind(pools),
      async saveReviewerPool(pool, expectedVersion) {
        saveAttempted = true;
        await pools.saveReviewerPool(pool, expectedVersion);
      },
    };
    const guarded = new MemberService(
      {
        identity,
        auth,
        invitationDelivery: delivery,
        reviewerPools,
        reviewerEventInvitations: {
          async createReviewerInvitation() {},
          async revokeReviewerInvitationIfUnpooled() {
            throw new Error("event invitation revocation failed");
          },
          async revokeReviewerInvitationsForMember() {},
        },
      },
      {
        clock: () => new Date(initialNow),
        generateId: () => "pool-revocation-failure-id",
      },
    );

    await expect(
      guarded.setReviewerPool(actor(), {
        organizationId: "org-a",
        eventId: "event-a",
        roundId: "round-1",
        reviewerIds: [],
        expectedVersion: current.version,
      }),
    ).rejects.toThrow("event invitation revocation failed");

    expect(saveAttempted).toBe(false);
    await expect(pools.getReviewerPool("org-a", "event-a", "round-1")).resolves.toMatchObject({
      version: current.version,
      reviewerIds: [active.member.userId],
    });
  });

  it("keeps role authority isolated and protects the final owner", async () => {
    const { service } = fixture();
    await expect(
      service.updateMemberRole(actor("org-a", "admin", "owner-a"), {
        organizationId: "org-a",
        userId: "owner-b",
        role: "admin",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(
      service.updateMemberRole(actor("org-a", "owner", "owner-a"), {
        organizationId: "org-a",
        userId: "owner-a",
        role: "admin",
      }),
    ).resolves.toMatchObject({ role: "admin" });
    await expect(
      service.updateMemberRole(actor("org-a", "owner", "owner-b"), {
        organizationId: "org-a",
        userId: "owner-b",
        role: "admin",
      }),
    ).rejects.toMatchObject({ code: "LAST_OWNER", status: 409 });
    await expect(
      service.revokeMember(actor("org-a", "owner", "owner-b"), {
        organizationId: "org-a",
        userId: "owner-b",
      }),
    ).rejects.toMatchObject({ code: "LAST_OWNER", status: 409 });
    await expect(
      service.listMembers(actor("org-b"), { organizationId: "org-a" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });
  it("creates, lists, switches, and updates organizations without tenant aliases", async () => {
    const { service } = fixture();
    const created = await service.createOrganization(actor(), {
      organizationId: "org-secondary",
      slug: "secondary-team",
      name: "Secondary Team",
      config: { accent: "violet" },
      idempotencyKey: "organization-create-1",
    });
    expect(created).toMatchObject({
      organizationId: "org-secondary",
      slug: "secondary-team",
      name: "Secondary Team",
      config: { accent: "violet" },
    });
    const replay = await service.createOrganization(actor(), {
      organizationId: "org-secondary",
      slug: "secondary-team",
      name: "Secondary Team",
      config: { accent: "violet" },
      idempotencyKey: "organization-create-1",
    });
    expect(replay).toEqual(created);
    await expect(
      service.createOrganization(actor(), {
        organizationId: "org-secondary",
        slug: "different-team",
        name: "Different Team",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
    await expect(
      service.createOrganization(actor(), {
        organizationId: "org-slug-conflict",
        slug: "secondary-team",
        name: "Different Team",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", status: 409 });

    const organizations = await service.listOrganizations(actor());
    expect(organizations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ organizationId: "org-a", role: "owner" }),
        expect.objectContaining({ organizationId: "org-secondary", role: "owner" }),
      ]),
    );
    await expect(
      service.switchOrganization(actor(), { organizationId: "org-secondary" }),
    ).resolves.toMatchObject({ organizationId: "org-secondary", role: "owner" });
    await expect(
      service.updateOrganization(actor(), {
        organizationId: "org-secondary",
        name: "Secondary Team Updated",
        config: { accent: "blue", timezone: "UTC" },
      }),
    ).resolves.toMatchObject({
      organizationId: "org-secondary",
      name: "Secondary Team Updated",
      config: { accent: "blue", timezone: "UTC" },
    });
    await expect(
      service.createOrganization(actor("org-a", "reviewer", "owner-a"), {
        organizationId: "org-reviewer-denied",
        slug: "reviewer-denied",
        name: "Reviewer Denied",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(
      service.updateOrganization(actor("org-a", "admin", "owner-a"), {
        organizationId: "org-a",
        name: "Admin Cannot Update",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(
      service.updateOrganization(actor("org-b", "owner", "owner-other"), {
        organizationId: "org-secondary",
        name: "Cross Tenant Denied",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("isolates reviewer pools by event round and enforces assignment caps", async () => {
    const { service, delivery } = fixture();
    await service.inviteMember(actor(), {
      organizationId: "org-a",
      email: "reviewer@example.test",
      name: "Review Person",
      role: "reviewer",
      idempotencyKey: "pool-1",
    });
    await service.activateMember({
      organizationId: "org-a",
      token: delivery.messages[0]?.setupUrl ?? "",
      password: "StrongPass1!",
    });
    await service.inviteMember(actor(), {
      organizationId: "org-a",
      email: "another-reviewer@example.test",
      name: "Another Reviewer",
      role: "reviewer",
      idempotencyKey: "pool-2",
    });
    const active = await service.activateMember({
      organizationId: "org-a",
      token: delivery.messages[1]?.setupUrl ?? "",
      password: "StrongPass1!",
    });
    const poolOne = await service.setReviewerPool(actor(), {
      organizationId: "org-a",
      eventId: "event-a",
      roundId: "round-1",
      reviewerIds: [active.member.userId],
      maxAssignmentsPerReviewer: 1,
    });
    const poolTwo = await service.setReviewerPool(actor(), {
      organizationId: "org-a",
      eventId: "event-a",
      roundId: "round-2",
      reviewerIds: [active.member.userId],
      maxAssignmentsPerReviewer: 2,
    });
    expect(poolOne.roundId).toBe("round-1");
    expect(poolTwo.roundId).toBe("round-2");
    expect(
      (
        await service.getReviewerPool(actor(), {
          organizationId: "org-a",
          eventId: "event-a",
          roundId: "round-1",
        })
      )?.grants[0]?.maxAssignments,
    ).toBe(1);
    expect(
      (
        await service.getReviewerPool(actor(), {
          organizationId: "org-a",
          eventId: "event-a",
          roundId: "round-2",
        })
      )?.grants[0]?.maxAssignments,
    ).toBe(2);
    await service.reserveReviewerAssignment(actor(), {
      organizationId: "org-a",
      eventId: "event-a",
      roundId: "round-1",
      reviewerId: active.member.userId,
    });
    await expect(
      service.reserveReviewerAssignment(actor(), {
        organizationId: "org-a",
        eventId: "event-a",
        roundId: "round-1",
        reviewerId: active.member.userId,
      }),
    ).rejects.toMatchObject({ code: "ASSIGNMENT_CAP_REACHED", status: 409 });
    await expect(
      service.reserveReviewerAssignment(actor(), {
        organizationId: "org-a",
        eventId: "event-a",
        roundId: "round-2",
        reviewerId: active.member.userId,
      }),
    ).resolves.toMatchObject({ assignedCount: 1 });
  });

  it("allows verified organizers to receive review assignments", async () => {
    const { service } = fixture();

    await expect(
      service.setReviewerPool(actor(), {
        organizationId: "org-a",
        eventId: "event-a",
        roundId: "round-a",
        reviewerIds: ["owner-a"],
        maxAssignmentsPerReviewer: 3,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        reviewerIds: ["owner-a"],
        grants: [
          expect.objectContaining({ reviewerId: "owner-a", maxAssignments: 3, assignedCount: 0 }),
        ],
      }),
    );
  });

  it("keeps active membership and sessions when reviewer invitation revocation fails", async () => {
    const { identity, auth, delivery, pools } = fixture();
    let sessionRevocations = 0;
    const countingAuth: MemberAuthBoundary = {
      issueSetupLink: (input) => auth.issueSetupLink(input),
      consumeSetupLink: (token, organizationId) => auth.consumeSetupLink(token, organizationId),
      finalizeSetupLink: (claim) => auth.finalizeSetupLink(claim),
      establishPassword: (userId, password) => auth.establishPassword(userId, password),
      async revokeSessions(userId) {
        sessionRevocations += 1;
        await auth.revokeSessions(userId);
      },
    };
    let revocationAttempted = false;
    const reviewerEventInvitations: ReviewerEventInvitationLifecycle = {
      async createReviewerInvitation() {},
      async revokeReviewerInvitationIfUnpooled() {},
      async revokeReviewerInvitationsForMember() {
        revocationAttempted = true;
        throw new Error("event invitation revocation failed");
      },
    };
    const service = new MemberService(
      {
        identity,
        auth: countingAuth,
        invitationDelivery: delivery,
        reviewerPools: pools,
        reviewerEventInvitations,
      },
      {
        clock: () => new Date(initialNow),
        generateId: () => "fail-closed-reviewer",
      },
    );
    await service.inviteMember(actor(), {
      organizationId: "org-a",
      email: "fail-closed@example.test",
      name: "Fail Closed Reviewer",
      role: "reviewer",
      idempotencyKey: "fail-closed-reviewer",
    });
    const active = await service.activateMember({
      organizationId: "org-a",
      token: delivery.messages[0]?.setupUrl ?? "",
      password: "StrongPass1!",
    });
    expect(sessionRevocations).toBe(1);

    await expect(
      service.revokeMember(actor(), {
        organizationId: "org-a",
        userId: active.member.userId,
      }),
    ).rejects.toThrow("event invitation revocation failed");

    expect(revocationAttempted).toBe(true);
    await expect(identity.getMember("org-a", active.member.userId)).resolves.toMatchObject({
      status: "active",
      role: "reviewer",
    });
    await expect(identity.getInvitation(active.invitation.id)).resolves.toMatchObject({
      status: "accepted",
    });
    expect(sessionRevocations).toBe(1);
    await expect(service.listMembers(actor())).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ userId: active.member.userId })]),
    );
  });

  it("revokes all member reviewer invitations without deleting reviewer pool state", async () => {
    const { service, auth, delivery, pools, reviewerEventInvitations } = fixture();
    await service.inviteMember(actor(), {
      organizationId: "org-a",
      email: "revoke@example.test",
      name: "Revoke Me",
      role: "reviewer",
      idempotencyKey: "revoke-1",
    });
    const active = await service.activateMember({
      organizationId: "org-a",
      token: delivery.messages[0]?.setupUrl ?? "",
      password: "StrongPass1!",
    });
    await service.setReviewerPool(actor(), {
      organizationId: "org-a",
      eventId: "event-a",
      roundId: "round-1",
      reviewerIds: [active.member.userId],
      maxAssignmentsPerReviewer: 2,
    });

    const revoked = await service.revokeMember(actor(), {
      organizationId: "org-a",
      userId: active.member.userId,
    });

    expect(revoked.userId).toBe(active.member.userId);
    expect(reviewerEventInvitations.revokedForMembers).toEqual([
      {
        organizationId: "org-a",
        recipientUserId: active.member.userId,
        revokedByUserId: "owner-a",
        revokedAt: initialNow.toISOString(),
      },
    ]);
    expect(reviewerEventInvitations.revokedIfUnpooled).toEqual([]);
    expect(auth.hasRevokedSessions(active.member.userId)).toBe(true);
    expect(await service.listMembers(actor())).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ userId: active.member.userId })]),
    );
    await expect(pools.getReviewerPool("org-a", "event-a", "round-1")).resolves.toMatchObject({
      reviewerIds: [active.member.userId],
    });
  });
});

describe("member provisioning routes", () => {
  it("lists and invites through canonical organization paths with idempotent response", async () => {
    const { service, delivery } = fixture();
    const app = appFor(service);
    const base = "http://localhost/api/admin/organizations/org-a/members";
    const invite = await app.request(`${base}/invitations`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "route-invite" },
      body: JSON.stringify({
        email: "route-reviewer@example.test",
        name: "Route Reviewer",
        role: "reviewer",
      }),
    });
    expect(invite.status).toBe(201);
    expect(await data<Record<string, unknown>>(invite)).not.toHaveProperty("setupUrl");
    const replay = await app.request(`${base}/invitations`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "route-invite" },
      body: JSON.stringify({
        email: "route-reviewer@example.test",
        name: "Route Reviewer",
        role: "reviewer",
      }),
    });
    expect(replay.status).toBe(200);
    expect(await data<Record<string, unknown>>(replay)).not.toHaveProperty("setupUrl");
    expect(delivery.messages).toHaveLength(1);
    const listed = await app.request(base);
    expect(listed.status).toBe(200);
    expect(
      (await data<readonly { email: string }[]>(listed)).map((member) => member.email),
    ).toContain("route-reviewer@example.test");
  });
  it("binds one-time password setup to the invited organization path", async () => {
    const { service, delivery } = fixture();
    const app = appFor(service);
    const base = "http://localhost/api/admin/organizations/org-a/members";
    const invite = await app.request(`${base}/invitations`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "route-setup" },
      body: JSON.stringify({
        email: "route-setup@example.test",
        name: "Route Evaluator",
        role: "reviewer",
      }),
    });
    expect(invite.status).toBe(201);
    const setupUrl = delivery.messages[0]?.setupUrl;
    expect(setupUrl).toContain("token=");

    const wrongOrganization = await app.request(
      "http://localhost/api/admin/organizations/org-b/members/setup/activate",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: setupUrl, password: "StrongPass1!" }),
      },
    );
    expect(wrongOrganization.status).toBe(400);

    const weak = await app.request(`${base}/setup/activate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: setupUrl, password: "weak-pass" }),
    });
    expect(weak.status).toBe(400);

    const activated = await app.request(`${base}/setup/activate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: setupUrl, password: "StrongPass1!" }),
    });
    expect(activated.status).toBe(200);
    expect(await data<{ member: { status: string; role: string } }>(activated)).toMatchObject({
      member: { status: "active", role: "reviewer" },
    });

    const replay = await app.request(`${base}/setup/activate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: setupUrl, password: "StrongPass1!" }),
    });
    expect(replay.status).toBe(400);
  });

  it("does not let the public member route bootstrap a first organization", async () => {
    const { service } = fixture();
    const currentPrincipal = principal();
    if (currentPrincipal.kind !== "user") throw new Error("Expected a user principal.");
    const app = appFor(service, {
      ...currentPrincipal,
      memberships: [],
    });
    const response = await app.request(
      "http://localhost/api/admin/organizations/org-first/members/organizations",
      {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "first-organization" },
        body: JSON.stringify({
          organizationId: "org-first",
          slug: "first-organization",
          name: "First Organization",
        }),
      },
    );

    expect(response.status).toBe(404);
  });

  it("lists, switches, and updates a provisioned member-owned tenant context", async () => {
    const { service } = fixture();
    await service.createOrganization(actor(), {
      organizationId: "org-route-secondary",
      slug: "route-secondary",
      name: "Route Secondary",
      config: { theme: "dark" },
      idempotencyKey: "route-org-create",
    });
    const app = appFor(service);
    const targetPrincipal = principal();
    if (targetPrincipal.kind !== "user") throw new Error("Expected a user principal.");
    const targetApp = appFor(service, {
      ...targetPrincipal,
      memberships: [
        { organizationId: "org-a", role: "owner" },
        { organizationId: "org-route-secondary", role: "owner" },
      ],
    });
    const base = "http://localhost/api/admin/organizations/org-a/members/organizations";
    const listed = await app.request(base);
    expect(listed.status).toBe(200);
    expect(await data<readonly { organizationId: string }[]>(listed)).toEqual(
      expect.arrayContaining([expect.objectContaining({ organizationId: "org-route-secondary" })]),
    );

    const switched = await targetApp.request(`${base}/org-route-secondary/switch`, {
      method: "POST",
    });
    expect(switched.status).toBe(200);
    expect(await data<{ organizationId: string }>(switched)).toMatchObject({
      organizationId: "org-route-secondary",
    });
    const updated = await targetApp.request(`${base}/org-route-secondary`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Route Secondary Updated", config: { theme: "light" } }),
    });
    expect(updated.status).toBe(200);
    expect(await data<{ name: string }>(updated)).toMatchObject({
      name: "Route Secondary Updated",
    });
  });

  it("denies reviewers and cross-tenant organizers", async () => {
    const { service } = fixture();
    const base = "http://localhost/api/admin/organizations/org-a/members";
    const reviewer = await appFor(service, principal("org-a", "reviewer", "reviewer-1")).request(
      base,
    );
    expect(reviewer.status).toBe(403);
    expect(await error(reviewer)).toMatchObject({ code: "ACCESS_DENIED" });
    const nonOwnerCreate = await appFor(service, principal("org-a", "admin", "owner-a")).request(
      `${base}/organizations`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId: "org-admin-denied",
          slug: "admin-denied",
          name: "Admin Denied",
        }),
      },
    );
    expect(nonOwnerCreate.status).toBe(404);
    const crossTenant = await appFor(service, principal("org-b", "owner", "owner-other")).request(
      base,
    );
    expect(crossTenant.status).toBe(403);
    expect(await error(crossTenant)).toMatchObject({ code: "ACCESS_DENIED" });
  });
});
