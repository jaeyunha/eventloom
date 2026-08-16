import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WorkHubView } from "./work-hub";
import { loadWorkHubModel } from "./work-hub-loader";
import type { WorkHubModel } from "./work-hub-model";

const fullModel: WorkHubModel = {
  identity: { id: "user-1", email: "casey@example.com", name: "Casey Morgan" },
  organizer: {
    organizationCount: 1,
    organizationNames: ["Civic Design Guild"],
    continueHref: "/admin/organizations/org-a/events",
    continueLabel: "Continue with Civic Design Guild",
  },
  reviewer: {
    assignmentCount: 3,
    inProgressCount: 1,
    submittedCount: 1,
    eventNames: ["Research Exchange 2027"],
    organizationNames: ["Open Research Network"],
  },
  participant: {
    proposalCount: 2,
    proposalEventNames: ["Human-Centered Summit"],
    speakerTaskEventCount: 1,
    speakerTaskEventNames: ["Human-Centered Summit"],
  },
};

describe("WorkHubView", () => {
  it("renders every authorized workspace with destination-specific calls to action", () => {
    const markup = renderToStaticMarkup(createElement(WorkHubView, { model: fullModel }));

    expect(markup).toContain("Organizer workspace");
    expect(markup).toContain("Reviewer workspace");
    expect(markup).toContain("Participant workspace");
    expect(markup).toContain("Manage events");
    expect(markup).toContain("Continue with Civic Design Guild");
    expect(markup).toContain("Continue reviews");
    expect(markup).toContain("View my proposals");
    expect(markup).toContain("Complete speaker tasks");
    expect(markup).toContain("Research Exchange 2027");
    expect(markup).toContain("Human-Centered Summit");
    expect(markup).not.toContain(">org-a<");
    expect(markup).not.toContain(">org-b<");
  });

  it("renders pending reviewer and speaker invitations with Accept and Decline actions", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkHubView, {
        model: {
          ...fullModel,
          organizer: null,
          reviewer: null,
          participant: null,
          invitations: [
            {
              id: "invite-review",
              role: "reviewer",
              status: "pending",
              version: 2,
              organizationName: "Open Research Network",
              eventName: "Research Exchange 2027",
              workspaceHref: null,
            },
            {
              id: "invite-speaker",
              role: "speaker",
              status: "pending",
              version: 4,
              organizationName: "Civic Design Guild",
              eventName: "Human-Centered Summit",
              workspaceHref: null,
            },
          ],
        },
      }),
    );

    expect(markup).toContain("Event invitations");
    expect(markup).toContain("Accept reviewer invitation for Research Exchange 2027");
    expect(markup).toContain("Accept speaker invitation for Human-Centered Summit");
    expect(markup).toContain("Research Exchange 2027");
    expect(markup).toContain("Human-Centered Summit");
    expect(markup.match(/>Accept</g)).toHaveLength(2);
    expect(markup.match(/>Decline</g)).toHaveLength(2);
    expect(markup).not.toContain("No assigned work yet");
  });

  it("renders accepted invitations as exact event workspace links without response actions", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkHubView, {
        model: {
          ...fullModel,
          invitations: [
            {
              id: "invite-review",
              role: "reviewer",
              status: "accepted",
              version: 3,
              organizationName: "Open Research Network",
              eventName: "Research Exchange 2027",
              workspaceHref: "/review?eventId=event%2Freview",
            },
            {
              id: "invite-speaker",
              role: "speaker",
              status: "accepted",
              version: 5,
              organizationName: "Civic Design Guild",
              eventName: "Human-Centered Summit",
              workspaceHref: "/portal?event=event%2Fspeaker",
            },
          ],
        },
      }),
    );

    expect(markup).toContain('href="/review?eventId=event%2Freview"');
    expect(markup).toContain('href="/portal?event=event%2Fspeaker"');
    expect(markup).toContain("One account · 5 workspaces");
    expect(markup.match(/>Open workspace</g)).toHaveLength(2);
    expect(markup).not.toContain(">Accept<");
    expect(markup).not.toContain(">Decline<");
  });

  it("omits cards and destinations that are not authorized", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkHubView, {
        model: { ...fullModel, organizer: null, reviewer: null },
      }),
    );

    expect(markup).not.toContain("Organizer workspace");
    expect(markup).not.toContain("Reviewer workspace");
    expect(markup).toContain("Participant workspace");
    expect(markup).not.toContain('href="/admin"');
    expect(markup).not.toContain('href="/review"');
  });
});

