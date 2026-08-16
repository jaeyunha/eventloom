import { describe, expect, it } from "vitest";
import type { PortalContext } from "../portal/types";
import { deriveAccountAccess, parseAccountSession } from "./account-access";

const portalContext = (overrides: Partial<PortalContext> = {}): PortalContext => ({
  id: "context-1",
  eventId: "event-1",
  slug: "event-1",
  name: "Event One",
  organizationId: "org-1",
  submissionIds: [],
  participantIds: [],
  capabilities: [],
  ...overrides,
});

describe("account access", () => {
  it("normalizes one authenticated identity with every membership", () => {
    expect(
      parseAccountSession({
        session: { id: "session-1" },
        user: { id: "user-1", email: "user@example.com", name: "User One" },
        memberships: [
          { organizationId: "org-a", role: "owner" },
          { organizationId: "org-b", role: "reviewer" },
        ],
      }),
    ).toEqual({
      identity: { id: "user-1", email: "user@example.com", name: "User One" },
      memberships: [
        { organizationId: "org-a", role: "owner" },
        { organizationId: "org-b", role: "reviewer" },
      ],
    });
  });

  it("derives simultaneous organizer, review, proposal, and speaker-task access", () => {
    const access = deriveAccountAccess({
      session: {
        identity: { id: "user-1", email: "user@example.com", name: "User One" },
        memberships: [{ organizationId: "org-a", role: "owner" }],
      },
      reviewerAssignmentCount: 2,
      portalContexts: [
        portalContext({
          submissionIds: ["submission-1"],
          participantIds: ["participant-1"],
          capabilities: ["task-response"],
        }),
      ],
    });

    expect([...access.capabilities]).toEqual([
      "organizer",
      "reviews",
      "proposals",
      "speaker-tasks",
    ]);
  });

  it("keeps authenticated accounts with no assigned work valid", () => {
    expect(
      deriveAccountAccess({
        session: {
          identity: { id: "user-1", email: "user@example.com", name: null },
          memberships: [],
        },
        reviewerAssignmentCount: 0,
        portalContexts: [],
      }).capabilities.size,
    ).toBe(0);
  });
});
