import type { OrganizationMember } from "../../members/api";

export function reviewerDisplayLabel(
  reviewerId: string,
  members: readonly OrganizationMember[],
  fallbackPosition = 1,
): string {
  const member = members.find((candidate) => candidate.userId === reviewerId);
  const name = member?.name?.trim();
  if (name) return name;
  const email = member?.email.trim();
  if (email) return email;
  return `Reviewer ${Math.max(1, fallbackPosition)}`;
}
