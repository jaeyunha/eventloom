export interface PublicEventDirectoryEntry {
  readonly slug: string;
  readonly name: string;
  readonly timeZone: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly venueName: string | null;
  readonly cfpOpen: boolean;
  readonly programPublished: boolean;
}

export interface PublicOrganizationDirectoryEntry {
  readonly organization: {
    readonly id: string;
    readonly name: string;
  };
  readonly events: readonly PublicEventDirectoryEntry[];
}

export interface PublicEventDirectoryResponse {
  readonly data: readonly PublicOrganizationDirectoryEntry[];
}

const PUBLIC_EVENT_MONTH_DAY_OPTIONS = {
  month: "long",
  day: "numeric",
} as const;
const PUBLIC_EVENT_START_WITH_YEAR_FORMATTER = new Intl.DateTimeFormat("en", {
  ...PUBLIC_EVENT_MONTH_DAY_OPTIONS,
  year: "numeric",
  timeZone: "UTC",
});
const PUBLIC_EVENT_START_WITHOUT_YEAR_FORMATTER = new Intl.DateTimeFormat("en", {
  ...PUBLIC_EVENT_MONTH_DAY_OPTIONS,
  timeZone: "UTC",
});
const PUBLIC_EVENT_END_FORMATTER = new Intl.DateTimeFormat("en", {
  ...PUBLIC_EVENT_MONTH_DAY_OPTIONS,
  year: "numeric",
  timeZone: "UTC",
});

interface PublicEventsDirectoryProps {
  readonly organizations: readonly PublicOrganizationDirectoryEntry[];
}

export function PublicEventsDirectory({ organizations }: PublicEventsDirectoryProps) {
  if (organizations.length === 0) {
    return (
      <div className="event-directory-empty">
        <h2>No public events yet.</h2>
        <p>Published events will appear here after their organizers release a public program.</p>
      </div>
    );
  }

  return (
    <div className="event-directory-groups">
      {organizations.map(({ organization, events }) => (
        <section
          className="event-directory-group"
          aria-labelledby={`organization-${organization.id}`}
          key={organization.id}
        >
          <div className="event-organization-heading">
            <p className="home-card-label">Organization</p>
            <h2 id={`organization-${organization.id}`}>{organization.name}</h2>
          </div>

          <div className="event-directory-list">
            {events.map((event) => (
              <article className="event-directory-card" key={event.slug}>
                <div className="event-directory-card-copy">
                  <span className="event-status">
                    {event.programPublished ? "Program published" : "Call for proposals"}
                    {event.cfpOpen && event.programPublished ? " · CFP open" : ""}
                  </span>
                  <h3>{event.name}</h3>
                  <dl className="event-meta">
                    <div>
                      <dt>When</dt>
                      <dd>{formatEventDateRange(event.startsOn, event.endsOn, event.timeZone)}</dd>
                    </div>
                    <div>
                      <dt>Where</dt>
                      <dd>{event.venueName ?? "Online"}</dd>
                    </div>
                  </dl>
                </div>

                <div className="event-directory-actions">
                  <a className="home-button home-button-primary" href={`/events/${event.slug}`}>
                    View event
                  </a>
                  {event.cfpOpen ? (
                    <a
                      className="home-button home-button-secondary"
                      href={`/cfp/organizations/${organization.id}/events/${event.slug}`}
                    >
                      Submit a proposal
                    </a>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function formatEventDateRange(startsOn: string, endsOn: string, timeZone: string): string {
  const start = new Date(`${startsOn}T12:00:00Z`);
  const end = new Date(`${endsOn}T12:00:00Z`);
  const sameDay = startsOn === endsOn;
  const sharedYear = start.getUTCFullYear() === end.getUTCFullYear();
  const sharedMonth = sharedYear && start.getUTCMonth() === end.getUTCMonth();
  const startLabel = (
    !sharedYear || sameDay
      ? PUBLIC_EVENT_START_WITH_YEAR_FORMATTER
      : PUBLIC_EVENT_START_WITHOUT_YEAR_FORMATTER
  ).format(start);
  const endLabel =
    sameDay || sharedMonth ? String(end.getUTCDate()) : PUBLIC_EVENT_END_FORMATTER.format(end);
  const dateLabel = sameDay
    ? startLabel
    : `${startLabel}–${endLabel}${sharedMonth ? `, ${end.getUTCFullYear()}` : ""}`;
  return `${dateLabel} · ${timeZone}`;
}
