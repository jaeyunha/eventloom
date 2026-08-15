"use client";
import { useOrganizerAuthoringController } from "./organizer-authoring-controller";
import type { OrganizerAuthoringProps } from "./organizer-authoring-state";
import { OrganizerAuthoringView } from "./organizer-authoring-view";
export function OrganizerAuthoring(props: Readonly<OrganizerAuthoringProps>) {
  return <OrganizerAuthoringView controller={useOrganizerAuthoringController(props)} />;
}
