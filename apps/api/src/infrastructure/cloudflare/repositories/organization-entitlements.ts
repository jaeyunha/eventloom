import { type OrganizationEntitlement, organizationEntitlementSchema } from "@eventloom/contracts";
import type { OrganizationEntitlementRepository } from "../../../features/organizations/policy";

interface OrganizationEntitlementRow {
  readonly organization_id: string;
  readonly schema_version: number;
  readonly revision: number;
  readonly state: string;
  readonly capabilities_json: string;
  readonly active_event_limit: number | null;
  readonly not_before: string;
  readonly expires_at: string | null;
}

function entitlementFromRow(row: OrganizationEntitlementRow): OrganizationEntitlement {
  return organizationEntitlementSchema.parse({
    schemaVersion: row.schema_version,
    organizationId: row.organization_id,
    revision: row.revision,
    state: row.state,
    capabilities: JSON.parse(row.capabilities_json),
    limits: {
      activeEvents: row.active_event_limit,
    },
    notBefore: row.not_before,
    expiresAt: row.expires_at,
  });
}

export class D1OrganizationEntitlementRepository implements OrganizationEntitlementRepository {
  constructor(private readonly database: D1Database) {}

  async getEntitlement(organizationId: string): Promise<OrganizationEntitlement | null> {
    const row = await this.database
      .prepare(
        `SELECT organization_id, schema_version, revision, state, capabilities_json,
                active_event_limit, not_before, expires_at
           FROM organization_entitlements
          WHERE organization_id = ?
          LIMIT 1`,
      )
      .bind(organizationId)
      .first<OrganizationEntitlementRow>();
    return row === null ? null : entitlementFromRow(row);
  }
}
