import {
  type ApiKeyPrincipal,
  type ApiKeyScope,
  AuthAccessError,
  type AuthPrincipal,
  type OrganizationRole,
  type UserPrincipal,
} from "./types";

export interface SpeakerOwnedResource {
  organizationId: string;
  speakerProfileId: string;
  ownerUserId: string;
}

function forbidden(): never {
  throw new AuthAccessError("FORBIDDEN", "The authenticated identity cannot access this resource.");
}

export function requireTenantScope(
  principal: AuthPrincipal,
  organizationId: string,
): AuthPrincipal {
  if (principal.kind === "apiKey") {
    if (principal.organizationId !== organizationId) {
      forbidden();
    }
    return principal;
  }

  const hasMembership = principal.memberships.some(
    (membership) => membership.organizationId === organizationId,
  );
  const hasReviewerGrant = principal.reviewerGrants.some(
    (grant) => grant.organizationId === organizationId,
  );
  const hasSpeakerGrant = principal.speakerGrants.some(
    (grant) => grant.organizationId === organizationId,
  );
  if (!hasMembership && !hasReviewerGrant && !hasSpeakerGrant) {
    forbidden();
  }
  return principal;
}

export function requireOrganizationRole(
  principal: AuthPrincipal,
  organizationId: string,
  allowedRoles: readonly OrganizationRole[],
): UserPrincipal {
  if (principal.kind !== "user") {
    forbidden();
  }

  const membership = principal.memberships.find(
    (candidate) => candidate.organizationId === organizationId,
  );
  if (!membership || !allowedRoles.includes(membership.role)) {
    forbidden();
  }
  return principal;
}

export function hasReviewerGrant(
  principal: UserPrincipal,
  organizationId: string,
  eventId: string,
): boolean {
  return principal.reviewerGrants.some(
    (grant) => grant.organizationId === organizationId && grant.eventId === eventId,
  );
}

export function requireReviewerGrant(
  principal: AuthPrincipal,
  organizationId: string,
  eventId: string,
): UserPrincipal {
  if (principal.kind !== "user" || !hasReviewerGrant(principal, organizationId, eventId)) {
    forbidden();
  }
  return principal;
}

export function requireApiKeyScope(
  principal: AuthPrincipal,
  organizationId: string,
  requiredScope: ApiKeyScope,
): ApiKeyPrincipal {
  if (
    principal.kind !== "apiKey" ||
    principal.organizationId !== organizationId ||
    !principal.scopes.includes(requiredScope)
  ) {
    forbidden();
  }
  return principal;
}

export function requireSpeakerOwnership(
  principal: AuthPrincipal,
  resource: SpeakerOwnedResource,
): UserPrincipal {
  if (principal.kind !== "user") {
    forbidden();
  }

  const organizer = principal.memberships.some(
    (membership) =>
      membership.organizationId === resource.organizationId &&
      (membership.role === "owner" || membership.role === "admin"),
  );
  if (organizer) {
    return principal;
  }

  const ownsResource =
    principal.userId === resource.ownerUserId &&
    principal.speakerGrants.some(
      (grant) =>
        grant.organizationId === resource.organizationId &&
        grant.speakerProfileId === resource.speakerProfileId,
    );
  if (!ownsResource) {
    forbidden();
  }
  return principal;
}
