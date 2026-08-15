"use client";

import {
  BookOpen,
  ChevronDown,
  ClipboardCheck,
  FileText,
  FolderOpen,
  Home,
  LayoutDashboard,
  Library,
  LogOut,
  UserRound,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { type ReactNode, useState } from "react";
import { ThemeToggle } from "@/components/product-shell/theme-toggle";
import { RoleWorkspaceShell } from "@/components/workspace/role-workspace-shell";
import { submissionStatusPresentation, taskStatusPresentation } from "./model";
import styles from "./portal.module.css";
import { portalContextLabel, usePortal } from "./portal-provider";
import type {
  PortalAssetState,
  PortalCapability,
  PortalSubmissionStatus,
  PortalTaskStatus,
} from "./types";

export const portalNavigation = [
  { href: "/portal", label: "Home", icon: Home },
  { href: "/portal/submissions", label: "Submissions", icon: FileText },
  { href: "/portal/tasks", label: "Requests & tasks", icon: ClipboardCheck },
  { href: "/portal/profile", label: "Profile", icon: UserRound },
  { href: "/portal?workspace=co-speakers", label: "Co-speakers", icon: UsersRound },
  { href: "/portal?workspace=files", label: "Uploaded files", icon: FolderOpen },
  { href: "/portal?workspace=resources", label: "Resources", icon: Library },
  { href: "/portal?workspace=wiki", label: "Wiki", icon: BookOpen },
] as const;

const noParticipantWorkspaceDescription =
  "Track your proposal in My submissions. Speaker tools unlock after an organizer accepts it.";

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

function portalNavigationHref(href: string, eventQuery: string): string {
  if (eventQuery.length === 0) return href;
  return href.includes("?") ? `${href}&${eventQuery.slice(1)}` : `${href}${eventQuery}`;
}

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

export function portalRouteAuthorized(input: {
  readonly pathname: string;
  readonly workspace: string | null;
  readonly submissionCount: number;
  readonly can: (capability: PortalCapability) => boolean;
}): boolean {
  const { pathname, workspace, can } = input;
  if (pathname === "/portal" && workspace === null) return true;
  if (pathname.startsWith("/portal/submissions")) return true;
  if (pathname === "/portal/tasks" || workspace === "tasks") return can("task-response");
  if (pathname === "/portal/profile") return can("profile-self");
  if (workspace === "co-speakers") return can("roster-manage");
  if (workspace === "files") return can("asset-read");
  if (workspace === "resources" || workspace === "wiki") return can("resource-read");
  return true;
}

export function portalContentMode(input: {
  readonly loading: boolean;
  readonly error: string | null;
  readonly hasView: boolean;
  readonly routeAuthorized: boolean;
}): "children" | "no-access" {
  if (input.loading || (input.error !== null && !input.hasView)) return "children";
  return input.routeAuthorized ? "children" : "no-access";
}

export function PortalFrame({ children }: Readonly<{ children: ReactNode }>) {
  const {
    authorizedParticipantIds,
    eventQuery,
    view,
    contexts,
    context,
    selectedParticipantId,
    switchContext,
    switchParticipant,
    loading,
    error,
    can,
  } = usePortal();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const displayName =
    view?.profiles.find((candidate) => candidate.participantId === context?.primaryParticipantId)
      ?.displayName ?? "Speaker";
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase())
    .join("");
  const visibleNavigation = portalNavigation.filter((item) => {
    if (item.href === "/portal" || item.href === "/portal/submissions") return true;
    if (item.href === "/portal/tasks") return can("task-response");
    if (item.href === "/portal/profile") return can("profile-self");
    if (item.href.includes("workspace=co-speakers")) return can("roster-manage");
    if (item.href.includes("workspace=files")) return can("asset-read");
    if (item.href.includes("workspace=resources") || item.href.includes("workspace=wiki")) {
      return can("resource-read");
    }
    return false;
  });
  const workspace = searchParams.get("workspace");
  const routeAuthorized = portalRouteAuthorized({
    pathname,
    workspace,
    submissionCount: context?.submissionIds.length ?? 0,
    can,
  });
  const contentMode = portalContentMode({
    loading,
    error,
    hasView: view !== null,
    routeAuthorized,
  });
  const navigationGroups =
    context === null
      ? []
      : [
          {
            label: "Your event",
            items: visibleNavigation.map((item) => ({
              badge:
                item.href === "/portal/tasks" && (view?.outstandingTaskCount ?? 0) > 0
                  ? view?.outstandingTaskCount
                  : undefined,
              current: portalNavigationItemActive(item.href, pathname, workspace),
              href: portalNavigationHref(item.href, eventQuery),
              icon: item.icon,
              label: item.label,
            })),
          },
        ];
  const currentPageLabel =
    visibleNavigation.find((item) => portalNavigationItemActive(item.href, pathname, workspace))
      ?.label ?? "Participant workspace";

  async function selectContext(contextId: string) {
    setAccountMenuOpen(false);
    await switchContext(contextId);
  }
  function selectParticipant(participantId: string) {
    if (switchParticipant(participantId)) {
      setAccountMenuOpen(false);
    }
  }

  return (
    <RoleWorkspaceShell
      brandHref={`/portal${eventQuery}`}
      className={styles.portalRoot}
      contentClassName={styles.portalMain}
      contextLabel={context ? portalContextLabel(context) : "Submission access"}
      currentPageLabel={currentPageLabel}
      footer={
        <div className={styles.accountArea}>
          <button
            className={styles.accountTrigger}
            type="button"
            aria-haspopup="menu"
            aria-label="Switch event or participant"
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
            <ChevronDown aria-hidden="true" size={14} />
          </button>
          {accountMenuOpen ? (
            <div
              id="portal-context-menu"
              className={styles.contextMenu}
              role="menu"
              aria-label="Switch event or participant"
            >
              <p className={styles.contextMenuLabel}>Event</p>
              {contexts.length === 0 ? (
                <span role="status">No authorized events</span>
              ) : (
                contexts.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={candidate.id === context?.id}
                    disabled={loading}
                    onClick={() => void selectContext(candidate.id)}
                  >
                    {portalContextLabel(candidate)}
                  </button>
                ))
              )}
              {authorizedParticipantIds.length > 0 ? (
                <>
                  <p className={styles.contextMenuLabel}>Participant</p>
                  {authorizedParticipantIds.map((participantId, index) => (
                    <button
                      key={participantId}
                      type="button"
                      role="menuitemradio"
                      aria-checked={participantId === selectedParticipantId}
                      disabled={loading}
                      onClick={() => selectParticipant(participantId)}
                    >
                      {participantId === selectedParticipantId
                        ? displayName
                        : `Participant ${index + 1}`}
                      <small>{participantId}</small>
                    </button>
                  ))}
                </>
              ) : (
                <p className={styles.contextMenuHint}>
                  Submission access is active. Participant tools unlock after the event links your
                  speaker record.
                </p>
              )}
              <Link href="/work" role="menuitem">
                <LayoutDashboard aria-hidden="true" size={14} />
                All work
              </Link>
              <Link href={`/portal/profile${eventQuery}`} role="menuitem">
                <UserRound aria-hidden="true" size={14} />
                Profile
              </Link>
              <button type="button" role="menuitem" onClick={() => void signOutAndRedirect()}>
                <LogOut aria-hidden="true" size={14} />
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      }
      headerActions={<ThemeToggle />}
      mainId="portal-content"
      navigationGroups={navigationGroups}
      navigationLabel="Participant workspace navigation"
      roleLabel="Participant workspace"
      skipLabel="Skip to participant content"
      workspace="participant"
    >
      {contentMode === "children" ? (
        children
      ) : (
        <section className={styles.statePanel} role="alert">
          <h1>This workspace is not available</h1>
          <p>Your account does not have access to this speaker workspace for the selected event.</p>
          <Link href={portalNavigationHref("/portal/submissions", eventQuery)}>
            View your submissions
          </Link>
        </section>
      )}
    </RoleWorkspaceShell>
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
      <h1>Your speaker workspace is not open yet</h1>
      <p>{noParticipantWorkspaceDescription}</p>
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
        <h1>Loading your speaker portal</h1>
        <p>Retrieving your sessions, profile, and tasks.</p>
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
  return {
    pending_upload: "Processing upload",
    ready: "Uploaded",
    rejected: "Upload failed",
  }[state];
}
