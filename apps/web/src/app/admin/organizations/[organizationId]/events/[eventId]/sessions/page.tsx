import type { Metadata } from "next";
import { SessionsWorkspace } from "@/features/sessions/session-workspace";

export const metadata: Metadata = {
  title: "Sessions",
  description: "Edit canonical session content, approval status, and immutable history.",
};

interface SessionsPageProps {
  readonly params: Promise<{ organizationId: string; eventId: string }>;
}

export default async function SessionsPage({ params }: SessionsPageProps) {
  const { organizationId, eventId } = await params;
  return <SessionsWorkspace eventId={eventId} organizationId={organizationId} />;
}
