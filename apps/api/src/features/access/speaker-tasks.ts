import type { UserPrincipal } from "../auth/types";
import { capabilityAllows } from "../speaker/capabilities";
import type { SpeakerAccessScope, SpeakerTaskStatus } from "../speaker/types";

export interface AccountSpeakerScope
  extends Pick<SpeakerAccessScope, "capabilities" | "capabilitiesByParticipant"> {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly eventId: string;
  readonly accountId: string;
  readonly participantIds: readonly string[];
  readonly submissionIds: readonly string[];
}

export interface AccountSpeakerSubmission {
  readonly organizationId: string;
  readonly eventId: string;
  readonly submissionId: string;
  readonly participantIds: readonly string[];
}

export interface AccountSpeakerTaskRecord {
  readonly organizationId: string;
  readonly eventId: string;
  readonly taskId: string;
  readonly submissionId: string | null;
  readonly participantId: string;
  readonly owner: "speaker" | "organizer";
  readonly title: string;
  readonly dueAt: string | null;
  readonly status: SpeakerTaskStatus;
}

export interface SpeakerTasksBoundary {
  readonly resolveScope: (
    principal: UserPrincipal,
    organizationId: string,
    eventId: string,
  ) => Promise<AccountSpeakerScope | null>;
  readonly listSubmissions: (
    organizationId: string,
    eventId: string,
    submissionIds: readonly string[],
  ) => Promise<readonly AccountSpeakerSubmission[]>;
  readonly listTasks: (
    organizationId: string,
    eventId: string,
    participantIds: readonly string[],
  ) => Promise<readonly AccountSpeakerTaskRecord[]>;
}

export interface AccountSpeakerTasksDependencies {
  readonly speakerTasks: SpeakerTasksBoundary;
}

export interface AccountSpeakerTasks {
  readonly organizationId: string;
  readonly eventId: string;
  readonly tasks: readonly {
    readonly taskId: string;
    readonly title: string;
    readonly dueAt: string | null;
    readonly status: SpeakerTaskStatus;
  }[];
}

export class SpeakerTasksAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpeakerTasksAccessError";
  }
}

function uniqueNonEmpty(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

/** Session-account speaker task projection with mandatory organization qualification. */
export class AccountSpeakerTasksService {
  constructor(private readonly dependencies: AccountSpeakerTasksDependencies) {}

  async list(
    principal: UserPrincipal,
    organizationId: string | undefined,
    eventId: string | undefined,
  ): Promise<AccountSpeakerTasks> {
    const organization = organizationId?.trim() ?? "";
    const event = eventId?.trim() ?? "";
    if (organization.length === 0 || event.length === 0) {
      throw new SpeakerTasksAccessError("Organization and event are required.");
    }
    const scope = await this.dependencies.speakerTasks.resolveScope(principal, organization, event);
    if (
      scope === null ||
      scope.tenantId !== organization ||
      scope.organizationId !== organization ||
      scope.eventId !== event ||
      scope.accountId !== principal.userId
    ) {
      throw new SpeakerTasksAccessError("The requested speaker scope is not available.");
    }
    const participantIds = uniqueNonEmpty(scope.participantIds);
    const submissionIds = uniqueNonEmpty(scope.submissionIds);
    if (participantIds.length === 0 || submissionIds.length === 0) {
      throw new SpeakerTasksAccessError("The requested speaker scope is not available.");
    }
    const taskParticipantIds = participantIds.filter((participantId) =>
      capabilityAllows(scope, "task-response", participantId),
    );
    if (taskParticipantIds.length === 0) {
      return { organizationId: organization, eventId: event, tasks: [] };
    }
    const [submissions, tasks] = await Promise.all([
      this.dependencies.speakerTasks.listSubmissions(organization, event, submissionIds),
      this.dependencies.speakerTasks.listTasks(organization, event, taskParticipantIds),
    ]);
    const scopeParticipants = new Set(participantIds);
    const allowedTaskParticipants = new Set(taskParticipantIds);
    const allowedSubmissions = new Set(submissionIds);
    const visibleSubmissions = new Set<string>();
    for (const submission of submissions) {
      if (
        submission.organizationId !== organization ||
        submission.eventId !== event ||
        !allowedSubmissions.has(submission.submissionId) ||
        !submission.participantIds.some((participantId) => scopeParticipants.has(participantId))
      ) {
        throw new SpeakerTasksAccessError("The speaker repository returned another scope.");
      }
      visibleSubmissions.add(submission.submissionId);
    }
    if (visibleSubmissions.size !== allowedSubmissions.size) {
      throw new SpeakerTasksAccessError("The speaker repository omitted an authorized submission.");
    }
    return {
      organizationId: organization,
      eventId: event,
      tasks: tasks
        .map((task) => {
          if (
            task.organizationId !== organization ||
            task.eventId !== event ||
            !allowedTaskParticipants.has(task.participantId) ||
            task.owner !== "speaker" ||
            task.submissionId === null ||
            !visibleSubmissions.has(task.submissionId)
          ) {
            throw new SpeakerTasksAccessError("The speaker repository returned another scope.");
          }
          return {
            taskId: task.taskId,
            title: task.title,
            dueAt: task.dueAt,
            status: task.status,
          };
        })
        .sort((left, right) => left.taskId.localeCompare(right.taskId)),
    };
  }
}
