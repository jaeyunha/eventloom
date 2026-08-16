"use client";

import { useOrganizerEventId } from "@/features/admin/organizer-event-workspace";
import { SpeakerWorkspaceController } from "./speaker-workspace-controller";
import type { SpeakerWorkspaceProps } from "./speaker-workspace-types";

export function SpeakerWorkspace({
  organizationId,
  eventId: fallbackEventId,
  api,
}: SpeakerWorkspaceProps) {
  const eventId = useOrganizerEventId(fallbackEventId);
  return (
    <SpeakerWorkspaceController
      organizationId={organizationId}
      eventId={eventId}
      {...(api === undefined ? {} : { api })}
    />
  );
}
