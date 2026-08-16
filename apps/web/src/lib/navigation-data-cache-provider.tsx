"use client";

import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { createNavigationDataCache, type NavigationDataCache } from "./navigation-data-cache";

const NavigationDataCacheContext = createContext<NavigationDataCache | null>(null);

export function NavigationDataCacheProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [cache] = useState<NavigationDataCache>(() => createNavigationDataCache());
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
