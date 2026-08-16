export interface AirtableProjectionQueue {
  send(message: {
    version: 2;
    kind: "airtable-projection";
    jobId: string;
    tenantId: string;
    enqueuedAt: string;
  }): Promise<void>;
}

export interface AirtableProjectionDispatchStore {
  listDue(
    now: string,
    limit: number,
  ): Promise<
    Array<{
      id: string;
      organizationId: string;
    }>
  >;
  markQueued(jobId: string, queuedAt: string): Promise<boolean>;
}

export async function dispatchDueAirtableProjectionJobs(input: {
  now: string;
  limit?: number;
  store: AirtableProjectionDispatchStore;
  queue: AirtableProjectionQueue;
}): Promise<{ sent: number; skipped: number }> {
  const jobs = await input.store.listDue(input.now, input.limit ?? 25);
  let sent = 0;
  let skipped = 0;
  for (const job of jobs) {
    await input.queue.send({
      version: 2,
      kind: "airtable-projection",
      jobId: job.id,
      tenantId: job.organizationId,
      enqueuedAt: input.now,
    });
    if (await input.store.markQueued(job.id, input.now)) {
      sent += 1;
    } else {
      skipped += 1;
    }
  }
  return { sent, skipped };
}

export async function sweepAirtableProjectionJobs(input: {
  now: string;
  releaseExpired(now: string): Promise<number>;
  dispatch(): Promise<{ sent: number; skipped: number }>;
}): Promise<{ released: number; sent: number; skipped: number }> {
  const released = await input.releaseExpired(input.now);
  const dispatched = await input.dispatch();
  return { released, ...dispatched };
}
