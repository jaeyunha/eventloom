import { type HTMLAttributes, type ReactNode, useId } from "react";
import { cn } from "@/lib/utils";
import styles from "./settings-ui.module.css";

interface SettingsShellProps extends HTMLAttributes<HTMLDivElement> {
  readonly navigation: ReactNode;
  readonly wide?: boolean;
}

export function SettingsShell({
  navigation,
  children,
  wide = false,
  className,
  ...props
}: SettingsShellProps) {
  return (
    <div className={cn(styles.shell, wide && styles.shellWide, className)} {...props}>
      <div className={styles.navigation}>{navigation}</div>
      <div className={styles.content}>{children}</div>
    </div>
  );
}

interface SettingGroupProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly metadata?: ReactNode;
  readonly action?: ReactNode;
  readonly contentClassName?: string | undefined;
}

export function SettingGroup({
  title,
  description,
  metadata,
  action,
  className,
  contentClassName,
  children,
  ...props
}: SettingGroupProps) {
  const generatedTitleId = useId();
  const titleId = props["aria-labelledby"] ?? generatedTitleId;

  return (
    <section className={cn(styles.group, className)} aria-labelledby={titleId} {...props}>
      <header className={styles.groupHeader}>
        <div className={styles.groupHeading}>
          <div className={styles.groupTitleRow}>
            <h2 className={styles.groupTitle} id={titleId}>
              {title}
            </h2>
            {metadata === undefined ? null : (
              <span className={styles.groupMetadata}>{metadata}</span>
            )}
          </div>
          {description === undefined ? null : (
            <p className={styles.groupDescription}>{description}</p>
          )}
        </div>
        {action === undefined ? null : <div className={styles.groupAction}>{action}</div>}
      </header>
      <div className={cn(styles.groupContent, contentClassName)}>{children}</div>
    </section>
  );
}

interface SettingRowProps extends HTMLAttributes<HTMLLIElement> {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly controls?: ReactNode;
}

export function SettingRow({ label, description, controls, className, ...props }: SettingRowProps) {
  return (
    <li className={cn(styles.row, className)} {...props}>
      <div className={styles.rowCopy}>
        <div className={styles.rowLabel}>{label}</div>
        {description === undefined ? null : (
          <div className={styles.rowDescription}>{description}</div>
        )}
      </div>
      {controls === undefined ? null : <div className={styles.rowControls}>{controls}</div>}
    </li>
  );
}
