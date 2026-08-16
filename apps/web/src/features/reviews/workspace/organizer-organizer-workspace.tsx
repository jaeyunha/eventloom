"use client";

import { useEffect, useRef, useState } from "react";
import type { OrganizationMember } from "../../members/api";
import { seedWithAuthoritativePlan } from "./api-seed-with-authoritative-plan";
import { loadOrganizerData } from "./organizer-load-organizer-data";
import { OrganizerDetailStatus } from "./organizer-organizer-detail-status";
import type { ReviewPlanSeed } from "./organizer-review-plan-seed";
import { OrganizerWorkspaceView } from "./organizer-view-organizer-workspace-view";

export function OrganizerWorkspace({
  seed,
  baseUrl,
  organizationId,
  reviewerMembers,
  reviewerMembersLoading,
  reviewerMembersError,
}: Readonly<{
  seed: ReviewPlanSeed;
  baseUrl: string;
  organizationId?: string | undefined;
  reviewerMembers: readonly OrganizationMember[];
  reviewerMembersLoading: boolean;
  reviewerMembersError: string | null;
}>) {
  const [authoritativeSeed, setAuthoritativeSeed] = useState(seed);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const refreshSequenceRef = useRef(0);

  useEffect(() => {
    const sequence = refreshSequenceRef.current + 1;
    refreshSequenceRef.current = sequence;
    try {
      setAuthoritativeSeed(seed);
      setDetailError(null);
    } finally {
      setDetailLoading((current) => (refreshSequenceRef.current === sequence ? false : current));
    }
  }, [seed]);

  async function refreshAuthoritativeSeed(): Promise<void> {
    const sequence = refreshSequenceRef.current + 1;
    refreshSequenceRef.current = sequence;
    setDetailLoading(true);
    setDetailError(null);
    try {
      const nextSeed = await loadOrganizerData(seed.eventId, baseUrl, seed.planId);
      if (refreshSequenceRef.current === sequence) {
        setAuthoritativeSeed(nextSeed);
      }
    } catch (reason: unknown) {
      if (refreshSequenceRef.current === sequence) {
        setDetailError(
          reason instanceof Error ? reason.message : "The review details could not be loaded.",
        );
      }
    } finally {
      setDetailLoading((current) => (refreshSequenceRef.current === sequence ? false : current));
    }
  }

  return (
    <>
      <OrganizerDetailStatus
        loading={detailLoading}
        error={detailError}
        onRetry={() => void refreshAuthoritativeSeed()}
      />
      <OrganizerWorkspaceView
        seed={authoritativeSeed}
        baseUrl={baseUrl}
        organizationId={organizationId}
        reviewerMembers={reviewerMembers}
        reviewerMembersLoading={reviewerMembersLoading}
        reviewerMembersError={reviewerMembersError}
        onAuthoritativePlan={(plan) =>
          setAuthoritativeSeed((current) => seedWithAuthoritativePlan(current, plan))
        }
        onAssignmentsPersisted={refreshAuthoritativeSeed}
      />
    </>
  );
}
