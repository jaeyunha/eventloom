import { OrganizationIntegrationsWorkspace } from "@/features/integrations/organization-integrations-workspace";

interface OrganizationApiKeysPageProps {
  readonly params: Promise<{ organizationId: string }>;
}

export default async function OrganizationApiKeysPage({ params }: OrganizationApiKeysPageProps) {
  const { organizationId } = await params;
  return <OrganizationIntegrationsWorkspace organizationId={organizationId} section="api-keys" />;
}
