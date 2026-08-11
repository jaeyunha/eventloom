import type { Metadata } from "next";
import { ReportsWorkspace } from "@/features/reports/reports-workspace";

export const metadata: Metadata = {
  title: "Reports workspace",
  description: "Create, run, and audit event-scoped program reports.",
};

interface ReportsPageProps {
  params: Promise<{ organizationId: string; eventId: string }>;
}

export default async function ReportsPage({ params }: ReportsPageProps) {
  const { organizationId, eventId } = await params;
  return <ReportsWorkspace organizationId={organizationId} eventId={eventId} />;
}
