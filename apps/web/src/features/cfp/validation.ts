import type { CfpDraft, CfpStep } from "./types";

export type ValidationErrors = Record<string, string>;

export interface PasswordChecks {
  minimumLength: boolean;
  specialCharacter: boolean;
  number: boolean;
  capitalLetter: boolean;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function getPasswordChecks(password: string): PasswordChecks {
  return {
    minimumLength: password.length >= 8,
    specialCharacter: /[^A-Za-z0-9]/.test(password),
    number: /[0-9]/.test(password),
    capitalLetter: /[A-Z]/.test(password),
  };
}

function addRequired(errors: ValidationErrors, key: string, value: string, label: string): void {
  if (!value.trim()) errors[key] = `${label} is required.`;
}

function validateAccountProfile(draft: CfpDraft): ValidationErrors {
  const errors: ValidationErrors = {};
  addRequired(errors, "account.email", draft.account.email, "Email address");
  addRequired(errors, "account.firstName", draft.account.firstName, "First name");
  addRequired(errors, "account.lastName", draft.account.lastName, "Last name");

  if (draft.account.email && !EMAIL_PATTERN.test(draft.account.email)) {
    errors["account.email"] = "Enter a valid email address.";
  }
  if (draft.account.firstName.length > 255) errors["account.firstName"] = "First name must be 255 characters or fewer.";
  if (draft.account.lastName.length > 255) errors["account.lastName"] = "Last name must be 255 characters or fewer.";
  if (!draft.account.acceptedTerms) errors["account.acceptedTerms"] = "Accept the terms to continue.";

  return errors;
}

export function validateAccount(draft: CfpDraft, password: string): ValidationErrors {
  const errors = validateAccountProfile(draft);
  const checks = getPasswordChecks(password);
  if (!Object.values(checks).every(Boolean)) {
    errors["account.password"] = "Password must meet every security requirement.";
  }
  return errors;
}

export function validateSubmission(draft: CfpDraft): ValidationErrors {
  const errors: ValidationErrors = {};
  const { submission } = draft;

  addRequired(errors, "submission.title", submission.title, "Title");
  addRequired(errors, "submission.description", submission.description, "Description");
  addRequired(errors, "submission.format", submission.format, "Format");
  addRequired(errors, "submission.track", submission.track, "Track");

  if (submission.tags.length === 0) errors["submission.tags"] = "Select at least one tag.";
  if (submission.title.length > 255) errors["submission.title"] = "Title must be 255 characters or fewer.";
  if (submission.description.length > 5_000) {
    errors["submission.description"] = "Description must be 5,000 characters or fewer.";
  }

  return errors;
}

export function validateParticipants(draft: CfpDraft): ValidationErrors {
  const errors: ValidationErrors = {};
  if (draft.participants.length === 0) errors.participants = "Add at least one participant.";
  if (draft.participants.length > 15) errors.participants = "A submission can include at most 15 participants.";

  const participantEmails = new Set<string>();
  draft.participants.forEach((participant, index) => {
    const prefix = `participants.${index}`;
    addRequired(errors, `${prefix}.firstName`, participant.firstName, "First name");
    addRequired(errors, `${prefix}.lastName`, participant.lastName, "Last name");
    addRequired(errors, `${prefix}.email`, participant.email, "Email address");

    const normalizedEmail = participant.email.trim().toLowerCase();
    if (normalizedEmail && !EMAIL_PATTERN.test(normalizedEmail)) {
      errors[`${prefix}.email`] = "Enter a valid email address.";
    } else if (normalizedEmail && participantEmails.has(normalizedEmail)) {
      errors[`${prefix}.email`] = "Each participant must use a unique email address.";
    }
    if (normalizedEmail) participantEmails.add(normalizedEmail);
    if (participant.firstName.length > 255) errors[`${prefix}.firstName`] = "First name must be 255 characters or fewer.";
    if (participant.lastName.length > 255) errors[`${prefix}.lastName`] = "Last name must be 255 characters or fewer.";
    if (participant.biography.length > 5_000) errors[`${prefix}.biography`] = "Biography must be 5,000 characters or fewer.";
  });

  draft.secondaryContacts.forEach((contact, index) => {
    const prefix = `secondaryContacts.${index}`;
    addRequired(errors, `${prefix}.firstName`, contact.firstName, "First name");
    addRequired(errors, `${prefix}.lastName`, contact.lastName, "Last name");
    addRequired(errors, `${prefix}.email`, contact.email, "Email address");
    if (contact.email && !EMAIL_PATTERN.test(contact.email)) {
      errors[`${prefix}.email`] = "Enter a valid email address.";
    }
  });

  return errors;
}

export function validateStep(step: CfpStep, draft: CfpDraft, password = ""): ValidationErrors {
  switch (step) {
    case "welcome":
      return {};
    case "account":
      return validateAccount(draft, password);
    case "submission":
      return validateSubmission(draft);
    case "participants":
      return validateParticipants(draft);
    case "review":
      return {
        ...validateAccountProfile(draft),
        ...validateSubmission(draft),
        ...validateParticipants(draft),
      };
  }
}

export function getFirstInvalidStep(draft: CfpDraft): CfpStep | null {
  if (Object.keys(validateAccountProfile(draft)).length > 0) return "account";
  if (Object.keys(validateSubmission(draft)).length > 0) return "submission";
  if (Object.keys(validateParticipants(draft)).length > 0) return "participants";
  return null;
}
