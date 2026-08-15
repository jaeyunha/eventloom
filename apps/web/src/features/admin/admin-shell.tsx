"use client";

import { CalendarDays, ChevronDown, LayoutDashboard, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type CSSProperties,
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { ThemeToggle } from "@/components/product-shell/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  LEGACY_ORGANIZER_ORGANIZATION_STORAGE_KEY,
  ORGANIZER_ORGANIZATION_STORAGE_KEY,
} from "@/lib/organizer-workspace-preference";
import { sessionHasAuthenticatedUser } from "../auth/session";
import { AdminCommandPalette } from "./admin-command-palette";
import type { AdminCommandPage } from "./admin-command-palette-model";
import { AdminNavigationIcon } from "./admin-navigation-icon";
import styles from "./admin-shell.module.css";
import {
  canonicalOrganizerEventPath,
  type OrganizerEventRouteIdentity,
  parseOrganizerEventCollection,
  resolveOrganizerEventReference,
} from "./organizer-event-route";
import { OrganizerEventWorkspaceProvider } from "./organizer-event-workspace";

export interface OrganizerNavigationItem {
  href: string;
  label: string;
  icon: string;
  match(pathname: string): boolean;
}

export interface OrganizerNavigationGroup {
  label: string;
  items: readonly OrganizerNavigationItem[];
}
const OrganizerOrganizationContext = createContext<string | null>(null);

export function useOrganizerOrganizationId(): string | null {
  return useContext(OrganizerOrganizationContext);
}

export function qualifiedEventContext(
  pathname: string,
): { organizationId: string; eventId: string } | null {
  const match = /^\/admin\/organizations\/([^/]+)\/events\/([^/]+)(?:\/|$)/.exec(pathname);
  if (!match?.[1] || !match[2]) {
    return null;
  }
  try {
    const organizationId = decodeURIComponent(match[1]).trim();
    const eventId = decodeURIComponent(match[2]).trim();
    return organizationId && eventId ? { organizationId, eventId } : null;
  } catch {
    return null;
  }
}
export function organizationOverviewHref(organizationId: string): string {
  return `/admin/organizations/${encodeURIComponent(organizationId)}`;
}

export function organizationEventsHref(organizationId: string): string {
  return `${organizationOverviewHref(organizationId)}/events`;
}

function navigationItem(
  href: string,
  label: string,
  icon: string,
  matchesChildren = false,
): OrganizerNavigationItem {
  return {
    href,
    label,
    icon,
    match: (pathname: string) =>
      pathname === href || (matchesChildren && pathname.startsWith(`${href}/`)),
  };
}

function organizationIdFromPathname(pathname: string): string | null {
  const match = /^\/admin\/organizations\/([^/]+)(?:\/|$)/.exec(pathname);
  if (!match?.[1]) return null;
  try {
    const organizationId = decodeURIComponent(match[1]).trim();
    return organizationId.length > 0 ? organizationId : null;
  } catch {
    return null;
  }
}

export function isPublicMemberSetupPath(pathname: string): boolean {
  return /^\/admin\/organizations\/[^/]+\/members\/setup\/?$/u.test(pathname);
}

