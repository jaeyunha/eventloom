"use client";

import { usePathname } from "next/navigation";
import { IntegrationAdmin, type SupportedIntegrationSection } from "./integration-admin";

interface IntegrationAdminRouteProps {
  readonly eventId: string;
  readonly organizationId: string;
}

export function integrationSectionFromPathname(pathname: string): SupportedIntegrationSection {
  const segment = pathname.split("/").filter(Boolean).at(-1);
  switch (segment) {
    case "api-keys":
      return "api-keys";
    case "webhooks":
      return "webhooks";
    case "delivery":
      return "delivery";
    default:
      return "overview";
  }
}

export function IntegrationAdminRoute({ eventId, organizationId }: IntegrationAdminRouteProps) {
  const section = integrationSectionFromPathname(usePathname());
  return <IntegrationAdmin organizationId={organizationId} eventId={eventId} section={section} />;
}
