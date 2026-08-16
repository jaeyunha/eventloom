import { OrganizationSettingsWorkspace } from "@/features/members/organization-settings-workspace";

interface OrganizationSettingsPageProps {
  readonly params: Promise<{ organizationId: string }>;
}

export default async function OrganizationSettingsPage({ params }: OrganizationSettingsPageProps) {
  const { organizationId } = await params;
  return <OrganizationSettingsWorkspace organizationId={organizationId} />;
}
