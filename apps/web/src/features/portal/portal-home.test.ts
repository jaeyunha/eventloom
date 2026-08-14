import { describe, expect, it } from "vitest";
import { selectNextOutstandingPortalTask } from "./portal-home";
import type { PortalTask } from "./types";

function task(overrides: Partial<PortalTask> = {}): PortalTask {
  return {
    id: "task-1",
    eventId: "event-1",
    submissionId: "submission-1",
    participantId: "participant-1",
    type: "action",
    owner: "speaker",
    title: "Complete profile",
    status: "not_started",
    dependencyIds: [],
    reminderOffsetsMinutes: [],
    version: 1,
    updatedAt: "2026-08-14T00:00:00.000Z",
    ...overrides,
  };
}

describe("selectNextOutstandingPortalTask", () => {
  it("prefers an actionable task over an earlier dependency-blocked task", () => {
    const blocked = task({ id: "blocked", dependencyIds: ["required"] });
    const actionable = task({ id: "actionable" });
    const required = task({ id: "required", status: "in_progress" });

    expect(selectNextOutstandingPortalTask([blocked, actionable, required])?.id).toBe("actionable");
  });

  it("returns an outstanding blocked task when no task is actionable", () => {
    const blocked = task({ id: "blocked", dependencyIds: ["required"] });

    expect(selectNextOutstandingPortalTask([blocked])?.id).toBe("blocked");
  });

  it("returns no task after every task is complete or waived", () => {
    expect(
      selectNextOutstandingPortalTask([
        task({ status: "completed" }),
        task({ id: "waived", status: "waived" }),
      ]),
    ).toBeUndefined();
  });
});
