export interface OrganizerEventRouteIdentity {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

function recordFrom(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function requiredString(
  record: Readonly<Record<string, unknown>>,
  key: keyof OrganizerEventRouteIdentity,
): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError("The organizer event collection response was invalid.");
  }
  return value.trim();
}

function routeSegment(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized === "") throw new TypeError(`${label} is required.`);
  return encodeURIComponent(normalized);
}

export function parseOrganizerEventCollection(
  payload: unknown,
): readonly OrganizerEventRouteIdentity[] {
  const envelope = recordFrom(payload);
  if (!envelope || !Array.isArray(envelope.data)) {
    throw new TypeError("The organizer event collection response was invalid.");
  }

  return envelope.data.map((value) => {
    const event = recordFrom(value);
    if (!event) throw new TypeError("The organizer event collection response was invalid.");
    return {
      id: requiredString(event, "id"),
      name: requiredString(event, "name"),
      slug: requiredString(event, "slug"),
    };
  });
}

export function resolveOrganizerEventReference(
  events: readonly OrganizerEventRouteIdentity[],
  eventReference: string,
): OrganizerEventRouteIdentity | undefined {
  const normalizedReference = eventReference.trim();
  const slugReference = normalizedReference.toLocaleLowerCase("en-US");
  const slugMatch = events.find((event) => event.slug.toLocaleLowerCase("en-US") === slugReference);
  const idMatch = events.find((event) => event.id === normalizedReference);
  if (slugMatch && idMatch && slugMatch.id !== idMatch.id) return undefined;
  return slugMatch ?? idMatch;
}

export function organizerEventWorkspaceHref(
  organizationId: string,
  eventReference: string,
  suffix = "",
): string {
  const normalizedSuffix = suffix === "" || suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `/admin/organizations/${routeSegment(
    organizationId,
    "Organization ID",
  )}/events/${routeSegment(eventReference, "Event reference")}${normalizedSuffix}`;
}

export function canonicalOrganizerEventPath(
  pathname: string,
  organizationId: string,
  eventReference: string,
  event: OrganizerEventRouteIdentity,
): string | null {
  if (eventReference === event.id) return null;

  const incomingBasePath = organizerEventWorkspaceHref(organizationId, eventReference);
  if (pathname !== incomingBasePath && !pathname.startsWith(`${incomingBasePath}/`)) return null;

  const canonicalBasePath = organizerEventWorkspaceHref(organizationId, event.id);
  const canonicalPath = `${canonicalBasePath}${pathname.slice(incomingBasePath.length)}`;
  return canonicalPath === pathname ? null : canonicalPath;
}

export function canonicalOrganizerEventHref(
  pathname: string,
  query: string,
  organizationId: string,
  eventReference: string,
  event: OrganizerEventRouteIdentity,
): string | null {
  const canonicalPath = canonicalOrganizerEventPath(
    pathname,
    organizationId,
    eventReference,
    event,
  );
  if (canonicalPath === null) return null;
  return query === "" ? canonicalPath : `${canonicalPath}?${query}`;
}
