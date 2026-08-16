import { parseAccountSession } from "../account/account-access";
import type { PortalContext } from "../portal/types";
import {
  buildWorkHubModel,
  type WorkHubModel,
  type WorkOrganizationSummary,
} from "./work-hub-model";

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

function organizationsFrom(value: unknown): readonly WorkOrganizationSummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const candidate = item as Record<string, unknown>;
    return typeof candidate.organizationId === "string" && typeof candidate.name === "string"
      ? [
          {
            organizationId: candidate.organizationId,
            name: candidate.name,
          },
        ]
      : [];
  });
}

export async function loadWorkHubModel(
  fetcher: Fetcher = globalThis.fetch,
  signal?: AbortSignal,
  preferredOrganizationId: string | null = null,
): Promise<WorkHubModel | null> {
  const init: RequestInit = {
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json" },
    ...(signal === undefined ? {} : { signal }),
  };
  const sessionResponse = await fetcher("/api/auth/get-session", init);
  if (!sessionResponse.ok) return null;
  const session = parseAccountSession(await jsonOrNull(sessionResponse));
  if (session === null) return null;
  const firstOrganizationId = session.memberships[0]?.organizationId;
  const [organizationResponse, reviewerResponse, portalResponse] = await Promise.all([
    firstOrganizationId === undefined
      ? Promise.resolve(null)
      : fetcher(
          `/api/admin/organizations/${encodeURIComponent(firstOrganizationId)}/members/organizations`,
          init,
        ).catch(() => null),
    fetcher("/api/admin/evaluations/reviewer/workspace", init).catch(() => null),
    fetcher("/api/speaker/portal/contexts", init).catch(() => null),
  ]);
  const organizationPayload = apiData(
    organizationResponse?.ok ? await jsonOrNull(organizationResponse) : [],
  );
  const reviewerPayload = apiData(reviewerResponse?.ok ? await jsonOrNull(reviewerResponse) : null);
  const reviewerRecord =
    typeof reviewerPayload === "object" && reviewerPayload !== null
      ? (reviewerPayload as Record<string, unknown>)
      : null;
  const portalPayload = apiData(portalResponse?.ok ? await jsonOrNull(portalResponse) : []);

  return buildWorkHubModel({
    session,
    organizations: organizationsFrom(organizationPayload),
    reviewerAssignments: Array.isArray(reviewerRecord?.assignments)
      ? reviewerRecord.assignments
      : [],
    portalContexts: Array.isArray(portalPayload) ? (portalPayload as readonly PortalContext[]) : [],
    preferredOrganizationId,
  });
}
