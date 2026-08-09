"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./admin-shell.module.css";

export interface OrganizerOverviewMetrics {
  readonly eventCount: number;
  readonly submissionCount: number;
  readonly pendingReviewCount: number;
  readonly outstandingSpeakerTaskCount: number;
  readonly publishedSessionCount: number;
}

export interface OrganizerOverviewEvent {
  readonly id: string;
  readonly name: string;
  readonly slug: string | null;
  readonly status: string | null;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
}

export type OrganizerOverviewActionType = "reviews" | "speaker_tasks" | "agenda";

export interface OrganizerOverviewActionItem {
  readonly id: string;
  readonly type: OrganizerOverviewActionType;
  readonly eventId: string;
  readonly title: string;
  readonly description: string;
  readonly count: number;
  readonly priority: number;
  readonly dueAt: string | null;
  readonly href: string;
}

export interface OrganizerOverviewData {
  readonly organizationId: string;
  readonly metrics: OrganizerOverviewMetrics;
  readonly events: readonly OrganizerOverviewEvent[];
  readonly actionItems: readonly OrganizerOverviewActionItem[];
}

export interface OrganizerOverviewApi {
  getOverview(): Promise<OrganizerOverviewData>;
}

export interface OrganizerOverviewConfig {
  readonly apiBaseUrl: string;
  readonly organizationId: string;
}

export type OrganizerOverviewConfigResult = OrganizerOverviewConfig | { readonly error: string };

export type OrganizerOverviewViewState =
  | { readonly status: "loading" }
  | { readonly status: "config-error"; readonly message: string }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "loaded"; readonly data: OrganizerOverviewData };

type OrganizerOverviewEnvironment = {
  readonly NEXT_PUBLIC_API_URL?: string | undefined;
  readonly NEXT_PUBLIC_APP_ENV?: string | undefined;
  readonly NEXT_PUBLIC_ORGANIZATION_ID?: string | undefined;
};

type UnknownRecord = Record<string, unknown>;

const actionTypeLabels: Record<OrganizerOverviewActionType, string> = {
  reviews: "Reviews",
  speaker_tasks: "Speaker tasks",
  agenda: "Agenda",
};

const metricDefinitions: readonly {
  readonly label: string;
  readonly key: keyof OrganizerOverviewMetrics;
  readonly icon: string;
  readonly detail: string;
}[] = [
  { label: "Events", key: "eventCount", icon: "▦", detail: "Live event records" },
  { label: "Submissions", key: "submissionCount", icon: "▤", detail: "Across this organization" },
  {
    label: "Pending reviews",
    key: "pendingReviewCount",
    icon: "◌",
    detail: "Awaiting organizer attention",
  },
  {
    label: "Speaker tasks",
    key: "outstandingSpeakerTaskCount",
    icon: "✓",
    detail: "Open speaker work items",
  },
  {
    label: "Published sessions",
    key: "publishedSessionCount",
    icon: "▥",
    detail: "Included in published agendas",
  },
] as const;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`The organizer overview response is missing ${field}.`);
  }
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`The organizer overview response contains an invalid ${field}.`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`The organizer overview response contains an invalid ${field}.`);
  }
  return value;
}

function integer(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`The organizer overview response contains an invalid ${field}.`);
  }
  return value;
}

