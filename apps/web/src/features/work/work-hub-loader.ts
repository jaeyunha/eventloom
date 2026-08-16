import { parseAccountSession } from "../account/account-access";
import type { PortalContext } from "../portal/types";
import { parseWorkEventInvitations } from "./work-event-invitation-model";
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

function reviewerAssignmentsFrom(value: unknown): readonly unknown[] {
  if (typeof value !== "object" || value === null) return [];
  const reviewerWorkspace = value as Record<string, unknown>;
  if (!Array.isArray(reviewerWorkspace.organizations)) return [];
  return reviewerWorkspace.organizations.flatMap((organization) => {
    if (typeof organization !== "object" || organization === null) return [];
    const group = organization as Record<string, unknown>;
    const organizationValue =
      typeof group.organization === "object" && group.organization !== null
        ? (group.organization as Record<string, unknown>)
        : null;
    const organizationId = organizationValue?.id;
    const organizationName = organizationValue?.name;
    if (typeof organizationId !== "string" || typeof organizationName !== "string") return [];
    if (!Array.isArray(group.assignments)) return [];
    return group.assignments.map((assignment) => {
      if (typeof assignment !== "object" || assignment === null) return assignment;
      const candidate = assignment as Record<string, unknown>;
      const plan =
        typeof candidate.plan === "object" && candidate.plan !== null
          ? (candidate.plan as Record<string, unknown>)
          : {};
      return {
        ...candidate,
        plan: {
          ...plan,
          organizationId,
          organizationName,
        },
      };
    });
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
  const [organizationResponse, reviewerResponse, portalResponse, invitationResponse] =
    await Promise.all([
      firstOrganizationId === undefined
        ? Promise.resolve(null)
        : fetcher(
            `/api/admin/organizations/${encodeURIComponent(firstOrganizationId)}/members/organizations`,
            init,
          ).catch(() => null),
      fetcher("/api/account/reviewer-workspace", init).catch(() => null),
      fetcher("/api/speaker/portal/contexts", init).catch(() => null),
      fetcher("/api/account/event-invitations", init).catch(() => null),
    ]);
  const organizationPayload = apiData(
    organizationResponse?.ok ? await jsonOrNull(organizationResponse) : [],
  );
  const reviewerPayload = apiData(reviewerResponse?.ok ? await jsonOrNull(reviewerResponse) : null);
  const portalPayload = apiData(portalResponse?.ok ? await jsonOrNull(portalResponse) : []);
  const invitationPayload = invitationResponse?.ok ? await jsonOrNull(invitationResponse) : [];

  return {
    ...buildWorkHubModel({
      session,
      organizations: organizationsFrom(organizationPayload),
      reviewerAssignments: reviewerAssignmentsFrom(reviewerPayload),
      portalContexts: Array.isArray(portalPayload)
        ? (portalPayload as readonly PortalContext[])
        : [],
      preferredOrganizationId,
    }),
    invitations: parseWorkEventInvitations(invitationPayload),
  };
}
