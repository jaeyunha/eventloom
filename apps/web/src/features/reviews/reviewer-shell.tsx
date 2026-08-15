"use client";

import { Inbox, LayoutDashboard, LogOut } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/product-shell/theme-toggle";
import { Button } from "@/components/ui/button";
import { RoleWorkspaceShell } from "@/components/workspace/role-workspace-shell";
import { signOutAccount } from "@/features/account/account-actions";
import styles from "./reviewer-shell.module.css";

export const signOutReviewerSession = signOutAccount;

export function ReviewerShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className={styles.shell} data-reviewer-shell="true">
      <RoleWorkspaceShell
        brandHref="/review"
        contextLabel="Assigned submissions"
        currentPageLabel="Review queue"
        footer={
          <div className={styles.account}>
            <div className={styles.accountCopy}>
              <strong>Reviewer account</strong>
              <span>Assignment-scoped access</span>
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
        mainId="reviewer-content"
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
        navigationLabel="Reviewer workspace navigation"
        roleLabel="Reviewer workspace"
        skipLabel="Skip to reviewer content"
        workspace="reviewer"
      >
        {children}
      </RoleWorkspaceShell>
    </div>
  );
}
