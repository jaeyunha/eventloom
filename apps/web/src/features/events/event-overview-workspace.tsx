"use client";

import { Clock3, FileText } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  WorkspaceBreadcrumb,
  WorkspaceHeader,
  WorkspaceSurface,
} from "@/components/workspace/workspace-ui";
import { EventOverviewContent } from "./event-overview-content";
import {
  type EventOverviewData,
  loadEventOverviewData,
  loadEventOverviewName,
} from "./event-overview-data";
import styles from "./event-overview-workspace.module.css";

interface EventOverviewWorkspaceProps {
  readonly organizationId: string;
  readonly eventId: string;
}

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly data: EventOverviewData }
  | { readonly status: "error"; readonly message: string };

export { loadEventOverviewData, loadEventOverviewName };

export function EventOverviewWorkspace({ organizationId, eventId }: EventOverviewWorkspaceProps) {
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    void reloadToken;
    const controller = new AbortController();
    setState({ status: "loading" });
    void loadEventOverviewData(organizationId, eventId, controller.signal)
      .then((data) => setState({ status: "ready", data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Event overview could not be loaded.",
        });
      });
    return () => controller.abort();
  }, [eventId, organizationId, reloadToken]);

  if (state.status === "ready") {
    return (
      <div className={styles.workspace}>
        <EventOverviewContent data={state.data} eventId={eventId} organizationId={organizationId} />
      </div>
    );
  }

  const eventName = state.status === "loading" ? "Loading event" : "Selected event";

  return (
    <div className={styles.workspace}>
      <WorkspaceHeader
        breadcrumb={
          <WorkspaceBreadcrumb>
            <Link href="/admin/events">Events</Link>
            <span>/</span>
            <span>{eventName}</span>
          </WorkspaceBreadcrumb>
        }
        description="Monitor the selected event using live submission and agenda data."
        eyebrow="Event workspace"
        title={eventName}
      />
      <WorkspaceSurface className={styles.loadState}>
        {state.status === "loading" ? (
          <>
            <Clock3 aria-hidden="true" size={20} />
            <h2>Loading event overview</h2>
            <p>Fetching the selected event, submission metrics, and agenda state.</p>
          </>
        ) : (
          <>
            <FileText aria-hidden="true" size={20} />
            <h2>Unable to load event overview</h2>
            <p>{state.message}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReloadToken((value) => value + 1)}
            >
              Retry
            </Button>
          </>
        )}
      </WorkspaceSurface>
    </div>
  );
}
