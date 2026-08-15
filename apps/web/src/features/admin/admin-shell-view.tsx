import { LayoutDashboard } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/product-shell/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  MobileBottomNavigation,
  WorkspaceContextBar,
  WorkspaceShell,
} from "@/components/workspace";
import { workspaceNavigationItems } from "./admin-navigation";
import styles from "./admin-shell.module.css";
import { OrganizerOrganizationProvider } from "./admin-shell-context";
import type { AdminShellController } from "./admin-shell-controller";
import { AdminShellRail } from "./admin-shell-rail";
import { OrganizerEventWorkspaceProvider } from "./organizer-event-workspace";

export function AdminShellView({
  children,
  controller,
}: Readonly<{ children: ReactNode; controller: AdminShellController }>) {
  const {
    authentication,
    currentEvent,
    currentEventName,
    currentEventResolution,
    currentOrganizationId,
    currentPageLabel,
    eventContext,
    navigationGroups,
    pathname,
  } = controller;
  const mobileNavigation = workspaceNavigationItems(navigationGroups, pathname);

  return (
    <WorkspaceShell
      className={styles.adminShell ?? ""}
      contextBar={
        <WorkspaceContextBar
          actions={
            <>
              <Button asChild size="sm" variant="ghost">
                <Link href="/work">
                  <LayoutDashboard data-icon="inline-start" aria-hidden="true" />
                  All work
                </Link>
              </Button>
              <ThemeToggle />
            </>
          }
          event={
            eventContext === null ? "Organizer workspace" : (currentEventName ?? "Loading event")
          }
          metadata={currentPageLabel}
          organization={currentOrganizationId ?? "Organization"}
        />
      }
      data-admin-shell="true"
      data-role-workspace="organizer"
      data-role-workspace-shell="true"
      mainClassName={styles.adminMain ?? ""}
      mainId="admin-content"
      mobileNavigation={
        <MobileBottomNavigation
          ariaLabel="Organizer mobile navigation"
          items={mobileNavigation}
          sheetDescription="Additional organizer destinations for this workspace."
        />
      }
      navigation={<AdminShellRail controller={controller} />}
    >
      <div aria-busy={authentication === "checking" || undefined} className={styles.adminContent}>
        {authentication === "checking" ? (
          <p className="sr-only" role="status">
            Checking organizer access
          </p>
        ) : null}
        {authentication === "denied" ? (
          <section className="rounded-lg border bg-card p-6 text-card-foreground" role="alert">
            <h1 className="text-xl font-semibold">Access denied</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              An owner or administrator membership is required for this organization.
            </p>
          </section>
        ) : authentication === "authenticated" && currentOrganizationId !== null ? (
          <OrganizerOrganizationProvider organizationId={currentOrganizationId}>
            <OrganizerEventWorkspaceProvider
              event={currentEvent}
              organizationId={currentOrganizationId}
            >
              {eventContext === null || currentEvent !== null ? (
                children
              ) : (
                <p role={currentEventResolution?.status === "unavailable" ? "alert" : "status"}>
                  {currentEventResolution?.status === "unavailable"
                    ? "This event workspace could not be found."
                    : "Loading event workspace…"}
                </p>
              )}
            </OrganizerEventWorkspaceProvider>
          </OrganizerOrganizationProvider>
        ) : null}
      </div>
    </WorkspaceShell>
  );
}
