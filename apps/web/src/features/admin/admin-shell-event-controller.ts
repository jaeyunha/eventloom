import { RedirectType, redirect, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { OrganizerEventContext } from "./admin-navigation";
import { fetchOrganizerEventWorkspace } from "./admin-shell-event";
import {
  canonicalOrganizerEventHref,
  type OrganizerEventRouteIdentity,
} from "./organizer-event-route";

export type EventWorkspaceResolution =
  | { readonly eventReference: string; readonly status: "loading" }
  | {
      readonly event: OrganizerEventRouteIdentity;
      readonly eventReference: string;
      readonly status: "resolved";
    }
  | { readonly eventReference: string; readonly status: "unavailable" };

export interface OrganizerEventState {
  readonly currentEvent: OrganizerEventRouteIdentity | null;
  readonly currentEventName: string | null;
  readonly currentEventResolution: EventWorkspaceResolution | null;
}

export function useOrganizerEvent(
  pathname: string,
  eventContext: OrganizerEventContext | null,
): OrganizerEventState {
  const searchParams = useSearchParams();
  const organizationId = eventContext?.organizationId ?? null;
  const eventId = eventContext?.eventId ?? null;
  const [resolution, setResolution] = useState<EventWorkspaceResolution | null>(null);
  const currentEventResolution = resolution?.eventReference === eventId ? resolution : null;
  const currentEvent =
    currentEventResolution?.status === "resolved" ? currentEventResolution.event : null;
  const canonicalHref =
    eventContext === null || currentEvent === null
      ? null
      : canonicalOrganizerEventHref(
          pathname,
          searchParams.toString(),
          eventContext.organizationId,
          eventContext.eventId,
          currentEvent,
        );

  useEffect(() => {
    if (organizationId === null || eventId === null) {
      setResolution(null);
      return;
    }
    const controller = new AbortController();
    setResolution({ eventReference: eventId, status: "loading" });
    void fetchOrganizerEventWorkspace("", organizationId, eventId, (input, init) =>
      fetch(input, { ...init, signal: controller.signal }),
    )
      .then((event) => {
        if (controller.signal.aborted) return;
        setResolution(
          event === null
            ? { eventReference: eventId, status: "unavailable" }
            : { event, eventReference: eventId, status: "resolved" },
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!controller.signal.aborted) {
          setResolution({ eventReference: eventId, status: "unavailable" });
        }
      });
    return () => controller.abort();
  }, [eventId, organizationId]);
  if (canonicalHref !== null) {
    redirect(canonicalHref, RedirectType.replace);
  }

  return {
    currentEvent,
    currentEventName: currentEvent?.name ?? null,
    currentEventResolution,
  };
}
