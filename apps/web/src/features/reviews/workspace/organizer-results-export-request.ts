import type { Fetcher } from "./api-fetcher";
import type { OrganizerResultsExportRun } from "./organizer-results-export-model";
import {
  envelopeOrganizerResultsExportData,
  parseOrganizerResultsExportApiError,
  parseOrganizerResultsExportRun,
} from "./organizer-results-export-response";

function exportsPath(baseUrl: string, planId: string): string {
  return `${baseUrl}/api/admin/evaluations/plans/${encodeURIComponent(planId)}/exports`;
}

async function runRequest(
  url: string,
  init: RequestInit,
  fetcher: Fetcher,
): Promise<OrganizerResultsExportRun> {
  const response = await fetcher(url, {
    ...init,
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) throw await parseOrganizerResultsExportApiError(response);
  const body = (await response.json().catch(() => undefined)) as unknown;
  return parseOrganizerResultsExportRun(envelopeOrganizerResultsExportData(body));
}

export interface CreateOrganizerResultsExportInput {
  readonly baseUrl: string;
  readonly planId: string;
  readonly idempotencyKey: string;
  readonly fetcher?: Fetcher;
  readonly signal?: AbortSignal;
}

export async function createOrganizerResultsExport(
  input: CreateOrganizerResultsExportInput,
): Promise<OrganizerResultsExportRun> {
  const headers = new Headers({ accept: "application/json" });
  headers.set("Idempotency-Key", input.idempotencyKey);
  return runRequest(
    exportsPath(input.baseUrl, input.planId),
    {
      method: "POST",
      headers,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    },
    input.fetcher ?? fetch,
  );
}

export interface GetOrganizerResultsExportInput {
  readonly baseUrl: string;
  readonly planId: string;
  readonly runId: string;
  readonly fetcher?: Fetcher;
  readonly signal?: AbortSignal;
}

export async function getOrganizerResultsExport(
  input: GetOrganizerResultsExportInput,
): Promise<OrganizerResultsExportRun> {
  const path = `${exportsPath(input.baseUrl, input.planId)}/${encodeURIComponent(input.runId)}`;
  return runRequest(
    path,
    {
      method: "GET",
      headers: { accept: "application/json" },
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    },
    input.fetcher ?? fetch,
  );
}
