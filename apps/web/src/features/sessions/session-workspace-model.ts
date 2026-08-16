import type { NavigationDataCache } from "@/lib/navigation-data-cache";
import type { SessionRecord, SessionSpeakerCandidate, SessionsApi } from "./api";

export interface SessionsWorkspaceCacheBundle {
  readonly sessions: readonly SessionRecord[];
  readonly speakers: readonly SessionSpeakerCandidate[];
}

export function sessionsWorkspaceCacheKey(organizationId: string, eventId: string): string {
  return `sessions:workspace:${organizationId.trim()}:${eventId.trim()}`;
}

export function sessionsWorkspaceCacheTags(
  organizationId: string,
  eventId: string,
): readonly string[] {
  const normalizedOrganizationId = organizationId.trim();
  const normalizedEventId = eventId.trim();
  return [
    `organization:${normalizedOrganizationId}`,
    `event:${normalizedEventId}`,
    `sessions:${normalizedEventId}`,
  ];
}

function abortedError(): DOMException {
  return new DOMException("The session request was aborted.", "AbortError");
}

export async function loadSessionsWorkspaceBundle(
  api: SessionsApi,
  cache: NavigationDataCache | null,
  key: string,
  tags: readonly string[],
  signal?: AbortSignal,
  fresh = false,
): Promise<SessionsWorkspaceCacheBundle> {
  const load = async (): Promise<SessionsWorkspaceCacheBundle> => {
    const sessionsRequest = cache === null ? api.list(signal) : api.list();
    const speakersRequest = cache === null ? api.listSpeakers(signal) : api.listSpeakers();
    const [sessions, speakers] = await Promise.all([sessionsRequest, speakersRequest]);
    if (cache === null && signal?.aborted) throw abortedError();
    return { sessions, speakers };
  };
  if (cache === null) return load();
  return cache.read({ key, tags, load, fresh });
}
