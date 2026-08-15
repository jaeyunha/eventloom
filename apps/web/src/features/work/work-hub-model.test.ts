import { describe, expect, it } from "vitest";
import type { PortalContext } from "../portal/types";
import { buildWorkHubModel } from "./work-hub-model";

const participantContext = (overrides: Partial<PortalContext> = {}): PortalContext => ({
  id: "context-1",
  eventId: "event-1",
  name: "Human-Centered Summit",
  capabilities: [],
  submissionIds: [],
  participantIds: [],
  ...overrides,
});

const session = {
  identity: { id: "user-1", email: "casey@example.com", name: "Casey Morgan" },
  memberships: [
    { organizationId: "org-a", role: "owner" as const },
    { organizationId: "org-b", role: "reviewer" as const },
  ],
};

describe("buildWorkHubModel", () => {
  it("preserves organizer, reviewer, and participant capabilities concurrently", () => {
    const model = buildWorkHubModel({
      session,
      organizations: [{ organizationId: "org-a", name: "Civic Design Guild" }],
      reviewerAssignments: [
        {
          assignment: { status: "in_progress" },
          plan: {
            organizationId: "org-b",
            organizationName: "Open Research Network",
            eventId: "event-review",
            eventName: "Research Exchange 2027",
          },
        },
        { assignment: { status: "assigned" }, plan: { eventName: "Research Exchange 2027" } },
      ],
      portalContexts: [
        participantContext({
          submissionIds: ["submission-1", "submission-2"],
          participantIds: ["participant-1"],
          capabilities: ["task-response"],
        }),
      ],
      preferredOrganizationId: "org-a",
    });

    expect(model.organizer).toEqual({
      organizationCount: 1,
      organizationNames: ["Civic Design Guild"],
      continueHref: "/admin/organizations/org-a/events",
      continueLabel: "Continue with Civic Design Guild",
    });
    expect(model.reviewer).toMatchObject({
      assignmentCount: 2,
      inProgressCount: 1,
      eventNames: ["Research Exchange 2027"],
      organizationNames: ["Open Research Network"],
    });
    expect(model.participant).toEqual({
      proposalCount: 2,
      proposalEventNames: ["Human-Centered Summit"],
      speakerTaskEventCount: 1,
      speakerTaskEventNames: ["Human-Centered Summit"],
    });
  });

  it("never promotes raw identifiers into visible context names", () => {
    const model = buildWorkHubModel({
      session,
      organizations: [{ organizationId: "org-a", name: "org-a" }],
      reviewerAssignments: [
        {
          assignment: { status: "assigned" },
          plan: {
            organizationId: "org-b",
            organizationName: "org-b",
            eventId: "event-review",
            eventName: "event-review",
          },
        },
      ],
      portalContexts: [participantContext({ name: "event-1" })],
      preferredOrganizationId: "org-a",
    });

    expect(model.organizer?.organizationNames).toEqual([]);
    expect(model.organizer?.continueLabel).toBeNull();
    expect(model.reviewer?.organizationNames).toEqual([]);
    expect(model.reviewer?.eventNames).toEqual([]);
    expect(model.participant).toBeNull();
  });

  it("does not add a continue destination without supported saved state", () => {
    const model = buildWorkHubModel({
      session,
      organizations: [{ organizationId: "org-a", name: "Civic Design Guild" }],
      reviewerAssignments: [],
      portalContexts: [],
      preferredOrganizationId: null,
    });

    expect(model.organizer?.continueHref).toBeNull();
    expect(model.organizer?.continueLabel).toBeNull();
  });
});
