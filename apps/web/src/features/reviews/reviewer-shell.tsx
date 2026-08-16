"use client";

import { Inbox, LayoutDashboard, LogOut } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/product-shell/theme-toggle";
import { Button } from "@/components/ui/button";
import { RoleWorkspaceShell } from "@/components/workspace/role-workspace-shell";
import { signOutAccount } from "@/features/account/account-actions";
import styles from "./reviewer-shell.module.css";

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
    <RoleWorkspaceShell
      className={styles.shell}
      data-reviewer-shell="true"
      brandHref="/review"
      contextLabel={event}
      currentPageLabel="Review queue"
      footer={
        <div className={styles.account}>
          <div className={styles.accountCopy}>
            <strong>{organization}</strong>
            <span>Assigned evaluation access</span>
          </div>
          <Button
            className={styles.signOut}
            data-reviewer-sign-out="true"
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => void signOutAccount()}
          >
            <LogOut data-icon="inline-start" aria-hidden="true" />
            <span>Sign out</span>
          </Button>
        </div>
      }
      headerActions={
        <nav className={styles.actions} aria-label="Reviewer account navigation">
          <Button asChild size="sm" variant="ghost">
            <Link href="/work">
              <LayoutDashboard data-icon="inline-start" aria-hidden="true" />
              <span className={styles.allWorkLabel}>All work</span>
            </Link>
          </Button>
          <ThemeToggle />
        </nav>
      }
      mainId="reviewer-main"
      navigationGroups={[
        {
          label: "Review",
          items: [
            {
              current: true,
              href: "/review",
              icon: Inbox,
              label: "Review queue",
            },
          ],
        },
      ]}
      navigationLabel="Reviewer workspace"
      roleLabel="Reviewer workspace"
      skipLabel="Skip to reviewer workspace"
      workspace="reviewer"
    >
      {children}
    </RoleWorkspaceShell>
  );
}
