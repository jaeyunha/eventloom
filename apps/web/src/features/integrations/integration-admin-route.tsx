"use client";

import { usePathname } from "next/navigation";
import { IntegrationAdmin } from "./integration-admin";
import { integrationSectionFromPathname } from "./integration-admin-route-model";

interface IntegrationAdminRouteProps {
  readonly eventId: string;
  readonly organizationId: string;
}

export function IntegrationAdminRoute({ eventId, organizationId }: IntegrationAdminRouteProps) {
  const section = integrationSectionFromPathname(usePathname());
  return <IntegrationAdmin organizationId={organizationId} eventId={eventId} section={section} />;
}
