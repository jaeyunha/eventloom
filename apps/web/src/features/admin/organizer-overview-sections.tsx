"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import styles from "./admin-shell.module.css";
import { EventDatePicker, type EventDateSelectionValue } from "./event-date-picker";
import type { OrganizerEventEditorProps, OrganizerEventsData } from "./organizer-overview";
import {
  getCalendarMonthCells,
  initialCalendarMonth,
  normalizeOrganizerEventSlug,
  type OrganizerEventCreateInput,
  type OrganizerEventFormValues,
  type OrganizerEventRecord,
  type OrganizerEventStatus,
  organizerEventEditorFormValues,
  organizerEventIntersectsCalendarDate,
  organizerEventMinimumDateTimeLocal,
  eventStatusClass as organizerEventStatusClass,
  parseCalendarInstant,
  validateOrganizerEventForm,
} from "./organizer-overview-model";

const organizerEventStatuses = ["draft", "active", "archived"] as const;

const ORGANIZER_OVERVIEW_MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const ORGANIZER_OVERVIEW_CALENDAR_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const EVENT_MANAGEMENT_DATE_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function canonicalCalendarDate(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12));
}

function eventManagementDateFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = EVENT_MANAGEMENT_DATE_FORMATTER_CACHE.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  });
  EVENT_MANAGEMENT_DATE_FORMATTER_CACHE.set(timeZone, formatter);
  return formatter;
}

function formatEventManagementDate(value: string, timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  try {
    return eventManagementDateFormatter(timeZone).format(date);
  } catch {
    return value;
  }
}

function formatEventManagementDates(event: OrganizerEventRecord): string {
  const start = formatEventManagementDate(event.startsAt, event.timeZone);
  const end = formatEventManagementDate(event.endsAt, event.timeZone);
  return `${start} – ${end}`;
}

function eventSettingsHref(organizationId: string, eventId: string): string {
  return `/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventId)}/settings`;
}

function agendaHref(organizationId: string, eventId: string): string {
  return `/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventId)}/agenda`;
}

const organizerEventStatusClasses = {
  statusLive: styles.statusLive,
  statusDraft: styles.statusDraft,
  statusArchived: styles.statusArchived,
} as const;

function eventStatusClass(status: string | null): string {
  return organizerEventStatusClasses[organizerEventStatusClass(status)] ?? "";
}

