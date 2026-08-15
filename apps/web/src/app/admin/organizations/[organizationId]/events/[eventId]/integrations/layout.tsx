import type { ReactNode } from "react";
import { IntegrationAdminRoute } from "@/features/integrations/integration-admin-route";

interface IntegrationsLayoutProps {
  readonly children: ReactNode;
  readonly params: Promise<{ organizationId: string; eventId: string }>;
}

export default async function IntegrationsLayout({ children, params }: IntegrationsLayoutProps) {
  const { organizationId, eventId } = await params;
  return (
    <>
      <IntegrationAdminRoute organizationId={organizationId} eventId={eventId} />
      {children}
    </>
  );
}
