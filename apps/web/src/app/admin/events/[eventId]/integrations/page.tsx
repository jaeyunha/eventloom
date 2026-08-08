import type { Metadata } from "next";
import { IntegrationAdmin } from "../../../../../features/integrations/integration-admin";

export const metadata: Metadata = {
  title: "Integrations",
};

export default async function IntegrationsPage({
  params,
}: Readonly<{ params: Promise<{ eventId: string }> }>) {
  const { eventId } = await params;
  return <IntegrationAdmin eventId={eventId} section="overview" />;
}
