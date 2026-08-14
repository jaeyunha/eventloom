const DEFAULT_RETURN_PATH = "/work";

export function safeLoginReturnTo(value: unknown): string {
  if (typeof value !== "string" || value.includes("\\") || value.startsWith("//")) {
    return DEFAULT_RETURN_PATH;
  }
  return /^(?:\/(?:admin|portal|review|work)(?:\/|$|\?)|\/cfp\/organizations\/[a-z0-9][a-z0-9-]{0,199}\/events\/[a-z0-9][a-z0-9-]{0,199}\/account(?:$|[?#]))/u.test(
    value,
  )
    ? value
    : DEFAULT_RETURN_PATH;
}
