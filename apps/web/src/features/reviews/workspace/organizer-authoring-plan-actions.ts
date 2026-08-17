"use client";

import type { ApiPlan } from "./api-api-plan";
import { evaluationRequest } from "./model-evaluation-request";
import type { OrganizerRoundActions } from "./organizer-authoring-round-actions";
import {
  clearRetainedRevisionSync,
  readRetainedRevisionSync,
  retainRevisionSync,
} from "./organizer-revision-sync-token";
import { reviewTemporalDraftError } from "./review-temporal-policy";

export function useOrganizerPlanActions(scope: OrganizerRoundActions) {
  const {
    seed,
    baseUrl,
    reviewerMembersError,
    onAuthoritativePlan,
    name,
    setName,
    planClosesAt,
    setPlanClosesAt,
    blindReview,
    setBlindReview,
    reviewsPerSubmission,
    setReviewsPerSubmission,
    maxAssignmentsPerReviewer,
    setMaxAssignmentsPerReviewer,
    fieldIds,
    setFieldIds,
    fileIds,
    setFileIds,
    rounds,
    setRounds,
    setMessage,
    version,
    setVersion,
    status,
    setStatus,
    setBusy,
    reviewerIdSet,
    reviewerDirectoryReady,
    unresolvedTemporalFields,
  } = scope;
  async function saveDraft(): Promise<void> {
    const temporalError = reviewTemporalDraftError(
      unresolvedTemporalFields,
      rounds.map((round) => round.id),
    );
    if (temporalError !== null) {
      setMessage(temporalError);
      return;
    }
    const poolsConfigured = rounds.some(
      (round) => (round.reviewerPool?.reviewerIds.length ?? 0) > 0,
    );
    if (poolsConfigured && !reviewerDirectoryReady) {
      setMessage(
        reviewerMembersError ??
          "Load the active, verified organization reviewers before saving reviewer pools.",
      );
      return;
    }
    const invalidPoolReviewer = rounds
      .flatMap((round) => round.reviewerPool?.reviewerIds ?? [])
      .find((reviewerId) => !reviewerIdSet.has(reviewerId));
    if (invalidPoolReviewer !== undefined) {
      setMessage(
        `Reviewer ${invalidPoolReviewer} is not an active, verified member of this organization.`,
      );
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const updated = await evaluationRequest<ApiPlan>(
        baseUrl,
        `/plans/${encodeURIComponent(seed.planId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            expectedVersion: version,
            closesAt: planClosesAt.trim().length === 0 ? null : planClosesAt,
            name: name.trim(),
            blindReview: blindReview || rounds.some((round) => round.blindReview === true),
            assignmentRule: {
              reviewsPerSubmission,
              maxAssignmentsPerReviewer,
              trackFilter: null,
              autoDistribute: false,
            },
            rounds,
            reviewerProjection: {
              fieldIds: fieldIds
                .split(",")
                .map((value) => value.trim())
                .filter((value) => value.length > 0),
              fileIds: fileIds
                .split(",")
                .map((value) => value.trim())
                .filter((value) => value.length > 0),
            },
          }),
        },
      );
      setMessage("Draft saved.");
      setRounds(updated.rounds);
      setName(updated.name);
      setPlanClosesAt(updated.closesAt ?? "");
      setReviewsPerSubmission(updated.assignmentRule.reviewsPerSubmission);
      setMaxAssignmentsPerReviewer(updated.assignmentRule.maxAssignmentsPerReviewer);
      setFieldIds(updated.reviewerProjection?.fieldIds?.join(", ") ?? "");
      setFileIds(updated.reviewerProjection?.fileIds?.join(", ") ?? "");
      setVersion(updated.version);
      setBlindReview(updated.blindReview);
      setStatus(updated.status);
      onAuthoritativePlan?.(updated);
    } catch (reason: unknown) {
      setMessage(reason instanceof Error ? reason.message : "The plan draft could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function saveSchedule(): Promise<void> {
    if (status !== "open") return;
    const temporalError = reviewTemporalDraftError(unresolvedTemporalFields);
    if (temporalError !== null) {
      setMessage(temporalError);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const desiredClosesAt = planClosesAt.trim().length === 0 ? null : planClosesAt;
      let currentVersion = version;
      let retained = readRetainedRevisionSync(seed);
      if (retained !== null && currentVersion === retained.expectedVersion + 1) {
        const recovered = await evaluationRequest<ApiPlan>(
          baseUrl,
          `/plans/${encodeURIComponent(seed.planId)}/reconcile-revision-family`,
          {
            method: "POST",
            body: JSON.stringify({
              expectedVersion: currentVersion,
              revisionSyncToken: retained.token,
            }),
          },
        );
        clearRetainedRevisionSync(seed);
        setPlanClosesAt(recovered.closesAt ?? "");
        setVersion(recovered.version);
        onAuthoritativePlan?.(recovered);
        currentVersion = recovered.version;
        retained = null;
        const recoveredMatches =
          desiredClosesAt === null
            ? recovered.closesAt === null
            : recovered.closesAt !== null &&
              Date.parse(desiredClosesAt) === Date.parse(recovered.closesAt);
        if (recoveredMatches) {
          setMessage("Review closing date saved.");
          return;
        }
      }
      const revisionSyncToken = retained?.token ?? crypto.randomUUID();
      retainRevisionSync(seed, { expectedVersion: currentVersion, token: revisionSyncToken });
      const updated = await evaluationRequest<ApiPlan>(
        baseUrl,
        `/plans/${encodeURIComponent(seed.planId)}/schedule`,
        {
          method: "PATCH",
          body: JSON.stringify({
            expectedVersion: currentVersion,
            closesAt: desiredClosesAt,
            revisionSyncToken,
          }),
        },
      );
      clearRetainedRevisionSync(seed);
      setPlanClosesAt(updated.closesAt ?? "");
      setVersion(updated.version);
      setStatus(updated.status);
      onAuthoritativePlan?.(updated);
      setMessage("Review closing date saved.");
    } catch (reason: unknown) {
      setMessage(
        reason instanceof Error ? reason.message : "The review closing date could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return { ...scope, saveDraft, saveSchedule };
}
export type OrganizerPlanActions = ReturnType<typeof useOrganizerPlanActions>;
