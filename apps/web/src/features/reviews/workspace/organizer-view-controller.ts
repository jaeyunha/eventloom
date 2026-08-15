"use client";
import { useEffect, useRef, useState } from "react";
import type { OrganizationMember } from "../../members/api";
import type { ApiPlan } from "./api-api-plan";
import type { AggregateRow } from "./organizer-aggregate-row";
import type { DecisionStatus } from "./organizer-decision-status";
import { loadRoundAggregates } from "./organizer-load-round-aggregates";
import { mapSeedRoundAggregates } from "./organizer-map-seed-round-aggregates";
import type { ReviewPlanSeed } from "./organizer-review-plan-seed";

import { deriveOrganizerWorkspaceModel } from "./organizer-view-model";
export interface OrganizerWorkspaceViewProps {
  seed: ReviewPlanSeed;
  baseUrl: string;
  organizationId?: string | undefined;
  reviewerMembers: readonly OrganizationMember[];
  reviewerMembersLoading: boolean;
  reviewerMembersError: string | null;
  onAuthoritativePlan?: ((plan: ApiPlan) => void) | undefined;
  onAssignmentsPersisted?: (() => Promise<void>) | undefined;
}

export function useOrganizerWorkspaceViewController({
  seed,
  baseUrl,
  organizationId,
  reviewerMembers,
  reviewerMembersLoading,
  reviewerMembersError,
  onAuthoritativePlan,
  onAssignmentsPersisted,
}: OrganizerWorkspaceViewProps) {
  const activeRound =
    [...seed.rounds]
      .filter((round) => round.status === "open")
      .sort((left, right) => (right.sequence ?? 0) - (left.sequence ?? 0))[0] ??
    [...seed.rounds].sort((left, right) => (right.sequence ?? 0) - (left.sequence ?? 0))[0];
  const initialRoundId =
    seed.aggregates.find((aggregate) => aggregate.roundId !== undefined)?.roundId ??
    activeRound?.id ??
    seed.rounds[0]?.id ??
    "";
  const [selectedRoundId, setSelectedRoundId] = useState(initialRoundId);
  const [roundAggregates, setRoundAggregates] = useState<readonly AggregateRow[]>(seed.aggregates);
  const [aggregateLoading, setAggregateLoading] = useState(false);
  const [aggregateError, setAggregateError] = useState<string | null>(null);
  const [aggregateSort, setAggregateSort] = useState<"ascending" | "descending">("descending");
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [view, setView] = useState<"overview" | "setup" | "assignments" | "decisions">(
    seed.status === "draft" ? "setup" : "overview",
  );
  const [assignmentTarget, setAssignmentTarget] = useState<{
    readonly roundId: string;
    readonly submissionId: string;
  } | null>(null);
  const [selectedDecisionId, setSelectedDecisionId] = useState<string | null>(null);
  const [decisionQuery, setDecisionQuery] = useState("");
  const [decisionFilter, setDecisionFilter] = useState<"all" | "undecided" | DecisionStatus>(
    "undecided",
  );
  const [decisionRowLimit, setDecisionRowLimit] = useState(5);
  const decisionEditorRef = useRef<HTMLDivElement | null>(null);
  const selectedRound = seed.rounds.find((round) => round.id === selectedRoundId) ?? activeRound;
  useEffect(() => {
    setRoundAggregates(seed.aggregates);
    setAggregateError(null);
    if (!seed.rounds.some((round) => round.id === selectedRoundId)) {
      setSelectedRoundId(initialRoundId);
    }
  }, [initialRoundId, seed, selectedRoundId]);
  useEffect(() => {
    if (selectedRoundId.length === 0) return;
    let cancelled = false;
    setAggregateLoading(true);
    setAggregateError(null);
    void loadRoundAggregates(baseUrl, seed.planId, selectedRoundId)
      .then((aggregates) => {
        if (!cancelled) {
          setRoundAggregates(mapSeedRoundAggregates(seed, aggregates, selectedRoundId));
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setAggregateError(
            reason instanceof Error
              ? reason.message
              : `Aggregates for ${selectedRoundId} are unavailable; other organizer data remains available.`,
          );
        }
      })
      .finally(() => {
        if (!cancelled) setAggregateLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [baseUrl, seed, selectedRoundId]);
  useEffect(() => {
    if (selectedDecisionId === null) return;
    decisionEditorRef.current?.focus();
    decisionEditorRef.current?.scrollIntoView({ block: "start" });
  }, [selectedDecisionId]);
  const derived = deriveOrganizerWorkspaceModel({
    seed,
    roundAggregates,
    aggregateSort,
    decisionFilter,
    decisionQuery,
    decisionRowLimit,
    selectedDecisionId,
    selectedRound,
    selectedRoundId,
    reviewerMembers,
  });
  function openReviewersForSubmission(submissionId: string): void {
    const aggregate = roundAggregates.find((candidate) => candidate.id === submissionId);
    const roundId = aggregate?.roundId ?? selectedRound?.id ?? selectedRoundId;
    if (roundId.length > 0) setAssignmentTarget({ roundId, submissionId });
    setView("assignments");
  }

  function openDecisionForSubmission(submissionId: string): void {
    const aggregate = roundAggregates.find((candidate) => candidate.id === submissionId);
    const roundId = aggregate?.roundId ?? selectedRound?.id ?? selectedRoundId;
    if (roundId.length > 0) setSelectedRoundId(roundId);
    setDecisionQuery("");
    setDecisionFilter("all");
    setSelectedDecisionId(submissionId);
    setView("decisions");
  }

  async function exportResults(): Promise<void> {
    setExportMessage(`Preparing evaluation-${seed.planId}.csv…`);
    try {
      const response = await fetch(
        `${baseUrl}/api/admin/evaluations/plans/${encodeURIComponent(seed.planId)}/export.csv`,
        {
          credentials: "include",
          cache: "no-store",
          headers: { accept: "text/csv" },
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => undefined)) as
          | { error?: { message?: string } }
          | undefined;
        throw new Error(body?.error?.message ?? "The CSV export could not be generated.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `evaluation-${seed.planId}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      setExportMessage(`CSV export ready: ${link.download}`);
    } catch (reason: unknown) {
      setExportMessage(
        reason instanceof Error ? reason.message : "The CSV export could not be generated.",
      );
    }
  }

  return {
    seed,
    baseUrl,
    organizationId,
    reviewerMembers,
    reviewerMembersLoading,
    reviewerMembersError,
    onAuthoritativePlan,
    onAssignmentsPersisted,
    activeRound,
    initialRoundId,
    selectedRoundId,
    setSelectedRoundId,
    roundAggregates,
    aggregateLoading,
    aggregateError,
    aggregateSort,
    setAggregateSort,
    exportMessage,
    view,
    setView,
    assignmentTarget,
    selectedDecisionId,
    setSelectedDecisionId,
    decisionQuery,
    setDecisionQuery,
    decisionFilter,
    setDecisionFilter,
    decisionRowLimit,
    setDecisionRowLimit,
    decisionEditorRef,
    selectedRound,
    ...derived,
    openReviewersForSubmission,
    openDecisionForSubmission,
    exportResults,
  };
}
export type OrganizerWorkspaceViewController = ReturnType<
  typeof useOrganizerWorkspaceViewController
>;
