import type { HTMLAttributes } from "react";
import styles from "../../styles/design-system.module.css";
import { cx } from "./class-names";

export type BadgeVariant = "neutral" | "info" | "success" | "warning" | "danger" | "outline";

const variantClasses = {
  neutral: styles.badgeNeutral,
  info: styles.badgeInfo,
  success: styles.badgeSuccess,
  warning: styles.badgeWarning,
  danger: styles.badgeDanger,
  outline: styles.badgeOutline,
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = "neutral", ...props }: BadgeProps) {
  return <span className={cx(styles.badge, variantClasses[variant], className)} {...props} />;
}
