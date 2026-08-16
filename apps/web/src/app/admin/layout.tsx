import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminShell } from "@/features/admin/admin-shell";
import { NavigationDataCacheProvider } from "@/lib/navigation-data-cache-provider";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Organizer workspace",
  description: "Run event operations, review submissions, and publish an accessible program.",
};

export default function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <NavigationDataCacheProvider>
      <AdminShell>{children}</AdminShell>
    </NavigationDataCacheProvider>
  );
}
