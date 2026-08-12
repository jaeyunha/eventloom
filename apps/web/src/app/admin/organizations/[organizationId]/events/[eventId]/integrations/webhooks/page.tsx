import { IntegrationAdmin } from "@/features/integrations/integration-admin";

interface IntegrationWebhooksPageProps {
  readonly params: Promise<{ organizationId: string; eventId: string }>;
}

export default async function IntegrationWebhooksPage({ params }: IntegrationWebhooksPageProps) {
  const { organizationId, eventId } = await params;
  return <IntegrationAdmin organizationId={organizationId} eventId={eventId} section="webhooks" />;
}
