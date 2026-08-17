"use client";

export interface ApiSuggestion {
  id: string;
  status: "pending" | "accepted" | "edited" | "rejected" | "stale";
  version: number;
  rubricRevision: number;
  submissionRevision: number;
  candidates: Readonly<
    Record<
      string,
      readonly {
        id: string;
        criterionId: string;
        value: number;
        evidence: readonly string[];
        provenance?: {
          provider: string;
          model: string;
          generatedAt?: string;
          sourceReferences: readonly string[];
          promptVersion?: string;
          traceId?: string;
        };
      }[]
    >
  >;
  provenance: {
    provider: string;
    model: string;
    generatedAt?: string;
    sourceReferences: readonly string[];
    promptVersion?: string;
    traceId?: string;
  };
  history?: readonly {
    action: "accept" | "edit" | "reject" | "generate" | "stale";
    criterionId?: string;
    valueByCriterion?: Readonly<Record<string, number>>;
  }[];
}
