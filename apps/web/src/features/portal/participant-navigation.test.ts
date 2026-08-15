import { describe, expect, it } from "vitest";
import {
  createParticipantNavigation,
  type ParticipantNavigationInput,
} from "./participant-navigation";

const baseInput: ParticipantNavigationInput = {
  eventId: "event/summit",
  participantId: "participant 1",
  capabilities: ["profile-self", "submission-edit", "task-response"],
  submissions: [{ id: "submission-1", status: "submitted" }],
  pathname: "/portal/tasks",
  eventQuery: "?event=event%2Fsummit",
};

describe("participant navigation", () => {
  it("exposes submitter destinations with context-preserving hrefs and active state", () => {
    const navigation = createParticipantNavigation(baseInput);

    expect(navigation.primary.map((item) => item.id)).toEqual([
      "my-events",
      "submissions",
      "tasks",
      "profile",
    ]);
    expect(navigation.secondary).toEqual([]);
    expect(navigation.primary.find((item) => item.id === "tasks")).toMatchObject({
      label: "Tasks",
      mobileLabel: "Tasks",
      href: "/portal/tasks?event=event%2Fsummit&participant=participant%201",
      active: true,
      group: "primary",
    });
  });

  it("shows accepted-only destinations only for an accepted submission and capability", () => {
    const navigation = createParticipantNavigation({
      ...baseInput,
      capabilities: [
        "profile-self",
        "submission-edit",
        "task-response",
        "asset-read",
        "resource-read",
      ],
      submissions: [{ id: "submission-1", status: "accepted" }],
      pathname: "/portal?workspace=files",
    });

    expect(navigation.secondary.map((item) => item.id)).toEqual([
      "sessions",
      "files",
      "event-guide",
    ]);
    expect(navigation.secondary.find((item) => item.id === "files")).toMatchObject({
      href: "/portal?workspace=files&event=event%2Fsummit&participant=participant%201",
      active: true,
      desktopLabel: "Files",
      mobileLabel: "Files",
    });
  });

  it("does not infer acceptance or lose an existing event query", () => {
    const navigation = createParticipantNavigation({
      ...baseInput,
      capabilities: ["profile-self", "asset-read", "resource-read"],
      submissions: [{ id: "submission-1", status: "under_review" }],
      eventQuery: "?event=other-event&filter=active",
    });

    expect(navigation.secondary).toEqual([]);
    expect(navigation.primary.find((item) => item.id === "profile")?.href).toBe(
      "/portal/profile?event=other-event&filter=active&participant=participant%201",
    );
    expect(navigation.primary.find((item) => item.id === "profile")?.active).toBe(false);
  });
});
