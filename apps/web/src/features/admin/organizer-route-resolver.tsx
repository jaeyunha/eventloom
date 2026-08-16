"use client";

import { RedirectType, redirect } from "next/navigation";
import { useOrganizerOrganizationId } from "./admin-shell";
import {
  type OrganizerRouteResolverDestination,
  organizerRouteResolverHref,
} from "./organizer-route-resolver-model";

export function OrganizerRouteResolver({
  createEvent = false,
  destination,
}: Readonly<{
  readonly createEvent?: boolean;
  readonly destination: OrganizerRouteResolverDestination;
}>) {
  const organizationId = useOrganizerOrganizationId();

  if (organizationId !== null) {
    redirect(
      organizerRouteResolverHref(organizationId, destination, createEvent),
      RedirectType.replace,
    );
  }

  return (
    <p role="status" aria-live="polite">
      Opening your organization workspace…
    </p>
  );
}
