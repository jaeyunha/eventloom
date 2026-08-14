import type { OrganizationRole } from "../auth/types";
import type { EvaluationRole } from "./types";

export function evaluationRolesForOrganizationMembership(
  role: OrganizationRole,
): readonly EvaluationRole[] {
  switch (role) {
    case "owner":
    case "admin":
      return ["organizer", "reviewer"];
    case "reviewer":
      return ["reviewer"];
  }
}
