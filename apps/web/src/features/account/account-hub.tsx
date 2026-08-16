"use client";

import { ClipboardCheck, LogOut, Presentation, Settings2, Tickets } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/product-shell/theme-toggle";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AccountAccess, AccountCapability } from "./account-access";
import { signOutAccount } from "./account-actions";
import styles from "./account-hub.module.css";
import { loadAccountAccess } from "./account-hub-loader";

const workspaceCards: readonly {
  capability: AccountCapability;
  href: string;
  title: string;
  description: string;
  icon: typeof Settings2;
}[] = [
  {
    capability: "organizer",
    href: "/admin",
    title: "Organize events",
    description: "Manage event programs, submissions, reviewers, speakers, and operations.",
    icon: Settings2,
  },
  {
    capability: "reviews",
    href: "/review",
    title: "Review assignments",
    description: "Open assigned submissions across every authorized event and review round.",
    icon: ClipboardCheck,
  },
  {
    capability: "proposals",
    href: "/portal/submissions",
    title: "My proposals",
    description: "Continue applications and track submitted proposals across events.",
    icon: Tickets,
  },
  {
    capability: "speaker-tasks",
    href: "/portal/tasks",
    title: "Speaker tasks",
    description: "Complete accepted-session tasks, profile details, and event deliverables.",
    icon: Presentation,
  },
];

export function AccountHubView({ access }: Readonly<{ access: AccountAccess }>) {
  const available = workspaceCards.filter(({ capability }) => access.capabilities.has(capability));
  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <Link className={styles.brand} href="/work">
            <span className={styles.brandMark} aria-hidden="true">
              EL
            </span>
            <span className={styles.brandCopy}>
              <strong>Eventloom</strong>
              <span>Your work</span>
            </span>
          </Link>
          <div className={styles.accountActions}>
            <span className={styles.identity}>
              <strong>{access.identity.name ?? "Account"}</strong>
              <span>{access.identity.email}</span>
            </span>
            <ThemeToggle />
            <Button type="button" variant="ghost" onClick={() => void signOutAccount()}>
              <LogOut data-icon="inline-start" aria-hidden="true" />
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className={styles.main}>
        <section className={styles.heading}>
          <p className={styles.eyebrow}>One account · every context</p>
          <h1>Your work</h1>
          <p>Open the organizer, review, proposal, and speaker work available to this account.</p>
        </section>
        {available.length > 0 ? (
          <div className={styles.workspaceGrid}>
            {available.map(({ capability, description, href, icon: Icon, title }) => (
              <Card
                className={styles.workspaceCard}
                data-account-capability={capability}
                key={capability}
              >
                <CardHeader className={styles.cardHeader}>
                  <div>
                    <CardTitle>{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                  </div>
                  <span className={styles.cardIcon}>
                    <Icon aria-hidden="true" />
                  </span>
                </CardHeader>
                <CardContent className={styles.cardBody}>
                  {capability === "reviews" ? (
                    <Badge variant="secondary">{access.reviewerAssignmentCount} assigned</Badge>
                  ) : null}
                  <Button asChild>
                    <Link href={href}>Open workspace</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Alert className={styles.emptyState}>
            <AlertTitle>No assigned work yet</AlertTitle>
            <AlertDescription>
              This account is authenticated, but no organizer, review, proposal, or speaker work is
              currently available.
            </AlertDescription>
          </Alert>
        )}
      </main>
    </div>
  );
}

export function AccountHub() {
  const [access, setAccess] = useState<AccountAccess | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void loadAccountAccess(globalThis.fetch, controller.signal)
      .then((nextAccess) => {
        if (nextAccess === null) {
          window.location.replace("/login?next=%2Fwork");
          return;
        }
        setAccess(nextAccess);
      })
      .catch((caught: unknown) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(true);
      });
    return () => controller.abort();
  }, []);

  if (error) {
    return (
      <main className={styles.main}>
        <Alert className={styles.errorState} variant="destructive">
          <AlertTitle>Account access is unavailable</AlertTitle>
          <AlertDescription>
            Reload the page to try loading your available work again.
          </AlertDescription>
        </Alert>
      </main>
    );
  }
  if (access === null) {
    return (
      <main className={styles.main} aria-busy="true">
        <p className={styles.eyebrow}>Loading account access</p>
      </main>
    );
  }
  return <AccountHubView access={access} />;
}
