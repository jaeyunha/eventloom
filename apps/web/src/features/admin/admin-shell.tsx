"use client";

import Link from "next/link";
import {
  CalendarDays,
  ChartNoAxesColumn,
  ClipboardList,
  ContactRound,
  FileText,
  Folder,
  LayoutDashboard,
  ListChecks,
  Mail,
  PanelsTopLeft,
  Settings,
  Sparkles,
  Star,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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

interface AdminNavigationItem {
  href: string;
  label: string;
  icon: string;
  match(pathname: string): boolean;
}

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

export function isPublicMemberSetupPath(pathname: string): boolean {
  return /^\/admin\/organizations\/[^/]+\/members\/setup\/?$/u.test(pathname);
}

function organizationIdForNavigation(
  eventContext: { organizationId: string; eventId: string } | null,
): string | null {
  if (eventContext !== null) {
    const contextualOrganizationId = eventContext.organizationId.trim();
    return contextualOrganizationId.length > 0 ? contextualOrganizationId : null;
  }
  const configuredOrganizationId = process.env.NEXT_PUBLIC_ORGANIZATION_ID?.trim() ?? "";
  if (configuredOrganizationId.length > 0) return configuredOrganizationId;
  return process.env.NEXT_PUBLIC_APP_ENV === "local" ? "local-organization" : null;
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
  const selectedOrganizationId = organizationId?.trim() ?? "";
  return sessionMemberships(value).some((membership) => {
    if (!isRecord(membership)) return false;
    const membershipOrganizationId =
      typeof membership.organizationId === "string"
        ? membership.organizationId.trim()
        : typeof membership.organization_id === "string"
          ? membership.organization_id.trim()
          : "";
    const role = typeof membership.role === "string" ? membership.role.trim().toLowerCase() : "";
    if (role !== "owner" && role !== "admin") return false;
    return (
      selectedOrganizationId.length === 0 || membershipOrganizationId === selectedOrganizationId
    );
  });
}

export function eventNavigationFor(
  eventContext: { organizationId: string; eventId: string } | null,
): readonly AdminNavigationItem[] {
  const organizationId = organizationIdForNavigation(eventContext);
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
  const eventNavigation = eventNavigationFor(eventContext);
  const requiredOrganizationId = organizationIdFromPathname(pathname);
  const currentOrganizationId =
    organizationIdFromPathname(pathname) ?? organizationIdForNavigation(eventContext);
  const navigationWithCrm =
    currentOrganizationId === null
      ? eventNavigation
      : [...eventNavigation, crmNavigationItem(currentOrganizationId)];
  const [authentication, setAuthentication] = useState<"checking" | "authenticated" | "denied">(
    "checking",
  );

  useEffect(() => {
    if (publicMemberSetup) {
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
        if (!sessionHasOrganizerMembership(session, requiredOrganizationId)) {
          setAuthentication("denied");
          return;
        }
        setAuthentication("authenticated");
      })
      .catch(() => {
        if (!controller.signal.aborted) window.location.replace("/login");
      });
    return () => controller.abort();
  }, [publicMemberSetup, requiredOrganizationId]);

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
  return (
    <TooltipProvider>
      <SidebarProvider>
        <a
          className="fixed left-3 top-3 z-50 -translate-y-24 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background transition-transform focus:translate-y-0"
          href="#admin-content"
        >
          Skip to organizer content
        </a>

        <Sidebar aria-label="Organizer workspace" collapsible="icon">
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild size="lg" tooltip="Open Sessionboard">
                  <Link href="/admin" aria-label="Open Sessionboard organizer overview">
                    <span className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
                      OS
                    </span>
                    <span className="grid flex-1 text-left text-sm leading-tight">
                      <strong className="truncate font-semibold">Open Sessionboard</strong>
                      <span className="truncate text-xs text-muted-foreground">
                        Organizer workspace
                      </span>
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>

          <nav className="flex min-h-0 flex-1 flex-col" aria-label="Organizer navigation">
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel>Workspace</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {navigationWithCrm.map((item) => {
                      const current = item.match(pathname);
                      return (
                        <SidebarMenuItem key={item.href}>
                          <SidebarMenuButton asChild isActive={current} tooltip={item.label}>
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
            </SidebarContent>
          </nav>

          <SidebarFooter>
            <div className="grid gap-1 rounded-md border bg-background p-2 group-data-[collapsible=icon]:hidden">
              <span className="truncate text-xs text-muted-foreground">Organization</span>
              <strong className="truncate text-sm font-medium">
                {currentOrganizationId ?? "Workspace not selected"}
              </strong>
              <Button asChild className="mt-1 justify-start" size="sm" variant="ghost">
                <Link href="/admin/events">View all events</Link>
              </Button>
              <Button
                className="justify-start"
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => void signOut()}
              >
                Sign out
              </Button>
            </div>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>

        <SidebarInset>
          <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
            <SidebarTrigger />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">Organizer workspace</p>
              <p className="truncate text-xs text-muted-foreground">
                {currentOrganizationId ?? "Choose an event workspace"}
              </p>
            </div>
          </header>

          <main
            id="admin-content"
            className="min-w-0 flex-1 bg-muted/30"
            tabIndex={-1}
            aria-busy={authentication === "checking" ? true : undefined}
          >
            <div className="mx-auto w-full max-w-[90rem] p-4 sm:p-6 lg:p-8">
              {authentication === "checking" ? (
                <p className="sr-only" role="status">
                  Checking organizer access
                </p>
              ) : null}
              {authentication === "denied" ? (
                <section
                  className="rounded-lg border bg-card p-6 text-card-foreground"
                  role="alert"
                >
                  <h1 className="text-xl font-semibold">Access denied</h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    An owner or administrator membership is required for this organization.
                  </p>
                </section>
              ) : (
                children
              )}
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
