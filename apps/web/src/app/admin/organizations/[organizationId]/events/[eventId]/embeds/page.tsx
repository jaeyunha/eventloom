import type { Metadata } from "next";
import { EmbedWorkspace } from "@/features/embeds-admin/embed-workspace";

export const metadata: Metadata = {
  title: "Embed widgets",
  description:
    "Generate safe, self-updating public event widgets without exposing private organizer data.",
};

interface EmbedsPageProps {
  readonly params: Promise<{ organizationId: string; eventId: string }>;
}

export default async function EmbedsPage({ params }: EmbedsPageProps) {
  const { organizationId, eventId } = await params;
  return <EmbedWorkspace organizationId={organizationId} eventId={eventId} />;
}
