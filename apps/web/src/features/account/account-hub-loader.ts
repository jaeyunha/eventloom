import type { PortalContext } from "../portal/types";
import {
  type AccountAccess,
  deriveAccountAccess,
  parseAccountSession,
} from "./account-access";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

async function jsonOrNull(response: Response): Promise<unknown> {
  return response.headers.get("content-type")?.includes("application/json")
    ? response.json()
    : null;
}

function apiData(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  return "data" in value ? value.data : value;
}

export async function loadAccountAccess(
  fetcher: Fetcher = globalThis.fetch,
  signal?: AbortSignal,
): Promise<AccountAccess | null> {
  const init: RequestInit = {
    credentials: "include",
    headers: { Accept: "application/json" },
    cache: "no-store",
    ...(signal === undefined ? {} : { signal }),
  };
  const sessionResponse = await fetcher("/api/auth/get-session", init);
  if (!sessionResponse.ok) return null;
  const session = parseAccountSession(await jsonOrNull(sessionResponse));
  if (session === null) return null;

  const [portalResponse, reviewerResponse] = await Promise.all([
    fetcher("/api/speaker/portal/contexts", init).catch(() => null),
    fetcher("/api/admin/evaluations/reviewer/workspace", init).catch(() => null),
  ]);
  const portalPayload = apiData(portalResponse?.ok ? await jsonOrNull(portalResponse) : []);
  const portalContexts = Array.isArray(portalPayload)
    ? (portalPayload as readonly PortalContext[])
    : [];
  const reviewerPayload = apiData(reviewerResponse?.ok ? await jsonOrNull(reviewerResponse) : null);
  const reviewerRecord =
    typeof reviewerPayload === "object" && reviewerPayload !== null
      ? (reviewerPayload as Record<string, unknown>)
      : null;
  const reviewerAssignmentCount = Array.isArray(reviewerRecord?.assignments)
    ? reviewerRecord.assignments.length
    : 0;

  return deriveAccountAccess({ session, portalContexts, reviewerAssignmentCount });
}
