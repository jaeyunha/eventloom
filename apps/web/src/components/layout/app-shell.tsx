import type { ReactNode } from "react";
import styles from "../../styles/design-system.module.css";
import { cx } from "../ui/class-names";

export interface AppShellProps {
  sidebar: ReactNode;
  children: ReactNode;
  topbar?: ReactNode;
  mainId?: string;
  className?: string;
  contentClassName?: string;
}

export function AppShell({
  sidebar,
  children,
  topbar,
  mainId = "main-content",
  className,
  contentClassName,
}: AppShellProps) {
  return (
    <div className={cx(styles.appShell, className)}>
      <a className={styles.skipLink} href={`#${mainId}`}>
        Skip to main content
      </a>
      <aside aria-label="Primary navigation" className={styles.appSidebar}>
        {sidebar}
      </aside>
      <div className={styles.appMain}>
        {topbar ? <header className={styles.appTopbar}>{topbar}</header> : null}
        <main className={cx(styles.appContent, contentClassName)} id={mainId} tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
