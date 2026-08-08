import { describe, expect, it } from "vitest";
import { createEmptyDraft, createEmptyParticipant } from "./types";
import {
  getFirstInvalidStep,
  getPasswordChecks,
  validateAccount,
  validateParticipants,
  validateSubmission,
} from "./validation";

function createValidDraft() {
  const draft = createEmptyDraft("future-conf");
  draft.account = {
    email: "speaker@example.com",
    firstName: "Avery",
    lastName: "Speaker",
    acceptedTerms: true,
  };
  draft.submission = {
    title: "Production systems without heroics",
    description: "A practical session about reliable systems.",
    format: "Breakout Session",
    tags: ["Leadership"],
    track: "Track 2",
    level: "Intermediate",
    language: "English",
  };
  draft.participants[0] = {
    ...createEmptyParticipant("primary"),
    firstName: "Avery",
    lastName: "Speaker",
    email: "speaker@example.com",
  };
  return draft;
}

describe("CFP validation", () => {
  it("reports each password rule independently", () => {
    expect(getPasswordChecks("short")).toEqual({
      minimumLength: false,
      specialCharacter: false,
      number: false,
      capitalLetter: false,
    });
    expect(getPasswordChecks("Secure#9")).toEqual({
      minimumLength: true,
      specialCharacter: true,
      number: true,
      capitalLetter: true,
    });
  });

  it("requires an accessible account identity, consent, and secure password", () => {
    const errors = validateAccount(createEmptyDraft("future-conf"), "password");

    expect(errors["account.email"]).toBe("Email address is required.");
    expect(errors["account.firstName"]).toBe("First name is required.");
    expect(errors["account.acceptedTerms"]).toBe("Accept the terms to continue.");
    expect(errors["account.password"]).toBe("Password must meet every security requirement.");
  });

  it("requires routing metadata on the submission", () => {
    const errors = validateSubmission(createEmptyDraft("future-conf"));

    expect(errors["submission.title"]).toBe("Title is required.");
    expect(errors["submission.description"]).toBe("Description is required.");
    expect(errors["submission.format"]).toBe("Format is required.");
    expect(errors["submission.tags"]).toBe("Select at least one tag.");
    expect(errors["submission.track"]).toBe("Track is required.");
  });

  it("rejects duplicate participant emails and incomplete secondary contacts", () => {
    const draft = createValidDraft();
    draft.participants.push({
      ...createEmptyParticipant("co-speaker", "Co-speaker"),
      firstName: "Morgan",
      lastName: "Speaker",
      email: "SPEAKER@example.com",
    });
    draft.secondaryContacts.push({ id: "contact-1", firstName: "", lastName: "Helper", email: "invalid" });

    const errors = validateParticipants(draft);

    expect(errors["participants.1.email"]).toBe("Each participant must use a unique email address.");
    expect(errors["secondaryContacts.0.firstName"]).toBe("First name is required.");
    expect(errors["secondaryContacts.0.email"]).toBe("Enter a valid email address.");
  });

  it("accepts the complete multi-step draft", () => {
    const draft = createValidDraft();

    expect(validateAccount(draft, "Secure#9")).toEqual({});
    expect(validateSubmission(draft)).toEqual({});
    expect(validateParticipants(draft)).toEqual({});
    expect(getFirstInvalidStep(draft)).toBeNull();
  });
});
