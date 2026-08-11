"use client";

import Link from "next/link";
import {
  type CSSProperties,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "./admin-shell.module.css";

export interface OrganizerOverviewCoreMetrics {
  readonly eventCount: number;
}

export interface OrganizerOverviewActivityMetrics {
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

export interface OrganizerOverviewCoreData {
  readonly organizationId: string;
  readonly metrics: OrganizerOverviewCoreMetrics;
  readonly events: readonly OrganizerOverviewEvent[];
}

export interface OrganizerOverviewActivityData {
  readonly organizationId: string;
  readonly metrics: OrganizerOverviewActivityMetrics;
  readonly actionItems: readonly OrganizerOverviewActionItem[];
}

export interface OrganizerOverviewApi {
  getCore(): Promise<OrganizerOverviewCoreData>;
  getActivity(): Promise<OrganizerOverviewActivityData>;
}

export interface OrganizerOverviewConfig {
  readonly apiBaseUrl: string;
  readonly organizationId: string;
}

export type OrganizerOverviewConfigResult = OrganizerOverviewConfig | { readonly error: string };

export type OrganizerOverviewRequestState<T> =
  | { readonly status: "loading"; readonly data: T | null }
  | { readonly status: "loaded"; readonly data: T }
  | { readonly status: "error"; readonly data: T | null; readonly message: string };

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

const coreMetricDefinition = {
  label: "Events",
  key: "eventCount" as const,
  icon: "▦",
  detail: "Live event records",
};

const activityMetricDefinitions: readonly {
  readonly label: string;
  readonly key: keyof OrganizerOverviewActivityMetrics;
  readonly icon: string;
  readonly detail: string;
}[] = [
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

function responseData(payload: unknown): UnknownRecord {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    throw new Error("The organizer overview response was not valid.");
  }
  return payload.data;
}

function responseOrganizationId(data: UnknownRecord, expectedOrganizationId?: string): string {
  const organizationId = requiredString(data.organizationId, "organizationId");
  if (expectedOrganizationId !== undefined && organizationId !== expectedOrganizationId) {
    throw new Error("The organizer overview returned data for another organization.");
  }
  return organizationId;
}

function parseOrganizerOverviewEvent(event: unknown, index: number): OrganizerOverviewEvent {
  if (!isRecord(event)) {
    throw new Error(`The organizer overview response contains an invalid event at index ${index}.`);
  }
  return {
    id: requiredString(event.id, `events[${index}].id`),
    name: requiredString(event.name, `events[${index}].name`),
    slug: nullableString(event.slug, `events[${index}].slug`),
    status: nullableString(event.status, `events[${index}].status`),
    startsAt: nullableString(event.startsAt, `events[${index}].startsAt`),
    endsAt: nullableString(event.endsAt, `events[${index}].endsAt`),
  };
}

function parseOrganizerOverviewActionItem(
  item: unknown,
  index: number,
): OrganizerOverviewActionItem {
  if (!isRecord(item)) {
    throw new Error(
      `The organizer overview response contains an invalid action item at index ${index}.`,
    );
  }
  const type = requiredString(item.type, `actionItems[${index}].type`);
  if (type !== "reviews" && type !== "speaker_tasks" && type !== "agenda") {
    throw new Error(`The organizer overview response contains an invalid action item type.`);
  }
  return {
    id: requiredString(item.id, `actionItems[${index}].id`),
    type,
    eventId: requiredString(item.eventId, `actionItems[${index}].eventId`),
    title: requiredString(item.title, `actionItems[${index}].title`),
    description: requiredString(item.description, `actionItems[${index}].description`),
    count: nonNegativeInteger(item.count, `actionItems[${index}].count`),
    priority: integer(item.priority, `actionItems[${index}].priority`),
    dueAt: nullableString(item.dueAt, `actionItems[${index}].dueAt`),
    href: requiredString(item.href, `actionItems[${index}].href`),
  };
}

/** Parse and validate the organization-scoped core response envelope. */
export function parseOrganizerOverviewCoreResponse(
  payload: unknown,
  expectedOrganizationId?: string,
): OrganizerOverviewCoreData {
  const data = responseData(payload);
  if (!isRecord(data.metrics) || !Array.isArray(data.events)) {
    throw new Error("The organizer overview core response was not valid.");
  }
  return {
    organizationId: responseOrganizationId(data, expectedOrganizationId),
    metrics: {
      eventCount: nonNegativeInteger(data.metrics.eventCount, "metrics.eventCount"),
    },
    events: data.events.map(parseOrganizerOverviewEvent),
  };
}

/** Parse and validate the organization-scoped activity response envelope. */
export function parseOrganizerOverviewActivityResponse(
  payload: unknown,
  expectedOrganizationId?: string,
): OrganizerOverviewActivityData {
  const data = responseData(payload);
  if (!isRecord(data.metrics) || !Array.isArray(data.actionItems)) {
    throw new Error("The organizer overview activity response was not valid.");
  }
  return {
    organizationId: responseOrganizationId(data, expectedOrganizationId),
    metrics: {
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
    actionItems: data.actionItems.map(parseOrganizerOverviewActionItem),
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
  let coreInFlight: Promise<OrganizerOverviewCoreData> | null = null;
  let activityInFlight: Promise<OrganizerOverviewActivityData> | null = null;

  const request = async <T,>(
    path: string,
    parser: (payload: unknown, expectedOrganizationId: string) => T,
  ): Promise<T> => {
    const response = await fetcher(`${endpoint}${path}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(await responseErrorMessage(response));
    }
    return parser(await response.json(), organizationId);
  };

  return {
    getCore() {
      if (coreInFlight !== null) {
        return coreInFlight;
      }
      coreInFlight = request("/core", parseOrganizerOverviewCoreResponse).finally(() => {
        coreInFlight = null;
      });
      return coreInFlight;
    },
    getActivity() {
      if (activityInFlight !== null) {
        return activityInFlight;
      }
      activityInFlight = request("/activity", parseOrganizerOverviewActivityResponse).finally(() => {
        activityInFlight = null;
      });
      return activityInFlight;
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
            Loading live event, submission, review, and speaker data.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link className={styles.primaryButton} href="/admin/events">
            View events <span aria-hidden="true">→</span>
          </Link>
        </div>
      </header>

      <section className={styles.metricsGrid} aria-label="Loading organization metrics">
        {[
          coreMetricDefinition,
          ...activityMetricDefinitions,
        ].map((metric) => (
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
      </section>

      <div className={styles.dashboardGrid}>
        <section className={styles.panel} aria-labelledby="organizer-overview-loading-actions">
          <div className={styles.panelHeader}>
            <div className={styles.panelHeading}>
              <p className={styles.panelEyebrow}>Action queue</p>
              <h2 className={styles.panelTitle} id="organizer-overview-loading-actions">
                Tasks that need you
              </h2>
            </div>
            <span className={styles.skeletonInline} aria-hidden="true" />
          </div>
          <div className={styles.panelContent} aria-hidden="true">
            <div className={styles.skeletonTask}>
              <span className={styles.skeletonCircle} />
              <span className={styles.skeletonTaskCopy}>
                <span className={styles.skeletonLine} />
                <span className={styles.skeletonLineShort} />
              </span>
              <span className={styles.skeletonAction} />
            </div>
            <div className={styles.skeletonTask}>
              <span className={styles.skeletonCircle} />
              <span className={styles.skeletonTaskCopy}>
                <span className={styles.skeletonLine} />
                <span className={styles.skeletonLineShort} />
              </span>
              <span className={styles.skeletonAction} />
            </div>
            <div className={styles.skeletonTask}>
              <span className={styles.skeletonCircle} />
              <span className={styles.skeletonTaskCopy}>
                <span className={styles.skeletonLine} />
                <span className={styles.skeletonLineShort} />
              </span>
              <span className={styles.skeletonAction} />
            </div>
          </div>
        </section>

        <section
          className={`${styles.panel} ${styles.guidancePanel}`}
          aria-labelledby="organizer-overview-loading-guidance"
        >
          <div className={styles.panelHeader}>
            <div className={styles.panelHeading}>
              <p className={styles.panelEyebrow}>Organization</p>
              <h2 className={styles.panelTitle} id="organizer-overview-loading-guidance">
                Keep your program moving
              </h2>
            </div>
          </div>
          <div className={styles.panelContent} aria-hidden="true">
            <span className={styles.skeletonLine} />
            <span className={styles.skeletonLine} />
            <span className={styles.skeletonLineShort} />
          </div>
        </section>

        <section
          className={`${styles.panel} ${styles.widePanel}`}
          aria-labelledby="organizer-overview-loading-events"
        >
          <div className={styles.panelHeader}>
            <div className={styles.panelHeading}>
              <p className={styles.panelEyebrow}>Live event data</p>
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
          <article className={styles.metricCard} key={metric.key}>
            <div className={styles.metricTop}>
              <span className={styles.metricIcon} aria-hidden="true">
                {metric.icon}
              </span>
            </div>
            <div>
              <span className={styles.metricLabel}>{metric.label}</span>
              {value === undefined ? (
                <strong
                  className={styles.metricValue}
                  role={hasError ? "alert" : "status"}
                >
                  {hasError ? "Unavailable" : "Loading…"}
                </strong>
              ) : (
                <strong className={styles.metricValue}>{value}</strong>
              )}
              {data && isLoading ? (
                <p className={styles.metricDetail} role="status">
                  Refreshing secondary metrics…
                </p>
              ) : null}
              {data && hasError ? (
                <p className={styles.metricDetail} role="alert">
                  Stale data. {state.message}
                </p>
              ) : null}
              {!data && state.status === "error" ? (
                <p className={styles.metricDetail} role="alert">
                  {state.message}
                </p>
              ) : null}
              {index === 0 && hasError && onRetry ? (
                <button
                  className={styles.secondaryButton}
                  type="button"
                  onClick={() => {
                    void onRetry();
                  }}
                >
                  Retry activity
                </button>
              ) : null}
              {value !== undefined && !isLoading && !hasError ? (
                <p className={styles.metricDetail}>{metric.detail}</p>
              ) : null}
            </div>
          </article>
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
    <section className={styles.panel} aria-labelledby="action-items-title">
      <div className={styles.panelHeader}>
        <div className={styles.panelHeading}>
          <p className={styles.panelEyebrow}>Action queue</p>
          <h2 className={styles.panelTitle} id="action-items-title">
            Tasks that need you
          </h2>
        </div>
        <div className={styles.panelHeaderActions}>
          <span className={styles.panelCount}>
            {data
              ? `${data.actionItems.length} ${data.actionItems.length === 1 ? "task" : "tasks"}`
              : state.status === "loading"
                ? "Loading…"
                : "Unavailable"}
          </span>
          <Link className={styles.panelLink} href="/admin/events">
            View events <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
      <div className={styles.panelContent}>
        {!data && state.status === "loading" ? (
          <p className={styles.muted} role="status" aria-live="polite">
            Loading action items…
          </p>
        ) : !data && state.status === "error" ? (
          <div className={styles.emptyState} role="alert">
            <p className={styles.emptyStateTitle}>Action items unavailable</p>
            <p className={styles.muted}>{state.message}</p>
            {onRetry ? (
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => {
                  void onRetry();
                }}
              >
                Retry activity
              </button>
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
                <p className={styles.muted}>
                  Stale action items. {state.message}
                </p>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  onClick={() => {
                    void onRetry();
                  }}
                >
                  Retry activity
                </button>
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
                      <span className={styles.taskIcon} aria-hidden="true">
                        {critical ? "!" : "·"}
                      </span>
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
                      <Link
                        aria-label={`Open ${item.title}`}
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
          </>
        )}
      </div>
    </section>
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
          <Link className={styles.primaryButton} href="/admin/events">
            Manage events <span aria-hidden="true">→</span>
          </Link>
        </div>
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
                      aria-label={`Open agenda for ${event.name}`}
                      className={styles.primaryButton}
                      href={agendaHref(data.organizationId, event.id)}
                    >
                      Open agenda <span aria-hidden="true">→</span>
                    </Link>
                    <Link
                      aria-label={`Open settings for ${event.name}`}
                      className={styles.outlineButton}
                      href={eventSettingsHref(data.organizationId, event.id)}
                    >
                      Settings <span aria-hidden="true">→</span>
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
                aria-label={`Open agenda for ${event.name}`}
                className={styles.primaryButton}
                href={agendaHref(data.organizationId, event.id)}
              >
                Open agenda <span aria-hidden="true">→</span>
              </Link>
              <Link
                aria-label={`Open settings for ${event.name}`}
                className={styles.secondaryButton}
                href={eventSettingsHref(data.organizationId, event.id)}
              >
                Settings <span aria-hidden="true">→</span>
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
        message={state.status === "error" ? state.message : "The core overview data was not loaded."}
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
            Live operational data for your organization, including events, submissions, reviews, and
            speaker work.
          </p>
          {state.core.status === "loading" ? (
            <p className={styles.taskMeta} role="status" aria-live="polite">
              Refreshing core event data…
            </p>
          ) : null}
          {state.core.status === "error" ? (
            <div role="alert">
              <p className={styles.taskMeta}>
                Showing previous event data. {state.core.message}
              </p>
              {onRetryCore ? (
                <button
                  className={styles.secondaryButton}
                  type="button"
                  onClick={() => {
                    void onRetryCore();
                  }}
                >
                  Retry core
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className={styles.headerActions}>
          <Link className={styles.primaryButton} href="/admin/events">
            View events <span aria-hidden="true">→</span>
          </Link>
        </div>
      </header>

      <section className={styles.metricsGrid} aria-labelledby="overview-metrics-title">
        <h2 className={styles.srOnly} id="overview-metrics-title">
          Live organization metrics
        </h2>
        <article className={styles.metricCard} key={coreMetricDefinition.key}>
          <div className={styles.metricTop}>
            <span className={styles.metricIcon} aria-hidden="true">
              {coreMetricDefinition.icon}
            </span>
          </div>
          <div>
            <span className={styles.metricLabel}>{coreMetricDefinition.label}</span>
            <strong className={styles.metricValue}>{core.metrics.eventCount}</strong>
            <p className={styles.metricDetail}>{coreMetricDefinition.detail}</p>
          </div>
        </article>
        <ActivityMetricCards state={activity} onRetry={onRetryActivity} />
      </section>

      <div className={styles.dashboardGrid}>
        <ActionItems state={activity} onRetry={onRetryActivity} />
        <section
          className={`${styles.panel} ${styles.guidancePanel}`}
          aria-labelledby="overview-guidance-title"
        >
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
            <span className={styles.panelCount}>{core.events.length} total</span>
          </div>
          <EventsTable data={core} />
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
    "error" in config
      ? { status: "config-error", message: config.error }
      : {
          status: "loading",
          core: { status: "loading", data: null },
          activity: { status: "loading", data: null },
        },
  );
  const generationRef = useRef(0);

  const loadCore = useCallback(async () => {
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
      const data = await api.getCore();
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
  }, [api, config]);

  const loadActivity = useCallback(async () => {
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
      const data = await api.getActivity();
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
  }, [api, config]);

  useEffect(() => {
    generationRef.current += 1;
    if (!api || "error" in config) {
      setState(
        "error" in config
          ? { status: "config-error", message: config.error }
          : { status: "config-error", message: "Organizer overview is not configured." },
      );
      return;
    }
    setState({
      status: "loading",
      core: { status: "loading", data: null },
      activity: { status: "loading", data: null },
    });
    void loadCore();
    void loadActivity();
  }, [api, config, loadActivity, loadCore]);

  return (
    <OrganizerOverviewView
      state={state}
      onRetryCore={api ? loadCore : undefined}
      onRetryActivity={api ? loadActivity : undefined}
    />
  );
}
const organizerEventStatuses = ["draft", "active", "archived"] as const;

export type OrganizerEventStatus = (typeof organizerEventStatuses)[number];

export interface OrganizerEventCfpSettings {
  readonly enabled: boolean;
  readonly opensAt: string | null;
  readonly closesAt: string | null;
}

export interface OrganizerEventDefaultCalendarSettings {
  readonly durationMinutes: number;
  readonly timeZone: string;
  readonly location: string | null;
}

export type OrganizerEventEmbedWidgetId =
  | "sessions"
  | "speakers"
  | "agenda"
  | "itinerary"
  | "gallery";
export type OrganizerEventEmbedTheme = "auto" | "light" | "dark";
export type OrganizerEventEmbedOutputFormat =
  | "styled-html"
  | "basic-html"
  | "json"
  | "xml"
  | "ical";
export type OrganizerEventEmbedLayout = "comfortable" | "compact" | "list" | "grid" | "timeline";

export interface OrganizerEventEmbedConfiguration {
  readonly id: string;
  readonly name: string;
  readonly widgetId: OrganizerEventEmbedWidgetId;
  readonly enabled: boolean;
  readonly theme: OrganizerEventEmbedTheme;
  readonly outputFormat: OrganizerEventEmbedOutputFormat;
  readonly layout: OrganizerEventEmbedLayout;
  readonly accent: string;
  readonly backgroundColor: string;
  readonly textColor: string;
  readonly customCss: string;
  readonly displayFields: readonly string[];
  readonly tracks: readonly string[];
  readonly statuses: readonly string[];
}
export type EventEmbedConfiguration = OrganizerEventEmbedConfiguration;

export interface OrganizerEventRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly slug: string;
  readonly name: string;
  readonly status: OrganizerEventStatus;
  readonly timeZone: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly venue: string | null;
  readonly cfpSettings: OrganizerEventCfpSettings;
  readonly defaultCalendarSettings: OrganizerEventDefaultCalendarSettings;
  readonly embedConfigurations?: readonly OrganizerEventEmbedConfiguration[];
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly createdBy: string;
  readonly updatedBy: string;
}

export type EventRecord = OrganizerEventRecord;

export interface OrganizerEventCreateInput {
  readonly name: string;
  readonly timeZone: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly venue?: string | null;
  readonly cfpSettings: OrganizerEventCfpSettings;
  readonly defaultCalendarSettings: OrganizerEventDefaultCalendarSettings;
  readonly slug?: string;
  readonly status?: OrganizerEventStatus;
}

export interface OrganizerEventUpdateInput {
  readonly expectedVersion: number;
  readonly name?: string;
  readonly slug?: string;
  readonly status?: OrganizerEventStatus;
  readonly timeZone?: string;
  readonly startsAt?: string;
  readonly endsAt?: string;
  readonly venue?: string | null;
  readonly cfpSettings?: OrganizerEventCfpSettings;
  readonly defaultCalendarSettings?: OrganizerEventDefaultCalendarSettings;
  readonly embedConfigurations?: readonly OrganizerEventEmbedConfiguration[];
}

export interface OrganizerEventsApi {
  listEvents(signal?: AbortSignal): Promise<readonly OrganizerEventRecord[]>;
  getEvent(eventId: string, signal?: AbortSignal): Promise<OrganizerEventRecord>;
  createEvent(input: OrganizerEventCreateInput): Promise<OrganizerEventRecord>;
  updateEvent(eventId: string, input: OrganizerEventUpdateInput): Promise<OrganizerEventRecord>;
  archiveEvent(eventId: string, expectedVersion: number): Promise<OrganizerEventRecord>;
}

type OrganizerEventsFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface OrganizerEventsErrorBody {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly traceId?: string;
    readonly details?: readonly {
      readonly path?: readonly (string | number)[];
      readonly message?: string;
    }[];
  };
}

export class OrganizerEventsApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly traceId: string | undefined;
  readonly details:
    | readonly {
        readonly path?: readonly (string | number)[];
        readonly message?: string;
      }[]
    | undefined;

  constructor(
    code: string,
    message: string,
    status: number,
    traceId?: string,
    details?: readonly {
      readonly path?: readonly (string | number)[];
      readonly message?: string;
    }[],
  ) {
    super(message);
    this.name = "OrganizerEventsApiError";
    this.code = code;
    this.status = status;
    this.traceId = traceId;
    this.details = details;
  }
}

function eventRecordError(message: string): TypeError {
  return new TypeError(`The organizer event response is invalid: ${message}`);
}

function eventRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw eventRecordError(`${field} is required.`);
  }
  return value;
}

function eventNullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw eventRecordError(`${field} must be a string or null.`);
  }
  return value;
}

function eventRequiredInteger(value: unknown, field: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    throw eventRecordError(`${field} must be an integer of at least ${minimum}.`);
  }
  return value;
}

function eventStatus(value: unknown, field: string): OrganizerEventStatus {
  if (
    typeof value !== "string" ||
    !organizerEventStatuses.includes(value as OrganizerEventStatus)
  ) {
    throw eventRecordError(`${field} must be draft, active, or archived.`);
  }
  return value as OrganizerEventStatus;
}

function parseOrganizerEventEmbedConfiguration(
  value: unknown,
  field: string,
): OrganizerEventEmbedConfiguration {
  if (!isRecord(value)) {
    throw eventRecordError(`${field} must be an object.`);
  }
  const id = eventRequiredString(value.id, `${field}.id`);
  const name = eventRequiredString(value.name, `${field}.name`);
  const widgetId = eventRequiredString(value.widgetId, `${field}.widgetId`);
  const theme = eventRequiredString(value.theme, `${field}.theme`);
  const outputFormat = eventRequiredString(value.outputFormat, `${field}.outputFormat`);
  const layout = eventRequiredString(value.layout, `${field}.layout`);
  const accent = eventRequiredString(value.accent, `${field}.accent`);
  const backgroundColor = eventRequiredString(value.backgroundColor, `${field}.backgroundColor`);
  const textColor = eventRequiredString(value.textColor, `${field}.textColor`);
  const customCss = typeof value.customCss === "string" ? value.customCss : null;

  if (
    !["sessions", "speakers", "agenda", "itinerary", "gallery"].includes(widgetId) ||
    !["auto", "light", "dark"].includes(theme) ||
    !["styled-html", "basic-html", "json", "xml", "ical"].includes(outputFormat) ||
    !["comfortable", "compact", "list", "grid", "timeline"].includes(layout) ||
    !/^#[0-9a-f]{6}$/iu.test(accent) ||
    !/^#[0-9a-f]{6}$/iu.test(backgroundColor) ||
    !/^#[0-9a-f]{6}$/iu.test(textColor) ||
    customCss === null ||
    typeof value.enabled !== "boolean"
  ) {
    throw eventRecordError(`${field} contains an unsupported embed configuration value.`);
  }

  const stringList = (listValue: unknown, listField: string): readonly string[] => {
    if (!Array.isArray(listValue) || !listValue.every((item) => typeof item === "string")) {
      throw eventRecordError(`${listField} must be an array of strings.`);
    }
    return listValue
      .map((item) => item.trim())
      .filter((item, index, list) => {
        return item.length > 0 && list.indexOf(item) === index;
      });
  };

  return {
    id,
    name,
    widgetId: widgetId as OrganizerEventEmbedWidgetId,
    enabled: value.enabled,
    theme: theme as OrganizerEventEmbedTheme,
    outputFormat: outputFormat as OrganizerEventEmbedOutputFormat,
    layout: layout as OrganizerEventEmbedLayout,
    accent: accent.toLowerCase(),
    backgroundColor: backgroundColor.toLowerCase(),
    textColor: textColor.toLowerCase(),
    customCss,
    displayFields: stringList(value.displayFields, `${field}.displayFields`),
    tracks: stringList(value.tracks, `${field}.tracks`),
    statuses: stringList(value.statuses, `${field}.statuses`),
  };
}

function parseOrganizerEventEmbedConfigurations(
  value: unknown,
  field: string,
): readonly OrganizerEventEmbedConfiguration[] {
  if (!Array.isArray(value)) {
    throw eventRecordError(`${field} must be an array.`);
  }
  const configurations = value.map((configuration, index) =>
    parseOrganizerEventEmbedConfiguration(configuration, `${field}[${index}]`),
  );
  if (
    new Set(configurations.map((configuration) => configuration.id)).size !== configurations.length
  ) {
    throw eventRecordError(`${field} must not contain duplicate configuration IDs.`);
  }
  return configurations;
}

function parseOrganizerEventCfpSettings(value: unknown, field: string): OrganizerEventCfpSettings {
  if (!isRecord(value)) {
    throw eventRecordError(`${field} must be an object.`);
  }
  if (typeof value.enabled !== "boolean") {
    throw eventRecordError(`${field}.enabled must be a boolean.`);
  }
  return {
    enabled: value.enabled,
    opensAt: eventNullableString(value.opensAt, `${field}.opensAt`),
    closesAt: eventNullableString(value.closesAt, `${field}.closesAt`),
  };
}

function parseOrganizerEventCalendarSettings(
  value: unknown,
  field: string,
): OrganizerEventDefaultCalendarSettings {
  if (!isRecord(value)) {
    throw eventRecordError(`${field} must be an object.`);
  }
  if ("timezone" in value) {
    throw eventRecordError(`${field}.timeZone is required; timezone is not supported.`);
  }
  return {
    durationMinutes: eventRequiredInteger(value.durationMinutes, `${field}.durationMinutes`, 1),
    timeZone: eventRequiredString(value.timeZone, `${field}.timeZone`),
    location: eventNullableString(value.location, `${field}.location`),
  };
}

export function parseOrganizerEventRecord(payload: unknown): OrganizerEventRecord {
  if (!isRecord(payload)) {
    throw eventRecordError("the event must be an object.");
  }
  return {
    id: eventRequiredString(payload.id, "id"),
    organizationId: eventRequiredString(payload.organizationId, "organizationId"),
    slug: eventRequiredString(payload.slug, "slug"),
    name: eventRequiredString(payload.name, "name"),
    status: eventStatus(payload.status, "status"),
    timeZone: eventRequiredString(payload.timeZone, "timeZone"),
    startsAt: eventRequiredString(payload.startsAt, "startsAt"),
    endsAt: eventRequiredString(payload.endsAt, "endsAt"),
    venue: eventNullableString(payload.venue, "venue"),
    cfpSettings: parseOrganizerEventCfpSettings(payload.cfpSettings, "cfpSettings"),
    defaultCalendarSettings: parseOrganizerEventCalendarSettings(
      payload.defaultCalendarSettings,
      "defaultCalendarSettings",
    ),
    version: eventRequiredInteger(payload.version, "version", 1),
    createdAt: eventRequiredString(payload.createdAt, "createdAt"),
    updatedAt: eventRequiredString(payload.updatedAt, "updatedAt"),
    createdBy: eventRequiredString(payload.createdBy, "createdBy"),
    updatedBy: eventRequiredString(payload.updatedBy, "updatedBy"),
    ...("embedConfigurations" in payload
      ? {
          embedConfigurations: parseOrganizerEventEmbedConfigurations(
            payload.embedConfigurations,
            "embedConfigurations",
          ),
        }
      : {}),
  };
}

export function parseOrganizerEventsResponse(payload: unknown): readonly OrganizerEventRecord[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw eventRecordError("data must be an array.");
  }
  return payload.data.map((event, index) => {
    try {
      return parseOrganizerEventRecord(event);
    } catch (error) {
      if (error instanceof TypeError) {
        throw new TypeError(`${error.message} (events[${index}])`);
      }
      throw error;
    }
  });
}

export function parseOrganizerEventResponse(payload: unknown): OrganizerEventRecord {
  if (!isRecord(payload) || !("data" in payload)) {
    throw eventRecordError("data must contain one event.");
  }
  return parseOrganizerEventRecord(payload.data);
}

async function organizerEventsApiError(response: Response): Promise<OrganizerEventsApiError> {
  const body = (await response.json().catch(() => undefined)) as
    | OrganizerEventsErrorBody
    | undefined;
  return new OrganizerEventsApiError(
    body?.error?.code ?? "EVENT_REQUEST_FAILED",
    body?.error?.message ?? `The event request failed (HTTP ${response.status}).`,
    response.status,
    body?.error?.traceId,
    body?.error?.details,
  );
}

function eventPathSegment(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new TypeError(`An ${field} is required for organizer event requests.`);
  }
  return encodeURIComponent(normalized);
}

function eventCreateBody(input: OrganizerEventCreateInput): Record<string, unknown> {
  return {
    name: input.name,
    timeZone: input.timeZone,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    venue: input.venue ?? null,
    cfpSettings: {
      enabled: input.cfpSettings.enabled,
      opensAt: input.cfpSettings.opensAt,
      closesAt: input.cfpSettings.closesAt,
    },
    defaultCalendarSettings: {
      durationMinutes: input.defaultCalendarSettings.durationMinutes,
      timeZone: input.defaultCalendarSettings.timeZone,
      location: input.defaultCalendarSettings.location,
    },
    ...(input.slug === undefined ? {} : { slug: input.slug }),
    ...(input.status === undefined ? {} : { status: input.status }),
  };
}

function eventUpdateBody(input: OrganizerEventUpdateInput): Record<string, unknown> {
  return {
    expectedVersion: input.expectedVersion,
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.slug === undefined ? {} : { slug: input.slug }),
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(input.timeZone === undefined ? {} : { timeZone: input.timeZone }),
    ...(input.startsAt === undefined ? {} : { startsAt: input.startsAt }),
    ...(input.endsAt === undefined ? {} : { endsAt: input.endsAt }),
    ...(input.venue === undefined ? {} : { venue: input.venue }),
    ...(input.cfpSettings === undefined
      ? {}
      : {
          cfpSettings: {
            enabled: input.cfpSettings.enabled,
            opensAt: input.cfpSettings.opensAt,
            closesAt: input.cfpSettings.closesAt,
          },
        }),
    ...(input.defaultCalendarSettings === undefined
      ? {}
      : {
          defaultCalendarSettings: {
            durationMinutes: input.defaultCalendarSettings.durationMinutes,
            timeZone: input.defaultCalendarSettings.timeZone,
            location: input.defaultCalendarSettings.location,
          },
        }),
    ...(input.embedConfigurations === undefined
      ? {}
      : { embedConfigurations: input.embedConfigurations }),
  };
}

export function createOrganizerEventsApi(
  apiBaseUrl: string,
  organizationId: string,
  fetcher: OrganizerEventsFetcher = globalThis.fetch,
): OrganizerEventsApi {
  const normalizedBaseUrl = apiBaseUrl.trim().replace(/\/+$/u, "");
  if (normalizedBaseUrl.length === 0) {
    throw new TypeError("An API URL is required for organizer event requests.");
  }
  const normalizedOrganizationId = organizationId.trim();
  if (normalizedOrganizationId.length === 0) {
    throw new TypeError("An organization ID is required for organizer event requests.");
  }
  const collectionEndpoint = `${normalizedBaseUrl}/api/admin/organizations/${eventPathSegment(normalizedOrganizationId, "organization ID")}/events`;

  async function request<T>(
    path: string,
    parser: (payload: unknown) => T,
    init: RequestInit = {},
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (init.body !== undefined) headers.set("content-type", "application/json");
    const response = await fetcher(`${collectionEndpoint}${path}`, {
      ...init,
      credentials: "include",
      headers: Object.fromEntries(headers.entries()),
    });
    if (!response.ok) {
      throw await organizerEventsApiError(response);
    }
    const payload: unknown = await response.json().catch(() => undefined);
    return parser(payload);
  }

  return {
    listEvents(signal) {
      return request(
        "",
        parseOrganizerEventsResponse,
        signal === undefined ? { cache: "no-store" } : { cache: "no-store", signal },
      );
    },
    getEvent(eventId, signal) {
      return request(
        `/${eventPathSegment(eventId, "event ID")}`,
        parseOrganizerEventResponse,
        signal === undefined ? { cache: "no-store" } : { cache: "no-store", signal },
      );
    },
    createEvent(input) {
      return request("", parseOrganizerEventResponse, {
        method: "POST",
        body: JSON.stringify(eventCreateBody(input)),
      });
    },
    updateEvent(eventId, input) {
      return request(`/${eventPathSegment(eventId, "event ID")}`, parseOrganizerEventResponse, {
        method: "PATCH",
        body: JSON.stringify(eventUpdateBody(input)),
      });
    },
    archiveEvent(eventId, expectedVersion) {
      return request(
        `/${eventPathSegment(eventId, "event ID")}/archive`,
        parseOrganizerEventResponse,
        { method: "POST", body: JSON.stringify({ expectedVersion }) },
      );
    },
  };
}

export interface OrganizerEventFormValues {
  readonly name: string;
  readonly slug: string;
  readonly status: OrganizerEventStatus;
  readonly timeZone: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly venue: string;
  readonly cfpEnabled: boolean;
  readonly cfpOpensAt: string;
  readonly cfpClosesAt: string;
  readonly defaultCalendarDurationMinutes: string;
  readonly defaultCalendarTimeZone: string;
  readonly defaultCalendarLocation: string;
}

function browserEventTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone?.trim() || "UTC";
  } catch {
    return "UTC";
  }
}

function validEventTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function localDateTimeToIso(value: string, timeZone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? "0");
  if (
    year < 1000 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    !validEventTimeZone(timeZone)
  ) {
    return null;
  }
  const localMilliseconds = Date.UTC(year, month - 1, day, hour, minute, second);
  if (!Number.isFinite(localMilliseconds)) return null;
  let candidate = localMilliseconds;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(candidate))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );
    const wallMilliseconds = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    candidate = localMilliseconds - (wallMilliseconds - candidate);
  }
  const result = new Date(candidate);
  return Number.isFinite(result.getTime()) ? result.toISOString() : null;
}

function isoToLocalDateTime(value: string, timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf()) || !validEventTimeZone(timeZone)) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  if (!parts.year || !parts.month || !parts.day || !parts.hour || !parts.minute) return "";
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function eventEditorFormValues(event?: OrganizerEventRecord): OrganizerEventFormValues {
  const timeZone = event?.timeZone ?? browserEventTimeZone();
  return {
    name: event?.name ?? "",
    slug: event?.slug ?? "",
    status: event?.status ?? "draft",
    timeZone,
    startsAt: event ? isoToLocalDateTime(event.startsAt, timeZone) : "",
    endsAt: event ? isoToLocalDateTime(event.endsAt, timeZone) : "",
    venue: event?.venue ?? "",
    cfpEnabled: event?.cfpSettings.enabled ?? false,
    cfpOpensAt: event?.cfpSettings.opensAt
      ? isoToLocalDateTime(event.cfpSettings.opensAt, timeZone)
      : "",
    cfpClosesAt: event?.cfpSettings.closesAt
      ? isoToLocalDateTime(event.cfpSettings.closesAt, timeZone)
      : "",
    defaultCalendarDurationMinutes: String(event?.defaultCalendarSettings.durationMinutes ?? 30),
    defaultCalendarTimeZone: event?.defaultCalendarSettings.timeZone ?? timeZone,
    defaultCalendarLocation: event?.defaultCalendarSettings.location ?? "",
  };
}

export const organizerEventEditorFormValues = eventEditorFormValues;

export function validateOrganizerEventForm(values: OrganizerEventFormValues): {
  readonly input?: OrganizerEventCreateInput;
  readonly error?: string;
} {
  const name = values.name.trim();
  if (!name) return { error: "Event name is required." };
  const timeZone = values.timeZone.trim();
  if (!validEventTimeZone(timeZone)) return { error: "Enter a valid IANA time zone." };
  const startsAt = localDateTimeToIso(values.startsAt, timeZone);
  if (!startsAt) return { error: "Enter a valid event start date and time." };
  const endsAt = localDateTimeToIso(values.endsAt, timeZone);
  if (!endsAt) return { error: "Enter a valid event end date and time." };
  if (Date.parse(startsAt) >= Date.parse(endsAt)) {
    return { error: "Event end must be after event start." };
  }

  const slug = values.slug.trim().toLowerCase();
  if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) {
    return { error: "Slug must use lowercase letters, numbers, and single hyphens." };
  }

  const defaultCalendarTimeZone = values.defaultCalendarTimeZone.trim() || timeZone;
  if (!validEventTimeZone(defaultCalendarTimeZone)) {
    return { error: "Enter a valid default calendar time zone." };
  }
  const durationMinutes = Number(values.defaultCalendarDurationMinutes);
  if (!Number.isSafeInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1_440) {
    return { error: "Default calendar duration must be between 1 and 1440 minutes." };
  }

  const cfpOpensAt = values.cfpOpensAt.trim()
    ? localDateTimeToIso(values.cfpOpensAt, timeZone)
    : null;
  if (values.cfpOpensAt.trim() && !cfpOpensAt) {
    return { error: "Enter a valid CFP opening date and time." };
  }
  const cfpClosesAt = values.cfpClosesAt.trim()
    ? localDateTimeToIso(values.cfpClosesAt, timeZone)
    : null;
  if (values.cfpClosesAt.trim() && !cfpClosesAt) {
    return { error: "Enter a valid CFP closing date and time." };
  }
  if (
    cfpOpensAt !== null &&
    cfpClosesAt !== null &&
    Date.parse(cfpOpensAt) >= Date.parse(cfpClosesAt)
  ) {
    return { error: "CFP closing must be after CFP opening." };
  }

  const input: OrganizerEventCreateInput = {
    name,
    timeZone,
    startsAt,
    endsAt,
    venue: values.venue.trim() || null,
    cfpSettings: {
      enabled: values.cfpEnabled,
      opensAt: cfpOpensAt,
      closesAt: cfpClosesAt,
    },
    defaultCalendarSettings: {
      durationMinutes,
      timeZone: defaultCalendarTimeZone,
      location: values.defaultCalendarLocation.trim() || null,
    },
    ...(slug ? { slug } : {}),
    status: values.status,
  };
  return { input };
}

export const validateEventForm = validateOrganizerEventForm;

const eventFieldStyle: CSSProperties = {
  display: "grid",
  gap: "0.35rem",
};

const eventFieldLabelStyle: CSSProperties = {
  color: "var(--admin-ink)",
  fontSize: "0.78rem",
  fontWeight: 750,
};

const eventInputStyle: CSSProperties = {
  width: "100%",
  minHeight: "2.55rem",
  padding: "0.55rem 0.65rem",
  border: "1px solid var(--admin-border-strong)",
  borderRadius: "var(--admin-radius-sm)",
  background: "var(--admin-surface)",
  color: "var(--admin-ink)",
  font: "inherit",
  fontSize: "0.84rem",
};

const eventTwoColumnStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(15rem, 1fr))",
  gap: "1rem",
};

const eventInlineActionsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.55rem",
  alignItems: "center",
};

export interface OrganizerEventEditorProps {
  readonly event?: OrganizerEventRecord | undefined;
  readonly busy?: boolean;
  readonly onSave?: (input: OrganizerEventCreateInput) => Promise<void>;
  readonly onCancel?: () => void;
}

export function OrganizerEventEditor({
  event,
  busy = false,
  onSave,
  onCancel,
}: OrganizerEventEditorProps) {
  const [values, setValues] = useState<OrganizerEventFormValues>(() =>
    eventEditorFormValues(event),
  );
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setValues(eventEditorFormValues(event));
    setFormError(null);
  }, [event]);

  function updateValue<K extends keyof OrganizerEventFormValues>(
    key: K,
    value: OrganizerEventFormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
    if (formError) setFormError(null);
  }

  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const result = validateOrganizerEventForm(values);
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
    <form onSubmit={(formEvent) => void submit(formEvent)} style={{ display: "grid", gap: "1rem" }}>
      <div>
        <h2
          className={styles.panelTitle}
          id="organizer-event-editor-title"
          style={{ marginBottom: "0.35rem" }}
        >
          {event ? "Configure event" : "Create an event"}
        </h2>
        <p className={styles.muted}>
          Event dates are entered in the event time zone and saved as canonical ISO instants.
        </p>
      </div>
      <div style={eventTwoColumnStyle}>
        <label style={eventFieldStyle} htmlFor="organizer-event-name">
          <span style={eventFieldLabelStyle}>Event name</span>
          <input
            style={eventInputStyle}
            id="organizer-event-name"
            name="name"
            type="text"
            value={values.name}
            maxLength={200}
            required
            onChange={(formEvent) => updateValue("name", formEvent.target.value)}
          />
        </label>
        <label style={eventFieldStyle} htmlFor="organizer-event-slug">
          <span style={eventFieldLabelStyle}>URL slug</span>
          <input
            style={eventInputStyle}
            id="organizer-event-slug"
            name="slug"
            type="text"
            value={values.slug}
            maxLength={80}
            placeholder="summit-2026"
            onChange={(formEvent) => updateValue("slug", formEvent.target.value)}
          />
        </label>
      </div>
      <div style={eventTwoColumnStyle}>
        <label style={eventFieldStyle} htmlFor="organizer-event-status">
          <span style={eventFieldLabelStyle}>Status</span>
          <select
            style={eventInputStyle}
            id="organizer-event-status"
            name="status"
            value={values.status}
            onChange={(formEvent) =>
              updateValue("status", formEvent.target.value as OrganizerEventStatus)
            }
          >
            {organizerEventStatuses.map((status) => (
              <option key={status} value={status}>
                {status === "active" ? "Active" : status.charAt(0).toUpperCase() + status.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label style={eventFieldStyle} htmlFor="organizer-event-time-zone">
          <span style={eventFieldLabelStyle}>Event time zone</span>
          <input
            style={eventInputStyle}
            id="organizer-event-time-zone"
            name="timeZone"
            type="text"
            list="organizer-event-time-zones"
            value={values.timeZone}
            placeholder="America/Los_Angeles"
            required
            onChange={(formEvent) => updateValue("timeZone", formEvent.target.value)}
          />
          <datalist id="organizer-event-time-zones">
            <option value="UTC" />
            <option value="America/Los_Angeles" />
            <option value="America/New_York" />
            <option value="Europe/London" />
            <option value="Asia/Tokyo" />
          </datalist>
        </label>
      </div>
      <div style={eventTwoColumnStyle}>
        <label style={eventFieldStyle} htmlFor="organizer-event-starts-at">
          <span style={eventFieldLabelStyle}>Starts</span>
          <input
            style={eventInputStyle}
            id="organizer-event-starts-at"
            name="startsAt"
            type="datetime-local"
            value={values.startsAt}
            required
            onChange={(formEvent) => updateValue("startsAt", formEvent.target.value)}
          />
        </label>
        <label style={eventFieldStyle} htmlFor="organizer-event-ends-at">
          <span style={eventFieldLabelStyle}>Ends</span>
          <input
            style={eventInputStyle}
            id="organizer-event-ends-at"
            name="endsAt"
            type="datetime-local"
            value={values.endsAt}
            required
            onChange={(formEvent) => updateValue("endsAt", formEvent.target.value)}
          />
        </label>
      </div>
      <label style={eventFieldStyle} htmlFor="organizer-event-venue">
        <span style={eventFieldLabelStyle}>Venue</span>
        <input
          style={eventInputStyle}
          id="organizer-event-venue"
          name="venue"
          type="text"
          value={values.venue}
          maxLength={2_000}
          onChange={(formEvent) => updateValue("venue", formEvent.target.value)}
        />
      </label>
      <fieldset
        style={{
          display: "grid",
          gap: "0.8rem",
          border: "1px solid var(--admin-border)",
          borderRadius: "var(--admin-radius-sm)",
          padding: "0.95rem",
          margin: 0,
        }}
      >
        <legend style={{ padding: "0 0.35rem", fontSize: "0.86rem", fontWeight: 800 }}>
          CFP settings
        </legend>
        <label
          style={{
            display: "flex",
            gap: "0.55rem",
            alignItems: "center",
            color: "var(--admin-ink)",
            fontSize: "0.82rem",
          }}
        >
          <input
            type="checkbox"
            name="cfpSettings.enabled"
            checked={values.cfpEnabled}
            onChange={(formEvent) => updateValue("cfpEnabled", formEvent.target.checked)}
          />
          <span>Enable call for proposals</span>
        </label>
        <div style={eventTwoColumnStyle}>
          <label style={eventFieldStyle} htmlFor="organizer-event-cfp-opens-at">
            <span style={eventFieldLabelStyle}>CFP opens</span>
            <input
              style={eventInputStyle}
              id="organizer-event-cfp-opens-at"
              name="cfpSettings.opensAt"
              type="datetime-local"
              value={values.cfpOpensAt}
              onChange={(formEvent) => updateValue("cfpOpensAt", formEvent.target.value)}
            />
          </label>
          <label style={eventFieldStyle} htmlFor="organizer-event-cfp-closes-at">
            <span style={eventFieldLabelStyle}>CFP closes</span>
            <input
              style={eventInputStyle}
              id="organizer-event-cfp-closes-at"
              name="cfpSettings.closesAt"
              type="datetime-local"
              value={values.cfpClosesAt}
              onChange={(formEvent) => updateValue("cfpClosesAt", formEvent.target.value)}
            />
          </label>
        </div>
      </fieldset>
      <fieldset
        style={{
          display: "grid",
          gap: "0.8rem",
          border: "1px solid var(--admin-border)",
          borderRadius: "var(--admin-radius-sm)",
          padding: "0.95rem",
          margin: 0,
        }}
      >
        <legend style={{ padding: "0 0.35rem", fontSize: "0.86rem", fontWeight: 800 }}>
          Default calendar settings
        </legend>
        <div style={eventTwoColumnStyle}>
          <label style={eventFieldStyle} htmlFor="organizer-event-calendar-duration">
            <span style={eventFieldLabelStyle}>Default duration (minutes)</span>
            <input
              style={eventInputStyle}
              id="organizer-event-calendar-duration"
              name="defaultCalendarSettings.durationMinutes"
              type="number"
              min={1}
              max={1440}
              step={1}
              value={values.defaultCalendarDurationMinutes}
              required
              onChange={(formEvent) =>
                updateValue("defaultCalendarDurationMinutes", formEvent.target.value)
              }
            />
          </label>
          <label style={eventFieldStyle} htmlFor="organizer-event-calendar-time-zone">
            <span style={eventFieldLabelStyle}>Calendar time zone</span>
            <input
              style={eventInputStyle}
              id="organizer-event-calendar-time-zone"
              name="defaultCalendarSettings.timeZone"
              type="text"
              value={values.defaultCalendarTimeZone}
              required
              onChange={(formEvent) =>
                updateValue("defaultCalendarTimeZone", formEvent.target.value)
              }
            />
          </label>
        </div>
        <label style={eventFieldStyle} htmlFor="organizer-event-calendar-location">
          <span style={eventFieldLabelStyle}>Default calendar location</span>
          <input
            style={eventInputStyle}
            id="organizer-event-calendar-location"
            name="defaultCalendarSettings.location"
            type="text"
            value={values.defaultCalendarLocation}
            maxLength={2_000}
            onChange={(formEvent) => updateValue("defaultCalendarLocation", formEvent.target.value)}
          />
        </label>
      </fieldset>
      {formError ? (
        <p
          role="alert"
          style={{ margin: 0, color: "var(--admin-danger)", fontSize: "0.8rem", fontWeight: 700 }}
        >
          {formError}
        </p>
      ) : null}
      <div style={eventInlineActionsStyle}>
        {onCancel ? (
          <button className={styles.secondaryButton} type="button" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        <button className={styles.primaryButton} type="submit" disabled={busy}>
          {busy ? "Saving event…" : event ? "Save event" : "Create event"}
        </button>
      </div>
    </form>
  );
}

function eventManagementStatusClass(status: OrganizerEventStatus): string {
  switch (status) {
    case "active":
      return styles.statusLive ?? "";
    case "draft":
      return styles.statusDraft ?? "";
    case "archived":
      return styles.statusArchived ?? "";
  }
}

function eventManagementStatusLabel(status: OrganizerEventStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatEventManagementDate(value: string, timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).format(date);
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

export interface OrganizerEventsData {
  readonly organizationId: string;
  readonly events: readonly OrganizerEventRecord[];
}

export type OrganizerEventsViewState =
  | { readonly status: "loading" }
  | { readonly status: "config-error"; readonly message: string }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "loaded"; readonly data: OrganizerEventsData };

export interface OrganizerEventsViewProps {
  readonly state: OrganizerEventsViewState;
  readonly busy?: boolean;
  readonly notice?: string | null;
  readonly onRetry?: (() => void) | undefined;
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

function OrganizerEventsLoaded({
  data,
  busy,
  notice,
  onCreate,
  onUpdate,
  onArchive,
}: Readonly<{
  readonly data: OrganizerEventsData;
  readonly busy: boolean;
  readonly notice: string | null;
  readonly onCreate?: ((input: OrganizerEventCreateInput) => Promise<void>) | undefined;
  readonly onUpdate?:
    | ((
        eventId: string,
        input: OrganizerEventCreateInput,
        expectedVersion: number,
      ) => Promise<void>)
    | undefined;
  readonly onArchive?: ((eventId: string, expectedVersion: number) => Promise<void>) | undefined;
}>) {
  const [editor, setEditor] = useState<"create" | string | null>(null);
  const editingEvent =
    editor !== null && editor !== "create"
      ? data.events.find((event) => event.id === editor)
      : undefined;

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

  async function archive(event: OrganizerEventRecord) {
    if (!onArchive) return;
    if (typeof window !== "undefined" && !window.confirm(`Archive ${event.name}?`)) return;
    await onArchive(event.id, event.version);
  }

  return (
    <>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeaderCopy}>
          <p className={styles.eyebrow}>Organizer workspace</p>
          <h1 className={styles.pageTitle}>Event management</h1>
          <p className={styles.pageDescription}>
            Create events, configure their dates and defaults, and choose an event workspace.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.primaryButton}
            type="button"
            onClick={() => setEditor((current) => (current === "create" ? null : "create"))}
            aria-expanded={editor === "create"}
            aria-controls="organizer-event-editor"
          >
            {editor === "create" ? "Close create form" : "Create event"}
          </button>
        </div>
      </header>

      {notice ? (
        <p className={styles.callout} role="status" style={{ marginBottom: "1.25rem" }}>
          {notice}
        </p>
      ) : null}

      {editor !== null ? (
        <section
          className={styles.panel}
          id="organizer-event-editor"
          aria-labelledby="organizer-event-editor-title"
        >
          <div className={styles.panelContent}>
            <OrganizerEventEditor
              event={editingEvent}
              busy={busy}
              onCancel={() => setEditor(null)}
              onSave={editor === "create" ? create : update}
            />
          </div>
        </section>
      ) : null}

      <section className={styles.panel} aria-labelledby="organizer-events-title">
        <div className={styles.panelHeader}>
          <div className={styles.panelHeading}>
            <p className={styles.panelEyebrow}>Live organization data</p>
            <h2 className={styles.panelTitle} id="organizer-events-title">
              Events
            </h2>
          </div>
          <span className={styles.muted}>{data.events.length} total</span>
        </div>
        {data.events.length === 0 ? (
          <div className={styles.panelContent}>
            <p className={styles.muted} role="status">
              No events are available for this organization yet. Create an event to begin.
            </p>
          </div>
        ) : (
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
                      <span
                        className={`${styles.statusBadge} ${eventManagementStatusClass(event.status)}`}
                      >
                        <span aria-hidden="true">●</span>&nbsp;
                        {eventManagementStatusLabel(event.status)}
                      </span>
                    </td>
                    <td className={styles.eventDateCell}>
                      {formatEventManagementDates(event)}
                      <span className={styles.eventSlug}>{event.timeZone}</span>
                    </td>
                    <td>
                      <div className={styles.eventActions}>
                        <Link
                          className={styles.outlineButton}
                          href={agendaHref(data.organizationId, event.id)}
                        >
                          Agenda <span aria-hidden="true">→</span>
                        </Link>
                        <Link
                          className={styles.outlineButton}
                          href={eventSettingsHref(data.organizationId, event.id)}
                        >
                          Settings <span aria-hidden="true">→</span>
                        </Link>
                        <button
                          className={styles.secondaryButton}
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            setEditor((current) => (current === event.id ? null : event.id))
                          }
                        >
                          {editor === event.id ? "Close editor" : "Edit"}
                        </button>
                        {event.status !== "archived" && onArchive ? (
                          <button
                            className={styles.secondaryButton}
                            type="button"
                            disabled={busy}
                            onClick={() => void archive(event)}
                          >
                            Archive
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export function OrganizerEventsView({
  state,
  busy = false,
  notice = null,
  onRetry,
  onCreate,
  onUpdate,
  onArchive,
}: OrganizerEventsViewProps) {
  if (state.status === "loading") return <EventsLoadingState />;
  if (state.status === "config-error") {
    return (
      <EventsMessageState title="Event management is not configured" message={state.message} />
    );
  }
  if (state.status === "error") {
    return (
      <EventsMessageState title="Unable to load events" message={state.message} onRetry={onRetry} />
    );
  }
  return (
    <OrganizerEventsLoaded
      data={state.data}
      busy={busy}
      notice={notice}
      onCreate={onCreate}
      onUpdate={onUpdate}
      onArchive={onArchive}
    />
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
}: Readonly<{
  readonly api?: OrganizerEventsApi;
  readonly config?: OrganizerOverviewConfigResult;
}> = {}) {
  const config = useMemo(
    () => providedConfig ?? resolveOrganizerOverviewConfig(),
    [providedConfig],
  );
  const api = useMemo(() => {
    if (providedApi) return providedApi;
    if ("error" in config) return null;
    return createOrganizerEventsApi(config.apiBaseUrl, config.organizationId);
  }, [config, providedApi]);
  const [state, setState] = useState<OrganizerEventsViewState>(() =>
    "error" in config ? { status: "config-error", message: config.error } : { status: "loading" },
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!api || "error" in config) return;
      setState({ status: "loading" });
      setNotice(null);
      try {
        const events = await api.listEvents(signal);
        if (events.some((event) => event.organizationId !== config.organizationId)) {
          throw new Error("The organizer event response belongs to another organization.");
        }
        setState({ status: "loaded", data: { organizationId: config.organizationId, events } });
      } catch (error) {
        if (signal?.aborted) return;
        setState({ status: "error", message: organizerEventsErrorMessage(error) });
      }
    },
    [api, config],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function create(input: OrganizerEventCreateInput) {
    if (!api || "error" in config) return;
    setBusy(true);
    setNotice(null);
    try {
      const event = await api.createEvent(input);
      if (event.organizationId !== config.organizationId) {
        throw new Error("The created event belongs to another organization.");
      }
      setState((current) =>
        current.status === "loaded"
          ? { ...current, data: { ...current.data, events: [event, ...current.data.events] } }
          : current,
      );
      setNotice("Event created.");
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
    setBusy(true);
    setNotice(null);
    try {
      const event = await api.updateEvent(eventId, {
        expectedVersion,
        name: input.name,
        ...(input.slug === undefined ? {} : { slug: input.slug }),
        ...(input.status === undefined ? {} : { status: input.status }),
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
      setNotice("Event saved.");
    } catch (error) {
      throw new Error(organizerEventsErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function archive(eventId: string, expectedVersion: number) {
    if (!api || "error" in config) return;
    setBusy(true);
    setNotice(null);
    try {
      const event = await api.archiveEvent(eventId, expectedVersion);
      if (event.organizationId !== config.organizationId) {
        throw new Error("The archived event belongs to another organization.");
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
      setNotice("Event archived.");
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
      notice={notice}
      onRetry={() => void load()}
      onCreate={api ? create : undefined}
      onUpdate={api ? update : undefined}
      onArchive={api ? archive : undefined}
    />
  );
}
