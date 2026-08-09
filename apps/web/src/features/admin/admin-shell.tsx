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

export function AdminShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();

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
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className={styles.sidebarFooter}>
            <p>Organization workspace</p>
            <span>Live event context</span>
            <strong>Use Events to choose a workspace</strong>
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
