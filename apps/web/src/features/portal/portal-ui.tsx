"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { submissionStatusPresentation, taskStatusPresentation } from "./model";
import styles from "./portal.module.css";
import { usePortal } from "./portal-provider";
import type { PortalAssetState, PortalSubmissionStatus, PortalTaskStatus } from "./types";

export { PortalFrame } from "./portal-shell";
export { portalContentMode, portalRouteAuthorized, signOutAndRedirect } from "./portal-shell-model";

/** Legacy route inventory retained for callers that still inspect the portal destinations. */
export const portalNavigation = [
  { href: "/portal", label: "Home", icon: "⌂" },
  { href: "/portal/submissions", label: "Submissions", icon: "▤" },
  { href: "/portal/tasks", label: "Requests & tasks", icon: "✓" },
  { href: "/portal/profile", label: "Profile", icon: "◉" },
  { href: "/portal?workspace=co-speakers", label: "Co-speakers", icon: "◎" },
  { href: "/portal?workspace=files", label: "Uploaded files", icon: "▱" },
  { href: "/portal?workspace=resources", label: "Resources", icon: "◇" },
  { href: "/portal?workspace=wiki", label: "Wiki", icon: "◫" },
] as const;

export function portalNavigationItemActive(
  href: string,
  pathname: string,
  workspace: string | null,
): boolean {
  const workspaceMatch = href.match(/[?&]workspace=([^&]+)/);
  if (workspaceMatch?.[1] !== undefined) {
    return pathname === "/portal" && workspace === workspaceMatch[1];
  }
  if (href === "/portal") return pathname === "/portal" && workspace === null;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: Readonly<{ eyebrow?: string; title: string; description: string; action?: ReactNode }>) {
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
      <h1>Your speaker workspace is not open yet</h1>
      <p>
        Track your proposal in My submissions. Speaker tools unlock after an organizer accepts it.
      </p>
      <Link href="/portal/submissions">View my submissions</Link>
    </div>
  );
}

export function PortalContentState({ children }: Readonly<{ children: ReactNode }>) {
  const { error, loading, reload, view } = usePortal();
  if (loading && !view) {
    return (
      <div className={styles.statePanel} role="status" aria-live="polite">
        <span className={styles.spinner} aria-hidden="true" />
        <h1>Loading your participant workspace</h1>
        <p>Retrieving your events and submissions.</p>
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
  if (!view) return <NoParticipantWorkspaceState />;
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
  if (!mutationError) return null;
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
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(
    date,
  );
}

export function formatPortalFileSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) return "Unknown size";
  if (sizeBytes < 1_024) return `${sizeBytes.toLocaleString()} B`;
  const units = ["KiB", "MiB", "GiB"] as const;
  let value = sizeBytes;
  let unit: (typeof units)[number] = units[0];
  for (const candidate of units) {
    unit = candidate;
    value /= 1_024;
    if (value < 1_024 || candidate === units.at(-1)) break;
  }
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}`;
}

export function portalAssetStateLabel(state: PortalAssetState): string {
  return { pending_upload: "Processing upload", ready: "Uploaded", rejected: "Upload failed" }[
    state
  ];
}
