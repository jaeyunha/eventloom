import type { ReactNode } from "react";
import { EventSettingsNavigationCacheProvider } from "@/features/settings/event-settings-navigation-cache";

interface EventSettingsLayoutProps {
  readonly children: ReactNode;
}

export default function EventSettingsLayout({ children }: EventSettingsLayoutProps) {
  return <EventSettingsNavigationCacheProvider>{children}</EventSettingsNavigationCacheProvider>;
}
