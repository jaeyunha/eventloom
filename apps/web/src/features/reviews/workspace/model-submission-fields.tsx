"use client";

import { isAccountIdentityField } from "./model-is-account-identity-field";
import { readableSubmissionFieldLabel } from "./model-readable-submission-field-label";

export function submissionFields(
  answers: Readonly<Record<string, unknown>> | undefined,
  redactIdentity = false,
): readonly { id: string; label: string; value: string }[] {
  if (answers === undefined) return [];
  return Object.entries(answers).flatMap(([id, value]) => {
    if (redactIdentity && isAccountIdentityField(id)) return [];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return [{ id, label: readableSubmissionFieldLabel(id), value: String(value) }];
    }
    if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
      return [{ id, label: readableSubmissionFieldLabel(id), value: value.join(", ") }];
    }
    return [];
  });
}
