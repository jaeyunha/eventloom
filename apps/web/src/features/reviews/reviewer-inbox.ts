export type ReviewerInboxStatus = "assigned" | "in_progress" | "submitted";
export type ReviewerInboxStatusView = "all" | "needs-review" | "in-progress" | "submitted";
export type ReviewerDueFilter = "all" | "overdue" | "today" | "next-7-days" | "later" | "none";
export type ReviewerInboxGroupBy = "none" | "organization" | "event" | "round" | "due";

export interface ReviewerInboxAssignment {
  readonly id: string;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly eventId: string;
  readonly eventName: string;
  readonly planId: string;
  readonly planName: string;
  readonly roundId: string;
  readonly roundName: string;
  readonly title: string;
  readonly reference: string;
  readonly track: string | null;
  readonly dueAt: string | null;
  readonly assignmentStatus: "assigned" | "in_progress" | "submitted" | "abstained" | "superseded";
  readonly submittedAt: string | null;
}

export interface ReviewerInboxFilters {
  readonly organizationId: string | "all";
  readonly eventId: string | "all";
  readonly roundKey: string | "all";
  readonly due: ReviewerDueFilter;
  readonly track: string | "all" | "none";
}

export interface ReviewerInboxItem<TAssignment extends ReviewerInboxAssignment> {
  readonly assignment: TAssignment;
  readonly status: ReviewerInboxStatus;
  readonly due: Exclude<ReviewerDueFilter, "all">;
  readonly roundKey: string;
}

export interface ReviewerInboxGroup<TAssignment extends ReviewerInboxAssignment> {
  readonly id: string;
  readonly label: string;
  readonly items: readonly ReviewerInboxItem<TAssignment>[];
}

export const emptyReviewerInboxFilters: ReviewerInboxFilters = {
  organizationId: "all",
  eventId: "all",
  roundKey: "all",
  due: "all",
  track: "all",
};

function utcDay(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

export function reviewerDueBucket(
  dueAt: string | null,
  now: Date,
): Exclude<ReviewerDueFilter, "all"> {
  if (dueAt === null) return "none";
  const due = new Date(dueAt);
  if (!Number.isFinite(due.getTime())) return "none";
  const dueDay = utcDay(due);
  const today = utcDay(now);
  if (dueDay < today) return "overdue";
  if (dueDay === today) return "today";
  if (dueDay <= today + 7 * 86_400_000) return "next-7-days";
  return "later";
}

export function reviewerRoundKey(assignment: ReviewerInboxAssignment): string {
  return [
    assignment.organizationId,
    assignment.eventId,
    assignment.planId,
    assignment.roundId,
  ].join(":");
}

export function reviewerInboxItems<TAssignment extends ReviewerInboxAssignment>(
  assignments: readonly TAssignment[],
  recusedIds: ReadonlySet<string>,
  submittedAtById: Readonly<Record<string, string>>,
  now: Date,
): readonly ReviewerInboxItem<TAssignment>[] {
  return assignments.flatMap((assignment) => {
    if (
      recusedIds.has(assignment.id) ||
      assignment.assignmentStatus === "abstained" ||
      assignment.assignmentStatus === "superseded"
    ) {
      return [];
    }
    const submitted =
      assignment.assignmentStatus === "submitted" ||
      assignment.submittedAt !== null ||
      submittedAtById[assignment.id] !== undefined;
    const status: ReviewerInboxStatus = submitted
      ? "submitted"
      : assignment.assignmentStatus === "in_progress"
        ? "in_progress"
        : "assigned";
    return [
      {
        assignment,
        status,
        due: reviewerDueBucket(assignment.dueAt, now),
        roundKey: reviewerRoundKey(assignment),
      },
    ];
  });
}

export function filterReviewerInbox<TAssignment extends ReviewerInboxAssignment>(
  items: readonly ReviewerInboxItem<TAssignment>[],
  statusView: ReviewerInboxStatusView,
  filters: ReviewerInboxFilters,
): readonly ReviewerInboxItem<TAssignment>[] {
  return items.filter(({ assignment, due, roundKey, status }) => {
    if (statusView === "needs-review" && status !== "assigned") return false;
    if (statusView === "in-progress" && status !== "in_progress") return false;
    if (statusView === "submitted" && status !== "submitted") return false;
    if (filters.organizationId !== "all" && assignment.organizationId !== filters.organizationId) {
      return false;
    }
    if (filters.eventId !== "all" && assignment.eventId !== filters.eventId) return false;
    if (filters.roundKey !== "all" && roundKey !== filters.roundKey) return false;
    if (filters.due !== "all" && due !== filters.due) return false;
    if (filters.track === "none" && assignment.track !== null) return false;
    if (filters.track !== "all" && filters.track !== "none" && assignment.track !== filters.track) {
      return false;
    }
    return true;
  });
}

const statusOrder: Readonly<Record<ReviewerInboxStatus, number>> = {
  assigned: 0,
  in_progress: 1,
  submitted: 2,
};

export function sortReviewerInbox<TAssignment extends ReviewerInboxAssignment>(
  items: readonly ReviewerInboxItem<TAssignment>[],
): readonly ReviewerInboxItem<TAssignment>[] {
  return [...items].sort((left, right) => {
    const statusDifference = statusOrder[left.status] - statusOrder[right.status];
    if (statusDifference !== 0) return statusDifference;
    const leftDue = left.assignment.dueAt ?? "9999";
    const rightDue = right.assignment.dueAt ?? "9999";
    return (
      leftDue.localeCompare(rightDue) ||
      left.assignment.title.localeCompare(right.assignment.title) ||
      left.assignment.id.localeCompare(right.assignment.id)
    );
  });
}

export function groupReviewerInbox<TAssignment extends ReviewerInboxAssignment>(
  items: readonly ReviewerInboxItem<TAssignment>[],
  groupBy: ReviewerInboxGroupBy,
): readonly ReviewerInboxGroup<TAssignment>[] {
  if (groupBy === "none") {
    return [{ id: "all", label: "", items: sortReviewerInbox(items) }];
  }

  const groups = new Map<string, { label: string; items: ReviewerInboxItem<TAssignment>[] }>();
  for (const item of sortReviewerInbox(items)) {
    const { assignment } = item;
    const [id, label] =
      groupBy === "organization"
        ? [assignment.organizationId, assignment.organizationName]
        : groupBy === "round"
          ? [item.roundKey, `${assignment.eventName} · ${assignment.roundName}`]
          : groupBy === "due"
            ? [item.due, item.due.replaceAll("-", " ")]
            : [assignment.eventId, assignment.eventName];
    const group = groups.get(id) ?? { label, items: [] };
    group.items.push(item);
    groups.set(id, group);
  }
  return [...groups].map(([id, group]) => ({ id, ...group }));
}
