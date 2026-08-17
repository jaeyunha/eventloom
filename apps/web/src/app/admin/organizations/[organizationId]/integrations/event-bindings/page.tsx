import { OrganizationIntegrationsWorkspace } from "@/features/integrations/organization-integrations-workspace";

interface OrganizationEventBindingsPageProps {
  readonly params: Promise<{ organizationId: string }>;
}

export default async function OrganizationEventBindingsPage({
  params,
}: OrganizationEventBindingsPageProps) {
  const { organizationId } = await params;
  return (
    <OrganizationIntegrationsWorkspace organizationId={organizationId} section="event-bindings" />
  );
}
