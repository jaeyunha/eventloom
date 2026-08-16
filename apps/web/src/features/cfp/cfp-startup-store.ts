import type { CfpApi, CfpAuthenticatedSession, PublishedCfp } from "./api";

export interface CfpStartupIdentity {
  readonly organizationId: string;
  readonly eventId: string;
  readonly formId?: string;
}

export interface CachedCfpStartup {
  readonly published: Promise<PublishedCfp>;
  readonly session: Promise<CfpAuthenticatedSession | null>;
}

export interface CfpStartupStore {
  load(
    api: Pick<CfpApi, "getPublished" | "getSession">,
    identity: CfpStartupIdentity,
  ): CachedCfpStartup;
  updateSession(identity: CfpStartupIdentity, session: CfpAuthenticatedSession): void;
}

function cacheKey(identity: CfpStartupIdentity): string {
  return JSON.stringify([identity.organizationId, identity.eventId, identity.formId ?? null]);
}

export function createCfpStartupStore(): CfpStartupStore {
  const cache = new Map<string, CachedCfpStartup>();
  return {
    load(api, identity) {
      const key = cacheKey(identity);
      const existing = cache.get(key);
      if (existing !== undefined) return existing;
      const published = api.getPublished(identity).catch((error: unknown) => {
        cache.delete(key);
        throw error;
      });
      const session =
        typeof api.getSession === "function"
          ? api.getSession().catch(() => null)
          : Promise.resolve(null);
      const startup = { published, session };
      cache.set(key, startup);
      return startup;
    },
    updateSession(identity, session) {
      const key = cacheKey(identity);
      const existing = cache.get(key);
      if (existing !== undefined) {
        cache.set(key, { ...existing, session: Promise.resolve(session) });
      }
    },
  };
}
