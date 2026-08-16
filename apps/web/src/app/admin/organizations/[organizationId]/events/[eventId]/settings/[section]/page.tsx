import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveEventSettingsSection } from "@/features/settings/event-settings-sections";
import { EventSettingsWorkspace } from "@/features/settings/event-settings-workspace";

export const metadata: Metadata = {
  title: "Event settings",
  description: "Configure event-scoped workflow, rooms, classification, and change history.",
};

interface EventSettingsSectionPageProps {
  params: Promise<{ organizationId: string; eventId: string; section: string }>;
}

export default async function EventSettingsSectionPage({ params }: EventSettingsSectionPageProps) {
  const { organizationId, eventId, section: routeSection } = await params;
  const section = resolveEventSettingsSection(routeSection);
  if (!section) notFound();

  return (
    <EventSettingsWorkspace organizationId={organizationId} eventId={eventId} section={section} />
  );
}
