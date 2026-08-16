import { redirect } from "next/navigation";
import { eventSettingsSectionHref } from "@/features/settings/event-settings-sections";

interface EventSettingsPageProps {
  params: Promise<{ organizationId: string; eventId: string }>;
}

export default async function EventSettingsPage({ params }: EventSettingsPageProps) {
  const { organizationId, eventId } = await params;
  redirect(eventSettingsSectionHref(organizationId, eventId, "workflow"));
}
