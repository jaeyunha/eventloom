import type { Metadata } from "next";
import { MemberWorkspace } from "@/features/members/member-workspace";

export const metadata: Metadata = {
  title: "Organization members",
  description: "Manage organization members, reviewer invitations, and event-round reviewer pools.",
};

interface MembersPageProps {
  readonly params: Promise<{ organizationId: string }>;
}

export default async function MembersPage({ params }: MembersPageProps) {
  const { organizationId } = await params;
  return <MemberWorkspace organizationId={organizationId} />;
}
