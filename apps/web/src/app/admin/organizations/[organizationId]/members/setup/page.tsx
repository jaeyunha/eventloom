import type { Metadata } from "next";
import { MemberSetup } from "@/features/members/member-setup";

export const metadata: Metadata = {
  referrer: "no-referrer",
};
interface MemberSetupPageProps {
  readonly params: Promise<{ organizationId: string }>;
  readonly searchParams: Promise<{ token?: string | string[] }>;
}

export default async function MemberSetupPage({ params, searchParams }: MemberSetupPageProps) {
  const [{ organizationId }, query] = await Promise.all([params, searchParams]);
  const token = Array.isArray(query.token) ? query.token[0] : query.token;

  return (
    <MemberSetup organizationId={organizationId} token={typeof token === "string" ? token : null} />
  );
}
