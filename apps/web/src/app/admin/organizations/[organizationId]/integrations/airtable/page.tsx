import { OrganizationIntegrationsWorkspace } from "@/features/integrations/organization-integrations-workspace";

interface OrganizationAirtablePageProps {
  readonly params: Promise<{ organizationId: string }>;
}

export default async function OrganizationAirtablePage({ params }: OrganizationAirtablePageProps) {
  const { organizationId } = await params;
  return <OrganizationIntegrationsWorkspace organizationId={organizationId} section="airtable" />;
}
