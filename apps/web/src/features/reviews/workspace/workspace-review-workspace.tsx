"use client";

import { useOrganizerEventId } from "@/features/admin/organizer-event-workspace";
import { useReviewWorkspaceController } from "./workspace-review-controller";
import { ReviewWorkspaceDispatcher } from "./workspace-review-dispatcher";
import type { ReviewWorkspaceProps } from "./workspace-review-workspace-props";

export function ReviewWorkspace(props: ReviewWorkspaceProps) {
  const eventId = useOrganizerEventId(props.eventId);
  return <ReviewWorkspaceDispatcher controller={useReviewWorkspaceController(props, eventId)} />;
}
