import type { ReactNode } from "react";
import { CfpStartupProvider } from "@/features/cfp/cfp-startup-provider";

export default function ScopedCfpLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <CfpStartupProvider>{children}</CfpStartupProvider>;
}
