"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { sessionHasAuthenticatedUser } from "../auth/session";
import styles from "./admin-shell.module.css";

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
    icon: "⌂",
    match: (pathname: string) => pathname === "/admin",
  },
  {
    href: "/admin/events",
    label: "Events",
    icon: "▦",
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
    icon: "♙",
    match: (pathname: string) => pathname === href || pathname.startsWith(`${href}/`),
  };
}
function crmNavigationItem(organizationId: string): AdminNavigationItem {
  const href = `/admin/organizations/${encodeURIComponent(organizationId)}/crm`;
  return {
    href,
    label: "CRM",
    icon: "◎",
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
    eventNavigationItem(eventBasePath, "cfp", "CFP Form", "✎"),
    eventNavigationItem(eventBasePath, "submissions", "Submissions", "▤"),
    eventNavigationItem(eventBasePath, "reviews", "Reviews", "◌"),
    eventNavigationItem(eventBasePath, "speakers", "Speakers", "♟"),
    eventNavigationItem(eventBasePath, "deliverables", "Deliverables", "◇"),
    eventNavigationItem(eventBasePath, "files", "Files", "▦"),
    eventNavigationItem(eventBasePath, "agenda", "Agenda", "▤"),
    eventNavigationItem(eventBasePath, "settings", "Settings", "◎"),
    eventNavigationItem(eventBasePath, "communications", "Communications", "✉"),
    eventNavigationItem(eventBasePath, "reports", "Reports", "▥"),
    eventNavigationItem(eventBasePath, "remix", "Content remix", "✦"),
    eventNavigationItem(eventBasePath, "embeds", "Embeds", "▣"),
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
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#admin-content">
        Skip to organizer content
      </a>

      <header className={styles.topbar}>
        <Link
          className={styles.brand}
          href="/admin"
          aria-label="Open Sessionboard organizer overview"
        >
          <span className={styles.brandMark} aria-hidden="true">
            OS
          </span>
          <span className={styles.brandText}>
            <strong className={styles.brandName}>Open Sessionboard</strong>
            <small className={styles.brandMeta}>Organizer workspace</small>
          </span>
        </Link>

        <div className={styles.topbarActions}>
          <section className={styles.user} aria-label="Signed in organizer">
            <span className={styles.avatar} aria-hidden="true">
              OR
            </span>
            <span className={styles.userText}>
              <strong className={styles.userName}>Organizer</strong>
              <small className={styles.userRole}>Signed-in organizer</small>
            </span>
          </section>
          <button className={styles.signOutButton} type="button" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <aside className={styles.sidebar} aria-label="Organizer workspace">
          <nav className={styles.navigation} aria-label="Organizer navigation">
            <p className={styles.navHeading}>Workspace</p>
            <ul className={styles.navList}>
              {navigationWithCrm.map((item) => {
                const current = item.match(pathname);
                return (
                  <li key={item.href}>
                    <Link
                      className={`${styles.navItem} ${current ? styles.navItemActive : ""}`}
                      href={item.href}
                      aria-current={current ? "page" : undefined}
                    >
                      <span className={styles.navIcon} aria-hidden="true">
                        {item.icon}
                      </span>
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className={styles.sidebarFooter}>
            <p>{currentOrganizationId ?? "Organization workspace"}</p>
            <span>Live event context</span>
            <strong>Use Events to choose a workspace</strong>
            <Link className={styles.sideLink} href="/admin/events">
              View all events <span aria-hidden="true">→</span>
            </Link>
          </div>
        </aside>

        <main
          id="admin-content"
          className={styles.content}
          tabIndex={-1}
          aria-busy={authentication === "checking" ? true : undefined}
        >
          <div className={styles.contentInner}>
            {authentication === "checking" ? (
              <p className={styles.srOnly} role="status">
                Checking organizer access
              </p>
            ) : null}
            {authentication === "denied" ? (
              <div role="alert">
                <h1>Access denied</h1>
                <p>An owner or administrator membership is required for this organization.</p>
              </div>
            ) : (
              children
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
