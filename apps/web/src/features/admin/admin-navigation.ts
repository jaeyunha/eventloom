import {
  CalendarDays,
  ChartNoAxesColumn,
  ClipboardList,
  ContactRound,
  FileText,
  Folder,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
  Mail,
  PanelsTopLeft,
  Settings,
  Sparkles,
  Star,
  Upload,
  Users,
} from "lucide-react";
import type { WorkspaceNavigationItem } from "@/components/workspace";

export type OrganizerNavigationIconName =
  | "agenda"
  | "communications"
  | "crm"
  | "deliverables"
  | "embeds"
  | "events"
  | "files"
  | "form"
  | "integrations"
  | "members"
  | "overview"
  | "remix"
  | "reports"
  | "reviews"
  | "settings"
  | "speakers"
  | "submissions";

export interface OrganizerNavigationItem {
  readonly href: string;
  readonly label: string;
  readonly icon: OrganizerNavigationIconName;
  readonly match: (pathname: string) => boolean;
}

export interface OrganizerNavigationGroup {
  readonly label: string;
  readonly items: readonly OrganizerNavigationItem[];
}

export interface OrganizerEventContext {
  readonly organizationId: string;
  readonly eventId: string;
}

export interface OrganizerWorkspaceDestination {
  readonly href: string;
  readonly icon: OrganizerNavigationIconName;
  readonly label: string;
}

const navigationIcons = {
  agenda: CalendarDays,
  communications: Mail,
  crm: ContactRound,
  deliverables: Upload,
  embeds: PanelsTopLeft,
  events: CalendarDays,
  files: Folder,
  form: FileText,
  integrations: PanelsTopLeft,
  members: Users,
  overview: LayoutDashboard,
  remix: Sparkles,
  reports: ChartNoAxesColumn,
  reviews: ListChecks,
  settings: Settings,
  speakers: Star,
  submissions: ClipboardList,
} satisfies Record<OrganizerNavigationIconName, LucideIcon>;

export function organizationOverviewHref(organizationId: string): string {
  return `/admin/organizations/${encodeURIComponent(organizationId)}`;
}

export function organizationEventsHref(organizationId: string): string {
  return `${organizationOverviewHref(organizationId)}/events`;
}

function navigationItem(
  href: string,
  label: string,
  icon: OrganizerNavigationIconName,
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
  eventContext: OrganizerEventContext | null,
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
  eventContext: OrganizerEventContext | null,
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
  eventContext: OrganizerEventContext | null,
): readonly OrganizerWorkspaceDestination[] {
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

export function workspaceNavigationItems(
  groups: readonly OrganizerNavigationGroup[],
  pathname: string,
): readonly WorkspaceNavigationItem[] {
  return groups.flatMap((group) =>
    group.items.map((item) => ({
      href: item.href,
      label: item.label,
      icon: navigationIcons[item.icon],
      current: item.match(pathname),
    })),
  );
}

export function workspaceNavigationItemsForGroup(
  group: OrganizerNavigationGroup,
  pathname: string,
): readonly WorkspaceNavigationItem[] {
  return workspaceNavigationItems([group], pathname);
}
