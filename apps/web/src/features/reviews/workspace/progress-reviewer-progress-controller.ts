"use client";

import { useEffect, useState } from "react";
import type { OrganizationMember } from "../../members/api";
import { reminderDeliveryForSelection } from "./evaluator-queue-reminder-delivery-for-selection";
import { evaluationRequest } from "./model-evaluation-request";
import { reminderRequestPresentation } from "./model-reminder-request-presentation";
import { reminderReviewerIdsRequiringSend } from "./model-reminder-reviewer-ids-requiring-send";
import { reviewerDisplayLabel } from "./model-reviewer-display-label";
import type { ReviewPlanSeed } from "./organizer-review-plan-seed";
import { loadReminderDeliveryFacts } from "./progress-load-reminder-delivery-facts";
import type { ReminderDeliveryFact } from "./progress-reminder-delivery-fact";
import type { ReminderDeliveryResponse } from "./progress-reminder-delivery-response";
import type { ReviewerProgressSummary } from "./progress-reviewer-progress-summary";

export interface ReviewerProgressProps {
  seed: ReviewPlanSeed;
  baseUrl: string;
  reviewerMembers: readonly OrganizationMember[];
}

export function useReviewerProgressController({
  seed,
  baseUrl,
  reviewerMembers,
}: ReviewerProgressProps) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [reviewerQuery, setReviewerQuery] = useState("");
  const [reviewerRowLimit, setReviewerRowLimit] = useState(5);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"info" | "success" | "error">("info");
  const [deliveryFacts, setDeliveryFacts] = useState<readonly ReminderDeliveryFact[]>([]);
  const [busy, setBusy] = useState(false);
  const requestPresentation = reminderRequestPresentation(busy);
  const outstanding = seed.progress.reviewers.filter((reviewer) => reviewer.outstanding > 0);
  const normalizedQuery = reviewerQuery.trim().toLowerCase();
  const filteredReviewers = seed.progress.reviewers.filter((reviewer) => {
    if (normalizedQuery.length === 0) return true;
    const round = seed.rounds.find((candidate) => candidate.id === reviewer.roundId);
    return [reviewerDisplayLabel(reviewer.reviewerId, reviewerMembers), round?.name]
      .filter((value): value is string => value !== undefined)
      .some((value) => value.toLowerCase().includes(normalizedQuery));
  });
  const visibleReviewers = filteredReviewers.slice(0, reviewerRowLimit);
  const visibleOutstanding = visibleReviewers.filter((reviewer) => reviewer.outstanding > 0);
  const reviewerLabel = (reviewerId: string) => reviewerDisplayLabel(reviewerId, reviewerMembers);
  const keyFor = (reviewer: ReviewerProgressSummary) =>
    `${reviewer.reviewerId}\u0000${reviewer.roundId}`;
  const selectedOutstanding = outstanding.filter((reviewer) => selected.has(keyFor(reviewer)));
  const selectedVisibleOutstanding = visibleOutstanding.filter((reviewer) =>
    selected.has(keyFor(reviewer)),
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadReminderDeliveryFacts(baseUrl, seed.planId, (input, init) =>
      fetch(input, { ...init, signal: controller.signal }),
    )
      .then(setDeliveryFacts)
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setMessageTone("error");
          setMessage(
            reason instanceof Error
              ? reason.message
              : "Reminder delivery status could not be loaded.",
          );
        }
      });
    return () => controller.abort();
  }, [baseUrl, seed.planId]);

  function toggle(reviewer: ReviewerProgressSummary): void {
    const key = keyFor(reviewer);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function sendReminders(): Promise<void> {
    if (selectedOutstanding.length === 0) {
      setMessageTone("error");
      setMessage("Select at least one reviewer with outstanding assignments.");
      return;
    }
    setBusy(true);
    setMessageTone("info");
    setMessage(
      `Sending reminder to ${selectedOutstanding.length} selected reviewer${selectedOutstanding.length === 1 ? "" : "s"}… Delivery status will appear here when the request completes.`,
    );
    try {
      const byRound = new Map<string, string[]>();
      for (const reviewer of selectedOutstanding) {
        const ids = byRound.get(reviewer.roundId) ?? [];
        if (!ids.includes(reviewer.reviewerId)) ids.push(reviewer.reviewerId);
        byRound.set(reviewer.roundId, ids);
      }
      const responseFactsByRound = await Promise.all(
        [...byRound].map(async ([roundId, reviewerIds]) => {
          const existingFacts = deliveryFacts.filter(
            (fact) =>
              fact.roundId === roundId &&
              typeof fact.reviewerId === "string" &&
              reviewerIds.includes(fact.reviewerId) &&
              fact.status !== undefined &&
              ["queued", "processing", "delivered"].includes(fact.status.toLowerCase()),
          );
          const reviewerIdsToSend = reminderReviewerIdsRequiringSend(
            deliveryFacts,
            roundId,
            reviewerIds,
          );
          if (reviewerIdsToSend.length === 0) return existingFacts;
          const result = await evaluationRequest<ReminderDeliveryResponse>(
            baseUrl,
            `/plans/${encodeURIComponent(seed.planId)}/reminders`,
            {
              method: "POST",
              body: JSON.stringify({ roundId, reviewerIds: [...reviewerIdsToSend].sort() }),
            },
          );
          return [...existingFacts, ...(result.facts ?? [])];
        }),
      );
      const responseFacts = responseFactsByRound.flat();
      setDeliveryFacts((current) => {
        const responseIds = new Set(responseFacts.map((fact) => fact.outboxId));
        return [...responseFacts, ...current.filter((fact) => !responseIds.has(fact.outboxId))];
      });
      setMessage(
        [...byRound.entries()]
          .map(([roundId, reviewerIds]) => {
            const roundName = seed.rounds.find((round) => round.id === roundId)?.name ?? roundId;
            return `${roundName}: ${reminderDeliveryForSelection(responseFacts, roundId, reviewerIds)}`;
          })
          .join(" "),
      );
      setMessageTone("success");
      setSelected(new Set<string>());
    } catch (reason: unknown) {
      setMessageTone("error");
      setMessage(
        reason instanceof Error
          ? reason.message
          : "Reviewer reminders could not be sent through communications.",
      );
    } finally {
      setBusy(false);
    }
  }

  return {
    seed,
    selected,
    setSelected,
    reviewerQuery,
    setReviewerQuery,
    reviewerRowLimit,
    setReviewerRowLimit,
    message,
    messageTone,
    deliveryFacts,
    busy,
    requestPresentation,
    outstanding,
    filteredReviewers,
    visibleReviewers,
    visibleOutstanding,
    reviewerLabel,
    selectedOutstanding,
    selectedVisibleOutstanding,
    keyFor,
    toggle,
    sendReminders,
  };
}

export type ReviewerProgressController = ReturnType<typeof useReviewerProgressController>;
