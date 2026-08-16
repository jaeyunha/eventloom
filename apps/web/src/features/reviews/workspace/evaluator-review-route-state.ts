const assignmentQueryParameter = "assignmentId";

function optionalIdentifier(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function requiredIdentifier(value: string, label: string): string {
  const normalized = optionalIdentifier(value);
  if (normalized === null) throw new TypeError(`${label} is required.`);
  return normalized;
}

export function reviewAssignmentIdFromSearchParams(searchParams: URLSearchParams): string | null {
  return optionalIdentifier(searchParams.get(assignmentQueryParameter));
}

export function reviewQueueUrlWithAssignment(currentUrl: URL, assignmentId: string | null): URL {
  const nextUrl = new URL(currentUrl);
  const normalizedAssignmentId = optionalIdentifier(assignmentId);
  if (normalizedAssignmentId === null) {
    nextUrl.searchParams.delete(assignmentQueryParameter);
  } else {
    nextUrl.searchParams.set(assignmentQueryParameter, normalizedAssignmentId);
  }
  return nextUrl;
}

export function reviewAssignmentPageHref({
  assignmentId,
  organizationId,
  eventId,
}: Readonly<{
  assignmentId: string;
  organizationId: string;
  eventId: string;
}>): string {
  const searchParams = new URLSearchParams({
    organizationId: requiredIdentifier(organizationId, "Organization ID"),
    eventId: requiredIdentifier(eventId, "Event ID"),
  });
  return `/review/${encodeURIComponent(
    requiredIdentifier(assignmentId, "Assignment ID"),
  )}?${searchParams.toString()}`;
}

export function reviewerQueueHref({
  organizationId,
  eventId,
}: Readonly<{
  organizationId?: string | undefined;
  eventId?: string | undefined;
}>): string {
  const searchParams = new URLSearchParams();
  const normalizedOrganizationId = optionalIdentifier(organizationId);
  const normalizedEventId = optionalIdentifier(eventId);
  if (normalizedOrganizationId !== null) {
    searchParams.set("organizationId", normalizedOrganizationId);
  }
  if (normalizedEventId !== null) {
    searchParams.set("eventId", normalizedEventId);
  }
  const query = searchParams.toString();
  return query.length === 0 ? "/review" : `/review?${query}`;
}
