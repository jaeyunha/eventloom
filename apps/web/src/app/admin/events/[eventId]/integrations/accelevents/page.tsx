import type { Metadata } from "next";
import { IntegrationAdmin } from "../../../../../../features/integrations/integration-admin";

export const metadata: Metadata = {
  title: "Accelevents integration",
};

export default async function AcceleventsIntegrationPage({
  params,
}: Readonly<{ params: Promise<{ eventId: string }> }>) {
  const { eventId } = await params;
  return <IntegrationAdmin eventId={eventId} section="accelevents" />;
}
