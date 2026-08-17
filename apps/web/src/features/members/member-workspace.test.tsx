import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MembersPage from "../../app/admin/organizations/[organizationId]/members/page";
import { isPublicMemberSetupPath, sessionHasOrganizerMembership } from "../admin/admin-shell";
import {
  activeVerifiedReviewers,
  createMemberApi,
  type OrganizationMember,
  type ReviewerPool,
} from "./api";
import { MemberSetup } from "./member-setup";
import {
  completeMemberSetup,
  MemberSetupActivatedSignInRequiredError,
  memberSetupPasswordIssues,
  setupUrlWithoutToken,
} from "./member-setup-model";
import { MemberWorkspace } from "./member-workspace";
import { inviteRolesForOrganization } from "./member-workspace-model";
import { OrganizationSettingsWorkspace } from "./organization-settings-workspace";

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
  it("limits assignment candidates to active verified reviewer-role members", () => {
    expect(activeVerifiedReviewers([owner, reviewer])).toEqual([reviewer]);
  });

  it("uses organization-qualified member and event-round pool endpoints", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const scopedOwner = { ...owner, organizationId: "org/1" };
    const scopedReviewer = { ...reviewer, organizationId: "org/1" };
    const scopedPool = { ...pool, organizationId: "org/1", eventId: "event/1", roundId: "round/1" };
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

  it("uses a same-origin API path when the base URL is empty", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(init === undefined ? { input } : { input, init });
      return new Response(JSON.stringify({ data: [owner] }), { status: 200 });
    };
    const api = createMemberApi("", owner.organizationId, fetcher);
    await expect(api.listMembers()).resolves.toEqual([owner]);
    expect(String(calls[0]?.input)).toBe("/api/admin/organizations/org-1/members");
    expect(calls[0]?.init).toMatchObject({ credentials: "include" });
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
      Response.json({ data: { member: reviewer, invitation: null, created: false } }),
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
    expect(destination).toBe("/work");
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
      createElement(MemberSetup, { organizationId: "org-1", token: "secret-token" }),
    );
    const missing = renderToStaticMarkup(
      createElement(MemberSetup, { organizationId: "org-1", token: null }),
    );
    expect(setup).toContain("Set up organization access");
    expect(setup).toContain("Accept invitation and sign in");
    expect(setup).toContain("new-password");
    expect(setup).not.toContain("secret-token");
    expect(missing).toContain("Invitation link required");
  });
});

describe("member workspace", () => {
  it("defaults to a concise People directory and keeps administrative work behind tabs", () => {
    const markup = renderToStaticMarkup(
      createElement(MemberWorkspace, {
        organizationId: "org-1",
        baseUrl: "https://api.example.test",
      }),
    );

    expect(markup).toContain("People");
    expect(markup).toContain("People directory");
    expect(markup).toContain("Invite member");
    expect(markup).not.toContain("Reviewer pools");
    expect(markup).not.toContain("Load pool");
    expect(markup).not.toContain("Save reviewer pool");
    expect(markup).not.toContain("Organization settings");
    expect(markup).toContain("Search people");
    expect(markup).not.toContain("CEP-10");
    expect(markup).not.toContain("ABS-02");
    expect(markup).not.toContain("CFP-10");
    expect(markup).not.toContain("Members and evaluators");
    expect(markup).not.toContain("Organization configuration (JSON)");
    expect(markup).not.toContain("Event ID");
    expect(markup).not.toContain("Round ID");
  });

  it("opens the invitation tab directly from an event review link", async () => {
    const page = await MembersPage({
      params: Promise.resolve({ organizationId: "org-1" }),
      searchParams: Promise.resolve({ tab: "invite" }),
    });

    expect(isValidElement<{ initialTab?: string }>(page)).toBe(true);
    if (!isValidElement<{ initialTab?: string }>(page)) throw new Error("Members page is invalid.");
    expect(page.props.initialTab).toBe("invite");
  });

  it("renders organization settings only through the dedicated settings workspace", () => {
    const markup = renderToStaticMarkup(
      createElement(OrganizationSettingsWorkspace, {
        organizationId: "org-1",
        baseUrl: "https://api.example.test",
      }),
    );

    expect(markup).toContain("Organization settings");
    expect(markup).toContain("Refresh settings");
    expect(markup).not.toContain('role="tablist"');
    expect(markup).not.toContain('aria-label="Switch organization"');
    expect(markup).not.toContain("People directory");
    expect(markup).not.toContain("Reviewer pools");
  });

  it("does not expose organization creation inside organization settings", () => {
    const markup = renderToStaticMarkup(
      createElement(OrganizationSettingsWorkspace, {
        organizationId: "org-1",
        baseUrl: "https://api.example.test",
      }),
    );

    expect(markup).not.toContain('data-testid="organization-creation-form"');
  });
});
