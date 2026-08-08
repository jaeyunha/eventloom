import type { HTMLAttributes } from "react";
import styles from "../../styles/design-system.module.css";
import { cx } from "./class-names";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  flat?: boolean;
  interactive?: boolean;
}

export function Card({ className, flat = false, interactive = false, ...props }: CardProps) {
  return (
    <div
      className={cx(
        styles.card,
        flat && styles.cardFlat,
        interactive && styles.cardInteractive,
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx(styles.cardHeader, className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cx(styles.cardTitle, className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cx(styles.cardDescription, className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx(styles.cardContent, className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx(styles.cardFooter, className)} {...props} />;
}
