"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { submissionStatusPresentation, taskStatusPresentation } from "./model";
import { usePortal } from "./portal-provider";
import styles from "./portal.module.css";
import type { PortalSubmissionStatus, PortalTaskStatus } from "./types";

const navigation = [
  { href: "/portal", label: "Home", icon: "⌂" },
  { href: "/portal/submissions", label: "Submissions", icon: "▤" },
  { href: "/portal/profile", label: "Profile", icon: "◉" },
  { href: "/portal/tasks", label: "Tasks", icon: "✓" },
] as const;

export function PortalFrame({ children }: Readonly<{ children: ReactNode }>) {
  const { eventQuery, view } = usePortal();
  const displayName = view?.profiles[0]?.displayName ?? "Speaker";
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase())
    .join("");

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
        <div className={styles.account}>
          <span className={styles.avatar} aria-hidden="true">
            {initials || "SP"}
          </span>
          <span className={styles.accountCopy}>
            <strong>{displayName}</strong>
            <small>Speaker portal</small>
          </span>
        </div>
      </header>
      <div className={styles.portalLayout}>
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
        <main id="portal-content" className={styles.portalMain} tabIndex={-1}>
          {children}
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
