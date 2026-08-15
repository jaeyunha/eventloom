"use client";
import { useOrganizerAssignmentActions } from "./organizer-authoring-assignment-actions";
import { useOrganizerLifecycleActions } from "./organizer-authoring-lifecycle-actions";
import { useOrganizerPlanActions } from "./organizer-authoring-plan-actions";
import { useOrganizerRoundActions } from "./organizer-authoring-round-actions";
import type { OrganizerAuthoringProps } from "./organizer-authoring-state";
import { useOrganizerAuthoringState } from "./organizer-authoring-state";
export function useOrganizerAuthoringController(props: OrganizerAuthoringProps) {
  const state = useOrganizerAuthoringState(props);
  const rounds = useOrganizerRoundActions(state);
  const plan = useOrganizerPlanActions(rounds);
  const assignments = useOrganizerAssignmentActions(plan);
  return useOrganizerLifecycleActions(assignments);
}
export type OrganizerAuthoringController = ReturnType<typeof useOrganizerAuthoringController>;
