import type { PortalCapability, PortalSubmissionStatus } from "./types";

export type ParticipantNavigationId =
  | "my-events"
  | "submissions"
  | "tasks"
  | "profile"
  | "sessions"
  | "files"
  | "event-guide";

export type ParticipantNavigationGroup = "primary" | "secondary";

export interface ParticipantNavigationItem {
  readonly id: ParticipantNavigationId;
  readonly label: string;
  readonly desktopLabel: string;
  readonly mobileLabel: string;
  readonly href: string;
  readonly active: boolean;
  readonly group: ParticipantNavigationGroup;
}

export interface ParticipantNavigationSubmission {
  readonly id: string;
  readonly status: PortalSubmissionStatus;
}

export interface ParticipantNavigationInput {
  readonly eventId: string;
  readonly participantId: string;
  readonly capabilities: readonly PortalCapability[];
  readonly submissions: readonly ParticipantNavigationSubmission[];
  readonly pathname: string;
  /** Existing query string, including the leading '?', from the current portal URL. */
  readonly eventQuery?: string;
}

export interface ParticipantNavigation {
  readonly primary: readonly ParticipantNavigationItem[];
  readonly secondary: readonly ParticipantNavigationItem[];
  readonly all: readonly ParticipantNavigationItem[];
}

function hasCapability(
  capabilities: readonly PortalCapability[],
  capability: PortalCapability,
): boolean {
  return capabilities.includes(capability);
}

function serializeQuery(query: URLSearchParams): string {
  return [...query.entries()]
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

function hrefFor(path: string, input: ParticipantNavigationInput): string {
  const [basePath, pathQuery] = path.split("?");
  const query = new URLSearchParams(pathQuery ?? "");
  const eventQuery = new URLSearchParams(input.eventQuery?.replace(/^\?/, "") ?? "");
  eventQuery.forEach((value, key) => {
    query.set(key, value);
  });
  if (!query.has("event")) query.set("event", input.eventId);
  query.set("participant", input.participantId);
  return `${basePath}?${serializeQuery(query)}`;
}

function isActive(pathname: string, item: ParticipantNavigationId, pathnameQuery: string): boolean {
  switch (item) {
    case "my-events":
      return pathname === "/portal" && !pathnameQuery;
    case "submissions":
      return pathname === "/portal/submissions" || pathname.startsWith("/portal/submissions/");
    case "tasks":
      return pathname === "/portal/tasks";
    case "profile":
      return pathname === "/portal/profile";
    case "sessions":
      return (
        pathname === "/portal" && (pathnameQuery === "co-speakers" || pathnameQuery === "sessions")
      );
    case "files":
      return pathname === "/portal" && pathnameQuery === "files";
    case "event-guide":
      return pathname === "/portal" && (pathnameQuery === "resources" || pathnameQuery === "wiki");
  }
}

function item(
  id: ParticipantNavigationId,
  label: string,
  path: string,
  group: ParticipantNavigationGroup,
  input: ParticipantNavigationInput,
): ParticipantNavigationItem {
  const query = new URLSearchParams(input.eventQuery?.replace(/^\?/, "") ?? "");
  const workspace = query.get("workspace") ?? "";
  return {
    id,
    label,
    desktopLabel: label,
    mobileLabel: label,
    href: hrefFor(path, input),
    active: isActive(input.pathname, id, workspace),
    group,
  };
}

export function createParticipantNavigation(
  input: ParticipantNavigationInput,
): ParticipantNavigation {
  const [pathname = "", rawPathQuery = ""] = input.pathname.split("?");
  const pathnameQuery = new URLSearchParams(rawPathQuery).get("workspace") ?? "";
  const navigationInput = { ...input, pathname };
  const primary: ParticipantNavigationItem[] = [
    item("my-events", "My events", "/portal", "primary", navigationInput),
  ];
  if (hasCapability(input.capabilities, "submission-edit")) {
    primary.push(
      item("submissions", "Submissions", "/portal/submissions", "primary", navigationInput),
    );
  }
  if (hasCapability(input.capabilities, "task-response")) {
    primary.push(item("tasks", "Tasks", "/portal/tasks", "primary", navigationInput));
  }
  if (hasCapability(input.capabilities, "profile-self")) {
    primary.push(item("profile", "Profile", "/portal/profile", "primary", navigationInput));
  }

  const accepted = input.submissions.some((submission) => submission.status === "accepted");
  const secondary: ParticipantNavigationItem[] = [];
  if (accepted) {
    secondary.push(
      item("sessions", "Sessions", "/portal?workspace=co-speakers", "secondary", navigationInput),
    );
    if (hasCapability(input.capabilities, "asset-read")) {
      secondary.push(
        item("files", "Files", "/portal?workspace=files", "secondary", navigationInput),
      );
    }
    if (hasCapability(input.capabilities, "resource-read")) {
      secondary.push(
        item(
          "event-guide",
          "Event guide",
          "/portal?workspace=resources",
          "secondary",
          navigationInput,
        ),
      );
    }
  }

  for (const navigationItem of [...primary, ...secondary]) {
    (navigationItem as { active: boolean }).active = isActive(
      pathname,
      navigationItem.id,
      pathnameQuery,
    );
  }
  return { primary, secondary, all: [...primary, ...secondary] };
}
