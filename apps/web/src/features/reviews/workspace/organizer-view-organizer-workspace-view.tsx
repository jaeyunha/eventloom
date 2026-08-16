"use client";
import type { OrganizerWorkspaceViewProps } from "./organizer-view-controller";
import { useOrganizerWorkspaceViewController } from "./organizer-view-controller";
import { OrganizerWorkspaceSurface } from "./organizer-view-workspace";
export function OrganizerWorkspaceView(props: Readonly<OrganizerWorkspaceViewProps>) {
  return <OrganizerWorkspaceSurface controller={useOrganizerWorkspaceViewController(props)} />;
}
