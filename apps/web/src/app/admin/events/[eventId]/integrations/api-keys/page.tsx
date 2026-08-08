import type { Metadata } from "next";
import { IntegrationAdmin } from "../../../../../../features/integrations/integration-admin";

export const metadata: Metadata = {
  title: "API keys",
};

export default async function IntegrationApiKeysPage({
  params,
}: Readonly<{ params: Promise<{ eventId: string }> }>) {
  const { eventId } = await params;
  return <IntegrationAdmin eventId={eventId} section="api-keys" />;
}
