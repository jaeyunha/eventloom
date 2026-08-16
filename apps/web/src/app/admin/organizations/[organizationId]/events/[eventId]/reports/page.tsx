import type { Metadata } from "next";
import { ReportsWorkspace } from "@/features/reports/reports-workspace";

export const metadata: Metadata = {
  title: "Reports & exports",
  description: "Download common event data or save reusable event-scoped exports.",
};

interface ReportsPageProps {
  params: Promise<{ organizationId: string; eventId: string }>;
}

export default async function ReportsPage({ params }: ReportsPageProps) {
  const { organizationId, eventId } = await params;
  return <ReportsWorkspace organizationId={organizationId} eventId={eventId} />;
}
