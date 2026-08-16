import { localDateInTimeZone } from "@eventloom/contracts";
import type { Event } from "./types";

export type EventCalendarContext = Pick<
  Event,
  "startsAt" | "endsAt" | "timeZone" | "scheduleDates"
>;

export class EventTemporalDependencyConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventTemporalDependencyConflictError";
  }
}

export interface EventReviewBoundary {
  readonly label: string;
  readonly occursAt: string;
}

export interface EventAgendaEntryBoundary {
  readonly label: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly startsAtLocal: string;
  readonly endsAtLocal: string;
}

export interface EventTemporalDependencySource {
  reviewBoundaries(
    organizationId: string,
    eventId: string,
  ): Promise<readonly EventReviewBoundary[]>;
  agendaState(
    organizationId: string,
    eventId: string,
  ): Promise<{ readonly timeZone: string } | null>;
  agendaEntries(
    organizationId: string,
    eventId: string,
  ): Promise<readonly EventAgendaEntryBoundary[]>;
}

export async function assertEventTemporalDependencies(
  source: EventTemporalDependencySource,
  current: Event,
  next: Event,
): Promise<void> {
  const calendarChanged =
    current.startsAt !== next.startsAt ||
    current.endsAt !== next.endsAt ||
    current.timeZone !== next.timeZone ||
    (current.scheduleDates ?? []).join("\u0000") !== (next.scheduleDates ?? []).join("\u0000");
  if (!calendarChanged) return;

  const [reviewBoundaries, agendaState, agendaEntries] = await Promise.all([
    source.reviewBoundaries(next.organizationId, next.id),
    source.agendaState(next.organizationId, next.id),
    source.agendaEntries(next.organizationId, next.id),
  ]);
  const nextEnd = Date.parse(next.endsAt);
  const lateReview = reviewBoundaries.find((boundary) => Date.parse(boundary.occursAt) > nextEnd);
  if (lateReview !== undefined) {
    throw conflict(`${lateReview.label} is after the proposed event end.`);
  }
  if (current.timeZone !== next.timeZone && agendaState !== null) {
    throw conflict("Remove the event agenda before changing the event timezone.");
  }
  const invalidAgendaEntry = agendaEntries.find((entry) =>
    agendaEntryFallsOutsideEvent(entry, next),
  );
  if (invalidAgendaEntry !== undefined) {
    throw conflict(`${invalidAgendaEntry.label} falls outside the proposed event schedule.`);
  }
}

export function eventAllowedDates(event: EventCalendarContext): readonly string[] {
  return (event.scheduleDates ?? []).length > 0
    ? (event.scheduleDates ?? [])
    : eventDatesBetween(
        localDateInTimeZone(event.startsAt, event.timeZone),
        localDateInTimeZone(event.endsAt, event.timeZone),
      );
}

export function agendaEntryFallsOutsideEvent(
  entry: EventAgendaEntryBoundary,
  event: EventCalendarContext,
): boolean {
  const localStartDate = entry.startsAtLocal.slice(0, 10);
  const localEndDate = entry.endsAtLocal.slice(0, 10);
  return (
    Date.parse(entry.startsAt) < Date.parse(event.startsAt) ||
    Date.parse(entry.endsAt) > Date.parse(event.endsAt) ||
    localStartDate !== localEndDate ||
    !eventAllowedDates(event).includes(localStartDate)
  );
}

function conflict(message: string): EventTemporalDependencyConflictError {
  return new EventTemporalDependencyConflictError(message);
}

function eventDatesBetween(startDate: string, endDate: string): readonly string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}
