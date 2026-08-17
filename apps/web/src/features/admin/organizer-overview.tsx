"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigationDataCache } from "@/lib/navigation-data-cache-provider";
import {
  createScopedReadFlightCoordinator,
  type ScopedReadFlightCoordinator,
} from "@/lib/scoped-read-flight";
import { useOrganizerOrganizationId } from "./admin-shell";
import styles from "./admin-shell.module.css";
import {
  createOrganizerEventsApi,
  createOrganizerOverviewApi,
  type OrganizerEventCreateInput,
  type OrganizerEventRecord,
  type OrganizerEventsApi,
  OrganizerEventsApiError,
  type OrganizerOverviewActionType,
  type OrganizerOverviewActivityData,
  type OrganizerOverviewActivityMetrics,
  type OrganizerOverviewApi,
  type OrganizerOverviewConfigResult,
  type OrganizerOverviewCoreData,
  type OrganizerOverviewEvent,
  organizerOverviewCacheKey,
  organizerOverviewCacheTags,
  resolveOrganizerOverviewConfig,
} from "./organizer-overview-model";
import { OrganizerEventsLoaded } from "./organizer-overview-sections";

export type OrganizerOverviewRequestState<T> =
  | { readonly status: "loading"; readonly data: T | null }
  | { readonly status: "loaded"; readonly data: T }
  | {
      readonly status: "error";
      readonly data: T | null;
      readonly message: string;
    };

export type OrganizerOverviewViewState =
  | {
      readonly status: "loading";
      readonly core: OrganizerOverviewRequestState<OrganizerOverviewCoreData>;
      readonly activity: OrganizerOverviewRequestState<OrganizerOverviewActivityData>;
    }
  | {
      readonly status: "config-error";
      readonly message: string;
    }
  | {
      readonly status: "error";
      readonly message: string;
      readonly core: OrganizerOverviewRequestState<OrganizerOverviewCoreData>;
      readonly activity: OrganizerOverviewRequestState<OrganizerOverviewActivityData>;
    }
  | {
      readonly status: "loaded";
      readonly core: OrganizerOverviewRequestState<OrganizerOverviewCoreData>;
      readonly activity: OrganizerOverviewRequestState<OrganizerOverviewActivityData>;
    };

const actionTypeLabels: Record<OrganizerOverviewActionType, string> = {
  reviews: "Reviews",
  speaker_tasks: "Speaker tasks",
  agenda: "Agenda",
};

const coreMetricDefinition = {
  label: "Events",
  key: "eventCount" as const,
  detail: "Live event records",
};

const activityMetricDefinitions: readonly {
  readonly label: string;
  readonly key: keyof OrganizerOverviewActivityMetrics;
  readonly detail: string;
}[] = [
  {
    label: "Submissions",
    key: "submissionCount",
    detail: "Across this organization",
  },
  {
    label: "Pending reviews",
    key: "pendingReviewCount",
    detail: "Awaiting organizer attention",
  },
  {
    label: "Speaker tasks",
    key: "outstandingSpeakerTaskCount",
    detail: "Open speaker work items",
  },
  {
    label: "Published sessions",
    key: "publishedSessionCount",
    detail: "Included in published agendas",
  },
] as const;
const ORGANIZER_OVERVIEW_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }
  return ORGANIZER_OVERVIEW_DATE_FORMATTER.format(date);
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

function agendaHref(organizationId: string, eventId: string): string {
  return `/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventId)}/agenda`;
}

