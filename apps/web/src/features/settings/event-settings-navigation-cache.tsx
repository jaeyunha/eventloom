"use client";

import { createContext, type ReactNode, useContext, useRef } from "react";
import type { EventIdentity } from "./api";
import type { EventSettingsWorkspaceState } from "./event-settings-workspace";

export const EVENT_SETTINGS_NAVIGATION_CACHE_TTL_MS = 60_000;

export interface EventSettingsNavigationCacheScope {
  readonly organizationId: string;
  readonly eventId: string;
}

export interface EventSettingsNavigationCacheSnapshot {
  readonly state: EventSettingsWorkspaceState;
  readonly eventIdentity?: EventIdentity;
}

export interface EventSettingsNavigationCacheOptions {
  readonly now?: () => number;
  readonly ttlMs?: number;
}

export interface EventSettingsNavigationCache {
  get(scope: EventSettingsNavigationCacheScope): EventSettingsNavigationCacheSnapshot | undefined;
  set(
    scope: EventSettingsNavigationCacheScope,
    snapshot: EventSettingsNavigationCacheSnapshot,
  ): void;
  invalidate(scope: EventSettingsNavigationCacheScope): void;
  clear(): void;
}

type CachedSnapshot = {
  readonly snapshot: EventSettingsNavigationCacheSnapshot;
  readonly expiresAt: number;
};

export function eventSettingsNavigationScopeKey(organizationId: string, eventId: string): string {
  return `${organizationId.trim()}\u0000${eventId.trim()}`;
}

export function isCompleteEventSettingsNavigationCacheSnapshot(
  snapshot: EventSettingsNavigationCacheSnapshot | undefined,
): boolean {
  return (
    snapshot?.state.status === "loaded" &&
    snapshot.state.detailsStatus === "loaded" &&
    snapshot.eventIdentity !== undefined
  );
}

export function createEventSettingsNavigationCache(
  options: EventSettingsNavigationCacheOptions = {},
): EventSettingsNavigationCache {
  const entries = new Map<string, CachedSnapshot>();
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? EVENT_SETTINGS_NAVIGATION_CACHE_TTL_MS;

  return {
    get(scope) {
      const key = eventSettingsNavigationScopeKey(scope.organizationId, scope.eventId);
      const entry = entries.get(key);
      if (entry === undefined) return undefined;
      if (entry.expiresAt <= now()) {
        entries.delete(key);
        return undefined;
      }
      return entry.snapshot;
    },
    set(scope, snapshot) {
      const key = eventSettingsNavigationScopeKey(scope.organizationId, scope.eventId);
      entries.set(key, { snapshot, expiresAt: now() + ttlMs });
    },
    invalidate(scope) {
      entries.delete(eventSettingsNavigationScopeKey(scope.organizationId, scope.eventId));
    },
    clear() {
      entries.clear();
    },
  };
}

const EventSettingsNavigationCacheContext = createContext<EventSettingsNavigationCache | null>(
  null,
);

export function EventSettingsNavigationCacheProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const cacheRef = useRef<EventSettingsNavigationCache | null>(null);
  cacheRef.current ??= createEventSettingsNavigationCache();
  return (
    <EventSettingsNavigationCacheContext.Provider value={cacheRef.current}>
      {children}
    </EventSettingsNavigationCacheContext.Provider>
  );
}

export function useEventSettingsNavigationCache(): EventSettingsNavigationCache | null {
  return useContext(EventSettingsNavigationCacheContext);
}
