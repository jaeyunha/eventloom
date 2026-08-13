"use client";

import {
  CalendarDays,
  ChartNoAxesColumn,
  ClipboardList,
  ContactRound,
  ExternalLink,
  FileText,
  Folder,
  LayoutDashboard,
  ListChecks,
  LogOut,
  type LucideIcon,
  Mail,
  PanelsTopLeft,
  Search,
  Settings,
  Sparkles,
  Star,
  Upload,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { TooltipProvider } from "@/components/ui/tooltip";
import { sessionHasAuthenticatedUser } from "../auth/session";
import styles from "./admin-shell.module.css";

interface AdminNavigationItem {
  href: string;
  label: string;
  icon: string;
  match(pathname: string): boolean;
}

interface AdminNavigationGroup {
  label: string;
  items: readonly AdminNavigationItem[];
}

const navigationGroupOrder = [
  { label: "Workspace", itemLabels: ["Overview", "Events", "Members", "Settings"] },
  {
    label: "Program operations",
    itemLabels: ["CFP Form", "Submissions", "Reviews", "Agenda"],
  },
  {
    label: "People & content",
    itemLabels: ["Speakers", "Deliverables", "Files", "CRM"],
  },
  {
    label: "Publish & measure",
    itemLabels: ["Communications", "Reports", "Content remix", "Embeds", "Integrations"],
  },
] as const;

const navigation: readonly AdminNavigationItem[] = [
  {
    href: "/admin",
    label: "Overview",
    icon: "overview",
    match: (pathname: string) => pathname === "/admin",
  },
  {
    href: "/admin/events",
    label: "Events",
    icon: "events",
    match: (pathname: string) => pathname === "/admin/events",
  },
] as const;
const OrganizerOrganizationContext = createContext<string | null>(null);
const ORGANIZER_ORGANIZATION_STORAGE_KEY = "open-sessionboard.organizer-organization";

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
const navigationIcons: Readonly<Record<string, LucideIcon>> = {
  overview: LayoutDashboard,
  events: CalendarDays,
  members: Users,
  crm: ContactRound,
  form: FileText,
  submissions: ClipboardList,
  reviews: ListChecks,
  speakers: Star,
  deliverables: Upload,
  files: Folder,
  agenda: CalendarDays,
  settings: Settings,
  communications: Mail,
  reports: ChartNoAxesColumn,
  remix: Sparkles,
  embeds: PanelsTopLeft,
};

function NavigationIcon({ name }: Readonly<{ name: string }>) {
  const Icon = navigationIcons[name] ?? PanelsTopLeft;
  return <Icon aria-hidden="true" />;
}

function eventNavigationItem(
  basePath: string,
  path: string,
  label: string,
  icon: string,
): AdminNavigationItem {
  const href = `${basePath}/${path}`;
  return {
    href,
    label,
    icon,
    match: (pathname: string) => pathname === href || pathname.startsWith(`${href}/`),
  };
}
function membersNavigationItem(organizationId: string): AdminNavigationItem {
  const href = `/admin/organizations/${encodeURIComponent(organizationId)}/members`;
  return {
    href,
    label: "Members",
    icon: "members",
    match: (pathname: string) => pathname === href || pathname.startsWith(`${href}/`),
  };
}
function crmNavigationItem(organizationId: string): AdminNavigationItem {
  const href = `/admin/organizations/${encodeURIComponent(organizationId)}/crm`;
  return {
    href,
    label: "CRM",
    icon: "crm",
    match: (pathname: string) => pathname === href || pathname.startsWith(`${href}/`),
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

function groupedNavigation(items: readonly AdminNavigationItem[]): readonly AdminNavigationGroup[] {
  const itemsByLabel = new Map(items.map((item) => [item.label, item]));
  return navigationGroupOrder
    .map((group) => ({
      label: group.label,
      items: group.itemLabels.flatMap((label) => {
        const item = itemsByLabel.get(label);
        return item ? [item] : [];
      }),
    }))
    .filter((group) => group.items.length > 0);
}

export function isPublicMemberSetupPath(pathname: string): boolean {
  return /^\/admin\/organizations\/[^/]+\/members\/setup\/?$/u.test(pathname);
}

function organizationIdForNavigation(
  eventContext: { organizationId: string; eventId: string } | null,
  authenticatedOrganizationId: string | null,
): string | null {
  if (eventContext !== null) {
    const contextualOrganizationId = eventContext.organizationId.trim();
    return contextualOrganizationId.length > 0 ? contextualOrganizationId : null;
  }
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

export function eventNavigationFor(
  eventContext: { organizationId: string; eventId: string } | null,
  authenticatedOrganizationId: string | null = null,
): readonly AdminNavigationItem[] {
  const organizationId = organizationIdForNavigation(eventContext, authenticatedOrganizationId);
  const organizationItems = organizationId === null ? [] : [membersNavigationItem(organizationId)];
  const scopedEventContext =
    eventContext !== null &&
    eventContext.organizationId.trim().length > 0 &&
    eventContext.eventId.trim().length > 0
      ? {
          organizationId: eventContext.organizationId.trim(),
          eventId: eventContext.eventId.trim(),
        }
      : null;
  if (scopedEventContext === null) return [...navigation, ...organizationItems];

  const eventBasePath = `/admin/organizations/${encodeURIComponent(scopedEventContext.organizationId)}/events/${encodeURIComponent(scopedEventContext.eventId)}`;
  const eventItems = [
    ...organizationItems,
    eventNavigationItem(eventBasePath, "cfp", "CFP Form", "form"),
    eventNavigationItem(eventBasePath, "submissions", "Submissions", "submissions"),
    eventNavigationItem(eventBasePath, "reviews", "Reviews", "reviews"),
    eventNavigationItem(eventBasePath, "speakers", "Speakers", "speakers"),
    eventNavigationItem(eventBasePath, "deliverables", "Deliverables", "deliverables"),
    eventNavigationItem(eventBasePath, "files", "Files", "files"),
    eventNavigationItem(eventBasePath, "agenda", "Agenda", "agenda"),
    eventNavigationItem(eventBasePath, "settings", "Settings", "settings"),
    eventNavigationItem(eventBasePath, "communications", "Communications", "communications"),
    eventNavigationItem(eventBasePath, "reports", "Reports", "reports"),
    eventNavigationItem(eventBasePath, "remix", "Content remix", "remix"),
    eventNavigationItem(eventBasePath, "embeds", "Embeds", "embeds"),
    eventNavigationItem(eventBasePath, "integrations", "Integrations", "integrations"),
  ];
  const itemsByHref = new Map(navigation.map((item) => [item.href, item]));
  for (const item of eventItems) {
    if (!itemsByHref.has(item.href)) itemsByHref.set(item.href, item);
  }
  return [...itemsByHref.values()];
}
export function AdminShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const publicMemberSetup = isPublicMemberSetupPath(pathname);
  const eventContext = qualifiedEventContext(pathname);
  const requiredOrganizationId = organizationIdFromPathname(pathname);
  const [authenticatedOrganizationId, setAuthenticatedOrganizationId] = useState<string | null>(
    null,
  );
  const [availableOrganizationIds, setAvailableOrganizationIds] = useState<readonly string[]>([]);
  const currentOrganizationId = organizationIdForNavigation(
    eventContext,
    authenticatedOrganizationId,
  );
  const eventNavigation = eventNavigationFor(eventContext, authenticatedOrganizationId);
  const navigationWithCrm =
    currentOrganizationId === null
      ? eventNavigation
      : [...eventNavigation, crmNavigationItem(currentOrganizationId)];
  const navigationGroups = groupedNavigation(navigationWithCrm);
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
  const [commandQuery, setCommandQuery] = useState("");

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
            ? window.localStorage.getItem(ORGANIZER_ORGANIZATION_STORAGE_KEY)
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
        setCommandOpen(true);
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

  const commandItems = [
    {
      href: "/admin/events",
      label: "Go to events",
      keywords: "events programs calendar",
    },
    ...(eventContext
      ? [
          {
            href: `/admin/organizations/${encodeURIComponent(eventContext.organizationId)}/events/${encodeURIComponent(eventContext.eventId)}/reviews`,
            label: "Open reviews",
            keywords: "reviews submissions evaluate",
          },
          {
            href: `/admin/organizations/${encodeURIComponent(eventContext.organizationId)}/events/${encodeURIComponent(eventContext.eventId)}/agenda`,
            label: "Open agenda",
            keywords: "agenda schedule sessions",
          },
        ]
      : []),
  ];
  const normalizedCommandQuery = commandQuery.trim().toLocaleLowerCase();
  const visibleCommandItems = normalizedCommandQuery
    ? commandItems.filter((item) =>
        `${item.label} ${item.keywords}`.toLocaleLowerCase().includes(normalizedCommandQuery),
      )
    : commandItems;

  return (
    <TooltipProvider>
      <SidebarProvider className={styles.adminShell}>
        <a
          className="fixed left-3 top-3 z-50 -translate-y-24 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background transition-transform focus:translate-y-0"
          href="#admin-content"
        >
          Skip to organizer content
        </a>

        <Sidebar aria-label="Organizer workspace" collapsible="icon">
          <SidebarHeader className={styles.sidebarHeader}>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild size="lg" tooltip="Open Sessionboard">
                  <Link href="/admin" aria-label="Open Sessionboard organizer overview">
                    <span className={styles.brandMark}>OS</span>
                    <span className={styles.brandCopy}>
                      <strong>Open Sessionboard</strong>
                      <span>Organizer workspace</span>
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <Dialog
              open={commandOpen}
              onOpenChange={(open) => {
                setCommandOpen(open);
                if (open) setCommandQuery("");
              }}
            >
              <DialogTrigger asChild>
                <button
                  aria-keyshortcuts="Meta+K Control+K"
                  className={styles.commandButton}
                  type="button"
                >
                  <Search aria-hidden="true" />
                  <span>Search or jump to</span>
                  <kbd>⌘ K</kbd>
                </button>
              </DialogTrigger>
              <DialogContent
                aria-label="Jump to a page or action"
                className={styles.commandDialog}
                showCloseButton={false}
              >
                <DialogHeader className="sr-only">
                  <DialogTitle>Jump to a page or action</DialogTitle>
                  <DialogDescription>
                    Filter organizer pages and choose a destination.
                  </DialogDescription>
                </DialogHeader>
                <label className={styles.commandSearch}>
                  <Search aria-hidden="true" />
                  <span className="sr-only">Search pages and actions</span>
                  <input
                    autoFocus
                    placeholder="Search pages and actions…"
                    type="search"
                    value={commandQuery}
                    onChange={(event) => setCommandQuery(event.currentTarget.value)}
                  />
                </label>
                <div className={styles.commandResults}>
                  {visibleCommandItems.map((item) => (
                    <Link href={item.href} key={item.href} onClick={() => setCommandOpen(false)}>
                      <span>{item.label}</span>
                    </Link>
                  ))}
                  {visibleCommandItems.length === 0 ? (
                    <p className={styles.commandEmpty}>No matching pages or actions.</p>
                  ) : null}
                </div>
              </DialogContent>
            </Dialog>
          </SidebarHeader>

          <nav className="flex min-h-0 flex-1 flex-col" aria-label="Organizer navigation">
            <SidebarContent>
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
                                <NavigationIcon name={item.icon} />
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
              <div className={styles.organizationIdentity}>
                <div className={styles.organizationAvatar} aria-hidden="true">
                  <span>{currentOrganizationId?.slice(0, 1).toUpperCase() ?? "O"}</span>
                </div>
                <div className={styles.organizationCopy}>
                  <label htmlFor="organizer-organization">Current workspace</label>
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
                    if (requiredOrganizationId !== null) window.location.assign("/admin");
                  }}
                >
                  {availableOrganizationIds.map((organizationId) => (
                    <option key={organizationId} value={organizationId}>
                      {organizationId}
                    </option>
                  ))}
                </select>
              ) : null}
              <Button asChild className={styles.organizationAction} size="sm" variant="ghost">
                <Link href="/admin/events">
                  <CalendarDays aria-hidden="true" />
                  <span>View all events</span>
                  <ExternalLink className={styles.organizationActionEnd} aria-hidden="true" />
                </Link>
              </Button>
              <Button
                className={`${styles.organizationAction} ${styles.signOutAction}`}
                size="sm"
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
              <strong>Overview</strong>
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
                  {children}
                </OrganizerOrganizationContext.Provider>
              ) : null}
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
