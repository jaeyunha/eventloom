import type { AuthPrincipal } from "../features/auth/types";
import {
  evaluationRolesForOrganizationMembership,
  evaluationRolesForPrincipal,
} from "../features/evaluations/access";
import type { EvaluationActor } from "../features/evaluations/types";

interface EvaluationActorRepository {
  getAssignment(organizationId: string, assignmentId: string): Promise<{ eventId: string } | null>;
  getPlan(organizationId: string, planId: string): Promise<{ eventId: string } | null>;
  listPlans(organizationId: string): Promise<readonly { eventId: string; id: string }[]>;
}

interface EvaluationEventRepository {
  getEvent(organizationId: string, eventId: string): Promise<unknown | null>;
}

interface EvaluationActorResolverDependencies {
  cfpRepository: EvaluationEventRepository;
  evaluationRepository: EvaluationActorRepository;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function eventIdFromRequest(request: Request): string | undefined {
  const url = new URL(request.url);
  const pathId = /\/events\/([^/]+)/u.exec(url.pathname)?.[1];
  if (pathId !== undefined) return decodeURIComponent(pathId);
  const eventId = url.searchParams.get("eventId")?.trim();
  return eventId && eventId.length > 0 ? eventId : undefined;
}

function organizationIdFromRequest(body: unknown, request: Request): string | null | undefined {
  let rawOrganizationId: unknown;
  if (isRecord(body) && Object.hasOwn(body, "organizationId")) {
    rawOrganizationId = body.organizationId;
  } else {
    const url = new URL(request.url);
    if (!url.searchParams.has("organizationId")) return undefined;
    rawOrganizationId = url.searchParams.get("organizationId");
  }
  if (typeof rawOrganizationId !== "string") return null;
  const organizationId = rawOrganizationId.trim();
  return organizationId.length > 0 && organizationId.length <= 100 ? organizationId : null;
}

export function createEvaluationActorResolver({
  cfpRepository,
  evaluationRepository,
}: EvaluationActorResolverDependencies) {
  return async function evaluationActorForRequest(
    principal: AuthPrincipal,
    request: Request,
  ): Promise<EvaluationActor | null> {
    if (principal.kind !== "user") return null;
    let body: unknown = null;
    if (request.method !== "GET" && request.method !== "HEAD") {
      try {
        body = await request.clone().json();
      } catch {
        body = null;
      }
    }
    let eventId = isRecord(body) && typeof body.eventId === "string" ? body.eventId : undefined;
    eventId ??= eventIdFromRequest(request);

    const authorizedOrganizationIds = [
      ...new Set([
        ...principal.memberships.map((membership) => membership.organizationId),
        ...principal.reviewerGrants.map((grant) => grant.organizationId),
      ]),
    ];
    const requestedOrganizationId = organizationIdFromRequest(body, request);
    if (requestedOrganizationId === null) return null;
    if (
      requestedOrganizationId !== undefined &&
      !authorizedOrganizationIds.includes(requestedOrganizationId)
    ) {
      return null;
    }
    const scopedOrganizationIds =
      requestedOrganizationId === undefined ? authorizedOrganizationIds : [requestedOrganizationId];

    const requestPath = new URL(request.url).pathname;
    if (eventId === undefined) {
      const planId = /\/plans\/([^/]+)/u.exec(requestPath)?.[1];
      if (planId !== undefined) {
        for (const organizationId of scopedOrganizationIds) {
          const plan = await evaluationRepository.getPlan(
            organizationId,
            decodeURIComponent(planId),
          );
          if (plan !== null) {
            eventId = plan.eventId;
            break;
          }
        }
      }
    }
    if (eventId === undefined && isRecord(body) && typeof body.planId === "string") {
      for (const organizationId of scopedOrganizationIds) {
        const plan = await evaluationRepository.getPlan(organizationId, body.planId);
        if (plan !== null) {
          eventId = plan.eventId;
          break;
        }
      }
    }
    if (eventId === undefined) {
      const assignmentId = /\/assignments\/([^/]+)/u.exec(requestPath)?.[1];
      if (assignmentId !== undefined) {
        for (const organizationId of scopedOrganizationIds) {
          const assignment = await evaluationRepository.getAssignment(
            organizationId,
            decodeURIComponent(assignmentId),
          );
          if (assignment !== null) {
            eventId = assignment.eventId;
            break;
          }
        }
      }
    }

    if (eventId === undefined || eventId.trim().length === 0) {
      const organizerGrants = (
        await Promise.all(
          principal.memberships
            .filter((membership) => scopedOrganizationIds.includes(membership.organizationId))
            .map(async (membership) => {
              const roles = evaluationRolesForOrganizationMembership(membership.role);
              if (!roles.includes("organizer")) return [];
              const plans = await evaluationRepository.listPlans(membership.organizationId);
              return plans.map((plan) => ({
                tenantId: membership.organizationId,
                eventId: plan.eventId,
                role: "organizer" as const,
              }));
            }),
        )
      ).flat();
      const reviewerGrants = principal.reviewerGrants
        .filter((grant) => scopedOrganizationIds.includes(grant.organizationId))
        .map((grant) => ({
          tenantId: grant.organizationId,
          eventId: grant.eventId,
          role: "reviewer" as const,
        }));
      const grants = [...organizerGrants, ...reviewerGrants].filter(
        (grant, index, all) =>
          all.findIndex(
            (candidate) =>
              candidate.tenantId === grant.tenantId &&
              candidate.eventId === grant.eventId &&
              candidate.role === grant.role,
          ) === index,
      );
      const tenantIds = [...new Set(grants.map((grant) => grant.tenantId))];
      if (tenantIds.length !== 1) return null;
      const selectedTenantId = tenantIds[0];
      if (selectedTenantId === undefined) return null;
      return {
        kind: "human",
        tenantId: selectedTenantId,
        userId: principal.userId,
        grants: grants.map(({ eventId: grantedEventId, role }) => ({
          eventId: grantedEventId,
          role,
        })),
      };
    }

    const matchingOrganizationIds: string[] = [];
    for (const organizationId of scopedOrganizationIds) {
      if ((await cfpRepository.getEvent(organizationId, eventId)) !== null) {
        matchingOrganizationIds.push(organizationId);
      }
    }
    if (matchingOrganizationIds.length !== 1) return null;
    const selectedOrganizationId = matchingOrganizationIds[0];
    if (selectedOrganizationId === undefined) return null;
    const roles = evaluationRolesForPrincipal(principal, selectedOrganizationId, eventId);
    if (roles.length === 0) return null;
    return {
      kind: "human",
      tenantId: selectedOrganizationId,
      userId: principal.userId,
      grants: roles.map((role) => ({ eventId, role })),
    };
  };
}
