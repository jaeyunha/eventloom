"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/product-shell/theme-toggle";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ORGANIZER_ORGANIZATION_STORAGE_KEY } from "@/lib/organizer-workspace-preference";
import { signOutAccount } from "../account/account-actions";
import { WorkEventInvitations } from "./work-event-invitations";
import styles from "./work-hub.module.css";
import { WorkHubCards } from "./work-hub-cards";
import { loadWorkHubModel } from "./work-hub-loader";
import type { WorkHubModel } from "./work-hub-model";

export function WorkHubView({ model }: Readonly<{ model: WorkHubModel }>) {
  const [invitations, setInvitations] = useState(model.invitations ?? []);
  const acceptedEventCount = invitations.filter(({ status }) => status === "accepted").length;
  const availableCount =
    [model.organizer, model.reviewer, model.participant].filter(Boolean).length +
    acceptedEventCount;
  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#work-content">
        Skip to work
      </a>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <Link className={styles.brand} href="/work" aria-label="Eventloom work hub">
            <span className={styles.brandMark} aria-hidden="true">
              EL
            </span>
            <span>
              <strong>Eventloom</strong>
              <small>Work hub</small>
            </span>
          </Link>
          <div className={styles.accountActions}>
            <span className={styles.identity}>
              <strong>{model.identity.name ?? "Account"}</strong>
              <small>{model.identity.email}</small>
            </span>
            <ThemeToggle />
            <Button type="button" variant="ghost" onClick={() => void signOutAccount()}>
              <LogOut data-icon="inline-start" aria-hidden="true" /> Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className={styles.main} id="work-content" tabIndex={-1}>
        <section className={styles.heading} aria-labelledby="work-heading">
          <p className={styles.eyebrow}>
            One account · {availableCount} workspace{availableCount === 1 ? "" : "s"}
          </p>
          <h1 id="work-heading">Where do you want to work?</h1>
          <p>
            Your access follows your assignments and memberships. Move between contexts without
            signing in again.
          </p>
        </section>
        <WorkEventInvitations invitations={invitations} onInvitationsChange={setInvitations} />
        <WorkHubCards model={model} hasEventInvitations={invitations.length > 0} />
      </main>
    </div>
  );
}

export function WorkHub() {
  const [model, setModel] = useState<WorkHubModel | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const preferred = window.localStorage.getItem(ORGANIZER_ORGANIZATION_STORAGE_KEY);
    void loadWorkHubModel(globalThis.fetch, controller.signal, preferred)
      .then((next) => {
        if (next === null) window.location.replace("/login?next=%2Fwork");
        else setModel(next);
      })
      .catch((caught: unknown) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(true);
      });
    return () => controller.abort();
  }, []);
  if (error) {
    return (
      <main className={styles.state}>
        <Alert variant="destructive">
          <AlertTitle>Workspaces are unavailable</AlertTitle>
          <AlertDescription>Reload the page to try again.</AlertDescription>
        </Alert>
      </main>
    );
  }
  if (model === null)
    return (
      <main className={styles.state} aria-busy="true">
        <p className={styles.eyebrow}>Loading your workspaces</p>
      </main>
    );
  return <WorkHubView model={model} />;
}
