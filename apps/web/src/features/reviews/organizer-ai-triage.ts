"use client";

import { useEffect, useMemo, useState } from "react";
import { evaluationRequest } from "./workspace/model-evaluation-request";

export interface OrganizerAiTriageCandidate {
  readonly criterionId: string;
  readonly value: number;
  readonly evidence: readonly string[];
}

export interface OrganizerAiTriageSuggestion {
  readonly id: string;
  readonly submissionId: string;
  readonly status: "pending" | "stale" | "overridden";
  readonly version: number;
  readonly candidates: Readonly<Record<string, readonly OrganizerAiTriageCandidate[]>>;
  readonly provenance: {
    readonly provider: string;
    readonly model: string;
    readonly generatedAt: string;
    readonly sourceReferences?: readonly string[] | undefined;
  };
  readonly override?:
    | {
        readonly valueByCriterion: Readonly<Record<string, number | string>>;
        readonly reason?: string | undefined;
      }
    | null
    | undefined;
}

export interface OrganizerAiTriageView {
  readonly enabled: boolean;
  readonly criterionLabels: Readonly<Record<string, string>>;
  readonly suggestions: Readonly<Record<string, OrganizerAiTriageSuggestion>>;
  readonly loading: boolean;
  readonly busySubmissionId: string | null;
  readonly error: string | null;
  readonly onGenerate: (submissionId: string, regenerate: boolean) => Promise<void>;
  readonly onOverride: (
    suggestionId: string,
    expectedVersion: number,
    valueByCriterion: Readonly<Record<string, number>>,
    reason: string,
  ) => Promise<void>;
}

interface OrganizerAiTriageState {
  readonly key: string;
  readonly suggestions: readonly OrganizerAiTriageSuggestion[];
}

function roundSuggestionPath(planId: string, roundId: string): string {
  return `/plans/${encodeURIComponent(planId)}/rounds/${encodeURIComponent(roundId)}/suggestions`;
}

function toErrorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}

export function useOrganizerAiTriage({
  baseUrl,
  planId,
  roundId,
  enabled,
}: {
  readonly baseUrl: string;
  readonly planId: string;
  readonly roundId: string;
  readonly enabled: boolean;
}): Omit<OrganizerAiTriageView, "criterionLabels"> {
  const key = `${planId}:${roundId}`;
  const active = enabled && planId.length > 0 && roundId.length > 0;
  const [state, setState] = useState<OrganizerAiTriageState>({ key: "", suggestions: [] });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<{ readonly key: string; readonly submissionId: string } | null>(
    null,
  );
  const [error, setError] = useState<{ readonly key: string; readonly message: string } | null>(
    null,
  );

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void evaluationRequest<{ readonly suggestions: readonly OrganizerAiTriageSuggestion[] }>(
      baseUrl,
      roundSuggestionPath(planId, roundId),
    )
      .then((result) => {
        if (!cancelled) setState({ key, suggestions: result.suggestions });
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError({
            key,
            message: toErrorMessage(reason, "AI triage results could not be loaded."),
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, baseUrl, key, planId, roundId]);

  const suggestions = state.key === key ? state.suggestions : [];
  const suggestionsBySubmission = useMemo(
    () =>
      suggestions.reduce<Readonly<Record<string, OrganizerAiTriageSuggestion>>>(
        (current, suggestion) => ({ ...current, [suggestion.submissionId]: suggestion }),
        {},
      ),
    [suggestions],
  );

  async function generate(submissionId: string, regenerate: boolean): Promise<void> {
    if (!active) return;
    setBusy({ key, submissionId });
    setError(null);
    try {
      const suggestion = await evaluationRequest<OrganizerAiTriageSuggestion>(
        baseUrl,
        `${roundSuggestionPath(planId, roundId)}/submissions/${encodeURIComponent(submissionId)}/suggestions/generate`,
        { method: "POST", body: JSON.stringify({ regenerate }) },
      );
      setState((current) =>
        current.key !== key
          ? current
          : {
              key,
              suggestions: [
                ...current.suggestions.filter((item) => item.submissionId !== submissionId),
                suggestion,
              ],
            },
      );
    } catch (reason: unknown) {
      setError({
        key,
        message: toErrorMessage(reason, "AI triage could not be generated."),
      });
    } finally {
      setBusy((current) =>
        current?.key === key && current.submissionId === submissionId ? null : current,
      );
    }
  }

  async function override(
    suggestionId: string,
    expectedVersion: number,
    valueByCriterion: Readonly<Record<string, number>>,
    reason: string,
  ): Promise<void> {
    const suggestion = suggestions.find((item) => item.id === suggestionId);
    if (!active || suggestion === undefined) return;
    setBusy({ key, submissionId: suggestion.submissionId });
    setError(null);
    try {
      const updated = await evaluationRequest<OrganizerAiTriageSuggestion>(
        baseUrl,
        `${roundSuggestionPath(planId, roundId)}/${encodeURIComponent(suggestionId)}/override`,
        {
          method: "PUT",
          body: JSON.stringify({
            expectedVersion,
            valueByCriterion,
            ...(reason.trim().length === 0 ? {} : { reason: reason.trim() }),
          }),
        },
      );
      setState((current) =>
        current.key !== key
          ? current
          : {
              key,
              suggestions: current.suggestions.map((item) =>
                item.id === updated.id ? updated : item,
              ),
            },
      );
    } catch (reason: unknown) {
      setError({
        key,
        message: toErrorMessage(reason, "AI triage override could not be saved."),
      });
    } finally {
      setBusy((current) =>
        current?.key === key && current.submissionId === suggestion.submissionId ? null : current,
      );
    }
  }

  return {
    enabled,
    suggestions: suggestionsBySubmission,
    loading: active && loading,
    busySubmissionId: busy?.key === key ? busy.submissionId : null,
    error: error?.key === key ? error.message : null,
    onGenerate: generate,
    onOverride: override,
  };
}
