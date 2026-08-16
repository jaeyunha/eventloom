export function readableSubmissionFieldLabel(fieldId: string): string {
  const label = fieldId
    .replace(/([a-z])([A-Z])/gu, "$1 $2")
    .replace(/[_-]+/gu, " ")
    .trim();
  return label.length === 0 ? "Submission detail" : label.charAt(0).toUpperCase() + label.slice(1);
}