function LoadingState() {
  return (
    <div
      className={styles.overviewLoading}
      aria-labelledby="organizer-overview-loading"
      aria-busy="true"
      role="status"
    >
      <header className={styles.pageHeader}>
        <div className={styles.pageHeaderCopy}>
          <p className={styles.eyebrow}>Organizer workspace</p>
          <h1 className={styles.pageTitle} id="organizer-overview-loading">
            Organization overview
          </h1>
          <p className={styles.pageDescription}>
            Loading live operational data for your organization.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link className={styles.primaryButton} href="/admin/events">
            Manage events
          </Link>
        </div>
      </header>

      <div className={styles.overviewStack}>
        <section className={styles.panel} aria-labelledby="organizer-overview-loading-actions">
          <div className={styles.panelHeader}>
            <div className={styles.panelHeading}>
              <p className={styles.panelEyebrow}>Needs attention</p>
              <h2 className={styles.panelTitle} id="organizer-overview-loading-actions">
                Needs attention
              </h2>
            </div>
            <span className={styles.skeletonInline} aria-hidden="true" />
          </div>
          <div className={styles.panelContent} aria-hidden="true">
            {[1, 2, 3].map((item) => (
              <div className={styles.skeletonTask} key={item}>
                <span className={styles.skeletonCircle} />
                <span className={styles.skeletonTaskCopy}>
                  <span className={styles.skeletonLine} />
                  <span className={styles.skeletonLineShort} />
                </span>
                <span className={styles.skeletonAction} />
              </div>
            ))}
          </div>
        </section>

        <section className={styles.panel} aria-labelledby="organizer-overview-loading-events">
          <div className={styles.panelHeader}>
            <div className={styles.panelHeading}>
              <p className={styles.panelEyebrow}>Current and upcoming</p>
              <h2 className={styles.panelTitle} id="organizer-overview-loading-events">
                Events
              </h2>
            </div>
            <span className={styles.skeletonInline} aria-hidden="true" />
          </div>
          <div className={styles.panelContent} aria-hidden="true">
            <div className={styles.skeletonEventHeader}>
              <span className={styles.skeletonLineShort} />
              <span className={styles.skeletonLineShort} />
              <span className={styles.skeletonLineShort} />
              <span className={styles.skeletonAction} />
            </div>
            <div className={styles.skeletonEventRow}>
              <span className={styles.skeletonLine} />
              <span className={styles.skeletonBadge} />
              <span className={styles.skeletonLineShort} />
              <span className={styles.skeletonAction} />
            </div>
            <div className={styles.skeletonEventRow}>
              <span className={styles.skeletonLine} />
              <span className={styles.skeletonBadge} />
              <span className={styles.skeletonLineShort} />
              <span className={styles.skeletonAction} />
            </div>
          </div>
        </section>

        <section className={styles.metricsSection} aria-label="Loading organization metrics">
          <div className={styles.metricsGrid}>
            {[coreMetricDefinition, ...activityMetricDefinitions].map((metric) => (
              <article className={styles.metricCard} key={metric.key}>
                <div className={styles.metricTop}>
                  <span
                    className={`${styles.metricIcon} ${styles.skeletonCircle}`}
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <span className={styles.metricLabel}>{metric.label}</span>
                  <span className={styles.skeletonValue} aria-hidden="true" />
                  <span className={styles.skeletonLine} aria-hidden="true" />
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
      <span className={styles.srOnly}>Loading organizer overview…</span>
    </div>
  );
}

function MessageState({
  message,
  title,
  onRetry,
  retryLabel = "Try again",
  role,
}: Readonly<{
  message: string;
  title: string;
  onRetry?: (() => void) | undefined;
  retryLabel?: string | undefined;
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
            {retryLabel}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function ActivityMetricCards({
  state,
  onRetry,
}: Readonly<{
  state: OrganizerOverviewRequestState<OrganizerOverviewActivityData>;
  onRetry?: (() => void) | undefined;
}>) {
  return (
    <>
      {activityMetricDefinitions.map((metric, index) => {
        const data = state.data;
        const value = data?.metrics[metric.key];
        const hasError = state.status === "error";
        const isLoading = state.status === "loading";
        return (
          <Card className={styles.metricDataCard} key={metric.key}>
            <CardHeader className={styles.metricDataHeader}>
              <CardDescription className={styles.metricLabel}>{metric.label}</CardDescription>
              {value === undefined ? (
                <CardTitle className={styles.metricValue} role={hasError ? "alert" : "status"}>
                  {hasError ? "Unavailable" : "Loading…"}
                </CardTitle>
              ) : (
                <CardTitle className={styles.metricValue}>{value}</CardTitle>
              )}
            </CardHeader>
            <CardContent className={styles.metricDetail}>
              {data && isLoading ? <p role="status">Refreshing secondary metrics…</p> : null}
              {data && hasError ? <p role="alert">Stale data. {state.message}</p> : null}
              {!data && state.status === "error" ? <p role="alert">{state.message}</p> : null}
              {index === 0 && hasError && onRetry ? (
                <Button
                  className="mt-3"
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => void onRetry()}
                >
                  Retry activity
                </Button>
              ) : null}
              {value !== undefined && !isLoading && !hasError ? <p>{metric.detail}</p> : null}
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}

function ActionItems({
  state,
  onRetry,
}: Readonly<{
  state: OrganizerOverviewRequestState<OrganizerOverviewActivityData>;
  onRetry?: (() => void) | undefined;
}>) {
  const data = state.data;
  const actionItems = data
    ? [...data.actionItems].sort((left, right) => {
        const priorityDifference = right.priority - left.priority;
        if (priorityDifference !== 0) {
          return priorityDifference;
        }
        if (left.dueAt && !right.dueAt) {
          return -1;
        }
        if (!left.dueAt && right.dueAt) {
          return 1;
        }
        return 0;
      })
    : [];

  return (
    <Card className={styles.overviewPanel} role="region" aria-labelledby="action-items-title">
      <CardHeader className={styles.overviewPanelHeader}>
        <div>
          <CardDescription className={styles.panelEyebrow}>Prioritized work</CardDescription>
          <CardTitle
            aria-level={2}
            className={styles.panelTitle}
            id="action-items-title"
            role="heading"
          >
            Needs attention
          </CardTitle>
        </div>
        <Badge variant="secondary">
          {data
            ? `${data.actionItems.length} ${data.actionItems.length === 1 ? "task" : "tasks"}`
            : state.status === "loading"
              ? "Loading…"
              : "Unavailable"}
        </Badge>
      </CardHeader>
      <CardContent className={styles.overviewPanelContent}>
        {!data && state.status === "loading" ? (
          <p className={styles.muted} role="status" aria-live="polite">
            Loading action items…
          </p>
        ) : !data && state.status === "error" ? (
          <div className={styles.emptyState} role="alert">
            <p className={styles.emptyStateTitle}>Action items unavailable</p>
            <p className={styles.muted}>{state.message}</p>
            {onRetry ? (
              <Button size="sm" type="button" variant="outline" onClick={() => void onRetry()}>
                Retry activity
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            {state.status === "loading" ? (
              <p className={styles.muted} role="status" aria-live="polite">
                Refreshing action items…
              </p>
            ) : null}
            {state.status === "error" && onRetry ? (
              <div role="alert">
                <p className={styles.muted}>Stale action items. {state.message}</p>
                <Button size="sm" type="button" variant="outline" onClick={() => void onRetry()}>
                  Retry activity
                </Button>
              </div>
            ) : state.status === "error" ? (
              <p className={styles.muted} role="alert">
                Stale action items. {state.message}
              </p>
            ) : null}
            {actionItems.length === 0 ? (
              <div className={styles.emptyState}>
                <p className={styles.emptyStateTitle}>You&apos;re all caught up</p>
                <p className={styles.muted} role="status">
                  No action items are waiting for this organization.
                </p>
              </div>
            ) : (
              <ul className={styles.taskList} aria-label="Prioritized organizer tasks">
                {actionItems.map((item) => {
                  const dueDate = formatDueDate(item.dueAt);
                  const critical = item.priority >= 80;
                  return (
                    <li
                      className={`${styles.taskItem} ${critical ? styles.taskItemCritical : ""}`}
                      key={item.id}
                    >
                      <span className={styles.taskIcon} aria-hidden="true" />
                      <div className={styles.taskContent}>
                        <h3 className={styles.taskTitle}>{item.title}</h3>
                        <p className={styles.taskDescription}>{item.description}</p>
                        <p className={styles.taskMeta}>
                          <span className={styles.taskPriority}>
                            {critical ? "High priority" : "Priority queued"}
                          </span>
                          <span aria-hidden="true"> · </span>
                          {actionTypeLabels[item.type]} · {item.count}{" "}
                          {item.count === 1 ? "item" : "items"}
                          {dueDate ? ` · ${dueDate}` : ""}
                        </p>
                      </div>
                      <Button asChild size="sm" variant={critical ? "destructive" : "outline"}>
                        <Link aria-label={`Open ${item.title}`} href={item.href}>
                          Open
                          <span className="sr-only"> {item.title}</span>
                        </Link>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function EventsTable({ data }: Readonly<{ data: OrganizerOverviewCoreData }>) {
  if (data.events.length === 0) {
    return (
      <div className={styles.panelContent}>
        <div className={styles.emptyState}>
          <p className={styles.emptyStateTitle}>No events yet</p>
          <p className={styles.muted} role="status">
            No events are available for this organization yet.
          </p>
          <Link className={styles.primaryButton} href="/admin/events?create=1">
            Create event
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`${styles.tableWrap} ${styles.overviewTableWrap}`}>
        <table className={styles.eventsTable}>
          <caption>Organization events</caption>
          <thead>
            <tr>
              <th scope="col">Event</th>
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
                <td className={styles.eventDateCell}>{formatEventDates(event)}</td>
                <td>
                  <div className={styles.eventActions}>
                    <Link
                      aria-label={`Open agenda for ${event.name}`}
                      className={styles.primaryButton}
                      href={agendaHref(data.organizationId, event.id)}
                    >
                      Open agenda
                    </Link>
                    <Link
                      aria-label={`Open settings for ${event.name}`}
                      className={styles.outlineButton}
                      href={eventSettingsHref(data.organizationId, event.id)}
                    >
                      Settings
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
            </div>
            <div className={styles.eventCardMeta}>
              <span>
                Event dates <strong>{formatEventDates(event)}</strong>
              </span>
            </div>
            <div className={styles.eventCardActions}>
              <Link
                aria-label={`Open agenda for ${event.name}`}
                className={styles.primaryButton}
                href={agendaHref(data.organizationId, event.id)}
              >
                Open agenda
              </Link>
              <Link
                aria-label={`Open settings for ${event.name}`}
                className={styles.secondaryButton}
                href={eventSettingsHref(data.organizationId, event.id)}
              >
                Settings
              </Link>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}

function stateWithCore(
  previous: OrganizerOverviewViewState,
  core: OrganizerOverviewRequestState<OrganizerOverviewCoreData>,
): OrganizerOverviewViewState {
  if (previous.status === "config-error") {
    return previous;
  }
  if (core.data === null) {
    if (core.status === "error") {
      return {
        status: "error",
        message: core.message,
        core,
        activity: previous.activity,
      };
    }
    return { status: "loading", core, activity: previous.activity };
  }
  return { status: "loaded", core, activity: previous.activity };
}

function stateWithActivity(
  previous: OrganizerOverviewViewState,
  activity: OrganizerOverviewRequestState<OrganizerOverviewActivityData>,
): OrganizerOverviewViewState {
  if (previous.status === "config-error") {
    return previous;
  }
  if (previous.core.data === null) {
    return previous.status === "error"
      ? { ...previous, activity }
      : { status: "loading", core: previous.core, activity };
  }
  return { status: "loaded", core: previous.core, activity };
}

export function OrganizerOverviewView({
  state,
  onRetryCore,
  onRetryActivity,
}: Readonly<{
  state: OrganizerOverviewViewState;
  onRetryCore?: (() => void) | undefined;
  onRetryActivity?: (() => void) | undefined;
}>) {
  if (state.status === "config-error") {
    return (
      <MessageState
        message={state.message}
        title="Organizer overview is not configured"
        role="alert"
      />
    );
  }
  if (state.status === "loading" && state.core.data === null) {
    return <LoadingState />;
  }
  if (state.status === "error" || state.core.data === null) {
    return (
      <MessageState
        message={
          state.status === "error" ? state.message : "The core overview data was not loaded."
        }
        title="Unable to load organizer overview"
        onRetry={onRetryCore}
        retryLabel="Retry core"
        role="alert"
      />
    );
  }

  const core = state.core.data;
  if (core === null) {
    return (
      <MessageState
        message="The core overview data was not loaded."
        title="Unable to load organizer overview"
        onRetry={onRetryCore}
        retryLabel="Retry core"
        role="alert"
      />
    );
  }
  const activity = state.activity;
  return (
    <>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeaderCopy}>
          <p className={styles.eyebrow}>Organizer workspace</p>
          <h1 className={styles.pageTitle}>Organization overview</h1>
          <p className={styles.pageDescription}>
            A calm view of what needs attention and which event to open next.
          </p>
          {state.core.status === "loading" ? (
            <p className={styles.taskMeta} role="status" aria-live="polite">
              Refreshing core event data…
            </p>
          ) : null}
          {state.core.status === "error" ? (
            <Alert variant="destructive">
              <AlertTitle>Event data could not refresh</AlertTitle>
              <AlertDescription>Showing previous event data. {state.core.message}</AlertDescription>
              {onRetryCore ? (
                <Button
                  className="mt-3"
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => void onRetryCore()}
                >
                  Retry core
                </Button>
              ) : null}
            </Alert>
          ) : null}
        </div>
        <div className={styles.headerActions}>
          <Button asChild>
            <Link href="/admin/events">Manage events</Link>
          </Button>
        </div>
      </header>

      <div className={styles.overviewStack}>
        <section className={styles.metricsSection} aria-labelledby="overview-metrics-title">
          <div className={styles.sectionIntro}>
            <div>
              <p className={styles.panelEyebrow}>Organization snapshot</p>
              <h2 className={styles.sectionTitle} id="overview-metrics-title">
                Metrics
              </h2>
            </div>
          </div>
          <div className={styles.metricsGrid}>
            <Card className={styles.metricDataCard} key={coreMetricDefinition.key}>
              <CardHeader className={styles.metricDataHeader}>
                <CardDescription className={styles.metricLabel}>
                  {coreMetricDefinition.label}
                </CardDescription>
                <CardTitle className={styles.metricValue}>{core.metrics.eventCount}</CardTitle>
              </CardHeader>
              <CardContent className={styles.metricDetail}>
                {coreMetricDefinition.detail}
              </CardContent>
            </Card>
            <ActivityMetricCards state={activity} onRetry={onRetryActivity} />
          </div>
        </section>

        <ActionItems state={activity} onRetry={onRetryActivity} />

        <Card
          className={styles.overviewPanel}
          role="region"
          aria-labelledby="overview-events-title"
        >
          <CardHeader className={styles.overviewPanelHeader}>
            <div>
              <CardDescription className={styles.panelEyebrow}>
                Current and upcoming
              </CardDescription>
              <CardTitle
                aria-level={2}
                className={styles.panelTitle}
                id="overview-events-title"
                role="heading"
              >
                Events
              </CardTitle>
            </div>
            <Badge variant="secondary">{core.events.length} total</Badge>
          </CardHeader>
          <EventsTable data={core} />
        </Card>
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
  const authenticatedOrganizationId = useOrganizerOrganizationId();
  const config = useMemo(
    () =>
      providedConfig ?? resolveOrganizerOverviewConfig(authenticatedOrganizationId ?? undefined),
    [authenticatedOrganizationId, providedConfig],
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
  const navigationCache = useNavigationDataCache();
  const cacheOrganizationId = "error" in config ? null : config.organizationId.trim();
  const coreCacheKey =
    cacheOrganizationId === null ? null : organizerOverviewCacheKey(cacheOrganizationId, "core");
  const activityCacheKey =
    cacheOrganizationId === null
      ? null
      : organizerOverviewCacheKey(cacheOrganizationId, "activity");
  const cacheTags = useMemo(
    () => (cacheOrganizationId === null ? [] : organizerOverviewCacheTags(cacheOrganizationId)),
    [cacheOrganizationId],
  );
  const cachedCore =
    coreCacheKey === null
      ? undefined
      : navigationCache?.peek<OrganizerOverviewCoreData>(coreCacheKey);
  const cachedActivity =
    activityCacheKey === null
      ? undefined
      : navigationCache?.peek<OrganizerOverviewActivityData>(activityCacheKey);
  const [state, setState] = useState<OrganizerOverviewViewState>(() =>
    "error" in config
      ? { status: "config-error", message: config.error }
      : {
          status: cachedCore === undefined ? "loading" : "loaded",
          core:
            cachedCore === undefined
              ? { status: "loading", data: null }
              : { status: "loaded", data: cachedCore },
          activity:
            cachedActivity === undefined
              ? { status: "loading", data: null }
              : { status: "loaded", data: cachedActivity },
        },
  );
  const generationRef = useRef(0);

  const loadCore = useCallback(
    async (fresh = false) => {
      if (!api || "error" in config) {
        return;
      }
      const generation = generationRef.current;
      setState((previous) => {
        if (previous.status === "config-error") {
          return previous;
        }
        return stateWithCore(previous, {
          status: "loading",
          data: previous.core.data,
        });
      });
      try {
        const data =
          navigationCache === null || coreCacheKey === null
            ? await api.getCore()
            : await navigationCache.read({
                key: coreCacheKey,
                tags: cacheTags,
                fresh,
                load: async () => {
                  const data = await api.getCore();
                  if (data.organizationId !== config.organizationId) {
                    throw new Error(
                      "The organizer overview returned data for another organization.",
                    );
                  }
                  return data;
                },
              });
        if (generationRef.current !== generation) {
          return;
        }
        if (data.organizationId !== config.organizationId) {
          throw new Error("The organizer overview returned data for another organization.");
        }
        setState((previous) =>
          stateWithCore(previous, {
            status: "loaded",
            data,
          }),
        );
      } catch (error) {
        if (generationRef.current !== generation) {
          return;
        }
        setState((previous) =>
          stateWithCore(previous, {
            status: "error",
            data: previous.status === "config-error" ? null : previous.core.data,
            message: errorMessage(error),
          }),
        );
      }
    },
    [api, cacheTags, config, coreCacheKey, navigationCache],
  );

  const loadActivity = useCallback(
    async (fresh = false) => {
      if (!api || "error" in config) {
        return;
      }
      const generation = generationRef.current;
      setState((previous) => {
        if (previous.status === "config-error") {
          return previous;
        }
        return stateWithActivity(previous, {
          status: "loading",
          data: previous.activity.data,
        });
      });
      try {
        const data =
          navigationCache === null || activityCacheKey === null
            ? await api.getActivity()
            : await navigationCache.read({
                key: activityCacheKey,
                tags: cacheTags,
                fresh,
                load: async () => {
                  const data = await api.getActivity();
                  if (data.organizationId !== config.organizationId) {
                    throw new Error(
                      "The organizer overview returned data for another organization.",
                    );
                  }
                  return data;
                },
              });
        if (generationRef.current !== generation) {
          return;
        }
        if (data.organizationId !== config.organizationId) {
          throw new Error("The organizer overview returned data for another organization.");
        }
        setState((previous) =>
          stateWithActivity(previous, {
            status: "loaded",
            data,
          }),
        );
      } catch (error) {
        if (generationRef.current !== generation) {
          return;
        }
        setState((previous) =>
          stateWithActivity(previous, {
            status: "error",
            data: previous.status === "config-error" ? null : previous.activity.data,
            message: errorMessage(error),
          }),
        );
      }
    },
    [activityCacheKey, api, cacheTags, config, navigationCache],
  );

  useEffect(() => {
    generationRef.current += 1;
    if (!api || "error" in config) {
      setState(
        "error" in config
          ? { status: "config-error", message: config.error }
          : {
              status: "config-error",
              message: "Organizer overview is not configured.",
            },
      );
      return;
    }
    const nextCore =
      coreCacheKey === null
        ? undefined
        : navigationCache?.peek<OrganizerOverviewCoreData>(coreCacheKey);
    const nextActivity =
      activityCacheKey === null
        ? undefined
        : navigationCache?.peek<OrganizerOverviewActivityData>(activityCacheKey);
    setState({
      status: nextCore === undefined ? "loading" : "loaded",
      core:
        nextCore === undefined
          ? { status: "loading", data: null }
          : { status: "loaded", data: nextCore },
      activity:
        nextActivity === undefined
          ? { status: "loading", data: null }
          : { status: "loaded", data: nextActivity },
    });
    if (nextCore === undefined) void loadCore();
    if (nextActivity === undefined) void loadActivity();
  }, [activityCacheKey, api, config, coreCacheKey, loadActivity, loadCore, navigationCache]);

  return (
    <OrganizerOverviewView
      state={state}
      onRetryCore={api ? () => void loadCore(true) : undefined}
      onRetryActivity={api ? () => void loadActivity(true) : undefined}
    />
  );
}

export interface OrganizerEventEditorProps {
  readonly event?: OrganizerEventRecord | undefined;
  readonly busy?: boolean;
  readonly onSave?: (input: OrganizerEventCreateInput) => Promise<void>;
  readonly onCancel?: () => void;
}

function eventSettingsHref(organizationId: string, eventId: string): string {
  return `/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventId)}/settings`;
}

export interface OrganizerEventsData {
  readonly organizationId: string;
  readonly events: readonly OrganizerEventRecord[];
}

export type OrganizerEventsViewState =
  | { readonly status: "loading"; readonly data?: OrganizerEventsData }
  | { readonly status: "config-error"; readonly message: string }
  | {
      readonly status: "error";
      readonly message: string;
      readonly data?: OrganizerEventsData;
    }
  | { readonly status: "loaded"; readonly data: OrganizerEventsData };

export interface OrganizerEventsViewProps {
  readonly state: OrganizerEventsViewState;
  readonly busy?: boolean;
  readonly initialEditor?: "create" | undefined;
  readonly onRetry?: (() => void) | undefined;
  readonly onCreate?: ((input: OrganizerEventCreateInput) => Promise<void>) | undefined;
  readonly onUpdate?:
    | ((
        eventId: string,
        input: OrganizerEventCreateInput,
        expectedVersion: number,
      ) => Promise<void>)
    | undefined;
}

function EventsLoadingState() {
  return (
    <section className={styles.panel} aria-labelledby="organizer-events-loading" role="status">
      <div className={styles.panelContent}>
        <h1 className={styles.panelTitle} id="organizer-events-loading">
          Loading events
        </h1>
        <p className={styles.muted}>Fetching the organization event records.</p>
      </div>
    </section>
  );
}

function EventsMessageState({
  title,
  message,
  onRetry,
}: Readonly<{
  readonly title: string;
  readonly message: string;
  readonly onRetry?: (() => void) | undefined;
}>) {
  return (
    <section className={styles.panel} aria-labelledby="organizer-events-message" role="alert">
      <div className={styles.panelContent}>
        <h1 className={styles.panelTitle} id="organizer-events-message">
          {title}
        </h1>
        <p className={styles.muted}>{message}</p>
        {onRetry ? (
          <button className={styles.secondaryButton} type="button" onClick={onRetry}>
            Try again
          </button>
        ) : null}
      </div>
    </section>
  );
}
function EventsRefreshState({
  message,
  onRetry,
  status,
}: Readonly<{
  readonly message: string;
  readonly onRetry?: (() => void) | undefined;
  readonly status: "loading" | "error";
}>) {
  return (
    <section className={styles.panel} role={status === "error" ? "alert" : "status"}>
      <div className={styles.panelContent}>
        <p className={styles.muted}>{message}</p>
        {status === "error" && onRetry ? (
          <button className={styles.secondaryButton} type="button" onClick={onRetry}>
            Retry event refresh
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function OrganizerEventsView({
  state,
  busy = false,
  initialEditor,
  onRetry,
  onCreate,
  onUpdate,
}: OrganizerEventsViewProps) {
  if (state.status === "loading" && state.data === undefined) return <EventsLoadingState />;
  if (state.status === "config-error") {
    return (
      <EventsMessageState title="Event management is not configured" message={state.message} />
    );
  }
  if (state.status === "error" && state.data === undefined) {
    return (
      <EventsMessageState title="Unable to load events" message={state.message} onRetry={onRetry} />
    );
  }
  const data = state.data;
  if (data === undefined) return <EventsLoadingState />;
  const authoritative = state.status === "loaded";
  return (
    <>
      {state.status === "loading" ? (
        <EventsRefreshState message="Refreshing event records…" status="loading" />
      ) : state.status === "error" ? (
        <EventsRefreshState
          message={`Showing previous event data. ${state.message}`}
          onRetry={onRetry}
          status="error"
        />
      ) : null}
      <OrganizerEventsLoaded
        key={data.organizationId}
        data={data}
        busy={busy}
        {...(initialEditor === undefined ? {} : { initialEditor })}
        onCreate={authoritative ? onCreate : undefined}
        onUpdate={authoritative ? onUpdate : undefined}
      />
    </>
  );
}

function organizerEventsErrorMessage(error: unknown): string {
  if (error instanceof OrganizerEventsApiError && error.code === "CONFLICT") {
    return "This event changed in another organizer session. Reload before saving again.";
  }
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return "The organizer event request could not be completed.";
}

export function OrganizerEvents({
  api: providedApi,
  config: providedConfig,
  initialEditor,
}: Readonly<{
  readonly api?: OrganizerEventsApi;
  readonly config?: OrganizerOverviewConfigResult;
  readonly initialEditor?: "create" | undefined;
}> = {}) {
  const authenticatedOrganizationId = useOrganizerOrganizationId();
  const config = useMemo(
    () =>
      providedConfig ?? resolveOrganizerOverviewConfig(authenticatedOrganizationId ?? undefined),
    [authenticatedOrganizationId, providedConfig],
  );
  const api = useMemo(() => {
    if (providedApi) return providedApi;
    if ("error" in config) return null;
    return createOrganizerEventsApi(config.apiBaseUrl, config.organizationId);
  }, [config, providedApi]);
  const navigationCache = useNavigationDataCache();
  const cacheOrganizationId = "error" in config ? null : config.organizationId.trim();
  const eventsCacheKey =
    cacheOrganizationId === null ? null : organizerOverviewCacheKey(cacheOrganizationId, "events");
  const eventsCacheTags = useMemo(
    () => (cacheOrganizationId === null ? [] : organizerOverviewCacheTags(cacheOrganizationId)),
    [cacheOrganizationId],
  );
  const cachedEvents =
    eventsCacheKey === null
      ? undefined
      : navigationCache?.peek<readonly OrganizerEventRecord[]>(eventsCacheKey);
  const initialReadKey = useMemo(
    () => (api && !("error" in config) ? { api, organizationId: config.organizationId } : null),
    [api, config],
  );
  const [state, setState] = useState<OrganizerEventsViewState>(() =>
    "error" in config
      ? { status: "config-error", message: config.error }
      : cachedEvents === undefined
        ? { status: "loading" }
        : {
            status: "loaded",
            data: { organizationId: config.organizationId, events: cachedEvents },
          },
  );
  const [busy, setBusy] = useState(false);
  const generationRef = useRef(0);
  const initialReadCoordinatorRef = useRef<ScopedReadFlightCoordinator<
    object,
    readonly OrganizerEventRecord[]
  > | null>(null);
  if (initialReadCoordinatorRef.current === null) {
    initialReadCoordinatorRef.current = createScopedReadFlightCoordinator();
  }
  const initialReadCoordinator = initialReadCoordinatorRef.current;

  const load = useCallback(
    async (
      signal?: AbortSignal,
      initialRead?: Promise<readonly OrganizerEventRecord[]>,
      fresh = false,
    ) => {
      if (!api || "error" in config) return;
      const generation = generationRef.current;
      setState((current) => {
        if (current.status === "config-error") return { status: "loading" };
        return current.data === undefined
          ? { status: "loading" }
          : { status: "loading", data: current.data };
      });
      try {
        const events = await (initialRead ??
          (navigationCache === null || eventsCacheKey === null
            ? api.listEvents(signal)
            : navigationCache.read({
                key: eventsCacheKey,
                tags: eventsCacheTags,
                fresh,
                load: async () => {
                  const events = await api.listEvents();
                  if (events.some((event) => event.organizationId !== config.organizationId)) {
                    throw new Error(
                      "The organizer event response belongs to another organization.",
                    );
                  }
                  return events;
                },
              })));
        if (signal?.aborted || generationRef.current !== generation) return;
        if (events.some((event) => event.organizationId !== config.organizationId)) {
          throw new Error("The organizer event response belongs to another organization.");
        }
        setState({
          status: "loaded",
          data: { organizationId: config.organizationId, events },
        });
      } catch (error) {
        if (signal?.aborted || generationRef.current !== generation) return;
        setState((current) => {
          const message = organizerEventsErrorMessage(error);
          return current.status !== "config-error" && current.data !== undefined
            ? { status: "error", message, data: current.data }
            : { status: "error", message };
        });
      }
    },
    [api, config, eventsCacheKey, eventsCacheTags, navigationCache],
  );

  useEffect(() => {
    generationRef.current += 1;
    if (!api || "error" in config || !initialReadKey) {
      setState(
        "error" in config
          ? { status: "config-error", message: config.error }
          : {
              status: "config-error",
              message: "Event management is not configured.",
            },
      );
      return;
    }
    const cached =
      eventsCacheKey === null
        ? undefined
        : navigationCache?.peek<readonly OrganizerEventRecord[]>(eventsCacheKey);
    if (cached?.every((event) => event.organizationId === config.organizationId) === true) {
      setState({
        status: "loaded",
        data: { organizationId: config.organizationId, events: cached },
      });
      return;
    }
    setState({ status: "loading" });
    const lease = initialReadCoordinator.acquire(initialReadKey, (signal) =>
      navigationCache === null || eventsCacheKey === null
        ? api.listEvents(signal)
        : navigationCache.read({
            key: eventsCacheKey,
            tags: eventsCacheTags,
            load: async () => {
              const events = await api.listEvents();
              if (events.some((event) => event.organizationId !== config.organizationId)) {
                throw new Error("The organizer event response belongs to another organization.");
              }
              return events;
            },
          }),
    );
    void load(lease.signal, lease.promise);
    return () => {
      generationRef.current += 1;
      lease.release();
    };
  }, [
    api,
    config,
    eventsCacheKey,
    eventsCacheTags,
    initialReadCoordinator,
    initialReadKey,
    load,
    navigationCache,
  ]);

  async function create(input: OrganizerEventCreateInput) {
    if (!api || "error" in config) return;
    generationRef.current += 1;
    navigationCache?.invalidate(eventsCacheTags);
    setBusy(true);
    try {
      const event = await api.createEvent(input);
      if (event.organizationId !== config.organizationId) {
        throw new Error("The created event belongs to another organization.");
      }
      setState((current) =>
        current.status === "loaded"
          ? {
              ...current,
              data: {
                ...current.data,
                events: [event, ...current.data.events],
              },
            }
          : current,
      );
      toast.success("Event created.", { duration: 3_000 });
    } catch (error) {
      throw new Error(organizerEventsErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function update(
    eventId: string,
    input: OrganizerEventCreateInput,
    expectedVersion: number,
  ) {
    if (!api || "error" in config) return;
    generationRef.current += 1;
    navigationCache?.invalidate(eventsCacheTags);
    setBusy(true);
    try {
      const event = await api.updateEvent(eventId, {
        expectedVersion,
        name: input.name,
        ...(input.slug === undefined ? {} : { slug: input.slug }),
        timeZone: input.timeZone,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        ...(input.venue === undefined ? {} : { venue: input.venue }),
        cfpSettings: input.cfpSettings,
        defaultCalendarSettings: input.defaultCalendarSettings,
      });
      if (event.organizationId !== config.organizationId) {
        throw new Error("The updated event belongs to another organization.");
      }
      setState((current) =>
        current.status === "loaded"
          ? {
              ...current,
              data: {
                ...current.data,
                events: current.data.events.map((candidate) =>
                  candidate.id === event.id ? event : candidate,
                ),
              },
            }
          : current,
      );
      toast.success("Event saved.", { duration: 3_000 });
    } catch (error) {
      throw new Error(organizerEventsErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <OrganizerEventsView
      state={state}
      busy={busy}
      {...(initialEditor === undefined ? {} : { initialEditor })}
      onRetry={() => void load(undefined, undefined, true)}
      onCreate={api ? create : undefined}
      onUpdate={api ? update : undefined}
    />
  );
}