/** Parse the API envelope instead of trusting unvalidated client data. */
export function parseOrganizerOverviewResponse(payload: unknown): OrganizerOverviewData {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    throw new Error("The organizer overview response was not valid.");
  }

  const data = payload.data;
  if (!isRecord(data.metrics) || !Array.isArray(data.events) || !Array.isArray(data.actionItems)) {
    throw new Error("The organizer overview response was not valid.");
  }

  const events = data.events.map((event, index) => {
    if (!isRecord(event)) {
      throw new Error(
        `The organizer overview response contains an invalid event at index ${index}.`,
      );
    }
    return {
      id: requiredString(event.id, `events[${index}].id`),
      name: requiredString(event.name, `events[${index}].name`),
      slug: nullableString(event.slug, `events[${index}].slug`),
      status: nullableString(event.status, `events[${index}].status`),
      startsAt: nullableString(event.startsAt, `events[${index}].startsAt`),
      endsAt: nullableString(event.endsAt, `events[${index}].endsAt`),
    };
  });

  const actionItems = data.actionItems.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(
        `The organizer overview response contains an invalid action item at index ${index}.`,
      );
    }
    const type = requiredString(item.type, `actionItems[${index}].type`);
    if (type !== "reviews" && type !== "speaker_tasks" && type !== "agenda") {
      throw new Error(`The organizer overview response contains an invalid action item type.`);
    }
    const actionType = type as OrganizerOverviewActionType;
    return {
      id: requiredString(item.id, `actionItems[${index}].id`),
      type: actionType,
      eventId: requiredString(item.eventId, `actionItems[${index}].eventId`),
      title: requiredString(item.title, `actionItems[${index}].title`),
      description: requiredString(item.description, `actionItems[${index}].description`),
      count: nonNegativeInteger(item.count, `actionItems[${index}].count`),
      priority: integer(item.priority, `actionItems[${index}].priority`),
      dueAt: nullableString(item.dueAt, `actionItems[${index}].dueAt`),
      href: requiredString(item.href, `actionItems[${index}].href`),
    };
  });

  return {
    organizationId: requiredString(data.organizationId, "organizationId"),
    metrics: {
      eventCount: nonNegativeInteger(data.metrics.eventCount, "metrics.eventCount"),
      submissionCount: nonNegativeInteger(data.metrics.submissionCount, "metrics.submissionCount"),
      pendingReviewCount: nonNegativeInteger(
        data.metrics.pendingReviewCount,
        "metrics.pendingReviewCount",
      ),
      outstandingSpeakerTaskCount: nonNegativeInteger(
        data.metrics.outstandingSpeakerTaskCount,
        "metrics.outstandingSpeakerTaskCount",
      ),
      publishedSessionCount: nonNegativeInteger(
        data.metrics.publishedSessionCount,
        "metrics.publishedSessionCount",
      ),
    },
    events,
    actionItems,
  };
}

export function resolveOrganizerOverviewConfig(
  environment: OrganizerOverviewEnvironment = {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    NEXT_PUBLIC_ORGANIZATION_ID: process.env.NEXT_PUBLIC_ORGANIZATION_ID,
  },
): OrganizerOverviewConfigResult {
  const apiBaseUrl = environment.NEXT_PUBLIC_API_URL?.trim().replace(/\/+$/u, "") ?? "";
  const appEnv = environment.NEXT_PUBLIC_APP_ENV?.trim() ?? "";
  const configuredOrganizationId = environment.NEXT_PUBLIC_ORGANIZATION_ID?.trim() ?? "";
  const organizationId =
    configuredOrganizationId || (appEnv === "local" ? "local-organization" : "");

  if (!apiBaseUrl) {
    return {
      error:
        "Organizer overview is unavailable because NEXT_PUBLIC_API_URL is missing. Configure the API origin for this web deployment.",
    };
  }
  if (!organizationId) {
    return {
      error:
        "Organizer overview is unavailable because NEXT_PUBLIC_ORGANIZATION_ID is missing. Set the explicit tenant ID for this deployment; only local mode may use local-organization automatically.",
    };
  }
  if (organizationId === "local-organization" && appEnv !== "local") {
    return {
      error:
        "Organizer overview is unavailable because local-organization is only valid when NEXT_PUBLIC_APP_ENV=local. Set NEXT_PUBLIC_ORGANIZATION_ID to this deployment's tenant ID.",
    };
  }

  return { apiBaseUrl, organizationId };
}

async function responseErrorMessage(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json();
    if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string") {
      return payload.error.message;
    }
  } catch {
    // Use the status fallback below when the response is not JSON.
  }
  return `The organizer overview request failed (HTTP ${response.status}).`;
}

export function createOrganizerOverviewApi(
  apiBaseUrl: string,
  organizationId: string,
  fetcher: typeof fetch = globalThis.fetch,
): OrganizerOverviewApi {
  const endpoint = `${apiBaseUrl.replace(/\/+$/u, "")}/api/admin/organizations/${encodeURIComponent(organizationId)}/overview`;
  return {
    async getOverview() {
      const response = await fetcher(endpoint, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(await responseErrorMessage(response));
      }
      return parseOrganizerOverviewResponse(await response.json());
    },
  };
}

