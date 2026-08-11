import type { Metadata } from "next";
import { SpeakerWorkspace } from "@/features/speakers/speaker-workspace";

export const metadata: Metadata = {
  title: "Speaker roster",
  description: "Manage event-scoped speaker profiles, onboarding tasks, and portal progress.",
};

interface SpeakersPageProps {
  readonly params: Promise<{ organizationId: string; eventId: string }>;
}

export default async function SpeakersPage({ params }: SpeakersPageProps) {
  const { organizationId, eventId } = await params;
  return <SpeakerWorkspace organizationId={organizationId} eventId={eventId} />;
}
