import type { Metadata } from "next";
import { EventSettingsWorkspace } from "@/features/settings/event-settings-workspace";

export const metadata: Metadata = {
  title: "Event settings",
  description: "Configure event-scoped session settings, rooms, and program library values.",
};

interface EventSettingsPageProps {
  params: Promise<{ organizationId: string; eventId: string }>;
}

export default async function EventSettingsPage({ params }: EventSettingsPageProps) {
  const { organizationId, eventId } = await params;
  return <EventSettingsWorkspace organizationId={organizationId} eventId={eventId} />;
}
