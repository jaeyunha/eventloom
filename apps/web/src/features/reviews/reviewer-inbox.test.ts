import { describe, expect, it } from "vitest";
import {
  filterReviewerInbox,
  groupReviewerInbox,
  type ReviewerInboxAssignment,
  reviewerDueBucket,
  reviewerInboxItems,
  sortReviewerInbox,
} from "./reviewer-inbox";

const assignment = (overrides: Partial<ReviewerInboxAssignment> = {}): ReviewerInboxAssignment => ({
  id: "assignment-1",
  organizationId: "org-a",
  organizationName: "Organization A",
  eventId: "event-a",
  eventName: "Event A",
  planId: "plan-a",
  planName: "Plan A",
  roundId: "round-a",
  roundName: "Round A",
  title: "Submission A",
  reference: "SUB-A",
  track: "Platform",
  dueAt: "2026-08-16T12:00:00.000Z",
  assignmentStatus: "assigned",
  submittedAt: null,
  ...overrides,
});

describe("reviewer inbox derivation", () => {
  it("classifies deterministic due buckets", () => {
    const now = new Date("2026-08-14T12:00:00.000Z");

    expect(reviewerDueBucket("2026-08-13T12:00:00.000Z", now)).toBe("overdue");
    expect(reviewerDueBucket("2026-08-14T23:00:00.000Z", now)).toBe("today");
    expect(reviewerDueBucket("2026-08-20T12:00:00.000Z", now)).toBe("next-7-days");
    expect(reviewerDueBucket("2026-08-30T12:00:00.000Z", now)).toBe("later");
    expect(reviewerDueBucket(null, now)).toBe("none");
  });

  it("intersects event, status, due, and track filters", () => {
    const now = new Date("2026-08-14T12:00:00.000Z");
    const items = reviewerInboxItems(
      [
        assignment(),
        assignment({
          id: "assignment-2",
          eventId: "event-b",
          eventName: "Event B",
          track: null,
          dueAt: null,
          assignmentStatus: "submitted",
          submittedAt: "2026-08-13T10:00:00.000Z",
        }),
      ],
      new Set(),
      {},
      now,
    );

    expect(
      filterReviewerInbox(items, "needs-review", {
        organizationId: "org-a",
        eventId: "event-a",
        roundKey: "all",
        due: "next-7-days",
        track: "Platform",
      }).map(({ assignment: item }) => item.id),
    ).toEqual(["assignment-1"]);
  });

  it("groups compact rows by event with stable counts", () => {
    const items = reviewerInboxItems(
      [assignment(), assignment({ id: "assignment-2", eventId: "event-b", eventName: "Event B" })],
      new Set(),
      {},
      new Date("2026-08-14T12:00:00.000Z"),
    );

    expect(
      groupReviewerInbox(items, "event").map(({ id, items: grouped }) => [id, grouped.length]),
    ).toEqual([
      ["event-a", 1],
      ["event-b", 1],
    ]);
  });

  it("excludes recused work and sorts actionable deadlines before submitted history", () => {
    const now = new Date("2026-08-14T12:00:00.000Z");
    const items = reviewerInboxItems(
      [
        assignment({ id: "submitted", assignmentStatus: "submitted" }),
        assignment({ id: "due-later", dueAt: "2026-08-20T12:00:00.000Z" }),
        assignment({ id: "due-first", dueAt: "2026-08-15T12:00:00.000Z" }),
        assignment({ id: "recused" }),
      ],
      new Set(["recused"]),
      {},
      now,
    );

    expect(sortReviewerInbox(items).map(({ assignment: item }) => item.id)).toEqual([
      "due-first",
      "due-later",
      "submitted",
    ]);
  });
});
