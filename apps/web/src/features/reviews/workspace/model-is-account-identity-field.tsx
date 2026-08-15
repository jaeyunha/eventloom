export function isAccountIdentityField(fieldId: string): boolean {
  const normalizedId = fieldId.toLowerCase().replace(/[^a-z0-9]/gu, "");
  return (
    normalizedId.includes("email") ||
    normalizedId.includes("name") ||
    normalizedId === "first" ||
    normalizedId === "last"
  );
}
