"use client";

import Link from "next/link";
import { Button } from "../../../components/ui/button";
import styles from ".././review-workspace.module.css";
import { configuredOrganizationId } from "./model-configured-organization-id";
import type { ReviewWorkspaceMode } from "./workspace-review-workspace-mode";

export function ReviewNavigation({
  eventId,
  mode,
  organizationId,
}: Readonly<{ eventId?: string; mode: ReviewWorkspaceMode; organizationId?: string | undefined }>) {
  if (mode === "evaluator") return null;
  if (eventId === undefined) return null;
  const resolvedOrganizationId = configuredOrganizationId(organizationId);
  if (resolvedOrganizationId === null) return null;
  const reviewBase = `/admin/organizations/${encodeURIComponent(resolvedOrganizationId)}/events/${encodeURIComponent(eventId)}/reviews`;
  return (
    <nav className={styles.reviewNavigation} aria-label="Review workspace">
      <Button asChild size="sm">
        <Link href={reviewBase} aria-current="page">
          Review plan
        </Link>
      </Button>
      {resolvedOrganizationId === null ? null : (
        <Button asChild size="sm" variant="ghost">
          <Link href={`/admin/organizations/${encodeURIComponent(resolvedOrganizationId)}/members`}>
            Invite reviewers
          </Link>
        </Button>
      )}
    </nav>
  );
}
