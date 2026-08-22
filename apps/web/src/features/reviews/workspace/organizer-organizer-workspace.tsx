"use client";

import { useRef, useState } from "react";
import type { OrganizationMember } from "../../members/api";
import { seedWithAuthoritativePlan } from "./api-seed-with-authoritative-plan";
import { loadOrganizerData } from "./organizer-load-organizer-data";
import { OrganizerDetailStatus } from "./organizer-organizer-detail-status";
import type { ReviewPlanSeed } from "./organizer-review-plan-seed";
import { OrganizerWorkspaceView } from "./organizer-view-organizer-workspace-view";

interface AuthoritativeSeedOverride {
  readonly sourceOwnerKey: string;
  readonly seed: ReviewPlanSeed;
}

interface OrganizerDetailState {
  readonly ownerKey: string;
  readonly seedVersion: number;
  readonly loading: boolean;
  readonly error: string | null;
}

export function prefersAuthoritativePlan(
  current: Pick<ReviewPlanSeed, "planId" | "version">,
  candidate: Pick<ReviewPlanSeed, "planId" | "version">,
): boolean {
  return candidate.planId !== current.planId || candidate.version >= current.version;
}

export function shouldApplyAuthoritativePlan(
  current: Pick<ReviewPlanSeed, "planId" | "version">,
  sourcePlanId: string,
  candidate: Pick<ReviewPlanSeed, "planId" | "version">,
): boolean {
  return current.planId === sourcePlanId && prefersAuthoritativePlan(current, candidate);
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
  const sourceOwnerKey = JSON.stringify([organizationId ?? null, seed.eventId, seed.planId]);
  const [authoritativeSeedOverride, setAuthoritativeSeedOverride] =
    useState<AuthoritativeSeedOverride | null>(null);
  const authoritativeSeedOverrideForSource =
    authoritativeSeedOverride?.sourceOwnerKey === sourceOwnerKey ? authoritativeSeedOverride : null;
  const authoritativeSeed =
    authoritativeSeedOverrideForSource !== null &&
    prefersAuthoritativePlan(seed, authoritativeSeedOverrideForSource.seed)
      ? authoritativeSeedOverrideForSource.seed
      : seed;
  const ownerKey = JSON.stringify([
    organizationId ?? null,
    authoritativeSeed.eventId,
    authoritativeSeed.planId,
  ]);
  const [detailState, setDetailState] = useState<OrganizerDetailState>(() => ({
    ownerKey,
    seedVersion: authoritativeSeed.version,
    loading: false,
    error: null,
  }));
  const detailLoading =
    detailState.ownerKey === ownerKey &&
    detailState.seedVersion === authoritativeSeed.version &&
    detailState.loading;
  const detailError =
    detailState.ownerKey === ownerKey && detailState.seedVersion === authoritativeSeed.version
      ? detailState.error
      : null;
  const refreshSequenceRef = useRef<{
    readonly ownerKey: string;
    readonly seedVersion: number;
    readonly sequence: number;
  }>({
    ownerKey,
    seedVersion: authoritativeSeed.version,
    sequence: 0,
  });
  const activeSeedRef = useRef({ ownerKey, seedVersion: authoritativeSeed.version });
  activeSeedRef.current = { ownerKey, seedVersion: authoritativeSeed.version };

  function beginRefresh(): number {
    const sequence =
      refreshSequenceRef.current.ownerKey === ownerKey &&
      refreshSequenceRef.current.seedVersion === authoritativeSeed.version
        ? refreshSequenceRef.current.sequence + 1
        : 1;
    refreshSequenceRef.current = { ownerKey, seedVersion: authoritativeSeed.version, sequence };
    return sequence;
  }

  function ownsRefresh(sequence: number): boolean {
    return (
      refreshSequenceRef.current.ownerKey === ownerKey &&
      refreshSequenceRef.current.seedVersion === authoritativeSeed.version &&
      refreshSequenceRef.current.sequence === sequence &&
      activeSeedRef.current.ownerKey === ownerKey &&
      activeSeedRef.current.seedVersion === authoritativeSeed.version
    );
  }

  async function refreshAuthoritativeSeed(): Promise<void> {
    const sequence = beginRefresh();
    setDetailState({
      ownerKey,
      seedVersion: authoritativeSeed.version,
      loading: true,
      error: null,
    });
    try {
      const nextSeed = await loadOrganizerData(
        authoritativeSeed.eventId,
        baseUrl,
        authoritativeSeed.planId,
      );
      if (ownsRefresh(sequence)) {
        setAuthoritativeSeedOverride((current) => {
          const currentSeed = current?.sourceOwnerKey === sourceOwnerKey ? current.seed : seed;
          if (!shouldApplyAuthoritativePlan(currentSeed, authoritativeSeed.planId, nextSeed)) {
            return current;
          }
          return { sourceOwnerKey, seed: nextSeed };
        });
      }
    } catch (reason: unknown) {
      if (ownsRefresh(sequence)) {
        setDetailState({
          ownerKey,
          seedVersion: authoritativeSeed.version,
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
          setAuthoritativeSeedOverride((current) => {
            const currentSeed = current?.sourceOwnerKey === sourceOwnerKey ? current.seed : seed;
            if (
              !shouldApplyAuthoritativePlan(currentSeed, authoritativeSeed.planId, {
                planId: plan.id,
                version: plan.version,
              })
            ) {
              return current;
            }
            return {
              sourceOwnerKey,
              seed: seedWithAuthoritativePlan(currentSeed, plan),
            };
          })
        }
        onAssignmentsPersisted={refreshAuthoritativeSeed}
      />
    </>
  );
}
