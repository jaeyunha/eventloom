import { IntegrationAdmin } from "@/features/integrations/integration-admin";

interface IntegrationsPageProps {
  readonly params: Promise<{ organizationId: string; eventId: string }>;
}

export default async function IntegrationsPage({ params }: IntegrationsPageProps) {
  const { organizationId, eventId } = await params;
  return <IntegrationAdmin organizationId={organizationId} eventId={eventId} section="overview" />;
}
