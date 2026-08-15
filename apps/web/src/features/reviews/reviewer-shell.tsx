"use client";

import { ClipboardList, LayoutDashboard, LogOut } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/product-shell/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DesktopNavigation,
  MobileBottomNavigation,
  WorkspaceContextBar,
  type WorkspaceNavigationItem,
  WorkspaceShell,
} from "@/components/workspace";
import { signOutAccount } from "@/features/account/account-actions";
import styles from "./reviewer-shell.module.css";

export const signOutReviewerSession = signOutAccount;

const reviewerNavigation: readonly WorkspaceNavigationItem[] = [
  {
    href: "/review",
    label: "Queue",
    icon: ClipboardList,
    current: true,
  },
  {
    href: "/work",
    label: "All work",
    icon: LayoutDashboard,
  },
];

function ReviewerRail() {
  return (
    <div className={styles.rail}>
      <Link className={styles.brand} href="/review" aria-label="Eventloom reviewer workspace">
        <span className={styles.brandMark} aria-hidden="true">
          EL
        </span>
        <span className={styles.brandCopy}>
          <strong>Eventloom</strong>
          <small>Reviewer workspace</small>
        </span>
      </Link>
      <div className={styles.navigationGroup}>
        <p className={styles.navigationLabel}>Workspace</p>
        <DesktopNavigation ariaLabel="Reviewer workspace" items={reviewerNavigation} />
      </div>
      <div className={styles.roleSummary}>
        <strong>Reviewer</strong>
        <span>Assigned evaluation access</span>
      </div>
    </div>
  );
}

function ReviewerActions() {
  return (
    <div className={styles.accountActions}>
      <ThemeToggle />
      <Button
        aria-label="Sign out"
        data-reviewer-sign-out="true"
        size="sm"
        type="button"
        variant="ghost"
        onClick={() => void signOutAccount()}
      >
        <LogOut data-icon="inline-start" aria-hidden="true" />
        <span className={styles.actionLabel}>Sign out</span>
      </Button>
    </div>
  );
}

export interface ReviewerShellProps {
  readonly children: ReactNode;
  readonly event?: ReactNode;
  readonly organization?: ReactNode;
}

export function ReviewerShell({
  children,
  event = "All assigned events",
  organization = "Reviewer",
}: ReviewerShellProps) {
  return (
    <WorkspaceShell
      className={styles.shell}
      contextBar={
        <WorkspaceContextBar
          actions={<ReviewerActions />}
          event={event}
          organization={organization}
        />
      }
      data-reviewer-shell="true"
      mainId="reviewer-main"
      mobileNavigation={
        <MobileBottomNavigation
          ariaLabel="Reviewer mobile navigation"
          items={reviewerNavigation}
          visibleItemCount={2}
        />
      }
      navigation={<ReviewerRail />}
    >
      {children}
    </WorkspaceShell>
  );
}
