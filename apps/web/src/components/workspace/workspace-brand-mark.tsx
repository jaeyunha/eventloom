import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import styles from "./workspace-brand-mark.module.css";

export type WorkspaceBrandMarkProps = Omit<HTMLAttributes<HTMLSpanElement>, "children">;

export function WorkspaceBrandMark({ className, ...props }: WorkspaceBrandMarkProps) {
  return (
    <span
      {...props}
      aria-hidden="true"
      className={cn(styles.mark, className)}
      data-workspace-brand-mark="true"
    >
      EL
    </span>
  );
}
