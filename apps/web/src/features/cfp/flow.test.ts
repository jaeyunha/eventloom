import { describe, expect, it } from "vitest";
import { getCfpStepRoute, getNextCfpStep, getPreviousCfpStep } from "./routes";
import { createEmptyDraft, createEmptyParticipant, markDraftSubmitted, syncPrimaryParticipant } from "./types";

describe("CFP flow", () => {
  it("maps the evidence-defined account-first sequence to stable routes", () => {
    const eventSlug = "future/conf";

    expect(getCfpStepRoute(eventSlug, "welcome")).toBe("/cfp/future%2Fconf");
    expect(getCfpStepRoute(eventSlug, "account")).toBe("/cfp/future%2Fconf/account");
    expect(getNextCfpStep("welcome")).toBe("account");
    expect(getNextCfpStep("account")).toBe("submission");
    expect(getNextCfpStep("submission")).toBe("participants");
    expect(getNextCfpStep("participants")).toBe("review");
    expect(getNextCfpStep("review")).toBe("complete");
    expect(getPreviousCfpStep("review")).toBe("participants");
  });

  it("prefills the primary participant from the account without overwriting edits", () => {
    const draft = createEmptyDraft("future-conf", "2026-08-08T12:00:00.000Z");
    draft.account = {
      email: "account@example.com",
      firstName: "Account",
      lastName: "Owner",
      acceptedTerms: true,
    };
    draft.participants[0] = {
      ...createEmptyParticipant("primary"),
      firstName: "Edited",
    };

    const synced = syncPrimaryParticipant(draft, "2026-08-08T12:01:00.000Z");

    expect(synced.participants[0]).toMatchObject({
      firstName: "Edited",
      lastName: "Owner",
      email: "account@example.com",
    });
  });

  it("emits only one stable confirmation receipt across repeated submits", () => {
    const draft = createEmptyDraft("future-conf");
    const first = markDraftSubmitted(draft, "receipt-1", "2026-08-08T12:00:00.000Z");
    const repeated = markDraftSubmitted(first, "receipt-2", "2026-08-08T12:01:00.000Z");

    expect(first.receipt).toEqual({
      id: "receipt-1",
      submittedAt: "2026-08-08T12:00:00.000Z",
    });
    expect(repeated).toBe(first);
  });
});
