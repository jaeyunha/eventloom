import type { Metadata } from "next";
import { CommunicationsWorkspace } from "@/features/communications/communications-workspace";

export const metadata: Metadata = {
  title: "Operational communications workspace",
  description:
    "Manage event-scoped operational email templates, previews, sends, and delivery history.",
};

interface CommunicationsPageProps {
  params: Promise<{ organizationId: string; eventId: string }>;
}

export default async function CommunicationsPage({ params }: CommunicationsPageProps) {
  const { organizationId, eventId } = await params;
  return <CommunicationsWorkspace organizationId={organizationId} eventId={eventId} />;
}
