"use client";

export interface EvaluatorDraftSnapshot {
  readonly scoreValues: Readonly<Record<string, string>>;
  readonly responseValues: Readonly<Record<string, string>>;
  readonly humanConfirmed: readonly string[];
  readonly comment: string;
  readonly reviewVersion?: number | undefined;
}
