import Link from "next/link";
import styles from "../../../features/admin/admin-shell.module.css";

type EventStatus = "live" | "draft" | "archived";

type OrganizerEvent = {
  id: string;
  name: string;
  slug: string;
  status: EventStatus;
  statusLabel: string;
  dateLabel: string;
  dateTime: string;
  timezone: string;
  submissions: string;
  description: string;
};

const events: readonly OrganizerEvent[] = [
  {
    id: "summit-2026",
    name: "Open Sessionboard Summit 2026",
    slug: "summit-2026",
    status: "live",
    statusLabel: "CFP open",
    dateLabel: "September 17–18, 2026",
    dateTime: "2026-09-17",
    timezone: "America/Los_Angeles · UTC−07:00",
    submissions: "128 submissions",
    description: "The main annual gathering for program builders and open-source teams.",
  },
  {
    id: "community-meetup",
    name: "Open Sessionboard Community Meetup",
    slug: "community-meetup",
    status: "live",
    statusLabel: "Reviewing",
    dateLabel: "October 22, 2026",
    dateTime: "2026-10-22",
    timezone: "America/Los_Angeles · UTC−07:00",
    submissions: "24 submissions",
    description: "An evening program featuring practical community-led sessions.",
  },
  {
    id: "winter-labs-2027",
    name: "Winter Labs 2027",
    slug: "winter-labs-2027",
    status: "draft",
    statusLabel: "Draft",
    dateLabel: "January 28–29, 2027",
    dateTime: "2027-01-28",
    timezone: "America/New_York · UTC−05:00",
    submissions: "Not open",
    description: "A focused workshop event for experiments, prototypes, and new formats.",
  },
] as const;

const statusClass = {
  live: styles.statusLive,
  draft: styles.statusDraft,
  archived: styles.statusArchived,
} as const;

export default function AdminEventsPage() {
  return (
    <>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeaderCopy}>
          <p className={styles.eyebrow}>Organizer workspace</p>
          <h1 className={styles.pageTitle}>Events</h1>
          <p className={styles.pageDescription}>
            Keep event details, CFPs, and program timelines in one clear place. Dates are shown in
            each event&apos;s timezone.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link className={styles.primaryButton} href="/admin/events/summit-2026/cfp#event-details">
            Create event <span aria-hidden="true">+</span>
          </Link>
        </div>
      </header>

      <section className={styles.panel} aria-labelledby="event-list-title">
        <div className={styles.panelHeader}>
          <div className={styles.panelHeading}>
            <p className={styles.panelEyebrow}>Program calendar</p>
            <h2 className={styles.panelTitle} id="event-list-title">
              Your events <span className={styles.muted}>· {events.length} total</span>
            </h2>
          </div>
          <span className={styles.muted}>Last synced August 8, 2026</span>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.eventsTable}>
            <caption>Organizer events and their current status</caption>
            <thead>
              <tr>
                <th scope="col">Event</th>
                <th scope="col">Status</th>
                <th scope="col">Event date</th>
                <th scope="col">Submissions</th>
                <th scope="col">
                  <span className={styles.srOnly}>Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td className={styles.eventNameCell}>
                    <p className={styles.eventName}>{event.name}</p>
                    <p className={styles.eventSlug}>/{event.slug}</p>
                  </td>
                  <td>
                    <span className={`${styles.statusBadge} ${statusClass[event.status]}`}>
                      <span aria-hidden="true">●</span>&nbsp;{event.statusLabel}
                    </span>
                  </td>
                  <td className={styles.eventDateCell}>
                    <time className={styles.eventDate} dateTime={event.dateTime}>
                      {event.dateLabel}
                    </time>
                    <span className={styles.eventTimezone}>{event.timezone}</span>
                  </td>
                  <td>{event.submissions}</td>
                  <td>
                    <div className={styles.eventActions}>
                      <Link
                        className={styles.eventLink}
                        href={`/admin/events/${event.id}/cfp#event-details`}
                      >
                        Configure
                      </Link>
                      <Link
                        className={styles.outlineButton}
                        href={`/admin/events/${event.id}/cfp#fields-rules`}
                      >
                        Open CFP <span aria-hidden="true">→</span>
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className={styles.eventCardList} aria-label="Events list">
          {events.map((event) => (
            <article className={styles.eventCard} key={event.id}>
              <div className={styles.eventCardTop}>
                <div>
                  <h2>{event.name}</h2>
                  <p className={styles.eventSlug}>/{event.slug}</p>
                </div>
                <span className={`${styles.statusBadge} ${statusClass[event.status]}`}>
                  <span aria-hidden="true">●</span>&nbsp;{event.statusLabel}
                </span>
              </div>
              <p className={styles.taskDescription}>{event.description}</p>
              <div className={styles.eventCardMeta}>
                <span>
                  Date <strong>{event.dateLabel}</strong>
                </span>
                <span>
                  Timezone <strong>{event.timezone}</strong>
                </span>
                <span>
                  Submissions <strong>{event.submissions}</strong>
                </span>
              </div>
              <div className={styles.eventCardActions}>
                <Link
                  className={styles.secondaryButton}
                  href={`/admin/events/${event.id}/cfp#event-details`}
                >
                  Configure
                </Link>
                <Link
                  className={styles.primaryButton}
                  href={`/admin/events/${event.id}/cfp#fields-rules`}
                >
                  Open CFP <span aria-hidden="true">→</span>
                </Link>
              </div>
            </article>
          ))}
        </section>
      </section>

      <aside className={styles.callout} aria-label="Timezone guidance">
        <span className={styles.calloutIcon} aria-hidden="true">
          i
        </span>
        <div>
          <strong>Event time is the source of truth.</strong>
          <p>
            Schedule and communication dates use the event timezone above. Viewer-local display is
            available in agenda previews.
          </p>
        </div>
      </aside>
    </>
  );
}
