"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import styles from "./submission-detail-drawer.module.css";

interface SubmissionDetailDrawerProps {
  readonly children: ReactNode;
  readonly closeHref: string;
  readonly title: string;
}

export function SubmissionDetailDrawer({
  children,
  closeHref,
  title,
}: SubmissionDetailDrawerProps) {
  const router = useRouter();

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) router.push(closeHref);
      }}
    >
      <SheetContent
        side="right"
        showCloseButton={false}
        className={styles.sheet}
        overlayClassName={styles.overlay}
      >
        <SheetTitle className={styles.srOnly}>{title}</SheetTitle>
        <SheetDescription className={styles.srOnly}>
          Review the selected submission without leaving the submissions collection.
        </SheetDescription>
        <header className={styles.toolbar}>
          <Button asChild variant="ghost" size="icon-sm">
            <Link href={closeHref} aria-label="Close submission details">
              <X aria-hidden="true" />
            </Link>
          </Button>
          <span className={styles.toolbarTitle}>Submission detail</span>
          <span className={styles.toolbarSpacer} aria-hidden="true" />
        </header>
        <div className={styles.body} data-scroll-region="submission-detail">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