function organizationIdForNavigation(
  eventContext: { organizationId: string; eventId: string } | null,
  requiredOrganizationId: string | null,
  authenticatedOrganizationId: string | null,
): string | null {
  if (eventContext !== null) {
    const contextualOrganizationId = eventContext.organizationId.trim();
    return contextualOrganizationId.length > 0 ? contextualOrganizationId : null;
  }
  const required = requiredOrganizationId?.trim() ?? "";
  if (required.length > 0) return required;
  const normalizedOrganizationId = authenticatedOrganizationId?.trim() ?? "";
  return normalizedOrganizationId.length > 0 ? normalizedOrganizationId : null;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sessionMemberships(value: unknown): readonly unknown[] {
  if (!isRecord(value)) return [];
  if (Array.isArray(value.memberships)) return value.memberships;
  return isRecord(value.data) && Array.isArray(value.data.memberships)
    ? value.data.memberships
    : [];
}

export function sessionHasOrganizerMembership(
  value: unknown,
  organizationId: string | null,
): boolean {
  return organizerOrganizationIdFromSession(value, organizationId) !== null;
}

export function organizerOrganizationIdsFromSession(value: unknown): readonly string[] {
  const organizationIds = new Set<string>();
  for (const membership of sessionMemberships(value)) {
    if (!isRecord(membership)) continue;
    const organizationId =
      typeof membership.organizationId === "string"
        ? membership.organizationId.trim()
        : typeof membership.organization_id === "string"
          ? membership.organization_id.trim()
          : "";
    const role = typeof membership.role === "string" ? membership.role.trim().toLowerCase() : "";
    if ((role === "owner" || role === "admin") && organizationId.length > 0) {
      organizationIds.add(organizationId);
    }
  }
  return [...organizationIds].sort((left, right) => left.localeCompare(right));
}

export function organizerOrganizationIdFromSession(
  value: unknown,
  requiredOrganizationId: string | null,
  preferredOrganizationId: string | null = null,
): string | null {
  const selectedOrganizationId = requiredOrganizationId?.trim() ?? "";
  const organizationIds = organizerOrganizationIdsFromSession(value);
  if (selectedOrganizationId.length > 0) {
    return organizationIds.includes(selectedOrganizationId) ? selectedOrganizationId : null;
  }
  const preferred = preferredOrganizationId?.trim() ?? "";
  if (preferred.length > 0 && organizationIds.includes(preferred)) return preferred;
  return organizationIds[0] ?? null;
}

export function organizationNavigationFor(
  organizationId: string | null,
): readonly OrganizerNavigationItem[] {
  const normalizedOrganizationId = organizationId?.trim() ?? "";
  if (normalizedOrganizationId.length === 0) return [];
  const base = organizationOverviewHref(normalizedOrganizationId);
  return [
    navigationItem(base, "Overview", "overview"),
    navigationItem(`${base}/crm`, "CRM", "crm", true),
    navigationItem(`${base}/integrations`, "Integrations", "integrations", true),
    navigationItem(`${base}/members`, "Members", "members", true),
    navigationItem(`${base}/settings`, "Settings", "settings", true),
  ];
}

export function eventNavigationFor(
  eventContext: { organizationId: string; eventId: string } | null,
): readonly OrganizerNavigationItem[] {
  const scopedEventContext =
    eventContext !== null &&
    eventContext.organizationId.trim().length > 0 &&
    eventContext.eventId.trim().length > 0
      ? {
          organizationId: eventContext.organizationId.trim(),
          eventId: eventContext.eventId.trim(),
        }
      : null;
  if (scopedEventContext === null) return [];

  const eventBasePath = `${organizationEventsHref(scopedEventContext.organizationId)}/${encodeURIComponent(scopedEventContext.eventId)}`;
  return [
    navigationItem(eventBasePath, "Program overview", "overview"),
    navigationItem(`${eventBasePath}/cfp`, "CFP Form", "form", true),
    navigationItem(`${eventBasePath}/submissions`, "Submissions", "submissions", true),
    navigationItem(`${eventBasePath}/sessions`, "Sessions", "agenda", true),
    navigationItem(`${eventBasePath}/reviews`, "Reviews", "reviews", true),
    navigationItem(`${eventBasePath}/agenda`, "Agenda", "agenda", true),
    navigationItem(`${eventBasePath}/settings`, "Program settings", "settings", true),
    navigationItem(`${eventBasePath}/speakers`, "Speakers", "speakers", true),
    navigationItem(`${eventBasePath}/deliverables`, "Content requests", "deliverables", true),
    navigationItem(`${eventBasePath}/files`, "Files", "files", true),
    navigationItem(`${eventBasePath}/communications`, "Communications", "communications", true),
    navigationItem(`${eventBasePath}/remix`, "Content remix", "remix", true),
    navigationItem(`${eventBasePath}/embeds`, "Embeds", "embeds", true),
    navigationItem(`${eventBasePath}/reports`, "Reports", "reports", true),
    navigationItem(`${eventBasePath}/integrations`, "Integrations", "integrations", true),
  ];
}

export function organizerNavigationGroupsFor(
  eventContext: { organizationId: string; eventId: string } | null,
  organizationId: string | null,
): readonly OrganizerNavigationGroup[] {
  if (eventContext === null) {
    const organizationItems = organizationNavigationFor(organizationId);
    return organizationItems.length === 0
      ? []
      : [{ label: "Organization", items: organizationItems }];
  }
  const eventItems = eventNavigationFor(eventContext);
  if (eventItems.length === 0) return [];
  return [
    { label: "Program", items: eventItems.slice(0, 6) },
    { label: "People", items: eventItems.slice(6, 9) },
    { label: "Content operations", items: eventItems.slice(9, 11) },
    { label: "Publish", items: eventItems.slice(11) },
  ];
}

export function eventWorkspaceDestinationsFor(
  eventContext: { organizationId: string; eventId: string } | null,
): readonly { href: string; icon: string; label: string }[] {
  if (eventContext === null) return [];
  const organizationBase = organizationOverviewHref(eventContext.organizationId);
  return [
    { href: organizationBase, icon: "overview", label: "Organization overview" },
    { href: `${organizationBase}/events`, icon: "events", label: "All events" },
    { href: `${organizationBase}/crm`, icon: "crm", label: "CRM" },
    { href: `${organizationBase}/integrations`, icon: "integrations", label: "Integrations" },
    { href: `${organizationBase}/members`, icon: "members", label: "Members" },
    { href: `${organizationBase}/settings`, icon: "settings", label: "Settings" },
  ];
}

export function eventWorkspaceNameFromResponse(payload: unknown, eventId: string): string | null {
  if (!isRecord(payload) || !isRecord(payload.data)) return null;
  const event = payload.data;
  if (event.id !== eventId || typeof event.name !== "string") return null;
  const name = event.name.trim();
  return name.length > 0 ? name : null;
}

export async function fetchOrganizerEventName(
  apiBaseUrl: string,
  organizationId: string,
  eventId: string,
  fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> = fetch,
): Promise<string | null> {
  const response = await fetcher(
    `${apiBaseUrl}/api/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventId)}`,
    {
      credentials: "include",
      headers: { Accept: "application/json" },
      cache: "no-store",
    },
  );
  if (!response.ok) return null;
  return eventWorkspaceNameFromResponse(await response.json().catch(() => null), eventId);
}

export function eventWorkspaceFromCollectionResponse(
  payload: unknown,
  eventReference: string,
): OrganizerEventRouteIdentity | null {
  try {
    return (
      resolveOrganizerEventReference(parseOrganizerEventCollection(payload), eventReference) ?? null
    );
  } catch {
    return null;
  }
}

export async function fetchOrganizerEventWorkspace(
  apiBaseUrl: string,
  organizationId: string,
  eventReference: string,
  fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> = fetch,
): Promise<OrganizerEventRouteIdentity | null> {
  const response = await fetcher(
    `${apiBaseUrl}/api/admin/organizations/${encodeURIComponent(organizationId)}/events`,
    {
      credentials: "include",
      headers: { Accept: "application/json" },
      cache: "no-store",
    },
  );
  if (!response.ok) return null;
  return eventWorkspaceFromCollectionResponse(
    await response.json().catch(() => null),
    eventReference,
  );
}

type EventWorkspaceResolution =
  | { readonly eventReference: string; readonly status: "loading" }
  | {
      readonly event: OrganizerEventRouteIdentity;
      readonly eventReference: string;
      readonly status: "resolved";
    }
  | { readonly eventReference: string; readonly status: "unavailable" };

export function AdminShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const publicMemberSetup = isPublicMemberSetupPath(pathname);
  const eventContext = qualifiedEventContext(pathname);
  const requiredOrganizationId = organizationIdFromPathname(pathname);
  const [authenticatedOrganizationId, setAuthenticatedOrganizationId] = useState<string | null>(
    null,
  );
  const [availableOrganizationIds, setAvailableOrganizationIds] = useState<readonly string[]>([]);
  const currentOrganizationId = organizationIdForNavigation(
    eventContext,
    requiredOrganizationId,
    authenticatedOrganizationId,
  );
  const navigationGroups = organizerNavigationGroupsFor(eventContext, currentOrganizationId);
  const eventWorkspaceDestinations = eventWorkspaceDestinationsFor(eventContext);
  const eventOrganizationId = eventContext?.organizationId ?? null;
  const eventReference = eventContext?.eventId ?? null;
  const [eventWorkspaceResolution, setEventWorkspaceResolution] =
    useState<EventWorkspaceResolution | null>(null);
  const currentEventResolution =
    eventWorkspaceResolution?.eventReference === eventReference ? eventWorkspaceResolution : null;
  const currentEvent =
    currentEventResolution?.status === "resolved" ? currentEventResolution.event : null;
  const currentEventName = currentEvent?.name ?? null;
  const [authentication, setAuthentication] = useState<"checking" | "authenticated" | "denied">(
    "checking",
  );
  const accessScopeKey = requiredOrganizationId ?? "__organizer-workspace__";
  const [verifiedAccessScopeKey, setVerifiedAccessScopeKey] = useState<string | null>(null);
  const effectiveAuthentication =
    authentication === "authenticated" && verifiedAccessScopeKey !== accessScopeKey
      ? "checking"
      : authentication;
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    if (eventOrganizationId === null || eventReference === null) {
      setEventWorkspaceResolution(null);
      return;
    }
    const controller = new AbortController();
    setEventWorkspaceResolution({ eventReference, status: "loading" });
    void fetchOrganizerEventWorkspace("", eventOrganizationId, eventReference, (input, init) =>
      fetch(input, { ...init, signal: controller.signal }),
    )
      .then((event) => {
        if (controller.signal.aborted) return;
        setEventWorkspaceResolution(
          event === null
            ? { eventReference, status: "unavailable" }
            : { event, eventReference, status: "resolved" },
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!controller.signal.aborted) {
          setEventWorkspaceResolution({ eventReference, status: "unavailable" });
        }
      });
    return () => controller.abort();
  }, [eventOrganizationId, eventReference]);

  useEffect(() => {
    if (eventContext === null || currentEvent === null) return;
    const canonicalPath = canonicalOrganizerEventPath(
      pathname,
      eventContext.organizationId,
      eventContext.eventId,
      currentEvent,
    );
    if (!canonicalPath) return;
    const query = searchParams.toString();
    router.replace(query ? `${canonicalPath}?${query}` : canonicalPath, { scroll: false });
  }, [currentEvent, eventContext, pathname, router, searchParams]);

  useEffect(() => {
    if (publicMemberSetup) {
      setVerifiedAccessScopeKey(accessScopeKey);
      setAuthentication("authenticated");
      return;
    }
    const controller = new AbortController();
    setAuthentication("checking");
    void fetch("/api/auth/get-session", {
      credentials: "include",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        const session = await response.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (!response.ok || !sessionHasAuthenticatedUser(session)) {
          window.location.replace("/login");
          return;
        }
        const organizationIds = organizerOrganizationIdsFromSession(session);
        const preferredOrganizationId =
          requiredOrganizationId === null
            ? (window.localStorage.getItem(ORGANIZER_ORGANIZATION_STORAGE_KEY) ??
              window.localStorage.getItem(LEGACY_ORGANIZER_ORGANIZATION_STORAGE_KEY))
            : null;
        const organizationId = organizerOrganizationIdFromSession(
          session,
          requiredOrganizationId,
          preferredOrganizationId,
        );
        if (organizationId === null) {
          setAvailableOrganizationIds([]);
          setAuthenticatedOrganizationId(null);
          setAuthentication("denied");
          setVerifiedAccessScopeKey(null);
          return;
        }
        setAvailableOrganizationIds(organizationIds);
        setAuthenticatedOrganizationId(organizationId);
        window.localStorage.setItem(ORGANIZER_ORGANIZATION_STORAGE_KEY, organizationId);
        window.localStorage.removeItem(LEGACY_ORGANIZER_ORGANIZATION_STORAGE_KEY);
        setVerifiedAccessScopeKey(accessScopeKey);
        setAuthentication("authenticated");
      })
      .catch(() => {
        if (!controller.signal.aborted) window.location.replace("/login");
      });
    return () => controller.abort();
  }, [accessScopeKey, publicMemberSetup, requiredOrganizationId]);

  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, []);

  if (publicMemberSetup) return <>{children}</>;

  async function signOut(): Promise<void> {
    await fetch("/api/auth/sign-out", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: "{}",
    }).catch(() => undefined);
    window.location.assign("/");
  }

  const commandPages: readonly AdminCommandPage[] = [
    ...eventWorkspaceDestinations.map((item) => ({
      current: pathname === item.href,
      group: "Organization",
      href: item.href,
      icon: item.icon,
      keywords: "organization workspace navigation",
      label: item.label,
    })),
    ...navigationGroups.flatMap((group) =>
      group.items.map((item) => ({
        current: item.match(pathname),
        group: group.label,
        href: item.href,
        icon: item.icon,
        keywords: `${group.label} organizer navigation`,
        label: item.label,
      })),
    ),
  ];
  const currentPageLabel =
    navigationGroups.flatMap((group) => group.items).find((item) => item.match(pathname))?.label ??
    (eventContext === null ? "Overview" : "Program overview");

  return (
    <TooltipProvider>
      <SidebarProvider
        className={styles.adminShell}
        style={{ "--sidebar-width": "14rem" } as CSSProperties}
      >
        <a
          className="fixed left-3 top-3 z-50 -translate-y-24 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background transition-transform focus:translate-y-0"
          href="#admin-content"
        >
          Skip to organizer content
        </a>

        <Sidebar aria-label="Organizer workspace" collapsible="icon" variant="inset">
          <SidebarHeader className={styles.sidebarHeader}>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild size="lg" tooltip="Eventloom">
                  <Link
                    href={
                      currentOrganizationId === null
                        ? "/admin"
                        : organizationOverviewHref(currentOrganizationId)
                    }
                    aria-label="Eventloom organizer overview"
                  >
                    <span className={styles.brandMark}>EL</span>
                    <span className={styles.brandCopy}>
                      <strong>Eventloom</strong>
                      <span>Organizer workspace</span>
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <AdminCommandPalette
              currentEventId={currentEvent?.id ?? null}
              onOpenChange={setCommandOpen}
              open={commandOpen}
              organizationId={currentOrganizationId}
              pages={commandPages}
              triggerClassName={styles.commandButton}
            />
          </SidebarHeader>

          <nav className="flex min-h-0 flex-1 flex-col" aria-label="Organizer navigation">
            <SidebarContent className={styles.sidebarContent}>
              {eventContext !== null && currentEventName !== null ? (
                <DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger asChild>
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
                    </TooltipTrigger>
                    <TooltipContent
                      className="bg-popover text-popover-foreground [&>svg]:bg-popover [&>svg]:fill-popover"
                      side="right"
                    >
                      Current event: {currentEventName}
                    </TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent
                    align="start"
                    className={styles.eventWorkspaceMenu}
                    sideOffset={6}
                  >
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
              {navigationGroups.map((group) => (
                <SidebarGroup className={styles.sidebarGroup} key={group.label}>
                  <SidebarGroupLabel className={styles.sidebarGroupLabel}>
                    {group.label}
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {group.items.map((item) => {
                        const current = item.match(pathname);
                        return (
                          <SidebarMenuItem key={item.href}>
                            <SidebarMenuButton
                              asChild
                              className={styles.sidebarMenuButton}
                              isActive={current}
                              tooltip={item.label}
                            >
                              <Link href={item.href} aria-current={current ? "page" : undefined}>
                                <AdminNavigationIcon name={item.icon} />
                                <span>{item.label}</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              ))}
            </SidebarContent>
          </nav>

          <SidebarFooter className={styles.accountFooter}>
            <div className={styles.organizationCard}>
              <div
                className={styles.organizationIdentity}
                title={`Organization workspace: ${currentOrganizationId ?? "Not selected"}`}
              >
                <div className={styles.organizationAvatar} aria-hidden="true">
                  <span>{currentOrganizationId?.slice(0, 1).toUpperCase() ?? "O"}</span>
                </div>
                <div className={styles.organizationCopy}>
                  <label htmlFor="organizer-organization">
                    {eventContext === null ? "Current workspace" : "Organization workspace"}
                  </label>
                  {availableOrganizationIds.length > 1 && currentOrganizationId !== null ? null : (
                    <strong>{currentOrganizationId ?? "Workspace not selected"}</strong>
                  )}
                </div>
              </div>
              {availableOrganizationIds.length > 1 && currentOrganizationId !== null ? (
                <select
                  className={styles.organizationSelect}
                  id="organizer-organization"
                  value={currentOrganizationId}
                  onChange={(event) => {
                    const organizationId = event.currentTarget.value;
                    if (!availableOrganizationIds.includes(organizationId)) return;
                    window.localStorage.setItem(ORGANIZER_ORGANIZATION_STORAGE_KEY, organizationId);
                    setAuthenticatedOrganizationId(organizationId);
                    if (requiredOrganizationId !== null) {
                      window.location.assign(organizationOverviewHref(organizationId));
                    }
                  }}
                >
                  {availableOrganizationIds.map((organizationId) => (
                    <option key={organizationId} value={organizationId}>
                      {organizationId}
                    </option>
                  ))}
                </select>
              ) : null}
              {eventContext === null ? (
                <Button asChild className={styles.organizationAction} size="sm" variant="ghost">
                  <Link
                    aria-label="View all events"
                    href={
                      currentOrganizationId === null
                        ? "/admin/events"
                        : organizationEventsHref(currentOrganizationId)
                    }
                    title="View all events"
                  >
                    <CalendarDays aria-hidden="true" />
                    <span>View all events</span>
                  </Link>
                </Button>
              ) : null}
              <Button
                aria-label="Sign out"
                className={`${styles.organizationAction} ${styles.signOutAction}`}
                size="sm"
                title="Sign out"
                type="button"
                variant="ghost"
                onClick={() => void signOut()}
              >
                <LogOut aria-hidden="true" />
                <span>Sign out</span>
              </Button>
            </div>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>

        <SidebarInset className={styles.adminInset}>
          <header className={styles.workspaceHeader}>
            <SidebarTrigger />
            <div className={styles.breadcrumbs}>
              <span>{currentOrganizationId ?? "Organization"}</span>
              <span aria-hidden="true">/</span>
              {eventContext !== null ? (
                <>
                  <span>{currentEventName ?? "Loading event"}</span>
                  <span aria-hidden="true">/</span>
                </>
              ) : null}
              <strong>{currentPageLabel}</strong>
            </div>
            <div className={styles.workspaceHeaderActions}>
              <Button asChild size="sm" variant="ghost">
                <Link href="/work">
                  <LayoutDashboard data-icon="inline-start" aria-hidden="true" />
                  All work
                </Link>
              </Button>
              <ThemeToggle />
            </div>
          </header>

          <main
            id="admin-content"
            className={styles.adminMain}
            tabIndex={-1}
            aria-busy={effectiveAuthentication === "checking" ? true : undefined}
          >
            <div className={styles.adminContent}>
              {effectiveAuthentication === "checking" ? (
                <p className="sr-only" role="status">
                  Checking organizer access
                </p>
              ) : null}
              {effectiveAuthentication === "denied" ? (
                <section
                  className="rounded-lg border bg-card p-6 text-card-foreground"
                  role="alert"
                >
                  <h1 className="text-xl font-semibold">Access denied</h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    An owner or administrator membership is required for this organization.
                  </p>
                </section>
              ) : effectiveAuthentication === "authenticated" && currentOrganizationId !== null ? (
                <OrganizerOrganizationContext.Provider value={currentOrganizationId}>
                  <OrganizerEventWorkspaceProvider
                    event={currentEvent}
                    organizationId={currentOrganizationId}
                  >
                    {eventContext === null || currentEvent !== null ? (
                      children
                    ) : (
                      <p
                        role={currentEventResolution?.status === "unavailable" ? "alert" : "status"}
                      >
                        {currentEventResolution?.status === "unavailable"
                          ? "This event workspace could not be found."
                          : "Loading event workspace…"}
                      </p>
                    )}
                  </OrganizerEventWorkspaceProvider>
                </OrganizerOrganizationContext.Provider>
              ) : null}
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
