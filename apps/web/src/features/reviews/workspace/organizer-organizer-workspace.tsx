"use client";

import { useRef, useState } from "react";
import type { OrganizationMember } from "../../members/api";
import { seedWithAuthoritativePlan } from "./api-seed-with-authoritative-plan";
import { loadOrganizerData } from "./organizer-load-organizer-data";
import { OrganizerDetailStatus } from "./organizer-organizer-detail-status";
import type { ReviewPlanSeed } from "./organizer-review-plan-seed";
import { OrganizerWorkspaceView } from "./organizer-view-organizer-workspace-view";

interface AuthoritativeSeedOverride {
  readonly ownerKey: string;
  readonly seed: ReviewPlanSeed;
}

interface OrganizerDetailState {
  readonly ownerKey: string;
  readonly seedVersion: number;
  readonly loading: boolean;
  readonly error: string | null;
}

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
  const ownerKey = JSON.stringify([organizationId ?? null, seed.eventId, seed.planId]);
  const [authoritativeSeedOverride, setAuthoritativeSeedOverride] =
    useState<AuthoritativeSeedOverride | null>(null);
  const authoritativeSeed =
    authoritativeSeedOverride?.ownerKey === ownerKey &&
    authoritativeSeedOverride.seed.version >= seed.version
      ? authoritativeSeedOverride.seed
      : seed;
  const [detailState, setDetailState] = useState<OrganizerDetailState>(() => ({
    ownerKey,
    seedVersion: seed.version,
    loading: false,
    error: null,
  }));
  const detailLoading =
    detailState.ownerKey === ownerKey &&
    detailState.seedVersion === seed.version &&
    detailState.loading;
  const detailError =
    detailState.ownerKey === ownerKey && detailState.seedVersion === seed.version
      ? detailState.error
      : null;
  const refreshSequenceRef = useRef<{
    readonly ownerKey: string;
    readonly seedVersion: number;
    readonly sequence: number;
  }>({
    ownerKey,
    seedVersion: seed.version,
    sequence: 0,
  });

  function beginRefresh(): number {
    const sequence =
      refreshSequenceRef.current.ownerKey === ownerKey &&
      refreshSequenceRef.current.seedVersion === seed.version
        ? refreshSequenceRef.current.sequence + 1
        : 1;
    refreshSequenceRef.current = { ownerKey, seedVersion: seed.version, sequence };
    return sequence;
  }

  function ownsRefresh(sequence: number): boolean {
    return (
      refreshSequenceRef.current.ownerKey === ownerKey &&
      refreshSequenceRef.current.seedVersion === seed.version &&
      refreshSequenceRef.current.sequence === sequence
    );
  }

  async function refreshAuthoritativeSeed(): Promise<void> {
    const sequence = beginRefresh();
    setDetailState({ ownerKey, seedVersion: seed.version, loading: true, error: null });
    try {
      const nextSeed = await loadOrganizerData(seed.eventId, baseUrl, seed.planId);
      if (ownsRefresh(sequence)) {
        setAuthoritativeSeedOverride({ ownerKey, seed: nextSeed });
      }
    } catch (reason: unknown) {
      if (ownsRefresh(sequence)) {
        setDetailState({
          ownerKey,
          seedVersion: seed.version,
          loading: false,
          error:
            reason instanceof Error ? reason.message : "The review details could not be loaded.",
        });
      }
      return;
    } finally {
      if (ownsRefresh(sequence)) {
        setDetailState((current) =>
          current.ownerKey === ownerKey ? { ...current, loading: false } : current,
        );
      }
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
        key={ownerKey}
        seed={authoritativeSeed}
        baseUrl={baseUrl}
        organizationId={organizationId}
        reviewerMembers={reviewerMembers}
        reviewerMembersLoading={reviewerMembersLoading}
        reviewerMembersError={reviewerMembersError}
        onAuthoritativePlan={(plan) =>
          setAuthoritativeSeedOverride((current) => ({
            ownerKey,
            seed: seedWithAuthoritativePlan(
              current?.ownerKey === ownerKey ? current.seed : authoritativeSeed,
              plan,
            ),
          }))
        }
        onAssignmentsPersisted={refreshAuthoritativeSeed}
      />
    </>
  );
}
