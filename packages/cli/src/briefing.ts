import {
  type AccessContext,
  type AgentWarning,
  type AggregateBriefing,
  aggregateBriefingSchema,
  type BriefingItem,
  type BriefingSeverity,
  type EventReference,
  type OrganizationReference,
  type Urgency,
} from "@eventloom/contracts";
import { AuthClient, AuthClientError, type Fetcher } from "./auth";
import type { ProfileMetadata, StoredProfile } from "./store";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ROLE_ORDER = { organizer: 0, reviewer: 1, speaker: 2 } as const;
const SEVERITY_ORDER = { critical: 0, high: 1, normal: 2 } as const;

export interface BriefingProfileInput {
  metadata: ProfileMetadata;
  stored: StoredProfile;
}

export interface BriefingFilters {
  organization?: string;
  event?: string;
}

export interface BriefingDependencies {
  fetcher?: Fetcher;
  clock?: () => Date;
  concurrency?: number;
}

interface SourceResult {
  items: BriefingItem[];
  warnings: AgentWarning[];
  traceIds: string[];
}

interface ProfileResult extends SourceResult {
  succeeded: boolean;
}

function timestamp(value: string): number {
  return new Date(value).getTime();
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function classifyBriefingItem(
  now: Date,
  deadline: string | null,
  severity: BriefingSeverity,
): Urgency {
  if (deadline === null) return "Later";
  const due = timestamp(deadline);
  const current = now.getTime();
  if (due < current || ((severity === "critical" || severity === "high") && due <= current + DAY))
    return "Urgent";
  if (due <= current + 7 * DAY) return "Upcoming";
  return "Later";
}

export function compareBriefingItems(left: BriefingItem, right: BriefingItem, now: Date): number {
  const current = now.getTime();
  const leftOverdue = left.deadline !== null && timestamp(left.deadline) < current;
  const rightOverdue = right.deadline !== null && timestamp(right.deadline) < current;
  if (leftOverdue !== rightOverdue) return leftOverdue ? -1 : 1;
  if (left.deadline !== right.deadline) {
    if (left.deadline === null) return 1;
    if (right.deadline === null) return -1;
    const byDeadline = timestamp(left.deadline) - timestamp(right.deadline);
    if (byDeadline !== 0) return byDeadline;
  }
  const bySeverity =
    SEVERITY_ORDER[left.severity ?? "normal"] - SEVERITY_ORDER[right.severity ?? "normal"];
  if (bySeverity !== 0) return bySeverity;
  const byRole = ROLE_ORDER[left.role] - ROLE_ORDER[right.role];
  if (byRole !== 0) return byRole;
  const byOrganization = compareText(left.organization.id, right.organization.id);
  if (byOrganization !== 0) return byOrganization;
  const byEvent = compareText(left.event?.id ?? "", right.event?.id ?? "");
  if (byEvent !== 0) return byEvent;
  const bySource = compareText(left.sourceId, right.sourceId);
  if (bySource !== 0) return bySource;
  return compareText(left.profileName, right.profileName);
}

function boundedFetcher(fetcher: Fetcher, limit: number): Fetcher {
  let active = 0;
  const waiters: Array<() => void> = [];
  const acquire = async (): Promise<void> => {
    if (active < limit) {
      active += 1;
      return;
    }
    await new Promise<void>((resolve) => waiters.push(resolve));
    active += 1;
  };
  const release = (): void => {
    active -= 1;
    waiters.shift()?.();
  };
  return async (input, init) => {
    await acquire();
    try {
      return await fetcher(input, init);
    } finally {
      release();
    }
  };
}

async function mapConcurrent<T, R>(
  values: readonly T[],
  limit: number,
  operation: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= values.length) return;
      const value = values[index];
      if (value !== undefined) results[index] = await operation(value);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => worker()));
  return results;
}

function freshContexts(
  contexts: readonly AccessContext[],
  filters: BriefingFilters,
): AccessContext[] {
  return contexts.filter(
    (context) =>
      (filters.organization === undefined || context.organization.id === filters.organization) &&
      (filters.event === undefined ||
        (context.scope === "event" && context.event.id === filters.event)),
  );
}

function warning(
  profileName: string,
  message: string,
  organization?: OrganizationReference,
  event?: EventReference,
): AgentWarning {
  return {
    code: "CONTEXT_FAILED",
    message,
    profileName,
    ...(organization === undefined ? {} : { organizationId: organization.id }),
    ...(event === undefined ? {} : { eventId: event.id }),
  };
}

