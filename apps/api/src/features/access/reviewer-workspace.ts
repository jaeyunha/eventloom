import type { UserPrincipal } from "../auth/types";
import type {
  EvaluationReviewerWorkspace,
  EvaluationReviewerWorkspaceAssignment,
} from "../evaluations/service";
import type { EvaluationActor } from "../evaluations/types";
import {
  type AccessContextDependencies,
  AccessContextDependencyError,
  type AccessEvaluationPlan,
  type AccessOrganization,
} from "./service";

export interface ReviewerWorkspaceBoundary {
  readonly listReviewerWorkspace: (
    actor: EvaluationActor,
    eventId?: string,
  ) => Promise<EvaluationReviewerWorkspace>;
}

export interface ReviewerWorkspaceDependencies extends AccessContextDependencies {
  readonly reviewerWorkspace: ReviewerWorkspaceBoundary;
}

export interface AccountReviewerWorkspaceFilter {
  readonly organizationId?: string | undefined;
  readonly eventId?: string | undefined;
}

export interface AccountReviewerWorkspaceWarning {
  readonly code: "WORKSPACE_UNAVAILABLE";
  readonly organization: { readonly id: string; readonly name: string };
  readonly message: string;
}

export interface AccountReviewerWorkspaceAssignment
  extends Omit<EvaluationReviewerWorkspaceAssignment, "plan"> {
  readonly plan: EvaluationReviewerWorkspaceAssignment["plan"] & {
    readonly closesAt: string | null;
  };
}

export interface AccountReviewerOrganizationWorkspace {
  readonly organization: { readonly id: string; readonly name: string };
  readonly assignments: readonly AccountReviewerWorkspaceAssignment[];
}

export interface AccountReviewerWorkspace {
  readonly organizations: readonly AccountReviewerOrganizationWorkspace[];
  readonly warnings: readonly AccountReviewerWorkspaceWarning[];
}

export class ReviewerWorkspaceAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewerWorkspaceAccessError";
  }
}

function key(eventId: string, planId: string): string {
  return `${eventId}\u0000${planId}`;
}

function compareOrganizations(left: AccessOrganization, right: AccessOrganization): number {
  return (
    left.name.localeCompare(right.name) || left.organizationId.localeCompare(right.organizationId)
  );
}

function validateOrganization(
  organization: AccessOrganization,
  reviewerOrganizationIds: ReadonlySet<string>,
): void {
  if (
    organization.organizationId.trim().length === 0 ||
    organization.name.trim().length === 0 ||
    !reviewerOrganizationIds.has(organization.organizationId)
  ) {
    throw new AccessContextDependencyError(
      "The organization access dependency returned another organization.",
    );
  }
}

function validatePlan(plan: AccessEvaluationPlan, organizationId: string): void {
  if (
    plan.organizationId !== organizationId ||
    plan.eventId.trim().length === 0 ||
    (plan.planId !== undefined && plan.planId.trim().length === 0)
  ) {
    throw new AccessContextDependencyError(
      "The evaluation plan dependency returned another organization.",
    );
  }
}

function belongsToAssignment(
  assignment: EvaluationReviewerWorkspaceAssignment,
  actor: EvaluationActor,
): boolean {
  return assignment.assignment.tenantId === actor.tenantId;
}

function validateAndLabelAssignment(
  entry: EvaluationReviewerWorkspaceAssignment,
  actor: EvaluationActor,
  plansByKey: ReadonlyMap<string, AccessEvaluationPlan>,
): AccountReviewerWorkspaceAssignment {
  const assignment = entry.assignment;
  const plan = plansByKey.get(key(assignment.eventId, assignment.planId));
  const review = entry.review;
  if (
    assignment.tenantId !== actor.tenantId ||
    assignment.reviewerId !== actor.userId ||
    !actor.grants.some(
      (grant) => grant.role === "reviewer" && grant.eventId === assignment.eventId,
    ) ||
    plan === undefined ||
    entry.plan.id !== assignment.planId ||
    entry.plan.eventId !== assignment.eventId ||
    entry.round.id !== assignment.roundId ||
    entry.submission.id !== assignment.submissionId ||
    (review !== null &&
      (review.tenantId !== actor.tenantId ||
        review.eventId !== assignment.eventId ||
        review.planId !== assignment.planId ||
        review.roundId !== assignment.roundId ||
        review.assignmentId !== assignment.id ||
        review.submissionId !== assignment.submissionId ||
        review.reviewerId !== actor.userId)) ||
    !belongsToAssignment(entry, actor)
  ) {
    throw new AccessContextDependencyError(
      "The reviewer workspace returned data outside its organization scope.",
    );
  }
  return {
    ...entry,
    plan: {
      ...entry.plan,
      closesAt: plan.closesAt ?? null,
    },
  };
}

