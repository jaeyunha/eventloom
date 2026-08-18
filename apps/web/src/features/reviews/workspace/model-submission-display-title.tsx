export function submissionDisplayTitle(input: {
  readonly id?: string | undefined;
  readonly title?: string | null | undefined;
}): string {
  const title = input.title?.trim();
  return title && title !== input.id ? title : "No title";
}
