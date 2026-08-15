import { type LucideIcon, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import type { ComponentProps, HTMLAttributes } from "react";
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import styles from "./workspace-navigation.module.css";

export interface WorkspaceNavigationItem {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly current?: boolean;
  readonly disabled?: boolean;
}

export interface WorkspaceNavigationProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  readonly items: readonly WorkspaceNavigationItem[];
  readonly ariaLabel?: string;
}

function NavigationLinks({
  items,
  className,
}: {
  readonly items: readonly WorkspaceNavigationItem[];
  readonly className?: string | undefined;
}) {
  return (
    <ul className={cn(styles.navigationList, className)}>
      {items.map((item) => {
        const Icon = item.icon;

        return (
          <li key={item.href}>
            <Link
              aria-current={item.current ? "page" : undefined}
              aria-disabled={item.disabled || undefined}
              className={cn(styles.navigationLink, item.current && styles.current)}
              href={item.href}
            >
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function DesktopNavigation({
  items,
  ariaLabel = "Workspace navigation",
  className,
  ...props
}: WorkspaceNavigationProps) {
  return (
    <nav aria-label={ariaLabel} className={cn(styles.desktopNavigation, className)} {...props}>
      <NavigationLinks items={items} />
    </nav>
  );
}

export interface MobileBottomNavigationProps extends Omit<WorkspaceNavigationProps, "ariaLabel"> {
  readonly ariaLabel?: string;
  readonly moreItems?: readonly WorkspaceNavigationItem[];
  readonly moreLabel?: string;
  readonly sheetDescription?: string;
  readonly visibleItemCount?: number;
}

export function MobileBottomNavigation({
  items,
  moreItems,
  ariaLabel = "Mobile navigation",
  moreLabel = "More",
  sheetDescription = "Additional workspace destinations.",
  visibleItemCount = 4,
  className,
  ...props
}: MobileBottomNavigationProps) {
  const visibleItems = items.slice(0, visibleItemCount);
  const overflowItems = moreItems ?? items.slice(visibleItemCount);

  return (
    <nav aria-label={ariaLabel} className={cn(styles.mobileNavigation, className)} {...props}>
      <ul className={styles.mobileNavigationList}>
        {visibleItems.map((item) => {
          const Icon = item.icon;

          return (
            <li key={item.href}>
              <Link
                aria-current={item.current ? "page" : undefined}
                aria-disabled={item.disabled || undefined}
                className={cn(styles.mobileNavigationLink, item.current && styles.current)}
                href={item.href}
              >
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
        {overflowItems.length === 0 ? null : (
          <li>
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  aria-label={`${moreLabel} navigation destinations`}
                  className={styles.moreTrigger}
                  type="button"
                  variant="ghost"
                >
                  <MoreHorizontal aria-hidden="true" />
                  <span>{moreLabel}</span>
                </Button>
              </SheetTrigger>
              <SheetContent className={styles.moreSheet} side="bottom">
                <SheetHeader>
                  <SheetTitle>{moreLabel} navigation</SheetTitle>
                  <SheetDescription>{sheetDescription}</SheetDescription>
                </SheetHeader>
                <nav aria-label={`${moreLabel} navigation`} className={styles.moreNavigation}>
                  <NavigationLinks items={overflowItems} className={styles.moreNavigationList} />
                </nav>
              </SheetContent>
            </Sheet>
          </li>
        )}
      </ul>
    </nav>
  );
}

export type WorkspaceNavigationLinkProps = ComponentProps<"a"> & {
  readonly item: WorkspaceNavigationItem;
};

export const WorkspaceNavigation = DesktopNavigation;