describe("loadWorkHubModel", () => {
  it("loads human organization names and all capability sources from existing APIs", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/auth/get-session") {
        return Response.json({
          session: { id: "session-1" },
          user: { id: "user-1", email: "casey@example.com", name: "Casey Morgan" },
          memberships: [
            { organizationId: "org-a", role: "owner" },
            { organizationId: "org-b", role: "reviewer" },
          ],
        });
      }
      if (path === "/api/admin/organizations/org-a/members/organizations") {
        return Response.json({
          data: [
            { organizationId: "org-a", name: "Civic Design Guild" },
            { organizationId: "org-b", name: "Open Research Network" },
          ],
        });
      }
      if (path === "/api/account/reviewer-workspace") {
        return Response.json({
          data: {
            organizations: [
              {
                organization: { id: "org-a", name: "Civic Design Guild" },
                assignments: [
                  {
                    assignment: { status: "assigned" },
                    plan: { eventName: "Research Exchange 2027" },
                  },
                ],
              },
              {
                organization: { id: "org-b", name: "Open Research Network" },
                assignments: [
                  {
                    assignment: { status: "in_progress" },
                    plan: { eventName: "Research Exchange 2027" },
                  },
                ],
              },
            ],
          },
        });
      }
      if (path === "/api/speaker/portal/contexts") {
        return Response.json({
          data: [
            {
              id: "context-1",
              eventId: "event-1",
              name: "Human-Centered Summit",
              capabilities: ["submission-edit"],
              submissionIds: ["submission-1"],
              participantIds: [],
            },
          ],
        });
      }
      if (path === "/api/account/event-invitations") {
        return Response.json({
          data: [
            {
              invitationId: "invite-review",
              role: "reviewer",
              status: "pending",
              version: 2,
              organizationId: "org-b",
              organizationName: "Open Research Network",
              eventId: "event-review",
              eventName: "Research Exchange 2027",
              workspaceHref: null,
            },
          ],
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    const model = await loadWorkHubModel(fetcher, undefined, "org-a");

    expect(model?.organizer?.organizationNames).toEqual(["Civic Design Guild"]);
    expect(model?.reviewer).toMatchObject({
      assignmentCount: 2,
      organizationNames: ["Civic Design Guild", "Open Research Network"],
    });
    expect(model?.participant?.proposalCount).toBe(1);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/account/reviewer-workspace",
      expect.objectContaining({
        cache: "no-store",
        credentials: "include",
        headers: { Accept: "application/json" },
      }),
    );
    expect(model?.invitations).toEqual([
      expect.objectContaining({
        id: "invite-review",
        role: "reviewer",
        status: "pending",
        version: 2,
      }),
    ]);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/account/event-invitations",
      expect.objectContaining({
        cache: "no-store",
        credentials: "include",
        headers: { Accept: "application/json" },
      }),
    );
  });

  it("degrades an invitation endpoint failure without hiding established workspaces", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/auth/get-session") {
        return Response.json({
          session: { id: "session-1" },
          user: { id: "user-1", email: "casey@example.com", name: "Casey Morgan" },
          memberships: [{ organizationId: "org-a", role: "owner" }],
        });
      }
      if (path === "/api/admin/organizations/org-a/members/organizations") {
        return Response.json({ data: [{ organizationId: "org-a", name: "Civic Design Guild" }] });
      }
      if (path === "/api/account/reviewer-workspace") {
        return Response.json({ data: { organizations: [] } });
      }
      if (path === "/api/speaker/portal/contexts") return Response.json({ data: [] });
      if (path === "/api/account/event-invitations") {
        return Response.json({ error: { code: "UNAVAILABLE" } }, { status: 503 });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    const model = await loadWorkHubModel(fetcher, undefined, "org-a");

    expect(model?.organizer).toMatchObject({
      organizationNames: ["Civic Design Guild"],
      continueHref: "/admin/organizations/org-a/events",
    });
    expect(model?.invitations).toEqual([]);
  });
});