function formatDate(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatEventDates(event: OrganizerOverviewEvent): string {
  const start = formatDate(event.startsAt);
  const end = formatDate(event.endsAt);
  if (start && end && start !== end) {
    return `${start} – ${end}`;
  }
  return start ?? end ?? "Dates not set";
}

function formatDueDate(value: string | null): string | null {
  const formatted = formatDate(value);
  return formatted ? `Due ${formatted}` : null;
}

function eventStatusClass(status: string | null): string {
  switch (status?.toLowerCase()) {
    case "live":
    case "published":
      return styles.statusLive ?? "";
    case "draft":
      return styles.statusDraft ?? "";
    case "archived":
      return styles.statusArchived ?? "";
    default:
      return styles.statusArchived ?? "";
  }
}

function eventStatusLabel(status: string | null): string {
  return status && status.trim().length > 0 ? status : "Status unavailable";
}

function agendaHref(organizationId: string, eventId: string): string {
  return `/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventId)}/agenda`;
}

function LoadingState() {
  return (
    <section className={styles.panel} aria-labelledby="organizer-overview-loading" role="status">
      <div className={styles.panelContent}>
        <h1 className={styles.panelTitle} id="organizer-overview-loading">
          Loading organizer overview
        </h1>
        <p className={styles.taskDescription}>Fetching the latest organization data.</p>
      </div>
    </section>
  );
}

function MessageState({
  message,
  title,
  onRetry,
  role,
}: Readonly<{
  message: string;
  title: string;
  onRetry?: (() => void) | undefined;
  role: "alert" | "status";
}>) {
  return (
    <section className={styles.panel} aria-labelledby="organizer-overview-message" role={role}>
      <div className={styles.panelContent}>
        <h1 className={styles.panelTitle} id="organizer-overview-message">
          {title}
        </h1>
        <p className={styles.taskDescription}>{message}</p>
        {onRetry ? (
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => {
              void onRetry();
            }}
          >
            Try again
          </button>
        ) : null}
      </div>
    </section>
  );
}

