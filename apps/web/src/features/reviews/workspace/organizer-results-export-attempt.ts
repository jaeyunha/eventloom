"use client";

import type { Fetcher } from "./api-fetcher";
import type {
  OrganizerResultsExportRun,
  TerminalOrganizerResultsExportRun,
} from "./organizer-results-export-model";
import { createOrganizerResultsExport } from "./organizer-results-export-request";
import { waitForOrganizerResultsExport } from "./organizer-results-export-wait";

export interface StartOrganizerResultsExportAttemptInput {
  readonly baseUrl: string;
  readonly planId: string;
  readonly fetcher?: Fetcher;
  readonly signal?: AbortSignal;
  readonly waitForNextStatus?: () => Promise<void>;
  readonly onStatus: (run: OrganizerResultsExportRun) => void;
}

export interface OrganizerResultsExportAttemptRunner {
  start(input: StartOrganizerResultsExportAttemptInput): Promise<TerminalOrganizerResultsExportRun>;
}

export function createOrganizerResultsExportAttemptRunner(
  dependencies: { readonly idFactory?: () => string } = {},
): OrganizerResultsExportAttemptRunner {
  const idFactory = dependencies.idFactory ?? (() => crypto.randomUUID());
  let attempt: { readonly scope: string; readonly idempotencyKey: string } | undefined;

  return {
    async start(input) {
      const scope = `${input.baseUrl}\u0000${input.planId}`;
      if (attempt === undefined || attempt.scope !== scope) {
        attempt = { scope, idempotencyKey: idFactory() };
      }
      const queued = await createOrganizerResultsExport({
        baseUrl: input.baseUrl,
        planId: input.planId,
        idempotencyKey: attempt.idempotencyKey,
        ...(input.fetcher === undefined ? {} : { fetcher: input.fetcher }),
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      });
      input.onStatus(queued);
      const terminal = await waitForOrganizerResultsExport({
        baseUrl: input.baseUrl,
        planId: input.planId,
        initialRun: queued,
        ...(input.fetcher === undefined ? {} : { fetcher: input.fetcher }),
        ...(input.signal === undefined ? {} : { signal: input.signal }),
        ...(input.waitForNextStatus === undefined
          ? {}
          : { waitForNextStatus: input.waitForNextStatus }),
        onStatus: input.onStatus,
      });
      attempt = undefined;
      return terminal;
    },
  };
}
