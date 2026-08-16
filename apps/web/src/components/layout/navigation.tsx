import type { ReactNode } from "react";
import styles from "../../styles/design-system.module.css";
import { cx } from "../ui/class-names";

export interface NavigationItem {
  label: ReactNode;
  href: string;
  icon?: ReactNode;
  current?: boolean;
  trailing?: ReactNode;
}

export interface NavigationSection {
  label: string;
  items: readonly NavigationItem[];
}

export interface SidebarNavigationProps {
  sections: readonly NavigationSection[];
  brand?: ReactNode;
  brandHref?: string;
  mark?: ReactNode;
  ariaLabel?: string;
  className?: string;
}

function NavigationLink({ item }: { item: NavigationItem }) {
  return (
    <a
      aria-current={item.current ? "page" : undefined}
      className={cx(styles.navLink, item.current && styles.navLinkCurrent)}
      href={item.href}
    >
      {item.icon ? (
        <span aria-hidden="true" className={styles.navIcon}>
          {item.icon}
        </span>
      ) : null}
      <span>{item.label}</span>
      {item.trailing ? <span>{item.trailing}</span> : null}
    </a>
  );
}

export function SidebarNavigation({
  sections,
  brand = "Eventloom",
  brandHref = "/",
  mark = "EL",
  ariaLabel = "Program navigation",
  className,
}: SidebarNavigationProps) {
  return (
    <div className={className}>
      <a className={styles.navBrand} href={brandHref}>
        <span aria-hidden="true" className={styles.navMark}>
          {mark}
        </span>
        <span>{brand}</span>
      </a>
      <nav aria-label={ariaLabel} className={styles.nav}>
        {sections.map((section) => (
          <section className={styles.navSection} key={section.label}>
            <h2 className={styles.navSectionTitle}>{section.label}</h2>
            <ul className={styles.navList}>
              {section.items.map((item) => (
                <li key={item.href}>
                  <NavigationLink item={item} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>
    </div>
  );
}

export interface PortalHeaderProps {
  items: readonly NavigationItem[];
  brand?: ReactNode;
  brandHref?: string;
  actions?: ReactNode;
  ariaLabel?: string;
  className?: string;
}

export function PortalHeader({
  items,
  brand = "Eventloom",
  brandHref = "/portal",
  actions,
  ariaLabel = "Speaker portal",
  className,
}: PortalHeaderProps) {
  return (
    <header className={cx(styles.portalHeader, className)}>
      <div className={styles.portalHeaderInner}>
        <a className={styles.navBrand} href={brandHref}>
          <span aria-hidden="true" className={styles.navMark}>
            OS
          </span>
          <span>{brand}</span>
        </a>
        <nav aria-label={ariaLabel}>
          <ul className={cx(styles.navList, styles.portalNav)}>
            {items.map((item) => (
              <li key={item.href}>
                <NavigationLink item={item} />
              </li>
            ))}
          </ul>
        </nav>
        {actions ? <div>{actions}</div> : null}
      </div>
    </header>
  );
}
