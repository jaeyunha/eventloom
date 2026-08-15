import type { OrganizerEventRouteIdentity } from "./organizer-event-route";
import {
  parseOrganizerEventCollection,
  resolveOrganizerEventReference,
} from "./organizer-event-route";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function eventWorkspaceNameFromResponse(payload: unknown, eventId: string): string | null {
  if (!isRecord(payload) || !isRecord(payload.data)) return null;
  const event = payload.data;
  if (event.id !== eventId || typeof event.name !== "string") return null;
  const name = event.name.trim();
  return name.length > 0 ? name : null;
}

export async function fetchOrganizerEventName(
  apiBaseUrl: string,
  organizationId: string,
  eventId: string,
  fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> = fetch,
): Promise<string | null> {
  const response = await fetcher(
    `${apiBaseUrl}/api/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventId)}`,
    {
      credentials: "include",
      headers: { Accept: "application/json" },
      cache: "no-store",
    },
  );
  if (!response.ok) return null;
  return eventWorkspaceNameFromResponse(await response.json().catch(() => null), eventId);
}

export function eventWorkspaceFromCollectionResponse(
  payload: unknown,
  eventReference: string,
): OrganizerEventRouteIdentity | null {
  try {
    return (
      resolveOrganizerEventReference(parseOrganizerEventCollection(payload), eventReference) ?? null
    );
  } catch {
    return null;
  }
}

export async function fetchOrganizerEventWorkspace(
  apiBaseUrl: string,
  organizationId: string,
  eventReference: string,
  fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> = fetch,
): Promise<OrganizerEventRouteIdentity | null> {
  const response = await fetcher(
    `${apiBaseUrl}/api/admin/organizations/${encodeURIComponent(organizationId)}/events`,
    {
      credentials: "include",
      headers: { Accept: "application/json" },
      cache: "no-store",
    },
  );
  if (!response.ok) return null;
  return eventWorkspaceFromCollectionResponse(
    await response.json().catch(() => null),
    eventReference,
  );
}
