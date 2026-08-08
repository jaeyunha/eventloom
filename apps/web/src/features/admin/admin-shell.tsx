"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import styles from "./admin-shell.module.css";

interface AdminNavigationItem {
  href: string;
  label: string;
  icon: string;
  match(pathname: string): boolean;
  count?: string;
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
  {
    href: "/admin/events/summit-2026/cfp",
    label: "CFP",
    icon: "✦",
    match: (pathname: string) => pathname.startsWith("/admin/events/") && pathname.includes("/cfp"),
  },
  {
    href: "/admin/events/summit-2026/submissions",
    label: "Submissions",
    icon: "▤",
    match: (pathname: string) =>
      pathname.startsWith("/admin/events/") && pathname.includes("/submissions"),
    count: "128",
  },
  {
    href: "/admin/events/summit-2026/reviews",
    label: "Reviews",
    icon: "◌",
    match: (pathname: string) =>
      pathname.startsWith("/admin/events/") && pathname.includes("/reviews"),
    count: "12",
  },
  {
    href: "/admin/events/summit-2026/agenda",
    label: "Agenda",
    icon: "▥",
    match: (pathname: string) =>
      pathname.startsWith("/admin/events/") && pathname.includes("/agenda"),
  },
  {
    href: "/admin/events/summit-2026/integrations",
    label: "Integrations",
    icon: "⇄",
    match: (pathname: string) =>
      pathname.startsWith("/admin/events/") && pathname.includes("/integrations"),
  },
];

const events = [
  { value: "/admin/events", label: "All events" },
  { value: "/admin/events/summit-2026/cfp", label: "Open Sessionboard Summit 2026" },
] as const;

function isEventWorkspace(pathname: string) {
  return pathname.startsWith("/admin/events/summit-2026/");
}

export function AdminShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const selectedEvent = isEventWorkspace(pathname) ? events[1].value : events[0].value;

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
          <div className={styles.eventSwitcher}>
            <label className={styles.eventLabel} htmlFor="admin-event-selector">
              Event
            </label>
            <select
              className={styles.eventSelect}
              id="admin-event-selector"
              value={selectedEvent}
              onChange={(event) => window.location.assign(event.currentTarget.value)}
            >
              {events.map((event) => (
                <option key={event.value} value={event.value}>
                  {event.label}
                </option>
              ))}
            </select>
          </div>
          <section className={styles.user} aria-label="Signed in organizer">
            <span className={styles.avatar} aria-hidden="true">
              AR
            </span>
            <span className={styles.userText}>
              <strong className={styles.userName}>Alex Rivera</strong>
              <small className={styles.userRole}>Event organizer</small>
            </span>
          </section>
        </div>
      </header>

      <div className={styles.body}>
        <aside className={styles.sidebar} aria-label="Organizer workspace">
          <nav className={styles.navigation} aria-label="Organizer navigation">
            <p className={styles.navHeading}>Workspace</p>
            <ul className={styles.navList}>
              {navigation.map((item) => {
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
                      {item.count ? (
                        <span className={styles.navCount}>
                          {item.count}
                          <span className={styles.srOnly}> open items</span>
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className={styles.sidebarFooter}>
            <p>Summit 2026</p>
            <span>Workspace timezone</span>
            <strong>America/Los_Angeles</strong>
            <Link className={styles.sideLink} href="/admin/events">
              View all events <span aria-hidden="true">→</span>
            </Link>
          </div>
        </aside>

        <main id="admin-content" className={styles.content} tabIndex={-1}>
          <div className={styles.contentInner}>{children}</div>
        </main>
      </div>
    </div>
  );
}
