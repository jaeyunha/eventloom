import { describe, expect, it } from "vitest";
import { matchesOrganizationScope, resolveOrganizationScope } from "./organization-scope";

describe("resolveOrganizationScope", () => {
  it("resolves the canonical organizationId", () => {
    expect(resolveOrganizationScope({ organizationId: "org-1" })).toEqual({
      status: "resolved",
      organizationId: "org-1",
    });
  });

  it("resolves a legacy tenantId when organizationId is absent", () => {
    expect(resolveOrganizationScope({ tenantId: "tenant-1" })).toEqual({
      status: "resolved",
      organizationId: "tenant-1",
    });
  });

  it("accepts equal aliases", () => {
    expect(resolveOrganizationScope({ organizationId: "org-1", tenantId: "org-1" })).toEqual({
      status: "resolved",
      organizationId: "org-1",
    });
  });

  it("normalizes surrounding whitespace before resolving", () => {
    expect(
      resolveOrganizationScope({ organizationId: "  org-1  ", tenantId: "\torg-1\n" }),
    ).toEqual({
      status: "resolved",
      organizationId: "org-1",
    });
  });

  it("treats missing and invalid values as missing", () => {
    expect(resolveOrganizationScope({})).toEqual({ status: "missing" });
    expect(resolveOrganizationScope({ organizationId: "   ", tenantId: null })).toEqual({
      status: "missing",
    });
    expect(resolveOrganizationScope({ organizationId: 42, tenantId: false })).toEqual({
      status: "missing",
    });
  });

  it("reports contradictory non-empty aliases as a conflict", () => {
    expect(resolveOrganizationScope({ organizationId: " org-1 ", tenantId: "tenant-1" })).toEqual({
      status: "conflict",
      organizationId: "org-1",
      tenantId: "tenant-1",
    });
  });

  it("keeps conflicts distinguishable from missing scope", () => {
    const conflict = resolveOrganizationScope({ organizationId: "org-1", tenantId: "tenant-2" });
    const missing = resolveOrganizationScope({ organizationId: " ", tenantId: undefined });

    expect(conflict.status).toBe("conflict");
    expect(missing.status).toBe("missing");
    expect(conflict.status).not.toBe(missing.status);
  });

  it("allows only genuinely missing scope through an explicit fallback", () => {
    expect(matchesOrganizationScope({}, "org-1", true)).toBe(true);
    expect(
      matchesOrganizationScope({ organizationId: "org-1", tenantId: "org-2" }, "org-1", true),
    ).toBe(false);
    expect(matchesOrganizationScope({ organizationId: "org-1" }, "org-1", true)).toBe(true);
    expect(matchesOrganizationScope({ organizationId: "org-2" }, "org-1", true)).toBe(false);
  });
});
