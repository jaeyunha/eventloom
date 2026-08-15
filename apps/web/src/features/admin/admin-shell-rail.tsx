import { CalendarDays, ChevronDown } from "lucide-react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DesktopNavigation } from "@/components/workspace";
import { AdminCommandPalette } from "./admin-command-palette";
import { organizationOverviewHref, workspaceNavigationItemsForGroup } from "./admin-navigation";
import { AdminNavigationIcon } from "./admin-navigation-icon";
import styles from "./admin-shell.module.css";
import { AdminShellAccount } from "./admin-shell-account";
import type { AdminShellController } from "./admin-shell-controller";

export function AdminShellRail({ controller }: Readonly<{ controller: AdminShellController }>) {
  const {
    availableOrganizationIds,
    commandOpen,
    commandPages,
    currentEvent,
    currentEventName,
    currentOrganizationId,
    eventContext,
    eventWorkspaceDestinations,
    navigationGroups,
    pathname,
    selectOrganization,
    setCommandOpen,
    signOut,
  } = controller;

  return (
    <div className={styles.rail}>
      <div className={styles.railHeader}>
        <Link
          aria-label="Eventloom organizer overview"
          className={styles.brand}
          href={
            currentOrganizationId === null
              ? "/admin"
              : organizationOverviewHref(currentOrganizationId)
          }
        >
          <span className={styles.brandMark} aria-hidden="true">
            EL
          </span>
          <span className={styles.brandCopy}>
            <strong>Eventloom</strong>
            <small>Organizer workspace</small>
          </span>
        </Link>
        <AdminCommandPalette
          currentEventId={currentEvent?.id ?? null}
          onOpenChange={setCommandOpen}
          open={commandOpen}
          organizationId={currentOrganizationId}
          pages={commandPages}
          triggerClassName={styles.commandButton}
        />
      </div>

      <div className={styles.railBody}>
        {eventContext !== null && currentEventName !== null ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={`Switch workspace. Current event: ${currentEventName}`}
                className={styles.eventContext}
                type="button"
              >
                <span className={styles.eventContextIcon} aria-hidden="true">
                  <CalendarDays />
                </span>
                <span className={styles.eventContextCopy}>
                  <span>Event workspace</span>
                  <strong>{currentEventName}</strong>
                </span>
                <ChevronDown className={styles.eventContextChevron} aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className={styles.eventWorkspaceMenu} sideOffset={6}>
              <DropdownMenuLabel className={styles.eventWorkspaceMenuLabel}>
                Organization workspace
              </DropdownMenuLabel>
              <DropdownMenuGroup>
                {eventWorkspaceDestinations.map((item) => (
                  <DropdownMenuItem
                    asChild
                    className={styles.eventWorkspaceMenuItem}
                    key={item.href}
                  >
                    <Link href={item.href}>
                      <AdminNavigationIcon name={item.icon} />
                      <span>{item.label}</span>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        <div className={styles.navigationGroups}>
          {navigationGroups.map((group) => (
            <div className={styles.navigationGroup} key={group.label}>
              <p className={styles.navigationLabel}>{group.label}</p>
              <DesktopNavigation
                ariaLabel={`${group.label} organizer navigation`}
                items={workspaceNavigationItemsForGroup(group, pathname)}
              />
            </div>
          ))}
        </div>
      </div>

      <AdminShellAccount
        availableOrganizationIds={availableOrganizationIds}
        currentOrganizationId={currentOrganizationId}
        eventScoped={eventContext !== null}
        onSelectOrganization={selectOrganization}
        onSignOut={signOut}
      />
    </div>
  );
}
