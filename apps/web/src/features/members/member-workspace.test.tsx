import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { isPublicMemberSetupPath, sessionHasOrganizerMembership } from "../admin/admin-shell";
import { createMemberApi, type OrganizationMember, type ReviewerPool } from "./api";
import {
  completeMemberSetup,
  MemberSetup,
  MemberSetupActivatedSignInRequiredError,
  memberSetupPasswordIssues,
  setupUrlWithoutToken,
} from "./member-setup";
import { inviteRolesForOrganization, MemberWorkspace } from "./member-workspace";

const owner: OrganizationMember = {
  organizationId: "org-1",
  userId: "owner-1",
  email: "owner@example.test",
  name: "Org Owner",
  emailVerified: true,
  status: "active",
  role: "owner",
  createdAt: "2026-08-09T00:00:00.000Z",
  updatedAt: "2026-08-09T00:00:00.000Z",
};

const reviewer: OrganizationMember = {
  organizationId: "org-1",
  userId: "reviewer-1",
  email: "reviewer@example.test",
  name: "Review Person",
  emailVerified: true,
  status: "active",
  role: "reviewer",
  createdAt: "2026-08-09T00:00:00.000Z",
  updatedAt: "2026-08-09T00:00:00.000Z",
};

const pool: ReviewerPool = {
  organizationId: "org-1",
  eventId: "event-1",
  roundId: "round-1",
  reviewerIds: ["reviewer-1"],
  grants: [{ reviewerId: "reviewer-1", maxAssignments: 3, assignedCount: 1 }],
  version: 2,
  createdAt: "2026-08-09T00:00:00.000Z",
  updatedAt: "2026-08-09T00:00:00.000Z",
};

describe("organization member API adapter", () => {
  it("uses organization-qualified member and event-round pool endpoints", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const scopedOwner = { ...owner, organizationId: "org/1" };
    const scopedReviewer = { ...reviewer, organizationId: "org/1" };
    const scopedPool = {
      ...pool,
      organizationId: "org/1",
      eventId: "event/1",
      roundId: "round/1",
    };
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(init === undefined ? { input } : { input, init });
      const url = String(input);
      if (url.endsWith("/invitations")) {
        return new Response(
          JSON.stringify({
            data: {
              member: { ...scopedReviewer, emailVerified: false, status: "pending" },
              invitation: {
                id: "invite-1",
                organizationId: "org/1",
                userId: scopedReviewer.userId,
                email: scopedReviewer.email,
                name: scopedReviewer.name,
                role: "reviewer",
                idempotencyKey: "invite-key",
                status: "delivered",
                createdAt: scopedReviewer.createdAt,
                updatedAt: scopedReviewer.updatedAt,
                expiresAt: "2026-08-16T00:00:00.000Z",
                deliveredAt: scopedReviewer.updatedAt,
                acceptedAt: null,
              },
              created: true,
            },
          }),
          { status: 201 },
        );
      }
      if (url.endsWith("/reviewer-pool")) return new Response(JSON.stringify({ data: scopedPool }));
      if (url.endsWith("/reviewer-1/role"))
        return new Response(JSON.stringify({ data: scopedReviewer }));
      if (url.endsWith("/reviewer-1"))
        return new Response(JSON.stringify({ data: scopedReviewer }));
      return new Response(JSON.stringify({ data: [scopedOwner, scopedReviewer] }));
    };
    const api = createMemberApi("https://api.example.test/", "org/1", fetcher);

    await api.listMembers();
    await api.inviteMember({ email: reviewer.email, name: reviewer.name, role: "reviewer" });
    await api.updateMemberRole(reviewer.userId, "reviewer");
    await api.getReviewerPool("event/1", "round/1");
    await api.setReviewerPool("event/1", "round/1", {
      reviewers: [{ reviewerId: reviewer.userId, maxAssignments: 3 }],
    });
    await api.revokeMember(reviewer.userId);

    expect(String(calls[0]?.input)).toBe(
      "https://api.example.test/api/admin/organizations/org%2F1/members",
    );
    expect(String(calls[1]?.input)).toContain("/members/invitations");
    expect(new Headers(calls[1]?.init?.headers).get("idempotency-key")).toEqual(expect.any(String));
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({
      email: reviewer.email,
      name: reviewer.name,
      role: "reviewer",
    });
    expect(String(calls[3]?.input)).toContain(
      "/members/events/event%2F1/rounds/round%2F1/reviewer-pool",
    );
    expect(JSON.parse(String(calls[4]?.init?.body))).toEqual({
      reviewers: [{ reviewerId: reviewer.userId, maxAssignments: 3 }],
    });
    expect(calls[0]?.init).toMatchObject({ credentials: "include", cache: "no-store" });
  });

  it("rejects a cross-organization response and requires tenant scope", async () => {
    const api = createMemberApi(
      "https://api.example.test",
      "org-1",
      async () => new Response(JSON.stringify({ data: [{ ...owner, organizationId: "org-2" }] })),
    );
    await expect(api.listMembers()).rejects.toThrow("another organization");
    expect(() => createMemberApi("https://api.example.test", " ")).toThrow("organization ID");
  });

  it("rejects a mismatched invitation identity from the server", async () => {
    const api = createMemberApi("https://api.example.test", "org-1", async () =>
      Response.json({
        data: {
          member: reviewer,
          invitation: {
            id: "invite-mismatch",
            organizationId: "org-2",
            userId: reviewer.userId,
            email: reviewer.email,
            name: reviewer.name,
            role: "reviewer",
            idempotencyKey: "invite-mismatch-key",
            status: "delivered",
            createdAt: reviewer.createdAt,
            updatedAt: reviewer.updatedAt,
            expiresAt: "2026-08-16T00:00:00.000Z",
            deliveredAt: reviewer.updatedAt,
            acceptedAt: null,
          },
          created: true,
        },
      }),
    );

    await expect(api.inviteMember({ email: reviewer.email, role: "reviewer" })).rejects.toThrow(
      "does not match",
    );
  });

  it("rejects a nullable invitation response with the wrong member role", async () => {
    const api = createMemberApi("https://api.example.test", "org-1", async () =>
      Response.json({
        data: {
          member: reviewer,
          invitation: null,
          created: false,
        },
      }),
    );

    await expect(api.inviteMember({ email: reviewer.email, role: "admin" })).rejects.toThrow(
      "does not match",
    );
  });
});

