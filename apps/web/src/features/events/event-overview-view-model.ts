import type { EventOverviewData } from "./event-overview-data";

export interface EventOverviewAttention {
  readonly kind: "submissions" | "reviews" | "agenda" | "conflicts";
  readonly title: string;
  readonly description: string;
  readonly href: string;
  readonly action: string;
}

export interface EventOverviewPhase {
  readonly label: string;
  readonly meta: string;
  readonly href: string;
  readonly done: boolean;
}

export function formatOverviewInstant(value: string | null, timeZone: string): string {
  if (value === null) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

export function formatOverviewDateRange(data: EventOverviewData): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: data.event.timeZone,
  });
  return `${formatter.format(new Date(data.event.startsAt))} – ${formatter.format(
    new Date(data.event.endsAt),
  )}`;
}

export function eventOverviewAttention(
  data: EventOverviewData,
  base: string,
): readonly EventOverviewAttention[] {
  const items: EventOverviewAttention[] = [];
  if (data.submissions.status === "unavailable") {
    items.push({
      kind: "submissions",
      title: "Submission intake needs setup",
      description: data.submissions.message,
      href: `${base}/cfp`,
      action: "Open CFP",
    });
  } else if (data.submissions.awaitingDecision > 0) {
    items.push({
      kind: "reviews",
      title: `${data.submissions.awaitingDecision} submissions await a decision`,
      description: "Continue review and record the organizer outcome.",
      href: `${base}/submissions`,
      action: "Review",
    });
  }
  if (data.agenda.status === "unavailable") {
    items.push({
      kind: "agenda",
      title: "Agenda metrics are unavailable",
      description: data.agenda.message,
      href: `${base}/agenda`,
      action: "Open agenda",
    });
  } else if (data.agenda.conflicts > 0) {
    items.push({
      kind: "conflicts",
      title: `${data.agenda.conflicts} schedule conflicts need attention`,
      description: "Resolve blocking conflicts before publishing the agenda.",
      href: `${base}/agenda`,
      action: "Resolve",
    });
  }
  return items;
}

export function eventOverviewMetrics(
  data: EventOverviewData,
): readonly (readonly [string, string])[] {
  const submissions: readonly (readonly [string, string])[] =
    data.submissions.status === "ready"
      ? [
          ["Submissions", String(data.submissions.total)],
          ["Awaiting decision", String(data.submissions.awaitingDecision)],
          ["Accepted submissions", String(data.submissions.accepted)],
        ]
      : [
          ["Submissions", "—"],
          ["Awaiting decision", "—"],
          ["Accepted submissions", "—"],
        ];
  return [
    ...submissions,
    ["Schedule conflicts", data.agenda.status === "ready" ? String(data.agenda.conflicts) : "—"],
  ];
}

export function eventOverviewPhases(
  data: EventOverviewData,
  base: string,
): readonly EventOverviewPhase[] {
  return [
    {
      label: "Intake",
      meta:
        data.submissions.status === "ready"
          ? `${data.submissions.total} submissions`
          : "Setup required",
      href: `${base}/cfp`,
      done: data.submissions.status === "ready",
    },
    {
      label: "Review",
      meta:
        data.submissions.status === "ready"
          ? `${data.submissions.awaitingDecision} awaiting decision`
          : "No submission data",
      href: `${base}/submissions`,
      done: data.submissions.status === "ready" && data.submissions.awaitingDecision === 0,
    },
    {
      label: "Agenda",
      meta:
        data.agenda.status === "ready"
          ? `${data.agenda.scheduledSessions} scheduled`
          : "Unavailable",
      href: `${base}/agenda`,
      done: data.agenda.status === "ready" && data.agenda.conflicts === 0,
    },
    {
      label: "Publish",
      meta:
        data.agenda.status === "ready"
          ? `${data.agenda.publishedSessions} published`
          : "Unavailable",
      href: `${base}/agenda`,
      done: data.agenda.status === "ready" && data.agenda.publishedSessions > 0,
    },
  ];
}
