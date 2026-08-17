interface RevisionSyncSeed {
  readonly eventId: string;
  readonly planId: string;
}

export interface RetainedRevisionSync {
  readonly expectedVersion: number;
  readonly token: string;
}

function storageKey(seed: RevisionSyncSeed): string {
  return ["eventloom", "review-plan-revision-sync", seed.eventId, seed.planId].join(":");
}

export function readRetainedRevisionSync(seed: RevisionSyncSeed): RetainedRevisionSync | null {
  if (typeof window === "undefined") return null;
  const value = window.sessionStorage.getItem(storageKey(seed));
  if (value === null) return null;
  try {
    const parsed = JSON.parse(value) as Partial<RetainedRevisionSync>;
    return typeof parsed.token === "string" &&
      typeof parsed.expectedVersion === "number" &&
      Number.isInteger(parsed.expectedVersion)
      ? { token: parsed.token, expectedVersion: parsed.expectedVersion }
      : null;
  } catch {
    return null;
  }
}

export function retainRevisionSync(seed: RevisionSyncSeed, sync: RetainedRevisionSync): void {
  window.sessionStorage.setItem(storageKey(seed), JSON.stringify(sync));
}

export function clearRetainedRevisionSync(seed: RevisionSyncSeed): void {
  window.sessionStorage.removeItem(storageKey(seed));
}
