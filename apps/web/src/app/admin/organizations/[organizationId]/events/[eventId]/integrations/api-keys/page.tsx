import { IntegrationAdmin } from "@/features/integrations/integration-admin";

interface IntegrationApiKeysPageProps {
  readonly params: Promise<{ organizationId: string; eventId: string }>;
}

export default async function IntegrationApiKeysPage({ params }: IntegrationApiKeysPageProps) {
  const { organizationId, eventId } = await params;
  return <IntegrationAdmin organizationId={organizationId} eventId={eventId} section="api-keys" />;
}
