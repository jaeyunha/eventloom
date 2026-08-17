import type { AccountIdentity, AccountSession } from "../account/account-access";
import type { PortalContext } from "../portal/types";
import type { WorkEventInvitation } from "./work-event-invitation-model";

export interface WorkOrganizerOrganization {
  readonly organizationId: string;
  readonly name: string;
  readonly href: string;
}

export interface WorkOrganizerModel {
  readonly organizationCount: number;
  readonly organizations: readonly WorkOrganizerOrganization[];
}

export interface WorkReviewerModel {
  readonly assignmentCount: number;
  readonly inProgressCount: number;
  readonly submittedCount: number;
  readonly eventNames: readonly string[];
  readonly organizationNames: readonly string[];
}

export interface WorkParticipantModel {
  readonly proposalCount: number;
  readonly proposalEventNames: readonly string[];
  readonly speakerTaskEventCount: number;
  readonly speakerTaskEventNames: readonly string[];
}

export interface WorkHubModel {
  readonly identity: AccountIdentity;
  readonly organizer: WorkOrganizerModel | null;
  readonly reviewer: WorkReviewerModel | null;
  readonly participant: WorkParticipantModel | null;
  readonly invitations?: readonly WorkEventInvitation[];
}

export interface WorkOrganizationSummary {
  readonly organizationId: string;
  readonly name: string;
}

interface ReviewerAssignmentSummary {
  readonly status: string | null;
  readonly organizationName: string | null;
  readonly eventName: string | null;
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function humanName(value: unknown, identifiers: readonly unknown[]): string | null {
  const name = text(value);
  if (name === null) return null;
  const rawIdentifiers = identifiers.map(text).filter((item): item is string => item !== null);
  return rawIdentifiers.includes(name) ? null : name;
}

function unique(values: readonly (string | null)[]): readonly string[] {
  return [...new Set(values.filter((value): value is string => value !== null))];
}

function reviewerAssignment(value: unknown): ReviewerAssignmentSummary {
  const item = record(value);
  const assignment = record(item?.assignment);
  const plan = record(item?.plan);
  return {
    status: text(assignment?.status ?? item?.status),
    organizationName: humanName(plan?.organizationName ?? item?.organizationName, [
      plan?.organizationId,
      item?.organizationId,
    ]),
    eventName: humanName(plan?.eventName ?? item?.eventName, [
      plan?.eventId,
      assignment?.eventId,
      item?.eventId,
    ]),
  };
}

function contextHumanName(context: PortalContext): string | null {
  return humanName(context.name, [context.id, context.eventId, context.slug]);
}

export function buildWorkHubModel({
  session,
  organizations,
  reviewerAssignments,
  portalContexts,
  preferredOrganizationId,
}: Readonly<{
  session: AccountSession;
  organizations: readonly WorkOrganizationSummary[];
  reviewerAssignments: readonly unknown[];
  portalContexts: readonly PortalContext[];
  preferredOrganizationId: string | null;
}>): WorkHubModel {
  const organizerIds = new Set<string>();
  for (const { role, organizationId } of session.memberships) {
    if (role === "owner" || role === "admin") {
      organizerIds.add(organizationId);
    }
  }
  const organizerOrganizations = organizations.filter(({ organizationId }) =>
    organizerIds.has(organizationId),
  );
  const organizerDestinations = organizerOrganizations.flatMap((organization) => {
    const name = humanName(organization.name, [organization.organizationId]);
    return name === null
      ? []
      : [
          {
            organizationId: organization.organizationId,
            name,
            href: `/admin/organizations/${encodeURIComponent(organization.organizationId)}/events`,
          },
        ];
  });
  const orderedOrganizerDestinations = [...organizerDestinations].sort((left, right) => {
    if (left.organizationId === preferredOrganizationId) return -1;
    if (right.organizationId === preferredOrganizationId) return 1;
    return 0;
  });
  const organizer =
    organizerIds.size === 0
      ? null
      : {
          organizationCount: organizerIds.size,
          organizations: orderedOrganizerDestinations,
        };

  const assignmentSummaries = reviewerAssignments.map(reviewerAssignment);
  const reviewer =
    assignmentSummaries.length > 0
      ? {
          assignmentCount: assignmentSummaries.length,
          inProgressCount: assignmentSummaries.filter(({ status }) => status === "in_progress")
            .length,
          submittedCount: assignmentSummaries.filter(({ status }) => status === "submitted").length,
          eventNames: unique(assignmentSummaries.map(({ eventName }) => eventName)),
          organizationNames: unique(
            assignmentSummaries.map(({ organizationName }) => organizationName),
          ),
        }
      : null;

  const proposalContexts = portalContexts.filter(({ submissionIds }) => submissionIds.length > 0);
  const taskContexts = portalContexts.filter(
    ({ capabilities, participantIds }) =>
      participantIds.length > 0 && capabilities.includes("task-response"),
  );
  const proposalCount = proposalContexts.reduce(
    (count, { submissionIds }) => count + submissionIds.length,
    0,
  );
  const participant =
    proposalCount === 0 && taskContexts.length === 0
      ? null
      : {
          proposalCount,
          proposalEventNames: unique(proposalContexts.map(contextHumanName)),
          speakerTaskEventCount: taskContexts.length,
          speakerTaskEventNames: unique(taskContexts.map(contextHumanName)),
        };

  return { identity: session.identity, organizer, reviewer, participant };
}
