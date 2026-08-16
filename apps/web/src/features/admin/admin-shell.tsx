"use client";

import type { ReactNode } from "react";
import { shouldRenderAdminShell } from "./admin-shell-auth";
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
  if (!shouldRenderAdminShell(controller.authentication, false)) {
    return <span aria-hidden="true" data-admin-route-state={controller.authentication} hidden />;
  }
  return <AdminShellView controller={controller}>{children}</AdminShellView>;
}