function ActionItems({ data }: Readonly<{ data: OrganizerOverviewData }>) {
  return (
    <section className={styles.panel} aria-labelledby="action-items-title">
      <div className={styles.panelHeader}>
        <div className={styles.panelHeading}>
          <p className={styles.panelEyebrow}>Action queue</p>
          <h2 className={styles.panelTitle} id="action-items-title">
            Tasks that need you
          </h2>
        </div>
        <Link className={styles.panelLink} href="/admin/events">
          View events <span aria-hidden="true">→</span>
        </Link>
      </div>
      <div className={styles.panelContent}>
        {data.actionItems.length === 0 ? (
          <p className={styles.muted} role="status">
            No action items are waiting for this organization.
          </p>
        ) : (
          <ul className={styles.taskList}>
            {data.actionItems.map((item) => {
              const dueDate = formatDueDate(item.dueAt);
              const critical = item.priority >= 80;
              return (
                <li
                  className={`${styles.taskItem} ${critical ? styles.taskItemCritical : ""}`}
                  key={item.id}
                >
                  <span className={styles.taskIcon} aria-hidden="true">
                    {critical ? "!" : "·"}
                  </span>
                  <div className={styles.taskContent}>
                    <h3 className={styles.taskTitle}>{item.title}</h3>
                    <p className={styles.taskDescription}>{item.description}</p>
                    <p className={styles.taskMeta}>
                      {actionTypeLabels[item.type]} · {item.count}{" "}
                      {item.count === 1 ? "item" : "items"}
                      {dueDate ? ` · ${dueDate}` : ""}
                    </p>
                  </div>
                  <Link
                    className={`${styles.alertTag} ${critical ? styles.alertTagCritical : ""}`}
                    href={item.href}
                  >
                    Open
                    <span className={styles.srOnly}> {item.title}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function EventsTable({ data }: Readonly<{ data: OrganizerOverviewData }>) {
  if (data.events.length === 0) {
    return (
      <div className={styles.panelContent}>
        <p className={styles.muted} role="status">
          No events are available for this organization yet.
        </p>
      </div>
    );
  }

  return (
    <>
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
                  <p className={styles.eventName}>{event.name}</p>
                  {event.slug ? <p className={styles.eventSlug}>/{event.slug}</p> : null}
                </td>
                <td>
                  <span className={`${styles.statusBadge} ${eventStatusClass(event.status)}`}>
                    <span aria-hidden="true">●</span>&nbsp;{eventStatusLabel(event.status)}
                  </span>
                </td>
                <td className={styles.eventDateCell}>{formatEventDates(event)}</td>
                <td>
                  <div className={styles.eventActions}>
                    <Link
                      className={styles.outlineButton}
                      href={agendaHref(data.organizationId, event.id)}
                    >
                      Open agenda <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className={styles.eventCardList} aria-label="Organization events">
        {data.events.map((event) => (
          <article className={styles.eventCard} key={event.id}>
            <div className={styles.eventCardTop}>
              <div>
                <h2>{event.name}</h2>
                {event.slug ? <p className={styles.eventSlug}>/{event.slug}</p> : null}
              </div>
              <span className={`${styles.statusBadge} ${eventStatusClass(event.status)}`}>
                <span aria-hidden="true">●</span>&nbsp;{eventStatusLabel(event.status)}
              </span>
            </div>
            <div className={styles.eventCardMeta}>
              <span>
                Event dates <strong>{formatEventDates(event)}</strong>
              </span>
            </div>
            <div className={styles.eventCardActions}>
              <Link
                className={styles.primaryButton}
                href={agendaHref(data.organizationId, event.id)}
              >
                Open agenda <span aria-hidden="true">→</span>
              </Link>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}

export function OrganizerOverviewView({
  state,
  onRetry,
}: Readonly<{
  state: OrganizerOverviewViewState;
  onRetry?: (() => void) | undefined;
}>) {
  if (state.status === "loading") {
    return <LoadingState />;
  }
  if (state.status === "config-error") {
    return (
      <MessageState
        message={state.message}
        title="Organizer overview is not configured"
        role="alert"
      />
    );
  }
  if (state.status === "error") {
    return (
      <MessageState
        message={state.message}
        title="Unable to load organizer overview"
        onRetry={onRetry}
        role="alert"
      />
    );
  }

  const { data } = state;
  return (
    <>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeaderCopy}>
          <p className={styles.eyebrow}>Organizer workspace</p>
          <h1 className={styles.pageTitle}>Organization overview</h1>
          <p className={styles.pageDescription}>
            Live operational data for your organization, including events, submissions, reviews, and
            speaker work.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link className={styles.secondaryButton} href="/admin/events">
            View events <span aria-hidden="true">→</span>
          </Link>
        </div>
      </header>

      <section className={styles.metricsGrid} aria-label="Live organization metrics">
        {metricDefinitions.map((metric) => (
          <article className={styles.metricCard} key={metric.key}>
            <div className={styles.metricTop}>
              <span className={styles.metricIcon} aria-hidden="true">
                {metric.icon}
              </span>
            </div>
            <div>
              <span className={styles.metricLabel}>{metric.label}</span>
              <strong className={styles.metricValue}>{data.metrics[metric.key]}</strong>
              <p className={styles.metricDetail}>{metric.detail}</p>
            </div>
          </article>
        ))}
      </section>

      <div className={styles.dashboardGrid}>
        <ActionItems data={data} />
        <section className={styles.panel} aria-labelledby="overview-guidance-title">
          <div className={styles.panelHeader}>
            <div className={styles.panelHeading}>
              <p className={styles.panelEyebrow}>Organization</p>
              <h2 className={styles.panelTitle} id="overview-guidance-title">
                Keep your program moving
              </h2>
            </div>
          </div>
          <div className={styles.panelContent}>
            <p className={styles.muted}>
              Open an event agenda from the live event list below to review and publish its current
              program.
            </p>
          </div>
        </section>

        <section
          className={`${styles.panel} ${styles.widePanel}`}
          aria-labelledby="overview-events-title"
        >
          <div className={styles.panelHeader}>
            <div className={styles.panelHeading}>
              <p className={styles.panelEyebrow}>Live event data</p>
              <h2 className={styles.panelTitle} id="overview-events-title">
                Events
              </h2>
            </div>
            <span className={styles.muted}>{data.events.length} total</span>
          </div>
          <EventsTable data={data} />
        </section>
      </div>
    </>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "The organizer overview could not be loaded. Check your connection and try again.";
}

export function OrganizerOverview({
  api: providedApi,
  config: providedConfig,
}: Readonly<{
  readonly api?: OrganizerOverviewApi;
  readonly config?: OrganizerOverviewConfigResult;
}> = {}) {
  const config = useMemo(
    () => providedConfig ?? resolveOrganizerOverviewConfig(),
    [providedConfig],
  );
  const api = useMemo(() => {
    if (providedApi) {
      return providedApi;
    }
    if ("error" in config) {
      return null;
    }
    return createOrganizerOverviewApi(config.apiBaseUrl, config.organizationId);
  }, [config, providedApi]);
  const [state, setState] = useState<OrganizerOverviewViewState>(() =>
    "error" in config ? { status: "config-error", message: config.error } : { status: "loading" },
  );

  const load = useCallback(async () => {
    if (!api || "error" in config) {
      return;
    }
    setState({ status: "loading" });
    try {
      const data = await api.getOverview();
      if (data.organizationId !== config.organizationId) {
        throw new Error("The organizer overview returned data for another organization.");
      }
      setState({ status: "loaded", data });
    } catch (error) {
      setState({ status: "error", message: errorMessage(error) });
    }
  }, [api, config]);

  useEffect(() => {
    if (api && !("error" in config)) {
      void load();
    }
  }, [api, config, load]);

  return <OrganizerOverviewView state={state} onRetry={api ? load : undefined} />;
}
