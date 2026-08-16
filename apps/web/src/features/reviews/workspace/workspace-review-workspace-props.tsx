import type { MemberApi } from "../../members/api";
import type { ReviewWorkspaceInitialState } from "./workspace-review-workspace-initial-state";
import type { ReviewWorkspaceMode } from "./workspace-review-workspace-mode";

export interface ReviewWorkspaceProps {
  assignmentId?: string;
  eventId?: string;
  initialSelectedAssignmentId?: string;
  mode?: ReviewWorkspaceMode;
  initialState?: ReviewWorkspaceInitialState;
  organizationId?: string | undefined;
  memberApi?: MemberApi;
}
