import type { Metadata } from "next";
import { DeliverablesWorkspace } from "@/features/deliverables/deliverables-workspace";

export const metadata: Metadata = {
  title: "Deliverables",
  description:
    "Organizer-created speaker requests, task tracking, and follow-up for event deliverables.",
};

interface DeliverablesPageProps {
  params: Promise<{ organizationId: string; eventId: string }>;
}

export default async function DeliverablesPage({ params }: DeliverablesPageProps) {
  const { organizationId, eventId } = await params;
  return (
    <div data-deliverables-route>
      <DeliverablesWorkspace
        organizationId={organizationId}
        eventId={eventId}
        mode="deliverables"
      />
    </div>
  );
}
