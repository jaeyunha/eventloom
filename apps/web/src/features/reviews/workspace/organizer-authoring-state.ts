"use client";

import { useCallback, useMemo, useState } from "react";
import type { OrganizationMember } from "../../members/api";
import type { ApiPlan } from "./api-api-plan";
import type { DistributionPreview } from "./assignment-distribution-preview";
import { reviewerIdsForAssignmentTarget } from "./assignment-reviewer-ids-for-assignment-target";
import type { ReviewPlanSeed } from "./organizer-review-plan-seed";

export interface OrganizerAuthoringProps {
  seed: ReviewPlanSeed;
  baseUrl: string;
  organizationId?: string | undefined;
  reviewerMembers: readonly OrganizationMember[];
  reviewerMembersLoading: boolean;
  reviewerMembersError: string | null;
  onAuthoritativePlan?: ((plan: ApiPlan) => void) | undefined;
  onAssignmentsPersisted?: (() => Promise<void>) | undefined;
  assignmentOnly?: boolean;
  assignmentTarget?: { readonly roundId: string; readonly submissionId: string } | undefined;
}

interface AssignmentFieldOverride {
  readonly ownerKey: string;
  readonly value: string;
}
interface AssignmentReviewerOverride {
  readonly ownerKey: string;
  readonly value: readonly string[];
}

interface AssignmentPreviewOverride {
  readonly ownerKey: string;
  readonly selectionKey: string;
  readonly value: DistributionPreview | null;
  readonly previewKey: string | null;
}
type AssignmentReviewerIdsUpdate =
  | readonly string[]
  | ((current: readonly string[]) => readonly string[]);

