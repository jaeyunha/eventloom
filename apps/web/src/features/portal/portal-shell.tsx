"use client";

import {
  BookOpen,
  CalendarCheck2,
  FileText,
  FolderOpen,
  House,
  ListChecks,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui";
import {
  DesktopNavigation,
  MobileBottomNavigation,
  WorkspaceContextBar,
  type WorkspaceNavigationItem,
  WorkspaceShell,
} from "@/components/workspace";
import {
  createParticipantNavigation,
  type ParticipantNavigationId,
} from "./participant-navigation";
import { portalContextLabel } from "./portal-provider-model";
import { usePortal } from "./portal-provider";
import styles from "./portal-shell.module.css";
import { portalContentMode, portalRouteAuthorized, signOutAndRedirect } from "./portal-shell-model";

const navigationIcons = {
  "my-events": House,
  submissions: FileText,
  tasks: ListChecks,
  profile: UserRound,
  sessions: CalendarCheck2,
  files: FolderOpen,
  "event-guide": BookOpen,
} satisfies Record<ParticipantNavigationId, typeof House>;

function navigationItems(
  items: ReturnType<typeof createParticipantNavigation>["all"],
): WorkspaceNavigationItem[] {
  return items.map((item) => ({
    href: item.href,
    label: item.desktopLabel,
    icon: navigationIcons[item.id],
    current: item.active,
  }));
}

function AccountMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label="Account menu" size="sm" variant="ghost">
          Account
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href="/work">All work</Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void signOutAndRedirect()}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PortalFrame({ children }: Readonly<{ children: ReactNode }>) {
  const {
    authorizedParticipantIds,
    can,
    context,
    contexts,
    error,
    eventQuery,
    loading,
    selectedParticipantId,
    switchContext,
    switchParticipant,
    view,
  } = usePortal();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const workspace = searchParams.get("workspace");
  const participantId =
    selectedParticipantId ?? context?.primaryParticipantId ?? context?.participantIds[0] ?? "";
  const navigation = context
    ? createParticipantNavigation({
        eventId: context.eventId,
        participantId,
        capabilities: context.capabilities,
        submissions: view?.submissions ?? [],
        pathname: `${pathname}${searchParams.size > 0 ? `?${searchParams.toString()}` : ""}`,
        eventQuery,
      })
    : null;
  const primaryItems = navigationItems(navigation?.primary ?? []);
  const secondaryItems = navigationItems(navigation?.secondary ?? []);
  const displayName =
    view?.profiles.find((profile) => profile.participantId === participantId)?.displayName ??
    "Participant";
  const routeAuthorized = portalRouteAuthorized({
    pathname,
    workspace,
    submissionCount: context?.submissionIds.length ?? 0,
    can,
  });
  const contentMode = portalContentMode({
    loading,
    error,
    hasView: view !== null,
    routeAuthorized,
  });

  const desktopRail = context ? (
    <div className={styles.rail}>
      <Link className={styles.brand} href={`/portal${eventQuery}`}>
        <span className={styles.brandMark} aria-hidden="true">
          EL
        </span>
        <span className={styles.brandCopy}>
          <strong>Eventloom</strong>
          <small>Participant workspace</small>
        </span>
      </Link>
      <div className={styles.navGroups} data-scroll-region="sidebar-navigation">
        <div>
          <p className={styles.navLabel}>Workspace</p>
          <DesktopNavigation
            ariaLabel="Participant workspace"
            items={primaryItems}
            variant="embedded"
          />
        </div>
        {secondaryItems.length === 0 ? null : (
          <div>
            <p className={styles.navLabel}>Accepted sessions</p>
            <DesktopNavigation
              ariaLabel="Accepted session tools"
              items={secondaryItems}
              variant="embedded"
            />
          </div>
        )}
      </div>
      <div className={styles.account}>
        <span className={styles.accountName}>{displayName}</span>
        <div className={styles.accountLinks}>
          <Link href="/work">All work</Link>
          <button type="button" onClick={() => void signOutAndRedirect()}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  ) : undefined;

  const contextBar = (
    <WorkspaceContextBar
      event={context ? portalContextLabel(context) : "Participant workspace"}
      metadata={
        loading ? <span className={styles.contextStatus}>Updating context…</span> : undefined
      }
      actions={
        <>
          {contexts.length === 0 ? null : (
            <label>
              <span className="sr-only">Event context</span>
              <select
                aria-label="Event context"
                className={styles.contextSelect}
                disabled={loading}
                value={context?.id ?? ""}
                onChange={(event) => void switchContext(event.currentTarget.value)}
              >
                {contexts.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {portalContextLabel(candidate)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {authorizedParticipantIds.length > 1 ? (
            <label>
              <span className="sr-only">Participant identity</span>
              <select
                aria-label="Participant identity"
                className={styles.contextSelect}
                disabled={loading}
                value={selectedParticipantId ?? ""}
                onChange={(event) => switchParticipant(event.currentTarget.value)}
              >
                {authorizedParticipantIds.map((id) => (
                  <option key={id} value={id}>
                    {view?.profiles.find((profile) => profile.participantId === id)?.displayName ??
                      id}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <AccountMenu />
        </>
      }
    />
  );

  return (
    <WorkspaceShell
      className={styles.portalShell}
      contentBodyClassName={styles.workspaceContent ?? ""}
      contextBar={contextBar}
      data-role-workspace="participant"
      data-role-workspace-shell="true"
      navigation={desktopRail}
      mobileNavigation={
        navigation ? (
          <MobileBottomNavigation
            ariaLabel="Participant mobile navigation"
            items={primaryItems}
            moreItems={secondaryItems}
            sheetDescription="Accepted-session destinations available for this event."
          />
        ) : undefined
      }
    >
      {contentMode === "children" ? (
        children
      ) : (
        <section role="alert">
          <h1>This workspace is not available</h1>
          <p>Your account does not have access to this workspace for the selected event.</p>
          <Link href={`/portal/submissions${eventQuery}`}>View your submissions</Link>
        </section>
      )}
    </WorkspaceShell>
  );
}