function eventManagementStatusLabel(status: OrganizerEventStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function OrganizerEventEditor({
  event,
  busy = false,
  onSave,
  onCancel,
}: OrganizerEventEditorProps) {
  const [values, setValues] = useState<OrganizerEventFormValues>(() =>
    organizerEventEditorFormValues(event),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const eventSlugPreview = normalizeOrganizerEventSlug(values.slug || values.name);
  const minimumDateTime = event ? undefined : organizerEventMinimumDateTimeLocal(values.timeZone);
  const cfpCloseMinimum =
    minimumDateTime === undefined || values.cfpOpensAt > minimumDateTime
      ? values.cfpOpensAt || minimumDateTime
      : minimumDateTime;

  function updateValue<K extends keyof OrganizerEventFormValues>(
    key: K,
    value: OrganizerEventFormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
    if (formError) setFormError(null);
  }

  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const result = validateOrganizerEventForm(values, { allowPastDates: event !== undefined });
    if (!result.input) {
      setFormError(result.error ?? "Check the event fields.");
      return;
    }
    if (!onSave) return;
    setFormError(null);
    try {
      await onSave(result.input);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "The event could not be saved.");
    }
  }

  return (
    <form className={styles.eventForm} onSubmit={(formEvent) => void submit(formEvent)}>
      <div className={styles.eventEditorIntro}>
        <h2
          className={`${styles.panelTitle} ${styles.eventEditorTitle}`}
          id="organizer-event-editor-title"
        >
          {event ? "Configure event" : "Create event"}
        </h2>
        <p className={styles.muted}>
          Add the public identity, schedule, and location. New events start as drafts.
        </p>
      </div>
      <div className={styles.eventTwoColumn}>
        <label className={styles.eventField} htmlFor="organizer-event-name">
          <span className={styles.eventFieldLabel}>Event name</span>
          <Input
            id="organizer-event-name"
            name="name"
            type="text"
            value={values.name}
            maxLength={200}
            required
            onChange={(formEvent) => updateValue("name", formEvent.target.value)}
          />
          <span className={styles.eventFieldDescription}>
            The display title organizers and attendees will see.
          </span>
        </label>
        <label className={styles.eventField} htmlFor="organizer-event-slug">
          <span className={styles.eventFieldLabel}>Public URL slug</span>
          <Input
            id="organizer-event-slug"
            name="slug"
            type="text"
            value={values.slug}
            maxLength={80}
            placeholder="summit-2026"
            onChange={(formEvent) => updateValue("slug", formEvent.target.value)}
          />
          <span className={styles.eventFieldDescription}>
            {eventSlugPreview ? (
              <>
                Public slug: <code>{eventSlugPreview}</code>.{" "}
              </>
            ) : null}
            Leave blank to generate it from the event name. The private event ID is generated
            separately after creation.
          </span>
        </label>
      </div>
      <div className={styles.eventTwoColumn}>
        {event ? (
          <label className={styles.eventField} htmlFor="organizer-event-status">
            <span className={styles.eventFieldLabel}>Status</span>
            <select
              className={styles.eventInput}
              id="organizer-event-status"
              name="status"
              value={values.status}
              onChange={(formEvent) =>
                updateValue("status", formEvent.target.value as OrganizerEventStatus)
              }
            >
              {organizerEventStatuses.map((status) => (
                <option key={status} value={status}>
                  {status === "active"
                    ? "Active"
                    : status.charAt(0).toUpperCase() + status.slice(1)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label
          className={`${styles.eventField} ${event ? "" : styles.eventFieldFull}`}
          htmlFor="organizer-event-time-zone"
        >
          <span className={styles.eventFieldLabel}>Event time zone</span>
          <Input
            id="organizer-event-time-zone"
            name="timeZone"
            type="text"
            list="organizer-event-time-zones"
            value={values.timeZone}
            placeholder="America/Los_Angeles"
            required
            onChange={(formEvent) => updateValue("timeZone", formEvent.target.value)}
          />
          <span className={styles.eventFieldDescription}>
            All event and agenda times are entered and shown in this time zone.
          </span>
          <datalist id="organizer-event-time-zones">
            <option value="UTC" />
            <option value="America/Los_Angeles" />
            <option value="America/New_York" />
            <option value="Europe/London" />
            <option value="Asia/Tokyo" />
          </datalist>
        </label>
      </div>
      <EventDatePicker
        mode={values.dateMode}
        startsAt={values.startsAt}
        endsAt={values.endsAt}
        scheduleDates={values.scheduleDates}
        minimumDateTime={minimumDateTime}
        onChange={(selection: EventDateSelectionValue) => {
          setValues((current) => ({
            ...current,
            dateMode: selection.mode,
            startsAt: selection.startsAt,
            endsAt: selection.endsAt,
            scheduleDates: selection.scheduleDates,
          }));
          if (formError) setFormError(null);
        }}
      />
      <label className={styles.eventField} htmlFor="organizer-event-venue">
        <span className={styles.eventFieldLabel}>Event location</span>
        <Input
          id="organizer-event-venue"
          name="venue"
          type="text"
          value={values.venue}
          maxLength={2_000}
          placeholder="Pier 27, San Francisco or Online"
          onChange={(formEvent) => updateValue("venue", formEvent.target.value)}
        />
        <span className={styles.eventFieldDescription}>
          Shown on the event. Session rooms and join links can be more specific.
        </span>
      </label>
      <details className={styles.eventAdvanced} open={values.cfpEnabled || undefined}>
        <summary className={styles.eventAdvancedSummary}>
          <span>Advanced setup</span>
          <small>Optional call-for-proposals scheduling</small>
        </summary>
        <fieldset className={styles.eventFieldset}>
          <legend className={styles.eventLegend}>Call for proposals</legend>
          <div className={styles.eventCheckboxLabel}>
            <Checkbox
              aria-label="Open a call for proposals"
              name="cfpSettings.enabled"
              checked={values.cfpEnabled}
              onCheckedChange={(checked) => updateValue("cfpEnabled", checked === true)}
            />
            <span>
              Open a call for proposals
              <small>Collect session proposals for this event.</small>
            </span>
          </div>
          {values.cfpEnabled ? (
            <div className={styles.eventTwoColumn}>
              <label className={styles.eventField} htmlFor="organizer-event-cfp-opens-at">
                <span className={styles.eventFieldLabel}>CFP opens</span>
                <Input
                  id="organizer-event-cfp-opens-at"
                  name="cfpSettings.opensAt"
                  type="datetime-local"
                  value={values.cfpOpensAt}
                  min={minimumDateTime}
                  onChange={(formEvent) => updateValue("cfpOpensAt", formEvent.target.value)}
                />
              </label>
              <label className={styles.eventField} htmlFor="organizer-event-cfp-closes-at">
                <span className={styles.eventFieldLabel}>CFP closes</span>
                <Input
                  id="organizer-event-cfp-closes-at"
                  name="cfpSettings.closesAt"
                  type="datetime-local"
                  value={values.cfpClosesAt}
                  min={cfpCloseMinimum}
                  onChange={(formEvent) => updateValue("cfpClosesAt", formEvent.target.value)}
                />
              </label>
            </div>
          ) : null}
        </fieldset>
      </details>
      {formError ? (
        <Alert variant="destructive">
          <AlertTitle>Check the event details</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
      <div className={styles.eventInlineActions}>
        {onCancel ? (
          <Button variant="outline" type="button" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={busy}>
          {busy ? "Saving event…" : event ? "Save event" : "Create event"}
        </Button>
      </div>
    </form>
  );
}

interface OrganizerEventsLoadedProps {
  readonly data: OrganizerEventsData;
  readonly busy: boolean;
  readonly notice: string | null;
  readonly initialEditor?: "create" | undefined;
  readonly onCreate?: ((input: OrganizerEventCreateInput) => Promise<void>) | undefined;
  readonly onUpdate?:
    | ((
        eventId: string,
        input: OrganizerEventCreateInput,
        expectedVersion: number,
      ) => Promise<void>)
    | undefined;
  readonly onArchive?: ((eventId: string, expectedVersion: number) => Promise<void>) | undefined;
}

interface OrganizerEventsWorkspaceProps {
  readonly data: OrganizerEventsData;
  readonly busy: boolean;
  readonly editor: "create" | string | null;
  readonly view: "calendar" | "list";
  readonly upcomingEvents: readonly OrganizerEventRecord[];
  readonly monthLabel: string;
  readonly calendarCells: ReturnType<typeof getCalendarMonthCells>;
  readonly onViewChange: (view: "calendar" | "list") => void;
  readonly onPreviousMonth: () => void;
  readonly onToday: () => void;
  readonly onNextMonth: () => void;
  readonly onEdit: (eventId: string) => void;
  readonly onArchiveRequest: (event: OrganizerEventRecord) => void;
  readonly onArchive?: ((eventId: string, expectedVersion: number) => Promise<void>) | undefined;
  readonly onUpdate?:
    | ((
        eventId: string,
        input: OrganizerEventCreateInput,
        expectedVersion: number,
      ) => Promise<void>)
    | undefined;
}

function OrganizerEventsWorkspace({
  data,
  busy,
  editor,
  view,
  upcomingEvents,
  monthLabel,
  calendarCells,
  onViewChange,
  onPreviousMonth,
  onToday,
  onNextMonth,
  onEdit,
  onArchiveRequest,
  onArchive,
  onUpdate,
}: OrganizerEventsWorkspaceProps) {
  return (
    <Tabs
      hidden={editor !== null}
      value={view}
      onValueChange={(value) => onViewChange(value === "list" ? "list" : "calendar")}
    >
      <Card className={styles.eventsCard} aria-labelledby="organizer-events-title">
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardDescription>Live organization data</CardDescription>
            <CardTitle>
              <h2 id="organizer-events-title">Events</h2>
            </CardTitle>
          </div>
          <TabsList aria-label="Event display">
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="list">List</TabsTrigger>
          </TabsList>
        </CardHeader>

        {data.events.length === 0 ? (
          <CardContent>
            <p className={styles.muted} role="status">
              No events are available for this organization yet. Create an event to begin.
            </p>
          </CardContent>
        ) : view === "calendar" ? (
          <TabsContent value="calendar" className={`${styles.calendarWorkspace} mt-0`}>
            <aside className={styles.calendarRail} aria-label="Calendar summary">
              <div className={styles.calendarRailSection}>
                <p className={styles.panelEyebrow}>Upcoming events</p>
                {upcomingEvents.length === 0 ? (
                  <p className={styles.muted}>No upcoming events to show.</p>
                ) : (
                  <ul className={styles.upcomingList}>
                    {upcomingEvents.map((event) => (
                      <li key={event.id}>
                        <Link
                          className={styles.upcomingLink}
                          href={eventSettingsHref(data.organizationId, event.id)}
                        >
                          <span className={styles.upcomingTitleRow}>
                            <strong>{event.name}</strong>
                            <Badge className={eventStatusClass(event.status)} variant="outline">
                              {eventManagementStatusLabel(event.status)}
                            </Badge>
                          </span>
                          <code className={styles.eventIdentifier}>{event.id}</code>
                          <span>
                            {formatEventManagementDate(event.startsAt, event.timeZone)} ·{" "}
                            {event.timeZone}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className={styles.calendarRailSection}>
                <p className={styles.panelEyebrow}>Event identity</p>
                <p className={styles.muted}>
                  The event name is the display title. Its ID stays stable in URLs and keeps each
                  event&apos;s data isolated.
                </p>
              </div>
            </aside>

            <div className={styles.calendarMain}>
              <div className={styles.calendarToolbar}>
                <div className={styles.calendarMonthControls}>
                  <Button
                    size="icon"
                    type="button"
                    variant="outline"
                    aria-label="Previous month"
                    onClick={() => onPreviousMonth()}
                  >
                    <ChevronLeft aria-hidden="true" />
                  </Button>
                  <Button size="sm" type="button" variant="outline" onClick={() => onToday()}>
                    Today
                  </Button>
                  <Button
                    size="icon"
                    type="button"
                    variant="outline"
                    aria-label="Next month"
                    onClick={() => onNextMonth()}
                  >
                    <ChevronRight aria-hidden="true" />
                  </Button>
                  <h3 className={styles.calendarMonthLabel}>{monthLabel}</h3>
                </div>
                <Badge variant="secondary">{data.events.length} total</Badge>
              </div>

              <div className={styles.calendarScroll}>
                <table className={styles.calendarGrid}>
                  <caption className={styles.srOnly}>{monthLabel} events</caption>
                  <thead>
                    <tr className={styles.weekdayRow}>
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((weekday) => (
                        <th className={styles.weekday} scope="col" key={weekday}>
                          {weekday}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className={styles.calendarCells}>
                    {Array.from({ length: 6 }, (_, weekIndex) => (
                      <tr key={calendarCells[weekIndex * 7]?.dateKey}>
                        {calendarCells.slice(weekIndex * 7, weekIndex * 7 + 7).map((cell) => {
                          const cellEvents = data.events.filter(
                            (event) =>
                              event.status !== "archived" &&
                              organizerEventIntersectsCalendarDate(event, cell.date),
                          );
                          return (
                            <td
                              className={`${styles.calendarCell} ${cell.isCurrentMonth ? "" : styles.calendarCellOutside}`}
                              key={cell.dateKey}
                            >
                              <time dateTime={cell.dateKey} className={styles.calendarDate}>
                                <span className={styles.srOnly}>
                                  {ORGANIZER_OVERVIEW_CALENDAR_DATE_FORMATTER.format(
                                    canonicalCalendarDate(cell.date),
                                  )}
                                </span>
                                <span aria-hidden="true">{cell.date.getDate()}</span>
                              </time>
                              <div className={styles.calendarEventList}>
                                {cellEvents.map((event) => (
                                  <Link
                                    className={styles.calendarEvent}
                                    href={eventSettingsHref(data.organizationId, event.id)}
                                    key={event.id}
                                    aria-label={event.name}
                                  >
                                    <span className={styles.calendarEventName}>{event.name}</span>
                                    <span className={styles.calendarEventStatus}>
                                      {eventManagementStatusLabel(event.status)}
                                    </span>
                                  </Link>
                                ))}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>
        ) : (
          <TabsContent value="list" className="mt-0">
            <div className={styles.tableWrap}>
              <table className={styles.eventsTable}>
                <caption>Organization events and their current status</caption>
                <thead>
                  <tr>
                    <th scope="col">Event</th>
                    <th scope="col">Status</th>
                    <th scope="col">Event dates</th>
                    <th scope="col">
                      <span className={styles.srOnly}>Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.map((event) => (
                    <tr key={event.id}>
                      <td className={styles.eventNameCell}>
                        <Link
                          className={styles.eventName}
                          href={eventSettingsHref(data.organizationId, event.id)}
                        >
                          {event.name}
                        </Link>
                        <p className={styles.eventSlug}>/{event.slug}</p>
                      </td>
                      <td>
                        <Badge className={eventStatusClass(event.status)} variant="outline">
                          {eventManagementStatusLabel(event.status)}
                        </Badge>
                      </td>
                      <td className={styles.eventDateCell}>
                        {formatEventManagementDates(event)}
                        <span className={styles.eventSlug}>{event.timeZone}</span>
                      </td>
                      <td>
                        <div className={styles.eventActions}>
                          <Button asChild size="sm" variant="outline">
                            <Link href={agendaHref(data.organizationId, event.id)}>Agenda</Link>
                          </Button>
                          <Button asChild size="sm" variant="outline">
                            <Link href={eventSettingsHref(data.organizationId, event.id)}>
                              Settings
                            </Link>
                          </Button>
                          {onUpdate ? (
                            <Button
                              size="sm"
                              type="button"
                              variant="secondary"
                              disabled={busy}
                              onClick={() => onEdit(event.id)}
                            >
                              {editor === event.id ? "Close editor" : "Edit"}
                            </Button>
                          ) : null}
                          {event.status !== "archived" && onArchive ? (
                            <Button
                              size="sm"
                              type="button"
                              variant="outline"
                              disabled={busy}
                              onClick={() => onArchiveRequest(event)}
                            >
                              Archive
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
        )}
      </Card>
    </Tabs>
  );
}

export function OrganizerEventsLoaded({
  data,
  busy,
  notice,
  initialEditor,
  onCreate,
  onUpdate,
  onArchive,
}: OrganizerEventsLoadedProps) {
  const [editor, setEditor] = useState<"create" | string | null>(initialEditor ?? null);
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [visibleMonth, setVisibleMonth] = useState(() => initialCalendarMonth(data.events));
  const [archiveTarget, setArchiveTarget] = useState<OrganizerEventRecord | null>(null);
  const editingEvent =
    editor !== null && editor !== "create"
      ? data.events.find((event) => event.id === editor)
      : undefined;
  const calendarCells = getCalendarMonthCells(visibleMonth);
  const monthLabel = ORGANIZER_OVERVIEW_MONTH_FORMATTER.format(canonicalCalendarDate(visibleMonth));
  const upcomingEvents = [...data.events]
    .filter((event) => {
      const startsAt = parseCalendarInstant(event.startsAt);
      return event.status !== "archived" && startsAt !== null && startsAt >= new Date();
    })
    .sort((left, right) => {
      const leftStart = parseCalendarInstant(left.startsAt)?.valueOf() ?? Number.POSITIVE_INFINITY;
      const rightStart =
        parseCalendarInstant(right.startsAt)?.valueOf() ?? Number.POSITIVE_INFINITY;
      return leftStart - rightStart;
    })
    .slice(0, 5);

  async function create(input: OrganizerEventCreateInput) {
    if (!onCreate) return;
    await onCreate(input);
    setEditor(null);
  }

  async function update(input: OrganizerEventCreateInput) {
    if (!editingEvent || !onUpdate) return;
    await onUpdate(editingEvent.id, input, editingEvent.version);
    setEditor(null);
  }

  async function archive() {
    if (!onArchive || archiveTarget === null) return;
    await onArchive(archiveTarget.id, archiveTarget.version);
    setArchiveTarget(null);
  }

  return (
    <>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeaderCopy}>
          <p className={styles.eyebrow}>Organizer workspace</p>
          <h1 className={styles.pageTitle}>Event management</h1>
          <p className={styles.pageDescription}>
            {editor === null
              ? "Keep event dates visible at a glance, then switch to List for configuration and actions."
              : "Complete the event setup below. The event collection returns when this editor closes."}
          </p>
        </div>
        {onCreate ? (
          <div className={styles.headerActions}>
            <Button
              type="button"
              onClick={() => setEditor((current) => (current === "create" ? null : "create"))}
              aria-expanded={editor === "create"}
              aria-controls="organizer-event-editor"
            >
              {editor === "create" ? "Close create form" : "Create event"}
            </Button>
          </div>
        ) : null}
      </header>

      {notice ? (
        <Alert role="status">
          <AlertTitle>Event updated</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      {editor !== null && onCreate && onUpdate ? (
        <Card
          className={styles.eventEditorCard}
          id="organizer-event-editor"
          aria-labelledby="organizer-event-editor-title"
        >
          <CardContent className="pt-6">
            <OrganizerEventEditor
              key={`${data.organizationId}:${editor}`}
              event={editingEvent}
              busy={busy}
              onCancel={() => setEditor(null)}
              onSave={editor === "create" ? create : update}
            />
          </CardContent>
        </Card>
      ) : null}

      <OrganizerEventsWorkspace
        data={data}
        busy={busy}
        editor={editor}
        view={view}
        upcomingEvents={upcomingEvents}
        monthLabel={monthLabel}
        calendarCells={calendarCells}
        onViewChange={(nextView) => setView(nextView)}
        onPreviousMonth={() =>
          setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))
        }
        onToday={() =>
          setVisibleMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
        }
        onNextMonth={() =>
          setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))
        }
        onEdit={(eventId) => setEditor((current) => (current === eventId ? null : eventId))}
        onArchiveRequest={setArchiveTarget}
        onUpdate={onUpdate}
        onArchive={onArchive}
      />
      <AlertDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this event?</AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget
                ? `${archiveTarget.name} will leave active event workflows.`
                : "This event will leave active event workflows."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} variant="destructive" onClick={() => void archive()}>
              Archive event
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
