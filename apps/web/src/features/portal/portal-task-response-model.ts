import type {
  PortalFormAnswer,
  PortalFormField,
  PortalTaskForm,
  PortalTaskResponse,
  PortalTaskResponseEnvelope,
} from "./types";

export type ResponseFieldErrors = Readonly<Record<string, string>>;

function missing(field: PortalFormField, answer: PortalFormAnswer | undefined): boolean {
  if (!field.required) return false;
  if (answer == null) return true;
  if (typeof answer === "string") return answer.trim() === "";
  if (Array.isArray(answer)) return answer.length === 0;
  return (field.type === "checkbox" || field.type === "boolean") && answer !== true;
}

export function responseFieldErrors(
  fields: readonly PortalFormField[],
  answers: Readonly<Record<string, PortalFormAnswer>>,
): ResponseFieldErrors {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const answer = answers[field.id];
    if (missing(field, answer)) {
      errors[field.id] = `${field.label} is required.`;
    } else if (
      field.type === "email" &&
      typeof answer === "string" &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answer)
    ) {
      errors[field.id] = "Enter a valid email address.";
    } else if (field.type === "url" && typeof answer === "string" && answer.trim()) {
      try {
        const url = new URL(answer);
        if (!["http:", "https:"].includes(url.protocol)) throw new Error("protocol");
      } catch {
        errors[field.id] = "Enter a valid HTTP or HTTPS URL.";
      }
    } else if (field.type === "number" && typeof answer === "number" && !Number.isFinite(answer)) {
      errors[field.id] = "Enter a valid number.";
    }
  }
  return errors;
}

export function firstInvalidFieldId(
  fields: readonly PortalFormField[],
  errors: ResponseFieldErrors,
): string | null {
  return fields.find((field) => errors[field.id] !== undefined)?.id ?? null;
}

export function returnedOrganizerFeedback(
  response: PortalTaskResponse | null | undefined,
): string | null {
  return response?.organizerFeedback && ["needs_changes", "reopened"].includes(response.status)
    ? response.organizerFeedback
    : null;
}

export function initialAnswers(
  form: PortalTaskForm,
  response: PortalTaskResponseEnvelope | null | undefined,
): Readonly<Record<string, PortalFormAnswer>> {
  const latest = response?.latestResponse ?? form.latestResponse;
  return Object.fromEntries(
    form.fields.map((field) => [field.id, latest?.answers[field.id] ?? null]),
  );
}
