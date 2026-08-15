"use client";

import { useOrganizerEventId } from "@/features/admin/organizer-event-workspace";
import { SpeakerWorkspaceController } from "./speaker-workspace-controller";
import type { SpeakerWorkspaceProps } from "./speaker-workspace-types";

export * from "./speaker-assets";
export * from "./speaker-data-logic";
export * from "./speaker-headshot-logic";
export * from "./speaker-invitations";
export * from "./speaker-roster-logic";
export * from "./speaker-task-logic";
export * from "./speaker-workspace-types";

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
