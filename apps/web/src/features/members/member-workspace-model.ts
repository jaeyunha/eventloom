import { memberRoles, type MemberRole } from "./api";

const reviewerOnlyInviteRoles = ["reviewer"] as const;

export function inviteRolesForOrganization(role: MemberRole | undefined): readonly MemberRole[] {
  return role === "owner" ? memberRoles : reviewerOnlyInviteRoles;
}
