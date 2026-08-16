import type { OrganizationMember } from "../../members/api";

export function reviewerDisplayLabel(
  reviewerId: string,
  members: readonly OrganizationMember[],
): string {
  const member = members.find((candidate) => candidate.userId === reviewerId);
  return member?.name?.trim() || member?.email || reviewerId;
}
