"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type ReactNode, useState } from "react";
import {
  portalIdentityProfile,
  submissionStatusPresentation,
  taskStatusPresentation,
} from "./model";
import styles from "./portal.module.css";
import { portalContextLabel, usePortal } from "./portal-provider";
import { PortalWorkspace, type PortalWorkspaceSection } from "./portal-workspace";
import type { PortalSubmissionStatus, PortalTaskStatus } from "./types";

const navigation = [
  { href: "/portal", label: "Home", icon: "⌂" },
  { href: "/portal/submissions", label: "Submissions", icon: "▤" },
  { href: "/portal/profile", label: "Profile", icon: "◉" },
  { href: "/portal/tasks", label: "Tasks", icon: "✓" },
  { href: "/portal?workspace=co-speakers", label: "Co-speakers", icon: "♧" },
  { href: "/portal?workspace=files", label: "Files", icon: "▧" },
  { href: "/portal?workspace=resources", label: "Resources", icon: "◇" },
  { href: "/portal?workspace=wiki", label: "Wiki", icon: "▥" },
] as const;

const noParticipantWorkspaceDescription =
  "A submitted proposal will appear here. Accepted proposals unlock your profile, tasks, and files.";

export async function signOutAndRedirect(
  navigate: (path: string) => void = (path) => window.location.assign(path),
): Promise<void> {
  await fetch("/api/auth/sign-out", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: "{}",
  }).catch(() => undefined);
  navigate("/login");
}

export function PortalFrame({ children }: Readonly<{ children: ReactNode }>) {
  const searchParams = useSearchParams();
  const workspaceParam = searchParams.get("workspace");
  const workspaceSection: PortalWorkspaceSection | null =
    workspaceParam === "co-speakers" ||
    workspaceParam === "files" ||
    workspaceParam === "tasks" ||
    workspaceParam === "resources" ||
    workspaceParam === "wiki"
      ? workspaceParam
      : null;
  const { eventQuery, view, contexts, context, switchContext, workspaceLoading } = usePortal();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const displayName = portalIdentityProfile(view, context)?.displayName ?? "Speaker";
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase())
    .join("");

  async function selectContext(contextId: string) {
    setAccountMenuOpen(false);
    await switchContext(contextId);
  }

  return (
    <div className={styles.portalRoot}>
      <a className={styles.skipLink} href="#portal-content">
        Skip to portal content
      </a>
      <header className={styles.topbar}>
        <Link className={styles.brand} href={`/portal${eventQuery}`}>
          <span aria-hidden="true">OS</span>
          <strong>Open Sessionboard</strong>
        </Link>
        <div>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => void signOutAndRedirect()}
          >
            Sign out
          </button>
          <button
            className={styles.account}
            type="button"
            aria-haspopup="menu"
            aria-label="Account menu"
            aria-expanded={accountMenuOpen}
            aria-controls="portal-context-menu"
            onClick={() => setAccountMenuOpen((open) => !open)}
          >
            <span className={styles.avatar} aria-hidden="true">
              {initials || "SP"}
            </span>
            <span className={styles.accountCopy}>
              <strong>{displayName}</strong>
              <small>{context ? portalContextLabel(context) : "Speaker portal"}</small>
            </span>
          </button>
          {accountMenuOpen ? (
            <div id="portal-context-menu" role="menu" aria-label="Switch event">
              <p className={styles.srOnly}>Authorized event contexts</p>
              {contexts.length === 0 ? (
                <span role="status">No authorized events</span>
              ) : (
                contexts.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    role="menuitem"
                    aria-current={candidate.id === context?.id ? "true" : undefined}
                    disabled={workspaceLoading}
                    onClick={() => void selectContext(candidate.id)}
                  >
                    {portalContextLabel(candidate)}
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
      </header>
      <div className={styles.portalLayout}>
        {context ? (
          <nav className={styles.portalNav} aria-label="Speaker portal">
            <p className={styles.navLabel}>Your event</p>
            {navigation.map((item) => (
              <Link key={item.href} className={styles.navItem} href={`${item.href}${eventQuery}`}>
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
                {item.label === "Tasks" && (view?.outstandingTaskCount ?? 0) > 0 ? (
                  <span className={styles.navCount}>
                    {view?.outstandingTaskCount}
                    <span className={styles.srOnly}> outstanding tasks</span>
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>
        ) : null}
        <main id="portal-content" className={styles.portalMain} tabIndex={-1}>
          {workspaceSection ? <PortalWorkspace section={workspaceSection} /> : children}
        </main>
      </div>
    </div>
  );
}

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: Readonly<{
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}>) {
  return (
    <header className={styles.pageHeading}>
      <div>
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action ? <div className={styles.headingAction}>{action}</div> : null}
    </header>
  );
}

export function NoParticipantWorkspaceState() {
  return (
    <div className={styles.statePanel} role="status" aria-live="polite">
      <span className={styles.stateIcon} aria-hidden="true">
        ◇
      </span>
      <h1>No participant workspace</h1>
      <p>{noParticipantWorkspaceDescription}</p>
    </div>
  );
}

export function PortalContentState({ children }: Readonly<{ children: ReactNode }>) {
  const { error, loading, reload, view } = usePortal();
  if (loading && !view) {
    return (
      <div className={styles.statePanel} role="status" aria-live="polite">
        <span className={styles.spinner} aria-hidden="true" />
        <h1>Loading your speaker portal</h1>
        <p>Retrieving your submissions, profile, and tasks.</p>
      </div>
    );
  }
  if (error && !view) {
    return (
      <div className={styles.statePanel} role="alert">
        <span className={styles.stateIcon} aria-hidden="true">
          !
        </span>
        <h1>We could not load your portal</h1>
        <p>{error}</p>
        <button className={styles.primaryButton} type="button" onClick={() => void reload()}>
          Try again
        </button>
      </div>
    );
  }
  if (!view) {
    return <NoParticipantWorkspaceState />;
  }
  return <>{children}</>;
}

export function SubmissionStatusBadge({ status }: Readonly<{ status: PortalSubmissionStatus }>) {
  const presentation = submissionStatusPresentation(status);
  return (
    <span className={`${styles.badge} ${styles[`tone_${presentation.tone}`]}`}>
      <span aria-hidden="true" />
      {presentation.label}
    </span>
  );
}

export function TaskStatusBadge({ status }: Readonly<{ status: PortalTaskStatus }>) {
  const presentation = taskStatusPresentation(status);
  return (
    <span className={`${styles.badge} ${styles[`tone_${presentation.tone}`]}`}>
      <span aria-hidden="true" />
      {presentation.label}
    </span>
  );
}

export function InlineMutationError() {
  const { clearMutationError, mutationError } = usePortal();
  if (!mutationError) {
    return null;
  }
  return (
    <div className={styles.inlineError} role="alert">
      <p>{mutationError}</p>
      <button type="button" onClick={clearMutationError} aria-label="Dismiss error">
        ×
      </button>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: Readonly<{ title: string; description: string; action?: ReactNode }>) {
  return (
    <section className={styles.emptyState}>
      <span aria-hidden="true">◇</span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </section>
  );
}

export function Progress({ value, label }: Readonly<{ value: number; label: string }>) {
  return (
    <div className={styles.progressBlock}>
      <div className={styles.progressLabel}>
        <span>{label}</span>
        <strong>{value}%</strong>
      </div>
      <div
        className={styles.progressTrack}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-label={label}
      >
        <span style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function formatPortalDate(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return null;
  }
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
