import { Building2, CalendarDays } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import styles from "./workspace-shell.module.css";

export interface WorkspaceShellProps extends HTMLAttributes<HTMLDivElement> {
  readonly navigation?: ReactNode;
  readonly mobileNavigation?: ReactNode;
  readonly contextBar?: ReactNode;
  readonly contentBodyClassName?: string;
  readonly mainClassName?: string;
  readonly mainId?: string;
}

/**
 * Presentation-only workspace frame. Controllers provide navigation, scoped
 * context, and page content while this component owns the sole main landmark.
 */
export function WorkspaceShell({
  navigation,
  mobileNavigation,
  contextBar,
  contentBodyClassName,
  mainClassName,
  mainId = "workspace-main",
  className,
  children,
  ...props
}: WorkspaceShellProps) {
  return (
    <div className={cn(styles.shell, className)} {...props} data-role-workspace-shell="true">
      <a className={styles.skipLink} href={`#${mainId}`}>
        Skip to workspace content
      </a>
      {navigation === undefined ? null : (
        <aside className={styles.desktopNavigation}>{navigation}</aside>
      )}
      <main className={cn(styles.main, styles.insetPanel, mainClassName)} id={mainId} tabIndex={-1}>
        <div className={styles.content}>
          {contextBar === undefined ? null : <div className={styles.context}>{contextBar}</div>}
          <div className={cn(styles.contentBody, contentBodyClassName)}>{children}</div>
        </div>
      </main>
      {mobileNavigation === undefined ? null : (
        <div className={styles.mobileNavigation}>{mobileNavigation}</div>
      )}
    </div>
  );
}

export interface WorkspaceContextBarProps extends HTMLAttributes<HTMLElement> {
  readonly event: ReactNode;
  readonly organization?: ReactNode;
  readonly metadata?: ReactNode;
  readonly actions?: ReactNode;
}

export function WorkspaceContextBar({
  event,
  organization,
  metadata,
  actions,
  className,
  ...props
}: WorkspaceContextBarProps) {
  return (
    <header className={cn(styles.contextBar, className)} {...props}>
      <div className={styles.contextScope}>
        {organization === undefined ? null : (
          <span className={styles.contextItem}>
            <Building2 aria-hidden="true" />
            <span>{organization}</span>
          </span>
        )}
        <span className={styles.contextItem}>
          <CalendarDays aria-hidden="true" />
          <span>{event}</span>
        </span>
        {metadata === undefined ? null : <span className={styles.contextMetadata}>{metadata}</span>}
      </div>
      {actions === undefined ? null : <div className={styles.contextActions}>{actions}</div>}
    </header>
  );
}

export const EventContext = WorkspaceContextBar;
