function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sessionHasAuthenticatedUser(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (isRecord(value.user)) return true;
  return isRecord(value.data) && isRecord(value.data.user);
}
