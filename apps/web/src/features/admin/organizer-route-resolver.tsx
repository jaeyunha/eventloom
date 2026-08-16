"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useOrganizerOrganizationId } from "./admin-shell";
import {
  organizerRouteResolverHref,
  type OrganizerRouteResolverDestination,
} from "./organizer-route-resolver-model";

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