/** Aggregates reviewer reads while preserving one tenant per existing EvaluationActor. */
export class AccountReviewerWorkspaceService {
  constructor(private readonly dependencies: ReviewerWorkspaceDependencies) {}

  async list(
    principal: UserPrincipal,
    filter: AccountReviewerWorkspaceFilter = {},
  ): Promise<AccountReviewerWorkspace> {
    const reviewerEventIdsByOrganization = new Map<string, Set<string>>();
    for (const grant of principal.reviewerGrants) {
      const eventIds =
        reviewerEventIdsByOrganization.get(grant.organizationId) ?? new Set<string>();
      eventIds.add(grant.eventId);
      reviewerEventIdsByOrganization.set(grant.organizationId, eventIds);
    }
    const reviewerOrganizationIds = new Set(reviewerEventIdsByOrganization.keys());
    if (
      filter.organizationId !== undefined &&
      !reviewerOrganizationIds.has(filter.organizationId)
    ) {
      throw new ReviewerWorkspaceAccessError(
        "The requested reviewer organization is not available.",
      );
    }
    const requestedEventId = filter.eventId;
    if (
      requestedEventId !== undefined &&
      ![...reviewerEventIdsByOrganization].some(
        ([organizationId, eventIds]) =>
          (filter.organizationId === undefined || filter.organizationId === organizationId) &&
          eventIds.has(requestedEventId),
      )
    ) {
      throw new ReviewerWorkspaceAccessError("The requested reviewer event is not available.");
    }

    const organizations = (await this.dependencies.listOrganizationsForUser(principal)).filter(
      (organization) => reviewerOrganizationIds.has(organization.organizationId),
    );
    for (const organization of organizations) {
      validateOrganization(organization, reviewerOrganizationIds);
    }
    const organizationById = new Map(
      organizations.map((organization) => [organization.organizationId, organization] as const),
    );
    if (organizationById.size !== reviewerOrganizationIds.size) {
      throw new AccessContextDependencyError(
        "The organization access dependency omitted a current reviewer scope.",
      );
    }
    const selectedOrganizations = organizations
      .filter((organization) => {
        if (
          filter.organizationId !== undefined &&
          organization.organizationId !== filter.organizationId
        ) {
          return false;
        }
        return (
          filter.eventId === undefined ||
          reviewerEventIdsByOrganization.get(organization.organizationId)?.has(filter.eventId) ===
            true
        );
      })
      .sort(compareOrganizations);

    if (filter.organizationId !== undefined && !organizationById.has(filter.organizationId)) {
      throw new ReviewerWorkspaceAccessError(
        "The requested reviewer organization is not available.",
      );
    }

    const results = await Promise.all(
      selectedOrganizations.map(async (organization) => {
        try {
          const plans = await this.dependencies.listEvaluationPlans(organization.organizationId);
          for (const plan of plans) validatePlan(plan, organization.organizationId);
          const grantedEventIds = reviewerEventIdsByOrganization.get(organization.organizationId);
          if (grantedEventIds === undefined) {
            throw new AccessContextDependencyError(
              "The reviewer workspace organization has no current event scope.",
            );
          }
          const eventIds = [...grantedEventIds]
            .filter((eventId) => filter.eventId === undefined || eventId === filter.eventId)
            .sort();
          const filteredPlans = plans.filter((plan) => eventIds.includes(plan.eventId));
          const actor: EvaluationActor = {
            tenantId: organization.organizationId,
            userId: principal.userId,
            kind: "human",
            grants: eventIds.map((eventId) => ({ eventId, role: "reviewer" as const })),
          };
          const workspace = await this.dependencies.reviewerWorkspace.listReviewerWorkspace(
            actor,
            filter.eventId,
          );
          const plansByKey = new Map(
            filteredPlans.flatMap((plan) =>
              plan.planId === undefined ? [] : [[key(plan.eventId, plan.planId), plan] as const],
            ),
          );
          return {
            kind: "success" as const,
            workspace: {
              organization: {
                id: organization.organizationId,
                name: organization.name,
              },
              assignments: workspace.assignments
                .filter((entry) => entry.assignment.reviewerId === actor.userId)
                .map((entry) => validateAndLabelAssignment(entry, actor, plansByKey)),
            },
          };
        } catch {
          return {
            kind: "failure" as const,
            warning: {
              code: "WORKSPACE_UNAVAILABLE" as const,
              organization: {
                id: organization.organizationId,
                name: organization.name,
              },
              message: "The reviewer workspace for this organization is unavailable.",
            },
          };
        }
      }),
    );

    return {
      organizations: results.flatMap((result) =>
        result.kind === "success" ? [result.workspace] : [],
      ),
      warnings: results.flatMap((result) => (result.kind === "failure" ? [result.warning] : [])),
    };
  }
}
