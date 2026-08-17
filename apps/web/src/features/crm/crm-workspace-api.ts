import {
  type CrmAnalytics,
  type CrmApi,
  CrmApiError,
  type CrmContact,
  type CrmDuplicateReport,
  type CrmEvent,
  type CrmEventProjectionResult,
  type CrmHistoryEntry,
  type CrmImportPreviewResult,
  type CrmImportResult,
  type CrmMergePreview,
  type CrmMergeResult,
  type CrmNote,
  type CrmOutreachCommand,
  type CrmPipelineEntry,
  type CrmSegment,
} from "./crm-workspace-model";

type CrmFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function encode(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new TypeError(`A ${label} is required.`);
  return encodeURIComponent(normalized);
}

function unwrap<T>(payload: unknown): T {
  if (typeof payload !== "object" || payload === null || !("data" in payload)) {
    throw new CrmApiError(
      "INVALID_RESPONSE",
      200,
      "The CRM response did not include a data envelope.",
    );
  }
  return (payload as { data: T }).data;
}

function errorFromPayload(payload: unknown, status: number): CrmApiError {
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const error = (
      payload as {
        error?: { code?: string; message?: string; traceId?: string; details?: unknown };
      }
    ).error;
    return new CrmApiError(
      error?.code ?? "CRM_REQUEST_FAILED",
      status,
      error?.message ?? "The CRM request could not be completed.",
      error?.traceId,
      error?.details,
    );
  }
  return new CrmApiError("CRM_REQUEST_FAILED", status, "The CRM request could not be completed.");
}

export function idempotencyKey(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

export function createCrmApi(
  apiBaseUrl: string,
  organizationId: string,
  fetcher: CrmFetcher = globalThis.fetch,
): CrmApi {
  const base = apiBaseUrl.trim().replace(/\/+$/u, "");
  const organizationSegment = encode(organizationId, "organization ID");
  const crmBase = `${base}/api/admin/organizations/${organizationSegment}/crm`;
  const eventsBase = `${base}/api/admin/organizations/${organizationSegment}/events`;

  async function request<T>(path: string, init: RequestInit = {}, endpoint = crmBase): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (init.body !== undefined) headers.set("content-type", "application/json");
    const response = await fetcher(`${endpoint}${path}`, {
      ...init,
      credentials: "include",
      cache: "no-store",
      headers: Object.fromEntries(headers.entries()),
    });
    const payload = await response.json().catch(() => undefined);
    if (!response.ok) throw errorFromPayload(payload, response.status);
    return unwrap<T>(payload);
  }

  const json = (value: unknown, key?: string): RequestInit => ({
    method: "POST",
    ...(key === undefined ? {} : { headers: { "idempotency-key": key } }),
    body: JSON.stringify(value),
  });

  return {
    listContacts(filter = {}) {
      const query = new URLSearchParams();
      if (filter.query?.trim()) query.set("query", filter.query.trim());
      if (filter.company?.trim()) query.set("company", filter.company.trim());
      if (filter.pipelineStage) query.set("pipelineStage", filter.pipelineStage);
      if (filter.status) query.set("status", filter.status);
      if (filter.tags?.trim()) query.set("tags", filter.tags.trim());
      if (filter.eventId?.trim()) query.set("eventId", filter.eventId.trim());
      const suffix = query.toString() ? `?${query.toString()}` : "";
      return request<readonly CrmContact[]>(`/contacts${suffix}`);
    },
    getContact(contactId) {
      return request<CrmContact>(`/contacts/${encode(contactId, "contact ID")}`);
    },
    createContact(input) {
      return request<CrmContact>("/contacts", json(input));
    },
    updateContact(contactId, input) {
      return request<CrmContact>(`/contacts/${encode(contactId, "contact ID")}`, {
        ...json(input),
        method: "PATCH",
      });
    },
    previewImport(csv) {
      return request<CrmImportPreviewResult>("/contacts/import/preview", json({ csv }));
    },
    importContacts(csv, key) {
      return request<CrmImportResult>("/contacts/import", json({ csv, idempotencyKey: key }, key));
    },
    listSegments() {
      return request<readonly CrmSegment[]>("/segments");
    },
    createSegment(input) {
      return request<CrmSegment>("/segments", json(input));
    },
    listSegmentContacts(segmentId) {
      return request<readonly CrmContact[]>(
        `/segments/${encode(segmentId, "segment ID")}/contacts`,
      );
    },
    findDuplicates(contactId) {
      return request<CrmDuplicateReport>(`/contacts/${encode(contactId, "contact ID")}/duplicates`);
    },
    previewMerge(contactId, duplicateContactIds, winners) {
      return request<CrmMergePreview>(
        `/contacts/${encode(contactId, "contact ID")}/merge/preview`,
        json({ duplicateContactIds, ...(winners ?? {}) }),
      );
    },
    mergeContacts(contactId, duplicateContactIds, key, winners) {
      return request<CrmMergeResult>(
        `/contacts/${encode(contactId, "contact ID")}/merge`,
        json({ duplicateContactIds, ...(winners ?? {}), idempotencyKey: key }, key),
      );
    },
    getContactHistory(contactId) {
      return request<readonly CrmHistoryEntry[]>(
        `/contacts/${encode(contactId, "contact ID")}/history`,
      );
    },
    getPipelineHistory(contactId) {
      return request<readonly CrmPipelineEntry[]>(
        `/contacts/${encode(contactId, "contact ID")}/pipeline/history`,
      );
    },
    updatePipeline(contactId, input) {
      return request<CrmContact>(
        `/contacts/${encode(contactId, "contact ID")}/pipeline`,
        json({
          stage: input.stage,
          expectedVersion: input.expectedVersion,
          ...(input.score === undefined ? {} : { score: input.score }),
          ...(input.rationale?.trim() ? { rationale: input.rationale.trim() } : {}),
          ...(input.note?.trim() ? { note: input.note.trim() } : {}),
        }),
      );
    },
    listNotes(contactId) {
      return request<readonly CrmNote[]>(`/contacts/${encode(contactId, "contact ID")}/notes`);
    },
    addNote(contactId, body) {
      return request<CrmNote>(`/contacts/${encode(contactId, "contact ID")}/notes`, json({ body }));
    },
    addContactToEvent(contactId, input, key) {
      return request<CrmEventProjectionResult>(
        `/contacts/${encode(contactId, "contact ID")}/events`,
        json({ ...input, idempotencyKey: key }, key),
      );
    },
    sendOutreach(input, key) {
      return request<CrmOutreachCommand>("/outreach", json({ ...input, idempotencyKey: key }, key));
    },
    analytics() {
      return request<CrmAnalytics>("/analytics");
    },
    listEvents() {
      return request<readonly CrmEvent[]>("", {}, eventsBase);
    },
  };
}