export function useOrganizerAuthoringState({
  assignmentOnly = false,
  ...props
}: OrganizerAuthoringProps) {
  const {
    seed,
    baseUrl,
    organizationId,
    reviewerMembers,
    reviewerMembersLoading,
    reviewerMembersError,
    onAuthoritativePlan,
    onAssignmentsPersisted,
    assignmentTarget,
  } = props;
  const initialRounds: readonly ApiPlan["rounds"][number][] =
    seed.sourceRounds ??
    seed.rounds.map((round, index) => ({
      id: round.id,
      name: round.name,
      sequence: round.sequence ?? index + 1,
      ...(round.roundRevision === undefined ? {} : { revision: round.roundRevision }),
      ...(round.rubricRevision === undefined ? {} : { rubricRevision: round.rubricRevision }),
      opensAt: null,
      closesAt: null,
      ...(round.blindReview === undefined ? {} : { blindReview: round.blindReview }),
      ...(round.anonymization === undefined ? {} : { anonymization: round.anonymization }),
      ...(round.reviewerPool === undefined ? {} : { reviewerPool: round.reviewerPool }),
      ...(round.trackFilter === undefined ? {} : { trackFilter: round.trackFilter }),
      rubric: {
        id: `rubric-${round.id}`,
        name: round.rubric.name,
        criteria: round.rubric.criteria,
      },
    }));
  const [name, setName] = useState(seed.planName);
  const [planClosesAt, setPlanClosesAt] = useState(seed.sourceClosesAt ?? "");
  const [blindReview, setBlindReview] = useState(seed.blindReview);
  const [reviewsPerSubmission, setReviewsPerSubmission] = useState(
    seed.assignmentRule.reviewsPerSubmission,
  );
  const [maxAssignmentsPerReviewer, setMaxAssignmentsPerReviewer] = useState(
    seed.assignmentRule.maxAssignmentsPerReviewer,
  );
  const [fieldIds, setFieldIds] = useState(
    () => seed.reviewerProjection?.fieldIds?.join(", ") ?? "",
  );
  const [fileIds, setFileIds] = useState(() => seed.reviewerProjection?.fileIds?.join(", ") ?? "");
  const [rounds, setRounds] = useState<readonly ApiPlan["rounds"][number][]>(initialRounds);
  const [assignmentRoundOverride, setAssignmentRoundOverride] =
    useState<AssignmentFieldOverride | null>(null);
  const [assignmentPreviewOverride, setAssignmentPreviewOverride] =
    useState<AssignmentPreviewOverride | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [unresolvedTemporalFields, setUnresolvedTemporalFields] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [assignmentSubmissionOverride, setAssignmentSubmissionOverride] =
    useState<AssignmentFieldOverride | null>(null);
  const [assignmentReviewerOverride, setAssignmentReviewerOverride] =
    useState<AssignmentReviewerOverride | null>(null);
  const [assignmentReviewerQuery, setAssignmentReviewerQuery] = useState("");
  const [version, setVersion] = useState(seed.version);
  const [status, setStatus] = useState(seed.status);
  const [busy, setBusy] = useState(false);
  const assignmentFieldOwnerKey = JSON.stringify([
    seed.eventId,
    seed.planId,
    assignmentTarget?.roundId ?? null,
    assignmentTarget?.submissionId ?? null,
  ]);
  const assignmentRoundCandidate =
    assignmentRoundOverride?.ownerKey === assignmentFieldOwnerKey
      ? assignmentRoundOverride.value
      : (assignmentTarget?.roundId ?? seed.rounds[0]?.id ?? initialRounds[0]?.id ?? "");
  const assignmentRoundId = rounds.some((round) => round.id === assignmentRoundCandidate)
    ? assignmentRoundCandidate
    : (rounds[0]?.id ?? "");
  const setAssignmentRoundId = (value: string): void => {
    setAssignmentRoundOverride({ ownerKey: assignmentFieldOwnerKey, value });
  };
  const assignmentSubmissionId =
    assignmentSubmissionOverride?.ownerKey === assignmentFieldOwnerKey
      ? assignmentSubmissionOverride.value
      : (assignmentTarget?.submissionId ?? "");
  const setAssignmentSubmissionId = (value: string): void => {
    setAssignmentSubmissionOverride({ ownerKey: assignmentFieldOwnerKey, value });
  };
  const assignmentOwnerKey = JSON.stringify([
    seed.eventId,
    seed.planId,
    assignmentRoundId,
    assignmentSubmissionId,
  ]);
  const reviewerIdSet = useMemo(
    () => new Set(reviewerMembers.map((member) => member.userId)),
    [reviewerMembers],
  );
  const reviewerDirectoryReady = !reviewerMembersLoading && reviewerMembersError === null;
  const isDraft = status === "draft";
  const criterionCount = rounds.reduce((total, round) => total + round.rubric.criteria.length, 0);
  const planStatusLabel =
    status === "open" ? "Open for review" : status === "closed" ? "Review closed" : "Draft";
  const normalizedAssignmentReviewerQuery = assignmentReviewerQuery.trim().toLowerCase();
  const matchingAssignmentReviewerMembers = reviewerMembers.filter((member) =>
    [member.name, member.email]
      .filter((value): value is string => typeof value === "string")
      .some((value) => value.toLowerCase().includes(normalizedAssignmentReviewerQuery)),
  );
  const visibleAssignmentReviewerMembers = matchingAssignmentReviewerMembers.slice(0, 8);
  const assignmentReviewerSelectionDisabled =
    busy || status !== "open" || reviewerMembersLoading || reviewerMembersError !== null;

  const authoritativeAssignmentReviewerIds = useMemo(
    () =>
      reviewerIdsForAssignmentTarget(seed.assignments, assignmentRoundId, assignmentSubmissionId),
    [assignmentRoundId, assignmentSubmissionId, seed.assignments],
  );
  const defaultAssignmentReviewerIds = useMemo(() => {
    if (!reviewerDirectoryReady) return authoritativeAssignmentReviewerIds;
    return authoritativeAssignmentReviewerIds.filter((reviewerId) => reviewerIdSet.has(reviewerId));
  }, [authoritativeAssignmentReviewerIds, reviewerDirectoryReady, reviewerIdSet]);
  const assignmentReviewerIds =
    assignmentReviewerOverride?.ownerKey === assignmentOwnerKey
      ? assignmentReviewerOverride.value
      : defaultAssignmentReviewerIds;
  const setAssignmentReviewerIds = useCallback(
    (next: AssignmentReviewerIdsUpdate): void => {
      setAssignmentReviewerOverride((current) => {
        const currentValue =
          current?.ownerKey === assignmentOwnerKey ? current.value : defaultAssignmentReviewerIds;
        const value = typeof next === "function" ? next(currentValue) : next;
        if (
          current?.ownerKey === assignmentOwnerKey &&
          current.value.length === value.length &&
          current.value.every((reviewerId, index) => reviewerId === value[index])
        ) {
          return current;
        }
        return { ownerKey: assignmentOwnerKey, value };
      });
    },
    [assignmentOwnerKey, defaultAssignmentReviewerIds],
  );

  function setTemporalFieldValidity(field: string, isValid: boolean): void {
    setUnresolvedTemporalFields((current) => {
      const hasField = current.has(field);
      if (hasField === !isValid) return current;
      const next = new Set(current);
      if (isValid) next.delete(field);
      else next.add(field);
      return next;
    });
  }

  const assignmentSelectionKey = `${assignmentRoundId}:${assignmentSubmissionId}:${assignmentReviewerIds.join(",")}:${version}`;
  const ownedAssignmentPreview =
    assignmentPreviewOverride?.ownerKey === assignmentOwnerKey &&
    assignmentPreviewOverride.selectionKey === assignmentSelectionKey
      ? assignmentPreviewOverride
      : null;
  const assignmentPreview = ownedAssignmentPreview?.value ?? null;
  const assignmentPreviewKey = ownedAssignmentPreview?.previewKey ?? null;
  const setAssignmentPreview = useCallback(
    (value: DistributionPreview | null): void => {
      setAssignmentPreviewOverride((current) => ({
        ownerKey: assignmentOwnerKey,
        selectionKey: assignmentSelectionKey,
        value,
        previewKey:
          current?.ownerKey === assignmentOwnerKey &&
          current.selectionKey === assignmentSelectionKey
            ? current.previewKey
            : null,
      }));
    },
    [assignmentOwnerKey, assignmentSelectionKey],
  );
  const setAssignmentPreviewKey = useCallback(
    (previewKey: string | null): void => {
      setAssignmentPreviewOverride((current) => ({
        ownerKey: assignmentOwnerKey,
        selectionKey: assignmentSelectionKey,
        value:
          current?.ownerKey === assignmentOwnerKey &&
          current.selectionKey === assignmentSelectionKey
            ? current.value
            : null,
        previewKey,
      }));
    },
    [assignmentOwnerKey, assignmentSelectionKey],
  );
  return {
    seed,
    baseUrl,
    organizationId,
    reviewerMembers,
    reviewerMembersLoading,
    reviewerMembersError,
    onAuthoritativePlan,
    onAssignmentsPersisted,
    assignmentOnly,
    assignmentTarget,
    initialRounds,
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
    assignmentRoundId,
    setAssignmentRoundId,
    assignmentPreview,
    setAssignmentPreview,
    assignmentPreviewKey,
    setAssignmentPreviewKey,
    message,
    setMessage,
    unresolvedTemporalFields,
    setTemporalFieldValidity,
    assignmentSubmissionId,
    setAssignmentSubmissionId,
    assignmentReviewerIds,
    setAssignmentReviewerIds,
    assignmentReviewerQuery,
    setAssignmentReviewerQuery,
    version,
    setVersion,
    status,
    setStatus,
    busy,
    setBusy,
    reviewerIdSet,
    reviewerDirectoryReady,
    isDraft,
    criterionCount,
    planStatusLabel,
    matchingAssignmentReviewerMembers,
    visibleAssignmentReviewerMembers,
    assignmentReviewerSelectionDisabled,
  };
}
export type OrganizerAuthoringState = ReturnType<typeof useOrganizerAuthoringState>;
