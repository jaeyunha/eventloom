import { CalendarDays, LogOut } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { organizationEventsHref } from "./admin-navigation";
import styles from "./admin-shell.module.css";

export interface AdminShellAccountProps {
  readonly availableOrganizationIds: readonly string[];
  readonly currentOrganizationId: string | null;
  readonly eventScoped: boolean;
  readonly onSelectOrganization: (organizationId: string) => void;
  readonly onSignOut: () => Promise<void>;
}

export function AdminShellAccount({
  availableOrganizationIds,
  currentOrganizationId,
  eventScoped,
  onSelectOrganization,
  onSignOut,
}: AdminShellAccountProps) {
  return (
    <div className={styles.organizationCard}>
      <div
        className={styles.organizationIdentity}
        title={`Organization workspace: ${currentOrganizationId ?? "Not selected"}`}
      >
        <div className={styles.organizationAvatar} aria-hidden="true">
          <span>{currentOrganizationId?.slice(0, 1).toUpperCase() ?? "O"}</span>
        </div>
        <div className={styles.organizationCopy}>
          <label htmlFor="organizer-organization">
            {eventScoped ? "Organization workspace" : "Current workspace"}
          </label>
          {availableOrganizationIds.length > 1 && currentOrganizationId !== null ? null : (
            <strong>{currentOrganizationId ?? "Workspace not selected"}</strong>
          )}
        </div>
      </div>
      {availableOrganizationIds.length > 1 && currentOrganizationId !== null ? (
        <select
          className={styles.organizationSelect}
          id="organizer-organization"
          value={currentOrganizationId}
          onChange={(event) => onSelectOrganization(event.currentTarget.value)}
        >
          {availableOrganizationIds.map((organizationId) => (
            <option key={organizationId} value={organizationId}>
              {organizationId}
            </option>
          ))}
        </select>
      ) : null}
      {!eventScoped ? (
        <Button asChild className={styles.organizationAction} size="sm" variant="ghost">
          <Link
            aria-label="View all events"
            href={
              currentOrganizationId === null
                ? "/admin/events"
                : organizationEventsHref(currentOrganizationId)
            }
            title="View all events"
          >
            <CalendarDays aria-hidden="true" />
            <span>View all events</span>
          </Link>
        </Button>
      ) : null}
      <Button
        aria-label="Sign out"
        className={`${styles.organizationAction} ${styles.signOutAction}`}
        size="sm"
        title="Sign out"
        type="button"
        variant="ghost"
        onClick={() => void onSignOut()}
      >
        <LogOut aria-hidden="true" />
        <span>Sign out</span>
      </Button>
    </div>
  );
}
