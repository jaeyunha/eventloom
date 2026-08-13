import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import styles from "./workspace-ui.module.css";

type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

interface WorkspaceHeaderProps {
  readonly eyebrow?: ReactNode;
  readonly breadcrumb?: ReactNode;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly status?: ReactNode;
  readonly metadata?: ReactNode;
  readonly actions?: ReactNode;
  readonly children?: ReactNode;
  readonly className?: string;
}

export function WorkspaceHeader({
  eyebrow,
  breadcrumb,
  title,
  description,
  status,
  metadata,
  actions,
  children,
  className,
}: WorkspaceHeaderProps) {
  return (
    <header className={cn(styles.header, className)}>
      {(breadcrumb ?? eyebrow) === undefined ? null : (
        <div className={styles.headerTop}>
          {breadcrumb === undefined ? (
            <span className={styles.eyebrow}>{eyebrow}</span>
          ) : (
            breadcrumb
          )}
        </div>
      )}
      <div className={styles.titleRow}>
        <div className={styles.titleBlock}>
          <div className={styles.meta}>
            <h1 className={styles.title}>{title}</h1>
            {status}
          </div>
          {description === undefined ? null : <p className={styles.description}>{description}</p>}
        </div>
        {actions === undefined ? null : <div className={styles.headerActions}>{actions}</div>}
      </div>
      {metadata === undefined ? null : <div className={styles.meta}>{metadata}</div>}
      {children}
    </header>
  );
}

interface WorkspaceBreadcrumbProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export function WorkspaceBreadcrumb({ children, className }: WorkspaceBreadcrumbProps) {
  return <nav className={cn(styles.breadcrumb, className)}>{children}</nav>;
}

interface WorkspaceMetaItemProps {
  readonly icon?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}

export function WorkspaceMetaItem({ icon, children, className }: WorkspaceMetaItemProps) {
  return (
    <span className={cn(styles.metaItem, className)}>
      {icon}
      {children}
    </span>
  );
}

interface CollectionToolbarProps {
  readonly label?: ReactNode;
  readonly primary?: ReactNode;
  readonly secondary?: ReactNode;
  readonly className?: string;
}

export function CollectionToolbar({
  label,
  primary,
  secondary,
  className,
}: CollectionToolbarProps) {
  return (
    <div className={cn(styles.toolbar, className)}>
      <div className={styles.toolbarGroup}>
        {label === undefined ? null : <span className={styles.toolbarLabel}>{label}</span>}
        {primary}
      </div>
      {secondary === undefined ? null : <div className={styles.toolbarGroup}>{secondary}</div>}
    </div>
  );
}

interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  readonly tone?: StatusTone;
  readonly dot?: boolean;
}

export function StatusBadge({
  tone = "neutral",
  dot = true,
  className,
  children,
  ...props
}: StatusBadgeProps) {
  return (
    <span className={cn(styles.status, styles[tone], className)} {...props}>
      {dot ? <span className={styles.statusDot} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

interface WorkspaceSurfaceProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  readonly title?: ReactNode;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
}

export function WorkspaceSurface({
  title,
  description,
  actions,
  className,
  children,
  ...props
}: WorkspaceSurfaceProps) {
  return (
    <section className={cn(styles.surface, className)} {...props}>
      {(title ?? description ?? actions) === undefined ? null : (
        <header className={styles.surfaceHeader}>
          <div>
            {title === undefined ? null : <h2 className={styles.surfaceTitle}>{title}</h2>}
            {description === undefined ? null : (
              <p className={styles.surfaceDescription}>{description}</p>
            )}
          </div>
          {actions}
        </header>
      )}
      <div className={styles.surfaceContent}>{children}</div>
    </section>
  );
}

interface InspectorProps extends HTMLAttributes<HTMLElement> {
  readonly children: ReactNode;
}

export function Inspector({ className, children, ...props }: InspectorProps) {
  return (
    <aside className={cn(styles.inspector, className)} {...props}>
      {children}
    </aside>
  );
}

interface InspectorSectionProps {
  readonly title: ReactNode;
  readonly children?: ReactNode;
  readonly className?: string;
}

export function InspectorSection({ title, children, className }: InspectorSectionProps) {
  return (
    <section className={cn(styles.inspectorSection, className)}>
      <h2 className={styles.inspectorTitle}>{title}</h2>
      {children}
    </section>
  );
}

interface WorkspaceEmptyStateProps {
  readonly title: ReactNode;
  readonly description: ReactNode;
  readonly actions?: ReactNode;
  readonly className?: string;
}

export function WorkspaceEmptyState({
  title,
  description,
  actions,
  className,
}: WorkspaceEmptyStateProps) {
  return (
    <div className={cn(styles.empty, className)}>
      <div className={styles.emptyInner}>
        <h2 className={styles.emptyTitle}>{title}</h2>
        <p className={styles.emptyDescription}>{description}</p>
        {actions === undefined ? null : <div className={styles.emptyActions}>{actions}</div>}
      </div>
    </div>
  );
}

export const workspaceClassNames = {
  page: styles.page,
} as const;
