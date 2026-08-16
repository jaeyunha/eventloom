import { sessionHasAuthenticatedUser } from "../auth/session";
import type { OrganizerEventContext } from "./admin-navigation";

export const ORGANIZER_ORGANIZATION_STORAGE_KEY = "eventloom.organizer-organization";
export const LEGACY_ORGANIZER_ORGANIZATION_STORAGE_KEY = "open-sessionboard.organizer-organization";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sessionMemberships(value: unknown): readonly unknown[] {
  if (!isRecord(value)) return [];
  if (Array.isArray(value.memberships)) return value.memberships;
  return isRecord(value.data) && Array.isArray(value.data.memberships)
    ? value.data.memberships
    : [];
}

export function qualifiedEventContext(pathname: string): OrganizerEventContext | null {
  const match = /^\/admin\/organizations\/([^/]+)\/events\/([^/]+)(?:\/|$)/.exec(pathname);
  if (!match?.[1] || !match[2]) return null;
  try {
    const organizationId = decodeURIComponent(match[1]).trim();
    const eventId = decodeURIComponent(match[2]).trim();
    return organizationId && eventId ? { organizationId, eventId } : null;
  } catch {
    return null;
  }
}

export function organizationIdFromPathname(pathname: string): string | null {
  const match = /^\/admin\/organizations\/([^/]+)(?:\/|$)/.exec(pathname);
  if (!match?.[1]) return null;
  try {
    const organizationId = decodeURIComponent(match[1]).trim();
    return organizationId.length > 0 ? organizationId : null;
  } catch {
    return null;
  }
}

export function isPublicMemberSetupPath(pathname: string): boolean {
  return /^\/admin\/organizations\/[^/]+\/members\/setup\/?$/u.test(pathname);
}

export function organizationIdForNavigation(
  eventContext: OrganizerEventContext | null,
  requiredOrganizationId: string | null,
  authenticatedOrganizationId: string | null,
): string | null {
  if (eventContext !== null) {
    const contextualOrganizationId = eventContext.organizationId.trim();
    return contextualOrganizationId.length > 0 ? contextualOrganizationId : null;
  }
  const required = requiredOrganizationId?.trim() ?? "";
  if (required.length > 0) return required;
  const authenticated = authenticatedOrganizationId?.trim() ?? "";
  return authenticated.length > 0 ? authenticated : null;
}

export function organizerOrganizationIdsFromSession(value: unknown): readonly string[] {
  const organizationIds = new Set<string>();
  for (const membership of sessionMemberships(value)) {
    if (!isRecord(membership)) continue;
    const organizationId =
      typeof membership.organizationId === "string"
        ? membership.organizationId.trim()
        : typeof membership.organization_id === "string"
          ? membership.organization_id.trim()
          : "";
    const role = typeof membership.role === "string" ? membership.role.trim().toLowerCase() : "";
    if ((role === "owner" || role === "admin") && organizationId.length > 0) {
      organizationIds.add(organizationId);
    }
  }
  return [...organizationIds].sort((left, right) => left.localeCompare(right));
}

export function organizerOrganizationIdFromSession(
  value: unknown,
  requiredOrganizationId: string | null,
  preferredOrganizationId: string | null = null,
): string | null {
  const selectedOrganizationId = requiredOrganizationId?.trim() ?? "";
  const organizationIds = organizerOrganizationIdsFromSession(value);
  if (selectedOrganizationId.length > 0) {
    return organizationIds.includes(selectedOrganizationId) ? selectedOrganizationId : null;
  }
  const preferred = preferredOrganizationId?.trim() ?? "";
  if (preferred.length > 0 && organizationIds.includes(preferred)) return preferred;
  return organizationIds[0] ?? null;
}

export function sessionHasOrganizerMembership(
  value: unknown,
  organizationId: string | null,
): boolean {
  return organizerOrganizationIdFromSession(value, organizationId) !== null;
}

export function sessionAllowsOrganizerAccess(value: unknown): boolean {
  return sessionHasAuthenticatedUser(value);
}
