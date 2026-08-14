import type { AccessContext, AgentCapability, AgentRole } from "@eventloom/contracts";
import type { UserPrincipal } from "../auth/types";
import { capabilityAllows } from "../speaker/capabilities";
import type { SpeakerAccessScope } from "../speaker/types";

export interface AccessOrganization {
  readonly organizationId: string;
  readonly name: string;
}

export interface AccessEvent {
  readonly organizationId: string;
  readonly eventId: string;
  readonly name: string;
}

export interface AccessEvaluationPlan {
  readonly organizationId: string;
  readonly eventId: string;
  readonly planId?: string | undefined;
  readonly closesAt?: string | null | undefined;
}

/** A speaker projection is usable here only after the adapter resolves its tenant identity. */
export interface AccessSpeakerContextScope
  extends Pick<SpeakerAccessScope, "capabilities" | "capabilitiesByParticipant"> {
  readonly organizationId: string;
  readonly resolvedOrganizationIds: readonly string[];
  readonly eventId: string;
  readonly accountId: string;
  readonly speakerProfileIds: readonly string[];
  readonly participantIds: readonly string[];
}

export interface AccessContextDependencies {
  readonly listOrganizationsForUser: (
    principal: UserPrincipal,
  ) => Promise<readonly AccessOrganization[]>;
  readonly listEvents: (organizationId: string) => Promise<readonly AccessEvent[]>;
  readonly listEvaluationPlans: (
    organizationId: string,
  ) => Promise<readonly AccessEvaluationPlan[]>;
  readonly listSpeakerContextScopes: (
    userId: string,
  ) => Promise<readonly AccessSpeakerContextScope[]>;
}

export class AccessContextDependencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccessContextDependencyError";
  }
}

type MutableContext = {
  readonly scope: "organization" | "event";
  readonly organization: { readonly id: string; readonly name: string };
  readonly event?: { readonly id: string; readonly name: string };
  readonly membershipRole?: "owner" | "admin" | "reviewer";
  readonly roles: Set<AgentRole>;
  readonly capabilities: Set<AgentCapability>;
};

const roleOrder: readonly AgentRole[] = ["organizer", "reviewer", "speaker"];
const capabilityOrder: readonly AgentCapability[] = [
  "organizer.overview.read",
  "reviewer.workspace.read",
  "speaker.portal.read",
  "speaker.tasks.read",
];

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function eventKey(organizationId: string, eventId: string): string {
  return `${organizationId}\u0000${eventId}`;
}

function contextKey(organizationId: string, eventId?: string): string {
  return eventId === undefined
    ? `organization\u0000${organizationId}`
    : `event\u0000${eventKey(organizationId, eventId)}`;
}

function sorted<T extends string>(values: ReadonlySet<T>, order: readonly T[]): T[] {
  return order.filter((candidate) => values.has(candidate));
}

function validateOrganization(
  organization: AccessOrganization,
  requestedOrganizationIds: ReadonlySet<string>,
): void {
  if (
    !nonEmpty(organization.organizationId) ||
    !nonEmpty(organization.name) ||
    !requestedOrganizationIds.has(organization.organizationId)
  ) {
    throw new AccessContextDependencyError(
      "The organization access dependency returned another organization.",
    );
  }
}

function validateEvent(event: AccessEvent, organizationId: string): void {
  if (
    !nonEmpty(event.organizationId) ||
    !nonEmpty(event.eventId) ||
    !nonEmpty(event.name) ||
    event.organizationId !== organizationId
  ) {
    throw new AccessContextDependencyError(
      "The event access dependency returned another organization.",
    );
  }
}

function validatePlan(plan: AccessEvaluationPlan, organizationId: string): void {
  if (
    !nonEmpty(plan.organizationId) ||
    !nonEmpty(plan.eventId) ||
    plan.organizationId !== organizationId
  ) {
    throw new AccessContextDependencyError(
      "The evaluation plan dependency returned another organization.",
    );
  }
}

/** Server-side discovery projection only. Callers must reauthorize protected reads. */
export class AccessContextService {
  constructor(private readonly dependencies: AccessContextDependencies) {}

