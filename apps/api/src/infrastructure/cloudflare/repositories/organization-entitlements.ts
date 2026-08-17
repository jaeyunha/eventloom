import { type OrganizationEntitlement, organizationEntitlementSchema } from "@eventloom/contracts";
import {
  OrganizationEntitlementConflictError,
  type OrganizationEntitlementAudit,
  type OrganizationEntitlementCommandRepository,
} from "../../../features/organizations/policy";
import { guard } from "./shared";

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

export class D1OrganizationEntitlementRepository
  implements OrganizationEntitlementCommandRepository
{
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

  async putEntitlement(
    entitlement: OrganizationEntitlement,
    audit: OrganizationEntitlementAudit,
  ): Promise<OrganizationEntitlement> {
    const parsed = organizationEntitlementSchema.parse(entitlement);
    const capabilitiesJson = JSON.stringify(parsed.capabilities);
    try {
      await this.database.batch([
        this.database
          .prepare(
            `INSERT INTO organization_entitlements (
               organization_id, schema_version, revision, state, capabilities_json,
               active_event_limit, not_before, expires_at, created_at, updated_at
             )
             SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
             WHERE ? = 0
                OR EXISTS (
                  SELECT 1
                  FROM organization_entitlements
                  WHERE organization_id = ?
                    AND revision = ?
                )
             ON CONFLICT(organization_id) DO UPDATE SET
               schema_version = excluded.schema_version,
               revision = excluded.revision,
               state = excluded.state,
               capabilities_json = excluded.capabilities_json,
               active_event_limit = excluded.active_event_limit,
               not_before = excluded.not_before,
               expires_at = excluded.expires_at,
               updated_at = excluded.updated_at
             WHERE organization_entitlements.revision = ?
               AND excluded.revision > organization_entitlements.revision`,
          )
          .bind(
            parsed.organizationId,
            parsed.schemaVersion,
            parsed.revision,
            parsed.state,
            capabilitiesJson,
            parsed.limits.activeEvents,
            parsed.notBefore,
            parsed.expiresAt,
            audit.occurredAt,
            audit.occurredAt,
            audit.expectedRevision,
            parsed.organizationId,
            audit.expectedRevision,
            audit.expectedRevision,
          ),
        guard(
          this.database,
          `EXISTS (
             SELECT 1
             FROM organization_entitlements
             WHERE organization_id = ?
               AND schema_version = ?
               AND revision = ?
               AND state = ?
               AND capabilities_json = ?
               AND active_event_limit IS ?
               AND not_before = ?
               AND expires_at IS ?
           )`,
          [
            parsed.organizationId,
            parsed.schemaVersion,
            parsed.revision,
            parsed.state,
            capabilitiesJson,
            parsed.limits.activeEvents,
            parsed.notBefore,
            parsed.expiresAt,
          ],
        ),
        this.database
          .prepare(
            `INSERT OR IGNORE INTO audit_events (
               id, tenant_id, actor_type, actor_id, action,
               resource_type, resource_id, trace_id, details_json, occurred_at
             ) VALUES (?, ?, 'system', 'organization-control-plane', ?, 'organization_entitlement', ?, ?, ?, ?)`,
          )
          .bind(
            audit.id,
            parsed.organizationId,
            "organization.entitlement.updated",
            parsed.organizationId,
            audit.traceId,
            JSON.stringify({
              expectedRevision: audit.expectedRevision,
              revision: parsed.revision,
              state: parsed.state,
              limits: parsed.limits,
              capabilities: parsed.capabilities,
            }),
            audit.occurredAt,
          ),
      ]);
    } catch {
      const current = await this.getEntitlement(parsed.organizationId);
      if (current !== null && JSON.stringify(current) === JSON.stringify(parsed)) {
        return current;
      }
      throw new OrganizationEntitlementConflictError(
        "The organization entitlement revision is stale.",
      );
    }
    return parsed;
  }
}
