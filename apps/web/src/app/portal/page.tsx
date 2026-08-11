import { PortalHome } from "@/features/portal/portal-home";
import {
  PortalWorkspace,
  type PortalWorkspaceSection,
} from "@/features/portal/portal-workspace";

const workspaceSections = new Set<PortalWorkspaceSection>([
  "co-speakers",
  "files",
  "tasks",
  "resources",
  "wiki",
]);

export default async function SpeakerPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string | string[] }>;
}) {
  const query = await searchParams;
  const requested = Array.isArray(query.workspace) ? query.workspace[0] : query.workspace;
  if (requested !== undefined && workspaceSections.has(requested as PortalWorkspaceSection)) {
    return <PortalWorkspace section={requested as PortalWorkspaceSection} />;
  }
  return <PortalHome />;
}
