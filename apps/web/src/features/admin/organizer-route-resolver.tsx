"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  organizationEventsHref,
  organizationOverviewHref,
  useOrganizerOrganizationId,
} from "./admin-shell";

export type OrganizerRouteResolverDestination = "events" | "overview";

export function organizerRouteResolverHref(
  organizationId: string,
  destination: OrganizerRouteResolverDestination,
  createEvent = false,
): string {
  const href =
    destination === "events"
      ? organizationEventsHref(organizationId)
      : organizationOverviewHref(organizationId);
  return destination === "events" && createEvent ? `${href}?create=1` : href;
}

export function OrganizerRouteResolver({
  createEvent = false,
  destination,
}: Readonly<{
  readonly createEvent?: boolean;
  readonly destination: OrganizerRouteResolverDestination;
}>) {
  const organizationId = useOrganizerOrganizationId();
  const router = useRouter();

  useEffect(() => {
    if (organizationId === null) return;
    router.replace(organizerRouteResolverHref(organizationId, destination, createEvent));
  }, [createEvent, destination, organizationId, router]);

  return (
    <p role="status" aria-live="polite">
      Opening your organization workspace…
    </p>
  );
}
