import type { PortalContext } from "../portal/types";

export type AccountCapability = "organizer" | "reviews" | "proposals" | "speaker-tasks";
export type AccountMembershipRole = "owner" | "admin" | "reviewer";

export interface AccountIdentity {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
}

export interface AccountMembership {
  readonly organizationId: string;
  readonly role: AccountMembershipRole;
}

export interface AccountSession {
  readonly identity: AccountIdentity;
  readonly memberships: readonly AccountMembership[];
}

export interface AccountAccess extends AccountSession {
  readonly portalContexts: readonly PortalContext[];
  readonly reviewerAssignmentCount: number;
  readonly capabilities: ReadonlySet<AccountCapability>;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function membershipFrom(value: unknown): AccountMembership | null {
  const candidate = record(value);
  if (candidate === null) return null;
  const organizationId = text(candidate.organizationId ?? candidate.organization_id);
  const role = text(candidate.role);
  if (organizationId === null || (role !== "owner" && role !== "admin" && role !== "reviewer")) {
    return null;
  }
  return { organizationId, role };
}

export function parseAccountSession(value: unknown): AccountSession | null {
  const root = record(value);
  if (root === null || record(root.session) === null) return null;
  const user = record(root.user);
  if (user === null) return null;
  const id = text(user.id);
  const email = text(user.email);
  if (id === null || email === null) return null;

  const membershipsValue = root.memberships ?? user.memberships ?? [];
  if (!Array.isArray(membershipsValue)) return null;
  const memberships = membershipsValue.flatMap((candidate) => {
    const membership = membershipFrom(candidate);
    return membership === null ? [] : [membership];
  });
  const deduplicated = new Map(
    memberships.map((membership) => [
      `${membership.organizationId}:${membership.role}`,
      membership,
    ]),
  );
  return {
    identity: { id, email, name: text(user.name) },
    memberships: [...deduplicated.values()],
  };
}

export function deriveAccountAccess({
  session,
  portalContexts,
  reviewerAssignmentCount,
}: Readonly<{
  session: AccountSession;
  portalContexts: readonly PortalContext[];
  reviewerAssignmentCount: number;
}>): AccountAccess {
  const capabilities = new Set<AccountCapability>();
  if (session.memberships.some(({ role }) => role === "owner" || role === "admin")) {
    capabilities.add("organizer");
  }
  if (reviewerAssignmentCount > 0 || session.memberships.some(({ role }) => role === "reviewer")) {
    capabilities.add("reviews");
  }
  if (portalContexts.some(({ submissionIds }) => submissionIds.length > 0)) {
    capabilities.add("proposals");
  }
  if (
    portalContexts.some(
      ({ capabilities: contextCapabilities, participantIds }) =>
        participantIds.length > 0 && contextCapabilities.includes("task-response"),
    )
  ) {
    capabilities.add("speaker-tasks");
  }
  return {
    ...session,
    portalContexts,
    reviewerAssignmentCount,
    capabilities,
  };
}
