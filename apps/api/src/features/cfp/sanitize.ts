import type { CfpForm, FormField, Submission } from "./model";

function isUnsafeControlCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return (
    codePoint <= 8 ||
    (codePoint >= 11 && codePoint <= 12) ||
    (codePoint >= 14 && codePoint <= 31) ||
    codePoint === 127
  );
}

export function sanitizePlainText(value: string): string {
  return [...value]
    .filter((character) => !isUnsafeControlCharacter(character))
    .join("")
    .trim();
}

export function sanitizeRichText(value: string): string {
  // CFP rich text uses a text-only storage policy so repeated autosaves stay safe and idempotent.
  return sanitizePlainText(value).replaceAll("<", "").replaceAll(">", "");
}

function sanitizeFieldAnswers(
  fields: FormField[],
  answers: Record<string, unknown>,
): Record<string, unknown> {
  const kinds = new Map(fields.map((field) => [field.key, field.kind]));
  return Object.fromEntries(
    Object.entries(answers).map(([key, value]) => {
      if (typeof value !== "string") {
        return [key, value];
      }
      return [
        key,
        kinds.get(key) === "rich_text" ? sanitizeRichText(value) : sanitizePlainText(value),
      ];
    }),
  );
}

export function sanitizeForm(form: CfpForm): CfpForm {
  return {
    ...form,
    name: sanitizePlainText(form.name),
    welcomeContent: sanitizeRichText(form.welcomeContent),
    settings: {
      ...form.settings,
      confirmationMessage: sanitizeRichText(form.settings.confirmationMessage),
      successContent: sanitizeRichText(form.settings.successContent),
    },
    sections: form.sections.map((section) => ({
      ...section,
      title: sanitizePlainText(section.title),
      description: sanitizeRichText(section.description),
    })),
    submissionFields: form.submissionFields.map((field) => ({
      ...field,
      label: sanitizePlainText(field.label),
      options: field.options.map(sanitizePlainText),
    })),
    participantFields: form.participantFields.map((field) => ({
      ...field,
      label: sanitizePlainText(field.label),
      options: field.options.map(sanitizePlainText),
    })),
  };
}

export function sanitizeSubmission(submission: Submission, form: CfpForm): Submission {
  return {
    ...submission,
    answers: sanitizeFieldAnswers(form.submissionFields, submission.answers),
    participants: submission.participants.map((participant) => ({
      ...participant,
      firstName: sanitizePlainText(participant.firstName),
      lastName: sanitizePlainText(participant.lastName),
      email: sanitizePlainText(participant.email).toLowerCase(),
      biography: sanitizeRichText(participant.biography),
      answers: sanitizeFieldAnswers(form.participantFields, participant.answers),
    })),
    secondaryContacts: submission.secondaryContacts.map((contact) => ({
      ...contact,
      name: sanitizePlainText(contact.name),
      email: sanitizePlainText(contact.email).toLowerCase(),
    })),
  };
}
