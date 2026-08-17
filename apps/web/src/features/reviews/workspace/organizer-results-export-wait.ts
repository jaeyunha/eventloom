import type { Fetcher } from "./api-fetcher";
import type {
  OrganizerResultsExportRun,
  TerminalOrganizerResultsExportRun,
} from "./organizer-results-export-model";
import { getOrganizerResultsExport } from "./organizer-results-export-request";

const DEFAULT_STATUS_WAIT_MS = 1_000;

function abortError(): DOMException {
  return new DOMException("The organizer results export wait was aborted.", "AbortError");
}

function waitForDelay(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason ?? abortError());
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, DEFAULT_STATUS_WAIT_MS);
    function onAbort(): void {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      reject(signal?.reason ?? abortError());
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export interface WaitForOrganizerResultsExportInput {
  readonly baseUrl: string;
  readonly planId: string;
  readonly initialRun: OrganizerResultsExportRun;
  readonly fetcher?: Fetcher;
  readonly signal?: AbortSignal;
  readonly waitForNextStatus?: () => Promise<void>;
  readonly onStatus?: (run: OrganizerResultsExportRun) => void;
}

export async function waitForOrganizerResultsExport(
  input: WaitForOrganizerResultsExportInput,
): Promise<TerminalOrganizerResultsExportRun> {
  let run = input.initialRun;
  while (run.status === "queued" || run.status === "running") {
    await (input.waitForNextStatus ?? (() => waitForDelay(input.signal)))();
    run = await getOrganizerResultsExport({
      baseUrl: input.baseUrl,
      planId: input.planId,
      runId: run.id,
      ...(input.fetcher === undefined ? {} : { fetcher: input.fetcher }),
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });
    input.onStatus?.(run);
  }
  return run;
}
