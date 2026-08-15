"use client";

import { useEffect, useRef, useState } from "react";
import type { OrganizationMember } from "../../members/api";
import { replaceSingleReviewAssignment } from "./assignment-replace-single-review-assignment";
import type { ReviewPlanAssignment } from "./assignment-review-plan-assignment";
import { reviewerDisplayLabel } from "./model-reviewer-display-label";
import type { ReviewPlanSeed } from "./organizer-review-plan-seed";

export interface ReviewerAssignmentListProps {
  seed: ReviewPlanSeed;
  baseUrl: string;
  reviewerMembers: readonly OrganizationMember[];
  onAssignmentsPersisted?: (() => Promise<void>) | undefined;
}

export function useReviewerAssignmentController({
  seed,
  baseUrl,
  reviewerMembers,
  onAssignmentsPersisted,
}: ReviewerAssignmentListProps) {
  const [busyAssignmentId, setBusyAssignmentId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [replacementReviewerByAssignment, setReplacementReviewerByAssignment] = useState<
    Readonly<Record<string, string>>
  >({});
  const [replacementReasonByAssignment, setReplacementReasonByAssignment] = useState<
    Readonly<Record<string, string>>
  >({});
  const [assignmentQuery, setAssignmentQuery] = useState("");
  const [assignmentStatusFilter, setAssignmentStatusFilter] = useState<
    "all" | ReviewPlanAssignment["status"]
  >("all");
  const [assignmentRowLimit, setAssignmentRowLimit] = useState(5);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const assignmentEditorRef = useRef<HTMLElement | null>(null);
  const submissionById = new Map(seed.aggregates.map((aggregate) => [aggregate.id, aggregate]));
  const roundById = new Map(seed.rounds.map((round) => [round.id, round]));
  const verifiedReviewerIds = new Set(reviewerMembers.map((member) => member.userId));
  const normalizedQuery = assignmentQuery.trim().toLowerCase();
  const filteredAssignments = seed.assignments.filter((assignment) => {
    if (assignmentStatusFilter !== "all" && assignment.status !== assignmentStatusFilter) {
      return false;
    }
    if (normalizedQuery.length === 0) return true;
    const aggregate = submissionById.get(assignment.submissionId);
    const reviewer = reviewerDisplayLabel(assignment.reviewerId, reviewerMembers);
    const round = roundById.get(assignment.roundId);
    return [aggregate?.title, aggregate?.reference, reviewer, round?.name]
      .filter((value): value is string => value !== undefined)
      .some((value) => value.toLowerCase().includes(normalizedQuery));
  });
  const visibleAssignments = filteredAssignments.slice(0, assignmentRowLimit);
  const selectedAssignment =
    seed.assignments.find((assignment) => assignment.id === selectedAssignmentId) ?? null;
  const selectedAggregate = selectedAssignment
    ? submissionById.get(selectedAssignment.submissionId)
    : undefined;
  const selectedRound = selectedAssignment ? roundById.get(selectedAssignment.roundId) : undefined;
  const selectedReviewer = selectedAssignment
    ? reviewerDisplayLabel(selectedAssignment.reviewerId, reviewerMembers)
    : null;
  const selectedProtectedHistory =
    selectedAssignment?.status === "abstained" || selectedAssignment?.status === "superseded";

  useEffect(() => {
    if (selectedAssignmentId === null) return;
    assignmentEditorRef.current?.focus();
    assignmentEditorRef.current?.scrollIntoView({ block: "start" });
  }, [selectedAssignmentId]);

  async function replaceAssignment(assignment: ReviewPlanAssignment): Promise<void> {
    const replacementReviewerId = replacementReviewerByAssignment[assignment.id]?.trim() ?? "";
    const reason = replacementReasonByAssignment[assignment.id]?.trim() ?? "";
    if (!verifiedReviewerIds.has(replacementReviewerId)) {
      setMessage("Choose an active, verified organization member as the replacement reviewer.");
      return;
    }
    if (reason.length === 0) {
      setMessage("A non-empty replacement reason is required.");
      return;
    }
    if (assignment.status === "superseded" || assignment.status === "abstained") {
      setMessage("Protected assignment history cannot be mutated.");
      return;
    }
    if (busyAssignmentId !== null) return;
    setBusyAssignmentId(assignment.id);
    setMessage(null);
    try {
      const result = await replaceSingleReviewAssignment(baseUrl, seed.planId, assignment.id, {
        replacementReviewerId,
        expectedVersion: assignment.version,
        reason,
      });
      setMessage(
        `Assignment ${result.replacedAssignment.id} superseded by ${result.successorAssignment.id}. Lineage predecessor: ${result.successorAssignment.predecessorAssignmentId ?? result.replacedAssignment.id}; successor: ${result.replacedAssignment.successorAssignmentId ?? result.successorAssignment.id}. History preserved: ${result.history.length}.`,
      );
      setSelectedAssignmentId(null);
      await onAssignmentsPersisted?.();
    } catch (reasonError: unknown) {
      setMessage(
        reasonError instanceof Error
          ? reasonError.message
          : "The reviewer assignment could not be replaced.",
      );
    } finally {
      setBusyAssignmentId(null);
    }
  }

  return {
    seed,
    reviewerMembers,
    busyAssignmentId,
    message,
    replacementReviewerByAssignment,
    setReplacementReviewerByAssignment,
    replacementReasonByAssignment,
    setReplacementReasonByAssignment,
    assignmentQuery,
    setAssignmentQuery,
    assignmentStatusFilter,
    setAssignmentStatusFilter,
    assignmentRowLimit,
    setAssignmentRowLimit,
    selectedAssignmentId,
    setSelectedAssignmentId,
    assignmentEditorRef,
    submissionById,
    roundById,
    filteredAssignments,
    visibleAssignments,
    selectedAssignment,
    selectedAggregate,
    selectedRound,
    selectedReviewer,
    selectedProtectedHistory,
    replaceAssignment,
  };
}

export type ReviewerAssignmentController = ReturnType<typeof useReviewerAssignmentController>;
