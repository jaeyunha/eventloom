import type { Metadata } from "next";
import { AgendaWorkspace } from "../../../../../features/agenda/agenda-workspace";

export const metadata: Metadata = {
  title: "Agenda workspace",
  description: "Build, validate, and publish a conflict-safe event agenda.",
};

interface AgendaPageProps {
  params: Promise<{ eventId: string }>;
}

export default async function AgendaPage({ params }: AgendaPageProps) {
  const { eventId } = await params;
  return <AgendaWorkspace eventId={eventId} />;
}
