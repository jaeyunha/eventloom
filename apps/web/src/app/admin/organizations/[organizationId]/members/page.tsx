import type { Metadata } from "next";
import { MemberWorkspace } from "@/features/members/member-workspace";

export const metadata: Metadata = {
  title: "Organization members",
  description: "Manage organization members, roles, and reviewer invitations.",
};

interface MembersPageProps {
  readonly params: Promise<{ organizationId: string }>;
  readonly searchParams: Promise<{ tab?: string | readonly string[] | undefined }>;
}

export default async function MembersPage({ params, searchParams }: MembersPageProps) {
  const { organizationId } = await params;
  const { tab } = await searchParams;
  return (
    <MemberWorkspace
      organizationId={organizationId}
      initialTab={tab === "invite" ? "invite" : "people"}
    />
  );
}
