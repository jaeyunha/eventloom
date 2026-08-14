"use client";

import { LayoutDashboard, LogOut } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/product-shell/theme-toggle";
import { Button } from "@/components/ui/button";
import { signOutAccount } from "@/features/account/account-actions";
import styles from "./reviewer-shell.module.css";

export const signOutReviewerSession = signOutAccount;

export function ReviewerShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className={styles.shell} data-reviewer-shell="true">
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <Link className={styles.brand} href="/review" aria-label="Eventloom reviewer workspace">
            <span className={styles.brandMark} aria-hidden="true">
              EL
            </span>
            <span className={styles.brandCopy}>
              <strong>Eventloom</strong>
              <span>Reviewer workspace</span>
            </span>
          </Link>
          <nav className={styles.actions} aria-label="Reviewer account navigation">
            <Button asChild size="sm" variant="ghost">
              <Link href="/work">
                <LayoutDashboard data-icon="inline-start" aria-hidden="true" />
                <span className={styles.submissionsLabel}>All work</span>
                <span className={styles.mobileSubmissionsLabel}>Work</span>
              </Link>
            </Button>
            <ThemeToggle />
            <Button
              data-reviewer-sign-out="true"
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => void signOutAccount()}
            >
              <LogOut data-icon="inline-start" aria-hidden="true" />
              <span>Sign out</span>
            </Button>
          </nav>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
