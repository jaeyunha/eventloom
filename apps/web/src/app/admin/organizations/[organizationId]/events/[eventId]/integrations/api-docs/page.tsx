import type { Metadata } from "next";
import { IntegrationAdmin } from "@/features/integrations/integration-admin";

export const metadata: Metadata = {
  title: "API documentation",
  description: "Build tenant-scoped integrations with Open Sessionboard.",
};

interface IntegrationApiDocsPageProps {
  readonly params: Promise<{ organizationId: string; eventId: string }>;
}

export default async function IntegrationApiDocsPage({ params }: IntegrationApiDocsPageProps) {
  const { organizationId, eventId } = await params;
  return <IntegrationAdmin organizationId={organizationId} eventId={eventId} section="api-docs" />;
}
