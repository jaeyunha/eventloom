import type { Metadata } from "next";
import { DeliverablesWorkspace } from "@/features/deliverables/deliverables-workspace";

export const metadata: Metadata = {
  title: "Content requests",
  description:
    "Create speaker file requests, track assignments, and follow up on outstanding content.",
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
