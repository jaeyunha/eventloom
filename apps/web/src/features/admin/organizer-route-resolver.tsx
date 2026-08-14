"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  organizationEventsHref,
  organizationOverviewHref,
  useOrganizerOrganizationId,
} from "./admin-shell";

export type OrganizerRouteResolverDestination = "events" | "overview";

export function organizerRouteResolverHref(
  organizationId: string,
  destination: OrganizerRouteResolverDestination,
): string {
  return destination === "events"
    ? organizationEventsHref(organizationId)
    : organizationOverviewHref(organizationId);
}

export function OrganizerRouteResolver({
  destination,
}: Readonly<{ destination: OrganizerRouteResolverDestination }>) {
  const organizationId = useOrganizerOrganizationId();
  const router = useRouter();

  useEffect(() => {
    if (organizationId === null) return;
    router.replace(organizerRouteResolverHref(organizationId, destination));
  }, [destination, organizationId, router]);

  return (
    <p role="status" aria-live="polite">
      Opening your organization workspace…
    </p>
  );
}
