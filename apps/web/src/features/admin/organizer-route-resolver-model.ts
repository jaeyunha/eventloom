import { organizationEventsHref, organizationOverviewHref } from "./admin-navigation";

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