function sourceFailure(
  profileName: string,
  role: BriefingItem["role"],
  error: unknown,
  organization?: OrganizationReference,
  event?: EventReference,
): SourceResult {
  const denied = error instanceof AuthClientError && error.kind === "authorization";
  return {
    items: [],
    traceIds:
      error instanceof AuthClientError && error.traceId !== undefined ? [error.traceId] : [],
    warnings: [
      {
        ...warning(
          profileName,
          `${role} workload failed for profile '${profileName}'`,
          organization,
          event,
        ),
        code: denied ? "AUTHORIZATION_DENIED" : "CONTEXT_FAILED",
      },
    ],
  };
}

function organizerSeverity(priority: number): BriefingSeverity {
  if (priority >= 90) return "critical";
  if (priority >= 70) return "high";
  return "normal";
}

function eventForOrganizer(
  contexts: readonly AccessContext[],
  organizationId: string,
  eventId: string | undefined,
): EventReference | null {
  if (eventId === undefined) return null;
  const context = contexts.find(
    (candidate) =>
      candidate.scope === "event" &&
      candidate.organization.id === organizationId &&
      candidate.event.id === eventId,
  );
  return context?.scope === "event" ? context.event : null;
}

function uniqueById<T>(values: readonly T[], identity: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = identity(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function loadProfile(
  input: BriefingProfileInput,
  filters: BriefingFilters,
  now: Date,
  fetcher: Fetcher | undefined,
  concurrency: number,
): Promise<ProfileResult> {
  const { metadata, stored } = input;
  const client = new AuthClient(stored.origin, fetcher);
  let contexts: AccessContext[];
  try {
    contexts = freshContexts((await client.authenticatedAccess(stored)).contexts, filters);
  } catch (error) {
    return {
      succeeded: false,
      items: [],
      traceIds:
        error instanceof AuthClientError && error.traceId !== undefined ? [error.traceId] : [],
      warnings: [
        {
          code:
            error instanceof AuthClientError && error.kind === "authentication"
              ? "PROFILE_EXPIRED"
              : "CONTEXT_FAILED",
          message: `Profile '${metadata.name}' could not load fresh access contexts`,
          profileName: metadata.name,
        },
      ],
    };
  }

  const organizerContexts = uniqueById(
    contexts.filter((context) => context.capabilities.includes("organizer.overview.read")),
    (context) => context.organization.id,
  );
  const reviewerContexts = contexts.filter(
    (context): context is Extract<AccessContext, { scope: "event" }> =>
      context.scope === "event" && context.capabilities.includes("reviewer.workspace.read"),
  );
  const speakerContexts = contexts.filter(
    (context): context is Extract<AccessContext, { scope: "event" }> =>
      context.scope === "event" && context.capabilities.includes("speaker.tasks.read"),
  );

  const operations: Array<() => Promise<SourceResult>> = [];
  for (const context of organizerContexts) {
    operations.push(async () => {
      try {
        const result = await client.organizerStatusWithTrace(stored, context);
        return {
          warnings: [],
          traceIds: result.traceIds,
          items: result.data.organizations.flatMap((entry) =>
            entry.actionItems
              .filter((item) => filters.event === undefined || item.eventId === filters.event)
              .map((item) => {
                const severity = organizerSeverity(item.priority);
                return {
                  profileName: metadata.name,
                  organization: entry.organization,
                  event: eventForOrganizer(contexts, entry.organization.id, item.eventId),
                  role: "organizer" as const,
                  sourceId: item.id,
                  title: item.title,
                  deadline: item.dueAt,
                  severity,
                  urgency: classifyBriefingItem(now, item.dueAt, severity),
                };
              }),
          ),
        };
      } catch (error) {
        return sourceFailure(metadata.name, "organizer", error, context.organization);
      }
    });
  }
  for (const context of reviewerContexts) {
    operations.push(async () => {
      try {
        const result = await client.reviewerInboxWithTrace(stored, [context]);
        return {
          warnings: result.data.warnings,
          traceIds: result.traceIds,
          items: result.data.assignments.map((assignment) => ({
            profileName: metadata.name,
            organization: assignment.organization,
            event: assignment.event,
            role: "reviewer" as const,
            sourceId: assignment.assignmentId,
            title: assignment.title,
            deadline: assignment.deadline,
            severity: "normal" as const,
            urgency: classifyBriefingItem(now, assignment.deadline, "normal"),
          })),
        };
      } catch (error) {
        return sourceFailure(metadata.name, "reviewer", error, context.organization, context.event);
      }
    });
  }
  for (const context of speakerContexts) {
    operations.push(async () => {
      try {
        const result = await client.speakerTasksWithTrace(stored, [context]);
        return {
          warnings: [],
          traceIds: result.traceIds,
          items: result.data.tasks.map((task) => ({
            profileName: metadata.name,
            organization: task.organization,
            event: task.event,
            role: "speaker" as const,
            sourceId: task.taskId,
            title: task.title,
            deadline: task.dueAt,
            severity: "normal" as const,
            urgency: classifyBriefingItem(now, task.dueAt, "normal"),
          })),
        };
      } catch (error) {
        return sourceFailure(metadata.name, "speaker", error, context.organization, context.event);
      }
    });
  }

  if (operations.length === 0) return { succeeded: true, items: [], warnings: [], traceIds: [] };
  const sourceResults = await mapConcurrent(operations, concurrency, (operation) => operation());
  return {
    succeeded: sourceResults.some(
      (result) =>
        result.items.length > 0 ||
        result.warnings.every((warning) => warning.code === "REVIEWER_WORKSPACE_UNAVAILABLE"),
    ),
    items: sourceResults.flatMap((result) => result.items),
    warnings: sourceResults.flatMap((result) => result.warnings),
    traceIds: sourceResults.flatMap((result) => result.traceIds),
  };
}

function deduplicate(items: readonly BriefingItem[]): BriefingItem[] {
  const seen = new Set<string>();
  const result: BriefingItem[] = [];
  for (const item of items) {
    const key = [
      item.profileName,
      item.organization.id,
      item.event?.id ?? "",
      item.role,
      item.sourceId,
    ].join("\u0000");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export async function createBriefing(
  inputs: readonly BriefingProfileInput[],
  filters: BriefingFilters,
  dependencies: BriefingDependencies = {},
): Promise<AggregateBriefing> {
  const now = dependencies.clock?.() ?? new Date();
  const concurrency = Math.max(1, Math.floor(dependencies.concurrency ?? 4));
  const fetcher = boundedFetcher(dependencies.fetcher ?? fetch, concurrency);
  const results = await mapConcurrent(inputs, concurrency, (input) =>
    loadProfile(input, filters, now, fetcher, concurrency),
  );
  const succeeded = results.filter((result) => result.succeeded).length;
  const warnings = results
    .flatMap((result) => result.warnings)
    .sort(
      (left, right) =>
        compareText(left.profileName ?? "", right.profileName ?? "") ||
        compareText(left.organizationId ?? "", right.organizationId ?? "") ||
        compareText(left.eventId ?? "", right.eventId ?? "") ||
        compareText(left.code, right.code) ||
        compareText(left.message, right.message),
    );
  const items = deduplicate(results.flatMap((result) => result.items)).sort((left, right) =>
    compareBriefingItems(left, right, now),
  );
  const requestTraceIds = [...new Set(results.flatMap((result) => result.traceIds))].sort(
    compareText,
  );
  return aggregateBriefingSchema.parse({
    generatedAt: now.toISOString(),
    profiles: { requested: inputs.length, succeeded, failed: inputs.length - succeeded },
    items,
    warnings,
    requestTraceIds,
  });
}

export function renderBriefingHuman(briefing: AggregateBriefing): string {
  const lines: string[] = [];
  for (const urgency of ["Urgent", "Upcoming", "Later"] as const) {
    lines.push(urgency);
    const items = briefing.items.filter((item) => item.urgency === urgency);
    if (items.length === 0) {
      lines.push("  No work.");
      continue;
    }
    for (const item of items) {
      const context =
        item.event === null
          ? `${item.organization.name} (${item.organization.id})`
          : `${item.organization.name}/${item.event.name} (${item.organization.id}/${item.event.id})`;
      lines.push(
        `  ${item.deadline ?? "undated"}\t${item.severity ?? "normal"}\t${item.role}\t${item.profileName}\t${context}\t${item.title} [${item.sourceId}]`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}
