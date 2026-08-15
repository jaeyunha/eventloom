"use client";
import { useRef, useState } from "react";
import { scorecardPrimaryAction } from "../scorecard-action";
import type { ApiSuggestion } from "./api-api-suggestion";
import type { AuthoritativeReview } from "./api-authoritative-review";
import type { EvaluatorAssignment } from "./assignment-evaluator-assignment";
import type { EvaluatorDraftSnapshot } from "./evaluator-evaluator-draft-snapshot";
import { createReviewAutosaveQueue } from "./scorecard-create-review-autosave-queue";
export interface EvaluatorWorkspaceProps {
  assignment: EvaluatorAssignment;
  baseUrl: string;
  embedded?: boolean | undefined;
  onAbstain?: (() => void) | undefined;
  onSubmitted?: ((review: AuthoritativeReview) => void) | undefined;
  submittedOverride?: boolean | undefined;
  queuePosition?: Readonly<{ position: number; total: number }> | undefined;
  onNext?: (() => void) | undefined;
  onDraftChange?: ((snapshot: EvaluatorDraftSnapshot) => void) | undefined;
  onAutosavePendingChange?: ((pending: boolean) => void) | undefined;
}

export function useEvaluatorState({
  embedded = false,
  submittedOverride = false,
  ...props
}: EvaluatorWorkspaceProps) {
  const {
    assignment,
    baseUrl,
    onAbstain,
    onSubmitted,
    queuePosition,
    onNext,
    onDraftChange,
    onAutosavePendingChange,
  } = props;
  const initiallySubmitted =
    assignment.submittedAt !== null ||
    submittedOverride ||
    assignment.assignmentStatus === "submitted";
  const [scoreValues, setScoreValues] = useState<Record<string, string>>(() => ({
    ...assignment.initialScores,
  }));
  const [responseValues, setResponseValues] = useState<Record<string, string>>(() => ({
    ...assignment.initialResponses,
  }));
  const [humanConfirmed, setHumanConfirmed] = useState<Set<string>>(
    () => new Set(assignment.initialConfirmed),
  );
  const [comment, setComment] = useState(assignment.initialComment);
  const [, setReviewVersion] = useState<number | undefined>(assignment.reviewVersion);
  const reviewVersionRef = useRef<number | undefined>(assignment.reviewVersion);
  const criterionRefs = useRef<Record<string, HTMLElement | null>>({});
  const abstentionReasonRef = useRef<HTMLTextAreaElement | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [autosavePending, setAutosavePending] = useState(false);
  const [autosaveQueue] = useState(() =>
    createReviewAutosaveQueue((pending) => {
      setAutosavePending(pending);
      onAutosavePendingChange?.(pending);
    }),
  );
  const [autosaveState, setAutosaveState] = useState(
    initiallySubmitted ? "Review submitted" : "Autosave ready",
  );
  const [submitted, setSubmitted] = useState(initiallySubmitted);
  const reviewLocked =
    submitted || assignment.assignmentStatus === "abstained" || assignment.round.status !== "open";
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitBusy, setSubmitBusy] = useState(false);
  const primaryAction = scorecardPrimaryAction({
    submitted,
    hasNext: onNext !== undefined,
    submitBusy,
    autosavePending,
  });
  const submitBusyRef = useRef(false);
  const [abstentionReason, setAbstentionReason] = useState("");
  const [abstentionError, setAbstentionError] = useState<string | null>(null);
  const [abstained, setAbstained] = useState(() => assignment.assignmentStatus === "abstained");
  const [abstentionBusy, setAbstentionBusy] = useState(false);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<readonly ApiSuggestion[]>(assignment.suggestions);
  const [suggestionBusy, setSuggestionBusy] = useState(false);
  const [suggestionUnavailable, setSuggestionUnavailable] = useState<string | null>(null);
  const [suggestionConflict, setSuggestionConflict] = useState<string | null>(null);
  return {
    assignment,
    baseUrl,
    embedded,
    onAbstain,
    onSubmitted,
    submittedOverride,
    queuePosition,
    onNext,
    onDraftChange,
    onAutosavePendingChange,
    initiallySubmitted,
    scoreValues,
    setScoreValues,
    responseValues,
    setResponseValues,
    humanConfirmed,
    setHumanConfirmed,
    comment,
    setComment,
    setReviewVersion,
    reviewVersionRef,
    criterionRefs,
    abstentionReasonRef,
    showValidation,
    setShowValidation,
    autosavePending,
    autosaveQueue,
    autosaveState,
    setAutosaveState,
    submitted,
    setSubmitted,
    reviewLocked,
    submitError,
    setSubmitError,
    submitBusy,
    setSubmitBusy,
    primaryAction,
    submitBusyRef,
    abstentionReason,
    setAbstentionReason,
    abstentionError,
    setAbstentionError,
    abstained,
    setAbstained,
    abstentionBusy,
    setAbstentionBusy,
    conflictDialogOpen,
    setConflictDialogOpen,
    suggestions,
    setSuggestions,
    suggestionBusy,
    setSuggestionBusy,
    suggestionUnavailable,
    setSuggestionUnavailable,
    suggestionConflict,
    setSuggestionConflict,
  };
}
export type EvaluatorState = ReturnType<typeof useEvaluatorState>;
