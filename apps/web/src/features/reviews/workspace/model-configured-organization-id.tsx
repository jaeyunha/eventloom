export function configuredOrganizationId(explicit: string | undefined): string | null {
  const value = explicit?.trim() ?? "";
  return value.length > 0 ? value : null;
}
