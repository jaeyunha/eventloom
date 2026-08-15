"use client";

import { createContext, type ReactNode, useContext } from "react";
import type { OrganizerEventRouteIdentity } from "./organizer-event-route";

export interface OrganizerEventWorkspaceIdentity extends OrganizerEventRouteIdentity {
  readonly organizationId: string;
}

const OrganizerEventWorkspaceContext = createContext<OrganizerEventWorkspaceIdentity | null>(null);

interface OrganizerEventWorkspaceProviderProps {
  readonly children?: ReactNode;
  readonly event: OrganizerEventRouteIdentity | null;
  readonly organizationId: string;
}

export function OrganizerEventWorkspaceProvider({
  children,
  event,
  organizationId,
}: OrganizerEventWorkspaceProviderProps) {
  const value =
    event === null
      ? null
      : {
          ...event,
          organizationId,
        };
  return (
    <OrganizerEventWorkspaceContext.Provider value={value}>
      {children}
    </OrganizerEventWorkspaceContext.Provider>
  );
}

export function useOrganizerEventWorkspace(): OrganizerEventWorkspaceIdentity | null {
  return useContext(OrganizerEventWorkspaceContext);
}

export function useOrganizerEventId(fallbackEventId: string): string;
export function useOrganizerEventId(fallbackEventId: undefined): string | undefined;
export function useOrganizerEventId(fallbackEventId: string | undefined): string | undefined;
export function useOrganizerEventId(fallbackEventId: string | undefined): string | undefined {
  return useOrganizerEventWorkspace()?.id ?? fallbackEventId;
}

export function useOrganizerEventSlug(fallbackEventReference: string): string {
  return useOrganizerEventWorkspace()?.slug ?? fallbackEventReference;
}