  async list(principal: UserPrincipal): Promise<readonly AccessContext[]> {
    const memberships = new Map(
      principal.memberships.map((membership) => [membership.organizationId, membership]),
    );
    const accessibleOrganizationIds = new Set([
      ...memberships.keys(),
      ...principal.speakerGrants.map((grant) => grant.organizationId),
    ]);
    const organizations = await this.dependencies.listOrganizationsForUser(principal);
    const organizationById = new Map<string, AccessOrganization>();
    for (const organization of organizations) {
      validateOrganization(organization, accessibleOrganizationIds);
      if (organizationById.has(organization.organizationId)) {
        throw new AccessContextDependencyError(
          "The organization access dependency returned duplicates.",
        );
      }
      organizationById.set(organization.organizationId, organization);
    }
    if (organizationById.size !== accessibleOrganizationIds.size) {
      throw new AccessContextDependencyError(
        "The organization access dependency omitted a current scope.",
      );
    }

    const contexts = new Map<string, MutableContext>();
    const eventContexts = new Map<string, MutableContext>();
    const eventsByScope = new Map<
      string,
      { readonly organization: AccessOrganization; readonly event: AccessEvent }
    >();
    const addOrganization = (organization: AccessOrganization): MutableContext => {
      const key = contextKey(organization.organizationId);
      const existing = contexts.get(key);
      if (existing !== undefined) return existing;
      const membership = memberships.get(organization.organizationId);
      const created: MutableContext = {
        scope: "organization",
        organization: { id: organization.organizationId, name: organization.name },
        ...(membership === undefined ? {} : { membershipRole: membership.role }),
        roles: new Set(),
        capabilities: new Set(),
      };
      contexts.set(key, created);
      return created;
    };
    const addEvent = (organization: AccessOrganization, event: AccessEvent): MutableContext => {
      const key = eventKey(organization.organizationId, event.eventId);
      const existing = eventContexts.get(key);
      if (existing !== undefined) return existing;
      const membership = memberships.get(organization.organizationId);
      const created: MutableContext = {
        scope: "event",
        organization: { id: organization.organizationId, name: organization.name },
        event: { id: event.eventId, name: event.name },
        ...(membership === undefined ? {} : { membershipRole: membership.role }),
        roles: new Set(),
        capabilities: new Set(),
      };
      eventContexts.set(key, created);
      contexts.set(contextKey(organization.organizationId, event.eventId), created);
      return created;
    };

    for (const [organizationId, organization] of organizationById) {
      const membership = memberships.get(organizationId);
      const organizationContext = addOrganization(organization);
      const [events, plans] = await Promise.all([
        this.dependencies.listEvents(organizationId),
        this.dependencies.listEvaluationPlans(organizationId),
      ]);
      const eventById = new Map<string, AccessEvent>();
      for (const event of events) {
        validateEvent(event, organizationId);
        if (eventById.has(event.eventId)) {
          throw new AccessContextDependencyError(
            "The event access dependency returned duplicates.",
          );
        }
        eventById.set(event.eventId, event);
        eventsByScope.set(eventKey(organizationId, event.eventId), { organization, event });
      }
      if (membership?.role === "owner" || membership?.role === "admin") {
        organizationContext.roles.add("organizer");
        organizationContext.capabilities.add("organizer.overview.read");
        for (const event of eventById.values()) {
          const eventContext = addEvent(organization, event);
          eventContext.roles.add("organizer");
          eventContext.capabilities.add("organizer.overview.read");
        }
      }
      for (const plan of plans) {
        validatePlan(plan, organizationId);
        const event = eventById.get(plan.eventId);
        if (event === undefined) {
          throw new AccessContextDependencyError(
            "The evaluation plan dependency returned another event.",
          );
        }
        if (membership?.role === "reviewer") {
          const eventContext = addEvent(organization, event);
          eventContext.roles.add("reviewer");
          eventContext.capabilities.add("reviewer.workspace.read");
        }
      }
    }

    const speakerGrants = new Map(
      principal.speakerGrants.map((grant) => [
        `${grant.organizationId}\u0000${grant.speakerProfileId}`,
        grant,
      ]),
    );
    const speakerScopes = await this.dependencies.listSpeakerContextScopes(principal.userId);
    for (const scope of speakerScopes) {
      const resolvedOrganizations = [...new Set(scope.resolvedOrganizationIds.filter(nonEmpty))];
      if (
        !nonEmpty(scope.organizationId) ||
        !nonEmpty(scope.eventId) ||
        scope.accountId !== principal.userId ||
        resolvedOrganizations.length !== 1 ||
        resolvedOrganizations[0] !== scope.organizationId ||
        !organizationById.has(scope.organizationId) ||
        !eventsByScope.has(eventKey(scope.organizationId, scope.eventId)) ||
        !scope.speakerProfileIds.some((profileId) =>
          speakerGrants.has(`${scope.organizationId}\u0000${profileId}`),
        )
      ) {
        throw new AccessContextDependencyError(
          "The speaker access scope is not tenant-qualified for this user.",
        );
      }
      const eventSource = eventsByScope.get(eventKey(scope.organizationId, scope.eventId));
      if (eventSource === undefined) {
        throw new AccessContextDependencyError("The speaker access scope returned another event.");
      }
      const event = addEvent(eventSource.organization, eventSource.event);
      event.roles.add("speaker");
      event.capabilities.add("speaker.portal.read");
      if (
        scope.participantIds.some((participantId) =>
          capabilityAllows(scope, "task-response", participantId),
        )
      ) {
        event.capabilities.add("speaker.tasks.read");
      }
    }

    return [...contexts.values()]
      .sort((left, right) => {
        const organization =
          left.organization.name.localeCompare(right.organization.name) ||
          left.organization.id.localeCompare(right.organization.id);
        if (organization !== 0) return organization;
        if (left.scope !== right.scope) return left.scope === "organization" ? -1 : 1;
        return (
          (left.event?.name ?? "").localeCompare(right.event?.name ?? "") ||
          (left.event?.id ?? "").localeCompare(right.event?.id ?? "")
        );
      })
      .map(
        (context): AccessContext =>
          context.scope === "organization"
            ? {
                scope: "organization",
                organization: context.organization,
                ...(context.membershipRole === undefined
                  ? {}
                  : { membershipRole: context.membershipRole }),
                roles: sorted(context.roles, roleOrder),
                capabilities: sorted(context.capabilities, capabilityOrder),
              }
            : {
                scope: "event",
                organization: context.organization,
                ...(context.membershipRole === undefined
                  ? {}
                  : { membershipRole: context.membershipRole }),
                event:
                  context.event ??
                  (() => {
                    throw new AccessContextDependencyError(
                      "An event context is missing event identity.",
                    );
                  })(),
                roles: sorted(context.roles, roleOrder),
                capabilities: sorted(context.capabilities, capabilityOrder),
              },
      );
  }
}
