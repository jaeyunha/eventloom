import { describe, expect, it, vi } from "vitest";
import {
  type CfpAuthenticatedSession,
  CfpMutationGate,
  type CfpPublishedForm,
  type PublishedCfp,
} from "./api";
import { createCfpStartupStore } from "./cfp-startup-provider";
import {
  canResumeCfpSubmission,
  cfpConfirmationEmailMessage,
  cfpReviewAudienceLevel,
  getCfpCompletionHandoffStorageKey,
  rotateCfpCompletionIdentity,
} from "./cfp-wizard";
import {
  clearCfpSubmissionState,
  getCfpDraftStorageKey,
  getCfpSubmissionPointerStorageKey,
} from "./draft-persistence";
import { getCfpStepRoute, getNextCfpStep, getPreviousCfpStep } from "./routes";
import {
  createEmptyDraft,
  createEmptyParticipant,
  markDraftSubmitted,
  syncPrimaryParticipant,
} from "./types";

describe("CFP flow", () => {
  it("deduplicates published form and session reads across step remounts", async () => {
    const store = createCfpStartupStore();
    const published = { form: { id: "form-1" } } as unknown as PublishedCfp;
    const session = { email: "speaker@example.com" } as CfpAuthenticatedSession;
    const api = {
      getPublished: vi.fn(async () => published),
      getSession: vi.fn(async () => session),
    };
    const identity = { organizationId: "org-1", eventId: "event-1", formId: "form-1" };

    const welcome = store.load(api, identity);
    const account = store.load(api, identity);
    const submission = store.load(api, identity);

    await expect(
      Promise.all([welcome.published, account.published, submission.published]),
    ).resolves.toEqual([published, published, published]);
    await expect(
      Promise.all([welcome.session, account.session, submission.session]),
    ).resolves.toEqual([session, session, session]);
    expect(api.getPublished).toHaveBeenCalledTimes(1);
    expect(api.getSession).toHaveBeenCalledTimes(1);
  });

  it("keeps event caches isolated and retries a failed published-form read", async () => {
    const store = createCfpStartupStore();
    const published = { form: { id: "form-1" } } as unknown as PublishedCfp;
    const api = {
      getPublished: vi
        .fn<() => Promise<PublishedCfp>>()
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValue(published),
      getSession: vi.fn(async () => null),
    };
    const identity = { organizationId: "org-1", eventId: "event-1" };
    await expect(store.load(api, identity).published).rejects.toThrow("offline");
    await expect(store.load(api, identity).published).resolves.toBe(published);
    await expect(
      store.load(api, { organizationId: "org-1", eventId: "event-2" }).published,
    ).resolves.toBe(published);
    expect(api.getPublished).toHaveBeenCalledTimes(3);
  });

  it("maps the evidence-defined account-first sequence to stable routes", () => {
    const eventSlug = "future/conf";

    expect(getCfpStepRoute("org/live", eventSlug, "welcome")).toBe(
      "/cfp/organizations/org%2Flive/events/future%2Fconf",
    );
    expect(getCfpStepRoute("org/live", eventSlug, "account")).toBe(
      "/cfp/organizations/org%2Flive/events/future%2Fconf/account",
    );
    expect(getNextCfpStep("welcome")).toBe("account");
    expect(getNextCfpStep("account")).toBe("submission");
    expect(getNextCfpStep("submission")).toBe("participants");
    expect(getNextCfpStep("participants")).toBe("review");
    expect(getNextCfpStep("review")).toBe("complete");
    expect(getPreviousCfpStep("review")).toBe("participants");
  });
  it("rotates completed submission identity and only resumes editable records", () => {
    const identity = { organizationId: "org-1", eventId: "event-1", formId: "form-1" };
    const pointerKey = getCfpSubmissionPointerStorageKey("org-1", "event-1", "form-1");
    const completionKey = getCfpCompletionHandoffStorageKey("org-1", "event-1", "form-1");
    const localValues = new Map([[pointerKey, "submission-1"]]);
    const sessionValues = new Map<string, string>();

    rotateCfpCompletionIdentity(
      identity,
      " submission-1 ",
      { removeItem: (key) => localValues.delete(key) },
      { setItem: (key, value) => sessionValues.set(key, value) },
    );

    expect(localValues.has(pointerKey)).toBe(false);
    expect(sessionValues.get(completionKey)).toBe("submission-1");
    expect(canResumeCfpSubmission("draft", "welcome")).toBe(true);
    expect(canResumeCfpSubmission("reopened", "account")).toBe(true);
    expect(canResumeCfpSubmission("submitted", "submission")).toBe(true);
    expect(canResumeCfpSubmission("submitted", "welcome")).toBe(false);
  });
  it("reviews the stable audience answer and formats confirmation copy", () => {
    const form = {
      submissionFields: [
        {
          id: "field-audience-level",
          key: "audienceLevel",
          label: "Audience level",
        },
      ],
    } as CfpPublishedForm;

    expect(cfpReviewAudienceLevel(form, { audienceLevel: "Advanced" }, "")).toEqual({
      label: "Audience level",
      value: "Advanced",
    });
    expect(cfpConfirmationEmailMessage("speaker@example.test")).toBe(
      "A confirmation email is queued for speaker@example.test and will include the event name and talk title.",
    );
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
  it("clears the completed draft pointer and legacy browser state before a new session", () => {
    const values = new Map<string, string>([
      [getCfpDraftStorageKey("future-conf"), JSON.stringify(createEmptyDraft("future-conf"))],
      [
        getCfpSubmissionPointerStorageKey("org-1", "future-conf", "future-conf-cfp"),
        "submission_completed",
      ],
    ]);
    const storage = {
      removeItem(key: string) {
        values.delete(key);
      },
    };

    clearCfpSubmissionState(
      "future-conf",
      { organizationId: "org-1", eventId: "future-conf", formId: "future-conf-cfp" },
      storage,
    );

    expect(values).toEqual(new Map());
  });
  it("ignores a stale completion without releasing a newer save", () => {
    const gate = new CfpMutationGate();
    const first = gate.begin();
    expect(first).not.toBeNull();
    expect(gate.begin()).toBeNull();

    gate.invalidate();
    const second = gate.begin();
    expect(second).not.toBeNull();
    if (first === null || second === null) throw new Error("The mutation leases were not created.");

    expect(gate.isCurrent(first)).toBe(false);
    expect(gate.isCurrent(second)).toBe(true);

    gate.finish(first);
    expect(gate.isActive()).toBe(true);
    gate.finish(second);
    expect(gate.isActive()).toBe(false);
  });
});
