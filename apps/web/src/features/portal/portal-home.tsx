"use client";

import { createParticipantDashboard } from "./participant-dashboard-model";
import { ParticipantEventsDashboard } from "./portal-dashboard";
import { usePortal } from "./portal-provider";
import { PortalContentState } from "./portal-ui";

export function PortalHome() {
  return (
    <PortalContentState>
      <PortalHomeContent />
    </PortalContentState>
  );
}

function PortalHomeContent() {
  const { context, contexts, eventQuery, view } = usePortal();
  if (!view) return null;

  const dashboard = createParticipantDashboard({
    contexts,
    submissions: view.submissions,
    tasks: view.tasks,
    eventQuery,
  });

  return (
    <ParticipantEventsDashboard dashboard={dashboard} selectedContextId={context?.id ?? null} />
  );
}
