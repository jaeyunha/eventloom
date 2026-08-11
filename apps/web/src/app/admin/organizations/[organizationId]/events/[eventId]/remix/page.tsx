import type { Metadata } from "next";
import { RemixWorkspace } from "@/features/remix/remix-workspace";

export const metadata: Metadata = {
  title: "Content remix workspace",
  description: "Review private content remix candidates and apply approved event copy.",
};

interface RemixPageProps {
  params: Promise<{ organizationId: string; eventId: string }>;
}

export default async function RemixPage({ params }: RemixPageProps) {
  const { organizationId, eventId } = await params;
  return <RemixWorkspace organizationId={organizationId} eventId={eventId} />;
}
