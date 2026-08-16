"use client";

import type { CrmAnalytics, CrmApi, CrmContact, CrmEvent, CrmSegment } from "./crm-workspace-model";
import {
  type CrmWorkspaceControllerProps,
  CrmWorkspaceView,
  type CrmWorkspaceViewProps,
  useCrmWorkspaceController,
} from "./crm-workspace-views";

export type { CrmWorkspaceViewProps } from "./crm-workspace-views";
export { CrmWorkspaceView } from "./crm-workspace-views";

export interface CrmWorkspaceProps {
  readonly organizationId: string;
  readonly api?: CrmApi;
  readonly initialContacts?: readonly CrmContact[];
  readonly initialSegments?: readonly CrmSegment[];
  readonly initialEvents?: readonly CrmEvent[];
  readonly initialAnalytics?: CrmAnalytics | null;
}

export function CrmWorkspace(props: CrmWorkspaceProps) {
  const viewProps: CrmWorkspaceViewProps = useCrmWorkspaceController(
    props satisfies CrmWorkspaceControllerProps,
  );
  return <CrmWorkspaceView {...viewProps} />;
}
