"use client";

import { useEffect, useState } from "react";
import type { OrganizationMember } from "../../members/api";
import { createMemberApi } from "../../members/api";
import { MissingEvaluationPlanError } from "./api-missing-evaluation-plan-error";
import type { EvaluatorAssignment } from "./assignment-evaluator-assignment";
import { loadEvaluatorQueue } from "./evaluator-load-evaluator-queue";
import type { ReviewerQueueEntry } from "./evaluator-queue-reviewer-queue-entry";
import { apiBaseUrl } from "./model-api-base-url";
import { browserSameOrigin } from "./model-browser-same-origin";
import { configuredOrganizationId } from "./model-configured-organization-id";
import { loadCreatedOrganizerPlan } from "./organizer-load-created-organizer-plan";
import { loadOrganizerData } from "./organizer-load-organizer-data";
import type { ReviewPlanSeed } from "./organizer-review-plan-seed";
import type { ReviewWorkspaceProps } from "./workspace-review-workspace-props";

export function useReviewWorkspaceController(
  props: ReviewWorkspaceProps,
  eventId: string | undefined,
) {
  const {
    mode = "organizer",
    initialState,
    organizationId: explicitOrganizationId,
    memberApi: providedMemberApi,
  } = props;
  const baseUrl = apiBaseUrl();
  const reviewerOrganizationId = configuredOrganizationId(explicitOrganizationId);
  const initialStateProvided = initialState !== undefined;
  const reviewerQueueMode =
    mode === "evaluator" &&
    (eventId === undefined || initialState?.queue !== undefined || !initialStateProvided);
  const [seed, setSeed] = useState<ReviewPlanSeed | null>(() =>
    mode === "organizer" ? (initialState?.organizer ?? null) : null,
  );
  const [assignment, setAssignment] = useState<EvaluatorAssignment | null>(() =>
    mode === "evaluator" &&
    !reviewerQueueMode &&
    initialState?.assignment?.assignmentStatus !== "superseded"
      ? (initialState?.assignment ?? null)
      : null,
  );
  const [queue, setQueue] = useState<readonly ReviewerQueueEntry[] | null>(() =>
    mode === "evaluator" && reviewerQueueMode
      ? (initialState?.queue ?? []).filter(
          (entry) =>
            entry.assignment.assignmentStatus !== "abstained" &&
            entry.assignment.assignmentStatus !== "superseded",
        )
      : null,
  );
  const [loading, setLoading] = useState(!initialStateProvided);
  const [error, setError] = useState<string | null>(null);
  const [missingPlan, setMissingPlan] = useState(
    mode === "organizer" && initialState?.organizerPlanMissing === true,
  );
  const [reviewerMembers, setReviewerMembers] = useState<readonly OrganizationMember[]>([]);
  const [reviewerMembersLoading, setReviewerMembersLoading] = useState(
    mode === "organizer" && eventId !== undefined,
  );
  const [reviewerMembersError, setReviewerMembersError] = useState<string | null>(null);
  const [createdPlanRefresh, setCreatedPlanRefresh] = useState<{
    eventId: string;
    planId: string;
  } | null>(null);
  const [createdPlanRefreshLoading, setCreatedPlanRefreshLoading] = useState(false);
  const [createdPlanRefreshError, setCreatedPlanRefreshError] = useState<string | null>(null);

  async function refreshCreatedPlan(refreshEventId: string, planId: string): Promise<void> {
    setCreatedPlanRefreshLoading(true);
    setCreatedPlanRefreshError(null);
    try {
      setSeed(await loadCreatedOrganizerPlan(refreshEventId, baseUrl, planId));
      setCreatedPlanRefresh(null);
    } catch (reason: unknown) {
      setCreatedPlanRefreshError(
        reason instanceof Error
          ? reason.message
          : "The authoritative review plan could not be loaded.",
      );
    } finally {
      setCreatedPlanRefreshLoading(false);
    }
  }

  useEffect(() => {
    if (mode !== "organizer" || eventId === undefined) {
      setReviewerMembersLoading(false);
      setReviewerMembersError(null);
      return;
    }
    let active = true;
    setReviewerMembersLoading(true);
    setReviewerMembersError(null);
    setReviewerMembers([]);
    let memberApi = providedMemberApi;
    if (memberApi === undefined) {
      if (reviewerOrganizationId === null) {
        setReviewerMembersLoading(false);
        setReviewerMembersError("The organization member API is not configured.");
        return () => {
          active = false;
        };
      }
      try {
        memberApi = createMemberApi(baseUrl || browserSameOrigin(), reviewerOrganizationId);
      } catch (reason: unknown) {
        setReviewerMembersLoading(false);
        setReviewerMembersError(
          reason instanceof Error
            ? reason.message
            : "The organization member API could not be initialized.",
        );
        return () => {
          active = false;
        };
      }
    }
    void memberApi
      .listMembers()
      .then((members) => {
        if (!active) return;
        if (
          reviewerOrganizationId !== null &&
          members.some((member) => member.organizationId !== reviewerOrganizationId)
        ) {
          throw new TypeError("The member response belongs to another organization.");
        }
        setReviewerMembers(members);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setReviewerMembers([]);
        setReviewerMembersError(
          reason instanceof Error ? reason.message : "The organization member request failed.",
        );
      })
      .finally(() => {
        if (active) setReviewerMembersLoading(false);
      });
    return () => {
      active = false;
    };
  }, [baseUrl, eventId, mode, providedMemberApi, reviewerOrganizationId]);

  useEffect(() => {
    if (initialStateProvided) return;
    let active = true;
    setLoading(true);
    setError(null);
    setMissingPlan(false);
    setSeed(null);
    setAssignment(null);
    setQueue(null);
    const load =
      mode === "organizer"
        ? eventId === undefined
          ? Promise.reject(new Error("An event is required for organizer review plans."))
          : loadOrganizerData(eventId, baseUrl)
        : loadEvaluatorQueue(eventId, baseUrl);
    void load
      .then((value) => {
        if (!active) return;
        if (mode === "organizer") setSeed(value as ReviewPlanSeed);
        else setQueue(value as readonly ReviewerQueueEntry[]);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        if (mode === "organizer" && reason instanceof MissingEvaluationPlanError) {
          setMissingPlan(true);
          return;
        }
        setError(reason instanceof Error ? reason.message : "The evaluation request failed.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [baseUrl, eventId, mode, initialStateProvided]);

  return {
    mode,
    explicitOrganizationId,
    eventId,
    baseUrl,
    reviewerQueueMode,
    seed,
    setSeed,
    assignment,
    queue,
    loading,
    error,
    missingPlan,
    setMissingPlan,
    reviewerMembers,
    reviewerMembersLoading,
    reviewerMembersError,
    createdPlanRefresh,
    setCreatedPlanRefresh,
    createdPlanRefreshLoading,
    createdPlanRefreshError,
    refreshCreatedPlan,
  };
}

export type ReviewWorkspaceController = ReturnType<typeof useReviewWorkspaceController>;
