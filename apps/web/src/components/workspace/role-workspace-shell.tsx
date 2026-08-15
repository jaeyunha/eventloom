"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import styles from "./role-workspace-shell.module.css";

export interface RoleWorkspaceNavigationItem {
  readonly badge?: ReactNode;
  readonly current: boolean;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly label: string;
}

export interface RoleWorkspaceNavigationGroup {
  readonly items: readonly RoleWorkspaceNavigationItem[];
  readonly label: string;
}

interface RoleWorkspaceShellProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  readonly brandHref: string;
  readonly children: ReactNode;
  readonly className?: string | undefined;
  readonly contentClassName?: string | undefined;
  readonly contextLabel?: ReactNode;
  readonly currentPageLabel: string;
  readonly footer: ReactNode;
  readonly headerActions?: ReactNode;
  readonly mainId: string;
  readonly navigationGroups: readonly RoleWorkspaceNavigationGroup[];
  readonly navigationLabel: string;
  readonly roleLabel: string;
  readonly skipLabel: string;
  readonly workspace: "participant" | "reviewer";
}

export function RoleWorkspaceShell({
  brandHref,
  children,
  className,
  contentClassName,
  contextLabel,
  currentPageLabel,
  footer,
  headerActions,
  mainId,
  navigationGroups,
  navigationLabel,
  roleLabel,
  skipLabel,
  style,
  workspace,
  ...props
}: RoleWorkspaceShellProps) {
  return (
    <TooltipProvider>
      <SidebarProvider
        {...props}
        className={cn(styles.shell, className)}
        data-role-workspace={workspace}
        data-role-workspace-shell="true"
        style={{ ...style, "--sidebar-width": "14rem" } as CSSProperties}
      >
        <a className={styles.skipLink} href={`#${mainId}`}>
          {skipLabel}
        </a>

        <Sidebar
          aria-label={navigationLabel}
          className={styles.sidebar}
          collapsible="icon"
          variant="inset"
        >
          <SidebarHeader className={styles.sidebarHeader}>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={styles.brandButton}
                  size="lg"
                  tooltip={roleLabel}
                >
                  <Link href={brandHref}>
                    <span className={styles.brandMark} aria-hidden="true">
                      EL
                    </span>
                    <span className={styles.brandCopy}>
                      <strong>Eventloom</strong>
                      <small>{roleLabel}</small>
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>

          <SidebarContent className={styles.sidebarContent}>
            <nav aria-label={navigationLabel}>
              {navigationGroups.map((group) => (
                <SidebarGroup className={styles.sidebarGroup} key={group.label}>
                  <SidebarGroupLabel className={styles.sidebarGroupLabel}>
                    {group.label}
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {group.items.map((item) => (
                        <SidebarMenuItem key={item.href}>
                          <SidebarMenuButton
                            asChild
                            className={styles.sidebarMenuButton}
                            isActive={item.current}
                            tooltip={item.label}
                          >
                            <Link href={item.href} aria-current={item.current ? "page" : undefined}>
                              <item.icon aria-hidden="true" />
                              <span>{item.label}</span>
                            </Link>
                          </SidebarMenuButton>
                          {item.badge === undefined ? null : (
                            <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                          )}
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              ))}
            </nav>
          </SidebarContent>

          <SidebarFooter className={styles.sidebarFooter}>{footer}</SidebarFooter>
        </Sidebar>

        <SidebarInset className={styles.inset}>
          <header className={styles.topbar}>
            <div className={styles.topbarContext}>
              <SidebarTrigger className={styles.sidebarTrigger} />
              <div className={styles.pageContext}>
                <strong>{currentPageLabel}</strong>
                {contextLabel === undefined ? null : <span>{contextLabel}</span>}
              </div>
            </div>
            {headerActions === undefined ? null : (
              <div className={styles.headerActions}>{headerActions}</div>
            )}
          </header>

          <main className={styles.main} id={mainId} tabIndex={-1}>
            <div className={cn(styles.content, contentClassName)}>{children}</div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
