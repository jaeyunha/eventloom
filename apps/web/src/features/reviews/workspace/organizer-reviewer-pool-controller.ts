"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createMemberApi,
  type MemberApi,
  MemberApiError,
  type OrganizationMember,
  type ReviewerPool,
} from "../../members/api";
import { browserSameOrigin } from "./model-browser-same-origin";
import { buildReviewerPoolInput, type ReviewerPoolDraft } from "./organizer-reviewer-pool-panel";

interface OrganizerReviewerPoolOptions {
  readonly baseUrl: string;
  readonly organizationId?: string | undefined;
  readonly eventId: string;
  readonly roundId: string;
  readonly reviewers: readonly OrganizationMember[];
  readonly defaultMaxAssignments: number;
  readonly onSaved?: (() => Promise<void>) | undefined;
}

function poolDraft(pool: ReviewerPool | null): ReviewerPoolDraft {
  return Object.fromEntries(
    pool?.grants.map((grant) => [grant.reviewerId, grant.maxAssignments]) ?? [],
  );
}

function reviewerPoolError(reason: unknown): string {
  if (reason instanceof MemberApiError && reason.status === 409) {
    return "This review team changed in another session. Reload the team before saving again.";
  }
  if (reason instanceof MemberApiError && reason.status === 403) {
    return "Your organization role cannot change this review team.";
  }
  return reason instanceof Error && reason.message.trim().length > 0
    ? reason.message
    : "The review team could not be loaded.";
}

export function useOrganizerReviewerPool({
  baseUrl,
  organizationId,
  eventId,
  roundId,
  reviewers,
  defaultMaxAssignments,
  onSaved,
}: OrganizerReviewerPoolOptions) {
  const resolvedOrganizationId = organizationId?.trim() ?? "";
  const memberApi = useMemo<MemberApi | null>(() => {
    if (!resolvedOrganizationId) return null;
    try {
      return createMemberApi(baseUrl || browserSameOrigin(), resolvedOrganizationId);
    } catch {
      return null;
    }
  }, [baseUrl, resolvedOrganizationId]);
  const [pool, setPool] = useState<ReviewerPool | null>(null);
  const [draft, setDraft] = useState<ReviewerPoolDraft>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      if (memberApi === null || !eventId.trim() || !roundId.trim()) {
        setPool(null);
        setDraft({});
        setError("The organization review-team service is not configured.");
        return;
      }
      setLoading(true);
      setError(null);
      setMessage(null);
      setPool(null);
      setDraft({});
      try {
        const nextPool = await memberApi.getReviewerPool(eventId, roundId, signal);
        if (signal?.aborted) return;
        setPool(nextPool);
        setDraft(poolDraft(nextPool));
      } catch (reason: unknown) {
        if (!signal?.aborted) setError(reviewerPoolError(reason));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [eventId, memberApi, roundId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  function changeReviewer(reviewerId: string, selected: boolean): void {
    if (!reviewers.some((reviewer) => reviewer.userId === reviewerId)) return;
    setDraft((current) => {
      if (!selected) {
        const next = { ...current };
        delete next[reviewerId];
        return next;
      }
      const previous = pool?.grants.find((grant) => grant.reviewerId === reviewerId);
      return {
        ...current,
        [reviewerId]: previous?.maxAssignments ?? Math.max(1, defaultMaxAssignments),
      };
    });
    setMessage(null);
  }

  function changeMaxAssignments(reviewerId: string, value: number): void {
    if (draft[reviewerId] === undefined) return;
    const maxAssignments = Number.isSafeInteger(value) && value > 0 ? Math.min(value, 10_000) : 1;
    setDraft((current) => ({ ...current, [reviewerId]: maxAssignments }));
    setMessage(null);
  }

  async function save(): Promise<void> {
    if (memberApi === null || !eventId.trim() || !roundId.trim()) {
      setError("The organization review-team service is not configured.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const nextPool = await memberApi.setReviewerPool(
        eventId,
        roundId,
        buildReviewerPoolInput(draft, pool?.version),
      );
      setPool(nextPool);
      setDraft(poolDraft(nextPool));
      setMessage("Review team saved. Assignment candidates now match this round.");
      await onSaved?.();
    } catch (reason: unknown) {
      setError(reviewerPoolError(reason));
    } finally {
      setSaving(false);
    }
  }

  return {
    pool,
    draft,
    loading,
    saving,
    error,
    message,
    changeReviewer,
    changeMaxAssignments,
    save,
    reload: () => void load(),
  };
}
