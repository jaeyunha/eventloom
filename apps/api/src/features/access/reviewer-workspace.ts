import type { UserPrincipal } from "../auth/types";
import type {
  EvaluationReviewerWorkspace,
  EvaluationReviewerWorkspaceAssignment,
} from "../evaluations/service";
import type { EvaluationActor, EvaluationSuggestion } from "../evaluations/types";
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
  suggestion: EvaluationSuggestion,
  assignment: EvaluationReviewerWorkspaceAssignment,
  actor: EvaluationActor,
): boolean {
  return (
    suggestion.tenantId === actor.tenantId &&
    suggestion.eventId === assignment.assignment.eventId &&
    suggestion.planId === assignment.assignment.planId &&
    suggestion.roundId === assignment.assignment.roundId &&
    suggestion.assignmentId === assignment.assignment.id &&
    suggestion.submissionId === assignment.assignment.submissionId &&
    suggestion.reviewerId === actor.userId
  );
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
    !(entry.suggestions ?? []).every((suggestion) => belongsToAssignment(suggestion, entry, actor))
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
    const reviewerOrganizationIds = new Set(
      principal.memberships
        .filter((membership) => membership.role === "reviewer")
        .map((membership) => membership.organizationId),
    );
    if (
      filter.organizationId !== undefined &&
      !reviewerOrganizationIds.has(filter.organizationId)
    ) {
      throw new ReviewerWorkspaceAccessError(
        "The requested reviewer organization is not available.",
      );
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
      .filter(
        (organization) =>
          filter.organizationId === undefined ||
          organization.organizationId === filter.organizationId,
      )
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
          const filteredPlans = plans.filter(
            (plan) => filter.eventId === undefined || plan.eventId === filter.eventId,
          );
          const eventIds = [...new Set(filteredPlans.map((plan) => plan.eventId))].sort();
          if (eventIds.length === 0) {
            if (filter.eventId !== undefined)
              return { kind: "unauthorized" as const, organization };
            return {
              kind: "success" as const,
              workspace: {
                organization: {
                  id: organization.organizationId,
                  name: organization.name,
                },
                assignments: [],
              },
            };
          }
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

    if (filter.eventId !== undefined && results.every((result) => result.kind === "unauthorized")) {
      throw new ReviewerWorkspaceAccessError("The requested reviewer event is not available.");
    }

    return {
      organizations: results.flatMap((result) =>
        result.kind === "success" ? [result.workspace] : [],
      ),
      warnings: results.flatMap((result) => (result.kind === "failure" ? [result.warning] : [])),
    };
  }
}
