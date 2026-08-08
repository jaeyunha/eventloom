import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import styles from "../../styles/design-system.module.css";
import { cx } from "./class-names";

export type ButtonVariant = "primary" | "secondary" | "accent" | "danger" | "ghost";
export type ButtonSize = "small" | "medium" | "large";

const variantClasses: Record<ButtonVariant, string> = {
  primary: styles.buttonPrimary,
  secondary: styles.buttonSecondary,
  accent: styles.buttonAccent,
  danger: styles.buttonDanger,
  ghost: styles.buttonGhost,
};

const sizeClasses: Record<ButtonSize, string | undefined> = {
  small: styles.buttonSmall,
  medium: undefined,
  large: styles.buttonLarge,
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

export function Button({
  className,
  variant = "primary",
  size = "medium",
  fullWidth = false,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cx(
        styles.button,
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && styles.buttonFull,
        className,
      )}
      type={type}
      {...props}
    />
  );
}

export interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

export function ButtonLink({
  className,
  variant = "primary",
  size = "medium",
  fullWidth = false,
  ...props
}: ButtonLinkProps) {
  return (
    <a
      className={cx(
        styles.button,
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && styles.buttonFull,
        className,
      )}
      {...props}
    />
  );
}
