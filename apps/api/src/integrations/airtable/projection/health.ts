export interface AirtableProjectionHealthCounts {
  pending: number;
  claimed: number;
  retry: number;
  dead: number;
  openConflicts: number;
}

export interface AirtableProjectionHealthSnapshot {
  counts: AirtableProjectionHealthCounts;
  oldestOutstandingAt: string | null;
  lastSuccessAt: string | null;
  lastErrorCode: string | null;
  lastError: string | null;
}

export interface AirtableProjectionHealthStore {
  getSnapshot(connectionId: string): Promise<AirtableProjectionHealthSnapshot>;
}

export interface AirtableProjectionHealthSummary extends AirtableProjectionHealthCounts {
  outstanding: number;
  lagSeconds: number;
  lastSuccessAt: string | null;
  error: { code: string | null; message: string } | null;
}

export async function getAirtableProjectionHealth(
  connectionId: string,
  dependencies: {
    health: AirtableProjectionHealthStore;
    now: () => string;
  },
): Promise<AirtableProjectionHealthSummary> {
  const snapshot = await dependencies.health.getSnapshot(connectionId);
  const outstanding = snapshot.counts.pending + snapshot.counts.claimed + snapshot.counts.retry;
  const lagSeconds =
    snapshot.oldestOutstandingAt === null
      ? 0
      : Math.max(
          0,
          Math.floor(
            (Date.parse(dependencies.now()) - Date.parse(snapshot.oldestOutstandingAt)) / 1_000,
          ),
        );

  return {
    ...snapshot.counts,
    outstanding,
    lagSeconds,
    lastSuccessAt: snapshot.lastSuccessAt,
    error:
      snapshot.lastError === null
        ? null
        : { code: snapshot.lastErrorCode, message: snapshot.lastError },
  };
}
