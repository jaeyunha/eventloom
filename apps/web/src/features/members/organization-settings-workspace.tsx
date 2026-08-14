"use client";

import { MemberWorkspace, type MemberWorkspaceProps } from "./member-workspace";

export type OrganizationSettingsWorkspaceProps = Omit<
  MemberWorkspaceProps,
  "eventId" | "roundId" | "view"
>;

/** A route-owned organization settings surface backed by the existing member API boundary. */
export function OrganizationSettingsWorkspace(props: OrganizationSettingsWorkspaceProps) {
  return <MemberWorkspace {...props} view="settings" />;
}
