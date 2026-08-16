const conciseSubmissionReference = /^SUB-[A-Z0-9]{1,8}$/iu;
const submissionPrefix = /^SUBMISSION[\s_:-]*/iu;
const referenceCharacters = /[^A-Z0-9]/giu;

export function compactSubmissionReference(reference: string): string {
  const trimmed = reference.trim();
  if (conciseSubmissionReference.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  const payload = trimmed.replace(submissionPrefix, "").replace(referenceCharacters, "");
  if (payload.length === 0) {
    return "Submission";
  }

  return `SUB-${payload.slice(0, 6).toUpperCase()}`;
}
