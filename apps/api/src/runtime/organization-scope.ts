export type OrganizationScopeResult =
  | {
      readonly status: "resolved";
      readonly organizationId: string;
    }
  | {
      readonly status: "missing";
    }
  | {
      readonly status: "conflict";
      readonly organizationId: string;
      readonly tenantId: string;
    };

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}

export function resolveOrganizationScope(value: unknown): OrganizationScopeResult {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { status: "missing" };
  }

  const record = value as Record<string, unknown>;
  const organizationId = nonEmptyString(record.organizationId);
  const tenantId = nonEmptyString(record.tenantId);
  if (organizationId !== undefined && tenantId !== undefined && organizationId !== tenantId) {
    return { status: "conflict", organizationId, tenantId };
  }
  if (organizationId !== undefined) {
    return { status: "resolved", organizationId };
  }
  if (tenantId !== undefined) {
    return { status: "resolved", organizationId: tenantId };
  }
  return { status: "missing" };
}

export function resolvedOrganizationId(value: unknown): string | undefined {
  const result = resolveOrganizationScope(value);
  return result.status === "resolved" ? result.organizationId : undefined;
}

export function matchesOrganizationScope(
  value: unknown,
  organizationId: string,
  allowMissing = false,
): boolean {
  const result = resolveOrganizationScope(value);
  if (result.status === "resolved") return result.organizationId === organizationId;
  return allowMissing && result.status === "missing";
}
