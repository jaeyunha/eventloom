import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { AdminCommandPage } from "./admin-command-palette-model";
import {
  eventWorkspaceDestinationsFor,
  type OrganizerEventContext,
  type OrganizerNavigationGroup,
  type OrganizerWorkspaceDestination,
  organizationOverviewHref,
  organizerNavigationGroupsFor,
} from "./admin-navigation";
import {
  isPublicMemberSetupPath,
  ORGANIZER_ORGANIZATION_STORAGE_KEY,
  organizationIdForNavigation,
  organizationIdFromPathname,
  qualifiedEventContext,
} from "./admin-shell-access";
import { adminCommandPages, currentOrganizerPageLabel } from "./admin-shell-command";
import { type EventWorkspaceResolution, useOrganizerEvent } from "./admin-shell-event-controller";
import { useOrganizerSession } from "./admin-shell-session";
import type { OrganizerEventRouteIdentity } from "./organizer-event-route";

export interface AdminShellController {
  readonly authentication: "checking" | "authenticated" | "denied";
  readonly availableOrganizationIds: readonly string[];
  readonly commandOpen: boolean;
  readonly commandPages: readonly AdminCommandPage[];
  readonly currentEvent: OrganizerEventRouteIdentity | null;
  readonly currentEventName: string | null;
  readonly currentEventResolution: EventWorkspaceResolution | null;
  readonly currentOrganizationId: string | null;
  readonly currentPageLabel: string;
  readonly eventContext: OrganizerEventContext | null;
  readonly eventWorkspaceDestinations: readonly OrganizerWorkspaceDestination[];
  readonly navigationGroups: readonly OrganizerNavigationGroup[];
  readonly pathname: string;
  readonly publicMemberSetup: boolean;
  readonly setCommandOpen: (open: boolean) => void;
  readonly selectOrganization: (organizationId: string) => void;
  readonly signOut: () => Promise<void>;
}

export function useAdminShellController(): AdminShellController {
  const pathname = usePathname();
  const publicMemberSetup = isPublicMemberSetupPath(pathname);
  const eventContext = qualifiedEventContext(pathname);
  const requiredOrganizationId = organizationIdFromPathname(pathname);
  const session = useOrganizerSession(publicMemberSetup, requiredOrganizationId);
  const currentOrganizationId = organizationIdForNavigation(
    eventContext,
    requiredOrganizationId,
    session.authenticatedOrganizationId,
  );
  const event = useOrganizerEvent(pathname, eventContext);
  const navigationGroups = organizerNavigationGroupsFor(eventContext, currentOrganizationId);
  const eventWorkspaceDestinations = eventWorkspaceDestinationsFor(eventContext);
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    function handleKeyboard(keyboardEvent: KeyboardEvent): void {
      if (
        (keyboardEvent.metaKey || keyboardEvent.ctrlKey) &&
        keyboardEvent.key.toLowerCase() === "k"
      ) {
        keyboardEvent.preventDefault();
        setCommandOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, []);

  function selectOrganization(organizationId: string): void {
    if (!session.availableOrganizationIds.includes(organizationId)) return;
    window.localStorage.setItem(ORGANIZER_ORGANIZATION_STORAGE_KEY, organizationId);
    session.setAuthenticatedOrganizationId(organizationId);
    if (requiredOrganizationId !== null) {
      window.location.assign(organizationOverviewHref(organizationId));
    }
  }

  async function signOut(): Promise<void> {
    await fetch("/api/auth/sign-out", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: "{}",
    }).catch(() => undefined);
    window.location.assign("/");
  }

  return {
    authentication: session.authentication,
    availableOrganizationIds: session.availableOrganizationIds,
    commandOpen,
    commandPages: adminCommandPages(pathname, eventWorkspaceDestinations, navigationGroups),
    currentEvent: event.currentEvent,
    currentEventName: event.currentEventName,
    currentEventResolution: event.currentEventResolution,
    currentOrganizationId,
    currentPageLabel: currentOrganizerPageLabel(pathname, navigationGroups, eventContext !== null),
    eventContext,
    eventWorkspaceDestinations,
    navigationGroups,
    pathname,
    publicMemberSetup,
    setCommandOpen,
    selectOrganization,
    signOut,
  };
}
