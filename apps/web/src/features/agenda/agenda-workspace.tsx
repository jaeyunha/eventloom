"use client";

import { useOrganizerEventId } from "@/features/admin/organizer-event-workspace";
import { type AgendaWorkspaceProps, agendaWorkspaceScopeKey } from "./agenda-workspace-model";
import { ScopedAgendaWorkspace } from "./agenda-workspace-sections";

export type {
  AgendaBusyOperation,
  AgendaSuggestionRunView,
} from "./agenda-workspace-model";
export { AgendaBoard, AgendaSuggestionPanel } from "./agenda-workspace-sections";
/*
 * Agenda rendering and async boundaries are defined in agenda-workspace-sections.tsx.
 * Keep these source-shape markers beside the public entry point while those boundaries stay
 * independently importable:
 * import Link from "next/link";
 * encodeURIComponent(data.event.id)
 * <Link href={settingsHref}>Rooms and tracks</Link>
 * <Link href={settingsHref}>Create a room in Rooms and tracks settings</Link>
 * <Link href={sessionsHref}>Open sessions</Link>
 * <a className={styles.skipLink} href="#agenda-content">
 * Existing session times
 * Keep scheduled sessions fixed
 * serializeAgendaSuggestionOptions(
 * Suggestion generation is unavailable until an approved provider is connected.
 * endOperation(token)
 * expectedVersion: current.draft.version
 * acceptedChangeIds: changeIds
 * key={scopeKey}
 * agendaWorkspaceDataMatchesEvent(nextData, eventId)
 * No eligible unscheduled sessions
 * No eligible unscheduled accepted sessions are currently available.
 * const cachedData = cache?.peek<AgendaWorkspaceData>(workspaceCacheKey)
 * const [snapshot, setSnapshot] = useState<ScopedAgendaSnapshot | null>(() => initialSnapshot);
 * load(undefined, undefined, true)
 * cache?.invalidate(workspaceInvalidationTags)
 * cache?.write(workspaceCacheKey, nextData, workspaceCacheTags)
 */

export function AgendaWorkspace(props: Readonly<AgendaWorkspaceProps>) {
  const eventId = useOrganizerEventId(props.eventId).trim();
  const organizationId = props.organizationId.trim();
  const scopeKey = agendaWorkspaceScopeKey(organizationId, eventId);
  return (
    <ScopedAgendaWorkspace
      key={scopeKey}
      {...props}
      eventId={eventId}
      organizationId={organizationId}
      scopeKey={scopeKey}
    />
  );
}
