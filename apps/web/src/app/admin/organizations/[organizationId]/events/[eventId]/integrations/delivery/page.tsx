import { IntegrationAdmin } from "@/features/integrations/integration-admin";

interface IntegrationDeliveryPageProps {
  readonly params: Promise<{ organizationId: string; eventId: string }>;
}

export default async function IntegrationDeliveryPage({ params }: IntegrationDeliveryPageProps) {
  const { organizationId, eventId } = await params;
  return <IntegrationAdmin organizationId={organizationId} eventId={eventId} section="delivery" />;
}
