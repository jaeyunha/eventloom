import type { OrganizationRole, UserPrincipal } from "../auth/types";
import type { EvaluationRole } from "./types";

const evaluationRoleOrder: readonly EvaluationRole[] = ["organizer", "reviewer"];

export function evaluationRolesForOrganizationMembership(
  role: OrganizationRole,
): readonly EvaluationRole[] {
  switch (role) {
    case "owner":
    case "admin":
      return ["organizer"];
    case "reviewer":
      return [];
  }
}

export function evaluationRolesForPrincipal(
  principal: UserPrincipal,
  organizationId: string,
  eventId: string,
): readonly EvaluationRole[] {
  const roles = new Set<EvaluationRole>();
  const membership = principal.memberships.find(
    (candidate) => candidate.organizationId === organizationId,
  );
  if (membership !== undefined) {
    for (const role of evaluationRolesForOrganizationMembership(membership.role)) roles.add(role);
  }
  if (
    principal.reviewerGrants.some(
      (grant) => grant.organizationId === organizationId && grant.eventId === eventId,
    )
  ) {
    roles.add("reviewer");
  }
  return evaluationRoleOrder.filter((role) => roles.has(role));
}
