"use client";

import type { ReactNode } from "react";
import { useAdminShellController } from "./admin-shell-controller";
import { AdminShellView } from "./admin-shell-view";

export {
  eventNavigationFor,
  eventWorkspaceDestinationsFor,
  type OrganizerNavigationGroup,
  type OrganizerNavigationItem,
  organizationEventsHref,
  organizationNavigationFor,
  organizationOverviewHref,
  organizerNavigationGroupsFor,
} from "./admin-navigation";
export {
  isPublicMemberSetupPath,
  organizerOrganizationIdFromSession,
  organizerOrganizationIdsFromSession,
  qualifiedEventContext,
  sessionHasOrganizerMembership,
} from "./admin-shell-access";
export { useOrganizerOrganizationId } from "./admin-shell-context";
export {
  eventWorkspaceFromCollectionResponse,
  eventWorkspaceNameFromResponse,
  fetchOrganizerEventName,
  fetchOrganizerEventWorkspace,
} from "./admin-shell-event";

export function AdminShell({ children }: Readonly<{ children: ReactNode }>) {
  const controller = useAdminShellController();
  if (controller.publicMemberSetup) return <>{children}</>;
  return <AdminShellView controller={controller}>{children}</AdminShellView>;
}
