import { redirect } from "next/navigation";
import { PortalHome } from "@/features/portal/portal-home";
import { PortalWorkspace, type PortalWorkspaceSection } from "@/features/portal/portal-workspace";

const workspaceSections = new Set<PortalWorkspaceSection>([
  "co-speakers",
  "files",
  "resources",
  "wiki",
]);

export default async function SpeakerPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string | string[]; event?: string | string[] }>;
}) {
  const query = await searchParams;
  const requested = Array.isArray(query.workspace) ? query.workspace[0] : query.workspace;
  if (requested === "tasks") {
    const event = Array.isArray(query.event) ? query.event[0] : query.event;
    redirect(event ? `/portal/tasks?event=${encodeURIComponent(event)}` : "/portal/tasks");
  }
  const requestedSection = requested === "sessions" ? "co-speakers" : requested;
  if (
    requestedSection !== undefined &&
    workspaceSections.has(requestedSection as PortalWorkspaceSection)
  ) {
    return <PortalWorkspace section={requestedSection as PortalWorkspaceSection} />;
  }
  return <PortalHome />;
}
