"use client";

import { createContext, type ReactNode, useContext, useEffect, useRef } from "react";
import { createNavigationDataCache, type NavigationDataCache } from "./navigation-data-cache";

const NavigationDataCacheContext = createContext<NavigationDataCache | null>(null);

export function NavigationDataCacheProvider({ children }: Readonly<{ children: ReactNode }>) {
  const cacheRef = useRef<NavigationDataCache | null>(null);
  const cache = cacheRef.current ?? createNavigationDataCache();
  cacheRef.current = cache;
  useEffect(() => {
    return () => {
      cache.clear();
    };
  }, [cache]);

  return (
    <NavigationDataCacheContext.Provider value={cache}>
      {children}
    </NavigationDataCacheContext.Provider>
  );
}

export function useNavigationDataCache(): NavigationDataCache | null {
  return useContext(NavigationDataCacheContext);
}
