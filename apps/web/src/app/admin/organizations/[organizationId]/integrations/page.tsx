import { OrganizationIntegrationsWorkspace } from "@/features/integrations/organization-integrations-workspace";

interface OrganizationIntegrationsPageProps {
  readonly params: Promise<{ organizationId: string }>;
}

export default async function OrganizationIntegrationsPage({
  params,
}: OrganizationIntegrationsPageProps) {
  const { organizationId } = await params;
  return (
    <OrganizationIntegrationsWorkspace organizationId={organizationId} section="connections" />
  );
}
