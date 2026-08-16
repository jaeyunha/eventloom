import type { CfpAuthenticatedSession } from "./api";

export function shouldConfirmCfpApplicantContext(
  session: CfpAuthenticatedSession,
  organizationId: string,
): boolean {
  const currentOrganizationId = organizationId.trim();
  if (currentOrganizationId === "") return false;
  return session.memberships.some(
    (membership) =>
      membership.organizationId === currentOrganizationId &&
      (membership.role === "owner" || membership.role === "admin"),
  );
}
