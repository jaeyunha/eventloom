"use client";
import { useEffect, useRef, useState } from "react";
import type { OrganizationMember } from "../../members/api";
import type { ApiPlan } from "./api-api-plan";
import type { AggregateRow } from "./organizer-aggregate-row";
import type { DecisionStatus } from "./organizer-decision-status";
import { loadRoundAggregates } from "./organizer-load-round-aggregates";
import { mapSeedRoundAggregates } from "./organizer-map-seed-round-aggregates";
import {
  createOrganizerResultsExportAttemptRunner,
  type OrganizerResultsExportRun,
} from "./organizer-results-export";
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
  const [selectedRoundOverride, setSelectedRoundOverride] = useState<string | null>(null);
  const selectedRoundCandidate = selectedRoundOverride ?? initialRoundId;
  const selectedRoundId = seed.rounds.some((round) => round.id === selectedRoundCandidate)
    ? selectedRoundCandidate
    : initialRoundId;
  const setSelectedRoundId = (value: string): void => {
    setSelectedRoundOverride(value);
  };
  const [roundAggregates, setRoundAggregates] = useState<readonly AggregateRow[]>(seed.aggregates);
  const [aggregateLoading, setAggregateLoading] = useState(false);
  const [aggregateError, setAggregateError] = useState<string | null>(null);
  const [aggregateSort, setAggregateSort] = useState<"ascending" | "descending">("descending");
  const [exportRun, setExportRun] = useState<OrganizerResultsExportRun | null>(null);
  const [exportCreating, setExportCreating] = useState(false);
  const [exportRequestError, setExportRequestError] = useState<string | null>(null);
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
  const exportAbortControllerRef = useRef<AbortController | null>(null);
  const exportAttemptRunnerRef = useRef(createOrganizerResultsExportAttemptRunner());
  const selectedRound = seed.rounds.find((round) => round.id === selectedRoundId) ?? activeRound;
  useEffect(
    () => () => {
      exportAbortControllerRef.current?.abort();
    },
    [],
  );
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
    if (exportAbortControllerRef.current !== null) return;
    const controller = new AbortController();
    exportAbortControllerRef.current = controller;
    setExportCreating(true);
    setExportRun(null);
    setExportRequestError(null);
    try {
      const terminal = await exportAttemptRunnerRef.current.start({
        baseUrl,
        planId: seed.planId,
        signal: controller.signal,
        onStatus: setExportRun,
      });
      setExportRun(terminal);
    } catch (reason: unknown) {
      if (controller.signal.aborted) return;
      setExportRequestError(
        reason instanceof Error ? reason.message : "The CSV export could not be generated.",
      );
    } finally {
      if (exportAbortControllerRef.current === controller) {
        exportAbortControllerRef.current = null;
        setExportCreating(false);
      }
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
    exportRun,
    exportCreating,
    exportRequestError,
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
