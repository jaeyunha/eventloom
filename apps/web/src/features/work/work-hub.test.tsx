import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { loadWorkHubModel, WorkHubView } from "./work-hub";
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
      if (path === "/api/admin/evaluations/reviewer/workspace") {
        return Response.json({
          data: {
            assignments: [
              {
                assignment: { status: "assigned" },
                plan: { eventName: "Research Exchange 2027" },
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
      throw new Error(`Unexpected request: ${path}`);
    });

    const model = await loadWorkHubModel(fetcher, undefined, "org-a");

    expect(model?.organizer?.organizationNames).toEqual(["Civic Design Guild"]);
    expect(model?.reviewer?.assignmentCount).toBe(1);
    expect(model?.participant?.proposalCount).toBe(1);
  });
});
