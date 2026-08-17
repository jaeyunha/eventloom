export interface ScopedReviewerPoolValue<T> {
  readonly scopeKey: string;
  readonly value: T;
}

export function reviewerPoolScopeKey(
  organizationId: string,
  eventId: string,
  roundId: string,
): string {
  return JSON.stringify([organizationId.trim(), eventId.trim(), roundId.trim()]);
}

export function scopedReviewerPoolValue<T>(
  scopeKey: string,
  state: ScopedReviewerPoolValue<T>,
  fallback: T,
): T {
  return state.scopeKey === scopeKey ? state.value : fallback;
}
