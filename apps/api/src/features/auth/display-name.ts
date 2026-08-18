export function authDisplayName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const displayName = value.trim();
  return displayName.length > 0 && !displayName.includes("@") ? displayName : undefined;
}
