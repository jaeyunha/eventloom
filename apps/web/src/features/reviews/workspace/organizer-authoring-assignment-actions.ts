"use client";

import { applyReviewAssignments } from "./assignment-apply-review-assignments";
import type { DistributionPreviewInput } from "./assignment-distribution-preview-input";
import { previewReviewAssignments } from "./assignment-preview-review-assignments";
import { distributionPreviewKey } from "./model-distribution-preview-key";
import type { OrganizerPlanActions } from "./organizer-authoring-plan-actions";

export function distributionAppliedMessage(activeAssignmentCount: number): string {
  const assignmentLabel = activeAssignmentCount === 1 ? "assignment" : "assignments";
  return `Reviewer assignments updated. ${activeAssignmentCount} active ${assignmentLabel}.`;
}

export function useOrganizerAssignmentActions(scope: OrganizerPlanActions) {
  const {
    seed,
    baseUrl,
    reviewerMembersError,
    onAssignmentsPersisted,
    rounds,
    assignmentRoundId,
    assignmentPreview,
    setAssignmentPreview,
    assignmentPreviewKey,
    setAssignmentPreviewKey,
    setMessage,
    assignmentSubmissionId,
    assignmentReviewerIds,
    version,
    status,
    setBusy,
    reviewerIdSet,
    reviewerDirectoryReady,
  } = scope;
  async function previewAssignments(): Promise<void> {
    if (status !== "open") {
      setAssignmentPreview(null);
      setAssignmentPreviewKey(null);
      setMessage("Reviewer assignments require an open evaluation plan.");
      return;
    }
    const round = rounds.find((candidate) => candidate.id === assignmentRoundId);
    const reviewerIds = [...assignmentReviewerIds];
    const submissionId = assignmentSubmissionId.trim();
    if (round === undefined || submissionId.length === 0) {
      setMessage("Enter a round and submission id to preview reviewer distribution.");
      return;
    }
    if (!reviewerDirectoryReady) {
      setMessage(
        reviewerMembersError ??
          "Load the active, verified organization reviewers before previewing a distribution.",
      );
      return;
    }
    if (reviewerIds.some((reviewerId) => !reviewerIdSet.has(reviewerId))) {
      setMessage("Select only active, verified organization reviewers.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const input = {
        roundId: round.id,
        submissionIds: [submissionId],
        ...(reviewerIds.length === 0 ? {} : { reviewerIds }),
        expectedVersion: version,
      } satisfies DistributionPreviewInput;
      const preview = await previewReviewAssignments(baseUrl, seed.planId, input);
      setAssignmentPreview(preview);
      setAssignmentPreviewKey(distributionPreviewKey(input));
      setMessage("Authoritative reviewer distribution preview loaded.");
    } catch (reason: unknown) {
      setAssignmentPreview(null);
      setAssignmentPreviewKey(null);
      setMessage(
        reason instanceof Error
          ? reason.message
          : "The reviewer distribution preview could not be loaded.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function assignReviewers(): Promise<void> {
    if (status !== "open") {
      setMessage("Reviewer assignments require an open evaluation plan.");
      return;
    }
    const round = rounds.find((candidate) => candidate.id === assignmentRoundId);
    const reviewerIds = [...assignmentReviewerIds];
    const submissionId = assignmentSubmissionId.trim();
    if (round === undefined || submissionId.length === 0) {
      setMessage("Provide a round and submission id.");
      return;
    }
    if (!reviewerDirectoryReady) {
      setMessage(
        reviewerMembersError ??
          "Load the active, verified organization reviewers before applying a distribution.",
      );
      return;
    }
    if (reviewerIds.some((reviewerId) => !reviewerIdSet.has(reviewerId))) {
      setMessage("Select only active, verified organization reviewers.");
      return;
    }
    const preview = assignmentPreview;
    const input = {
      roundId: round.id,
      submissionIds: [submissionId],
      ...(reviewerIds.length === 0 ? {} : { reviewerIds }),
      expectedVersion: version,
    } satisfies DistributionPreviewInput;
    if (
      preview === null ||
      assignmentPreviewKey !== distributionPreviewKey(input) ||
      preview.scope.roundId !== round.id ||
      preview.fingerprint.trim().length === 0
    ) {
      setMessage("Load a fresh authoritative preview before applying reviewer distribution.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await applyReviewAssignments(baseUrl, seed.planId, {
        ...input,
        fingerprint: preview.fingerprint,
      });
      setAssignmentPreview(null);
      setAssignmentPreviewKey(null);
      setMessage(distributionAppliedMessage(result.activeAssignments.length));
      await onAssignmentsPersisted?.();
    } catch (reason: unknown) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : "Reviewer distribution could not be applied atomically.",
      );
    } finally {
      setBusy(false);
    }
  }
  return { ...scope, previewAssignments, assignReviewers };
}
export type OrganizerAssignmentActions = ReturnType<typeof useOrganizerAssignmentActions>;
