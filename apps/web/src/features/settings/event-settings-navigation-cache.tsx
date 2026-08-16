"use client";

import { createContext, type ReactNode, useContext, useRef } from "react";
import {
  createEventSettingsNavigationCache,
  type EventSettingsNavigationCache,
} from "./event-settings-navigation-cache-model";

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
