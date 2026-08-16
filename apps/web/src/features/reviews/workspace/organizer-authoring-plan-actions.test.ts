import { describe, expect, it, vi } from "vitest";
import { useOrganizerPlanActions } from "./organizer-authoring-plan-actions";
import type { OrganizerRoundActions } from "./organizer-authoring-round-actions";
import { reviewPlanClosesAtField } from "./review-temporal-policy";

function unresolvedPlanScope(
  setMessage: (message: string | null) => void,
  status: "draft" | "open" = "draft",
): OrganizerRoundActions {
  return {
    seed: { planId: "plan-test" },
    baseUrl: "",
    reviewerMembersError: null,
    onAuthoritativePlan: undefined,
    name: "Review plan",
    setName: () => undefined,
    planClosesAt: "2026-03-08T09:30:00.000Z",
    setPlanClosesAt: () => undefined,
    blindReview: false,
    setBlindReview: () => undefined,
    reviewsPerSubmission: 1,
    setReviewsPerSubmission: () => undefined,
    maxAssignmentsPerReviewer: 5,
    setMaxAssignmentsPerReviewer: () => undefined,
    fieldIds: "",
    setFieldIds: () => undefined,
    fileIds: "",
    setFileIds: () => undefined,
    rounds: [],
    setRounds: () => undefined,
    setMessage,
    version: 3,
    setVersion: () => undefined,
    status,
    setStatus: () => undefined,
    setBusy: () => undefined,
    reviewerIdSet: new Set<string>(),
    reviewerDirectoryReady: true,
    unresolvedTemporalFields: new Set([reviewPlanClosesAtField]),
  } as unknown as OrganizerRoundActions;
}

describe("review authoring temporal integrity", () => {
  it.each([
    ["draft", "saveDraft"],
    ["open", "saveSchedule"],
  ] as const)(
    "blocks the %s save path while a DST-local draft is unresolved",
    async (status, action) => {
      const setMessage = vi.fn();
      const fetchMock = vi.spyOn(globalThis, "fetch");
      const actions = useOrganizerPlanActions(unresolvedPlanScope(setMessage, status));

      await actions[action]();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(setMessage).toHaveBeenCalledWith(
        "Resolve the invalid or ambiguous review date and time before saving.",
      );
    },
  );
});
