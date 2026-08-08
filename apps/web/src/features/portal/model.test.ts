import { describe, expect, it } from "vitest";
import {
  filterSubmissions,
  filterTasks,
  isTaskBlocked,
  submissionStatusPresentation,
  summarizePortal,
  taskPrimaryAction,
  validateBiography,
} from "./model";
import type { PortalTask, PortalView } from "./types";

function task(overrides: Partial<PortalTask> = {}): PortalTask {
  return {
    id: "task-1",
    eventId: "event-1",
    submissionId: "submission-1",
    participantId: "participant-1",
    type: "form",
    owner: "speaker",
    title: "Confirm details",
    status: "not_started",
    dependencyIds: [],
    reminderOffsetsMinutes: [],
    version: 1,
    updatedAt: "2026-08-08T12:00:00.000Z",
    ...overrides,
  };
}

const portal: PortalView = {
  submissions: [
    {
      id: "submission-1",
      eventId: "event-1",
      title: "Designing resilient queues",
      status: "accepted",
      participantIds: ["participant-1"],
      updatedAt: "2026-08-08T12:00:00.000Z",
    },
    {
      id: "submission-2",
      eventId: "event-1",
      title: "Practical accessibility",
      status: "under_review",
      participantIds: ["participant-1"],
      updatedAt: "2026-08-07T12:00:00.000Z",
    },
  ],
  profiles: [],
  tasks: [task({ id: "task-1", status: "completed" }), task({ id: "task-2" })],
  outstandingTaskCount: 1,
};

describe("speaker portal view model", () => {
  it("presents human-readable submission decisions", () => {
    expect(submissionStatusPresentation("accepted")).toMatchObject({
      label: "Accepted",
      tone: "success",
    });
    expect(submissionStatusPresentation("declined").description).toContain("not selected");
  });

  it("blocks tasks until every dependency is finished", () => {
    const dependent = task({ id: "dependent", dependencyIds: ["required", "waived"] });
    expect(
      isTaskBlocked(dependent, [
        dependent,
        task({ id: "required", status: "in_progress" }),
        task({ id: "waived", status: "waived" }),
      ]),
    ).toBe(true);
    expect(
      isTaskBlocked(dependent, [
        dependent,
        task({ id: "required", status: "completed" }),
        task({ id: "waived", status: "waived" }),
      ]),
    ).toBe(false);
    expect(isTaskBlocked(task({ dependencyIds: ["missing"] }), [])).toBe(true);
  });

  it("selects actions that match the speaker task transition contract", () => {
    expect(taskPrimaryAction(task({ type: "form", status: "not_started" }))).toBe("start");
    expect(taskPrimaryAction(task({ type: "form", status: "in_progress" }))).toBe("submit");
    expect(taskPrimaryAction(task({ type: "upload", status: "needs_changes" }))).toBe("upload");
    expect(taskPrimaryAction(task({ type: "action", status: "not_started" }))).toBe("complete");
    expect(taskPrimaryAction(task({ status: "submitted" }))).toBeNull();
    expect(taskPrimaryAction(task({ status: "completed" }))).toBeNull();
  });

  it("filters submissions and tasks without mutating source data", () => {
    expect(filterSubmissions(portal.submissions, "ACCESS").map(({ id }) => id)).toEqual([
      "submission-2",
    ]);
    expect(filterSubmissions(portal.submissions, "")).not.toBe(portal.submissions);
    expect(filterTasks(portal.tasks, "attention").map(({ id }) => id)).toEqual(["task-2"]);
    expect(filterTasks(portal.tasks, "finished").map(({ id }) => id)).toEqual(["task-1"]);
  });

  it("summarizes accepted submissions and readiness", () => {
    expect(summarizePortal(portal)).toEqual({
      submissionCount: 2,
      acceptedCount: 1,
      outstandingTaskCount: 1,
      completedTaskCount: 1,
      completionPercent: 50,
    });
    expect(summarizePortal({ ...portal, tasks: [], outstandingTaskCount: 0 }).completionPercent).toBe(
      100,
    );
  });

  it("normalizes biographies and enforces the API text policy", () => {
    expect(validateBiography("  First line\r\nSecond line  ")).toEqual({
      success: true,
      biography: "First line\nSecond line",
    });
    expect(validateBiography("a".repeat(5_001))).toEqual({
      success: false,
      message: "Biography must be 5,000 characters or fewer.",
    });
    expect(validateBiography("hello\u0000world")).toEqual({
      success: false,
      message: "Biography contains an unsupported control character.",
    });
  });
});
