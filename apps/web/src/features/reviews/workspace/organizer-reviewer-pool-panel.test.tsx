import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { OrganizationMember, ReviewerPool } from "../../members/api";
import { buildReviewerPoolInput, OrganizerReviewerPoolView } from "./organizer-reviewer-pool-panel";

const reviewers: readonly OrganizationMember[] = [
  {
    organizationId: "org-1",
    userId: "reviewer-a",
    email: "avery@example.test",
    name: "Avery Stone",
    role: "reviewer",
    status: "active",
    emailVerified: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
  {
    organizationId: "org-1",
    userId: "reviewer-b",
    email: "blair@example.test",
    name: "Blair Chen",
    role: "reviewer",
    status: "active",
    emailVerified: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
];

const pool: ReviewerPool = {
  organizationId: "org-1",
  eventId: "event-private-id",
  roundId: "round-private-id",
  reviewerIds: ["reviewer-a"],
  grants: [{ reviewerId: "reviewer-a", maxAssignments: 12, assignedCount: 3 }],
  version: 4,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

describe("organizer reviewer pool panel", () => {
  it("shows a human-readable round team without exposing raw scope identifiers", () => {
    const markup = renderToStaticMarkup(
      createElement(OrganizerReviewerPoolView, {
        roundName: "Initial committee review",
        reviewers,
        pool,
        draft: { "reviewer-a": 12 },
        loading: false,
        saving: false,
        error: null,
        message: null,
        invitationHref: "/admin/organizations/org-1/members?tab=invite",
        onReviewerChange: vi.fn(),
        onMaxAssignmentsChange: vi.fn(),
        onSave: vi.fn(),
      }),
    );

    expect(markup).toContain("Review team for Initial committee review");
    expect(markup).toContain("Avery Stone");
    expect(markup).toContain("3 of 12 assigned");
    expect(markup).toContain("Blair Chen");
    expect(markup).toContain("Save review team");
    expect(markup).toContain("/admin/organizations/org-1/members?tab=invite");
    expect(markup).not.toContain("event-private-id");
    expect(markup).not.toContain("round-private-id");
  });

  it("builds a stable capacity-aware pool update", () => {
    expect(buildReviewerPoolInput({ "reviewer-b": 8, "reviewer-a": 12 }, 4)).toEqual({
      reviewers: [
        { reviewerId: "reviewer-a", maxAssignments: 12 },
        { reviewerId: "reviewer-b", maxAssignments: 8 },
      ],
      expectedVersion: 4,
    });
  });
});
