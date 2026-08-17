"use client";

import type { ApiPlan } from "./api-api-plan";
import { evaluationRequest } from "./model-evaluation-request";
import type { OrganizerAssignmentActions } from "./organizer-authoring-assignment-actions";
import {
  clearRetainedRevisionSync,
  readRetainedRevisionSync,
  retainRevisionSync,
} from "./organizer-revision-sync-token";
import { reviseEvaluationPlan } from "./organizer-revise-evaluation-plan";

export function useOrganizerLifecycleActions(scope: OrganizerAssignmentActions) {
  const {
    seed,
    baseUrl,
    onAuthoritativePlan,
    setName,
    setPlanClosesAt,
    setBlindReview,
    setReviewsPerSubmission,
    setMaxAssignmentsPerReviewer,
    setFieldIds,
    setFileIds,
    setRounds,
    setMessage,
    version,
    setVersion,
    setStatus,
    setBusy,
  } = scope;

  function applyPlan(updated: ApiPlan): void {
    setRounds(updated.rounds);
    setBlindReview(updated.blindReview);
    setPlanClosesAt(updated.closesAt ?? "");
    setVersion(updated.version);
    setStatus(updated.status);
    onAuthoritativePlan?.(updated);
  }

  async function transition(action: "open" | "close"): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
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
        applyPlan(recovered);
        currentVersion = recovered.version;
        retained = null;
        const targetStatus = action === "close" ? "closed" : "open";
        if (recovered.status === targetStatus) {
          setMessage("Plan status updated.");
          return;
        }
      }
      const revisionSyncToken = retained?.token ?? crypto.randomUUID();
      retainRevisionSync(seed, { expectedVersion: currentVersion, token: revisionSyncToken });
      const updated = await evaluationRequest<ApiPlan>(
        baseUrl,
        `/plans/${encodeURIComponent(seed.planId)}/${action}`,
        {
          method: "POST",
          body: JSON.stringify({ expectedVersion: currentVersion, revisionSyncToken }),
        },
      );
      clearRetainedRevisionSync(seed);
      setMessage("Plan status updated.");
      applyPlan(updated);
    } catch (reason: unknown) {
      setMessage(
        reason instanceof Error ? reason.message : "The plan status could not be changed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function reviseToDraft(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const revision = await reviseEvaluationPlan(baseUrl, seed.planId, version);
      setMessage(
        "Editable draft revision created. Historical grading remains on the original plan.",
      );
      setRounds(revision.rounds);
      setName(revision.name);
      setBlindReview(revision.blindReview);
      setPlanClosesAt(revision.closesAt ?? "");
      setReviewsPerSubmission(revision.assignmentRule.reviewsPerSubmission);
      setMaxAssignmentsPerReviewer(revision.assignmentRule.maxAssignmentsPerReviewer);
      setFieldIds(revision.reviewerProjection?.fieldIds?.join(", ") ?? "");
      setFileIds(revision.reviewerProjection?.fileIds?.join(", ") ?? "");
      setVersion(revision.version);
      setStatus(revision.status);
      onAuthoritativePlan?.(revision);
    } catch (reason: unknown) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : "The editable plan revision could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }
  return { ...scope, transition, reviseToDraft };
}
export type OrganizerLifecycleActions = ReturnType<typeof useOrganizerLifecycleActions>;
