import type { CfpForm, FormField, Submission } from "./model";

const unsafeControlCharacters = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function sanitizePlainText(value: string): string {
  return value.replace(unsafeControlCharacters, "").trim();
}

export function sanitizeRichText(value: string): string {
  return sanitizePlainText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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