describe("member invitation setup", () => {
  it("enforces role invitation boundaries and strong matching passwords", () => {
    expect(inviteRolesForOrganization("owner")).toEqual(["owner", "admin", "reviewer"]);
    expect(inviteRolesForOrganization("admin")).toEqual(["reviewer"]);
    expect(memberSetupPasswordIssues("weak", "different")).not.toHaveLength(0);
    expect(memberSetupPasswordIssues("StrongPass1!", "StrongPass1!")).toEqual([]);
  });

  it("keeps only the one-time member setup route outside the organizer shell", () => {
    expect(isPublicMemberSetupPath("/admin/organizations/org-1/members/setup")).toBe(true);
    expect(isPublicMemberSetupPath("/admin/organizations/org-1/members/setup/")).toBe(true);
    expect(isPublicMemberSetupPath("/admin/organizations/org-1/members")).toBe(false);
    expect(isPublicMemberSetupPath("/admin/organizations/org-1/events/event-1")).toBe(false);

    expect(
      sessionHasOrganizerMembership(
        { memberships: [{ organizationId: "org-2", role: "owner" }] },
        null,
      ),
    ).toBe(true);
    expect(
      sessionHasOrganizerMembership(
        { memberships: [{ organizationId: "org-2", role: "owner" }] },
        "org-1",
      ),
    ).toBe(false);
    expect(
      sessionHasOrganizerMembership(
        { memberships: [{ organizationId: "org-1", role: "reviewer" }] },
        null,
      ),
    ).toBe(false);
    expect(setupUrlWithoutToken("/admin/organizations/org-1/members/setup?token=secret&x=1")).toBe(
      "/admin/organizations/org-1/members/setup?x=1",
    );
  });

  it("activates, signs in, and routes an evaluator to My Evaluations", async () => {
    const calls: string[] = [];
    const invitation = {
      id: "invite-1",
      organizationId: "org-1",
      userId: reviewer.userId,
      email: reviewer.email,
      name: reviewer.name,
      idempotencyKey: "invite-key",
      role: "reviewer" as const,
      status: "accepted",
      createdAt: reviewer.createdAt,
      updatedAt: reviewer.updatedAt,
      expiresAt: "2026-08-16T00:00:00.000Z",
      deliveredAt: reviewer.updatedAt,
      acceptedAt: reviewer.updatedAt,
    };
    const destination = await completeMemberSetup({
      memberApi: {
        async activateMember(input) {
          calls.push(`activate:${input.token}:${input.password}`);
          return { member: reviewer, invitation };
        },
      },
      loginApi: {
        async signInWithEmail(input) {
          calls.push(`login:${input.email}:${input.password}`);
        },
        async getSession() {
          return {
            memberships: [{ organizationId: "org-1", role: "reviewer" as const }],
            speakerGrants: [],
          };
        },
      },
      token: "one-time-token",
      name: "Review Person",
      password: "StrongPass1!",
    });

    expect(destination).toBe("/review");
    expect(calls).toEqual([
      "activate:one-time-token:StrongPass1!",
      "login:reviewer@example.test:StrongPass1!",
    ]);
  });

  it("does not retry activation when automatic sign-in fails after activation", async () => {
    let activationCount = 0;
    const result = completeMemberSetup({
      memberApi: {
        async activateMember() {
          activationCount += 1;
          return {
            member: reviewer,
            invitation: {
              id: "invite-recovery",
              organizationId: "org-1",
              userId: reviewer.userId,
              email: reviewer.email,
              name: reviewer.name,
              role: "reviewer",
              idempotencyKey: "invite-recovery-key",
              status: "accepted",
              createdAt: reviewer.createdAt,
              updatedAt: reviewer.updatedAt,
              expiresAt: "2026-08-16T00:00:00.000Z",
              deliveredAt: reviewer.updatedAt,
              acceptedAt: reviewer.updatedAt,
            },
          };
        },
      },
      loginApi: {
        async signInWithEmail() {
          throw new Error("session unavailable");
        },
        async getSession() {
          throw new Error("unreachable");
        },
      },
      token: "one-time-token",
      password: "StrongPass1!",
    });

    await expect(result).rejects.toBeInstanceOf(MemberSetupActivatedSignInRequiredError);
    await expect(result).rejects.toMatchObject({ email: reviewer.email });
    expect(activationCount).toBe(1);
  });

  it("renders accessible setup and missing-token states without exposing a token", () => {
    const setup = renderToStaticMarkup(
      createElement(MemberSetup, {
        organizationId: "org-1",
        token: "secret-token",
        apiBaseUrl: "https://api.example.test",
      }),
    );
    const missing = renderToStaticMarkup(
      createElement(MemberSetup, {
        organizationId: "org-1",
        token: null,
        apiBaseUrl: "https://api.example.test",
      }),
    );

    expect(setup).toContain("Set up organization access");
    expect(setup).toContain("Accept invitation and sign in");
    expect(setup).toContain("new-password");
    expect(setup).not.toContain("secret-token");
    expect(missing).toContain("Invitation link required");
  });
});

describe("member workspace", () => {
  it("renders reviewer provisioning, role separation, pool setup, and accessible states", () => {
    const markup = renderToStaticMarkup(
      createElement(MemberWorkspace, {
        organizationId: "org-1",
        eventId: "event-1",
        roundId: "round-1",
        baseUrl: "https://api.example.test",
      }),
    );

    expect(markup).toContain("Members and evaluators");
    expect(markup).toContain("Invite an organization member");
    expect(markup).toContain("one-time setup");
    expect(markup).toContain("Search members");
    expect(markup).toContain("Evaluator");
    expect(markup).toContain("Evaluator pool and assignment caps");
    expect(markup).toContain("Event ID");
    expect(markup).toContain("Round ID");
    expect(markup).toContain("open the assigned review dashboard");
    expect(markup).toContain("Organizations");
    expect(markup).toContain("Switch organization");
    expect(markup).toContain("Create organization");
    expect(markup).toContain("Update current organization");
  });
});
