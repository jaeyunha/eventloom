import type { z } from "zod";
import {
  agendaPayloadSchema,
  agendaPreviewPayloadSchema,
  type EventOverviewAgenda,
  type EventOverviewData,
  type EventOverviewFetch,
  type EventOverviewSubmissions,
  errorPayloadSchema,
  eventPayloadSchema,
  submissionsPayloadSchema,
} from "./event-overview-contracts";

class EventOverviewRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "EventOverviewRequestError";
  }
}

function apiPath(
  organizationId: string,
  eventId: string,
  suffix: "" | "/submissions" | "/agenda" | "/agenda/preview",
): string {
  const organization = encodeURIComponent(organizationId);
  const event = encodeURIComponent(eventId);
  if (suffix === "/submissions") {
    return `/api/cfp/organizations/${organization}/events/${event}/submissions`;
  }
  return `/api/admin/organizations/${organization}/events/${event}${suffix}`;
}

async function requestPayload<T>(
  path: string,
  schema: z.ZodType<T>,
  signal: AbortSignal | undefined,
  fetcher: EventOverviewFetch,
): Promise<T> {
  const response = await fetcher(path, {
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json" },
    ...(signal === undefined ? {} : { signal }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsedError = errorPayloadSchema.safeParse(body);
    const message =
      parsedError.success && parsedError.data.error?.message !== undefined
        ? parsedError.data.error.message
        : `Request failed with status ${response.status}.`;
    throw new EventOverviewRequestError(response.status, message);
  }
  return schema.parse(body);
}

async function loadSubmissionMetrics(
  organizationId: string,
  eventId: string,
  signal: AbortSignal | undefined,
  fetcher: EventOverviewFetch,
): Promise<EventOverviewSubmissions> {
  try {
    const payload = await requestPayload(
      apiPath(organizationId, eventId, "/submissions"),
      submissionsPayloadSchema,
      signal,
      fetcher,
    );
    const statuses = payload.data.map((item) => item.submission.status);
    return {
      status: "ready",
      total: statuses.length,
      awaitingDecision: statuses.filter((status) =>
        ["submitted", "reopened", "under_review"].includes(status),
      ).length,
      accepted: statuses.filter((status) => status === "accepted").length,
    };
  } catch (error) {
    return {
      status: "unavailable",
      message:
        error instanceof EventOverviewRequestError && error.status === 404
          ? "Submission intake is not configured for this event."
          : "Submission metrics could not be loaded.",
    };
  }
}

async function loadAgendaMetrics(
  organizationId: string,
  eventId: string,
  signal: AbortSignal | undefined,
  fetcher: EventOverviewFetch,
): Promise<EventOverviewAgenda> {
  try {
    const [agenda, preview] = await Promise.all([
      requestPayload(
        apiPath(organizationId, eventId, "/agenda"),
        agendaPayloadSchema,
        signal,
        fetcher,
      ),
      requestPayload(
        apiPath(organizationId, eventId, "/agenda/preview"),
        agendaPreviewPayloadSchema,
        signal,
        fetcher,
      ),
    ]);
    const published = agenda.data.currentPublishedRevision;
    return {
      status: "ready",
      scheduledSessions: agenda.data.draft.entries.length,
      conflicts: preview.data.conflicts.length,
      publishedSessions: published?.sessionCount ?? published?.entries?.length ?? 0,
    };
  } catch {
    return { status: "unavailable", message: "Agenda metrics could not be loaded." };
  }
}

export async function loadEventOverviewData(
  organizationId: string,
  eventId: string,
  signal?: AbortSignal,
  fetcher: EventOverviewFetch = fetch,
): Promise<EventOverviewData> {
  const [eventPayload, submissions, agenda] = await Promise.all([
    requestPayload(apiPath(organizationId, eventId, ""), eventPayloadSchema, signal, fetcher),
    loadSubmissionMetrics(organizationId, eventId, signal, fetcher),
    loadAgendaMetrics(organizationId, eventId, signal, fetcher),
  ]);
  const event = eventPayload.data;
  if (event.id !== eventId || event.organizationId !== organizationId) {
    throw new Error("Event metadata response did not match the selected event.");
  }
  return { event, submissions, agenda };
}

export async function loadEventOverviewName(
  organizationId: string,
  eventId: string,
  signal?: AbortSignal,
  fetcher: EventOverviewFetch = fetch,
): Promise<string> {
  const payload = await requestPayload(
    apiPath(organizationId, eventId, ""),
    eventPayloadSchema,
    signal,
    fetcher,
  );
  if (payload.data.id !== eventId || payload.data.organizationId !== organizationId) {
    throw new Error("Event metadata response did not match the selected event.");
  }
  return payload.data.name;
}

export type {
  EventOverviewAgenda,
  EventOverviewData,
  EventOverviewEvent,
  EventOverviewFetch,
  EventOverviewSubmissions,
} from "./event-overview-contracts";
