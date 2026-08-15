export type AdminCommandEventStatus = "active" | "archived" | "draft";

export interface AdminCommandEvent {
  readonly endsAt: string;
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly startsAt: string;
  readonly status: AdminCommandEventStatus;
}

export interface AdminCommandPage {
  readonly current: boolean;
  readonly group: string;
  readonly href: string;
  readonly icon: string;
  readonly keywords: string;
  readonly label: string;
}

interface AdminCommandResultBase {
  readonly group: string;
  readonly href: string;
  readonly key: string;
  readonly label: string;
}

export interface AdminCommandEventResult extends AdminCommandResultBase {
  readonly current: boolean;
  readonly endsAt: string;
  readonly group: "Events";
  readonly kind: "event";
  readonly startsAt: string;
  readonly status: AdminCommandEventStatus;
}

export interface AdminCommandPageResult extends AdminCommandResultBase {
  readonly icon: string;
  readonly kind: "page";
}

export type AdminCommandResult = AdminCommandEventResult | AdminCommandPageResult;

type AdminCommandEventsFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export class AdminCommandEventsError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`The command palette could not load events (HTTP ${status}).`);
    this.name = "AdminCommandEventsError";
    this.status = status;
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`The command palette event ${field} must be a non-empty string.`);
  }
  return value.trim();
}

function eventStatus(value: unknown): AdminCommandEventStatus {
  if (value === "active" || value === "archived" || value === "draft") return value;
  throw new TypeError("The command palette event status must be active, archived, or draft.");
}

function eventDate(value: unknown, field: string): string {
  const date = requiredString(value, field);
  if (!Number.isFinite(Date.parse(date))) {
    throw new TypeError(`The command palette event ${field} must be an ISO date string.`);
  }
  return date;
}

export function parseAdminCommandEventsResponse(payload: unknown): readonly AdminCommandEvent[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new TypeError("The command palette event response data must be an array.");
  }
  return payload.data.map((value, index) => {
    if (!isRecord(value)) {
      throw new TypeError(`The command palette event at data[${index}] must be an object.`);
    }
    return {
      endsAt: eventDate(value.endsAt, "endsAt"),
      id: requiredString(value.id, "id"),
      name: requiredString(value.name, "name"),
      slug: requiredString(value.slug, "slug"),
      startsAt: eventDate(value.startsAt, "startsAt"),
      status: eventStatus(value.status),
    };
  });
}

export async function loadAdminCommandEvents(
  organizationId: string,
  signal?: AbortSignal,
  fetcher: AdminCommandEventsFetcher = globalThis.fetch,
): Promise<readonly AdminCommandEvent[]> {
  const normalizedOrganizationId = organizationId.trim();
  if (normalizedOrganizationId.length === 0) {
    throw new TypeError("An organization ID is required to load command palette events.");
  }
  const response = await fetcher(
    `/api/admin/organizations/${encodeURIComponent(normalizedOrganizationId)}/events`,
    {
      cache: "no-store",
      credentials: "include",
      headers: { Accept: "application/json" },
      ...(signal === undefined ? {} : { signal }),
    },
  );
  if (!response.ok) throw new AdminCommandEventsError(response.status);
  const payload: unknown = await response.json().catch(() => undefined);
  return parseAdminCommandEventsResponse(payload);
}

function matchesQuery(searchable: string, query: string): boolean {
  const tokens = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  if (tokens.length === 0) return true;
  const normalized = searchable.toLocaleLowerCase();
  return tokens.every((token) => normalized.includes(token));
}

export function buildAdminCommandResults({
  currentEventId,
  events,
  organizationId,
  pages,
  query,
}: Readonly<{
  currentEventId: string | null;
  events: readonly AdminCommandEvent[];
  organizationId: string | null;
  pages: readonly AdminCommandPage[];
  query: string;
}>): readonly AdminCommandResult[] {
  const eventResults: readonly AdminCommandEventResult[] =
    organizationId === null
      ? []
      : events
          .filter((event) =>
            matchesQuery(`${event.name} ${event.status} ${event.startsAt} ${event.endsAt}`, query),
          )
          .map((event) => ({
            current: event.id === currentEventId,
            endsAt: event.endsAt,
            group: "Events",
            href: `/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(event.slug)}`,
            key: `event:${event.id}`,
            kind: "event",
            label: event.name,
            startsAt: event.startsAt,
            status: event.status,
          }));

  const seenPageHrefs = new Set<string>();
  const pageResults = pages.flatMap((page): readonly AdminCommandPageResult[] => {
    if (
      page.current ||
      seenPageHrefs.has(page.href) ||
      !matchesQuery(`${page.label} ${page.group} ${page.keywords}`, query)
    ) {
      return [];
    }
    seenPageHrefs.add(page.href);
    return [
      {
        group: page.group,
        href: page.href,
        icon: page.icon,
        key: `page:${page.href}`,
        kind: "page",
        label: page.label,
      },
    ];
  });

  return [...eventResults, ...pageResults];
}

export type AdminCommandSelectionDirection = "first" | "last" | "next" | "previous";

export function nextCommandSelectionIndex(
  currentIndex: number,
  resultCount: number,
  direction: AdminCommandSelectionDirection,
): number {
  if (resultCount === 0) return -1;
  switch (direction) {
    case "first":
      return 0;
    case "last":
      return resultCount - 1;
    case "next":
      return (Math.max(currentIndex, -1) + 1) % resultCount;
    case "previous":
      return currentIndex <= 0 ? resultCount - 1 : currentIndex - 1;
  }
}
