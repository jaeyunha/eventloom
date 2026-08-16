"use client";

import { createContext, type ReactNode, useContext, useRef } from "react";
import { createCfpStartupStore, type CfpStartupStore } from "./cfp-startup-store";

const CfpStartupContext = createContext<CfpStartupStore | null>(null);

export function CfpStartupProvider({ children }: Readonly<{ children: ReactNode }>) {
  const storeRef = useRef<CfpStartupStore | null>(null);
  storeRef.current ??= createCfpStartupStore();
  return (
    <CfpStartupContext.Provider value={storeRef.current}>{children}</CfpStartupContext.Provider>
  );
}

export function useCfpStartupStore(): CfpStartupStore {
  const context = useContext(CfpStartupContext);
  const fallbackRef = useRef<CfpStartupStore | null>(null);
  fallbackRef.current ??= createCfpStartupStore();
  return context ?? fallbackRef.current;
}
